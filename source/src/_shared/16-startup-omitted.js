      // ---- Start-up card: the functions the person decided not to use ----
      // `store` is {key, plugin, server}: the key of this browser's list, the plugin, and what the service remembers (settings "startup"), so the
      // kiosk and the phone agree. The card (16-startup.js) owns the store; these functions keep no state of their own.

      // this browser's list plus the service's
      function workshopStartupOmittedAll(store) {
        var local = workshopStartupHiddenRead(store.key);
        return local.concat(
          store.server.filter(function (id) {
            return local.indexOf(id) < 0;
          })
        );
      }

      function workshopStartupOmittedSave(store, list) {
        store.server = list.slice();
        workshopStartupHiddenSave(store.key, list);
        if (typeof workshopApi === "function") {
          var patch = {};
          patch[store.plugin] = list;
          workshopApi("settings.merge", { name: "startup", patch: patch }, { quiet: true, noLogin: true, byPerson: false }).catch(function () {
            /* a role below technician or no service: the decision stays in this browser */
          });
        }
      }

      function workshopStartupOmit(store, ids) {
        var all = workshopStartupOmittedAll(store);
        ids.forEach(function (id) {
          if (all.indexOf(id) < 0) all.push(id);
        });
        workshopStartupOmittedSave(store, all);
      }

      function workshopStartupUseAgain(store, ids) {
        workshopStartupOmittedSave(
          store,
          workshopStartupOmittedAll(store).filter(function (id) {
            return ids.indexOf(id) < 0;
          })
        );
      }
