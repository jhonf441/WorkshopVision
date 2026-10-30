      // ---- The time range of a search (the JS pages: Camera gallery...) ----
      // The same picker as vue/_shared/RangePicker.vue, shaped like the one of CloudWatch: quick ranges, "the last N units" and an
      // absolute range from a date and time to another. The logic is the one of vue/_shared/range-picker.js (tests/range-picker-js.test.js
      // keeps both in step).
      //
      //   value   { type: "relative", amount, unit }           the last `amount` `unit`s until now (it moves with the clock)
      //           { type: "absolute", from: "YYYY-MM-DDTHH:MM", to: "YYYY-MM-DDTHH:MM" }   local time, the end is inclusive to the minute
      //           null = no limit in time (only with `clearable`)
      //
      //   var picker = workshopRangePicker({ value: v, clearable: true, onChange: function (nv) { ... } });  // an element to append

      var WORKSHOP_RANGE_UNITS = ["minutes", "hours", "days", "weeks", "months"];
      var WORKSHOP_RANGE_QUICK = [
        { amount: 5, unit: "minutes" }, { amount: 30, unit: "minutes" }, { amount: 1, unit: "hours" }, { amount: 3, unit: "hours" },
        { amount: 12, unit: "hours" }, { amount: 1, unit: "days" }, { amount: 3, unit: "days" }, { amount: 1, unit: "weeks" }, { amount: 1, unit: "months" },
      ];
      var WORKSHOP_RANGE_MAX = 999;

      function workshopRangeTwo(n) {
        return String(n).length < 2 ? "0" + n : String(n);
      }

      // "YYYY-MM-DDTHH:MM" of a Date in local time
      function workshopRangeLocalText(d) {
        return d.getFullYear() + "-" + workshopRangeTwo(d.getMonth() + 1) + "-" + workshopRangeTwo(d.getDate()) + "T" + workshopRangeTwo(d.getHours()) + ":" + workshopRangeTwo(d.getMinutes());
      }

      // the Date of "YYYY-MM-DDTHH:MM" or "YYYY-MM-DD HH:MM:SS" (or only a day: its midnight), or null
      function workshopRangeParse(text) {
        var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(String(text || "").trim());
        if (!m) return null;
        var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] || 0), Number(m[5] || 0), Number(m[6] || 0), 0);
        return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]) ? d : null;
      }

      function workshopRangeBack(now, amount, unit) {
        var d = new Date(now.getTime());
        if (unit === "minutes") d.setMinutes(d.getMinutes() - amount);
        else if (unit === "hours") d.setHours(d.getHours() - amount);
        else if (unit === "days") d.setDate(d.getDate() - amount);
        else if (unit === "weeks") d.setDate(d.getDate() - 7 * amount);
        else d.setMonth(d.getMonth() - amount);
        return d;
      }

      // { ok: true } or { ok: false, why: "amount" | "unit" | "from" | "to" | "order" }
      function workshopRangeCheck(value) {
        var v = value || {};
        if (v.type === "relative") {
          if (WORKSHOP_RANGE_UNITS.indexOf(v.unit) < 0) return { ok: false, why: "unit" };
          var n = Number(v.amount);
          if (!isFinite(n) || Math.floor(n) !== n || n < 1 || n > WORKSHOP_RANGE_MAX) return { ok: false, why: "amount" };
          return { ok: true };
        }
        if (v.type === "absolute") {
          var a = workshopRangeParse(v.from);
          var b = workshopRangeParse(v.to);
          if (!a) return { ok: false, why: "from" };
          if (!b) return { ok: false, why: "to" };
          if (b.getTime() < a.getTime()) return { ok: false, why: "order" };
          return { ok: true };
        }
        return { ok: false, why: "unit" };
      }

      // { from: Date, to: Date } (the end of an absolute range is the end of its last minute), or null
      function workshopRangeResolve(value, now) {
        if (!workshopRangeCheck(value).ok) return null;
        if (value.type === "relative") {
          var end = now ? new Date(now.getTime()) : new Date();
          return { from: workshopRangeBack(end, Number(value.amount), value.unit), to: end };
        }
        var to = workshopRangeParse(value.to);
        to.setSeconds(59, 999);
        return { from: workshopRangeParse(value.from), to: to };
      }

      // is a date text ("YYYY-MM-DD HH:MM:SS") inside the range? Without a range everything is; a text that is not a date is out of a range
      function workshopRangeHas(value, text, now) {
        if (!value) return true;
        var r = workshopRangeResolve(value, now);
        var d = workshopRangeParse(text);
        return !!r && !!d && d.getTime() >= r.from.getTime() && d.getTime() <= r.to.getTime();
      }

      // the texts: each one is a literal key so the catalogs can be checked
      function workshopRangeShort(unit, n) {
        if (unit === "minutes") return i18nT('core.range_short_minutes', { n: n });
        if (unit === "hours") return i18nT('core.range_short_hours', { n: n });
        if (unit === "days") return i18nT('core.range_short_days', { n: n });
        if (unit === "weeks") return i18nT('core.range_short_weeks', { n: n });
        return i18nT('core.range_short_months', { n: n });
      }

      function workshopRangeUnitName(unit) {
        if (unit === "minutes") return i18nT('core.range_unit_minutes');
        if (unit === "hours") return i18nT('core.range_unit_hours');
        if (unit === "days") return i18nT('core.range_unit_days');
        if (unit === "weeks") return i18nT('core.range_unit_weeks');
        return i18nT('core.range_unit_months');
      }

      function workshopRangeError(why) {
        if (why === "amount") return i18nT('core.range_err_amount');
        if (why === "from") return i18nT('core.range_err_from');
        if (why === "to") return i18nT('core.range_err_to');
        if (why === "order") return i18nT('core.range_err_order');
        return i18nT('core.range_err_unit');
      }

      // what the button says: "Last 3 h", the two moments, or "No time limit"
      function workshopRangeLabel(value) {
        if (!value) return i18nT('core.range_all');
        if (value.type === "absolute") return String(value.from).replace("T", " ") + "  ->  " + String(value.to).replace("T", " ");
        return i18nT('core.range_last', { span: workshopRangeShort(value.unit, value.amount) });
      }

      function workshopRangePicker(opts) {
        var o = opts || {};
        var value = o.value || null;
        var root = document.createElement("div");
        root.style.cssText = "position:relative;display:inline-block;";
        var field = "padding:2px 5px;border:1px solid var(--c-field-edge,rgba(128,128,128,0.45));border-radius:4px;background:var(--c-field,transparent);color:inherit;color-scheme:light dark;font:inherit;";
        var chip = function (text, on, fn) {
          var b = document.createElement("button");
          b.type = "button";
          b.textContent = text;
          b.style.cssText = "padding:2px 8px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px;border:1px solid var(--c-field-edge,rgba(128,128,128,0.45));" +
            (on ? "background:#1976d2;color:#fff;border-color:#1976d2;" : "background:transparent;color:inherit;");
          b.addEventListener("click", fn);
          return b;
        };
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", i18nT('core.range_label'));
        btn.setAttribute("aria-haspopup", "dialog");
        btn.style.cssText = "padding:4px 10px;border-radius:4px;cursor:pointer;font:inherit;border:1px solid var(--c-field-edge,rgba(128,128,128,0.45));background:transparent;color:inherit;";
        var panel = null;

        function paintButton() {
          btn.textContent = "";
          var ic = document.createElement("span");
          ic.className = "mdi mdi-calendar-range";
          ic.style.marginRight = "6px";
          btn.appendChild(ic);
          btn.appendChild(document.createTextNode(workshopRangeLabel(value)));
          btn.setAttribute("aria-expanded", panel ? "true" : "false");
        }

        function close() {
          if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
          panel = null;
          document.removeEventListener("mousedown", away, true);
          paintButton();
        }

        function away(e) {
          if (panel && !root.contains(e.target)) close();
        }

        function pick(nv) {
          value = nv;
          close();
          if (o.onChange) o.onChange(nv);
        }

        function open() {
          var tab = value && value.type === "absolute" ? "absolute" : "relative";
          var draft = value && value.type === "relative" ? { amount: value.amount, unit: value.unit } : { amount: 1, unit: "days" };
          var today = workshopRangeLocalText(new Date()).split("T")[0];
          var ab = value && value.type === "absolute"
            ? { fd: value.from.split("T")[0], ft: value.from.split("T")[1] || "00:00", td: value.to.split("T")[0], tt: value.to.split("T")[1] || "23:59" }
            : { fd: today, ft: "00:00", td: today, tt: "23:59" };
          panel = document.createElement("div");
          panel.setAttribute("role", "dialog");
          panel.setAttribute("aria-label", i18nT('core.range_label'));
          panel.style.cssText = "position:absolute;z-index:60;top:100%;left:0;margin-top:4px;min-width:300px;max-width:420px;padding:12px;border-radius:6px;" +
            "background:var(--c-card,#1e1e1e);color:var(--c-text,#fff);border:1px solid var(--c-field-edge,rgba(128,128,128,0.45));box-shadow:0 4px 16px rgba(0,0,0,0.35);";
          document.addEventListener("mousedown", away, true);

          function draw() {
            panel.textContent = "";
            if (o.clearable) {
              var all = chip(i18nT('core.range_all'), !value, function () { pick(null); });
              all.style.marginBottom = "8px";
              panel.appendChild(all);
            }
            var tq = document.createElement("div");
            tq.textContent = i18nT('core.range_quick');
            tq.style.cssText = "font-weight:600;margin-bottom:4px;";
            panel.appendChild(tq);
            var qb = document.createElement("div");
            qb.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
            WORKSHOP_RANGE_QUICK.forEach(function (q) {
              var on = !!value && value.type === "relative" && Number(value.amount) === q.amount && value.unit === q.unit;
              qb.appendChild(chip(workshopRangeShort(q.unit, q.amount), on, function () { pick({ type: "relative", amount: q.amount, unit: q.unit }); }));
            });
            panel.appendChild(qb);

            var tabs = document.createElement("div");
            tabs.style.cssText = "display:flex;gap:6px;margin:12px 0 8px;";
            tabs.appendChild(chip(i18nT('core.range_relative'), tab === "relative", function () { tab = "relative"; draw(); }));
            tabs.appendChild(chip(i18nT('core.range_absolute'), tab === "absolute", function () { tab = "absolute"; draw(); }));
            panel.appendChild(tabs);

            var help = document.createElement("div");
            help.style.cssText = "font-size:12px;opacity:0.7;margin-bottom:8px;";
            panel.appendChild(help);
            var err = document.createElement("div");
            err.style.cssText = "font-size:12px;margin-top:8px;";
            var ok = chip(i18nT('core.range_apply'), true, function () { if (current().ok) pick(current().value); });

            function current() {
              var nv = tab === "relative" ? { type: "relative", amount: Number(draft.amount), unit: draft.unit }
                : { type: "absolute", from: ab.fd + "T" + (ab.ft || "00:00"), to: ab.td + "T" + (ab.tt || "23:59") };
              var c = workshopRangeCheck(nv);
              return { ok: c.ok, why: c.why, value: nv };
            }

            function status() {
              var c = current();
              if (!c.ok) {
                err.style.color = "var(--c-error,#ef9a9a)";
                err.textContent = workshopRangeError(c.why);
              } else {
                var r = workshopRangeResolve(c.value, new Date());
                err.style.color = "inherit";
                err.style.opacity = "0.7";
                err.textContent = workshopRangeLocalText(r.from).replace("T", " ") + "  ->  " + workshopRangeLocalText(r.to).replace("T", " ");
              }
              ok.disabled = !c.ok;
              ok.style.opacity = c.ok ? "1" : "0.5";
            }

            var row = document.createElement("div");
            row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;";
            if (tab === "relative") {
              help.textContent = i18nT('core.range_relative_help');
              var am = document.createElement("input");
              am.type = "number";
              am.min = "1";
              am.max = String(WORKSHOP_RANGE_MAX);
              am.step = "1";
              am.value = String(draft.amount);
              am.setAttribute("aria-label", i18nT('core.range_amount'));
              am.style.cssText = field + "width:72px;";
              am.addEventListener("input", function () { draft.amount = am.value; status(); });
              row.appendChild(am);
              WORKSHOP_RANGE_UNITS.forEach(function (u) { row.appendChild(chip(workshopRangeUnitName(u), draft.unit === u, function () { draft.unit = u; draw(); })); });
              panel.appendChild(row);
            } else {
              help.textContent = i18nT('core.range_absolute_help');
              var line = function (label, dk, tk) {
                var r = document.createElement("div");
                r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
                var t = document.createElement("span");
                t.textContent = label;
                t.style.minWidth = "44px";
                var d = document.createElement("input");
                d.type = "date";
                d.value = ab[dk];
                d.setAttribute("aria-label", label);
                d.style.cssText = field;
                d.addEventListener("input", function () { ab[dk] = d.value; status(); });
                var h = document.createElement("input");
                h.type = "time";
                h.value = ab[tk];
                h.setAttribute("aria-label", label);
                h.style.cssText = field;
                h.addEventListener("input", function () { ab[tk] = h.value; status(); });
                r.appendChild(t);
                r.appendChild(d);
                r.appendChild(h);
                panel.appendChild(r);
              };
              line(i18nT('core.range_from'), "fd", "ft");
              line(i18nT('core.range_to'), "td", "tt");
            }
            panel.appendChild(err);
            var foot = document.createElement("div");
            foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px;";
            foot.appendChild(chip(i18nT('core.range_cancel'), false, close));
            foot.appendChild(ok);
            panel.appendChild(foot);
            status();
          }
          draw();
          root.appendChild(panel);
          paintButton();
        }

        btn.addEventListener("click", function () { if (panel) close(); else open(); });
        paintButton();
        root.appendChild(btn);
        return root;
      }
