"""
Direct ESP32-camera fallback for Vision (no OpenCV here, so it can be tested alone).

Vision reads its video from the camera relay of the Pi (WorkshopService, :8090), which keeps ONE
stream open to each ESP32-camera and serves it to every viewer. Which camera Vision looks at is an
id of the list of cameras (vision.json "camera", "main" by default); the list is the service's
(camera.status answers it, `cameras_of` reads that answer): Vision keeps no address of its own.
If the relay is not running (its plugin stopped, the service restarting...) Vision does not stay
blind: it asks the ESP32 itself, carefully, because an ESP32-camera serves one or two clients at a time:

  - snapshots (/capture) at a low rate (FALLBACK_FPS) instead of a second MJPEG stream, so the
    camera is never held by Vision and other viewers keep their share;
  - only while somebody asks for images (Vision already drops the stream after IDLE_S);
  - one reader per camera: the one whose id vision.json names (`direct_of` finds its address in the list);
  - exponential backoff when the camera does not answer, and the relay is looked at again every
    RELAY_PROBE_S so it takes the video back by itself.
"""
import json
import re
import urllib.parse

FALLBACK_FPS = 4.0   # snapshots per second in direct mode
RELAY_PROBE_S = 20   # in direct mode, how often the relay is looked at again
RELAY_FAULTS = 3     # failed reads in a row before the relay is declared down
BACKOFF_MAX_S = 15   # longest wait after a failed snapshot


def clean_id(raw):
    """Id of a camera as vision.json writes it: letters, digits, "_" and "-" (up to 40); "main" when there is none."""
    return re.sub(r"[^A-Za-z0-9_-]", "", str(raw or ""))[:40] or "main"


def relay_stream(relay, cid):
    """Address of the video of the camera `cid` in the relay `relay` ("http://127.0.0.1:<port>"): /stream for the main one, /c/<id>/stream for the rest."""
    return relay + ("/stream" if cid == "main" else "/c/%s/stream" % cid)


def relay_base(relay, cid):
    """Where the relay answers /status, /control and /snapshot of the camera `cid`."""
    return relay + ("" if cid == "main" else "/c/%s" % cid)


def cameras_of(answer):
    """The list of cameras in the text of the answer of camera.status (None when it is not an answer: the service does not reply)."""
    try:
        d = json.loads(str(answer or ""))
    except ValueError:
        return None
    cams = d.get("cameras") if isinstance(d, dict) else None
    return [c for c in cams if isinstance(c, dict)] if isinstance(cams, list) else None


def direct_of(cid, cameras, relay):
    """MJPEG URL of the ESP32-camera `cid` of the list (None if it is not known: not in the list, not an ESP32-camera, an address only a browser
    can resolve, or the address of the relay itself)."""
    for c in cameras or []:
        url = str(c.get("url") or "").strip()
        if c.get("id") != cid or not c.get("esp32") or not url or "[HOSTNAME]" in url:
            continue
        if urllib.parse.urlparse(url).port == urllib.parse.urlparse(relay).port:
            continue
        return url
    return None


def base_of(url_stream):
    """http://<ip> of the control server (port 80) of an ESP32-camera whose stream is on :81."""
    u = urllib.parse.urlparse(str(url_stream))
    return "%s://%s%s" % (u.scheme or "http", u.hostname, (":%d" % u.port) if u.port and u.port != 81 else "")


def capture_of(url_stream):
    return base_of(url_stream) + "/capture"


def wait_failure(n):
    """Seconds to wait after the n-th failed snapshot in a row: 2, 4, 8, 15, 15..."""
    return min(BACKOFF_MAX_S, 2 ** max(1, int(n)))


def pause_between_frames(t_start, now, fps=FALLBACK_FPS):
    """Seconds still to wait so snapshots do not go faster than fps."""
    return max(0.0, 1.0 / float(fps) - (now - t_start))
