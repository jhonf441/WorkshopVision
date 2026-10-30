      function tvTarget(tv, st) {
        var c = tv.prefs.cover || {};
        var that = c.what || "zone";
        var ax = ((st && st.move && st.move.axes) || []);
        if (that === "rect") {
          var r = [c.x0, c.y0, c.x1, c.y1].map(parseFloat);
          if (r.some(function (v) { return !isFinite(v); })) throw new Error(i18nT('vision.fill_in_x0_y0_x1_y1'));
          return r;
        }
        if (that === "bed") {
          if (ax.length < 2) throw new Error(i18nT('vision.no_machine_data'));
          return [ax[0].min, ax[1].min, ax[0].max, ax[1].max];
        }
        if (that === "area") {
          var g = (st && st.global) || {};
          var a = g["cutArea" + (g.selectedMode || "")];
          if (!a || a.length !== 4) throw new Error(i18nT('vision.mode_has_no_measured_cutting_area', { mode: g.selectedMode || "?" }));
          return [a[0], a[2], a[1], a[3]];
        }
        // active zone: its origin (the zone's G10 offset) + the material's measure
        var wn = st.move.workplaceNumber || 0;
        var ox = ax[0].workplaceOffsets[wn], oy = ax[1].workplaceOffsets[wn];
        var w = parseFloat(c.zw), h = parseFloat(c.zh);
        if (tv.zoneSizes[wn] && tv.zoneSizes[wn].w) {
          w = tv.zoneSizes[wn].w;
          h = tv.zoneSizes[wn].h;
        }
        if (!isFinite(w) || !isFinite(h)) throw new Error(i18nT('vision.the_active_zone_has_no_material'));
        return [ox, oy, ox + w, oy + h];
      }

      function tvSetPhoto(tv, id, info) {
        tv.prefs.modePhoto = "photo";
        tv.photoAct = id;
        tv.photoInfo = info;
        tv.live = false;
        clearTimeout(tv.liveTimer);
        tv.res = null;
        tv.roi = null;
        tv.meas = [];
        tvRenderBars(tv);
        // analyze() clears the message: the photo's (list / exposure warnings) is kept
        var msg = tv.lastMsg;
        return tvAnalyze(tv).then(function () {
          if (msg && !tv.lastMsg) {
            tv.lastMsg = msg;
            tvRenderSide(tv);
          }
        });
      }

      // x: only with the camera on the CARRIAGE (plan.x); null = do not move X
      function tvMoveA(tv, y, z, x, confirmed) {
        // it is checked BEFORE EACH movement, not only when starting a series of photos
        // (motion audit, finding 8). "busy" passes: it may be the
        // previous movement of this same series.
        // live job still (ml.confirm): a series is not confirmed by itself, only
        // the single move "Go to Z", which already went through the double tap (confirmado)
        var ml = workshopMachineFree(undefined, { purpose: "move", allowBusy: true });
        if (!ml.free && !(ml.confirm && confirmed)) return Promise.reject(new Error(ml.reason));
        var code = 'M98 P"0:/sys/workshop/macros/visionpose.g"' + (x !== null && x !== undefined ? " X" + Number(x).toFixed(2) : "") + (y !== null && y !== undefined ? " Y" + Number(y).toFixed(2) : "") + (z !== null && z !== undefined ? " Z" + Number(z).toFixed(2) : "");
        return postCode(code)
          .then(function (r) { return r.text(); })
          .then(function (t) {
            if (/error|abort|posicion de foto/i.test(t || "")) throw new Error((t || "").trim());
          });
      }

      function tvTakePhotos(tv, p, revert) {
        var turn = null;
        var ids = [];
        var noticesExp = [];
        var i = 0;
        tv.photoBusy = i18nT('vision.preparing');
        tvRenderSide(tv);
        return tvMachine()
          .then(function (st) {
            var ax = tvAxes(st);
            if (tvBusy(st)) throw new Error(i18nT('vision.a_job_is_running'));
            if (!ax.Y || !ax.Z || !ax.Y.homed || !ax.Z.homed) throw new Error(i18nT('vision.homes_y_and_z_first'));
            turn = { y: ax.Y.machinePosition, z: ax.Z.machinePosition, x: p.x !== null && p.x !== undefined && ax.X ? ax.X.machinePosition : null };
            function a() {
              if (i >= p.ys.length) return Promise.resolve();
              var y = p.ys[i];
              tv.photoBusy = i18nT('vision.photo_i_of_n_moving_to', { i: i + 1, n: p.ys.length, pos: (p.x !== null && p.x !== undefined ? "X" + tvFmt(p.x) + " " : "") + "Y" + tvFmt(y) + " Z" + tvFmt(p.z) });
              tvRenderSide(tv);
              return tvMoveA(tv, y, p.z, p.x)
                .then(function () {
                  tv.photoBusy = i18nT('vision.photo_i_of_n_taking', { i: i + 1, n: p.ys.length });
                  tvRenderSide(tv);
                  return tvPost("/photo", { fs: p.fs, follow_light: i < p.ys.length - 1 });
                })
                .then(function (r) {
                  ids.push(r.photo);
                  if (r.exposure && r.exposure.notice) noticesExp.push(i18nT('vision.photo_n_v', { n: i + 1, v: r.exposure.notice }));
                  i++;
                  return a();
                });
            }
            return a();
          })
          .then(function () {
            if (ids.length === 1) return { photo: ids[0], info: { n: 1 } };
            tv.photoBusy = i18nT('vision.joining_n_photos', { n: ids.length });
            tvRenderSide(tv);
            return tvPost("/mosaic", { photos: ids, area: p.covers }).then(function (m) { return { photo: m.photo, info: { n: ids.length, mosaic: true } }; });
          })
          .then(function (r) {
            var end = revert && turn ? tvMoveA(tv, turn.y, turn.z, turn.x) : Promise.resolve();
            return end.then(function () { return r; });
          })
          .then(function (r) {
            tv.photoBusy = "";
            tvFlash(tv, (r.info.mosaic ? i18nT('vision.mosaic_of_n_photos_ready', { n: r.info.n }) : i18nT('vision.photo_ready_2')) + (revert ? i18nT('vision.the_machine_went_back_to_where') : "") + (noticesExp.length ? "\n" + noticesExp.join("\n") : ""), !noticesExp.length);
            return tvSetPhoto(tv, r.photo, r.info);
          })
          .catch(function (e) {
            tv.photoBusy = "";
            tvFlash(tv, i18nT('vision.photo_colon_v', { v: e.message }), false);
          });
      }

      function tvRenderPhoto(tv) {
        var ft = {};
        var pz = tv.state && tv.state.pose;
        ft.card = tvCard(i18nT('vision.image_to_measure'), "camera-outline", pz ? i18nT('vision.gantry_at_yz', { y: tvFmt(pz.y), z: tvFmt(pz.z) }) : null);
        tv.side.appendChild(ft.card);
        // video (rapido, menos detalle) o foto de medicion (alta resolucion)
        ft.mode = tv.prefs.modePhoto || (tv.photoAct ? "photo" : "video");
        var sec = tvEl("div", "tv-sec");
        sec.style.width = "100%";
        [["video", i18nT('vision.live_video'), "video-outline"], ["photo", i18nT('vision.measuring_photo'), "camera-iris"]].forEach(function (o) {
          var b = tvIBtn(o[2], o[1], ft.mode === o[0] ? "on" : null, function () {
            tv.prefs.modePhoto = o[0];
            tvSavePrefs(tv.prefs);
            if (o[0] === "video" && tv.photoAct) tvRevertVideo(tv);
            else tvRenderSide(tv);
          });
          b.style.flex = "1";
          b.style.justifyContent = "center";
          sec.appendChild(b);
        });
        ft.card.appendChild(sec);
        ft.step = function step(n, title, done) {
          var s = tvEl("div", "tv-step" + (done ? " done" : ""));
          s.appendChild(tvEl("span", "num", String(n)));
          var bd = tvEl("div", "bd");
          bd.appendChild(tvEl("div", "tt", title));
          s.appendChild(bd);
          ft.steps.appendChild(s);
          return bd;
        };
        if (tvPhotoMode(tv, ft)) return;
        tvPhotoStep1(tv, ft);
        tvPhotoStep2(tv, ft);
        if (tvPhotoStep3(tv, ft)) return;
      }


      function tvNumIn(tv, obj, k, w) {
        var inp = tvEl("input", "tv-in");
        inp.type = "number";
        inp.step = "any";
        inp.style.width = (w || 70) + "px";
        inp.value = obj[k] === undefined || obj[k] === null ? "" : obj[k];
        inp.addEventListener("change", function () {
          obj[k] = inp.value === "" ? null : parseFloat(inp.value);
          tv.planRes = null;
          tvSavePrefs(tv.prefs);
        });
        return inp;
      }

      function tvRenderResults(tv) {
        var items = (tv.res && tv.res.items) || [];
        var card = tvCard(i18nT('vision.detections'), "shape-outline", tv.res ? i18nT('vision.n_found', { n: items.length }) : null);
        tv.side.appendChild(card);
        if (!tv.res) {
          card.appendChild(tvEl("div", "tv-muted", i18nT('vision.choose_what_to_look_for_under')));
          return;
        }
        if (!tv.res.H) card.appendChild(tvMsg("info", i18nT('vision.the_camera_is_not_calibrated_detections')));
        // height of what is measured (2026-10-10: an 8 cm glass measured 13)
        var ra = tvEl("div", "tv-row");
        ra.appendChild(tvEl("span", null, i18nT('vision.height_of_what_you_measure_mm')));
        var inA = tvEl("input", "tv-in");
        inA.type = "number";
        inA.min = "0";
        inA.step = "1";
        inA.value = tv.prefs.height > 0 ? tv.prefs.height : 0;
        inA.addEventListener("change", function () {
          tv.prefs.height = Math.max(0, parseFloat(inA.value) || 0);
          tvSavePrefs(tv.prefs);
          tvAnalyze(tv);
        });
        ra.appendChild(inA);
        card.appendChild(ra);
        card.appendChild(tvEl("div", "tv-muted", tv.res.height
          ? i18nT('vision.measuring_at_height', { h: tvFmt(tv.res.height.height_mm, 0), lens: tvFmt(tv.res.height.lens_mm, 0), f: tvFmt(tv.res.height.factor, 3) })
          : i18nT('vision.the_camera_measures_on_the_plane')));
        if (!items.length) {
          card.appendChild(tvEl("div", "tv-muted", i18nT('vision.nothing_found_hint')));
          return;
        }
        // filter by type, with how many there are of each
        var count = {};
        items.forEach(function (it) { count[it.kind] = (count[it.kind] || 0) + 1; });
        if (tv.filterKind && !count[tv.filterKind]) tv.filterKind = null;
        var kindsSeen = Object.keys(count);
        if (kindsSeen.length > 1) {
          var fl = tvEl("div", "tv-filt");
          card.appendChild(fl);
          fl.appendChild(tvBtn(i18nT('vision.all_n', { n: items.length }), "small" + (tv.filterKind === null ? " on" : ""), function () { tv.filterKind = null; tvRenderSide(tv); }));
          kindsSeen.forEach(function (tp) {
            var b = tvBtn("", "small" + (tv.filterKind === tp ? " on" : ""), function () { tv.filterKind = tv.filterKind === tp ? null : tp; tvRenderSide(tv); });
            var sp = tvEl("span", "tv-kind");
            var d = tvEl("span", "tv-dot");
            d.style.background = TV_COLOR[tp] || "#888";
            sp.appendChild(d);
            sp.appendChild(document.createTextNode((TV_NAME[tp] || tp) + " · " + count[tp]));
            b.appendChild(sp);
            fl.appendChild(b);
          });
        }
        // Dimensions over the image + report (function 1)
        var czI = tv.res.H ? tvDimensions(tv, items) : null;
        if (czI) {
          var rc = tvEl("div", "tv-acts");
          rc.appendChild(tvBtn(i18nT('vision.dimensions_v', { v: tv.prefs.dimensions !== false ? i18nT('vision.yes') : i18nT('vision.no') }), "small" + (tv.prefs.dimensions !== false ? " on" : ""), function () {
            tv.prefs.dimensions = tv.prefs.dimensions === false;
            tvSavePrefs(tv.prefs);
            tvRenderSide(tv);
            tvDraw(tv);
          }, null, i18nT('vision.draws_on_the_image_the_length')));
          rc.appendChild(tvIBtn("file-table-outline", i18nT('vision.dimensions_report'), "small", function () {
            var csv = czI.rows.map(function (f) { return f.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(";"); }).join("\r\n");
            var a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
            a.download = "cotas-" + new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-") + ".csv";
            a.click();
            setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            tvFlash(tv, i18nT('vision.report_downloaded_part_holes', { l: tvFmt(czI.L, 1), a: tvFmt(czI.A, 1), n: czI.holes }), true);
          }, null, i18nT('vision.downloads_a_table_csv_opens_in')));
          card.appendChild(rc);
        }
        var list = tvEl("div", "tv-list");
        card.appendChild(list);
        var n = {};
        items.forEach(function (it) {
          n[it.kind] = (n[it.kind] || 0) + 1;
          if (tv.filterKind && it.kind !== tv.filterKind) return;
          var row = tvEl("div", "tv-item" + (tv.sel === it.id ? " sel" : ""));
          row.setAttribute("data-id", it.id);
          row.style.borderLeftColor = TV_COLOR[it.kind] || "#888";
          row.addEventListener("click", function () { tvSelect(tv, tv.sel === it.id ? null : it.id); });
          var t = tvEl("div", "t");
          var d = tvEl("span", "tv-dot");
          d.style.background = TV_COLOR[it.kind] || "#888";
          t.appendChild(d);
          t.appendChild(document.createTextNode((TV_NAME[it.kind] || it.kind) + " " + (it.kind === "mark" ? "#" + it.mark : n[it.kind]) + (it.piece ? " " + i18nT('vision.of_the_part_n', { n: parseInt(it.piece.slice(1), 10) + 1 }) : "")));
          row.appendChild(t);
          var lab = tvItemLabel(tv, it);
          if (lab) row.appendChild(tvEl("div", "big", lab));
          row.appendChild(tvEl("div", "v", tvItemValues(tv, it)));
          if (tv.sel === it.id && it.mm) row.appendChild(tvItemActions(tv, it));
          list.appendChild(row);
        });
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.tap_a_detection_here_or_on')));
      }

      function tvPhotoMode(tv, ft) {
        if (ft.mode === "video") {
          ft.card.appendChild(tvEl("div", "tv-muted", i18nT('vision.fast_to_look_and_aim_res', { res: (tv.state && tv.state.photo && tv.state.photo.video_fs) === 10 ? "640×480" : "800×600" })));
          return true;
        }
        if (tv.photoAct) {
          ft.card.appendChild(tvMsg("ok", (tv.photoInfo && tv.photoInfo.mosaic ? i18nT('vision.analyzing_a_mosaic_of_n_photos', { n: tv.photoInfo.n }) : i18nT('vision.analyzing_the_measuring_photo')) + " " + i18nT('vision.the_detections_below_are_from_this')));
          // Photo of the bed as the map's background (2026-10-10, function 7): with
          // "Whole bed" in What has to fit, the mosaic covers the bed.
          var rf = tvEl("div", "tv-acts");
          rf.appendChild(tvIBtn("image-area", i18nT('vision.use_as_map_background'), "small", function () {
            tvPost("/bed_background", { photo: tv.photoAct }).then(function (j) {
              try { window.dispatchEvent(new Event("workshop-vision")); } catch (e) { /* sin mapa abierto */ }
              tvFlash(tv, i18nT('vision.bed_photo_saved_for_the_map_range', { x0: tvFmt(j.x0, 0), x1: tvFmt(j.x1, 0), y0: tvFmt(j.y0, 0), y1: tvFmt(j.y1, 0) }), true);
            }, function (e) { tvFlash(tv, i18nT('vision.not_saved_v', { v: String(e.message) }), false); });
          }, null, i18nT('vision.saves_this_photo_straightened_as_seen')));
          rf.appendChild(tvBtn(i18nT('vision.remove_background'), "small", function () {
            tvPost("/bed_background", { remove: true }).then(function () {
              try { window.dispatchEvent(new Event("workshop-vision")); } catch (e) { /* sin mapa abierto */ }
              tvFlash(tv, i18nT('vision.map_background_photo_removed'), true);
            }, function (e) { tvFlash(tv, e.message, false); });
          }, i18nT('vision.confirm_remove'), i18nT('vision.deletes_the_map_background_photo_asks')));
          if (tvIsTech()) ft.card.appendChild(rf); // saving the bed photo as the map background is the technician's (/bed_background)
        }
        if (tv.photoBusy) {
          ft.card.appendChild(tvMsg("info", tv.photoBusy));
          return true;
        }
        ft.card.appendChild(tvEl("div", "tv-muted", i18nT('vision.the_camera_is_on_the_gantry')));
      }

      function tvPhotoStep1(tv, ft) {
        ft.c = (tv.prefs.cover = tv.prefs.cover || { what: "zone", margin: 5, back: true });
        ft.steps = tvEl("div", "tv-steps");
        ft.card.appendChild(ft.steps);
        // 1. que cubrir
        var s1 = ft.step(1, i18nT('vision.what_has_to_fit_in_the'), true);
        var r1 = tvEl("div", "tv-row");
        s1.appendChild(r1);
        var sq = tvEl("select", "tv-sel");
        tv.TV_COVER.forEach(function (o) {
          var op = tvEl("option", null, o[1]);
          op.value = o[0];
          if ((ft.c.what || "zone") === o[0]) op.selected = true;
          sq.appendChild(op);
        });
        sq.addEventListener("change", function () { ft.c.what = sq.value; tv.planRes = null; tvSavePrefs(tv.prefs); tvRenderSide(tv); });
        r1.appendChild(sq);
        r1.appendChild(tvEl("span", "tv-muted", "margin"));
        r1.appendChild(tvNumIn(tv, ft.c, "margin", 56));
        r1.appendChild(tvEl("span", "tv-muted", "mm"));
        if (ft.c.what === "rect") {
          var r2 = tvEl("div", "tv-row");
          s1.appendChild(r2);
          ["x0", "y0", "x1", "y1"].forEach(function (k) {
            r2.appendChild(tvEl("span", "tv-muted", k.toUpperCase()));
            r2.appendChild(tvNumIn(tv, ft.c, k, 60));
          });
        }
        if (ft.c.what === "zone") {
          var r3 = tvEl("div", "tv-row");
          s1.appendChild(r3);
          r3.appendChild(tvEl("span", "tv-muted", i18nT('vision.if_the_zone_has_no_material')));
          r3.appendChild(tvNumIn(tv, ft.c, "zw", 56));
          r3.appendChild(tvEl("span", "tv-muted", "×"));
          r3.appendChild(tvNumIn(tv, ft.c, "zh", 56));
          r3.appendChild(tvEl("span", "tv-muted", "mm"));
        }
      }

      function tvPhotoStep2(tv, ft) {
        // 2. calcular
        var s2 = ft.step(2, i18nT('vision.work_out_where_and_at_what'), !!tv.planRes);
        var r4 = tvEl("div", "tv-row");
        s2.appendChild(r4);
        if (tvIsTech()) r4.appendChild( // "calculate" is /plan: the technician's; the operator takes the photo where the camera is
          tvIBtn("calculator-variant-outline", tv.planRes ? i18nT('vision.recalculate') : i18nT('vision.calculate'), tv.planRes ? null : "primary", function () {
            tvMachine()
              .then(function (st) {
                return tvPost("/plan", { target: tvTarget(tv, st), margin_mm: parseFloat(ft.c.margin) || 0 });
              })
              .then(function (p) { tv.planRes = p; tv.lastMsg = null; tvRenderSide(tv); }, function (e) { tv.planRes = null; tvFlash(tv, e.message, false); });
          }, null, i18nT('vision.works_out_where_to_put_the'))
        );
        r4.appendChild(
          tvIBtn("camera", i18nT('vision.photo_here_without_moving'), "ghost", function () {
            tv.photoBusy = i18nT('vision.taking_photo');
            tvRenderSide(tv);
            tvPost("/photo", {})
              .then(function (r) {
                tv.photoBusy = "";
                if (r.exposure && r.exposure.notice) tv.lastMsg = { t: i18nT('vision.photo_colon_v', { v: r.exposure.notice }), ok: false };
                return tvSetPhoto(tv, r.photo, { n: 1 });
              })
              .catch(function (e) { tv.photoBusy = ""; tvFlash(tv, i18nT('vision.photo_colon_v', { v: e.message }), false); });
          }, null, i18nT('vision.measuring_photo_where_the_machine_is'))
        );
        if (tv.planRes) {
          var p = tv.planRes;
          var stats = tvEl("div", "tv-stats");
          s2.appendChild(stats);
          stats.appendChild(tvStat(i18nT('vision.photos'), p.photos > 1 ? p.photos + " " + i18nT('vision.mosaic_paren') : "1"));
          stats.appendChild(tvStat(i18nT('vision.height'), "Z" + tvFmt(p.z)));
          stats.appendChild(tvStat(p.x !== null && p.x !== undefined ? i18nT('vision.carriage_at') : i18nT('vision.gantry_at'), (p.x !== null && p.x !== undefined ? "X " + tvFmt(p.x, 0) + " · " : "") + "Y " + p.ys.map(function (y) { return tvFmt(y, 0); }).join(" / ")));
          stats.appendChild(tvStat(i18nT('vision.detail'), tvFmt(p.mm_per_px, 2) + " mm/px"));
          s2.appendChild(tvEl("div", "tv-muted", i18nT('vision.covers_x_y', { x0: tvFmt(p.covers[0], 0), x1: tvFmt(p.covers[2], 0), y0: tvFmt(p.covers[1], 0), y1: tvFmt(p.covers[3], 0) }) + " · " + p.size[0] + "×" + p.size[1] + " · " + tvFmt(p.px_per_mm, 2) + " px/mm"));
          (p.notices || []).forEach(function (a) { s2.appendChild(tvMsg("err", a)); });
        }
      }

      function tvPhotoStep3(tv, ft) {
        // 3. mover y sacar
        var s3 = ft.step(3, tv.planRes && tv.planRes.photos > 1 ? i18nT('vision.move_the_gantry_and_take_the_photos') : i18nT('vision.move_the_gantry_and_take_the_photo'), false);
        if (!tv.planRes) {
          s3.appendChild(tvEl("div", "tv-muted", i18nT('vision.calculate_first_step_2')));
          return true;
        }
        var r5 = tvEl("div", "tv-row");
        s3.appendChild(r5);
        r5.appendChild(
          tvIBtn("cursor-move", tv.planRes.photos > 1 ? i18nT('vision.move_and_take_n_photos', { n: tv.planRes.photos }) : i18nT('vision.move_and_take_the_photo'), "primary", function () {
            tvTakePhotos(tv, tv.planRes, ft.c.back !== false);
          }, i18nT('vision.confirm_moves_y_z'), i18nT('vision.moves_the_gantry_to_each_position'))
        );
        var chk = tvEl("input");
        chk.type = "checkbox";
        chk.checked = ft.c.back !== false;
        chk.addEventListener("change", function () { ft.c.back = chk.checked; tvSavePrefs(tv.prefs); });
        var lb = tvEl("label", "tv-muted");
        lb.appendChild(chk);
        lb.appendChild(document.createTextNode(" " + i18nT('vision.go_back_afterwards')));
        r5.appendChild(lb);
      }
