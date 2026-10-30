"""Automatic calibration with crosses marked by the LASER (background job).

Launched by the Vision page (double-tap button): POST /cruces/empezar.
It MOVES the machine and FIRES the laser (low power, cap from laserguard.g).

Steps:
  1. Sweep BEFORE: photos with the bridge high at several Y (without laser).
  2. Focus: chosen material macro (measures with the probe) or "already focused".
  3. Mark: 6 crosses around the head (M32 job: it can be paused /
     cancelled from DWC). The sixth breaks the symmetry (orientation without doubt).
  4. Sweep AFTER at the same positions; black-hat(after) -
     black-hat(before) leaves only the new lines (immune to changes in
     exposure / white balance); cross template -> subpixel center.
  5. Fit: homography with all the crosses of all the photos (each photo
     corrected by its Y: the camera is on the bridge).
  6. Height: lowers the bridge, centers the crosses with Y, photo -> h0 and nadir.
  7. Check: third position (different Y/Z) -> prediction error.
It saves nothing: the page saves the result (like the other calibrations).
"""
import itertools
import math
import os
import threading
import time
import traceback

import cv2
import numpy as np

import dsf_io
import message_data
from messages import J, M

V = None  # the vision module (set by vision.py on import)

# Pattern in mm around the head (head coords). (30, 40) breaks the symmetry.
PATTERN = [(0, 0), (-60, -40), (60, -40), (60, 40), (-60, 40), (30, 40)]
# More crosses (2026-10-10, "there should be more options with laser"): grids
# with ONE cross shifted so that there is no doubt about the orientation.
PATTERNS = {
    "6": PATTERN,
    "9": [(x, y) for y in (-40, 0, 40) for x in (-60, 0, 60) if (x, y) != (60, 40)] + [(30, 40)],
    "12": [(x, y) for y in (-40, 0, 40) for x in (-90, -30, 30, 90) if (x, y) != (90, 40)] + [(60, 40)],
}


def pattern(label=None, scale=None):
    """Crosses around the head (mm) for the requested pattern and spacing."""
    p = PATTERNS.get(str(label or "6"), PATTERN)
    k = min(2.0, max(0.75, float(scale or 1)))
    return [(dx * k, dy * k) for dx, dy in p]
CORRECTION = (-16.5, 0.0)  # zone correction: pointer = head - CORR (where the beam lands)

_job = {"active": False}
_lock = threading.Lock()


class Cancelled(Exception):
    pass


def _copy(o):
    """A copy of the job's dicts and lists that keeps the messages (a JSON round trip would turn them into Spanish text)."""
    if isinstance(o, dict):
        return {k: _copy(v) for k, v in o.items()}
    if isinstance(o, (list, tuple)):
        return [_copy(v) for v in o]
    return o


def state():
    with _lock:
        return _copy({k: v for k, v in _job.items() if k != "_cancel"})


def cancel():
    with _lock:
        if _job.get("active"):
            _job["_cancel"] = True
            return True
    return False


def _step(n, text, pct=None):
    with _lock:
        if _job.get("_cancel"):
            raise Cancelled()
        _job["step"] = n
        _job["text"] = text
        if pct is not None:
            _job["pct"] = pct
        _job.setdefault("log", []).append(J([time.strftime("%H:%M:%S "), text], ""))
        _job["log"] = _job["log"][-60:]
    V.log("crosses:", text)


def _status():
    """Modelo suscripto (dsf_io), no GET /machine/status."""
    return dsf_io.read_in(waiting=10)


def _pose():
    d = _status()
    ax = {a["letter"]: a for a in d["move"]["axes"]}
    return d, {k: ax[k]["machinePosition"] for k in "XYZ"}, {k: (ax[k]["min"], ax[k]["max"]) for k in "XYZ"}, all(ax[k]["homed"] for k in "XYZ")


def _code(c, timeout=900):
    """G-code through the calibration's CommandConnection (dsf_io, SBC channel):
    a long macro here does not delay the fire watch's codes."""
    t = dsf_io.commands("calibration").code(c, timeout).strip()
    if t and ("rror" in t or "abort" in t.lower()):
        raise RuntimeError(t)
    return t


