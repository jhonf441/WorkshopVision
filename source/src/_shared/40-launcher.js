      // ---- Own launcher when the sidebar is NOT there ----
      //
      // Its tooltip says nothing about the sidebar: it is shown exactly when that plugin is missing, and a plugin never names another one that is not there.
      //
      // The panels (jog, camera) open from the sidebar
      // (WorkshopControlBar). So that each plugin also works installed alone,
      // if the bar is not active the panel shows its own floating round button
      // (draggable, position remembered). As soon as the bar
      // appears (workshop.barraActive, see WorkshopControlBar/20-main.js) the button is
      // removed, and comes back if the bar stops.
      var WORKSHOP_FALLBACK_DELAY_MS = 4000; // DWC loads plugins one at a time: give the bar time
      var WORKSHOP_NARROW_PX = 768; // a window this wide or narrower is a phone: a panel that opens folds the control bar
      var WORKSHOP_OPENED_EVENT = "workshop-panel-opened"; // the bar listens for it (WorkshopControlBar/13-narrow.js); without the bar nothing happens

      // A narrow window (a phone). The kiosk screens (800x480, 1024x600) are wider than this.
      function workshopIsNarrow() {
        return window.innerWidth <= WORKSHOP_NARROW_PX;
      }

      // A panel that just opened tells the bar, on a narrow screen only (the open bar would cover the panel and its "x"). One place for the
      // event and for the limit: the Jog, the Camera and the bar itself use them.
      function workshopAnnouncePanelOpened(id) {
        if (!workshopIsNarrow()) return;
        try {
          window.dispatchEvent(new CustomEvent(WORKSHOP_OPENED_EVENT, { detail: { id: id } }));
        } catch (e) {
          /* not critical */
        }
      }

      // panel = the same object the plugin hands to workshopRegisterPanel(panelId, panel): title, icon, order, toggle() and state().open say
      // everything this button shows, so they are said once.
      function workshopFallbackLauncher(panelId, panel) {
        var el = null;
        var ready = false;
        var title = panel.title;
        var icon = panel.icon;
        var order = panel.order;

        function isOpen() {
          var s = panel.state && panel.state();
          return !!(s && s.open);
        }

        function remove() {
          if (el) el.remove();
          el = null;
        }

        function create() {
          el = document.createElement("div");
          el.id = "workshop-fallback-" + panelId;
          el.title = i18nT('launcher.tap_to_open', { title: title });
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
            panel.toggle();
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
