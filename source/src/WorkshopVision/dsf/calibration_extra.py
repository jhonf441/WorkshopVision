"""Calibrations without laser or ArUco (2026-10-10, "is there no assistant to
calibrate the camera? there are few options by hand and with laser"):

  - A4 sheet (or Letter, or the size you say): it detects its 4 corners by itself
    (subpixel); the page asks for the pointer on 3 of them and computes the fourth.
    The final calculation goes through /calibrar mode "puntos".
  - Printed chessboard: it detects all the inner corners; with the
    pointer on 3 of the 4 extreme corners it is located on the bed and the
    homography comes from ALL the corners (many points, less error).
  - Lens: several photos of the board in different places -> lens
    distortion (barrel). It is saved as "lente" in sys/workshop/config/vision.json and from there
    all images come out corrected (it has to be recalibrated afterwards).
"""
import threading
import time

import cv2
import numpy as np

from messages import M

V = None  # the vision module (set by vision.py on import)

_lens = {"views": [], "size": None}
_lock = threading.Lock()


def _gray(img):
    return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img


def _sort(q):
    """4 corners in clockwise order starting from the top left one (in the image)."""
    q = np.asarray(q, np.float32).reshape(4, 2)
    c = q.mean(0)
    ang = np.arctan2(q[:, 1] - c[1], q[:, 0] - c[0])
    q = q[np.argsort(ang)]  # horario (y hacia abajo)
    i0 = int(np.argmin(q.sum(1)))
    return np.roll(q, -i0, axis=0)


# ---------------------------------------------------------------- hoja


