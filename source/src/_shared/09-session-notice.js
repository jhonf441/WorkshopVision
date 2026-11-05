      // ---- Notices about the session and about permissions (AWS style: the reason is NEXT TO the thing, no fixed card; ESTANDAR 2) ----
      // The person must always know WHY something does not move, and it must look the same on every page (the look is design/family.css, nothing is painted here):
      //   1. No floating card while nobody is signed in. Each page says it itself where it matters: its bar carries ONE "Sin sesión · Iniciar sesión" chip
      //      (.wf-session-chip: PageHeader.vue draws it; a page whose bar is built by hand gets the same chip from here, workshopSessionBarChip) and every
      //      control that needs a session is disabled with its own reason next to it (09-notice-dom.js).
      //   2. A refusal (no session, role too low, ...) is ONE card (.wf-toast) that stays until the person closes it or signs in, with the sign-in button when
      //      the session is what is missing (workshopToast, also window.__workshop.toast / sessionNeeded). A plain message ("Saved") goes away after 8 s.
      //   3. Every message the service writes for a refusal starts with "Sin sesión:" / "Not signed in:" (the session) or "Sin permiso:" / "Not authorized:"
      //      (role, mode). Whatever page prints one inline is marked (data-workshop-permission = "session" | "role", once a second): family.css draws it calm
      //      (never red) and hides the session one once the person signed in (it is stale). The text of older services is still caught.

      var WORKSHOP_NOTICE_CHIP_ID = "workshop-session-chip";
      var WORKSHOP_NOTICE_TOAST_ID = "workshop-toast";
      var WORKSHOP_NOTICE_STYLE_ID = "workshop-session-style"; // the style of older bundles: removed when found
      var workshopNoticeToastTimer = 0;
      // the sentences of a refusal: the service catalogs start them all the same way (and the older wording is still caught)
      var WORKSHOP_PERMISSION_RE = /(^|\s)(Sin permiso:|Not authorized:|Sin sesi[oó]n:|Not signed in:)|Necesitas iniciar sesi[oó]n \(usa el bot[oó]n de abajo\)|You need to sign in \(use the button below\)/;
      // the ones about the session itself (calm blue while signed out, hidden once signed in); the older "Sin permiso: necesitas iniciar sesion" is still caught
      var WORKSHOP_LOGIN_RE = /(^|\s)(Sin sesi[oó]n:|Not signed in:)|Sin permiso: necesitas iniciar sesi[oó]n|Not authorized: you need to sign in|Necesitas iniciar sesi[oó]n \(usa el bot[oó]n de abajo\)|You need to sign in \(use the button below\)/;
      var WORKSHOP_PERMISSION_SELECTOR = ".v-alert, [role=alert], .error--text, .text-error, .mo-error, .wf-state, .v-messages__message, .v-snack__content, .ctl-alert, [class*=alert], [class*=-error]";

      // a refusal text as { title, desc }: "No se pudo leer X: Error: Sin permiso: tu rol ..." -> "Sin permiso" / "Tu rol ..."; a text that is not a refusal has no title
      function workshopNoticeParts(text) {
        var t = String(text === null || text === undefined ? "" : text).replace(/\s+/g, " ").trim();
        var m = /(Sin permiso|Not authorized|Sin sesi[oó]n|Not signed in):\s*([\s\S]*)$/.exec(t);
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
            var kind = WORKSHOP_LOGIN_RE.test(text) ? "session" : "role";
            if (el.getAttribute("data-workshop-permission") !== kind) el.setAttribute("data-workshop-permission", kind);
          } else if (el.getAttribute("data-workshop-permission")) {
            el.removeAttribute("data-workshop-permission");
          }
        }
        return marked;
      }

      function workshopNoticeRoot() {
        return document.fullscreenElement || document.body;
      }

      // the card (.wf-toast, family.css): icon | title + description | button and cross. refs on card.__ws so the text can change later.
      // opts: { kind: "session" | "role", bottom, action: { label, run }, closable }
      function workshopNoticeCard(id, parts, opts) {
        opts = opts || {};
        var card = document.createElement("div");
        card.id = id;
        card.className = "wf-toast wf-toast--" + (opts.kind || "role");
        card.setAttribute("data-tp-panel", "1");
        card.style.cssText = "bottom:" + (opts.bottom || 84) + "px;";
        var icon = document.createElement("div");
        icon.className = "wf-toast-icon";
        var mark = document.createElement("span");
        mark.className = "mdi " + (opts.kind === "session" ? "mdi-account-lock-outline" : "mdi-lock-outline");
        mark.setAttribute("aria-hidden", "true");
        icon.appendChild(mark);
        var body = document.createElement("div");
        body.className = "wf-toast-body";
        var title = document.createElement("div");
        title.className = "wf-toast-title";
        var desc = document.createElement("div");
        desc.className = "wf-toast-desc";
        body.appendChild(title);
        body.appendChild(desc);
        card.appendChild(icon);
        card.appendChild(body);
        card.__ws = { title: title, desc: desc, body: body };
        workshopNoticeCardSet(card, parts);
        if (opts.action) {
          var btn = document.createElement("button");
          btn.type = "button";
          btn.className = "wf-btn wf-main";
          btn.textContent = opts.action.label;
          btn.addEventListener("click", opts.action.run);
          card.appendChild(btn);
        }
        if (opts.closable) {
          var x = document.createElement("button");
          x.type = "button";
          x.className = "wf-toast-close";
          x.setAttribute("aria-label", workshopApiT("close"));
          x.textContent = "×";
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
        ws.title.style.display = parts.title ? "" : "none"; // (the only inline style: a title that is not there takes no room)
        ws.desc.textContent = parts.desc || "";
      }

      // a refusal: one card that stays until it is closed (or the person signs in); the page asks for it through window.__workshop.sessionNeeded
      function workshopSessionAttention(text) {
        if (typeof document === "undefined" || !document.body) return false;
        if (text) workshopToast(text);
        else workshopRefusalToast("session");
        return true;
      }

      // A refusal told from the catalog (never from a hardcoded sentence): kind = "session" | "role", the same title and sentence as the notices of the pages.
      // It stays until it is closed or the person signs in; the sign-in button is offered when the session is what is missing.
      function workshopRefusalToast(kind, needed) {
        if (typeof document === "undefined" || !document.body) return;
        var parts = { title: workshopNoticeCoverTitle(kind), desc: workshopNoticeText(kind, needed) };
        workshopToastShow(parts, kind, true, kind === "session");
      }

      function workshopToast(text) {
        if (typeof document === "undefined" || !document.body || !text) return;
        var parts = workshopNoticeParts(text);
        var refusal = !!parts.title; // a refusal stays; a plain message goes by itself
        workshopToastShow(parts, WORKSHOP_LOGIN_RE.test(String(text)) ? "session" : "role", refusal, WORKSHOP_LOGIN_RE.test(String(text)));
      }

      function workshopToastShow(parts, kind, refusal, aboutSession) {
        var old = document.getElementById(WORKSHOP_NOTICE_TOAST_ID);
        if (old) old.remove();
        clearTimeout(workshopNoticeToastTimer);
        var out = typeof workshopSignedOut === "function" && workshopSignedOut();
        var opts = { bottom: 84, closable: true, kind: kind };
        if (refusal && out) {
          opts.action = {
            label: i18nT("notice.notice_sign_in"),
            run: function () {
              if (typeof workshopLogin === "function") workshopLogin();
            },
          };
        }
        var box = workshopNoticeCard(WORKSHOP_NOTICE_TOAST_ID, parts, opts);
        box.setAttribute("role", refusal ? "alert" : "status");
        if (aboutSession) box.setAttribute("data-workshop-login", "1"); // about the session: stale once the person signs in
        workshopNoticeRoot().appendChild(box);
        if (!refusal) {
          workshopNoticeToastTimer = setTimeout(function () {
            box.remove();
          }, 8000);
        }
      }

      // the small "Sin sesion - Iniciar sesion" chip in the bar of a page whose bar is built by hand (a Vue page gets it from PageHeader.vue, class wf-session-chip)
      function workshopSessionBarChip(out) {
        var bars = document.querySelectorAll(".wf-bar");
        for (var i = 0; i < bars.length && i < 8; i++) {
          var bar = bars[i];
          var own = bar.querySelector(".wf-session-chip:not([data-workshop-injected])"); // PageHeader.vue draws its own
          var mine = bar.querySelector("[data-workshop-injected]");
          if (!out || own) {
            if (mine) mine.remove();
            continue;
          }
          if (mine) continue;
          var chip = document.createElement("button");
          chip.type = "button";
          chip.className = "wf-session-chip";
          chip.setAttribute("data-workshop-injected", "1");
          chip.setAttribute("aria-label", workshopApiT("signedOut"));
          chip.title = workshopApiT("signedOut");
          var chipIcon = document.createElement("span");
          chipIcon.className = "wf-session-chip-icon mdi mdi-account-lock-outline";
          chipIcon.setAttribute("aria-hidden", "true");
          chip.appendChild(chipIcon);
          var chipText = document.createElement("span");
          chipText.textContent = workshopSessionParts().title + " · " + workshopApiT("signInAction");
          chip.appendChild(chipText);
          chip.addEventListener("click", function () {
            if (typeof workshopLogin === "function") workshopLogin();
          });
          var right = bar.querySelector(".wf-bar-right") || bar;
          right.appendChild(chip);
        }
      }

      // paints the state of the session: the mark on the page (data-workshop-signed-out) and the chips of the bars; there is no fixed card
      function workshopNoticeChipPaint() {
        var out = !!(typeof workshopSignedOut === "function" && workshopSignedOut());
        if (document.documentElement && typeof document.documentElement.setAttribute === "function") {
          if (out) document.documentElement.setAttribute("data-workshop-signed-out", "1");
          else document.documentElement.removeAttribute("data-workshop-signed-out");
        }
        var old = document.getElementById(WORKSHOP_NOTICE_CHIP_ID); // the fixed card of earlier versions, if an older bundle left it
        if (old) old.remove();
        if (typeof document.querySelectorAll === "function") workshopSessionBarChip(out);
        // a refusal about the session is stale once the person is signed in
        if (!out) {
          var t = document.getElementById(WORKSHOP_NOTICE_TOAST_ID);
          if (t && t.getAttribute("data-workshop-login")) t.remove();
        }
      }

      (function workshopNoticeStart() {
        if (typeof window === "undefined" || typeof document === "undefined") return;
        // one card and one timer for all the plugins of the page; they go when the last of them stops (workshopSharedUse, 30-lifecycle.js)
        workshopSharedUse("session-notice", function () {
          // the session changes without any event the page could hear (token cleared, tab restored): looking once a second is enough
          var timer = setInterval(function () {
            try {
              workshopNoticeChipPaint();
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
