      // ---- Start-up assistant, PURE logic (2026-10-15) ----
      //
      // Everything the assistant of the start-up card decides without touching the screen or the machine: the walk
      // over the pending rows, the validation of the answers, the preview of the file, the "never overwrite" policy
      // and the check made after writing. The screen part is in 16-startup.js.
      //
      // vue/_shared/startup-wizard.js has the SAME functions for the Vue pages (puestaXxx instead of tallerPuestaXxx):
      // tests/startup.test.js checks that both say the same. If you change one, change the other.
      //
      // Docs: docs-internal/STARTUP-WIZARD.md.

      // Optional explanation of a row (def.what / def.why / def.ifMissing are i18n keys). null = the row has none.
      function workshopStartupExplanation(def) {
        if (!def || (!def.what && !def.why && !def.ifMissing)) return null;
        return { what: def.what || null, why: def.why || null, ifMissing: def.ifMissing || null };
      }

      // Ids of the rows the assistant walks over: only the red and orange ones that are shown and have data.
      function workshopStartupSteps(rows) {
        return (rows || [])
          .filter(function (f) {
            return !f.hidden && !f.withoutData && (f.state === "missing" || f.state === "example");
          })
          .map(function (f) {
            return f.id;
          });
      }

      // State of a walk: {ids, i, fin, hechas, saltadas}. fin = past the last step (the summary is shown).
      function workshopStartupWizardStart(rows) {
        var ids = workshopStartupSteps(rows);
        return { ids: ids, i: 0, end: ids.length === 0, done: [], skipped: [] };
      }

      function workshopStartupWithout(items, id) {
        return items.filter(function (x) {
          return x !== id;
        });
      }

      // accion: "siguiente" | "anterior" | "saltar" (next and remember it was skipped) | "hecho" (next and remember it was done).
      // Returns a new state; the old one is not changed.
      function workshopStartupWizardMove(est, action) {
        var n = { ids: est.ids.slice(), i: est.i, end: est.end, done: est.done.slice(), skipped: est.skipped.slice() };
        var id = n.ids[n.i];
        if (action === "previous") {
          if (n.end) {
            n.end = false;
            n.i = Math.max(0, n.ids.length - 1);
          } else {
            n.i = Math.max(0, n.i - 1);
          }
          return n;
        }
        if (n.end || id === undefined) return n;
        if (action === "skip" && n.skipped.indexOf(id) < 0) {
          n.skipped.push(id);
          n.done = workshopStartupWithout(n.done, id);
        } else if (action === "done" && n.done.indexOf(id) < 0) {
          n.done.push(id);
          n.skipped = workshopStartupWithout(n.skipped, id);
        }
        if (n.i + 1 >= n.ids.length) n.end = true;
        else n.i += 1;
        return n;
      }

      // Summary of a walk against the rows read AGAIN afterwards: which ones are ready now and which are still pending.
      // -> {recorridas, listas: [ids], pendientes: [ids], saltadas: [ids], listo}
      function workshopStartupWizardSummary(est, rows) {
        var byId = {};
        (rows || []).forEach(function (f) {
          byId[f.id] = f;
        });
        var lists = [];
        var pending = [];
        est.ids.forEach(function (id) {
          var f = byId[id];
          if (f && (f.state === "missing" || f.state === "example") && !f.hidden && !f.withoutData) pending.push(id);
          else lists.push(id);
        });
        return { traversed: est.ids.length, lists: lists, pending: pending, skipped: est.skipped.slice(), ready: pending.length === 0 };
      }

      // ---- questions of a row with assistant: { id, tipo: "texto"|"numero"|"lista"|"si_no", etiqueta, ayuda, defecto,
      //      opciones: [{valor, etiqueta}], min, max, entero, requerida, patron, si: {pregunta, valor | valor: [..]} } ----

      function workshopStartupVisible(preg, resp) {
        if (!preg.si) return true;
        var other = resp ? resp[preg.si.question] : undefined;
        var v = preg.si.value;
        return Array.isArray(v) ? v.indexOf(other) >= 0 : other === v;
      }

      // Answers with the default value of every question (what the form shows at the start).
      function workshopStartupAnswersInitial(preguntas) {
        var r = {};
        (preguntas || []).forEach(function (p) {
          if (p.defaultValue !== undefined) r[p.id] = p.defaultValue;
          else if (p.kind === "si_no") r[p.id] = false;
          else if (p.kind === "list" && p.options && p.options.length) r[p.id] = p.options[0].value;
          else r[p.id] = "";
        });
        return r;
      }

      // Checks the answers. -> {ok, errores: {id: key}, valores: {id: value}}. Numbers become numbers, yes/no become
      // booleans, texts are trimmed. Questions that are not shown (si) are left out. Text can never carry quotes,
      // semicolons or line breaks: an answer must not be able to add a line of its own to the file.
      function workshopStartupValidate(preguntas, resp) {
        var errors = {};
        var values = {};
        resp = resp || {};
        (preguntas || []).forEach(function (p) {
          if (!workshopStartupVisible(p, resp)) return;
          var v = resp[p.id];
          if (p.kind === "si_no") {
            values[p.id] = v === true || v === "true" || v === "si" || v === "yes" || v === 1;
            return;
          }
          if (p.kind === "list") {
            var ok = (p.options || []).some(function (o) {
              return o.value === v;
            });
            if (ok) values[p.id] = v;
            else errors[p.id] = "startup.err_choice";
            return;
          }
          var s = v === undefined || v === null ? "" : String(v).trim();
          if (p.kind === "number") {
            if (s === "") {
              errors[p.id] = "startup.err_required";
              return;
            }
            var x = Number(s.replace(",", "."));
            if (!isFinite(x)) errors[p.id] = "startup.err_number";
            else if (p.integer && Math.floor(x) !== x) errors[p.id] = "startup.err_integer";
            else if ((typeof p.min === "number" && x < p.min) || (typeof p.max === "number" && x > p.max)) errors[p.id] = "startup.err_range";
            else values[p.id] = x;
            return;
          }
          // text
          if (s === "") {
            if (p.required === false) values[p.id] = "";
            else errors[p.id] = "startup.err_required";
          } else if (/["\r\n;]/.test(s)) {
            errors[p.id] = "startup.err_chars";
          } else if (p.pattern && !new RegExp(p.pattern).test(s)) {
            errors[p.id] = "startup.err_pattern";
          } else {
            values[p.id] = s;
          }
        });
        return { ok: Object.keys(errors).length === 0, errors: errors, values: values };
      }

      // A line the machine would act on: not blank and not a comment.
      function workshopStartupLinesActive(text) {
        return String(text || "")
          .split(/\r?\n/)
          .filter(function (l) {
            var x = l.trim();
            return x !== "" && x.charAt(0) !== ";";
          }).length;
      }

      // Lines that move the machine. They are never written active by the assistant (see workshopStartupViewPreview).
      var WORKSHOP_STARTUP_MOVE = /^G(0|1|2|3|28|29|30|32|53)(?![0-9])/i;

      // The file as it would be written: asistente.template(valores) -> text, with every moving command commented and
      // counted. -> {ok, errores, texto, activas, comentadas}
      function workshopStartupViewPreview(asistente, resp) {
        var v = workshopStartupValidate(asistente.questions, resp);
        if (!v.ok) return { ok: false, errors: v.errors, text: "", active: 0, commented: 0 };
        var comentadas = 0;
        var lines = String(asistente.template(v.values) || "")
          .replace(/\r\n?/g, "\n")
          .split("\n")
          .map(function (l) {
            var x = l.trim();
            if (x.charAt(0) !== ";" && WORKSHOP_STARTUP_MOVE.test(x)) {
              comentadas += 1;
              return "; (moves the machine - check it first) " + x;
            }
            return l;
          });
        var text = lines.join("\n").replace(/\n+$/, "") + "\n";
        return { ok: true, errors: {}, text: text, active: workshopStartupLinesActive(text), commented: comentadas };
      }

      // Where the assistant writes: "0:/" + (asistente.destination || def.file).
      function workshopStartupDestination(def) {
        var rel = (def && def.wizard && def.wizard.destination) || (def && def.file) || "";
        return rel ? "0:/" + rel.replace(/^0:\/?/, "") : "";
      }

      function workshopStartupNameFree(path, sufijo, busy) {
        for (var n = 1; n < 100; n++) {
          var c = path + sufijo + (n === 1 ? "" : String(n));
          if (busy.indexOf(c) < 0) return c;
        }
        return path + sufijo + "-" + Date.now();
      }

      // The "never overwrite" policy. textoExistente = text of the file now (null = it does not exist);
      // ocupadas = other paths that already exist (<ruta>.nuevo ...). -> {modo, ruta, respaldo, motivo}
      //   crear              the file does not exist: it is written
      //   replace-example it only has comments (the example the service copied): it is replaced, and the previous
      //                      text is first saved in <ruta>.ejemplo, so nothing is lost
      //   nuevo              it has active lines (it is the person's): it is NOT touched, the new text goes to <ruta>.nuevo
      function workshopStartupPlanWriting(path, textoExistente, busy) {
        var ocup = Array.isArray(busy) ? busy : [];
        if (textoExistente === null || textoExistente === undefined) return { mode: "create", path: path, backup: null, reason: "startup.plan_create" };
        if (workshopStartupLinesActive(textoExistente) === 0 && ocup.indexOf(path + ".example") < 0) {
          return { mode: "replace-example", path: path, backup: path + ".example", reason: "startup.plan_example" };
        }
        return { mode: "newItem", path: workshopStartupNameFree(path, ".new", ocup), backup: null, reason: "startup.plan_new" };
      }

      // What to tell after writing. textoLeido = the file read back (null = could not be read); fila = the row read
      // again after the write (null = not read); plan = the plan that was followed.
      // -> {ok, activas, mensajes: [{clave, params}]}: ok only when everything is as it should be. The messages are calm.
      function workshopStartupVerify(textRead, row, plan) {
        var m = [];
        if (textRead === null || textRead === undefined) {
          return { ok: false, active: 0, messages: [{ key: "startup.verify_missing", params: { file: plan.path } }] };
        }
        var act = workshopStartupLinesActive(textRead);
        if (plan.mode === "newItem") {
          m.push({ key: "startup.verify_new", params: { file: plan.path } });
          return { ok: false, active: act, messages: m };
        }
        if (act === 0) m.push({ key: "startup.verify_comments", params: { file: plan.path } });
        if (row && row.state !== "configured") {
          if (act > 0) m.push({ key: "startup.verify_notseen", params: { file: plan.path } });
        }
        if (!m.length) m.push({ key: "startup.verify_ok", params: { file: plan.path } });
        return { ok: m.length === 1 && m[0].key === "startup.verify_ok", active: act, messages: m };
      }
