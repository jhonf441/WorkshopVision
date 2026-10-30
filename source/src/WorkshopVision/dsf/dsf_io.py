"""
Vision <-> DSF through dsf-python (DCS socket), without HTTP to DuetWebServer.

Before (until 2026-10-12) Vision read GET /machine/status (90 KB, the whole
model) and sent POST /machine/code over HTTP to 127.0.0.1: it skipped DSF's
permission system (plugin.json only asked for networkAccess), added
load to DuetWebServer and its codes went out through DWC's HTTP channel (the pause
for smoke ended up as "reason User", with no way to know it was Vision).
Duet3D rule (diagnosis 2026-10-11, item 29f) and agreed architecture:
"nobody polls /machine/status (one subscription)".

Now:

  Model      ONE SubscribeConnection in Patch mode with FILTERS (only what
             Vision uses). One thread receives the patches and merges them into a
             dict in memory; it reconnects by itself if DCS restarts or the
             socket drops. Permission: objectModelRead.

  Commands   CommandConnection for G-code (M25, M112, M98...),
             evaluating expressions and writing messages. One connection per use
             (fire, photo, calibration), each with its own lock: a long M98
             of the calibration does not make the smoke M25 wait.
             Permission: commandExecution (it also covers WriteMessage and
             EvaluateExpression in DSF 3.6).

CHANNEL of the codes: SBC (CodeChannel.SBC, the Pi's channel).
  - Not HTTP: that is DWC's; a hung code there jams the interface
    (WorkshopService 449f25c) and the pause cannot be told apart from a DWC one.
  - What Vision asks of WorkshopService (photo lights, noting the
    fire in Activity, reserving the machine for a sequence) goes through the
    service's API (POST /machine/WorkshopService/api with the local key
    0:/sys/workshop/data/.api-token, see service()), which does not go through any
    RRF channel.
  - M112 does not depend on the channel: DCS marks it as priority and passes it to a free
    channel (SimpleCode.cs, M108/M112/M122/M292/M999).
  - M25 does queue on its channel: SBC is free during a file job
    (the job goes through File); with a live job (bridge through SBC)
    Vision does not pause (it only notifies), so there is no wait.
So that the pause is identifiable: RRF stores M25 as a "user" pause whatever
channel it comes from, so after acting a message is written with
WriteMessage (type Warning, LogLevel warn): it shows in DWC's console and in the
event log (0:/sys/eventlog.txt, M929) with the text "Vision: ...".

Tested without the Pi with fake connections: tests/test_dsf_io.py.

"""
import copy
import json
import select
import socket
import threading
import time

import ipc_stats  # IPC calls to DCS per minute (same module as the service)
import messages
from messages import M

CHANNEL = "SBC"

# What Vision reads from the model (vision.py, fire_watch.py, laser_calibration.py). The
# workshop's global.* variables are also requested; if they do not arrive through the
# subscription, value_global() evaluates them with the CommandConnection.
FILTERS = [
    "state.status",
    "state.machineMode",
    "job.file.fileName",
    "job.lastFileName",
    "job.lastFileCancelled",
    "move.axes[*].letter",
    "move.axes[*].machinePosition",
    "move.axes[*].homed",
    "move.axes[*].min",
    "move.axes[*].max",
    "sensors.probes[*].offsets",
    "global.selectedMode",
    "global.lightZoneColor",
    "global.workshopLanguage",
    "plugins.WorkshopService.data.liveJob",
    "plugins.WorkshopService.data.communication",
]

RETRY_S = 3.0  # wait before reconnecting the subscription
WAIT_DATA_S = 2.0  # how long the thread waits for a patch before doing another pass
READY_S = 3.0  # how long read_in() waits for the initial model (startup / reconnection)
GLOBAL_CACHE_S = 5.0  # value_global() by expression: at most every 5 s
# 2026-10-12 (DCS load): a global covered by FILTROS comes from the subscribed model; if it is
# missing there the variable does not exist, so the expression is only re-checked this rarely
# (it used to be evaluated every GLOBAL_CACHE_S seconds, forever, on machines without the variable)
GLOBAL_CACHE_ABSENT_S = 600.0


def log(*a):
    print(time.strftime("%H:%M:%S"), "[dsf]", *a, flush=True)


# ---- patch merging (same criterion as WorkshopService/job_trace.py) ----

def mix(base, patch):
    """Applies a DSF patch (Patch mode) onto `base`. Objects are
    merged; lists are merged element by element (a list's patch
    carries all its elements, each with what changed) and are cut
    to the patch's length."""
    for k, v in patch.items():
        b = base.get(k)
        if isinstance(v, dict) and isinstance(b, dict):
            mix(b, v)
        elif isinstance(v, list) and isinstance(b, list):
            _mix_items(b, v)
        else:
            base[k] = v
    return base


