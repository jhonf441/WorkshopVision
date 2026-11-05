      // ---- the start-up card follows the session (2026-11-04) ----
      // The i18n key of what the service row says when it is "missing". refusal is the code the service refused examples.list with
      // ("login_required", "forbidden") or "" for a real failure (network, 5xx, service down: only that one is "not running").
      function workshopStartupServiceKey(refusal, signedOut) {
        if (refusal === "login_required" || signedOut) return "startup.service_sign_in";
        if (refusal === "forbidden") return "startup.service_role";
        return "startup.service_not_running";
      }

      // The session changes (signed in, signed out, another role): the row is asked again so it is not stale; the listener goes with the card.
      function workshopStartupFollowSession(el, refrescar) {
        if (typeof workshopOnIdentity !== "function") return;
        var seenInPage = false;
        var identityOff = workshopOnIdentity(function () {
          if (typeof pluginStopped !== "undefined" && pluginStopped) return identityOff();
          if (el.isConnected) seenInPage = true;
          else if (seenInPage) return identityOff(); // the card left the page
          refrescar().catch(function () {});
        });
        if (typeof workshopOnStop === "function") workshopOnStop(identityOff);
      }
