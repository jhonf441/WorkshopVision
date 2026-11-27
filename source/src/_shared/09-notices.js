      // ---- The ONE place where notices show on the page (owner 2026-11-23, notes 13 and 17; contract of the architecture review) ----
      //
      // Every plugin brings a copy; the first one installs window.__workshopNotices and a newer version takes over keeping the queue. No plugin draws
      // its own card or names another plugin, and the caller never says where, how long, which style or which layer:
      //   var key = window.__workshopNotices.post({ source: "WorkshopJog", id: "homing", level: "info" | "success" | "warning" | "error" | "refusal",
      //                                             title: "...", text: "...", action: { label, run }, persist: true });
      //   close(key)  closeSource(source)  setInset("right" | "bottom", px, owner)  getInset(side)  count
      //   (bottom: a floating panel docked at the bottom with its STOP / E-STOP, the Jog, keeps that strip free: the notices go above it; C13.9)
      //   options() / setOptions({ style, corner, persist, max })   what THIS screen chose (browser key "workshopNoticeOptions", NoticeOptions.vue)
      // A wide screen (more than 768 x 500): the chosen corner (bottom right by default, minus what the control bar takes on the right, setInset), up to
      // `max` cards (3) and a "N more" line; info and success go after 5 s, a warning after 8 s, an error after 10 s; an error or a refusal may stay
      // (persist) when the screen allows it; style "dwc" hands the notice to DWC's own notification when a Vue plugin opened that door. A small screen (a phone, or a
      // kiosk with little height): at the bottom across the width with 16 px of margin, ONE card and a counter, and everything goes by itself
      // (4 / 6 / 8 s) so nothing stays over the page. Hovering or focusing the cards pauses the clocks. Layer 2147483645: under the risk bar and the
      // dialogs. The small-screen rules win over the options. The Vue twin is vue/_shared36/notices.js (tests/notices.test.js keeps the code identical).
      //
      // ---- notices core begin ----
      var WORKSHOP_NOTICES_VERSION = 3; // 2: options of the screen, getInset; 3: the bottom inset
      var WORKSHOP_NOTICES_LEVELS = ["info", "success", "warning", "error", "refusal"];
      var WORKSHOP_NOTICES_KEY = "workshopNoticeOptions";
      var WORKSHOP_NOTICES_CORNERS = ["bottom-right", "bottom-left", "top-right", "top-left"];
      var WORKSHOP_NOTICES_DEFAULTS = { style: "own", corner: "bottom-right", persist: true, max: 3 };
      // THE list of options of a screen: every screen of options walks it (NoticeOptions.vue; the section "This screen" of the service page with its
      // own kit), so a field never exists in one and not in the other. kind: choice (values) | bool | int (min..max); label / valueLabel: catalog keys
      // ("notices_*"; a value's label is valueLabel + the value with "-" as "_"). wideOnly: a small screen ignores it; needs: only with that other value.
      var WORKSHOP_NOTICES_FIELDS = [
        { key: "style", kind: "choice", values: ["own", "dwc"], label: "notices_opt_style", valueLabel: "notices_style_" },
        { key: "corner", kind: "choice", values: WORKSHOP_NOTICES_CORNERS, label: "notices_opt_corner", valueLabel: "notices_corner_", wideOnly: true, needs: { style: "own" } },
        { key: "max", kind: "int", min: 1, max: 5, label: "notices_opt_max", wideOnly: true },
        { key: "persist", kind: "bool", label: "notices_opt_persist", wideOnly: true },
      ];

      // Pure: one field from a stored value (a wrong one is the default)
      function workshopNoticesField(f, v) {
        if (f.kind === "bool") return typeof v === "boolean" ? v : WORKSHOP_NOTICES_DEFAULTS[f.key];
        if (f.kind === "int") {
          var n = Math.round(Number(v));
          return n >= f.min && n <= f.max ? n : WORKSHOP_NOTICES_DEFAULTS[f.key];
        }
        return f.values.indexOf(v) >= 0 ? v : WORKSHOP_NOTICES_DEFAULTS[f.key];
      }

      // Pure: the options of the screen from what was stored: only the fields of the list, each one checked (anything missing or wrong is the default)
      function workshopNoticesOptions(raw) {
        var o = raw && typeof raw === "object" ? raw : {};
        var out = {};
        WORKSHOP_NOTICES_FIELDS.forEach(function (f) { out[f.key] = workshopNoticesField(f, o[f.key]); });
        return out;
      }

      // Pure: is this window small for notices? (a phone, or a short kiosk)
      function workshopNoticesSmall(w, h) {
        return !(w > 768 && h > 500);
      }

      // Pure: how long a notice stays, in ms (0 = until closed); allow = the screen lets an error or a refusal stay (options().persist, default yes)
      function workshopNoticesDuration(level, small, persist, allow) {
        var lv = WORKSHOP_NOTICES_LEVELS.indexOf(level) >= 0 ? level : "info";
        if (small) return lv === "warning" ? 6000 : lv === "error" || lv === "refusal" ? 8000 : 4000;
        if (persist && allow !== false && (lv === "error" || lv === "refusal")) return 0;
        return lv === "warning" ? 8000 : lv === "error" || lv === "refusal" ? 10000 : 5000;
      }

      // Pure: which notices are seen (the newest last) and how many wait; max = options().max on a wide screen (one on a small one)
      function workshopNoticesVisible(items, small, max) {
        max = small ? 1 : max >= 1 ? max : 3;
        var shown = items.slice(Math.max(0, items.length - max));
        return { shown: shown, more: items.length - shown.length };
      }

      // Pure: a clean notice from what a plugin asked for, or null (no source or no text)
      function workshopNoticesClean(spec) {
        var s = spec || {};
        var source = String(s.source || "").trim();
        var text = String(s.text || "").trim();
        var title = String(s.title || "").trim();
        if (!source || (!text && !title)) return null;
        var level = WORKSHOP_NOTICES_LEVELS.indexOf(s.level) >= 0 ? s.level : "info";
        var action = s.action && typeof s.action.run === "function" && s.action.label ? { label: String(s.action.label), run: s.action.run } : null;
        return { source: source, id: s.id ? String(s.id) : "", level: level, title: title, text: text, action: action, persist: !!s.persist && (level === "error" || level === "refusal") };
      }

      // Pure: where the host goes: { top | bottom, left | right } for the corner on a wide screen; across the bottom on a small one. below = the
      // strip a panel keeps free at the bottom (getInset("bottom")): a host at the bottom sits above it
      function workshopNoticesPlace(corner, small, inset, below) {
        var up = (below || 0) + 16;
        if (small) return { bottom: true, across: true, up: up };
        var c = WORKSHOP_NOTICES_CORNERS.indexOf(corner) >= 0 ? corner : WORKSHOP_NOTICES_DEFAULTS.corner;
        var right = /right$/.test(c);
        return { bottom: /^bottom/.test(c), right: right, px: (right ? inset || 0 : 0) + 16, up: up };
      }

      // Pure: the right inset (the widest one any owner published)
      function workshopNoticesInset(insets) {
        var px = 0;
        Object.keys(insets || {}).forEach(function (k) { px = Math.max(px, Number(insets[k]) || 0); });
        return px;
      }
      // ---- notices core end ----


      // ---- the DOM side: one host per page, drawn again from the queue on every change. st = { items, insets, serial, host, paused, t, api } ----
      function workshopNoticesTr(st, k, p) {
        try {
          return st.t(k, p);
        } catch (e) {
          return k;
        }
      }

      function workshopNoticesIsSmall() {
        return workshopNoticesSmall(window.innerWidth || 1024, window.innerHeight || 768);
      }

      // the options of this screen, from the browser (none stored, or no storage: the defaults)
      function workshopNoticesRead() {
        try {
          return workshopNoticesOptions(JSON.parse(window.localStorage.getItem(WORKSHOP_NOTICES_KEY) || "null"));
        } catch (e) {
          return workshopNoticesOptions(null);
        }
      }

      // the clock of one notice (what is left of it after a pause)
      function workshopNoticesArm(st, it) {
        clearTimeout(it.timer);
        it.timer = null;
        var ms = it.left || workshopNoticesDuration(it.level, workshopNoticesIsSmall(), it.persist, workshopNoticesRead().persist);
        if (ms && !st.paused) it.timer = setTimeout(function () { st.api.close(it.key); }, ms);
        it.started = Date.now();
        it.total = ms;
      }

      function workshopNoticesPause(st, on) {
        if (st.paused === on) return;
        st.paused = on;
        st.items.forEach(function (it) {
          if (!on) return workshopNoticesArm(st, it);
          clearTimeout(it.timer);
          it.timer = null;
          if (it.total) it.left = Math.max(1000, it.total - (Date.now() - it.started));
        });
      }

      // the look of the host travels with the module (the service page loads only the core family.css, and a page may have no plugin sheet yet);
      // the colours are the tokens of the family (light and dark theme) with the dark values as the fallback
      var WORKSHOP_NOTICES_CSS = [
        ".wf-notices { position: fixed; bottom: calc(16px + env(safe-area-inset-bottom, 0px)); z-index: 2147483645; display: flex; flex-direction: column; gap: 8px; width: min(400px, calc(100vw - 32px)); box-sizing: border-box; font-size: 13px; }",
        '.wf-notices[data-small="1"] { left: 16px; right: 16px; width: auto; }',
        ".wf-notices-more, .wf-notices-card { background: var(--wf-surface, #1e272c); color: var(--wf-text, #eceff1); }",
        ".wf-notices-more { align-self: flex-end; padding: 2px 10px; border-radius: 999px; font-size: 12px; }",
        ".wf-notices-card { display: flex; align-items: center; gap: 8px; padding: 8px 4px 8px 12px; border: 1px solid var(--wf-line, #ffffff1f); border-left: 4px solid var(--wf-n-c, var(--wf-n-session, #1e88e5)); border-radius: 8px; box-shadow: 0 4px 18px #0006; }",
        ".wf-notices-card.is-success { --wf-n-c: var(--wf-c-success, #43a047); } .wf-notices-card.is-warning { --wf-n-c: var(--wf-n-down, #fb8c00); } .wf-notices-card.is-error { --wf-n-c: var(--wf-n-error, #e53935); } .wf-notices-card.is-refusal { --wf-n-c: var(--wf-n-role, #90a4ae); }",
        ".wf-notices-body { flex: 1 1 auto; min-width: 0; }",
        ".wf-notices-title { font-weight: 600; }",
        ".wf-notices-text { opacity: 0.85; overflow-wrap: anywhere; }",
        ".wf-notices-action { flex: none; min-height: var(--wf-hit, 40px); font-size: 12px; font-weight: 600; }",
        ".wf-notices-close { flex: none; width: var(--wf-hit, 40px); height: var(--wf-hit, 40px); border: 0; background: none; color: inherit; font-size: 20px; cursor: pointer; }",
        // the host hangs from <body>, outside .v-application: it says the theme of the page itself (data-theme) and takes the light values here
        '.wf-notices[data-theme="light"] { --wf-surface: #fff; --wf-text: #212121; --wf-line: rgba(0, 0, 0, 0.12); }',
      ].join("\n");

      function workshopNoticesStyle() {
        if (typeof document.getElementById !== "function" || document.getElementById("wf-notices-css")) return;
        var el = document.createElement("style");
        el.id = "wf-notices-css";
        el.textContent = WORKSHOP_NOTICES_CSS;
        (document.head || document.body).appendChild(el);
      }

      function workshopNoticesHost(st) {
        var root = document.fullscreenElement || document.body;
        if (st.host && st.host.parentNode === root) return st.host;
        workshopNoticesStyle();
        if (st.host && st.host.parentNode) st.host.parentNode.removeChild(st.host);
        var h = document.createElement("div");
        h.className = "wf-notices";
        h.setAttribute("aria-live", "polite");
        h.addEventListener("pointerenter", function () { workshopNoticesPause(st, true); });
        h.addEventListener("pointerleave", function () { workshopNoticesPause(st, false); });
        h.addEventListener("focusin", function () { workshopNoticesPause(st, true); });
        h.addEventListener("focusout", function () { workshopNoticesPause(st, false); });
        root.appendChild(h);
        st.host = h;
        return h;
      }

      // the theme of DWC's page: light when its application says so (Vuetify 2 .theme--light, Vuetify 3 .v-theme--light), dark otherwise
      function workshopNoticesTheme() {
        var app = typeof document.querySelector === "function" ? document.querySelector(".v-application") : null;
        var cl = app && app.classList;
        var light = typeof workshopHostThemeLightClass === "function" ? workshopHostThemeLightClass() : "theme--light"; // the class of this DWC (00-dwc-host.js)
        return cl && (cl.contains(light) || cl.contains("v-theme--light")) ? "light" : "dark";
      }

      function workshopNoticesText(cls, text) {
        var d = document.createElement("div");
        d.className = cls;
        d.textContent = text;
        return d;
      }

      function workshopNoticesCard(st, it) {
        var c = document.createElement("div");
        c.className = "wf-notices-card is-" + it.level;
        c.setAttribute("role", it.level === "error" || it.level === "refusal" ? "alert" : "status");
        var body = document.createElement("div");
        body.className = "wf-notices-body";
        if (it.title) body.appendChild(workshopNoticesText("wf-notices-title", it.title));
        if (it.text) body.appendChild(workshopNoticesText("wf-notices-text", it.text));
        c.appendChild(body);
        if (it.action) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "wf-btn wf-notices-action";
          b.textContent = it.action.label;
          b.addEventListener("click", function () {
            st.api.close(it.key);
            it.action.run();
          });
          c.appendChild(b);
        }
        var x = document.createElement("button");
        x.type = "button";
        x.className = "wf-notices-close";
        x.setAttribute("aria-label", workshopNoticesTr(st, "notices_close"));
        x.textContent = "×";
        x.addEventListener("click", function () { st.api.close(it.key); });
        c.appendChild(x);
        return c;
      }

      function workshopNoticesDraw(st) {
        if (typeof document === "undefined" || !document.body) return;
        if (!st.items.length) {
          if (st.host && st.host.parentNode) st.host.parentNode.removeChild(st.host);
          st.host = null;
          st.paused = false;
          return;
        }
        var h = workshopNoticesHost(st);
        var sm = workshopNoticesIsSmall();
        var opt = workshopNoticesRead();
        var pl = workshopNoticesPlace(opt.corner, sm, workshopNoticesInset(st.insets), workshopNoticesInset(st.below));
        h.setAttribute("data-small", sm ? "1" : "0");
        h.setAttribute("data-theme", workshopNoticesTheme());
        h.style.top = pl.across || pl.bottom ? "" : "16px";
        h.style.bottom = pl.across || pl.bottom ? "calc(" + pl.up + "px + env(safe-area-inset-bottom, 0px))" : "auto";
        h.style.right = pl.across ? "" : pl.right ? pl.px + "px" : "auto";
        h.style.left = pl.across ? "" : pl.right ? "auto" : pl.px + "px";
        h.textContent = "";
        var v = workshopNoticesVisible(st.items, sm, opt.max);
        if (v.more) h.appendChild(workshopNoticesText("wf-notices-more", workshopNoticesTr(st, "notices_more", { n: v.more })));
        v.shown.forEach(function (it) { h.appendChild(workshopNoticesCard(st, it)); });
      }

      // drop the notices that match, with their clocks
      function workshopNoticesDrop(st, match) {
        st.items.filter(match).forEach(function (o) { clearTimeout(o.timer); });
        st.items = st.items.filter(function (o) { return !match(o); });
      }

      function workshopNoticesCreate(t) {
        var st = { items: [], insets: {}, below: {}, serial: 0, host: null, paused: false, t: t, api: null, door: null };
        var api = {
          version: WORKSHOP_NOTICES_VERSION,
          post: function (spec) {
            var n = workshopNoticesClean(spec);
            if (!n) return "";
            // style "dwc" on a wide screen: DWC's own notification, when a Vue plugin opened that door (a card when the door says no)
            if (st.door && !workshopNoticesIsSmall() && workshopNoticesRead().style === "dwc") {
              try {
                if (st.door(n) !== false) return n.source + ":dwc";
              } catch (e) {
                /* the door failed: the card */
              }
            }
            if (n.id) workshopNoticesDrop(st, function (o) { return o.source === n.source && o.id === n.id; });
            st.serial += 1;
            n.key = n.source + ":" + st.serial;
            st.items.push(n);
            workshopNoticesArm(st, n);
            workshopNoticesDraw(st);
            return n.key;
          },
          close: function (key) {
            workshopNoticesDrop(st, function (o) { return o.key === key; });
            workshopNoticesDraw(st);
          },
          closeSource: function (source) {
            workshopNoticesDrop(st, function (o) { return o.source === source; });
            workshopNoticesDraw(st);
          },
          setInset: function (side, px, owner) {
            if (side !== "right" && side !== "bottom") return;
            (side === "right" ? st.insets : st.below)[String(owner || "?")] = Math.max(0, Number(px) || 0);
            workshopNoticesDraw(st);
          },
          optionFields: function () {
            return JSON.parse(JSON.stringify(WORKSHOP_NOTICES_FIELDS));
          },
          getInset: function (side) {
            return side === "right" ? workshopNoticesInset(st.insets) : side === "bottom" ? workshopNoticesInset(st.below) : 0;
          },
          options: function () {
            return workshopNoticesRead();
          },
          setOptions: function (o) {
            var next = workshopNoticesOptions(Object.assign({}, workshopNoticesRead(), o || {}));
            try {
              window.localStorage.setItem(WORKSHOP_NOTICES_KEY, JSON.stringify(next));
            } catch (e) {
              /* no storage (private window): the choice lasts this page */
            }
            workshopNoticesDraw(st);
            return next;
          },
          // the first Vue plugin gives DWC's notification (makeNotification) for style "dwc": internal, not part of the contract
          _setDwcDoor: function (fn) {
            if (typeof fn === "function" && !st.door) st.door = fn;
          },
          // a newer copy takes the queue and the insets of this one
          _queue: function () {
            return st.items.map(function (o) { return { source: o.source, id: o.id, level: o.level, title: o.title, text: o.text, action: o.action, persist: o.persist }; });
          },
          _insets: function () {
            return Object.assign({}, st.insets);
          },
          _below: function () {
            return Object.assign({}, st.below);
          },
          get _door() {
            return st.door;
          },
          _clear: function () {
            workshopNoticesDrop(st, function () { return true; });
            workshopNoticesDraw(st);
          },
        };
        Object.defineProperty(api, "count", { get: function () { return st.items.length; } });
        st.api = api;
        if (typeof window.addEventListener === "function") {
          window.addEventListener("resize", function () { workshopNoticesDraw(st); });
          window.addEventListener("storage", function (e) { if (e && e.key === WORKSHOP_NOTICES_KEY) workshopNoticesDraw(st); }); // another tab changed the options
        }
        return api;
      }

      // install (or take over from an older copy) and return the one center
      function workshopNoticesInstall(t) {
        if (typeof window === "undefined") return null;
        var old = window.__workshopNotices;
        if (old && Number(old.version) >= WORKSHOP_NOTICES_VERSION) return old;
        var api = workshopNoticesCreate(t);
        if (old) {
          var q = typeof old._queue === "function" ? old._queue() : [];
          var ins = typeof old._insets === "function" ? old._insets() : {};
          if (typeof old._clear === "function") old._clear();
          Object.keys(ins).forEach(function (k) { api.setInset("right", ins[k], k); });
          var bel = typeof old._below === "function" ? old._below() : {};
          Object.keys(bel).forEach(function (k) { api.setInset("bottom", bel[k], k); });
          if (old._door) api._setDwcDoor(old._door);
          q.forEach(function (n) { api.post(n); });
        }
        window.__workshopNotices = api;
        return api;
      }

      // the center, with the texts of this plugin's catalog
      function workshopNotices() {
        return workshopNoticesInstall(function (k, p) { return i18nT("core." + k, p); });
      }
