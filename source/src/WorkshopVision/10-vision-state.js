      function tvVisionStart(tv) {
        var iv = {};
        tvInjectStyle();
        tvStartState(tv, iv);
        tvStartHeader(tv, iv);
        tvStartBody(tv, iv);
        tvStartImage(tv, iv);
        tvStartEditing(tv, iv);
        tvStartDock(tv, iv);
        tvStartRest(tv, iv);
        tvWatchIdentity(tv); // 09-vision-roles.js
      }

      function tvStartState(tv, iv) {
        tv.alive = true;
        tv.prefs = tvLoadPrefs();
        tv.tab = tvSectionIdsFor(tvView(), TV_SECTIONS).indexOf(tv.prefs.section) >= 0 ? tv.prefs.section : "detect";
        tvEnsureTab(tv); // a saved section the role does not have (09-vision-roles.js)
        tv.res = null; // ultimo /detectar
        tv.resHour = ""; // time of the last analyzed image (without Live it is a photo)
        tv.sel = null; // id seleccionado
        tv.roi = null; // [[u,v] x4] px de la camara
        tv.meas = []; // puntos de Medir/Area: {px:[u,v]}
        tv.live = false,
          tv.liveTimer = null,
          tv.busy = false;
        tv.state = null; // /estado
        tv.cfg = {}; // sys/workshop/config/vision.json
        tv.view = { kind: "camera", w: 0, h: 0, up: null, rot: null }; // what the image shows
        tv.orientAuto = null, // {giro, espejo} de /orientacion (null = sin calibrar)
          tv.orientSignature = "";
        tv.calRes = null; // resultado de /calibrar sin guardar
        // Calibrar con hoja / tablero / lente (2026-10-10)
        tv.sheetDet = null, // {foto, size, esquinas[4]} de /calibrar/hoja
          tv.sheetRefs = {}, // esquina (0..3) -> {x, y} del puntero
          tv.tabDet = null, // {foto, size, esquinas[4], puntos} de /calibrar/tablero
          tv.tabRefs = {},
          tv.lensSt = null, // /lente
          tv.lensRes = null; // /lente/calcular sin guardar
        tv.calPts = []; // calibracion a mano: {u,v,x,y}
        tv.calSel = -1;
        tv.lastMsg = null;
        tv.timers = [];
        // Measurement photo (camera on the bridge: Y/Z move to take it)
        tv.photoAct = null; // id of the photo/mosaic being analyzed (null = live video)
        tv.photoInfo = null; // {size, pose, mosaico}
        tv.planRes = null; // ultimo /plan
        tv.photoBusy = ""; // texto mientras mueve/saca
        tv.altRes = null; // result of calibrating the second height (not saved)
        // Rediseno 2026-10-10
        tv.lib = []; // piezas guardadas (TV_PIECES_FILE)
        tv.recognized = {}; // id of the detection -> {name, rotation} from the library
        tv.follow = { on: false, ref: null, start: null, trail: [], last: null, lost: 0, liveBefore: false };
        tv.wizard = { material: false, video: false };
      }

      function tvStartHeader(tv, iv) {
        tv.root.innerHTML = "";
        iv.page = tvEl("div", "tv-page workshop-theme");
        tv.root.appendChild(iv.page);
        // ---- the page bar of the family (wf-bar): badge with the icon of the menu, title, one line that says what the page is for,
        // and on the right the state of the server, the camera and the calibration, the switch for the Workbench map and the start-up chip ----
        var hd = tvEl("div", "wf-bar tv-hd");
        iv.page.appendChild(hd);
        // start-up card (16-startup.js): redrawn when what it shows changes (see refreshEstado)
        tv.startup = tvStartupCreate(function () { return tv.state; });
        tv.startupSignature = "";
        var badge = tvEl("span", "wf-badge");
        badge.appendChild(tvIcon(TV_ICON, "wf-badge-icon"));
        hd.appendChild(badge);
        var txt = tvEl("div", "wf-bar-txt");
        var bt = tvEl("div", "wf-title", i18nT('vision.menu_caption'));
        bt.setAttribute("role", "heading"); // QA-11: the page title was a plain div (no headings in the page)
        bt.setAttribute("aria-level", "1");
        txt.appendChild(bt);
        txt.appendChild(tvEl("div", "wf-lead", i18nT('vision.measure_with_the_gantry_camera')));
        hd.appendChild(txt);
        var right = tvEl("div", "wf-bar-right");
        hd.appendChild(right);
        tv.pills = right;
        tv.chipSrv = tvPill(tv, "server");
        tv.chipCamera = tvPill(tv, "cctv");
        tv.chipCal = tvPill(tv, "ruler-square");
        // Camera switch for the Zones map, in plain view (request
        // 2026-10-10: "I don't see that option" -- it was at the bottom of Calibrate).
        // WorkshopJog reads mapa.use / mapa.opacity from sys/workshop/config/vision.json.
        tv.btnZones = tvEl("span", "tv-toggle");
        tv.btnZones.title = i18nT('vision.puts_this_camera_s_video_under');
        // 2026-10-10: "it is not clear when it is active and when not": besides the
        // switch, the text says Yes/No and the whole button is painted.
        tv.btnZones.appendChild(tvEl("span", "sw"));
        tv.btnZones.appendChild(tvEl("span", null, i18nT('vision.in_work_zones')));
        tv.btnZonasEst = tvEl("b", "est", i18nT('vision.no'));
        tv.btnZones.appendChild(tv.btnZonasEst);
        tv.btnZones.addEventListener("click", function () {
          var on = !(tv.cfg.map && tv.cfg.map.use);
          tvCfgSave(tv, function (o) { o.map = Object.assign({}, o.map || {}, { use: on }); return o; }).then(
            function () { tvPaintZones(tv); tvFlash(tv, on ? i18nT('vision.on_in_zones_tap_the_map') : i18nT('vision.no_longer_used_in_work_zones'), true); },
            function (e) { tvFlash(tv, e.message, false); }
          );
        });
        right.appendChild(tv.btnZones);
        // the start-up chip is the last thing of the header row, on the right, as in every other page (PageHeader slot "startup")
        right.appendChild(tv.startup.el);
      }

      function tvStartBody(tv, iv) {
        // Redesign 2026-10-10 ("something better and more advanced"): instead of 3
        // tabs with everything in accordions, a sidebar with sections
        // in three groups (like Workbench); the image is the same for
        // all the measuring ones.
        var body = tvEl("div", "tv-body");
        iv.page.appendChild(body);
        tv.nav = tvEl("nav", "tv-nav");
        body.appendChild(tv.nav);
        tv.tabButtons = {};
        tv.main = tvEl("div", "tv-main");
        body.appendChild(tv.main);
        tv.left = tvEl("div", "tv-left");
        tv.side = tvEl("div", "tv-side");
        tv.main.appendChild(tv.left);
        tv.main.appendChild(tv.side);
        // ---- image + SVG layer (with zoom), work bar and data line ----
        // 2026-10-11 ("arrange all the function buttons", with the Workbench
        // bar as a reference): before there was a bar on top and two below
        // with another style; now ONE work bar under the image, inside the
        // frame (see renderBars), and below it the image's data.
        tv.stage = tvEl("div", "tv-stage");
        tv.left.appendChild(tv.stage);
        tv.zbox = tvEl("div", "tv-zbox");
        tv.stage.appendChild(tv.zbox);
        // 2026-10-11 ("the camera takes a while, a spinner shows only in the camera area and
        // when there is an image everything gets bigger"): until the image arrives,
        // the box already has the shape of the last one (or 4:3) and the final width
        tv.dimPrev = tv.prefs.dim && tv.prefs.dim[0] > 0 && tv.prefs.dim[1] > 0 ? tv.prefs.dim : [4, 3];
        tv.zbox.style.aspectRatio = tv.dimPrev[0] + " / " + tv.dimPrev[1];
        tv.img = document.createElement("img");
        tv.img.alt = "";
        tv.img.draggable = false;
        tv.zbox.appendChild(tv.img);
        tv.svg = tvSvg("svg", { preserveAspectRatio: "none" }, tv.zbox);
        tv.empty = tvEl("div", "tv-empty");
        tv.stage.appendChild(tv.empty);
        tvSetEmpty(tv, i18nT('vision.loading_image'), "camera-iris");
        tv.ovTL = tvEl("div", "tv-ov tl");
        var ovTR = tvEl("div", "tv-ov tr");
        tv.ovBL = tvEl("div", "tv-ov bl");
        tv.ovBR = tvEl("div", "tv-ov br");
        [tv.ovTL, ovTR, tv.ovBL, tv.ovBR].forEach(function (o) { tv.stage.appendChild(o); });
        // top right: machine X / Y under the mouse
        tv.cursorEl = tvEl("span", "tv-glass tv-cursor");
        tv.cursorEl.style.display = "none";
        ovTR.appendChild(tv.cursorEl);
        // right: move the camera (Move tool)
        tv.pad = tvEl("div", "tv-glass tv-pad");
        tv.pad.style.display = "none";
        tv.stage.appendChild(tv.pad);
        // below the image (2026-10-11): the work bar and, as a status line,
        // the image's data (as in Workbench)
        tv.dock = tvEl("div", "tv-dock");
        tv.left.appendChild(tv.dock);
        tv.info = tvEl("div", "tv-info");
        tv.left.appendChild(tv.info);
        // the small menu that a bar button opens (one at a time)
        tv.dpop = tvEl("div", "tv-dpop");
        tv.dpop.addEventListener("click", function (ev) { ev.stopPropagation(); });
        tv.left.appendChild(tv.dpop);
      }

      function tvStartImage(tv, iv) {
        var im = {};
        tv.objUrl = null;
        tv.img.addEventListener("load", function () {
          tv.view.w = tv.img.naturalWidth;
          tv.view.h = tv.img.naturalHeight;
          tv.zbox.style.aspectRatio = "";
          if (!tv.prefs.dim || tv.prefs.dim[0] !== tv.view.w || tv.prefs.dim[1] !== tv.view.h) {
            tv.prefs.dim = [tv.view.w, tv.view.h];
            tvSavePrefs(tv.prefs);
          }
          // With a wide screen (or browser zoom out) the image does not
          // exceed the window height: what is left over in width goes to the panel
          // on the right (before the page had a cap of 1800 px and did not
          // rearrange when zooming out).
          var otraMedida = tv.view.w !== tv.zoomDim[0] || tv.view.h !== tv.zoomDim[1];
          tv.zoomDim = [tv.view.w, tv.view.h];
          tvAdjustWidth(tv);
          if (otraMedida) tvZoomA(tv, 1);
          tv.svg.setAttribute("viewBox", "0 0 " + tv.view.w + " " + tv.view.h);
          tv.empty.style.display = "none";
          tvDraw(tv);
        });
        tv.img.addEventListener("error", function () {
          tvSetEmpty(tv, i18nT('vision.no_image_from_the_vision_service_port', { port: TV_PORT }));
        });
        // ---- zoom and pan of the image (2026-10-10) ----
        // Mouse wheel or pinch = zoom where the pointer is; with View and
        // zoom, dragging moves the image (in Measure / Area / Zone dragging
        // stays with the tool; wheel or pinch still work).
        tv.zoom = { s: 1, x: 0, y: 0 };
        tv.zoomDim = [0, 0];
        tv.zoomN = null; // the % in the work bar (name of the whole-image button)
        tvStartPointers(tv, im, iv);
      }


      function tvStartEditing(tv, iv) {
        var ed = {};
        // ---- move the camera from the image (2026-10-10: "in Vision the camera
        // cannot be moved like in Zones") ----
        // Move tool: arrows = one step (laser off), More area / More
        // detail = raises / lowers the bridge, tapping the image = choose a point and
        // Center there (double tap, level 2), Back = to where it was. All through
        // sys/workshop/macros/visionpose.g (Z goes up first, S0, never below Z40).
        tv.TV_STEPS = [1, 10, 50];
        tv.TV_ZMIN = 40;
        tv.movTarget = null, // { px: [u, v] de la camara, mm: [x, y] }
          tv.movStart = null, // { x, y, z } before the first move from here
          tv.movBusy = false,
          tv.padMsg = "",
          tv.padPos = null,
          tv.padSeen = false,
          tv.padWithAxes = false,
          tv.padRefresh = false;
        // ---- interaction on the image ----
        tv.roiDrag = null;
        tvStartDrag(tv, ed, iv);
      }


      function tvStartDock(tv, iv) {
        // ---- viewer work bar ----
        // 2026-10-11 ("arrange all the function buttons ... Workbench as a
        // reference"): ONE bar under the image, with the format of the
        // one in Workbench (icon on top, short name below, blocks of the
        // same function together):
        //   tools (what a tap on the image does) |
        //   zoom and view (View = menu with which image to show and rotating it) |
        //   Search (menu), Head, Live (amber while it runs) and Analyze |
        //   Save, Settings (menu) and Full screen.
        // The menus open upward from their button and close when tapping
        // outside or with Esc. Over the image remain: where it comes from (bottom
        // left, with View live), mouse X / Y (top right) and the
        // Move panel. In Calibrate: zoom, View, Refresh and the block at the end.
        tv.TV_TOOL = [
          ["see", i18nT('vision.view'), "cursor-default-click-outline", i18nT('vision.tap_a_detection_to_see_its')],
          ["measure", i18nT('vision.measure'), "ruler", i18nT('vision.two_points_distance_dx_dy_and')],
          ["area", i18nT('vision.area'), "vector-polygon", i18nT('vision.several_points_area_and_perimeter_in')],
          ["roi", i18nT('vision.zone'), "selection-drag", i18nT('vision.drag_a_rectangle_only_the_inside')],
          ["move", i18nT('vision.move'), "cursor-move", i18nT('vision.moves_the_camera_arrows_more_area')],
        ];
        // which image to show (before a dropdown list in the top bar)
        tv.TV_VIEWS = [["camera", i18nT('vision.camera_group')], ["edges", i18nT('vision.edges_canny')], ["threshold", i18nT('vision.black_white_part')], ["up", i18nT('vision.from_above_corrected')]];
        // -- bar menus (one at a time, in dpop) --
        tv.popKey = null, // "vista" / "buscar" / "settings"
          tv.popBuild = null,
          tv.dockButtons = {}; // menu key -> its button (the bar is redone often)
        document.addEventListener("pointerdown", tzBind(tvPopOutside, tv), true);
        // names on the buttons: automatic = with names if the bar fits in
        // a row; if not, only icons; if not even then, with names (two rows anyway)
        tv.namesWidth = -1;
        tv.dockRO = window.ResizeObserver
          ? new ResizeObserver(function () {
              tvDockNames(tv, false);
              tvPopPlace(tv);
            })
          : null;
        if (tv.dockRO) tv.dockRO.observe(tv.dock);
      }

      function tvStartRest(tv, iv) {
        // ---- cut by registration (2026-10-10, feature 3) ----
        // Two marks of the piece (circles, ArUco marks, corners or detected
        // holes) with their known position in the DESIGN. With that: where
        // the design's 0,0 lies on the machine and how much the piece is rotated.
        // It is applied as the zone's origin (Zones editor, you save) and,
        // if it is rotated, with G68 (RRF's coordinate rotation) around the
        // 0,0 of the active zone; G69 removes it.
        tv.regM = { a: null, b: null }; // [x, y] de maquina de cada marca
        // ---- antes y despues (2026-10-10, funcion 4; dsf/comparar.py) ----
        tv.beforeInfo = null; // {ts, pose} of the before photo (in the service)
        tv.compRes = null; // ultimo /comparar
        tv.beforeRequest = false;
        // ---- measurement photo: the camera goes on the BRIDGE ----
        // Raising Z enlarges what it sees (fewer px/mm); Y centers it. The service
        // computes the lowest Z that frames what was asked (/plan); here it moves
        // with sys/workshop/macros/visionpose.g (double tap) and the photo is taken (/foto).
        tv.TV_COVER = [
          ["zone", i18nT('vision.active_zone')],
          ["area", i18nT('vision.cutting_area_active_mode')],
          ["bed", i18nT('vision.whole_bed')],
          ["rect", i18nT('vision.rectangle_x_y_by_hand')],
        ];
        tv.zoneSizes = {};
        tvFileGet("0:/sys/workshop/config/zone-sizes.json").then(function (t) {
          try { tv.zoneSizes = t ? JSON.parse(t) : {}; } catch (e) { tv.zoneSizes = {}; }
        }, function () {});
        tv.izConfirmUntil = 0; // "Go to Z" with a still live job: window of the second double tap
        tv.filterKind = null; // type being looked at in the list (null = all)
        // ---- hoja A4 ----
        tv.TV_SHEETS = { a4: ["A4", 210, 297], letter: [i18nT('vision.letter'), 215.9, 279.4], other: [i18nT('vision.other_size'), null, null] };
        // ---- automatic calibration with laser crosses (service job) ----
        tv.crosses = { st: null, macros: null, timer: null };
        // ---- pestana Ajustes ----
        tv.tvFireLast = null; // ultimo /fuego/estado (in_job: pide confirmar cambios)
        // ---- service state ----
        // cfgCache: the periodic review (every 4 s) rereads vision.json only every
        // TV_CFG_RELEER_MS (each reading is served by DuetWebServer); the other
        // calls (after saving, on opening) always read it.
        tv.cfgRead = 0;
        tv.TV_CFG_REREAD_MS = 30000;
        window.addEventListener("keydown", tzBind(tvOnKey, tv));
        tvPaintNav(tv);
        tvLoadLib(tv);
        tvRenderAll(tv);
        tvAdjustWidth(tv); // the final width from the start (no jump when the image arrives)
        tvRefreshState(tv).then(function () {
          tvRenderAll(tv);
          if (tv.prefs.openLive && tvModeMeasure(tv)) return tvSetLive(tv, true);
          return tvAnalyze(tv);
        });
        // only with the page in view: DWC keeps it alive (keep-alive) when going to another
        tv.timers.push(setInterval(function () { if (workshopPageVisible(tv.root)) tvRefreshState(tv, true); }, 4000));
      }

      function tvStartDrag(tv, ed, iv) {
        tv.svg.addEventListener("pointerdown", function (ev) {
          var p = tvEvPoint(tv, ev);
          if (!p) return;
          if (tv.tab === "calibrate") {
            if (!tvPointsOpen(tv) || tv.calSel < 0 || !tv.calPts[tv.calSel]) return;
            var c = tvFromView(tv, p);
            if (!c) return;
            tv.calPts[tv.calSel].u = c[0];
            tv.calPts[tv.calSel].v = c[1];
            tv.calPts[tv.calSel].size = tv.res ? tv.res.size : [tv.view.w, tv.view.h];
            tvRenderSide(tv);
            tvDraw(tv);
            return;
          }
          if (tvPadVisible(tv)) {
            var c4 = tvFromView(tv, p);
            var m4 = c4 && tvPxToMm(tv, c4);
            if (!m4) {
              tv.padMsg = i18nT('vision.without_calibration_it_isn_t_known');
              tvRenderPad(tv);
              return;
            }
            tv.movTarget = { px: c4, mm: m4 };
            tv.padMsg = "";
            tvRenderPad(tv);
            tvDraw(tv);
            return;
          }
          if (tv.prefs.tool === "roi") {
            tv.roiDrag = { a: p, b: p };
            tv.svg.setPointerCapture(ev.pointerId);
            tvDraw(tv);
            return;
          }
          if (tv.prefs.tool === "measure" || tv.prefs.tool === "area") {
            var c2 = tvFromView(tv, p);
            if (!c2) return;
            if (tv.prefs.tool === "measure" && tv.meas.length >= 2) tv.meas = [];
            if (tv.prefs.tool === "area" && tv.meas.length > 2) {
              var f = tvToView(tv, tv.meas[0].px);
              if (tvDist(f, p) < 12 * (tv.view.w / Math.max(1, tv.svg.clientWidth))) {
                tv.meas.closed = true;
                tvUpdateInfo(tv);
                tvDraw(tv);
                return;
              }
              if (tv.meas.closed) tv.meas = [];
            }
            tv.meas.push({ px: c2 });
            tvUpdateInfo(tv);
            tvDraw(tv);
            return;
          }
        });
        // Deselect: click on the background (not on pointerdown: redrawing there
        // would delete the element before its click reaches it)
        tv.svg.addEventListener("click", function (ev) {
          if (ev.target === tv.svg && tv.prefs.tool === "see" && tvModeMeasure(tv) && tv.sel) tvSelect(tv, null);
        });
        tv.svg.addEventListener("pointermove", function (ev) {
          if (!tv.roiDrag) return;
          var p = tvEvPoint(tv, ev);
          if (p) tv.roiDrag.b = p;
          tvDraw(tv);
        });
        tv.svg.addEventListener("pointerup", function () {
          if (!tv.roiDrag) return;
          var a = tv.roiDrag.a, b = tv.roiDrag.b;
          tv.roiDrag = null;
          if (Math.abs(b[0] - a[0]) > 8 && Math.abs(b[1] - a[1]) > 8) {
            var corners = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(tzBind(tvFromView, tv));
            tv.roi = corners.some(function (c) { return !c; }) ? null : corners;
            if (tv.roi) tvAnalyze(tv);
          }
          tvDraw(tv);
          tvRenderBars(tv);
        });
        // Seguimiento del cabezal (2026-10-10, funcion 6; GET /cabezal)
        tv.cab = null,
          tv.cabTrail = [],
          tv.cabTimer = null;
        setTimeout(tzBind(tvRequestHead, tv), 1500); // si quedo prendido de antes
      }

      function tvStartPointers(tv, im, iv) {
        tv.pointers = {},
          tv.panG = null,
          tv.pinchG = null,
          tv.swallowClick = false;
        tv.stage.addEventListener(
          "wheel",
          function (ev) {
            if (ev.ctrlKey || ev.metaKey || !tv.view.w || tv.pad.contains(ev.target)) return; // Ctrl+rueda = zoom de Chrome
            ev.preventDefault();
            var r = tv.stage.getBoundingClientRect();
            tvZoomA(tv, tv.zoom.s * (ev.deltaY < 0 ? 1.25 : 0.8), ev.clientX - r.left, ev.clientY - r.top);
          },
          { passive: false }
        );
        tv.svg.addEventListener(
          "pointerdown",
          function (ev) {
            tv.swallowClick = false;
            tv.pointers[ev.pointerId] = [ev.clientX, ev.clientY];
            var ids = Object.keys(tv.pointers);
            if (ids.length === 2) {
              var a = tv.pointers[ids[0]],
                b = tv.pointers[ids[1]];
              tv.pinchG = { d0: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, s0: tv.zoom.s };
              tv.panG = null;
              tv.roiDrag = null;
              ev.stopImmediatePropagation(); // el segundo dedo no es un punto de Medir
              return;
            }
            if (tv.zoom.s > 1 && ((tv.prefs.tool === "see" && tv.tab !== "calibrate") || ev.button === 1)) tv.panG = { x0: ev.clientX, y0: ev.clientY, zx: tv.zoom.x, zy: tv.zoom.y, moved: false, id: ev.pointerId };
          },
          true
        );
        tv.svg.addEventListener("pointermove", function (ev) {
          if (tv.pointers[ev.pointerId]) tv.pointers[ev.pointerId] = [ev.clientX, ev.clientY];
          if (tv.pinchG) {
            var ids = Object.keys(tv.pointers);
            if (ids.length < 2) return;
            var a = tv.pointers[ids[0]],
              b = tv.pointers[ids[1]];
            var r = tv.stage.getBoundingClientRect();
            tvZoomA(tv, (tv.pinchG.s0 * (Math.hypot(b[0] - a[0], b[1] - a[1]) || 1)) / tv.pinchG.d0, (a[0] + b[0]) / 2 - r.left, (a[1] + b[1]) / 2 - r.top);
            return;
          }
          if (tv.panG) {
            var dx = ev.clientX - tv.panG.x0,
              dy = ev.clientY - tv.panG.y0;
            if (!tv.panG.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
            if (!tv.panG.moved) {
              tv.panG.moved = true;
              try { tv.svg.setPointerCapture(ev.pointerId); } catch (e) { /* no critico */ }
              tv.stage.classList.add("panning");
            }
            tv.zoom.x = tv.panG.zx + dx;
            tv.zoom.y = tv.panG.zy + dy;
            tvZoomApply(tv, false);
            return;
          }
          tvCursorShow(tv, ev);
        });
        tv.svg.addEventListener("pointerup", tzBind(tvEndPointer, tv));
        tv.svg.addEventListener("pointercancel", tzBind(tvEndPointer, tv));
        tv.svg.addEventListener("pointerleave", function () { tv.cursorEl.style.display = "none"; });
        // after dragging or pinching the detection below is not chosen
        tv.svg.addEventListener(
          "click",
          function (ev) {
            if (!tv.swallowClick) return;
            tv.swallowClick = false;
            ev.stopPropagation();
          },
          true
        );
        document.addEventListener("fullscreenchange", tzBind(tvOnFs, tv));
        window.addEventListener("resize", tzBind(tvOnResize, tv));
        tv.stageRO = window.ResizeObserver ? new ResizeObserver(function () { tvZoomApply(tv, false); }) : null;
        if (tv.stageRO) tv.stageRO.observe(tv.stage);
      }