def _write_sd(rel, txt):
    """Writes a file on the virtual SD directly (fileSystemAccess permission),
    instead of PUT /machine/file over HTTP."""
    route = os.path.join(V.SD, *rel.split("/"))
    os.makedirs(os.path.dirname(route), exist_ok=True)
    tmp = route + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as f:
        f.write(txt)
    os.replace(tmp, route)


def _free():
    """Before EVERY own move (not just at the start: the calibration lasts
    minutes): without a file job or a live job
    (motion audit, finding 8)."""
    m = dsf_io.reason_no_move(_status())
    if m:
        raise ValueError(M("laser_calibration_the_machine_is_not_moved", reason=m))
    # 2026-10-13: the owner of the movement (WorkshopService) keeps the machine
    # for this sequence; another page or a job gets "being used by vision"
    dsf_io.reserve_motion(M("laser_calibration_camera_calibration"))


def _still(maxs=900):
    t0 = time.time()
    while time.time() - t0 < maxs:
        d = _status()
        if d["state"]["status"] == "idle":
            return
        time.sleep(0.5)
    raise RuntimeError(M("laser_calibration_the_machine_did_not_stop"))


def _move(y=None, z=None):
    c = 'M98 P"0:/sys/workshop/macros/visionpose.g"' + ("" if y is None else " Y%.3f" % y) + ("" if z is None else " Z%.3f" % z)
    _free()
    _code(c)
    _still()


def _photo(fs):
    _still()
    time.sleep(0.4)
    jpg, img = V.photo_high(fs)
    img = V.fix_lens(img)  # the same as the video and the measurement photos
    _, p, _, _ = _pose()
    return img, p


# ---------------------------------------------------------------- deteccion


def _bh(img):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (15, 15))
    return cv2.morphologyEx(g, cv2.MORPH_BLACKHAT, k).astype(np.float32)


def _template(L):
    L = int(L)
    T = np.zeros((L + 21, L + 21), np.float32)
    c = (L + 21) // 2
    T[c - 1 : c + 2, 10 : 10 + L] = 1
    T[10 : 10 + L, c - 1 : c + 2] = 1
    return T, c


def _refines(d, cx, cy, r=40):
    h, w = d.shape
    x0, y0 = int(max(1, cx - r)), int(max(1, cy - r))
    win = d[y0 : min(h - 1, y0 + 2 * r), x0 : min(w - 1, x0 + 2 * r)]
    if win.size == 0:
        return [float(cx), float(cy)]
    rows, cols = win.sum(1), win.sum(0)

    def sub(a, i):
        if 0 < i < len(a) - 1:
            den = a[i - 1] - 2 * a[i] + a[i + 1]
            return i + (0.5 * (a[i - 1] - a[i + 1]) / den if den else 0)
        return float(i)

    return [x0 + sub(cols, int(np.argmax(cols))), y0 + sub(rows, int(np.argmax(rows)))]


def _candidates(d, Ls, threshold_value=0.3, n=14, sep=60):
    cand = []
    for L in Ls:
        T, c = _template(L)
        if d.shape[0] <= T.shape[0] or d.shape[1] <= T.shape[1]:
            continue
        m = cv2.matchTemplate(d, T, cv2.TM_CCOEFF_NORMED)
        for _ in range(n):
            _, v, _, p = cv2.minMaxLoc(m)
            if v < threshold_value:
                break
            cand.append((float(v), p[0] + c, p[1] + c, L))
            cv2.circle(m, p, sep, -1, -1)
    cand.sort(reverse=True)
    end = []
    for b in cand:
        if all(math.hypot(b[1] - f[1], b[2] - f[2]) > sep for f in end):
            end.append(b)
    return end[:n]


