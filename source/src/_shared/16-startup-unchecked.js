      // ---- Start-up card: the state "unchecked" (2026-11-20) ----
      // A row whose data could not be READ now (the board is off or disconnected, the connection dropped, the session ended) is not "missing" (red:
      // "you have to create it") and not "ready" (green): it is "unchecked" (grey-blue, "Sin comprobar") with the cause and a "Check again" button.
      // The check of a row says it by answering {state: "unchecked", text: "<i18n key of the cause>"}; a plain state string works as before.
      // Nothing here draws a card; 16-startup.js and 16-startup-view.js call these.

      // Puts the answer of a check on the row copy. answer: "configured" | "example" | "missing" | "session" | "unchecked" | "na", or {state, text}.
      function workshopStartupApplyCheck(row, answer) {
        var state = answer && typeof answer === "object" ? answer.state : answer;
        row.state = state;
        if (answer && typeof answer === "object" && answer.text) {
          var texts = {};
          Object.keys(row.texts || {}).forEach(function (k) {
            texts[k] = row.texts[k];
          });
          texts[state] = answer.text; // the sentence of this answer replaces the fixed one of the row for this state
          row.texts = texts;
        }
      }

      // The button of an unchecked row: asks the card to read everything again.
      function workshopStartupRecheckButton(refresh) {
        return workshopStartupButton(i18nT("startup.recheck"), i18nT("startup.recheck_tip"), function () {
          refresh().catch(function () {});
        }, "soft");
      }
