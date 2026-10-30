"""
Fire and smoke watch during a laser job (2026-10-10, request:
"all" of the list of new Vision features; number 5: "if it detects flame or
dense smoke, pause the job and notify the phone").

It only works while there is a LASER job (Laser mode and a file job
running, or a live job open). It looks at the relay's video about 2 times per
second, at low resolution:

  flame  very bright, saturated orange/yellow pixels that were NOT there when
         the job started, in an area larger than the laser spot, and
         that stay there for a while (the normal cutting spot is small and moves).
  smoke  the image contrast drops a lot compared with the start of the
         job (the image "washes out" to gray) and stays that way for a while.

On detection: it notes it in Activity and notifies the phone (API activity.log type fire
in the Pi service) and does the chosen action (pause and emergency
after a countdown, see below):
  avisar      only the notice
  pausar      M25 (pauses a FILE job; a live one cannot be
              paused from the Duet: it is announced anyway)
  emergencia  M112 (cuts everything; afterwards M999 and homing are needed)

Settings in sys/workshop/config/vision.json, key "fuego" (written by the page):
  {"activo": false, "accion": "pausar", "sensibilidad": "media",
   "plazo": 10, "deadline_flame": 2, "smoke_acts": false}
(plazo = SMOKE countdown; deadline_flame = FLAME countdown, 0 to 3 s, 0 = immediate)
It does not replace a person watching nor a fire extinguisher: it is an aid.

2026-10-10, test with a candle that was not detected: the center of a small
flame comes out almost WHITE on the camera (barely saturated, burnt), and the whole
flame occupied less than the threshold. Now it also counts the white core
when it is next to warm pixels, it is analyzed at higher resolution with
smaller thresholds, and the laser spot is discounted (where it lands, according
to the calibration) so that normal cutting does not trigger. "Live test"
watches for a few minutes WITHOUT a job (it only notifies, marked as a TEST) to
test with a candle or a lighter.

2026-10-10, second test with the candle: the ESP32 sees the flame completely WHITE
(saturation 0, not a single warm pixel). That is why a very bright white
blob that was NOT in the reference image also counts as flame (the
first seconds of the job or the test): reflections that were already there
do not count, and around the head neither (it shines when moving).

2026-10-12 (item 7 of the diagnosis): in a real job it paused 2 times for
SMOKE (false positives) with no prior notice, and afterwards there were 3 more
detections in notice-only mode. The decision moved to fire_decision.py (tested without a
camera, tests/test_fire_decision.py; the detail is there):
  - countdown before pausing or cutting (flame: deadline_flame, 2 s by
    default and can be immediate; smoke: plazo, 10 s), visible on the
    Vision page and in a notice at the top of all DWC screens, with a
    button to cancel (POST /fuego/cancelar); the detection keeps
    being confirmed during the countdown.
  - smoke: moving reference (what was seen between 90 and 30 s ago), uniform drop across the whole image, that
    it has not gotten darker (exposure), 8 s in a row with hysteresis; by
    default smoke only notifies (smoke_acts).
  - flame: only blobs of at least STAIN_MIN px count (sparks and loose
    reflections do not add up); the contrast ignores what is saturated and the laser
    spot.
  - the action, the on/off, the sensitivity and the deadlines stay fixed during the job: an
    unconfirmed change on the page (POST /fuego/confirmar) does not count until it ends.
  - each detection, countdown, cancellation, pause and change is kept in
    sys/workshop/data/vision-fire-log.jsonl (GET /fuego/registro) with a
    marked photo in sys/workshop/data/vision-fire/.

"""
import json
import os
import re
import threading
import time

import cv2
import numpy as np

import dsf_io
import message_data
import messages
from messages import M
from fire_decision import ACTIONS, DEADLINE_DEF, DEADLINE_FLAME_DEF, DEADLINE_FLAME_MAX, DEADLINE_MAX, SENS, Padlock, Decider, deadline_flame_valid, deadline_valid

V = None  # the vision module (assigned by vision.py)

