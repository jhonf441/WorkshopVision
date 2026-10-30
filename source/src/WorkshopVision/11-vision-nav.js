      function tvPill(tv, icon) {
        var p = tvEl("span", "wf-state");
        var t = tvEl("span", null, "...");
        p.appendChild(t);
        p.set = function (cls, text, tip) {
          p.className = "wf-state" + (cls ? " " + cls : "");
          t.textContent = text;
          p.title = tip || "";
        };
        tv.pills.appendChild(p);
        return p;
      }

      function tvPaintZones(tv) {
        tv.btnZones.style.display = tvHasWorkbench(tv) ? "" : "none"; // the switch is about the Workbench map
        var on = !!(tv.cfg && tv.cfg.map && tv.cfg.map.use);
        tv.btnZones.classList.toggle("on", on);
        tv.btnZonasEst.textContent = on ? i18nT('vision.yes') : i18nT('vision.no');
        tv.btnZones.setAttribute("aria-pressed", on ? "true" : "false");
      }

      function tvPaintNav(tv) {
        tv.nav.innerHTML = "";
        tv.nav.className = "wf-nav tv-nav";
        tv.nav.classList.toggle("collapsed", !!tv.prefs.navCollapsed);
        // the pin (only while the bar is open): pinned keeps the bar as it is when a section is chosen; otherwise it folds to its icons
        var head = tvEl("div", "tvn-head");
        var pin = tvEl("button", "tvn-fold tvn-pin" + (tv.prefs.navPinned ? " pinned" : ""));
        pin.type = "button";
        pin.title = tv.prefs.navPinned ? i18nT('vision.unpin_bar') : i18nT('vision.pin_bar');
        pin.setAttribute("aria-pressed", tv.prefs.navPinned ? "true" : "false");
        pin.appendChild(tvIcon(tv.prefs.navPinned ? "pin" : "pin-outline"));
        if (!tv.prefs.navCollapsed) pin.appendChild(tvEl("span", "tx", i18nT('vision.pin_label')));
        pin.addEventListener("click", function () {
          tv.prefs.navPinned = !tv.prefs.navPinned;
          tvSavePrefs(tv.prefs);
          tvPaintNav(tv);
        });
        if (!tv.prefs.navCollapsed) head.appendChild(pin);
        tv.nav.appendChild(head);
        var pl = tvEl("button", "tvn-fold");
        pl.type = "button";
        pl.title = tv.prefs.navCollapsed ? i18nT('vision.show_the_names') : i18nT('vision.icons_only');
        pl.appendChild(tvIcon(tv.prefs.navCollapsed ? "chevron-double-right" : "chevron-double-left"));
        pl.addEventListener("click", function () {
          tv.prefs.navCollapsed = !tv.prefs.navCollapsed;
          tvSavePrefs(tv.prefs);
          tvPaintNav(tv);
        });
        head.appendChild(pl);
        tvSectionsFor(tvView(), TV_SECTIONS).forEach(function (gr, gi) { // the sections of the role (09-vision-roles.js)
          var gt = tvEl("div", "wf-nav-group tvn-group", gr.group);
          gt.setAttribute("data-group", gi);
          tv.nav.appendChild(gt);
          gr.items.forEach(function (it) {
            var b = tvEl("button", "wf-nav-item tv-nav-item" + (tv.tab === it[0] ? " on" : ""));
            b.type = "button";
            b.setAttribute("data-group", gi);
            b.title = it[3];
            b.appendChild(tvIcon(it[2], "wf-nav-icon"));
            b.appendChild(tvEl("span", "tx", it[1]));
            b.addEventListener("click", function () { tvIrSection(tv, it[0]); });
            tv.tabButtons[it[0]] = b;
            tv.nav.appendChild(b);
          });
        });
      }

      function tvModeMeasure(tv) {
        return tv.tab !== "calibrate" && tv.tab !== "settings" && tv.tab !== "guided";
      }

      function tvIrSection(tv, id) {
        if (tv.tab === id) return;
        var before = tv.tab;
        if (before === "follow" && tv.follow.on) tvFollowStop(tv);
        tv.tab = id;
        tv.prefs.section = id;
        tvSavePrefs(tv.prefs);
        tv.meas = [];
        if (tvModeMeasure(tv)) tv.calSel = -1;
        if (!tv.prefs.navPinned) tv.prefs.navCollapsed = true; // not pinned: the bar folds to its icons after the choice
        tvSavePrefs(tv.prefs);
        tvPaintNav(tv);
        tvRenderAll(tv);
        if (tv.tab === "calibrate" || tv.tab === "guided") tvAnalyzeForCal(tv);
        else if (tvModeMeasure(tv) && (before === "calibrate" || before === "settings" || !tv.res)) tvAnalyze(tv);
      }

      function tvSetEmpty(tv, text, icon) {
        tv.empty.innerHTML = "";
        tv.empty.appendChild(tvIcon(icon || "camera-off-outline"));
        tv.empty.appendChild(tvEl("div", null, text));
        tv.empty.style.display = "flex";
      }

