      function tvRenderBars(tv) {
        var br = {};
        tv.dock.innerHTML = "";
        tv.dockButtons = {};
        [tv.ovTL, tv.ovBL].forEach(function (o) { o.innerHTML = ""; });
        tv.left.style.display = tv.tab === "settings" ? "none" : "";
        if (tv.tab === "settings" && tv.popKey) tvPopClose(tv); // the viewer hides: no menu left hanging
        tvPadUpdate(tv);
        // image source
        // 2026-10-11 ("when it opens it says live but only with View live is it real
        // time, that is confusing"): without Live the image is a photo of the video, with its time
        var src = tvEl("span", "tv-glass tv-badge " + (tv.photoAct ? "photo" : tv.live ? "live envivo" : "live pausa"));
        src.appendChild(tvIcon(tv.photoAct ? "camera" : tv.live ? "record-circle" : "pause-circle-outline"));
        var srcT = tv.photoAct
          ? (tv.photoInfo && tv.photoInfo.mosaic ? i18nT('vision.mosaic_of_n_photos', { n: tv.photoInfo.n }) : i18nT('vision.measuring_photo'))
          : tv.live ? i18nT('vision.live') : tv.resHour ? i18nT('vision.image_from_time', { time: tv.resHour }) : i18nT('vision.video_image');
        if (tv.res && tv.res.size) srcT += " · " + tv.res.size[0] + "×" + tv.res.size[1];
        src.appendChild(tvEl("span", null, srcT));
        tv.ovBL.appendChild(src);
        if (tv.photoAct) tv.ovBL.appendChild(tvIBtn("video-outline", i18nT('vision.back_to_video'), "small", tzBind(tvRevertVideo, tv)));
        else if (!tv.live && tvModeMeasure(tv)) tv.ovBL.appendChild(tvIBtn("play", i18nT('vision.see_live'), "primary small", function () { tvSetLive(tv, true); }, null, i18nT('vision.real_time_video_analyzes_again_about')));
        tvBarsCalibrate(tv, br);
        tvBarsPop(tv, br);
      }


      // ---- panel lateral ----
      function tvRenderSide(tv) {
        tv.side.innerHTML = "";
        tvPaintZones(tv);
        Object.keys(tv.tabButtons).forEach(function (k) { tv.tabButtons[k].classList.toggle("on", k === tv.tab); });
        tv.main.classList.toggle("only", tv.tab === "settings");
        var signedOut = workshopSignedOut();
        var down = tv.state && !tv.state.ok && !signedOut;
        if (down) tv.side.appendChild(tvNoticeService(tv));
        else if (signedOut && tv.state && !tv.state.ok) tv.side.appendChild(tvMsg("info", i18nT('vision.sign_in_needed_text')));
        if (tv.lastMsg && !(down && /fetch|NetworkError|Failed/i.test(tv.lastMsg.t))) tv.side.appendChild(tvMsg(tv.lastMsg.ok ? "ok" : "err", tv.lastMsg.t));
        if (tvView() === "viewer") return tv.side.appendChild(tvMsg("info", i18nT('vision.roles_viewer'))); // a visitor: a clear message, not an error
        if (tv.tab === "guided") return tvRenderGuided(tv);
        if (tv.tab === "calibrate") return tvRenderCal(tv);
        if (tv.tab === "settings") return tvRenderSettings(tv);
        if (tv.tab === "wizard") return tvRenderWizard(tv);
        if (tv.tab === "follow") return tvRenderFollow(tv);
        if (tv.tab === "pieces") return tvRenderPieces(tv);
        if (tv.tab === "before") return tvRenderBefore(tv);
        if (tv.tab === "record") return tvRenderRecord(tv);
        tvRenderPhoto(tv);
        tvRenderResults(tv);
        if (tvIsTech()) tvRenderParams(tv); // the 17 detection parameters are the technician's, under "Advanced"
      }

      // Without the Vision service (2026-10-10, test "what if a
      // plugin is missing": before it said "Could not analyze: Failed to fetch")
      function tvNoticeService(tv) {
        var c = tvCard(i18nT('vision.the_vision_service_doesn_t_respond'), "lan-disconnect");
        c.classList.add("tv-notice");
        c.appendChild(tvEl("div", null, i18nT('vision.page_cannot_reach_the_service', { port: TV_PORT })));
        c.appendChild(tvEl("div", "tv-muted", i18nT(tvHasWorkbench(tv) ? 'vision.meanwhile_you_can_t_detect_or' : 'vision.meanwhile_you_can_t_detect_or_no_map')));
        return c;
      }

      function tvBarsCalibrate(tv, br) {
        if (tv.tab === "calibrate") {
          var hint = tvEl("span", "tv-glass tv-badge");
          hint.appendChild(tvIcon("gesture-tap"));
          hint.appendChild(tvEl("span", null, tv.calSel >= 0 && tv.calPts[tv.calSel] ? i18nT('vision.tap_on_the_image_the_point_n', { n: tv.calSel + 1 }) : i18nT('vision.pick_a_point_on_the_right')));
          if (tvPointsOpen(tv)) tv.ovTL.appendChild(hint);
          tvDockView(tv);
          tvDockGap(tv);
          tv.dock.appendChild(tvDockBtn(tv, "camera-retake-outline", i18nT('vision.refresh'), i18nT('vision.requests_the_image_again_and_looks'), function () { tv.res = null; tvAnalyzeForCal(tv); }));
          tvDockGap(tv);
          tvDockEnd(tv);
        } else {
          // tools: what a tap on the image does
          tvDockPair(tv, 
            tv.TV_TOOL.map(function (h) {
              return tvDockBtn(tv, h[2], h[1], h[3], function () {
                tv.prefs.tool = h[0];
                tv.meas = [];
                tv.movTarget = null;
                tvSavePrefs(tv.prefs);
                tvRenderBars(tv);
                tvZoomApply(tv, false);
                tvUpdateInfo(tv);
                tvDraw(tv);
              }, tv.prefs.tool === h[0] ? "on" : null);
            })
          );
          if (tv.roi) tv.dock.appendChild(tvDockBtn(tv, "selection-off", i18nT('vision.remove'), i18nT('vision.remove_the_zone_the_whole_image'), function () { tv.roi = null; tvAnalyze(tv); tvRenderBars(tv); }));
          tvDockGap(tv);
          tvDockView(tv);
          tvDockGap(tv);
          // acciones: que buscar, cabezal, en vivo y analizar
          var chosen = TV_KINDS.filter(function (t) { return tv.prefs.kinds.indexOf(t[0]) !== -1; });
          var bB = tvDockBtn(tv, "filter-variant", i18nT('vision.look_for'), i18nT('vision.what_to_look_for_in_the'), function () { tvPopOpen(tv, "search", tzBind(tvPopSearch, tv)); });
          var dots = tvEl("span", "dots");
          chosen.slice(0, 4).forEach(function (t) {
            var d = tvEl("i");
            d.style.background = t[2];
            dots.appendChild(d);
          });
          bB.appendChild(dots);
          tv.dockButtons.search = bB;
          tv.dock.appendChild(bB);
          var bC = tvDockBtn(tv, "crosshairs", i18nT('vision.head'), i18nT('vision.marks_on_the_image_where_the'), function () {
            tv.prefs.head = !tv.prefs.head;
            tvSavePrefs(tv.prefs);
            tv.cabTrail = [];
            if (tv.prefs.head) tvRequestHead(tv);
            else {
              clearTimeout(tv.cabTimer);
              tv.cab = null;
              tvDraw(tv);
            }
            tvRenderBars(tv);
          }, tv.prefs.head ? "on" : null);
          var bS = tv.prefs.head
            ? tvDockBtn(tv, "target", "BLTouch", i18nT('vision.marks_where_the_bltouch_probe_touches'), function () {
                tv.prefs.headProbe = !tv.prefs.headProbe;
                tvSavePrefs(tv.prefs);
                tvDraw(tv);
                tvRenderBars(tv);
              }, tv.prefs.headProbe ? "on" : null)
            : null;
          tvDockPair(tv, [bC, bS]);
          var bLive = tvDockBtn(tv, tv.live ? "pause-circle-outline" : "play-circle-outline", tv.live ? i18nT('vision.stop') : i18nT('vision.live'), tv.live ? i18nT('vision.stop_live') : i18nT('vision.analyzes_the_video_continuously_about_once'), function () { tvSetLive(tv, !tv.live); }, tv.live ? "live" : null);
          // The text does not change while it analyzes (it does not move the bar): the icon spins.
          var bAn = tvDockBtn(tv, tv.busy ? "loading" : "magnify-scan", i18nT('vision.analyze'), tv.busy ? i18nT('vision.analyzing') : i18nT('vision.analyzes_the_image_again_looks_for'), function () { if (!tv.busy) tvAnalyze(tv); }, "prim");
          if (tv.busy) bAn.firstChild.classList.add("tv-turns");
          tvDockPair(tv, [bLive, bAn]);
          tvDockGap(tv);
          tvDockEnd(tv);
        }
        tvDockNames(tv, true);
      }

      function tvBarsPop(tv, br) {
        // open menu: it stays stuck to its button (the bar is rebuilt on each live
        // analysis; the menu's content is not rebuilt so as not to lose a touch)
        if (tv.popKey) {
          if (tv.dockButtons[tv.popKey]) {
            tv.dockButtons[tv.popKey].classList.add("open");
            tvPopPlace(tv);
          } else tvPopClose(tv);
        }
      }
