      // ---- Start-up summary for the service (2026-10-24) ----
      //
      // The service keeps one line per plugin (readiness.report) so its page can list what is left in ALL of them. The card
      // calls this where it used to call opts.onChange: it reports, then passes the result on.
      // Only when the card already read its files (a card that did not hear from the service must not say "ready"), only when
      // the numbers changed, never while a row could not be checked (res.unchecked: the totals would say "ready" about what was not read), and never asking for a PIN: a background report is not worth a dialog.
      var workshopStartupReported = {};
      // The rows as the machine says them (before the decisions) and the ids put away: the service applies the same decisions itself (startup_summary.py)
      function workshopStartupDetail(rows, omitted) {
        return {
          rows: (rows || [])
            .filter(function (f) {
              return !f.withoutData && f.rawState !== "na" && f.rawState !== "skipped";
            })
            .map(function (f) {
              return { id: f.id, state: f.rawState, optional: !!f.optional };
            }),
          omitted: (omitted || []).slice(),
        };
      }

      function workshopStartupReport(plugin, res, read, onChange, detail) {
        if (onChange) onChange(res);
        if (!read || !res || res.unchecked || typeof workshopApi !== "function") return;
        var key = res.pending + "/" + res.total + "/" + res.skipped + "/" + JSON.stringify(detail || null);
        if (workshopStartupReported[plugin] === key) return;
        workshopStartupReported[plugin] = key;
        var args = { plugin: plugin, pending: res.pending, total: res.total };
        if (detail) {
          args.rows = detail.rows;
          args.omitted = detail.omitted;
        }
        if (res.skipped) args.skipped = res.skipped; // "N optional not in use" for the service page (sent only when there is any: an older service does not know the field)
        workshopApi("readiness.report", args, { noLogin: true, quiet: true, byPerson: false }).catch(function () {
          delete workshopStartupReported[plugin]; // try again at the next repaint
        });
      }
