      // ---- drawing ----
      // ---- dimensions of a part: lines in image px + report rows ----
      // The part's axes = sides of the minimum rectangle (box), with origin at the
      // bottom left corner in machine mm. The holes are
      // measured from that corner along those axes (they work even if it is rotated).
      function tvDimensions(tv, items) {
        var pieces = items.filter(function (it) { return it.kind === "piece" && it.mm && it.px && it.px.box && it.mm.box; });
        if (!pieces.length) return null;
        var p = pieces.filter(function (it) { return it.id === tv.sel; })[0];
        if (!p) {
          var hijo = items.filter(function (it) { return it.id === tv.sel && it.piece; })[0];
          if (hijo) p = pieces.filter(function (it) { return it.id === hijo.piece; })[0];
        }
        if (!p) p = pieces.slice().sort(function (a, b) { return (b.mm.area || 0) - (a.mm.area || 0); })[0];
        var bm = p.mm.box, bp = p.px.box;
        // esquina de abajo a la izquierda (mm) y sus dos vecinas
        var i0 = 0;
        bm.forEach(function (q, i) { if (q[0] + q[1] < bm[i0][0] + bm[i0][1]) i0 = i; });
        var i1 = (i0 + 1) % 4, i3 = (i0 + 3) % 4;
        var d = function (a, b) { return Math.hypot(b[0] - a[0], b[1] - a[1]); };
        // axis u = the most "horizontal" side from the corner
        var ue = Math.abs(bm[i1][0] - bm[i0][0]) >= Math.abs(bm[i3][0] - bm[i0][0]) ? i1 : i3, ve = ue === i1 ? i3 : i1;
        var L = d(bm[i0], bm[ue]), A = d(bm[i0], bm[ve]);
        var u = [(bm[ue][0] - bm[i0][0]) / L, (bm[ue][1] - bm[i0][1]) / L], v = [(bm[ve][0] - bm[i0][0]) / A, (bm[ve][1] - bm[i0][1]) / A];
        var loc = function (c) { var dx = c[0] - bm[i0][0], dy = c[1] - bm[i0][1]; return [dx * u[0] + dy * u[1], dx * v[0] + dy * v[1]]; };
        // dimension lines outside the part (in px): shifted from the center
        var cpx = [0, 1].map(function (j) { return bp.reduce(function (s, q) { return s + q[j]; }, 0) / 4; });
        var off = Math.max(tv.view.w, tv.view.h) / 40;
        // a part near the edge of the image: the dimension line would fall outside the picture and not be seen, so it goes inside the part
        var visible = function (q) {
          var v = tvToView(tv, q), mg = off * 0.6;
          return v[0] >= mg && v[0] <= tv.view.w - mg && v[1] >= mg && v[1] <= tv.view.h - mg;
        };
        var outside = function (a, b, dist) {
          var m = [(a[0] + b[0]) / 2 - cpx[0], (a[1] + b[1]) / 2 - cpx[1]];
          var n = Math.hypot(m[0], m[1]) || 1;
          var at = function (d) { return [[a[0] + (m[0] / n) * d, a[1] + (m[1] / n) * d], [b[0] + (m[0] / n) * d, b[1] + (m[1] / n) * d]]; };
          var fuera = at(dist);
          return visible(fuera[0]) && visible(fuera[1]) ? fuera : at(-dist);
        };
        var lines = [];
        var lu = outside(bp[i0], bp[ue], off), lv = outside(bp[i0], bp[ve], off);
        lines.push({ a: bp[i0], b: lu[0], guide: true }, { a: bp[ue], b: lu[1], guide: true }, { a: lu[0], b: lu[1], txt: tvFmt(L, 1) + " mm" });
        lines.push({ a: bp[ve], b: lv[1], guide: true }, { a: lv[0], b: lv[1], txt: tvFmt(A, 1) + " mm" });
        var hs = items.filter(function (it) { return it.kind === "hole" && it.piece === p.id && it.mm && it.px && it.px.c; });
        hs.forEach(function (h) { h._loc = loc(h.mm.c); });
        hs.sort(function (a, b) { return a._loc[0] - b._loc[0] || a._loc[1] - b._loc[1]; });
        // center-to-center distance with the next one (in order along the part)
        for (var i = 0; i + 1 < hs.length; i++) {
          lines.push({ a: hs[i].px.c, b: hs[i + 1].px.c, txt: tvFmt(d(hs[i].mm.c, hs[i + 1].mm.c), 1) });
        }
        var rows = [[i18nT('vision.col_element'), i18nT('vision.col_machine_x_mm'), i18nT('vision.col_machine_y_mm'), i18nT('vision.col_from_corner_along_mm'), i18nT('vision.col_from_corner_across_mm'), i18nT('vision.col_diameter_mm'), i18nT('vision.col_roundness')]];
        rows.push([i18nT('vision.part_size_rotation', { l: tvFmt(L, 2), a: tvFmt(A, 2), ang: tvFmt(p.mm.ang, 2) }), tvFmt(bm[i0][0], 2), tvFmt(bm[i0][1], 2), "0", "0", "", ""]);
        hs.forEach(function (h, j) {
          rows.push([i18nT('vision.hole_n', { n: j + 1 }), tvFmt(h.mm.c[0], 2), tvFmt(h.mm.c[1], 2), tvFmt(h._loc[0], 2), tvFmt(h._loc[1], 2), h.mm.d ? tvFmt(h.mm.d, 2) : "", h.mm.roundness !== undefined ? tvFmt(h.mm.roundness, 2) : ""]);
        });
        return { piece: p, lines: lines, rows: rows, L: L, A: A, holes: hs.length };
      }

      function tvPolyStr(tv, pts) {
        return pts.map(function (p) { var v = tvToView(tv, p); return v[0].toFixed(1) + "," + v[1].toFixed(1); }).join(" ");
      }

      function tvItemLabel(tv, it) {
        var m = it.mm;
        if (!m) return TV_NAME[it.kind] || it.kind;
        switch (it.kind) {
          case "piece":
            return m.shape === "circle" && m.d ? "⌀" + tvFmt(m.d) : tvFmt(m.w) + "×" + tvFmt(m.h) + (Math.abs(m.ang) > 0.3 ? " · " + tvFmt(m.ang) + "°" : "");
          case "rect":
            return tvFmt(m.w) + "×" + tvFmt(m.h);
          case "circle":
            return "⌀" + tvFmt(m.d);
          case "hole":
            return m.d ? "⌀" + tvFmt(m.d) : tvFmt(m.w) + "×" + tvFmt(m.h);
          case "line":
            return tvFmt(m.len) + " mm · " + tvFmt(m.ang) + "°";
          case "mark":
            return "#" + it.mark + (m.error !== undefined && m.error !== null ? " (" + tvFmt(m.error, 2) + ")" : "");
          default:
            return "";
        }
      }

      function tvDraw(tv) {
        var dr = {};
        while (tv.svg.firstChild) tv.svg.removeChild(tv.svg.firstChild);
        if (!tv.view.w) return;
        dr.k = Math.max(tv.view.w, tv.view.h) / 800 / tv.zoom.s; // relative line width (with zoom, the same on screen)
        dr.fs = 13 * dr.k;
        if (tv.prefs.grid && tv.tab !== "calibrate") tvGrid(tv, dr.k, dr.fs);
        if (tv.prefs.rule !== false && tv.tab !== "calibrate") tvRule(tv, dr.k, dr.fs);
        dr.g = tvSvg("g", {}, tv.svg);
        dr.items = (tv.res && tv.res.items) || [];
        tvDrawItems(tv, dr);
        tvDrawGuides(tv, dr);
        tvDrawExtras(tv, dr);
        tvDrawCal(tv, dr);
      }

      function tvDrawItems(tv, dr) {
        dr.items.forEach(function (it) {
          var col = TV_COLOR[it.kind] || "#fff";
          var isSel = tv.sel === it.id;
          var sw = (isSel ? 3.2 : 1.8) * dr.k;
          var gi = tvSvg("g", { style: "cursor:pointer" }, dr.g);
          gi.addEventListener("click", function (ev) {
            if (tv.prefs.tool !== "see" || !tvModeMeasure(tv)) return;
            ev.stopPropagation();
            tvSelect(tv, it.id, true);
          });
          var px = it.px || {};
          if (it.kind === "circle" && px.c && px.r) {
            var pts = [];
            for (var a = 0; a < 48; a++) pts.push([px.c[0] + px.r * Math.cos((a / 48) * 2 * Math.PI), px.c[1] + px.r * Math.sin((a / 48) * 2 * Math.PI)]);
            tvSvg("polygon", { points: tvPolyStr(tv, pts), fill: col, "fill-opacity": isSel ? 0.22 : 0.08, stroke: col, "stroke-width": sw }, gi);
          } else if (it.kind === "line" && px.poly) {
            var a2 = tvToView(tv, px.poly[0]), b2 = tvToView(tv, px.poly[1]);
            tvSvg("line", { x1: a2[0], y1: a2[1], x2: b2[0], y2: b2[1], stroke: col, "stroke-width": sw * 1.3 }, gi);
          } else if (px.poly && px.poly.length > 2) {
            tvSvg("polygon", { points: tvPolyStr(tv, px.poly), fill: col, "fill-opacity": isSel ? 0.22 : it.kind === "piece" ? 0.06 : 0.1, stroke: col, "stroke-width": sw }, gi);
            if (it.kind === "piece" && px.box) tvSvg("polygon", { points: tvPolyStr(tv, px.box), fill: "none", stroke: col, "stroke-width": dr.k, "stroke-dasharray": 6 * dr.k + " " + 4 * dr.k, "stroke-opacity": 0.7 }, gi);
          }
          if (px.c) {
            var c = tvToView(tv, px.c);
            var r = (it.kind === "corner" ? 4 : 3) * dr.k;
            tvSvg("circle", { cx: c[0], cy: c[1], r: isSel ? r * 1.6 : r, fill: it.kind === "corner" ? "none" : col, stroke: col, "stroke-width": 1.5 * dr.k }, gi);
            if (it.kind !== "corner" || isSel) {
              var tx = tvSvg("text", { x: c[0] + 6 * dr.k, y: c[1] - 6 * dr.k, fill: col, "font-size": dr.fs, "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k }, gi);
              tx.textContent = tvItemLabel(tv, it);
            }
          }
        });
      }

      function tvDrawGuides(tv, dr) {
        // Dimensions (2026-10-10, function 1: "length, width, diameters and distances
        // between holes drawn on the image"): of the chosen part or, if
        // none is chosen, of the largest.
        if (tv.prefs.dimensions !== false && tvModeMeasure(tv)) {
          var cz = tvDimensions(tv, dr.items);
          if (cz) {
            var colC = "#ffd54f";
            var gc = tvSvg("g", { "pointer-events": "none" }, dr.g);
            cz.lines.forEach(function (l) {
              var a = tvToView(tv, l.a), b = tvToView(tv, l.b);
              tvSvg("line", { x1: a[0], y1: a[1], x2: b[0], y2: b[1], stroke: colC, "stroke-width": 1.4 * dr.k, "stroke-dasharray": l.guide ? 3 * dr.k + " " + 3 * dr.k : null }, gc);
              if (!l.txt) return;
              [a, b].forEach(function (p) { tvSvg("circle", { cx: p[0], cy: p[1], r: 2.2 * dr.k, fill: colC }, gc); });
              var t = tvSvg("text", { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2 - 4 * dr.k, fill: colC, "font-size": dr.fs, "font-weight": "bold", "text-anchor": "middle", "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k }, gc);
              t.textContent = l.txt;
            });
          }
        }
        // Head (function 6): cross where it is and its recent path, only
        // over the video (not over a measuring photo from another position)
        if (tv.prefs.head && tv.cab && tv.cab.px && !tv.photoAct && tv.view.kind === "camera") {
          var sc = tv.cab.size && tv.cab.size[0] ? (tv.view.rot ? tvRotDims(tv)[0] : tv.view.w) / tv.cab.size[0] : 1;
          var cv = function (p) { return tvRotV(tv, [p[0] * sc, p[1] * sc]); };
          var colH = "#76ff03";
          var gh = tvSvg("g", { "pointer-events": "none" }, dr.g);
          if (tv.cabTrail.length > 1) tvSvg("polyline", { points: tv.cabTrail.map(function (p) { return cv(p).join(","); }).join(" "), fill: "none", stroke: colH, "stroke-width": 1.6 * dr.k, "stroke-opacity": 0.6 }, gh);
          var hp = cv(tv.cab.px), L2 = 14 * dr.k;
          tvSvg("line", { x1: hp[0] - L2, y1: hp[1], x2: hp[0] + L2, y2: hp[1], stroke: colH, "stroke-width": 2.2 * dr.k }, gh);
          tvSvg("line", { x1: hp[0], y1: hp[1] - L2, x2: hp[0], y2: hp[1] + L2, stroke: colH, "stroke-width": 2.2 * dr.k }, gh);
          tvSvg("circle", { cx: hp[0], cy: hp[1], r: 6 * dr.k, fill: "none", stroke: colH, "stroke-width": 1.6 * dr.k }, gh);
          var th = tvSvg("text", { x: hp[0] + 10 * dr.k, y: hp[1] + 18 * dr.k, fill: colH, "font-size": dr.fs, "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k }, gh);
          th.textContent = "X" + tvFmt(tv.cab.x, 1) + " Y" + tvFmt(tv.cab.y, 1) + (tv.cab.inside === false ? i18nT('vision.outside_the_image') : "");
          // where the laser lands (red dot) and, if requested, the BLTouch probe
          var pz = tv.cab.points || {};
          [["laser", "#ff1744", i18nT('vision.laser'), true], ["probe", "#40c4ff", i18nT('vision.bltouch_touches_here'), !!tv.prefs.headProbe]].forEach(function (q) {
            var e = pz[q[0]];
            if (!q[3] || !e || !e.px) return;
            var v = cv(e.px);
            tvSvg("line", { x1: hp[0], y1: hp[1], x2: v[0], y2: v[1], stroke: q[1], "stroke-width": 1 * dr.k, "stroke-dasharray": 3 * dr.k + " " + 3 * dr.k }, gh);
            tvSvg("circle", { cx: v[0], cy: v[1], r: q[0] === "laser" ? 4 * dr.k : 7 * dr.k, fill: q[0] === "laser" ? q[1] : "none", stroke: q[1], "stroke-width": 2 * dr.k }, gh);
            var tq = tvSvg("text", { x: v[0] + 9 * dr.k, y: v[1] - 6 * dr.k, fill: q[1], "font-size": dr.fs * 0.9, "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k }, gh);
            tq.textContent = q[2] + " X" + tvFmt(e.x, 1) + " Y" + tvFmt(e.y, 1);
          });
        }
      }

      function tvDrawExtras(tv, dr) {
        // piezas de la biblioteca reconocidas (2026-10-10)
        if (tv.prefs.recognize !== false && tvModeMeasure(tv)) {
          dr.items.forEach(function (it) {
            var rc = tv.recognized[it.id];
            var c = it.px && (it.px.c || (it.px.poly && it.px.poly[0]));
            if (!rc || !c) return;
            var v = tvToView(tv, c);
            var tr = tvSvg("text", { x: v[0], y: v[1] - 14 * dr.k, fill: "#ffd54f", "font-size": dr.fs * 1.1, "font-weight": "bold", "text-anchor": "middle", "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k, "pointer-events": "none" }, dr.g);
            tr.textContent = "★ " + rc.name;
          });
        }
        // path of the part being followed (mm -> image)
        if (tv.follow.trail.length > 1 && tvModeMeasure(tv)) {
          var tp = tv.follow.trail.map(tzBind(tvMmAView, tv)).filter(Boolean);
          if (tp.length > 1) tvSvg("polyline", { points: tp.map(function (p) { return p.join(","); }).join(" "), fill: "none", stroke: "#ffd54f", "stroke-width": 2 * dr.k, "stroke-dasharray": 5 * dr.k + " " + 4 * dr.k, "pointer-events": "none" }, dr.g);
          var p0 = tvMmAView(tv, tv.follow.start.c);
          if (p0) tvSvg("circle", { cx: p0[0], cy: p0[1], r: 5 * dr.k, fill: "none", stroke: "#ffd54f", "stroke-width": 2 * dr.k, "pointer-events": "none" }, dr.g);
        }
        // ROI
        if (tv.roi) tvSvg("polygon", { points: tvPolyStr(tv, tv.roi), fill: "none", stroke: "#80deea", "stroke-width": 1.5 * dr.k, "stroke-dasharray": 8 * dr.k + " " + 5 * dr.k }, tv.svg);
        if (tv.roiDrag) {
          var r0 = tv.roiDrag.a, r1 = tv.roiDrag.b;
          tvSvg("rect", { x: Math.min(r0[0], r1[0]), y: Math.min(r0[1], r1[1]), width: Math.abs(r1[0] - r0[0]), height: Math.abs(r1[1] - r0[1]), fill: "#80deea", "fill-opacity": 0.1, stroke: "#80deea", "stroke-width": 1.5 * dr.k }, tv.svg);
        }
        // Medir / Area
        if (tv.meas.length) {
          var vp = tv.meas.map(function (m) { return tvToView(tv, m.px); });
          if (tv.prefs.tool === "area" && vp.length > 2) tvSvg("polygon", { points: vp.map(function (p) { return p.join(","); }).join(" "), fill: "#00e5ff", "fill-opacity": 0.15, stroke: "none" }, tv.svg);
          tvSvg("polyline", { points: vp.map(function (p) { return p.join(","); }).join(" ") + (tv.prefs.tool === "area" && vp.length > 2 ? " " + vp[0].join(",") : ""), fill: "none", stroke: "#00e5ff", "stroke-width": 2 * dr.k }, tv.svg);
          vp.forEach(function (p) { tvSvg("circle", { cx: p[0], cy: p[1], r: 4 * dr.k, fill: "#00e5ff" }, tv.svg); });
        }
        // Move the camera: center of the image and the chosen point
        if (tvPadVisible(tv)) {
          var gm = tvSvg("g", { "pointer-events": "none" }, tv.svg);
          var cc = [tv.view.w / 2, tv.view.h / 2],
            Lc = 10 * dr.k;
          tvSvg("line", { x1: cc[0] - Lc, y1: cc[1], x2: cc[0] + Lc, y2: cc[1], stroke: "#eceff1", "stroke-width": 1.4 * dr.k, "stroke-opacity": 0.8 }, gm);
          tvSvg("line", { x1: cc[0], y1: cc[1] - Lc, x2: cc[0], y2: cc[1] + Lc, stroke: "#eceff1", "stroke-width": 1.4 * dr.k, "stroke-opacity": 0.8 }, gm);
          if (tv.movTarget) {
            var mt = tvToView(tv, tv.movTarget.px);
            tvSvg("line", { x1: cc[0], y1: cc[1], x2: mt[0], y2: mt[1], stroke: "#ffe082", "stroke-width": 1.4 * dr.k, "stroke-dasharray": 5 * dr.k + " " + 4 * dr.k }, gm);
            tvSvg("circle", { cx: mt[0], cy: mt[1], r: 9 * dr.k, fill: "none", stroke: "#ffe082", "stroke-width": 2.4 * dr.k }, gm);
            tvSvg("circle", { cx: mt[0], cy: mt[1], r: 2.5 * dr.k, fill: "#ffe082" }, gm);
          }
        }
      }

      function tvDrawCal(tv, dr) {
        // Sheet / board: the detected corners, numbered (green = with pointer)
        if (tv.tab === "calibrate" && tv.res) {
          var det = tvIsAccOpen(tv, "cal-sheet") && tv.sheetDet && tv.res.photo === tv.sheetDet.photo ? [tv.sheetDet, tv.sheetRefs] : tvIsAccOpen(tv, "cal-board") && tv.tabDet && tv.res.photo === tv.tabDet.photo ? [tv.tabDet, tv.tabRefs] : null;
          if (det) {
            var gd = tvSvg("g", { "pointer-events": "none" }, tv.svg);
            var esc = det[0].size && tv.res.size ? tv.res.size[0] / det[0].size[0] : 1;
            (det[0].points || []).forEach(function (q) {
              var v = tvToView(tv, [q[0] * esc, q[1] * esc]);
              tvSvg("circle", { cx: v[0], cy: v[1], r: 2 * dr.k, fill: "#40c4ff" }, gd);
            });
            var ve = det[0].corners.map(function (q) { return tvToView(tv, [q[0] * esc, q[1] * esc]); });
            tvSvg("polygon", { points: ve.map(function (v) { return v.join(","); }).join(" "), fill: "none", stroke: "#40c4ff", "stroke-width": 1.5 * dr.k, "stroke-dasharray": 6 * dr.k + " " + 4 * dr.k }, gd);
            ve.forEach(function (v, i) {
              var colE = det[1][i] ? "#66bb6a" : "#ffb74d";
              tvSvg("circle", { cx: v[0], cy: v[1], r: 9 * dr.k, fill: "none", stroke: colE, "stroke-width": 3 * dr.k }, gd);
              var te = tvSvg("text", { x: v[0] + 11 * dr.k, y: v[1] - 9 * dr.k, fill: colE, "font-size": dr.fs * 1.3, "font-weight": "bold", "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k }, gd);
              te.textContent = String(i + 1);
            });
          }
        }
        // Calibracion a mano: puntos numerados
        if (tv.tab === "calibrate" && tvPointsOpen(tv)) {
          var cols = ["#ef5350", "#66bb6a", "#42a5f5", "#ffca28", "#ab47bc", "#26c6da", "#ff7043", "#d4e157"];
          tv.calPts.forEach(function (p, i) {
            if (p.u === null) return;
            var v = tvToView(tv, [p.u, p.v]);
            var col2 = cols[i % cols.length];
            tvSvg("circle", { cx: v[0], cy: v[1], r: (tv.calSel === i ? 9 : 7) * dr.k, fill: "none", stroke: col2, "stroke-width": 3 * dr.k }, tv.svg);
            var t2 = tvSvg("text", { x: v[0] + 10 * dr.k, y: v[1] - 8 * dr.k, fill: col2, "font-size": dr.fs * 1.2, "font-weight": "bold", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * dr.k }, tv.svg);
            t2.textContent = String(i + 1);
          });
        }
      }