def _mix_items(b, v):
    for i, x in enumerate(v):
        if i < len(b):
            if isinstance(x, dict) and isinstance(b[i], dict):
                mix(b[i], x)
            elif isinstance(x, list) and isinstance(b[i], list):
                _mix_items(b[i], x)
            else:
                b[i] = x
        else:
            b.append(x)
    del b[len(v):]


def _close(conn):
    try:
        if conn is not None:
            conn.close()
    except Exception:
        pass


# ---- suscripcion ----

def _connect_subscription(filters):
    from dsf.connections import SubscribeConnection, SubscriptionMode

    conn = SubscribeConnection(SubscriptionMode.PATCH, filter_list=list(filters))
    conn.connect()
    return conn


def _wait_for_data(conn, sec):
    """True if there is something to read in the subscription. dsf-python, with the socket
    closed by DCS, keeps spinning in recv() until its timeout: here it
    waits with select and detects the close (empty recv) to reconnect."""
    if getattr(conn, "input", ""):
        return True  # a whole patch was left in dsf-python's buffer
    s = conn.socket
    if s is None:
        raise ConnectionError("suscripcion cerrada")
    r, _, _ = select.select([s], [], [], sec)
    if not r:
        return False
    if not s.recv(1, socket.MSG_PEEK):
        raise ConnectionError("DSF cerro la suscripcion")
    return True


class Model:
    """The filtered object model, always up to date, through ONE subscription."""

    def __init__(self, filters=FILTERS, connect=_connect_subscription, wait_for=_wait_for_data):
        self.filters = list(filters)
        self.connect = connect
        self.wait_for = wait_for
        self.conn = None
        self.model = {}
        self.ready = threading.Event()
        self.lock = threading.Lock()
        self.connections = 0
        self.last_one = 0.0  # time.monotonic() of the last data
        self.error = None
        self._thread = None

    def run_once(self):
        """Connects if needed and applies the patch that is there. Returns how long to
        wait before the next pass (0 = right away)."""
        try:
            if self.conn is None:
                self.conn = self.connect(self.filters)
                self.connections += 1
                full = json.loads(self.conn.get_serialized_object_model())
                with self.lock:
                    self.model = full
                    self.last_one = time.monotonic()
                self.error = None
                self.ready.set()
                log("suscripcion a DSF conectada (Patch, %d filtros)" % len(self.filters))
                return 0
            if not self.wait_for(self.conn, WAIT_DATA_S):
                return 0
            # a TimeoutError here = a piece of a patch arrived and the rest did not:
            # dsf-python loses that piece, so it reconnects (except)
            patch = json.loads(self.conn.get_object_model_patch())
            with self.lock:
                mix(self.model, patch)
                self.last_one = time.monotonic()
            return 0
        except Exception as e:
            if self.error != str(e):
                log("suscripcion a DSF perdida (%s: %s), reintento en %g s" % (type(e).__name__, e, RETRY_S))
            self.error = str(e)
            self.ready.clear()
            _close(self.conn)
            self.conn = None
            with self.lock:
                self.model = {}
            return RETRY_S

    def _loop(self):
        while True:
            t = self.run_once()
            if t:
                time.sleep(t)

    def begin(self):
        with self.lock:
            if self._thread is not None:
                return
            self._thread = threading.Thread(target=self._loop, name="dsf-subscription", daemon=True)
        self._thread.start()

    def read_in(self, waiting=READY_S):
        """Copy of the filtered model. IOError if there is no connection to DSF."""
        self.begin()
        if not self.ready.wait(waiting):
            raise IOError(M("dsf_io_no_connection_to_dsf_error", error=self.error) if self.error else M("dsf_io_no_connection_to_dsf"))
        with self.lock:
            return copy.deepcopy(self.model)


# ---- comandos ----

def _connect_commands():
    from dsf.connections import CommandConnection

    conn = CommandConnection()
    conn.connect()
    return conn


def _channel(label):
    from dsf.commands.code_channel import CodeChannel

    return getattr(CodeChannel, label, CodeChannel.SBC)


# Socket errors that say the old connection is no longer valid (DCS
# restarted): it reconnects and retries ONCE. A TimeoutError is not
# retried (the code may still be running); the connection is closed, because
# the late response would leave it out of step.
_RETRYABLE = (BrokenPipeError, ConnectionResetError, ConnectionAbortedError)


def _connection_live(conn):
    """False if DCS closed the socket while the connection was idle (with the
    socket closed, dsf-python spins in recv() until its timeout: up to 900 s
    in the calibration)."""
    s = getattr(conn, "socket", None)
    if s is None:
        return False
    try:
        r, _, _ = select.select([s], [], [], 0)
        return not r or bool(s.recv(1, socket.MSG_PEEK))
    except OSError:
        return False


