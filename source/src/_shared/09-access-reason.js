      // ---- Why a control is locked, told by CAUSE (step 8 of the access control): the plain-JS port of vue/_shared36/access-reason.js and access-can.js ----
      // Same causes, same order, same four-condition rule, same batch store. tests/access-reason-js.test.js runs this file over the REAL answers of auth.can
      // (tests/golden/access-reason.json) and compares every output with the Vue copy, so the two cannot drift.
      //
      // The sentence is drawn if and only if all four hold: (1) the person has the control in view, (2) it is disabled by PERMISSIONS (the machine state has its
      // own written reason), (3) the cause is known (else the generic sentence "block_unknown"), (4) the operation is not a stop: a stop never carries a sentence
      // and is never asked, blocked or denied.
      //
      //   workshopAccessBlock(entry)                       ONE control: { show, key, cause, params, unknown, nested }
      //   workshopAccessFromAnswers(ops, answerOf, extra)  ONE group of controls: the first cause that applies (answered = every operation has an answer)
      //   workshopAccessCanStore(options)                  the batch of auth.can: one call per screen, up to 100 items, cache 30 s, refresh on identity change and 403
      //   workshopAccessWant(items) / workshopAnswer(op, target)   the page store (one per browser page, shared by the plugins); the answer is never asked by reading
      //   workshopReasonGroupEl(items, opts)               the note (class wf-reason) under a group of buttons; repaints itself when the answers arrive
      //
      // Nothing here runs until a plugin asks: no listener, no call and no timer at load. All the pieces hang from window.__workshopAccess.

      var WORKSHOP_ACCESS_STOP_OPS = [
        "bedcal.stop", "bedzones.off", "frame.stop", "jog.stop_axis", "jog.stop_xy", "jog.stop_z", "layerrecipes.disarm", "livejob.stop_safe",
        "machine.stop", "pelletlayers.disarm", "pid.cancel", "power.off",
      ];
      var WORKSHOP_ACCESS_CAUSES = ["session", "down", "surface", "profile", "ceiling", "no_rule", "role", "not_delegable", "condition"];
      var WORKSHOP_ACCESS_UNKNOWN_KEY = "block_unknown";
      var WORKSHOP_ACCESS_PROFILE_ONLY_KEY = "block_profile_only";
      var WORKSHOP_ACCESS_ROLE_DENIED_KEY = "notice_role_denied";
      // explicit keys (not built at run time) so the catalog checks can see that each one is used
      var WORKSHOP_ACCESS_BLOCK_KEYS = {
        session: "block_session", down: "block_down", surface: "block_plugin", profile: "block_profile", ceiling: "block_ceiling", no_rule: "block_no_rule",
        role: "block_role", not_delegable: "block_admin_only", condition: "block_condition",
      };
      var WORKSHOP_ACCESS_CODE_CAUSE = {
        stop: "", allow: "", "": "", explicit_deny: "profile", denied: "profile", ceiling: "ceiling", not_delegable: "not_delegable", escalated: "role", role: "role",
        camera: "role", mode: "condition", mode_unknown: "condition", signed_out: "session", session: "session", unknown_role: "role", login_required: "session",
        unavailable: "down", service_down: "down", surface: "surface",
      };
      var WORKSHOP_ACCESS_ANY = { mode: "cond_any_mode", job_running: "cond_any_job", machine_on: "cond_any_machine", via: "cond_any_via", risk_max: "cond_any_risk" };
      // how the causes that only a profile-aware answer can give are drawn: the family.css class of the cause and the icon
      var WORKSHOP_ACCESS_LOOK = {
        profile: { css: "role", icon: "mdi-lock-outline" }, ceiling: { css: "role", icon: "mdi-lock-outline" }, no_rule: { css: "role", icon: "mdi-lock-outline" },
        not_delegable: { css: "role", icon: "mdi-shield-lock-outline" }, surface: { css: "role", icon: "mdi-lock-outline" }, unknown: { css: "role", icon: "mdi-lock-outline" },
        condition: { css: "down", icon: "mdi-timer-sand" },
      };
      var WORKSHOP_ACCESS_NONE = { show: false, key: "", cause: "", params: {}, unknown: false, nested: null };
      var WORKSHOP_ACCESS_MAX_BATCH = 100; // auth.can takes up to 100 items per call
      var WORKSHOP_ACCESS_TTL_MS = 30000;
      var WORKSHOP_ACCESS_RETRY_MS = 5000;

      function workshopAccessIsStop(op, stopOps) {
        return (stopOps || WORKSHOP_ACCESS_STOP_OPS).indexOf(op) >= 0;
      }

      // `reason` may be null (the service gave none): that is an unknown cause, not an allowed call
      function workshopAccessCauseOf(reason) {
        if (!reason || typeof reason !== "object") return "unknown";
        var code = String(reason.code === undefined || reason.code === null ? "" : reason.code);
        if (code === "implicit_deny") {
          var failed = Array.isArray(reason.failed_conditions) ? reason.failed_conditions : [];
          return failed.length ? "condition" : "no_rule";
        }
        return Object.prototype.hasOwnProperty.call(WORKSHOP_ACCESS_CODE_CAUSE, code) ? WORKSHOP_ACCESS_CODE_CAUSE[code] : "unknown";
      }

      function workshopAccessFirstCause(list) {
        var best = "";
        var bestAt = WORKSHOP_ACCESS_CAUSES.length;
        (list || []).forEach(function (c) {
          var at = WORKSHOP_ACCESS_CAUSES.indexOf(c);
          if (at >= 0 && at < bestAt) {
            best = c;
            bestAt = at;
          }
        });
        return best;
      }

      // A condition of a rule that did not hold -> the phrase that names it. `want` is what the rule asks for.
      function workshopAccessConditionPhrase(key, want) {
        var list = Array.isArray(want) ? want : [want];
        if (key === "mode") return { key: "cond_mode", params: { mode: list.join(" / ") } };
        if (key === "job_running") return { key: want === false ? "cond_job_off" : "cond_job_on", params: {} };
        if (key === "machine_on") return { key: want === false ? "cond_machine_off" : "cond_machine_on", params: {} };
        if (key === "via") return { key: "cond_via", params: { via: list.join(" / ") } };
        if (key === "risk_max") return { key: "cond_risk", params: { n: want } };
        return null;
      }

      // The service says WHICH condition failed, not what the rule asks for: a yes/no condition is named exactly only when the page tells the live value
      // (live: { job_running, machine_on }: the rule wants the opposite), else the phrase names the condition without the value.
      function workshopAccessConditionOf(reason, live) {
        var r = reason || {};
        var failed = Array.isArray(r.failed_conditions) ? r.failed_conditions : [];
        var key = failed.length ? failed[0] : r.code === "mode" || r.code === "mode_unknown" ? "mode" : "";
        if (!WORKSHOP_ACCESS_ANY[key]) return null;
        var l = live || {};
        if ((key === "job_running" || key === "machine_on") && typeof l[key] === "boolean") return workshopAccessConditionPhrase(key, !l[key]);
        return { key: WORKSHOP_ACCESS_ANY[key], params: {} };
      }

      function workshopAccessParams(cause, reason, extra) {
        var r = reason || {};
        var x = extra || {};
        var rule = r.rule !== undefined && r.rule !== null ? r.rule : r.id !== undefined && r.id !== null ? r.id : "";
        if (cause === "profile") return { profile: r.profile || "", rule: rule };
        if (cause === "ceiling") return { ceiling: r.ceiling || r.profile || "" };
        if (cause === "role") return { needed: x.needed || r.needed_role || "", role: x.role || "" };
        if (cause === "condition") return { condition: x.condition || "" };
        return {};
      }

      // entry: { op, hasControl, disabledByPermission, allowed, cause | reason, ...params }; options: { stopOps }
      function workshopAccessBlock(entry, options) {
        var e = entry || {};
        if (e.hasControl === false || e.allowed === true || e.disabledByPermission !== true) return WORKSHOP_ACCESS_NONE;
        if (workshopAccessIsStop(e.op, options && options.stopOps)) return WORKSHOP_ACCESS_NONE;
        var cause = e.cause !== undefined && e.cause !== null ? e.cause : workshopAccessCauseOf(e.reason);
        if (cause === "") return WORKSHOP_ACCESS_NONE;
        if (WORKSHOP_ACCESS_CAUSES.indexOf(cause) < 0) cause = "unknown";
        if (cause === "unknown") return { show: true, key: WORKSHOP_ACCESS_UNKNOWN_KEY, cause: cause, params: {}, unknown: true, nested: null };
        var params = workshopAccessParams(cause, e.reason, e);
        var key = WORKSHOP_ACCESS_BLOCK_KEYS[cause];
        var nested = null;
        if (cause === "profile" && !params.profile) {
          key = WORKSHOP_ACCESS_ROLE_DENIED_KEY; // a custom role (not a profile) denies it: no profile to name
          params.role = e.roleName || "";
        } else if (cause === "profile" && params.rule === "") key = WORKSHOP_ACCESS_PROFILE_ONLY_KEY;
        if (cause === "condition") {
          var c = e.conditionPhrase || workshopAccessConditionOf(e.reason, e.live);
          if (!c) return { show: true, key: WORKSHOP_ACCESS_UNKNOWN_KEY, cause: "unknown", params: {}, unknown: true, nested: null };
          nested = { param: "condition", key: c.key, params: c.params };
        }
        return { show: true, key: key, cause: cause, params: params, unknown: false, nested: nested };
      }

      // One answer of auth.can ({ allowed, reason }) for one operation -> the entry of workshopAccessBlock. extra: { hasControl, roleName, live }
      function workshopAccessEntry(op, answer, extra) {
        var a = answer || {};
        var e = Object.assign({ op: op, hasControl: true, allowed: a.allowed === true, disabledByPermission: a.allowed === false, reason: a.reason || null }, extra || {});
        if (a.allowed === false && /^ui:[a-z0-9_]+:open$/.test(op)) e.cause = "surface"; // the page of a plugin refused
        return e;
      }

      // ONE sentence for the whole group: the first cause that applies, in the order of the causes; with the same cause, the first operation.
      // A stop in the group is left out; a group of only stops draws nothing.
      function workshopAccessGroup(items, options) {
        var shown = [];
        (items || []).forEach(function (it) {
          var r = workshopAccessBlock(it, options);
          if (r.show) shown.push(r);
        });
        if (!shown.length) return WORKSHOP_ACCESS_NONE;
        var known = shown.filter(function (r) { return !r.unknown; });
        if (!known.length) return shown[0];
        var cause = workshopAccessFirstCause(known.map(function (r) { return r.cause; }));
        return known.filter(function (r) { return r.cause === cause; })[0];
      }

      // Several operations of ONE group, each with its answer (answerOf(op) -> the answer or null when not asked yet): the group verdict plus
      // `answered` = every operation of the group has an answer (so nothing else decides)
      function workshopAccessFromAnswers(ops, answerOf, extra, options) {
        var items = [];
        var answered = true;
        (ops || []).forEach(function (op) {
          var a = answerOf(op);
          if (!a || typeof a.allowed !== "boolean") {
            answered = false;
            return;
          }
          items.push(workshopAccessEntry(op, a, extra));
        });
        return Object.assign({}, workshopAccessGroup(items, options), { answered: answered });
      }

      function workshopAccessItem(x) {
        if (typeof x === "string") return { operation: x };
        var o = { operation: String((x && x.operation) || "") };
        if (x && x.target) o.target = String(x.target);
        return o;
      }

      function workshopAccessKey(op, target) {
        return String(op) + "|" + (target || "");
      }

      // The answers of auth.can for the controls of a screen, asked in ONE batch and kept for the session. Pure: no client, no identity of its own;
      // options: { call(items) -> the answer of auth.can ({ items: [...] }) or throws, ttl, now, warn }.
      //   want(items)   Promise; asks what is not known yet (or older than ttl) in one call; the calls of the same tick are one call; more than 100 are split
      //   get(op, target)  the cached answer or null (never asks)      refresh()  forget the answers and ask again for everything that was wanted
      //   noteIdentity(key)  refresh when the key is not the one of the last time      noteForbidden()  a call was refused with 403: refresh
      //   onChange(fn)  fn() when answers arrive or are forgotten; returns the off function
      // records the usable answers of one auth.can reply in the page store `s`; returns how many it used
      function workshopAccessKeep(s, items, r, now, warn) {
        var used = 0;
        r.items.forEach(function (it, i) {
          if (!it || typeof it.allowed !== "boolean") return; // an item the service could not use: no answer, the page keeps its table
          var src = workshopAccessItem(items[i]);
          s.answers[workshopAccessKey(src.operation, src.target)] = { answer: it, at: now() };
          used++;
          if (it.allowed === false && workshopAccessCauseOf(it.reason) === "unknown") warn("auth.can: unknown cause for " + src.operation + ": " + JSON.stringify(it.reason || null));
        });
        return used;
      }
      function workshopAccessCanStore(options) {
        var o = options || {};
        var ttl = o.ttl === undefined ? WORKSHOP_ACCESS_TTL_MS : o.ttl;
        var now = o.now || Date.now;
        var warn = o.warn || function (m) { if (typeof console !== "undefined") console.warn(m); };
        var s = { answers: {}, wanted: {}, listeners: [], queue: {}, queued: 0, scheduled: false, flights: 0, generation: 0, failedAt: -Infinity, identity: null, waiters: [] };
        var store = { calls: 0 };
        function changed() {
          s.listeners.slice().forEach(function (fn) {
            try { fn(); } catch (e) { /* a listener must not break the others */ }
          });
        }
        function fresh(k) {
          var a = s.answers[k];
          return !!a && (ttl <= 0 ? false : now() - a.at < ttl);
        }
        function keep(items, r) {
          return workshopAccessKeep(s, items, r, now, warn);
        }
        function send(items, gen) {
          store.calls++;
          return Promise.resolve()
            .then(function () { return o.call(items.map(workshopAccessItem)); })
            .then(function (r) {
              if (gen !== s.generation) return;
              // an answer the page cannot use counts as a failed call: without it the page would ask again at once, on every refresh
              if (!r || !Array.isArray(r.items) || !keep(items, r)) s.failedAt = now();
            }, function () { s.failedAt = now(); });
        }
        function flush() {
          s.scheduled = false;
          var items = Object.keys(s.queue).map(function (k) { return s.queue[k]; });
          var mine = s.waiters;
          s.queue = {};
          s.queued = 0;
          s.waiters = [];
          if (!items.length) return mine.forEach(function (w) { w(); });
          var gen = s.generation;
          s.flights++;
          var parts = [];
          for (var i = 0; i < items.length; i += WORKSHOP_ACCESS_MAX_BATCH) parts.push(items.slice(i, i + WORKSHOP_ACCESS_MAX_BATCH));
          return Promise.all(parts.map(function (p) { return send(p, gen); })).then(function () {
            s.flights--;
            mine.forEach(function (w) { w(); });
            if (gen === s.generation) changed();
          });
        }
        store.want = function (list) {
          var any = false;
          (list || []).forEach(function (x) {
            var it = workshopAccessItem(x);
            if (!it.operation) return;
            var k = workshopAccessKey(it.operation, it.target);
            s.wanted[k] = it;
            if (fresh(k) || s.queue[k]) return;
            if (now() - s.failedAt < WORKSHOP_ACCESS_RETRY_MS) return;
            s.queue[k] = it;
            s.queued++;
            any = true;
          });
          if (!any) return Promise.resolve();
          return new Promise(function (res) {
            s.waiters.push(res);
            if (!s.scheduled) {
              s.scheduled = true;
              Promise.resolve().then(flush);
            }
          });
        };
        store.get = function (op, target) {
          var a = s.answers[workshopAccessKey(op, target)];
          return a ? a.answer : null;
        };
        store.pending = function () { return s.flights > 0 || s.queued > 0; };
        store.refresh = function () {
          s.generation++;
          s.answers = {};
          s.failedAt = -Infinity;
          var all = Object.keys(s.wanted).map(function (k) { return s.wanted[k]; });
          changed();
          return store.want(all);
        };
        store.noteIdentity = function (key) {
          if (s.identity === key) return Promise.resolve();
          s.identity = key; // the first key is the baseline of the page; a different one (even from an unknown identity) is a change
          return store.refresh();
        };
        store.noteForbidden = function () { return store.refresh(); };
        store.onChange = function (fn) {
          s.listeners.push(fn);
          return function () {
            var i = s.listeners.indexOf(fn);
            if (i >= 0) s.listeners.splice(i, 1);
          };
        };
        store.forget = function () { s.wanted = {}; }; // a screen left: what it asked is not asked again by refresh()
        return store;
      }

      // ---- the page store: ONE per browser page, shared by every Taller JS plugin (they ask the same cache) ----
      var WORKSHOP_ACCESS_FORBIDDEN_EVENT = "workshop:forbidden"; // dispatched on window by workshopApi for every 403 (01-api.js)

      function workshopAccessIdentityKey() {
        var id = typeof workshopIdentity === "function" ? workshopIdentity() : null;
        if (!id) return null;
        return String(id.role || "") + "|" + (id.role ? "in" : "out") + "|" + String((id.user && id.user.name) || "");
      }

      // The store of the page; it is made on the first ask (nothing is listened to or called before). The call is auth.can, quiet, never opens the sign-in.
      function workshopAccessPageStore() {
        if (typeof window === "undefined") return null;
        if (window.__workshopAccessStore) return window.__workshopAccessStore;
        var store = (window.__workshopAccessStore = workshopAccessCanStore({
          call: function (items) { return workshopApi("auth.can", { operations: items }, { quiet: true, noLogin: true, byPerson: false }); },
        }));
        var baseline = workshopAccessIdentityKey();
        if (baseline !== null) store.noteIdentity(baseline);
        if (typeof workshopOnIdentity === "function") {
          workshopOnIdentity(function () {
            var key = workshopAccessIdentityKey();
            if (key !== null) store.noteIdentity(key);
          });
        }
        if (typeof window.addEventListener === "function") window.addEventListener(WORKSHOP_ACCESS_FORBIDDEN_EVENT, function () { store.noteForbidden(); });
        return store;
      }

      // asks the service about these operations (names or { operation, target }) in the batch of the page; a stop is never asked
      function workshopAccessWant(items) {
        var store = workshopAccessPageStore();
        var list = (items || []).filter(function (x) { return !workshopAccessIsStop(workshopAccessItem(x).operation); });
        return store && list.length ? store.want(list) : Promise.resolve();
      }

      // The answer of the service for an operation, or null (not asked yet, no service, or a stop: those are never answered by the cache). Never asks.
      function workshopAnswer(op, target) {
        if (workshopAccessIsStop(op)) return null;
        var store = typeof window !== "undefined" ? window.__workshopAccessStore : null;
        return store ? store.get(op, target) : null;
      }

      // The 403 of a call: the permission changed under the page. Told on window so the store of the page (which may be another plugin's) refreshes.
      function workshopAccessForbidden(op) {
        if (op === "auth.can" || typeof window === "undefined" || typeof window.dispatchEvent !== "function" || typeof Event !== "function") return;
        try { window.dispatchEvent(new Event(WORKSHOP_ACCESS_FORBIDDEN_EVENT)); } catch (e) { /* only a courtesy */ }
      }

      // ---- the note under a group of buttons ----
      // The sentence of a verdict: the key and parameters of the cause, with the condition named by its own phrase
      function workshopAccessCauseText(v) {
        var p = Object.assign({}, v.params);
        if (v.nested) p[v.nested.param] = i18nT("notice." + v.nested.key, v.nested.params);
        return i18nT("notice." + v.key, p);
      }

      // What a group says now: { kind (the family.css class), icon, text } or null. With the answers of the service: the profile-aware causes. A role,
      // session or service-down cause is told with the sentences of the notices of the plugin; without answers (yet) the table of the role decides.
      function workshopAccessNote(ops, opts) {
        opts = opts || {};
        var targets = {};
        var names = ops.map(function (x) {
          var it = workshopAccessItem(x);
          targets[it.operation] = it.target;
          return it.operation;
        });
        var v = workshopAccessFromAnswers(names, function (op) { return workshopAnswer(op, targets[op]); }, { roleName: workshopAccessRoleName(), live: opts.live });
        if (v.show && WORKSHOP_ACCESS_LOOK[v.cause]) return { kind: WORKSHOP_ACCESS_LOOK[v.cause].css, icon: WORKSHOP_ACCESS_LOOK[v.cause].icon, cause: v.cause, text: workshopAccessCauseText(v) };
        if (v.show && v.cause === "session") return { kind: "session", icon: "", cause: v.cause, text: workshopNoticeText("session") };
        if (v.show && v.cause === "role") return { kind: "role", icon: "", cause: v.cause, text: workshopNoticeText("role", v.params.needed || opts.need) };
        if (v.show && v.cause === "down") return { kind: "down", icon: "", cause: v.cause, text: workshopNoticeText("down") };
        if (v.answered || opts.service === false) return null;
        return workshopAccessTableNote(names, opts);
      }

      // The table of the role, while the service has not answered: the first non-stop operation the role cannot call
      function workshopAccessTableNote(names, opts) {
        for (var i = 0; i < names.length; i++) {
          if (workshopAccessIsStop(names[i]) || typeof workshopAccessState !== "function") continue;
          var a = workshopAccessState(names[i]);
          var kind = a === "session" ? "session" : a === "role" ? "role" : "";
          if (kind) return { kind: kind, icon: "", cause: kind, text: workshopNoticeText(kind, opts.need) };
        }
        return null;
      }

      function workshopAccessRoleName() {
        var id = typeof workshopIdentity === "function" ? workshopIdentity() : null;
        return id && id.user && id.user.name ? String(id.user.name) : "";
      }

      // The notes on screen, repainted when the answers arrive or are forgotten. One listener on the page store, added with the first note.
      var workshopAccessNotes = [];
      var workshopAccessOff = null;

      function workshopAccessRepaint(box) {
        var n = box.__access;
        var note = workshopAccessNote(n.ops, n.opts);
        var sig = note ? note.kind + "|" + note.text : "";
        if (box.__sig === sig) return;
        box.__sig = sig;
        while (box.firstChild) box.removeChild(box.firstChild);
        box.hidden = !note;
        box.className = note ? "wf-reason wf-reason--" + note.kind : "wf-reason";
        if (!note) return;
        box.setAttribute("data-cause", note.cause);
        if (note.icon) {
          var ic = document.createElement("span");
          ic.className = "wf-reason-icon mdi " + note.icon;
          ic.setAttribute("aria-hidden", "true");
          box.appendChild(ic);
        } else {
          box.appendChild(workshopNoticeIconEl(note.kind, "wf-reason-icon"));
        }
        var t = document.createElement("span");
        t.className = "wf-reason-text";
        t.textContent = typeof workshopNoticeWithSubject === "function" ? workshopNoticeWithSubject(note.text, n.opts.subject) : note.text;
        box.appendChild(t);
      }

      function workshopAccessRepaintAll() {
        workshopAccessNotes = workshopAccessNotes.filter(function (box) {
          if (box.isConnected) box.__seen = true;
          else if (box.__seen || Date.now() - box.__at > 5000) return false; // it was on the screen and is gone (or never got there): forgotten
          workshopAccessRepaint(box);
          return true;
        });
      }

      // The note under a group of buttons: ops = operation names or { operation, target } of the group (a stop is left out); opts = { live, need, service, subject }
      // (subject: the name of the group, "Phone alerts": the sentence starts with it, DESIGN 7d).
      // Returns the element (empty and hidden while nothing blocks; it repaints itself), and asks the service for the group in the page batch.
      function workshopReasonGroupEl(ops, opts) {
        var box = document.createElement("div");
        box.setAttribute("role", "note");
        box.hidden = true;
        box.className = "wf-reason";
        box.__access = { ops: (ops || []).filter(function (x) { return !workshopAccessIsStop(workshopAccessItem(x).operation); }), opts: opts || {} };
        box.__at = Date.now();
        workshopAccessNotes.push(box);
        var store = workshopAccessPageStore();
        if (store && !workshopAccessOff) workshopAccessOff = store.onChange(workshopAccessRepaintAll);
        if (workshopAccessOff === null && typeof workshopOnIdentity === "function") workshopAccessOff = workshopOnIdentity(workshopAccessRepaintAll);
        workshopAccessWant(box.__access.ops).then(function () { workshopAccessRepaint(box); });
        workshopAccessRepaint(box);
        return box;
      }

      if (typeof window !== "undefined") {
        window.__workshopAccess = {
          reason: {
            STOP_OPS: WORKSHOP_ACCESS_STOP_OPS, CAUSES: WORKSHOP_ACCESS_CAUSES, BLOCK_KEYS: WORKSHOP_ACCESS_BLOCK_KEYS, CAUSE_LOOK: WORKSHOP_ACCESS_LOOK,
            causeOfDecision: workshopAccessCauseOf, firstCause: workshopAccessFirstCause, conditionPhrase: workshopAccessConditionPhrase,
            conditionOfReason: workshopAccessConditionOf, blockReason: workshopAccessBlock, entryOfAnswer: workshopAccessEntry,
            groupReason: workshopAccessGroup, groupFromAnswers: workshopAccessFromAnswers,
          },
          makeCanStore: workshopAccessCanStore,
          MAX_BATCH: WORKSHOP_ACCESS_MAX_BATCH,
          TTL_MS: WORKSHOP_ACCESS_TTL_MS,
          RETRY_MS: WORKSHOP_ACCESS_RETRY_MS,
        };
      }
