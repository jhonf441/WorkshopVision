      // ---- Motor drivers of the object model as text ----
      // move.axes[].drivers / move.extruders[].driver come in two forms:
      //   - "0.5" / "5"            (/machine/status JSON of DSF, old fixtures)
      //   - { board: 0, driver: 5 } (DWC store model = workshopStateDwc())
      // String() of the second form gives "[object Object]" (Nivelar Z showed
      // "2 drivers [object Object], [object Object]"). Every page that reads
      // drivers from the model goes through these helpers: always "board.driver"
      // (missing board = 0), or "" when the entry is unusable.
      // Pure functions (no DOM) so tests/om-drivers.test.js can load them.
      function workshopDriverText(d) {
        if (d === null || d === undefined) return "";
        if (typeof d === "number") return isFinite(d) ? "0." + Math.round(d) : "";
        if (typeof d === "string") {
          var s = d.trim();
          var m = /^(\d+)\.(\d+)$/.exec(s);
          if (m) return +m[1] + "." + +m[2];
          return /^\d+$/.test(s) ? "0." + +s : s;
        }
        if (typeof d === "object") {
          var drv = Number(d.driver);
          if (!isFinite(drv)) return "";
          var b = d.board === null || d.board === undefined || d.board === "" ? 0 : Number(d.board);
          return (isFinite(b) ? b : 0) + "." + drv;
        }
        return "";
      }
      // Array (or missing) -> array of "board.driver" texts, unusable entries dropped.
      function workshopDriversText(items) {
        if (!Array.isArray(items)) return [];
        var out = [];
        for (var i = 0; i < items.length; i++) {
          var t = workshopDriverText(items[i]);
          if (t) out.push(t);
        }
        return out;
      }
