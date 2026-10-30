      // The preview of a file in the start-up assistant (2026-10-24): the lines that really run (no ";" in front) are highlighted,
      // the comments are dimmed. The same rule as workshopStartupLinesActive (16-startup-wizard.js).
      function workshopStartupCode(text) {
        var pre = workshopStartupEl("pre", "margin:0;padding:6px 0;max-height:220px;overflow:auto;border-radius:4px;background:rgba(0,0,0,0.35);font:11px/1.35 monospace;white-space:pre-wrap;overflow-wrap:anywhere;", "");
        String(text || "").split(/\r?\n/).forEach(function (line) {
          var x = line.trim();
          var active = x !== "" && x.charAt(0) !== ";";
          var row = workshopStartupEl("div", active ? "padding:0 8px;background:rgba(102,187,106,0.22);color:#c8e6c9;font-weight:600;box-shadow:inset 3px 0 0 #66bb6a;" : "padding:0 8px 0 11px;opacity:.6;", line || " ");
          pre.appendChild(row);
        });
        return pre;
      }
