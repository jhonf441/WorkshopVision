      function tvPill(tv, icon) {
        var p = tvEl("span", "wf-state");
        var t = tvEl("span", "tv-state-txt", "...");
        p.appendChild(t);
        p.set = function (cls, text, tip) {
          p.className = "wf-state" + (cls ? " " + cls : "");
          t.textContent = text;
          p.title = tip || "";
          p.tvCls = cls || "";
          p.tvText = text;
          p.tvSeen = true;
          tvPaintSummary(tv);
        };
        tv.pills.appendChild(p);
        tv.pillList = (tv.pillList || []).concat([p]);
        return p;
      }

      // Phone bar (< 640 px, CSS shows only this chip): the three states in ONE chip with the WORST state in whole words and "+N" for the other
      // states that are not fine; everything fine = "All ready". A state is a word and a dot, never only a colour. Tapping it goes to Home, where the
      // whole list is. The wide bar keeps the three pills and hides this chip.
      var TV_SUM_RANK = { err: 3, warn: 2, "": 1, ok: 0 };
      function tvSummaryOf(pills) {
        var seen = (pills || []).filter(function (p) { return p.tvSeen && p.style.display !== "none"; });
        var bad = seen.filter(function (p) { return p.tvCls !== "ok"; });
        if (!seen.length) return null;
        if (!bad.length) return { cls: "ok", text: i18nT('vision.all_ready'), more: 0 };
        var worst = bad.reduce(function (a, p) { return TV_SUM_RANK[p.tvCls] > TV_SUM_RANK[a.tvCls] ? p : a; });
        var t = String(worst.tvText || "");
        return { cls: worst.tvCls, text: t.charAt(0).toUpperCase() + t.slice(1), more: bad.length - 1 };
      }
      function tvPaintSummary(tv) {
        if (!tv.chipSum) return;
        var s = tvSummaryOf(tv.pillList);
        tv.chipSum.style.display = s ? "" : "none";
        if (!s) return;
        tv.chipSum.className = "wf-state tv-sum" + (s.cls ? " " + s.cls : "");
        tv.chipSumTxt.textContent = s.text;
        tv.chipSumMore.textContent = s.more ? i18nT('vision.states_more', { n: s.more }) : "";
        tv.chipSumMore.style.display = s.more ? "" : "none";
        tv.chipSum.title = s.more ? i18nT('vision.states_open_home') : "";
      }

      function tvPaintZones(tv) {
        tv.btnZones.style.display = tvHasWorkbench(tv) ? "" : "none"; // the switch is about the Workbench map
        if (tv.btnZonesHelp) tv.btnZonesHelp.style.display = tvHasWorkbench(tv) ? "" : "none"; // and so is its "?"
        var on = !!(tv.cfg && tv.cfg.map && tv.cfg.map.use);
        tv.btnZones.classList.toggle("on", on);
        tv.btnZonasEst.textContent = on ? i18nT('vision.yes') : i18nT('vision.no');
        tv.btnZones.setAttribute("aria-pressed", on ? "true" : "false");
      }

      function tvPaintNav(tv) {
        tv.nav.innerHTML = "";
        tv.nav.className = "wf-nav tv-nav";
        tv.nav.classList.toggle("collapsed", !!tv.prefs.navCollapsed);
        var pick = tvNavPick(tv.nav, ".tv-nav-item", ".tx", i18nT('vision.section_pick')); // a phone: one "Section: X" button instead of the bar (11-vision-nav-pick.js)
        tv.nav.appendChild(pick.el);
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
        tvNavSectionsFor(tvView(), TV_SECTIONS).forEach(function (gr, gi) { // every section; the ones above the role are locked (09-vision-roles.js)
          var gt = tvEl("div", "wf-nav-group tvn-group", gr.group);
          gt.setAttribute("data-group", gi);
          tv.nav.appendChild(gt);
          gr.items.forEach(function (it) {
            var out = !!it[4] && workshopSignedOut();
            var b = tvEl("button", "wf-nav-item tv-nav-item" + (tv.tab === it[0] ? " on" : "") + (it[4] ? " st-locked" + (out ? " st-locked-session" : "") : ""));
            b.type = "button";
            b.setAttribute("data-group", gi);
            b.title = it[4] ? it[1] + ": " + (out ? i18nT("notice.notice_session_reason") : i18nT("notice.notice_role_needed", { needed: workshopNoticeRoleName(it[4]) })) : it[3];
            var box = tvEl("span", "st-iconbox"); // the real icon always; a locked section gets a small lock on its corner (same as the side bar of the Vue pages)
            box.appendChild(tvIcon(it[2], "wf-nav-icon"));
            if (it[4]) box.appendChild(tvIcon(out ? "account-lock" : "lock", "st-lockmark"));
            b.appendChild(box);
            var txt = tvEl("span", "st-text"); // the name, and under it who may open the section; not drawn when the bar is folded
            txt.appendChild(tvEl("span", "tx", it[1]));
            if (it[4]) txt.appendChild(tvEl("span", "st-need", out ? i18nT("notice.need_session_tag") : workshopNoticeRoleName(it[4])));
            b.appendChild(txt);
            b.addEventListener("click", function () { tvIrSection(tv, it[0]); });
            tv.tabButtons[it[0]] = b;
            tv.nav.appendChild(b);
          });
        });
        pick.paint();
        tvPaintGroup(tv);
      }

      // the group of the open section (0 Measure, 1 Job, 2 Camera) on the page: its colour paints the cards and the open entry (10-vision-style.js)
      function tvPaintGroup(tv) {
        if (!tv.page) return;
        var gi = 0;
        var id = tv.tab === "guided" ? "calibrate" : tv.tab; // the guided calibration is a way into Calibrate
        TV_SECTIONS.forEach(function (g, i) { g.items.forEach(function (it) { if (it[0] === id) gi = i; }); });
        tv.page.setAttribute("data-group", String(gi));
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

