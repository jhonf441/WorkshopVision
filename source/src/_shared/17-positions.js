      // ---- Saved positions: the one place that reads and writes 0:/sys/workshop/data/positions.json ----
      //
      // [{name, x, y, z}] in MACHINE coordinates (where the pointer was). The jog, the Workbench zones
      // page, the cuts center finder and Vision all save here. So that two screens do not overwrite
      // each other, every change goes through workshopPosUpdate: it reads the FRESH file, applies the
      // change, saves it and notifies the listeners (workshopPosListeners) with the new list.
      var WORKSHOP_POS_FILE = "0:/sys/workshop/data/positions.json";
      var workshopPosListeners = [];

      function workshopPosClean(list) {
        return Array.isArray(list)
          ? list.filter(function (q) {
              return q && isFinite(q.x) && isFinite(q.y);
            })
          : [];
      }

      function workshopPosRead() {
        return fetch("/machine/file/" + encodeURI(WORKSHOP_POS_FILE) + "?_=" + Date.now(), { cache: "no-store" })
          .then(function (r) {
            return r.ok ? r.json() : [];
          })
          .then(workshopPosClean)
          .catch(function () {
            return [];
          });
      }

      function workshopPosNotify(list) {
        workshopPosListeners.forEach(function (fn) {
          try {
            fn(list.slice());
          } catch (e) {
            console.error("[Workshop] positions:", e);
          }
        });
      }

      // fn(list) -> new list (it may change the list in place and return it).
      function workshopPosUpdate(fn) {
        return workshopPosRead().then(function (list) {
          var nl = fn(list) || list;
          return fetch("/machine/file/" + encodeURI(WORKSHOP_POS_FILE), {
            method: "PUT",
            headers: { "Content-Type": "application/octet-stream" },
            body: JSON.stringify(nl, null, 1),
          }).then(function (r) {
            if (!r.ok) throw new Error(i18nT('positions.http_saving_the_positions', { status: r.status }));
            workshopPosNotify(nl);
            return nl;
          });
        });
      }

      // Same identity the jog uses: name + coordinates (not the index, which may change if another
      // screen added/deleted in the meantime).
      function workshopPosSame(a, b) {
        return a && b && a.name === b.name && Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.y - b.y) < 1e-6 && Math.abs((a.z || 0) - (b.z || 0)) < 1e-6;
      }

      function workshopPosNextName(list) {
        var n = 0;
        list.forEach(function (p) {
          var m = /^Pos (\d+)$/.exec(p.name || "");
          if (m) n = Math.max(n, parseInt(m[1], 10));
        });
        return "Pos " + (Math.max(n, list.length) + 1);
      }
