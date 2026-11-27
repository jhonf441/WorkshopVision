      // ---- "Unsaved changes" for the JS plugins (DWC 3.6): the DOM twin of vue/_shared36/unsaved-guard.js + WfUnsavedDialog.vue (unification, phase 1) ----
      //
      // ONE guard for every editor with Save / Cancel. Nothing saves by itself. Same logic and same three answers as the Vue pages (tests/unsaved-guard-shared.test.js runs both):
      //   workshopSameContent(a, b)            true when two values hold the same content (deep compare, key order and undefined-vs-null do not count)
      //   workshopSnapshot(v)                  a deep copy: the baseline an editor compares its draft with
      //   workshopRegisterGuard(g)             g = { dirty(): bool, save(): Promise<bool | "later">, discard?(), label?() }; returns the function that takes it away
      //   workshopAnyDirty()                   who holds unsaved changes now
      //   workshopConfirmLeave(go, stay)       the one door out: go() at once when nothing is unsaved, else the dialog asks (keep editing / save and leave / discard)
      //   workshopResumeLeave() / workshopDropLeave()   an editor that answered "later" (its own review dialog) says it saved / the person cancelled
      // The dialog is drawn into <body> with the family classes (wf-*), texts from the block "unsaved" of the i18n.
      var workshopUnsaved = { list: [], pending: null, waiting: false, error: "", busy: false, box: null };

      function workshopCanonical(v) {
        if (Array.isArray(v)) return v.map(workshopCanonical);
        if (v !== null && typeof v === "object") {
          var out = {};
          Object.keys(v).sort().forEach(function (k) { if (v[k] !== undefined) out[k] = workshopCanonical(v[k]); });
          return out;
        }
        return v === undefined ? null : v;
      }
      function workshopSameContent(a, b) {
        return JSON.stringify(workshopCanonical(a)) === JSON.stringify(workshopCanonical(b));
      }
      function workshopSnapshot(v) {
        return v === undefined ? null : JSON.parse(JSON.stringify(v));
      }
      function workshopRegisterGuard(g) {
        workshopUnsaved.list.push(g);
        return function () {
          var i = workshopUnsaved.list.indexOf(g);
          if (i >= 0) workshopUnsaved.list.splice(i, 1);
        };
      }
      function workshopDirtyGuards() {
        return workshopUnsaved.list.filter(function (g) { try { return !!g.dirty(); } catch (e) { return false; } });
      }
      function workshopAnyDirty() {
        return workshopDirtyGuards().length > 0;
      }
      // true when the person was asked (go() waits), false when nothing was unsaved and go() already ran
      function workshopConfirmLeave(go, stay) {
        if (!workshopAnyDirty()) {
          go();
          return false;
        }
        workshopUnsaved.error = "";
        workshopUnsaved.waiting = false;
        workshopUnsaved.pending = { go: go, stay: stay || function () {} };
        workshopUnsavedRender();
        return true;
      }
      function workshopKeepEditing() {
        var p = workshopUnsaved.pending;
        workshopUnsaved.pending = null;
        workshopUnsaved.waiting = false;
        workshopUnsaved.error = "";
        workshopUnsavedRender();
        if (p) p.stay();
      }
      function workshopLeaveNow() {
        var p = workshopUnsaved.pending;
        workshopUnsaved.pending = null;
        workshopUnsaved.waiting = false;
        workshopUnsaved.error = "";
        workshopUnsavedRender();
        if (p) p.go();
      }
      function workshopDiscardAndLeave() {
        workshopDirtyGuards().forEach(function (g) { try { if (g.discard) g.discard(); } catch (e) { /* the editor goes anyway */ } });
        workshopLeaveNow();
      }
      // every dirty editor saves, one after the other; the first that fails or refuses stops it and the person keeps editing
      function workshopSaveAndLeave() {
        if (!workshopUnsaved.pending) return Promise.resolve(false);
        workshopUnsaved.error = "";
        var guards = workshopDirtyGuards();
        var step = function (i) {
          if (i >= guards.length) {
            workshopLeaveNow();
            return Promise.resolve(true);
          }
          var r;
          try { r = Promise.resolve(guards[i].save()); } catch (e) { r = Promise.resolve(false); }
          return r.catch(function () { return false; }).then(function (ok) {
            if (ok === "later") {
              workshopUnsaved.waiting = true; // the editor asks its own confirmation and tells us when it is done
              workshopUnsavedRender();
              return "later";
            }
            if (!ok) {
              workshopUnsaved.error = "unsaved_failed";
              workshopUnsavedRender();
              return false;
            }
            return step(i + 1);
          });
        };
        return step(0);
      }
      function workshopResumeLeave() {
        if (workshopUnsaved.pending && workshopUnsaved.waiting) workshopSaveAndLeave();
      }
      function workshopDropLeave() {
        if (workshopUnsaved.pending && workshopUnsaved.waiting) workshopKeepEditing();
      }

      // the dialog: three buttons with words; the first (keep editing) takes the focus; Escape = keep editing; steps aside while an editor runs its own review
      function workshopUnsavedRender() {
        if (typeof document === "undefined" || !document.body) return;
        var open = !!workshopUnsaved.pending && !workshopUnsaved.waiting;
        if (workshopUnsaved.box && workshopUnsaved.box.parentNode) workshopUnsaved.box.parentNode.removeChild(workshopUnsaved.box);
        workshopUnsaved.box = null;
        if (!open) return;
        var veil = document.createElement("div");
        veil.className = "wf-veil wf-unsaved-veil";
        veil.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483640;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.6);";
        var card = document.createElement("div");
        card.className = "wf-card wf-unsaved-card";
        card.setAttribute("role", "alertdialog");
        card.setAttribute("aria-labelledby", "wf-unsaved-title");
        card.setAttribute("aria-describedby", "wf-unsaved-text");
        card.style.cssText = "max-width:460px;width:92vw;padding:20px;box-sizing:border-box;background:#263238;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-radius:12px;";
        var h = document.createElement("div");
        h.id = "wf-unsaved-title";
        h.style.cssText = "font-size:18px;font-weight:600;margin-bottom:8px;";
        h.textContent = i18nT("unsaved.unsaved_title");
        var p = document.createElement("p");
        p.id = "wf-unsaved-text";
        p.style.cssText = "margin:0 0 12px;font-size:14px;";
        p.textContent = i18nT("unsaved.unsaved_text");
        card.appendChild(h);
        card.appendChild(p);
        if (workshopUnsaved.error) {
          var err = document.createElement("p");
          err.setAttribute("role", "alert");
          err.className = "wf-field-msg is-error";
          err.textContent = i18nT("unsaved.unsaved_failed");
          card.appendChild(err);
        }
        var row = document.createElement("div");
        row.style.cssText = "display:flex;flex-wrap:wrap;gap:8px;align-items:center;";
        function btn(act, text, onClick, extra) {
          var b = document.createElement("button");
          b.type = "button";
          b.className = "wf-btn";
          b.setAttribute("data-act", act);
          b.style.cssText = "min-height:var(--wf-size-s, 32px);min-width:var(--wf-size-s, 32px);padding:0 14px;font-size:14px;cursor:pointer;" + (extra || "");
          b.textContent = text;
          b.addEventListener("click", onClick);
          row.appendChild(b);
          return b;
        }
        var keep = btn("keep", i18nT("unsaved.unsaved_keep"), function () { if (!workshopUnsaved.busy) workshopKeepEditing(); }, "");
        btn("save", i18nT("unsaved.unsaved_save"), function () {
          workshopUnsaved.busy = true;
          workshopSaveAndLeave().then(function () { workshopUnsaved.busy = false; });
        }, "");
        btn("discard", i18nT("unsaved.unsaved_discard"), function () { workshopDiscardAndLeave(); }, "margin-left:auto;background:#c62828;color:#fff;border:0;");
        card.appendChild(row);
        veil.appendChild(card);
        veil.addEventListener("keydown", function (e) {
          if (e.key === "Escape" && !workshopUnsaved.busy) { e.stopPropagation(); workshopKeepEditing(); }
        });
        document.body.appendChild(veil);
        workshopUnsaved.box = veil;
        if (keep.focus) keep.focus();
      }

      // reload and closing the tab: the message is the browser's own (the page cannot change its words)
      if (typeof window !== "undefined" && typeof window.addEventListener === "function" && !window.__workshopUnsavedGuardJs) {
        window.__workshopUnsavedGuardJs = true;
        window.addEventListener("beforeunload", function (e) {
          if (!workshopAnyDirty()) return undefined;
          e.preventDefault();
          e.returnValue = "";
          return "";
        });
      }