DEF = {"active": False, "action": "pause", "sensitivity": "media", "deadline": DEADLINE_DEF, "deadline_flame": DEADLINE_FLAME_DEF, "smoke_acts": False}
WIDTH = 480  # it is analyzed at this resolution (a distant candle is few pixels)
RADIUS_LASER = 14  # px (at WIDTH) around the laser spot that do not count
RADIUS_HEAD = 22  # px around the head where a new white does not count (metal reflections)
STAIN_MIN = 8  # px (at WIDTH): smaller blobs do not count as flame (sparks, loose reflections)
GRID = (4, 3)  # columns x rows to see if the smoke is uniform
SATURATED = 250  # gray from which a pixel does not count for the contrast (laser spot, reflections)
TEST_MAX = 300
PERIOD = 0.5
NOTICE_COUNT_EACH = 60.0  # minimum s between phone notices of "pause in N s"
REG_MAX = 1024 * 1024  # bytes of the log before rolling it to .1
PHOTOS_REG_MAX = 300  # detection photos saved at most (afterwards it is noted without a photo)
TS_JOBS = ("processing", "simulating", "pausing", "paused", "resuming", "cancelling")

_lock = threading.Lock()
_dec_lock = threading.Lock()  # the Decider is used by the loop and POST /fuego/cancelar
_state = {"state": "shutdown", "detail": "", "flame": 0.0, "contrast": None, "base": None, "alarm": None, "job": None,
           "count": None, "in_job": False, "smoke_level": 0.0, "smoke_reason": "", "record_n": 0}
_test = {"until": 0.0}
_view = {"jpg": None, "ts": 0.0}  # the last analyzed image, with what it sees marked
_ctx = {"dec": None, "desc": "", "is_file": False, "test": False, "img": None, "marked": None, "notice_count": 0.0, "count_notified": False}
_padlock = Padlock()


def _mark(small, m, bl, pl, ref_b):
    """Small image with what counts as flame in red (with a box),
    the white that was already in the reference in violet and the laser in light blue."""
    v = small.copy()
    if bl is not None:
        v[(bl > 0) & (m == 0)] = (255, 0, 255)
    v[m > 0] = (0, 0, 255)
    n, _, st, _ = cv2.connectedComponentsWithStats(m)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if a >= 4:
            cv2.rectangle(v, (int(x) - 4, int(y) - 4), (int(x + w) + 4, int(y + h) + 4), (0, 0, 255), 2)
    if pl:
        cv2.circle(v, pl, RADIUS_LASER, (255, 160, 0), 1)
    return v


def cfg():
    c = dict(DEF)
    try:
        c.update((V.CFG.get().get("fire") or {}))
    except Exception:
        pass
    if c.get("action") not in ACTIONS:
        c["action"] = DEF["action"]
    if c.get("sensitivity") not in SENS:
        c["sensitivity"] = DEF["sensitivity"]
    c["active"] = bool(c.get("active"))
    c["deadline"] = deadline_valid(c.get("deadline"))
    c["deadline_flame"] = deadline_flame_valid(c.get("deadline_flame"))
    c["smoke_acts"] = bool(c.get("smoke_acts"))
    return c


def _machine():
    """(watch now?, description, is_file, in_job). in_job
    stays true with the job paused (for the action's
    lock); watch, only while it runs."""
    d = dsf_io.read_in()  # subscribed model (no GET /machine/status every 0.5 s)
    mode = str(dsf_io.value_global(d, "selectedMode", use="fire") or "")
    st = d.get("state", {}).get("status")
    alive_flag = dsf_io.data_service(d).get("liveJob") or {}  # Id nuevo o viejo
    has_file = bool(((d.get("job") or {}).get("file") or {}).get("fileName"))
    file = st in ("processing", "simulating") and has_file
    in_live = bool(alive_flag.get("active"))
    if mode.lower() != "laser":
        return False, M("fire_watch_the_machine_is_not_in_laser_mode"), False, False
    if file:
        return True, M("fire_watch_file_job"), True, True
    if in_live:
        if alive_flag.get("name"):
            return True, M("fire_watch_live_job_named", name=alive_flag.get("name")), False, True
        return True, M("fire_watch_live_job"), False, True
    if has_file and st in TS_JOBS:
        return False, M("fire_watch_file_job_paused", state=st), True, True
    return False, M("fire_watch_no_laser_job_running"), False, False


