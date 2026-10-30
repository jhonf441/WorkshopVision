#!/usr/bin/env python3
"""
workshop-vision -- computer vision (OpenCV) on the workshop camera.

HTTP service (port 8095) that takes the image from the Pi's camera relay
(camera_relay.py of WorkshopService, :8090/stream) and detects:

    piece      contour of the material: position, size, rotation, shape
    rect       rectangles (4-sided contours)
    circles    circles (Hough) with center and diameter
    holes      holes INSIDE a piece
    corners    point corners (subpixel)
    edges      long straight lines (edge of the material, with its angle)
    marks      printed ArUco markers (references / calibration)

Everything comes out in pixels and, if the camera is calibrated, in MACHINE mm
(coordinates where the POINTER lands, the same as the Zones map of WorkshopJog).

The calibration is an image -> bed homography (the bed is a plane). It lives
in 0:/sys/workshop/config/vision.json (written by DWC's Vision page through DSF's
file API; here it is only read, reloading if it changes). It is computed with
POST /calibrar from ArUco marks with a known position or from pairs of
points touched by hand. If there is no calibration of its own, the map's is used
(0:/sys/workshop/config/camera-map.json, 4 points).

The camera goes on the BRIDGE (it rises with Z; Y centers): each image is associated with the
machine position (Y, Z read from DSF) and the calibration corrects itself
for that position (see move_pose).

It talks to DSF through dsf-python (dsf_io.py): a subscription to the object
model and a CommandConnection for the G-code; no HTTP to DuetWebServer.

It does not move the machine nor send G-code: it only looks. The moves for the photo
are made by the page with sys/workshop/macros/visionpose.g (double tap).

API (all with CORS *):
    GET  /estado                       camera, calibration, version
    GET  /frame.jpg?vista=V&id=N       V = camara | bordes | umbral | arriba
                                       id = analyzed photo (from /detectar)
    POST /detectar  {tipos:[...], params:{...}, roi:[[u,v]...]|null}
    POST /calibrar  {modo:"aruco"|"puntos", foto?, pares?, altura?}  (computes, does not save)
    POST /foto      {fs?}           high-resolution measurement photo, at the current position
    POST /plan      {objetivo:[x0,y0,x1,y1], margin_mm?}  Y/Z for the best photo
    POST /mosaico   {fotos:[ids], area?}  joins photos from different Y
    GET  /marca.png?id=N&px=600        ArUco marker to print

"""
import http.cookies
import json
import math
import os
import threading
import time
import urllib.parse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import sys

import cv2
import numpy as np

import laser_calibration
import direct_camera
import dsf_io
import fire_watch
import image_compare
import calibration_extra
import messages
import net_guard
import vision_access
import record_log
from message_data import error_text
from messages import J, M

VERSION = "1.1.0"
PORT = int(os.environ.get("WORKSHOP_VISION_PORT", "8095"))
BIND = os.environ.get("WORKSHOP_VISION_BIND", "0.0.0.0")  # "127.0.0.1" keeps Vision on this Pi
SD = os.environ.get("WORKSHOP_VISION_SD", "/opt/dsf/sd")
CFG_FILE = os.path.join(SD, "sys", "workshop", "config", "vision.json")
MAP_FILE = os.path.join(SD, "sys", "workshop", "config", "camera-map.json")
DEFAULT_URL = "http://127.0.0.1:8090/stream"
IDLE_S = 30  # no requests for this time -> the stream is released
ARUCO_DICTS = {k: getattr(cv2.aruco, k) for k in dir(cv2.aruco) if k.startswith("DICT_")}

cv_lock = threading.Lock()  # one analysis at a time (the system has 4 cores, but the kiosk too)


def log(*a):
    print(time.strftime("%H:%M:%S"), *a, flush=True)


# ---------------------------------------------------------------- config

# framesize of the ESP32-camera firmware (new esp32-camera, measured on the
# workshop camera 2026-10-09). Since the firmware with PSRAM (6b16ba6) up to
# 2048x1536 works; 19 needs JPEG quality >= 12 (otherwise cam_hal: FB-OVF).
FS_SIZE = {6: (320, 240), 8: (400, 296), 9: (480, 320), 10: (640, 480), 11: (800, 600), 12: (1024, 768), 13: (1280, 720), 14: (1280, 1024), 15: (1600, 1200), 19: (2048, 1536)}
FS_QUALITY_MIN = {19: 12}  # minimum JPEG quality (higher number = more compressed) so that it fits in the buffer
FS_STARTUP = 6  # the example firmware starts at QVGA (320x240) after every restart
PHOTO_DEF = {
    "fs": 19,  # measurement photo: 2048x1536 (only while it is taken)
    "video_fs": 11,  # surveillance video: 800x600 (0 = do not touch)
    "zmin": 60.0,  # minimum Z to take photos (mm, machine coordinate)
    "edge": 0.04,  # fraction of the image edge that is not used when planning
    "overlap": 0.2,  # overlap between mosaic photos
    "light": 1,  # turn on the lighting strip (lighton.g) for the photo if it was off
    "light_zones": [],  # extra zones of the strip to turn on for the photo: "N" (main) or "T<id>:N" (additional strip)
    "light_wait": 1.5,  # s for the camera to adjust the exposure with the light
    # exposure of the measurement photo (2026-10-10):
    # auto = the camera's
    # compensar = auto with a fixed ae_level (-2 darker .. +2 lighter)
    # manual = no auto, exposure time aec_value (0..1200)
    # ajustar = auto, and if the photo comes out dark/burnt it corrects ae_level (up to 3 photos)
    "exposure": "auto",
    "ae_level": 0,
    "aec_value": 300,
    "brightness_obj": 115,  # mean brightness sought in ajustar mode (0..255)
}
EXPOSURES = ("auto", "compensate", "manual", "adjust")


def size_key(w, h):
    return "%dx%d" % (int(w), int(h))


def mat_T(dx, dy):
    return np.array([[1, 0, dx], [0, 1, dy], [0, 0, 1]], dtype=np.float64)


def mat_S(sx, sy):
    return np.array([[sx, 0, 0], [0, sy, 0], [0, 0, 1]], dtype=np.float64)


def camera_in_carriage():
    """The camera goes on the CARRIAGE (it follows X, Y and Z) instead of the bridge (Y and Z).
    sys/workshop/config/vision.json "camera_en": "carro" | "puente" (Vision page > Settings)."""
    return CFG.get().get("camera_en") == "carriage"


def move_pose(Hm, cal, pose, height):
    """Image -> bed homography for the machine at `pose` ({y, z}), from
    the calibration `cal` (taken at cal.y / cal.z).

    The camera goes on the BRIDGE: moving Y shifts what it sees by exactly dY mm
    (the machine coordinates are relative to the tool, which is on the
    same bridge). Raising the bridge (Z) moves it away from the bed: everything gets bigger
    around the NADIR N (the bed point right under the lens)
    by k = (z + h0) / (z_cal + h0), with h0 = height of the lens above the bed with
    Z = 0. N and h0 come from calibrating at two heights (calc_height)."""
    dy = float(pose["y"]) - float(cal["y"])
    # camera on the carriage (2026-10-10): X shifts the image just like Y. Without X in
    # the pose (projections to a hypothetical Y/Z) the calibration's X is assumed.
    carriage = camera_in_carriage()
    dx = float(pose["x"]) - float(cal["x"]) if carriage and pose.get("x") is not None and cal.get("x") is not None else 0.0
    dz = float(pose["z"]) - float(cal["z"])
    if abs(dz) < 0.05:
        k, N = 1.0, np.zeros(2)
    else:
        if not height:
            return None, M("vision_the_z_is_not_the_calibration_one", z=pose["z"], zcal=cal["z"])
        h0 = float(height["h0"])
        if cal["z"] + h0 <= 0 or pose["z"] + h0 <= 0:
            return None, M("vision_invalid_lens_height", h0=h0)
        k = (float(pose["z"]) + h0) / (float(cal["z"]) + h0)
        nx = height["N_rel"][0] + (float(cal["x"]) if height.get("rel_x") and cal.get("x") is not None else 0.0)
        N = np.array([nx, height["N_rel"][1] + float(cal["y"])], dtype=np.float64)
    S = mat_T(N[0] + dx, N[1] + dy) @ mat_S(k, k) @ mat_T(-N[0], -N[1])
    return S @ Hm, None


def calc_height(cal1, H2, pose2, w, h):
    """From two calibrations at different Z (same resolution) it gets h0 and the nadir."""
    dz = float(pose2["z"]) - float(cal1["z"])
    if abs(dz) < 20:
        raise ValueError(M("vision_to_calibrate_the_height_the_two_photos", dz=dz))
    g = np.array([[x, y] for x in np.linspace(0.1 * w, 0.9 * w, 7) for y in np.linspace(0.1 * h, 0.9 * h, 7)])
    carriage = camera_in_carriage() and cal1.get("x") is not None and pose2.get("x") is not None
    dx = float(pose2["x"]) - float(cal1["x"]) if carriage else 0.0
    b1 = a_mm(cal1["Hm"], g) + np.array([dx, float(pose2["y"]) - float(cal1["y"])])  # taken to the X/Y of the 2nd
    b2 = a_mm(H2, g)
    # b2 = k*b1 + c   (c = (1-k)*N)
    A = np.zeros((2 * len(g), 3))
    A[0::2, 0], A[0::2, 1] = b1[:, 0], 1
    A[1::2, 0], A[1::2, 2] = b1[:, 1], 1
    sol, *_ = np.linalg.lstsq(A, b2.reshape(-1), rcond=None)
    k, cx, cy = sol
    if abs(k - 1) < 1e-4:
        raise ValueError(M("vision_the_scale_did_not_change"))
    N = np.array([cx, cy]) / (1 - k)
    z1, z2 = float(cal1["z"]), float(pose2["z"])
    h0 = (z2 - k * z1) / (k - 1)
    res = np.linalg.norm((A @ sol).reshape(-1, 2) - b2, axis=1)
    if z1 + h0 <= 0 or z2 + h0 <= 0:
        raise ValueError(M("vision_impossible_lens_height", h0=h0))
    return {
        "h0": round(float(h0), 3),
        "N_rel": [round(float(N[0] - (float(pose2["x"]) if carriage else 0.0)), 3), round(float(N[1] - float(pose2["y"])), 3)],
        "rel_x": bool(carriage),  # N_rel[0] relative to the calibration's X (camera on the carriage)
        "lens_mm": [round(float(z1 + h0), 1), round(float(z2 + h0), 1)],
        "rms_mm": round(float(np.sqrt(np.mean(res ** 2))), 3),
        "zs": [z1, z2],
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
    }


