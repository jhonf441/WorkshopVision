      // ---- Camera processing switch (Settings > first card) ----
      // The camera relay of the service (frames, timelapse, watchdog) is the process "camera" of dsf/service_modules.py.
      // Its mode lives in the service ("auto": it runs while Camera, Vision or the Workbench is enabled; "off": it never runs).
      // This card is the same switch of the service page (Internal processes), here where the camera is used.

      function tvCameraModule() {
        try {
          var p = workshopPluginOf(workshopHostPluginsModel(), "service");
          var dv = workshopPluginData(p);
          var m = dv && dv.servicesInternal && dv.servicesInternal.modules;
          return (m && m.camera) || null;
        } catch (e) {
          return null;
        }
      }

      function tvAjProcessing(tv, aj) {
        var card = tvCard(i18nT('vision.camera_processing_title'), "video-switch-outline");
        tv.side.appendChild(card);
        var sw = tvEl("span", "tv-toggle");
        sw.appendChild(tvEl("span", "sw"));
        var label = tvEl("span");
        sw.appendChild(label);
        card.appendChild(sw);
        var state = tvEl("div", "tv-muted");
        state.style.marginTop = "6px";
        card.appendChild(state);
        card.appendChild(tvEl("div", "tv-muted", i18nT('vision.camera_processing_help')));

        function paint() {
          var m = tvCameraModule();
          var off = !!m && m.mode === "off";
          sw.className = "tv-toggle" + (off ? "" : " on");
          label.textContent = off ? i18nT('vision.camera_processing_off') : i18nT('vision.camera_processing_on');
          state.textContent = !m ? i18nT('vision.camera_processing_unknown') : m.active ? i18nT('vision.camera_processing_running') : i18nT('vision.camera_processing_resting');
        }
        paint();
        var timer = setInterval(function () {
          if (!card.isConnected) return clearInterval(timer);
          paint();
        }, 2000);
        sw.addEventListener("click", function () {
          var m = tvCameraModule();
          var mode = m && m.mode === "off" ? "auto" : "off";
          workshopApi("modules.set", { process: "camera", mode: mode }).then(
            function () {
              tvFlash(tv, mode === "off" ? i18nT('vision.camera_processing_stopped') : i18nT('vision.camera_processing_automatic'), true);
              paint();
            },
            function (e) {
              tvFlash(tv, i18nT('vision.camera_processing_failed', { v: String(e.message) }), false);
            }
          );
        });
      }