def _points(w_img):
    """(laser, head): (x, y) in px of the analyzed image, or None."""
    try:
        cb = V.head()
        size = cb.get("size")
        if not size or not size[0]:
            return None, None
        k = w_img / float(size[0])
        e = ((cb.get("points") or {}).get("laser") or {}).get("px")
        h = cb.get("px")
        return (int(e[0] * k), int(e[1] * k)) if e else None, (int(h[0] * k), int(h[1] * k)) if h else None
    except Exception:
        return None, None


def _contrast(gray, valid):
    """(contrast, mean brightness, [contrast per cell]) without what is saturated nor the
    laser spot (the spot on or off does not change the measurement)."""
    if cv2.countNonZero(valid) < valid.size * 0.05:
        valid = np.full(gray.shape, 255, np.uint8)
    media, std = cv2.meanStdDev(gray, mask=valid)
    h, w = gray.shape
    nc, nf = GRID
    cells = []
    for f in range(nf):
        for c in range(nc):
            y0, y1, x0, x1 = h * f // nf, h * (f + 1) // nf, w * c // nc, w * (c + 1) // nc
            vm = valid[y0:y1, x0:x1]
            if cv2.countNonZero(vm) < vm.size * 0.2:
                cells.append(0.0)
                continue
            _, s = cv2.meanStdDev(gray[y0:y1, x0:x1], mask=vm)
            cells.append(float(s[0][0]))
    return float(std[0][0]), float(media[0][0]), cells


def measure(img, laser=True, ref_white=None):
    """Measures a BGR image. dict with: frac (flame fraction), contrast,
    mean, cells, m (flame mask), img (small image), blob (the largest,
    px), pl (laser spot), white (mask of the very bright white;
    with ref_white, the reference's white already thickened, the NEW
    white also counts as flame)."""
    h, w = img.shape[:2]
    if w > WIDTH:
        img = cv2.resize(img, (WIDTH, int(h * WIDTH / w)), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # orange / yellow (H 0-40 of 180): strong = very saturated and bright
    warm = cv2.inRange(hsv, (0, 80, 160), (40, 255, 255))
    strong = cv2.inRange(hsv, (0, 110, 200), (40, 255, 255))
    # the center of a small flame comes out almost white: it counts if it is next to
    # something warm (a lit white surface has no orange edge)
    core = cv2.inRange(gray, 235, 255)
    k9 = np.ones((9, 9), np.uint8)
    m = strong | (core & cv2.dilate(warm, k9)) | (warm & cv2.dilate(core, k9))
    white = cv2.inRange(hsv, (0, 0, 240), (180, 70, 255))
    pl, pc = _points(img.shape[1]) if laser else (None, None)
    if pc:
        cv2.circle(white, pc, RADIUS_HEAD, 0, -1)
    if ref_white is not None and ref_white.shape == white.shape:
        m = m | (white & cv2.bitwise_not(ref_white))
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((2, 2), np.uint8))
    valid = cv2.inRange(gray, 0, SATURATED - 1)
    if pl:
        cv2.circle(m, pl, RADIUS_LASER, 0, -1)  # the normal cutting spot is not flame
        cv2.circle(valid, pl, RADIUS_LASER, 0, -1)
    # 2026-10-12: only blobs of STAIN_MIN px or more (the engraving sparks
    # and loose reflections added up among all of them)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    stain = 0
    if n > 1:
        areas = st[1:, cv2.CC_STAT_AREA]
        stain = int(areas.max())
        small = [i + 1 for i, a in enumerate(areas) if a < STAIN_MIN]
        if small:
            m = m.copy()
            m[np.isin(lab, small)] = 0
    contrast, media, cells = _contrast(gray, valid)
    return {"frac": float(np.count_nonzero(m)) / m.size, "contrast": contrast, "media": media, "cells": cells,
            "m": m, "img": img, "stain": stain, "pl": pl, "white": white}