class Config:
    """sys/workshop/config/vision.json, reloaded when its mtime changes.

    calibs: {"WxH": {H, size, y, z, fuente, fecha, error_mm, px_per_mm}}
    -- one per resolution (5:4 and 4:3 crop the sensor differently).
    altura: {h0, N_rel} -- for photos at a Z other than the calibration's."""

    def __init__(self):
        self.data = {}
        self.mtimes = (None, None)
        self.calibs = {}
        self.height = None
        self.mapping = None

    def get(self):
        try:
            m1 = os.path.getmtime(CFG_FILE)
        except OSError:
            m1 = None
        try:
            m2 = os.path.getmtime(MAP_FILE)
        except OSError:
            m2 = None
        if (m1, m2) != self.mtimes:
            self.mtimes = (m1, m2)
            self._load()
        return self.data

    def _load(self):
        data = {}
        try:
            with open(CFG_FILE, encoding="utf-8-sig") as f:
                data = json.load(f)
        except FileNotFoundError:
            pass
        except Exception as e:  # archivo a medio escribir, JSON roto...
            log("config ilegible:", e)
            self.mtimes = (None, self.mtimes[1])  # retry the next time
        self.data = data if isinstance(data, dict) else {}
        self.calibs = {}
        cs = dict(self.data.get("calibs") or {})
        for k, c in cs.items():
            try:
                self.calibs[k] = dict(c, Hm=np.array(c["H"], dtype=np.float64).reshape(3, 3))
            except Exception as e:
                log("calibracion invalida", k, e)
        a = self.data.get("height")
        self.height = a if isinstance(a, dict) and a.get("h0") is not None and a.get("N_rel") else None
        self.mapping = None
        self._load_map()
        log("config cargada; calibraciones:", list(self.calibs) or ("la del mapa" if self.mapping is not None else "none"), "height:", bool(self.height))

    def _load_map(self):
        """4-point calibration of the map's camera (normalized coords, fixed)."""
        try:
            with open(MAP_FILE, encoding="utf-8-sig") as f:
                m = json.load(f)
            c = m.get("calibration")
            if not c or len(c.get("img", [])) != 4 or len(c.get("map", [])) != 4:
                return
            src = np.array(c["img"], dtype=np.float32)
            dst = np.array(c["map"], dtype=np.float32)
            self.mapping = cv2.getPerspectiveTransform(src, dst).astype(np.float64)
        except FileNotFoundError:
            pass
        except Exception as e:
            log("calib del mapa ilegible:", e)

    def photo_cfg(self):
        f = dict(PHOTO_DEF)
        for k, v in (self.get().get("photo") or {}).items():
            if k in PHOTO_DEF:
                try:
                    f[k] = [str(x) for x in v] if isinstance(PHOTO_DEF[k], list) else type(PHOTO_DEF[k])(v)
                except (TypeError, ValueError):
                    pass
        if f["exposure"] not in EXPOSURES:
            f["exposure"] = "auto"
        f["ae_level"] = max(-2, min(2, f["ae_level"]))
        f["aec_value"] = max(0, min(1200, f["aec_value"]))
        return f

    def calibration_for(self, w, h):
        """(calibration for w x h, reason if there is none)."""
        self.get()
        c = self.calibs.get(size_key(w, h))
        if c:
            return c, None
        for c in self.calibs.values():  # same aspect ratio: it is scaled
            cw, ch = c["size"]
            if abs(cw / float(ch) - w / float(h)) < 0.01:
                return dict(c, Hm=c["Hm"] @ mat_S(cw / float(w), ch / float(h)), size=[w, h], escalada=True), None
        if self.calibs:
            return None, M("vision_no_calibration_for_size", w=w, h=h, sizes=", ".join(self.calibs))
        return None, M("vision_not_calibrated")

    def H_for(self, w, h, pose=None):
        """(H image -> machine mm, notice) for a w x h image taken with the
        machine at `pose`."""
        c, reason = self.calibration_for(w, h)
        if c is None:
            if self.mapping is not None:
                return self.mapping @ mat_S(1.0 / w, 1.0 / h), M("vision_uses_the_map_calibration")
            return None, reason
        if c.get("y") is None or c.get("z") is None:
            return c["Hm"], M("vision_calibration_without_machine_position")
        if camera_in_carriage() and c.get("x") is None:
            return c["Hm"], M("vision_the_camera_is_on_the_carriage_but")
        if pose is None:
            return c["Hm"], M("vision_could_not_read_the_machine_position_assumed")
        return move_pose(c["Hm"], c, pose, self.height)

    def nadir(self, w, h, pose):
        """((x, y) of the bed point right under the lens, height of the
        lens above the bed in mm) for the machine at `pose`, or None if the
        two-height calibration is missing."""
        c, _ = self.calibration_for(w, h)
        a = self.height
        if not c or not a or not pose or c.get("y") is None or c.get("z") is None or pose.get("y") is None or pose.get("z") is None:
            return None
        carriage = camera_in_carriage()
        dx = float(pose["x"]) - float(c["x"]) if carriage and pose.get("x") is not None and c.get("x") is not None else 0.0
        nx = a["N_rel"][0] + (float(c["x"]) if a.get("rel_x") and c.get("x") is not None else 0.0) + dx
        ny = a["N_rel"][1] + float(c["y"]) + float(pose["y"]) - float(c["y"])
        return (nx, ny), float(pose["z"]) + float(a["h0"])

    def source(self):
        self.get()
        if self.calibs:
            return "own"
        return "map" if self.mapping is not None else None


CFG = Config()


def pose_machine():
    """Machine position and state according to DSF (None if it does not answer). It comes
    from the subscribed model (dsf_io), not from GET /machine/status."""
    try:
        d = dsf_io.read_in()
        ax = {a["letter"]: a for a in d["move"]["axes"]}
        return {
            "x": r2(ax["X"]["machinePosition"], 3),
            "y": r2(ax["Y"]["machinePosition"], 3),
            "z": r2(ax["Z"]["machinePosition"], 3),
            "homed": bool(ax["Y"]["homed"] and ax["Z"]["homed"] and (ax["X"]["homed"] or not camera_in_carriage())),
            "state": d["state"]["status"],
            "lim": {k: [ax[k]["min"], ax[k]["max"]] for k in ("X", "Y", "Z")},
        }
    except Exception as e:
        log("no se pudo leer la posicion de la maquina:", e)
        return None


def dsf_code(c, timeout=15):
    """G-code through DSF's CommandConnection (SBC channel, see dsf_io). What
    is asked of WorkshopService goes through its API (dsf_io.service)."""
    return dsf_io.commands("general").code(c, timeout)


def light_on():
    """None if unknown; otherwise, whether the work light is on."""
    try:
        c = dsf_io.value_global(dsf_io.read_in(), "lightZoneColor")
        return None if c is None else any(v for v in c)
    except Exception:
        return None


def lights_state():
    """Lights config (WorkshopService: lights.get API), or None."""
    try:
        t = dsf_io.service("lights.get").strip()
        return json.loads(t[t.index("{"):]).get("config")
    except Exception as e:
        log("luces: no se pudo leer el estado:", e)
        return None


def _zone_ref(ref):
    """'3' -> (None, 3); 'Tt1:0' -> ('t1', 0)."""
    ref = str(ref)
    if ref.startswith("T") and ":" in ref:
        t, n = ref[1:].split(":", 1)
        return t, int(n)
    return None, int(ref)


_light_pending = {"light": None, "timer": None}  # lights that a mosaic photo left on
_light_lock = threading.Lock()


class LightPhoto:
    """Turns on for the photo the work light and the chosen extra zones (only
    those that were off) and on exit turns off only what it turned on.
    follow=True (photos of a mosaic except the last one): it does not turn off; the next
    photo adopts them, and if none arrives within 30 s they turn off by themselves."""

    def __init__(self, fc=None, follow=False):
        self.fc = fc or CFG.photo_cfg()
        self.follow = follow
        self.job = False
        self.zones = []

    def __enter__(self):
        fc = self.fc
        with _light_lock:
            prev = _light_pending["light"]
            if _light_pending["timer"]:
                _light_pending["timer"].cancel()
            _light_pending.update(light=None, timer=None)
        if prev is not None:
            self.job, self.zones = prev.job, list(prev.zones)
        if fc["light"] and light_on() is False:
            try:
                dsf_code('M98 P"0:/macros/light/lighton.g"')
                self.job = True
            except Exception as e:
                log("no se pudo prender la luz:", e)
        if fc["light_zones"]:
            cfg = lights_state() or {}
            for ref in fc["light_zones"]:
                try:
                    t, n = _zone_ref(ref)
                    zs = cfg.get("zones_extra") or []
                    if t is not None:
                        zs = next((x.get("zones") or [] for x in cfg.get("strips_extra") or [] if x.get("id") == t), [])
                    if n >= len(zs) or zs[n].get("on"):
                        continue
                    dsf_io.service("lights.zone", dict({"index": n, "on": True}, **({"strip": t} if t else {})))
                    self.zones.append((t, n))
                except Exception as e:
                    log("no se pudo prender la zona %s:" % ref, e)
        if self.job or self.zones:
            time.sleep(max(0.0, float(fc["light_wait"])))
        return self

    def __exit__(self, *a):
        if self.follow and (self.job or self.zones):
            with _light_lock:
                t = threading.Timer(30.0, self._power_off_pending)
                t.daemon = True
                _light_pending.update(light=self, timer=t)
                t.start()
            return False
        self.power_off()
        return False

    def _power_off_pending(self):
        with _light_lock:
            if _light_pending["light"] is not self:
                return
            _light_pending.update(light=None, timer=None)
        self.power_off()

    def power_off(self):
        if self.job:
            try:
                dsf_code('M98 P"0:/macros/light/lightoff.g"')
            except Exception as e:
                log("no se pudo apagar la luz:", e)
        for t, n in self.zones:
            try:
                dsf_io.service("lights.zone", dict({"index": n, "on": False}, **({"strip": t} if t else {})))
            except Exception as e:
                log("no se pudo apagar la zona:", e)


def still(p):
    return p is not None and p.get("state") in ("idle", "off", "halted")


# ---------------------------------------------------------------- camara


class Camera:
    """Reads the relay's MJPEG only while someone asks for images."""

    def __init__(self):
        self.jpeg = None
        self.ts = 0.0
        self.err = M("vision_no_image_yet")
        self.demand = 0.0
        self.cond = threading.Condition()
        self.frames = 0
        self.fps = 0.0
        self._dec = (None, None)  # (ts, imagen BGR)
        # "relay" = video from the relay of the Pi (normal); "directa" = snapshots straight from the
        # ESP32-camera while the relay is down (direct_camera.py)
        self.mode = "relay"
        self.direct = None  # MJPEG URL of the ESP32 in direct mode
        self.t_probe = 0.0
        self.dfallos = 0
        threading.Thread(target=self._loop, daemon=True).start()

    def url(self):
        return str(CFG.get().get("url") or DEFAULT_URL)

    def _relay_live(self):
        """True if the relay of the Pi answers (a tiny JSON, not the stream)."""
        u = urllib.parse.urlparse(self.url())
        try:
            with urllib.request.urlopen("%s://%s:%d/state" % (u.scheme, u.hostname, u.port or 80), timeout=2) as r:
                r.read(256)
            return True
        except Exception:
            return False

    def _pass_a_direct(self):
        """The relay does not answer: use the ESP32-camera of this camera directly (if it is known)."""
        if self._relay_live():
            return False  # the relay is there: the camera itself is not sending, going direct would not help
        direct = direct_camera.direct_of(self.url(), SD)
        if not direct:
            return False
        self.mode, self.direct, self.dfallos = "direct", direct, 0
        self.t_probe = time.time() + direct_camera.RELAY_PROBE_S
        self.err = ""
        log("camara: the relay does not answer, reading the ESP32-camera directly at %.0f snapshots/s (%s)" % (direct_camera.FALLBACK_FPS, direct))
        return True

    def _cycle_direct(self):
        """One step of the direct mode: look at the relay now and then, else one snapshot paced to FALLBACK_FPS."""
        t0 = time.time()
        if t0 >= self.t_probe:
            self.t_probe = t0 + direct_camera.RELAY_PROBE_S
            if self._relay_live():
                self.mode, self.direct = "relay", None
                log("camara: the relay is back, the video comes from it again")
                return
        try:
            with urllib.request.urlopen(direct_camera.capture_of(self.direct), timeout=5) as r:
                jpg = r.read()
            if not jpg.startswith(b"\xff\xd8"):
                raise IOError("it is not a JPEG")
            with self.cond:
                self.jpeg, self.ts, self.err = jpg, time.time(), ""
                self.frames += 1
                self.cond.notify_all()
            self.dfallos = 0
            self.fps = 1.0 / max(0.05, time.time() - t0 + direct_camera.pause_between_frames(t0, time.time()))
        except Exception as e:
            self.err = M("vision_direct_camera_error", error=error_text(e))
            self.dfallos += 1
            time.sleep(direct_camera.wait_failure(self.dfallos))
            return
        time.sleep(direct_camera.pause_between_frames(t0, time.time()))

    def _loop(self):
        failures = 0
        while True:
            if time.time() - self.demand > IDLE_S:
                time.sleep(0.3)
                continue
            if self.mode == "direct":
                self._cycle_direct()
                continue
            try:
                self._read_stream(self.url())
                failures = 0
            except Exception as e:
                self.err = M("vision_camera_error", error=error_text(e))
                failures += 1
                if failures >= direct_camera.RELAY_FAULTS and self._pass_a_direct():
                    failures = 0
                else:
                    time.sleep(2)

    def _read_stream(self, url):
        resp = urllib.request.urlopen(url, timeout=8)
        buf = b""
        t0, n0 = time.time(), 0
        try:
            while time.time() - self.demand <= IDLE_S:
                chunk = resp.read(16384)
                if not chunk:
                    raise IOError(M("vision_the_stream_was_cut"))
                buf += chunk
                while True:
                    a = buf.find(b"\xff\xd8")
                    if a < 0:
                        buf = buf[-1:]
                        break
                    b = buf.find(b"\xff\xd9", a + 2)
                    if b < 0:
                        buf = buf[a:]
                        if len(buf) > 4_000_000:
                            buf = b""
                        break
                    jpg = buf[a : b + 2]
                    buf = buf[b + 2 :]
                    with self.cond:
                        self.jpeg, self.ts, self.err = jpg, time.time(), ""
                        self.frames += 1
                        self.cond.notify_all()
                    n0 += 1
                    if time.time() - t0 >= 2:
                        self.fps = n0 / (time.time() - t0)
                        t0, n0 = time.time(), 0
        finally:
            resp.close()

    def photo(self, fresh=True, timeout=6.0):
        """(ts, jpeg) of the last frame; with fresh it waits for one later than the request."""
        request_item = time.time()
        self.demand = request_item
        with self.cond:
            end = request_item + timeout
            while True:
                if self.jpeg is not None and (not fresh or self.ts >= request_item - 0.05):
                    return self.ts, self.jpeg
                if self.jpeg is not None and not fresh:
                    return self.ts, self.jpeg
                rest = end - time.time()
                if rest <= 0:
                    if self.jpeg is not None and time.time() - self.ts < 10:
                        return self.ts, self.jpeg  # a bit old, but it serves
                    raise IOError(self.err or M("vision_the_camera_sends_no_image"))
                self.cond.wait(rest)

    def image(self, fresh=True):
        ts, jpg = self.photo(fresh)
        if self._dec[0] == ts:
            return ts, jpg, self._dec[1]
        img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            raise IOError(M("vision_unreadable_jpeg_frame"))
        img = fix_lens(img)
        self._dec = (ts, img)
        return ts, jpg, img


