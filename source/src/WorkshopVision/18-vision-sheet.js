      function tvRenderSheet(tv, c) {
        var p = (tv.prefs.sheet = tv.prefs.sheet || { kind: "a4", w: 210, h: 297 });
        c.appendChild(tvEl("div", "tv-muted", i18nT('vision.1_put_a_white_sheet_whole')));
        var g = tvEl("div", "tv-prm");
        c.appendChild(g);
        g.appendChild(tvEl("label", null, i18nT('vision.sheet')));
        var sel = tvEl("select", "tv-sel");
        Object.keys(tv.TV_SHEETS).forEach(function (k) {
          var op = tvEl("option", null, tv.TV_SHEETS[k][0] + (tv.TV_SHEETS[k][1] ? " (" + tv.TV_SHEETS[k][1] + " × " + tv.TV_SHEETS[k][2] + " mm)" : ""));
          op.value = k;
          if (p.kind === k) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener("change", function () {
          p.kind = sel.value;
          if (tv.TV_SHEETS[p.kind][1]) { p.w = tv.TV_SHEETS[p.kind][1]; p.h = tv.TV_SHEETS[p.kind][2]; }
          tvSavePrefs(tv.prefs);
          tvRenderSide(tv);
        });
        g.appendChild(sel);
        if (p.kind === "other") {
          g.appendChild(tvEl("label", null, i18nT('vision.width_x_height_mm')));
          var wh = tvEl("span");
          wh.appendChild(tvNumIn(tv, p, "w", 70));
          wh.appendChild(tvNumIn(tv, p, "h", 70));
          g.appendChild(wh);
        }
        var rb = tvEl("div", "tv-row");
        c.appendChild(rb);
        rb.appendChild(tvIBtn("file-find-outline", tv.sheetDet ? i18nT('vision.find_again') : i18nT('vision.find_the_sheet'), tv.sheetDet ? "small" : "primary", function () {
          tvDetectCal(tv, "/calibrate/sheet", {}, function (r) { tv.sheetDet = r; tv.sheetRefs = {}; });
        }, null, i18nT('vision.in_the_measuring_photo_if_there')));
        if (!tv.sheetDet) return;
        c.appendChild(tvEl("div", "tv-muted", i18nT('vision.corners_in_the_image_1_to')));
        [0, 1, 2, 3].forEach(function (k) {
          var r = tvEl("div", "tv-row");
          c.appendChild(r);
          r.appendChild(tvEl("b", null, i18nT('vision.corner_n', { n: k + 1 })));
          var v = tvEl("span", "tv-muted", tv.sheetRefs[k] ? "X" + tvFmt(tv.sheetRefs[k].x, 2) + " Y" + tvFmt(tv.sheetRefs[k].y, 2) : i18nT('vision.no_pointer'));
          r.appendChild(v);
          r.appendChild(tvBtn(i18nT('vision.pointer_here'), "small", function () { tvPointerHere(tv, function (q) { tv.sheetRefs[k] = q; }); }));
          if (tv.sheetRefs[k]) r.appendChild(tvBtn("✕", "small ghost", function () { delete tv.sheetRefs[k]; tvRenderSide(tv); tvDraw(tv); }));
        });
        var n = Object.keys(tv.sheetRefs).length;
        var rc = tvEl("div", "tv-row");
        c.appendChild(rc);
        var bC = tvBtn(i18nT('vision.calculate'), "primary", function () {
          var pw = parseFloat(p.w), ph = parseFloat(p.h);
          if (!(pw > 20 && ph > 20)) return tvFlash(tv, i18nT('vision.the_sheet_size_is_missing'), false);
          var ks = [0, 1, 2, 3].filter(function (k) { return tv.sheetRefs[k]; });
          var R = function (k) { return [tv.sheetRefs[k].x, tv.sheetRefs[k].y]; };
          var d = function (a, b) { return tvDist(R(a), R(b)); };
          // which side of the image (1-2 or 2-3) is the long one, according to the pointer
          var l01 = tv.sheetRefs[0] && tv.sheetRefs[1] ? d(0, 1) : d(2, 3);
          var l12 = tv.sheetRefs[1] && tv.sheetRefs[2] ? d(1, 2) : d(3, 0);
          var L01 = l01 >= l12 ? Math.max(pw, ph) : Math.min(pw, ph),
            L12 = l01 >= l12 ? Math.min(pw, ph) : Math.max(pw, ph);
          var model = [[0, 0], [L01, 0], [L01, L12], [0, L12]];
          var aj = tvSettingRigid(tv, ks.map(function (k) { return model[k]; }), ks.map(R));
          var E = tv.sheetDet.corners;
          var pairs = [0, 1, 2, 3].map(function (k) { var m = aj.f(model[k]); return [E[k][0], E[k][1], m[0], m[1]]; });
          tvPost("/calibrate", { mode: "points", photo: tv.sheetDet.photo, size: tv.sheetDet.size, pairs: pairs }).then(function (r) {
            tv.calRes = r;
            tv.calRes.note = i18nT('vision.sheet_of_size_pointer_off', { w: tvFmt(L01, 1), h: tvFmt(L12, 1), e: tvFmt(aj.rms, 2) }) + (aj.rms > 1 ? "\n" + i18nT('vision.high_check_that_the_pointer_was') : "");
            tv.calRes.noteBad = aj.rms > 1;
            tv.calRes.calibration.error_mm = Math.round(aj.rms * 1000) / 1000;
            tv.calRes.calibration.source = "sheet";
            tv.lastMsg = null;
            tvRenderSide(tv);
          }, function (e) { tvFlash(tv, e.message, false); });
        });
        bC.disabled = n < 3;
        rc.appendChild(bC);
        if (n < 3) rc.appendChild(tvEl("span", "tv-muted", i18nT('vision.n_corners_missing_with_the_pointer', { n: 3 - n })));
      }

      // ---- tablero de ajedrez (y lente) ----
      function tvRenderBoard(tv, c) {
        var tb = {};
        tb.p = (tv.prefs.board = tv.prefs.board || { columns: 10, rows: 7, frame: 20 });
        c.appendChild(tvEl("div", "tv-muted", i18nT('vision.1_print_the_chessboard_at_100')));
        // Checklist that has to be met (2026-10-10, request): it is marked by hand;
        // Calculate waits for it to be complete. "Found" is marked by the search.
        tb.list = (tb.p.list = tb.p.list || {});
        tvBoardRequirements(tv, tb, c);
        tvBoardDetection(tv, tb, c);
        tvBoardLens(tv, tb, c);
      }


      function tvPrintBoard(tv, cols, filas, side) {
        cols = parseInt(cols, 10) || 10;
        filas = parseInt(filas, 10) || 7;
        side = parseFloat(side) || 20;
        var w = window.open("", "_blank");
        if (!w) return tvFlash(tv, i18nT('vision.the_browser_blocked_the_print_window'), false);
        var cel = "";
        for (var j = 0; j < filas; j++) {
          cel += "<tr>";
          for (var i = 0; i < cols; i++) cel += "<td style='background:" + ((i + j) % 2 ? "#fff" : "#000") + "'></td>";
          cel += "</tr>";
        }
        w.document.write("<!doctype html><meta charset='utf-8'><title>" + i18nT('vision.chessboard') + "</title><style>body{font-family:sans-serif;margin:10mm}table{border-collapse:collapse;margin-top:6mm}td{width:" + side + "mm;height:" + side + "mm;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}@media print{.np{display:none}}</style>" +
          "<div class='np'><p>" + i18nT('vision.print_board_hint', { cols: cols, rows: filas, mm: side }) + "</p><button onclick='print()'>" + i18nT('vision.print') + "</button></div><table>" + cel + "</table>");
        w.document.close();
      }

      function tvCrossingsPoll(tv) {
        clearTimeout(tv.crosses.timer);
        if (!tv.alive) return;
        tvGet("/crosses/state")
          .then(function (s) {
            var before = tv.crosses.st && tv.crosses.st.active;
            tv.crosses.st = s;
            if (tv.tab === "calibrate") tvRenderSide(tv);
            if (s.active) tv.crosses.timer = setTimeout(tzBind(tvCrossingsPoll, tv), 1500);
            else if (before) tvRefreshState(tv);
          })
          .catch(function () {
            tv.crosses.timer = setTimeout(tzBind(tvCrossingsPoll, tv), 4000);
          });
      }

      function tvCrossingsMacros(tv) {
        if (tv.crosses.macros) return;
        tv.crosses.macros = [];
        fetch("/machine/directory/" + encodeURI("0:/macros/laser"), { cache: "no-store" })
          .then(function (r) { return r.ok ? r.json() : []; })
          .then(function (l) {
            tv.crosses.macros = (l || [])
              .map(function (f) { return f.name; })
              .filter(function (n) { return /\.g$/i.test(n) && !/^(air|guardarorigen|light)/i.test(n); });
            if (tv.tab === "calibrate") tvRenderSide(tv);
          }, function () {});
      }

      function tvRenderCrossings(tv, c) {
        var cr = {};
        tvCrossingsMacros(tv);
        if (!tv.crosses.st && !tv.crosses.timer) tvCrossingsPoll(tv);
        cr.s = tv.crosses.st || {};
        if (tvCrossingsState(tv, cr, c)) return;
        tvCrossingsSettings(tv, cr, c);
        tvCrossingsButtons(tv, cr, c);
      }


      function tvBoardRequirements(tv, tb, c) {
        var REQ = [
          ["imp", i18nT('vision.printed_at_100_no_fit_to')],
          ["med", i18nT('vision.i_measured_a_square_with_a')],
          ["cf", i18nT('vision.columns_and_rows_squares_of_the')],
          ["flat", i18nT('vision.flat_and_stuck_to_the_bed')],
          ["view", i18nT('vision.whole_in_the_image_with_margin')],
          ["still", i18nT('vision.neither_the_camera_nor_the_board')],
          ["hom", i18nT('vision.x_and_y_homed_to_bring')],
        ];
        tb.missingReq = 0;
        var lb = tvEl("div", "tv-lbl", i18nT('vision.before_calibrating'));
        c.appendChild(lb);
        REQ.forEach(function (rq) {
          var l = tvEl("label", "tv-check");
          l.style.margin = "2px 0";
          var cb = tvEl("input");
          cb.type = "checkbox";
          cb.checked = !!tb.list[rq[0]];
          if (!cb.checked) tb.missingReqReq++;
          cb.addEventListener("change", function () {
            tb.list[rq[0]] = cb.checked;
            tvSavePrefs(tv.prefs);
            tvRenderSide(tv);
          });
          l.appendChild(cb);
          l.appendChild(tvEl("span", null, rq[1]));
          c.appendChild(l);
        });
        var lEnc = tvEl("div", "tv-muted", tv.tabDet ? i18nT('vision.done_board_found') : i18nT('vision.missing_board_found'));
        lEnc.style.color = tv.tabDet ? "#a5d6a7" : "";
        c.appendChild(lEnc);
        var g = tvEl("div", "tv-prm");
        c.appendChild(g);
        g.appendChild(tvEl("label", null, i18nT('vision.squares_columns_x_rows')));
        var cf = tvEl("span");
        cf.appendChild(tvNumIn(tv, tb.p, "columns", 60));
        cf.appendChild(tvNumIn(tv, tb.p, "rows", 60));
        g.appendChild(cf);
        g.appendChild(tvEl("label", null, i18nT('vision.side_of_each_square_mm_measured')));
        g.appendChild(tvNumIn(tv, tb.p, "frame", 70));
        tb.rb = tvEl("div", "tv-row");
        c.appendChild(tb.rb);
        tb.rb.appendChild(tvIBtn("printer-outline", i18nT('vision.print_chessboard'), "small", function () { tvPrintBoard(tv, tb.p.columns, tb.p.rows, tb.p.frame); }));
      }

      function tvBoardDetection(tv, tb, c) {
        tb.rb.appendChild(tvIBtn("checkerboard", tv.tabDet ? i18nT('vision.find_again') : i18nT('vision.find_the_chessboard'), tv.tabDet ? "small" : "primary", function () {
          tvDetectCal(tv, "/calibrate/board", { columns: tb.p.columns, rows: tb.p.rows }, function (r) { tv.tabDet = r; tv.tabRefs = {}; });
        }));
        if (tv.tabDet) {
          c.appendChild(tvEl("div", "tv-muted", i18nT('vision.n_corners_found_outer_corners', { n: tv.tabDet.n })));
          [0, 1, 2, 3].forEach(function (k) {
            var r = tvEl("div", "tv-row");
            c.appendChild(r);
            r.appendChild(tvEl("b", null, i18nT('vision.corner_n', { n: k + 1 })));
            var v = tvEl("span", "tv-muted", tv.tabRefs[k] ? "X" + tvFmt(tv.tabRefs[k].x, 2) + " Y" + tvFmt(tv.tabRefs[k].y, 2) : i18nT('vision.no_pointer'));
            r.appendChild(v);
            r.appendChild(tvBtn(i18nT('vision.pointer_here'), "small", function () { tvPointerHere(tv, function (q) { tv.tabRefs[k] = q; }); }));
            if (tv.tabRefs[k]) r.appendChild(tvBtn("✕", "small ghost", function () { delete tv.tabRefs[k]; tvRenderSide(tv); tvDraw(tv); }));
          });
          var n = Object.keys(tv.tabRefs).length;
          var rc = tvEl("div", "tv-row");
          c.appendChild(rc);
          var bC = tvBtn(i18nT('vision.calculate'), "primary", function () {
            var refs = Object.keys(tv.tabRefs).map(function (k) { return { k: parseInt(k, 10), x: tv.tabRefs[k].x, y: tv.tabRefs[k].y }; });
            tvPost("/calibrar/tablero/calcular", { photo: tv.tabDet.photo, columns: tb.p.columns, rows: tb.p.rows, frame: tb.p.frame, refs: refs }).then(function (r) {
              tv.calRes = r;
              tv.calRes.note = i18nT('vision.the_pointer_is_off_by_mm_board', { e: tvFmt(r.error_pointer_mm, 2) }) + (r.notice_pointer ? "; " + r.notice_pointer : "") + ".";
              tv.calRes.noteBad = r.error_pointer_mm > 1 || !!r.notice_pointer;
              tv.lastMsg = null;
              tvRenderSide(tv);
            }, function (e) { tvFlash(tv, e.message, false); });
          });
          bC.disabled = n < 3 || tb.missingReq > 0;
          rc.appendChild(bC);
          if (n < 3) rc.appendChild(tvEl("span", "tv-muted", i18nT('vision.n_corners_missing_with_the_pointer', { n: 3 - n })));
          else if (tb.missingReq) rc.appendChild(tvEl("span", "tv-muted", i18nT('vision.tick_the_list_above_missing', { n: tb.missingReq })));
        }
        // lente (opcional)
        c.appendChild(tvEl("div", "tv-lbl", i18nT('vision.correct_the_lens_curvature_optional')));
        if (!tv.lensSt) tvGet("/lens").then(function (s) { tv.lensSt = s; tvRenderSide(tv); }, function () {});
        tb.has = !!(tv.cfg.lens && tv.cfg.lens.K);
        c.appendChild(tvEl("div", "tv-muted", (tb.has ? i18nT('vision.there_is_a_saved_correction', { n: tv.cfg.lens.views || "?", e: tvFmt(tv.cfg.lens.rms_px, 2) }) : i18nT('vision.no_correction_straight_lines_near_the')) + " " + i18nT('vision.take_4_to_8_photos_with')));
        tb.rl = tvEl("div", "tv-row");
        c.appendChild(tb.rl);
      }

      function tvBoardLens(tv, tb, c) {
        tb.rl.appendChild(tvIBtn("camera-plus-outline", i18nT('vision.add_photo') + (tv.lensSt ? " (" + tv.lensSt.views + ")" : ""), "small", function () {
          tvFlash(tv, i18nT('vision.taking_a_photo_of_the_chessboard'), true);
          tvPost("/lens/add", { columns: tb.p.columns, rows: tb.p.rows }).then(function (s) {
            tv.lensSt = s;
            tvFlash(tv, i18nT('vision.photo_n_added_move_the_board', { n: s.views }), true);
          }, function (e) { tvFlash(tv, e.message, false); });
        }, null, i18nT('vision.high_resolution_photo_without_the_current')));
        var bL = tvIBtn("calculator-variant-outline", i18nT('vision.calculate'), "small", function () {
          tvPost("/lente/calcular", {}).then(function (r) { tv.lensRes = r.lens; tvRenderSide(tv); }, function (e) { tvFlash(tv, e.message, false); });
        });
        bL.disabled = !tv.lensSt || tv.lensSt.views < 3;
        tb.rl.appendChild(bL);
        if (tv.lensSt && tv.lensSt.views) tb.rl.appendChild(tvBtn(i18nT('vision.delete_photos'), "small ghost", function () { tvPost("/lens/remove", {}).then(function (s) { tv.lensSt = s; tv.lensRes = null; tvRenderSide(tv); }); }));
        if (tv.lensRes) {
          c.appendChild(tvEl("div", "tv-msg " + (tv.lensRes.rms_px < 1 ? "ok" : "err"), i18nT('vision.lens_calculated_with_n_photos', { n: tv.lensRes.views, e: tvFmt(tv.lensRes.rms_px, 2) }) + (tv.lensRes.rms_px < 1 ? "" : " " + i18nT('vision.high_add_photos_with_the_chessboard'))));
          c.appendChild(tvIBtn("content-save-outline", i18nT('vision.save_correction'), "primary", function () {
            var L = tv.lensRes;
            tvCfgSave(tv, function (o) {
              o.lens = L;
              delete o.calibs;
              delete o.calibration;
              delete o.height;
              return o;
            }).then(function () {
              tv.lensRes = null;
              tvFlash(tv, i18nT('vision.lens_correction_saved_the_calibrations_were'), true);
              tvAnalyzeForCal(tv);
            }, function (e) { tvFlash(tv, e.message, false); });
          }, i18nT('vision.confirm_deletes_the_calibrations'), i18nT('vision.the_image_is_corrected_from_now')));
        }
        if (tb.has)
          c.appendChild(tvBtn(i18nT('vision.remove_the_correction'), "small ghost", function () {
            tvCfgSave(tv, function (o) { delete o.lens; delete o.calibs; delete o.calibration; delete o.height; return o; }).then(function () { tvFlash(tv, i18nT('vision.correction_removed_calibrate_again'), true); tvAnalyzeForCal(tv); });
          }, i18nT('vision.confirm_deletes_the_calibrations')));
      }

      function tvCrossingsState(tv, cr, c) {
        if (cr.s.active) {
          c.appendChild(tvMsg("info", i18nT('vision.step_n_of_8', { n: cr.s.step }) + " · " + (cr.s.pct || 0).toFixed(0) + "%\n" + (cr.s.text || "")));
          var bar = tvEl("div", "tv-prog");
          var fill = tvEl("div");
          fill.style.width = (cr.s.pct || 0) + "%";
          bar.appendChild(fill);
          c.appendChild(bar);
          c.appendChild(tvEl("div", "tv-muted", i18nT('vision.while_it_marks_the_job_can')));
          c.appendChild(tvIBtn("stop-circle-outline", i18nT('vision.cancel_calibration'), "small", function () { tvPost("/crosses/cancel", {}).then(tzBind(tvCrossingsPoll, tv)); }, i18nT('vision.confirm_cancel'), i18nT('vision.stops_after_the_current_step_if')));
          return true;
        }
        var r = cr.s.result;
        if (cr.s.ok && r) {
          var cr = r.calibration, al = r.height, cp = r.check;
          var txt = i18nT('vision.image_crosses_error', { size: cr.size[0] + "×" + cr.size[1], n: cr.used, e: tvFmt(cr.error_mm, 2), max: tvFmt(cr.max_mm, 2) }) + " · " + tvFmt(cr.px_per_mm, 2) + " px/mm";
          txt += "\n" + (al ? i18nT('vision.lens_at_z_plus_crosses_fit', { h: tvFmt(al.h0, 1), n: al.points, e: tvFmt(al.rms_mm, 2) }) : i18nT('vision.no_height_not_enough_crosses_seen'));
          if (cp) txt += "\n" + i18nT('vision.check_in_yz_crosses', { y: tvFmt(cp.y), z: tvFmt(cp.z), n: cp.crosses, e: tvFmt(cp.error_mean_mm, 2), max: tvFmt(cp.error_max_mm, 2) });
          if (r.coverage)
            Object.keys(r.coverage).forEach(function (z) {
              var o = r.coverage[z];
              txt += "\n" + i18nT('vision.at_z_sees_x', { z: z, x0: tvFmt(o.x[0], 0), x1: tvFmt(o.x[1], 0), ppm: tvFmt(o.px_per_mm, 1) });
            });
          var bueno = cr.error_mm < 0.6 && (!cp || cp.error_max_mm === null || cp.error_max_mm < 1.5);
          c.appendChild(tvEl("div", "tv-msg " + (bueno ? "ok" : "err"), txt + (bueno ? "" : "\n" + i18nT('vision.check_the_error_is_high'))));
          var rr = tvEl("div", "tv-row");
          c.appendChild(rr);
          rr.appendChild(
            tvBtn(i18nT('vision.save_calibration'), "primary", function () {
              tvSaveCalibration(tv, cr, function (o) {
                if (al) o.height = al;
                if (cr.s.head) o.crosses = { head: cr.s.head, pattern_id: cr.s.pattern || "6", scale: cr.s.scale || 1, date: cr.date }; // to recalibrate without laser
              }).then(function () {
                tv.crosses.st = { ok: false };
                tvFlash(tv, i18nT('vision.calibration_saved') + (al ? " " + i18nT('vision.with_height') : "") + ".", true);
              }, function (e) { tvFlash(tv, e.message, false); });
            })
          );
          rr.appendChild(tvBtn(i18nT('vision.discard'), "small", function () { tv.crosses.st = { ok: false }; tvRenderSide(tv); }));
          return true;
        }
        if (cr.s.error) c.appendChild(tvEl("div", "tv-msg err", i18nT('vision.last_attempt_v', { v: String(cr.s.error) })));
        c.appendChild(
          tvEl(
            "div",
            "tv-muted",
            i18nT('vision.laser_crosses_help')
          )
        );
      }

      function tvCrossingsSettings(tv, cr, c) {
        cr.p = (tv.prefs.crosses = tv.prefs.crosses || { power: 10, side: 20, focus: "", back: true });
        var g = tvEl("div", "tv-prm");
        c.appendChild(g);
        g.appendChild(tvEl("label", null, i18nT('vision.power_pct_max_10')));
        g.appendChild(tvNumIn(tv, cr.p, "power", 70));
        g.appendChild(tvEl("label", null, i18nT('vision.length_of_each_cross_mm')));
        g.appendChild(tvNumIn(tv, cr.p, "side", 70));
        // more options (2026-10-10): how many crosses and how far apart
        [[i18nT('vision.number_of_crosses'), "pattern", [["6", i18nT('vision.6_fast')], ["9", i18nT('vision.9_3_x_3_grid')], ["12", i18nT('vision.12_4_x_3_grid_more')]], "6"],
         [i18nT('vision.spacing'), "scale", [["0.75", i18nT('vision.close_small_sheet')], ["1", i18nT('vision.normal_120_x_80_mm')], ["1.5", i18nT('vision.spread_covers_more_of_the_image')]], "1"]].forEach(function (o) {
          g.appendChild(tvEl("label", null, o[0]));
          var s2 = tvEl("select", "tv-sel");
          o[2].forEach(function (q) {
            var op = tvEl("option", null, q[1]);
            op.value = q[0];
            if (String(cr.p[o[1]] || o[3]) === q[0]) op.selected = true;
            s2.appendChild(op);
          });
          s2.addEventListener("change", function () { cr.p[o[1]] = s2.value; tvSavePrefs(tv.prefs); });
          g.appendChild(s2);
        });
        g.appendChild(tvEl("label", null, i18nT('vision.focus_with')));
        var sel = tvEl("select", "tv-sel");
        [["", i18nT('vision.already_focused_do_not_measure')]].concat((tv.crosses.macros || []).map(function (n) { return ["0:/macros/laser/" + n, i18nT('vision.measure_and_focus_v', { v: n.replace(/\.g$/i, "") })]; })).forEach(function (o) {
          var op = tvEl("option", null, o[1]);
          op.value = o[0];
          if ((cr.p.focus || "") === o[0]) op.selected = true;
          sel.appendChild(op);
        });
        sel.addEventListener("change", function () { cr.p.focus = sel.value; tvSavePrefs(tv.prefs); });
        g.appendChild(sel);
        g.appendChild(tvEl("label", null, i18nT('vision.photo_z_empty_automatic')));
        g.appendChild(tvNumIn(tv, cr.p, "zfoto", 70));
        var lb = tvEl("label", "tv-muted");
        var ch = tvEl("input");
        ch.type = "checkbox";
        ch.checked = cr.p.back !== false;
        ch.addEventListener("change", function () { cr.p.back = ch.checked; tvSavePrefs(tv.prefs); });
        lb.appendChild(ch);
        lb.appendChild(document.createTextNode(i18nT('vision.return_to_where_it_was_at')));
        c.appendChild(lb);
      }

      function tvCrossingsButtons(tv, cr, c) {
        var rb = tvEl("div", "tv-row");
        c.appendChild(rb);
        if (tv.cfg.crosses && tv.cfg.crosses.head)
          rb.appendChild(
            tvIBtn("camera-burst", i18nT('vision.recalibrate_without_laser'), null, function () {
              var body = { reuse: { head: tv.cfg.crosses.head, pattern: tv.cfg.crosses.pattern_id || "6", scale: tv.cfg.crosses.scale || 1 }, back: cr.p.back !== false };
              if (cr.p.zfoto) body.zfoto = parseFloat(cr.p.zfoto);
              tvPost("/crosses/begin", body).then(function (s2) { tv.crosses.st = s2; tvRenderSide(tv); tvCrossingsPoll(tv); }, function (e) { tvFlash(tv, e.message, false); });
            }, i18nT('vision.confirm_moves_y_z'), i18nT('vision.uses_the_crosses_already_marked_date', { date: tv.cfg.crosses.date || "" }))
          );
        rb.appendChild(
          tvIBtn("crosshairs-gps", i18nT('vision.calibrate_with_crosses'), "primary", function () {
            var pot = parseFloat(cr.p.power);
            if (!(pot > 0 && pot <= 10)) return tvFlash(tv, i18nT('vision.power_must_be_0_to_10'), false);
            var body = { power: pot, side: parseFloat(cr.p.side) || 20, focus: cr.p.focus || null, back: cr.p.back !== false, pattern: String(cr.p.pattern || "6"), scale: parseFloat(cr.p.scale) || 1 };
            if (cr.p.zfoto) body.zfoto = parseFloat(cr.p.zfoto);
            tvPost("/crosses/begin", body).then(function (s2) { tv.crosses.st = s2; tvRenderSide(tv); tvCrossingsPoll(tv); }, function (e) { tvFlash(tv, e.message, false); });
          }, i18nT('vision.confirm_moves_and_fires_the_laser'), i18nT('vision.asks_for_a_second_tap_with'))
        );
      }