class Commands:
    """A CommandConnection with a lock and reconnection."""

    def __init__(self, label, chan=CHANNEL, connect=_connect_commands, channel_of=_channel, live=_connection_live):
        self.label = label
        self.chan = chan
        self.connect = connect
        self.channel_of = channel_of
        self.live = live
        self.conn = None
        self.lock = threading.Lock()

    def _con(self, fn, timeout, kind="other"):
        with self.lock:
            for attempt in (1, 2):
                if self.conn is not None and not self.live(self.conn):
                    log("conexion de comandos '%s' cerrada por DSF: se reconecta" % self.label)
                    _close(self.conn)
                    self.conn = None
                if self.conn is None:
                    self.conn = self.connect()
                old = getattr(self.conn, "timeout", None)
                try:
                    self.conn.timeout = timeout
                    return ipc_stats.call(kind, self.label, fn, self.conn)
                except _RETRYABLE:
                    _close(self.conn)
                    self.conn = None
                    if attempt == 2:
                        raise
                except (TimeoutError, OSError, RuntimeError):
                    _close(self.conn)
                    self.conn = None
                    raise
                finally:
                    if self.conn is not None and old is not None:
                        self.conn.timeout = old

    def code(self, text, timeout=15):
        """Sends a G-code and returns the response (text)."""
        chan = self.channel_of(self.chan)
        r = self._con(lambda c: c.perform_simple_code(text, channel=chan), timeout, "code")
        return "" if r is None else str(r)

    def evaluate(self, expression, timeout=5):
        chan = self.channel_of(self.chan)
        r = self._con(lambda c: c.evaluate_expression(expression, channel=chan), timeout, "expr")
        return getattr(r, "result", r)

    def message(self, text, type_name="warning", timeout=5):
        """Message to DWC's console and to the event log (eventlog.txt)."""
        from dsf.object_model.messages import MessageType
        from dsf.object_model.state import LogLevel

        mt = {"info": MessageType.Success, "warning": MessageType.Warning, "error": MessageType.Error}[type_name]
        level = LogLevel.Info if type_name == "info" else LogLevel.Warn
        return self._con(lambda c: c.write_message(mt, text, True, level), timeout, "message")


# ---- what vision.py, fire_watch.py and laser_calibration.py use ----

MODEL = Model()
_cmd = {}
_cmd_lock = threading.Lock()


def commands(use="general"):
    """Command connection for one use: "fuego" (M25/M112, never waits for
    another), "calib" (long calibration codes), "general"."""
    with _cmd_lock:
        c = _cmd.get(use)
        if c is None:
            c = _cmd[use] = Commands(use)
        return c


def begin():
    MODEL.begin()


def read_in(waiting=READY_S):
    return MODEL.read_in(waiting)


def data_service(d):
    pl = d.get("plugins") or {}
    return (pl.get("WorkshopService") or {}).get("data") or {}


# States with a file job (also paused): Vision does not move the machine.
STATES_JOB = ("processing", "simulating", "pausing", "paused", "resuming", "cancelling")


def reason_no_move(d):
    """'' if Vision can move the machine now; otherwise, the reason (motion
    audit, finding 8). It looks at the file job (also paused) and the
    live job: between one line and the next of a live job the
    state goes back to "idle", so waiting for "idle" is not enough. It does not look at "busy":
    that is awaited by whoever calls (_still). Same rule as tallerMaquinaLibre of
    the pages (src/_shared/01-machine-free.js)."""
    if not d or not d.get("state"):
        return M("dsf_io_no_machine_data")
    s = d["state"].get("status")
    if s in STATES_JOB or ((d.get("job") or {}).get("file") or {}).get("fileName"):
        return M("dsf_io_a_job_is_running")
    if (data_service(d).get("liveJob") or {}).get("active"):
        return M("dsf_io_a_live_job_is_open")
    if s in ("halted", "off", "disconnected", "starting", "updating", "flashing"):
        return M("dsf_io_the_machine_is_not_ready", state=s)
    return ""


_glob = {}
_glob_lock = threading.Lock()


def value_global(d, label, use="general", now=time.monotonic):
    """global.<name> from the subscribed model; if it did not come (DSF may not send
    the global variables through the subscription), it is evaluated through the
    CommandConnection, at most every GLOBAL_CACHE_S. None if it does not exist."""
    g = d.get("global")
    if isinstance(g, dict) and label in g:
        return g[label]
    t = now()
    # covered by the subscription and the model is loaded: absent = does not exist
    covered = ("global." + label) in FILTERS and bool(d.get("state"))
    with _glob_lock:
        v = _glob.get(label)
        if v is not None and t - v[0] < (GLOBAL_CACHE_ABSENT_S if covered else GLOBAL_CACHE_S):
            return v[1]
    try:
        val = commands(use).evaluate("global." + label)
    except Exception:
        val = None
    with _glob_lock:
        _glob[label] = (t, val)
    return val


