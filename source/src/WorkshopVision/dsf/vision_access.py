"""Who may call what on the Vision server (port 8095) once the machine has users (F3-C of the redesign).

The page talks to this server directly (it sends the images and the long calls), so the roles of the service API (permissions.py of
WorkshopService) would not reach it. The page now sends the same headers as for the API (X-Workshop-Token, X-Workshop-Device) and this
module asks the service who that is (`auth.resolve`, the local API on 127.0.0.1, with the local key) before a POST is served.

Rules (the same ones the service applies to `vision.post`, plus the two answers of the fire watch):
  - machine WITHOUT users (the service says `configured: false` or `compat`): nothing changes, as before;
  - /photo, /detect, /record/search: operator; /fire/cancel, /fire/confirm: operator; /crosses/cancel: any caller (stopping is never blocked);
  - everything else (/crosses/begin moves the machine and fires the laser, /config, /calibrate*, /lens*, /plan, /mosaic...): technician;
    a path that is not in the table is the technician's too (a new path is closed until somebody classifies it);
  - GET (F3-D, same rule as the camera relay, camera_access.py of the service): every path of GET_RULES is a read of the camera or of what
    Vision sees: a viewer needs the camera (the flag `user.camera` that auth.resolve sends; a missing flag = no camera), operator and above
    always. A path that is not in GET_RULES needs technician (closed until somebody classifies it; a test fails if `_get` has an unclassified
    path). /fire/record and /fire/photo are the fire watch's camera shots and records: the same as a camera read. Nothing that GET serves
    changes the machine, so nothing is above "read" here; /lens, /before and /crosses/state are the calibration state the page draws.
    An <img> / fetch of an image that cannot carry the session (GET of a read path with NO X-Workshop-Token header) is accepted with the
    day key (`?t=` or cookie workshop_camera) that the camera relay confirms as REQUIRED and valid; "DWC has no password" is not a key.
    A request that sends the token is decided by that session only. Without users the camera key rule of vision.py (`_authorized`) applies
    exactly as before (authorize_get answers allowed=None for "ask the key as before").

Who is "internal": a request from the Pi itself (loopback) with no Origin header and no token is the service (vision.post of the
API, already checked there by permissions.py) or another local program: it passes. A browser always sends Origin on a POST, so the
kiosk (also loopback) is checked like any other screen.

Fail closed: users exist and the service cannot be asked -> the request is refused (503), never let through. A service without
`auth.resolve` (older than this)  answers unknown_op -> compatibility, as before.

Pure parts (required_role, decide, is_internal) and the network part (ask) are apart so the rules are tested without a service.
"""
import time

import net_guard

RANKS = {"viewer": 0, "operator": 1, "technician": 2, "admin": 3}
CACHE_S = 5
TIMEOUT_S = 2

# POST path -> role it needs; None = any caller (stop). Anything not listed needs technician.
POST_ROLES = {
    "/photo": "operator",
    "/detect": "operator",
    "/measure": "operator",  # read-only look used by the Machine camera verification (the endpoint itself is not in Vision yet)
    "/record/search": "operator",
    "/fire/cancel": "operator",
    "/fire/confirm": "operator",
    "/crosses/cancel": None,
}
DEFAULT_ROLE = "technician"

# GET path -> (lowest role, a viewer needs the camera). Anything not listed needs technician.
READ = ("viewer", True)
GET_RULES = {
    "/state": READ,
    "/head": READ,
    "/orientation": READ,
    "/lens": READ,
    "/before": READ,
    "/crosses/state": READ,
    "/fire/state": READ,
    "/fire/record": READ,
    "/fire/photo": READ,
    "/fire/view.jpg": READ,
    "/frame.jpg": READ,
    "/mark.png": READ,
}
GET_DEFAULT = ("technician", False)

_cache = {}  # (token, device) -> (time, answer)


def required_role(method, path):
    """Role needed for this call: "operator", "technician", or None when no identity is needed (GET, stopping)."""
    if str(method).upper() != "POST":
        return None  # a GET has its own rule: get_rule / authorize_get
    return POST_ROLES.get(str(path), DEFAULT_ROLE)


def get_rule(path):
    """(lowest role, viewer needs the camera) for a GET path. Not in the table -> technician."""
    return GET_RULES.get(str(path), GET_DEFAULT)


