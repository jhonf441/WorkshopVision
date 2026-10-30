      // ---- Shared settings files with a revision (F1-B) ----
      // The files every page edits (jog.json, laser.json, cameras.json, vision.json...) used to be read whole,
      // changed and written whole: two people at the same time and the last one silently erased the other's work.
      // The service now keeps a revision of each file (operations settings.get / settings.set):
      //
      //   workshopSettings.load("laser").then(r => r.value, r.rev)
      //   workshopSettings.save("laser", function (cfg) { cfg.watts = 30; })   // the mutator changes the copy it is given
      //                                                                       // (or returns a new value); resolves {value, rev}
      //
      // save() reads, applies the mutator, writes with the rev it read. If someone else saved in between ("conflict") it
      // applies the mutator again over what the service answers and tries ONCE more; if that also conflicts it rejects an
      // Error with .code "conflict" whose text is "Another person changed this: reload or save as a copy" (show e.message).
      // Same logic in vue/_shared/settings.js: keep them equal (tests/settings-pair.test.js).
      function workshopSettingsMake(api, conflictText, makeError) {
        function clone(v) {
          return v === null || v === undefined ? {} : JSON.parse(JSON.stringify(v));
        }
        function load(name) {
          return api("settings.get", { name: name }).then(function (r) {
            return { value: r.value, rev: String(r.rev) };
          });
        }
        function applied(mutator, value) {
          var draft = clone(value);
          var out = mutator(draft);
          return out === undefined ? draft : out;
        }
        // one attempt: {value, rev} when saved, {current} when someone else saved first
        function attempt(name, mutator, base) {
          var value = applied(mutator, base.value);
          return api("settings.set", { name: name, value: value, base_rev: base.rev }).then(
            function (r) {
              return { saved: { value: value, rev: String(r.rev) } };
            },
            function (e) {
              if (e && e.code === "conflict") return { current: e.body && e.body.error && e.body.error.current };
              throw e;
            }
          );
        }
        function save(name, mutator) {
          return load(name).then(function (base) {
            return attempt(name, mutator, base).then(function (first) {
              if (first.saved) return first.saved;
              var again = first.current ? Promise.resolve({ value: first.current.value, rev: String(first.current.rev) }) : load(name);
              return again.then(function (cur) {
                return attempt(name, mutator, cur).then(function (second) {
                  if (second.saved) return second.saved;
                  throw makeError("conflict", conflictText(), second);
                });
              });
            });
          });
        }
        return { load: load, save: save };
      }

      var workshopSettings = workshopSettingsMake(workshopApi, function () { return i18nT('core.settings_conflict'); }, workshopApiError);
