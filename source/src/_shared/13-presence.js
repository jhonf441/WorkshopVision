      // ---- Presence of other plugins ----
      // Rule: if plugin A refers to plugin B and B is not installed or not enabled in DWC, A shows
      // nothing about B (no button, link, text, card or hint: hidden, not disabled). workshopPluginActive(key) answers "is B there?"
      // without timers: call it when the page or card is built or rendered, not once at load (a plugin can start or stop meanwhile).
      //
      // It never asks the router. DWC 3.6 cannot remove a route or a menu entry (registerRoute only adds), so a plugin that was stopped keeps its
      // route until the page is reloaded and a check by route sees a ghost. The answer comes from three sources:
      //   - the registry of the JS plugins loaded in this page (window.__workshop.versions; workshopStop takes the plugin out of it),
      //   - DWC's plugin model (the plugin is installed: how the Vue plugins, that have no JS registry entry, are found),
      //   - the enabled list (workshopHostEnabledPlugins: ONLY the machine list in DWC 3.6, which is the one that Stop and Start change; the
      //     single list in DWC 3.7). When it says the plugin is not on, that wins over the other two: a JS plugin that was stopped keeps its
      //     registry entry for the seconds the 3.6 poll takes to notice, and DWC 3.6 may keep loading an id left in the global list.
      //     An empty or missing list is a list DWC has not read yet (a running plugin means a loaded list is never empty): it hides nothing.

      // pure. ids = the Ids of the plugin, versions = window.__workshop.versions, plugins = DWC's plugin model (a Map or an object),
      // enabled = the enabled list (array, empty or null while it is not read)
      function workshopPluginActiveIn(ids, versions, plugins, enabled) {
        var listed = Array.isArray(enabled) && enabled.length > 0;
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          if (listed && enabled.indexOf(id) === -1) continue;
          if (versions && versions[id]) return true;
          var p = plugins && (typeof plugins.get === "function" ? plugins.get(id) : plugins[id]);
          if (p) return true;
        }
        return false;
      }

      // key = a key of WORKSHOP_IDS (00-core.js) or a full plugin Id
      function workshopPluginActive(key) {
        var ids = WORKSHOP_IDS[key] || [key];
        return workshopPluginActiveIn(ids, window.__workshop && window.__workshop.versions, workshopHostPluginsModel(), workshopHostEnabledPlugins());
      }

      // true when DWC has a page registered at that route. ONLY for what needs a route (to navigate there); to know whether ANOTHER PLUGIN is
      // there use workshopPluginActive: in DWC 3.6 the route of a stopped plugin stays until the page is reloaded.
      function workshopPathExists(path) {
        return workshopHostPathMatched(path);
      }
