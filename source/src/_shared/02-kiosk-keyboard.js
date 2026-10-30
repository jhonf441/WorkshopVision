      // ---- On-screen keyboard of the kiosk (2026-10-22) ----
      // Chromium on the kiosk (Wayland + squeekboard) does not always tell the keyboard that a text field got the focus, so some
      // fields (the PIN dialog) opened no keyboard. Only when the page runs on the Pi itself (host localhost), this asks the small
      // local helper kiosk-osk.py (WorkshopService/kiosk, listens on 127.0.0.1:8099) to show the keyboard when a text field gets the
      // focus and to hide it when the focus leaves the text fields. In any other browser it does nothing.

      var WORKSHOP_OSK_URL = "http://127.0.0.1:8099/osk/";
      var WORKSHOP_OSK_NOT_TEXT = ["button", "checkbox", "radio", "range", "submit", "reset", "file", "color", "image", "hidden"];

      function workshopOskIsText(el) {
        if (!el || el.nodeType !== 1) return false;
        var tag = el.tagName;
        if (el.readOnly || el.disabled) return false;
        if (tag === "TEXTAREA") return true;
        if (tag === "INPUT") return WORKSHOP_OSK_NOT_TEXT.indexOf(String(el.type || "text").toLowerCase()) < 0;
        return !!el.isContentEditable;
      }

      function workshopOskAsk(action) {
        try {
          fetch(WORKSHOP_OSK_URL + action, { mode: "no-cors", cache: "no-store" }).catch(function () {});
        } catch (e) {
          /* no helper: nothing to do */
        }
      }

      (function workshopOskStart() {
        if (typeof window === "undefined" || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
        var host = window.location && window.location.hostname;
        if (host !== "localhost" && host !== "127.0.0.1") return;
        if (window.__workshopOsk) return;
        window.__workshopOsk = 1;
        // The keyboard comes out only when the person touches a field, never because code gave a field the focus (the PIN dialog
        // focuses its first field when it opens: that must not raise the keyboard).
        var touchedAt = 0;
        ["pointerdown", "touchstart", "mousedown"].forEach(function (ev) {
          document.addEventListener(
            ev,
            function () {
              touchedAt = Date.now();
            },
            { capture: true, passive: true }
          );
        });
        document.addEventListener(
          "focusin",
          function (e) {
            if (workshopOskIsText(e.target) && Date.now() - touchedAt < 700) workshopOskAsk("show");
          },
          true
        );
        document.addEventListener(
          "focusout",
          function () {
            // the focus often goes to another field a moment later: hide only if it did not
            setTimeout(function () {
              if (!workshopOskIsText(document.activeElement)) workshopOskAsk("hide");
            }, 200);
          },
          true
        );
      })();

      // ---- No on-screen keyboard on a computer with a mouse (2026-10-29) ----
      // On a PC whose screen is touch (or with Windows' "show the touch keyboard" on) Chrome opens the on-screen keyboard when ANY text or
      // number field gets the focus (the search boxes, the numeric inputs). A computer whose main pointer is a mouse has a physical keyboard:
      // its text fields get inputmode="none", which asks the browser for no on-screen keyboard (the physical one keeps working). Phones and
      // tablets (main pointer coarse) and the kiosk (the helper above) are not touched. Added once per page.
      (function workshopNoVirtualKeyboardStart() {
        if (typeof window === "undefined" || typeof document === "undefined" || typeof window.matchMedia !== "function") return;
        var host = window.location && window.location.hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return;
        if (window.__workshopNoVk) return;
        window.__workshopNoVk = 1;
        var fine;
        try {
          fine = window.matchMedia("(pointer: fine)").matches && window.matchMedia("(hover: hover)").matches;
        } catch (e) {
          fine = false;
        }
        if (!fine) return;
        function mark(root) {
          var list = [];
          if (root.nodeType !== 1) return;
          if (root.matches && root.matches("input, textarea")) list.push(root);
          if (root.querySelectorAll) list = list.concat(Array.prototype.slice.call(root.querySelectorAll("input, textarea")));
          list.forEach(function (el) {
            var t = String(el.type || "text").toLowerCase();
            if (WORKSHOP_OSK_NOT_TEXT.indexOf(t) >= 0 || el.getAttribute("inputmode")) return;
            el.setAttribute("inputmode", "none");
          });
        }
        mark(document.documentElement);
        if (typeof MutationObserver === "function") {
          new MutationObserver(function (muts) {
            muts.forEach(function (m) {
              Array.prototype.forEach.call(m.addedNodes || [], mark);
            });
          }).observe(document.documentElement, { childList: true, subtree: true });
        }
      })();
