      // ---- Vision page (request 2026-10-09) ----
      //
      // "I want a camera plugin made with OpenCV that lets me do
      // several things: rectangle, circle, edges, corners, holes, reference
      // marks, part position". The heavy work is done by the Pi's
      // workshop-vision service (~/workshop-vision/vision.py, OpenCV,
      // port 8095): this page only asks, draws and offers actions.
      //
      // Coordinates: everything shown in mm is a MACHINE coordinate where the
      // POINTER lands (like the Zones map), thanks to the image -> bed
      // calibration (homography) saved in 0:/sys/workshop/config/vision.json.
      //
      // Actions that move the machine (Go with the pointer) ask for a double tap and
      // use the macro that already exists (sys/workshop/macros/gotobed.g). Those that touch
      // zones do NOT write zone files: they open WorkshopJog's editor with
      // the point loaded and the user saves.

      var TV_PORT = 8095;
      var TV_CFG_FILE = "0:/sys/workshop/config/vision.json";
      var TV_OFFCUTS_FILE = "0:/sys/workshop/data/scraps.json";
      var TV_PIECES_FILE = "0:/sys/workshop/data/vision-parts.json"; // biblioteca de piezas (2026-10-10)
      var TV_PREFS_KEY = "workshopVisionPrefs";
      var TV_ARM_MS = 3000;

      var TV_KINDS = [
        ["piece", i18nT('vision.part'), "#76ff03", i18nT('vision.material_outline_position_length_x_width')],
        ["rect", i18nT('vision.rectangles'), "#ffd740", i18nT('vision.any_rectangle_4_sides_with_its')],
        ["circles", i18nT('vision.circles'), "#40c4ff", i18nT('vision.circles_hough_center_and_diameter')],
        ["holes", i18nT('vision.holes'), "#ff4081", i18nT('vision.holes_inside_the_part_center_diameter')],
        ["corners", i18nT('vision.corners'), "#ffab40", i18nT('vision.point_corners_subpixel_to_aim_or')],
        ["edges", i18nT('vision.edges'), "#e040fb", i18nT('vision.long_straight_lines_length_and_angle')],
        ["marks", i18nT('vision.markers'), "#ffffff", i18nT('vision.printed_aruco_markers_references_and')],
      ];
      var TV_COLOR = { piece: "#76ff03", rect: "#ffd740", circle: "#40c4ff", hole: "#ff4081", corner: "#ffab40", line: "#e040fb", mark: "#ffffff" };
      var TV_NAME = { piece: i18nT('vision.part'), rect: i18nT('vision.rectangle'), circle: i18nT('vision.circle'), hole: i18nT('vision.hole'), corner: i18nT('vision.corner'), line: i18nT('vision.edge'), mark: i18nT('vision.marker') };
      // shape ids from vision.py ("rectangulo" | "circulo" | "free") -> display text
      function tvShapeTxt(f) {
        return { rectangle: i18nT('vision.shape_rectangle'), circle: i18nT('vision.shape_circle'), free: i18nT('vision.shape_free') }[f] || f || "";
      }

      // Detection settings (the same names as DEF in vision.py)
      var TV_PARAMS = [
        ["method", i18nT('vision.how_to_separate_the_part'), "sel", ["auto", "bright", "dark", "edges", "adaptive"], i18nT('vision.auto_the_part_is_what_does')],
        ["threshold", i18nT('vision.threshold_0_automatic'), "num", [0, 255, 1], i18nT('vision.threshold_help')],
        ["blur", i18nT('vision.smoothing'), "num", [1, 15, 2], i18nT('vision.removes_noise_before_analyzing_odd_number')],
        ["canny1", i18nT('vision.edges_low_sensitivity'), "num", [5, 400, 5], i18nT('vision.canny_lower_more_edges')],
        ["canny2", i18nT('vision.edges_high_sensitivity'), "num", [10, 500, 5], i18nT('vision.canny_sure_edge_above_this')],
        ["min_mm2", i18nT('vision.minimum_part_mm2'), "num", [10, 100000, 50], i18nT('vision.ignores_spots_smaller_than_this')],
        ["max_pieces", i18nT('vision.maximum_parts'), "num", [1, 20, 1], ""],
        ["min_hole_mm2", i18nT('vision.minimum_hole_mm2'), "num", [0.5, 5000, 0.5], ""],
        ["circle_min_mm", i18nT('vision.circle_minimum_diameter_mm'), "num", [1, 500, 1], ""],
        ["circle_max_mm", i18nT('vision.circle_maximum_diameter_mm'), "num", [2, 1000, 1], ""],
        ["circ_sens", i18nT('vision.circle_strictness'), "num", [0.5, 0.99, 0.01], i18nT('vision.higher_only_very_clean_circles')],
        ["corner_max", i18nT('vision.corners_how_many'), "num", [1, 200, 1], ""],
        ["corner_quality", i18nT('vision.corners_quality_0_01_0_3'), "num", [0.005, 0.5, 0.005], i18nT('vision.higher_only_very_sharp_corners')],
        ["corner_dist_mm", i18nT('vision.corners_spacing_mm'), "num", [0.5, 100, 0.5], ""],
        ["lin_min_mm", i18nT('vision.edges_minimum_length_mm'), "num", [2, 1000, 1], ""],
        ["lin_threshold", i18nT('vision.edges_minimum_votes'), "num", [5, 400, 5], i18nT('vision.houghlinesp_higher_only_clear_lines')],
        ["lin_max", i18nT('vision.edges_how_many'), "num", [1, 100, 1], ""],
      ];

      function tvApi(path) {
        return "http://" + location.hostname + ":" + TV_PORT + path;
      }
      function tvJson(r) {
        return r.json().then(function (j) {
          // the server wants to know who is asking: the common policy decides (a touch just before, never inside the quiet period after a cancel)
          if (j && j.code === "login_required" && typeof workshopAuthAsk === "function") workshopAuthAsk(workshopApiCall, false);
          if (!r.ok || (j && j.ok === false)) throw new Error((j && j.error) || "HTTP " + r.status);
          return j;
        });
      }
      // the JSON answers come in DWC's language (vision.py localizes its messages with ?lang=)
      function tvLang(path) {
        return path + (path.indexOf("?") < 0 ? "?" : "&") + "lang=" + encodeURIComponent(workshopApiLanguage());
      }
      function tvGet(path) {
        return fetch(tvApi(tvLang(path)), { cache: "no-store", headers: tvIdHeaders() }).then(tvJson);
      }
      // text/plain for the body (vision.py reads the JSON anyway); the identity headers (token and browser id, as for the API) make the browser
      // ask first (preflight, cached 10 min): vision.py answers it and checks who is asking before it moves the machine or fires the laser
      function tvPost(path, body) {
        var headers = Object.assign({ "Content-Type": "text/plain" }, tvIdHeaders());
        return fetch(tvApi(tvLang(path)), { method: "POST", headers: headers, body: JSON.stringify(body || {}) }).then(tvJson);
      }
      function tvFileGet(p) {
        return fetch("/machine/file/" + encodeURI(p), { cache: "no-store" }).then(function (r) {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error(p + ": HTTP " + r.status);
          return r.text();
        });
      }
      function tvFilePut(p, text) {
        return fetch("/machine/file/" + encodeURI(p), {
          method: "PUT",
          headers: { "Content-Type": "application/octet-stream" }, // without this DSF writes an EMPTY file
          body: text,
        }).then(function (r) {
          if (!r.ok) throw new Error(i18nT('vision.could_not_write_file_http', { file: p, status: r.status }));
        });
      }
      function tvJsonFileUpdate(p, def, fn) {
        return tvFileGet(p).then(function (t) {
          var o = def;
          if (t) {
            try {
              o = JSON.parse(t.replace(/^﻿/, ""));
            } catch (e) {
              throw new Error(i18nT('vision.file_is_not_valid_json', { file: p }));
            }
          }
          var n = fn(o) || o;
          return tvFilePut(p, JSON.stringify(n, null, 1)).then(function () {
            return n;
          });
        });
      }
      function tvMachine() {
        var t = window.__workshop;
        if (t && t.lastStatus && Date.now() - t.lastStatusAt < 3000 && t.lastStatus.move) return Promise.resolve(t.lastStatus);
        return workshopReadState(); // store de DWC, no /machine/status (2026-10-12)
      }
      function tvAxes(st) {
        var o = {};
        ((st && st.move && st.move.axes) || []).forEach(function (a) {
          o[a.letter] = a;
        });
        return o;
      }
      function tvBusy(st) {
        var s = st && st.state && st.state.status;
        if (["processing", "paused", "pausing", "resuming", "simulating", "busy", "changingTool"].indexOf(s) !== -1) return true;
        // live job: between lines it stays "idle" (motion audit, finding 8)
        if (workshopJobInLive(st)) return true;
        // owner of the movement (2026-10-13): reservation of another page, bridge orders
        return !!workshopMotionBlock(["vision", PLUGIN_ID]);
      }

      function tvEl(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
      }
      function tvSvg(tag, attrs, parent) {
        var e = document.createElementNS("http://www.w3.org/2000/svg", tag);
        Object.keys(attrs || {}).forEach(function (k) {
          e.setAttribute(k, attrs[k]);
        });
        if (parent) parent.appendChild(e);
        return e;
      }
      // Button; with confirmLabel it asks for a second tap within 3 s (moves or deletes).
      function tvBtn(label, cls, onClick, confirmLabel, tip) {
        var b = tvEl("button", "wf-btn tv-btn tvb" + (/(^| )primary( |$)/.test(cls || "") ? " wf-main" : "") + (cls ? " " + cls : ""), label);
        b.type = "button";
        if (tip) b.title = tip;
        var armed = false,
          timer = null;
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (b.disabled) return;
          if (confirmLabel && !armed) {
            armed = true;
            b.style.minWidth = b.offsetWidth + "px";
            b.textContent = confirmLabel;
            b.classList.add("tv-armed", "wf-armed");
            timer = setTimeout(function () {
              armed = false;
              b.textContent = label;
              b.classList.remove("tv-armed", "wf-armed");
            }, TV_ARM_MS);
            return;
          }
          clearTimeout(timer);
          armed = false;
          b.textContent = label;
          b.classList.remove("tv-armed", "wf-armed");
          onClick(ev);
        });
        return b;
      }
      function tvFmt(v, n) {
        if (typeof v !== "number" || !isFinite(v)) return "--";
        var k = Math.pow(10, n === undefined ? 1 : n);
        return String(Math.round(v * k) / k);
      }
      function tvHomogeneous(H, x, y) {
        var w = H[2][0] * x + H[2][1] * y + H[2][2];
        return [(H[0][0] * x + H[0][1] * y + H[0][2]) / w, (H[1][0] * x + H[1][1] * y + H[1][2]) / w];
      }
      function tvInv3(m) {
        var a = m[0][0], b = m[0][1], c = m[0][2], d = m[1][0], e = m[1][1], f = m[1][2], g = m[2][0], h = m[2][1], i = m[2][2];
        var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
        var det = a * A + b * B + c * C;
        if (Math.abs(det) < 1e-15) return null;
        return [
          [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
          [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
          [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
        ];
      }
      function tvPolyArea(p) {
        var s = 0;
        for (var i = 0; i < p.length; i++) {
          var a = p[i], b = p[(i + 1) % p.length];
          s += a[0] * b[1] - b[0] * a[1];
        }
        return Math.abs(s) / 2;
      }
      function tvDist(a, b) {
        return Math.hypot(b[0] - a[0], b[1] - a[1]);
      }

      function tvLoadPrefs() {
        // 2026-10-11 (viewer work bar): nombres = names on the buttons
        // ("auto" / "si" / "no"); rejilla, orient, cabezal and cabezalSonda belong to the
        // bar and before were not saved (only the keys here are saved).
        // undefined = no value of its own: the code keeps using its usual value.
        var p = { kinds: ["piece", "holes"], view: "camera", tool: "see", params: {}, viewParams: false, rule: true, openLive: false, dim: null, names: "auto", grid: undefined, orient: undefined, head: undefined, headProbe: undefined };
        try {
          var o = JSON.parse(localStorage.getItem(TV_PREFS_KEY) || "null");
          if (o && typeof o === "object") Object.keys(p).forEach(function (k) { if (o[k] !== undefined) p[k] = o[k]; });
        } catch (e) {
          /* localStorage no disponible: valores por defecto */
        }
        return p;
      }
      function tvSavePrefs(p) {
        try {
          localStorage.setItem(TV_PREFS_KEY, JSON.stringify(p));
        } catch (e) {
          /* no critico */
        }
      }

      // Redesign 2026-10-10: three tabs (Measure / Calibrate / Settings), the
      // image in front with its tools on top, measuring photo in
      // steps, detections with filters and the calibration in an accordion.
      // Page icon: the same one in the Plugins menu (20-main.js) and in the
      // page header (DESIGN.md 3). A solid glyph like the other plugins' icons.
      var TV_ICON = "eye";
      var tvStyleDone = false;
      function tvInjectStyle() {
        if (tvStyleDone) return;
        tvStyleDone = true;
        workshopInjectFamily(); // the design family (wf-* classes)
        var css = workshopCss(TV_CSS);
        var st = document.createElement("style");
        st.id = "workshop-vision-style";
        st.textContent = css;
        document.head.appendChild(st);
      }
      function tvIcon(name, cls) {
        return tvEl("span", "mdi mdi-" + name + " tv-ic" + (cls ? " " + cls : ""));
      }
      // Button with an icon (same optional double tap as tvBtn)
      function tvIBtn(icon, label, cls, onClick, confirmLabel, tip) {
        var b = tvBtn(label, cls, onClick, confirmLabel, tip);
        if (icon) {
          var ic = tvIcon(icon);
          b.insertBefore(ic, b.firstChild);
          // tvBtn reescribe textContent al armar/desarmar: volver a poner el icono
          new MutationObserver(function () {
            if (b.firstChild !== ic && !b.contains(ic)) b.insertBefore(ic, b.firstChild);
          }).observe(b, { childList: true });
        }
        return b;
      }
      function tvCard(title, icon, extra) {
        var c = tvEl("div", "tv-card wf-card");
        var h = tvEl("h3");
        if (icon) h.appendChild(tvIcon(icon));
        h.appendChild(document.createTextNode(title));
        if (extra) h.appendChild(tvEl("span", "n", extra));
        c.appendChild(h);
        return c;
      }
      function tvMsg(cls, text) {
        var m = tvEl("div", "tv-msg " + cls);
        m.appendChild(tvIcon(cls === "ok" ? "check-circle-outline" : cls === "err" ? "alert-circle-outline" : "information-outline"));
        m.appendChild(tvEl("div", null, text));
        return m;
      }
      function tvStat(k, v) {
        var s = tvEl("div", "tv-stat");
        s.appendChild(tvEl("div", "k", k));
        s.appendChild(tvEl("div", "v", v));
        return s;
      }

      // Publishes the detections (in mm) for the "Vision" layer of the Zones
      // map (WorkshopJog draws it if installed).
      function tvPublish(res) {
        var t = (window.__workshop = window.__workshop || {});
        var items = ((res && res.items) || []).filter(function (it) { return it.mm && it.mm.c; });
        t.vision = { ts: Date.now(), items: items };
        try {
          window.dispatchEvent(new CustomEvent("workshop-vision"));
        } catch (e) {
          /* navegador viejo */
        }
      }

      // Sections of the page (side bar): [id, name, icon, help]
      var TV_SECTIONS = [
        { group: i18nT('vision.measure'), items: [
          ["wizard", i18nT('vision.step_by_step'), "shoe-print", i18nT('vision.from_the_bed_to_a_part')],
          ["detect", i18nT('vision.detect_and_measure'), "ruler", i18nT('vision.finds_parts_holes_circles_markers_and')],
          ["follow", i18nT('vision.live'), "motion-play-outline", i18nT('vision.dimensions_over_the_video_and_tracking')],
          ["pieces", i18nT('vision.saved_parts'), "shape-plus-outline", i18nT('vision.parts_library_recognizes_them_by_itself')],
        ] },
        { group: i18nT('vision.job'), items: [
          ["before", i18nT('vision.before_and_after'), "compare", i18nT('vision.compares_the_bed_before_and_after')],
          ["record", i18nT('vision.cut_on_marks'), "crosshairs-gps", i18nT('vision.aligns_the_design_with_2_marks')],
        ] },
        { group: i18nT('vision.camera_group'), items: [
          ["calibrate", i18nT('vision.calibrate'), "target", i18nT('vision.so_the_image_is_measured_in')],
          ["settings", i18nT('vision.settings'), "tune-variant", i18nT('vision.fire_and_smoke_where_the_camera')],
        ] },
      ];
      var TV_WITHOUT_WORKBENCH = i18nT('vision.this_needs_the_workbench_page');
      var TV_SECTION_IDS = [];
      TV_SECTIONS.forEach(function (g) { g.items.forEach(function (i) { TV_SECTION_IDS.push(i[0]); }); });

      function tvMountPage(root, router) {
        var tv = { root: root, router: router };
        tvVisionStart(tv);
        return tvVisionApi(tv);
      }
