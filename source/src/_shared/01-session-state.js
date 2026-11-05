      // ---- ONE answer to "what is the session right now" (twin of vue/_shared36/session-state.js: keep them equal) ----
      //   workshopSessionStateOf({ identity, token, flight, lockUntil }, now)
      //        "resolving" | "pin-locked" | "signing-in" | "expired" | "signed-out" | "active"   (meaning: see the Vue file)
      //   workshopIsSignedOutState(state)        true when signing in may fix what does not work
      //   workshopAccessStateOf(state, allowed)  "resolving" | "ok" | "session" | "role"
      function workshopSessionStateOf(s, now) {
        var x = s || {};
        var id = x.identity;
        if (!id) return x.unreachable ? "active" : "resolving"; // the service did not answer: nothing waits for it (workshopCan says yes)
        if (!id.configured) return "active";
        if (x.lockUntil && x.lockUntil > (now || Date.now())) return "pin-locked";
        if (x.flight) return "signing-in";
        if (x.token && id.login_required) return "expired";
        if (!x.token) return "signed-out";
        return "active";
      }

      function workshopIsSignedOutState(state) {
        return state === "signed-out" || state === "signing-in" || state === "expired" || state === "pin-locked";
      }

      function workshopAccessStateOf(state, allowed) {
        if (state === "resolving") return "resolving";
        if (allowed) return "ok";
        return workshopIsSignedOutState(state) ? "session" : "role";
      }
