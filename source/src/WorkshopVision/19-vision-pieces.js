      // ==== Rediseno 2026-10-10: funciones de las secciones nuevas ====
      function tvHasWorkbench(tv) {
        return workshopPathExists("/Plugins/Workbench");
      }

      // the work area is saved by the service and edited in Machine
      function tvHasMachine(tv) {
        return workshopPathExists("/Plugins/Machine");
      }

      // machine mm -> coordinates of the image being shown
      function tvMmAView(tv, m) {
        if (!m) return null;
        if (tv.view.kind === "up" && tv.view.up) return tvMmToView(tv, m);
        if (!tv.res || !tv.res.H) return null;
        return tvRotV(tv, tvHomogeneous(tvInv3(tv.res.H), m[0], m[1]));
      }

      function tvOutlineOf(tv, it) {
        var m = it.mm;
        if (!m) return null;
        var c = it.kind === "piece" ? m.poly || m.box : m.corners || m.box;
        return c && c.length > 2 ? c : null;
      }

      function tvHolesOf(tv, it) {
        return ((tv.res && tv.res.items) || []).filter(function (a) { return a.kind === "hole" && a.piece === it.id && a.mm && a.mm.poly && a.mm.poly.length > 2; });
      }

      function tvNamePiece(tv, it) {
        var rc = tv.recognized[it.id];
        return rc ? rc.name : (TV_NAME[it.kind] || i18nT('vision.part')) + " " + tvItemLabel(tv, it);
      }

      // ---- al Editor laser (lo toma 40-cuts.js de Mesa de trabajo) ----
      function tvOnEditor(tv, it) {
        if (!tvHasWorkbench(tv)) return tvFlash(tv, TV_WITHOUT_WORKBENCH, false);
        var m = it.mm;
        var t = (window.__workshop = window.__workshop || {});
        t.visionShape = {
          name: tvNamePiece(tv, it).slice(0, 40),
          ts: Date.now(),
          outline: tvOutlineOf(tv, it).map(function (p) { return [p[0], p[1]]; }),
          holes: tvHolesOf(tv, it).map(function (a) { return a.mm.poly.map(function (p) { return [p[0], p[1]]; }); }),
          ang: m.ang || 0,
          w: m.w,
          h: m.h,
        };
        tvFlash(tv, i18nT('vision.shape_ready_the_workbench_laser_editor'), true);
        if (tv.router) tv.router.push("/Plugins/Workbench");
      }

      function tvLowerSvg(tv, it) {
        var polys = [tvOutlineOf(tv, it)].concat(tvHolesOf(tv, it).map(function (a) { return a.mm.poly; }));
        var xs = [], ys = [];
        polys.forEach(function (p) { p.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
        var x0 = Math.min.apply(null, xs), y1 = Math.max.apply(null, ys);
        var w = Math.max.apply(null, xs) - x0, h = y1 - Math.min.apply(null, ys);
        // SVG with Y downward: the machine's Y is flipped; the file's 0,0 is the
        // top left corner of the outline
        var d = polys.map(function (p) {
          return "M" + p.map(function (q) { return (q[0] - x0).toFixed(3) + " " + (y1 - q[1]).toFixed(3); }).join(" L") + " Z";
        }).join(" ");
        var txt = '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + w.toFixed(3) + 'mm" height="' + h.toFixed(3) + 'mm" viewBox="0 0 ' + w.toFixed(3) + " " + h.toFixed(3) + '">\n' +
          "<!-- Vision: " + tvNamePiece(tv, it).replace(/--/g, "-") + "; " + ("bottom-left corner on the machine: X" + x0.toFixed(2) + " Y" + (y1 - h).toFixed(2)) + " -->\n" +
          '<path d="' + d + '" fill="none" stroke="#000" stroke-width="0.1" fill-rule="evenodd"/>\n</svg>\n';
        var url = URL.createObjectURL(new Blob([txt], { type: "image/svg+xml" }));
        var a = document.createElement("a");
        a.href = url;
        a.download = tvNamePiece(tv, it).replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") + ".svg";
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      }

      // ---- parts library: signature that does not depend on where it is nor how it is rotated ----
      function tvSignature(tv, it) {
        var m = it.mm;
        var w = Math.max(m.w || 0, m.h || 0), h = Math.min(m.w || 0, m.h || 0);
        var area = m.area || (it.kind === "rect" ? w * h : 0);
        var perim = m.perim || (it.kind === "rect" ? 2 * (w + h) : 0);
        return { w: w, h: h, area: area, perim: perim, holes: tvHolesOf(tv, it).length, shape: m.shape || (it.kind === "rect" ? "rectangle" : "free") };
      }

      function tvShape0(tv, it) {
        // outline centered and unrotated, for the thumbnail
        var c = tvOutlineOf(tv, it), m = it.mm;
        if (!c) return [];
        var a = -((m.ang || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
        return c.map(function (p) {
          var x = p[0] - m.c[0], y = p[1] - m.c[1];
          return [Math.round((x * ca - y * sa) * 10) / 10, Math.round((x * sa + y * ca) * 10) / 10];
        });
      }

      function tvSimilar(tv, f, e) {
        // largest relative difference between the measures (0 = equal); null = it is not
        if (f.holes !== (e.holes || 0)) return null;
        var peor = 0;
        [["w", 1.5], ["h", 1.5], ["area", 0], ["perim", 2]].forEach(function (k) {
          var a = f[k[0]], b = e[k[0]];
          if (!b) return;
          var dif = Math.abs(a - b);
          var rel = Math.max(0, dif - k[1]) / b;
          peor = Math.max(peor, k[0] === "area" ? rel / 2 : rel);
        });
        return peor <= 0.04 ? peor : null;
      }

      function tvRecognize(tv) {
        tv.recognized = {};
        if (!tv.lib.length || !tv.res || tv.prefs.recognize === false) return;
        ((tv.res && tv.res.items) || []).forEach(function (it) {
          if ((it.kind !== "piece" && it.kind !== "rect") || !it.mm) return;
          var f = tvSignature(tv, it), best = null;
          tv.lib.forEach(function (e) {
            var p = tvSimilar(tv, f, e);
            if (p !== null && (!best || p < best.p)) best = { p: p, e: e };
          });
          if (best) tv.recognized[it.id] = { name: best.e.name, rotation: (it.mm.ang || 0) - (best.e.ang || 0), p: best.p };
        });
      }

      function tvLoadLib(tv) {
        return tvFileGet(TV_PIECES_FILE).then(function (t) {
          try {
            var j = t ? JSON.parse(t.replace(/^﻿/, "")) : [];
            tv.lib = Array.isArray(j) ? j : [];
          } catch (e) {
            tv.lib = [];
          }
        }, function () { tv.lib = []; }).then(function () {
          tvRecognize(tv);
          if (tv.alive) {
            if (tv.tab === "pieces" || tv.tab === "wizard") tvRenderSide(tv);
            tvDraw(tv);
          }
        });
      }

      function tvSavePiece(tv, it, nombre) {
        if (!it.mm) return tvFlash(tv, i18nT('vision.without_calibration_there_are_no'), false);
        var f = tvSignature(tv, it);
        var nuevo;
        return tvJsonFileUpdate(TV_PIECES_FILE, [], function (list) {
          if (!Array.isArray(list)) list = [];
          nuevo = Object.assign({ name: (nombre || i18nT('vision.part_n', { n: list.length + 1 })).slice(0, 40), ts: Date.now(), ang: it.mm.ang || 0, outline: tvShape0(tv, it) }, f);
          list.push(nuevo);
          return list;
        }).then(function (list) {
          tv.lib = list;
          tvRecognize(tv);
          tvFlash(tv, i18nT('vision.saved_as_part', { name: nuevo.name, w: tvFmt(f.w, 1), h: tvFmt(f.h, 1), n: f.holes }), true);
          tvRenderSide(tv);
          tvDraw(tv);
        }, function (e) { tvFlash(tv, i18nT('vision.not_saved_v', { v: String(e.message) }), false); });
      }

      function tvThumbnail(tv, contorno) {
        var sv = tvSvg("svg", { viewBox: "-1 -1 2 2" });
        if (!contorno || contorno.length < 3) return sv;
        var r = 0;
        contorno.forEach(function (p) { r = Math.max(r, Math.abs(p[0]), Math.abs(p[1])); });
        r = r || 1;
        tvSvg("polygon", { points: contorno.map(function (p) { return (p[0] / r * 0.9).toFixed(3) + "," + (-p[1] / r * 0.9).toFixed(3); }).join(" "), fill: "rgba(255,213,79,.25)", stroke: "#ffd54f", "stroke-width": 0.06 }, sv);
        return sv;
      }

      function tvRenderPieces(tv) {
        var it = tvSelItem(tv);
        var c1 = tvCard(i18nT('vision.save_a_part'), "shape-plus-outline");
        tv.side.appendChild(c1);
        if (!it || (it.kind !== "piece" && it.kind !== "rect") || !it.mm) {
          c1.appendChild(tvEl("div", "tv-muted", i18nT('vision.analyze_the_image_and_tap_a')));
          c1.appendChild(tvIBtn("magnify-scan", i18nT('vision.analyze'), "primary", function () { tvAnalyze(tv); }));
        } else {
          var f = tvSignature(tv, it);
          c1.appendChild(tvEl("div", null, i18nT('vision.chosen_size_holes', { w: tvFmt(f.w, 1), h: tvFmt(f.h, 1), n: f.holes }) + " · " + tvShapeTxt(f.shape)));
          var row = tvEl("div", "tv-acts");
          var inp = tvEl("input", "tv-in");
          inp.placeholder = i18nT('vision.name_e_g_m5_bracket');
          inp.maxLength = 40;
          row.appendChild(inp);
          row.appendChild(tvIBtn("content-save-outline", i18nT('vision.save'), "primary", function () { tvSavePiece(tv, it, inp.value.trim()); }));
          c1.appendChild(row);
        }
        var c2 = tvCard(i18nT('vision.saved_parts'), "bookshelf", tv.lib.length ? String(tv.lib.length) : null);
        tv.side.appendChild(c2);
        var tg = tvEl("label", "tv-check");
        var cb = tvEl("input");
        cb.type = "checkbox";
        cb.checked = tv.prefs.recognize !== false;
        cb.addEventListener("change", function () {
          tv.prefs.recognize = cb.checked;
          tvSavePrefs(tv.prefs);
          tvRecognize(tv);
          tvRenderSide(tv);
          tvDraw(tv);
        });
        tg.appendChild(cb);
        tg.appendChild(tvEl("span", null, i18nT('vision.recognize_them_by_themselves_in_the')));
        c2.appendChild(tg);
        if (!tv.lib.length) {
          c2.appendChild(tvEl("div", "tv-muted", i18nT('vision.there_are_no_saved_parts_yet')));
          return;
        }
        var views = {};
        Object.keys(tv.recognized).forEach(function (id) { views[tv.recognized[id].name] = (views[tv.recognized[id].name] || 0) + 1; });
        var cont = tvEl("div", "tv-lib");
        c2.appendChild(cont);
        tv.lib.forEach(function (e, i) {
          var row2 = tvEl("div", "tv-lib-it");
          row2.appendChild(tvThumbnail(tv, e.outline));
          var b = tvEl("div", "b");
          var nm = tvEl("input", "tv-in");
          nm.value = e.name;
          nm.maxLength = 40;
          nm.addEventListener("change", function () {
            var v = nm.value.trim();
            if (!v) return;
            tvJsonFileUpdate(TV_PIECES_FILE, [], function (list) {
              if (Array.isArray(list) && list[i] && list[i].ts === e.ts) list[i].name = v;
              return list;
            }).then(function (list) { tv.lib = list; tvRecognize(tv); tvDraw(tv); }, function (err) { tvFlash(tv, i18nT('vision.not_saved_v', { v: String(err.message) }), false); });
          });
          b.appendChild(nm);
          b.appendChild(tvEl("div", "tv-muted", i18nT('vision.size_holes', { w: tvFmt(e.w, 1), h: tvFmt(e.h, 1), n: e.holes || 0 }) + (views[e.name] ? " · " + i18nT('vision.in_the_image_v', { v: views[e.name] }) : "")));
          row2.appendChild(b);
          row2.appendChild(tvIBtn("delete-outline", "", "small ghost", function () {
            tvJsonFileUpdate(TV_PIECES_FILE, [], function (list) {
              return (Array.isArray(list) ? list : []).filter(function (x) { return x.ts !== e.ts; });
            }).then(function (list) { tv.lib = list; tvRecognize(tv); tvRenderSide(tv); tvDraw(tv); }, function (err) { tvFlash(tv, i18nT('vision.not_deleted_v', { v: err.message }), false); });
          }, i18nT('vision.confirm_delete'), i18nT('vision.deletes_this_part_from_the_library')));
          cont.appendChild(row2);
        });
        c2.appendChild(tvEl("div", "tv-muted", i18nT('vision.it_s_recognized_by_its_measurements')));
      }