def _assign_pattern(pts, bed, minimum=4, tol=6.0, con_error=False):
    """Matches image points with the crosses (in mm): each pair of points
    and pair of crosses defines a similarity (with or without mirror, in complex
    numbers z' = a*z + b); the one that explains the most crosses wins (within tol
    mm). Returns [(point_i, cross_i)] or None."""
    P = np.asarray(pts, float)[:10]
    if len(P) < minimum:
        return None
    zb = bed[:, 0] + 1j * bed[:, 1]
    best = None
    for mirror in (False, True):
        zp = P[:, 0] + 1j * (-P[:, 1] if mirror else P[:, 1])
        for i1, i2 in itertools.permutations(range(len(zp)), 2):
            dp = zp[i2] - zp[i1]
            if abs(dp) < 5:
                continue
            for j1, j2 in itertools.permutations(range(len(zb)), 2):
                a = (zb[j2] - zb[j1]) / dp
                if not (0.02 < abs(a) < 2.0):  # reasonable mm per pixel
                    continue
                m = a * zp + (zb[j1] - a * zp[i1])
                dist = np.abs(m[:, None] - zb[None, :])  # puntos x cruces
                pairs, used, err = [], set(), 0.0
                for ip in np.argsort(dist.min(1)):
                    jb = int(np.argmin(dist[ip]))
                    if dist[ip, jb] < tol and jb not in used:
                        pairs.append((int(ip), jb))
                        used.add(jb)
                        err += dist[ip, jb]
                # tie-break: a camera looking down inverts the
                # orientation (image with y down) -> "mirror" in these complex
                # numbers is the PHYSICAL one; the other only if hmirror/vflip
                # was turned on extra.
                key = (len(pairs), 1 if mirror else 0, -round(err, 1))
                if best is None or key > best[0]:
                    best = (key, pairs)
    if best and best[0][0] >= minimum:
        return (sorted(best[1]), -best[0][2]) if con_error else sorted(best[1])
    return (None, None) if con_error else None


def _search_predicted(img, Hp, bed, L, W, H):
    """With a previous calibration: looks for each cross near where the
    calibration says it is (without a 'before' photo). [(j, [x, y], score)]"""
    d = cv2.GaussianBlur(_bh(img), (3, 3), 0)
    kp = V.scale_px_by_mm(Hp, W, H)
    out = []
    for j, (px, py) in enumerate(V.a_px(Hp, bed)):
        Lp = L * kp
        if not (Lp * 0.7 < px < W - Lp * 0.7 and Lp * 0.7 < py < H - Lp * 0.7):
            continue
        T, c = _template(Lp)
        r = int(Lp * 1.2)
        x0, y0 = int(max(0, px - r)), int(max(0, py - r))
        win = d[y0 : y0 + 2 * r, x0 : x0 + 2 * r]
        if win.shape[0] <= T.shape[0] or win.shape[1] <= T.shape[1]:
            continue
        mm = cv2.matchTemplate(win, T, cv2.TM_CCOEFF_NORMED)
        _, v, _, pp = cv2.minMaxLoc(mm)
        if v > 0.4:
            out.append((j, _refines(d, x0 + pp[0] + c, y0 + pp[1] + c), float(v)))
    return out


DEBUG_DIR = "/tmp/vcal-job"


def _save_debug(label, img):
    try:
        import os

        os.makedirs(DEBUG_DIR, exist_ok=True)
        cv2.imwrite(os.path.join(DEBUG_DIR, label), img, [cv2.IMWRITE_JPEG_QUALITY, 90])
    except Exception:
        pass


# ---------------------------------------------------------------- trabajo


def begin(body):
    with _lock:
        if _job.get("active"):
            raise ValueError(M("laser_calibration_a_calibration_is_already_running"))
        # Laser safety: it never starts (moves, fires) unless the machine is idle; if the state cannot be read it does not start
        if _status()["state"]["status"] != "idle":
            raise ValueError(M("laser_calibration_the_machine_is_not_still"))
        _job.clear()
        _job.update(active=True, step=0, text=M("laser_calibration_starting"), pct=0, log=[], empezo=time.strftime("%Y-%m-%d %H:%M:%S"), params=body)
    threading.Thread(target=_run, args=(body,), daemon=True).start()
    return state()


def _run(body):
    luz_prendi = False
    try:
        res = _process(body, lambda: None)
        with _lock:
            _job.update(active=False, ok=True, result=res, text=M("laser_calibration_done_check_the_result"), pct=100)
    except Cancelled:
        with _lock:
            _job.update(active=False, ok=False, error="cancelled", text=M("laser_calibration_cancelled"))
    except Exception as e:
        V.log("cruces: error", traceback.format_exc())
        with _lock:
            _job.update(active=False, ok=False, error=message_data.error_text(e), text=M("laser_calibration_error", error=message_data.error_text(e)))
    finally:
        dsf_io.release_motion()


