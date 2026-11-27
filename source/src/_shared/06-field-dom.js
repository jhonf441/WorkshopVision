      // ---- The native field (input, select, textarea) of the JS pages: ONE look, the one of a dense outlined Vuetify field ----
      //   workshopInputEl(tag, css)  ->  a <input> / <select> / <textarea> with class wf-input; css = the extras of the page (width, colors of its own panel)
      // 44 px high, 4 px radius, 1 px control line (--wf-control-line, 3:1), a hover that only changes the color of the line (--wf-hover-line) and a focus ring that
      // follows the radius. A page never writes the size, border or radius of a field again (the pages had 24 to 44 px fields with 4 px or no radius).
      // The tokens come from design/family.css (workshopInjectFamily() puts them in once per page); the rules are here because they are for the JS pages only
      // (the service page keeps its CSS under a weight cap and has its own fields).

      var WORKSHOP_FIELD_CSS = [
        ".wf-input { box-sizing: border-box; min-height: var(--wf-field-h, 40px); padding: 0 10px; border: 1px solid var(--wf-control-line); border-radius: var(--wf-radius-control, 6px); background: transparent; color: inherit; font: inherit; }",
        "textarea.wf-input { padding: 8px 10px; }",
        ".wf-input:focus-visible { outline: 2px solid var(--wf-focus); outline-offset: 2px; }",
        "@media (hover: hover) { .wf-input:not(:focus-visible, :disabled):hover { border-color: var(--wf-hover-line); } }",
      ].join("\n");

      // ---- The arrow of a native select. DWC's own reset (Vuetify: select { appearance: none }) takes the browser's arrow away from EVERY native select of the page: a list
      // with no arrow does not look like a list. This one rule draws it again, always at the right edge (a down triangle in the text color, so it is also seen on the dark panels),
      // with room for it (padding-right) and the text cut by an ellipsis before it. It is !important because the pages write `background:#1e272c` inline, which
      // (as a shorthand) wipes any background image. Vuetify's own v-select is left alone (it draws its own arrow). Injected once, when this file loads.
      var WORKSHOP_SELECT_CSS = [
        "select:not([multiple]):not([size]):not(.v-input *) {",
        "  padding-right: 32px; text-overflow: ellipsis; white-space: nowrap;",
        // the browser's own arrow off: only the drawn one stays (owner 2026-11-23: two arrows on a page without Vuetify's reset)
        "  appearance: none; -webkit-appearance: none; -moz-appearance: none;",
        "  background-image: linear-gradient(45deg, transparent 50%, currentColor 50%), linear-gradient(135deg, currentColor 50%, transparent 50%) !important;",
        "  background-position: calc(100% - 17px) 50%, calc(100% - 12px) 50% !important;",
        "  background-size: 5px 5px, 5px 5px !important;",
        "  background-repeat: no-repeat !important;",
        "}",
      ].join("\n");

      function workshopEnsureSelectCss() {
        if (typeof document === "undefined" || !document || !document.head || typeof document.getElementById !== "function" || typeof document.createElement !== "function") return;
        if (document.getElementById("workshop-select-css")) return;
        var st = document.createElement("style");
        st.id = "workshop-select-css";
        st.textContent = typeof workshopCss === "function" ? workshopCss(WORKSHOP_SELECT_CSS) : WORKSHOP_SELECT_CSS;
        document.head.appendChild(st);
      }

      function workshopInputEl(tag, css) {
        workshopEnsureSelectCss();
        if (typeof workshopInjectFamily === "function") workshopInjectFamily();
        if (typeof document.getElementById === "function" && !document.getElementById("workshop-field-css")) {
          var st = document.createElement("style");
          st.id = "workshop-field-css";
          st.textContent = workshopCss(WORKSHOP_FIELD_CSS);
          document.head.appendChild(st);
        }
        var e = document.createElement(tag);
        e.className = "wf-input";
        if (css) e.style.cssText = css;
        return e;
      }

      workshopEnsureSelectCss();
