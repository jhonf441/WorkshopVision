      // ---- Machine profile + capabilities of the service (F2, 2026-10-21) ----
      // What the machine HAS (capabilities.get, discovered from the board) and what its owner DECLARED (profile.get: macros by
      // role, meter, currency...). Same logic in vue/_shared/machine-profile-core.js: keep them equal
      // (tests/profile-pair.test.js runs both over the same scenarios).
      //
      //   workshopProfile.get().then(function () { ... })        cached 60 s, one request at a time, never rejects
      //   workshopProfile.has("laser", true)                     true / false once known; the 2nd argument is the answer while unknown
      //   workshopProfile.macro("focus")                         path of the macro of that role, null if the file does not exist
      //   workshopProfile.meterAvailable()                       true / false / null (null = not known yet: show everything)
      // A service older than this version has no profile.get: the profile stays unknown and nothing is hidden.

      var WORKSHOP_DEFAULT_MACROS = {
        focus: "0:/macros/focus.g",
        home: "0:/sys/homeall.g",
        light: "0:/macros/light.g",
        air: "0:/macros/air.g",
        shutdown: "0:/macros/shutdown.g",
        park: "0:/macros/park.g",
      };
      var WORKSHOP_PROFILE_TTL_MS = 60000;

      function workshopProfileCreate(fetchAll, now) {
        var clock = now || function () { return Date.now(); };
        var st = { loaded: false, at: 0, pending: null, view: null, caps: null, error: null };
        function snapshot() {
          return { loaded: st.loaded, profile: st.view && st.view.profile, caps: st.caps, error: st.error };
        }
        function get(force) {
          if (!force && st.loaded && clock() - st.at < WORKSHOP_PROFILE_TTL_MS) return Promise.resolve(snapshot());
          if (st.pending) return st.pending;
          st.pending = Promise.resolve().then(fetchAll).then(function (r) {
            st.view = (r && r.profile) || null;
            st.caps = (r && r.caps) || null;
            st.loaded = !!(st.view && st.view.profile);
            st.error = null;
            st.at = clock();
          }).catch(function (e) {
            st.error = e || new Error("profile unavailable");
          }).then(function () {
            st.pending = null;
            return snapshot();
          });
          return st.pending;
        }
        function cap(name) {
          return st.caps && st.caps.capabilities && st.caps.capabilities[name];
        }
        function has(name, whenUnknown) {
          var c = cap(name);
          if (!st.loaded || !c) return !!whenUnknown;
          return !!c.present;
        }
        function macro(role) {
          var resolved = st.view && st.view.resolved_macros;
          if (st.loaded && resolved && role in resolved) return resolved[role] || null;
          return WORKSHOP_DEFAULT_MACROS[role] || null;
        }
        function meterAvailable() {
          if (!st.loaded) return null;
          var c = cap("meter");
          if (c && c.disabled_by_profile) return false;
          if (c && c.present) return true;
          var m = st.view.profile.meter;
          return !!(m && m.kind && m.kind !== "none");
        }
        function currency() {
          return (st.loaded && st.view.profile.currency) || "";
        }
        function axisIndex(letter) {
          var idx = st.view && st.view.axis_indexes;
          return st.loaded && idx && idx[letter] !== undefined ? idx[letter] : null;
        }
        function reset() {
          st.loaded = false; st.at = 0; st.view = null; st.caps = null; st.error = null;
        }
        return {
          get: get, has: has, macro: macro, meterAvailable: meterAvailable, currency: currency, axisIndex: axisIndex,
          snapshot: snapshot, reset: reset, error: function () { return st.error; }, loaded: function () { return st.loaded; },
        };
      }

      var workshopProfile = workshopProfileCreate(function () {
        return Promise.all([workshopApi("profile.get"), workshopApi("capabilities.get")]).then(function (r) {
          return { profile: r[0], caps: r[1] };
        });
      });