def _process(body, _):
    S = float(body.get("power", 10))
    L = float(body.get("side", 20))
    reu = body.get("reuse") or {}
    pat_n, pat_k = str(reu.get("pattern") or body.get("pattern") or "6"), float(reu.get("scale") or body.get("scale") or 1)
    PAT = pattern(pat_n, pat_k)
    with _lock:
        _job["pattern"], _job["scale"] = pat_n, pat_k
    macro = body.get("focus")  # "0:/macros/laser/x.g" or None = already focused
    revert = body.get("back", True)
    fs = int(V.CFG.photo_cfg()["fs"])
    W, H = V.FS_SIZE[fs]

    d, p0, lim, homed = _pose()
    if d["state"]["status"] != "idle":
        raise ValueError(M("laser_calibration_the_machine_is_not_still"))
    _free()
    if not homed:
        raise ValueError(M("laser_calibration_x_y_and_z_need_homing"))
    mode = dsf_io.value_global(d, "selectedMode", use="calibration") or d["state"].get("machineMode")
    if str(mode).lower() != "laser":
        raise ValueError(M("laser_calibration_the_machine_is_not_in_laser_mode", mode=mode))
    if not (0 < S <= 10):
        raise ValueError(M("laser_calibration_power_outside_0_10"))
    zfoto = float(body.get("zfoto") or min(lim["Z"][1] - 10, 300))
    zfoto = min(zfoto, lim["Z"][1])
    ys = body.get("ys") or [round(v, 1) for v in np.arange(lim["Y"][0], lim["Y"][1] + 1e-6, 100)]
    ys = [float(min(max(y, lim["Y"][0]), lim["Y"][1])) for y in ys]

    light = V.LightPhoto().__enter__()  # work light + zones chosen in Vision > Settings
    try:
        # With a previous calibration the crosses are looked for where it predicts
        # (the 'before' photo is not needed); without calibration: before/after.
        cal_prev, _ = V.CFG.calibration_for(W, H)
        if cal_prev is not None and cal_prev.get("y") is None:
            cal_prev = None
        if cal_prev is not None and not V.CFG.height:
            zfoto = float(cal_prev["z"])  # without height it can only predict at the calibrated Z
        reuse = body.get("reuse")  # {"cabezal": [x, y]}: crosses already marked, it does not fire

        # 1) antes
        before = {}
        if cal_prev is None:
            if reuse:
                raise ValueError(M("laser_calibration_reusing_crosses_needs_a_previous"))
            for i, y in enumerate(ys):
                _step(1, M("laser_calibration_before_photo", n=i + 1, total=len(ys), y=y, z=zfoto), 2 + 25 * i / len(ys))
                _move(y, zfoto)
                before[y] = _photo(fs)[0]
                _save_debug("before_%d.jpg" % y, before[y])

        if reuse:
            hx, hy = float(reuse["head"][0]), float(reuse["head"][1])
            _step(3, M("laser_calibration_no_marking_the_crosses_already", x=hx, y=hy), 35)
            cab = np.array([[hx + dx, hy + dy] for dx, dy in PAT])
        else:
            # 2) enfocar
            if macro:
                _step(2, M("laser_calibration_measuring_and_focusing", macro=macro.split("/")[-1]), 30)
                _free()
                _code('M98 P"%s"' % macro)
                _still()
            elif cal_prev is None:
                # "already focused" = where the head was at the start: go back there
                # after the sweep (Y with the bridge high, X, and Z at the end).
                _step(2, M("laser_calibration_going_back_to_the_focus_point", x=p0["X"], y=p0["Y"], z=p0["Z"]), 30)
                _move(p0["Y"], None)
                _free()
                _code("G90\nG53 G1 X%.3f F3000 S0" % p0["X"])  # G90 in the same request (finding 10)
                _code("M400")
                _free()
                _code("G90\nG53 G1 Z%.3f F600 S0" % p0["Z"])
                _code("M400")
                _still()
            d, pf, _, _ = _pose()
            hx, hy = pf["X"], pf["Y"]
            cab = np.array([[hx + dx, hy + dy] for dx, dy in PAT])
            for x, y in cab:
                if not (lim["X"][0] <= x <= lim["X"][1] and lim["Y"][0] <= y <= lim["Y"][1]):
                    raise ValueError(M("laser_calibration_the_crosses_fall_outside_the_travel", x=hx, y=hy))

            # 3) marcar (trabajo M32)
            _step(3, M("laser_calibration_marking_crosses", n=len(PAT), side=L, power=S), 35)
            pot = S * 2.55
            lin = ['M98 P"0:/sys/workshop/macros/laserguard.g" S%g' % S, "G90", "M400"]
            for x, y in cab:
                lin += ["G53 G1 X%.3f Y%.3f F3000 S0" % (x, y), "M400", "G91",
                        "G1 X%.3f F300 S0" % (L / 2), "G1 X%.3f S%.1f" % (-L, pot), "G1 X%.3f S0" % (L / 2),
                        "G1 Y%.3f S0" % (L / 2), "G1 Y%.3f S%.1f" % (-L, pot), "G1 Y%.3f S0" % (L / 2), "G90"]
            lin += ["G53 G1 X%.3f Y%.3f F3000 S0" % (hx, hy), "M400"]
            txt = "; sys/workshop/gcodes/vision-crosses.g -- calibracion de la camara (workshop-vision)\n" + "\n".join(lin) + "\n"
            _write_sd("sys/workshop/gcodes/vision-crosses.g", txt)
            _free()
            _code('M32 "0:/sys/workshop/gcodes/vision-crosses.g"')
            time.sleep(2)
            t0 = time.time()
            while True:
                d = _status()
                if d["state"]["status"] == "idle" and not (d["job"].get("file") or {}).get("fileName"):
                    break
                if d["state"]["status"] in ("paused", "pausing") and time.time() - t0 > 1800:
                    raise RuntimeError(M("laser_calibration_the_crosses_job_stayed_paused"))
                if _job.get("_cancel"):
                    raise Cancelled()
                time.sleep(1)
            if "vision-crosses" not in (d["job"].get("lastFileName") or "vision-crosses") or d["job"].get("lastFileCancelled"):
                raise RuntimeError(M("laser_calibration_the_crosses_job_was_cancelled"))
        bed = cab - np.array(CORRECTION)  # POINTER coords (those of the map)
        with _lock:
            _job["head"] = [round(float(hx), 3), round(float(hy), 3)]

        # 4) despues + deteccion
        S_, D_, yb = [], [], None
        if cal_prev is not None:
            # only the Y where the calibration says the crosses can be seen
            vis = []
            for y in ys:
                Hp, _ = V.move_pose(cal_prev["Hm"], cal_prev, {"y": y, "z": zfoto}, V.CFG.height)
                pr = V.a_px(Hp, bed)
                n = int(np.sum((pr[:, 0] > 80) & (pr[:, 0] < W - 80) & (pr[:, 1] > 80) & (pr[:, 1] < H - 80)))
                if n >= 3:
                    vis.append(y)
            for i, y in enumerate(vis):
                _step(4, M("laser_calibration_photo", n=i + 1, total=len(vis), y=y, z=zfoto), 45 + 25 * i / max(1, len(vis)))
                _move(y, zfoto)
                img = _photo(fs)[0]
                _save_debug("after_%d.jpg" % y, img)
                Hp, _ = V.move_pose(cal_prev["Hm"], cal_prev, {"y": y, "z": zfoto}, V.CFG.height)
                enc = _search_predicted(img, Hp, bed, L, W, H)
                if yb is None and enc:
                    yb = y
                for j, pxy, v in enc:
                    S_.append(pxy)
                    D_.append(bed[j] - np.array([0, y - yb]))
            _step(5, M("laser_calibration_computing_with_crosses_found", n=len(S_)), 72)
        else:
            dets = {}
            for i, y in enumerate(ys):
                _step(4, M("laser_calibration_after_photo", n=i + 1, total=len(ys), y=y, z=zfoto), 45 + 25 * i / len(ys))
                _move(y, zfoto)
                img = _photo(fs)[0]
                _save_debug("after_%d.jpg" % y, img)
                dd = cv2.GaussianBlur(np.clip(_bh(img) - _bh(before[y]), 0, 255), (3, 3), 0)
                cands = _candidates(dd, [L * f for f in (3, 4, 5, 6, 7, 8)], threshold_value=0.35)
                dets[y] = [(c[0], _refines(dd, c[1], c[2])) for c in cands]
            # 5) matching: the photo that BEST explains the pattern (not the one with the most
            # candidates)
            _step(5, M("laser_calibration_looking_for_the_crosses"), 72)
            base = None
            for y, lst in dets.items():
                pts = [c[1] for c in lst]
                asg, err = _assign_pattern(pts, bed, minimum=4, con_error=True)
                if asg:
                    key = (len(asg), -err)
                    if base is None or key > base[0]:
                        base = (key, y, pts, asg)
            if not base:
                raise RuntimeError(M("laser_calibration_the_crosses_were_not_found"))
            _, yb, pts, asg = base
            src = np.array([pts[i] for i, _ in asg])
            dst = np.array([bed[j] for _, j in asg])
            H0, _ = cv2.findHomography(src, dst, 0)
            for y, lst in dets.items():
                used = set()
                for sc, pxy in lst:
                    m = V.a_mm(H0, [pxy])[0] + np.array([0, y - yb])
                    dist = np.linalg.norm(bed - m, axis=1)
                    j = int(np.argmin(dist))
                    if dist[j] < 4 and j not in used:
                        used.add(j)
                        S_.append(pxy)
                        D_.append(bed[j] - np.array([0, y - yb]))
        S_, D_ = np.array(S_), np.array(D_)
        if len(S_) < 4:
            raise RuntimeError(M("laser_calibration_too_few_crosses_found", n=len(S_), folder=DEBUG_DIR))
        Hm, _ = cv2.findHomography(S_, D_, cv2.RANSAC if len(S_) > 6 else 0, 2.0)
        res = np.linalg.norm(V.a_mm(Hm, S_) - D_, axis=1)
        k = V.scale_px_by_mm(Hm, W, H)
        # carriage X in the photos (it counts if the camera is on the carriage; the photos only move
        # Y/Z)
        xfoto = float(_pose()[1]["X"])
        cal = {
            "H": Hm.tolist(), "size": [W, H], "x": xfoto, "y": yb, "z": zfoto, "source": "cruces laser",
            "date": time.strftime("%Y-%m-%d %H:%M:%S"), "error_mm": round(float(np.sqrt((res ** 2).mean())), 3),
            "max_mm": round(float(res.max()), 3), "px_per_mm": round(float(k), 3), "used": int(len(S_)),
        }
        calm = dict(cal, Hm=Hm)

        # 6) height: lower 50 mm, center the crosses with Y
        z2 = max(float(V.CFG.photo_cfg()["zmin"]), zfoto - 50)
        cen_img = V.a_mm(Hm, [[W / 2, H / 2]])[0]  # where the center of the photo looks (in yb)
        y2 = float(min(max(yb + (bed[:, 1].mean() - cen_img[1]), lim["Y"][0]), lim["Y"][1]))
        _step(6, M("laser_calibration_second_height", y=y2, z=z2), 80)
        _move(y2, z2)
        img2 = _photo(fs)[0]
        d2 = cv2.GaussianBlur(_bh(img2), (3, 3), 0)
        alt = None
        # look for each cross near where it would fall with possible scales (k between 0.6 and 1.0 around the
        # center)
        pts2 = []
        for f in np.linspace(0.7, 1.0, 7):
            Hg = V.mat_T(*cen_img) @ V.mat_S(f, f) @ V.mat_T(*(-cen_img)) @ Hm
            Hg = V.mat_T(0, y2 - yb) @ Hg
            pr = V.a_px(Hg, bed)
            enc = []
            for j, (px, py) in enumerate(pr):
                if not (40 < px < W - 40 and 40 < py < H - 40):
                    continue
                Lp = L * k / f
                T, c = _template(Lp)
                r = int(Lp)
                x0, y0 = int(max(0, px - r)), int(max(0, py - r))
                win = d2[y0 : y0 + 2 * r, x0 : x0 + 2 * r]
                if win.shape[0] <= T.shape[0] or win.shape[1] <= T.shape[1]:
                    continue
                mm = cv2.matchTemplate(win, T, cv2.TM_CCOEFF_NORMED)
                _, v, _, pp = cv2.minMaxLoc(mm)
                if v > 0.4:
                    enc.append((j, _refines(d2, x0 + pp[0] + c, y0 + pp[1] + c), v))
            if len(enc) > len(pts2):
                pts2 = enc
        if len(pts2) >= 3:
            P2 = np.array([p for _, p, _ in pts2])
            B2 = bed[[j for j, _, _ in pts2]]
            b1 = V.a_mm(Hm, P2) + np.array([0, y2 - yb])
            A = np.zeros((2 * len(P2), 3))
            A[0::2, 0], A[0::2, 1] = b1[:, 0], 1
            A[1::2, 0], A[1::2, 2] = b1[:, 1], 1
            sol, *_ = np.linalg.lstsq(A, B2.reshape(-1), rcond=None)
            kk, cx, cy = sol
            r2 = np.linalg.norm((A @ sol).reshape(-1, 2) - B2, axis=1)
            if abs(kk - 1) > 1e-3:
                N = np.array([cx, cy]) / (1 - kk)
                h0 = (z2 - kk * zfoto) / (kk - 1)
                if zfoto + h0 > 0 and z2 + h0 > 0:
                    carriage = V.camera_in_carriage()
                    alt = {"h0": round(float(h0), 3), "N_rel": [round(float(N[0] - (xfoto if carriage else 0.0)), 3), round(float(N[1] - y2), 3)], "rel_x": bool(carriage),
                           "lens_mm": [round(float(zfoto + h0), 1), round(float(z2 + h0), 1)], "rms_mm": round(float(np.sqrt((r2 ** 2).mean())), 3),
                           "zs": [zfoto, z2], "date": cal["date"], "points": int(len(P2))}

        # 7) check at a third position
        valid = None
        if alt:
            z3 = round((zfoto + z2) / 2, 1)
            y3 = float(min(max(y2 - 30, lim["Y"][0]), lim["Y"][1]))
            _step(7, M("laser_calibration_checking_at", y=y3, z=z3), 90)
            _move(y3, z3)
            img3 = _photo(fs)[0]
            d3 = cv2.GaussianBlur(_bh(img3), (3, 3), 0)
            Hp, _ = V.move_pose(Hm, calm, {"y": y3, "z": z3}, alt)
            kp = V.scale_px_by_mm(Hp, W, H)
            errs = []
            for j, (px, py) in enumerate(V.a_px(Hp, bed)):
                if not (60 < px < W - 60 and 60 < py < H - 60):
                    continue
                T, c = _template(L * kp)
                r = int(L * kp)
                x0, y0 = int(max(0, px - r)), int(max(0, py - r))
                win = d3[y0 : y0 + 2 * r, x0 : x0 + 2 * r]
                if win.shape[0] <= T.shape[0] or win.shape[1] <= T.shape[1]:
                    continue
                mm = cv2.matchTemplate(win, T, cv2.TM_CCOEFF_NORMED)
                _, v, _, pp = cv2.minMaxLoc(mm)
                if v > 0.4:
                    real = _refines(d3, x0 + pp[0] + c, y0 + pp[1] + c)
                    errs.append(float(np.linalg.norm(V.a_mm(Hp, [real])[0] - bed[j])))
            valid = {"y": y3, "z": z3, "crosses": len(errs), "error_max_mm": round(max(errs), 3) if errs else None, "error_mean_mm": round(float(np.mean(errs)), 3) if errs else None}

        if revert:
            _step(8, M("laser_calibration_going_back_to_where_it_was", y=p0["Y"], z=max(p0["Z"], float(V.CFG.photo_cfg()["zmin"]))), 97)
            _move(p0["Y"], max(p0["Z"], float(V.CFG.photo_cfg()["zmin"])))
        cob = None
        if alt:
            cob = {}
            for zz in sorted(set([round(lim["Z"][1], 1), round(zfoto, 1), round(z2, 1)])):
                Hz, _ = V.move_pose(Hm, calm, {"y": yb, "z": zz}, alt)
                q = V.a_mm(Hz, [[0, 0], [W, 0], [W, H], [0, H]])
                cob[str(zz)] = {"x": [round(float(q[:, 0].min()), 1), round(float(q[:, 0].max()), 1)], "px_per_mm": round(float(V.scale_px_by_mm(Hz, W, H)), 3)}
        return {"calibration": cal, "height": alt, "check": valid, "crosses": bed.round(3).tolist(), "coverage": cob, "power": S, "side": L}
    finally:
        light.__exit__(None, None, None)  # turns off only what was turned on for the photos
