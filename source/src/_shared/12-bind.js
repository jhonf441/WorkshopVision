      // Binds the state object(s) of a module to one of its functions: tzBind(tcUndo, tc) is the function to hand over as a callback
      // (a click handler, a field of the module API); tzBind(f, a, b) binds two (e.g. the state of a part and a module's own). The arguments
      // the caller passes follow the bound state objects.
      // The SAME function comes back for the same function and the same state objects, so a listener added with tzBind(f, s) is removed with
      // tzBind(f, s) (removeEventListener compares function identity), and `a === tzBind(f, s)` holds.
      function tzBind(fn) {
        var fijos = [];
        for (var i = 1; i < arguments.length; i++) fijos.push(arguments[i]);
        var key = fijos[0];
        if (!key || typeof key !== "object" || typeof WeakMap === "undefined") return tzBindCreate(fn, fijos);
        var table = fn.__tzLinked || (fn.__tzLinked = new WeakMap());
        var items = table.get(key);
        if (!items) table.set(key, (items = []));
        for (var k = 0; k < items.length; k++) {
          var others = items[k].fixed;
          var equal = others.length === fijos.length;
          for (var j = 0; equal && j < fijos.length; j++) if (others[j] !== fijos[j]) equal = false;
          if (equal) return items[k].f;
        }
        var f = tzBindCreate(fn, fijos);
        items.push({ fixed: fijos, f: f });
        return f;
      }
      function tzBindCreate(fn, fijos) {
        return function () {
          var args = fijos.slice();
          for (var j = 0; j < arguments.length; j++) args.push(arguments[j]);
          return fn.apply(null, args);
        };
      }
