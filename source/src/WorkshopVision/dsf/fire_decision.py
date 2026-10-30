"""
Decision logic of the fire and smoke watch, without a camera or OpenCV
(2026-10-12, item 7 of the diagnosis: "it paused 2 times for SMOKE during a
real job, false positives, with no prior notice").

fire_watch.py measures each image (flame fraction, contrast, mean brightness and
contrast per cell) and passes the numbers to Decider.step(); the Decider
says what to do. This way the decision is tested without a camera (tests/test_fire_decision.py).

What changed from before (fire_watch.py compared everything with the first 3
seconds of the job and paused instantly):

  persistence with hysteresis  a frame counts as "continues" if the level
                       is above 60 % of the threshold, but it only adds time if
                       it is above the threshold; below 60 % it
                       goes back to zero. Smoke needs much more time than
                       flame (8 s on average; before 2 s).
  moving reference     the reference contrast is the median of what was
                       seen between 90 and 30 s ago (at the start, the
                       first 3 s; before it was always that). The 30 s delay
                       makes new smoke not enter the
                       reference before detecting it (8 s + the countdown).
                       With the camera on the bridge or the carriage the image
                       changes throughout the job; a slow or scene change
                       is no longer compared forever with the start.
  smoke = uniform gray the image contrast drops AND that of almost all the
                       cells of a grid (smoke covers everything; a change of
                       material or a shadow, one part) AND the image did not
                       get darker (a very bright laser spot makes
                       the camera lower the exposure: everything darkens and the
                       contrast drops, but it is not smoke).
  smoke only notifies  by default smoke alone (without flame) notifies and does not pause
                       (setting smoke_acts).
  countdown            before pausing or cutting: a deadline with the detection
                       being confirmed. If it disappears for more than 1.5 s in a row, or
                       at the end it was present for less than half the deadline,
                       it does not act. It can be cancelled.
                       User's decision (2026-10-12): the FLAME (real fire)
                       no longer waits 10 s: deadline_flame, 2 s by default
                       (0 = immediate, up to 3 s) with a cancel button; the SMOKE
                       keeps the 10 s countdown (plazo).
  padlock              during a job, besides the action and the on/off,
                       the sensitivity and the deadlines ask for the confirmation
                       "Understood" and are announced to the service before saving.

"""
import math

from messages import J, M

ACTIONS = ("notify", "pause", "emergency")
# flame: minimum fraction of the image; seg: consecutive seconds of flame;
# smoke: minimum drop of the contrast; sec_smoke: consecutive seconds of smoke
SENS = {
    "low": {"flame": 0.002, "sec": 3.0, "smoke": 0.50, "sec_smoke": 12.0},
    "media": {"flame": 0.0007, "sec": 2.0, "smoke": 0.40, "sec_smoke": 8.0},
    "high": {"flame": 0.0003, "sec": 1.2, "smoke": 0.30, "sec_smoke": 5.0},
}
DEADLINE_DEF = 10.0  # s of SMOKE countdown before pausing / cutting
DEADLINE_MAX = 60.0
DEADLINE_FLAME_DEF = 2.0  # s of FLAME countdown (0 = immediate action)
DEADLINE_FLAME_MAX = 3.0
HYSTERESIS = 0.6  # below this level (fraction of the threshold) the detection turns off
GAP_COUNT = 1.5  # consecutive s without detection that cancel the countdown
PRESENCE_MIN = 0.5  # fraction of the deadline with detection to act at the end
WAIT_REPEAT = 60.0  # s without alarms after an alarm or after cancelling
REF_WINDOW = 90.0  # s of history for the contrast reference
REF_DELAY = 30.0  # s: the newest does not enter the reference (the smoke that is starting)
REF_MIN = 6  # minimum frames to have a reference
CELL_MIN_STD = 4.0  # a cell smoother than this is no good for measuring smoke
CELLS_MIN = 4  # cells with detail needed to decide smoke
CELLS_FRAC = 0.75  # fraction of cells that have to lose contrast
DARK_MAX = 0.20  # if the mean brightness drops more than this, it is not smoke (exposure)
NAME = {"flame": M("fire_decision_flame"), "smoke": M("fire_decision_smoke")}
# what the action would have done ("no se pausa" / "no se corta")
VERB = {"pause": M("fire_decision_verb_pause"), "emergency": M("fire_decision_verb_cut")}


