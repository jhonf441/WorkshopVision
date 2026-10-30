      // ---- Guided calibration: ONE flow with the ArUco sheet, no technical parameters (F3-C, 2026-10-21) ----
      //
      // Five steps, one after the other: the image works, the sheet with the markers is on the bed, take the photo of the sheet, calibrate,
      // save. The method is always ArUco (the markers' positions were left by a technician in "Calibrate"); Canny, Hough, chessboard,
      // lens, points and laser crosses stay in the technician's Calibrate section. The steps are decided by tvGuidedPlan() (09-vision-roles.js,
      // pure and tested); this file only paints them and makes the calls the server allows to the role.

      function tvGuidedState(tv) {
        if (!tv.guided) tv.guided = { busy: "", seen: null, result: null, saved: false, error: "" };
        return tv.guided;
      }

      function tvGuidedMarks(tv) {
        var marks = tvArucoCfg(tv).marks;
        return Object.keys(marks).filter(function (k) { return marks[k] && marks[k][0] !== null && marks[k][1] !== null; });
      }

      function tvGuidedInput(tv, g) {
        var cam = tv.state && tv.state.camera;
        return {
          cameraOk: !!(cam && cam.ok),
          marksKnown: tvGuidedMarks(tv).length,
          seen: g.seen,
          result: g.result && g.result.calibration,
          saved: g.saved,
          canCalibrate: tvCan("vision.post", { path: "/calibrate" }),
          canSave: tvCan("settings.set"),
        };
      }

      // One call of the flow: shows `busy` while it runs, keeps the error in plain words, repaints.
      function tvGuidedRun(tv, busy, fn) {
        var g = tvGuidedState(tv);
        g.busy = busy;
        g.error = "";
        tvRenderSide(tv);
        return Promise.resolve().then(fn).catch(function (e) { g.error = String(e && e.message ? e.message : e); }).then(function () {
          g.busy = "";
          tvRenderSide(tv);
          tvDraw(tv);
        });
      }

      function tvGuidedTakePhoto(tv, g) {
        return tvGuidedRun(tv, i18nT('vision.taking_photo'), function () {
          g.result = null;
          g.saved = false;
          return tvPost("/photo", {}).then(function (r) {
            tv.photoAct = r.photo;
            tv.photoInfo = { n: 1 };
            return tvAnalyzeForCal(tv);
          }).then(function () {
            var items = (tv.res && tv.res.items) || [];
            g.seen = items.filter(function (it) { return it.kind === "mark"; }).length;
          });
        });
      }

      function tvGuidedCalibrate(tv, g) {
        return tvGuidedRun(tv, i18nT('vision.guided_calibrating'), function () {
          return tvPost("/calibrate", { mode: "aruco", photo: tv.res && tv.res.photo }).then(function (r) { g.result = r; });
        });
      }

      function tvGuidedSave(tv, g) {
        return tvGuidedRun(tv, i18nT('vision.guided_saving'), function () {
          return tvSaveCalibration(tv, g.result.calibration).then(function () {
            g.saved = true;
            tvFlash(tv, i18nT('vision.calibration_saved'), true);
          });
        });
      }

      // The text and the button of the step the person is on.
      function tvGuidedNow(tv, g, plan, box) {
        var row = tvEl("div", "tv-acts");
        if (plan.blocked) box.appendChild(tvMsg(plan.blocked === "no_camera" ? "err" : "info", i18nT("vision.guided_blocked_" + plan.blocked)));
        if (plan.now === "image") {
          row.appendChild(tvIBtn("refresh", i18nT('vision.refresh'), "small", function () { tvRefreshState(tv).then(function () { tvRenderSide(tv); }); }));
        } else if (plan.now === "photo" || plan.now === "sheet") {
          if (!plan.blocked) {
            row.appendChild(tvIBtn("camera-iris", g.seen === null ? i18nT('vision.guided_take_photo') : i18nT('vision.guided_take_photo_again'), "primary", function () { tvGuidedTakePhoto(tv, g); }));
          }
        } else if (plan.now === "calibrate") {
          if (!plan.blocked) row.appendChild(tvIBtn("target", i18nT('vision.guided_calibrate'), plan.quality === "bad" ? "small" : "primary", function () { tvGuidedCalibrate(tv, g); }));
          if (plan.quality === "bad") row.appendChild(tvIBtn("camera-iris", i18nT('vision.guided_take_photo_again'), "primary", function () { tvGuidedTakePhoto(tv, g); }));
        } else if (plan.now === "save" && !plan.blocked) {
          row.appendChild(tvIBtn("content-save-outline", i18nT('vision.save_calibration'), "primary", function () { tvGuidedSave(tv, g); }));
        }
        if (g.seen !== null && !plan.steps[2].done) box.appendChild(tvMsg("info", i18nT('vision.guided_seen_n', { n: g.seen })));
        if (plan.quality) box.appendChild(tvMsg(plan.quality === "bad" ? "err" : "ok", i18nT("vision.guided_quality_" + plan.quality)));
        if (row.childNodes.length) box.appendChild(row);
      }

      function tvRenderGuided(tv) {
        var g = tvGuidedState(tv);
        var plan = tvGuidedPlan(tvGuidedInput(tv, g));
        var card = tvCard(i18nT('vision.guided_calibration'), "target");
        tv.side.appendChild(card);
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.guided_intro')));
        var steps = tvEl("div", "tv-steps");
        card.appendChild(steps);
        plan.steps.forEach(function (p, i) {
          var d = tvEl("div", "tv-step" + (p.done ? " hecho" : p.id === plan.now ? " ahora" : ""));
          d.appendChild(tvEl("span", "n", p.done ? "✓" : String(i + 1)));
          var b = tvEl("div", "b");
          b.appendChild(tvEl("div", "tt", i18nT("vision.guided_step_" + p.id)));
          if (p.id === plan.now || p.id === "sheet") b.appendChild(tvEl("div", "tv-muted", i18nT("vision.guided_help_" + p.id)));
          if (p.id === plan.now) tvGuidedNow(tv, g, plan, b);
          d.appendChild(b);
          steps.appendChild(d);
        });
        if (g.busy) card.appendChild(tvMsg("info", g.busy));
        if (g.error) card.appendChild(tvMsg("err", g.error));
        var r = tvEl("div", "tv-acts");
        var marks = tvGuidedMarks(tv);
        if (marks.length >= 4) {
          r.appendChild(tvIBtn("printer", i18nT('vision.print_markers'), "small ghost", function () {
            var a = tvArucoCfg(tv);
            tvPrintMarks(tv, marks.map(Number), a.side, a.dict);
          }));
        }
        r.appendChild(tvIBtn("restart", i18nT('vision.start_over'), "small ghost", function () { tv.guided = null; tvRenderSide(tv); }));
        card.appendChild(r);
      }
