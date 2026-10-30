"""Find registration crosses burnt by the laser (POST /registro/buscar).

For "Big piece" (Zones, 2026-10-10): a G-code bigger than the area is
cut in parts; between parts the laser burns 3 small crosses (two
lines of ~5 mm) and the piece is moved / rotated by hand. Here those crosses are
looked for near where each one is expected (it may be off by several cm), WITHOUT a
'before' photo (the piece moved): the strongest cross within the radius.

Detection like laser_calibration: black-hat (dark and thin on the light
wood) + cross template of the expected size + refined center.

If a cross does not fit in the image with the camera where it is, the
camera is moved to center it (visionpose.g, without laser): on the bridge only Y, on the
carriage X and Y. At the end it goes back to where it was. That is movement: the page
asks for a double tap before calling.
"""
import threading

import cv2
import numpy as np

import laser_calibration as CL
from messages import M

V = None  # the vision module (set by vision.py on import)

THRESHOLD = 0.6  # minimum correlation to consider it found (wood grain gives ~0.5; a cross ~0.9)
_lock = threading.Lock()


def _photo():
    """(img, pose, H) of a measurement photo (high resolution) with the machine still."""
    CL._still(60)
    fs = int(V.CFG.photo_cfg()["fs"])
    img, _ = CL._photo(fs)
    pose = V.pose_machine()
    h, w = img.shape[:2]
    H, _ = V.CFG.H_for(w, h, pose)
    if H is None:
        raise ValueError(M("record_log_the_camera_is_not_calibrated_for", w=w, h=h))
    return img, pose, H


def _inside(H, w, h, xy, margin_px):
    p = V.a_px(H, [xy])[0]
    return margin_px <= p[0] <= w - margin_px and margin_px <= p[1] <= h - margin_px


def _center_mm(H, w, h):
    return V.a_mm(H, [[w / 2.0, h / 2.0]])[0]


def _move(x=None, y=None):
    c = 'M98 P"0:/sys/workshop/macros/visionpose.g"' + ("" if x is None else " X%.3f" % x) + ("" if y is None else " Y%.3f" % y)
    CL._free()  # before each move: file job or live job (finding 8)
    CL._code(c, timeout=120)
    CL._still(120)


def _search(img, H, xy, radius, size):
    """(found, [x, y] mm, score) of the strongest cross within <= radius mm of xy."""
    h, w = img.shape[:2]
    kp = V.scale_px_by_mm(H, w, h) or 1.0
    px, py = V.a_px(H, [xy])[0]
    r = int(radius * kp + size * kp)
    x0, y0 = int(max(0, px - r)), int(max(0, py - r))
    x1, y1 = int(min(w, px + r)), int(min(h, py + r))
    if x1 - x0 < 10 or y1 - y0 < 10:
        return False, None, 0.0
    d = cv2.GaussianBlur(CL._bh(img[y0:y1, x0:x1]), (3, 3), 0)
    T, c = CL._template(max(6.0, size * kp))
    if d.shape[0] <= T.shape[0] or d.shape[1] <= T.shape[1]:
        return False, None, 0.0
    mm = cv2.matchTemplate(d, T, cv2.TM_CCOEFF_NORMED)
    # only inside the search circle
    yy, xx = np.mgrid[0 : mm.shape[0], 0 : mm.shape[1]]
    outside = np.hypot(xx + c + x0 - px, yy + c + y0 - py) > radius * kp
    mm[outside] = -1
    _, v, _, pp = cv2.minMaxLoc(mm)
    cx, cy = CL._refines(d, pp[0] + c, pp[1] + c, r=int(max(8, size * kp)))
    m = V.a_mm(H, [[cx + x0, cy + y0]])[0]
    return bool(v >= THRESHOLD), [round(float(m[0]), 2), round(float(m[1]), 2)], round(float(v), 3)


def search(body):
    marks = body.get("marks") or []
    if not marks or not all(isinstance(m, (list, tuple)) and len(m) == 2 for m in marks):
        raise ValueError(M("record_log_the_marks_are_missing"))
    marks = [[float(m[0]), float(m[1])] for m in marks]
    radius = max(5.0, min(200.0, float(body.get("radio") or 60)))
    size = max(2.0, min(50.0, float(body.get("size") or 5)))
    if CL.state().get("active"):
        raise ValueError(M("record_log_a_crosses_calibration_is_running"))
    if not _lock.acquire(blocking=False):
        raise ValueError(M("record_log_a_search_is_already_running"))
    try:
        # _still waits for "idle", which in a live job shows up between lines
        CL._free()
        img, pose, H = _photo()
        if pose is None:
            raise ValueError(M("record_log_could_not_read_the_machine_position"))
        start = (pose.get("x"), pose.get("y"))
        carriage = V.camera_in_carriage()
        h, w = img.shape[:2]
        kp = V.scale_px_by_mm(H, w, h) or 1.0
        res = [None] * len(marks)
        moved = False
        pending = list(range(len(marks)))
        try:
            while pending:
                # the ones that fit (with the radius) in the current photo
                here = [j for j in pending if _inside(H, w, h, marks[j], min(radius * kp, w / 3.0))]
                for j in here:
                    ok, xy, v = _search(img, H, marks[j], radius, size)
                    res[j] = {"x": xy[0] if xy else None, "y": xy[1] if xy else None, "found": ok, "score": v, "esperada": marks[j]}
                pending = [j for j in pending if j not in here]
                if not pending:
                    break
                # move the camera to center the next one
                j = pending[0]
                st = V.pose_machine()
                if st and st.get("state") not in ("idle", None):
                    raise ValueError(M("record_log_the_machine_is_not_still", state=st.get("state")))
                c = _center_mm(H, w, h)
                ny = pose["y"] + (marks[j][1] - c[1])
                nx = pose["x"] + (marks[j][0] - c[0]) if carriage else None
                lim = pose.get("lim") or {}
                ny = min(max(ny, lim.get("Y", [ny, ny])[0]), lim.get("Y", [ny, ny])[1])
                if nx is not None:
                    nx = min(max(nx, lim.get("X", [nx, nx])[0]), lim.get("X", [nx, nx])[1])
                if abs(ny - pose["y"]) < 1 and (nx is None or abs(nx - pose["x"]) < 1):
                    # already centered as much as possible and still outside (outside the travel or in
                    # X with the bridge)
                    res[j] = {"x": None, "y": None, "found": False, "score": 0.0, "esperada": marks[j], "error": M("record_log_outside_the_camera_view")}
                    pending.pop(0)
                    continue
                V.log("registro: centrando la camara en la marca", j + 1, "X%s Y%.1f" % ("--" if nx is None else "%.1f" % nx, ny))
                _move(nx, ny)
                moved = True
                img, pose, H = _photo()
                h, w = img.shape[:2]
                kp = V.scale_px_by_mm(H, w, h) or 1.0
                # if even so it does not fit, so that the next pass does not get stuck
                if not _inside(H, w, h, marks[j], min(radius * kp, w / 3.0)):
                    ok, xy, v = _search(img, H, marks[j], radius, size)
                    res[j] = {"x": xy[0] if xy else None, "y": xy[1] if xy else None, "found": ok, "score": v, "esperada": marks[j]}
                    pending.pop(0)
        finally:
            if moved:
                try:
                    _move(start[0] if carriage else None, start[1])
                except Exception as e:
                    V.log("registro: no se pudo volver:", e)
        return {"ok": True, "marks": res, "moved": moved, "encontradas": sum(1 for r in res if r and r["found"])}
    finally:
        CL.dsf_io.release_motion()  # the reservation taken by CL._libre() before each move
        _lock.release()