CAMERA = Camera()

# Analyzed / taken photos (so that the page shows EXACTLY the
# image over which the detections are drawn, and for the mosaic): each one
# with the machine position and its homography to mm.
photos = {}
photos_lock = threading.Lock()
PHOTOS_MAX = 16


def save_photo(img, pose=None, H=None, notice=None, **extra):
    fid = str(int(time.time() * 1000))
    with photos_lock:
        while fid in photos:
            fid = str(int(fid) + 1)
        photos[fid] = dict(extra, img=img, pose=pose, H=H, notice=notice, ts=time.time())
        for k in sorted(photos)[:-PHOTOS_MAX]:
            del photos[k]
    return fid


def photo_get(fid):
    with photos_lock:
        f = photos.get(str(fid))
    if f is None:
        raise KeyError(M("vision_the_photo_is_gone", photo=fid, n=PHOTOS_MAX))
    return f


# ---- camera control (framesize) ----

photo_lock = threading.Lock()
_camera_st = {"st": None, "ts": 0.0}


def ctrl_base():
    """(http base, is_relay). With the Pi's relay (:8090) its /control and /status proxy
    and its /snapshot are used; with the ESP32 directly (:81/stream), the
    control server on port 80 and /capture."""
    if CAMERA.mode == "direct" and CAMERA.direct:
        return direct_camera.base_of(CAMERA.direct), False
    u = urllib.parse.urlparse(CAMERA.url())
    if u.port == 81:
        return "%s://%s" % (u.scheme, u.hostname), False
    return "%s://%s:%d" % (u.scheme, u.hostname, u.port or 80), True


def camera_status(max_age=0.0):
    if max_age and _camera_st["st"] is not None and time.time() - _camera_st["ts"] < max_age:
        return _camera_st["st"]
    base, _ = ctrl_base()
    with urllib.request.urlopen(base + "/status", timeout=4) as r:
        st = json.load(r)
    _camera_st.update(st=st, ts=time.time())
    return st


def camera_set(var, val):
    base, _ = ctrl_base()
    with urllib.request.urlopen(base + "/control?var=%s&val=%s" % (var, val), timeout=5) as r:
        r.read()
    if _camera_st["st"] is not None:
        _camera_st["st"][var] = val


def brightness(img):
    """(mean brightness 0..255 of the center, burnt fraction) of a BGR image."""
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    h, w = g.shape
    c = g[h // 10: h - h // 10, w // 10: w - w // 10]
    return float(c.mean()), float((c >= 250).mean())


LAST_EXPOSURE = {}


def photo_high(fs):
    """Photo at the resolution `fs` with the config's exposure (see PHOTO_DEF).
    It leaves in LAST_EXPOSURE what was used and how it came out."""
    fc = CFG.photo_cfg()
    mode = fc["exposure"]
    st = {}
    try:
        st = camera_status(max_age=2.0)
    except Exception as e:
        log("exposicion: sin /status de la camara:", e)
    before = {k: st.get(k) for k in ("aec", "aec_value", "ae_level")}
    placed = {}

    def put(var, val):
        if st.get(var) != val:
            camera_set(var, val)
            placed[var] = True

    info = {"mode": mode}
    try:
        if mode == "manual":
            put("aec", 0)
            put("aec_value", int(fc["aec_value"]))
            info["aec_value"] = int(fc["aec_value"])
        elif mode in ("compensate", "adjust"):
            put("aec", 1)
            put("ae_level", int(fc["ae_level"]))
            info["ae_level"] = int(fc["ae_level"])
        if placed:
            time.sleep(0.6)  # so that the sensor takes the change
        jpg, img = _photo_high_raw(fs)
        b, q = brightness(img)
        if mode == "adjust":
            obj = float(fc["brightness_obj"])
            level = int(fc["ae_level"])
            for _ in range(2):
                step = -1 if (q > 0.02 or b > obj + 30) else 1 if b < obj - 30 else 0
                if not step or not (-2 <= level + step <= 2):
                    break
                level += step
                camera_set("ae_level", level)
                placed["ae_level"] = True
                time.sleep(0.8)
                jpg, img = _photo_high_raw(fs)
                b, q = brightness(img)
            info["ae_level"] = level
        info.update(brightness=round(b, 1), quemado=round(q, 4))
        if q > 0.05:
            info["notice"] = M("vision_the_photo_has_burnt_zones", pct=q * 100)
        elif b < 50:
            info["notice"] = M("vision_the_photo_came_out_dark", brightness=b)
        LAST_EXPOSURE.clear()
        LAST_EXPOSURE.update(info)
        return jpg, img
    finally:
        # the camera goes back to how it was (the surveillance video stays on auto)
        for var in ("aec_value", "ae_level", "aec"):
            if placed.get(var) and before.get(var) is not None:
                try:
                    camera_set(var, before[var])
                except Exception as e:
                    log("exposicion: no se pudo volver %s:" % var, e)
        if mode == "manual" and placed.get("aec") and before.get("aec") is None:
            try:
                camera_set("aec", 1)
            except Exception:
                pass


def _photo_high_raw(fs):
    """Takes ONE photo at the resolution `fs` and leaves the camera as it was.

    With the current ESP32 (firmware without PSRAM, 2026-10-09) what is reliable is
    up to SVGA (800x600): above that the stream delivers no frames and /capture
    only works sometimes (small JPEG and nobody watching the video). That is why: first
    it is taken from the STREAM (it works even if someone is watching) and if it does not arrive,
    /capture (or the relay's /snapshot) is tried."""
    want = FS_SIZE.get(fs)
    base, relay = ctrl_base()
    with photo_lock:
        st = camera_status()
        prev, prev_q = st.get("framesize"), st.get("quality")
        qmin = FS_QUALITY_MIN.get(fs)
        q_high = qmin if qmin and (prev_q or 0) < qmin else None  # smaller JPEG: it fits in the buffer
        try:
            if prev != fs:
                if q_high:
                    camera_set("quality", q_high)
                camera_set("framesize", fs)
                time.sleep(0.8)
            # 1) from the stream: the 2nd frame of the requested size (the 1st may have the exposure
            # wrong)
            end = time.time() + 7
            seen, last_one = 0, 0.0
            while time.time() < end:
                try:
                    ts, jpg = CAMERA.photo(fresh=True, timeout=max(0.5, end - time.time()))
                except IOError:
                    break
                if ts == last_one:
                    continue
                last_one = ts
                img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
                if img is None or (want and (img.shape[1], img.shape[0]) != want):
                    continue
                seen += 1
                if seen >= 2 or prev == fs:
                    return jpg, img
            # 2) foto suelta
            last = 0.0
            for _ in range(3):
                if relay:  # the relay keeps /snapshot for 2 s: ask for a new one
                    t = 2.15 - (time.time() - last)
                    if t > 0:
                        time.sleep(t)
                try:
                    with urllib.request.urlopen(base + ("/snapshot" if relay else "/capture"), timeout=12) as r:
                        jpg = r.read()
                except Exception:
                    jpg = b""
                last = time.time()
                img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR) if jpg else None
                if img is not None and (not want or (img.shape[1], img.shape[0]) == want):
                    return jpg, img
            note = psram_notice(st)
            if note:
                raise IOError(M("vision_the_camera_did_not_deliver_a_photo_note", w=want[0], h=want[1], note=note))
            raise IOError(M("vision_the_camera_did_not_deliver_a_photo", w=want[0], h=want[1]))
        finally:
            turn = prev
            vf = CFG.photo_cfg()["video_fs"]
            if prev == FS_STARTUP and vf > 0:
                turn = vf
            try:
                if turn is not None and turn != fs:
                    camera_set("framesize", turn)
                if q_high and prev_q is not None:
                    camera_set("quality", prev_q)
            except Exception as e:
                log("no se pudo volver la camara a como estaba:", e)


def psram_notice(st):
    """With the new firmware /status carries psram_free: ~2.9 MB = buffers in
    PSRAM (good); ~4.1 MB = they did not end up there (it happens sometimes at startup)
    and the big photos fail -> restart the camera. The problem as a message, or None."""
    free = (st or {}).get("psram_free")
    if free and free > 3_800_000:
        return M("vision_the_camera_buffers_are_not_in_psram")
    if st and "psram" in st and not st.get("psram"):
        return M("vision_the_camera_has_no_psram")
    return None


def watch_video():
    """The ESP32 goes back to 320x240 every time it restarts (example firmware).
    If it finds it like that, it raises it to the chosen video resolution
    (foto.video_fs; 0 = do not touch)."""
    while True:
        time.sleep(20)
        try:
            vf = CFG.photo_cfg()["video_fs"]
            if vf <= 0 or vf == FS_STARTUP or photo_lock.locked():
                continue
            if camera_status().get("framesize") == FS_STARTUP:
                camera_set("framesize", vf)
                log("camara en 320x240 (recien reiniciada): se sube a %dx%d" % FS_SIZE.get(vf, (0, 0)))
        except Exception:
            pass  # camera off / relay stopped: it is retried


# ---------------------------------------------------------------- geometria

_lens = {"key": None, "maps": None}


def fix_lens(img):
    """Lens distortion (barrel), if there is K/dist in the config."""
    L = CFG.get().get("lens")
    if not (isinstance(L, dict) and L.get("K") and L.get("dist")):
        return img
    h, w = img.shape[:2]
    key = (json.dumps(L, sort_keys=True), w, h)
    if _lens["key"] != key:
        K = np.array(L["K"], dtype=np.float64).reshape(3, 3)
        if L.get("size"):
            K = K.copy()
            K[0] *= w / float(L["size"][0])
            K[1] *= h / float(L["size"][1])
        D = np.array(L["dist"], dtype=np.float64)
        _lens["maps"] = cv2.initUndistortRectifyMap(K, D, None, K, (w, h), cv2.CV_16SC2)
        _lens["key"] = key
    m1, m2 = _lens["maps"]
    return cv2.remap(img, m1, m2, cv2.INTER_LINEAR)


