      // ---- ONE answer to "what is the session right now" (twin of vue/_shared36/session-state.js: keep them equal) ----
      //   workshopSessionStateOf({ identity, token, flight, lockUntil }, now)
      //        "resolving" | "pin-locked" | "signing-in" | "expired" | "signed-out" | "active"   (meaning: see the Vue file)
      //   workshopIsSignedOutState(state)        true when signing in may fix what does not work
      //   workshopAccessStateOf(state, allowed)  "resolving" | "ok" | "session" | "role"
      //   workshopSessionActionOf(access)        "sign-in" | "change-role" | "": the word of the button next to a lock (one name + PIN dialog serves both)
      // An accepted session stays "active" while the name + PIN dialog is open or a wrong PIN locked it: that dialog is "Change role" (another person
      // signs in on this browser) and the current session is kept until the new sign-in succeeds, so nothing may look signed out meanwhile.
      function workshopSessionStateOf(s, now) {
        var x = s || {};
        var id = x.identity;
        if (!id) return x.unreachable ? "active" : "resolving"; // the service did not answer: nothing waits for it (workshopCan says yes)
        if (!id.configured) return "active";
        if (x.token && !id.login_required) return "active";
        if (x.lockUntil && x.lockUntil > (now || Date.now())) return "pin-locked";
        if (x.flight) return "signing-in";
        if (x.token && id.login_required) return "expired";
        return "signed-out";
      }

      function workshopSessionActionOf(access) {
        return access === "session" ? "sign-in" : access === "role" ? "change-role" : "";
      }

      function workshopIsSignedOutState(state) {
        return state === "signed-out" || state === "signing-in" || state === "expired" || state === "pin-locked";
      }

      function workshopAccessStateOf(state, allowed) {
        if (state === "resolving") return "resolving";
        if (allowed) return "ok";
        return workshopIsSignedOutState(state) ? "session" : "role";
      }
