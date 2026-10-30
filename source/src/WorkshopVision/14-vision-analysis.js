      function tvUpdateInfo(tv) {
        tv.info.innerHTML = "";
        tv.ovBR.innerHTML = "";
        function chip(text, cls) {
          tv.info.appendChild(tvEl("span", cls || null, text));
        }
        if (tv.res) {
          chip(tv.res.size[0] + "×" + tv.res.size[1] + " px");
          chip(i18nT('vision.analysis_ms', { ms: tv.res.ms }));
          if (tv.res.px_per_mm) chip(tvFmt(tv.res.px_per_mm, 2) + " px/mm · 1 px ≈ " + tvFmt(1 / tv.res.px_per_mm, 2) + " mm");
          else chip(i18nT('vision.not_calibrated_px_only'), "warn");
        }
        // 2026-10-11: what is searched for (before it was written on the Search button)
        if (tvModeMeasure(tv)) {
          var chosen = TV_KINDS.filter(function (t) { return tv.prefs.kinds.indexOf(t[0]) !== -1; });
          var cb = tvEl("span");
          cb.appendChild(tvEl("span", null, i18nT('vision.look_for_colon')));
          cb.appendChild(document.createTextNode(" "));
          chosen.forEach(function (t) {
            var d = tvEl("span", "tv-dot");
            d.style.background = t[2];
            cb.appendChild(d);
          });
          cb.appendChild(tvEl("span", null, chosen.length ? chosen.map(function (t) { return t[1]; }).join(", ") : i18nT('vision.nothing')));
          tv.info.appendChild(cb);
        }
        // measurement in progress: big reading over the image
        var ro = null;
        if (tvModeMeasure(tv) && (tv.prefs.tool === "measure" || tv.prefs.tool === "area")) {
          ro = tvEl("div", "tv-glass tv-readout");
          if (!tv.meas.length) ro.textContent = tv.prefs.tool === "measure" ? i18nT('vision.tap_two_points_on_the_image') : i18nT('vision.tap_the_vertices_the_first_closes');
        }
        if (tv.meas.length && ro) {
          var mm = tv.meas.map(function (m) { return tvPxToMm(tv, m.px); });
          var ok = mm.every(function (m) { return m; });
          var pts = ok ? mm : tv.meas.map(function (m) { return m.px; });
          var u = ok ? " mm" : " px";
          var big = tvEl("b");
          var det = tvEl("div");
          if (tv.prefs.tool === "measure") {
            if (pts.length === 1) {
              big.textContent = "…";
              det.textContent = i18nT('vision.tap_the_second_point');
            } else {
              var dx = pts[1][0] - pts[0][0], dy = pts[1][1] - pts[0][1];
              big.textContent = tvFmt(Math.hypot(dx, dy), 2) + u;
              det.textContent = "dX " + tvFmt(dx, 2) + " · dY " + tvFmt(dy, 2) + " · " + tvFmt((Math.atan2(dy, dx) * 180) / Math.PI, 1) + "°";
            }
          } else {
            var per = 0;
            for (var i = 1; i < pts.length; i++) per += tvDist(pts[i - 1], pts[i]);
            if (pts.length > 2) {
              big.textContent = tvFmt(tvPolyArea(pts), 1) + u + "²";
              det.textContent = i18nT('vision.perimeter_value', { v: tvFmt(per + tvDist(pts[pts.length - 1], pts[0]), 1) + u }) + (tv.meas.closed ? "" : " " + i18nT('vision.tap_the_first_point_to_close'));
            } else {
              big.textContent = "…";
              det.textContent = i18nT('vision.n_points_missing', { n: 3 - pts.length });
            }
          }
          ro.appendChild(big);
          ro.appendChild(det);
          if (!ok) ro.appendChild(tvEl("div", null, i18nT('vision.not_calibrated_in_px')));
        }
        if (ro) tv.ovBR.appendChild(ro);
      }

      // ---- analizar ----
      function tvAnalyze(tv) {
        if (tv.busy || !tv.alive) return Promise.resolve();
        tv.busy = true;
        if (tvModeMeasure(tv)) tvRenderBars(tv);
        var body = { kinds: tv.prefs.kinds, params: tv.prefs.params || {}, roi: tv.roi, photo: tv.photoAct, height_mm: tv.prefs.height > 0 ? tv.prefs.height : 0 };
        return tvPost("/detect", body)
          .then(function (r) {
            tv.res = r;
            tv.resHour = new Date().toTimeString().slice(0, 8);
            if (tv.follow.on) tvFollowStep(tv);
            if (tv.sel && !r.items.some(function (it) { return it.id === tv.sel; })) tv.sel = null;
            tvRecognize(tv);
            tvPublish(r);
            tv.lastMsg = null;
            return tvLoadView(tv);
          })
          .catch(function (e) {
            tv.lastMsg = { t: i18nT('vision.could_not_analyze_v', { v: String(e.message) }), ok: false };
          })
          .then(function () {
            tv.busy = false;
            if (tvModeMeasure(tv)) tvRenderBars(tv);
            tvUpdateInfo(tv);
            tvRenderSide(tv);
            tvDraw(tv);
            // the Move panel was built before having a calibration: now the arrows can follow the axes
            // and after moving, the data (mm/px, how much it sees) are those of the new image
            if (tvPadVisible(tv) && !tv.movBusy && !tv.movTarget && tv.res && tv.res.H && (tv.padRefresh || !tv.padWithAxes)) {
              tv.padRefresh = false;
              tvRenderPad(tv);
            }
          });
      }

      function tvRequestHead(tv) {
        clearTimeout(tv.cabTimer);
        if (!tv.prefs.head || !tv.alive) return;
        if (!workshopPageVisible(tv.root)) {
          tv.cabTimer = setTimeout(tzBind(tvRequestHead, tv), 2000);
          return;
        }
        tvGet("/head")
          .then(function (j) {
            tv.cab = j;
            if (j.px) {
              var u = tv.cabTrail[tv.cabTrail.length - 1];
              if (!u || Math.hypot(u[0] - j.px[0], u[1] - j.px[1]) > 1) tv.cabTrail.push(j.px);
              if (tv.cabTrail.length > 60) tv.cabTrail.shift();
            }
            tvDraw(tv);
          }, function () {})
          .then(function () { tv.cabTimer = setTimeout(tzBind(tvRequestHead, tv), 700); });
      }

      function tvSetLive(tv, on) {
        if (on && tv.photoAct) {
          tv.photoAct = null; // en vivo = video, no la foto
          tv.photoInfo = null;
        }
        tv.live = on;
        clearTimeout(tv.liveTimer);
        tvRenderBars(tv);
        if (!on) return;
        (function loop() {
          if (!tv.live || !tv.alive) return;
          if (!workshopPageVisible(tv.root)) return (tv.liveTimer = setTimeout(loop, 1500));
          tvAnalyze(tv).then(function () {
            if (tv.live && tv.alive) tv.liveTimer = setTimeout(loop, 700);
          });
        })();
      }

      function tvSelect(tv, id, scroll) {
        tv.sel = id;
        tvDraw(tv);
        tvRenderSide(tv);
        if (scroll && id) {
          var el = tv.side.querySelector('[data-id="' + id + '"]');
          if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest" });
        }
      }

      function tvPointsOpen(tv) {
        return !!(tv.prefs.open && tv.prefs.open["cal-points"]);
      }

      function tvRevertVideo(tv) {
        tv.photoAct = null;
        tv.photoInfo = null;
        tv.res = null;
        tvRenderBars(tv);
        tvRenderSide(tv);
        return tv.tab === "calibrate" ? tvAnalyzeForCal(tv) : tvAnalyze(tv);
      }

