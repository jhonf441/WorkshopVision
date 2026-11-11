      // ---- Start-up card (2026-10-15): what this plugin expects from the machine, and in what state it is ----
      //
      // A person who installs the plugins on THEIR machine does not have the files of the owner's one. The rule of the
      // workshop plugins (see WorkshopJog and docs-internal/PUESTA-EN-MARCHA.md): files of three kinds live on the SD:
      // the plugin's own (sdFiles), EXAMPLES (commented, shipped in 0:/sys/workshop/examples/<PluginId>/<path under 0:/>;
      // the service copies each one ONCE and never overwrites) and the person's own. This card draws the second kind:
      //
      //   green  = configured (it has at least one line that is not a comment, or the check passed)
      //   orange = only the example (all commented: still to configure)
      //   red    = missing
      //   grey   = does not apply to your machine (no strip, no camera, no meter...)
      //
      // vue/_shared/startup.js is the same logic for the Vue pages: tests/startup.test.js checks that
      // both say the same.
      //
      //   var card = workshopStartupInRun({
      //     plugin: "WorkshopControlBar",
      //     filas: [ { id, archivo: "macros/light/x.g", etiqueta: "area.key", ayuda: "area.key",
      //                aplica: false (grey), textos: { example: "area.key" }, comprobar: function () { return Promise.resolve("configured"|"missing"|"na"); } } ],
      //     crearAlInicio: true,   // asks the service to make the examples that were never made (once)
      //   });
      //   parent.appendChild(card.el); card.refresh();
      //
      // Optional per row (all keys of i18n, see docs-internal/STARTUP-WIZARD.md): que / paraQue / siFalta =
      // a plain explanation shown under "What is this?"; asistente = { preguntas, plantilla(respuestas) -> text, destino }
      // makes the assistant ask, show a preview and write the file (never over a file of the person).
      // The pure decisions are in 16-startup-wizard.js.
      //
      // A row has a file (state from examples.list) or a check (state given by estado / comprobar), never both.
      // "Do not use" hides the row on this screen (localStorage); "Show again" brings them back. Nothing here
      // writes over a file of the person: "Create" asks the service, which refuses to overwrite.

      var WORKSHOP_STARTUP_STATES = ["configured", "example", "missing", "session", "na"];

      // defs: rows as above. archivos: [{archivo, estado}] from examples.list, or null when the service did not answer.
      // ocultos: ids of rows the person hid. Returns [{id, def, archivo, estado, existe, oculta, sinDatos}].
      function workshopStartupRows(defs, files, ocultos) {
        var items = Array.isArray(files) ? files : null;
        var hid = Array.isArray(ocultos) ? ocultos : [];
        return (defs || []).map(function (def) {
          var f = { id: def.id, def: def, file: def.file || null, state: "na", exists: false, hidden: hid.indexOf(def.id) >= 0, withoutData: false };
          if (def.applies === false) return f;
          if (def.state !== undefined && def.state !== null) {
            f.state = WORKSHOP_STARTUP_STATES.indexOf(def.state) >= 0 ? def.state : "na";
          } else if (def.file) {
            if (items === null) {
              f.withoutData = true; // without the service there is nothing to say about a file
            } else {
              var hit = items.filter(function (a) {
                return a && a.file === def.file;
              })[0];
              f.exists = !!hit;
              f.state = hit && (hit.state === "configured" || hit.state === "example") ? hit.state : "missing";
            }
          }
          return f;
        });
      }

      // {total, pending, session, ready} over the rows that are shown and apply (hidden, grey and without-data rows do not count).
      // pending = what the person can set up (missing or only the example); session = rows nobody could check because nobody is signed in: they
      // are not "steps to do" (the header chip used to say "1 step pending" to a visitor), but nothing is ready while they are there.
      function workshopStartupSummary(rows) {
        var count = (rows || []).filter(function (f) {
          return !f.hidden && !f.withoutData && f.state !== "na";
        });
        var pending = count.filter(function (f) {
          return f.state === "example" || f.state === "missing";
        }).length;
        var session = count.filter(function (f) {
          return f.state === "session";
        }).length;
        return { total: count.length, pending: pending, session: session, ready: pending === 0 && session === 0 };
      }

      var WORKSHOP_STARTUP_POINT = { configured: "#2e7d32", example: "#e65100", missing: "#c62828", session: "#1e88e5", na: "#455a64" };

      function workshopStartupHiddenRead(key) {
        try {
          var v = JSON.parse(localStorage.getItem(key) || "[]");
          return Array.isArray(v) ? v : [];
        } catch (e) {
          return [];
        }
      }

      function workshopStartupHiddenSave(key, items) {
        try {
          localStorage.setItem(key, JSON.stringify(items));
        } catch (e) {
          /* not critical */
        }
      }

      // tipo (optional, only the modal view uses it): "primario" = filled blue, "suave" = quiet outline, "texto" = link-like
      // the buttons that create or change a file or open the guide that does: they need a session (the card itself can be read without one)
      function workshopStartupLocked(text) {
        if (typeof workshopSignedOut !== "function" || !workshopSignedOut()) return false;
        var keys = ["assist", "assist_all", "edit", "create_help", "make", "preview", "save", "apply_save"];
        for (var i = 0; i < keys.length; i++) if (text === i18nT("startup." + keys[i])) return true;
        return false;
      }

      // the sentence that says why those buttons are off (null when the session is there)
      function workshopStartupLockedNote() {
        if (typeof workshopSignedOut !== "function" || !workshopSignedOut()) return null;
        return workshopReasonEl("session", workshopNoticeText("session")); // by state: signed out, expired or locked PIN
      }

      function workshopStartupButton(text, help, onClick, kind) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.title = help || "";
        // 40 px high at least: the card is used with a finger
        var css = "flex:0 0 auto;border:none;border-radius:4px;padding:6px 12px;min-height:40px;cursor:pointer;font:inherit;font-size:12px;background:#455a64;color:#fff;touch-action:manipulation;";
        if (kind === "primary") css = "flex:0 0 auto;border:none;border-radius:10px;padding:8px 18px;min-height:44px;cursor:pointer;font:inherit;font-size:14px;font-weight:600;background:#1976d2;color:#fff;touch-action:manipulation;";
        else if (kind === "soft") css = "flex:0 0 auto;border:1px solid rgba(255,255,255,0.18);border-radius:10px;padding:6px 14px;min-height:40px;cursor:pointer;font:inherit;font-size:13px;background:rgba(255,255,255,0.07);color:inherit;touch-action:manipulation;";
        else if (kind === "text") css = "flex:0 0 auto;border:none;border-radius:8px;padding:6px 10px;min-height:40px;cursor:pointer;font:inherit;font-size:13px;background:transparent;color:var(--wf-info, #90caf9);touch-action:manipulation;";
        b.style.cssText = css;
        b.addEventListener("pointerdown", function (ev) {
          ev.stopPropagation();
          ev.preventDefault();
        });
        if (workshopStartupLocked(text)) {
          b.disabled = true;
          b.title = i18nT("notice.notice_session_reason");
          b.style.opacity = "0.45";
          b.style.cursor = "not-allowed";
        }
        b.addEventListener("click", function (ev) {
          ev.stopPropagation();
          if (b.disabled) return;
          onClick();
        });
        return b;
      }

      // ---- files of the assistant (the pure decisions are in 16-startup-wizard.js) ----
      function workshopStartupPath(p) {
        return "/machine/file/" + encodeURI(p).replace(/#/g, "%23");
      }
      // text of a file of the machine; null when it does not exist; rejects on any other error (then nothing is written)
      function workshopStartupRead(p) {
        return fetch(workshopStartupPath(p), { cache: "no-store" }).then(function (r) {
          if (r.status === 404) return null;
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        });
      }
      function workshopStartupWrite(p, text) {
        return fetch(workshopStartupPath(p), { method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: text }).then(function (r) {
          if (!r.ok) throw new Error("HTTP " + r.status);
        });
      }
      // the text of the file now (null = does not exist) and which of its side names are taken
      function workshopStartupReadPlan(path) {
        var side = [".example", ".new", ".nuevo2", ".nuevo3", ".nuevo4"].map(function (s) {
          return path + s;
        });
        return Promise.all([workshopStartupRead(path)].concat(side.map(workshopStartupRead))).then(function (r) {
          var busy = side.filter(function (p, i) {
            return r[i + 1] !== null;
          });
          return { existing: r[0], plan: workshopStartupPlanWriting(path, r[0], busy) };
        });
      }

      function workshopStartupEl(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
      }

      function workshopStartupInRun(opts) {
        var plugin = opts.plugin;
        var claveOcultas = opts.keyOcultas || "workshop" + plugin + "StartupHidden";
        var M = opts.view === "modal"; // big cards by function (inside workshopStartupModalOpen) instead of the compact rows
        var abierto = null; // null = open while something is pending
        var abiertas = {}; // rows whose explanation is shown
        var asis = null; // the assistant: null = closed, else {est, vista, resp, errores, prev, plan, existente, msgs, escribiendo, fallo}
        var last = { list: null, rows: [], refusal: "" };
        var el = document.createElement("div");
        el.setAttribute("data-workshop-startup", plugin);
        el.style.cssText = M
          ? "display:flex;flex-direction:column;gap:14px;width:100%;box-sizing:border-box;font-size:14px;line-height:1.45;"
          : "display:flex;flex-direction:column;gap:3px;width:100%;box-sizing:border-box;font-size:11px;line-height:1.3;";
        var creado = false;

        // The DWC editor opens above the page. In the dialog (the highest layer) it would stay hidden behind it: the dialog
        // steps aside while the editor is open and comes back, on the same card / step, when it closes.
        var anfitrion = null; // set by workshopStartupModalOpen: function (oculto) { ... }
        function editFile(path) {
          if (anfitrion) anfitrion(true);
          var abierto = workshopEditFile(path, {
            onClose: function () {
              if (anfitrion) anfitrion(false);
              refrescar();
            },
          });
          Promise.resolve(abierto).then(function (ok) {
            if (ok === false && anfitrion) anfitrion(false); // the editor could not open: do not leave the dialog hidden
          });
        }

        function textState(f) {
          var o = (f.def.texts && f.def.texts[f.state]) || null;
          return i18nT(o || "startup.state_" + f.state);
        }

        // rows with their state now (the service row first)
        function compute() {
          var ocultos = workshopStartupHiddenRead(claveOcultas);
          var defs = [];
          if (opts.serviceRow !== false) {
            defs.push({
              id: "service",
              state: workshopStartupServiceState(last.list, last.refusal, typeof workshopSignedOut === "function" && workshopSignedOut()),
              label: "startup.service",
              help: "startup.service_tip",
              // signed out the service cannot be asked (it answers "sign in"), so it is not said to be off: the row says what is really missing, the session
              texts: { session: "startup.service_session", missing: workshopStartupServiceKey(last.refusal, false), na: "startup.service_role" },
            });
          }
          defs = defs.concat(last.defs || []);
          var rows = workshopStartupRows(defs, last.list, ocultos);
          return { rows: rows, res: workshopStartupSummary(rows) };
        }

        function paint() {
          var c = compute();
          var rows = c.rows;
          var res = c.res;
          el.textContent = "";
          var visibles = rows.filter(function (f) {
            return !f.hidden && !f.withoutData;
          });
          var nOcultas = rows.filter(function (f) {
            return f.hidden;
          }).length;
          var opens = abierto === null ? !res.ready : abierto;

          if (M) {
            workshopStartupReport(plugin, res, last.list !== null && (typeof opts.canReport !== "function" || !!opts.canReport()), opts.onChange);
            if (asis) pintarAsistente(rows);
            else paintModal(rows, visibles, res, nOcultas);
            return;
          }

          var cab = document.createElement("div");
          cab.style.cssText = "display:flex;align-items:center;gap:6px;cursor:pointer;color:inherit;min-height:40px;";
          cab.setAttribute("role", "button");
          var head = workshopStartupStripHead(res); // the dot and the sentence (16-startup-view.js)
          var point = workshopStartupEl("span", "flex:none;width:8px;height:8px;border-radius:50%;background:" + head.color + ";");
          var tit = workshopStartupEl("span", "flex:1 1 auto;min-width:0;font-weight:500;", head.text);
          var fl = document.createElement("span");
          fl.style.cssText = "flex:none;opacity:.7;";
          fl.textContent = opens ? "▴" : "▾";
          cab.appendChild(point);
          cab.appendChild(tit);
          cab.appendChild(fl);
          cab.addEventListener("pointerdown", function (ev) {
            ev.stopPropagation();
          });
          cab.addEventListener("click", function (ev) {
            ev.stopPropagation();
            abierto = !opens;
            paint();
          });
          el.appendChild(cab);
          workshopStartupReport(plugin, res, last.list !== null && (typeof opts.canReport !== "function" || !!opts.canReport()), opts.onChange);
          if (!opens) return;
          var lockedNote = workshopStartupLockedNote();
          if (lockedNote) el.appendChild(lockedNote);

          if (asis) {
            pintarAsistente(rows);
            return;
          }

          // the assistant is offered only when something is red or orange
          if (workshopStartupSteps(rows).length) {
            el.appendChild(
              workshopStartupButton(i18nT("startup.assist"), i18nT("startup.assist_tip"), function () {
                asis = { est: workshopStartupWizardStart(rows), view: "question", resp: null };
                paint();
              })
            );
          }

          visibles.forEach(function (f) {
            var row = document.createElement("div");
            row.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:4px;";
            var p = document.createElement("span");
            p.style.cssText = "flex:none;width:8px;height:8px;border-radius:50%;background:" + WORKSHOP_STARTUP_POINT[f.state] + ";";
            var n = document.createElement("span");
            n.style.cssText = "flex:1 1 120px;min-width:0;overflow-wrap:anywhere;";
            n.textContent = i18nT(f.def.label) + " - " + textState(f);
            if (f.def.help) n.title = i18nT(f.def.help);
            row.appendChild(p);
            row.appendChild(n);
            if (workshopStartupExplanation(f.def)) {
              row.appendChild(
                workshopStartupButton(abiertas[f.id] ? i18nT("startup.what_is_hide") : i18nT("startup.what_is"), "", function () {
                  abiertas[f.id] = !abiertas[f.id];
                  paint();
                })
              );
            }
            if (f.file && f.state !== "missing" && f.state !== "na") {
              row.appendChild(
                workshopStartupButton(i18nT("startup.edit"), i18nT("startup.edit_tip"), function () {
                  editFile("0:/" + f.file);
                })
              );
            } else if (f.def.wizard && f.state === "missing") {
              row.appendChild(
                workshopStartupButton(i18nT("startup.create_help"), i18nT("startup.create_help_tip"), function () {
                  asis = { est: { ids: [f.id], i: 0, end: false, done: [], skipped: [] }, view: "question", resp: null };
                  paint();
                })
              );
            } else if (f.file && f.state === "missing" && f.exists) {
              row.appendChild(
                workshopStartupButton(i18nT("startup.make"), i18nT("startup.make_tip"), function () {
                  workshopApi("examples.create", { plugin: plugin, file: f.file })
                    .then(refrescar)
                    .catch(function () {
                      /* the service is not running: the service row says so */
                    });
                })
              );
            }
            if (f.def.wizard && f.state === "example") {
              row.appendChild(
                workshopStartupButton(i18nT("startup.create_help"), i18nT("startup.create_help_tip"), function () {
                  asis = { est: { ids: [f.id], i: 0, end: false, done: [], skipped: [] }, view: "question", resp: null };
                  paint();
                })
              );
            }
            row.appendChild(
              workshopStartupButton(i18nT("startup.hide"), i18nT("startup.hide_tip"), function () {
                var o = workshopStartupHiddenRead(claveOcultas);
                if (o.indexOf(f.id) < 0) o.push(f.id);
                workshopStartupHiddenSave(claveOcultas, o);
                paint();
              })
            );
            el.appendChild(row);
            if (abiertas[f.id]) el.appendChild(pintarExplicacion(f.def));
          });
          if (nOcultas) {
            var pie = document.createElement("div");
            pie.style.cssText = "display:flex;align-items:center;gap:6px;opacity:.85;";
            var t = document.createElement("span");
            t.textContent = i18nT("startup.hidden_n", { n: nOcultas });
            pie.appendChild(t);
            pie.appendChild(
              workshopStartupButton(i18nT("startup.show_again"), "", function () {
                workshopStartupHiddenSave(claveOcultas, []);
                paint();
              })
            );
            el.appendChild(pie);
          }
        }

        // ---- modal view: progress, one card per function, the hidden ones at the foot ----
        function iniciarAsistente(ids) {
          asis = { est: { ids: ids, i: 0, end: false, done: [], skipped: [] }, view: "question", resp: null };
          paint();
        }

        function hideGroup(g) {
          var o = workshopStartupHiddenRead(claveOcultas);
          g.rows.forEach(function (f) {
            if (o.indexOf(f.id) < 0) o.push(f.id);
          });
          workshopStartupHiddenSave(claveOcultas, o);
          paint();
        }

        function paintModal(rows, visibles, res, nOcultas) {
          var steps = workshopStartupSteps(rows);
          // signed out: the one notice with the sign-in button; then the progress (none while rows could not be checked) -- 16-startup-view.js
          [workshopStartupSessionNoticeEl(), workshopStartupProgressEl(res)].forEach(function (part) {
            if (part) el.appendChild(part);
          });

          if (steps.length) {
            var todo = workshopStartupButton(i18nT("startup.assist_all"), i18nT("startup.assist_tip"), function () {
              iniciarAsistente(workshopStartupWizardStart(rows).ids);
            }, "primary");
            todo.style.width = "100%";
            el.appendChild(todo);
          }

          workshopStartupGroups(rows.filter(function (f) {
            return !f.hidden && !f.withoutData;
          })).forEach(function (g) {
            el.appendChild(paintGroup(g));
          });

          if (nOcultas) {
            var pie = workshopStartupEl("div", "display:flex;align-items:center;justify-content:center;gap:4px;font-size:12px;color:#b0bec5;");
            pie.appendChild(workshopStartupEl("span", "", i18nT("startup.hidden_n", { n: nOcultas })));
            pie.appendChild(
              workshopStartupButton(i18nT("startup.show_again"), "", function () {
                workshopStartupHiddenSave(claveOcultas, []);
                paint();
              }, "text")
            );
            el.appendChild(pie);
          }
        }

        // one function = one card: icon, title, plain description, state chip, its files, one main button
        function paintGroup(g) {
          var tono = WORKSHOP_STARTUP_TONE[g.state] || WORKSHOP_STARTUP_TONE.na;
          var card = workshopStartupEl("div", "display:flex;flex-direction:column;gap:12px;padding:14px 14px 10px;border-radius:10px;background:transparent;border:1px solid rgba(128,128,128,0.3);border-top:2px solid " + tono.text + ";");
          card.setAttribute("data-startup-group", g.id);

          var cab = workshopStartupEl("div", "display:flex;align-items:flex-start;gap:12px;");
          var frame = workshopStartupEl("span", "flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;");
          frame.appendChild(workshopStartupIcon(g.icon, 24, "#9e9e9e"));
          cab.appendChild(frame);
          var texts = workshopStartupEl("div", "flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:2px;");
          texts.appendChild(workshopStartupEl("div", "font-size:16px;font-weight:600;line-height:1.3;overflow-wrap:anywhere;", i18nT(g.title)));
          if (g.description) texts.appendChild(workshopStartupEl("div", "font-size:12px;color:#b0bec5;overflow-wrap:anywhere;", i18nT(g.description)));
          cab.appendChild(texts);
          var chipState = workshopStartupEl("span", "flex:none;align-self:flex-start;display:inline-flex;align-items:center;gap:6px;padding:2px 0;font-size:12px;font-weight:600;white-space:nowrap;"); chipState.appendChild(workshopStartupEl("span", "width:8px;height:8px;border-radius:50%;background:" + tono.text + ";")); chipState.appendChild(document.createTextNode(workshopStartupChipText(g.state))); cab.appendChild(chipState);
          card.appendChild(cab);

          // the files of the card, one line each
          var items = workshopStartupEl("div", "display:flex;flex-direction:column;gap:4px;");
          g.rows.forEach(function (f) {
            var t = WORKSHOP_STARTUP_TONE[f.state] || WORKSHOP_STARTUP_TONE.na;
            var conBoton = (f.file && f.state !== "missing" && f.state !== "na") || (f.file && f.state === "missing" && f.exists && !f.def.wizard);
            if (g.rows.length === 1 && !conBoton && f.state === "configured") return; // the chip of the card already says "ready"
            var row = workshopStartupEl("div", "display:flex;align-items:center;flex-wrap:wrap;gap:8px;padding:4px 10px;border-radius:8px;background:rgba(128,128,128,0.07);min-height:44px;");
            row.appendChild(workshopStartupEl("span", "flex:none;width:9px;height:9px;border-radius:50%;background:" + t.text + ";"));
            var n = workshopStartupEl("span", "flex:1 1 150px;min-width:0;overflow-wrap:anywhere;font-size:13px;");
            n.appendChild(document.createTextNode(i18nT(f.def.label)));
            n.appendChild(workshopStartupEl("span", "color:" + t.text + ";font-size:12px;", " - " + textState(f)));
            if (f.def.help && g.rows.length === 1) n.title = i18nT(f.def.help);
            row.appendChild(n);
            if (f.file && f.state !== "missing" && f.state !== "na") {
              row.appendChild(
                workshopStartupButton(i18nT("startup.edit"), i18nT("startup.edit_tip"), function () {
                  editFile("0:/" + f.file);
                }, "soft")
              );
            } else if (f.file && f.state === "missing" && f.exists && !f.def.wizard) {
              row.appendChild(
                workshopStartupButton(i18nT("startup.make"), i18nT("startup.make_tip"), function () {
                  workshopApi("examples.create", { plugin: plugin, file: f.file })
                    .then(refrescar)
                    .catch(function () {
                      /* the service is not running: the service row says so */
                    });
                }, "soft")
              );
            }
            items.appendChild(row);
          });
          card.appendChild(items);

          // actions: the main one (only when something is pending and the assistant knows how), then the quiet ones
          var acc = workshopStartupEl("div", "display:flex;align-items:center;flex-wrap:wrap;gap:4px;");
          var ids = g.rows
            .filter(workshopStartupPending)
            .filter(function (f) {
              return !!f.def.wizard;
            })
            .map(function (f) {
              return f.id;
            });
          if (ids.length) {
            acc.appendChild(
              workshopStartupButton(i18nT("startup.create_help"), i18nT("startup.create_help_tip"), function () {
                iniciarAsistente(ids);
              }, "primary")
            );
          }
          var first = g.rows.filter(function (f) {
            return workshopStartupExplanation(f.def);
          })[0];
          if (first) {
            acc.appendChild(
              workshopStartupButton(abiertas[g.id] ? i18nT("startup.what_is_hide") : i18nT("startup.what_is"), "", function () {
                abiertas[g.id] = !abiertas[g.id];
                paint();
              }, "text")
            );
          }
          acc.appendChild(workshopStartupEl("span", "flex:1 1 auto;"));
          acc.appendChild(
            workshopStartupButton(i18nT("startup.hide"), i18nT("startup.hide_tip"), function () {
              hideGroup(g);
            }, "text")
          );
          card.appendChild(acc);
          if (first && abiertas[g.id]) card.appendChild(pintarExplicacion(first.def));
          return card;
        }

        // the three short paragraphs of a row: what it is, what the plugin does with it, what happens if it is missing
        function pintarExplicacion(def) {
          var ex = workshopStartupExplanation(def);
          var box = workshopStartupEl("div", "margin:0 0 4px 12px;padding:4px 8px;border-left:2px solid #455a64;opacity:.95;");
          if (!ex) return box;
          [["what_label", ex.what], ["for_label", ex.why], ["missing_label", ex.ifMissing]].forEach(function (par) {
            if (!par[1]) return;
            var p = workshopStartupEl("div", "margin:2px 0;overflow-wrap:anywhere;");
            p.appendChild(workshopStartupEl("b", "", i18nT("startup." + par[0]) + ": "));
            p.appendChild(document.createTextNode(i18nT(par[1])));
            box.appendChild(p);
          });
          return box;
        }

        // ---- the assistant: one pending row at a time ----
        function move(action) {
          asis.est = workshopStartupWizardMove(asis.est, action);
          asis.view = "question";
          asis.resp = null;
          asis.errors = null;
          asis.prev = null;
          asis.msgs = null;
          asis.failure = null;
          paint();
        }

        function cerrarAsistente() {
          asis = null;
          paint();
        }

        function check() {
          return refrescar();
        }

        function pintarAsistente(rows) {
          var est = asis.est;
          var box = workshopStartupEl("div", M ? "display:flex;flex-direction:column;gap:14px;padding:16px;border-radius:14px;background:#263238;border:1px solid rgba(255,255,255,0.10);" : "display:flex;flex-direction:column;gap:6px;padding:4px 0;");
          el.appendChild(box);

          if (est.end) {
            var r = workshopStartupWizardSummary(est, rows);
            box.appendChild(workshopStartupEl("div", "font-weight:500;", i18nT("startup.assist_done_title")));
            box.appendChild(workshopStartupEl("div", "", r.ready ? i18nT("startup.assist_done_ready") : i18nT("startup.assist_done_left", { n: r.pending.length })));
            if (r.lists.length) box.appendChild(workshopStartupEl("div", "", i18nT("startup.assist_done_ok", { n: r.lists.length })));
            if (r.skipped.length) box.appendChild(workshopStartupEl("div", "", i18nT("startup.assist_done_skipped", { n: r.skipped.length })));
            var bs = workshopStartupEl("div", "display:flex;flex-wrap:wrap;gap:6px;");
            bs.appendChild(
              workshopStartupButton(i18nT("startup.assist_prev"), "", function () {
                move("previous");
              }, M ? "soft" : undefined)
            );
            bs.appendChild(workshopStartupButton(i18nT("startup.assist_recheck"), "", check, M ? "soft" : undefined));
            bs.appendChild(workshopStartupButton(i18nT("startup.assist_close"), "", cerrarAsistente, M ? "primary" : undefined));
            box.appendChild(bs);
            return;
          }

          var f = rows.filter(function (x) {
            return x.id === est.ids[est.i];
          })[0];
          if (!f) {
            move("next");
            return;
          }
          if (M) {
            // step counter + progress bar of the walk
            var stepTxt = workshopStartupEl("div", "display:flex;justify-content:space-between;font-size:12px;color:#b0bec5;");
            stepTxt.appendChild(workshopStartupEl("span", "", i18nT("startup.assist_step", { i: est.i + 1, n: est.ids.length })));
            box.appendChild(stepTxt);
            var pistaP = workshopStartupEl("div", "height:6px;border-radius:3px;background:rgba(255,255,255,0.10);overflow:hidden;");
            pistaP.appendChild(workshopStartupEl("div", "height:100%;border-radius:3px;background:#1e88e5;width:" + Math.round(((est.i + 1) / est.ids.length) * 100) + "%;"));
            box.appendChild(pistaP);
          }
          var cab = workshopStartupEl("div", "display:flex;align-items:center;gap:6px;");
          cab.appendChild(workshopStartupEl("span", "flex:none;width:8px;height:8px;border-radius:50%;background:" + WORKSHOP_STARTUP_POINT[f.state] + ";"));
          cab.appendChild(workshopStartupEl("span", "flex:1 1 auto;min-width:0;font-weight:600;" + (M ? "font-size:16px;" : "") + "overflow-wrap:anywhere;", i18nT(f.def.label) + " - " + textState(f)));
          if (!M) cab.appendChild(workshopStartupEl("span", "flex:none;opacity:.75;", i18nT("startup.assist_step", { i: est.i + 1, n: est.ids.length })));
          box.appendChild(cab);
          if (workshopStartupExplanation(f.def)) box.appendChild(pintarExplicacion(f.def));

          var as = f.def.wizard;
          if (asis.view === "preview" && as) paintPreview(box, f);
          else if (asis.view === "result") paintResult(box, f);
          else paintAction(box, f, as);

          // walk buttons (Next becomes "done" when the row is already ready)
          var nav = workshopStartupEl("div", "display:flex;flex-wrap:wrap;gap:" + (M ? "8px" : "6px") + ";border-top:1px solid rgba(255,255,255,0.12);padding-top:" + (M ? "12px" : "6px") + ";");
          var ant = workshopStartupButton(i18nT("startup.assist_prev"), "", function () {
            move("previous");
          }, M ? "soft" : undefined);
          if (est.i === 0) {
            ant.disabled = true;
            ant.style.opacity = "0.4";
          }
          if (est.ids.length > 1) nav.appendChild(ant);
          if (est.ids.length > 1) nav.appendChild(
            workshopStartupButton(i18nT("startup.assist_skip"), "", function () {
              move("skip");
            }, M ? "soft" : undefined)
          );
          if (est.ids.length > 1) nav.appendChild(
            workshopStartupButton(i18nT("startup.assist_next"), "", function () {
              move(workshopStartupPending(f) ? "next" : "done");
            }, M ? "primary" : undefined)
          );
          nav.appendChild(workshopStartupButton(i18nT(est.ids.length > 1 ? "startup.assist_close" : "startup.assist_back_list"), "", cerrarAsistente, M ? "primary" : undefined)); // one step alone (Create with help): only a way back to the list
          box.appendChild(nav);
        }

        // the main part of a step: the questions, the example, the editor, or just the explanation
        function paintAction(box, f, as) {
          if (as) {
            if (!asis.resp) asis.resp = workshopStartupAnswersInitial(as.questions);
            box.appendChild(workshopStartupEl("div", "opacity:.9;", i18nT("startup.questions_intro")));
            as.questions.forEach(function (q) {
              if (!workshopStartupVisible(q, asis.resp)) return;
              box.appendChild(pintarPregunta(q));
            });
            if (asis.failure) box.appendChild(workshopStartupEl("div", "color:#ef9a9a;", asis.failure));
            box.appendChild(
              workshopStartupButton(i18nT("startup.preview"), "", function () {
                var v = workshopStartupViewPreview(as, asis.resp);
                asis.errors = v.errors;
                asis.failure = null;
                if (!v.ok) {
                  paint();
                  return;
                }
                asis.prev = v;
                workshopStartupReadPlan(workshopStartupDestination(f.def)).then(
                  function (p) {
                    asis.plan = p.plan;
                    asis.existing = p.existing;
                    asis.view = "preview";
                    paint();
                  },
                  function (e) {
                    asis.failure = i18nT("startup.verify_fail", { error: e && e.message ? e.message : "?" });
                    paint();
                  }
                );
              }, M ? "primary" : undefined)
            );
            return;
          }
          if (f.file && f.state === "missing" && f.exists) {
            box.appendChild(
              workshopStartupButton(i18nT("startup.make"), i18nT("startup.make_tip"), function () {
                workshopApi("examples.create", { plugin: plugin, file: f.file })
                  .then(refrescar)
                  .catch(function () {
                    /* the service is not running: the service row says so */
                  });
              })
            );
          } else if (f.file && f.state !== "missing") {
            box.appendChild(
              workshopStartupButton(i18nT("startup.edit"), i18nT("startup.edit_tip"), function () {
                editFile("0:/" + f.file);
              })
            );
          } else {
            box.appendChild(workshopStartupEl("div", "opacity:.9;", i18nT("startup.assist_no_action")));
            box.appendChild(workshopStartupButton(i18nT("startup.assist_recheck"), "", check));
          }
        }

        function labelField(q) {
          var l = workshopStartupEl("label", "display:block;font-weight:500;", i18nT(q.label));
          return l;
        }

        function pintarPregunta(q) {
          var cont = workshopStartupEl("div", "display:flex;flex-direction:column;gap:3px;");
          cont.appendChild(labelField(q));
          var estiloCampo = M
            ? "box-sizing:border-box;min-height:46px;padding:8px 12px;font:inherit;font-size:15px;border-radius:10px;border:1px solid rgba(255,255,255,0.22);background:rgba(0,0,0,0.25);color:inherit;max-width:100%;color-scheme:dark;"
            : "box-sizing:border-box;min-height:40px;padding:6px 8px;font:inherit;font-size:13px;border-radius:4px;border:1px solid #607d8b;background:rgba(255,255,255,0.08);color:inherit;max-width:100%;color-scheme:dark;";
          if (q.kind === "list") {
            var s = workshopStartupEl("select", estiloCampo);
            q.options.forEach(function (o) {
              var op = document.createElement("option"); op.style.cssText = "background:#263238;color:#eceff1;"; // the list opens on the browser white: own colors so the text is not white on white
              op.value = o.value;
              op.textContent = i18nT(o.label);
              if (o.value === asis.resp[q.id]) op.selected = true;
              s.appendChild(op);
            });
            s.addEventListener("change", function () {
              asis.resp[q.id] = s.value;
              paint(); // other questions may depend on this one
            });
            cont.appendChild(s);
          } else if (q.kind === "si_no") {
            var row = workshopStartupEl("div", "display:flex;gap:6px;");
            [[true, "startup.yes"], [false, "startup.no"]].forEach(function (par) {
              var b = workshopStartupButton(i18nT(par[1]), "", function () {
                asis.resp[q.id] = par[0];
                paint();
              });
              b.style.background = !!asis.resp[q.id] === par[0] ? "#2e7d32" : "#455a64";
              row.appendChild(b);
            });
            cont.appendChild(row);
          } else {
            var inp = workshopStartupEl("input", estiloCampo);
            inp.type = "text";
            inp.setAttribute("enterkeyhint", "done");
            if (q.kind === "number") inp.setAttribute("inputmode", "decimal");
            inp.value = asis.resp[q.id] === undefined ? "" : String(asis.resp[q.id]);
            inp.addEventListener("input", function () {
              asis.resp[q.id] = inp.value;
            });
            // Enter hides the on-screen keyboard
            inp.addEventListener("keydown", function (ev) {
              if (ev.key === "Enter") {
                ev.preventDefault();
                inp.blur();
              }
            });
            cont.appendChild(inp);
          }
          if (q.help) cont.appendChild(workshopStartupEl("div", "opacity:.75;", i18nT(q.help)));
          var e = asis.errors && asis.errors[q.id];
          if (e) cont.appendChild(workshopStartupEl("div", "color:#ef9a9a;", i18nT(e)));
          return cont;
        }

        function paintPreview(box, f) {
          var prev = asis.prev;
          var plan = asis.plan;
          var destination = workshopStartupDestination(f.def);
          box.appendChild(workshopStartupEl("div", "font-weight:500;overflow-wrap:anywhere;", i18nT("startup.preview_title", { file: destination })));
          var pre = workshopStartupCode(prev.text);
          box.appendChild(pre);
          if (prev.commented) box.appendChild(workshopNoteEl("warn", i18nT("startup.warn_moves", { n: prev.commented })));
          if (prev.active) box.appendChild(workshopStartupEl("div", "opacity:.9;", i18nT("startup.warn_active")));
          box.appendChild(workshopStartupEl("div", "overflow-wrap:anywhere;", i18nT(plan.reason, { file: destination, backup: plan.backup || "", target: plan.path })));
          if (asis.failure) box.appendChild(workshopStartupEl("div", "color:#ef9a9a;", asis.failure));
          var bs = workshopStartupEl("div", "display:flex;flex-wrap:wrap;gap:6px;");
          bs.appendChild(
            workshopStartupButton(i18nT("startup.back"), "", function () {
              asis.view = "question";
              asis.failure = null;
              paint();
            })
          );
          var g = workshopStartupButton(asis.writing ? i18nT("startup.saving") : i18nT("startup.save"), "", function () {
            save(f);
          });
          if (asis.writing) g.disabled = true;
          g.style.background = "#2e7d32";
          if (M) g.style.cssText += ";border-radius:10px;min-height:44px;font-size:14px;font-weight:600;padding:8px 18px;";
          bs.appendChild(g);
          box.appendChild(bs);
        }

        function paintResult(box, f) {
          (asis.msgs || []).forEach(function (m) {
            box.appendChild(workshopStartupEl("div", "overflow-wrap:anywhere;", i18nT(m.key, m.params)));
          });
          var bs = workshopStartupEl("div", "display:flex;flex-wrap:wrap;gap:6px;");
          bs.appendChild(
            workshopStartupButton(i18nT("startup.edit"), i18nT("startup.edit_tip"), function () {
              editFile(asis.plan ? asis.plan.path : workshopStartupDestination(f.def));
            })
          );
          bs.appendChild(workshopStartupButton(i18nT("startup.assist_recheck"), "", check));
          box.appendChild(bs);
        }

        // Writes ONLY what the plan says (the file is read again right before: it may have changed while the person
        // was answering), then reads it back and the state of the row again, and tells how it went.
        function save(f) {
          var as = f.def.wizard;
          var destination = workshopStartupDestination(f.def);
          asis.writing = true;
          asis.failure = null;
          paint();
          workshopStartupReadPlan(destination)
            .then(function (p) {
              var plan = p.plan;
              var seen = asis.plan;
              asis.plan = plan;
              // the file changed since the preview was shown: show the new plan and ask again, write nothing
              if (seen && (seen.mode !== plan.mode || seen.path !== plan.path)) {
                asis.failure = i18nT("startup.plan_changed");
                return null;
              }
              var v = workshopStartupViewPreview(as, asis.resp);
              if (!v.ok) throw new Error("answers");
              var previous = plan.backup ? workshopStartupWrite(plan.backup, p.existing) : Promise.resolve();
              return previous
                .then(function () {
                  return workshopStartupWrite(plan.path, v.text);
                })
                .then(function () {
                  return workshopStartupRead(plan.path);
                })
                .then(function (read) {
                  return refrescar().then(function () {
                    var row = compute().rows.filter(function (x) {
                      return x.id === f.id;
                    })[0];
                    asis.msgs = workshopStartupVerify(read, row, plan).messages;
                    asis.view = "result";
                  });
                });
            })
            .catch(function (e) {
              asis.failure = i18nT("startup.verify_fail", { error: e && e.message ? e.message : "?" });
            })
            .then(function () {
              asis.writing = false;
              paint();
            });
        }

        function readChecks() {
          return Promise.all(
            (opts.rows || []).map(function (def) {
              if (typeof def.check !== "function") return def;
              var copy = {};
              Object.keys(def).forEach(function (k) {
                copy[k] = def[k];
              });
              return Promise.resolve()
                .then(def.check)
                .catch(function () {
                  return "na"; // a check that fails never turns into an error: it does not apply
                })
                .then(function (e) {
                  copy.state = e;
                  return copy;
                });
            })
          );
        }

        function refrescar() {
          var previous = opts.createOnStart && !creado ? workshopApi("examples.create", { plugin: plugin }).catch(function () {}) : Promise.resolve();
          creado = true;
          return previous
            .then(function () {
              return workshopApi("examples.list", { plugin: plugin }).then(
                function (r) {
                  last.refusal = "";
                  return r && Array.isArray(r.files) ? r.files : null;
                },
                function (e) {
                  // a refusal (no session, role too low) is not the service being down: keep what it said so the row can say why
                  last.refusal = e && (e.code === "forbidden" || e.code === "login_required") ? e.code : "";
                  return null;
                }
              );
            })
            .then(function (items) {
              last.list = items;
              return readChecks();
            })
            .then(function (defs) {
              last.defs = defs;
              paint();
            });
        }

        workshopStartupFollowSession(el, refrescar);

        return {
          el: el,
          refresh: refrescar,
          summary: function () {
            return compute().res;
          },
          bindTo: function (fn) {
            anfitrion = fn;
          },
        };
      }

      // ---- modal view (2026-10-16): the same card drawn as big cards, one per FUNCTION, inside a dialog ----
      // A row may carry grupo (id), grupoEtiqueta / grupoDescripcion (i18n keys) and grupoIcono (a key of WORKSHOP_STARTUP_ICONS, 16-startup-view.js):
      // the rows of one group (e.g. "on" and "off" of the light) are one card. Rows without grupo are a card of their own.

      // the worst state of a group (what the card shows): missing > example > configured > na
      function workshopStartupWorstState(rows) {
        var order = ["missing", "session", "example", "configured", "na"];
        var best = "na";
        (rows || []).forEach(function (f) {
          if (order.indexOf(f.state) < order.indexOf(best)) best = f.state;
        });
        return best;
      }

      // Rows (as workshopStartupRows returns them, hidden and without-data ones already left out) -> groups in order of
      // appearance: [{id, titulo, descripcion, icono, filas, estado}]. titulo / descripcion are i18n keys.
      function workshopStartupGroups(rows) {
        var groups = [];
        var by = {};
        (rows || []).forEach(function (f) {
          var id = f.def.group || "row:" + f.id;
          var g = by[id];
          if (!g) {
            g = by[id] = {
              id: id,
              title: f.def.groupLabel || f.def.label,
              description: f.def.groupDescription || f.def.help || null,
              icon: f.def.groupIcon || (f.id === "service" ? "service" : "file"),
              rows: [],
              state: "na",
            };
            groups.push(g);
          }
          g.rows.push(f);
        });
        groups.forEach(function (g) {
          g.state = workshopStartupWorstState(g.rows);
        });
        return groups;
      }

      // Opens the card as a dialog over the page. card = what workshopStartupInRun({vista: "modal"}) returned.
      // opts: {id, titulo, subtitulo, cerrar} (already translated). Returns {cerrar}. One dialog at a time per id.
      function workshopStartupModalOpen(card, opts) {
        opts = opts || {};
        var idBackground = "workshop-startup-modal-" + (opts.id || "x");
        var old = document.getElementById(idBackground);
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var chico = window.innerWidth < 600;
        var background = document.createElement("div");
        background.id = idBackground;
        background.setAttribute("data-tp-panel", "1");
        background.style.cssText =
          "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483647;background:rgba(8,14,18,0.66);display:flex;align-items:" + (chico ? "stretch" : "center") + ";justify-content:center;padding:" + (chico ? "0" : "16px") + ";box-sizing:border-box;";
        var box = document.createElement("div");
        box.setAttribute("role", "dialog");
        box.setAttribute("aria-modal", "true");
        box.style.cssText =
          "display:flex;flex-direction:column;width:100%;max-width:" + (chico ? "none" : "580px") + ";max-height:" + (chico ? "none" : "88vh") + ";background:#1e272c;color:#eceff1;border-radius:" + (chico ? "0" : "18px") + ";border:1px solid rgba(128,128,128,0.3);box-shadow:0 18px 60px rgba(0,0,0,0.55);overflow:hidden;font-family:Roboto,\"Helvetica Neue\",Arial,sans-serif;color-scheme:dark;";
        var cab = document.createElement("div");
        cab.style.cssText = "flex:none;display:flex;align-items:center;gap:12px;padding:16px 16px 14px 20px;border-bottom:1px solid rgba(128,128,128,0.3);";
        var ic = document.createElement("span");
        ic.style.cssText = "flex:none;display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;";
        ic.appendChild(workshopStartupIcon("rocket", 24, "#9e9e9e"));
        var tt = document.createElement("div");
        tt.style.cssText = "flex:1 1 auto;min-width:0;";
        var h = document.createElement("div");
        h.style.cssText = "font-size:18px;font-weight:600;line-height:1.25;";
        h.textContent = opts.title || "";
        tt.appendChild(h);
        if (opts.subtitle) {
          var sub = document.createElement("div");
          sub.style.cssText = "font-size:12px;color:#b0bec5;line-height:1.35;margin-top:2px;";
          sub.textContent = opts.subtitle;
          tt.appendChild(sub);
        }
        var x = document.createElement("button");
        x.type = "button";
        x.title = opts.close || i18nT("startup.close");
        x.setAttribute("aria-label", opts.close || i18nT("startup.close"));
        x.style.cssText = "flex:none;display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border:none;border-radius:50%;background:transparent;color:#b0bec5;cursor:pointer;touch-action:manipulation;";
        x.appendChild(workshopStartupIcon("close", 22, "currentColor"));
        cab.appendChild(ic);
        cab.appendChild(tt);
        cab.appendChild(x);
        var cuerpo = document.createElement("div");
        cuerpo.style.cssText = "flex:1 1 auto;min-height:0;overflow-y:auto;padding:16px 20px 20px;-webkit-overflow-scrolling:touch;";
        cuerpo.appendChild(card.el);
        box.appendChild(cab);
        box.appendChild(cuerpo);
        background.appendChild(box);

        function tecla(ev) {
          if (ev.key === "Escape" && background.style.display !== "none") cerrar(); // hidden = the DWC editor is open: Esc is for it
        }
        function cerrar() {
          document.removeEventListener("keydown", tecla, true);
          if (card.el.parentNode === cuerpo) cuerpo.removeChild(card.el);
          if (background.parentNode) background.parentNode.removeChild(background);
          if (card.bindTo) card.bindTo(null);
          if (opts.onClose) opts.onClose();
        }
        x.addEventListener("click", cerrar);
        // a tap on the dark area closes it; a tap inside never does
        background.addEventListener("pointerdown", function (ev) {
          if (ev.target === background) cerrar();
        });
        document.addEventListener("keydown", tecla, true);
        document.body.appendChild(background);
        if (card.bindTo) {
          card.bindTo(function (hidden) {
            background.style.display = hidden ? "none" : "flex";
          });
        }
        card.refresh();
        return { close: cerrar };
      }

      // ---- Entry for a page (2026-10-16): the card as a quiet strip that opens the dialog ----
      // Drop-in for workshopStartupInRun in the pages of the other plugins: returns {el, refrescar, abrir, resumen}.
      // el is a slim strip ("Start-up - 2 left to set up" + button). The card itself (cards by function) lives in the dialog.
      // opts: the ones of workshopStartupInRun plus subtitulo (i18n key, optional).
      function workshopStartupInput(opts) {
        var box = document.createElement("div");
        box.setAttribute("data-workshop-startup-input", opts.plugin);
        var icon = workshopStartupIcon("rocket", 16, "currentColor");
        var text = document.createElement("span");
        box.appendChild(icon);
        box.appendChild(text);
        box.addEventListener("click", function () {
          input.open();
        });

        // the chip for the page header (rocket + name; 16-startup-view.js)
        function paintBand(res) {
          workshopStartupBandPaint(box, icon, text, res);
        }
        paintBand({ ready: true, pending: 0 });

        var propias = {};
        Object.keys(opts).forEach(function (k) {
          propias[k] = opts[k];
        });
        propias.view = "modal";
        propias.onChange = function (res) {
          paintBand(res);
          if (opts.onChange) opts.onChange(res);
        };
        var card = workshopStartupInRun(propias);
        var input = {
          el: box,
          refresh: card.refresh,
          summary: card.summary,
          open: function () {
            // the dialog refreshes through entrada.refresh, which a page may wrap (e.g. to forget a memo first)
            return workshopStartupModalOpen(
              {
                el: card.el,
                bindTo: card.bindTo,
                refresh: function () {
                  return input.refresh();
                },
              },
              { id: opts.plugin, title: i18nT("startup.title"), subtitle: i18nT(opts.subtitle || "startup.modal_sub") }
            );
          },
        };
        return input;
      }
