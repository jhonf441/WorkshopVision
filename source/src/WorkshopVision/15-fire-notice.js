      // ---- Fire watch countdown on ALL screens ----
      //
      // 2026-10-12 (pending 7 of the diagnosis: "it paused 2 times because of smoke
      // without prior notice"): before pausing or cutting, dsf/fuego.py does a
      // countdown. This bar shows it at the top on any DWC screen
      // (not only in Vision) with the button to cancel.
      // Lightweight: without a job in progress (according to the state DWC already has) it asks
      // for nothing; with a job it queries /fuego/estado every 1.5 s (a small JSON).
      (function tvFireNotice() {
        var bar = null,
          timer = null,
          parado = false,
          errors = 0;

        function hasJob() {
          try {
            var m = workshopHostModel();
            var st = m.state && m.state.status;
            if (st === "processing" || st === "simulating" || st === "resuming") return true;
            var p = workshopPluginOf(m.plugins, "service");
            var dv = workshopPluginData(p);
            var v = dv && dv.liveJob;
            return !!(v && v.active);
          } catch (e) {
            return false;
          }
        }

        function quitar() {
          if (bar) bar.remove();
          bar = null;
        }

        function paint(c) {
          if (!c) {
            if (bar && bar.querySelector("button").style.display === "none") return; // cancelled message: it goes away by itself
            return quitar();
          }
          var pause = c.action === "pause";
          if (!bar) {
            bar = document.createElement("div");
            bar.id = "workshop-fire-count";
            bar.setAttribute("role", "alert");
            // debajo de la barra roja de riesgo activo (04-warnings.js), relleno de aviso
            bar.style.cssText = "position:fixed;top:30px;left:50%;transform:translateX(-50%);z-index:2147483646;background:#e65100;color:#fff;font:600 13px Roboto,sans-serif;padding:6px 8px 6px 14px;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.5);max-width:calc(100vw - 32px);display:flex;gap:10px;align-items:center;flex-wrap:wrap;";
            var txt = document.createElement("span");
            bar.appendChild(txt);
            var b = document.createElement("button");
            b.type = "button";
            b.style.cssText = "background:transparent;color:#fff;border:1px solid #fff;border-radius:6px;padding:4px 12px;min-height:32px;font:600 12px Roboto,sans-serif;cursor:pointer;";
            b.addEventListener("click", function () {
              b.disabled = true;
              b.textContent = i18nT('fireNotice.cancelling');
              tvPost("/fire/cancel", {})
                .then(function (r) {
                  txt.textContent = r.cancelled ? (pause ? i18nT('common.cancelled_it_will_not_pause') : i18nT('common.cancelled_it_will_not_stop')) + " " + i18nT('common.it_will_not_act_again_for') : i18nT('fireNotice.there_was_no_countdown_anymore');
                  b.style.display = "none";
                  setTimeout(quitar, 4000);
                })
                .catch(function (er) {
                  b.disabled = false;
                  txt.textContent = i18nT('fireNotice.could_not_cancel_v', { v: er.message });
                });
            });
            bar.appendChild(b);
          }
          var root = document.fullscreenElement || document.body; // visible tambien en pantalla completa
          if (bar.parentNode !== root) root.appendChild(bar);
          var bt = bar.querySelector("button");
          if (bt.disabled || bt.style.display === "none") return; // it was already cancelled: leave the message
          bar.firstChild.textContent =
            (c.kind === "flame" ? i18nT('fireNotice.flame_detected_by_the_camera') : i18nT('fireNotice.smoke_detected_by_the_camera')) + ": " +
            i18nT(pause ? 'fireNotice.pausing_the_job_in_n_s' : 'fireNotice.emergency_stop_in_n_s', { n: c.left });
          bt.textContent = pause ? i18nT('common.cancel_the_pause') : i18nT('common.cancel_the_stop');
        }

        function cycle() {
          if (parado) return;
          if (!hasJob()) {
            if (bar && !bar.querySelector("button").disabled) quitar();
            timer = setTimeout(cycle, 3000);
            return;
          }
          tvGet("/fire/state")
            .then(function (e) {
              errors = 0;
              paint(e.count);
              timer = setTimeout(cycle, e.count ? 500 : 1000); // the flame count lasts 2 s: it is looked at often
            })
            .catch(function () {
              // Vision off or no network: it waits longer each time (up to 30 s)
              errors++;
              timer = setTimeout(cycle, Math.min(30000, 1500 * Math.pow(2, errors)));
            });
        }

        setTimeout(cycle, 3000);
        workshopOnStop(function () {
          parado = true;
          clearTimeout(timer);
          quitar();
        });
      })();
