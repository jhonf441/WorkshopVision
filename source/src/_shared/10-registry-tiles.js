      // ---- Tiles the plugins offer to the control bar (the optional cards of its GLOBAL section) ----
      //
      // The bar names no plugin. The plugin that OWNS a thing hands the bar a tile for it, and the bar draws what is registered, the way it draws the
      // launchers of the panels (window.__workshop.panels, 10-registry.js). A plugin that is stopped, disabled or not installed leaves no tile. In the gear
      // of the bar ("what is seen, order, on this screen") every registered tile is a switch; `defaultShown` says how it starts on a screen that never chose.
      // Register it once the plugin has loaded, next to workshopRegisterPanel: workshopRegisterBarTile("<plugin>-<thing>", api).
      //
      // api = {
      //   title         the title of the card and the tooltip of the rail icon, already in the language of the page
      //   icon          SVG markup (paths of a 24x24 viewBox), as the panels give it
      //   order         position among the tiles (lower first)
      //   help          optional sentence under the buttons (the compact bar hides it)
      //   plugin        optional key of the plugin that offers it (WORKSHOP_IDS): the bar hides the tile while workshopPluginActive(plugin) is false
      //   defaultShown  required. true: on until the person turns it off. false: off until the person turns it on
      //   visible()     optional role gate: false = no tile for this person (default true); the bar asks again when the identity changes
      //   state()       what to paint now: { status, color, summary, railColor, message, buttons: [{ id, label, tone, disabled, onTap }] }
      //                 status: the line of the card; summary: the short state of the tile of the Hidden style; tone: neutral | primary |
      //                 success | warning | danger | stop. The plugin calls workshopNotify() when what state() answers changes
      //   watch(on)     optional: the bar says true while the tile is on screen (bar open, switch on) and false when it is not. Read state from
      //                 the service only while watched, so a hidden tile costs nothing
      // }
      // Returns false (and says why in the console) for a tile the bar cannot draw.

      var workshopBarTilesOwned = {};
      var workshopBarTilesCleanup = false;

      function workshopRegisterBarTile(id, api) {
        if (!id || !api || typeof api.title !== "string" || typeof api.state !== "function" || typeof api.defaultShown !== "boolean") {
          console.error("[" + PLUGIN_ID + "] bar tile " + id + ": it needs title, state() and defaultShown");
          return false;
        }
        workshop.barTiles = workshop.barTiles || {}; // made by the first tile: the registry of a page with no tiles is the same as before
        workshop.barTiles[id] = api;
        workshopBarTilesOwned[id] = api;
        // taken out of the registry when THIS plugin stops (the same as the panels)
        if (!workshopBarTilesCleanup) {
          workshopBarTilesCleanup = true;
          workshopOnStop(function () {
            Object.keys(workshopBarTilesOwned).forEach(function (tid) {
              workshopUnregisterBarTile(tid, workshopBarTilesOwned[tid]);
            });
            workshopBarTilesOwned = {};
          });
        }
        workshopNotify();
        return true;
      }

      // api (optional): only take the tile out if it is still that api
      function workshopUnregisterBarTile(id, api) {
        if (!workshop.barTiles || !workshop.barTiles[id] || (api && workshop.barTiles[id] !== api)) return;
        delete workshop.barTiles[id];
        workshopNotify();
      }
