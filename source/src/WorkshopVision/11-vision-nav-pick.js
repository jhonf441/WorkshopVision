      // ---- The section bar on a phone: ONE "Section: X" button that opens the list in a sheet (note 17 of the owner, 2026-11-23) ----
      // The same form as the service page and the Vue pages (SideTabs under 640 px). It reads the buttons the bar already draws (icon, name, lock
      // and which one is open: .on) and a choice in the sheet presses the real button, so the sections, their locks and what a choice does stay in
      // tvPaintNav. Under 640 px of window the CSS (10-vision-style.js) shows this button instead of the bar.
      //   nav: the bar; itemSel: its section buttons; nameSel: the name inside each; title: the word of the button and the sheet ("Section")
      function tvNavPick(nav, itemSel, nameSel, title) {
        var el = document.createElement("button");
        el.type = "button";
        el.className = "tvn-pick";
        el.setAttribute("aria-haspopup", "dialog");
        el.appendChild(tvIcon("menu", "tvn-pick-icon"));
        el.appendChild(tvEl("small", "tvn-pick-word", title));
        var name = tvEl("b", "tvn-pick-name", "");
        el.appendChild(name);
        function items() {
          return Array.prototype.slice.call(nav.querySelectorAll(itemSel));
        }
        function nameOf(b) {
          var n = b && b.querySelector(nameSel);
          return n ? n.textContent : "";
        }
        function paint() {
          var t = nameOf(items().filter(function (b) { return b.classList.contains("on"); })[0]);
          if (name.textContent !== t) name.textContent = t;
        }
        function open() {
          // NOT modal on purpose: DWC's top bar (its emergency stop) and the control bar stay usable while the list is open, so the sheet is a
          // non-modal dialog (no aria-modal, a visible close button) and its veil starts under DWC's top bar (read once, when it opens)
          var veil = tvEl("div", "wf-veil tvn-pick-veil");
          if (typeof workshopVeilClear === "function") workshopVeilClear(veil); // the family's veil box (45-layers.js): under DWC's bar, left of the control bar
          else veil.style.top = tvPickTop() + "px";
          var sheet = tvEl("div", "wf-sheet tvn-pick-sheet");
          sheet.setAttribute("role", "dialog");
          sheet.setAttribute("aria-label", title);
          var close = function () {
            document.removeEventListener("keydown", onKey, true);
            if (veil.parentNode) veil.parentNode.removeChild(veil);
            el.setAttribute("aria-expanded", "false");
            if (el.isConnected) el.focus();
          };
          var onKey = function (ev) {
            if (ev.key !== "Escape") return;
            ev.stopPropagation();
            close();
          };
          sheet.appendChild(workshopSheetHeader(title, close, { noVersion: true }));
          var body = tvEl("div", "wf-sheet-body tvn-pick-list");
          body.setAttribute("role", "list");
          var first = null;
          items().forEach(function (orig) {
            var b = tvEl("button", "tvn-pick-item" + (orig.classList.contains("on") ? " on" : ""));
            b.type = "button";
            b.setAttribute("role", "listitem");
            if (orig.classList.contains("on")) b.setAttribute("aria-current", "page");
            if (orig.title) b.title = orig.title;
            var box = orig.querySelector(".st-iconbox");
            if (box) b.appendChild(box.cloneNode(true));
            var txt = tvEl("span", "tvn-pick-text");
            txt.appendChild(tvEl("span", null, nameOf(orig)));
            var need = orig.querySelector(".st-need");
            if (need) txt.appendChild(tvEl("small", null, need.textContent));
            b.appendChild(txt);
            b.addEventListener("click", function () {
              close();
              orig.click();
            });
            body.appendChild(b);
            if (!first || orig.classList.contains("on")) first = b; // the focus goes to the open section (else the first one)
          });
          sheet.appendChild(body);
          veil.appendChild(sheet);
          veil.addEventListener("click", function (ev) { if (ev.target === veil) close(); });
          document.addEventListener("keydown", onKey, true);
          veil.setAttribute("data-tp-panel", ""); // hangs from <body>: 03-theme.js gives it the light palette with DWC's light theme
          document.body.appendChild(veil);
          el.setAttribute("aria-expanded", "true");
          if (first) first.focus();
        }
        el.addEventListener("click", open);
        return { el: el, paint: paint };
      }

      // the bottom edge of DWC's top bar (0 when there is none): where the veil of the list starts
      function tvPickTop() {
        var top = 0;
        var bars = document.querySelectorAll(".v-app-bar, .v-toolbar--fixed, header.v-toolbar");
        for (var i = 0; i < bars.length; i++) {
          var r = bars[i].getBoundingClientRect();
          if (r.height > 0 && r.top < 8) top = Math.max(top, Math.ceil(r.bottom));
        }
        return Math.min(top, Math.round(window.innerHeight * 0.5));
      }