def _median(v):
    v = sorted(v)
    n = len(v)
    if not n:
        return None
    return v[n // 2] if n % 2 else (v[n // 2 - 1] + v[n // 2]) / 2.0


def deadline_valid(p):
    try:
        p = float(p)
    except (TypeError, ValueError):
        return DEADLINE_DEF
    if math.isnan(p) or p < 0:
        return DEADLINE_DEF
    return min(DEADLINE_MAX, p)


def deadline_flame_valid(p):
    try:
        p = float(p)
    except (TypeError, ValueError):
        return DEADLINE_FLAME_DEF
    if math.isnan(p) or p < 0:
        return DEADLINE_FLAME_DEF
    return min(DEADLINE_FLAME_MAX, p)


class Reference:
    """Contrast, brightness and contrast per cell seen between REF_WINDOW and
    REF_DELAY s ago (at the start, the first REF_MIN frames)."""

    def __init__(self):
        self.h = []  # (t, contraste, media, celdas)

    def add_item(self, t, contrast, media, cells):
        self.h.append((t, contrast, media, list(cells or [])))
        while self.h and t - self.h[0][0] > REF_WINDOW:
            self.h.pop(0)

    def items(self):
        return len(self.h) >= REF_MIN

    def value_list(self, t):
        """(contrast, mean, [contrast per cell]) of reference, or None."""
        if not self.items():
            return None
        h = [x for x in self.h if t - x[0] >= REF_DELAY]
        if len(h) < REF_MIN:
            h = self.h[:REF_MIN]
        c = _median([x[1] for x in h])
        m = _median([x[2] for x in h])
        n = min(len(x[3]) for x in h)
        cells = [_median([x[3][i] for x in h]) for i in range(n)]
        return c, m, cells


def level_smoke(contrast, media, cells, ref, h):
    """(level, reason). level = contrast drop / threshold h (1 = threshold),
    0 if the other conditions are not met (reason says which)."""
    if ref is None:
        return 0.0, M("fire_decision_no_reference")
    rc, rm, rcel = ref
    if rc is None or rc <= 5:
        return 0.0, M("fire_decision_image_without_detail_to_measure")
    drop = 1.0 - contrast / rc
    if drop <= 0:
        return 0.0, ""
    if rm and media < rm * (1.0 - DARK_MAX):
        return 0.0, M("fire_decision_the_image_got_darker")
    useful = [(c, r) for c, r in zip(cells or [], rcel) if r is not None and r >= CELL_MIN_STD]
    if len(useful) < CELLS_MIN:
        return 0.0, M("fire_decision_few_zones_with_detail")
    low = sum(1 for c, r in useful if 1.0 - c / r >= h * HYSTERESIS)
    if low < CELLS_FRAC * len(useful):
        return 0.0, M("fire_decision_the_contrast_dropped_only", low=low, total=len(useful))
    return drop / h, ""


class Decider:
    """One instance per job. step() with each measured image; returns a
    list of events (dict with "ev"):

      referencia  it already has the reference image
      deteccion   the flame or smoke lasted what was asked (type, reason, values)
      aviso       avisar action (or smoke with smoke_acts off): only notify
      cuenta      the countdown starts (deadline, action)
      actuar      the countdown ended and the detection continued: do the action
      cancelada   the countdown was cancelled (reason: disappeared / little presence / user)
      ignorada    detection during the wait after another alarm
    """

    def __init__(self, sensitivity="media", action="pause", deadline=DEADLINE_DEF, smoke_acts=False, deadline_flame=DEADLINE_FLAME_DEF):
        self.configure(sensitivity, action, deadline, smoke_acts, deadline_flame)
        self.ref = Reference()
        self.ref_notified = False
        self.acum = {"flame": 0.0, "smoke": 0.0}
        self.count = None  # {tipo, desde, hasta, presente, total, hueco, accion}
        self.wait_until = 0.0
        self.ignored_annotated = False  # a single "ignorada" per wait (do not fill the log)
        self.t_ant = None
        self.last_one = {"flame": 0.0, "smoke": 0.0, "reason_smoke": ""}

    def configure(self, sensitivity, action, deadline=DEADLINE_DEF, smoke_acts=False, deadline_flame=DEADLINE_FLAME_DEF):
        self.sens = sensitivity if sensitivity in SENS else "media"
        self.action = action if action in ACTIONS else "pause"
        self.deadline = deadline_valid(deadline)  # humo
        self.deadline_flame = deadline_flame_valid(deadline_flame)
        self.smoke_acts = bool(smoke_acts)

    def _deadline_for(self, type_name):
        return self.deadline_flame if type_name == "flame" else self.deadline

    def _action_for(self, type_name):
        if type_name == "smoke" and not self.smoke_acts:
            return "notify"
        return self.action

    def step(self, t, flame, contrast, media, cells):
        s = SENS[self.sens]
        dt = 0.0 if self.t_ant is None else max(0.0, min(2.0, t - self.t_ant))
        self.t_ant = t
        ev = []
        ref = self.ref.value_list(t)
        self.ref.add_item(t, contrast, media, cells)
        if ref is None:
            return ev
        if not self.ref_notified:
            self.ref_notified = True
            ev.append({"ev": "reference", "contrast": round(ref[0], 1)})
        niv = {"flame": flame / s["flame"] if s["flame"] else 0.0}
        niv["smoke"], reason_smoke = level_smoke(contrast, media, cells, ref, s["smoke"])
        self.last_one = {"flame": niv["flame"], "smoke": niv["smoke"], "reason_smoke": reason_smoke, "ref": ref[0]}
        value_list = {"flame": round(flame, 5), "threshold_flame": s["flame"], "contrast": round(contrast, 1),
                   "contrast_ref": round(ref[0], 1), "media": round(media, 1), "media_ref": round(ref[1] or 0, 1)}

        # countdown in progress: the detection has to continue
        if self.count:
            c = self.count
            n = niv[c["kind"]]
            c["total"] += dt
            if n >= 1.0:
                c["present"] += dt
            c["gap"] = 0.0 if n >= HYSTERESIS else c["gap"] + dt
            if c["gap"] >= GAP_COUNT:
                ev.append(self._cancel(t, "desaparecio", value_list, waiting=False))
            elif t >= c["until"]:
                frac = c["present"] / c["total"] if c["total"] > 0 else 0.0
                if frac >= PRESENCE_MIN:
                    ev.append({"ev": "act", "kind": c["kind"], "action": c["action"], "presence": round(frac, 2), "values": value_list,
                               "reason": M("fire_decision_continued_after_being_detected", name=NAME[c["kind"]], seconds=round(c["total"]), pct=round(frac * 100))})
                    self.count = None
                    self.wait_until = t + WAIT_REPEAT
                    self.ignored_annotated = False
                else:
                    ev.append(self._cancel(t, "poca presencia", value_list, waiting=False, frac=frac))
            return ev

        for type_name in ("flame", "smoke"):
            n = niv[type_name]
            if n >= 1.0:
                self.acum[type_name] += dt
            elif n < HYSTERESIS:
                self.acum[type_name] = 0.0
            sec = s["sec"] if type_name == "flame" else s["sec_smoke"]
            if self.acum[type_name] < sec:
                continue
            self.acum = {"flame": 0.0, "smoke": 0.0}
            reason = (M("fire_decision_flame_in_of_the_image", pct=flame * 100, threshold=s["flame"] * 100, sec=sec)
                      if type_name == "flame" else
                      M("fire_decision_contrast_against_reference", contrast=contrast, ref=ref[0], drop=round((1 - contrast / ref[0]) * 100),
                        threshold=round(s["smoke"] * 100), sec=sec))
            if t < self.wait_until:
                if not self.ignored_annotated:
                    self.ignored_annotated = True
                    ev.append({"ev": "ignored", "kind": type_name, "reason": J([reason, M("fire_decision_within_the_wait_after", wait=WAIT_REPEAT)], "; "), "values": value_list})
                break
            action = self._action_for(type_name)
            ev.append({"ev": "detection", "kind": type_name, "reason": reason, "action": action, "values": value_list})
            if action == "notify":
                ev.append({"ev": "notice", "kind": type_name, "reason": reason, "values": value_list,
                           "per": M("fire_decision_smoke_only_notifies") if type_name == "smoke" and self.action != "notify" else M("fire_decision_action_only_notify")})
                self.wait_until = t + WAIT_REPEAT
                self.ignored_annotated = False
            elif self._deadline_for(type_name) <= 0:
                ev.append({"ev": "act", "kind": type_name, "action": action, "presence": 1.0, "values": value_list, "reason": J([reason, M("fire_decision_no_countdown")], "; ")})
                self.wait_until = t + WAIT_REPEAT
                self.ignored_annotated = False
            else:
                self.count = {"kind": type_name, "since": t, "until": t + self._deadline_for(type_name), "present": 0.0, "total": 0.0, "gap": 0.0, "action": action, "reason": reason}
                ev.append({"ev": "count", "kind": type_name, "action": action, "deadline": self._deadline_for(type_name), "reason": reason, "values": value_list})
            break
        return ev

    def _cancel(self, t, reason, value_list=None, waiting=True, frac=None):
        c = self.count
        self.count = None
        self.acum = {"flame": 0.0, "smoke": 0.0}
        if waiting:
            self.wait_until = t + WAIT_REPEAT
            self.ignored_annotated = False
        verb = VERB["pause"] if c["action"] == "pause" else VERB["emergency"]
        # reason is a code ("desaparecio", "poca presencia", "user": the "per" of the event) or already a text
        txt = {"desaparecio": M("fire_decision_disappeared_during_the_countdown", name=NAME[c["kind"]], verb=verb),
               "poca presencia": M("fire_decision_was_present_only", name=NAME[c["kind"]], pct=round((frac or 0) * 100), verb=verb),
               "user": M("fire_decision_cancelled_by_the_user", verb=verb, wait=WAIT_REPEAT)}.get(reason, reason)
        return {"ev": "cancelled", "kind": c["kind"], "action": c["action"], "reason": txt, "per": reason, "values": value_list or {}}

    def cancel(self, t):
        """The user cancels the countdown. None if there was none."""
        if not self.count:
            return None
        return self._cancel(t, "user")

    def state_count(self, t):
        c = self.count
        if not c:
            return None
        return {"kind": c["kind"], "action": c["action"], "deadline": round(c["until"] - c["since"], 1),
                "left": max(0, int(math.ceil(c["until"] - t))), "reason": c["reason"],
                "present": round(c["present"] / c["total"], 2) if c["total"] > 0 else 1.0}


class Padlock:
    """The action, the on/off, the sensitivity and the deadlines stay fixed
    during a job: a change in vision.json in the middle of a job only
    counts if the page confirmed it beforehand (confirm(), with the
    "Understood" checkbox). Otherwise, the start's values are kept until the
    job ends, and it is noted."""

    KEYS = ("action", "active", "sensitivity", "deadline", "deadline_flame")
    VALIDITY = 60.0  # s that a confirmation is valid

    def __init__(self):
        self.fixed = None
        self.confirmed = None  # (dict, vence)
        self.notified = {}

    def begin(self, cfg):
        self.fixed = {k: cfg.get(k) for k in self.KEYS}
        self.notified = {}

    def finish(self):
        self.fixed = None
        self.notified = {}

    def confirm(self, changes, t):
        changes = {k: v for k, v in (changes or {}).items() if k in self.KEYS}
        if not changes:
            raise ValueError(M("fire_decision_nothing_to_confirm", accepted=", ".join(self.KEYS)))
        if "action" in changes and changes["action"] not in ACTIONS:
            raise ValueError(M("fire_decision_invalid_action", value=changes["action"]))
        if "sensitivity" in changes and changes["sensitivity"] not in SENS:
            raise ValueError(M("fire_decision_invalid_sensitivity", value=changes["sensitivity"]))
        if "active" in changes:
            changes["active"] = bool(changes["active"])
        if "deadline" in changes:
            changes["deadline"] = deadline_valid(changes["deadline"])
        if "deadline_flame" in changes:
            changes["deadline_flame"] = deadline_flame_valid(changes["deadline_flame"])
        self.confirmed = (changes, t + self.VALIDITY)
        return changes

    def current(self, cfg, t):
        """(cfg with the action and the on/off that are valid now, events)."""
        if self.fixed is None:
            return dict(cfg), []
        ev = []
        out = dict(cfg)
        for k in self.KEYS:
            new = cfg.get(k)
            if new == self.fixed[k]:
                self.notified.pop(k, None)
                continue
            conf = self.confirmed
            if conf and t <= conf[1] and k in conf[0] and conf[0][k] == new:
                ev.append({"ev": "change_confirmed", "key": k, "before": self.fixed[k], "now": new})
                self.fixed[k] = new
                self.notified.pop(k, None)
                continue
            out[k] = self.fixed[k]
            if self.notified.get(k) != new:
                self.notified[k] = new
                ev.append({"ev": "change_unconfirmed", "key": k, "before": self.fixed[k], "now": new})
        return out, ev

    def pending(self, cfg):
        """{key: saved value that is not valid yet} during a job."""
        if self.fixed is None:
            return {}
        return {k: cfg.get(k) for k in self.KEYS if cfg.get(k) != self.fixed[k]}
