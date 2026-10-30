      // ---- Identity of the person using this browser (F1-A of the redesign, 2026-10-21) ----
      // The roles are applied by the SERVICE; this only keeps the session token, tells the pages what to hide and runs the PIN
      // dialog (01-api-pin.js) when the service answers 401 login_required. Same logic for the Vue pages in
      // vue/_shared/workshop-auth.js: keep them equal.
      //
      //   workshopAuthHeaders()          {"X-Workshop-Token", "X-Workshop-Device"} for every call to the API
      //   workshopCan("lights.save")     false when the role cannot call it (hide the button; the service refuses it anyway)
      //   workshopIdentity()             last auth.whoami answer ({role, user, table, ...}) or null
      //   workshopOnIdentity(fn)         fn(identity) when the person logs in, out or the role changes; returns the off function
      //
      // The token is in localStorage: ONE session per browser (owner decision), so every tab follows a login or logout through the
      // storage event; it ends when the service expires it (12 h) or on logout, never with the tab. The kiosk is another browser, so
      // another session. The id of the browser is in localStorage too (not a secret: it only tells the audit which browser did it).
      // The typed length of each PIN is also kept (01-api-pin.js) only to submit by itself when that many digits are typed: it tells
      // anyone with access to this browser the length, not the PIN. All the plugins of a page share ONE state through window.__workshopAuth.

      var WORKSHOP_AUTH_TOKEN_KEY = "workshop-token";
      var WORKSHOP_AUTH_DEVICE_KEY = "workshop-device";
      var WORKSHOP_AUTH_KEEPALIVE_MS = 60000;
      var WORKSHOP_AUTH_QUIET_MS = 600000; // after cancelling the dialog, calls fail quietly this long instead of asking again
      var WORKSHOP_AUTH_RANK = { viewer: 0, operator: 1, technician: 2, admin: 3 };

      var WORKSHOP_AUTH_GESTURE_MS = 1500;

      // Remembers when the person last touched the page (not the sign-in dialog itself)
      function workshopAuthWatchGestures(s) {
        if (s.gestures || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
        s.gestures = 1;
        ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
          document.addEventListener(
            ev,
            function (e) {
              var t = e.target;
              if (t && t.closest && t.closest("[data-tp-pin]")) return;
              s.gestureAt = Date.now();
            },
            { capture: true, passive: true }
          );
        });
      }

      // The service has users and this browser has no session (the person is a visitor, or nothing is allowed yet).
      function workshopSignedOut() {
        var id = workshopAuthState().identity;
        return !!(id && id.configured && !workshopAuthToken());
      }

      // The person touched the page a moment ago: what fails now is probably their action (so it is worth telling them).
      function workshopAuthRecentGesture() {
        return Date.now() - (workshopAuthState().gestureAt || 0) < WORKSHOP_AUTH_GESTURE_MS;
      }

      function workshopAuthState() {
        if (!window.__workshopAuth) window.__workshopAuth = { identity: null, token: "", listeners: [], flight: null, quietUntil: 0, device: "", keepalive: 0 };
        workshopAuthWatchGestures(window.__workshopAuth);
        workshopAuthWatchStorage(window.__workshopAuth);
        return window.__workshopAuth;
      }

      // One sign-in is valid for every tab of this browser (localStorage); the service still ends the session when it expires or on logout
      function workshopAuthTokenStore() {
        return workshopAuthStore("localStorage");
      }

      // A sign-in or a logout made in another tab arrives here: this tab follows it without asking again
      function workshopAuthWatchStorage(s) {
        if (s.storageWatch || typeof window === "undefined" || typeof window.addEventListener !== "function") return;
        s.storageWatch = 1;
        window.addEventListener("storage", function (e) {
          if (e.key !== WORKSHOP_AUTH_TOKEN_KEY) return;
          s.token = e.newValue || "";
          workshopAuthRefresh(workshopApiCall).catch(function () {});
        });
      }

      function workshopAuthStore(kind) {
        try {
          return window[kind];
        } catch (e) {
          return null;
        }
      }

      function workshopAuthDevice() {
        var s = workshopAuthState();
        if (s.device) return s.device;
        var id = "";
        try {
          id = workshopAuthStore("localStorage").getItem(WORKSHOP_AUTH_DEVICE_KEY) || "";
        } catch (e) {
          id = "";
        }
        if (!/^[A-Za-z0-9_-]{8,40}$/.test(id)) {
          var a = new Uint8Array(12);
          try {
            window.crypto.getRandomValues(a);
          } catch (e) {
            for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256);
          }
          id = "b";
          for (var k = 0; k < a.length; k++) id += ("0" + a[k].toString(16)).slice(-2);
          try {
            workshopAuthStore("localStorage").setItem(WORKSHOP_AUTH_DEVICE_KEY, id);
          } catch (e) {
            /* private window: the id lives as long as the page */
          }
        }
        s.device = id;
        return id;
      }

      function workshopAuthToken() {
        var s = workshopAuthState();
        if (s.token) return s.token;
        try {
          s.token = workshopAuthTokenStore().getItem(WORKSHOP_AUTH_TOKEN_KEY) || "";
        } catch (e) {
          s.token = "";
        }
        return s.token;
      }

      function workshopAuthSetToken(token) {
        var s = workshopAuthState();
        s.token = token || "";
        try {
          if (token) workshopAuthTokenStore().setItem(WORKSHOP_AUTH_TOKEN_KEY, token);
          else workshopAuthTokenStore().removeItem(WORKSHOP_AUTH_TOKEN_KEY);
        } catch (e) {
          /* the memory copy is enough */
        }
      }

      function workshopAuthHeaders() {
        var h = { "X-Workshop-Device": workshopAuthDevice() };
        var t = workshopAuthToken();
        if (t) h["X-Workshop-Token"] = t;
        return h;
      }

      function workshopIdentity() {
        return workshopAuthState().identity;
      }

      function workshopAuthSetIdentity(w) {
        var s = workshopAuthState();
        s.identity = w || null;
        s.listeners.slice().forEach(function (fn) {
          try {
            fn(s.identity);
          } catch (e) {
            /* a listener must not break the others */
          }
        });
      }

      function workshopOnIdentity(fn) {
        var s = workshopAuthState();
        s.listeners.push(fn);
        return function () {
          s.listeners = s.listeners.filter(function (x) {
            return x !== fn;
          });
        };
      }

      function workshopRole() {
        var id = workshopAuthState().identity;
        return id && id.role ? id.role : "";
      }

      // Can the current person call this operation? Without an answer from the service yet (or without users) it says yes: hiding is
      // only a courtesy, the service decides. ctx: { mode: "laser" | "cnc" | "fff", args: {...} } for the rules that depend on it.
      function workshopCan(op, ctx) {
        ctx = ctx || {};
        var id = workshopAuthState().identity;
        if (!id || !id.table || !id.role) return true;
        var t = id.table;
        if ((t.stop || []).indexOf(op) >= 0) return true;
        var role = id.role;
        var need = (t.ops || {})[op] || "admin";
        var esc = (t.escalate || {})[op]; // some operations need more when their arguments change settings
        if (esc) {
          var v = (ctx.args || {})[esc.arg];
          var hit = esc.when_present ? !!v : (esc.unless_in || []).indexOf(String(v || "")) < 0;
          if (hit && WORKSHOP_AUTH_RANK[esc.role] > WORKSHOP_AUTH_RANK[need]) need = esc.role;
        }
        if (role === "viewer" && (t.camera || []).indexOf(op) >= 0) return !!(id.user && id.user.camera);
        if (WORKSHOP_AUTH_RANK[role] === undefined || WORKSHOP_AUTH_RANK[role] < WORKSHOP_AUTH_RANK[need]) return false;
        if (role === "operator" && (t.mode_gated || []).indexOf(op) >= 0 && ctx.mode) {
          var modes = (id.user && id.user.modes) || [];
          return modes.length >= (t.modes || []).length || modes.indexOf(String(ctx.mode).toLowerCase()) >= 0;
        }
        return true;
      }

      // call(op, args) must resolve the JSON body of the API ({ok, result, error}) and never ask for a login itself.
      function workshopAuthRefresh(call) {
        return call("auth.whoami", {}).then(function (j) {
          if (j && j.ok) workshopAuthSetIdentity(j.result);
          return j && j.ok ? j.result : null;
        });
      }

      function workshopAuthLogin(call, name, pin) {
        return call("auth.login", { name: name, pin: pin }).then(function (j) {
          if (!j.ok) return j;
          workshopAuthSetToken(j.result.token);
          return workshopAuthRefresh(call).then(function () {
            return j;
          });
        });
      }

      function workshopLogout() {
        function done() {
          workshopAuthSetToken("");
          return workshopAuthRefresh(workshopApiCall);
        }
        return workshopApiCall("auth.logout", {}).then(done, done);
      }

      // Asks the person for name and PIN (one dialog for all the callers). Resolves true when logged in, false when cancelled.
      // now = true when the person pressed "log in" (the dialog opens even if it was cancelled a moment ago).
      function workshopAuthAsk(call, now) {
        var s = workshopAuthState();
        if (s.flight) return s.flight;
        // Only a call that fails right after a touch (the person's action: Home, a button...) may open the dialog, and never inside
        // the quiet period that follows a cancel: the action still says why it did not run (refusal toast).
        var touched = now || Date.now() - (s.gestureAt || 0) < WORKSHOP_AUTH_GESTURE_MS;
        // Nothing opens the dialog by itself (a poll, a refresh): it was a nuisance each time the person only wanted to look.
        // Only a touch just before the failed call, or the "sign in" button, asks; otherwise the "not signed in" chip tells.
        if (!touched) return Promise.resolve(false);
        if (now) s.quietUntil = 0;
        // after cancelling, not even a touch brings it back: the refusal toast and the chip button tell what to do
        if (Date.now() < s.quietUntil) return Promise.resolve(false);
        workshopAuthSetToken("");
        s.flight = workshopPinDialog(function (name, pin) {
          return workshopAuthLogin(call, name, pin).then(function (j) {
            if (j.ok) return null;
            var e = j.error || {};
            return { code: e.code, message: e.message, wait_s: e.wait_s };
          });
        }, workshopApiT).then(function (ok) {
          s.flight = null;
          if (!ok) s.quietUntil = Date.now() + WORKSHOP_AUTH_QUIET_MS;
          return ok;
        });
        return s.flight;
      }

      // The person pressed "log in": asks now.
      function workshopLogin() {
        return workshopAuthAsk(workshopApiCall, true).then(function (ok) {
          return ok;
        });
      }

      // A token the service gave in another answer (the first administrator just created): use it from now on.
      function workshopAdoptSession(token) {
        workshopAuthSetToken(token);
        return workshopAuthRefresh(workshopApiCall);
      }

      // Tells the service the person is still there (real use only), at most once a minute.
      function workshopAuthKeepalive(call) {
        var s = workshopAuthState();
        if (s.keepalive || typeof document === "undefined") return;
        s.keepalive = 1;
        var last = 0;
        function ping() {
          var now = Date.now();
          if (!workshopAuthToken() || now - last < WORKSHOP_AUTH_KEEPALIVE_MS) return;
          last = now;
          call("auth.keepalive", {}).catch(function () {});
        }
        ["pointerdown", "keydown", "touchstart"].forEach(function (ev) {
          document.addEventListener(ev, ping, { capture: true, passive: true });
        });
      }

      // A 403 reaches the pages as a clear message of their language (key plugins.WorkshopService.api.forbidden_*), not as a raw error.
      function workshopApiForbidden(e, j) {
        var reason = ["mode", "mode_unknown", "camera"].indexOf(e.reason) >= 0 ? e.reason : "role";
        var key = "forbidden_" + reason;
        var params = { role: workshopApiT("role_" + e.role), needed: workshopApiT("role_" + e.needed_role), mode: String(e.mode || "").toUpperCase() };
        var text = e.role ? workshopApiT(key, params) : e.message;
        var err = workshopApiError("forbidden", text, j);
        err.key = "plugins.WorkshopService.api." + key;
        err.params = params;
        err.reason = e.reason || "role";
        return err;
      }
