      // ---- Own launcher when the sidebar is NOT there ----
      //
      // The panels (jog, camera) open from the sidebar
      // (WorkshopControlBar). So that each plugin also works installed alone,
      // if the bar is not active the panel shows its own floating round button
      // (draggable, position remembered). As soon as the bar
      // appears (workshop.barraActive, see WorkshopControlBar/20-main.js) the button is
      // removed, and comes back if the bar stops.
      var WORKSHOP_FALLBACK_DELAY_MS = 4000; // DWC loads plugins one at a time: give the bar time

      function workshopFallbackLauncher(panelId, icon, title, order, toggle, isOpen) {
        var el = null;
        var ready = false;

        function remove() {
          if (el) el.remove();
          el = null;
        }

        function create() {
          el = document.createElement("div");
          el.id = "workshop-fallback-" + panelId;
          el.title = i18nT('launcher.no_workshopcontrolbar_sidebar_tap_to_open', { title: title });
          el.innerHTML =
            '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" style="pointer-events:none;display:block">' +
            icon +
            "</svg>";
          el.style.cssText = [
            "position:fixed",
            "width:44px",
            "height:44px",
            "border-radius:50%",
            "display:flex",
            "align-items:center",
            "justify-content:center",
            "color:#fff",
            "border:2px solid rgba(255,255,255,0.6)",
            "box-shadow:0 2px 8px rgba(0,0,0,0.5)",
            "z-index:2147483646",
            "cursor:pointer",
            "touch-action:none",
            "-webkit-user-select:none",
            "user-select:none",
          ].join(";");
          document.body.appendChild(el);
          var slot = Math.max(1, Math.round(order / 10)); // one above the other, bottom right
          makeDraggable(el, "workshopFallbackPos_" + panelId, 44, 44, window.innerWidth - 60, window.innerHeight - 8 - slot * 56, function () {
            toggle();
            sync();
          });
        }

        function sync() {
          if (pluginStopped || !ready || workshop.barActive) return remove();
          if (!el) create();
          el.style.background = isOpen() ? "#1565c0" : "#37474f";
        }

        workshopOnChange(sync);
        setTimeout(function () {
          ready = true;
          sync();
        }, WORKSHOP_FALLBACK_DELAY_MS);
        workshopOnStop(function () {
          workshopOffChange(sync);
          remove();
        });
      }
