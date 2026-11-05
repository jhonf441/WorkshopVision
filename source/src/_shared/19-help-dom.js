      // ---- The "?" help of the family, for the JS plugins (DWC 3.6): the twin of vue/_shared36/HelpTip.vue (2026-11-04) ----
      //
      // Standard: DESIGN.md 7b and informes/estandar-sesion-y-ayuda/AYUDAS.md. A JS plugin never draws its own help button: it asks for one of these elements.
      //   workshopHelpTipEl(spec)                        P1: the "?" button that opens a card; spec = { title, what, why, ifMissing, how } (texts ALREADY translated)
      //   workshopFieldEl(label, helpSpec, control, id)  a field with its label OUTSIDE the control and the "?" next to the LABEL (never inside the control)
      //   workshopGuideEl(title, rows)                   P3: the "How it works" fold of a section, rows = [[label, text], ...]
      //   workshopNoteEl(kind, text)                     P4: an always visible note, kind "info" or "warn"
      // Same DOM and class names as the Vue pieces (button.help-tip, dl.help-tip-list, .wf-popover, .wf-field, .wf-field-label, .wf-guide, .wf-note).
      // One card open at a time; it opens under the button, is kept inside the window, and closes with a tap outside or Esc. Nothing is read from the machine.
      // The styles are injected once from here until the standard moves them to design/family.css.

      var WORKSHOP_HELP_OPEN = null; // { btn, card, off } of the card that is open, if any
      var WORKSHOP_HELP_CSS =
        ".help-tip{display:inline-flex;align-items:center;justify-content:center;flex:none;width:24px;height:24px;margin:-4px 0;padding:0;border:0;border-radius:50%;background:transparent;color:var(--wf-icon,inherit);cursor:pointer;opacity:1;font:inherit}" +
        ".help-tip .mdi{font-size:18px;line-height:1}" +
        "@media (pointer:coarse){.help-tip{width:40px;height:40px;margin:-8px}}" +
        ".wf-popover{position:fixed;z-index:9999;box-sizing:border-box;max-width:380px;padding:12px 16px;border:1px solid var(--wf-line,rgba(128,128,128,.3));border-radius:8px;background:var(--wf-surface,#1e1e1e);color:inherit;box-shadow:0 4px 16px rgba(0,0,0,.35)}" +
        ".wf-popover .help-tip-title{font-size:14px;font-weight:600;margin-bottom:6px}" +
        ".help-tip-list{display:grid;grid-template-columns:max-content minmax(0,1fr);gap:4px 12px;margin:6px 0 0;font-size:13px}" +
        ".help-tip-list dt{font-weight:600}.help-tip-list dd{margin:0}" +
        ".wf-field{display:flex;flex-direction:column;gap:4px;min-width:0}" +
        ".wf-field-label{display:flex;align-items:center;gap:2px;min-height:24px;font-size:13px;font-weight:500}" +
        ".wf-field-label .help-tip{flex:none;margin:-4px 0}" +
        ".wf-guide>summary{cursor:pointer;font-size:13px;font-weight:600;opacity:.85;min-height:24px}" +
        "@media (pointer:coarse){.wf-guide>summary{min-height:44px;display:flex;align-items:center}}" +
        ".wf-note{display:flex;gap:8px;font-size:13px}.wf-note.is-warn{border-left:3px solid var(--wf-warn,#ff8f00);padding-left:8px}";

      function workshopHelpCss() {
        if (document.getElementById("workshop-help-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-help-css";
        st.textContent = WORKSHOP_HELP_CSS;
        (document.head || document.documentElement).appendChild(st);
      }

      // Pure: the rows of a card in their fixed order, without the empty ones. t = i18nT.
      function workshopHelpRows(spec, t) {
        return [
          [t('core.help_tip_what'), spec.what],
          [t('core.help_tip_why'), spec.why],
          [t('core.help_tip_missing'), spec.ifMissing],
          [t('core.help_tip_how'), spec.how],
        ].filter(function (r) { return r[1]; });
      }

      function workshopHelpClose() {
        var o = WORKSHOP_HELP_OPEN;
        if (!o) return;
        WORKSHOP_HELP_OPEN = null;
        if (o.card.parentNode) o.card.parentNode.removeChild(o.card);
        o.btn.setAttribute("aria-expanded", "false");
        o.off();
      }

      // Under the button, inside the window (never wider than it)
      function workshopHelpPlace(btn, card) {
        var r = btn.getBoundingClientRect();
        var w = window.innerWidth || 1024;
        var h = window.innerHeight || 768;
        var cw = card.offsetWidth || 380;
        var ch = card.offsetHeight || 120;
        var left = Math.max(8, Math.min(r.left, w - cw - 8));
        var top = r.bottom + 4;
        if (top + ch > h - 8) top = Math.max(8, r.top - ch - 4);
        card.style.left = left + "px";
        card.style.top = top + "px";
      }

      // The rows as a definition list (the card and the fold share it)
      function workshopHelpList(rows) {
        var dl = document.createElement("dl");
        dl.className = "help-tip-list";
        rows.forEach(function (r) {
          if (!r[1]) return;
          var dt = document.createElement("dt");
          dt.textContent = r[0];
          var dd = document.createElement("dd");
          dd.textContent = r[1];
          dl.appendChild(dt);
          dl.appendChild(dd);
        });
        return dl;
      }

      function workshopHelpCard(btn, spec, label) {
        var card = document.createElement("div");
        card.className = "wf-popover workshop-theme";
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-label", label);
        if (spec.title) {
          var tt = document.createElement("div");
          tt.className = "help-tip-title";
          tt.textContent = spec.title;
          card.appendChild(tt);
        }
        var rows = workshopHelpRows(spec, i18nT);
        if (rows.length) card.appendChild(workshopHelpList(rows));
        return card;
      }

      function workshopHelpTipEl(spec) {
        workshopHelpCss();
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "help-tip";
        var label = i18nT('core.help_tip_open') + (spec.title ? ": " + spec.title : "");
        btn.setAttribute("aria-label", label);
        btn.setAttribute("title", label);
        btn.setAttribute("aria-expanded", "false");
        var ic = document.createElement("span");
        ic.className = "mdi mdi-help-circle-outline";
        btn.appendChild(ic);
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          var same = WORKSHOP_HELP_OPEN && WORKSHOP_HELP_OPEN.btn === btn;
          workshopHelpClose();
          if (same) return;
          var card = workshopHelpCard(btn, spec, label);
          document.body.appendChild(card);
          workshopHelpPlace(btn, card);
          btn.setAttribute("aria-expanded", "true");
          var onDoc = function (e) { if (!card.contains(e.target)) workshopHelpClose(); };
          var onKey = function (e) { if (e.key === "Escape") { workshopHelpClose(); btn.focus(); } };
          document.addEventListener("click", onDoc, true);
          document.addEventListener("keydown", onKey, true);
          WORKSHOP_HELP_OPEN = {
            btn: btn,
            card: card,
            off: function () {
              document.removeEventListener("click", onDoc, true);
              document.removeEventListener("keydown", onKey, true);
            },
          };
        });
        return btn;
      }

      // A field whose label is OUTSIDE the control; the "?" sits next to the label, never inside the control (AYUDAS.md 3, 4)
      function workshopFieldEl(label, helpSpec, control, id) {
        workshopHelpCss();
        var box = document.createElement("div");
        box.className = "wf-field";
        var head = document.createElement("div");
        head.className = "wf-field-label";
        var lb = document.createElement("label");
        if (id) lb.setAttribute("for", id);
        lb.textContent = label;
        head.appendChild(lb);
        if (helpSpec) head.appendChild(workshopHelpTipEl(helpSpec));
        box.appendChild(head);
        box.appendChild(control);
        return box;
      }

      // The "How it works" fold of a section: closed by default, the rows given. rows = [[label, text], ...]
      function workshopGuideEl(title, rows) {
        workshopHelpCss();
        var d = document.createElement("details");
        d.className = "wf-guide";
        var s = document.createElement("summary");
        s.textContent = title;
        d.appendChild(s);
        d.appendChild(workshopHelpList(rows));
        return d;
      }

      // A note that is true NOW or limits what is seen: always visible, never collapsible. kind: "info" or "warn"
      function workshopNoteEl(kind, text) {
        workshopHelpCss();
        var n = document.createElement("div");
        n.className = "wf-note is-" + (kind === "warn" ? "warn" : "info");
        n.setAttribute("role", "note");
        var ic = document.createElement("span");
        ic.className = "wf-note-icon mdi " + (kind === "warn" ? "mdi-alert-outline" : "mdi-information-outline");
        n.appendChild(ic);
        n.appendChild(document.createTextNode(text));
        return n;
      }
