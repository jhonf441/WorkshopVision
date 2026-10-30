      function tvItemActions(tv, it) {
        var ac = {};
        ac.m = it.mm;
        ac.acts = tvEl("div", "tv-acts");
        ac.acts.addEventListener("click", function (ev) { ev.stopPropagation(); });
        tvActionsBasic(tv, ac, it);
        tvActionsWorkbench(tv, ac, it);
        tvActionsIr(tv, ac, it);
        tvActionsPiece(tv, ac, it);
        return ac.acts;
      }


      function tvRenderParams(tv) {
        var acc = tvAcc(tv, "params", i18nT('vision.advanced_detection'), "tune", i18nT('vision.how_the_part_is_separated_sensitivity'), null, false);
        tv.side.appendChild(acc.el);
        if (!acc.open) return;
        var card = acc.body;
        var def = (tv.state && tv.state.defaults) || {};
        // Templates per material (2026-10-10, function 8): the detection settings
        // saved with a name (MDF, clear acrylic,
        // cardboard...) in sys/workshop/config/vision.json "plantillas", for all
        // screens. Choosing one applies it; manual changes stay on this
        // screen until saved again.
        var plant = (tv.cfg && tv.cfg.templates) || {};
        var names = Object.keys(plant).sort();
        var rp = tvEl("div", "tv-row");
        var sp = tvEl("select", "tv-sel");
        var op0 = tvEl("option", null, names.length ? i18nT('vision.material_template') : i18nT('vision.no_saved_templates'));
        op0.value = "";
        sp.appendChild(op0);
        names.forEach(function (n) {
          var op = tvEl("option", null, n);
          op.value = n;
          if (tv.prefs.template === n) op.selected = true;
          sp.appendChild(op);
        });
        sp.addEventListener("change", function () {
          if (!sp.value) return;
          tv.prefs.template = sp.value;
          tv.prefs.params = Object.assign({}, plant[sp.value]);
          tvSavePrefs(tv.prefs);
          tvRenderSide(tv);
          tvAnalyze(tv);
        });
        rp.appendChild(sp);
        rp.appendChild(tvIBtn("content-save-outline", i18nT('vision.save_as_template'), "small", function () {
          var n = window.prompt(i18nT('vision.material_name_e_g_mdf_3'), tv.prefs.template || "");
          n = (n || "").trim().slice(0, 40);
          if (!n) return;
          tvCfgSave(tv, function (c) { c.templates = Object.assign({}, c.templates || {}); c.templates[n] = Object.assign({}, tv.prefs.params); return c; }).then(function () {
            tv.prefs.template = n;
            tvSavePrefs(tv.prefs);
            tvFlash(tv, i18nT('vision.template_saved', { name: n }), true);
          }, function (e) { tvFlash(tv, e.message, false); });
        }, null, i18nT('vision.saves_these_detection_settings_with_the')));
        if (tv.prefs.template && plant[tv.prefs.template]) {
          rp.appendChild(tvBtn(i18nT('vision.delete_template'), "small", function () {
            var n = tv.prefs.template;
            tvCfgSave(tv, function (c) { c.templates = Object.assign({}, c.templates || {}); delete c.templates[n]; return c; }).then(function () {
              tv.prefs.template = null;
              tvSavePrefs(tv.prefs);
              tvFlash(tv, i18nT('vision.template_deleted', { name: n }), true);
            }, function (e) { tvFlash(tv, e.message, false); });
          }, i18nT('vision.confirm_delete'), i18nT('vision.deletes_the_selected_template_this_screen')));
        }
        card.appendChild(rp);
        var grid = tvEl("div", "tv-prm");
        card.appendChild(grid);
        TV_PARAMS.forEach(function (p) {
          var lb = tvEl("label", null, p[1]);
          if (p[4]) lb.title = p[4];
          grid.appendChild(lb);
          var cur = tv.prefs.params[p[0]] !== undefined ? tv.prefs.params[p[0]] : def[p[0]];
          var inp;
          if (p[2] === "sel") {
            inp = tvEl("select", "tv-sel");
            p[3].forEach(function (o) {
              var op = tvEl("option", null, o);
              op.value = o;
              if (cur === o) op.selected = true;
              inp.appendChild(op);
            });
          } else {
            inp = tvEl("input", "tv-in");
            inp.type = "number";
            inp.min = p[3][0];
            inp.max = p[3][1];
            inp.step = p[3][2];
            inp.value = cur === undefined ? "" : cur;
            inp.style.width = "100%";
          }
          inp.addEventListener("change", function () {
            var v = p[2] === "sel" ? inp.value : parseFloat(inp.value);
            if (p[2] !== "sel" && !isFinite(v)) delete tv.prefs.params[p[0]];
            else tv.prefs.params[p[0]] = v;
            tvSavePrefs(tv.prefs);
            tvAnalyze(tv);
          });
          grid.appendChild(inp);
        });
        var r = tvEl("div", "tv-row");
        r.appendChild(tvIBtn("restore", i18nT('vision.default_values'), "small", function () { tv.prefs.params = {}; tvSavePrefs(tv.prefs); tvRenderSide(tv); tvAnalyze(tv); }));
        card.appendChild(r);
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.saved_on_this_screen_look_at')));
      }

      function tvActionsBasic(tv, ac, it) {
        ac.acts.appendChild(
          tvIBtn("crosshairs-gps", i18nT('vision.go_with_the_pointer'), "small", function () {
            tvGoPointer(tv, ac.m.c[0], ac.m.c[1]).then(function () { tvFlash(tv, i18nT('vision.pointer_going_to_xy', { x: tvFmt(ac.m.c[0], 2), y: tvFmt(ac.m.c[1], 2) }), true); }, function (e) { tvFlash(tv, i18nT('vision.could_not_go_v', { v: e.message }), false); });
          }, i18nT('vision.confirm_moves'), i18nT('vision.brings_the_pointer_to_the_center'))
        );
        if (it.kind === "piece" || it.kind === "rect") {
          var bl = tvCornerBL(tv, ac.m.corners || ac.m.box);
          ac.acts.appendChild(
            tvIBtn("vector-square", i18nT('vision.go_to_the_corner'), "small", function () {
              tvGoPointer(tv, bl[0], bl[1]).then(function () { tvFlash(tv, i18nT('vision.pointer_going_to_the_bottom_left'), true); }, function (e) { tvFlash(tv, i18nT('vision.could_not_go_v', { v: e.message }), false); });
            }, i18nT('vision.confirm_moves'), i18nT('vision.brings_the_pointer_to_the_bottom'))
          );
        }
        var o = tvOriginOf(tv, it);
        if (tvHasWorkbench(tv)) ac.acts.appendChild(
          tvIBtn("map-marker-plus-outline", i18nT('vision.zone_origin'), "small", function () {
            var t = (window.__workshop = window.__workshop || {});
            if (!tvHasWorkbench(tv)) return tvFlash(tv, TV_WITHOUT_WORKBENCH, false);
            t.visionPick = { x: o.p[0], y: o.p[1], name: (TV_NAME[it.kind] || "") + " (vision)", ang: ac.m.ang, w: ac.m.w, h: ac.m.h, ts: Date.now() };
            if (tv.router) tv.router.push("/Plugins/Workbench");
            else tvFlash(tv, i18nT('vision.open_the_work_zones_page_the_2'), true);
          }, null, i18nT('vision.opens_the_zone_editor_with_origin', { what: o.what }))
        );
      }

      function tvActionsWorkbench(tv, ac, it) {
        // Material -> cutting area (2026-10-10, function 2 of the list: "detects
        // the sheet and proposes the zone and the cutting area with one tap"). The
        // area is the straight rectangle that fits ENTIRELY in the sheet (if it is
        // rotated, the inner one, not the one that contains it) minus a margin.
        if (tvHasMachine(tv) && (it.kind === "piece" || it.kind === "rect") && (ac.m.corners || ac.m.box)) {
          ac.acts.appendChild(
            tvIBtn("vector-rectangle", i18nT('vision.use_as_cutting_area'), "small", function () {
              var margin = 2;
              var pts = ac.m.corners || ac.m.box;
              var xs = pts.map(function (p) { return p[0]; }).sort(function (a, b) { return a - b; });
              var ys = pts.map(function (p) { return p[1]; }).sort(function (a, b) { return a - b; });
              var r = { xmin: xs[1] + margin, xmax: xs[2] - margin, ymin: ys[1] + margin, ymax: ys[2] - margin };
              // the service checks the rectangle (10 mm minimum, inside the travel of X and Y) and writes cutarea.g: it is its only writer
              tvMachine()
                .then(function (st) {
                  var mode = st && st.global ? st.global.selectedMode : null;
                  if (["Laser", "CNC", "FFF"].indexOf(mode) < 0) throw new Error(i18nT('vision.no_machine_mode'));
                  return workshopApi("machine.workarea.save", { mode: mode, rect: r }).then(function () { return mode; });
                })
                .then(function (modo) {
                  tvFlash(tv, i18nT('vision.cutting_area_saved', { mode: modo, x0: tvFmt(r.xmin, 1), x1: tvFmt(r.xmax, 1), y0: tvFmt(r.ymin, 1), y1: tvFmt(r.ymax, 1), m: margin }) + (Math.abs(ac.m.ang || 0) > 1 ? i18nT('vision.the_sheet_is_rotated_ang', { ang: tvFmt(ac.m.ang, 1) }) : "") + ").", true);
                }, function (e) { tvFlash(tv, i18nT('vision.the_area_was_not_saved_v', { v: String(e.message) }), false); });
            }, i18nT('vision.confirm_saves_the_area'), i18nT('vision.saves_as_the_active_mode_s'))
          );
        }
        // marks for registration cutting (function 3)
        ["a", "b"].forEach(function (k) {
          ac.acts.appendChild(tvBtn(i18nT('vision.mark_k', { k: k.toUpperCase() }) + (tv.regM[k] && tv.regM[k][0] === ac.m.c[0] && tv.regM[k][1] === ac.m.c[1] ? " " + i18nT('vision.chosen_paren') : ""), "small", function () {
            tv.regM[k] = [ac.m.c[0], ac.m.c[1]];
            tv.prefs.open = tv.prefs.open || {};
            tv.prefs.open.record = true;
            tvRenderSide(tv);
          }, null, i18nT('vision.uses_the_center_as_mark_k', { k: k.toUpperCase() })));
        });
      }

      function tvActionsIr(tv, ac, it) {
        // the saved positions are used by the jog and the Workbench: no button without either
        if (tvHasWorkbench(tv) || workshopPluginLoaded("jog")) ac.acts.appendChild(
          tvIBtn("bookmark-plus-outline", i18nT('vision.save_position'), "small", function () {
            tvMachine()
              .then(function (st) {
                var z = tvAxes(st).Z;
                return workshopPosUpdate(function (list) {
                  list.push({ name: ((TV_NAME[it.kind] || "Vision") + " " + tvItemLabel(tv, it)).slice(0, 40), x: Math.round(ac.m.c[0] * 1000) / 1000, y: Math.round(ac.m.c[1] * 1000) / 1000, z: z ? z.machinePosition : null });
                  return list;
                });
              })
              .then(function () { tvFlash(tv, i18nT('vision.saved_in_the_jog_positions'), true); }, function (e) { tvFlash(tv, i18nT('vision.not_saved_v', { v: String(e.message) }), false); });
          }, null, i18nT('vision.adds_the_center_to_the_jog'))
        );
        if (tvHasWorkbench(tv) && (it.kind === "piece" || it.kind === "rect") && (ac.m.bbox || ac.m.corners)) {
          ac.acts.appendChild(
            tvIBtn("puzzle-outline", i18nT('vision.save_offcut'), "small", function () {
              var xs, ys;
              if (ac.m.bbox) {
                xs = [ac.m.bbox[0][0], ac.m.bbox[1][0]];
                ys = [ac.m.bbox[0][1], ac.m.bbox[1][1]];
              } else {
                xs = ac.m.corners.map(function (p) { return p[0]; });
                ys = ac.m.corners.map(function (p) { return p[1]; });
              }
              var x0 = Math.min.apply(null, xs), y0 = Math.min.apply(null, ys);
              var w = Math.max.apply(null, xs) - x0, hh = Math.max.apply(null, ys) - y0;
              tvJsonFileUpdate(TV_OFFCUTS_FILE, [], function (list) {
                if (!Array.isArray(list)) list = [];
                list.push({ name: i18nT('vision.offcut_n_vision', { n: list.length + 1 }), x: Math.round(x0 * 10) / 10, y: Math.round(y0 * 10) / 10, w: Math.round(w * 10) / 10, h: Math.round(hh * 10) / 10 });
                return list;
              }).then(function () {
                tvFlash(tv, i18nT('vision.offcut_saved_size', { w: tvFmt(w), h: tvFmt(hh) }) + (Math.abs(ac.m.ang || 0) > 2 ? i18nT('vision.the_part_is_rotated_offcut', { ang: tvFmt(ac.m.ang) }) : "") + ").", true);
              }, function (e) { tvFlash(tv, i18nT('vision.not_saved_v', { v: String(e.message) }), false); });
            }, null, i18nT('vision.adds_it_to_the_offcuts_on'))
          );
        }
      }

      function tvActionsPiece(tv, ac, it) {
        if ((it.kind === "piece" || it.kind === "rect") && tvOutlineOf(tv, it)) {
          if (tvHasWorkbench(tv)) ac.acts.appendChild(
            tvIBtn("draw", i18nT('vision.to_the_laser_editor'), "small", function () { tvOnEditor(tv, it); }, null,
              i18nT('vision.sends_the_outline_and_its_holes'))
          );
          ac.acts.appendChild(
            tvIBtn("file-download-outline", i18nT('vision.download_svg'), "small", function () { tvLowerSvg(tv, it); }, null,
              i18nT('vision.the_outline_and_its_holes_in'))
          );
        }
        if (it.kind === "piece" || it.kind === "rect") {
          ac.acts.appendChild(
            tvIBtn("shape-plus-outline", i18nT('vision.save_to_parts'), "small", function () { tvSavePiece(tv, it); }, null,
              i18nT('vision.adds_it_to_saved_parts_afterwards'))
          );
        }
        ac.acts.appendChild(
          tvIBtn("content-copy", i18nT('vision.copy_x_y'), "small", function () {
            var t = "X" + tvFmt(ac.m.c[0], 3) + " Y" + tvFmt(ac.m.c[1], 3);
            if (navigator.clipboard) navigator.clipboard.writeText(t).then(function () { tvFlash(tv, i18nT('vision.copied_v', { v: t }), true); }, function () { tvFlash(tv, t, true); });
            else tvFlash(tv, t, true);
          })
        );
      }
