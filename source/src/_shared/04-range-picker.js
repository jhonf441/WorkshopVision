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


      // ---- the calendar of the absolute tab (the same logic as the Vue picker: vue/_shared36/range-picker.js) ----
      // A day is its text "YYYY-MM-DD" (local); a month is { year, month } with month 0-11.
      function workshopRangeIso(d) {
        return d.getFullYear() + "-" + workshopRangeTwo(d.getMonth() + 1) + "-" + workshopRangeTwo(d.getDate());
      }

      function workshopRangeDay(iso) {
        return workshopRangeParse(String(iso || "").trim().slice(0, 10));
      }

      function workshopRangeAddDays(iso, n) {
        var d = workshopRangeDay(iso);
        if (!d) return "";
        d.setDate(d.getDate() + n);
        return workshopRangeIso(d);
      }

      function workshopRangeAddMonths(m, n) {
        var d = new Date(m.year, m.month + n, 1);
        return { year: d.getFullYear(), month: d.getMonth() };
      }

      function workshopRangeIsEs(lang) {
        return String(lang || "").slice(0, 2) === "es";
      }

      // the first day of the week: Monday in Spanish, Sunday in English
      function workshopRangeWeekStart(lang) {
        return workshopRangeIsEs(lang) ? 1 : 0;
      }

      // six weeks of seven cells { iso, day, inMonth }
      function workshopRangeMonthGrid(m, start) {
        var lead = (new Date(m.year, m.month, 1).getDay() - start + 7) % 7;
        var out = [];
        for (var i = 0; i < 42; i++) {
          var d = new Date(m.year, m.month, 1 - lead + i);
          out.push({ iso: workshopRangeIso(d), day: d.getDate(), inMonth: d.getMonth() === m.month });
        }
        return out;
      }

      // DD/MM/YYYY in Spanish, YYYY/MM/DD in English
      function workshopRangeDayText(iso, lang) {
        var d = workshopRangeDay(iso);
        if (!d) return "";
        return workshopRangeIsEs(lang)
          ? workshopRangeTwo(d.getDate()) + "/" + workshopRangeTwo(d.getMonth() + 1) + "/" + d.getFullYear()
          : d.getFullYear() + "/" + workshopRangeTwo(d.getMonth() + 1) + "/" + workshopRangeTwo(d.getDate());
      }

      // the "YYYY-MM-DD" of what a person wrote, or null
      function workshopRangeParseDayText(text, lang) {
        var m = /^\s*(\d{1,4})[\/.\-](\d{1,2})[\/.\-](\d{1,4})\s*$/.exec(String(text || ""));
        if (!m) return null;
        var parts = workshopRangeIsEs(lang) && m[3].length === 4 ? [m[3], m[2], m[1]] : m[1].length === 4 ? [m[1], m[2], m[3]] : null;
        if (!parts) return null;
        var iso = parts[0] + "-" + workshopRangeTwo(parts[1]) + "-" + workshopRangeTwo(parts[2]);
        return workshopRangeDay(iso) ? iso : null;
      }

      // "HH:MM" of what a person wrote ("9:05", "0905", "09:05"), or null
      function workshopRangeParseTimeText(text) {
        var m = /^\s*(\d{1,2}):?(\d{2})\s*$/.exec(String(text || ""));
        if (!m) return null;
        var h = Number(m[1]);
        var min = Number(m[2]);
        return h > 23 || min > 59 ? null : workshopRangeTwo(h) + ":" + workshopRangeTwo(min);
      }

      // the next state { from, to, open } when a day is touched: the first touch starts the range, the second ends it (in order)
      function workshopRangePickDay(state, iso) {
        if (!workshopRangeDay(iso)) return state;
        if (!state || !state.open) return { from: iso, to: iso, open: true };
        return state.from <= iso ? { from: state.from, to: iso, open: false } : { from: iso, to: state.from, open: false };
      }

      // "edge" (first or last day), "mid" (between) or ""
      function workshopRangeDayKind(iso, from, to) {
        if (!from || !to) return "";
        if (iso === from || iso === to) return "edge";
        return iso > from && iso < to ? "mid" : "";
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
        if (why === "time") return i18nT('core.range_err_time');
        return i18nT('core.range_err_unit');
      }

      // what the button says: "Last 3 h", the two moments, or "No time limit"
      function workshopRangeLabel(value) {
        if (!value) return i18nT('core.range_all');
        if (value.type === "absolute") return String(value.from).replace("T", " ") + "  ->  " + String(value.to).replace("T", " ");
        return i18nT('core.range_last', { span: workshopRangeShort(value.unit, value.amount) });
      }

      var WORKSHOP_RANGE_EDGE = "1px solid var(--c-field-edge,rgba(128,128,128,0.45))";
      var WORKSHOP_RANGE_FIELD = "padding:2px 5px;border:" + WORKSHOP_RANGE_EDGE + ";border-radius:4px;background:var(--c-field,transparent);color:inherit;font:inherit;";

      function workshopRangeChip(text, on, fn) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = text;
        b.style.cssText = "padding:2px 8px;border-radius:4px;cursor:pointer;font:inherit;font-size:12px;border:" + WORKSHOP_RANGE_EDGE + ";" +
          (on ? "background:#1976d2;color:#fff;border-color:#1976d2;" : "background:transparent;color:inherit;");
        b.addEventListener("click", fn);
        return b;
      }

      // the button that opens the picker (its text is painted by the picker)
      function workshopRangeButton() {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.setAttribute("aria-label", i18nT('core.range_label'));
        btn.setAttribute("aria-haspopup", "dialog");
        btn.style.cssText = "padding:4px 10px;border-radius:4px;cursor:pointer;font:inherit;border:" + WORKSHOP_RANGE_EDGE + ";background:transparent;color:inherit;";
        return btn;
      }

      function workshopRangeNewPanel() {
        var panel = document.createElement("div");
        panel.setAttribute("role", "dialog");
        panel.setAttribute("aria-label", i18nT('core.range_label'));
        panel.style.cssText = "position:absolute;z-index:60;top:100%;left:0;margin-top:4px;min-width:300px;max-width:min(720px,calc(100vw - 24px));padding:12px;border-radius:6px;" +
          "background:var(--c-card,#1e1e1e);color:var(--c-text,#fff);border:" + WORKSHOP_RANGE_EDGE + ";box-shadow:0 4px 16px rgba(0,0,0,0.35);";
        return panel;
      }

      // the quick choices ("Last 1 h", ...) -> the two rows to append
      function workshopRangeQuickRow(value, pick) {
        var tq = document.createElement("div");
        tq.textContent = i18nT('core.range_quick');
        tq.style.cssText = "font-weight:600;margin-bottom:4px;";
        var qb = document.createElement("div");
        qb.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;";
        WORKSHOP_RANGE_QUICK.forEach(function (q) {
          var on = !!value && value.type === "relative" && Number(value.amount) === q.amount && value.unit === q.unit;
          qb.appendChild(workshopRangeChip(workshopRangeShort(q.unit, q.amount), on, function () { pick({ type: "relative", amount: q.amount, unit: q.unit }); }));
        });
        return [tq, qb];
      }

      // the amount and the unit of a relative range
      function workshopRangeRelativeRow(draft, status, redraw) {
        var row = document.createElement("div");
        row.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:8px;";
        var am = document.createElement("input");
        am.type = "number";
        am.min = "1";
        am.max = String(WORKSHOP_RANGE_MAX);
        am.step = "1";
        am.value = String(draft.amount);
        am.setAttribute("aria-label", i18nT('core.range_amount'));
        am.style.cssText = WORKSHOP_RANGE_FIELD + "width:72px;";
        am.addEventListener("input", function () { draft.amount = am.value; status(); });
        row.appendChild(am);
        WORKSHOP_RANGE_UNITS.forEach(function (u) { row.appendChild(workshopRangeChip(workshopRangeUnitName(u), draft.unit === u, function () { draft.unit = u; redraw(); })); });
        return row;
      }

      // one line of an absolute range: the label, the written day and the written time (ab.text[side], ab.time[side]); `typed(side)` is called when the day written is a real one
      function workshopRangeDateLine(side, ab, lang, typed, status) {
        var r = document.createElement("div");
        r.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:8px;";
        var label = i18nT(side === "from" ? 'core.range_from' : 'core.range_to');
        var t = document.createElement("span");
        t.textContent = label;
        t.style.minWidth = "44px";
        var d = document.createElement("input");
        d.type = "text";
        d.setAttribute("inputmode", "numeric");
        d.setAttribute("autocomplete", "off");
        d.value = ab.text[side];
        d.placeholder = i18nT('core.range_format');
        d.setAttribute("aria-label", label);
        d.style.cssText = WORKSHOP_RANGE_FIELD + "width:118px;min-height:36px;";
        d.addEventListener("input", function () {
          var iso = workshopRangeParseDayText(d.value, lang);
          ab.bad[side] = !iso;
          d.style.borderColor = iso ? "" : "var(--c-error,#d32f2f)";
          d.setAttribute("aria-invalid", iso ? "false" : "true");
          if (iso) typed(side, iso);
          else status();
        });
        var h = document.createElement("input");
        h.type = "text";
        h.setAttribute("inputmode", "numeric");
        h.setAttribute("autocomplete", "off");
        h.maxLength = 5;
        h.value = ab.time[side];
        h.placeholder = "HH:MM";
        h.setAttribute("aria-label", i18nT(side === "from" ? 'core.range_from_time' : 'core.range_to_time'));
        h.style.cssText = WORKSHOP_RANGE_FIELD + "width:64px;min-height:36px;";
        h.addEventListener("input", function () { ab.time[side] = h.value; status(); });
        r.appendChild(t);
        r.appendChild(d);
        r.appendChild(h);
        ab.fields[side] = d;
        return r;
      }

      // the calendar: `months` months side by side, the days as 44 px buttons; `choose(iso)` is called by a touch, `shift(n)` by the arrows
      function workshopRangeCalendar(ab, lang, months, choose, shift) {
        var wrap = document.createElement("div");
        wrap.style.cssText = "display:grid;grid-template-columns:repeat(" + months + ",minmax(0,1fr));gap:0 16px;margin:4px 0;";
        var start = workshopRangeWeekStart(lang);
        var today = workshopRangeIso(new Date());
        var dayNames = [];
        for (var w = 0; w < 7; w++) dayNames.push(new Intl.DateTimeFormat(lang, { weekday: "narrow" }).format(new Date(2026, 10, 1 + ((w + start) % 7))));
        for (var k = 0; k < months; k++) {
          var m = workshopRangeAddMonths(ab.view, k);
          var cal = document.createElement("div");
          cal.setAttribute("role", "grid");
          var title = new Intl.DateTimeFormat(lang, { month: "long", year: "numeric" }).format(new Date(m.year, m.month, 1));
          cal.setAttribute("aria-label", title);
          var bar = document.createElement("div");
          bar.style.cssText = "display:flex;align-items:center;justify-content:space-between;min-height:44px;";
          bar.appendChild(k === 0 ? workshopRangeNav("\u2039", i18nT('core.range_prev_month'), function () { shift(-1); }) : workshopRangeNavGap());
          var tt = document.createElement("span");
          tt.textContent = title;
          tt.style.cssText = "flex:1;text-align:center;font-weight:600;text-transform:capitalize;";
          bar.appendChild(tt);
          bar.appendChild(k === months - 1 ? workshopRangeNav("\u203a", i18nT('core.range_next_month'), function () { shift(1); }) : workshopRangeNavGap());
          cal.appendChild(bar);
          var head = document.createElement("div");
          head.style.cssText = "display:grid;grid-template-columns:repeat(7,minmax(0,1fr));font-size:12px;opacity:0.7;text-align:center;line-height:24px;";
          dayNames.forEach(function (n) { var sp = document.createElement("span"); sp.textContent = n; head.appendChild(sp); });
          cal.appendChild(head);
          var days = document.createElement("div");
          days.style.cssText = "display:grid;grid-template-columns:repeat(7,minmax(0,1fr));";
          workshopRangeMonthGrid(m, start).forEach(function (c) {
            if (!c.inMonth) { days.appendChild(document.createElement("span")); return; }
            days.appendChild(workshopRangeDayButton(c, ab, lang, today, choose));
          });
          cal.appendChild(days);
          wrap.appendChild(cal);
        }
        return wrap;
      }

      function workshopRangeNav(glyph, label, fn) {
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = glyph;
        b.setAttribute("aria-label", label);
        b.style.cssText = "width:44px;height:44px;border:0;border-radius:50%;background:transparent;color:inherit;font:inherit;font-size:20px;cursor:pointer;";
        b.addEventListener("click", fn);
        return b;
      }

      function workshopRangeNavGap() {
        var s = document.createElement("span");
        s.style.cssText = "width:44px;height:44px;";
        return s;
      }

      function workshopRangeDayButton(c, ab, lang, today, choose) {
        var kind = workshopRangeDayKind(c.iso, ab.day.from, ab.day.to);
        var b = document.createElement("button");
        b.type = "button";
        b.textContent = String(c.day);
        b.setAttribute("data-iso", c.iso);
        b.setAttribute("aria-label", new Intl.DateTimeFormat(lang, { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(workshopRangeDay(c.iso)));
        b.setAttribute("aria-pressed", kind === "edge" ? "true" : "false");
        if (c.iso === today) b.setAttribute("aria-current", "date");
        b.tabIndex = c.iso === ab.focus ? 0 : -1;
        b.style.cssText = "min-height:44px;border:0;font:inherit;cursor:pointer;color:inherit;background:" + (kind === "mid" ? "rgba(128,128,128,0.25)" : "transparent") + ";" +
          (kind === "edge" ? "background:#1976d2;color:#fff;border-radius:22px;" : "") + (c.iso === today ? "font-weight:700;text-decoration:underline;" : "");
        b.addEventListener("click", function () { choose(c.iso); });
        b.addEventListener("keydown", function (e) {
          var step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key];
          var next = step ? workshopRangeAddDays(c.iso, step) : "";
          if (e.key === "PageUp" || e.key === "PageDown") {
            var d = workshopRangeDay(c.iso);
            next = workshopRangeIso(new Date(d.getFullYear(), d.getMonth() + (e.key === "PageUp" ? -1 : 1), d.getDate()));
          }
          if (!next) return;
          e.preventDefault();
          ab.focus = next;
          choose(null, next);
        });
        return b;
      }

      // the line under the fields: the error, or the two moments the range means now; and the state of the Apply button
      function workshopRangeShowStatus(err, ok, c) {
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

      // the bottom line: Cancel and Apply
      function workshopRangeFoot(ok, close) {
        var foot = document.createElement("div");
        foot.style.cssText = "display:flex;justify-content:flex-end;gap:8px;margin-top:12px;";
        foot.appendChild(workshopRangeChip(i18nT('core.range_cancel'), false, close));
        foot.appendChild(ok);
        return foot;
      }

      // the state of the absolute tab: the days (two touches), the written texts and times, the month in view and the day that has the keyboard focus
      function workshopRangeNewState(value, lang) {
        var today = workshopRangeLocalText(new Date()).split("T")[0];
        var abs = value && value.type === "absolute";
        var ab = {
          day: abs ? { from: value.from.split("T")[0], to: value.to.split("T")[0], open: false } : { from: today, to: today, open: false },
          time: abs ? { from: value.from.split("T")[1] || "00:00", to: value.to.split("T")[1] || "23:59" } : { from: "00:00", to: "23:59" },
          text: {}, bad: { from: false, to: false }, fields: {}, focus: "", keyfocus: false, view: null
        };
        ab.text = { from: workshopRangeDayText(ab.day.from, lang), to: workshopRangeDayText(ab.day.to, lang) };
        var first = workshopRangeDay(ab.day.from) || new Date();
        ab.view = { year: first.getFullYear(), month: first.getMonth() };
        ab.focus = ab.day.from;
        return ab;
      }

      // { ok, why, value } of what the panel holds now (a relative range, or the absolute one from the two touches and the written times)
      function workshopRangeCurrent(tab, draft, ab) {
        var ft = workshopRangeParseTimeText(ab.time.from);
        var tt = workshopRangeParseTimeText(ab.time.to);
        var nv = tab === "relative" ? { type: "relative", amount: Number(draft.amount), unit: draft.unit }
          : { type: "absolute", from: ab.day.from + "T" + (ft || "00:00"), to: ab.day.to + "T" + (tt || "23:59") };
        if (tab === "absolute") {
          if (ab.bad.from || !workshopRangeDay(ab.day.from)) return { ok: false, why: "from", value: nv };
          if (ab.bad.to || !workshopRangeDay(ab.day.to)) return { ok: false, why: "to", value: nv };
          if (!ft || !tt) return { ok: false, why: "time", value: nv };
        }
        var c = workshopRangeCheck(nv);
        return { ok: c.ok, why: c.why, value: nv };
      }

      // a day written by the person that is a real one: the range takes it and the calendar goes to it
      function workshopRangeTyped(ab, side, iso) {
        ab.day[side] = iso;
        ab.day.open = false;
        var d = workshopRangeDay(iso);
        ab.view = { year: d.getFullYear(), month: d.getMonth() };
        ab.focus = iso;
      }

      // a touch on a day, or (onlyFocus) a key that moved the focus to that day and carries the month along
      function workshopRangeChoose(ab, lang, months, iso, onlyFocus) {
        if (!onlyFocus) {
          ab.day = workshopRangePickDay(ab.day, iso);
          ab.focus = iso;
          ab.text = { from: workshopRangeDayText(ab.day.from, lang), to: workshopRangeDayText(ab.day.to, lang) };
          ab.bad = { from: false, to: false };
          return;
        }
        var d = workshopRangeDay(onlyFocus);
        var last = workshopRangeAddMonths(ab.view, months - 1);
        var ym = d.getFullYear() * 12 + d.getMonth();
        if (ym < ab.view.year * 12 + ab.view.month) ab.view = { year: d.getFullYear(), month: d.getMonth() };
        else if (ym > last.year * 12 + last.month) ab.view = workshopRangeAddMonths({ year: d.getFullYear(), month: d.getMonth() }, 1 - months);
        ab.keyfocus = true;
      }

      // the whole panel is drawn again from its state (env: o, value, panel, tab, draft, ab, lang, months, pick, close)
      function workshopRangeDraw(env) {
        var panel = env.panel;
        var ab = env.ab;
        var draw = function () { workshopRangeDraw(env); };
        panel.textContent = "";
        if (env.o.clearable) {
          var all = workshopRangeChip(i18nT('core.range_all'), !env.value, function () { env.pick(null); });
          all.style.marginBottom = "8px";
          panel.appendChild(all);
        }
        workshopRangeQuickRow(env.value, env.pick).forEach(function (n) { panel.appendChild(n); });
        var tabs = document.createElement("div");
        tabs.style.cssText = "display:flex;gap:6px;margin:12px 0 8px;";
        tabs.appendChild(workshopRangeChip(i18nT('core.range_relative'), env.tab === "relative", function () { env.tab = "relative"; draw(); }));
        tabs.appendChild(workshopRangeChip(i18nT('core.range_absolute'), env.tab === "absolute", function () { env.tab = "absolute"; draw(); }));
        panel.appendChild(tabs);
        var help = document.createElement("div");
        help.style.cssText = "font-size:12px;opacity:0.7;margin-bottom:8px;";
        panel.appendChild(help);
        var err = document.createElement("div");
        err.style.cssText = "font-size:12px;margin-top:8px;";
        var current = function () { return workshopRangeCurrent(env.tab, env.draft, ab); };
        var ok = workshopRangeChip(i18nT('core.range_apply'), true, function () { if (current().ok) env.pick(current().value); });
        var status = function () { workshopRangeShowStatus(err, ok, current()); };
        if (env.tab === "relative") {
          help.textContent = i18nT('core.range_relative_help');
          panel.appendChild(workshopRangeRelativeRow(env.draft, status, draw));
        } else {
          help.textContent = i18nT('core.range_absolute_help') + " " + i18nT('core.range_type_hint', { format: i18nT('core.range_format') });
          var typed = function (side, iso) { workshopRangeTyped(ab, side, iso); status(); draw(); };
          var choose = function (iso, onlyFocus) { workshopRangeChoose(ab, env.lang, env.months, iso, onlyFocus); draw(); };
          var shift = function (n) { ab.view = workshopRangeAddMonths(ab.view, n); draw(); };
          panel.appendChild(workshopRangeDateLine("from", ab, env.lang, typed, status));
          panel.appendChild(workshopRangeDateLine("to", ab, env.lang, typed, status));
          panel.appendChild(workshopRangeCalendar(ab, env.lang, env.months, choose, shift));
          var hint = document.createElement("div");
          hint.style.cssText = "font-size:12px;opacity:0.7;";
          hint.textContent = ab.day.open ? i18nT('core.range_pick_end') : i18nT('core.range_pick_start');
          panel.appendChild(hint);
        }
        panel.appendChild(err);
        panel.appendChild(workshopRangeFoot(ok, env.close));
        status();
        if (ab.keyfocus) {
          ab.keyfocus = false;
          var el = panel.querySelector('[data-iso="' + ab.focus + '"]');
          if (el) el.focus();
        }
      }

      function workshopRangePicker(opts) {
        var o = opts || {};
        var value = o.value || null;
        var root = document.createElement("div");
        root.style.cssText = "position:relative;display:inline-block;";
        var btn = workshopRangeButton();
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
          var lang = String((typeof document !== "undefined" && document.documentElement && document.documentElement.lang) || "es").slice(0, 2);
          panel = workshopRangeNewPanel();
          document.addEventListener("mousedown", away, true);
          workshopRangeDraw({
            o: o, value: value, panel: panel, pick: pick, close: close, lang: lang,
            months: typeof window !== "undefined" && window.innerWidth >= 760 ? 2 : 1,
            tab: value && value.type === "absolute" ? "absolute" : "relative",
            draft: value && value.type === "relative" ? { amount: value.amount, unit: value.unit } : { amount: 1, unit: "days" },
            ab: workshopRangeNewState(value, lang)
          });
          root.appendChild(panel);
          paintButton();
        }

        btn.addEventListener("click", function () { if (panel) close(); else open(); });
        paintButton();
        root.appendChild(btn);
        return root;
      }
