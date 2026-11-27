      // ---- Where the result of a button appears: the DOM twin of vue/_shared36/reveal.js revealResult (unification, phase 1) ----
      //
      // A button whose result shows up in another part of the page must bring that result into view, mark it for a moment, put the focus in its first field and say what happened:
      //   workshopNeedsScroll(rect, viewH, min)     true when less than `min` px of the block (or all of it, when shorter) are inside the window
      //   workshopRevealResult(el, opts)            opts = { focus: true | selector | element, highlight: false }; scrolls (smooth, instant under prefers-reduced-motion) ONLY when it
      //                                             is out of view, under DWC's fixed bar ([data-reveal] has scroll-margin-top); marks el [data-revealed] 1.8 s; returns { scrolled, far }
      //   workshopSay(text)                         the sentence for the screen reader (one polite status region, created on first use)
      // The rules ([data-reveal], [data-revealed], .wf-vh) are injected once by workshopEnsureRevealStyle().
      var WORKSHOP_REVEAL_MIN = 320;
      var WORKSHOP_REVEAL_FLASH_MS = 1800;
      var WORKSHOP_REVEAL_FIELD = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

      function workshopNeedsScroll(rect, viewH, min) {
        if (!rect) return false;
        min = min === undefined ? WORKSHOP_REVEAL_MIN : min;
        var view = Math.max(0, Number(viewH) || 0);
        var visible = Math.min(rect.bottom, view) - Math.max(rect.top, 0);
        var want = Math.min(min, Math.max(0, rect.bottom - rect.top));
        return visible < want;
      }

      function workshopEnsureRevealStyle() {
        if (typeof document === "undefined" || !document.head || document.getElementById("workshop-reveal-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-reveal-css";
        st.textContent = [
          "[data-reveal] { scroll-margin-top: 80px; }",
          "@keyframes wf-flash { to { background: transparent; box-shadow: inset 4px 0 transparent; } }",
          "[data-revealed] { background: var(--wf-c-info-bg); box-shadow: inset 4px 0 var(--wf-c-info); }",
          "@media (prefers-reduced-motion: no-preference) { [data-revealed] { animation: wf-flash 1.8s ease-out; } }",
          ".wf-vh { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }"
        ].join("\n");
        document.head.appendChild(st);
      }

      function workshopSay(text) {
        if (typeof document === "undefined" || !document.body) return;
        var r = document.getElementById("workshop-said");
        if (!r) {
          r = document.createElement("div");
          r.id = "workshop-said";
          r.className = "wf-vh";
          r.setAttribute("role", "status");
          r.setAttribute("aria-live", "polite");
          document.body.appendChild(r);
        }
        r.textContent = "";
        r.textContent = text || "";
      }

      function workshopRevealResult(el, opts) {
        var o = opts || {};
        if (!el || typeof el.getBoundingClientRect !== "function" || typeof window === "undefined") return { scrolled: false, far: false };
        workshopEnsureRevealStyle();
        var calm = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        var off = workshopNeedsScroll(el.getBoundingClientRect(), window.innerHeight);
        var scrolled = false;
        if (el.setAttribute) el.setAttribute("data-reveal", "");
        if (off && typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: calm ? "auto" : "smooth", block: "start" });
          scrolled = true;
        }
        if (o.highlight !== false && el.setAttribute) {
          el.removeAttribute("data-revealed");
          void el.offsetWidth; // restarts the mark when the same thing is revealed twice in a row
          el.setAttribute("data-revealed", "");
          setTimeout(function () { el.removeAttribute("data-revealed"); }, WORKSHOP_REVEAL_FLASH_MS);
        }
        var target = typeof o.focus === "string" ? el.querySelector(o.focus) : o.focus === true ? el.querySelector(WORKSHOP_REVEAL_FIELD) : o.focus || null;
        if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
        var far = off && (!scrolled || (calm && workshopNeedsScroll(el.getBoundingClientRect(), window.innerHeight)));
        return { scrolled: scrolled, far: !!far };
      }
