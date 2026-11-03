      // ---- Side bars of the JS pages (Vision, Work table, Cameras): choosing an item goes to the start of its section ----
      // From far down the page the new section opened out of sight. After the click (the page already painted its choice) the layout that
      // holds the bar and the content is brought under the DWC top bar when its start is above the view. The Vue pages do the same
      // inside SideTabs. Added once per page.

      (function workshopNavScrollStart() {
        if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
        // one listener for all the plugins of the page; it goes when the last of them stops (workshopSharedUse, 30-lifecycle.js)
        workshopSharedUse("nav-scroll-2", function () {
          function onClick(e) {
            var item = e.target && typeof e.target.closest === "function" ? e.target.closest(".wf-nav-item") : null;
            if (!item) return;
            var nav = item.closest(".wf-nav");
            if (!nav) return;
            // a page that draws itself again inside its own click handler (the Cameras page) has already thrown the bar away when this listener runs:
            // it has no parent any more, so the layout is looked up again from the new bar below
            var layout = nav.parentElement;
            function go() {
              // a page that draws itself again when the section changes (the Cameras page) has thrown the layout away: the bar of the new drawing is looked up again
              if (!layout || layout.isConnected === false) {
                var again = typeof document.querySelector === "function" ? document.querySelector(".wf-nav") : null;
                layout = again ? again.parentElement : null;
              }
              if (!layout || layout.isConnected === false || typeof layout.scrollIntoView !== "function") return;
              if (layout.getBoundingClientRect().top >= 0) return;
              layout.style.scrollMarginTop = "72px";
              layout.scrollIntoView({ block: "start" });
            }
            // Twice: a page that reads from the machine before it draws the section (the Cameras page) puts the old scroll back when it paints,
            // so the first move is undone; the second one comes after that drawing.
            setTimeout(go, 60);
            setTimeout(go, 600);
          }
          document.addEventListener("click", onClick);
          return function () {
            document.removeEventListener("click", onClick);
          };
        });
      })();
