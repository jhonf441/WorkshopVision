"""
Direct ESP32-camera fallback for Vision (no OpenCV here, so it can be tested alone).

Vision reads its video from the camera relay of the Pi (WorkshopService, :8090), which keeps ONE
stream open to each ESP32-camera and serves it to every viewer. If the relay is not running (its
plugin stopped, the service restarting...) Vision does not stay blind: it asks the ESP32 itself,
carefully, because an ESP32-camera serves one or two clients at a time:

  - snapshots (/capture) at a low rate (FALLBACK_FPS) instead of a second MJPEG stream, so the
    camera is never held by Vision and other viewers keep their share;
  - only while somebody asks for images (Vision already drops the stream after IDLE_S);
  - one reader per camera: the camera Vision uses is the one its relay URL points to
    (/c/<id>/stream = that camera of cameras.json, anything else = the main one);
  - exponential backoff when the camera does not answer, and the relay is looked at again every
    RELAY_PROBE_S so it takes the video back by itself.
"""
import json
import os
import re
import urllib.parse

FALLBACK_FPS = 4.0   # snapshots per second in direct mode
RELAY_PROBE_S = 20   # in direct mode, how often the relay is looked at again
RELAY_FAULTS = 3     # failed reads in a row before the relay is declared down
BACKOFF_MAX_S = 15   # longest wait after a failed snapshot


def _json(path):
    try:
        with open(path, encoding="utf-8") as f:
            d = json.load(f)
        return d if isinstance(d, dict) else {}
    except Exception:
        return {}


def camera_id(url_relay):
    """Id of the camera a relay URL asks for: '/c/<id>/stream' -> id, anything else -> 'main'."""
    m = re.search(r"/c/([^/?#]+)/", urllib.parse.urlparse(str(url_relay or "")).path + "/")
    return urllib.parse.unquote(m.group(1)) if m else "main"


def direct_of(url_relay, sd):
    """MJPEG URL of the ESP32-camera behind a relay URL (None if it is not known).
    sd = the SD folder (/opt/dsf/sd): config/service.json (main camera) and config/cameras.json."""
    cfg = os.path.join(sd, "sys", "workshop", "config")
    cid = camera_id(url_relay)
    if cid == "main":
        u = str(_json(os.path.join(cfg, "service.json")).get("camera_relay", {}).get("url") or "").strip()
        if u:
            return u
    for c in _json(os.path.join(cfg, "cameras.json")).get("cameras") or []:
        if isinstance(c, dict) and c.get("id") == cid and c.get("esp32", True) and str(c.get("url") or "").strip():
            return str(c["url"]).strip()
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