def _note(text):
    """Activity + phone, through WorkshopService's API (activity.log; see
    dsf_io.service). HTTP: it does not delay an M25. The text goes in the
    language DWC is in (activity.log takes a finished text)."""
    try:
        text = messages.localize(text, dsf_io.machine_language())
        dsf_io.service("activity.log", {"type": "fire", "text": text[:300]}, timeout=5)
    except Exception as e:
        V.log("fuego: no se pudo anotar en Actividad:", e)


# ---- log to review afterwards (2026-10-12) ----

def _reg_file():
    return os.path.join(V.SD, "sys", "workshop", "data", "vision-fire-log.jsonl")


def _reg_photos():
    return os.path.join(V.SD, "sys", "workshop", "data", "vision-fire")


def _save_photo_reg(img, label):
    """Saves the marked image in sys/workshop/data/vision-fire/; returns
    the name or None. It deletes nothing: with PHOTOS_REG_MAX photos it stops saving."""
    try:
        d = _reg_photos()
        os.makedirs(d, exist_ok=True)
        if len(os.listdir(d)) >= PHOTOS_REG_MAX:
            return None
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if not ok:
            return None
        with open(os.path.join(d, label), "wb") as fh:
            fh.write(buf.tobytes())
        return label
    except Exception as e:
        V.log("fuego: no se pudo guardar la foto del registro:", e)
        return None


def register(ev, photo=None):
    """One JSON line per event in vision-fire-log.jsonl (and in the log)."""
    t = time.time()
    row = {"ts": int(t), "hour": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t)), "job": _ctx["desc"],
            "test": _ctx["test"]}
    row.update({k: v for k, v in ev.items() if k not in ("ts",)})
    if photo:
        row["photo"] = photo
    V.log("fire:", row.get("ev"), row.get("kind") or row.get("key") or "", "-", row.get("reason") or row.get("done") or "")
    try:
        p = _reg_file()
        os.makedirs(os.path.dirname(p), exist_ok=True)
        try:
            if os.path.getsize(p) > REG_MAX:
                os.replace(p, p + ".1")
        except OSError:
            pass
        with open(p, "a", encoding="utf-8") as fh:
            # each message as its Spanish text + "<field>_en" (message_data.split); reg() joins them back
            fh.write(json.dumps(message_data.split(row), ensure_ascii=False) + "\n")
    except Exception as e:
        V.log("fuego: no se pudo escribir el registro:", e)
    with _lock:
        _state["record_n"] += 1
    return row


def reg(n=50):
    """The last n events (newest first)."""
    n = max(1, min(500, int(n or 50)))
    rows = []
    try:
        with open(_reg_file(), encoding="utf-8") as fh:
            lines = fh.readlines()[-n:]
        for ln in reversed(lines):
            try:
                rows.append(message_data.join(json.loads(ln)))
            except ValueError:
                pass
    except FileNotFoundError:
        pass
    return {"ok": True, "events": rows, "file": "0:/sys/workshop/data/vision-fire-log.jsonl"}


def photo_record(label):
    if not re.match(r"^[0-9A-Za-z_-]+\.jpg$", label or ""):
        raise ValueError(M("fire_watch_invalid_photo_name"))
    with open(os.path.join(_reg_photos(), label), "rb") as fh:
        return fh.read()


# ---- acciones ----

def _text(type_name):
    if _ctx["test"]:
        return M("fire_watch_flame_detected_test" if type_name == "flame" else "fire_watch_smoke_detected_test")
    return M("fire_watch_flame_detected_during_job" if type_name == "flame" else "fire_watch_smoke_detected_during_job")


