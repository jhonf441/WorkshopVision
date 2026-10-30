      // bar button: icon on top, short name below (cap null = no
      // name) and the long explanation when the mouse or finger rests on it
      function tvDockBtn(tv, icon, cap, tip, onClick, cls) {
        var b = tvEl("button", "tv-ib" + (cls ? " " + cls : ""));
        b.type = "button";
        b.appendChild(tvIcon(icon));
        if (cap !== null && cap !== undefined) b.appendChild(tvEl("span", "cap", cap));
        if (tip) b.title = tip;
        b.setAttribute("aria-label", tip || cap || "");
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (!b.disabled) onClick(ev);
        });
        return b;
      }

      // block: several buttons of the same function stuck together in one
      function tvDockPair(tv, list) {
        var p = tvEl("div", "tv-pair");
        list.forEach(function (b) { if (b) p.appendChild(b); });
        tv.dock.appendChild(p);
        return p;
      }

      function tvDockGap(tv) {
        tv.dock.appendChild(tvEl("span", "gap"));
      }

      function tvPopClose(tv) {
        if (tv.popKey && tv.dockButtons[tv.popKey]) tv.dockButtons[tv.popKey].classList.remove("open");
        tv.popKey = tv.popBuild = null;
        tv.dpop.style.display = "none";
        tv.dpop.innerHTML = "";
      }

      function tvPopPlace(tv) {
        var btn = tv.popKey && tv.dockButtons[tv.popKey];
        if (!btn || !btn.isConnected) return;
        var lr = tv.left.getBoundingClientRect(),
          br = btn.getBoundingClientRect();
        var ox = lr.left + tv.left.clientLeft,
          oy = lr.top + tv.left.clientTop;
        var w = tv.dpop.offsetWidth,
          h = tv.dpop.offsetHeight;
        var x = Math.max(4, Math.min(br.left - ox, tv.left.clientWidth - w - 4));
        var y = br.top - oy - h - 6; // hacia arriba, pegado al boton
        if (y < 4) y = br.bottom - oy + 6; // no room above: below the button
        tv.dpop.style.left = x + "px";
        tv.dpop.style.top = y + "px";
      }

      function tvPopPaint(tv) {
        if (!tv.popBuild) return;
        tv.dpop.innerHTML = "";
        tv.popBuild(tv.dpop);
        tvPopPlace(tv);
      }

      function tvPopOpen(tv, key, build) {
        if (tv.popKey === key) return tvPopClose(tv);
        tvPopClose(tv);
        tv.popKey = key;
        tv.popBuild = build;
        if (tv.dockButtons[key]) tv.dockButtons[key].classList.add("open");
        tv.dpop.style.display = "block";
        tvPopPaint(tv);
      }

      // tapping outside the menu (and its button) closes it; Esc too (onKey)
      function tvPopOutside(tv, ev) {
        if (!tv.popKey) return;
        var btn = tv.dockButtons[tv.popKey];
        if (tv.dpop.contains(ev.target) || (btn && btn.contains(ev.target))) return;
        tvPopClose(tv);
      }

      function tvDSec(tv, box, title) {
        var s = tvEl("div", "dsec");
        if (title) s.appendChild(tvEl("div", "dlbl", title));
        box.appendChild(s);
        return s;
      }

      function tvDRow(tv, box) {
        var r = tvEl("div", "drow");
        box.appendChild(r);
        return r;
      }

      function tvDChip(tv, text, on, onClick, tip) {
        return tvBtn(text, "small" + (on ? " on" : ""), onClick, null, tip);
      }

      function tvChangeView(tv, v) {
        tv.prefs.view = v;
        tvSavePrefs(tv.prefs);
        tvLoadView(tv).then(function () {
          tvDraw(tv);
          if (tvPadVisible(tv) && !tv.movBusy) tvRenderPad(tv);
        });
      }

      function tvTipTurn(tv) {
        var girada = tv.prefs.orient !== "camera";
        return !tv.orientAuto ? i18nT('vision.rotate_as_if_standing_in_front') : girada ? i18nT('vision.image_rotated_as_if_standing_in') : i18nT('vision.image_as_it_comes_from_the');
      }

      function tvRotateView(tv) {
        tv.prefs.orient = tv.prefs.orient !== "camera" ? "camera" : "auto";
        tvSavePrefs(tv.prefs);
        tvRenderBars(tv);
        tvLoadView(tv).then(function () {
          tvDraw(tv);
          if (tvPadVisible(tv) && !tv.movBusy) tvRenderPad(tv);
        });
      }

      // View: which image to show and rotate it as facing the machine
      function tvPopView(tv, box) {
        box.appendChild(tvEl("h4", null, i18nT('vision.image_view')));
        var s1 = tvDSec(tv, box, i18nT('vision.which_image_to_show'));
        var r1 = tvDRow(tv, s1);
        tv.TV_VIEWS.forEach(function (o) {
          r1.appendChild(tvDChip(tv, o[1], tv.prefs.view === o[0], function () {
            tvChangeView(tv, o[0]);
            tvPopPaint(tv);
          }));
        });
        var s2 = tvDSec(tv, box, i18nT('vision.orientation'));
        var bO = tvDChip(tv, i18nT('vision.rotate_as_in_front_of_the'), tv.prefs.orient !== "camera" && !!tv.orientAuto, function () {
          tvRotateView(tv);
          tvPopPaint(tv);
        });
        bO.disabled = !tv.orientAuto;
        tvDRow(tv, s2).appendChild(bO);
        s2.appendChild(tvEl("div", "tv-muted", tvTipTurn(tv)));
      }

      // Search: which types are searched in the image (before, the list the "Search:" button opened)
      function tvPopSearch(tv, box) {
        box.appendChild(tvEl("h4", null, i18nT('vision.find_in_the_image')));
        TV_KINDS.forEach(function (t) {
          var on = tv.prefs.kinds.indexOf(t[0]) !== -1;
          var it = tvEl("div", "it");
          it.title = t[3];
          var d = tvEl("span", "tv-dot");
          d.style.background = on ? t[2] : "transparent";
          d.style.border = "2px solid " + t[2];
          it.appendChild(d);
          var tx = tvEl("div");
          tx.appendChild(tvEl("div", "n", t[1]));
          tx.appendChild(tvEl("div", "d", t[3]));
          it.appendChild(tx);
          it.addEventListener("click", function () {
            var i = tv.prefs.kinds.indexOf(t[0]);
            if (i === -1) tv.prefs.kinds.push(t[0]);
            else tv.prefs.kinds.splice(i, 1);
            tvSavePrefs(tv.prefs);
            tvRenderBars(tv);
            tvUpdateInfo(tv);
            tvPopPaint(tv);
            tvAnalyze(tv);
          });
          box.appendChild(it);
        });
        var pie = tvEl("div", "footer");
        pie.appendChild(tvBtn(i18nT('vision.only_the_part'), "ghost small", function () {
          tv.prefs.kinds = ["piece"];
          tvSavePrefs(tv.prefs);
          tvRenderBars(tv);
          tvUpdateInfo(tv);
          tvPopPaint(tv);
          tvAnalyze(tv);
        }));
        pie.appendChild(tvBtn(i18nT('vision.close'), "small", tzBind(tvPopClose, tv)));
        box.appendChild(pie);
      }

      // Viewer settings (this screen): how it starts and names on the buttons
      function tvPopSettings(tv, box) {
        box.appendChild(tvEl("h4", null, i18nT('vision.viewer_settings')));
        var s1 = tvDSec(tv, box, i18nT('vision.when_opening_vision'));
        var r1 = tvDRow(tv, s1);
        [[false, i18nT('vision.with_a_photo')], [true, i18nT('vision.live')]].forEach(function (o) {
          r1.appendChild(tvDChip(tv, o[1], !!tv.prefs.openLive === o[0], function () {
            tv.prefs.openLive = o[0];
            tvSavePrefs(tv.prefs);
            tvPopPaint(tv);
          }));
        });
        s1.appendChild(tvEl("div", "tv-muted", i18nT('vision.with_a_photo_means_less_work')));
        var s2 = tvDSec(tv, box, i18nT('vision.names_on_the_buttons'));
        var r2 = tvDRow(tv, s2);
        [["auto", i18nT('vision.automatic')], ["si", i18nT('vision.always')], ["no", i18nT('vision.icons_only')]].forEach(function (o) {
          r2.appendChild(tvDChip(tv, o[1], (tv.prefs.names || "auto") === o[0], function () {
            tv.prefs.names = o[0];
            tvSavePrefs(tv.prefs);
            tvDockNames(tv, true);
            tvPopPaint(tv);
          }));
        });
        s2.appendChild(tvEl("div", "tv-muted", i18nT('vision.automatic_icons_only_if_that_way')));
        box.appendChild(tvEl("div", "tv-muted", i18nT('vision.only_on_this_screen')));
      }

      function tvDockWraps(tv) {
        var hijos = Array.prototype.filter.call(tv.dock.children, function (c) { return !c.classList.contains("gap"); });
        return hijos.length > 1 && hijos[hijos.length - 1].offsetTop > hijos[0].offsetTop + 4;
      }

      function tvDockNames(tv, force) {
        var w = tv.dock.clientWidth;
        if (!w) return; // escondida (Ajustes): se calcula al volver a verse
        if (!force && w === tv.namesWidth) return;
        tv.namesWidth = w;
        var mode = tv.prefs.names || "auto";
        if (mode === "si" || mode === "no") {
          tv.dock.classList.toggle("without-names", mode === "no");
          return;
        }
        tv.dock.classList.remove("without-names");
        if (!tvDockWraps(tv)) return;
        tv.dock.classList.add("without-names");
        if (tvDockWraps(tv)) tv.dock.classList.remove("without-names");
      }

      // zoom (- / + / fit with the %) and the view (View menu, grid, ruler)
      function tvDockView(tv) {
        var zOut = tvDockBtn(tv, "magnify-minus-outline", null, i18nT('vision.zoom_out_mouse_wheel_or_pinch'), function () { tvZoomA(tv, tv.zoom.s / 1.5); }, "half");
        var zIn = tvDockBtn(tv, "magnify-plus-outline", null, i18nT('vision.zoom_in_mouse_wheel_or_pinch'), function () { tvZoomA(tv, tv.zoom.s * 1.5); }, "half");
        var zFit = tvDockBtn(tv, "fit-to-screen-outline", Math.round(tv.zoom.s * 100) + " %", i18nT('vision.show_the_whole_image'), function () { tvZoomA(tv, 1); });
        tv.zoomN = zFit.querySelector(".cap");
        tvDockPair(tv, [zOut, zIn, zFit]);
        var bV = tvDockBtn(tv, "eye-settings-outline", i18nT('vision.view_caption'), i18nT('vision.image_view_camera_edges_black_white'), function () { tvPopOpen(tv, "view", tzBind(tvPopView, tv)); });
        tv.dockButtons.view = bV;
        var bR = tvDockBtn(tv, "grid", i18nT('vision.grid'), tvH(tv) ? i18nT('vision.grid_in_machine_mm') : i18nT('vision.grid_in_machine_mm_needs_calibration'), function () {
          tv.prefs.grid = !tv.prefs.grid;
          tvSavePrefs(tv.prefs);
          tvRenderBars(tv);
          tvDraw(tv);
        }, tv.prefs.grid ? "on" : null);
        var bL = tvDockBtn(tv, "ruler", i18nT('vision.ruler'), tvH(tv) ? i18nT('vision.ruler_in_machine_mm_on_the') : i18nT('vision.ruler_in_machine_mm_on_the_2'), function () {
          tv.prefs.rule = tv.prefs.rule === false;
          tvSavePrefs(tv.prefs);
          tvRenderBars(tv);
          tvDraw(tv);
        }, tv.prefs.rule !== false ? "on" : null);
        tvDockPair(tv, [bV, bR, bL]);
      }

      // end of the bar: save the image, viewer settings and full screen
      function tvDockEnd(tv) {
        var fsOn = tvInFull(tv);
        var bA = tvDockBtn(tv, "cog-outline", i18nT('vision.settings'), i18nT('vision.viewer_settings_on_this_screen_how'), function () { tvPopOpen(tv, "settings", tzBind(tvPopSettings, tv)); });
        tv.dockButtons.settings = bA;
        tvDockPair(tv, [
          tvDockBtn(tv, "download", i18nT('vision.save'), i18nT('vision.save_the_image_with_the_drawing'), tzBind(tvSaveImage, tv)),
          bA,
          tvDockBtn(tv, fsOn ? "fullscreen-exit" : "fullscreen", i18nT('vision.screen'), fsOn ? i18nT('vision.exit_full_screen') : i18nT('vision.full_screen'), tzBind(tvScreenFull, tv), fsOn ? "on" : null),
        ]);
      }

