      // ---- The two ports of the camera side (the one place that names them) ----
      //
      // The folder src/_camera_client is carried only by the plugins that talk to the camera relay or to the Vision server (Camera, Vision
      // and Workbench: their _includes.txt). The relay (WorkshopService, port 8090) serves the video and the photos; the Vision server
      // (port 8095) is the process of OpenCV. Both answer the same day's key and the same identity headers (26-camera-key.js).
      // Nothing else in the code may write these numbers: a page asks for the port here (tests/camera-boundary.test.js and
      // tests/camera-relay.test.js look for them).
      var WORKSHOP_RELAY_PORT = 8090;
      var WORKSHOP_VISION_PORT = 8095;
      // An absolute address on one of the two ports: the fetch of 26-camera-key.js adds the key and the identity to it, and the cover of
      // 26-camera-cover.js explains an image of it that does not load.
      var WORKSHOP_RELAY_URL = new RegExp("^https?://[^/]+:(" + WORKSHOP_RELAY_PORT + "|" + WORKSHOP_VISION_PORT + ")/");

      // The video address, on the relay of this machine, of a camera of THE list (cameras.json, owned by the service: camera.status). The main
      // camera is /stream, any other /c/<id>/stream. The pages that show a camera by its id (the settings of Vision, the camera layer of the map)
      // build the address here: nobody keeps an address of its own for a camera of the list (informe-06 B1).
      function workshopRelayStream(cameraId) {
        var id = String(cameraId || "main");
        return "http://" + window.location.hostname + ":" + WORKSHOP_RELAY_PORT + (id === "main" ? "/stream" : "/c/" + encodeURIComponent(id) + "/stream");
      }
