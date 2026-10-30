      function tvRefreshState(tv, cfgCache) {
        var pCfg = cfgCache && tv.cfg && Date.now() - tv.cfgRead < tv.TV_CFG_REREAD_MS
          ? Promise.resolve(tv.cfg)
          : tvFileGet(TV_CFG_FILE).then(function (t) { tv.cfgRead = Date.now(); try { return t ? JSON.parse(t.replace(/^﻿/, "")) : {}; } catch (e) { return {}; } }, function () { return {}; });
        return Promise.all([
          tvGet("/state").catch(function (e) { return { ok: false, error: e.message }; }),
          pCfg,
        ]).then(function (r) {
          if (!tv.alive) return;
          var before = tv.state && tv.state.ok;
          tv.state = r[0];
          tv.cfg = r[1] || {};
          var firmaPuesta = tvStartupSignature(tv.state, tv.cfg);
          if (firmaPuesta !== tv.startupSignature) {
            tv.startupSignature = firmaPuesta;
            tv.startup.refresh();
          }
          // orientation to see the image as standing in front of the machine (from the calibration)
          var signature = JSON.stringify(tv.state.calibs || {}) + (tv.state.camera_en || "");
          if (tv.state.ok && signature !== tv.orientSignature) {
            tv.orientSignature = signature;
            tvGet("/orientation").then(function (o) {
              var antes = JSON.stringify(tv.orientAuto);
              tv.orientAuto = o && o.ok ? { rotation: o.rotation, mirror: !!o.mirror } : null;
              if (JSON.stringify(tv.orientAuto) !== antes && tv.alive) {
                tvRenderBars(tv);
                tvLoadView(tv).then(tzBind(tvDraw, tv));
              }
            }, function () { tv.orientAuto = null; });
          }
          if (tv.padPos) tv.padPos.textContent = tvPoseTxt(tv);
          tvPaintZones(tv);
          if (before !== tv.state.ok) tvRenderSide(tv);
          if (!tv.state.ok) {
            // a missing session is not a service that is off (it answers 401): say so
            if (workshopSignedOut()) tv.chipSrv.set("warn", i18nT('vision.sign_in_needed'), i18nT('vision.sign_in_needed_text'));
            else tv.chipSrv.set("err", i18nT('vision.service_off'), i18nT('vision.vision_service_not_answering_port', { port: TV_PORT, error: tv.state.error || "" }));
            tv.chipCamera.set("", i18nT('vision.camera'));
            tv.chipCal.set("", i18nT('vision.calibration'));
            return;
          }
          tv.chipSrv.set("ok", "OpenCV " + tv.state.opencv, i18nT('vision.workshop_vision_service_port', { port: TV_PORT }));
          var camera = tv.state.camera || {};
          var ctl = camera.control || {};
          if (ctl.notice) tv.chipCamera.set("warn", i18nT('vision.camera_check'), ctl.notice);
          else tv.chipCamera.set(camera.ok ? "ok" : camera.age_s === null ? "" : "warn", camera.ok ? tvFmt(camera.fps, 0) + " fps" : camera.age_s === null ? i18nT('vision.camera_on_standby') : i18nT('vision.camera_without_image'), camera.error || "");
          var ks = Object.keys(tv.state.calibs || {});
          tv.chipCal.set(
            ks.length ? (tv.state.height ? "ok" : "warn") : tv.state.source === "map" ? "warn" : "err",
            ks.length ? i18nT('vision.calibrated') + (tv.state.height ? " + " + i18nT('vision.height_lower') : i18nT('vision.without_height')) : tv.state.source === "map" ? i18nT('vision.map_calibration') : i18nT('vision.not_calibrated_lower'),
            ks.length ? i18nT('vision.calibrated_for_v', { v: ks.join(", ") }) : ""
          );
        });
      }

      function tvRenderAll(tv) {
        if (tv.tab === "calibrate" && !tv.calPts.length) {
          for (var i = 0; i < 4; i++) tv.calPts.push({ u: null, v: null, x: null, y: null });
          tv.calSel = 0;
        }
        tvRenderBars(tv);
        tvRenderSide(tv);
        tvDraw(tv);
        tvUpdateInfo(tv);
      }

      function tvOnKey(tv, ev) {
        // 2026-10-11: Esc first closes the open menu of the work bar
        if (ev.key === "Escape" && tv.popKey) {
          tvPopClose(tv);
          return;
        }
        if (ev.key === "Escape" && tvInFull(tv)) {
          tvExitFull(tv);
          return;
        }
        if (ev.key === "Escape") {
          tv.meas = [];
          tv.roiDrag = null;
          if (tv.movTarget) {
            tv.movTarget = null;
            tvRenderPad(tv);
          }
          tvUpdateInfo(tv);
          tvDraw(tv);
          return;
        }
        // + / - / 0: image zoom (not while typing)
        var tg = ev.target && ev.target.tagName;
        if (tg === "INPUT" || tg === "TEXTAREA" || tg === "SELECT" || ev.ctrlKey || ev.metaKey || ev.altKey || !tv.view.w || !tv.left.offsetParent) return;
        if (ev.key === "+" || ev.key === "=") tvZoomA(tv, tv.zoom.s * 1.5);
        else if (ev.key === "-") tvZoomA(tv, tv.zoom.s / 1.5);
        else if (ev.key === "0") tvZoomA(tv, 1);
      }

