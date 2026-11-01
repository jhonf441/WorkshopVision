      // ---- Ciclo de vida comun ----

      // Functions to run when the plugin is stopped (see workshopWatchEnabled).
      // No initializer on purpose: the _shared files that run before this one (04-nav-scroll, 09-session-notice...) already register stop functions at load,
      // and an initializer here would throw them away when this file's turn comes (the same trick as workshopHostCleanupFns in 00-dwc-host.js).
      var workshopStopFns;
      function workshopOnStop(fn) {
        (workshopStopFns = workshopStopFns || []).push(fn);
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
        workshopReportPlugin(true); // the person stopped it: the service must know, so that nothing starts it again by itself
        (workshopStopFns || []).forEach(function (fn) {
          try {
            fn();
          } catch (e) {
            console.error("[" + PLUGIN_ID + "] cleanup on stop:", e);
          }
        });
        workshopStopFns = [];
        workshopHostRunCleanup(); // 3.7: routes, risk interceptor and the unload subscription (00-dwc-host.js)
        // the registry must not claim a stopped plugin is there (pluginActive / workshopPluginActive read it)
        if (workshop && workshop.versions && PLUGIN_ID in workshop.versions) {
          delete workshop.versions[PLUGIN_ID];
          workshopNotify();
        }
        workshopRemoveLeftovers();
      }

      // ---- Tell the service whether the person stopped this plugin ----
      // The kiosk script of the service (kiosk/ensure-emergencyfab.sh) adds back to the enabled list the plugins of its own list that are missing
      // from it, so a plugin that the person stopped on purpose would come back. The service keeps the list of the plugins that were stopped
      // (0:/sys/workshop/data/stopped-plugins.json) and the script does not bring those back. This plugin is the one that knows: workshopStop() runs
      // only when the person took it out of the enabled list (the 3.6 poll, or the DWC 3.7 event), so it reports stopped = true from there, and
      // stopped = false when it loads (10-registry.js: it was started). The operation is plugins.stopped.set {id, stopped}, operator role.
      // It is not critical: with no session, with an old service that does not know the operation, or on any error, it does nothing and says nothing
      // (no sign-in box, no notice), and a failure never delays or breaks the stop. Resolves true when the service took it.
      function workshopReportPlugin(stopped) {
        try {
          if (typeof workshopApi !== "function") return Promise.resolve(false);
          if (typeof workshopSignedOut === "function" && workshopSignedOut()) return Promise.resolve(false);
          return workshopApi("plugins.stopped.set", { id: PLUGIN_ID, stopped: !!stopped }, { noLogin: true, quiet: true, byPerson: false, withoutDialog: true }).then(
            function () {
              return true;
            },
            function () {
              return false;
            }
          );
        } catch (e) {
          return Promise.resolve(false);
        }
      }

      // The <style> elements a plugin made for itself (ids that no other plugin uses) go when THAT plugin stops, not only when the last one does.
      // The shared ones (family, scrollbars, layers: any plugin may have made them and the others still use them) stay for workshopRemoveLeftovers.
      function workshopOwnStyles(ids) {
        workshopOnStop(function () {
          try {
            ids.forEach(function (id) {
              var n = document.getElementById(id);
              if (n && n.parentNode) n.parentNode.removeChild(n);
            });
          } catch (e) {
            /* a stub document without getElementById (tests) */
          }
        });
      }

      // ---- Globals that every Taller JS plugin shares ----
      // A timer, a node or a listener that ONE plugin installs for the whole page (the first to load; the others find it there) belongs to all of
      // the plugins that use it: it is taken away when the LAST of them stops, not when the first one does. window.__workshopShared counts the users of
      // each resource by name (all the plugin copies of a page see the same object) and keeps what the installer handed over to take it away.
      // install() puts the resource in and returns the function that takes it out. Returns true when this call installed it.
      // What the Vue plugins also use (the wrapped window.fetch of the safe saving, the XHR session hook, the sign-in listeners of window.__workshopAuth) is NOT
      // kept this way: those pages cannot say that they are still there (DWC 3.6 cannot stop a page): taking them out
      // when the last JS plugin stops would turn the safe saving or the session capture off under a Vue page that is still open.
      function workshopSharedUse(name, install) {
        if (typeof pluginStopped !== "undefined" && pluginStopped) return false; // a plugin that already stopped does not take part
        var reg = (window.__workshopShared = window.__workshopShared || {});
        var r = reg[name];
        var first = !r;
        if (first) {
          r = reg[name] = { users: 0, off: null };
          try {
            r.off = install();
          } catch (e) {
            delete reg[name];
            console.error("[" + PLUGIN_ID + "] shared " + name + ":", e);
            return false;
          }
        }
        r.users++;
        var released = false;
        workshopOnStop(function () {
          if (released) return;
          released = true;
          if (--r.users > 0) return;
          if (reg[name] === r) delete reg[name];
          try {
            if (typeof r.off === "function") r.off();
          } catch (e) {
            console.error("[" + PLUGIN_ID + "] shared " + name + " off:", e);
          }
        });
        return first;
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
          } else if ((workshopSeenEnabled || list.length > 0) && ++workshopMissingTimes >= 2) workshopStop(); // never seen but the list is loaded: DWC loaded us from the `main` list only
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
