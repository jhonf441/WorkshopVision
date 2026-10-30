      // ---- Session notices (2026-10-22): the person must always know WHY something does not move ----
      // 1. A permanent chip while the service has users and this browser has no session: "Not signed in: you can only look" + a
      //    button that opens the sign-in. It disappears when the person signs in (or when the machine has no users).
      // 2. workshopToast(text): a short notice at the bottom, used when an action the person just started is refused (no session,
      //    role too low, ...). One at a time, 6 s. Also offered to the Vue pages as window.__workshop.toast.
      // Look of the floating panels of DESIGN.md: dark window #1e272c, amber left border for "something to do".

      var WORKSHOP_NOTICE_CHIP_ID = "workshop-session-chip";
      var WORKSHOP_NOTICE_TOAST_ID = "workshop-toast";
      var workshopNoticeToastTimer = 0;

      function workshopNoticeRoot() {
        return document.fullscreenElement || document.body;
      }

      function workshopNoticeBox(id, extraCss) {
        var box = document.createElement("div");
        box.id = id;
        box.setAttribute("data-tp-panel", "1");
        box.style.cssText =
          "position:fixed;left:50%;transform:translateX(-50%);z-index:2147483645;max-width:92vw;box-sizing:border-box;" +
          "background:#1e272c;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-left:4px solid #ff8f00;border-radius:8px;" +
          "font:12px/1.4 Roboto,Helvetica,Arial,sans-serif;box-shadow:0 4px 18px rgba(0,0,0,0.5);" +
          extraCss;
        return box;
      }

      function workshopToast(text) {
        if (typeof document === "undefined" || !document.body || !text) return;
        var old = document.getElementById(WORKSHOP_NOTICE_TOAST_ID);
        if (old) old.remove();
        clearTimeout(workshopNoticeToastTimer);
        var box = workshopNoticeBox(WORKSHOP_NOTICE_TOAST_ID, "bottom:92px;padding:10px 14px;pointer-events:none;");
        box.setAttribute("role", "status");
        box.textContent = String(text);
        workshopNoticeRoot().appendChild(box);
        workshopNoticeToastTimer = setTimeout(function () {
          box.remove();
        }, 6000);
      }

      function workshopNoticeChipPaint() {
        var show = typeof workshopSignedOut === "function" && workshopSignedOut() && !document.querySelector("[data-tp-pin]");
        var chip = document.getElementById(WORKSHOP_NOTICE_CHIP_ID);
        if (!show) {
          if (chip) chip.remove();
          return;
        }
        var root = workshopNoticeRoot();
        if (chip) {
          if (chip.parentNode !== root) root.appendChild(chip);
          return;
        }
        chip = workshopNoticeBox(WORKSHOP_NOTICE_CHIP_ID, "bottom:84px;display:flex;align-items:center;gap:12px;padding:6px 6px 6px 14px;");
        var label = document.createElement("span");
        label.textContent = workshopApiT("signedOut");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = workshopApiT("signInAction");
        btn.style.cssText =
          "background:#1976d2;color:#fff;border:0;border-radius:6px;padding:0 16px;min-height:36px;font:600 12px Roboto,Helvetica,Arial,sans-serif;" +
          "text-transform:uppercase;letter-spacing:0.4px;cursor:pointer;flex:none;";
        btn.addEventListener("click", function () {
          if (typeof workshopLogin === "function") workshopLogin();
        });
        chip.appendChild(label);
        chip.appendChild(btn);
        root.appendChild(chip);
      }

      (function workshopNoticeStart() {
        if (typeof window === "undefined" || typeof document === "undefined" || window.__workshopNotice) return;
        window.__workshopNotice = 1;
        // the session changes without any event the page could hear (token cleared, tab restored): looking once a second is enough
        setInterval(function () {
          try {
            workshopNoticeChipPaint();
          } catch (e) {
            /* only visual */
          }
        }, 1000);
        // the Vue pages ask for the notice through the registry (10-registry.js builds window.__workshop)
        setTimeout(function () {
          if (window.__workshop && !window.__workshop.toast) window.__workshop.toast = workshopToast;
        }, 0);
      })();
