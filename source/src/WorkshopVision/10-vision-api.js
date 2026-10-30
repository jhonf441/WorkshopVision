      // What the page (20-main.js) calls on the Vision page.
      function tvVisionApi(tv) {
        return {
          destroy: function () {
            tv.alive = false;
            tv.live = false;
            clearTimeout(tv.liveTimer);
            clearTimeout(tv.crosses.timer);
            if (tv.offIdentity) tv.offIdentity();
            tv.timers.forEach(clearInterval);
            window.removeEventListener("keydown", tzBind(tvOnKey, tv));
            document.removeEventListener("fullscreenchange", tzBind(tvOnFs, tv));
            document.removeEventListener("pointerdown", tzBind(tvPopOutside, tv), true);
            if (tv.dockRO) tv.dockRO.disconnect();
            window.removeEventListener("resize", tzBind(tvOnResize, tv));
            if (tv.stageRO) tv.stageRO.disconnect();
            if (tvInFull(tv)) tvExitFull(tv);
            if (tv.objUrl) URL.revokeObjectURL(tv.objUrl);
          },
        };
      }
