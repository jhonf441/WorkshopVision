      // ---- Common registry among the workshop plugins (window.__workshop) ----
      //
      // Each plugin (WorkshopControlBar, WorkshopJog, WorkshopCamera) is a separate
      // DWC chunk with its own scope, so they find each other through
      // this global object:
      //   - panels: each floating panel registers with its API; the sidebar
      //     builds its launchers (rail + card) from what has been
      //     registered. If a plugin is not installed, its launcher
      //     simply does not appear.
      //   - barTiles: the optional GLOBAL tiles a plugin offers to the sidebar for what it owns (10-registry-tiles.js).
      //   - status: the latest machine state someone read (copy
      //     of the object model from DWC's store, same shape as
      //     /machine/status; see 01-dwc-state.js). The jog reads it every 2s and
      //     publishes it; the bar uses it, and publishes it itself if nobody did
      //     for a while (jog not installed).
      //
      // API of a panel (workshopRegisterPanel(id, api)):
      //   title, icon (internal SVG markup of a 24x24 viewBox), order,
      //   description, toggle(), state() -> {open, busy, disabled,
      //   statusText, railTitle}, optional openAfterSignIn() (the bar signed the person in from the locked launcher: open now
      //   when allowed; returns false when it did not open), optional rebuildsOnSignIn: true (the panel rebuilds itself for the new
      //   person; the bar does not toggle it after the sign-in)
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

      // Version of each loaded plugin: the registry of the JS plugins present in this page (13-presence.js reads it; the control bar shows
      // only its own version). PLUGIN_VERSION / PLUGIN_COMMIT are injected by build.py.
      workshop.versions = workshop.versions || {};
      workshop.versions[PLUGIN_ID] = { version: PLUGIN_VERSION, commit: PLUGIN_COMMIT };
      console.info("[" + PLUGIN_ID + "] v" + PLUGIN_VERSION + " (" + PLUGIN_COMMIT + ")");

      // The small "v1.2.3" every plugin shows in its own page bar (title = id and commit). Vue pages get the same chip from PageHeader.vue.
      function workshopVersionChip() {
        var c = document.createElement("span");
        c.className = "wf-version";
        c.textContent = "v" + PLUGIN_VERSION;
        c.title = PLUGIN_ID + " v" + PLUGIN_VERSION + " (" + PLUGIN_COMMIT + ")";
        // a rounded pill (2026-11-22): 24 px high, radius 12, 12 px letters, air on both sides, a soft fill that works on the dark and the light theme
        c.style.cssText = "flex:none;box-sizing:border-box;display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:12px;background:rgba(128,128,128,0.2);color:inherit;font-size:12px;line-height:1;white-space:nowrap;font-variant-numeric:tabular-nums;align-self:center;";
        return c;
      }

      // The close icon of every floating piece (sheet header, camera viewer): one path, the size comes from the caller. The button around it is the
      // caller's (a sheet header: plain round 44 px; the camera viewer: over a picture, with its own pointer handling).
      function workshopCloseIconSvg(size) {
        return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="currentColor" aria-hidden="true" style="display:block;pointer-events:none"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
      }

      // The header of a floating sheet, the same in every plugin: the title (one line, ellipsis), the version pill and a round 44 px close button with an
      // icon, 12 px between them. onClose = what the button does; opts.noVersion leaves the pill out. Returns the element (the caller adds it to the sheet).
      function workshopSheetHeader(title, onClose, opts) {
        var h = document.createElement("div");
        h.className = "wf-sheet-head";
        h.style.cssText = "display:flex;align-items:center;gap:12px;box-sizing:border-box;min-height:60px;padding:8px 8px 8px 12px;border-bottom:1px solid rgba(255,255,255,0.12);flex:none;";
        var t = document.createElement("div");
        t.textContent = title;
        t.style.cssText = "flex:1 1 0;min-width:0;font-size:16px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        h.appendChild(t);
        if (!opts || !opts.noVersion) h.appendChild(workshopVersionChip());
        var x = document.createElement("button");
        x.type = "button";
        x.className = "wf-sheet-close";
        var label = i18nT("core.close");
        x.title = label;
        x.setAttribute("aria-label", label);
        x.innerHTML = workshopCloseIconSvg(20);
        x.className = (x.className ? x.className + " " : "") + "wf-hit"; // seen s 32, touched 40 (the scale)
        x.style.cssText = "flex:none;box-sizing:border-box;width:var(--wf-size-s, 32px);height:var(--wf-size-s, 32px);min-width:var(--wf-size-s, 32px);min-height:var(--wf-size-s, 32px);padding:0;border:none;border-radius:50%;background:transparent;color:inherit;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;touch-action:manipulation;";
        x.addEventListener("pointerenter", function () { x.style.background = "rgba(128,128,128,0.25)"; });
        x.addEventListener("pointerleave", function () { x.style.background = "transparent"; });
        x.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (typeof onClose === "function") onClose();
        });
        h.appendChild(x);
        return h;
      }
      workshopNotify(); // the bar (if already loaded) refreshes: a plugin arrived
      setTimeout(function () { workshopReportPlugin(false); }, 0); // started: the service forgets that it was stopped (30-lifecycle.js), once the whole file has run

      function workshopNotify() {
        workshop.listeners.slice().forEach(function (fn) {
          try {
            fn();
          } catch (e) {
            console.error("[" + PLUGIN_ID + "] registry listener:", e);
          }
        });
      }

      // A panel registered here is taken out of the registry when THIS plugin stops (workshopOnStop, 30-lifecycle.js): the plugin does not
      // have to remember, and a stop that comes right after the registration still leaves nothing behind. One cleanup per plugin, it
      // takes out only the panels this plugin put there (and only while they are still its own api).
      var workshopPanelsOwned = {};
      var workshopPanelsCleanup = false;
      function workshopRegisterPanel(id, api) {
        workshop.panels[id] = api;
        workshopPanelsOwned[id] = api;
        if (!workshopPanelsCleanup) {
          workshopPanelsCleanup = true;
          workshopOnStop(function () {
            Object.keys(workshopPanelsOwned).forEach(function (pid) {
              workshopUnregisterPanel(pid, workshopPanelsOwned[pid]);
            });
            workshopPanelsOwned = {};
          });
        }
        workshopNotify();
      }

      // api (optional): only take the panel out if it is still that api (another copy of the plugin may have registered the id since).
      function workshopUnregisterPanel(id, api) {
        if (!workshop.panels[id] || (api && workshop.panels[id] !== api)) return;
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
