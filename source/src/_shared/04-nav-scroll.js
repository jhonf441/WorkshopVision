      // ---- Side bars of the JS pages (Vision, Work table, Cameras): choosing an item goes to the start of its section ----
      // From far down the page the new section opened out of sight. After the click (the page already painted its choice) the layout that
      // holds the bar and the content is brought under the DWC top bar when its start is above the view. The Vue pages do the same
      // inside SideTabs. Added once per page.

      (function workshopNavScrollStart() {
        if (typeof document === "undefined" || typeof document.addEventListener !== "function") return;
        if (window.__workshopNavScroll) return;
        window.__workshopNavScroll = true;
        document.addEventListener("click", function (e) {
          var item = e.target && typeof e.target.closest === "function" ? e.target.closest(".wf-nav-item") : null;
          if (!item) return;
          var nav = item.closest(".wf-nav");
          var layout = nav ? nav.parentElement : null;
          if (!layout) return;
          setTimeout(function () {
            if (layout.isConnected === false || typeof layout.scrollIntoView !== "function") return;
            if (layout.getBoundingClientRect().top >= 0) return;
            layout.style.scrollMarginTop = "72px";
            layout.scrollIntoView({ block: "start" });
          }, 60);
        });
      })();