def machine_language():
    """"en" or "es": the language DWC is in (global.workshopLanguage, which the pages set), Spanish if unknown.
    For texts that leave without a request: DWC's console, Activity and the phone. It only looks at the subscribed model
    (it neither starts the subscription nor waits for it, nor evaluates an expression)."""
    if not MODEL.ready.is_set():
        return "es"
    with MODEL.lock:
        g = MODEL.model.get("global")
        return "en" if isinstance(g, dict) and g.get("workshopLanguage") == "en" else "es"


def channel_service(d):
    """Channel where WorkshopService sends its own codes (published by it in
    data.comunicacion.canal), or None if unknown."""
    return (data_service(d).get("communication") or {}).get("channel")


API_URL = "http://127.0.0.1/machine/WorkshopService/api"
API_TOKEN_FILE = "/opt/dsf/conf/workshop-api-token"   # outside the SD (the service moves the key there)
API_TOKEN_FILE_LEGACY = "/opt/dsf/sd/sys/workshop/data/.api-token"   # read only until the service has moved it


def _api_token():
    for path in (API_TOKEN_FILE, API_TOKEN_FILE_LEGACY):
        try:
            with open(path, encoding="utf-8") as f:
                t = f.read().strip()
            if t:
                return t
        except OSError:
            continue
    return ""


def _api_http(op, args, timeout, confirm=False):
    """POST /machine/WorkshopService/api -> the JSON body (ok true or false).
    The local key lets a program of this computer call it without a DWC session."""
    import urllib.error
    import urllib.request

    # lang: the service answers its texts (reasons, errors) in the language of the request being served
    body = json.dumps({"op": op, "args": args or {}, "confirm": bool(confirm), "origin": "vision",
                       "lang": messages.current_language()}).encode()
    h = {"Content-Type": "application/json"}
    tok = _api_token()
    if tok:
        h["X-Workshop-Token"] = tok
    req = urllib.request.Request(API_URL, data=body, headers=h, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read().decode(errors="replace"))
    except urllib.error.HTTPError as e:  # 4xx/5xx with our JSON error
        try:
            return json.loads(e.read().decode(errors="replace"))
        except Exception:
            raise IOError("WorkshopService: HTTP %s" % e.code)


def service(op, args=None, timeout=10, http=None, confirm=False):
    """Calls an operation of the WorkshopService API. Returns the text of the answer:
    the JSON of the result, the message, or "Error: ..."."""
    try:
        j = (http or _api_http)(op, args or {}, timeout, confirm)
    except Exception as e:
        return "Error: WorkshopService no contesta (%s)" % e
    if j.get("ok"):
        r = j.get("result")
        return json.dumps(r) if r is not None else str(j.get("message") or "")
    return "Error: " + str((j.get("error") or {}).get("message") or "error")


# ---- reservation of the machine for a sequence (owner of the movement) ----
_reserve = {"token": None}


def reserve_motion(text, seconds=180, http=None):
    """Before every own movement of a sequence: takes (or renews) the
    reservation of the owner of the movement in WorkshopService. Raises
    ValueError with the reason when another page / job has the machine.
    Without the service (old version, stopped) it does not block."""
    call = http or _api_http
    try:
        if _reserve["token"]:
            j = call("motion.renew", {"token": _reserve["token"], "seconds": int(seconds)}, 5)
            if j.get("ok") and (j.get("result") or {}).get("ok"):
                return _reserve["token"]
            _reserve["token"] = None
        j = call("motion.reserve", {"origin": "vision", "action": "sequence", "text": text, "seconds": int(seconds)}, 5)
    except Exception as e:
        log("reserva: WorkshopService no contesta (%s), se sigue sin reserva" % e)
        return None
    if not j.get("ok"):
        code = (j.get("error") or {}).get("code")
        if code in ("unknown_op", "auth_required"):
            return None
        raise ValueError((j.get("error") or {}).get("message") or M("dsf_io_the_service_does_not_allow_moving"))
    r = j.get("result") or {}
    if r.get("decision") != "allow":
        raise ValueError(r.get("reason") or M("dsf_io_another_page_or_a_job_is_using"))
    _reserve["token"] = r.get("token")
    return _reserve["token"]


def release_motion(http=None):
    tok, _reserve["token"] = _reserve["token"], None
    if tok:
        try:
            (http or _api_http)("motion.release", {"token": tok}, 5)
        except Exception:
            pass
