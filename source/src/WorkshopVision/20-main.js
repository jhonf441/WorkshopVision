      // ---- Arranque de WorkshopVision ----

      // Page in DWC's Plugins menu (same API as WorkshopJog's Zones page).
      // Minimal Vue component with a render function (DWC's Vue runtime does not
      // compile templates). Own try/catch: if DWC changed this API, it must not
      // bring down the rest.
      try {
        workshopHostRegisterPage(
          {
            name: "WorkshopVisionPage",
            mount: function (el, router) { return tvMountPage(el, router); },
            destroy: function (page) { page.destroy(); },
          },
          { Plugins: { WorkshopVision: { icon: "mdi-" + TV_ICON, caption: 'plugins.WorkshopVision.vision.menu_caption', path: "/Plugins/Vision" } } }
        );
      } catch (e) {
        console.error("[WorkshopVision] could not register the Vision page:", e);
      }

      workshopWatchEnabled();
