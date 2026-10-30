      // ---- Start-up summary for the service (2026-10-24) ----
      //
      // The service keeps one line per plugin (readiness.report) so its page can list what is left in ALL of them. The card
      // calls this where it used to call opts.onChange: it reports, then passes the result on.
      // Only when the card already read its files (a card that did not hear from the service must not say "ready"), only when
      // the numbers changed, and never asking for a PIN: a background report is not worth a dialog.
      var workshopStartupReported = {};
      function workshopStartupReport(plugin, res, read, onChange) {
        if (onChange) onChange(res);
        if (!read || !res || typeof workshopApi !== "function") return;
        var key = res.pending + "/" + res.total;
        if (workshopStartupReported[plugin] === key) return;
        workshopStartupReported[plugin] = key;
        workshopApi("readiness.report", { plugin: plugin, pending: res.pending, total: res.total }, { noLogin: true, quiet: true, byPerson: false }).catch(function () {
          delete workshopStartupReported[plugin]; // try again at the next repaint
        });
      }
