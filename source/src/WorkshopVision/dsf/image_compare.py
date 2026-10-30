"""
Before and after (2026-10-10, feature 4 of the Vision list: "compare a
photo before the cut with one afterwards and mark what was not cut all the way or
what moved").

  POST /antes     saves the image of NOW as "before" (with the machine
                  position and its calibration). It stays in memory until the
                  next one; the limit of saved photos does not delete it.
  POST /comparar  {umbral?, min_mm2?} compares "before" with the image of now:
                  it aligns them (corrects a small shift of the camera),
                  subtracts, and returns the zones that changed (in red over the
                  image of now) with their position and size in mm if there is
                  calibration.

The two photos have to be from the SAME camera position (without moving
Y/Z, or X if it is on the carriage): otherwise a notice is given and it compares anyway.

"""
import time

import cv2
import numpy as np

from messages import J, M

V = None  # the vision module (assigned by vision.py)

_before = {}


def before(body):
    fid, img, pose, H, notice = V.image_of(body or {})
    _before.clear()
    _before.update(img=img.copy(), pose=pose, H=H, ts=time.time(), photo=fid)
    return {"ok": True, "photo": fid, "ts": _before["ts"], "pose": pose, "notice": notice}


def state():
    if not _before:
        return {"has": False}
    return {"has": True, "ts": _before["ts"], "photo": _before["photo"], "pose": _before["pose"]}


def _align(ga, gb):
    """Warp (2x3) that takes b onto a, correcting a small shift/rotation."""
    esc = 400.0 / max(ga.shape[1], 1)
    a = cv2.resize(ga, None, fx=esc, fy=esc, interpolation=cv2.INTER_AREA).astype(np.float32)
    b = cv2.resize(gb, None, fx=esc, fy=esc, interpolation=cv2.INTER_AREA).astype(np.float32)
    w = np.eye(2, 3, dtype=np.float32)
    try:
        _, w = cv2.findTransformECC(a, b, w, cv2.MOTION_EUCLIDEAN, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 60, 1e-5), None, 5)
    except cv2.error:
        return None
    w[0, 2] /= esc
    w[1, 2] /= esc
    return w


def compare(body):
    if not _before:
        raise ValueError(M("image_compare_save_the_before_photo_first"))
    body = body or {}
    threshold_value = float(body.get("threshold") or 35)
    min_mm2 = float(body.get("min_mm2") or 4)
    fid_b, ib, pose_b, H, notice_b = V.image_of({})
    ia = _before["img"]
    if ia.shape != ib.shape:
        ib = cv2.resize(ib, (ia.shape[1], ia.shape[0]), interpolation=cv2.INTER_AREA)
    notices = []
    pa = _before.get("pose") or {}
    pb = pose_b or {}
    for k in ("x", "y", "z"):
        if pa.get(k) is not None and pb.get(k) is not None and abs(pa[k] - pb[k]) > 0.5:
            notices.append(M("image_compare_the_machine_is_not_at_the_same", axis=k.upper(), before=pa[k], now=pb[k]))
            break
    ga = cv2.GaussianBlur(cv2.cvtColor(ia, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    gb = cv2.GaussianBlur(cv2.cvtColor(ib, cv2.COLOR_BGR2GRAY), (5, 5), 0)
    w = _align(ga, gb)
    if w is not None:
        gb = cv2.warpAffine(gb, w, (ga.shape[1], ga.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
        ib = cv2.warpAffine(ib, w, (ia.shape[1], ia.shape[0]), flags=cv2.INTER_LINEAR + cv2.WARP_INVERSE_MAP, borderMode=cv2.BORDER_REPLICATE)
    else:
        notices.append(M("image_compare_the_two_photos_could_not_be_aligned"))
    # the light may change a little between photos: the mean brightness is equalized
    gb = cv2.convertScaleAbs(gb, alpha=1.0, beta=float(ga.mean() - gb.mean()))
    d = cv2.absdiff(ga, gb)
    _, m = cv2.threshold(d, threshold_value, 255, cv2.THRESH_BINARY)
    m = cv2.morphologyEx(m, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8))
    cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    h, wd = m.shape
    pxmm = V.scale_px_by_mm(H, wd, h) if H is not None else None
    min_px = min_mm2 * pxmm * pxmm if pxmm else 60
    out = ib.copy()
    layer = out.copy()
    regions = []
    for c in sorted(cnts, key=cv2.contourArea, reverse=True):
        a = cv2.contourArea(c)
        if a < min_px:
            continue
        cv2.drawContours(layer, [c], -1, (0, 0, 255), -1)
        cv2.drawContours(out, [c], -1, (0, 0, 255), 2)
        x, y, bw, bh = cv2.boundingRect(c)
        r = {"px": [V.r2(x + bw / 2, 1), V.r2(y + bh / 2, 1)], "area_px": int(a)}
        if H is not None:
            pts = V.a_mm(H, np.array([[x, y], [x + bw, y], [x + bw, y + bh], [x, y + bh]], dtype=np.float64))
            xs, ys = pts[:, 0], pts[:, 1]
            r["mm"] = {"c": [V.r2(xs.mean()), V.r2(ys.mean())], "w": V.r2(xs.max() - xs.min()), "h": V.r2(ys.max() - ys.min()), "area": V.r2(a / (pxmm * pxmm), 1)}
        regions.append(r)
        if len(regions) >= 40:
            break
    out = cv2.addWeighted(layer, 0.35, out, 0.65, 0)
    photo = V.save_photo(out, pose=pose_b, H=H, notice=J(notices, "; ") if notices else None, comparison=True)
    return {
        "ok": True,
        "photo": photo,
        "regions": regions,
        "change_pct": V.r2(100.0 * float(np.count_nonzero(m)) / m.size, 2),
        "notices": notices,
        "before_ts": _before["ts"],
        "alineada": w is not None,
    }
