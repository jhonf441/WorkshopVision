"""Messages (messages.Msg) inside data that leaves the process as JSON without a request language: plugin data published to
the object model, rows written to a file. The same file is in WorkshopVision and WorkshopRS485: keep them equal.

    split(obj)  every message at key "k" of a dict becomes two texts: "k" in Spanish (what macros and old readers already read)
                and "k_en" in English; a list of messages becomes two lists. The page shows "k_en" when DWC is in English
                (the same convention as reason / reason_en of the service).
    join(obj)   the way back for rows read from a file: "k" + "k_en" -> one message with both texts (messages.B), so the answer
                of a request is localized like any other message.
    error_text(e)  the text of an exception: the message itself when the exception was raised with one (str(e) would lose
                   its key and leave only the Spanish text).
"""
from messages import B, Msg

SUFFIX_EN = "_en"


def error_text(e):
    args = getattr(e, "args", ())
    if len(args) == 1 and isinstance(args[0], Msg):
        return args[0]
    return str(e)


def _is_msg_list(v):
    return isinstance(v, (list, tuple)) and any(isinstance(x, Msg) for x in v) and all(isinstance(x, str) for x in v)


def _es(v):
    return v.text("es") if isinstance(v, Msg) else v


def _en(v):
    return v.text("en") if isinstance(v, Msg) else v


def split(obj):
    """A copy of obj where every message is a Spanish text plus its English one (see the module docstring)."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(v, Msg):
                out[k] = v.text("es")
                out[str(k) + SUFFIX_EN] = v.text("en")
            elif _is_msg_list(v):
                out[k] = [_es(x) for x in v]
                out[str(k) + SUFFIX_EN] = [_en(x) for x in v]
            else:
                out[k] = split(v)
        return out
    if isinstance(obj, (list, tuple)):
        return [split(v) for v in obj]
    if isinstance(obj, Msg):
        return obj.text("es")
    return obj


def join(obj):
    """The way back of split(): "k" + "k_en" become one message with both texts."""
    if isinstance(obj, dict):
        out = {}
        for k, v in obj.items():
            if isinstance(k, str) and k.endswith(SUFFIX_EN) and k[:-len(SUFFIX_EN)] in obj:
                continue
            en = obj.get(str(k) + SUFFIX_EN)
            if isinstance(v, str) and isinstance(en, str):
                out[k] = B(v, en)
            elif isinstance(v, list) and isinstance(en, list) and len(v) == len(en) \
                    and all(isinstance(x, str) for x in v + en):
                out[k] = [B(a, b) for a, b in zip(v, en)]
            else:
                out[k] = join(v)
        return out
    if isinstance(obj, list):
        return [join(v) for v in obj]
    return obj
