      // A tap that closes a floating panel must not "go through" to what is underneath. The panels hide on pointerup;
      // the browser then finishes the same tap (touchend, the compatibility mouse events and the click) on whatever is
      // under the finger. On the touch screen that is often the text field of a DWC page, which takes the focus and
      // brings up the on-screen keyboard. Calling this in the handler that hides the panel cancels the rest of that tap.
      var workshopTouchGhostUntil = 0;
      function workshopWithoutTouchGhost(ms) {
        workshopTouchGhostUntil = Date.now() + (ms || 600);
        if (workshopWithoutTouchGhost.put) return;
        workshopWithoutTouchGhost.put = true;
        ["touchend", "mousedown", "mouseup", "click"].forEach(function (kind) {
          window.addEventListener(
            kind,
            function (ev) {
              if (Date.now() > workshopTouchGhostUntil) return;
              if (ev.cancelable) ev.preventDefault();
              ev.stopPropagation();
              ev.stopImmediatePropagation();
            },
            { capture: true, passive: false }
          );
        });
      }
