"""Network guards of the Vision server: CORS origin rule and the key rule when the camera relay does not answer.

    cors_origin(origin, host_header)  -> the Origin to echo, or None
    is_loopback(address)              -> True for 127.0.0.1 / ::1 / ::ffff:127.0.0.1
    key_decision(error, client_ip)    -> whether to let a request through when the relay could not be asked

Same rule as the camera relay (port 8090): a page of another site must not read the answers or act through the
browser, and a failure of the relay never opens the door to the network (it fails closed, loopback still passes).
"""
import ipaddress
import urllib.parse


def _host_of_header(host_header):
    """Host name of a Host header value (no port, no brackets), lower case; "" if there is none."""
    h = str(host_header or "").strip().lower()
    if not h:
        return ""
    if h.startswith("["):
        return h[1:h.find("]")] if "]" in h else ""
    return h.rsplit(":", 1)[0] if h.count(":") == 1 else h


def cors_origin(origin, host_header):
    """The Origin only if its host is the host the request was made to (any port, http/https): the own DWC.
    Returns the origin to put in Access-Control-Allow-Origin, or None (no header: the browser blocks the read)."""
    if not origin:
        return None
    try:
        u = urllib.parse.urlsplit(str(origin))
        host = (u.hostname or "").lower()
        scheme = u.scheme
        u.port  # raises ValueError on a bad port
    except ValueError:
        return None
    if scheme not in ("http", "https") or not host:
        return None
    if host != _host_of_header(host_header):
        return None
    return str(origin)


def is_loopback(address):
    try:
        ip = ipaddress.ip_address(str(address or "").split("%", 1)[0])
    except ValueError:
        return False
    if getattr(ip, "ipv4_mapped", None):
        ip = ip.ipv4_mapped
    return ip.is_loopback


def key_decision(error, client_ip):
    """Answer when the relay could not be asked (error is not None): fail closed, except for the Pi itself."""
    return is_loopback(client_ip) if error is not None else None
