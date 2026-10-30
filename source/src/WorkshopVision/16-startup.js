      // ---- Start-up card of Vision (2026-10-15) ----
      //
      // A person who installs Vision on THEIR machine has no calibration, maybe no camera and no vision.json yet. This card
      // (src/_shared/16-startup.js) is on the header of the page and says what is missing, in the same colours:
      //   green  = ready; orange = still to do (nothing is calibrated yet, the file is not created yet);
      //   red    = missing or broken; grey = does not apply yet (the backend does not answer, so the camera and the
      //   calibration cannot be known: never an error).
      // Rows (all checks, no example files: the macro visionpose.g is the plugin's own, sdFiles):
      //   vision.json (0:/sys/workshop/config), backend of the plugin (OpenCV, dsf/vision.py, port 8095), camera image,
      //   calibration, macro 0:/sys/workshop/macros/visionpose.g.
      // The page already reads /estado and vision.json every few seconds: the card reuses that (getEstado / getCfg) and
      // only reads the two files it needs; it is redrawn when the signature of what it shows changes. Nothing is written.

      var TV_STARTUP_MACRO = "0:/sys/workshop/macros/visionpose.g";

      // Pure: state of one row. datos = {estado: /estado (null = not read yet), cfgTexto: text of vision.json (null = does
      // not exist, undefined = could not read), macroTexto: same for the macro}.
      function tvStartupState(id, data) {
        var est = data && data.state;
        var backendVivo = !!(est && est.ok);
        if (id === "config") {
          var t = data && data.cfgText;
          if (t === undefined) return "na";
          if (t === null) return "example"; // the first calibration creates it
          try {
            JSON.parse(String(t).replace(/^﻿/, "") || "{}");
          } catch (e) {
            return "missing"; // damaged
          }
          return "configured";
        }
        if (id === "backend") return !est ? "na" : backendVivo ? "configured" : "missing";
        if (!backendVivo) return "na"; // camera and calibration come from the backend: without it nothing is known
        if (id === "camera") {
          var camera = est.camera || {};
          if (camera.ok) return (camera.control && camera.control.notice) ? "example" : "configured";
          return camera.age_s === null || camera.age_s === undefined ? "example" : "missing"; // standby / no image
        }
        if (id === "calibration") {
          if (Object.keys(est.calibs || {}).length) return "configured";
          return est.source === "map" ? "example" : "missing";
        }
        if (id === "macro") {
          var m = data && data.macroText;
          if (m === undefined) return "na";
          return m === null ? "missing" : "configured";
        }
        return "na";
      }

      // Pure: short text that changes when any row would change (the card is redrawn only then)
      function tvStartupSignature(state, cfg) {
        var ok = !!(state && state.ok);
        var camera = (ok && state.camera) || {};
        return [
          ok ? 1 : 0,
          camera.ok ? 1 : 0,
          camera.age_s === null || camera.age_s === undefined ? "n" : "e",
          camera.control && camera.control.notice ? 1 : 0,
          Object.keys((ok && state.calibs) || {}).length,
          ok ? state.source || "" : "",
          Object.keys(cfg || {}).length ? 1 : 0,
        ].join("|");
      }

      // The card for the header of the page. getEstado() / getCfg() give what the page already has.
      function tvStartupCreate(getState) {
        var read = null; // files read in this refresh, shared by the rows
        function leer() {
          if (!read) {
            var un = function (p) {
              return tvFileGet(p).catch(function () {
                return undefined; // could not read: grey, not an error
              });
            };
            read = Promise.all([un(TV_CFG_FILE), un(TV_STARTUP_MACRO)]).then(function (r) {
              return { cfgText: r[0], macroText: r[1] };
            });
          }
          return read;
        }
        function row(id, extra) {
          var def = {
            id: id,
            check: function () {
              return leer().then(function (f) {
                return tvStartupState(id, { state: getState(), cfgText: f.cfgText, macroText: f.macroText });
              });
            },
          };
          Object.keys(extra).forEach(function (k) {
            def[k] = extra[k];
          });
          return def;
        }
        var rows = [
          row("config", { label: "startup_vision.config", what: "startup_vision.config_what", why: "startup_vision.config_for", ifMissing: "startup_vision.config_missing", help: "startup_vision.config_tip", texts: { example: "startup_vision.config_new", missing: "startup_vision.config_damaged" } }),
          row("backend", { label: "startup_vision.backend", what: "startup_vision.backend_what", why: "startup_vision.backend_for", ifMissing: "startup_vision.backend_missing", help: "startup_vision.backend_tip", texts: { missing: "startup_vision.backend_off" } }),
          row("camera", { label: "startup_vision.camera", what: "startup_vision.camera_what", why: "startup_vision.camera_for", ifMissing: "startup_vision.camera_missing", help: "startup_vision.camera_tip", texts: { example: "startup_vision.camera_wait", missing: "startup_vision.camera_none" } }),
          row("calibration", { label: "startup_vision.calibration", what: "startup_vision.calibration_what", why: "startup_vision.calibration_for", ifMissing: "startup_vision.calibration_missing", help: "startup_vision.calibration_tip", texts: { example: "startup_vision.calibration_map", missing: "startup_vision.calibration_none" } }),
          row("macro", { label: "startup_vision.macro", what: "startup_vision.macro_what", why: "startup_vision.macro_for", ifMissing: "startup_vision.macro_missing", help: "startup_vision.macro_tip", texts: { missing: "startup_vision.macro_missing" } }),
        ];
        var card = workshopStartupInput({ plugin: "WorkshopVision", rows: rows }); // the chip of the header (same as the other pages); the card is in the dialog
        var refrescar = card.refresh;
        card.refresh = function () {
          read = null; // read the two files again
          return refrescar();
        };
        return card;
      }
