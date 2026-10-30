      // ---- Warnings standard (2026-10-10, request: "standardize how it
      // warns according to what each thing does... and the color... and the lights
      // paint it"; "yes, apply it everywhere"). See DESIGN.md section 5.
      //
      //   Level 0-1  reads / changes something reversible   one tap, no confirmation
      //   Level 2    moves the machine or heats             DOUBLE TAP, amber
      //   Level 3    can damage machine or material         central NOTICE (00-core.js
      //              WORKSHOP_RISKS, orange); replaces the double tap
      //   Level 4    leaves the machine WITHOUT a protection while it lasts
      //              warnings box + "Understood" checkbox (or
      //              workshopConfirmLevel4) + ACTIVE RISK while it lasts
      //              (red: bar at the top on all screens and LEDs)
      //   Emergency  STOP / E-STOP are never blocked nor ask for anything
      //
      // The active risk is carried by the Pi (WorkshopService riesgo.py): some it
      // detects by itself (calibrating crash or PID, global.motorsLoose) and the
      // others are opened and closed with workshopRiskStart / workshopRiskFinish.

      var WORKSHOP_LEVELS = {
        2: { fill: "#ff8f00", text: "#ffe082", vue: "amber darken-3", name: i18nT('advertencias.level_moves_or_heats') },
        3: { fill: "#e65100", text: "#ffb74d", vue: "warning", name: i18nT('advertencias.level_can_damage') },
        4: { fill: "#c62828", text: "#ef9a9a", vue: "error", name: i18nT('advertencias.level_without_a_protection') },
      };

      // texto: a string (the DWC language) or {es, en}: with both, every screen
      // shows the warning in its own language (WorkshopService riesgo.py, texts).
      function workshopRiskStart(id, texto, segundos) {
        var args = { id: String(id), seconds: Math.round(segundos || 600) };
        if (texto && typeof texto === "object") {
          args.text = String(texto.es || texto.en || id);
          if (texto.en) args.text_en = String(texto.en);
        } else args.text = String(texto || id);
        return workshopApi("risk.start", args).catch(function () {});
      }
      // Text of a published risk in the DWC language: e.text is a message of the service ({key, params}; a risk started
      // from a page brings its two texts) or, from an older service, a plain text shown as it is.
      function workshopRiskText(e) {
        return workshopServiceText(e && e.text) || String((e && e.id) || "");
      }
      function workshopRiskFinish(id) {
        return workshopApi("risk.end", { id: String(id) }).catch(function () {});
      }

      // Notes in Activity something that was saved on a page and leaves no trace on the
      // machine (calibrations, settings): API activity.log (WorkshopService).
      // clave: what is saved many times in a row (a field being edited) is
      // noted only once, 20 s after the last change.
      var workshopNotePending = {};
      function workshopNote(kind, texto, key) {
        var send = function () {
          return workshopApi("activity.log", { type: kind, text: String(texto).slice(0, 250) }).catch(function () {});
        };
        if (!key) return send();
        clearTimeout(workshopNotePending[key]);
        workshopNotePending[key] = setTimeout(send, 20000);
      }

      // Nivel 4 en un cartel: lista de avisos + casilla obligatoria. Promise<bool>.
      // o: {titulo, avisos: [texto], entendido: "Entendido: ...", boton: "Empezar"}
      // (the texts arrive already translated: i18nT / $t of the caller)
      function workshopConfirmLevel4(o) {
        return new Promise(function (resolve) {
          var background = document.createElement("div");
          background.setAttribute("data-tp-panel", "1");
          background.style.cssText = "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;padding:16px;";
          var box = document.createElement("div");
          box.setAttribute("role", "alertdialog");
          // same look as the dialogs of DWC (the plugin install wizard): flat dark card, 20 px title, text buttons
          box.style.cssText = "background:#1e1e1e;color:rgba(255,255,255,0.87);border-left:4px solid #c62828;border-radius:4px;max-width:500px;width:100%;padding:16px 24px;font-size:14px;line-height:1.5;box-shadow:0 11px 15px -7px rgba(0,0,0,0.2),0 24px 38px 3px rgba(0,0,0,0.14),0 9px 46px 8px rgba(0,0,0,0.12);max-height:90vh;overflow:auto;";
          var h = document.createElement("div");
          h.style.cssText = "font-size:20px;font-weight:500;line-height:1.6;color:#fff;margin-bottom:8px;";
          h.textContent = o.title || i18nT('advertencias.attention');
          box.appendChild(h);
          var ol = document.createElement("ol");
          ol.style.cssText = "padding-left:18px;margin:0 0 8px 0;";
          (o.notices || []).forEach(function (t) {
            var li = document.createElement("li");
            li.textContent = t;
            li.style.marginBottom = "3px";
            ol.appendChild(li);
          });
          box.appendChild(ol);
          var lab = document.createElement("label");
          lab.style.cssText = "display:flex;gap:8px;align-items:flex-start;font-weight:600;cursor:pointer;color:#ef9a9a;";
          var cb = document.createElement("input");
          cb.type = "checkbox";
          lab.appendChild(cb);
          lab.appendChild(document.createTextNode(o.understood || i18nT('advertencias.understood')));
          box.appendChild(lab);
          var row = document.createElement("div");
          row.style.cssText = "display:flex;gap:8px;justify-content:flex-end;margin-top:16px;";
          var bc = document.createElement("button");
          bc.type = "button";
          bc.textContent = i18nT('core.cancel');
          bc.style.cssText = "background:transparent;color:#2196f3;border:0;border-radius:4px;padding:6px 12px;min-height:36px;font-size:14px;font-weight:500;cursor:pointer;";
          var bo = document.createElement("button");
          bo.type = "button";
          bo.textContent = o.button || i18nT('advertencias.start');
          bo.disabled = true;
          bo.style.cssText = "background:transparent;color:#ef5350;border:0;border-radius:4px;padding:6px 12px;min-height:36px;font-size:14px;font-weight:600;cursor:pointer;opacity:0.4;";
          cb.addEventListener("change", function () {
            bo.disabled = !cb.checked;
            bo.style.opacity = cb.checked ? "1" : "0.4";
          });
          function end(v) {
            document.removeEventListener("keydown", tecla, true);
            if (background.parentNode) background.parentNode.removeChild(background);
            resolve(v);
          }
          function tecla(ev) {
            if (ev.key === "Escape") end(false);
          }
          bc.addEventListener("click", function () { end(false); });
          bo.addEventListener("click", function () { if (cb.checked) end(true); });
          document.addEventListener("keydown", tecla, true);
          row.appendChild(bc);
          row.appendChild(bo);
          box.appendChild(row);
          background.appendChild(box);
          (document.fullscreenElement || document.body).appendChild(background); // visible tambien en pantalla completa
        });
      }

      // Red bar at the top on ALL screens while there is an active risk
      // (plugins.WorkshopService.data.riskActive). A single one even if several
      // plugins bring this file.
      // After the rest of the plugin's file: window.__workshop is built by
      // 10-registry.js (creating it empty here broke the startup of all of them).
      setTimeout(function tallerRiesgoBarra() {
        var t = window.__workshop;
        if (!t) return;
        t.levels = WORKSHOP_LEVELS;
        t.riskStart = workshopRiskStart;
        t.riskFinish = workshopRiskFinish;
        t.riskText = function (e) { return workshopRiskText(e); };
        t.confirmLevel4 = workshopConfirmLevel4;
        t.confirmRisk = workshopConfirmRisk; // level 3 (00-core.js), for the Vue pages
        t.annotate = workshopNote;
        if (t.riskBar) return;
        t.riskBar = true;
        var bar = null, key = "";
        function datos() {
          try {
            var p = workshopPluginOf(workshopHostPluginsModel(), "service");
            var dr = workshopPluginData(p);
            var r = dr && dr.riskActive;
            return Array.isArray(r) ? r : [];
          } catch (e) {
            return [];
          }
        }
        function dur(ms) {
          var s = Math.max(0, Math.round((Date.now() - ms) / 1000));
          return (s >= 60 ? Math.floor(s / 60) + " min " : "") + (s % 60) + " s";
        }
        setInterval(function () {
          var r = datos();
          var k = JSON.stringify(r.map(function (e) { return e.id + JSON.stringify(e.text); }));
          if (!r.length) {
            if (bar) { bar.remove(); bar = null; }
            key = "";
            return;
          }
          if (!bar) {
            bar = document.createElement("div");
            bar.setAttribute("role", "alert");
            bar.style.cssText = "position:fixed;top:0;left:50%;transform:translateX(-50%);z-index:2147483646;background:#c62828;color:#fff;font:600 12px Roboto,sans-serif;padding:4px 14px;border-radius:0 0 8px 8px;box-shadow:0 2px 10px rgba(0,0,0,0.5);max-width:90vw;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:18px;pointer-events:none;";
          }
          // in full screen (Workbench map, jog) only what is inside the
          // full-screen element is seen: the bar goes with the
          var root = document.fullscreenElement || document.body;
          if (bar.parentNode !== root) root.appendChild(bar);
          bar.textContent = i18nT('advertencias.active_risk_2', { list: r.map(function (e) { return workshopRiskText(e) + " (" + dur(e.since) + ")"; }).join("  |  ") });
          key = k;
        }, 1000);
      }, 0);