def a_mm(H, pts):
    if H is None:
        return None
    p = np.asarray(pts, dtype=np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(p, H).reshape(-1, 2)


def a_px(H, pts):
    p = np.asarray(pts, dtype=np.float64).reshape(-1, 1, 2)
    return cv2.perspectiveTransform(p, np.linalg.inv(H)).reshape(-1, 2)


def scale_px_by_mm(H, w, h):
    """px per mm near the center of the image (to convert sizes in mm to px)."""
    if H is None:
        return None
    c = np.array([[w / 2.0, h / 2.0], [w / 2.0 + 10, h / 2.0], [w / 2.0, h / 2.0 + 10]])
    m = a_mm(H, c)
    d = (np.linalg.norm(m[1] - m[0]) + np.linalg.norm(m[2] - m[0])) / 2.0
    return 10.0 / d if d > 1e-9 else None


def r2(v, n=2):
    return None if v is None else round(float(v), n)


def lp(arr, n=2):
    return [[round(float(x), n), round(float(y), n)] for x, y in np.asarray(arr).reshape(-1, 2)]


def fit_circle(pts):
    """Least-squares circle (Kasa). Returns (cx, cy, r, rms)."""
    p = np.asarray(pts, dtype=np.float64).reshape(-1, 2)
    if len(p) < 3:
        return None
    x, y = p[:, 0], p[:, 1]
    A = np.column_stack([x, y, np.ones_like(x)])
    b = x * x + y * y
    try:
        sol, *_ = np.linalg.lstsq(A, b, rcond=None)
    except np.linalg.LinAlgError:
        return None
    cx, cy = sol[0] / 2.0, sol[1] / 2.0
    r = math.sqrt(max(sol[2] + cx * cx + cy * cy, 0.0))
    rms = float(np.sqrt(np.mean((np.hypot(x - cx, y - cy) - r) ** 2)))
    return cx, cy, r, rms


def angle_norm(a):
    """Angle of an edge in (-90, 90]."""
    a = (a + 180.0) % 180.0
    return a - 180.0 if a > 90.0 else a


def rect_mm(cnt_mm):
    """minAreaRect in mm: center, length >= width, angle of the long side."""
    (cx, cy), (w, h), ang = cv2.minAreaRect(cnt_mm.astype(np.float32))
    if w < h:
        w, h = h, w
        ang += 90.0
    box = cv2.boxPoints(((cx, cy), (w, h), ang))
    return cx, cy, w, h, angle_norm(ang), box


# ---------------------------------------------------------------- detectores

DEF = {
    "blur": 5,
    "method": "auto",  # auto | claro | oscuro | bordes | adaptativo
    "threshold": 0,  # 0 = Otsu
    "canny1": 50,
    "canny2": 150,
    "min_mm2": 400.0,  # minimum area of a piece
    "min_px2": 600.0,  # same without calibration
    "max_pieces": 5,
    "min_hole_mm2": 3.0,
    "circle_min_mm": 3.0,
    "circle_max_mm": 200.0,
    "circ_sens": 0.85,  # HOUGH_GRADIENT_ALT: 0.7 (muchos) .. 0.95 (solo perfectos)
    "corner_max": 40,
    "corner_quality": 0.05,
    "corner_dist_mm": 5.0,
    "lin_min_mm": 30.0,
    "lin_threshold": 60,
    "lin_gap_mm": 3.0,
    "lin_max": 20,
}


def params(p):
    out = dict(DEF)
    for k, v in (p or {}).items():
        if k in DEF:
            try:
                out[k] = type(DEF[k])(v)
            except (TypeError, ValueError):
                pass
    if out["blur"] % 2 == 0:
        out["blur"] += 1
    return out


def gray(img, P):
    g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    if P["blur"] > 1:
        g = cv2.GaussianBlur(g, (P["blur"], P["blur"]), 0)
    return g


def mask_roi(shape, roi):
    if roi is None or len(roi) < 3:
        return None
    m = np.zeros(shape[:2], np.uint8)
    cv2.fillPoly(m, [np.asarray(roi, dtype=np.int32).reshape(-1, 1, 2)], 255)
    return m


def binary(g, P, mask):
    """Black/white image where the PIECE is white."""
    met = P["method"]
    if met == "edges":
        e = cv2.Canny(g, P["canny1"], P["canny2"])
        k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        b = cv2.morphologyEx(cv2.dilate(e, k), cv2.MORPH_CLOSE, k, iterations=2)
    elif met == "adaptive":
        b = cv2.adaptiveThreshold(g, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 51, 5)
    else:
        flag = cv2.THRESH_OTSU if P["threshold"] <= 0 else 0
        _, b = cv2.threshold(g, P["threshold"], 255, cv2.THRESH_BINARY | flag)
        if met == "dark":
            b = 255 - b
        elif met == "auto":
            b = choose_polarity(b, mask)
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3, 3))
    b = cv2.morphologyEx(b, cv2.MORPH_OPEN, k)
    if mask is not None:
        b = cv2.bitwise_and(b, mask)
    return b


def choose_polarity(b, mask):
    """The piece is what does NOT touch the image (or ROI) edge: it keeps
    the polarity whose largest component touches the edge least."""
    h, w = b.shape
    edge = np.zeros_like(b)
    if mask is not None:
        edge = cv2.morphologyEx(mask, cv2.MORPH_GRADIENT, np.ones((3, 3), np.uint8))
    else:
        edge[0, :] = edge[-1, :] = 255
        edge[:, 0] = edge[:, -1] = 255

    def touch(x):
        xm = x if mask is None else cv2.bitwise_and(x, mask)
        n, lab, stats, _ = cv2.connectedComponentsWithStats(xm, 8)
        if n <= 1:
            return 1e9
        i = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        return float(np.count_nonzero((lab == i) & (edge > 0))) / max(1, stats[i, cv2.CC_STAT_AREA])

    return b if touch(b) <= touch(255 - b) else 255 - b


