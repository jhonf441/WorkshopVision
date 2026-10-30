      function tvCameraInCarriage(tv) {
        return (tv.cfg && tv.cfg.camera_en) === "carriage";
      }

      function tvPadVisible(tv) {
        return tv.prefs.tool === "move" && tvModeMeasure(tv) && tv.tab !== "calibrate";
      }

      function tvPoseTxt(tv) {
        var pz = tv.state && tv.state.pose;
        if (!pz) return i18nT('vision.position');
        return (tvCameraInCarriage(tv) ? "X" + tvFmt(pz.x, 1) + " " : "") + "Y" + tvFmt(pz.y, 1) + " Z" + tvFmt(pz.z, 1);
      }

      // where X+ and Y+ go in the image being seen (degrees, and downward), or null if uncalibrated
      function tvAxesImage(tv) {
        var c = tvCenterMm(tv);
        if (!c) return null;
        var p0 = tvMmAView(tv, c),
          px = tvMmAView(tv, [c[0] + 10, c[1]]),
          py = tvMmAView(tv, [c[0], c[1] + 10]);
        if (!p0 || !px || !py) return null;
        return { X: (Math.atan2(px[1] - p0[1], px[0] - p0[0]) * 180) / Math.PI, Y: (Math.atan2(py[1] - p0[1], py[0] - p0[0]) * 180) / Math.PI };
      }

      function tvCenterMm(tv) {
        var c = tv.view.w ? tvFromView(tv, [tv.view.w / 2, tv.view.h / 2]) : null;
        return c && tvPxToMm(tv, c);
      }

      // shows / hides the panel without rebuilding it (rebuilding it would cancel a
      // half-done double tap: renderBars runs on each live analysis)
      function tvPadUpdate(tv) {
        var ver = tvPadVisible(tv);
        tv.stage.classList.toggle("move", ver);
        if (ver && !tv.padSeen) tvRenderPad(tv);
        else if (!ver) tv.pad.style.display = "none";
        tv.padSeen = ver;
      }

      // fn(aqui, ejes, carro) -> {x, y, z, volver} en mm de maquina
      function tvPadMove(tv, fn) {
        if (tv.movBusy) return;
        tv.movBusy = true;
        tv.padMsg = i18nT('vision.moving');
        tvRenderPad(tv);
        tvMachine()
          .then(function (st) {
            if (tvBusy(st)) throw new Error(i18nT('vision.a_job_is_running'));
            var ax = tvAxes(st);
            if (!ax.Y || !ax.Z || !ax.Y.homed || !ax.Z.homed) throw new Error(i18nT('vision.homes_y_and_z_first'));
            var carriage = tvCameraInCarriage(tv) && ax.X && ax.X.homed;
            var here = { x: carriage ? ax.X.machinePosition : null, y: ax.Y.machinePosition, z: ax.Z.machinePosition };
            var t = fn(here, ax, carriage);
            var lim = function (v, a) { return Math.min(a.max, Math.max(a.min, v)); };
            var y = t.y === undefined || t.y === null ? null : lim(t.y, ax.Y);
            var z = t.z === undefined || t.z === null ? null : Math.min(ax.Z.max, Math.max(tv.TV_ZMIN, t.z));
            var x = carriage && t.x !== undefined && t.x !== null ? lim(t.x, ax.X) : null;
            if (!t.back && !tv.movStart) tv.movStart = here;
            return tvMoveA(tv, y, z, x).then(function () { return t; });
          })
          .then(function (t) {
            tv.padMsg = "";
            if (t.back) tv.movStart = null;
            tv.movTarget = null;
            tvAfterMove(tv);
          })
          .catch(function (e) {
            tv.padMsg = i18nT('vision.could_not_move_v', { v: String(e.message) });
          })
          .then(function () {
            tv.movBusy = false;
            tvRenderPad(tv);
            tvDraw(tv);
          });
      }

      function tvAfterMove(tv) {
        tv.cabTrail = [];
        tv.padRefresh = true;
        if (tv.photoAct) {
          tv.photoAct = null;
          tv.photoInfo = null;
        }
        tvRefreshState(tv).then(function () { if (tv.padPos) tv.padPos.textContent = tvPoseTxt(tv); });
        if (!tv.live) setTimeout(function () { if (tv.alive && !tv.live) tvAnalyze(tv); }, 300);
      }

      // What the camera sees now: px, mm per px and how much bed (with the calibration)
      function tvViewInfo(tv) {
        if (!tv.res || !tv.res.H || !tv.res.size) return null;
        var W = tv.res.size[0],
          Hh = tv.res.size[1];
        var c = [[0, 0], [W, 0], [W, Hh], [0, Hh]].map(tzBind(tvPxToMm, tv));
        if (c.some(function (m) { return !m; })) return null;
        var w = (tvDist(c[0], c[1]) + tvDist(c[3], c[2])) / 2,
          h = (tvDist(c[0], c[3]) + tvDist(c[1], c[2])) / 2;
        return { pw: W, ph: Hh, w: w, h: h, mmpx: w / W };
      }

      function tvDatumPad(tv, etq, value, delta) {
        var d = tvEl("div", "data");
        d.appendChild(tvEl("b", null, etq + ": "));
        var v = tvEl("span", null, value);
        d.appendChild(v);
        if (delta) d.appendChild(delta);
        return d;
      }

      // drag the panel by the title (it saves where it ended up)
      function tvPadDrag(tv, h) {
        h.addEventListener("pointerdown", function (ev) {
          if (ev.target.closest && ev.target.closest("button")) return;
          ev.preventDefault();
          var sr = tv.stage.getBoundingClientRect(),
            pr = tv.pad.getBoundingClientRect();
          var dx = ev.clientX - pr.left,
            dy = ev.clientY - pr.top;
          try { h.setPointerCapture(ev.pointerId); } catch (e) { /* no critico */ }
          function move(e2) {
            var x = Math.min(Math.max(0, e2.clientX - sr.left - dx), sr.width - pr.width),
              y = Math.min(Math.max(0, e2.clientY - sr.top - dy), sr.height - Math.min(pr.height, sr.height));
            tv.prefs.padPos = { x: x / sr.width, y: y / sr.height };
            tvPadPlace(tv);
          }
          function release() {
            h.removeEventListener("pointermove", move);
            h.removeEventListener("pointerup", release);
            h.removeEventListener("pointercancel", release);
            tvSavePrefs(tv.prefs);
          }
          h.addEventListener("pointermove", move);
          h.addEventListener("pointerup", release);
          h.addEventListener("pointercancel", release);
        });
      }

      function tvPadPlace(tv) {
        var p = tv.prefs.padPos;
        if (!p) {
          tv.pad.style.left = tv.pad.style.top = tv.pad.style.transform = "";
          tv.pad.style.right = "";
          return;
        }
        tv.pad.style.left = (p.x * 100).toFixed(2) + "%";
        tv.pad.style.top = (p.y * 100).toFixed(2) + "%";
        tv.pad.style.right = "auto";
        tv.pad.style.transform = "none";
      }

      function tvRenderPad(tv) {
        var pd = {};
        var ver = tvPadVisible(tv);
        tv.padSeen = ver;
        tv.stage.classList.toggle("move", ver);
        tv.pad.style.display = ver ? "flex" : "none";
        if (!ver) return;
        tv.pad.innerHTML = "";
        tvPadPlace(tv);
        pd.carriage = tvCameraInCarriage(tv);
        var h = tvEl("div", "h");
        h.title = i18nT('vision.drag_the_title_to_move_this');
        h.appendChild(tvIcon("cursor-move"));
        h.appendChild(tvEl("span", null, i18nT('vision.move_the_camera')));
        h.appendChild(tvIBtn(tv.prefs.padCollapsed ? "chevron-down" : "chevron-up", "", "ghost small", function () {
          tv.prefs.padCollapsed = !tv.prefs.padCollapsed;
          tvSavePrefs(tv.prefs);
          tvRenderPad(tv);
        }, null, tv.prefs.padCollapsed ? i18nT('vision.unfold') : i18nT('vision.fold')));
        tvPadDrag(tv, h);
        tv.pad.appendChild(h);
        tv.padPos = tvEl("div", "pos", tvPoseTxt(tv));
        tv.pad.appendChild(tv.padPos);
        if (tv.prefs.padCollapsed) return;
        pd.place = function lugar(ang) {
          var a = ((ang % 360) + 360) % 360; // grados en la imagen (y hacia abajo)
          return a < 45 || a >= 315 ? [1, 2] : a < 135 ? [2, 1] : a < 225 ? [1, 0] : [0, 1];
        };
        tvPadInfo(tv, pd);
        tvPadSteps(tv, pd);
        tvPadCross(tv, pd);
        tvPadZoom(tv, pd);
        tvPadTarget(tv, pd);
        tvPadFoot(tv, pd);
      }

      function tvPadInfo(tv, pd) {
        // what is seen now, and how much is gained or lost by raising / lowering
        pd.vi = tvViewInfo(tv);
        var pz0 = tv.state && tv.state.pose,
          alt = tv.state && tv.state.height;
        var pzv0 = Math.min(tv.TV_STEPS.indexOf(tv.prefs.padStep) >= 0 ? tv.prefs.padStep : 10, 50);
        if (pd.vi) {
          tv.pad.appendChild(tvDatumPad(tv, i18nT('vision.now'), pd.vi.pw + "×" + pd.vi.ph + " px · " + tvFmt(pd.vi.mmpx, 2) + " mm/px · " + Math.round(pd.vi.w) + "×" + Math.round(pd.vi.h) + " mm"));
          var fs = tv.state && tv.state.photo && tv.state.fs_size && tv.state.fs_size[String(tv.state.photo.fs)];
          if (fs && fs[0] > pd.vi.pw) tv.pad.appendChild(tvDatumPad(tv, i18nT('vision.measuring_photo'), fs[0] + "×" + fs[1] + " px · " + tvFmt((pd.vi.mmpx * pd.vi.pw) / fs[0], 2) + " mm/px"));
          if (alt && alt.h0 !== undefined && pz0 && pz0.z !== undefined) {
            var D = Number(pz0.z) + Number(alt.h0);
            [[pzv0, i18nT('vision.up_n_mm', { n: pzv0 })], [-pzv0, i18nT('vision.down_n_mm', { n: pzv0 })]].forEach(function (q) {
              if (q[0] < 0 && pz0.z + q[0] < tv.TV_ZMIN - 0.01) return;
              var k = (D + q[0]) / D;
              var pct = Math.round((1 / k - 1) * 100);
              var dl = tvEl("span", pct < 0 ? "minus" : "more", " " + i18nT('vision.pct_detail', { pct: (pct > 0 ? "+" : "") + pct }));
              tv.pad.appendChild(tvDatumPad(tv, q[1], tvFmt(pd.vi.mmpx * k, 2) + " mm/px · " + Math.round(pd.vi.w * k) + "×" + Math.round(pd.vi.h * k) + " mm", dl));
            });
          } else tv.pad.appendChild(tvEl("div", "tv-muted", i18nT('vision.to_know_how_much_detail_you')));
        } else tv.pad.appendChild(tvEl("div", "tv-muted", i18nT('vision.not_calibrated_it_isn_t_known')));
      }

      function tvPadSteps(tv, pd) {
        pd.step = tv.TV_STEPS.indexOf(tv.prefs.padStep) >= 0 ? tv.prefs.padStep : 10;
        var fp = tvEl("div", "steps");
        fp.appendChild(tvEl("span", "tv-muted", i18nT('vision.step')));
        tv.TV_STEPS.forEach(function (v) {
          fp.appendChild(tvBtn(String(v), v === pd.step ? "on" : null, function () {
            tv.prefs.padStep = v;
            tvSavePrefs(tv.prefs);
            tvRenderPad(tv);
          }));
        });
        fp.appendChild(tvEl("span", "tv-muted", "mm"));
        tv.pad.appendChild(fp);
      }

      function tvPadCross(tv, pd) {
        // arrows: Y always; X only with the camera on the carriage. Each arrow
        // points where that axis goes IN THE IMAGE (with the calibration): the
        // one pointing right shows more of what is on the right.
        var dp = tvEl("div", "dp");
        var cells = [[null, null, null], [null, null, null], [null, null, null]];
        var ICO = { "0,1": "arrow-up", "1,0": "arrow-left", "1,2": "arrow-right", "2,1": "arrow-down" };
        var ej = tvAxesImage(tv);
        tv.padWithAxes = !!ej;
        var pon = [["Y+", 0, 1, ej ? ej.Y : -90], ["Y-", 0, -1, ej ? ej.Y + 180 : 90]];
        if (pd.carriage) pon.push(["X+", 1, 0, ej ? ej.X : 0], ["X-", -1, 0, ej ? ej.X + 180 : 180]);
        var collides = false;
        pon.forEach(function (q) {
          var l = pd.place(q[3]);
          if (cells[l[0]][l[1]]) collides = true;
          cells[l[0]][l[1]] = q;
        });
        if (collides) {
          // odd axes (camera turned far on the diagonal): the usual layout
          cells = [[null, pon[0], null], [null, null, null], [null, pon[1], null]];
          if (pd.carriage) { cells[1][0] = pon[3]; cells[1][2] = pon[2]; }
        }
        cells.forEach(function (row, i) {
          row.forEach(function (q, j) {
            if (!q) return dp.appendChild(tvEl("span"));
            var b = tvIBtn(ICO[i + "," + j], q[0], null, function () {
              tvPadMove(tv, function (a) { return { x: a.x === null ? null : a.x + q[1] * pd.step, y: a.y + q[2] * pd.step }; });
            });
            b.disabled = tv.movBusy;
            dp.appendChild(b);
          });
        });
        tv.pad.appendChild(dp);
      }

      function tvPadZoom(tv, pd) {
        var zz = tvEl("div", "zz");
        var pzv = Math.min(pd.step, 50);
        var pz = tv.state && tv.state.pose;
        var bZu = tvIBtn("arrow-expand", i18nT('vision.more_area'), null, function () {
          tvPadMove(tv, function (a) { return { z: a.z + pzv }; });
        }, null, i18nT('vision.raises_the_gantry_one_step_the'));
        var bZd = tvIBtn("magnify-plus-outline", i18nT('vision.more_detail'), null, function () {
          tvPadMove(tv, function (a) { return { z: a.z - pzv }; });
        }, null, i18nT('vision.lowers_the_gantry_one_step_never'));
        bZu.disabled = tv.movBusy;
        bZd.disabled = tv.movBusy || !!(pz && pz.z - pzv < tv.TV_ZMIN - 0.01);
        zz.appendChild(bZu);
        zz.appendChild(bZd);
        tv.pad.appendChild(zz);
      }

      function tvPadTarget(tv, pd) {
        if (tv.movTarget) {
          var cen = tvCenterMm(tv);
          tv.pad.appendChild(tvEl("div", null, i18nT('vision.chosen_point_xy', { x: tvFmt(tv.movTarget.mm[0], 1), y: tvFmt(tv.movTarget.mm[1], 1) })));
          if (cen) {
            var dX = tv.movTarget.mm[0] - cen[0],
              dAnd = tv.movTarget.mm[1] - cen[1];
            var mv = tvEl("div", "data");
            mv.appendChild(tvEl("b", null, i18nT('vision.will_move')));
            var mvv = tvEl("span", null, (pd.carriage ? "X " + (dX >= 0 ? "+" : "") + tvFmt(dX, 1) + " mm, " : "") + "Y " + (dAnd >= 0 ? "+" : "") + tvFmt(dAnd, 1) + " mm");
            mv.appendChild(mvv);
            tv.pad.appendChild(mv);
            var bC = tvIBtn("image-filter-center-focus", i18nT('vision.center_there'), "primary", function () {
              tvPadMove(tv, function (a) { return { x: a.x === null ? null : a.x + dX, y: a.y + dAnd }; });
            }, i18nT('vision.tap_again_to_move'), i18nT('vision.moves_the_camera_so_that_point'));
            bC.disabled = tv.movBusy;
            tv.pad.appendChild(bC);
            if (!pd.carriage && Math.abs(dX) > 5) tv.pad.appendChild(tvEl("div", "tv-muted", i18nT('vision.it_can_t_center_in_x')));
          }
          tv.pad.appendChild(tvBtn(i18nT('vision.cancel'), "ghost small", function () {
            tv.movTarget = null;
            tvRenderPad(tv);
            tvDraw(tv);
          }));
        }
        if (tv.movStart) {
          pd.vi = tv.movStart;
          var bV = tvIBtn("undo-variant", i18nT('vision.back_to_where_it_was'), null, function () {
            tvPadMove(tv, function () { return { x: pd.vi.x, y: pd.vi.y, z: pd.vi.z, back: true }; });
          }, i18nT('vision.tap_again_to_move'), i18nT('vision.moves_the_camera_back_to_where'));
          bV.disabled = tv.movBusy;
          tv.pad.appendChild(bV);
        }
      }

      function tvPadFoot(tv, pd) {
        var sec = tvEl("div", "seguro");
        sec.appendChild(tvIcon("shield-check-outline"));
        sec.appendChild(tvEl("span", null, i18nT('vision.safe_move_visionpose_g_raises_z')));
        tv.pad.appendChild(sec);
        if (tv.padMsg) tv.pad.appendChild(tvEl("div", tv.padMsg === i18nT('vision.moving') ? "tv-muted" : "err", tv.padMsg));
        else if (!tv.movTarget) tv.pad.appendChild(tvEl("div", "tv-muted", i18nT('vision.tap_the_image_to_choose_what')));
      }
