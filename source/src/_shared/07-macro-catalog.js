      // ---- The macro picker of the buttons (lote 6, 22-nov-2026): ONE list for the control bar and the jog ----
      // The list comes from WorkshopService (macros.catalog): "mine" is the person's own macros (0:/macros, as the buttons always stored them) and
      // "plugins" is what the workshop plugins ship FOR the person to call, declared audience "user" in the macros.<PluginId>.json of each one. The helpers
      // only the plugins call are never offered. An action is the path relative to 0:/macros ("light/on.g") or "plugin:<path>" for 0:/sys/workshop/macros.
      // A macro is never edited from here: "View content" is read-only, in a dialog of its own (never the editor or the viewer of DWC).
      //   workshopMacroPath(action)            -> "0:/..." path of the macro or "" when the action is not a clean path
      //   workshopMacroCode(b)                 -> the code a button sends: M98 for a macro, the text for a G-code, "" when the macro path is not clean
      //   workshopMacroCatalogLoad()           -> Promise of { ok, mine: [], plugins: [], hidden }
      //   workshopMacroActions(cat)            -> the actions the catalogue offers (the list the "missing macro" check uses)
      //   workshopMacroFill(sel, cat, current) -> fills a <select> with the two groups
      //   workshopMacroView(action)            -> the read-only dialog

      var WORKSHOP_MACRO_PLUGIN = "plugin:";

      function workshopMacroRel(action) {
        return String(action || "").replace(/^\/+/, "");
      }

      function workshopMacroIsPlugin(action) {
        return workshopMacroRel(action).indexOf(WORKSHOP_MACRO_PLUGIN) === 0;
      }

      // A path that cannot leave its folder or break out of the quotes of the M98 line: no empty part, no . or .., no drive, quote, backslash or line break.
      function workshopMacroPath(action) {
        var a = workshopMacroRel(action);
        var base = "0:/macros/";
        if (workshopMacroIsPlugin(a)) {
          a = a.slice(WORKSHOP_MACRO_PLUGIN.length);
          base = "0:/sys/workshop/macros/";
        }
        var parts = a.split("/");
        for (var i = 0; i < parts.length; i++) {
          if (!parts[i] || parts[i] === "." || parts[i] === ".." || /[:\\"\r\n\u0000]/.test(parts[i])) return "";
        }
        return base + a;
      }

      function workshopMacroCode(b) {
        if (!b) return "";
        if (b.kind !== "macro") return String(b.action || "");
        var p = workshopMacroPath(b.action);
        return p ? 'M98 P"' + p + '"' : "";
      }

      // The person's own macros by walking 0:/macros: only when the service cannot answer macros.catalog (an older service); no plugin macro is offered then.
      function workshopMacroWalk(dir) {
        return fetch("/machine/directory/" + encodeURI("0:/macros/" + dir), { cache: "no-store" })
          .then(function (r) {
            return r.ok ? r.json() : [];
          })
          .then(function (items) {
            var out = [];
            var subs = [];
            (Array.isArray(items) ? items : []).forEach(function (it) {
              if (it.type === "d") subs.push(workshopMacroWalk(dir + it.name + "/"));
              else if (/\.g$/i.test(it.name)) out.push(dir + it.name);
            });
            return Promise.all(subs).then(function (more) {
              more.forEach(function (m) {
                out = out.concat(m);
              });
              return out;
            });
          })
          .catch(function () {
            return [];
          });
      }

      function workshopMacroCatalogLoad() {
        return workshopApi("macros.catalog", {}, { quiet: true, noLogin: true }).then(
          function (r) {
            r = r && typeof r === "object" ? r : {};
            return { ok: true, mine: Array.isArray(r.mine) ? r.mine.slice().sort() : [], plugins: Array.isArray(r.plugins) ? r.plugins : [], hidden: !!r.plugins_hidden };
          },
          function () {
            return workshopMacroWalk("").then(function (mine) {
              return { ok: false, mine: mine.sort(), plugins: [], hidden: true };
            });
          }
        );
      }

      // The actions the catalogue offers. .pluginsVisible tells whether the plugin group could be read: a role that cannot read it must not see its buttons as "missing".
      function workshopMacroActions(cat) {
        var list = ((cat && cat.mine) || []).slice();
        ((cat && cat.plugins) || []).forEach(function (m) {
          list.push(m.action);
        });
        list.pluginsVisible = !!(cat && cat.ok && !cat.hidden);
        return list;
      }

      // Fills a <select>: a first empty option, the saved action when the catalogue does not list it (it stays editable), then the two groups.
      // cat === null: still loading. Returns true when a group was left out because the role cannot read it.
      function workshopMacroFill(sel, cat, current) {
        sel.innerHTML = "";
        var add = function (parent, value, text, title) {
          var op = document.createElement("option");
          op.value = value;
          op.textContent = text;
          if (title) op.title = title;
          parent.appendChild(op);
          return op;
        };
        var cur = workshopMacroRel(current);
        add(sel, "", !cat ? i18nT('macropick.loading') : cat.mine.length || cat.plugins.length ? i18nT('macropick.choose') : i18nT('macropick.none'));
        if (!cat) return false;
        var listed = cat.mine.indexOf(cur) >= 0 || cat.plugins.some(function (m) { return m.action === cur; });
        if (cur && !listed) add(sel, cur, cur + " (" + i18nT('macropick.not_listed') + ")");
        if (cat.mine.length) {
          var g1 = document.createElement("optgroup");
          g1.label = i18nT('macropick.group_mine');
          cat.mine.forEach(function (rel) {
            add(g1, rel, rel);
          });
          sel.appendChild(g1);
        }
        if (cat.plugins.length) {
          var g2 = document.createElement("optgroup");
          g2.label = i18nT('macropick.group_plugins');
          cat.plugins.forEach(function (m) {
            add(g2, m.action, m.title + "  (" + m.plugin + ")", m.description);
          });
          sel.appendChild(g2);
        }
        sel.value = cur;
        return !!cat.hidden && cat.ok;
      }

      // The description of an offered plugin macro, for the line under the select ("" for the person's own macros and for the unknown).
      function workshopMacroDescription(cat, action) {
        var found = ((cat && cat.plugins) || []).filter(function (m) {
          return m.action === workshopMacroRel(action);
        })[0];
        return found ? found.description : "";
      }

      // Read-only view of a macro: its own dialog, the text is put with textContent, Esc and the backdrop close it. It never opens the editor of DWC.
      function workshopMacroView(action) {
        var path = workshopMacroPath(action);
        if (!path) return Promise.resolve(false);
        return fetch("/machine/file/" + encodeURI(path), { cache: "no-store" })
          .then(function (r) {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.text();
          })
          .then(
            function (text) {
              return workshopMacroViewOpen(path, String(text).slice(0, 200000));
            },
            function () {
              if (typeof workshopToast === "function") workshopToast(i18nT('macropick.view_failed'));
              return false;
            }
          );
      }

      function workshopMacroViewOpen(path, text) {
        var back = document.createElement("div");
        back.setAttribute("data-workshop-macro-view", "1");
        back.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:12px;box-sizing:border-box;";
        if (typeof workshopVeilClear === "function") workshopVeilClear(back); // never over an emergency stop
        var card = document.createElement("div");
        card.setAttribute("role", "dialog");
        card.setAttribute("aria-modal", "true");
        card.style.cssText = "background:#263238;color:#fff;border-radius:8px;max-width:640px;width:100%;max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 8px 28px rgba(0,0,0,0.6);";
        var head = document.createElement("div");
        head.style.cssText = "display:flex;align-items:center;gap:8px;padding:8px 12px;border-bottom:1px solid rgba(255,255,255,0.2);";
        var title = document.createElement("div");
        title.style.cssText = "flex:1 1 0;min-width:0;font-size:14px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        title.textContent = i18nT('macropick.view_title', { name: path.replace(/^0:\//, "") });
        title.title = path;
        var close = document.createElement("button");
        close.type = "button";
        close.className = "wf-btn";
        close.textContent = i18nT('macropick.close');
        close.style.cssText = "flex:none;min-height:var(--wf-size-s, 32px);min-width:var(--wf-size-s, 32px);";
        close.className = (close.className ? close.className + " " : "") + "wf-hit"; // touched 40 (the scale)
        head.appendChild(title);
        head.appendChild(close);
        var note = document.createElement("div");
        note.style.cssText = "padding:6px 12px;font-size:12px;color:#b0bec5;";
        note.textContent = i18nT('macropick.view_note');
        var pre = document.createElement("pre");
        pre.style.cssText = "margin:0;padding:8px 12px 12px 12px;overflow:auto;flex:1 1 auto;font:12px/1.4 monospace;white-space:pre;tab-size:2;";
        pre.textContent = text;
        card.appendChild(head);
        card.appendChild(note);
        card.appendChild(pre);
        back.appendChild(card);
        function shut() {
          document.removeEventListener("keydown", onKey, true);
          if (back.parentNode) back.parentNode.removeChild(back);
        }
        function onKey(ev) {
          if (ev.key !== "Escape") return;
          ev.stopPropagation();
          shut();
        }
        close.addEventListener("click", shut);
        back.addEventListener("click", function (ev) {
          if (ev.target === back) shut();
        });
        document.addEventListener("keydown", onKey, true);
        document.body.appendChild(back);
        close.focus();
        return true;
      }