def det_pieces(img, g, H, P, mask, out, con_holes):
    b = binary(g, P, mask)
    cnts, hier = cv2.findContours(b, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    if hier is None:
        return b
    hier = hier[0]
    cands = []
    for i, c in enumerate(cnts):
        if hier[i][3] != -1:  # solo exteriores
            continue
        apx = cv2.contourArea(c)
        if H is not None:
            cm = a_mm(H, c)
            amm = cv2.contourArea(cm.astype(np.float32))
            if amm < P["min_mm2"]:
                continue
        else:
            cm, amm = None, None
            if apx < P["min_px2"]:
                continue
        cands.append((amm if amm is not None else apx, i, c, cm))
    cands.sort(key=lambda t: -t[0])
    for n, (_, i, c, cm) in enumerate(cands[: P["max_pieces"]]):
        per = cv2.arcLength(c, True)
        apr = cv2.approxPolyDP(c, 0.01 * per, True)
        it = {"kind": "piece", "id": "p%d" % n, "px": {"poly": lp(apr, 1)}}
        M = cv2.moments(c)
        if M["m00"]:
            it["px"]["c"] = [r2(M["m10"] / M["m00"], 1), r2(M["m01"] / M["m00"], 1)]
        if cm is not None:
            cx, cy, w, h, ang, box = rect_mm(cm)
            amm = cv2.contourArea(cm.astype(np.float32))
            pmm = cv2.arcLength(cm.astype(np.float32), True)
            circle = 4 * math.pi * amm / (pmm * pmm) if pmm else 0
            rect = amm / (w * h) if w * h else 0
            shape = "rectangle" if rect > 0.9 else ("circle" if circle > 0.88 else "free")
            mm = {
                "c": [r2(cx), r2(cy)],
                "w": r2(w),
                "h": r2(h),
                "ang": r2(ang),
                "area": r2(amm, 1),
                "perim": r2(pmm, 1),
                "box": lp(box),
                "bbox": lp([cm[:, 0].min(), cm[:, 1].min(), cm[:, 0].max(), cm[:, 1].max()]),
                "poly": lp(a_mm(H, apr)),
                "shape": shape,
            }
            if shape == "circle":
                fc = fit_circle(cm)
                if fc:
                    mm["c"], mm["d"] = [r2(fc[0]), r2(fc[1])], r2(2 * fc[2])
            it["mm"] = mm
            it["px"]["box"] = lp(a_px(H, box), 1)
        else:
            rr = cv2.minAreaRect(c)
            it["px"]["box"] = lp(cv2.boxPoints(rr), 1)
        out.append(it)
        if con_holes:
            det_holes_of(cnts, hier, i, H, P, out, it["id"])
    return b


def det_holes_of(cnts, hier, parent, H, P, out, pid):
    j = hier[parent][2]  # primer hijo
    n = 0
    while j != -1:
        c = cnts[j]
        j_next = hier[j][0]
        if len(c) >= 5:
            it = {"kind": "hole", "id": "%s-a%d" % (pid, n), "piece": pid, "px": {"poly": lp(cv2.approxPolyDP(c, 1.0, True), 1)}}
            M = cv2.moments(c)
            if M["m00"]:
                it["px"]["c"] = [r2(M["m10"] / M["m00"], 1), r2(M["m01"] / M["m00"], 1)]
            ok = True
            if H is not None:
                cm = a_mm(H, c)
                amm = cv2.contourArea(cm.astype(np.float32))
                if amm < P["min_hole_mm2"]:
                    ok = False
                else:
                    fc = fit_circle(cm)
                    pmm = cv2.arcLength(cm.astype(np.float32), True)
                    circle = 4 * math.pi * amm / (pmm * pmm) if pmm else 0
                    cx, cy, w, h, ang, box = rect_mm(cm)
                    it["mm"] = {
                        "c": [r2(fc[0]), r2(fc[1])] if fc and circle > 0.8 else [r2(cx), r2(cy)],
                        "d": r2(2 * fc[2]) if fc and circle > 0.8 else None,
                        "d_area": r2(2 * math.sqrt(amm / math.pi)),
                        "w": r2(w),
                        "h": r2(h),
                        "ang": r2(ang),
                        "area": r2(amm, 1),
                        "roundness": r2(circle, 2),
                        "shape": "circle" if circle > 0.8 else ("rectangle" if amm / (w * h + 1e-9) > 0.9 else "free"),
                        # contour in mm (2026-10-10: to pass the piece with its holes to the Laser Editor / SVG)
                        "poly": lp(a_mm(H, cv2.approxPolyDP(c, 1.0, True))),
                    }
            elif cv2.contourArea(c) < 30:
                ok = False
            if ok:
                out.append(it)
                n += 1
        j = j_next


def refinar_quad(e, apr):
    """Subpixel corners of a quadrilateral: fits a line (fitLine) to the
    Canny edge pixels (not thickened) near each side and intersects the
    neighbouring lines. Without this the rectangle comes out ~2 px bigger (the contour
    is searched on the thickened edges)."""
    q = apr.reshape(4, 2).astype(np.float64)
    ys, xs = np.nonzero(e)
    if len(xs) < 20:
        return q
    pts = np.column_stack([xs, ys]).astype(np.float64)
    lines = []
    for k in range(4):
        a, b = q[k], q[(k + 1) % 4]
        v = b - a
        L = np.linalg.norm(v)
        if L < 8:
            return q
        u = v / L
        n = np.array([-u[1], u[0]])
        d = pts - a
        t = d @ u
        sel = (np.abs(d @ n) < 4) & (t > 0.15 * L) & (t < 0.85 * L)  # without the tips (rounded corners)
        if np.count_nonzero(sel) < 8:
            return q
        vx, vy, x0, y0 = cv2.fitLine(pts[sel].astype(np.float32), cv2.DIST_HUBER, 0, 0.01, 0.01).reshape(4)
        lines.append((np.array([x0, y0], dtype=np.float64), np.array([vx, vy], dtype=np.float64)))
    res = []
    for k in range(4):
        (p1, d1), (p2, d2) = lines[k - 1], lines[k]
        A = np.column_stack([d1, -d2])
        if abs(np.linalg.det(A)) < 1e-6:
            return q
        t = np.linalg.solve(A, p2 - p1)
        res.append(p1 + t[0] * d1)
    res = np.array(res)
    return res if np.max(np.linalg.norm(res - q, axis=1)) < 8 else q


def det_rects(g, H, P, mask, out):
    e_raw = cv2.Canny(g, P["canny1"], P["canny2"])
    e = cv2.dilate(e_raw, np.ones((3, 3), np.uint8))
    if mask is not None:
        e = cv2.bitwise_and(e, mask)
    cnts, _ = cv2.findContours(e, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    seen = []
    n = 0
    for c in sorted(cnts, key=cv2.contourArea, reverse=True):
        per = cv2.arcLength(c, True)
        apr = cv2.approxPolyDP(c, 0.03 * per, True)
        if len(apr) != 4 or not cv2.isContourConvex(apr):
            continue
        apx = cv2.contourArea(apr)
        if H is not None:
            q = a_mm(H, apr)
            if cv2.contourArea(q.astype(np.float32)) < P["min_mm2"] / 4:
                continue
        elif apx < P["min_px2"]:
            continue
        ctr = apr.reshape(-1, 2).mean(axis=0)
        # the dilated contour gives 2 copies (inner and outer edge)
        if any(np.linalg.norm(ctr - v) < 6 and abs(apx - a) / max(a, 1) < 0.25 for v, a in seen):
            continue
        seen.append((ctr, apx))
        apr = refinar_quad(e_raw, apr)
        it = {"kind": "rect", "id": "r%d" % n, "px": {"poly": lp(apr, 1), "c": lp([apr.mean(axis=0)], 1)[0]}}
        if H is not None:
            q = a_mm(H, apr)
            cx, cy, w, h, ang, box = rect_mm(q)
            sides = [float(np.linalg.norm(q[k] - q[(k + 1) % 4])) for k in range(4)]
            it["mm"] = {"c": [r2(cx), r2(cy)], "w": r2(w), "h": r2(h), "ang": r2(ang), "corners": lp(q), "sides": [r2(x) for x in sides], "area": r2(cv2.contourArea(q.astype(np.float32)), 1)}
        out.append(it)
        n += 1
        if n >= 12:
            break


def det_circles(g, H, P, mask, out):
    h, w = g.shape
    k = scale_px_by_mm(H, w, h) or 1.0  # without calibration: the limits stay in px
    rmin = max(2, int(P["circle_min_mm"] * k / 2))
    rmax = max(rmin + 2, int(P["circle_max_mm"] * k / 2))
    cs = cv2.HoughCircles(g, cv2.HOUGH_GRADIENT_ALT, 1.5, max(4, rmin), param1=300, param2=P["circ_sens"], minRadius=rmin, maxRadius=rmax)
    if cs is None:
        return
    n = 0
    for x, y, r in cs[0]:
        if mask is not None and mask[min(h - 1, int(y)), min(w - 1, int(x))] == 0:
            continue
        it = {"kind": "circle", "id": "c%d" % n, "px": {"c": [r2(x, 1), r2(y, 1)], "r": r2(r, 1)}}
        if H is not None:
            t = np.linspace(0, 2 * math.pi, 36, endpoint=False)
            edge = np.column_stack([x + r * np.cos(t), y + r * np.sin(t)])
            fc = fit_circle(a_mm(H, edge))
            if fc:
                it["mm"] = {"c": [r2(fc[0]), r2(fc[1])], "d": r2(2 * fc[2])}
        out.append(it)
        n += 1


def det_corners(g, H, P, mask, out):
    h, w = g.shape
    k = scale_px_by_mm(H, w, h) or 1.0
    pts = cv2.goodFeaturesToTrack(g, P["corner_max"], P["corner_quality"], max(3, P["corner_dist_mm"] * k), mask=mask)
    if pts is None:
        return
    pts = cv2.cornerSubPix(g, np.float32(pts), (5, 5), (-1, -1), (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 30, 0.01))
    mm = a_mm(H, pts) if H is not None else None
    for n, p in enumerate(pts.reshape(-1, 2)):
        it = {"kind": "corner", "id": "e%d" % n, "px": {"c": [r2(p[0], 1), r2(p[1], 1)]}}
        if mm is not None:
            it["mm"] = {"c": [r2(mm[n][0]), r2(mm[n][1])]}
        out.append(it)


def det_lines(g, H, P, mask, out):
    h, w = g.shape
    k = scale_px_by_mm(H, w, h) or 1.0
    e = cv2.Canny(g, P["canny1"], P["canny2"])
    if mask is not None:
        e = cv2.bitwise_and(e, mask)
    ls = cv2.HoughLinesP(e, 1, math.pi / 720, P["lin_threshold"], minLineLength=P["lin_min_mm"] * k, maxLineGap=max(2, P["lin_gap_mm"] * k))
    if ls is None:
        return
    items = []
    for x1, y1, x2, y2 in ls.reshape(-1, 4):
        it = {"kind": "line", "px": {"poly": [[float(x1), float(y1)], [float(x2), float(y2)]]}}
        if H is not None:
            a, b = a_mm(H, [[x1, y1], [x2, y2]])
            L = float(np.linalg.norm(b - a))
            ang = angle_norm(math.degrees(math.atan2(b[1] - a[1], b[0] - a[0])))
            it["mm"] = {"a": lp([a])[0], "b": lp([b])[0], "c": lp([(a + b) / 2])[0], "len": r2(L), "ang": r2(ang)}
            it["_L"] = L
        else:
            it["_L"] = math.hypot(x2 - x1, y2 - y1)
        items.append(it)
    items.sort(key=lambda t: -t["_L"])
    # descartar duplicados casi superpuestos
    final = []
    for it in items:
        p = np.array(it["px"]["poly"])
        dup = False
        for f in final:
            q = np.array(f["px"]["poly"])
            if min(np.linalg.norm(p[0] - q[0]) + np.linalg.norm(p[1] - q[1]), np.linalg.norm(p[0] - q[1]) + np.linalg.norm(p[1] - q[0])) < 12:
                dup = True
                break
        if not dup:
            final.append(it)
        if len(final) >= P["lin_max"]:
            break
    for n, it in enumerate(final):
        it.pop("_L", None)
        it["id"] = "l%d" % n
        c = np.mean(np.array(it["px"]["poly"]), axis=0)
        it["px"]["c"] = lp([c], 1)[0]
        out.append(it)


def aruco_detector():
    a = CFG.get().get("aruco") or {}
    d = ARUCO_DICTS.get(str(a.get("dict", "DICT_4X4_50")), cv2.aruco.DICT_4X4_50)
    prm = cv2.aruco.DetectorParameters()
    prm.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
    return cv2.aruco.ArucoDetector(cv2.aruco.getPredefinedDictionary(d), prm), a


def det_marks(img, H, out):
    det, a = aruco_detector()
    corners, ids, _ = det.detectMarkers(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY))
    if ids is None:
        return []
    known = a.get("marks") or {}
    res = []
    for c, i in zip(corners, ids.reshape(-1)):
        c = c.reshape(4, 2)
        ctr = c.mean(axis=0)
        it = {"kind": "mark", "id": "m%d" % int(i), "mark": int(i), "px": {"poly": lp(c, 1), "c": lp([ctr], 1)[0]}}
        if H is not None:
            cm = a_mm(H, c)
            v = cm[1] - cm[0]
            side = float(np.mean([np.linalg.norm(cm[k] - cm[(k + 1) % 4]) for k in range(4)]))
            it["mm"] = {"c": lp([cm.mean(axis=0)])[0], "ang": r2(math.degrees(math.atan2(v[1], v[0]))), "side": r2(side)}
            k = known.get(str(int(i)))
            if k:
                d = cm.mean(axis=0) - np.array(k, dtype=np.float64)
                it["mm"]["error"] = r2(float(np.linalg.norm(d)))
        out.append(it)
        res.append((int(i), ctr))
    return res


KINDS = ("piece", "rect", "circles", "holes", "corners", "edges", "marks")


def image_of(body):
    """(photo_id, img, pose, H, notice): a saved photo (body.foto) or the
    live video with the machine's current position."""
    if body.get("photo"):
        f = photo_get(body["photo"])
        return str(body["photo"]), f["img"], f["pose"], f["H"], f["notice"]
    pose = pose_machine()
    ts, jpg, img = CAMERA.image(fresh=bool(body.get("fresh", True)))
    h, w = img.shape[:2]
    H, notice = CFG.H_for(w, h, pose)
    if pose is not None and not still(pose):
        notice = M("vision_the_machine_is_moving_measures_may_be_off", state=pose.get("state"))
    return save_photo(img, pose, H, notice), img, pose, H, notice


def detect(body):
    kinds = [t for t in (body.get("kinds") or ["piece"]) if t in KINDS]
    P = params(body.get("params"))
    fid, img, pose, H, notice = image_of(body)
    t0 = time.time()
    h, w = img.shape[:2]
    # Measuring something tall (2026-10-10: "an 8 cm glass measured 13"): the calibration
    # measures in the BED plane; what is `alto` mm above it is closer
    # to the lens and looks bigger. It is measured in that plane: everything shrinks
    # around the point under the lens by (D - alto) / D.
    height = float(body.get("height_mm") or 0)
    height_ok = None
    if height > 0 and H is not None:
        n = CFG.nadir(w, h, pose)
        if not n:
            notice = J([notice, M("vision_measuring_at_another_height_needs")], "; ") if notice else M("vision_measuring_at_another_height_needs")
        elif n[1] - height < 10:
            extra = M("vision_height_almost_reaches_the_lens", height=height, lens=n[1])
            notice = J([notice, extra], "; ") if notice else extra
        else:
            k = (n[1] - height) / n[1]
            H = mat_T(n[0][0], n[0][1]) @ mat_S(k, k) @ mat_T(-n[0][0], -n[0][1]) @ H
            height_ok = {"height_mm": height, "lens_mm": r2(n[1], 1), "factor": r2(k, 4)}
    roi = body.get("roi")
    with cv_lock:
        mask = mask_roi(img.shape, roi)
        g = gray(img, P)
        out = []
        if "piece" in kinds or "holes" in kinds:
            det_pieces(img, g, H, P, mask, out, "holes" in kinds)
            if "piece" not in kinds:
                out = [o for o in out if o["kind"] != "piece"]
        if "rect" in kinds:
            det_rects(g, H, P, mask, out)
        if "circles" in kinds:
            det_circles(g, H, P, mask, out)
        if "corners" in kinds:
            det_corners(g, H, P, mask, out)
        if "edges" in kinds:
            det_lines(g, H, P, mask, out)
        if "marks" in kinds:
            det_marks(img, H, out)
    f = photo_get(fid)
    return {
        "ok": True,
        "photo": fid,
        "age_s": r2(time.time() - f["ts"], 1),
        "size": [w, h],
        "pose": pose,
        "notice": notice,
        "mosaic": f.get("mosaic"),
        "calibration": H is not None,
        "px_per_mm": r2(scale_px_by_mm(H, w, h), 3),
        "H": None if H is None else [[float(x) for x in row] for row in H],
        "height": height_ok,
        "ms": int((time.time() - t0) * 1000),
        "items": out,
    }


def take_photo(body):
    """High-resolution measurement photo, at the CURRENT position (it does not move)."""
    fs = int(body.get("fs") or CFG.photo_cfg()["fs"])
    if fs not in FS_SIZE:
        raise ValueError(M("vision_unknown_resolution", fs=fs))
    p1 = pose_machine()
    if p1 is not None and not still(p1):
        raise ValueError(M("vision_the_machine_is_not_still_wait", state=p1["state"]))
    with LightPhoto(follow=bool(body.get("follow_light"))):
        jpg, img = photo_high(fs)
    img = fix_lens(img)
    p2 = pose_machine()
    if p1 and p2 and (abs(p1["y"] - p2["y"]) > 0.05 or abs(p1["z"] - p2["z"]) > 0.05 or abs(p1["x"] - p2["x"]) > 0.05):
        raise ValueError(M("vision_the_machine_moved_while_the_photo"))
    h, w = img.shape[:2]
    H, notice = CFG.H_for(w, h, p2)
    fid = save_photo(img, p2, H, notice, high=True)
    return {"ok": True, "photo": fid, "size": [w, h], "pose": p2, "calibration": H is not None, "notice": notice, "px_per_mm": r2(scale_px_by_mm(H, w, h), 3),
            "exposure": dict(LAST_EXPOSURE)}


# ---------------------------------------------------------------- calibracion


def calibrate(body):
    """Computes (does NOT save) the calibration of the requested image (body.foto or the
    video), with ArUco marks or pairs of points. With body.altura, it also
    combines with the saved calibration of the same resolution (at another Z)
    to get the lens height and the nadir."""
    mode = body.get("mode")
    fid, img, pose, _, _ = image_of(body)
    h, w = img.shape[:2]
    if pose is None:
        return {"ok": False, "error": M("vision_could_not_read_the_machine_position_dsf")}
    if not still(pose):
        return {"ok": False, "error": M("vision_the_machine_is_moving_wait")}
    if not pose.get("homed"):
        return {"ok": False, "error": M("vision_home_y_and_z_first")}
    if mode == "aruco":
        out = []
        with cv_lock:
            found = det_marks(img, None, out)
        known = (CFG.get().get("aruco") or {}).get("marks") or {}
        src, dst, used = [], [], []
        for i, ctr in found:
            k = known.get(str(i))
            if k:
                src.append(ctr)
                dst.append(k)
                used.append(i)
        missing = sorted(int(k) for k in known if int(k) not in used)
        views = sorted(i for i, _ in found)
        if len(src) < 4:
            return {"ok": False, "error": M("vision_4_marks_with_a_known_position", n=len(src), seen=", ".join(str(v) for v in views) if views else "-"), "views": views, "missing": missing}
    elif mode == "points":
        pairs = body.get("pairs") or []
        if len(pairs) < 4:
            return {"ok": False, "error": M("vision_4_points_or_more_are_needed")}
        sw, sh = body.get("size") or [w, h]
        src = [[p[0] * w / float(sw), p[1] * h / float(sh)] for p in pairs]
        dst = [[p[2], p[3]] for p in pairs]
        used, missing, views = list(range(len(pairs))), [], []
    else:
        return {"ok": False, "error": M("vision_mode_must_be_aruco_or_points")}
    src = np.array(src, dtype=np.float64)
    dst = np.array(dst, dtype=np.float64)
    Hm, _ = cv2.findHomography(src, dst, cv2.RANSAC if len(src) > 4 else 0, 3.0)
    if Hm is None:
        return {"ok": False, "error": M("vision_could_not_compute_aligned_or_repeated")}
    res = np.linalg.norm(a_mm(Hm, src) - dst, axis=1)
    cal = {
        "H": [[float(x) for x in row] for row in Hm],
        "size": [w, h],
        "x": pose["x"],
        "y": pose["y"],
        "z": pose["z"],
        "source": mode,
        "date": time.strftime("%Y-%m-%d %H:%M:%S"),
        "error_mm": r2(float(np.sqrt(np.mean(res ** 2))), 3),
        "max_mm": r2(float(res.max()), 3),
        "px_per_mm": r2(scale_px_by_mm(Hm, w, h), 3),
        "used": used,
    }
    out = {"ok": True, "photo": fid, "calibration": cal, "residuos": [r2(x, 3) for x in res], "missing": missing, "views": views}
    if body.get("height"):
        base = CFG.calibs.get(size_key(w, h))
        if not base or base.get("z") is None:
            return dict(out, ok=False, error=M("vision_the_height_needs_a_saved_calibration", w=w, h=h))
        try:
            out["height"] = calc_height(base, Hm, pose, w, h)
        except ValueError as e:
            return dict(out, ok=False, error=error_text(e))
    return out


# ---------------------------------------------------------------- photo plan


def fingerprint(Hp, w, h, edge):
    """Rectangle (axis-aligned) of the bed that the photo covers well."""
    ex, ey = w * edge, h * edge
    q = a_mm(Hp, [[ex, ey], [w - ex, ey], [w - ex, h - ey], [ex, h - ey]])
    xs, ys = sorted(q[:, 0]), sorted(q[:, 1])
    return [xs[1], ys[1], xs[2], ys[2]], q


def plan(body):
    """Where to put the bridge (Y) and at what height (Z) so that the photo (or the
    mosaic of photos in Y) covers `objetivo` [x0, y0, x1, y1] with the highest
    resolution possible: the lowest Z that frames it."""
    f = CFG.photo_cfg()
    fs = int(body.get("fs") or f["fs"])
    w, h = FS_SIZE[fs]
    cal, reason = CFG.calibration_for(w, h)
    if cal is None or cal.get("y") is None:
        return {"ok": False, "error": M("vision_calibrate_the_camera_with_a_photo_first", reason=reason or M("vision_the_calibration_has_no_position"))}
    pm = pose_machine()
    lim = (pm or {}).get("lim") or body.get("lim") or {"Y": [-1e9, 1e9], "Z": [0, 1e9]}
    o = [float(v) for v in body["target"]]
    m = float(body.get("margin_mm", 5))
    tx0, tx1 = min(o[0], o[2]) - m, max(o[0], o[2]) + m
    ty0, ty1 = min(o[1], o[3]) - m, max(o[1], o[3]) + m
    edge, overlap = f["edge"], f["overlap"]
    zmin = max(float(f["zmin"]), float(lim["Z"][0]))
    zmax = float(lim["Z"][1])
    if CFG.height:
        zs = list(np.arange(zmin, zmax + 1e-6, 0.5))
        if not zs:
            return {"ok": False, "error": M("vision_zmin_is_above_the_z_maximum", zmin=zmin, zmax=zmax)}
    else:
        zs = [float(cal["z"])]
    notices = []
    if not CFG.height:
        notices.append(M("vision_without_height_calibration", z=cal["z"]))
    ycal = float(cal["y"])
    carriage = camera_in_carriage() and cal.get("x") is not None
    xcal = float(cal["x"]) if carriage else None

    def en(z):
        Hp, err = move_pose(cal["Hm"], cal, {"x": xcal, "y": ycal, "z": z}, CFG.height)
        if Hp is None:
            return None
        R, _ = fingerprint(Hp, w, h, edge)
        return R, Hp

    chosen = None
    z_x = None
    for z in zs:
        r = en(z)
        if r is None:
            continue
        R, Hp = r
        # on the carriage X is arranged by moving X: it is enough that the WIDTH between
        if (R[2] - R[0] >= tx1 - tx0) if carriage else (R[0] <= tx0 and R[2] >= tx1):
            if z_x is None:
                z_x = (z, R, Hp)
            if R[3] - R[1] >= ty1 - ty0:
                chosen = (z, R, Hp)
                break
    if chosen:
        z, R, Hp = chosen
        ys = [((ty0 + ty1) / 2.0) - ((R[1] + R[3]) / 2.0 - ycal)]
        hR = R[3] - R[1]
    else:
        if z_x is None:
            z = zs[-1]
            R, Hp = en(z)
            if carriage:
                notices.append(M("vision_x_does_not_fit_carriage", z=z, width=R[2] - R[0], asked=tx1 - tx0))
            else:
                notices.append(M("vision_x_does_not_fit_gantry", z=z, x0=R[0], x1=R[2], ax0=tx0, ax1=tx1))
        else:
            z, R, Hp = z_x
        hR = R[3] - R[1]
        step = hR * (1 - overlap)
        n = max(1, int(math.ceil(((ty1 - ty0) - hR) / step)) + 1) if hR < ty1 - ty0 else 1
        if n > 12:
            return {"ok": False, "error": M("vision_too_many_photos_would_be_needed", n=n)}
        centers = [ty0 + hR / 2.0 + i * ((ty1 - ty0 - hR) / float(n - 1) if n > 1 else 0) for i in range(n)]
        off = (R[1] + R[3]) / 2.0 - ycal
        ys = [c - off for c in centers]
    yl = lim["Y"]
    ys2 = [min(max(y, yl[0]), yl[1]) for y in ys]
    x_photo = None
    if carriage:
        # X of the carriage that centers the photo on what was asked
        offx = (R[0] + R[2]) / 2.0 - xcal
        xl = lim.get("X") or [-1e9, 1e9]
        x_photo = min(max((tx0 + tx1) / 2.0 - offx, xl[0]), xl[1])
        R = [R[0] + (x_photo - xcal), R[1], R[2] + (x_photo - xcal), R[3]]
    if any(abs(a - b) > 0.01 for a, b in zip(ys, ys2)):
        notices.append(M("vision_y_reaches_the_end_of_travel"))
    off = (R[1] + R[3]) / 2.0 - ycal
    covers = [R[0], min(y + off for y in ys2) - hR / 2.0, R[2], max(y + off for y in ys2) + hR / 2.0]
    k = scale_px_by_mm(Hp, w, h)
    return {
        "ok": True,
        "fs": fs,
        "size": [w, h],
        "z": r2(z, 1),
        "ys": [r2(y, 1) for y in ys2],
        "x": r2(x_photo, 1) if x_photo is not None else None,  # camera on the carriage: X of all the photos
        "photos": len(ys2),
        "px_per_mm": r2(k, 2),
        "mm_per_px": r2(1.0 / k if k else None, 2),
        "covers": [r2(v, 1) for v in covers],
        "target": [r2(v, 1) for v in (tx0, ty0, tx1, ty1)],
        "notices": notices,
        "with_height": bool(CFG.height),
    }


def mosaic(body):
    """Joins photos (taken at different Y) into a single image from above,
    aligned to machine mm. It stays as one more photo (it can be analyzed)."""
    ids = [str(i) for i in body.get("photos") or []]
    fs_ = [photo_get(i) for i in ids]
    if not fs_:
        raise ValueError(M("vision_photos_are_missing"))
    if any(f["H"] is None for f in fs_):
        raise ValueError(M("vision_some_photos_have_no_calibration"))
    qs = []
    for f in fs_:
        hh, ww = f["img"].shape[:2]
        qs.append(a_mm(f["H"], [[0, 0], [ww, 0], [ww, hh], [0, hh]]))
    if body.get("area"):
        x0, y0, x1, y1 = [float(v) for v in body["area"]]
    else:
        allq = np.vstack(qs)
        x0, y0 = allq.min(axis=0)
        x1, y1 = allq.max(axis=0)
    ppm = float(body.get("ppm") or 0) or min(scale_px_by_mm(f["H"], f["img"].shape[1], f["img"].shape[0]) for f in fs_)
    ppm = min(ppm, 4000.0 / max(x1 - x0, y1 - y0, 1))
    W, Hh = int(round((x1 - x0) * ppm)), int(round((y1 - y0) * ppm))
    T = np.array([[ppm, 0, -x0 * ppm], [0, -ppm, y1 * ppm], [0, 0, 1]], dtype=np.float64)  # mm -> px (Y up)
    acc = np.zeros((Hh, W, 3), np.float32)
    wsum = np.zeros((Hh, W), np.float32)
    with cv_lock:
        for f in fs_:
            img = f["img"]
            hh, ww = img.shape[:2]
            # weight: the closer to the center of each photo, the more it weighs (no seams)
            wx = np.minimum(np.arange(ww), ww - 1 - np.arange(ww)).astype(np.float32) + 1
            wy = np.minimum(np.arange(hh), hh - 1 - np.arange(hh)).astype(np.float32) + 1
            wgt = np.minimum.outer(wy, wx)
            M = T @ f["H"]
            acc += cv2.warpPerspective(img.astype(np.float32), M, (W, Hh)) * cv2.warpPerspective(wgt, M, (W, Hh))[..., None]
            wsum += cv2.warpPerspective(wgt, M, (W, Hh))
    out = np.full((Hh, W, 3), 25, np.uint8)
    ok = wsum > 1e-6
    out[ok] = np.clip(acc[ok] / wsum[ok][:, None], 0, 255).astype(np.uint8)
    fid = save_photo(out, None, np.linalg.inv(T), None, mosaic=len(fs_))
    return {"ok": True, "photo": fid, "size": [W, Hh], "ppm": r2(ppm, 3), "area": [r2(x0, 1), r2(y0, 1), r2(x1, 1), r2(y1, 1)]}


# ---------------------------------------------------------------- vistas


def view_img(view, q):
    fid = q.get("id")
    if fid:
        f = photo_get(fid)
        img, H = f["img"], f["H"]
    else:
        pose = pose_machine()
        _, jpg, img = CAMERA.image(fresh=q.get("fresh") == "1")
        H, _ = CFG.H_for(img.shape[1], img.shape[0], pose)
        if view == "camera" and not CFG.get().get("lens") and not rotate_request(q):
            return jpg, {}  # as is, without recompressing
    P = params({k: v for k, v in q.items() if k in DEF})
    extra = {}
    if view == "edges":
        g = gray(img, P)
        e = cv2.Canny(g, P["canny1"], P["canny2"])
        out = (img * 0.35).astype(np.uint8)
        out[e > 0] = (0, 255, 255)
    elif view == "threshold":
        g = gray(img, P)
        out = binary(g, P, None)
    elif view == "up":
        out, lim = view_up(img, H, q)
        extra["X-Arriba"] = ",".join("%.3f" % v for v in lim)
    else:
        out = img
    if view != "up":
        out = turn_around(out, q)
    ok, enc = cv2.imencode(".jpg", out, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return enc.tobytes(), extra


def rotate_request(q):
    return int(q.get("rotation") or 0) % 360 != 0 or q.get("mirror") == "1"


def turn_around(img, q):
    """Orientation of the view (2026-10-10, "the image appears rotated for
    me"): first the mirror and then the clockwise turn, like /orientacion."""
    if q.get("mirror") == "1":
        img = cv2.flip(img, 1)
    r = {90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}.get(int(q.get("rotation") or 0) % 360)
    return cv2.rotate(img, r) if r is not None else img


def view_up(img, H, q):
    """The bed seen from above (rectified): x0,y0,x1,y1 in mm, ppm px/mm."""
    h, w = img.shape[:2]
    if H is None:
        raise ValueError(M("vision_the_camera_is_not_calibrated"))
    try:
        x0, y0, x1, y1 = (float(q[k]) for k in ("x0", "y0", "x1", "y1"))
    except (KeyError, ValueError):
        c = a_mm(H, [[0, 0], [w, 0], [w, h], [0, h]])
        x0, y0 = c.min(axis=0)
        x1, y1 = c.max(axis=0)
    ppm = float(q.get("ppm", 0) or 0)
    if ppm <= 0:
        ppm = min(6.0, 2000.0 / max(x1 - x0, y1 - y0, 1))
    W, Hh = int((x1 - x0) * ppm), int((y1 - y0) * ppm)
    T = np.array([[ppm, 0, -x0 * ppm], [0, -ppm, y1 * ppm], [0, 0, 1]], dtype=np.float64)  # Y up
    return cv2.warpPerspective(img, T @ H, (max(W, 1), max(Hh, 1))), (x0, y0, x1, y1, ppm)


def config_post(body):
    """Small changes to sys/workshop/config/vision.json from other pages (2026-10-10:
    the Workbench map chooses where the camera is mounted). Only the
    keys of this list; the file is rewritten whole (atomic) and CFG reloads
    it by itself by the date. It returns a notice if recalibration is needed."""
    allowed = {"camera_en": ("gantry", "carriage")}
    changes = {k: v for k, v in (body or {}).items() if k in allowed}
    if not changes:
        raise ValueError(M("vision_nothing_to_change", accepted=", ".join(allowed)))
    for k, v in changes.items():
        if v not in allowed[k]:
            raise ValueError(M("vision_value_is_not_valid", setting=k, value=v, options=" / ".join(allowed[k])))
    try:
        with open(CFG_FILE, encoding="utf-8-sig") as fh:
            data = json.load(fh)
        if not isinstance(data, dict):
            data = {}
    except FileNotFoundError:
        data = {}
    before = {k: data.get(k) for k in changes}
    data.update(changes)
    tmp = CFG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(data, fh, ensure_ascii=False, indent=1)
        fh.flush()
        os.fsync(fh.fileno())  # to the card before the rename (power cut)
    os.replace(tmp, CFG_FILE)
    CFG.get()
    notice = None
    if "camera_en" in changes and (before.get("camera_en") or "gantry") != changes["camera_en"]:
        notice = M("vision_the_camera_changed_place")
    log("config:", changes)
    return {"ok": True, "changes": changes, "notice": notice, "camera_en": data.get("camera_en") or "gantry"}


BED_JPG = os.path.join(SD, "sys", "workshop", "data", "vision-bed.jpg")
BED_JSON = os.path.join(SD, "sys", "workshop", "data", "vision-bed.json")


def bed_background(body):
    """Photo of the bed as the background for the Zones / Job 2D map (2026-10-10,
    feature 7: "mosaic of the whole bed with one tap, as the map background").
    It takes an already calibrated photo (a mosaic of the whole bed, or a single photo),
    straightens it from above and leaves it in 0:/sys/workshop/data/vision-bed.jpg with its
    extent in machine mm in sys/workshop/data/vision-bed.json. {quitar: true} deletes it."""
    if body.get("remove"):
        for f in (BED_JPG, BED_JSON):
            try:
                os.remove(f)
            except FileNotFoundError:
                pass
        return {"ok": True, "removed": True}
    f = photo_get(str(body.get("photo") or ""))
    if f["H"] is None:
        raise ValueError(M("vision_the_photo_has_no_calibration"))
    img, (x0, y0, x1, y1, ppm) = view_up(f["img"], f["H"], {"ppm": min(4.0, 2400.0 / max(1.0, 1.0))})
    # no more than ~2400 px per side (every screen that opens the map loads it)
    side = max(img.shape[:2])
    if side > 2400:
        k = 2400.0 / side
        img = cv2.resize(img, (int(img.shape[1] * k), int(img.shape[0] * k)), interpolation=cv2.INTER_AREA)
        ppm *= k
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 80])
    if not ok:
        raise IOError(M("vision_could_not_encode_the_image"))
    tmp = BED_JPG + ".tmp"
    with open(tmp, "wb") as fh:
        fh.write(buf.tobytes())
        fh.flush()
        os.fsync(fh.fileno())  # to the card before the rename (power cut)
    os.replace(tmp, BED_JPG)
    info = {"x0": r2(x0, 2), "y0": r2(y0, 2), "x1": r2(x1, 2), "y1": r2(y1, 2), "px_per_mm": r2(ppm, 3), "ts": int(time.time()), "mosaic": f.get("mosaic") or 1}
    with open(BED_JSON + ".tmp", "w") as fh:
        json.dump(info, fh)
        fh.flush()
        os.fsync(fh.fileno())  # to the card before the rename (power cut)
    os.replace(BED_JSON + ".tmp", BED_JSON)
    log("foto de la cama para el mapa: %dx%d px, X %.0f..%.0f Y %.0f..%.0f" % (img.shape[1], img.shape[0], x0, x1, y0, y1))
    return dict(info, ok=True, size=[img.shape[1], img.shape[0]])


