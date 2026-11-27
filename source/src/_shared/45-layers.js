      // ---- A veil never covers an emergency stop (owner's safety rule, 2026-11-23) ----
      // The dark background of a dialog, a sheet or the PIN pad starts UNDER DWC's top bar (its Emergency stop lives there) and ends LEFT of the
      // control bar (its STOP and live stop; the bar publishes what it takes on the right to the notices center, getInset). A tap on those stops
      // reaches them, never the veil. workshopVeilClear(veil) after building it (its cssText may say inset:0); returns the veil.
      function workshopVeilBox() {
        var top = 0;
        if (typeof document !== "undefined" && typeof document.querySelector === "function") {
          var bar = document.querySelector("header.v-app-bar") || document.querySelector(".v-app-bar");
          var r = bar && typeof bar.getBoundingClientRect === "function" ? bar.getBoundingClientRect() : null;
          if (r && r.height > 0 && r.bottom > 0) top = Math.ceil(r.bottom);
        }
        var c = typeof window !== "undefined" ? window.__workshopNotices : null;
        var right = c && typeof c.getInset === "function" ? Number(c.getInset("right")) || 0 : 0;
        return { top: top, right: right };
      }

      function workshopVeilClear(veil) {
        if (!veil || !veil.style) return veil;
        var b = workshopVeilBox();
        veil.style.top = b.top + "px";
        veil.style.right = b.right + "px";
        veil.setAttribute("data-wf-veil-clear", "1");
        return veil;
      }

      // ---- Layers: DWC notices above the workshop panels ----
      //
      // Request 2026-10-10 ("the G1 message was seen behind everything, it was in
      // Zones"): DWC puts its notifications with `.v-snack{z-index:1 !important}`
      // (NotificationDisplay.vue), so they end up below the Zones map
      // (z-index 4-6), the floating jog and the sidebar (2147483646-7).
      // The notifications and the CONTENT of DWC's windows (M291,
      // confirmations) are raised. The dark background (.v-overlay) is NOT touched: if one
      // were left stuck and invisible (it has happened, see checkOrphanOverlays) it would cover
      // the taps of the whole screen.
      (function () {
        if (document.getElementById("workshop-layers-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-layers-css";
        // 3.6 (Vuetify 2): .v-snack and .v-dialog__content. 3.7 (Vuetify 4): a snackbar and a dialog are a .v-overlay carrying
        // .v-snackbar / .v-dialog (the scrim lives inside the dialog overlay and goes away with it).
        st.textContent = (workshopHostKind() === "37"
          ? [
              ".v-overlay.v-snackbar{z-index:2147483647 !important}",
              ".v-overlay.v-dialog.v-overlay--active{z-index:2147483647 !important}",
            ]
          : [
              ".v-snack{z-index:2147483647 !important}",
              ".v-dialog__content.v-dialog__content--active{z-index:2147483647 !important}",
            ]
        ).join("\n");
        (document.head || document.documentElement).appendChild(st);
      })();
