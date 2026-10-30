      // ---- Camera relay key (window.__tallerCamClave) ----
      //
      // 2026-10-10 ("can DWC's password be used to prevent someone from
      // accessing the cameras"): with a password in DWC (M551) the Pi's relay
      // (:8090) asks remote screens for the day's key. It is requested from the
      // service with the API camera.token (that request already goes through the
      // DWC session) and it is used in two ways:
      //   - workshop_camera cookie on this host: sent by itself by <img>, <video>
      //     and downloads (cookies do not distinguish port)
      //   - ?t= in fetch() calls to :8090 (a fetch to another port does not send cookies)
      // Without a password the relay does not check it. The Pi's own screen
      // (localhost) never needs it. A single one for all the plugins.
      (function () {
        if (window.__workshopCameraKey) return;
        var state = { token: "", requested: null, last: 0 };
        window.__workshopCameraKey = state;
        var RE_RELAY = WORKSHOP_RELAY_URL; // :8090 relay; :8095 Vision service, which validates the same key (26-camera-cover.js)

        function request() {
          if (state.requested) return state.requested;
          if (Date.now() - state.last < 15000) return Promise.resolve(state.token);
          state.last = Date.now();
          state.requested = workshopApiText("camera.token")
            .then(function (t) {
              var k = t.indexOf("{");
              var d = k >= 0 ? JSON.parse(t.slice(k)) : null;
              if (d && d.token) {
                state.token = d.token;
                document.cookie = "workshop_camera=" + d.token + "; path=/; max-age=86400; SameSite=Lax";
                workshopCoverRetry(); // the images that failed before the key arrived load again (26-camera-cover.js)
              }
            })
            .catch(function () {
              /*  without backend or without permission: the relay answers 401 and it is retried later */
            })
            .then(function () {
              state.requested = null;
              return state.token;
            });
          return state.requested;
        }
        state.request = request;

        function conKey(url) {
          if (!state.token || /[?&]t=/.test(url)) return url;
          return url + (url.indexOf("?") >= 0 ? "&" : "?") + "t=" + state.token;
        }

        // With users configured and a session open, the relay and Vision decide by role: they get the same
        // identity headers as the service API. Without a session nothing is added (no extra preflight, old services keep working).
        function withIdentity(options) {
          var token = typeof workshopAuthToken === "function" ? workshopAuthToken() : "";
          if (!token) return options;
          var headers = {};
          var given = options && options.headers;
          if (given && typeof given.forEach === "function" && typeof given.append === "function") {
            given.forEach(function (v, k) {
              headers[k] = v;
            });
          } else if (given) {
            for (var k in given) headers[k] = given[k];
          }
          var auth = workshopAuthHeaders();
          for (var h in auth) headers[h] = auth[h];
          var copy = {};
          for (var o in options || {}) copy[o] = options[o];
          copy.headers = headers;
          return copy;
        }
        state.withIdentity = withIdentity;

        var fetchOriginal = window.fetch.bind(window);
        window.fetch = function (recurso, options) {
          if (typeof recurso !== "string" || !RE_RELAY.test(recurso)) return fetchOriginal(recurso, options);
          options = withIdentity(options);
          return fetchOriginal(conKey(recurso), options).then(function (r) {
            if (r.status !== 401) return r;
            // expired key or not yet requested: it is requested and retried once
            return request().then(function (t) {
              return t ? fetchOriginal(conKey(recurso.replace(/([?&])t=[^&]*&?/, "$1").replace(/[?&]$/, "")), options) : r;
            });
          });
        };

        if (!/^(localhost|127\.0\.0\.1|\[::1\])$/.test(window.location.hostname)) {
          // on load there may be no session yet: without a key it is retried every
          // 20 s; with a key it is renewed every 6 h (valid for the day and the next)
          var attempts = 0; // sin clave tras ~5 min (backend viejo): deja de insistir
          request();
          setInterval(function () {
            if (state.token ? Date.now() - state.last > 6 * 3600 * 1000 : attempts++ < 15) request();
          }, 20000);
        }
      })();
