      // ---- A camera image that cannot load says why (2026-10-22; lifecycle rewritten 2026-10-26) ----
      //
      // <img> / <video> of the relay cannot carry the session headers, so without a session, without the camera permission or with the
      // camera off they fail and used to stay blank. On their error a message is laid over them (a fixed box that follows the element)
      // and, when the key arrives later (the person signed in), they are loaded again.
      //
      // 2026-10-26 (owner report, DWC 3.7 demo: "going to Timelapse and captures, Preview, then to another tab leaves a blank panel that says
      // The camera does not answer"): the box lives on <body>, outside the view that owns the image, and it used to be cleaned by a timer
      // that ran once per second for ever, so it outlived the view, lagged behind scrolling and stayed over an image that was hidden but not
      // removed. Now:
      //   - the owner of a view calls workshopCoverRelease(root) when the view is torn down (tab change, close, plugin stop): its boxes go at once;
      //   - an image that shows its own inline message carries data-own-error and never gets a box;
      //   - the timer only runs while there is a box (every 250 ms), and scrolling / resizing places the boxes at once;
      //   - a box is dropped when the image is gone or loaded, and hidden while it is not visible (display, visibility, opacity, any ancestor).

      var WORKSHOP_RELAY_URL = /^https?:\/\/[^/]+:(8090|8095)\//;
      var WORKSHOP_COVER_MS = 250;
      // One state for every Taller plugin on the page (this file is in all of them): { list: [{el, box}], timer, installed }
      var workshopCoverShared = (window.__workshopCover = window.__workshopCover || { list: [], timer: null, installed: false });

      // Pure: what to do with a box given the facts about its image. connected / loaded / visible are booleans, w and h the size of the image.
      function workshopCoverDecide(f) {
        if (!f.connected || f.loaded) return "drop";
        if (!f.visible || f.w < 60 || f.h < 30) return "hide";
        return "show";
      }

      // Pure: does the box of this image have to exist? (the owner shows its own message, or it is not a relay image)
      function workshopCoverWanted(url, ownError) {
        return !ownError && !!url && WORKSHOP_RELAY_URL.test(url);
      }

      // Pure: the boxes that survive a release of root (null = all). inside(el, root) says whether an image is inside the view.
      function workshopCoverKeep(list, root, inside) {
        return list.filter(function (c) {
          return root && !inside(c.el, root);
        });
      }

      function workshopCoverReason() {
        if (typeof workshopSignedOut === "function" && workshopSignedOut()) return i18nT("session.camera_sign_in");
        if (typeof workshopCan === "function" && !workshopCan("camera.token")) return i18nT("session.camera_role");
        return i18nT("session.camera_down");
      }

      function workshopCoverFacts(el) {
        var r = el.getBoundingClientRect();
        var visible = true;
        try {
          visible = typeof el.checkVisibility === "function"
            ? el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
            : window.getComputedStyle(el).display !== "none";
        } catch (e) {
          /* a detached or odd node: the connected check decides */
        }
        var loaded = el.tagName === "VIDEO" ? el.readyState >= 2 : !!(el.complete && el.naturalWidth > 0);
        return { connected: !!el.isConnected, loaded: loaded, visible: visible, w: r.width, h: r.height, rect: r };
      }

      function workshopCoverDrop(c) {
        if (c.box.parentNode) c.box.parentNode.removeChild(c.box);
      }

      function workshopCoverPlace(c) {
        var f = workshopCoverFacts(c.el);
        var what = workshopCoverDecide(f);
        if (what === "drop") return false;
        c.box.style.display = what === "hide" ? "none" : "flex";
        if (what === "hide") return true;
        c.box.style.left = f.rect.left + "px";
        c.box.style.top = f.rect.top + "px";
        c.box.style.width = f.rect.width + "px";
        c.box.style.height = f.rect.height + "px";
        var txt = workshopCoverReason();
        if (c.box.textContent !== txt) c.box.textContent = txt;
        return true;
      }

      // Re-places every box, drops the ones whose image is gone or loaded, stops the timer when none is left.
      function workshopCoverTick() {
        workshopCoverShared.list = workshopCoverShared.list.filter(function (c) {
          if (workshopCoverPlace(c)) return true;
          workshopCoverDrop(c);
          return false;
        });
        if (!workshopCoverShared.list.length && workshopCoverShared.timer) {
          clearInterval(workshopCoverShared.timer);
          workshopCoverShared.timer = null;
        }
      }

      function workshopCoverAdd(el) {
        if (workshopCoverShared.list.some(function (c) { return c.el === el; })) return;
        var box = document.createElement("div");
        box.setAttribute("data-tp-panel", "1");
        box.setAttribute("data-workshop-cover", "1");
        box.style.cssText =
          "position:fixed;z-index:2147483000;pointer-events:none;box-sizing:border-box;align-items:center;justify-content:center;text-align:center;padding:8px;" +
          "background:rgba(30,39,44,0.88);color:#eceff1;border-radius:4px;font:12px/1.4 Roboto,Helvetica,Arial,sans-serif;display:none;";
        document.body.appendChild(box);
        var c = { el: el, box: box };
        workshopCoverShared.list.push(c);
        if (!workshopCoverPlace(c)) {
          workshopCoverShared.list.pop();
          workshopCoverDrop(c);
          return;
        }
        if (!workshopCoverShared.timer) workshopCoverShared.timer = setInterval(workshopCoverTick, WORKSHOP_COVER_MS);
      }

      // The owner of a view tears it down: the boxes of the images inside root (or all of them without root) go now.
      function workshopCoverRelease(root) {
        var keep = workshopCoverKeep(workshopCoverShared.list, root || null, function (el, r) {
          return el === r || (typeof r.contains === "function" && r.contains(el));
        });
        workshopCoverShared.list.forEach(function (c) {
          if (keep.indexOf(c) < 0) workshopCoverDrop(c);
        });
        workshopCoverShared.list = keep;
        if (!workshopCoverShared.list.length && workshopCoverShared.timer) {
          clearInterval(workshopCoverShared.timer);
          workshopCoverShared.timer = null;
        }
      }

      function workshopCoverRetry() {
        workshopCoverShared.list.forEach(function (c) {
          if (c.el.tagName === "VIDEO") c.el.load();
          else c.el.src = c.el.src;
        });
      }

      // Installed once for the whole page (the first plugin that loads); it has no timer while there is no box, so it costs nothing at rest.
      (function () {
        if (workshopCoverShared.installed || typeof document === "undefined" || typeof document.addEventListener !== "function") return;
        workshopCoverShared.installed = true;
        document.addEventListener(
          "error",
          function (e) {
            var el = e.target;
            if (!el || (el.tagName !== "IMG" && el.tagName !== "VIDEO")) return;
            var u = el.currentSrc || el.src;
            if (workshopCoverWanted(u, el.hasAttribute && el.hasAttribute("data-own-error"))) workshopCoverAdd(el);
          },
          true
        );
        function onMove() {
          if (workshopCoverShared.list.length) workshopCoverTick();
        }
        window.addEventListener("scroll", onMove, true);
        window.addEventListener("resize", onMove);
      })();

