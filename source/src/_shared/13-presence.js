      // ---- Presence of other plugins ----
      // Rule: if plugin A refers to plugin B and B is not installed or not enabled in DWC, A shows
      // nothing about B (no button, link, text, card or hint: hidden, not disabled). These helpers
      // answer "is B there?" without timers: call them when the page or card is built or rendered.

      // true when DWC has a page registered at that route (the plugin that owns it is installed and
      // enabled). Unknown routes fall on the catch-all "*" of the DWC router.
      function workshopPathExists(path) {
        return workshopHostPathMatched(path);
      }
      // true when the JS plugin of that key (WORKSHOP_IDS in 00-core.js) loaded in this page, so it is
      // installed and enabled. For plugins that have no page of their own (jog, control bar, camera).
      function workshopPluginLoaded(key) {
        var v = window.__workshop && window.__workshop.versions;
        var ids = WORKSHOP_IDS[key] || [key];
        for (var i = 0; v && i < ids.length; i++) if (v[ids[i]]) return true;
        return false;
      }
