      // ---- Start-up card: the small pieces of its look (icons, tones, the chip of the page header, the progress of the dialog) ----
      // Plain functions used by workshopStartupInRun / workshopStartupInput (16-startup.js); nothing here keeps state. The session rules of the
      // card are 16-startup-session.js; the pure decisions 16-startup-wizard.js.

      var WORKSHOP_STARTUP_ICONS = {
        light: "M12,2A7,7 0 0,0 5,9C5,11.38 6.19,13.47 8,14.74V17A1,1 0 0,0 9,18H15A1,1 0 0,0 16,17V14.74C17.81,13.47 19,11.38 19,9A7,7 0 0,0 12,2M9,21A1,1 0 0,0 10,22H14A1,1 0 0,0 15,21V20H9V21Z",
        air: "M12,11A1,1 0 0,0 11,12A1,1 0 0,0 12,13A1,1 0 0,0 13,12A1,1 0 0,0 12,11M12.5,2C17,2 17.11,5.57 14.75,6.75C13.76,7.24 13.32,8.29 13.13,9.22C13.61,9.42 14.03,9.73 14.35,10.13C18.05,8.13 22.03,8.92 22.03,12.5C22.03,17 18.46,17.1 17.28,14.73C16.78,13.74 15.72,13.3 14.79,13.11C14.59,13.59 14.28,14 13.88,14.34C15.87,18.03 15.08,22 11.5,22C7,22 6.91,18.42 9.27,17.24C10.25,16.75 10.69,15.71 10.89,14.79C10.4,14.59 9.97,14.27 9.65,13.87C5.96,15.85 2,15.07 2,11.5C2,7 5.56,6.89 6.74,9.26C7.24,10.25 8.29,10.69 9.22,10.88C9.41,10.4 9.73,9.97 10.14,9.65C8.15,5.96 8.94,2 12.5,2Z",
        source: "M16,7V3H14V7H10V3H8V7H8C7,7 6,8 6,9V14.5L9.5,18V21H14.5V18L18,14.5V9C18,8 17,7 16,7Z",
        file: "M13,9H18.5L13,3.5V9M6,2H14L20,8V20A2,2 0 0,1 18,22H6C4.89,22 4,21.1 4,20V4C4,2.89 4.89,2 6,2M15,18V16H6V18H15M18,14V12H6V14H18Z",
        service: "M4,1H20A1,1 0 0,1 21,2V6A1,1 0 0,1 20,7H4A1,1 0 0,1 3,6V2A1,1 0 0,1 4,1M4,9H20A1,1 0 0,1 21,10V14A1,1 0 0,1 20,15H4A1,1 0 0,1 3,14V10A1,1 0 0,1 4,9M4,17H20A1,1 0 0,1 21,18V22A1,1 0 0,1 20,23H4A1,1 0 0,1 3,22V18A1,1 0 0,1 4,17M9,5H10V3H9V5M9,13H10V11H9V13M9,21H10V19H9V21M5,3V5H7V3H5M5,11V13H7V11H5M5,19V21H7V19H5Z",
        rocket: "M2.81,14.12L5.64,11.29L8.17,10.79C11.39,6.41 17.55,4.22 19.78,4.22C19.78,6.45 17.59,12.61 13.21,15.83L12.71,18.36L9.88,21.19L9.17,17.66C7.76,17.66 7.76,17.66 7.05,16.95C6.34,16.24 6.34,16.24 6.34,14.83L2.81,14.12M5.64,16.95L7.05,18.36L4.39,21.03H2.97V19.61L5.64,16.95M17,9A1,1 0 0,0 16,8A1,1 0 0,0 15,9A1,1 0 0,0 16,10A1,1 0 0,0 17,9Z",
        close: "M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z",
        ready: "M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,16.5L6.5,12L7.91,10.59L11,13.67L16.59,8.09L18,9.5L11,16.5Z",
      };

      function workshopStartupIcon(nombre, size, color) {
        var e = document.createElement("span");
        e.style.cssText = "flex:none;display:inline-flex;width:" + size + "px;height:" + size + "px;color:" + color + ";";
        e.innerHTML = '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="currentColor" aria-hidden="true"><path d="' + (WORKSHOP_STARTUP_ICONS[nombre] || WORKSHOP_STARTUP_ICONS.file) + '"/></svg>';
        return e;
      }

      // colour of each state in the modal: text, soft background, border
      var WORKSHOP_STARTUP_TONE = {
        configured: { text: "#a5d6a7", background: "rgba(46,125,50,0.20)", edge: "rgba(165,214,167,0.35)" },
        example: { text: "var(--wf-n-down-text, #ffb74d)", background: "rgba(230,81,0,0.20)", edge: "rgba(255,183,77,0.35)" },
        missing: { text: "#ef9a9a", background: "rgba(198,40,40,0.22)", edge: "rgba(239,154,154,0.35)" },
        session: { text: "var(--wf-n-session-text, #90caf9)", background: "var(--wf-n-session-bg, rgba(30,136,229,0.10))", edge: "var(--wf-n-session, #1e88e5)" },
        na: { text: "#b0bec5", background: "rgba(69,90,100,0.30)", edge: "rgba(176,190,197,0.25)" },
      };

      // a row the person still has to deal with (what the assistant walks): missing, only the example, or not checkable without a session
      function workshopStartupPending(f) {
        return !!f && !f.hidden && !f.withoutData && (f.state === "missing" || f.state === "session" || f.state === "example");
      }

      // the chip of a card: a card that could not be checked says "No session" with the words of every session cover (no startup key of its own:
      // the generic startup texts are mirrored by every plugin catalog)
      function workshopStartupChipText(state) {
        return state === "session" ? workshopNoticeCoverTitle("session") : i18nT("startup.chip_" + state);
      }

      // The dialog has no page bar with the sign-in chip: signed out, ONE notice at the top carries the sentence and the sign-in button (the compact
      // strip of a page keeps the plain reason line: the bar of the page has the chip). null when somebody is signed in.
      function workshopStartupSessionNoticeEl() {
        if (typeof workshopSignedOut !== "function" || !workshopSignedOut()) return null;
        return workshopNoticeEl("session", "section", { text: workshopNoticeText("session"), action: "sign-in" });
      }

      // The progress of the dialog: how many of the shown rows are ready, the bar and the hint. null while rows could not be checked (no session):
      // "0 of 1 ready" said that something was missing on the machine when only the session was.
      function workshopStartupProgressEl(res) {
        if (res.session) return null;
        var lists = res.total - res.pending;
        var prog = workshopStartupEl("div", "display:flex;flex-direction:column;gap:8px;");
        var line = workshopStartupEl("div", "display:flex;align-items:baseline;justify-content:space-between;gap:8px;");
        line.appendChild(workshopStartupEl("span", "font-weight:600;font-size:15px;", res.ready ? i18nT("startup.modal_all_ready") : i18nT("startup.modal_progress", { a: lists, b: res.total })));
        line.appendChild(workshopStartupEl("span", "font-size:12px;color:" + (res.ready ? "#a5d6a7" : "var(--wf-n-down-text, #ffb74d)") + ";", res.ready ? i18nT("startup.summary_ready") : i18nT("startup.summary_pending", { n: res.pending, total: res.total })));
        prog.appendChild(line);
        var pista = workshopStartupEl("div", "height:8px;border-radius:4px;background:rgba(255,255,255,0.10);overflow:hidden;");
        var pct = res.total ? Math.round((lists / res.total) * 100) : 100;
        pista.appendChild(workshopStartupEl("div", "height:100%;width:" + pct + "%;border-radius:4px;background:" + (res.ready ? "#43a047" : "#1e88e5") + ";"));
        prog.appendChild(pista);
        if (!res.ready) prog.appendChild(workshopStartupEl("div", "font-size:12px;color:#b0bec5;", i18nT("startup.modal_hint")));
        return prog;
      }

      // The head of the compact strip: the colour of its dot and its sentence. Nothing could be checked without a session: the session blue and the
      // sentence of every session notice, not the orange of a step to do.
      function workshopStartupStripHead(res) {
        var color = res.ready ? WORKSHOP_STARTUP_POINT.configured : res.pending ? WORKSHOP_STARTUP_POINT.example : WORKSHOP_STARTUP_POINT.session;
        var text = res.ready ? i18nT("startup.summary_ready") : res.pending ? i18nT("startup.summary_pending", { n: res.pending, total: res.total }) : workshopNoticeText("session");
        return { color: color, text: i18nT("startup.title") + " - " + text };
      }

      // The chip of the page header (2026-10-18): rocket + name; green when ready, orange with the number pending; chip only while something is
      // pending (2026-10-23), ready = a quiet icon, same dialog. Nothing to do but rows that could not be checked (nobody signed in): a quiet icon
      // in the session blue, no words (the bar of the page already carries the one "Sign in" chip; a second session notice next to it only repeated it).
      function workshopStartupBandPaint(box, icon, text, res) {
        var quiet = res.ready || !res.pending;
        box.style.cssText = quiet
          ? "display:inline-flex;align-items:center;box-sizing:border-box;margin:0;padding:4px;border-radius:50%;cursor:pointer;border:0;background:transparent;"
          : "display:inline-flex;align-items:center;gap:6px;box-sizing:border-box;margin:0;padding:2px 10px 2px 8px;border-radius:16px;font-size:12px;line-height:1.5;cursor:pointer;white-space:nowrap;border:1px solid rgba(128,128,128,0.4);background:transparent;";
        icon.style.color = res.ready ? "#66bb6a" : res.pending ? "var(--wf-n-down-text, #ffb74d)" : "var(--wf-n-session-text, #90caf9)";
        text.textContent = quiet ? "" : i18nT("startup.chip_pending", { n: res.pending }); // same words as the chip of the Vue pages (StartupPanel)
        var what = res.ready ? i18nT("startup.strip_ready") : res.pending ? i18nT("startup.strip_pending", { n: res.pending }) : workshopNoticeText("session");
        box.title = i18nT("startup.title") + " - " + what + " - " + (res.pending ? i18nT("startup.strip_setup") : i18nT("startup.strip_open"));
      }
