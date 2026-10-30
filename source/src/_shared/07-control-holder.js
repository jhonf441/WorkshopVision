      // ---- Who has the control of the movement (F1-D of the redesign, 2026-10-21) ----
      // The service keeps ONE owner of the movement (motion_owner.py) and publishes it in plugins.WorkshopService.data.motion:
      // owner {origin, name, device (8 characters), since (epoch s), reason} and notice {kind: "taken_over", from_user,
      // from_device, by, at} for the previous owner after a take over. Same logic for the Vue pages in
      // vue/_shared/control-holder.js: keep them equal.
      //
      //   workshopControl()                  {held, mine, name, device, since, origin, reason} (held false = nobody has it)
      //   workshopControlText(c)             "Beto tiene el control desde las 14:32" | "Tienes el control" | ""
      //   workshopControlWho(c)              the name, or "otro dispositivo" when the service has no users
      //   workshopControlCanTake()           this person may take the control (technician or administrator)
      //   workshopControlTake(done)          motion.take_over; done(error or null) afterwards
      //   workshopControlTakeButton(done)    button "Tomar el control" with a double tap; null when it is not for this person
      //   workshopControlNotice(seen)        the take over notice addressed to THIS browser that was not shown yet, or null
      //
      // The control is "mine" when the published short device is the beginning of the id of this browser. An owner without a device
      // (an internal reservation of the service) is nobody's: it is shown as held, never as mine.
      var WORKSHOP_CONTROL_TAKE_S = 4;
      var WORKSHOP_CONTROL_ARM_MS = 4000;

      function workshopControlMine(owner) {
        var d = String((owner && owner.device) || "");
        if (!d) return false;
        var mine = typeof workshopAuthDevice === "function" ? String(workshopAuthDevice()) : "";
        return !!mine && mine.indexOf(d) === 0;
      }

      function workshopControl(motion) {
        var m = motion === undefined ? workshopMotion() : motion;
        var o = m && m.owner;
        if (!o || !o.origin) return { held: false, mine: false, name: "", device: "", since: 0, origin: "", reason: "" };
        return {
          held: true,
          mine: workshopControlMine(o),
          name: String(o.name || ""),
          device: String(o.device || ""),
          since: Number(o.since) || 0,
          origin: String(o.origin),
          reason: workshopServiceText(o.reason),
        };
      }

      function workshopControlWho(c) {
        return c && c.name ? c.name : String(i18nT("control.other_device"));
      }

      function workshopControlClock(epoch) {
        var d = new Date(epoch * 1000);
        return ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2);
      }

      function workshopControlText(c) {
        if (!c || !c.held) return "";
        if (c.mine) return String(i18nT("control.you_have_it"));
        // a holder without a name or a device is an internal reservation of the service: its own reason says it
        if (!c.name && !c.device) return c.reason;
        return String(i18nT(c.since ? "control.held_by_since" : "control.held_by", { who: workshopControlWho(c), since: c.since ? workshopControlClock(c.since) : "" }));
      }

      function workshopControlCanTake() {
        return typeof workshopCan === "function" ? workshopCan("motion.take_over") : false;
      }

      function workshopControlTake(done) {
        return workshopApi("motion.take_over", { origin: "jog", action: "move", text: "", seconds: WORKSHOP_CONTROL_TAKE_S }).then(
          function () {
            if (done) done(null);
          },
          function (e) {
            if (done) done(e || new Error("take_over"));
          }
        );
      }

      // Taking the control stops whoever has it: it asks for a second tap (the first one only arms the button).
      function workshopControlTakeButton(done) {
        if (!workshopControlCanTake()) return null;
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = i18nT("control.take");
        b.style.cssText = "flex:none;border:0;border-radius:6px;padding:3px 10px;font-size:11px;font-weight:600;cursor:pointer;background:#e65100;color:#fff;";
        var armedUntil = 0;
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (!armedUntil || Date.now() > armedUntil) {
            armedUntil = Date.now() + WORKSHOP_CONTROL_ARM_MS;
            b.textContent = i18nT("control.tap_again");
            setTimeout(function () {
              if (Date.now() >= armedUntil) {
                armedUntil = 0;
                b.textContent = i18nT("control.take");
              }
            }, WORKSHOP_CONTROL_ARM_MS + 50);
            return;
          }
          armedUntil = 0;
          b.textContent = i18nT("control.take");
          workshopControlTake(done);
        });
        return b;
      }

      // seen = {at: n} remembered by the caller, so each notice is shown once.
      function workshopControlNotice(seen) {
        var m = workshopMotion();
        var n = m && m.notice;
        if (!n || n.kind !== "taken_over" || !n.at) return null;
        if (seen && seen.at >= n.at) return null;
        var mine = typeof workshopAuthDevice === "function" ? String(workshopAuthDevice()) : "";
        if (!n.from_device || !mine || mine.indexOf(n.from_device) !== 0) return null;
        if (seen) seen.at = n.at;
        if (Date.now() / 1000 - n.at > 60) return null;
        return { by: n.by ? n.by : String(i18nT("control.other_device")), text: String(i18nT("control.taken_from_you", { who: n.by ? n.by : i18nT("control.other_device") })) };
      }
