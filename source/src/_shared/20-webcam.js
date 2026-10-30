      // The Pi's 1-to-many relay (~/camera-relay/camera_relay.py, port
      // 8090) in front of the ESP32-camera.
      var WORKSHOP_CAMERA_DEFAULT_URL = "http://[HOSTNAME]:8090/stream";

      function getWebcamUrl() {
        // DWC saves the URL with the literal "[HOSTNAME]" so that each
        // client resolves it to its own way of reaching the device
        // -- it is replaced by the hostname/IP this same tab
        // is already using to talk to DWC.
        // 2026-10-12: the settings come from DWC's store (the same ones it saves
        // in dwc-settings.json); the file only if the store is not there (the bar
        // asked every 10 s and each request is served by DuetWebServer).
        var ajustes = workshopHostSettings();
        var pSettings = ajustes && ajustes.webcam
          ? Promise.resolve({ main: ajustes })
          : fetch("/machine/file/0:/sys/dwc-settings.json").then(function (r) {
              return r.json();
            });
        return pSettings
          .then(function (settings) {
            // 2026-10-08 ("the camera does not work if the camera is disabled
            // from General"): the workshop's camera NO longer depends
            // on DWC's webcam switch -- with "enabled" off (and
            // the URL deleted, which is what DWC leaves) the Pi's relay is
            // used anyway. If DWC has a URL loaded, that one rules.
            var camera = settings && settings.main && settings.main.webcam;
            var url = camera && camera.url ? camera.url : WORKSHOP_CAMERA_DEFAULT_URL;
            return url.replace("[HOSTNAME]", window.location.hostname);
          })
          .catch(function () {
            return WORKSHOP_CAMERA_DEFAULT_URL.replace("[HOSTNAME]", window.location.hostname);
          });
      }