def _act(action, that=""):
    """Does the action; returns what was done (text). It goes through the
    watch's own CommandConnection (dsf_io, SBC channel; DCS passes M112 by itself
    to a free channel) and afterwards leaves a "Vision: ..." message in DWC's
    console and in RRF's event log: M25 stays in RRF as a
    "user" pause wherever it comes from, and this way it is known it was the camera."""
    cmd = dsf_io.commands("fire")
    failed = False
    try:
        if action == "emergency":
            cmd.code("M112", timeout=5)
            done = M("fire_watch_emergency_stop_m112")
        elif action == "pause" and _ctx["is_file"]:
            r = cmd.code("M25", timeout=10)
            if r and "rror" in r:
                raise RuntimeError(r.strip())
            done = M("fire_watch_job_paused_m25")
        elif action == "pause":
            return M("fire_watch_live_job_cannot_be_paused")
        else:
            return M("fire_watch_only_notice")
    except Exception as e:
        done = M("fire_watch_could_not_act", error=message_data.error_text(e))
        failed = True
    try:
        lang = dsf_io.machine_language()  # DWC's console: the language DWC is in
        cmd.message("Vision: %s -> %s" % (messages.localize(that or M("fire_watch_fire_watch"), lang), messages.localize(done, lang)),
                    "error" if failed else "warning")
    except Exception as e:
        V.log("fuego: no se pudo escribir el mensaje en DWC:", e)
    return done


def _photo_event(ev):
    img = _ctx["marked"] if _ctx["marked"] is not None else _ctx["img"]
    if img is None:
        return None
    return _save_photo_reg(img, time.strftime("%Y%m%d-%H%M%S") + "-%s-%s.jpg" % (ev.get("kind", "x"), ev["ev"]))


def _alarm(type_name, done):
    photo = None
    try:
        if _ctx["img"] is not None:
            photo = V.save_photo(_ctx["img"], notice=_text(type_name))
    except Exception:
        pass
    a = {"ts": time.time(), "kind": type_name, "text": _text(type_name), "action": done, "photo": photo}
    _set(alarm=a)
    return a


def _event(ev):
    """Records an event of the Decider or the Padlock and does what applies.
    It is called with _dec_lock held."""
    e = ev["ev"]
    desc = _ctx["desc"]
    if e == "reference":
        V.log("fuego: referencia lista (contraste %s)" % ev.get("contrast"))
        return
    if e in ("detection", "ignored"):
        register(ev, _photo_event(ev) if e == "detection" else None)
        return
    if e == "notice":
        done = M("fire_watch_only_notice_because", per=ev.get("per", ""))
        if _ctx.get("action_cfg") == "pause" and not _ctx["is_file"] and not _ctx["test"] and ev["kind"] == "flame":
            done = M("fire_watch_live_job_cannot_be_paused")
        register(dict(ev, done=done))
        _note(M("fire_watch_note_done", text=_text(ev["kind"]), job=desc, done=done, reason=ev.get("reason", "")))
        _alarm(ev["kind"], done)
        return
    if e == "count":
        that = M("fire_watch_pauses_the_job") if ev["action"] == "pause" else M("fire_watch_emergency_stop")
        register(ev)
        t = time.time()
        if ev["kind"] == "flame" or t - _ctx["notice_count"] >= NOTICE_COUNT_EACH:  # the flame always notifies (short countdown)
            _ctx["notice_count"] = t
            _ctx["count_notified"] = True
            _note(M("fire_watch_note_countdown", text=_text(ev["kind"]), job=desc, that=that, seconds=ev["deadline"], reason=ev.get("reason", "")))
        else:
            _ctx["count_notified"] = False
        return
    if e == "act":
        done = _act(ev["action"], M("fire_watch_text_and_job", text=_text(ev["kind"]), job=desc))
        register(dict(ev, done=done), _photo_event(ev))
        _note(M("fire_watch_note_done", text=_text(ev["kind"]), job=desc, done=done, reason=ev.get("reason", "")))
        _alarm(ev["kind"], done)
        return
    if e == "cancelled":
        register(ev)
        if ev.get("per") == "user" or _ctx["count_notified"]:
            _note(M("fire_watch_note_reason", text=_text(ev["kind"]), job=desc, reason=ev.get("reason", "")))
        _alarm(ev["kind"], ev.get("reason", "cancelled"))
        return
    if e == "change_unconfirmed":
        register(dict(ev, reason=M("fire_watch_changed_during_the_job_unconfirmed", setting=ev["key"], before=ev["before"], now=ev["now"])))
        _note(M("fire_watch_the_change_is_not_applied_until", setting=ev["key"], before=ev["before"], now=ev["now"]))
        return
    if e == "change_confirmed":
        register(dict(ev, reason=M("fire_watch_changed_during_the_job_confirmed", setting=ev["key"], before=ev["before"], now=ev["now"])))
        _note(M("fire_watch_changed_during_the_job_note", setting=ev["key"], before=ev["before"], now=ev["now"]))
        return