def mark_png(q):
    det, a = aruco_detector()
    d = det.getDictionary()
    i = int(q.get("id", 0))
    px = max(50, min(2000, int(q.get("px", 600))))
    m = cv2.aruco.generateImageMarker(d, i, px, borderBits=1)
    m = cv2.copyMakeBorder(m, px // 8, px // 8, px // 8, px // 8, cv2.BORDER_CONSTANT, value=255)  # zona blanca
    return cv2.imencode(".png", m)[1].tobytes()


def orientation():
    """How to rotate / mirror the camera image to see it as standing
    in front of the machine: X+ to the right, Y+ up (toward the back).
    It comes from the calibration (2026-10-10: "the camera image is badly
    arranged... there should be an auto mode"). To display: first the
    mirror and then the clockwise turn: css = rotate(giro) scaleX(-1)."""
    pose = pose_machine()
    ts, jpg, img = CAMERA.image(fresh=False)
    h, w = img.shape[:2]
    H, notice = CFG.H_for(w, h, pose)
    if H is None:
        raise ValueError(M("vision_the_camera_is_not_calibrated_auto_mode"))
    c = np.array([w / 2.0, h / 2.0])
    m0 = a_mm(H, [c])[0]
    px = a_px(H, [[m0[0] + 10, m0[1]], [m0[0], m0[1] + 10]])
    vx, vy = px[0] - c, px[1] - c  # where X+ and Y+ go in the image (and screen down)
    best = None
    for mirror in (False, True):
        for turn in (0, 90, 180, 270):
            t = math.radians(turn)

            def tr(v):
                x, y = (-v[0] if mirror else v[0]), v[1]
                return (x * math.cos(t) - y * math.sin(t), x * math.sin(t) + y * math.cos(t))

            ax, ay = tr(vx), tr(vy)
            nx, ny = math.hypot(*ax) or 1, math.hypot(*ay) or 1
            score = ax[0] / nx - ay[1] / ny  # X+ to the right, Y+ up
            if best is None or score > best[0] + 1e-6:
                best = (score, turn, mirror)
    _, turn, mirror = best
    ang = lambda v: round(math.degrees(math.atan2(v[1], v[0])), 1)
    return {
        "ok": True,
        "rotation": turn,
        "mirror": mirror,
        "css": "rotate(%ddeg)%s" % (turn, " scaleX(-1)" if mirror else ""),
        "x_img_degrees": ang(vx),
        "y_img_degrees": ang(vy),
        "size": [w, h],
        "notice": notice,
    }


def head():
    """Where the head is (the POINTER, machine coordinates) in the current video
    image (2026-10-10, feature 6: live head tracking).
    It uses the last frame (it does not ask for a new one) and the calibration for the
    current camera position."""
    pose = pose_machine()
    if not pose:
        raise IOError(M("vision_no_machine_data"))
    ts, jpg, img = CAMERA.image(fresh=False)
    h, w = img.shape[:2]
    H, notice = CFG.H_for(w, h, pose)
    out = {"ok": True, "x": pose["x"], "y": pose["y"], "z": pose["z"], "state": pose["state"], "size": [w, h], "calibration": H is not None}
    # where the LASER hits (head - laser-pointer correction from
    # 0:/sys/workshop/config/laser.json) and where the PROBE touches (head + G31 offset)
    pts = {}
    try:
        with open(os.path.join(SD, "sys", "workshop", "config", "laser.json"), encoding="utf-8-sig") as fh:
            c = (json.load(fh) or {}).get("correction") or {}
        if c.get("x") is not None and c.get("y") is not None:
            pts["laser"] = [pose["x"] - float(c["x"]), pose["y"] - float(c["y"])]
    except Exception:
        pass
    try:
        pr = [q for q in (dsf_io.read_in().get("sensors", {}).get("probes") or []) if q]
        if pr and pr[0].get("offsets"):
            o = pr[0]["offsets"]
            pts["probe"] = [pose["x"] + float(o[0]), pose["y"] + float(o[1])]
    except Exception:
        pass
    out["points"] = {k: {"x": r2(v[0], 2), "y": r2(v[1], 2)} for k, v in pts.items()}
    if H is not None:
        px = a_px(H, [[pose["x"], pose["y"]]])[0]
        out["px"] = [r2(px[0], 1), r2(px[1], 1)]
        out["inside"] = bool(0 <= px[0] < w and 0 <= px[1] < h)
        for k, v in pts.items():
            q = a_px(H, [v])[0]
            out["points"][k]["px"] = [r2(q[0], 1), r2(q[1], 1)]
    return out


def state():
    cfg = CFG.get()
    age = time.time() - CAMERA.ts if CAMERA.ts else None
    try:
        cs = camera_status(max_age=10)
        fs = cs.get("framesize")
        camera_ctrl = {"framesize": fs, "size": FS_SIZE.get(fs), "psram_free": cs.get("psram_free"), "notice": psram_notice(cs)}
    except Exception as e:
        camera_ctrl = {"error": error_text(e)}
    calibs = {k: {kk: c.get(kk) for kk in ("size", "x", "y", "z", "source", "date", "error_mm", "px_per_mm")} for k, c in CFG.calibs.items()}
    return {
        "ok": True,
        "version": VERSION,
        "opencv": cv2.__version__,
        "url": CAMERA.url(),
        "camera": {"ok": age is not None and age < 5, "age_s": r2(age, 1), "fps": r2(CAMERA.fps, 1), "error": CAMERA.err, "control": camera_ctrl, "mode": CAMERA.mode},
        "ipc": dsf_io.ipc_stats.snapshot(),  # IPC calls to DCS (calls/min and totals per type)
        "calibs": calibs,
        "source": CFG.source(),
        "height": CFG.height,
        "camera_en": "carriage" if camera_in_carriage() else "gantry",
        "photo": CFG.photo_cfg(),
        "fs_size": {str(k): v for k, v in FS_SIZE.items()},
        "pose": pose_machine(),
        "lens": bool(cfg.get("lens")),
        "aruco": cfg.get("aruco") or {},
        "kinds": list(KINDS),
        "defaults": DEF,
    }


# ---------------------------------------------------------------- HTTP

# Key (2026-10-10, "make Vision ask for the same key as the relay"): with a
# password in DWC, whoever is not the Pi has to bring the day's key of the
# camera relay (?t= or the workshop_camera cookie set by the page; cookies
# do not distinguish ports). The relay validates it: GET :8090/clave (only
# answers to the Pi). If the relay does not answer, only the Pi (loopback) is let through
# (2026-10-21: it used to let everybody through; now it fails closed for the network).
RELAY_KEY = "http://127.0.0.1:8090/key?t="
KEY_CACHE_S = 30
_keys = {}  # (key, loopback) -> (ts, allowed)
_keys_lock = threading.Lock()
_key_notice = {"ts": 0.0}


def _key_answer(key):
    """(requires, ok) of the relay for this key; raises when the relay cannot be asked."""
    with urllib.request.urlopen(RELAY_KEY + urllib.parse.quote(key), timeout=2) as r:
        d = json.loads(r.read() or b"{}")
    return bool(d.get("requires")), bool(d.get("ok"))


def key_ok(key, client_ip=""):
    """True if the key is valid for the relay. If the relay cannot be asked: allowed only for loopback clients."""
    now = time.time()
    ck = (key, net_guard.is_loopback(client_ip))
    with _keys_lock:
        c = _keys.get(ck)
        if c and now - c[0] < KEY_CACHE_S:
            return c[1]
    try:
        requires, valid = _key_answer(key)
        ok = not requires or valid
    except Exception as e:
        if now - _key_notice["ts"] > 300:
            _key_notice["ts"] = now
            log("key: the relay does not answer (%s): only loopback is let through" % e)
        ok = net_guard.key_decision(e, client_ip)
        now -= KEY_CACHE_S - 3  # a failure is remembered for 3 s only: the relay may be back soon
    with _keys_lock:
        if len(_keys) > 200:
            _keys.clear()
        _keys[ck] = (now, ok)
    return ok


def day_key_valid(key):
    """True only for a key the relay says is REQUIRED and valid. Unlike key_ok, "DWC has no password" is not a key: the day key is the
    proof that opens a read to a request without the session token, so an empty key never counts."""
    if not key:
        return False
    try:
        requires, valid = _key_answer(key)
    except Exception:  # noqa: BLE001
        return False
    return requires and valid


class Handler(BaseHTTPRequestHandler):
    server_version = "workshop-vision/" + VERSION

    def log_message(self, fmt, *args):
        pass

    def _lang(self):
        """Language of the answer: "lang" of the query (the Vision page sends DWC's), else the one DWC is in
        (a call that comes through the service API, vision.get / vision.post)."""
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        lang = (q.get("lang") or [""])[-1]
        return ("en" if lang.lower().startswith("en") else "es") if lang else dsf_io.machine_language()

    def _drain(self):
        """Reads the body of a POST that is answered before it is read (refused: foreign origin, key, role). Closing a connection with unread
        data makes the browser see a reset instead of the answer."""
        if self.command != "POST" or getattr(self, "_body_done", False):
            return
        self._body_done = True
        try:
            n = min(int(self.headers.get("Content-Length") or 0), 1 << 20)
            if n > 0:
                self.rfile.read(n)
        except (ValueError, OSError):
            pass

    def _send(self, code, body, ctype="application/json", headers=None):
        if code >= 400:
            self._drain()
        if isinstance(body, (dict, list)):
            body = messages.localize(body, self._lang())  # every message in the language of whoever asked
            body = json.dumps(body, ensure_ascii=False).encode("utf-8")
            ctype = "application/json; charset=utf-8"
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self._cors()
        self.send_header("Cache-Control", "no-store")
        for k, v in (headers or {}).items():
            self.send_header(k, v)
            self.send_header("Access-Control-Expose-Headers", k)
        self.end_headers()
        self.wfile.write(body)

    def _cors(self):
        """CORS only for the own DWC (the Origin whose host is the host asked, any port); nobody else may read."""
        o = net_guard.cors_origin(self.headers.get("Origin"), self.headers.get("Host"))
        if o:
            self.send_header("Access-Control-Allow-Origin", o)
            self.send_header("Vary", "Origin")

    def _foreign_origin(self):
        """True if the request comes from a page of another site (Origin present and not the own DWC)."""
        o = self.headers.get("Origin")
        return bool(o) and net_guard.cors_origin(o, self.headers.get("Host")) is None

    def _day_key(self):
        """The day key this request carries: ?t= or the cookie workshop_camera ("" if none)."""
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        key = (q.get("t") or [""])[-1]
        if not key:
            try:
                m = http.cookies.SimpleCookie(self.headers.get("Cookie") or "").get("workshop_camera")
                key = m.value if m else ""
            except http.cookies.CookieError:
                key = ""
        return key

    def _authorized(self):
        """True if the request comes from the Pi or carries a valid key (or DWC has
        no password). Otherwise, it already answered 401."""
        if self.client_address[0] in ("127.0.0.1", "::1", "::ffff:127.0.0.1"):
            return True
        key = self._day_key()
        if key_ok(key, self.client_address[0]):
            return True
        try:
            _key_answer(key)
        except Exception:
            # the relay does not answer (no camera added yet: it only listens once there is one): that is not a missing key
            self._send(503, {"ok": False, "error": M("vision_relay_not_answering")})
            return False
        self._send(401, {"ok": False, "error": M("vision_the_camera_key_is_missing")})
        return False

    def _identity_ok(self, path):
        """Roles of the machine's people on the calls that act (vision_access.py). Already answered 401 / 403 / 503 when it returns False.
        Without users it lets everything through, as before; the Pi's own programs (no Origin, no token) pass."""
        ok, status, code = vision_access.authorize(self.headers, self.client_address[0], "POST", path)
        if not ok:
            text = {"login_required": M("vision_login_required"), "forbidden": M("vision_forbidden"),
                    "service_unreachable": M("vision_service_unreachable")}[code]
            self._send(status, {"ok": False, "code": code, "error": text})
        return ok

    def _get_allowed(self, path):
        """Roles on GET (vision_access.authorize_get). Machine with users: the session decides (or the valid day key for an image that cannot
        send headers). Machine without users: the camera key as before (_authorized). Already answered 401 / 403 / 503 when it returns False."""
        ok, status, code = vision_access.authorize_get(self.headers, self.client_address[0], path,
                                                       lambda: day_key_valid(self._day_key()))
        if ok is None:
            return self._authorized()
        if not ok:
            text = {"login_required": M("vision_login_required"), "forbidden": M("vision_forbidden"),
                    "service_unreachable": M("vision_service_unreachable")}[code]
            self._send(status, {"ok": False, "code": code, "error": text})
        return ok

    def do_OPTIONS(self):
        if self._foreign_origin():
            return self._send(403, {"ok": False, "error": M("vision_foreign_origin")})
        self.send_response(204)
        self._cors()
        self.send_header("Vary", "Origin")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Workshop-Token, X-Workshop-Device")
        self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        q = {k: v[-1] for k, v in urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).items()}
        token = messages.set_language(q.get("lang") or "es")  # the messages made while it answers
        try:
            self._get(q)
        finally:
            messages.reset_language(token)

    def _get(self, q):
        if self._foreign_origin():
            return self._send(403, {"ok": False, "error": M("vision_foreign_origin")})
        u = urllib.parse.urlparse(self.path)
        if not self._get_allowed(u.path):
            return
        try:
            if u.path == "/crosses/state":
                return self._send(200, dict(laser_calibration.state(), ok=True))
            if u.path == "/state":
                return self._send(200, state())
            if u.path == "/before":
                return self._send(200, dict(image_compare.state(), ok=True))
            if u.path == "/orientation":
                return self._send(200, orientation())
            if u.path == "/lens":
                return self._send(200, calibration_extra.lens_state())
            if u.path == "/head":
                return self._send(200, head())
            if u.path == "/fire/state":
                return self._send(200, dict(fire_watch.state(), ok=True))
            if u.path == "/fire/view.jpg":
                j = fire_watch.view_jpg()
                if j is None:
                    return self._send(404, {"ok": False, "error": M("vision_the_watch_is_not_analyzing_now")})
                return self._send(200, j, "image/jpeg", {})
            if u.path == "/fire/record":
                return self._send(200, fire_watch.reg(q.get("n", 50)))
            if u.path == "/fire/photo":
                return self._send(200, fire_watch.photo_record(q.get("f")), "image/jpeg", {})
            if u.path == "/frame.jpg":
                body, extra = view_img(q.get("view", "camera"), q)
                return self._send(200, body, "image/jpeg", extra)
            if u.path == "/mark.png":
                return self._send(200, mark_png(q), "image/png")
            return self._send(404, {"ok": False, "error": M("vision_no_such_path", path=u.path)})
        except Exception as e:
            return self._send(503 if isinstance(e, IOError) else 400, {"ok": False, "error": error_text(e)})

    def do_POST(self):
        q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
        token = messages.set_language((q.get("lang") or ["es"])[-1])
        try:
            self._post()
        finally:
            messages.reset_language(token)

    def _post(self):
        if self._foreign_origin():
            return self._send(403, {"ok": False, "error": M("vision_foreign_origin")})
        if not self._authorized():
            return
        u = urllib.parse.urlparse(self.path)
        if not self._identity_ok(u.path):
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            self._body_done = True
            body = json.loads(self.rfile.read(n) or b"{}") if n else {}
            if u.path == "/detect":
                return self._send(200, detect(body))
            if u.path == "/calibrate":
                return self._send(200, calibrate(body))
            if u.path == "/photo":
                return self._send(200, take_photo(body))
            if u.path == "/crosses/begin":
                return self._send(200, dict(laser_calibration.begin(body), ok=True))
            if u.path == "/calibrate/sheet":
                return self._send(200, calibration_extra.sheet_detect(body))
            if u.path == "/calibrate/board":
                return self._send(200, calibration_extra.board_detect(body))
            if u.path == "/calibrar/tablero/calcular":
                return self._send(200, calibration_extra.board_compute(body))
            if u.path == "/lens/add":
                return self._send(200, calibration_extra.lens_add(body))
            if u.path == "/lens/remove":
                return self._send(200, calibration_extra.lens_delete())
            if u.path == "/lente/calcular":
                return self._send(200, calibration_extra.lens_compute(body))
            if u.path == "/record/search":
                return self._send(200, record_log.search(body))
            if u.path == "/crosses/cancel":
                return self._send(200, {"ok": True, "cancelled": laser_calibration.cancel()})
            if u.path == "/plan":
                return self._send(200, plan(body))
            if u.path == "/before":
                return self._send(200, image_compare.before(body))
            if u.path == "/config":
                return self._send(200, config_post(body))
            if u.path == "/bed_background":
                return self._send(200, bed_background(body))
            if u.path == "/compare":
                return self._send(200, image_compare.compare(body))
            if u.path == "/fire/probe":
                return self._send(200, fire_watch.probe())
            if u.path == "/fire/test":
                return self._send(200, fire_watch.test(body.get("sec", 120)))
            if u.path == "/fire/cancel":
                return self._send(200, fire_watch.cancel())
            if u.path == "/fire/confirm":
                return self._send(200, fire_watch.confirm(body))
            if u.path == "/mosaic":
                return self._send(200, mosaic(body))
            return self._send(404, {"ok": False, "error": M("vision_no_such_path", path=u.path)})
        except Exception as e:
            log("error en", u.path, repr(e))
            return self._send(503 if isinstance(e, IOError) else 400, {"ok": False, "error": error_text(e)})


