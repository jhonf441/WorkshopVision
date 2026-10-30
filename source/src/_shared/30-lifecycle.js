      // ---- Ciclo de vida comun ----

      // Functions to run when the plugin is stopped (see workshopWatchEnabled).
      var workshopStopFns = [];
      function workshopOnStop(fn) {
        workshopStopFns.push(fn);
      }

      function workshopWhenReady(fn) {
        if (document.readyState === "loading") {
          document.addEventListener("DOMContentLoaded", fn);
        } else {
          fn();
        }
      }

      // If the plugin is stopped by hand from DWC -> Plugins, DWC only
      // removes its id from machine.enabledPlugins and persists it -- an already
      // executed Webpack chunk gets no notice nor can it be "unloaded".
      // That is why it is detected by polling: if PLUGIN_ID is no longer in the list,
      // everything registered with workshopOnStop is run and its elements
      // disappear, as if it had never been loaded.
      var WORKSHOP_ENABLED_POLL_MS = 5000;
      var workshopEnabledTimer = null;

      function workshopStop() {
        if (pluginStopped) return;
        pluginStopped = true;
        clearInterval(workshopEnabledTimer);
        workshopStopFns.forEach(function (fn) {
          try {
            fn();
          } catch (e) {
            console.error("[" + PLUGIN_ID + "] cleanup on stop:", e);
          }
        });
        workshopStopFns = [];
        workshopHostRunCleanup(); // 3.7: routes, risk interceptor and the unload subscription (00-dwc-host.js)
        // the registry must not claim a stopped plugin is there (pluginActive / workshopPluginLoaded read it)
        if (workshop && workshop.versions && PLUGIN_ID in workshop.versions) {
          delete workshop.versions[PLUGIN_ID];
          workshopNotify();
        }
        workshopRemoveLeftovers();
      }

      // When the last Taller JS plugin stops nothing may remain in the page: the shared <style> elements (ids workshop-*-css) and
      // the hidden nodes of the control bar. The registry is empty only when no other plugin is running.
      function workshopRemoveLeftovers() {
        try {
          if (workshop && workshop.versions && Object.keys(workshop.versions).length) return;
          var nodes = document.querySelectorAll('style[id^="workshop-"][id$="-css"], #workshop-bar-zone, #workshop-bar-tab');
          for (var i = 0; i < nodes.length; i++) if (nodes[i].parentNode) nodes[i].parentNode.removeChild(nodes[i]);
        } catch (e) {
          /* a stub document without querySelectorAll (tests) */
        }
      }

      // A single read of dwc-settings.json every ~5 s for ALL the
      // Taller plugins on the page (before each one asked for its own).
      function workshopReadSettingsShared() {
        var c = (window.__workshopSettingsCache = window.__workshopSettingsCache || { at: 0, p: null });
        if (c.p && Date.now() - c.at < 4000) return c.p;
        c.at = Date.now();
        c.p = fetch("/machine/file/0:/sys/dwc-settings.json").then(function (r) {
          return r.json();
        });
        c.p.catch(function () {
          c.at = 0; // so the next one retries
        });
        return c.p;
      }

      // 2026-10-12: the list comes from DWC's store (machine.settings.enabledPlugins and
      // settings.enabledPlugins, the same it saves in dwc-settings.json) without asking for the file every 5 s.
      // It only stops if the plugin was in the list since it connected and
      // is missing in two checks in a row (on reconnect, DWC rebuilds the machine
      // with an empty list until it reads its settings). The file, if there is no store.
      var workshopSeenEnabled = false;
      var workshopMissingTimes = 0;
      function workshopCheckEnabled() {
        if (pluginStopped) return;
        var list = workshopHostEnabledPlugins();
        if (list) {
          if (workshopHostConnected() === false) {
            workshopSeenEnabled = false;
            workshopMissingTimes = 0;
            return;
          }
          var esta = list.indexOf(PLUGIN_ID) !== -1;
          if (esta) {
            workshopSeenEnabled = true;
            workshopMissingTimes = 0;
          } else if (workshopSeenEnabled && ++workshopMissingTimes >= 2) workshopStop();
          return;
        }
        if (typeof document !== "undefined" && document.hidden) return;
        workshopReadSettingsShared()
          .then(function (settings) {
            var list = settings && settings.machine && settings.machine.enabledPlugins;
            if (list && list.indexOf(PLUGIN_ID) === -1) workshopStop();
          })
          .catch(function () {
            // Network/server unavailable for a moment -- do not assume
            // the plugin was stopped just because this fetch failed.
          });
      }

      function workshopWatchEnabled() {
        // 3.7: DWC emits dwcPluginUnloaded, no poll needed. 3.6 has no such event: poll enabledPlugins.
        if (workshopHostOnPluginUnload(workshopStop)) return;
        workshopEnabledTimer = setInterval(workshopCheckEnabled, WORKSHOP_ENABLED_POLL_MS);
      }

      // Shield against the on-screen keyboard (squeekboard): takes the focus away
      // immediately from anything that receives it inside this plugin's
      // elements (buttons or handles that steal focus by accident). Real
      // INPUT/TEXTAREA are exempt so that typing is possible.
      // getEls() returns the plugin's root elements (they may be null).
      function workshopGuardFocus(getEls) {
        function onFocusIn(ev) {
          var t = ev.target;
          if (!t || t === document.body) return;
          var tag = t.tagName;
          if (tag === "INPUT" || tag === "TEXTAREA") return;
          var els = getEls();
          for (var i = 0; i < els.length; i++) {
            if (els[i] && els[i].contains(t)) {
              t.blur();
              return;
            }
          }
        }
        document.addEventListener("focusin", onFocusIn, true);
        workshopOnStop(function () {
          document.removeEventListener("focusin", onFocusIn, true);
        });
      }

      // If DWC recreates/replaces parts of the body (e.g. a reconnection) and a
      // plugin element disappears from the DOM, onMissing() creates it
      // again. Panels are never removed from the DOM in normal use (closing =
      // display:none), so this only acts if something external deleted them.
      function workshopWatchDom(onMissing) {
        var observer = new MutationObserver(function () {
          if (!pluginStopped) onMissing();
        });
        workshopWhenReady(function () {
          observer.observe(document.body, { childList: true });
        });
        workshopOnStop(function () {
          observer.disconnect();
        });
      }
