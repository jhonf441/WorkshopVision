      // ---- Start-up card, compact view: the header with its dot, the assistant button and one row per function ----
      // Called by paint() of workshopStartupInRun (16-startup.js) with a context S: the data of this paint (el, rows, res, visibles, omitidas,
      // nOcultas, opens) and the actions that change the state that lives in that closure. It keeps no state of its own. The rows are
      // workshopStartupCompactRow, the folded "not in use" section workshopStartupCompactSkipped.
      function workshopStartupPaintCompact(S) {
        var el = S.el;
        var rows = S.rows;
        var res = S.res;
        var opens = S.opens;
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
          S.toggleOpen(opens);
        });
        el.appendChild(cab);
        S.report();
        if (!opens) return;
        var lockedNote = workshopStartupLockedNote();
        if (lockedNote) el.appendChild(lockedNote);

        if (S.inAssistant()) {
          S.paintAssistant();
          return;
        }

        // the assistant is offered only when something is red or orange
        if (workshopStartupSteps(rows).length) {
          el.appendChild(
            workshopStartupButton(i18nT("startup.assist"), i18nT("startup.assist_tip"), function () {
              S.openWizard(workshopStartupWizardStart(rows));
            })
          );
        }

        S.visibles.forEach(function (f) {
          workshopStartupCompactRow(S, f);
        });
        if (S.nOcultas) workshopStartupCompactSkipped(S);
      }

      // one row of a function: dot, text, and what can be done with it
      function workshopStartupCompactRow(S, f) {
        var el = S.el;
        var row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:4px;";
        var p = document.createElement("span");
        p.style.cssText = "flex:none;width:8px;height:8px;border-radius:50%;background:" + WORKSHOP_STARTUP_POINT[f.state] + ";";
        var n = document.createElement("span");
        n.style.cssText = "flex:1 1 120px;min-width:0;overflow-wrap:anywhere;";
        n.textContent = i18nT(f.def.label) + " - " + S.stateText(f);
        if (f.def.help) n.title = i18nT(f.def.help);
        row.appendChild(p);
        row.appendChild(n);
        if (f.state === "unchecked") row.appendChild(workshopStartupRecheckButton(S.refresh));
        if (workshopStartupExplanation(f.def)) {
          row.appendChild(
            workshopStartupButton(S.explained(f.id) ? i18nT("startup.what_is_hide") : i18nT("startup.what_is"), "", function () {
              S.toggleExplained(f.id);
            })
          );
        }
        if (f.file && f.state !== "missing" && f.state !== "na") {
          row.appendChild(
            workshopStartupButton(i18nT("startup.edit"), i18nT("startup.edit_tip"), function () {
              S.editFile("0:/" + f.file);
            })
          );
        } else if (f.def.wizard && f.state === "missing") {
          row.appendChild(
            workshopStartupButton(i18nT("startup.create_help"), i18nT("startup.create_help_tip"), function () {
              S.openWizard({ ids: [f.id], i: 0, end: false, done: [], skipped: [] });
            })
          );
        } else if (f.file && f.state === "missing" && f.exists) {
          row.appendChild(
            workshopStartupButton(i18nT("startup.make"), i18nT("startup.make_tip"), function () {
              workshopApi("examples.create", { plugin: S.plugin, file: f.file })
                .then(S.refresh)
                .catch(function () {
                  /* the service is not running: the service row says so */
                });
            })
          );
        }
        if (f.def.wizard && f.state === "example") {
          row.appendChild(
            workshopStartupButton(i18nT("startup.create_help"), i18nT("startup.create_help_tip"), function () {
              S.openWizard({ ids: [f.id], i: 0, end: false, done: [], skipped: [] });
            })
          );
        }
        if (workshopStartupPending(f)) {
          // only what is still to do can be put away: a row that works has nothing to skip
          row.appendChild(
            workshopStartupButton(i18nT("startup.omit"), i18nT("startup.omit_tip"), function () {
              workshopStartupOmit(S.omitted, [f.id]);
              S.repaint();
            })
          );
        }
        el.appendChild(row);
        if (S.explained(f.id)) el.appendChild(S.explain(f.def, f.state));
      }

      // the "not in use" footer and, when asked for, its rows
      function workshopStartupCompactSkipped(S) {
        var el = S.el;
        var pie = document.createElement("div");
        pie.style.cssText = "display:flex;align-items:center;gap:6px;opacity:.85;";
        var t = document.createElement("span");
        t.textContent = i18nT("startup.skipped_n", { n: S.nOcultas });
        pie.appendChild(t);
        pie.appendChild(
          workshopStartupButton(S.showSkipped() ? i18nT("startup.skipped_hide") : i18nT("startup.skipped_show"), "", function () {
            S.toggleSkipped();
          })
        );
        el.appendChild(pie);
        if (S.showSkipped()) S.omitidas.forEach(function (f) {
          var row = document.createElement("div");
          row.style.cssText = "display:flex;align-items:center;flex-wrap:wrap;gap:4px;";
          var p = document.createElement("span");
          p.style.cssText = "flex:none;width:8px;height:8px;border-radius:50%;background:" + WORKSHOP_STARTUP_POINT.skipped + ";";
          var n = document.createElement("span");
          n.style.cssText = "flex:1 1 120px;min-width:0;overflow-wrap:anywhere;opacity:.85;";
          n.textContent = i18nT(f.def.label) + " - " + S.stateText(f);
          if (f.def.help) n.title = i18nT(f.def.help);
          row.appendChild(p);
          row.appendChild(n);
          if (f.skipReason === "chosen") {
            row.appendChild(
              workshopStartupButton(i18nT("startup.use_again"), i18nT("startup.use_again_tip"), function () {
                workshopStartupUseAgain(S.omitted, [f.id]);
                S.repaint();
              })
            );
          }
          el.appendChild(row);
        });
      }
