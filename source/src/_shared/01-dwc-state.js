      // ---- Machine state from DWC's store (2026-10-12) ----
      // DWC already has the complete object model in its store (Vuex:
      // store.state.machine.model), kept up to date by its own session with DSF. Asking for
      // /machine/status from the pages duplicated DuetWebServer's work:
      // during a job it was at 100% of a core because of those repeated GETs.
      // Rule: no page asks for /machine/status (nor rr_model nor
      // /machine/model in a loop); it is read from here.
      //   workshopStateDwc()        copy with the SAME shape as /machine/status
      //                            (global and plugins as objects), or null without
      //                            a connection. It is copied once per model change
      //                            and shared: do not modify it.
      //   workshopReadState()       the same as a promise (rejects without a
      //                            connection): replaces fetch("/machine/status").
      //   workshopOnModel(fn, ms)   fn(state) when DWC updates the model,
      //                            at most once every ms. Returns the
      //                            function to stop listening.
      //   workshopOnModelLive(fn, ms) the same with DWC's live model (no copy):
      //                            read a few fields, never change or keep it.
      //   workshopPageVisible(el)  the tab is visible and the element is in the
      //                            page (DWC keeps pages with
      //                            keep-alive: when going to another page ours
      //                            stays alive but outside the document).
      // It goes in 01 (before 05-language, which already reads the state on load).
      var workshopModel = { see: 0, sub: false, listeners: [], copy: null, copyView: -1 };

      // One store subscription per chunk: it counts the model
      // updates (DWC's ".../model/update" mutation) and notifies the listeners.
      function workshopModelSubscribe() {
        if (workshopModel.sub) return true;
        var stop = workshopHostOnModelUpdated(function () {
          workshopModel.see++;
          workshopModel.listeners.slice().forEach(function (o) {
            o.notice();
          });
        });
        if (!stop) return false;
        workshopModel.sub = true;
        return true;
      }

      // Map (global, plugins, customInfo) -> objeto, como en /machine/status
      function workshopMapJson(k, v) {
        if (typeof Map !== "undefined" && v instanceof Map) {
          var o = {};
          v.forEach(function (x, key) {
            o[key] = x;
          });
          return o;
        }
        return v;
      }

      function workshopStateDwc() {
        var m = workshopHostModel();
        if (!m || workshopHostConnected() === false) return null;
        var sub = workshopModelSubscribe();
        if (sub && workshopModel.copy && workshopModel.copyView === workshopModel.see) return workshopModel.copy;
        var copy;
        try {
          copy = JSON.parse(JSON.stringify(m, workshopMapJson));
        } catch (e) {
          return null;
        }
        workshopModel.copy = copy;
        workshopModel.copyView = sub ? workshopModel.see : -1;
        return copy;
      }

      function workshopReadState() {
        var e = workshopStateDwc();
        return e ? Promise.resolve(e) : Promise.reject(new Error(i18nT('dwcState.no_connection_to_the_machine')));
      }

      function workshopOnModel(fn, minMs) {
        return workshopModelListen(fn, minMs, workshopStateDwc);
      }

      // The same as workshopOnModel but fn gets DWC's LIVE model (store.state.machine.model), not a copy: for a reader that looks at a few
      // fields many times a second (the trail of a live job) the JSON copy of the whole model was the cost. fn must only read it, never
      // change it or keep it (global and plugins are Maps there).
      function workshopModelLive() {
        var m = workshopHostModel();
        return m && workshopHostConnected() !== false ? m : null;
      }
      function workshopOnModelLive(fn, minMs) {
        return workshopModelListen(fn, minMs, workshopModelLive);
      }

      function workshopModelListen(fn, minMs, read) {
        minMs = minMs || 0;
        var o = { last: 0, timer: null, outside: false };
        function call() {
          o.timer = null;
          if (o.outside) return;
          o.last = Date.now();
          var e = read();
          if (!e) return;
          try {
            fn(e);
          } catch (err) {
            console.error("[" + PLUGIN_ID + "] model listener:", err);
          }
        }
        o.notice = function () {
          if (o.outside || o.timer) return;
          o.timer = setTimeout(call, Math.max(0, minMs - (Date.now() - o.last)));
        };
        workshopModel.listeners.push(o);
        // the store may not be there yet (DWC starting): retry
        (function wait_for() {
          if (o.outside || workshopModelSubscribe()) return;
          setTimeout(wait_for, 1000);
        })();
        return function () {
          o.outside = true;
          clearTimeout(o.timer);
          workshopModel.listeners = workshopModel.listeners.filter(function (x) {
            return x !== o;
          });
        };
      }

      function workshopPageVisible(el) {
        if (typeof document !== "undefined" && document.hidden) return false;
        return !el || el.isConnected !== false;
      }
