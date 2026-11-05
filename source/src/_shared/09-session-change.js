      // ---- A change of identity cleans the page (ESTANDAR 3.1): the JS twin of onSessionChange(kind) of role-mixin.js ----
      //   workshopOnSessionChange(fn)      fn(kind) with kind "signed-in" | "signed-out" | "role-changed" | "known" (the first time the identity is known);
      //                                    returns the function that unsubscribes (register it with workshopOnStop)
      //   workshopOnSessionErrors(clear)   clear(kind) when what a refusal or failure said may be stale: the twin of the option sessionErrors of role-mixin.js
//                                    (signed-in too: the PIN fixes it). A view keeps its error in a local field and clears it here; "known" does not clear.
//   workshopWhenIdentityKnown(fn)    calls fn once, as soon as workshopIdentity() is not null (at once when it already is)
      // workshopIdentityView(null) says "full" (01-identity-view.js): a module that builds something depending on the identity waits for the second one.

      function workshopSessionKey() {
        var role = typeof workshopRole === "function" ? workshopRole() : "";
        return (role || "") + "|" + (typeof workshopSignedOut === "function" && workshopSignedOut() ? "out" : "in");
      }

      // Pure: what changed between the previous key (null = the identity was unknown) and the new one
      function workshopSessionChangeKind(last, key, known) {
        if (!known) return "";
        if (last === null || last === undefined) return "known";
        if (last === key) return "";
        var was = last.split("|")[1];
        var now = key.split("|")[1];
        if (now === "out") return "signed-out";
        if (was === "out") return "signed-in";
        return "role-changed";
      }

      function workshopOnSessionChange(fn) {
        var last = workshopIdentity() ? workshopSessionKey() : null;
        return workshopOnIdentity(function (id) {
          var key = workshopSessionKey();
          var kind = workshopSessionChangeKind(last, key, !!id);
          if (id) last = key;
          if (kind) fn(kind);
        });
      }

      // Pure: does this change leave an error on screen stale? (the same three kinds role-mixin.js resets)
      function workshopSessionClearsErrors(kind) {
        return kind === "signed-in" || kind === "signed-out" || kind === "role-changed";
      }

      function workshopOnSessionErrors(clear) {
        return workshopOnSessionChange(function (kind) {
          if (workshopSessionClearsErrors(kind)) clear(kind);
        });
      }

      function workshopWhenIdentityKnown(fn) {
        if (workshopIdentity()) {
          fn();
          return function () {};
        }
        var off = workshopOnIdentity(function (id) {
          if (!id) return;
          off();
          fn();
        });
        return off;
      }