def is_internal(client_ip, headers):
    """True for the service or a local program: loopback, no Origin, no token. A browser (even on the Pi) is not internal."""
    if not net_guard.is_loopback(client_ip):
        return False
    return not (headers.get("Origin") or headers.get("X-Workshop-Token"))


def decide(answer, need):
    """(allowed, http_status, code) from the answer of auth.resolve and the role the call needs.

    answer: the `result` of auth.resolve, or {"error": "<code>"} when the service did not give one, or None when it could not be reached.
    code: "" | "login_required" | "forbidden" | "service_unreachable"."""
    if need is None:
        return True, 200, ""
    if answer is None:
        return False, 503, "service_unreachable"
    if answer.get("error") == "unknown_op":
        return True, 200, ""  # a service without roles: as before
    if answer.get("error"):
        return False, 503, "service_unreachable"
    if answer.get("configured") is False or answer.get("compat"):
        return True, 200, ""  # nobody has been created yet: everybody is admin
    role = answer.get("role")
    if role not in RANKS:
        return False, 401, "login_required"
    if RANKS[role] < RANKS[need]:
        return False, 403, "forbidden"
    return True, 200, ""


def decide_get(answer, rule):
    """(allowed, http_status, code) for a GET from the answer of auth.resolve. allowed None = nobody has users: apply the camera key as before.

    A viewer is let through only when the answer says `user.camera` is true; a missing flag (older service) is no camera: fail closed."""
    need, camera_rule = rule
    if answer is None:
        return False, 503, "service_unreachable"
    if answer.get("error") == "unknown_op":
        return None, 200, ""  # a service without roles: as before
    if answer.get("error"):
        return False, 503, "service_unreachable"
    if answer.get("configured") is False or answer.get("compat"):
        return None, 200, ""
    role = answer.get("role")
    if role not in RANKS:
        return False, 401, "login_required"
    if RANKS[role] < RANKS[need]:
        return False, 403, "forbidden"
    if role == "viewer" and camera_rule and (answer.get("user") or {}).get("camera") is not True:
        return False, 403, "forbidden"
    return True, 200, ""


def ask(token, device, now=None, http=None):
    """auth.resolve for this browser: the `result`, {"error": code} or None (unreachable). Cached CACHE_S seconds."""
    t = time.time() if now is None else now
    key = (token or "", device or "")
    hit = _cache.get(key)
    if hit and t - hit[0] < CACHE_S:
        return hit[1]
    try:
        ans = (http or _whoami_http)(token, device)
    except Exception:  # noqa: BLE001  any failure means "could not ask"
        ans = None
    if len(_cache) > 100:
        _cache.clear()
    if ans is not None:
        _cache[key] = (t, ans)
    return ans


def _whoami_http(token, device):
    """auth.resolve of the service with the LOCAL key (dsf_io sends it): the service answers for the token of the browser. A DWC with a
    password would refuse the browser's token on its own (no DWC session here), which is why the question goes with the local key."""
    import dsf_io
    j = dsf_io._api_http("auth.resolve", {"token": token or "", "device": device or ""}, TIMEOUT_S)
    if j.get("ok"):
        return j.get("result") or {}
    return {"error": str((j.get("error") or {}).get("code") or "error")}


def authorize(headers, client_ip, method, path, http=None, now=None):
    """(allowed, http_status, code) for one request of the Vision server."""
    need = required_role(method, path)
    if need is None or is_internal(client_ip, headers):
        return True, 200, ""
    answer = ask(headers.get("X-Workshop-Token") or "", headers.get("X-Workshop-Device") or "", now=now, http=http)
    return decide(answer, need)


def authorize_get(headers, client_ip, path, day_key_valid, http=None, now=None):
    """(allowed, http_status, code) for a GET. allowed None: the machine has no users, the caller applies the camera key as before.

    `day_key_valid()` tells whether the request carries a day key the relay confirms as required and valid (called only when needed)."""
    rule = get_rule(path)
    if is_internal(client_ip, headers):
        return True, 200, ""
    token = headers.get("X-Workshop-Token") or ""
    if not token and rule == READ and day_key_valid():
        return True, 200, ""  # <img> / fetch of an image: the day key the relay already has
    answer = ask(token, headers.get("X-Workshop-Device") or "", now=now, http=http)
    return decide_get(answer, rule)
