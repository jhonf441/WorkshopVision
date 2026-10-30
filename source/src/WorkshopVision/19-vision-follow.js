      // ---- live: dimensions over the video and following a part ----
      function tvSelItem(tv) {
        return tv.sel && tv.res ? tv.res.items.filter(function (x) { return x.id === tv.sel; })[0] || null : null;
      }

      function tvFollowBegin(tv, it) {
        tv.follow.on = true;
        tv.follow.ref = { c: it.mm.c.slice(), area: tvSignature(tv, it).area, ang: it.mm.ang || 0, kind: it.kind };
        tv.follow.start = { c: it.mm.c.slice(), ang: it.mm.ang || 0 };
        tv.follow.trail = [it.mm.c.slice()];
        tv.follow.last = { c: it.mm.c.slice(), ang: it.mm.ang || 0 };
        tv.follow.lost = 0;
        tv.follow.liveBefore = tv.live;
        if (!tv.live) tvSetLive(tv, true);
        tvRenderSide(tv);
      }

      function tvFollowStop(tv) {
        tv.follow.on = false;
        if (!tv.follow.liveBefore && tv.live) tvSetLive(tv, false);
        tvRenderSide(tv);
        tvDraw(tv);
      }

      function tvFollowStep(tv) {
        // the detection that most resembles the one being followed, near where it was
        var best = null;
        (tv.res.items || []).forEach(function (it) {
          if (it.kind !== tv.follow.ref.kind || !it.mm) return;
          var a = tvSignature(tv, it).area;
          if (tv.follow.ref.area && Math.abs(a - tv.follow.ref.area) / tv.follow.ref.area > 0.15) return;
          var d = tvDist(it.mm.c, tv.follow.last.c);
          if (d < 60 && (!best || d < best.d)) best = { d: d, it: it };
        });
        if (!best) {
          tv.follow.lost++;
          return;
        }
        tv.follow.lost = 0;
        var m = best.it.mm;
        tv.follow.last = { c: m.c.slice(), ang: m.ang || 0 };
        var u = tv.follow.trail[tv.follow.trail.length - 1];
        if (!u || tvDist(u, m.c) > 0.3) tv.follow.trail.push(m.c.slice());
        if (tv.follow.trail.length > 200) tv.follow.trail.shift();
        tv.sel = best.it.id;
      }

      function tvRenderFollow(tv) {
        var c1 = tvCard(i18nT('vision.measure_live'), "ruler-square-compass");
        tv.side.appendChild(c1);
        c1.appendChild(tvEl("div", "tv-muted", i18nT('vision.analyzes_the_video_nonstop_about_once')));
        var r1 = tvEl("div", "tv-acts");
        r1.appendChild(tvIBtn(tv.live ? "pause" : "play", tv.live ? i18nT('vision.stop_the_live_video') : i18nT('vision.analyze_live'), tv.live ? "on" : "primary", function () {
          if (tv.photoAct) tvRevertVideo(tv);
          tvSetLive(tv, !tv.live);
          tvRenderSide(tv);
        }));
        r1.appendChild(tvIBtn("ruler", i18nT('vision.dimensions'), tv.prefs.dimensions !== false ? "on" : null, function () {
          tv.prefs.dimensions = tv.prefs.dimensions === false;
          tvSavePrefs(tv.prefs);
          tvRenderSide(tv);
          tvDraw(tv);
        }, null, i18nT('vision.shows_or_hides_the_measurements_drawn')));
        c1.appendChild(r1);

        var c2 = tvCard(i18nT('vision.track_a_part'), "motion-play-outline", tv.follow.on ? (tv.follow.lost > 2 ? i18nT('vision.lost') : i18nT('vision.tracking')) : null);
        tv.side.appendChild(c2);
        if (!tv.follow.on) {
          var it = tvSelItem(tv);
          if (!it || (it.kind !== "piece" && it.kind !== "rect") || !it.mm) {
            c2.appendChild(tvEl("div", "tv-muted", i18nT('vision.tap_a_part_in_the_image')));
          } else {
            c2.appendChild(tvEl("div", null, i18nT('vision.chosen_name_at_xy', { name: tvNamePiece(tv, it), x: tvFmt(it.mm.c[0], 1), y: tvFmt(it.mm.c[1], 1) })));
            c2.appendChild(tvIBtn("play", i18nT('vision.track_this_part'), "primary", function () { tvFollowBegin(tv, it); }));
          }
        } else {
          var dx = tv.follow.last.c[0] - tv.follow.start.c[0], dy = tv.follow.last.c[1] - tv.follow.start.c[1];
          var dg = tv.follow.last.ang - tv.follow.start.ang;
          var dd = Math.hypot(dx, dy);
          var dl = tvEl("div", "tv-delta");
          [[i18nT('vision.moved'), tvFmt(dd, 2) + " mm", dd > 0.5], [i18nT('vision.in_x_y'), tvFmt(dx, 2) + " / " + tvFmt(dy, 2), dd > 0.5], [i18nT('vision.rotation'), tvFmt(dg, 2) + "°", Math.abs(dg) > 0.5]].forEach(function (q) {
            var d = tvEl("div", q[2] ? "height" : null);
            d.appendChild(tvEl("b", null, q[1]));
            d.appendChild(tvEl("span", "tv-muted", q[0]));
            dl.appendChild(d);
          });
          c2.appendChild(dl);
          if (tv.follow.lost > 2) c2.appendChild(tvMsg("err", i18nT('vision.part_not_found_in_the_last_images', { n: tv.follow.lost })));
          var r2 = tvEl("div", "tv-acts");
          r2.appendChild(tvIBtn("restore", i18nT('vision.reset_to_zero'), null, function () {
            tv.follow.start = { c: tv.follow.last.c.slice(), ang: tv.follow.last.ang };
            tv.follow.trail = [tv.follow.last.c.slice()];
            tvRenderSide(tv);
            tvDraw(tv);
          }));
          r2.appendChild(tvIBtn("stop", i18nT('vision.stop_tracking'), null, tzBind(tvFollowStop, tv)));
          c2.appendChild(r2);
        }

        var c3 = tvCard(i18nT('vision.head'), "crosshairs");
        tv.side.appendChild(c3);
        c3.appendChild(tvEl("div", "tv-muted", i18nT('vision.marks_in_the_video_where_the')));
        var r3 = tvEl("div", "tv-acts");
        r3.appendChild(tvIBtn("crosshairs", i18nT('vision.head'), tv.prefs.head ? "on" : null, function () {
          tv.prefs.head = !tv.prefs.head;
          tvSavePrefs(tv.prefs);
          if (tv.prefs.head) tvRequestHead(tv);
          else {
            clearTimeout(tv.cabTimer);
            tv.cab = null;
          }
          tvRenderBars(tv);
          tvRenderSide(tv);
          tvDraw(tv);
        }));
        r3.appendChild(tvIBtn("target", "BLTouch", tv.prefs.headProbe ? "on" : null, function () {
          tv.prefs.headProbe = !tv.prefs.headProbe;
          tvSavePrefs(tv.prefs);
          tvRenderBars(tv);
          tvRenderSide(tv);
          tvDraw(tv);
        }));
        c3.appendChild(r3);
        if (tv.prefs.head && tv.cab && tv.cab.x !== undefined) {
          var pz = tv.cab.points || {};
          c3.appendChild(tvEl("div", null, i18nT('vision.head') + " X" + tvFmt(tv.cab.x, 1) + " Y" + tvFmt(tv.cab.y, 1) + " Z" + tvFmt(tv.cab.z, 1) + (pz.laser ? " · laser X" + tvFmt(pz.laser.x, 1) + " Y" + tvFmt(pz.laser.y, 1) : "") + (tv.prefs.headProbe && pz.probe ? " · BLTouch X" + tvFmt(pz.probe.x, 1) + " Y" + tvFmt(pz.probe.y, 1) : "")));
        }
      }

      // ---- step by step: from the bed to the part ready to use ----
      function tvRenderWizard(tv) {
        var it = tvSelItem(tv);
        var pieces = ((tv.res && tv.res.items) || []).filter(function (x) { return (x.kind === "piece" || x.kind === "rect") && x.mm; });
        var done = [tv.wizard.material, !!(tv.photoAct || tv.wizard.video), pieces.length > 0, !!(it && it.mm && (it.kind === "piece" || it.kind === "rect")), false];
        var now = done.indexOf(false);
        var steps = [
          [i18nT('vision.put_the_material_on_the_bed'), i18nT('vision.lay_it_flat_with_the_bed')],
          [i18nT('vision.choose_the_image'), i18nT('vision.a_measuring_photo_the_camera_positions')],
          [i18nT('vision.detect_the_part'), i18nT('vision.finds_the_outline_of_the_part')],
          [i18nT('vision.tap_the_part_in_the_image'), i18nT('vision.if_there_are_several_the_one')],
          [i18nT('vision.use_it'), i18nT(tvHasWorkbench(tv) ? 'vision.cut_area_zone_origin_to_the' : 'vision.use_it_help_no_map')],
        ];
        var c = tvCard(i18nT('vision.step_by_step'), "shoe-print");
        tv.side.appendChild(c);
        var st = tvEl("div", "tv-steps");
        c.appendChild(st);
        steps.forEach(function (p, i) {
          var d = tvEl("div", "tv-step" + (done[i] ? " hecho" : i === now ? " ahora" : ""));
          d.appendChild(tvEl("div", "n", done[i] ? "✓" : String(i + 1)));
          var b = tvEl("div", "b");
          b.appendChild(tvEl("div", "tt", p[0]));
          if (i === now || (i === 4 && now === 4)) b.appendChild(tvEl("div", "tv-muted", p[1]));
          if (i === 0 && i === now) b.appendChild(tvIBtn("check", i18nT('vision.done'), "small primary", function () { tv.wizard.material = true; tvRenderSide(tv); }));
          if (i === 1 && i === now) {
            var r = tvEl("div", "tv-acts");
            r.appendChild(tvIBtn("video-outline", i18nT('vision.use_the_video'), "small", function () { tv.wizard.video = true; if (tv.photoAct) tvRevertVideo(tv); else tvAnalyze(tv); tvRenderSide(tv); }));
            b.appendChild(r);
            b.appendChild(tvEl("div", "tv-muted", i18nT('vision.for_the_measuring_photo_use_the')));
          }
          if (i === 2 && i === now) {
            b.appendChild(tvIBtn("magnify-scan", i18nT('vision.detect'), "small primary", function () {
              if (tv.prefs.kinds.indexOf("piece") < 0) tv.prefs.kinds.push("piece");
              if (tv.prefs.kinds.indexOf("holes") < 0) tv.prefs.kinds.push("holes");
              tvSavePrefs(tv.prefs);
              tvRenderBars(tv);
              tvAnalyze(tv);
            }));
            if (tv.res && !pieces.length) b.appendChild(tvMsg("info", tv.res.H ? i18nT('vision.no_part_was_found_try_detect') : i18nT('vision.the_camera_is_not_calibrated_without')));
          }
          if (i === 3 && i === now && pieces.length) b.appendChild(tvEl("div", "tv-muted", i18nT('vision.n_found_dot', { n: pieces.length })));
          d.appendChild(b);
          st.appendChild(d);
        });
        var r2 = tvEl("div", "tv-acts");
        r2.appendChild(tvIBtn("restart", i18nT('vision.start_over'), "small ghost", function () {
          tv.wizard = { material: false, video: false };
          tv.sel = null;
          tvRenderSide(tv);
          tvDraw(tv);
        }));
        c.appendChild(r2);
        if (now === 1) tvRenderPhoto(tv);
        if (now === 4 || (now === -1 && it)) {
          var c2 = tvCard(tvNamePiece(tv, it), "check-decagram-outline");
          c2.appendChild(tvEl("div", "tv-pre", tvItemValues(tv, it)));
          c2.appendChild(tvItemActions(tv, it));
          tv.side.appendChild(c2);
        }
      }

