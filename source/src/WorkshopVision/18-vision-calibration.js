      // Foldable section. grupo: only one open per group (null = free).
      // The state stays in prefs.open (per screen).
      function tvAcc(tv, id, title, icon, sub, group, byDefault, tag) {
        if (id === tv.tab) {
          var cs = tvCard(title, icon, tag);
          if (sub) cs.appendChild(tvEl("div", "tv-muted", sub));
          return { el: cs, body: cs, open: true };
        }
        var ab = (tv.prefs.open = tv.prefs.open || {});
        var open = ab[id] === undefined ? !!byDefault : !!ab[id];
        var el = tvEl("div", "tv-acc wf-card");
        var h = tvEl("div", "tv-acc-h");
        h.appendChild(tvIcon(icon, "m"));
        var tt = tvEl("div");
        tt.style.minWidth = "0";
        tt.appendChild(tvEl("div", "tt", title));
        if (sub) tt.appendChild(tvEl("div", "ss", sub));
        h.appendChild(tt);
        if (tag) h.appendChild(tvEl("span", "tag", tag));
        var ch = tvIcon(open ? "chevron-up" : "chevron-down");
        if (!tag) ch.style.marginLeft = "auto";
        h.appendChild(ch);
        h.addEventListener("click", function () {
          var nuevo = !open;
          if (nuevo && group) {
            Object.keys(ab).forEach(function (k) { if (ab["g:" + k] === group) ab[k] = false; });
          }
          ab[id] = nuevo;
          if (group) ab["g:" + id] = group;
          tvSavePrefs(tv.prefs);
          tvRenderSide(tv);
          if (tv.tab === "calibrate") {
            tvRenderBars(tv);
            tvDraw(tv);
          }
        });
        el.appendChild(h);
        var body = tvEl("div", "tv-acc-b");
        if (open) el.appendChild(body);
        if (group) ab["g:" + id] = group;
        return { el: el, body: body, open: open };
      }

      // ---- calibracion ----
      function tvAnalyzeForCal(tv) {
        // new photo + marks (to see which it finds) without touching the chosen types
        return tvPost("/detect", { kinds: ["marks"], params: {}, photo: tv.photoAct })
          .then(function (r) {
            tv.res = r;
            return tvLoadView(tv);
          })
          .catch(function (e) { tv.lastMsg = { t: i18nT('vision.no_image_v', { v: String(e.message) }), ok: false }; })
          .then(function () { tvRenderSide(tv); tvDraw(tv); tvUpdateInfo(tv); });
      }

      function tvIsAccOpen(tv, id) {
        return !!(tv.prefs.open && tv.prefs.open[id]);
      }

      // opens a Calibrate method (and closes the others in the group)
      function tvOpenAcc(tv, id) {
        var ab = (tv.prefs.open = tv.prefs.open || {});
        Object.keys(ab).forEach(function (k) { if (ab["g:" + k] === "cal") ab[k] = false; });
        ab[id] = true;
        ab["g:" + id] = "cal";
        tvSavePrefs(tv.prefs);
        tvRenderSide(tv);
        tvRenderBars(tv);
        tvDraw(tv);
      }

      // posicion del puntero (maquina) -> fn({x, y})
      function tvPointerHere(tv, fn) {
        tvMachine().then(function (st) {
          var ax = tvAxes(st);
          if (!ax.X || !ax.X.homed || !ax.Y.homed) return tvFlash(tv, i18nT('vision.x_and_y_need_homing'), false);
          fn({ x: Math.round(ax.X.machinePosition * 100) / 100, y: Math.round(ax.Y.machinePosition * 100) / 100 });
          tvRenderSide(tv);
          tvDraw(tv);
        });
      }

      // detect sheet / board in the current photo (or in the video) and show that same image
      function tvDetectCal(tv, path, body, put) {
        tvFlash(tv, i18nT('vision.searching'), true);
        return tvPost(path, Object.assign({ photo: tv.photoAct }, body)).then(
          function (r) {
            put(r);
            tv.lastMsg = null;
            tv.photoAct = r.photo;
            tv.photoInfo = tv.photoInfo || { n: 1 };
            return tvAnalyzeForCal(tv);
          },
          function (e) { tvFlash(tv, e.message, false); }
        );
      }

      // Rectangle of known size (model, in mm) over the pointer's
      // points: rotation + translation, with or without mirror; rms = pointer error.
      function tvSettingRigid(tv, P, Q) {
        var best = null;
        [false, true].forEach(function (esp) {
          var Pm = P.map(function (p) { return [p[0], esp ? -p[1] : p[1]]; });
          var cp = [0, 1].map(function (j) { return Pm.reduce(function (s, p) { return s + p[j]; }, 0) / Pm.length; });
          var cq = [0, 1].map(function (j) { return Q.reduce(function (s, p) { return s + p[j]; }, 0) / Q.length; });
          var sr = 0, si = 0;
          Pm.forEach(function (p, i) {
            var a = [p[0] - cp[0], p[1] - cp[1]], b = [Q[i][0] - cq[0], Q[i][1] - cq[1]];
            sr += b[0] * a[0] + b[1] * a[1];
            si += b[1] * a[0] - b[0] * a[1];
          });
          var th = Math.atan2(si, sr), c = Math.cos(th), s = Math.sin(th);
          var f = function (p) {
            var x = p[0] - cp[0], y = (esp ? -p[1] : p[1]) - cp[1];
            return [c * x - s * y + cq[0], s * x + c * y + cq[1]];
          };
          var e2 = 0;
          P.forEach(function (p, i) { var q = f(p); e2 += Math.pow(q[0] - Q[i][0], 2) + Math.pow(q[1] - Q[i][1], 2); });
          var rms = Math.sqrt(e2 / P.length);
          if (!best || rms < best.rms) best = { f: f, rms: rms };
        });
        return best;
      }

      // vision.json is written through the settings store with revision (workshopSettings, 02-settings.js): fn is applied over the
      // CURRENT file, never over this page's copy, so another person's calibration or template is not erased; at a double conflict
      // the error says "Another person changed this: reload or save as a copy" (the callers show e.message).
      function tvCfgSave(tv, fn) {
        return workshopSettings
          .save("vision", function (o) {
            return fn(o) || o;
          })
          .then(function (r) {
            tv.cfg = r.value;
            return tvRefreshState(tv);
          });
      }

      function tvArucoCfg(tv) {
        var a = tv.cfg.aruco || {};
        return { dict: a.dict || "DICT_4X4_50", side: a.side || 40, marks: a.marks || {} };
      }

      function tvPrintMarks(tv, ids, side, dict) {
        var w = window.open("", "_blank");
        if (!w) return tvFlash(tv, i18nT('vision.the_browser_blocked_the_print_window'), false);
        var html = "<!doctype html><meta charset='utf-8'><title>" + i18nT('vision.aruco_markers') + "</title><style>body{font-family:sans-serif;margin:10mm}" +
          ".m{display:inline-block;margin:6mm;text-align:center;font-size:11pt}.m img{width:" + (side * 1.25) + "mm;height:" + (side * 1.25) + "mm;image-rendering:pixelated;display:block}" +
          "@media print{.np{display:none}}</style><div class='np'><p>" + i18nT('vision.print_markers_hint', { mm: side }) + "</p><button onclick='print()'>" + i18nT('vision.print') + "</button></div>";
        ids.forEach(function (i) {
          html += "<div class='m'><img src='" + tvApi("/mark.png?id=" + i + "&px=800") + "'>#" + i + " · " + dict + "</div>";
        });
        w.document.write(html);
        w.document.close();
      }

      function tvSaveCalibration(tv, cr, extra) {
        return tvCfgSave(tv, function (o) {
          o.calibs = o.calibs || {};
          if (o.calibration && o.calibration.size) {
            o.calibs[o.calibration.size.join("x")] = o.calibs[o.calibration.size.join("x")] || o.calibration; // formato 1.0
            delete o.calibration;
          }
          o.calibs[cr.size.join("x")] = cr;
          if (extra) extra(o);
          return o;
        });
      }