def _reset_job():
    with _dec_lock:
        if _ctx["dec"] is not None and _ctx["dec"].count:
            # the job ended or paused in the middle of the countdown: no action is taken
            _event(_ctx["dec"]._cancel(time.time(), M("fire_watch_the_job_stopped_during_the_countdown"), waiting=False))
        _ctx["dec"] = None
    _set(count=None)


def _loop():
    ref_b = None  # the reference's white (thickened): reflections that were already there
    nref = 0
    while True:
        try:
            c = cfg()
            t = time.time()
            test = t < _test["until"]
            _ctx["test"] = test
            if test:
                watch, desc, es_file, in_job = True, M("fire_watch_test_without_a_job", left=int(_test["until"] - t)), False, False
            elif c["active"] or _padlock.fixed is not None:
                watch, desc, es_file, in_job = _machine()
            else:
                watch, desc, es_file, in_job = False, M("fire_watch_watch_off"), False, False
            # padlock: the action and the on/off stay fixed during the job
            if not in_job:
                _padlock.finish()
            elif _padlock.fixed is None and c["active"]:
                _padlock.begin(c)
            _ctx["desc"], _ctx["is_file"] = desc, es_file
            ef, evs = _padlock.current(c, t)
            if evs:
                with _dec_lock:
                    for ev in evs:
                        _event(ev)
            _ctx["action_cfg"] = ef["action"]
            if test:
                ef["action"] = "notify"  # a test never pauses nor cuts
            pending_items = _padlock.pending(c)
            _set(in_job=in_job, accion_vigente=ef["action"], activo_vigente=ef["active"], pending=pending_items or None)
            if not ef["active"] and not test:
                _reset_job()
                _set(state="shutdown", detail=M("fire_watch_watch_off"), flame=0.0, contrast=None, base=None, job=None)
                ref_b, nref = None, 0
                time.sleep(2)
                continue
            if not watch:
                _reset_job()
                _set(state="waiting", detail=desc, flame=0.0, contrast=None, base=None, job=None)
                ref_b, nref = None, 0
                time.sleep(2)
                continue
            if _ctx["dec"] is None:
                _ctx["dec"] = Decider()
                ref_b, nref = None, 0
            _, _, img = V.CAMERA.image(fresh=True)
            r = measure(img, ref_white=ref_b if nref >= 6 else None)
            marked = None
            try:
                marked = _mark(r["img"], r["m"], r["white"], r["pl"], ref_b)
                ok, buf = cv2.imencode(".jpg", marked, [cv2.IMWRITE_JPEG_QUALITY, 75])
                if ok:
                    _view["jpg"], _view["ts"] = buf.tobytes(), time.time()
            except Exception:
                pass
            _ctx["img"], _ctx["marked"] = img, marked
            # the white of the first seconds: reflections that were already there
            if nref < 6:
                nref += 1
                eng = cv2.dilate(r["white"], np.ones((15, 15), np.uint8))
                ref_b = eng if ref_b is None else (ref_b | eng)
            with _dec_lock:
                dec = _ctx["dec"] or Decider()
                _ctx["dec"] = dec
                # a live job cannot be paused from the Duet: no countdown, only a notice
                acc = "notify" if ef["action"] == "pause" and not es_file else ef["action"]
                dec.configure(ef["sensitivity"], acc, ef["deadline"], c["smoke_acts"], ef["deadline_flame"])
                for ev in dec.step(time.time(), r["frac"], r["contrast"], r["media"], r["cells"]):
                    _event(ev)
                count = dec.state_count(time.time())
                last = dec.last_one
                items = dec.ref.items()
            _set(state="watching", detail=desc if items else M("fire_watch_taking_reference", job=desc), flame=r["frac"], contrast=r["contrast"],
                 base=last.get("ref") if items else None, job=desc, count=count, smoke_level=last.get("smoke", 0.0), smoke_reason=last.get("reason_smoke", ""))
            time.sleep(PERIOD)
        except Exception as e:
            _set(state="error", detail=message_data.error_text(e))
            time.sleep(3)


