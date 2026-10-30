      // Ruler on the edges (2026-10-11, "something like Workbench with a
      // ruler that makes sense"): machine mm on the top edge and the left
      // one of what is seen (it follows the zoom). Each edge shows the axis that
      // changes along it (with the camera rotated it can be X or Y).
      function tvRule(tv, k, fs) {
        if (!tvH(tv) || !tv.view.w || !tv.stage.clientWidth || !tv.zbox.offsetHeight) return;
        var sx = tv.view.w / tv.stage.clientWidth, sy = tv.view.h / tv.zbox.offsetHeight;
        var vx0 = (-tv.zoom.x / tv.zoom.s) * sx, vy0 = (-tv.zoom.y / tv.zoom.s) * sy;
        var vw = (tv.stage.clientWidth / tv.zoom.s) * sx, vh = (Math.min(tv.stage.clientHeight || tv.zbox.offsetHeight, tv.zbox.offsetHeight) / tv.zoom.s) * sy;
        var banda = fs * 1.45;
        var gr = tvSvg("g", { "pointer-events": "none" }, tv.svg);
        tvSvg("rect", { x: vx0, y: vy0, width: vw, height: banda, fill: "#000", "fill-opacity": 0.5 }, gr);
        tvSvg("rect", { x: vx0, y: vy0 + banda, width: banda, height: Math.max(0, vh - banda), fill: "#000", "fill-opacity": 0.5 }, gr);
        function mmIn(q) {
          var c = tvFromView(tv, q);
          return c && tvPxToMm(tv, c);
        }
        // a: point of the edge at t (0..1); marca(q, mayor) draws the tick
        function edge(a, mark) {
          var m0 = mmIn(a(0)), m1 = mmIn(a(1));
          if (!m0 || !m1) return;
          var axis = Math.abs(m1[0] - m0[0]) >= Math.abs(m1[1] - m0[1]) ? 0 : 1;
          var largo = Math.abs(m1[axis] - m0[axis]);
          if (!(largo > 0)) return;
          var step = [1, 2, 5, 10, 20, 50, 100, 200].filter(function (v) { return largo / v <= 10; })[0] || 200;
          var menor = step >= 5 ? step / 5 : step / 2;
          var N = 240, prev = null;
          for (var i = 0; i <= N; i++) {
            var q = a(i / N), m = mmIn(q);
            if (!m) { prev = null; continue; }
            var v = m[axis];
            if (prev) {
              var lo = Math.min(prev.v, v), hi = Math.max(prev.v, v);
              for (var t = Math.ceil(lo / menor) * menor; t < hi; t += menor) {
                var f = (t - prev.v) / (v - prev.v);
                var pq = [prev.q[0] + (q[0] - prev.q[0]) * f, prev.q[1] + (q[1] - prev.q[1]) * f];
                var mayor = Math.abs(t / step - Math.round(t / step)) < 1e-6;
                mark(pq, mayor, (axis ? "Y" : "X") + Math.round(t));
              }
            }
            prev = { q: q, v: v };
          }
        }
        var y1 = vy0 + banda, x1 = vx0 + banda;
        edge(function (t) { return [x1 + (vw - banda) * t, vy0 + banda / 2]; }, function (q, mayor, txt) {
          tvSvg("line", { x1: q[0], y1: y1, x2: q[0], y2: y1 - banda * (mayor ? 0.55 : 0.25), stroke: mayor ? "#ffe082" : "#eceff1", "stroke-width": (mayor ? 1.4 : 0.9) * k }, gr);
          if (mayor) tvSvg("text", { x: q[0] + 2.5 * k, y: vy0 + fs * 0.85, fill: "#ffe082", "font-size": fs * 0.78, "font-family": "sans-serif" }, gr).textContent = txt;
        });
        edge(function (t) { return [vx0 + banda / 2, y1 + (vh - banda) * t]; }, function (q, mayor, txt) {
          tvSvg("line", { x1: x1, y1: q[1], x2: x1 - banda * (mayor ? 0.55 : 0.25), y2: q[1], stroke: mayor ? "#ffe082" : "#eceff1", "stroke-width": (mayor ? 1.4 : 0.9) * k }, gr);
          if (mayor) {
            var tx = tvSvg("text", { x: vx0 + fs * 0.95, y: q[1] - 2.5 * k, fill: "#ffe082", "font-size": fs * 0.78, "font-family": "sans-serif", transform: "rotate(-90 " + (vx0 + fs * 0.95) + " " + (q[1] - 2.5 * k) + ")" }, gr);
            tx.textContent = txt;
          }
        });
      }

      // Grid in machine mm (2026-10-10): fixed X and Y lines,
      // with the step according to how much is seen (and the zoom); one in 5 marked and
      // with its value.
      function tvGrid(tv, k, fs) {
        if (!tvH(tv) || !tv.view.w) return;
        var esq = [[0, 0], [tv.view.w, 0], [tv.view.w, tv.view.h], [0, tv.view.h]].map(function (q) {
          var c = tvFromView(tv, q);
          return c && tvPxToMm(tv, c);
        });
        if (esq.some(function (m) { return !m; })) return;
        var xs = esq.map(function (m) { return m[0]; }),
          ys = esq.map(function (m) { return m[1]; });
        var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
        var width = Math.max(x1 - x0, y1 - y0) / tv.zoom.s;
        var step = [1, 2, 5, 10, 20, 50, 100, 200].filter(function (v) { return width / v <= 14; })[0] || 200;
        var gr = tvSvg("g", { "pointer-events": "none" }, tv.svg);
        function line(a, b, mayor, txt) {
          var va = tvMmAView(tv, a),
            vb = tvMmAView(tv, b);
          if (!va || !vb) return;
          tvSvg("line", { x1: va[0], y1: va[1], x2: vb[0], y2: vb[1], stroke: mayor ? "#ffe082" : "#eceff1", "stroke-width": (mayor ? 1.1 : 0.7) * k, "stroke-opacity": mayor ? 0.55 : 0.28 }, gr);
          if (!mayor) return;
          // the value, where the line enters the image
          for (var i = 0; i <= 40; i++) {
            var t = i / 40,
              q = [va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t];
            if (q[0] >= 4 * k && q[0] <= tv.view.w - 44 * k && q[1] >= fs + 2 * k && q[1] <= tv.view.h - 4 * k) {
              var tt = tvSvg("text", { x: q[0] + 3 * k, y: q[1] - 3 * k, fill: "#ffe082", "font-size": fs * 0.85, "font-family": "sans-serif", "paint-order": "stroke", stroke: "#000", "stroke-width": 3 * k }, gr);
              tt.textContent = txt;
              return;
            }
          }
        }
        var n = 0;
        for (var x = Math.ceil(x0 / step) * step; x <= x1 && n < 80; x += step, n++) line([x, y0], [x, y1], Math.round(x / step) % 5 === 0, "X" + Math.round(x));
        for (var y = Math.ceil(y0 / step) * step; y <= y1 && n < 160; y += step, n++) line([x0, y], [x1, y], Math.round(y / step) % 5 === 0, "Y" + Math.round(y));
      }

      // Save what is seen (image + what is drawn) as JPG, at its resolution
      function tvSaveImage(tv) {
        if (!tv.view.w || !tv.img.src) return;
        var cv = document.createElement("canvas");
        cv.width = tv.view.w;
        cv.height = tv.view.h;
        var cx = cv.getContext("2d");
        cx.drawImage(tv.img, 0, 0, tv.view.w, tv.view.h);
        var s = tv.svg.cloneNode(true);
        s.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        s.setAttribute("width", tv.view.w);
        s.setAttribute("height", tv.view.h);
        var layer = new Image();
        layer.onload = function () {
          cx.drawImage(layer, 0, 0, tv.view.w, tv.view.h);
          cv.toBlob(
            function (b) {
              if (!b) return tvFlash(tv, i18nT('vision.could_not_build_the_image'), false);
              var d = new Date();
              var p2 = function (v) { return (v < 10 ? "0" : "") + v; };
              var a = document.createElement("a");
              a.href = URL.createObjectURL(b);
              a.download = "vision-" + d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" + p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds()) + ".jpg";
              document.body.appendChild(a);
              a.click();
              a.remove();
              setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
            },
            "image/jpeg",
            0.92
          );
        };
        layer.onerror = function () { tvFlash(tv, i18nT('vision.could_not_build_the_image'), false); };
        layer.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(s));
      }

