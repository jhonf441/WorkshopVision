      // Loads the chosen view (of the analyzed photo if there is one, so that what is
      // drawn matches the image exactly).
      function tvLoadView(tv) {
        var v = tv.prefs.view;
        if (v === "up" && !(tv.res && tv.res.H)) v = "camera";
        var q = "view=" + v + (tv.res ? "&id=" + tv.res.photo : "&fresca=1");
        // rotated as standing in front of the machine (the From above view already is)
        var rot = v !== "up" && tv.prefs.orient !== "camera" && tv.orientAuto && (tv.orientAuto.rotation || tv.orientAuto.mirror) ? { g: tv.orientAuto.rotation, e: !!tv.orientAuto.mirror } : null;
        if (rot) q += "&rotation=" + rot.g + (rot.e ? "&mirror=1" : "");
        var P = tv.prefs.params || {};
        ["method", "threshold", "blur", "canny1", "canny2"].forEach(function (k) {
          if (P[k] !== undefined && P[k] !== "") q += "&" + k + "=" + encodeURIComponent(P[k]);
        });
        return fetch(tvApi("/frame.jpg?" + q + "&t=" + Date.now()), { cache: "no-store", headers: tvIdHeaders() })
          .then(function (r) {
            if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || "HTTP " + r.status); });
            var lim = r.headers.get("X-Arriba");
            tv.view.kind = v;
            tv.view.rot = rot;
            tv.view.up = lim ? lim.split(",").map(parseFloat) : null;
            return r.blob();
          })
          .then(function (b) {
            if (!tv.alive) return;
            if (tv.objUrl) URL.revokeObjectURL(tv.objUrl);
            tv.objUrl = URL.createObjectURL(b);
            return new Promise(function (ok) {
              tv.img.onload = function () { tv.img.onload = null; ok(); };
              tv.img.onerror = function () { tv.img.onerror = null; ok(); };
              tv.img.src = tv.objUrl;
            });
          })
          .catch(function (e) {
            tvSetEmpty(tv, i18nT('vision.no_image_v', { v: String(e.message) }));
          });
      }

      // camera px -> coordinates of the displayed image
      function tvToView(tv, p) {
        if (tv.view.kind === "up" && tv.view.up && tv.res && tv.res.H) {
          var m = tvHomogeneous(tv.res.H, p[0], p[1]);
          return tvMmToView(tv, m);
        }
        return tvRotV(tv, p);
      }

      // Rotated image (orientation): camera px -> displayed image px
      // and the reverse. First the mirror, then the clockwise turn.
      function tvRotDims(tv) {
        var g = tv.view.rot.g;
        return g === 90 || g === 270 ? [tv.view.h, tv.view.w] : [tv.view.w, tv.view.h]; // ancho y alto de la camara
      }

      function tvRotV(tv, p) {
        if (!tv.view.rot || !p) return p;
        var d = tvRotDims(tv), x = tv.view.rot.e ? d[0] - p[0] : p[0], y = p[1];
        switch (tv.view.rot.g) {
          case 90: return [d[1] - y, x];
          case 180: return [d[0] - x, d[1] - y];
          case 270: return [y, d[0] - x];
          default: return [x, y];
        }
      }

      function tvRotInv(tv, p) {
        if (!tv.view.rot || !p) return p;
        var d = tvRotDims(tv), x, y;
        switch (tv.view.rot.g) {
          case 90: x = p[1]; y = d[1] - p[0]; break;
          case 180: x = d[0] - p[0]; y = d[1] - p[1]; break;
          case 270: x = d[0] - p[1]; y = p[0]; break;
          default: x = p[0]; y = p[1];
        }
        return [tv.view.rot.e ? d[0] - x : x, y];
      }

      function tvMmToView(tv, m) {
        var a = tv.view.up; // x0, y0, x1, y1, ppm
        return [(m[0] - a[0]) * a[4], (a[3] - m[1]) * a[4]];
      }

      // displayed image coordinates -> camera px (or null)
      function tvFromView(tv, p) {
        if (tv.view.kind === "up") {
          if (!tv.view.up || !tv.res || !tv.res.H) return null;
          var a = tv.view.up;
          var m = [p[0] / a[4] + a[0], a[3] - p[1] / a[4]];
          var Hi = tvInv3(tv.res.H);
          return Hi ? tvHomogeneous(Hi, m[0], m[1]) : null;
        }
        return tvRotInv(tv, p);
      }

      function tvH(tv) {
        return tv.res && tv.res.H ? tv.res.H : null;
      }

      function tvPxToMm(tv, p) {
        var h = tvH(tv);
        return h ? tvHomogeneous(h, p[0], p[1]) : null;
      }

      function tvEvPoint(tv, ev) {
        var m = tv.svg.getScreenCTM();
        if (!m) return null;
        var pt = tv.svg.createSVGPoint();
        pt.x = ev.clientX;
        pt.y = ev.clientY;
        var q = pt.matrixTransform(m.inverse());
        return [q.x, q.y];
      }

      function tvZoomApply(tv, redibujar) {
        var W = tv.stage.clientWidth,
          Hh = tv.zbox.offsetHeight;
        if (tv.zoom.s <= 1.001) tv.zoom = { s: 1, x: 0, y: 0 };
        else {
          tv.zoom.x = Math.min(0, Math.max(W - W * tv.zoom.s, tv.zoom.x));
          tv.zoom.y = Math.min(0, Math.max(Hh - Hh * tv.zoom.s, tv.zoom.y));
        }
        tv.zbox.style.transform = tv.zoom.s === 1 ? "" : "translate(" + tv.zoom.x.toFixed(1) + "px," + tv.zoom.y.toFixed(1) + "px) scale(" + tv.zoom.s.toFixed(4) + ")";
        tv.stage.classList.toggle("pan", tv.zoom.s > 1 && tv.prefs.tool === "see" && tv.tab !== "calibrate");
        if (tv.zoomN) tv.zoomN.textContent = Math.round(tv.zoom.s * 100) + " %";
        if (redibujar !== false) tvDraw(tv);
      }

      // s = new zoom (1 = whole, up to 8); cx, cy = fixed point in px of the box
      function tvZoomA(tv, s, cx, cy) {
        s = Math.max(1, Math.min(8, s));
        if (cx === undefined) {
          cx = tv.stage.clientWidth / 2;
          cy = tv.stage.clientHeight / 2;
        }
        var ux = (cx - tv.zoom.x) / tv.zoom.s,
          uy = (cy - tv.zoom.y) / tv.zoom.s;
        var changes = Math.abs(s - tv.zoom.s) > 1e-4;
        tv.zoom.x = cx - ux * s;
        tv.zoom.y = cy - uy * s;
        tv.zoom.s = s;
        tvZoomApply(tv, changes);
      }

      function tvEndPointer(tv, ev) {
        delete tv.pointers[ev.pointerId];
        if (tv.pinchG && Object.keys(tv.pointers).length < 2) {
          tv.pinchG = null;
          tv.swallowClick = true;
        }
        if (tv.panG && tv.panG.id === ev.pointerId) {
          if (tv.panG.moved) tv.swallowClick = true;
          tv.panG = null;
          tv.stage.classList.remove("panning");
        }
      }

      function tvAdjustWidth(tv) {
        var vw = tv.view.w || tv.dimPrev[0], vh = tv.view.h || tv.dimPrev[1]; // before the image: the shape of the last one
        var asp = (vw / vh).toFixed(4);
        // With a wide screen (or browser zoom out) the image does not
        // exceed the window height: what is left over in width goes to the panel
        // on the right. In full screen, the screen's height.
        if (tvInFull(tv)) {
          tv.left.style.maxWidth = "none";
          var height = window.innerHeight - tv.dock.offsetHeight - tv.info.offsetHeight - 44;
          tv.stage.style.maxWidth = Math.max(320, Math.floor(height * (vw / vh))) + "px";
        } else {
          // 2026-10-11 ("why can it not take up the whole width?"): the cap only
          // serves if the right panel fits beside it (bases 560 + 400 + 14 of
          // separation). If it drops down (kiosk ~1100 px), the image uses the whole width.
          var main = tv.left.parentNode;
          var alSide = !!main && window.innerWidth > 700; // el panel va siempre al lado (salvo celular)
          tv.left.style.maxWidth = alSide ? "max(600px, calc((100vh - 200px) * " + asp + "))" : "none";
          tv.stage.style.maxWidth = "";
        }
      }

      // Full screen: the image column covers the window (it always works, also on the kiosk) and, if the
      // browser allows, also the browser's full screen (without bars). Esc or the button exit.
      function tvInFull(tv) {
        return tv.left.classList.contains("tv-full");
      }

      function tvScreenFull(tv) {
        if (tvInFull(tv)) return tvExitFull(tv);
        tv.left.classList.add("tv-full");
        var de = document.documentElement;
        try {
          var p = de.requestFullscreen ? de.requestFullscreen() : null;
          if (p && p.catch) p.catch(function () { /*  without the browser's: it still covers the window */ });
        } catch (e) { /* idem */ }
        tvOnFs(tv);
      }

      function tvExitFull(tv) {
        tv.left.classList.remove("tv-full");
        if (document.fullscreenElement) {
          try { document.exitFullscreen(); } catch (e) { /* no critico */ }
        }
        tvOnFs(tv);
      }

      function tvOnFs(tv) {
        // exited the browser's (Esc): it also exits its own
        if (!document.fullscreenElement && tvInFull(tv) && tv.fsWas) {
          tv.fsWas = false;
          tv.left.classList.remove("tv-full");
        }
        tv.fsWas = !!document.fullscreenElement;
        tvRenderBars(tv);
        tvAdjustWidth(tv);
        setTimeout(function () {
          tvAdjustWidth(tv);
          tvZoomA(tv, tv.zoom.s);
        }, 60);
      }

      function tvOnResize(tv) {
        tvAdjustWidth(tv); // the panel on the right can move from the side to the bottom
      }

      // Machine X / Y under the mouse (or px without calibration)
      function tvCursorShow(tv, ev) {
        var p = tvEvPoint(tv, ev);
        var c = p && tv.view.w ? tvFromView(tv, p) : null;
        if (!c) {
          tv.cursorEl.style.display = "none";
          return;
        }
        var m = tvPxToMm(tv, c);
        tv.cursorEl.textContent = m ? "X " + tvFmt(m[0], 1) + "   Y " + tvFmt(m[1], 1) + " mm" : Math.round(c[0]) + ", " + Math.round(c[1]) + " px";
        tv.cursorEl.style.display = "";
      }