def sheet_detect(body):
    fid, img, pose, H, notice = V.image_of(body)
    g = cv2.GaussianBlur(_gray(img), (5, 5), 0)
    h, w = g.shape
    _, b = cv2.threshold(g, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    b = cv2.morphologyEx(b, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cs, _ = cv2.findContours(b, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    for c in cs:
        a = cv2.contourArea(c)
        if a < 0.01 * w * h or a > 0.95 * w * h:
            continue
        ap = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(ap) != 4 or not cv2.isContourConvex(ap):
            continue
        # it must not touch the image edge (cut-off sheet)
        x, y, ww, hh = cv2.boundingRect(ap)
        if x <= 2 or y <= 2 or x + ww >= w - 2 or y + hh >= h - 2:
            continue
        if best is None or a > best[0]:
            best = (a, ap)
    if best is None:
        return {"ok": False, "photo": fid, "error": M("calibration_extra_no_whole_white_sheet_found")}
    q = _sort(best[1].reshape(4, 2))
    q = cv2.cornerSubPix(g, q.reshape(-1, 1, 2).copy(), (7, 7), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.01)).reshape(4, 2)
    return {"ok": True, "photo": fid, "size": [w, h], "corners": [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in q], "notice": notice}


# ---------------------------------------------------------------- tablero


def _board(img, cols, rows):
    """INNER corners of a board of cols x rows squares: (N, 2) in row order, or None."""
    g = _gray(img)
    pat = (int(cols) - 1, int(rows) - 1)
    ok, c = False, None
    if hasattr(cv2, "findChessboardCornersSB"):
        ok, c = cv2.findChessboardCornersSB(g, pat, cv2.CALIBRATION_CB_EXHAUSTIVE + cv2.CALIBRATION_CB_ACCURACY)
    if not ok:
        ok, c = cv2.findChessboardCorners(g, pat, cv2.CALIBRATION_CB_ADAPTIVE_THRESH + cv2.CALIBRATION_CB_NORMALIZE_IMAGE)
        if ok:
            c = cv2.cornerSubPix(g, c, (7, 7), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 40, 0.01))
    return c.reshape(-1, 2) if ok else None


def _dims(body):
    cols, rows = int(body.get("columns") or 10), int(body.get("rows") or 7)
    if not (3 <= cols <= 30 and 3 <= rows <= 30):
        raise ValueError(M("calibration_extra_the_board_must_have_between"))
    return cols, rows


def board_detect(body):
    cols, rows = _dims(body)
    fid, img, pose, H, notice = V.image_of(body)
    h, w = img.shape[:2]
    c = _board(img, cols, rows)
    if c is None:
        return {"ok": False, "photo": fid, "error": M("calibration_extra_board_not_found_it_must", cols=cols, rows=rows)}
    nc, nr = cols - 1, rows - 1
    ext = [c[0], c[nc - 1], c[nc * nr - 1], c[nc * (nr - 1)]]  # (0,0) (nc-1,0) (nc-1,nr-1) (0,nr-1)
    return {"ok": True, "photo": fid, "size": [w, h], "n": int(len(c)), "corners": [[round(float(p[0]), 2), round(float(p[1]), 2)] for p in ext],
            "points": [[round(float(p[0]), 1), round(float(p[1]), 1)] for p in c], "notice": notice}


def board_compute(body):
    """Homography with all the corners; refs = [{"k": 0..3, "x", "y"}] (3 or 4) = pointer on the extreme corners."""
    cols, rows = _dims(body)
    frame = float(body.get("frame") or 0)
    if not (2 <= frame <= 200):
        raise ValueError(M("calibration_extra_the_side_of_each_square"))
    refs = body.get("refs") or []
    if len(refs) < 3:
        raise ValueError(M("calibration_extra_3_corners_with_the_pointer"))
    fid, img, pose, _, _ = V.image_of(body)
    if pose is None or not V.still(pose):
        raise ValueError(M("calibration_extra_the_machine_must_be_still"))
    h, w = img.shape[:2]
    c = _board(img, cols, rows)
    if c is None:
        raise ValueError(M("calibration_extra_the_board_is_not_in_this_photo"))
    nc, nr = cols - 1, rows - 1
    grid = np.array([[i * frame, j * frame] for j in range(nr) for i in range(nc)], np.float64)
    ext_grid = np.array([[0, 0], [(nc - 1) * frame, 0], [(nc - 1) * frame, (nr - 1) * frame], [0, (nr - 1) * frame]], np.float64)
    src = np.array([ext_grid[int(r["k"])] for r in refs], np.float64)
    dst = np.array([[float(r["x"]), float(r["y"])] for r in refs], np.float64)
    # grid -> bed: similarity (rotation + scale + translation), with or without mirror:
    # the one that best explains the pointer's corners wins; what is left over is the
    # pointer error
    best = None
    for esp in (1.0, -1.0):
        s2 = src * np.array([1.0, esp])
        A, _ = cv2.estimateAffinePartial2D(s2.reshape(-1, 1, 2), dst.reshape(-1, 1, 2), method=cv2.LMEDS)
        if A is None:
            continue
        e = float(np.sqrt(np.mean(np.sum((s2 @ A[:, :2].T + A[:, 2] - dst) ** 2, axis=1))))
        if best is None or e < best[0]:
            best = (e, esp, A)
    if best is None:
        raise ValueError(M("calibration_extra_the_board_could_not_be_placed"))
    err_p, esp, A = best
    scale = float(np.sqrt(abs(np.linalg.det(A[:, :2]))))
    bed = (grid * np.array([1.0, esp])) @ A[:, :2].T + A[:, 2]
    Hm, _ = cv2.findHomography(c.astype(np.float64), bed, 0)
    res = np.linalg.norm(V.a_mm(Hm, c) - bed, axis=1)
    cal = {
        "H": [[float(x) for x in row] for row in Hm], "size": [w, h], "x": pose["x"], "y": pose["y"], "z": pose["z"],
        "source": "board", "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "error_mm": V.r2(float(np.sqrt(np.mean(res ** 2))), 3), "max_mm": V.r2(float(res.max()), 3),
        "px_per_mm": V.r2(V.scale_px_by_mm(Hm, w, h), 3), "used": int(len(c)),
    }
    return {"ok": True, "photo": fid, "calibration": cal, "scale_pointer": V.r2(scale, 4), "error_pointer_mm": V.r2(err_p, 2),
            "notice_pointer": None if abs(scale - 1) < 0.01 else M("calibration_extra_the_corners_you_gave_are", pct=(scale - 1) * 100)}


# ---------------------------------------------------------------- lente


def lens_state():
    with _lock:
        return {"ok": True, "views": len(_lens["views"]), "size": _lens["size"]}


def lens_add(body):
    """RAW photo (without the current lens correction) of the board; it adds a view."""
    cols, rows = _dims(body)
    fs = int(body.get("fs") or V.CFG.photo_cfg()["fs"])
    with V.LightPhoto():
        _, img = V.photo_high(fs)
    h, w = img.shape[:2]
    c = _board(img, cols, rows)
    if c is None:
        return dict(lens_state(), ok=False, error=M("calibration_extra_board_not_found_in_the_photo", cols=cols, rows=rows))
    with _lock:
        if _lens["size"] and _lens["size"] != [w, h]:
            _lens["views"] = []
        _lens["size"] = [w, h]
        _lens["views"].append((cols, rows, c.astype(np.float32)))
    return lens_state()


def lens_delete():
    with _lock:
        _lens["views"] = []
        _lens["size"] = None
    return lens_state()


def lens_compute(body):
    with _lock:
        views = list(_lens["views"])
        size = _lens["size"]
    if len(views) < 3:
        raise ValueError(M("calibration_extra_at_least_3_photos_of", n=len(views)))
    obj, imgp = [], []
    for cols, rows, c in views:
        nc, nr = cols - 1, rows - 1
        obj.append(np.array([[i, j, 0] for j in range(nr) for i in range(nc)], np.float32))
        imgp.append(c.reshape(-1, 1, 2))
    flags = cv2.CALIBRATION_FIX_K3 + cv2.CALIBRATION_ZERO_TANGENT_DIST
    rms, K, D, _, _ = cv2.calibrateCamera(obj, imgp, tuple(size), None, None, flags=flags)
    return {"ok": True, "lens": {"K": [float(x) for x in K.reshape(-1)], "dist": [float(x) for x in D.reshape(-1)], "size": size,
                                  "rms_px": V.r2(float(rms), 3), "views": len(views), "date": time.strftime("%Y-%m-%d %H:%M:%S")}}
