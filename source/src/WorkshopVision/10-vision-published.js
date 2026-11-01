      // ---- What Vision publishes for the other plugins (window.__workshop) ----
      // The Workbench reads these (nothing is sent to it by an event with data): `vision` = the last detections, for its Vision layer;
      // `visionShape` = a shape for its laser editor; `visionPick` = a point for its zone editor. The last two are taken once by the
      // Workbench. When Vision stops they must not stay behind, or the Workbench would draw (or place) data of a plugin that is not there.

      // Publishes the detections (in mm) for the "Vision" layer of the Zones
      // map (the Workbench draws it if installed).
      function tvPublish(res) {
        var t = (window.__workshop = window.__workshop || {});
        var items = ((res && res.items) || []).filter(function (it) { return it.mm && it.mm.c; });
        t.vision = { ts: Date.now(), items: items };
        try {
          window.dispatchEvent(new CustomEvent("workshop-vision"));
        } catch (e) {
          /* navegador viejo */
        }
      }

      // Takes back everything tvPublish and the "to the editor" / "zone origin" buttons left in the registry, and tells the open map
      // (the same event) so it draws again without it. Called when the plugin stops (20-main.js).
      function tvClearPublished() {
        var t = window.__workshop;
        if (!t) return;
        var had = !!(t.vision || t.visionShape || t.visionPick);
        delete t.vision;
        delete t.visionShape;
        delete t.visionPick;
        if (!had) return;
        try {
          window.dispatchEvent(new CustomEvent("workshop-vision"));
        } catch (e) {
          /* navegador viejo */
        }
      }
