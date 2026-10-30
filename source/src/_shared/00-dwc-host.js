      // ---- DWC host accessor (DWC 3.6.x: Vue 2 / Vuex, and DWC 3.7: Vue 3 / Pinia / vue-router 5) ----
      //
      // This is the ONLY file allowed to touch DWC internals (the Vue root instance and its Vuex store on 3.6; window.DWC, the
      // Vue app handle and the router on 3.7). Everything else in the plugins asks for what it needs through the workshopHost*
      // functions below; tests/dwc-host.test.js enforces it and runs this file against a fake of each DWC.
      // Only function declarations live here (hoisted), because 00-core.js runs before this file in the concatenated scope. The one
      // exception is a `var` WITHOUT initializer (hoisted and not reset when this file's turn comes), see workshopHostCleanupFns.
      //
      //   workshopHostKind()                   "37", "36" or "" (DWC not there yet)
      //   workshopHostModel()                  the live object model or null
      //   workshopHostPluginsModel()           model.plugins (Map) or null
      //   workshopHostConnected()              true/false; null when the store is not there yet
      //   workshopHostEnabledPlugins()         enabled DWC plugin ids (array) or null
      //   workshopHostSettings()               DWC global settings object (has .webcam) or null
      //   workshopHostLocale()                 current DWC locale ("es", "en", ...) or ""
      //   workshopHostTranslate(key, params)   i18n text when the key exists (current locale or "en"), else null
      //   workshopHostCurrentPath()            current route path or ""
      //   workshopHostPush(path)               SPA navigation; false when there is no router
      //   workshopHostCurrentQuery()           query parameters of the current route ({} if none)
      //   workshopHostPathMatched(path)        true when a real page (not the catch-all) is registered at path
      //   workshopHostOnModelUpdated(fn)       fn() on every object model update; returns the stop function, null if not ready
      //   workshopHostInterceptCodes(fn)       fn(code, fromInput) -> Promise<cancelled|falsy> before DWC sends a code
      //   workshopHostRegisterPage(spec, menu) page of the Plugins menu: spec = {name, mount(el, router), destroy(handle)}
      //   workshopHostOpenEditor(opts)         editor dialog on a file: opts = {path, content, onClose}; false if not possible
      //   workshopHostOnCleanup(fn)            fn() when this plugin stops (3.7: DWC event dwcPluginUnloaded; 3.6: the enabledPlugins poll)
      //   workshopHostOnPluginUnload(fn)       3.7 only: subscribe fn() to dwcPluginUnloaded for this plugin; null on 3.6
      //   workshopHostRunCleanup()             runs and clears the workshopHostOnCleanup functions (called by workshopStop)

      // ---- Plugin unload (review #4) ----
      // DWC 3.7 unloadDwcPlugin() removes no script, route, tab, timer or listener; it only emits Events "dwcPluginUnloaded"(id).
      // Everything a plugin keeps alive outside a component is released from one place: workshopStop() (30-lifecycle.js) calls
      // workshopHostRunCleanup(). On 3.7 the event triggers workshopStop; on 3.6 (no event) the enabledPlugins poll does.
      var workshopHostCleanupFns; // no initializer on purpose: 00-core.js already called functions of this file

      function workshopHostPluginId() {
        return typeof PLUGIN_ID === "string" ? PLUGIN_ID : "";
      }

      function workshopHostOnCleanup(fn) {
        (workshopHostCleanupFns = workshopHostCleanupFns || []).push(fn);
      }

      function workshopHostRunCleanup() {
        var fns = workshopHostCleanupFns || [];
        workshopHostCleanupFns = [];
        for (var i = fns.length - 1; i >= 0; i--) {
          try {
            fns[i]();
          } catch (e) {
            console.error("[" + workshopHostPluginId() + "] host cleanup:", e);
          }
        }
      }

      function workshopHostOnPluginUnload(fn) {
        var api = workshopHostApi37();
        var ev = api && api.Events;
        if (!ev || typeof ev.on !== "function") return null;
        var mine = workshopHostPluginId().toLowerCase(); // DWC compares plugin ids case-insensitively
        function onUnloaded(id) {
          if (String(id).toLowerCase() === mine) fn();
        }
        ev.on("dwcPluginUnloaded", onUnloaded);
        workshopHostOnCleanup(function () {
          try {
            ev.off("dwcPluginUnloaded", onUnloaded);
          } catch (e) {
            /* nothing */
          }
        });
        return true;
      }

      // ---- Theme classes (review #3) ----
      // The workshop stylesheets were written for Vuetify 2, whose light theme is the class `theme--light` (3.6). Vuetify 4 (DWC 3.7)
      // names it `v-theme--light`. Every CSS text the plugins inject goes through workshopCss(): on 3.6 it is returned untouched
      // (byte for byte), on 3.7 `.theme--light` becomes `.v-theme--light`. tests/theme-class.test.js fails when a file holds a
      // `.theme--light` selector that is not routed through here.
      function workshopHostThemeLightClass() {
        return workshopHostApi37() ? "v-theme--light" : "theme--light";
      }

      function workshopCss(text) {
        var css = Array.isArray(text) ? text.join("\n") : String(text);
        return workshopHostApi37() ? css.replace(/\.theme--light/g, ".v-theme--light") : css;
      }

      function workshopHostVm() {
        try {
          var app = document.getElementById("app");
          return (app && app.__vue__) || null;
        } catch (e) {
          return null;
        }
      }

      function workshopHostVuex() {
        var vm = workshopHostVm();
        return (vm && vm.$store) || null;
      }

      function workshopHostApi37() {
        try {
          var api = typeof window !== "undefined" ? window.DWC : null;
          return api && typeof api.useMachineStore === "function" ? api : null;
        } catch (e) {
          return null;
        }
      }

      function workshopHostKind() {
        if (workshopHostApi37()) return "37";
        if (workshopHostVm()) return "36";
        return "";
      }

      function workshopHostMachine37() {
        try {
          return workshopHostApi37().useMachineStore();
        } catch (e) {
          return null;
        }
      }

      function workshopHostSettings37() {
        try {
          return workshopHostApi37().useSettingsStore();
        } catch (e) {
          return null;
        }
      }

      function workshopHostModel() {
        if (workshopHostApi37()) {
          var ms = workshopHostMachine37();
          return (ms && ms.model) || null;
        }
        var st = workshopHostVuex();
        return (st && st.state && st.state.machine && st.state.machine.model) || null;
      }

      function workshopHostPluginsModel() {
        var m = workshopHostModel();
        return (m && m.plugins) || null;
      }

      function workshopHostConnected() {
        if (workshopHostApi37()) {
          var ms = workshopHostMachine37();
          return ms ? ms.isConnected !== false : null;
        }
        var st = workshopHostVuex();
        if (!st) return null;
        try {
          if (st.getters && st.getters.isConnected === false) return false;
        } catch (e) {
          /* DWC without that getter: only the model is looked at */
        }
        return true;
      }

      function workshopHostEnabledPlugins() {
        if (workshopHostApi37()) {
          var s = workshopHostSettings37();
          return s && Array.isArray(s.enabledPlugins) ? s.enabledPlugins : null;
        }
        var st = workshopHostVuex();
        var ms = st && st.state && st.state.machine && st.state.machine.settings;
        if (!ms || !Array.isArray(ms.enabledPlugins)) return null;
        var gs = st.state.settings; // DWC 3.6 keeps a second list in the global settings
        return gs && Array.isArray(gs.enabledPlugins) ? ms.enabledPlugins.concat(gs.enabledPlugins) : ms.enabledPlugins;
      }

      function workshopHostSettings() {
        if (workshopHostApi37()) return workshopHostSettings37();
        var st = workshopHostVuex();
        return (st && st.state && st.state.settings) || null;
      }

      function workshopHostLocale() {
        try {
          var api = workshopHostApi37();
          if (api) {
            var loc = api.i18n && api.i18n.global && api.i18n.global.locale;
            if (loc && typeof loc === "object") loc = loc.value;
            return loc ? String(loc) : "";
          }
          var vm = workshopHostVm();
          return vm && vm.$i18n && vm.$i18n.locale ? String(vm.$i18n.locale) : "";
        } catch (e) {
          return "";
        }
      }

      function workshopHostTranslate(key, params) {
        try {
          var api = workshopHostApi37();
          if (api) {
            var g = api.i18n.global;
            if (g.te(key) || g.te(key, "en")) return g.t(key, params || {});
            return null;
          }
          var vm = workshopHostVm();
          if (vm && vm.$te && (vm.$te(key) || vm.$te(key, "en"))) return vm.$t(key, params);
        } catch (e) {
          /* DWC without i18n */
        }
        return null;
      }

      // DOCUMENTED EXCEPTION (review #5/#6): DWC 3.7 exports no router and no way to render a component into its app context
      // (window.DWC has useRouter() only inside a component setup). Searched in PLUGINS.md and the barrel: no public alternative.
      // The Vue app handle of #app (a Vue marker, not a DWC contract) is read here and ONLY here. Order of preference:
      //   1. the router captured by the setup() of one of our own registered pages (public: DWC.VueRouter.useRouter()),
      //   2. #app.__vue_app__.config.globalProperties.$router.
      // If DWC ever exports a router or a navigate(path), replace workshopHostApp37() and nothing else changes.
      var workshopHostRouterSeen; // no initializer on purpose (see the header)

      function workshopHostApp37() {
        var app = document.getElementById("app");
        return (app && app.__vue_app__) || null;
      }

      function workshopHostRouter() {
        try {
          if (workshopHostApi37()) {
            if (workshopHostRouterSeen) return workshopHostRouterSeen;
            var vapp = workshopHostApp37();
            return (vapp && vapp.config && vapp.config.globalProperties && vapp.config.globalProperties.$router) || null;
          }
          var vm = workshopHostVm();
          return (vm && vm.$router) || null;
        } catch (e) {
          return null;
        }
      }

      function workshopHostCurrentPath() {
        try {
          if (workshopHostApi37()) {
            var r = workshopHostRouter();
            return r && r.currentRoute && r.currentRoute.value ? String(r.currentRoute.value.path || "") : "";
          }
          var vm = workshopHostVm();
          return vm && vm.$route ? String(vm.$route.path || "") : "";
        } catch (e) {
          return "";
        }
      }

      // Query parameters of the current route ({} when there are none or no router): lets a page read what the page that sent the person
      // here passed along (replaces the undeclared localStorage hand-offs between plugins).
      function workshopHostCurrentQuery() {
        try {
          var r = workshopHostRouter();
          if (!r) return {};
          var cur = workshopHostApi37() ? r.currentRoute && r.currentRoute.value : r.currentRoute;
          return (cur && cur.query) || {};
        } catch (e) {
          return {};
        }
      }

      function workshopHostPush(path) {
        var r = workshopHostRouter();
        if (!r) return false;
        try {
          if (workshopHostCurrentPath() === path) return true;
          var p = r.push(path);
          if (p && typeof p.catch === "function") p.catch(function () {});
          return true;
        } catch (e) {
          return false;
        }
      }

      // The catch-all of each DWC: 3.6 "*" (or "/:pathMatch(.*)*"), 3.7 "/:notFound(.*)*" (pages/[...notFound].vue).
      function workshopHostIsCatchAll(routePath) {
        var p = String(routePath);
        return p === "*" || /pathMatch|notFound|\(\.\*\)/.test(p);
      }

      function workshopHostPathMatched(path) {
        try {
          // 3.7: window.DWC.registeredRoutes is the public list of plugin pages (unregisterRoute removes the entry)
          var api = workshopHostApi37();
          var reg = api && api.registeredRoutes;
          if (reg) {
            for (var i = 0; i < reg.length; i++) if (reg[i] && reg[i].path === path) return true;
          }
          var r = workshopHostRouter();
          if (!r) return false;
          var res = r.resolve(path);
          var m = res.matched || (res.route && res.route.matched);
          if (!m || !m.length) return false;
          return !workshopHostIsCatchAll(m[m.length - 1].path);
        } catch (e) {
          return false;
        }
      }

      function workshopHostOnModelUpdated(fn) {
        var api = workshopHostApi37();
        if (api) {
          var ev = api.Events;
          if (!ev || typeof ev.on !== "function") return null;
          ev.on("modelUpdated", fn);
          return function () {
            try {
              ev.off("modelUpdated", fn);
            } catch (e) {
              /* nothing */
            }
          };
        }
        var st = workshopHostVuex();
        if (!st || typeof st.subscribe !== "function") return null;
        var un = st.subscribe(function (m) {
          if (!m || !/(^|\/)model\/update$/.test(String(m.type || ""))) return;
          fn();
        });
        return typeof un === "function" ? un : function () {};
      }

      // Risk dialog before a code is sent. 3.6: the Vuex action machine/sendCode is wrapped once (version of the wrapper: the one of
      // a plugin with an older _shared is replaced over DWC's original action); a cancelled code rejects. 3.7: registerCodeInterceptor,
      // one id per plugin ("WorkshopRisk-<Id>", review #7) so stopping a plugin removes only its own interceptor. Only ONE of the loaded
      // plugins asks (the first in window.__workshop.riskAskers); when it stops, the next one takes over, so the user is asked once and
      // the dialog never disappears while a plugin that carries it is still running. A cancelled code is answered with an empty reply
      // (a thrown error would only be logged and the code would still go out) and 3.7 does not tell where the code came from.
      function workshopHostInterceptCodes(fn) {
        var api = workshopHostApi37();
        if (api) {
          if (typeof api.registerCodeInterceptor !== "function") return false;
          var pid = workshopHostPluginId() || "Workshop";
          var id = "WorkshopRisk-" + pid;
          var w = (window.__workshop = window.__workshop || {});
          var askers = (w.riskAskers = w.riskAskers || []);
          if (askers.indexOf(pid) === -1) askers.push(pid);
          api.registerCodeInterceptor(id, function (code) {
            if (askers[0] !== pid) return undefined; // another loaded plugin asks
            return Promise.resolve(fn(code, false)).then(function (cancelled) {
              return cancelled ? { reply: "" } : undefined;
            });
          });
          workshopHostOnCleanup(function () {
            var i = askers.indexOf(pid);
            if (i !== -1) askers.splice(i, 1);
            if (typeof api.unregisterCodeInterceptor === "function") api.unregisterCodeInterceptor(id);
          });
          return true;
        }
        try {
          var st = workshopHostVuex();
          var acts = st && st._actions && st._actions["machine/sendCode"];
          if (!acts || !acts[0]) {
            setTimeout(function () {
              workshopHostInterceptCodes(fn);
            }, 1000);
            return false;
          }
          var V = 4; // 4: only the risk dialog
          if ((acts.__workshopV || (acts.__workshopRetry ? 1 : 0)) >= V) return true;
          var orig = acts.__workshopOrig || acts[0];
          acts.__workshopOrig = orig;
          acts[0] = function (payload) {
            var code = typeof payload === "string" ? payload : payload && payload.code;
            var fromInput = !!(payload && typeof payload === "object" && payload.fromInput);
            return Promise.resolve(fn(code, fromInput)).then(function (cancelled) {
              if (cancelled) throw cancelled;
              return orig(payload);
            });
          };
          acts.__workshopRetry = true;
          acts.__workshopV = V;
          return true;
        } catch (e) {
          console.warn("[taller] could not wrap sendCode:", e);
          return false;
        }
      }

      // A page of the Plugins menu. spec.mount(el, router) builds the DOM inside el and returns a handle; spec.destroy(handle)
      // tears it down. The component is a render-function one on both Vues (neither DWC compiles templates at runtime).
      function workshopHostRegisterPage(spec, menu) {
        var api = workshopHostApi37();
        if (api) {
          var V = api.Vue;
          var VR = api.VueRouter;
          api.registerRoute(
            {
              name: spec.name,
              setup: function () {
                var root = V.ref(null);
                var router = VR && VR.useRouter ? VR.useRouter() : workshopHostRouter();
                if (router && VR && VR.useRouter) workshopHostRouterSeen = router;
                var handle = null;
                V.onMounted(function () {
                  handle = spec.mount(root.value, router);
                });
                V.onBeforeUnmount(function () {
                  if (handle) spec.destroy(handle);
                  handle = null;
                });
                return function () {
                  return V.h("div", { ref: root });
                };
              },
            },
            menu
          );
          // unloadDwcPlugin() removes no route: drop the page (and its menu entry) when this plugin stops
          if (typeof api.unregisterRoute === "function") {
            Object.keys(menu || {}).forEach(function (cat) {
              Object.keys(menu[cat] || {}).forEach(function (name) {
                var routePath = menu[cat][name] && menu[cat][name].path;
                if (routePath) workshopHostOnCleanup(function () { api.unregisterRoute(routePath); });
              });
            });
          }
          return;
        }
        var routes = __webpack_require__("./src/routes/index.ts");
        routes.registerRoute(
          {
            name: spec.name,
            render: function (h) {
              return h("div", { ref: "root" });
            },
            mounted: function () {
              this.workshopHandle = spec.mount(this.$refs.root, this.$router);
            },
            beforeDestroy: function () {
              if (this.workshopHandle) spec.destroy(this.workshopHandle);
            },
          },
          menu
        );
      }

      // Editor dialog on a file of the SD. The text is passed in; the dialog saves on its own (upload to the same path) when the
      // user presses Save. 3.6: DWC's own file-edit-dialog on a Vue 2 child instance. 3.7: a small Vuetify dialog mounted in the
      // context of the DWC app (Vuetify, i18n and Pinia are inherited).
      function workshopHostOpenEditor(opts) {
        var api = workshopHostApi37();
        return api ? workshopHostOpenEditor37(api, opts) : workshopHostOpenEditor36(opts);
      }

      function workshopHostOpenEditor36(opts) {
        var vm = workshopHostVm();
        if (!vm || !vm.constructor) return false;
        var Vue = vm.constructor;
        var state = new Vue({ data: { shown: false, content: opts.content || "" } }); // reactive holder (this Vue has no Vue.observable)
        var host = document.createElement("div");
        document.body.appendChild(host);
        var inst = new Vue({
          parent: vm,
          vuetify: vm.$vuetify,
          i18n: vm.$i18n,
          store: vm.$store,
          router: vm.$router,
          render: function (h) {
            return h("file-edit-dialog", {
              props: { shown: state.shown, filename: opts.path, value: state.content },
              on: {
                "update:shown": function (v) {
                  state.shown = v;
                  if (!v) setTimeout(close, 300);
                },
                input: function (v) {
                  state.content = v;
                },
              },
            });
          },
        });
        function close() {
          try {
            inst.$destroy();
            state.$destroy();
          } catch (e) {
            /* nothing */
          }
          if (host.parentNode) host.parentNode.removeChild(host);
          if (opts.onClose) opts.onClose();
        }
        inst.$mount(host);
        state.shown = true;
        return true;
      }

      function workshopHostOpenEditor37(api, opts) {
        var vapp = workshopHostApp37();
        var VC = api.VuetifyComponents;
        if (!api.Vue || !vapp || !VC || !VC.VDialog || !VC.VTextarea) return false;
        var V = api.Vue;
        var host = document.createElement("div");
        document.body.appendChild(host);
        var comp = {
          setup: function () {
            var shown = V.ref(true);
            var content = V.ref(opts.content || "");
            var saving = V.ref(false);
            function close() {
              shown.value = false;
              setTimeout(function () {
                V.render(null, host);
                if (host.parentNode) host.parentNode.removeChild(host);
                if (opts.onClose) opts.onClose();
              }, 300);
            }
            function save() {
              var ms = workshopHostMachine37();
              if (!ms) return;
              saving.value = true;
              ms.upload({ filename: opts.path, content: new Blob([content.value], { type: "application/octet-stream" }) }, false, false, true).then(close, function () {
                saving.value = false;
              });
            }
            return function () {
              return V.h(
                VC.VDialog,
                { modelValue: shown.value, maxWidth: 900, scrollable: true, "onUpdate:modelValue": function (v) { if (!v) close(); } },
                {
                  default: function () {
                    return V.h(VC.VCard, null, {
                      default: function () {
                        return [
                          V.h(VC.VCardTitle, null, { default: function () { return opts.path; } }),
                          V.h(VC.VCardText, null, {
                            default: function () {
                              return V.h(VC.VTextarea, {
                                modelValue: content.value,
                                rows: 18,
                                spellcheck: false,
                                style: "font-family:monospace",
                                "onUpdate:modelValue": function (v) { content.value = v; },
                              });
                            },
                          }),
                          V.h(VC.VCardActions, null, {
                            default: function () {
                              return [
                                V.h(VC.VSpacer),
                                V.h(VC.VBtn, { onClick: close }, { default: function () { return i18nT("startup.close"); } }),
                                V.h(VC.VBtn, { color: "primary", disabled: saving.value, onClick: save }, { default: function () { return i18nT("startup.save"); } }),
                              ];
                            },
                          }),
                        ];
                      },
                    });
                  },
                }
              );
            };
          },
        };
        var vnode = V.h(comp);
        vnode.appContext = vapp._context; // the second documented exception: Vuetify, i18n and Pinia are inherited from the DWC app
        V.render(vnode, host);
        // an open editor must not outlive the plugin that opened it (unloadDwcPlugin removes no dialog)
        workshopHostOnCleanup(function () {
          V.render(null, host);
          if (host.parentNode) host.parentNode.removeChild(host);
        });
        return true;
      }
