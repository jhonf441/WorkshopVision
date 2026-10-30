      function tvRegDis(tv) {
        var r = (tv.prefs.record = tv.prefs.record || { ax: 0, ay: 0, bx: 100, by: 0 });
        return r;
      }

      function tvRegCalc(tv) {
        var r = tvRegDis(tv);
        if (!tv.regM.a || !tv.regM.b) return null;
        var dA = [r.ax, r.ay], dB = [r.bx, r.by], mA = tv.regM.a, mB = tv.regM.b;
        var lD = Math.hypot(dB[0] - dA[0], dB[1] - dA[1]), lM = Math.hypot(mB[0] - mA[0], mB[1] - mA[1]);
        if (lD < 1) return { err: i18nT('vision.the_two_design_marks_are_in') };
        var turn = Math.atan2(mB[1] - mA[1], mB[0] - mA[0]) - Math.atan2(dB[1] - dA[1], dB[0] - dA[0]);
        while (turn > Math.PI) turn -= 2 * Math.PI;
        while (turn < -Math.PI) turn += 2 * Math.PI;
        var c = Math.cos(turn), s = Math.sin(turn);
        var o = [mA[0] - (c * dA[0] - s * dA[1]), mA[1] - (s * dA[0] + c * dA[1])];
        return { origin: o, rotation: (turn * 180) / Math.PI, errorMm: lM - lD, lD: lD, lM: lM };
      }

      function tvRenderRecord(tv) {
        var acc = tvAcc(tv, "record", i18nT('vision.cut_on_marks'), "crosshairs-gps", i18nT('vision.aligns_the_design_with_2_marks_2'), null, false, tv.regM.a && tv.regM.b ? i18nT('vision.ready_lower') : null);
        tv.side.appendChild(acc.el);
        if (!acc.open) return;
        var card = acc.body;
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.1_put_two_marks_circles_or')));
        var r = tvRegDis(tv);
        var g = tvEl("div", "tv-prm");
        card.appendChild(g);
        [["ax", i18nT('vision.mark_a_in_the_design_x')], ["ay", i18nT('vision.mark_a_in_the_design_y')], ["bx", i18nT('vision.mark_b_in_the_design_x')], ["by", i18nT('vision.mark_b_in_the_design_y')]].forEach(function (f) {
          g.appendChild(tvEl("label", null, f[1]));
          var inp = tvEl("input", "tv-in");
          inp.type = "number";
          inp.step = "any";
          inp.value = r[f[0]];
          inp.addEventListener("change", function () {
            var v = parseFloat(inp.value);
            if (isFinite(v)) {
              r[f[0]] = v;
              tvSavePrefs(tv.prefs);
              tvRenderSide(tv);
            }
          });
          g.appendChild(inp);
        });
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.marks_a_b_on_the_machine', { a: tv.regM.a ? "X" + tvFmt(tv.regM.a[0], 2) + " Y" + tvFmt(tv.regM.a[1], 2) : i18nT('vision.not_chosen'), b: tv.regM.b ? "X" + tvFmt(tv.regM.b[0], 2) + " Y" + tvFmt(tv.regM.b[1], 2) : i18nT('vision.not_chosen') })));
        var q = tvRegCalc(tv);
        if (!q) return;
        if (q.err) return card.appendChild(tvMsg("err", q.err));
        card.appendChild(tvMsg(Math.abs(q.errorMm) > 1 ? "err" : "ok", i18nT('vision.design_origin_result', { x: tvFmt(q.origin[0], 2), y: tvFmt(q.origin[1], 2), ang: tvFmt(q.rotation, 2), m: tvFmt(q.lM, 2), d: tvFmt(q.lD, 2) }) + (Math.abs(q.errorMm) > 1 ? " " + i18nT('vision.difference_of_mm_check', { e: tvFmt(q.errorMm, 2) }) : ".")));
        var acts = tvEl("div", "tv-acts");
        // the zone editor belongs to the Workbench plugin: no button without it
        if (tvHasWorkbench(tv)) acts.appendChild(tvIBtn("map-marker-plus-outline", i18nT('vision.use_as_zone_origin'), "small", function () {
          var t = window.__workshop || {};
          if (!tvHasWorkbench(tv)) return tvFlash(tv, TV_WITHOUT_WORKBENCH, false);
          t.visionPick = { x: q.origin[0], y: q.origin[1], name: i18nT('vision.registration_vision'), ang: q.rotation, ts: Date.now() };
          if (tv.router) tv.router.push("/Plugins/Workbench");
          else tvFlash(tv, i18nT('vision.open_the_work_zones_page_the'), true);
        }, null, i18nT('vision.opens_the_zone_editor_with_the')));
        if (Math.abs(q.rotation) > 0.05) {
          acts.appendChild(tvIBtn("rotate-right", i18nT('vision.apply_rotation_g68'), "small", function () {
            postCode("G68 X0 Y0 R" + q.rotation.toFixed(3)).then(function (rr) { return rr.text(); }).then(function (t) {
              if (/error/i.test(t || "")) throw new Error(t.trim());
              tvFlash(tv, i18nT('vision.rotation_applied', { ang: tvFmt(q.rotation, 2) }), true);
            }).catch(function (e) { tvFlash(tv, i18nT('vision.the_rotation_was_not_applied_v', { v: String(e.message) }), false); });
          }, i18nT('vision.confirm_rotates_the_coordinates'), i18nT('vision.g68_rotates_the_coordinates_around_the')));
        }
        acts.appendChild(tvIBtn("rotate-left", i18nT('vision.remove_rotation_g69'), "small", function () {
          postCode("G69").then(function () { tvFlash(tv, i18nT('vision.rotation_removed_g69'), true); }, function (e) { tvFlash(tv, e.message, false); });
        }, null, i18nT('vision.returns_the_coordinates_to_normal')));
        card.appendChild(acts);
      }

      function tvRenderBefore(tv) {
        if (!tv.beforeRequest) {
          // the before photo lives in the service: another screen may have taken it
          tv.beforeRequest = true;
          tvGet("/before").then(function (j) { if (j.has) { tv.beforeInfo = { ts: j.ts, pose: j.pose }; tvRenderSide(tv); } }, function () {});
        }
        var acc =tvAcc(tv, "before", i18nT('vision.before_and_after'), "compare", i18nT('vision.compares_the_bed_before_and_after_2'), null, false, tv.beforeInfo ? i18nT('vision.photo_ready') : null);
        tv.side.appendChild(acc.el);
        if (!acc.open) return;
        var card = acc.body;
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.1_before_cutting_with_the_camera')));
        var r = tvEl("div", "tv-row");
        r.appendChild(tvIBtn("camera-outline", i18nT('vision.before_photo'), "small", function () {
          tvPost("/before", {}).then(function (j) {
            tv.beforeInfo = { ts: j.ts, pose: j.pose };
            tv.compRes = null;
            tvFlash(tv, i18nT('vision.before_photo_saved_time', { time: new Date(j.ts * 1000).toLocaleTimeString() }), true);
          }, function (e) { tvFlash(tv, i18nT('vision.could_not_take_the_photo_v', { v: String(e.message) }), false); });
        }, null, i18nT('vision.saves_the_current_image_as_the')));
        if (tv.beforeInfo) {
          r.appendChild(tvIBtn("compare-horizontal", i18nT('vision.compare_with_now'), "small primary", function () {
            tvPost("/compare", {}).then(function (j) {
              tv.compRes = j;
              tvRenderSide(tv);
            }, function (e) { tvFlash(tv, i18nT('vision.could_not_compare_v', { v: String(e.message) }), false); });
          }, null, i18nT('vision.compares_the_before_photo_with_the')));
        }
        card.appendChild(r);
        if (tv.beforeInfo) card.appendChild(tvEl("div", "tv-muted", i18nT('vision.before_photo_time', { time: new Date(tv.beforeInfo.ts * 1000).toLocaleTimeString() }) + (tv.beforeInfo.pose ? " " + i18nT('vision.camera_at_yz', { y: tvFmt(tv.beforeInfo.pose.y, 1), z: tvFmt(tv.beforeInfo.pose.z, 1) }) : "")));
        if (!tv.compRes) return;
        (tv.compRes.notices || []).forEach(function (a) { card.appendChild(tvMsg("err", a)); });
        card.appendChild(tvMsg(tv.compRes.regions.length ? "info" : "ok", tv.compRes.regions.length
          ? i18nT('vision.n_areas_changed_pct', { n: tv.compRes.regions.length, pct: tv.compRes.change_pct })
          : i18nT('vision.nothing_visible_changed_between_the_two')));
        var im = tvEl("img");
        im.src = tvApi("/frame.jpg?view=camera&id=" + encodeURIComponent(tv.compRes.photo) + "&t=" + Date.now());
        im.style.cssText = "width:100%;border-radius:6px;margin-top:6px;cursor:zoom-in";
        im.title = i18nT('vision.open_large');
        im.addEventListener("click", function () { window.open(im.src, "_blank"); });
        card.appendChild(im);
        var tbl = tvEl("div", "tv-list");
        tv.compRes.regions.slice(0, 12).forEach(function (rg, i) {
          var row = tvEl("div", "tv-item");
          row.appendChild(tvEl("div", "t", i18nT('vision.zone_n', { n: i + 1 })));
          row.appendChild(tvEl("div", "v", rg.mm ? "X " + tvFmt(rg.mm.c[0], 1) + "  Y " + tvFmt(rg.mm.c[1], 1) + " · " + tvFmt(rg.mm.w, 1) + " × " + tvFmt(rg.mm.h, 1) + " mm" : rg.area_px + " px " + i18nT('vision.not_calibrated_paren')));
          tbl.appendChild(row);
        });
        card.appendChild(tbl);
      }

      function tvFlash(tv, t, ok) {
        tv.lastMsg = { t: t, ok: ok !== false };
        tvRenderSide(tv);
      }

      function tvGoPointer(tv, x, y) {
        return tvMachine().then(function (st) {
          var ax = tvAxes(st);
          if (tvBusy(st)) throw new Error(i18nT('vision.a_job_is_running'));
          if (!ax.X || !ax.Y || !ax.X.homed || !ax.Y.homed) throw new Error(i18nT('vision.home_x_and_y_first'));
          return postCode('M98 P"0:/sys/workshop/macros/gotobed.g" X' + x.toFixed(2) + " Y" + y.toFixed(2))
            .then(function (r) { return r.text(); })
            .then(function (t) {
              if (/error|abort/i.test(t || "")) throw new Error(t.trim());
            });
        });
      }

      // Bottom left corner (lowest X+Y): the usual origin of a zone
      function tvCornerBL(tv, pts) {
        var best = null;
        (pts || []).forEach(function (p) { if (!best || p[0] + p[1] < best[0] + best[1]) best = p; });
        return best;
      }

      function tvOriginOf(tv, it) {
        var m = it.mm;
        if ((it.kind === "piece" || it.kind === "rect") && (m.box || m.corners)) return { p: tvCornerBL(tv, m.corners || m.box), what: i18nT('vision.bottom_left_corner') };
        return { p: m.c, what: "center" };
      }

      function tvItemValues(tv, it) {
        var m = it.mm;
        if (!m) return i18nT('vision.center_in_the_image_v', { v: it.px.c ? tvFmt(it.px.c[0]) + ", " + tvFmt(it.px.c[1]) + " px" : "--" }) + " " + i18nT('vision.not_calibrated_paren');
        var v = "X " + tvFmt(m.c[0], 2) + "  Y " + tvFmt(m.c[1], 2);
        switch (it.kind) {
          case "piece":
            v += "\n" + tvFmt(m.w, 2) + " × " + tvFmt(m.h, 2) + " mm · " + i18nT('vision.rotation_deg', { ang: tvFmt(m.ang, 2) }) + " · " + tvShapeTxt(m.shape);
            v += "\n" + i18nT('vision.area_and_perimeter', { a: tvFmt(m.area, 0), p: tvFmt(m.perim, 0) });
            if (m.d) v += " · ⌀" + tvFmt(m.d, 2);
            break;
          case "rect":
            v += "\n" + tvFmt(m.w, 2) + " × " + tvFmt(m.h, 2) + " mm · " + i18nT('vision.rotation_deg', { ang: tvFmt(m.ang, 2) });
            v += "\n" + i18nT('vision.sides') + " " + (m.sides || []).map(function (l) { return tvFmt(l, 1); }).join(" / ");
            break;
          case "circle":
            v += "\n⌀ " + tvFmt(m.d, 2) + " mm";
            break;
          case "hole":
            v += "\n" + (m.d ? "⌀ " + tvFmt(m.d, 2) + " mm · " : "") + tvFmt(m.w, 1) + " × " + tvFmt(m.h, 1) + " · " + i18nT('vision.roundness_v', { v: tvFmt(m.roundness, 2) });
            break;
          case "line":
            v += "\n" + i18nT('vision.length_and_angle', { l: tvFmt(m.len, 2), ang: tvFmt(m.ang, 2) });
            break;
          case "mark":
            v += "\n" + i18nT('vision.side_and_rotation', { l: tvFmt(m.side, 1), ang: tvFmt(m.ang, 1) }) + (m.error !== undefined && m.error !== null ? " " + i18nT('vision.error_vs_its_position_mm', { e: tvFmt(m.error, 2) }) : "");
            break;
        }
        return v;
      }

