      // ---- Common registry among the workshop plugins (window.__workshop) ----
      //
      // Each plugin (WorkshopControlBar, WorkshopJog, WorkshopCamera) is a separate
      // DWC chunk with its own scope, so they find each other through
      // this global object:
      //   - panels: each floating panel registers with its API; the sidebar
      //     builds its launchers (rail + card) from what has been
      //     registered. If a plugin is not installed, its launcher
      //     simply does not appear.
      //   - status: the latest machine state someone read (copy
      //     of the object model from DWC's store, same shape as
      //     /machine/status; see 01-dwc-state.js). The jog reads it every 2s and
      //     publishes it; the bar uses it, and publishes it itself if nobody did
      //     for a while (jog not installed).
      //
      // API of a panel (workshopRegisterPanel(id, api)):
      //   title, icon (internal SVG markup of a 24x24 viewBox), order,
      //   description, toggle(), state() -> {open, busy, disabled,
      //   statusText, railTitle}
      // Another _shared module may have created window.__workshop before (e.g.
      // 04-warnings.js creates it empty): the missing fields are filled in
      // instead of assuming that, if it exists, it already has them. Without this (2026-10-10)
      // workshopNotify failed with undefined listeners and NO JS plugin
      // started (bar, jog, camera, Zones, Vision, 2D job).
      var workshop = (window.__workshop = window.__workshop || {});
      if (!workshop.panels) workshop.panels = {};
      if (!workshop.listeners) workshop.listeners = [];
      if (!workshop.statusListeners) workshop.statusListeners = [];
      if (workshop.lastStatus === undefined) workshop.lastStatus = null;
      if (!workshop.lastStatusAt) workshop.lastStatusAt = 0;

      // Version of each loaded plugin (the sidebar shows them).
      // PLUGIN_VERSION / PLUGIN_COMMIT are injected by build.py.
      workshop.versions = workshop.versions || {};
      workshop.versions[PLUGIN_ID] = { version: PLUGIN_VERSION, commit: PLUGIN_COMMIT };
      console.info("[" + PLUGIN_ID + "] v" + PLUGIN_VERSION + " (" + PLUGIN_COMMIT + ")");
      workshopNotify(); // the bar (if already loaded) updates its version list

      function workshopNotify() {
        workshop.listeners.slice().forEach(function (fn) {
          try {
            fn();
          } catch (e) {
            console.error("[" + PLUGIN_ID + "] registry listener:", e);
          }
        });
      }

      function workshopRegisterPanel(id, api) {
        workshop.panels[id] = api;
        workshopNotify();
      }

      function workshopUnregisterPanel(id) {
        if (!workshop.panels[id]) return;
        delete workshop.panels[id];
        workshopNotify();
      }

      function workshopOnChange(fn) {
        workshop.listeners.push(fn);
      }

      function workshopOffChange(fn) {
        workshop.listeners = workshop.listeners.filter(function (f) {
          return f !== fn;
        });
      }

      function workshopPublishStatus(status) {
        workshop.lastStatus = status;
        workshop.lastStatusAt = Date.now();
        workshop.statusListeners.slice().forEach(function (fn) {
          try {
            fn(status);
          } catch (e) {
            console.error("[" + PLUGIN_ID + "] listener de estado:", e);
          }
        });
      }

      function workshopOnStatus(fn) {
        workshop.statusListeners.push(fn);
      }

      function workshopOffStatus(fn) {
        workshop.statusListeners = workshop.statusListeners.filter(function (f) {
          return f !== fn;
        });
      }
