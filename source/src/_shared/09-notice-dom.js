      // ---- Notices by cause for the JS plugins (DWC 3.6): the twin of SessionNotice.vue / LockReason.vue (ESTANDAR 2.2, 2026-11-05) ----
      //
      // A JS plugin never paints its own notice colors or sentences: it asks for one of these elements. Same DOM and class names as the Vue pieces, the
      // look is design/family.css (inject it with workshopInjectFamily()). Texts: i18n block "notice" (same sentences as shared.notice_* of Vue).
      //   workshopNoticeKindOf({ reason, serviceDown, error })   "session" | "role" | "down" | "error" | ""   (reason = workshopAccessReason)
      //   workshopNoticeText(kind, needed)                        the one sentence of a cause; needed = a role id ("operator"...)
      //   workshopNoticeEl(kind, variant, opts)                   N2 note (variant "section") or N4 cover (variant "cover");
      //                                                           opts = { text, title, needed, action: "sign-in" | "retry" | "", onRetry }
      //   workshopReasonEl(kind, text)                            N3, the reason next to a disabled control or group (text optional)
      //   workshopLockReasonEl(op, need, ctx)                     N3 decided by the access rule of the operation; null when the person may

      var WORKSHOP_NOTICE_ICONS = {
        session: "mdi-account-lock-outline",
        role: "mdi-lock-outline",
        down: "mdi-power-plug-off-outline",
        error: "mdi-alert-circle-outline",
        empty: "mdi-information-outline",
        resolving: "mdi-timer-sand",
      };
      // ONE color per meaning (family.css --wf-c-<color>): sign in = info (blue), no permission = neutral (gray), wait / service down = warning, failure = error
      var WORKSHOP_NOTICE_COLORS = { session: "info", role: "neutral", down: "warning", error: "error", empty: "neutral", resolving: "neutral" };

      function workshopNoticeKindOf(o) {
        o = o || {};
        if (o.state === "resolving" || o.reason === "resolving") return "resolving"; // never red, never an alarm: the session is being checked
        if (o.reason === "signed_out") return "session";
        if (o.reason === "role") return "role";
        if (o.serviceDown) return "down";
        if (o.error) return "error";
        return "";
      }

      function workshopNoticeRoleName(role) {
        var known = { viewer: "notice.lockrole_viewer", operator: "notice.lockrole_operator", technician: "notice.lockrole_technician", admin: "notice.lockrole_admin" };
        return i18nT(known[role] || known.viewer);
      }

      // Pure: the catalog key of the sentence for a signed-out person, by state (the same ones as SessionNotice.vue)
      // base: a more specific sentence of a plugin for the plain "signed out" state ("Requires signing in to see the camera"); expired and locked keep the shared ones
      function workshopNoticeSessionKey(state, base) {
        if (state === "expired") return "notice.notice_session_expired";
        if (state === "pin-locked") return "notice.notice_pin_locked";
        return base || "notice.notice_session_reason";
      }

      // The sentence of a signed-out person for a plugin that names what needs the session: the state decides, the plugin only names the thing
      function workshopSessionSentence(base, params) {
        var state = typeof workshopSessionState === "function" ? workshopSessionState() : "";
        return i18nT(workshopNoticeSessionKey(state, base), params);
      }

      // The current state, as one short key for the elements that repaint only when it changes
      function workshopNoticeStamp() {
        var state = typeof workshopSessionState === "function" ? workshopSessionState() : "";
        return state + "|" + (typeof workshopRole === "function" ? workshopRole() : "");
      }

      // state (optional): a state already read; default = the state of the session now
      function workshopNoticeText(kind, needed, state) {
        state = state || (typeof workshopSessionState === "function" ? workshopSessionState() : "");
        if (kind === "resolving") return i18nT("notice.notice_resolving");
        if (kind === "session") return i18nT(workshopNoticeSessionKey(state));
        if (kind === "role") {
          var mine = typeof workshopRole === "function" ? workshopRole() : "";
          return i18nT("notice.notice_role_reason", { needed: workshopNoticeRoleName(needed || "technician"), role: workshopNoticeRoleName(mine) });
        }
        if (kind === "down") return i18nT("notice.notice_down_reason");
        return "";
      }

      // "Read only" note of a role that may look but not change (same sentence as shared.read_only_note of the Vue side)
      function workshopReadOnlyText() {
        return i18nT("notice.read_only_note");
      }

      function workshopNoticeDomEl(tag, cls, text) {
        if (typeof workshopInjectFamily === "function") workshopInjectFamily(); // the styles are design/family.css (once per page)
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text) e.textContent = text;
        return e;
      }

      function workshopNoticeIconEl(kind, cls) {
        var ic = workshopNoticeDomEl("span", cls + " mdi " + (WORKSHOP_NOTICE_ICONS[kind] || WORKSHOP_NOTICE_ICONS.error));
        ic.setAttribute("aria-hidden", "true");
        return ic;
      }

      function workshopNoticeCoverTitle(kind) {
        var keys = { session: "notice.notice_session_cover_title", role: "notice.notice_role_cover_title", down: "notice.notice_down_cover_title", error: "notice.notice_error_cover_title" };
        return keys[kind] ? i18nT(keys[kind]) : "";
      }

      // the action of a notice: sign-in (the same dialog as the chip) or retry; the default is the one of ESTANDAR 2.2 (cover only)
      function workshopNoticeAction(kind, variant, opts) {
        if (opts.action !== undefined && opts.action !== null) return opts.action;
        if (variant !== "cover") return "";
        return kind === "session" ? "sign-in" : kind === "down" ? "retry" : "";
      }

      function workshopNoticeButton(act, cls, opts) {
        var b = workshopNoticeDomEl("button", "wf-btn " + cls, act === "retry" ? i18nT("notice.notice_retry") : i18nT("notice.notice_sign_in"));
        b.type = "button";
        b.addEventListener("click", function () {
          if (act === "retry") {
            if (typeof opts.onRetry === "function") opts.onRetry();
          } else if (typeof workshopLogin === "function") {
            workshopLogin();
          }
        });
        return b;
      }

      function workshopNoticeEl(kind, variant, opts) {
        opts = opts || {};
        var cover = variant === "cover";
        var css = !cover && kind === "empty" ? "role" : kind;
        var box = workshopNoticeDomEl("div", (cover ? "wf-cover wf-cover--" : "wf-notice wf-notice--") + css);
        box.setAttribute("role", cover ? "status" : "note");
        box.appendChild(workshopNoticeIconEl(kind, cover ? "wf-cover-icon" : "wf-notice-icon"));
        var text = opts.text || (kind === "session" && cover ? i18nT("notice.notice_session_cover") : workshopNoticeText(kind, opts.needed));
        var act = workshopNoticeAction(kind, variant, opts);
        if (cover) {
          var title = opts.title || workshopNoticeCoverTitle(kind);
          if (title) box.appendChild(workshopNoticeDomEl("div", "wf-cover-title", title));
          if (text) box.appendChild(workshopNoticeDomEl("div", "wf-cover-text", text));
          if (act) box.appendChild(workshopNoticeButton(act, "wf-main", opts));
        } else {
          var body = workshopNoticeDomEl("div", "wf-notice-body");
          body.appendChild(workshopNoticeDomEl("div", "wf-notice-text", text));
          box.appendChild(body);
          if (act) box.appendChild(workshopNoticeButton(act, "wf-notice-action", opts));
        }
        return box;
      }

      function workshopReasonEl(kind, text) {
        var box = workshopNoticeDomEl("div", "wf-reason wf-reason--" + kind);
        box.setAttribute("role", "note");
        box.appendChild(workshopNoticeIconEl(kind, "wf-reason-icon"));
        box.appendChild(workshopNoticeDomEl("span", "wf-reason-text", text || workshopNoticeText(kind)));
        return box;
      }

      function workshopLockReasonEl(op, need, ctx) {
        var access = typeof workshopAccessState === "function" ? workshopAccessState(op, ctx) : "ok";
        var kind = access === "resolving" ? "resolving" : workshopNoticeKindOf({ reason: access === "session" ? "signed_out" : access === "role" ? "role" : "" });
        if (!kind) return null;
        return workshopReasonEl(kind, workshopNoticeText(kind, need));
      }