def _set(**k):
    with _lock:
        _state.update(k)


def state():
    with _lock:
        e = dict(_state)
    e["config"] = cfg()
    e["test_s"] = max(0, int(_test["until"] - time.time()))
    s = SENS[e["config"]["sensitivity"]]
    e["threshold_flame"] = s["flame"]
    e["sec_flame"] = s["sec"]
    e["sec_smoke"] = s["sec_smoke"]
    e["threshold_smoke"] = s["smoke"]
    e["deadline_max"] = DEADLINE_MAX
    e["deadline_flame_max"] = DEADLINE_FLAME_MAX
    e["sensibilidades"] = list(SENS)
    e["actions"] = list(ACTIONS)
    for k in ("flame", "contrast", "base", "smoke_level"):
        if isinstance(e.get(k), float):
            e[k] = round(e[k], 4 if k == "flame" else 2 if k == "smoke_level" else 1)
    return e


def cancel():
    """The user cancels the countdown (POST /fuego/cancelar)."""
    with _dec_lock:
        dec = _ctx["dec"]
        ev = dec.cancel(time.time()) if dec is not None else None
        if ev is None:
            return {"ok": True, "cancelled": False, "reason": M("fire_watch_there_is_no_countdown_running")}
        _event(ev)
        _set(count=None)
    return {"ok": True, "cancelled": True, "reason": ev["reason"]}


def confirm(body):
    """The page confirms ("Understood" checkbox) a change of action, on/off,
    sensitivity or deadline during a job, BEFORE saving it in vision.json."""
    changes = _padlock.confirm(body or {}, time.time())
    V.log("fuego: cambio confirmado por la pagina:", changes)
    return {"ok": True, "confirmed": changes, "in_job": _padlock.fixed is not None}


def probe():
    """Measures the current image (no job, no action): to see on the
    page whether the camera sees the zone well and how it responds."""
    _, _, img = V.CAMERA.image(fresh=True)
    r = measure(img)
    frac, contrast, m, small, stain, pl, bl = r["frac"], r["contrast"], r["m"], r["img"], r["stain"], r["pl"], r["white"]
    c = cfg()
    s = SENS[c["sensitivity"]]
    small = small.copy()
    white_px = int(np.count_nonzero(bl & cv2.bitwise_not(m)))
    small[(bl > 0) & (m == 0)] = (255, 0, 255)  # very bright white: flame if it was not there before, in violet (yellow was confused with the flame)
    small[m > 0] = (0, 0, 255)  # what would count as flame, in red
    if pl:
        cv2.circle(small, pl, RADIUS_LASER, (255, 160, 0), 1)  # laser zone that does not count, in light blue
    photo = V.save_photo(small, notice=M("fire_watch_fire_watch_test"))
    sees = frac >= s["flame"]
    by_that = []
    if not c["active"]:
        by_that.append(M("fire_watch_the_watch_is_off"))
    try:
        active, desc, _, _ = _machine()
        if not active:
            by_that.append(M("fire_watch_it_only_watches_with_a_laser_job", job=desc))
    except Exception:
        pass
    return {"ok": True, "flame": round(frac, 5), "threshold_flame": s["flame"], "contrast": round(contrast, 1), "photo": photo,
            "would_see_flame": sees, "stain_px": stain, "white_px": white_px, "white_frac": round(white_px / float(m.size), 5), "pixeles": int(m.size), "sec": s["sec"], "laser_px": list(pl) if pl else None,
            "would_not_alarm_by": by_that}


def view_jpg():
    """The last image analyzed by the watch (marked), if it is recent."""
    if _view["jpg"] and time.time() - _view["ts"] < 5:
        return _view["jpg"]
    return None


def test(sec):
    """Watches without a job for seg seconds (0 = stop): it only notifies."""
    sec = max(0, min(TEST_MAX, int(sec or 0)))
    _test["until"] = time.time() + sec if sec else 0.0
    return {"ok": True, "test_s": sec}


def begin():
    threading.Thread(target=_loop, name="fire", daemon=True).start()
