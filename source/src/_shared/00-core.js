      var DRAG_THRESHOLD_PX = 6;
      var MARGIN = 8;

      // It is set to true if it is detected that the plugin was stopped by
      // hand from DWC -> Plugins (see checkPluginStillEnabled further
      // down). Once true, no element is created again --
      // the same as if the chunk had never been loaded.
      var pluginStopped = false;

      // The Pi's touch screen opens DWC at http://localhost (kiosk).
      // What only makes sense there (e.g. blocking finger zoom)
      // is not applied in other browsers.
      function workshopIsKiosk() {
        var h = location.hostname;
        return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
      }

      // Kiosk without page zoom with the fingers (2026-10-12: "sliding with one
      // finger zooms"). touch-action on <html>: the browser only scrolls
      // (one finger, horizontal or vertical) and does no pinch or double-tap
      // zoom anywhere on the page. What handles its own gestures
      // (Zones map, charts, jog knob) already has touch-action:none
      // and stays the same. Only on the kiosk: on the phone zooming in is still
      // possible. It complements Chromium's --disable-pinch option
      // (WorkshopService/kiosk/chromium-no-zoom), which needs root on the Pi.
      function workshopKioskWithoutZoom() {
        if (!workshopIsKiosk()) return;
        try {
          document.documentElement.style.touchAction = "pan-x pan-y";
        } catch (e) {
          /* no critico */
        }
      }
      workshopKioskWithoutZoom();

      // Message of a generated G-code file (abort / M291 / M118 / echo) in both
      // languages: the board picks it when the file runs, like the workshop macros
      // (global.workshopLanguage == "en", sys/workshop/macros/language.g; otherwise
      // Spanish). Returns the RRF expression {...} that goes after abort, P or S.
      function workshopGcodeText(es, en) {
        var q = function (s) { return '"' + String(s).replace(/"/g, "''") + '"'; };
        return '{(exists(global.workshopLanguage) && global.workshopLanguage == "en") ? ' + q(en) + " : " + q(es) + "}";
      }

      // ---- Risk notices (request 2026-10-10: "warnings and
      // confirmations are missing"; all functions on, warning EVERY time) ----
      // Everything the plugins send goes through postCode or machine/sendCode
      // (wrapped below): if the command is in this table, before sending it
      // a notice with the risk and Continue / Cancel is shown. What already
      // has its own explanatory notice (Move the camera / visionpose.g,
      // no-limits jog, Shut down now, Restart everything) is not here. STOP,
      // E-STOP (M112) and the jog are never held back.
      // Paths (2026-10-12, motion audit finding 4): it is detected by the file NAME in any of its folders
      // (sys/workshop/macros, sys/workshop/gcodes, gcodes/Workshop). Test:
      // node tests/risks.test.js (each real macro of the sd/ with its notice).
      function workshopReMacro(names) {
        return new RegExp("(?:^|[/\"\\s])(?:" + names.join("|") + ")\\.g(?![\\w.-])", "i");
      }
      function workshopReJob(names) {
        return new RegExp("M32\\s+\"?(?:0:)?/?(?:sys/workshop/gcodes|gcodes/Workshop)/(?:" + names.join("|") + ")\\.gcode", "i");
      }
      var WORKSHOP_RISKS = [
        { re: /workzeroaxis\.g"\s+A2/i, title: i18nT('core.lower_z_to_the_work_zero'), text: i18nT('core.the_tool_goes_down_to_the') },
        { re: workshopReJob(["frame-area-laser", "cuts", "laser-mark", "probe-offset", "big-part-marks", "big-part-piece"]), title: i18nT('core.job_with_the_laser_on'), text: i18nT('core.the_machine_turns_the_laser_on') },
        { re: workshopReJob(["mesh-zone"]), title: i18nT('core.measure_the_bed_mesh'), text: i18nT('core.the_probe_bltouch_deploys_and_z') },
        { re: workshopReMacro(["zprobepoint", "focushere", "laserfocus", "zcal-probe", "zcal-szp", "probedeploy", "homezhere"]), title: i18nT('core.measure_with_the_probe'), text: i18nT('core.the_probe_bltouch_deploys_and_z_2') },
        { re: workshopReMacro(["handfree"]), level: 4, notices: [
            i18nT('core.x_and_y_are_left_without'),
            i18nT('core.move_the_head_by_hand_slowly'),
            i18nT('core.while_they_re_released_don_t'),
            i18nT('core.when_capturing_the_machine_gets_power'),
          ], title: i18nT('core.release_the_x_and_y_motors'), text: i18nT('core.x_and_y_are_left_without_2') },
        // Releasing motors by hand (M18 / M84, with or without axes): level 4 (decision 2026-10-12). The Motors Enable
        // page brings its own level 4 (API motors.disable): it does not go through here.
        { re: /^\s*M(?:18|84)(?![0-9.])/i, level: 4, notices: [
            i18nT('core.the_motors_have_no_force_and'),
            i18nT('core.a_vertical_axis_z_can_fall'),
            i18nT('core.while_released_do_not_use_the'),
            i18nT('core.to_stop_it_m17_or_a'),
          ], title: i18nT('core.release_the_motors'), text: i18nT('core.the_motors_lose_their_holding_force') },
        { re: workshopReMacro(["handcorner"]), title: i18nT('core.find_the_endstops'), text: i18nT('core.x_and_y_travel_by_themselves') },
        { re: workshopReMacro(["step-ceiling"]), title: i18nT('core.motor_pulse_test'), text: i18nT('core.the_axis_moves_back_and_forth') },
        { re: workshopReMacro(["axis-test"]), title: i18nT('core.axis_test'), text: i18nT('core.the_axis_moves_by_itself_to') },
        { re: /^\s*M906\s+I100\b/i, title: i18nT('core.motor_at_full_current'), text: i18nT('core.the_motor_stays_at_full_current') },
        { re: /\/macros\/laser\/(?!air)[^"]+\.g/i, title: i18nT('core.measure_and_focus'), text: i18nT('core.the_probe_bltouch_goes_down_until') },
        { re: /^\s*M999\b/i, title: i18nT('core.restart_the_board'), text: i18nT('core.the_duet_restarts_whatever_it_is') },
      ];

      function workshopRisk(code) {
        var c = String(code || "");
        for (var i = 0; i < WORKSHOP_RISKS.length; i++) if (WORKSHOP_RISKS[i].re.test(c)) return WORKSHOP_RISKS[i];
        return null;
      }

      // The sentence of a confirmation that arrived without a text (a service answering "confirm" with no reason): what is being confirmed.
      // A plugin start / stop (PluginManager, DSF codes) says it can restart DWC's web server for about a minute.
      function workshopConfirmDetail(what) {
        var w = String(what || "").trim();
        if (/(?:start|stop)Plugin|\bM75[0-3]\b|PluginManager|\bplugin\b/i.test(w)) {
          var m = w.match(/Workshop[A-Za-z0-9]+/);
          return i18nT('core.plugin_start_notice', { name: m ? m[0] : w.replace(/^.*?(["'])(.+?)\1.*$/, "$2") });
        }
        return w ? i18nT('core.confirm_what', { what: w }) : i18nT('core.confirm_generic');
      }

      // Modal notice (dark panel, DESIGN.md; light with the light theme, 03-theme.js). Promise: true = continue.
      // r.title / r.text arrive already translated (i18nT where the risk is defined)
      function workshopConfirmRisk(r) {
        return new Promise(function (resolve) {
          var background = document.createElement("div");
          background.setAttribute("data-tp-panel", "1"); // tema claro (03-theme.js)
          background.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;";
          var box = document.createElement("div");
          box.setAttribute("role", "alertdialog");
          // same look as the dialogs of DWC (the plugin install wizard): flat dark card, 20 px title, text buttons
          box.style.cssText = "background:#1e1e1e;color:rgba(255,255,255,0.87);border-left:4px solid #e65100;border-radius:4px;max-width:500px;width:100%;padding:16px 24px;font-size:14px;line-height:1.5;box-shadow:0 11px 15px -7px rgba(0,0,0,0.2),0 24px 38px 3px rgba(0,0,0,0.14),0 9px 46px 8px rgba(0,0,0,0.12);";
          var h = document.createElement("div");
          h.style.cssText = "font-size:20px;font-weight:500;line-height:1.6;color:#fff;margin-bottom:8px;";
          h.textContent = r.title;
          var p = document.createElement("div");
          p.textContent = r.text || workshopConfirmDetail(r.what || r.title);
          var row = document.createElement("div");
          row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px;";
          var bc = document.createElement("button");
          bc.type = "button";
          bc.textContent = i18nT('core.cancel');
          bc.style.cssText = "background:transparent;color:#2196f3;border:0;border-radius:4px;padding:6px 12px;min-height:36px;font-size:14px;font-weight:500;cursor:pointer;";
          var bo = document.createElement("button");
          bo.type = "button";
          bo.textContent = i18nT('core.understood_continue');
          bo.style.cssText = "background:transparent;color:#ff9800;border:0;border-radius:4px;padding:6px 12px;min-height:36px;font-size:14px;font-weight:600;cursor:pointer;";
          function end(v) {
            document.removeEventListener("keydown", tecla, true);
            if (background.parentNode) background.parentNode.removeChild(background);
            resolve(v);
          }
          function tecla(ev) {
            if (ev.key === "Escape") end(false);
          }
          bc.addEventListener("click", function () { end(false); });
          bo.addEventListener("click", function () { end(true); });
          background.addEventListener("click", function (ev) { if (ev.target === background) end(false); });
          document.addEventListener("keydown", tecla, true);
          row.appendChild(bc);
          row.appendChild(bo);
          box.appendChild(h);
          box.appendChild(p);
          box.appendChild(row);
          background.appendChild(box);
          (document.fullscreenElement || document.body).appendChild(background); // visible tambien en pantalla completa (Mesa de trabajo)
        });
      }

      // null = can be sent; Error = the user cancelled
      function workshopBeforeOfSend(code) {
        var r = workshopRisk(code);
        if (!r) return Promise.resolve(null);
        // nivel 4 (DESIGN.md): cartel rojo con avisos y casilla (04-warnings.js)
        var conf = r.level === 4 && typeof workshopConfirmLevel4 === "function"
          ? workshopConfirmLevel4({ title: r.title, notices: r.notices || [r.text], understood: i18nT('core.understood_i_will_do_it_carefully'), button: i18nT('core.continue') })
          : workshopConfirmRisk(r);
        return conf.then(function (ok) {
          return ok ? null : new Error(i18nT('core.cancelled_title', { title: r.title }));
        });
      }

      // ---- Plugin Ids (English, "Workshop*": Duet3D asks for repo = Id) ----
      var WORKSHOP_IDS = {
        service: ["WorkshopService"],
        rs485: ["WorkshopRS485"],
        jog: ["WorkshopJog"],
        bar: ["WorkshopControlBar"],
        camera: ["WorkshopCamera"],
        consumption: ["WorkshopPower"],
        motors: ["WorkshopMotors"],
        activity: ["WorkshopActivity"],
        health: ["WorkshopPiHealth"],
        lights: ["WorkshopLights"],
        vision: ["WorkshopVision"],
        printing: ["WorkshopPrinting"],
      };
      var WORKSHOP_ID_KEY = {}; // Id -> key
      Object.keys(WORKSHOP_IDS).forEach(function (k) {
        WORKSHOP_IDS[k].forEach(function (id) { WORKSHOP_ID_KEY[id] = k; });
      });
      // plugins = Map of DWC's model or the object of /machine/status
      function workshopPluginOf(plugins, key) {
        var ids = WORKSHOP_IDS[key] || [key];
        for (var i = 0; plugins && i < ids.length; i++) {
          var p = typeof plugins.get === "function" ? plugins.get(ids[i]) : plugins[ids[i]];
          if (p) return p;
        }
        return null;
      }
      function workshopPluginsModel() {
        return workshopHostPluginsModel();
      }
      // The `data` of a plugin of DWC's live model as a plain object. DWC 3.6 keeps it as an object; DWC 3.7 (objectmodel 3.7) keeps it
      // as a Map, so `p.data.statusIndicator` is undefined there and every read must go through here. A copy made with
      // workshopMapJson (01-dwc-state.js) already holds an object. null when the plugin has no data.
      function workshopPluginData(p) {
        var d = p && p.data;
        if (!d || typeof d !== "object") return null;
        if (typeof Map !== "undefined" && d instanceof Map) {
          var o = {};
          d.forEach(function (v, k) {
            o[k] = v;
          });
          return o;
        }
        return d;
      }
      // the installed Id of that key (without data: the new one)
      function workshopIdInstalled(key) {
        var ids = WORKSHOP_IDS[key] || [key];
        var pl = workshopPluginsModel();
        for (var i = 0; pl && i < ids.length; i++) if (typeof pl.get === "function" ? pl.get(ids[i]) : pl[ids[i]]) return ids[i];
        return ids[0];
      }
      // Reads "plugins.<Id>.data.x" (or another path) in a state
      function workshopReadPath(root, path) {
        var v = root;
        var parts = String(path || "").split(".");
        for (var k = 0; k < parts.length; k++) {
          if (v === null || v === undefined) return undefined;
          if (k === 1 && parts[0] === "plugins" && WORKSHOP_ID_KEY[parts[1]]) v = workshopPluginOf(v, WORKSHOP_ID_KEY[parts[1]]);
          else if (typeof Map !== "undefined" && v instanceof Map) v = v.get(parts[k]);
          else v = v[parts[k]];
        }
        return v;
      }

      // DWC keeps the session inside its connector and sends it with every request
      // (X-Session-Key): it is taken from there so that the endpoint sees it when DWC
      // has a password (the endpoint rejects without a session in that case).
      (function tallerCapturarSesion() {
        if (window.__workshopSessionHook || typeof XMLHttpRequest === "undefined") return;
        window.__workshopSessionHook = true;
        var orig = XMLHttpRequest.prototype.setRequestHeader;
        XMLHttpRequest.prototype.setRequestHeader = function (k, v) {
          if (String(k).toLowerCase() === "x-session-key" && v) window.__workshopSession = String(v);
          return orig.apply(this, arguments);
        };
      })();

      // ---- Single owner of the movement before a moving G-code (2026-10-13) ----
      // postCode asks WorkshopService (motion.ask, 01-api.js) before sending a
      // G-code that moves the machine or changes its geometry: denied -> the
      // promise rejects with the reason; "confirm" -> the person is asked first.
      // STOP / E-STOP / M112 / M25 never go through here as moves.
      var WORKSHOP_MOVES = /^\s*(?:G0|G1|G2|G3|G28|G29|G30|G32|G38(?:\.\d)?)(?![0-9])/im;
      var WORKSHOP_MOVES_MACRO = workshopReMacro([
        "visionpose", "framecutarea", "framerect", "gotobed", "handcorner", "workzero", "workzeroaxis", "laserfocus",
        "focushere", "homezhere", "zprobepoint", "zcal-goto", "zcal-mark", "zcal-probe", "zcal-szp", "probedeploy",
        "probeoffsetmark", "lasermark", "meshzone", "axis-test", "axis-move", "axis-touch", "axis-probe", "axis-limits",
        "step-ceiling", "crash-cal",
      ]);
      var WORKSHOP_GEOMETRY = /^\s*(?:G10\s+L2|G5[4-9](?:\.\d)?(?![0-9])|M18(?![0-9.])|M84(?![0-9.])|M564(?![0-9])|M350(?![0-9])|M92(?![0-9]))/im;
      var WORKSHOP_GEOMETRY_MACRO = workshopReMacro(["laseroffset", "saveworkplace", "workplaces", "wpload", "handfree", "selectlaser", "selectcnc", "selectfff"]);
      function workshopClassMotion(code) {
        var c = String(code || "");
        if (/^\s*M112\b/im.test(c)) return null;
        if (/^\s*M32(?![0-9])/im.test(c)) return "job";
        if (WORKSHOP_GEOMETRY.test(c) || WORKSHOP_GEOMETRY_MACRO.test(c)) return "geometry";
        if (WORKSHOP_MOVES.test(c) || WORKSHOP_MOVES_MACRO.test(c) || /\/macros\/laser\/(?!air)[^"]+\.g/i.test(c)) return "move";
        return null;
      }
      // null = it may be sent; Error = denied or cancelled
      function workshopBeforeOfMove(code) {
        var clase = workshopClassMotion(code);
        if (!clase || typeof workshopRequestMotion !== "function") return Promise.resolve(null);
        return workshopRequestMotion(typeof PLUGIN_ID === "string" ? PLUGIN_ID : "", clase, String(code).split("\n")[0].slice(0, 80)).then(
          function (ok) {
            return ok ? null : new Error(workshopApiT("cancelled"));
          },
          function (e) {
            return e instanceof Error ? e : new Error(String(e));
          }
        );
      }

      // G-code to the board (POST /machine/code). Before: the risk dialog
      // (WORKSHOP_RISKS) and the owner of the movement (workshopBeforeOfMove).
      // The calls to the workshop services go through workshopApi (01-api.js).
      function postCode(code) {
        return workshopBeforeOfSend(code)
          .then(function (cancelled) {
            if (cancelled) throw cancelled;
            return workshopBeforeOfMove(code);
          })
          .then(function (no) {
            if (no) throw no;
            return fetch("/machine/code", {
              method: "POST",
              headers: { "Content-Type": "text/plain" },
              body: code,
            });
          });
      }

      // Risk dialog also for the G-code the Vue pages send with machine/sendCode
      // (the action of the DWC store is wrapped once). The calls to the
      // services do not go through here any more (workshop-api.js).
      workshopHostInterceptCodes(function (code, fromInput) {
        // risk notice (see WORKSHOP_RISKS): only what comes from the workshop plugins, not DWC's console (typed by hand;
        // DWC 3.7 does not tell the origin, so there the console is asked too)
        // fail closed: if the dialog itself breaks for a risky code, the code is cancelled instead of going out unasked
        if (!fromInput && workshopRisk(code)) {
          try {
            return workshopBeforeOfSend(code).catch(function (e) {
              return e instanceof Error ? e : new Error(String(e));
            });
          } catch (e) {
            return Promise.resolve(e instanceof Error ? e : new Error(String(e)));
          }
        }
        return null;
      });

      // If max < min (a panel TALLER/WIDER than the window, e.g. the jog
      // with the Advanced tab open on a short screen) min wins --
      // before max won, which in that case is NEGATIVE, and the panel ended up
      // with top < 0: the title bar (with the minimize button) went
      // above the screen, unreachable (reported live
      // 2026-10-08). For all other uses (max >= min) it is identical.
      function clamp(value, min, max) {
        if (max < min) return min;
        return Math.min(Math.max(value, min), max);
      }

      function loadPos(key) {
        try {
          var raw = localStorage.getItem(key);
          if (!raw) return null;
          var p = JSON.parse(raw);
          if (typeof p.left === "number" && typeof p.top === "number") return p;
        } catch (e) {
          /* ignorar -- posicion por defecto */
        }
        return null;
      }

      function savePos(key, left, top) {
        try {
          localStorage.setItem(key, JSON.stringify({ left: left, top: top }));
        } catch (e) {
          /*  localStorage not available -- not critical, it is just not remembered */
        }
      }

      // Makes any `fixed` element draggable, with detection of
      // drag vs real tap. onTap() is called ONLY if the
      // pointerdown+pointerup did not move more than DRAG_THRESHOLD_PX --
      // so a panel/button can be moved without firing its action
      // by mistake. w/h are the element's width/height (for the screen
      // limits); defaultLeft/defaultTop are the initial position if there is
      // not a saved one yet.
      function makeDraggable(el, posKey, w, h, defaultLeft, defaultTop, onTap) {
        var saved = loadPos(posKey);
        var left = saved ? saved.left : defaultLeft;
        var top = saved ? saved.top : defaultTop;
        left = clamp(left, MARGIN, window.innerWidth - w - MARGIN);
        top = clamp(top, MARGIN, window.innerHeight - h - MARGIN);
        el.style.left = left + "px";
        el.style.top = top + "px";

        var dragging = false;
        var pointerId = null;
        var startX = 0;
        var startAnd = 0;
        var startLeft = 0;
        var startTop = 0;
        var moved = false;

        el.addEventListener("pointerdown", function (ev) {
          // preventDefault: prevents the tap from giving focus to the element --
          // strong suspicion that this is how the on-screen keyboard
          // (squeekboard) is triggered when closing/collapsing afterwards (confirmed live
          // 2026-10-08).
          ev.preventDefault();
          dragging = true;
          moved = false;
          pointerId = ev.pointerId;
          startX = ev.clientX;
          startAnd = ev.clientY;
          startLeft = el.offsetLeft;
          startTop = el.offsetTop;
          el.setPointerCapture(pointerId);
        });

        el.addEventListener("pointermove", function (ev) {
          if (!dragging || ev.pointerId !== pointerId) return;
          var dx = ev.clientX - startX;
          var dy = ev.clientY - startAnd;
          if (!moved && Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
            moved = true;
          }
          if (moved) {
            // The width/height are read live (not the w/h from when
            // makeDraggable was called) so that a resizable panel (see the
            // camera panel) keeps respecting the screen edges
            // after changing size.
            var newLeft = clamp(startLeft + dx, MARGIN, window.innerWidth - el.offsetWidth - MARGIN);
            var newTop = clamp(startTop + dy, MARGIN, window.innerHeight - el.offsetHeight - MARGIN);
            el.style.left = newLeft + "px";
            el.style.top = newTop + "px";
          }
        });

        function endDrag(ev) {
          if (!dragging || ev.pointerId !== pointerId) return;
          dragging = false;
          try {
            el.releasePointerCapture(pointerId);
          } catch (e) {
            /* ya liberado */
          }
          if (moved) {
            savePos(posKey, el.offsetLeft, el.offsetTop);
          } else if (onTap) {
            onTap();
          }
        }

        el.addEventListener("pointerup", endDrag);
        el.addEventListener("pointercancel", endDrag);

        window.addEventListener("resize", function () {
          // The SAVED position is re-clamped (not the current on-screen
          // position, which may already have been clamped by an earlier
          // resize) -- otherwise, when the on-screen keyboard
          // shrinks the window and then enlarges it again, the button
          // stays stuck where the first clamp left it instead of
          // returning to its place (confirmed live 2026-10-08: "when
          // it goes down they do not return to the position they were
          // in"). Always clamping from the saved position is idempotent: if the
          // window returns to its original size, the saved value already
          // fits unchanged and the button returns exactly to where it
          // was.
          var saved2 = loadPos(posKey);
          var baseLeft = saved2 ? saved2.left : defaultLeft;
          var baseTop = saved2 ? saved2.top : defaultTop;
          var l = clamp(baseLeft, MARGIN, window.innerWidth - el.offsetWidth - MARGIN);
          var t = clamp(baseTop, MARGIN, window.innerHeight - el.offsetHeight - MARGIN);
          el.style.left = l + "px";
          el.style.top = t + "px";
        });
      }