laser_calibration.V = sys.modules[__name__]
fire_watch.V = sys.modules[__name__]
image_compare.V = sys.modules[__name__]
calibration_extra.V = sys.modules[__name__]
record_log.V = sys.modules[__name__]


def main():
    # Backend of the WorkshopVision plugin (2026-10-10, request: "publishable Vision"):
    # started by DSF (sbcExecutable) with its own Python and OpenCV environment
    # (sbcPythonDependencies). Before it was a separate systemd service
    # (~/workshop-vision, workshop-vision.service): if that one is still running it holds the
    # port, and here it retries until it is free instead of exiting.
    cv2.setNumThreads(2)  # leave cores for the kiosk and DSF
    CFG.get()
    dsf_io.begin()  # subscription to the object model (instead of GET /machine/status)
    threading.Thread(target=watch_video, daemon=True).start()
    fire_watch.begin()  # fire and smoke watch (only with a laser job and if it is enabled)
    notified = False
    while True:
        try:
            srv = ThreadingHTTPServer((BIND, PORT), Handler)
            break
        except OSError as e:
            if not notified:
                log("el puerto %d esta ocupado (%s): si sigue el servicio viejo, detenerlo con "
                    "'sudo systemctl disable --now workshop-vision'. Reintento cada 30 s." % (PORT, e))
                notified = True
            time.sleep(30)
    srv.daemon_threads = True
    log("workshop-vision %s (OpenCV %s) en %s:%d" % (VERSION, cv2.__version__, BIND, PORT))
    srv.serve_forever()


if __name__ == "__main__":
    main()
