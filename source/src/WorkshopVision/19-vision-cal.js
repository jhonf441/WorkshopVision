      function tvRenderCal(tv) {
        var cl = {};
        cl.calibs = (tv.state && tv.state.calibs) || {};
        cl.SOURCE = { aruco: i18nT('vision.aruco_markers_lower'), points: i18nT('vision.points_by_hand'), crosses: i18nT('vision.laser_crosses'), "cruces laser": i18nT('vision.laser_crosses'), sheet: i18nT('vision.a4_sheet'), board: i18nT('vision.chessboard') };
        cl.ks = Object.keys(cl.calibs);
        cl.alt = tv.state && tv.state.height;
        cl.ind = function ind(ok, text, sub, color) {
          var r = tvEl("div", "tv-ind");
          var ic = tvIcon(ok === true ? "check-circle" : ok === false ? "close-circle" : "alert-circle");
          ic.style.color = color || (ok === true ? "#66bb6a" : ok === false ? "#ef5350" : "#ffa726");
          r.appendChild(ic);
          var t = tvEl("div");
          t.appendChild(tvEl("div", null, text));
          if (sub) t.appendChild(tvEl("div", "tv-muted", sub));
          r.appendChild(t);
          cl.c1.appendChild(r);
        };
        cl.readMarks = function readMarks() {
          var m = {};
          Object.keys(cl.edits).forEach(function (i) {
            var x = parseFloat(cl.edits[i][0].value), y = parseFloat(cl.edits[i][1].value);
            if (isFinite(x) && isFinite(y)) m[i] = [x, y];
          });
          return m;
        };
        tvCalState(tv, cl);
        tvCalWizard(tv, cl);
        tvCalCrossings(tv, cl);
        tvCalAruco(tv, cl);
        tvCalSheetBoard(tv, cl);
        tvCalPoints(tv, cl);
        tvCalHeight(tv, cl);
      }

      function tvCalState(tv, cl) {
        cl.c1 = tvCard(i18nT('vision.calibration_status'), cl.ks.length && cl.alt ? "check-decagram-outline" : "alert-decagram-outline");
        tv.side.appendChild(cl.c1);
        if (!cl.ks.length) cl.ind(tv.state && tv.state.source === "map" ? null : false, tv.state && tv.state.source === "map" ? i18nT('vision.uses_the_map_camera_s_calibration') : i18nT('vision.not_calibrated'), tv.state && tv.state.source === "map" ? i18nT('vision.it_is_fixed_it_does_not') : i18nT('vision.measurements_come_out_only_in_pixels'));
        cl.ks.forEach(function (k) {
          var c = cl.calibs[k];
          var bueno = c.error_mm < 0.6;
          cl.ind(bueno ? true : null, i18nT('vision.image_k_error', { k: k, e: tvFmt(c.error_mm, 2) }) + " · " + tvFmt(c.px_per_mm, 2) + " px/mm", (cl.SOURCE[c.source] || c.source || "") + (c.z !== null && c.z !== undefined ? " · " + i18nT('vision.at_yz', { y: tvFmt(c.y), z: tvFmt(c.z) }) : "") + (c.date ? " · " + c.date : ""));
        });
        cl.ind(cl.alt ? true : null, cl.alt ? i18nT('vision.height_the_lens_is_at_z_mm', { h: tvFmt(cl.alt.h0, 1) }) : i18nT('vision.second_height_missing'), cl.alt ? i18nT('vision.fit_mm_photos_any_z', { e: tvFmt(cl.alt.rms_mm, 2) }) : i18nT('vision.for_now_photos_are_taken_at'));
        var cc = tv.state && tv.state.camera && tv.state.camera.control;
        if (cc && cc.notice) cl.c1.appendChild(tvMsg("err", i18nT('vision.camera_colon_v', { v: cc.notice })));
        var rf = tvEl("div", "tv-row");
        cl.c1.appendChild(rf);
        rf.appendChild(
          tvIBtn("camera-iris", tv.photoAct ? i18nT('vision.another_photo_here') : i18nT('vision.measuring_photo_here'), "primary", function () {
            tv.photoBusy = i18nT('vision.taking_photo');
            tvFlash(tv, i18nT('vision.taking_measuring_photo'), true);
            tvPost("/photo", {})
              .then(function (r) {
                tv.photoBusy = "";
                tv.photoAct = r.photo;
                tv.photoInfo = { n: 1 };
                tv.lastMsg = { t: i18nT('vision.photo_size_at_yz_now_calibrate', { size: r.size[0] + "×" + r.size[1], y: tvFmt(r.pose && r.pose.y), z: tvFmt(r.pose && r.pose.z) }), ok: true };
                tvRenderBars(tv);
                return tvAnalyzeForCal(tv);
              })
              .catch(function (e) { tv.photoBusy = ""; tvFlash(tv, i18nT('vision.photo_colon_v', { v: e.message }), false); });
          }, null, i18nT('vision.measuring_photo_at_the_current_position'))
        );
        if (cl.ks.length || cl.alt)
          rf.appendChild(tvIBtn("delete-outline", i18nT('vision.delete_calibrations'), "small ghost", function () {
            tvCfgSave(tv, function (o) { delete o.calibration; delete o.calibs; delete o.height; return o; }).then(function () { tvFlash(tv, i18nT('vision.calibrations_deleted'), true); });
          }, i18nT('vision.confirm_delete')));
        cl.c1.appendChild(tvEl("div", "tv-muted", i18nT('vision.it_is_calibrated_at_the_measuring')));
      }

      function tvCalWizard(tv, cl) {
        // ---- assistant (2026-10-10: "is there no assistant to calibrate the camera?") ----
        var cA = tvCard(i18nT('vision.calibration_assistant'), "shoe-print");
        tv.side.insertBefore(cA, cl.c1);
        var cameraOk = !!(tv.state && tv.state.camera && tv.state.camera.ok);
        var calOk = cl.ks.length > 0;
        var stepsA = [
          [cameraOk, i18nT('vision.check_the_image'), cameraOk ? (tv.state.camera.mode === 'direct' ? i18nT('vision.direct_camera_without_relay') : i18nT('vision.the_camera_is_sending_video_it')) : i18nT('vision.the_camera_isn_t_sending_images')],
          [calOk, i18nT('vision.choose_a_method_and_calibrate'), i18nT('vision.with_the_laser_crosses_the_easiest')],
          [!!cl.alt, i18nT('vision.second_height'), i18nT('vision.to_measure_and_take_photos_at')],
          [null, i18nT('vision.check'), i18nT('vision.measure_something_of_known_size_a')],
        ];
        var nowA = stepsA.findIndex(function (p) { return p[0] !== true; });
        var stA = tvEl("div", "tv-steps");
        cA.appendChild(stA);
        stepsA.forEach(function (p, i) {
          var d = tvEl("div", "tv-step" + (p[0] === true ? " hecho" : i === nowA ? " ahora" : ""));
          d.appendChild(tvEl("span", "n", p[0] === true ? "✓" : String(i + 1)));
          var b = tvEl("div", "b");
          b.appendChild(tvEl("div", "tt", p[1]));
          b.appendChild(tvEl("div", "tv-muted", p[2]));
          var r = tvEl("div", "tv-row");
          if (i === 1) {
            [["cal-crosses", i18nT('vision.laser_crosses_2'), "crosshairs-gps"], ["cal-sheet", i18nT('vision.a4_sheet_2'), "file-outline"], ["cal-board", i18nT('vision.board'), "checkerboard"], ["cal-aruco", "ArUco", "qrcode"], ["cal-points", i18nT('vision.points_by_hand_2'), "gesture-tap"]].filter(function (m) { return !(m[0] === "cal-crosses" && tv.laserOn === false); }).forEach(function (m) {
              r.appendChild(tvIBtn(m[2], m[1], tvIsAccOpen(tv, m[0]) ? "on small" : "small", function () { tvOpenAcc(tv, m[0]); }));
            });
          }
          if (i === 2 && !cl.alt) r.appendChild(tvIBtn("arrow-expand-vertical", i18nT('vision.go_to_second_height'), "small", function () { tvOpenAcc(tv, "cal-height"); }));
          if (i === 3) r.appendChild(tvIBtn("ruler", i18nT('vision.go_to_detect_and_measure'), "small", function () { tvIrSection(tv, "detect"); }));
          if (r.childNodes.length) b.appendChild(r);
          d.appendChild(b);
          stA.appendChild(d);
        });
      }

      function tvCalCrossings(tv, cl) {
        // The crosses are burned with the laser: without Laser mode in the machine modes the method is not offered (null = not answered yet)
        if (tv.laserOn === undefined) {
          tv.laserOn = null;
          workshopModes.load().then(function (info) {
            tv.laserOn = info && info.state && info.state.answered ? !!info.state.answer.Laser : null;
            if (tv.laserOn === false) tvRenderSide(tv);
          });
        }
        if (tv.laserOn === false) {
          var noLaser = tvCard(i18nT('vision.automatic_with_laser_crosses'), "crosshairs-gps");
          noLaser.appendChild(tvEl("div", "tv-muted", i18nT('vision.crosses_need_laser')));
          tv.side.appendChild(noLaser);
        } else {
          // metodos: uno abierto a la vez
          var aCr = tvAcc(tv, "cal-crosses", i18nT('vision.automatic_with_laser_crosses'), "crosshairs-gps", i18nT('vision.burns_6_9_or_12_crosses'), "cal", true, i18nT('vision.recommended'));
          tv.side.appendChild(aCr.el);
          if (aCr.open) tvRenderCrossings(tv, aCr.body);
        }
        // ArUco
        cl.a = tvArucoCfg(tv);
      }

      function tvCalAruco(tv, cl) {
        var aAr = tvAcc(tv, "cal-aruco", i18nT('vision.with_printed_aruco_markers'), "qrcode", i18nT('vision.print_4_markers_stick_them_and'), "cal", false);
        tv.side.appendChild(aAr.el);
        var c2 = aAr.body;
        c2.appendChild(tvEl("div", "tv-muted", i18nT('vision.1_print_the_markers_and_stick')));
        var r0 = tvEl("div", "tv-row");
        c2.appendChild(r0);
        r0.appendChild(tvEl("span", "tv-muted", i18nT('vision.side_mm')));
        var inL = tvEl("input", "tv-in");
        inL.type = "number";
        inL.value = cl.a.side;
        inL.style.width = "60px";
        r0.appendChild(inL);
        r0.appendChild(tvBtn(i18nT('vision.print_markers'), "small", function () {
          var side = parseFloat(inL.value) || 40;
          var ids = Object.keys(cl.a.marks).length ? Object.keys(cl.a.marks).map(Number) : [0, 1, 2, 3];
          tvPrintMarks(tv, ids, side, cl.a.dict);
        }, null, i18nT('vision.opens_a_sheet_with_the_markers')));
        var views = {};
        ((tv.res && tv.res.items) || []).forEach(function (it) { if (it.kind === "mark") views[it.mark] = it; });
        var tbl = tvEl("table", "tv-tbl");
        c2.appendChild(tbl);
        var thr = tvEl("tr");
        ["#", "X", "Y", "", i18nT('vision.in_the_photo')].forEach(function (t) { thr.appendChild(tvEl("th", null, t)); });
        tbl.appendChild(thr);
        var ids = Object.keys(cl.a.marks).map(Number);
        [0, 1, 2, 3].forEach(function (i) { if (ids.indexOf(i) === -1) ids.push(i); });
        Object.keys(views).map(Number).forEach(function (i) { if (ids.indexOf(i) === -1) ids.push(i); });
        ids.sort(function (x, y) { return x - y; });
        cl.edits = {};
        ids.forEach(function (i) {
          var tr = tvEl("tr");
          tbl.appendChild(tr);
          tr.appendChild(tvEl("td", null, String(i)));
          var pos = cl.a.marks[String(i)] || [null, null];
          var ins = [0, 1].map(function (k) {
            var td = tvEl("td");
            var inp = tvEl("input", "tv-in");
            inp.type = "number";
            inp.step = "0.01";
            inp.style.width = "72px";
            inp.value = pos[k] === null || pos[k] === undefined ? "" : pos[k];
            td.appendChild(inp);
            tr.appendChild(td);
            return inp;
          });
          cl.edits[i] = ins;
          var td3 = tvEl("td");
          td3.appendChild(tvBtn(i18nT('vision.pointer_here'), "small", function () {
            tvMachine().then(function (st) {
              var ax = tvAxes(st);
              if (!ax.X || !ax.X.homed || !ax.Y.homed) return tvFlash(tv, i18nT('vision.x_and_y_need_homing'), false);
              ins[0].value = Math.round(ax.X.machinePosition * 100) / 100;
              ins[1].value = Math.round(ax.Y.machinePosition * 100) / 100;
            });
          }, null, i18nT('vision.uses_where_the_pointer_is_now')));
          tr.appendChild(td3);
          var v = views[i];
          tr.appendChild(tvEl("td", null, v ? i18nT('vision.yes_lower') + (v.mm && v.mm.error !== undefined && v.mm.error !== null ? " (" + tvFmt(v.mm.error, 2) + " mm)" : "") : i18nT('vision.no_lower')));
        });
        var r1 = tvEl("div", "tv-row");
        c2.appendChild(r1);
        r1.appendChild(tvBtn(i18nT('vision.save_positions'), "small", function () {
          var m = cl.readMarks();
          tvCfgSave(tv, function (o) { o.aruco = { dict: cl.a.dict, side: parseFloat(inL.value) || 40, marks: m }; return o; }).then(function () { tvFlash(tv, i18nT('vision.marker_positions_saved'), true); }, function (e) { tvFlash(tv, e.message, false); });
        }));
        r1.appendChild(tvBtn(i18nT('vision.calibrate_now'), "primary", function () {
          var m = cl.readMarks();
          if (Object.keys(m).length < 4) return tvFlash(tv, i18nT('vision.4_markers_with_x_and_y'), false);
          tvCfgSave(tv, function (o) { o.aruco = { dict: cl.a.dict, side: parseFloat(inL.value) || 40, marks: m }; return o; })
            .then(function () { return tvPost("/calibrate", { mode: "aruco", photo: tv.res && tv.res.photo }); })
            .then(function (r) { tv.calRes = r; tv.lastMsg = null; tvRenderSide(tv); }, function (e) { tvFlash(tv, e.message, false); });
        }));
      }

      function tvCalSheetBoard(tv, cl) {
        // ---- hoja A4 (sin imprimir) ----
        var aHo = tvAcc(tv, "cal-sheet", i18nT('vision.with_an_a4_sheet'), "file-outline", i18nT('vision.it_finds_the_sheet_on_its'), "cal", false, i18nT('vision.nothing_to_print'));
        tv.side.appendChild(aHo.el);
        if (aHo.open) tvRenderSheet(tv, aHo.body);
        // ---- tablero de ajedrez (y lente) ----
        var aTb = tvAcc(tv, "cal-board", i18nT('vision.with_a_chessboard'), "checkerboard", i18nT('vision.many_points_on_their_own_the'), "cal", false);
        tv.side.appendChild(aTb.el);
        if (aTb.open) tvRenderBoard(tv, aTb.body);
      }

      function tvCalPoints(tv, cl) {
        // A mano
        var aPm = tvAcc(tv, "cal-points", i18nT('vision.with_points_by_hand'), "gesture-tap", i18nT('vision.4_or_more_points_tap_them'), "cal", false);
        tv.side.appendChild(aPm.el);
        var c3 = aPm.body;
        c3.appendChild(tvEl("div", "tv-muted", i18nT('vision.without_printing_anything_4_or_more')));
        tv.calPts.forEach(function (p, i) {
          var r = tvEl("div", "tv-row");
          c3.appendChild(r);
          r.appendChild(tvBtn(i18nT('vision.point_n', { n: i + 1 }), tv.calSel === i ? "on small" : "small", function () { tv.calSel = i; tvRenderSide(tv); tvDraw(tv); }));
          r.appendChild(tvEl("span", "tv-muted", p.u === null ? i18nT('vision.not_tapped_yet') : i18nT('vision.ok_in_the_image')));
          ["x", "y"].forEach(function (k) {
            var inp = tvEl("input", "tv-in");
            inp.type = "number";
            inp.step = "0.01";
            inp.style.width = "70px";
            inp.placeholder = k.toUpperCase();
            inp.value = p[k] === null ? "" : p[k];
            inp.addEventListener("input", function () { var v = parseFloat(inp.value); p[k] = isFinite(v) ? v : null; });
            r.appendChild(inp);
          });
          r.appendChild(tvBtn(i18nT('vision.pointer_here'), "small", function () {
            tvMachine().then(function (st) {
              var ax = tvAxes(st);
              if (!ax.X || !ax.X.homed || !ax.Y.homed) return tvFlash(tv, i18nT('vision.x_and_y_need_homing'), false);
              p.x = Math.round(ax.X.machinePosition * 100) / 100;
              p.y = Math.round(ax.Y.machinePosition * 100) / 100;
              tvRenderSide(tv);
            });
          }));
          r.appendChild(tvBtn("✕", "small", function () { tv.calPts.splice(i, 1); tv.calSel = -1; tvRenderSide(tv); tvDraw(tv); }));
        });
        var r3 = tvEl("div", "tv-row");
        c3.appendChild(r3);
        r3.appendChild(tvBtn(i18nT('vision.add_point'), "small", function () { tv.calPts.push({ u: null, v: null, x: null, y: null }); tv.calSel = tv.calPts.length - 1; tvRenderSide(tv); tvDraw(tv); }));
        r3.appendChild(tvBtn(i18nT('vision.calculate'), "primary", function () {
          var ok = tv.calPts.filter(function (p) { return p.u !== null && p.x !== null && p.y !== null; });
          if (ok.length < 4) return tvFlash(tv, i18nT('vision.4_complete_points_are_needed_tapped'), false);
          var size = ok[0].size || (tv.res && tv.res.size) || [tv.view.w, tv.view.h];
          tvPost("/calibrate", { mode: "points", photo: tv.res && tv.res.photo, size: size, pairs: ok.map(function (p) { return [p.u, p.v, p.x, p.y]; }) }).then(function (r) { tv.calRes = r; tv.lastMsg = null; tvRenderSide(tv); }, function (e) { tvFlash(tv, e.message, false); });
        }));
        // resultado
        if (tv.calRes) {
          var c4 = tvCard(i18nT('vision.result_not_saved'), "clipboard-check-outline");
          tv.side.insertBefore(c4, cl.c1.nextSibling);
          var cr = tv.calRes.calibration;
          var bueno = cr.error_mm < 1;
          c4.appendChild(tvEl("div", "tv-msg " + (bueno ? "ok" : "err"), i18nT('vision.average_error_result', { e: tvFmt(cr.error_mm, 2), max: tvFmt(cr.max_mm, 2), ppm: tvFmt(cr.px_per_mm, 2), size: cr.size[0] + "×" + cr.size[1] }) + (bueno ? "" : "\n" + i18nT('vision.very_high_check_the_coordinates_a'))));
          if (tv.calRes.missing && tv.calRes.missing.length) c4.appendChild(tvEl("div", "tv-muted", i18nT('vision.the_markers_were_not_seen_v', { v: tv.calRes.missing.join(", ") })));
          if (tv.calRes.note) c4.appendChild(tvEl("div", "tv-msg " + (tv.calRes.noteBad ? "err" : "info"), tv.calRes.note));
          var r4 = tvEl("div", "tv-row");
          c4.appendChild(r4);
          r4.appendChild(tvBtn(i18nT('vision.save_calibration'), "primary", function () {
            tvSaveCalibration(tv, cr).then(function () {
              tv.calRes = null;
              tvFlash(tv, i18nT('vision.calibration_saved_it_now_measures_in'), true);
              tvAnalyzeForCal(tv);
            }, function (e) { tvFlash(tv, e.message, false); });
          }));
          r4.appendChild(tvBtn(i18nT('vision.discard'), "small", function () { tv.calRes = null; tvRenderSide(tv); }));
        }
      }

      function tvCalHeight(tv, cl) {
        // ---- segunda altura ----
        var aAl = tvAcc(tv, "cal-height", i18nT('vision.second_height'), "arrow-expand-vertical", i18nT('vision.so_the_photo_plan_picks_the'), "cal", false, cl.alt ? "done" : null);
        tv.side.appendChild(aAl.el);
        var c6 = aAl.body;
        c6.appendChild(
          tvEl(
            "div",
            "tv-muted",
            i18nT('vision.with_a_saved_calibration_1_raise')
          )
        );
        var rz = tvEl("div", "tv-row");
        c6.appendChild(rz);
        var cz = (tv.prefs.calZ = tv.prefs.calZ || {});
        rz.appendChild(tvEl("span", "tv-muted", "Z"));
        rz.appendChild(tvNumIn(tv, cz, "z", 70));
        rz.appendChild(
          tvBtn("Ir a Z", null, function () {
            var z = parseFloat(cz.z);
            if (!isFinite(z)) return tvFlash(tv, i18nT('vision.enter_the_z_to_go_to'), false);
            var ml = workshopMachineFree(undefined, { purpose: "move" });
            var confirmed = false;
            if (ml.confirm) {
              // live job open but still: second double tap with the reason in view
              if (!tv.izConfirmUntil || Date.now() > tv.izConfirmUntil) {
                tv.izConfirmUntil = Date.now() + 15000;
                return tvFlash(tv, ml.reason + i18nT('vision.to_move_anyway_tap_go_to'), false);
              }
              tv.izConfirmUntil = 0;
              confirmed = true;
            } else if (!ml.free) return tvFlash(tv, i18nT('vision.could_not_move_v', { v: ml.reason }) + ".", false);
            tvFlash(tv, i18nT('vision.moving_z_to', { z: tvFmt(z) }), true);
            tvMoveA(tv, null, z, undefined, confirmed)
              .then(function () { tvFlash(tv, i18nT('vision.gantry_at_z_now_take_photo', { z: tvFmt(z) }), true); tvRefreshState(tv); }, function (e) { tvFlash(tv, i18nT('vision.could_not_move_v', { v: String(e.message) }), false); });
          }, i18nT('vision.confirm_moves_z'), i18nT('vision.raises_lowers_the_gantry_to_that_z'))
        );
        var ra = tvEl("div", "tv-row");
        c6.appendChild(ra);
        ra.appendChild(
          tvBtn(i18nT('vision.calibrate_height_markers'), "primary", function () {
            tvPost("/calibrate", { mode: "aruco", photo: tv.res && tv.res.photo, height: true }).then(function (r) { tv.altRes = r; tv.lastMsg = null; tvRenderSide(tv); }, function (e) { tvFlash(tv, e.message, false); });
          }, null, i18nT('vision.uses_the_aruco_markers_in_the'))
        );
        ra.appendChild(
          tvBtn(i18nT('vision.calibrate_height_points'), null, function () {
            var ok = tv.calPts.filter(function (p) { return p.u !== null && p.x !== null && p.y !== null; });
            if (ok.length < 4) return tvFlash(tv, i18nT('vision.mark_4_points_on_the_new'), false);
            var size = ok[0].size || (tv.res && tv.res.size);
            tvPost("/calibrate", { mode: "points", photo: tv.res && tv.res.photo, size: size, height: true, pairs: ok.map(function (p) { return [p.u, p.v, p.x, p.y]; }) }).then(function (r) { tv.altRes = r; tv.lastMsg = null; tvRenderSide(tv); }, function (e) { tvFlash(tv, e.message, false); });
          })
        );
        if (tv.altRes && tv.altRes.height) {
          var a2 = tv.altRes.height;
          c6.appendChild(tvEl("div", "tv-msg " + (a2.rms_mm < 1 ? "ok" : "err"), i18nT('vision.lens_at_z_plus_in_this_photo', { h: tvFmt(a2.h0, 1), lens: tvFmt(a2.lens_mm[1], 0), e: tvFmt(a2.rms_mm, 2) }) + (a2.rms_mm < 1 ? "" : "\n" + i18nT('vision.bad_fit_check_that_they_are'))));
          var rs = tvEl("div", "tv-row");
          c6.appendChild(rs);
          rs.appendChild(
            tvBtn(i18nT('vision.save_height'), "primary", function () {
              tvSaveCalibration(tv, tv.altRes.calibration, function (o) { o.height = a2; }).then(function () {
                tv.altRes = null;
                tvFlash(tv, i18nT('vision.height_saved_the_photo_plan_now'), true);
              }, function (e) { tvFlash(tv, e.message, false); });
            })
          );
          rs.appendChild(tvBtn(i18nT('vision.discard'), "small", function () { tv.altRes = null; tvRenderSide(tv); }));
        }
      }
