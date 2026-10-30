      // ---- Scrollbars (2026-10-22): as thin as possible everywhere, hidden on touch screens ----
      // The default bars of the browser are wide and ugly (the Jog panel, the side bar, the lists...). One rule for the whole page:
      // 4 px, a pale thumb on a transparent track. With a finger (pointer: coarse, the kiosk) there is no bar: the content scrolls by
      // dragging and a bar there only takes space. An element that sets its own scrollbar-width keeps it. Added once per page.

      (function workshopScrollbarsStart() {
        if (typeof document === "undefined" || !document.head || typeof document.getElementById !== "function") return;
        if (document.getElementById("workshop-scrollbars-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-scrollbars-css";
        st.textContent =
          "*::-webkit-scrollbar{width:4px;height:4px;background:transparent}" +
          "*::-webkit-scrollbar-track,*::-webkit-scrollbar-corner{background:transparent}" +
          "*::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.22);border-radius:2px}" +
          workshopCss(".theme--light *::-webkit-scrollbar-thumb{background:rgba(0,0,0,0.28)}") +
          "@media (pointer:coarse){*::-webkit-scrollbar{display:none}}";
        document.head.appendChild(st);
      })();
