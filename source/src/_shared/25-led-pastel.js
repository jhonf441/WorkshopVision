      // Pie of an LED state, shared so any plugin can draw it without depending on the first-loaded ledState copy.
      // fxAnimar = ledState.fx (animates an SVG element with the effect of its state).
      // The dot of the badge is a pie of the state as the zone shows it (Lights > "When several are active"):
      // priority = the first state, split = one slice per state (the first ones bigger, the mode colour last),
      // turns = one state at a time, changing every turn_s. Each one keeps the effect defined for its state.
      function workshopLedPastel(i, size, p, fxAnimate) {
        var NS = "http://www.w3.org/2000/svg";
        var items = i.activeList.map(function (a) {
          return { hex: a.hex, fx: a.effect };
        });
        if (!items.length) items = [{ hex: i.hex, fx: i.effect }];
        var mode = i.combine === "split" || i.combine === "turns" ? i.combine : "priority";
        var own = i.activeList.length > 0 && ["stop", "crash", "risk", "jog_free", "lighting"].indexOf(i.id) < 0;
        if (mode === "priority" || !own) items = items.slice(0, 1);
        else items.push({ hex: i.baseHex || "#455a64", fx: "steady" });
        var svg = document.createElementNS(NS, "svg");
        svg.setAttribute("viewBox", "-1 -1 2 2");
        svg.setAttribute("width", size);
        svg.setAttribute("height", size);
        svg.style.cssText = "flex:none;overflow:visible;filter:drop-shadow(0 0 2px " + items[0].hex + ");";
        function point(grados) {
          var r = ((grados - 90) * Math.PI) / 180;
          return [Math.cos(r).toFixed(4), Math.sin(r).toFixed(4)];
        }
        function piece(a0, a1, it) {
          var e;
          if (a1 - a0 >= 359.9) {
            e = document.createElementNS(NS, "circle");
            e.setAttribute("r", "1");
          } else {
            var p0 = point(a0), p1 = point(a1);
            e = document.createElementNS(NS, "path");
            e.setAttribute("d", "M0 0 L" + p0[0] + " " + p0[1] + " A1 1 0 " + (a1 - a0 > 180 ? 1 : 0) + " 1 " + p1[0] + " " + p1[1] + " Z");
          }
          e.setAttribute("fill", it.hex);
          fxAnimate(e, it.fx, 1, 0.1);
          svg.appendChild(e);
          return e;
        }
        if (mode === "split" && items.length > 1) {
          var k = items.length;
          var weights = items.map(function (_, j) {
            return j < k - 1 ? k - j : 1;
          });
          var total = weights.reduce(function (a, b) { return a + b; }, 0);
          var ang = 0;
          items.forEach(function (it, j) {
            var end = ang + (360 * weights[j]) / total;
            piece(ang, end, it);
            ang = end;
          });
        } else {
          var one = piece(0, 360, items[0]);
          if (mode === "turns" && items.length > 1 && p) {
            var n = 0;
            p._tm = setInterval(function () {
              n = (n + 1) % items.length;
              one.setAttribute("fill", items[n].hex);
              fxAnimate(one, items[n].fx, 1, 0.1);
            }, Math.max(500, (i.turnS || 1.5) * 1000));
          }
        }
        return svg;
      }
