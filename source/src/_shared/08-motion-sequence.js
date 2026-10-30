      // ---- A sequence that moves the machine holds the reservation of the movement (F1-D, 2026-10-21) ----
      // The pages that send several moves one after another (Level Z...) used to ask motion.ask only at each code: between two
      // points another person's jog could move the head. workshopWithMotion takes the reservation of WorkshopService first
      // (motion.reserve, owned by this browser and person), renews it while the sequence lasts and ALWAYS releases it, also when
      // the sequence fails. A service that is outdated or does not answer does not block (the page keeps its own checks).
      //
      //   workshopWithMotion(text, run) -> Promise: the result of run(); rejects with the refusal (code motion_denied, with the
      //   name of whoever has the control) or with the error of run().
      var WORKSHOP_SEQUENCE_S = 60;
      var WORKSHOP_SEQUENCE_RENEW_MS = 20000;

      function workshopWithMotion(text, run) {
        var held = null;
        var timer = null;
        function release() {
          if (timer) clearInterval(timer);
          timer = null;
          var h = held;
          held = null;
          return h ? Promise.resolve(h.release()).catch(function () {}) : Promise.resolve();
        }
        return workshopReserveMotion(workshopApiOrigin(), "sequence", text, WORKSHOP_SEQUENCE_S)
          .then(
            function (h) {
              held = h;
              timer = setInterval(function () {
                if (held) held.renew(WORKSHOP_SEQUENCE_S).catch(function () {});
              }, WORKSHOP_SEQUENCE_RENEW_MS);
            },
            function (e) {
              if (e && (e.code === "service_outdated" || e.code === "unavailable")) return null;
              throw e;
            }
          )
          .then(function () {
            return run();
          })
          .then(
            function (r) {
              return release().then(function () { return r; });
            },
            function (e) {
              return release().then(function () { throw e; });
            }
          );
      }
