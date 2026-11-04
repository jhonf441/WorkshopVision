      // ---- Notices about the session and about permissions (2026-11-03 redesign, after the way a cloud console says it) ----
      // The person must always know WHY something does not move, and it must look the same on every page:
      //   * ONE notice card: a lock icon, a bold title ("Sin permiso", "Sin sesión"), a description of what is missing and a button for what to do
      //     ("Iniciar sesión"), and a close cross when it is only information. Nothing else says it.
      //   1. While the service has users and this browser has no session: a permanent card "Sin sesión / Solo puedes mirar" with the sign-in button.
      //   2. A refusal (no session, role too low, ...): while signed out it is shown by THAT card (it swaps its text and blinks for a few seconds,
      //      workshopSessionAttention, also window.__workshop.sessionNeeded); signed in, a second card above it, 8 s (workshopToast, also
      //      window.__workshop.toast). Never two cards on top of each other.
      //   3. Every message the service writes for a refusal starts with "Sin permiso:" / "Not authorized:" (api.signInNeeded, api.forbidden_*).
      //      Whatever page prints one inline, in red or in its own way, is marked (data-workshop-permission, workshopPermissionMark, once a second):
      //      a "you need to sign in" sentence is hidden always (signed out: the card already says it; signed in: it is stale, the page just has not
      //      read again since the PIN), any other refusal (role, mode) is drawn like the card (amber edge), never as an error.
      // Look of the floating panels of DESIGN.md: dark window #1e272c, amber left border for "something to do".

      var WORKSHOP_NOTICE_CHIP_ID = "workshop-session-chip";
      var WORKSHOP_NOTICE_TOAST_ID = "workshop-toast";
      var WORKSHOP_NOTICE_STYLE_ID = "workshop-session-style";
      var workshopNoticeToastTimer = 0;
      var workshopAttentionTimer = 0;
      var WORKSHOP_LOCK_SVG =
        '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path fill="currentColor" d="M12 17a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm6-9h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z"/></svg>';

      // the sentences of a refusal: the service catalogs start them all the same way (and the older wording is still caught)
      var WORKSHOP_PERMISSION_RE = /(^|\s)(Sin permiso:|Not authorized:)|Necesitas iniciar sesi[oó]n \(usa el bot[oó]n de abajo\)|You need to sign in \(use the button below\)/;
      // the ones about the session itself (hidden: the card says it, or the person has already signed in)
      var WORKSHOP_LOGIN_RE = /Sin permiso: necesitas iniciar sesi[oó]n|Not authorized: you need to sign in|Necesitas iniciar sesi[oó]n \(usa el bot[oó]n de abajo\)|You need to sign in \(use the button below\)/;
      var WORKSHOP_PERMISSION_SELECTOR = ".v-alert, [role=alert], .error--text, .text-error, .mo-error, .wf-state, .v-messages__message, .v-snack__content";

      // a refusal text as { title, desc }: "No se pudo leer X: Error: Sin permiso: tu rol ..." -> "Sin permiso" / "Tu rol ..."; a text that is not a refusal has no title
      function workshopNoticeParts(text) {
        var t = String(text === null || text === undefined ? "" : text).replace(/\s+/g, " ").trim();
        var m = /(Sin permiso|Not authorized):\s*([\s\S]*)$/.exec(t);
        if (m) return { title: m[1], desc: workshopNoticeSentence(m[2]) };
        if (WORKSHOP_PERMISSION_RE.test(t)) return { title: workshopApiT("permissionTitle"), desc: workshopNoticeSentence(t.replace(/^.*?:\s*(Error:\s*)?/, "")) };
        return { title: "", desc: t };
      }

      function workshopNoticeSentence(s) {
        s = String(s || "").trim();
        return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
      }

      // "Sin sesión: solo puedes mirar." -> { title: "Sin sesión", desc: "Solo puedes mirar." }
      function workshopSessionParts() {
        var t = String(workshopApiT("signedOut") || "");
        var i = t.indexOf(":");
        return i > 0 ? { title: t.slice(0, i).trim(), desc: workshopNoticeSentence(t.slice(i + 1)) } : { title: t, desc: "" };
      }

      // marks (or unmarks) the elements under root that print a refusal; returns how many are marked now
      function workshopPermissionMark(root) {
        if (!root || typeof root.querySelectorAll !== "function") return 0;
        var list = root.querySelectorAll(WORKSHOP_PERMISSION_SELECTOR);
        var marked = 0;
        for (var i = 0; i < list.length && i < 400; i++) {
          var el = list[i];
          if (el.id === WORKSHOP_NOTICE_CHIP_ID || el.id === WORKSHOP_NOTICE_TOAST_ID) continue;
          var text = String(el.textContent || "");
          var hit = text.length < 600 && WORKSHOP_PERMISSION_RE.test(text);
          if (hit) {
            marked++;
            var kind = WORKSHOP_LOGIN_RE.test(text) ? "login" : "role";
            if (el.getAttribute("data-workshop-permission") !== kind) el.setAttribute("data-workshop-permission", kind);
          } else if (el.getAttribute("data-workshop-permission")) {
            el.removeAttribute("data-workshop-permission");
          }
        }
        return marked;
      }

      function workshopNoticeStyle() {
        if (document.getElementById(WORKSHOP_NOTICE_STYLE_ID)) return;
        var st = document.createElement("style");
        st.id = WORKSHOP_NOTICE_STYLE_ID;
        st.textContent =
          // an inline refusal of the role: drawn like the card (amber edge), never red ...
          "[data-workshop-permission='role']{color:#ffcc80!important;background-color:rgba(255,143,0,0.10)!important;border:1px solid rgba(255,143,0,0.45)!important;border-left:4px solid #ff8f00!important;}" +
          "[data-workshop-permission='role'] *{color:inherit!important;}" +
          // ... and the ones about the session are gone (the card says it, or the person already signed in)
          "[data-workshop-permission='login']{display:none!important;}" +
          "@keyframes workshop-session-blink{0%,100%{box-shadow:0 4px 18px rgba(0,0,0,0.5)}50%{box-shadow:0 0 0 4px rgba(255,143,0,0.75),0 4px 18px rgba(0,0,0,0.5)}}" +
          "@media (prefers-reduced-motion: reduce){#" + WORKSHOP_NOTICE_CHIP_ID + "{animation:none!important}}";
        document.head.appendChild(st);
      }

      function workshopNoticeRoot() {
        return document.fullscreenElement || document.body;
      }

      // the card: icon | title + description | button and cross. refs on card.__ws so the text can change later.
      function workshopNoticeCard(id, parts, opts) {
        opts = opts || {};
        var card = document.createElement("div");
        card.id = id;
        card.setAttribute("data-tp-panel", "1");
        card.style.cssText =
          "position:fixed;left:50%;transform:translateX(-50%);z-index:2147483645;width:min(560px,92vw);box-sizing:border-box;display:flex;align-items:center;gap:12px;" +
          "padding:10px 10px 10px 12px;background:#1e272c;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-left:4px solid #ff8f00;border-radius:8px;" +
          "font:12px/1.4 Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,0.5);bottom:" + (opts.bottom || 84) + "px;";
        var icon = document.createElement("div");
        icon.style.cssText = "flex:none;width:34px;height:34px;border-radius:50%;background:rgba(255,143,0,0.16);color:#ffb74d;display:flex;align-items:center;justify-content:center;";
        icon.innerHTML = WORKSHOP_LOCK_SVG;
        var body = document.createElement("div");
        body.style.cssText = "flex:1 1 auto;min-width:0;";
        var title = document.createElement("div");
        title.style.cssText = "font:600 13px/1.3 Roboto,Helvetica,Arial,sans-serif;color:#fff;";
        var desc = document.createElement("div");
        desc.style.cssText = "color:#b0bec5;overflow-wrap:anywhere;";
        body.appendChild(title);
        body.appendChild(desc);
        card.appendChild(icon);
        card.appendChild(body);
        card.__ws = { title: title, desc: desc, body: body };
        workshopNoticeCardSet(card, parts);
        if (opts.action) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.textContent = opts.action.label;
          btn.style.cssText =
            "background:#1976d2;color:#fff;border:0;border-radius:6px;padding:0 16px;min-height:36px;font:600 12px Roboto,Helvetica,Arial,sans-serif;" +
            "text-transform:uppercase;letter-spacing:0.4px;cursor:pointer;flex:none;";
          btn.addEventListener("click", opts.action.run);
          card.appendChild(btn);
        }
        if (opts.closable) {
          var x = document.createElement("button");
          x.type = "button";
          x.setAttribute("aria-label", workshopApiT("close"));
          x.textContent = "\u00d7";
          x.style.cssText = "flex:none;background:transparent;color:#b0bec5;border:0;font:400 20px/1 Roboto,Arial,sans-serif;width:32px;height:32px;cursor:pointer;";
          x.addEventListener("click", function () {
            if (card.parentNode) card.parentNode.removeChild(card);
          });
          card.appendChild(x);
        }
        return card;
      }

      function workshopNoticeCardSet(card, parts) {
        var ws = card.__ws;
        if (!ws) return;
        ws.title.textContent = parts.title || "";
        ws.title.style.display = parts.title ? "" : "none";
        ws.desc.textContent = parts.desc || "";
      }

      // the session needs attention: the card shows what was refused and blinks for 6 s, then goes back to its own words
      function workshopSessionAttention(text) {
        if (typeof document === "undefined" || !document.body) return false;
        try {
          workshopNoticeChipPaint();
        } catch (e) {
          /* only visual */
        }
        var card = document.getElementById(WORKSHOP_NOTICE_CHIP_ID);
        if (!card || !card.__ws) return false;
        workshopNoticeStyle();
        workshopNoticeCardSet(card, workshopNoticeParts(text || workshopApiT("signInNeeded")));
        card.setAttribute("role", "alert");
        card.style.animation = "workshop-session-blink 0.9s ease-in-out 4";
        clearTimeout(workshopAttentionTimer);
        workshopAttentionTimer = setTimeout(function () {
          var c = document.getElementById(WORKSHOP_NOTICE_CHIP_ID);
          if (!c || !c.__ws) return;
          workshopNoticeCardSet(c, workshopSessionParts());
          c.removeAttribute("role");
          c.style.animation = "";
        }, 6000);
        return true;
      }

      function workshopToast(text) {
        if (typeof document === "undefined" || !document.body || !text) return;
        // signed out: every refusal is about the session, and its card already says it: no second card on top of it
        if (typeof workshopSignedOut === "function" && workshopSignedOut() && workshopSessionAttention(text)) return;
        var old = document.getElementById(WORKSHOP_NOTICE_TOAST_ID);
        if (old) old.remove();
        clearTimeout(workshopNoticeToastTimer);
        var chipNow = document.getElementById(WORKSHOP_NOTICE_CHIP_ID);
        var lift = chipNow ? 84 + chipNow.offsetHeight + 8 : 92; // above the session card when it is there, never over it
        var box = workshopNoticeCard(WORKSHOP_NOTICE_TOAST_ID, workshopNoticeParts(text), { bottom: lift, closable: true });
        box.setAttribute("role", "status");
        workshopNoticeRoot().appendChild(box);
        workshopNoticeToastTimer = setTimeout(function () {
          box.remove();
        }, 8000);
      }

      function workshopNoticeChipPaint() {
        var out = typeof workshopSignedOut === "function" && workshopSignedOut();
        var show = out && !document.querySelector("[data-tp-pin]");
        if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
          if (out) document.documentElement.setAttribute("data-workshop-signed-out", "1");
          else document.documentElement.removeAttribute("data-workshop-signed-out");
        }
        var card = document.getElementById(WORKSHOP_NOTICE_CHIP_ID);
        if (!show) {
          if (card) card.remove();
          return;
        }
        var root = workshopNoticeRoot();
        if (card) {
          if (card.parentNode !== root) root.appendChild(card);
          return;
        }
        card = workshopNoticeCard(WORKSHOP_NOTICE_CHIP_ID, workshopSessionParts(), {
          bottom: 84,
          action: {
            label: workshopApiT("signInAction"),
            run: function () {
              if (typeof workshopLogin === "function") workshopLogin();
            },
          },
        });
        root.appendChild(card);
      }

      (function workshopNoticeStart() {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        // one card and one timer for all the plugins of the page; they go when the last of them stops (workshopSharedUse, 30-lifecycle.js)
        workshopSharedUse("session-notice", function () {
          // the session changes without any event the page could hear (token cleared, tab restored): looking once a second is enough
          var timer = setInterval(function () {
            try {
              workshopNoticeChipPaint();
              workshopNoticeStyle();
              workshopPermissionMark(document.body);
            } catch (e) {
              /* only visual */
            }
          }, 1000);
          // the Vue pages ask for the notice through the registry (10-registry.js builds window.__workshop)
          var offered = false;
          var offer = setTimeout(function () {
            if (window.__workshop && !window.__workshop.toast) {
              window.__workshop.toast = workshopToast;
              window.__workshop.sessionNeeded = workshopSessionAttention;
              offered = true;
            }
          }, 0);
          return function () {
            clearInterval(timer);
            clearTimeout(offer);
            clearTimeout(workshopNoticeToastTimer);
            clearTimeout(workshopAttentionTimer);
            if (offered && window.__workshop && window.__workshop.toast === workshopToast) {
              delete window.__workshop.toast;
              delete window.__workshop.sessionNeeded;
            }
            if (document.documentElement && typeof document.documentElement.removeAttribute === "function") document.documentElement.removeAttribute("data-workshop-signed-out");
            [WORKSHOP_NOTICE_CHIP_ID, WORKSHOP_NOTICE_TOAST_ID, WORKSHOP_NOTICE_STYLE_ID].forEach(function (id) {
              var n = document.getElementById(id);
              if (n && n.parentNode) n.parentNode.removeChild(n);
            });
          };
        });
      })();
