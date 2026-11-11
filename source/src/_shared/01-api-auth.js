      // ---- Identity of the person using this browser (F1-A of the redesign, 2026-10-21) ----
      // The roles are applied by the SERVICE; this only keeps the session token, tells the pages what to hide and runs the PIN
      // dialog (01-api-pin.js) when the service answers 401 login_required. Same logic for the Vue pages in
      // vue/_shared/workshop-auth.js: keep them equal.
      //
      //   workshopAuthHeaders()          {"X-Workshop-Token", "X-Workshop-Device"} for every call to the API
      //   workshopCan("lights.save")     false when the role cannot call it (hide the button; the service refuses it anyway)
      //   workshopIdentity()             last auth.whoami answer ({role, user, table, ...}) or null
      //   workshopOnIdentity(fn)         fn(identity) when the person logs in, out or the role changes; returns the off function
      //   workshopLogin()                the ONE name + PIN dialog ("Sign in" without a session, "Change role" with one: the session stays until the new one is accepted)
      //   workshopSessionAction(op)      "sign-in" | "change-role" | "": the word of the button next to a lock
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
      var WORKSHOP_AUTH_AFTER_LOGOUT_MS = 20000; // after signing out, a failing call does not open the PIN dialog by itself this long

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

      // The service has users and this browser has no session (the person is a visitor, or nothing is allowed yet): no token, or a token the
      // service no longer accepts (expired, another machine): its answer to whoami says login_required. Same rule as the header of the Vue pages.
      function workshopSignedOut() {
        return workshopIsSignedOutState(workshopSessionState());
      }

      // "resolving" | "signed-out" | "signing-in" | "active" | "expired" | "pin-locked" (01-session-state.js)
      function workshopSessionState() {
        var s = workshopAuthState();
        return workshopSessionStateOf({ identity: s.identity, token: workshopAuthToken(), flight: s.flight, lockUntil: s.lockUntil, unreachable: s.whoamiFailed }, Date.now());
      }

      // "resolving" | "ok" | "session" | "role" for one operation
      function workshopAccessState(op, ctx) {
        return workshopAccessStateOf(workshopSessionState(), workshopCan(op, ctx));
      }

      // Why the person cannot call an operation: "" (they can), "signed_out" (signing in may fix it) or "role" (only another role does).
      function workshopAccessReason(op, ctx) {
        var a = workshopAccessState(op, ctx);
        return a === "session" ? "signed_out" : a === "role" ? "role" : "";
      }

      // The word of the button next to a lock: "sign-in" (nobody is signed in), "change-role" (someone is, with a role that is too low: another
      // person signs in, the current session stays until that succeeds) or "" (nothing blocks). Both words open the ONE dialog: workshopLogin().
      function workshopSessionAction(op, ctx) {
        return workshopSessionActionOf(workshopAccessState(op, ctx));
      }

      // The session state changed without a new answer of the service (the PIN dialog opened or closed, the PIN got locked)
      function workshopAuthNotifyState() {
        var s = workshopAuthState();
        s.listeners.slice().forEach(function (fn) {
          try {
            fn(s.identity);
          } catch (e) {
            /* a listener must not break the others */
          }
        });
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
      function workshopAuthListed(list, op) {
        return Object.prototype.toString.call(list) === "[object Array]" && list.indexOf(op) >= 0;
      }

      function workshopCan(op, ctx) {
        ctx = ctx || {};
        var id = workshopAuthState().identity;
        if (!id || !id.table) return true;
        // users exist and nobody is signed in (role null): a VISITOR, who can only look and stop; it used to say yes to everything
        if (!id.role && !id.configured) return true;
        var t = id.table;
        if ((t.stop || []).indexOf(op) >= 0) return true;
        // A custom role (auth.whoami allow / deny, exact operation names): a denial wins, a grant adds what the base role cannot do. Without the
        // lists (an older service, a base role) nothing changes. The service decides again on every call.
        if (workshopAuthListed(id.deny, op)) return false;
        var granted = workshopAuthListed(id.allow, op);
        var role = id.role || "viewer";
        var need = (t.ops || {})[op] || "admin";
        var baseNeed = need;
        var esc = (t.escalate || {})[op]; // some operations need more when their arguments change settings
        if (esc) {
          var v = (ctx.args || {})[esc.arg];
          var hit = esc.when_present ? !!v : (esc.unless_in || []).indexOf(String(v || "")) < 0;
          if (hit && WORKSHOP_AUTH_RANK[esc.role] > WORKSHOP_AUTH_RANK[need]) need = esc.role;
        }
        if (role === "viewer" && (t.camera || []).indexOf(op) >= 0) return !!(id.user && id.user.camera);
        if (WORKSHOP_AUTH_RANK[role] === undefined) return false;
        var escalated = need !== baseNeed; // a grant never lifts what the arguments escalated
        if (WORKSHOP_AUTH_RANK[role] < WORKSHOP_AUTH_RANK[need] && !(granted && !escalated)) return false;
        if (role === "operator" && (t.mode_gated || []).indexOf(op) >= 0 && ctx.mode) {
          var modes = (id.user && id.user.modes) || [];
          return modes.length >= (t.modes || []).length || modes.indexOf(String(ctx.mode).toLowerCase()) >= 0;
        }
        return true;
      }

      // call(op, args) must resolve the JSON body of the API ({ok, result, error}) and never ask for a login itself.
      function workshopAuthRefresh(call) {
        function answered(j) {
          // the service did not answer: the session stays unknown but it is not "resolving" any more
          workshopAuthState().whoamiFailed = !(j && j.ok);
          if (j && j.ok) workshopAuthSetIdentity(j.result);
          return j && j.ok ? j.result : null;
        }
        return call("auth.whoami", {}).then(answered, function () {
          return answered(null);
        });
      }

      // A sign-in on a browser that still holds an accepted session is a CHANGE of person ("Change role", 2026-11-09): the session that was there is
      // kept until the service accepts the new name and PIN; only then is it closed (with its own token, still in the headers) and the new one
      // adopted. A refused or cancelled attempt leaves the current session as it was.
      function workshopAuthLogin(call, name, pin) {
        var before = workshopAuthToken();
        return call("auth.login", { name: name, pin: pin }).then(function (j) {
          if (!j.ok) return j;
          var closeOld = before && before !== j.result.token ? call("auth.logout", {}).then(null, function () { return null; }) : Promise.resolve(null);
          return closeOld.then(function () {
            workshopAuthSetToken(j.result.token);
            return workshopAuthRefresh(call);
          }).then(function () {
            return j;
          });
        });
      }

      function workshopLogout() {
        // The tap on "sign out" is a touch, and signing out makes the pages reload what they show: those reads fail (nobody is signed in)
        // inside the window of that touch and used to open the PIN dialog again, so the session seemed never to close. After signing out
        // the touch is forgotten and nothing opens the dialog by itself for a while; the "sign in" button and a later touch still do.
        var st = workshopAuthState();
        st.gestureAt = 0;
        st.quietUntil = Date.now() + WORKSHOP_AUTH_AFTER_LOGOUT_MS;
        function done() {
          st.gestureAt = 0;
          workshopAuthSetToken("");
          return workshopAuthRefresh(workshopApiCall);
        }
        return workshopApiCall("auth.logout", {}).then(done, done);
      }

      // Asks the person for name and PIN (one dialog for all the callers: "Sign in" and "Change role" are the same dialog). Resolves true when logged
      // in, false when cancelled. now = true when the person pressed the button (the dialog opens even if it was cancelled a moment ago).
      // The session this browser has (if any) is NOT touched here: it is kept until workshopAuthLogin adopts the new one, so a cancelled or refused
      // "Change role" leaves the person signed in as before.
      function workshopAuthAsk(call, now) {
        var s = workshopAuthState();
        if (s.flight) return s.flight;
        // Only a call that fails right after a touch (the person's action: Home, a button...) may open the dialog, and never inside
        // the quiet period that follows a cancel: the action still says why it did not run (refusal toast).
        // Nothing opens the dialog by itself (a poll, a refresh, not even a touch on a locked control): only the "sign in" button asks.
        // A refused touch makes the "not signed in" chip blink instead (workshopSessionAttention).
        if (!now) return Promise.resolve(false);
        if (now) s.quietUntil = 0;
        // after cancelling, not even a touch brings it back: the refusal toast and the chip button tell what to do
        if (Date.now() < s.quietUntil) return Promise.resolve(false);
        s.flight = workshopPinDialog(function (name, pin) {
          return workshopAuthLogin(call, name, pin).then(function (j) {
            if (j.ok) {
              s.lockUntil = 0;
              return null;
            }
            var e = j.error || {};
            s.lockUntil = e.wait_s > 0 ? Date.now() + e.wait_s * 1000 : 0;
            workshopAuthNotifyState();
            return { code: e.code, message: e.message, wait_s: e.wait_s };
          });
        }, workshopApiT).then(function (ok) {
          s.flight = null;
          if (!ok) s.quietUntil = Date.now() + WORKSHOP_AUTH_QUIET_MS;
          workshopAuthNotifyState();
          return ok;
        });
        workshopAuthNotifyState();
        return s.flight;
      }

      // The person pressed "Sign in" or "Change role": asks now. The ONE entry point of every button that asks for a name and a PIN (the chips, the
      // notices, the locked launchers of the bar, the Jog and the camera).
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

      // The page was in the background (another tab or window) while the person signed in or out there: the storage event can be missed (a throttled or
      // frozen tab, a page restored from the back/forward cache), and the page kept saying "no session". When it comes back to the front the token of the
      // browser is compared with the one this page knows, and who the service says the person is is asked again when that disagrees with the token.
      function workshopAuthReconcile(call) {
        var s = workshopAuthState();
        var stored = "";
        try {
          stored = workshopAuthStore("localStorage").getItem(WORKSHOP_AUTH_TOKEN_KEY) || "";
        } catch (e) {
          stored = s.token || "";
        }
        var staleAnswer = !!(s.token && s.identity && s.identity.login_required);
        if (stored !== (s.token || "") || staleAnswer) {
          s.token = stored;
          workshopAuthRefresh(call).catch(function () {});
        }
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
        document.addEventListener("visibilitychange", function () {
          if (document.visibilityState === "visible") workshopAuthReconcile(call);
        });
        if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
          window.addEventListener("focus", function () { workshopAuthReconcile(call); });
          window.addEventListener("pageshow", function (e) { if (e.persisted) workshopAuthReconcile(call); });
        }
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
