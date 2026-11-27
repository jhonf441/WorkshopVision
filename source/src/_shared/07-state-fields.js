      // ---- "Shown ON when": the object model path and the value that means ON, for the buttons of the bar and of the jog (lote 6, 22-nov-2026) ----
      // A path that does not exist in the live object model, or a value that can never match, makes a button that never lights up and says nothing.
      // The fields check both against the model that is live now, suggest the next names while typing, show what the path is worth now and whether the
      // button would show ON, and carry ONE fold of help that says what it takes (a path, not a name) and what values it accepts.
      //   workshopOmCheck(model, path)             -> { state: "empty" | "nomodel" | "missing" | "branch" | "ok", value }
      //   workshopOmValueCheck(model, path, text)  -> "" or "empty" | "bool" | "number" (the typed value can never match what the path holds)
      //   workshopOmChildren(model, text)          -> up to 40 paths that continue what was typed
      //   workshopOmMatches(value, wanted)         -> true when the button would show ON (the same text comparison the buttons use)
      //   workshopStateFieldsEl(opts)              -> { el, pathInput, valueInput, refresh }

      var WORKSHOP_OM_LIMIT = 40;

      function workshopOmNormalize(path) {
        return String(path || "").trim().replace(/\[(\d+)\]/g, ".$1");
      }

      function workshopOmGet(model, path) {
        var p = workshopOmNormalize(path);
        return p ? workshopReadPath(model, p) : model;
      }

      function workshopOmIsBranch(v) {
        return v !== null && typeof v === "object";
      }

      function workshopOmCheck(model, path) {
        var p = workshopOmNormalize(path);
        if (!p) return { state: "empty", value: undefined };
        if (!model) return { state: "nomodel", value: undefined };
        var v = workshopOmGet(model, p);
        if (v === undefined) return { state: "missing", value: undefined };
        if (workshopOmIsBranch(v)) return { state: "branch", value: undefined };
        return { state: "ok", value: v };
      }

      // What the typed value can never be for the value the path holds now: a true/false path takes true or false; a number path takes a number.
      function workshopOmValueCheck(model, path, text) {
        var t = String(text === undefined || text === null ? "" : text).trim();
        if (!t) return "empty";
        var c = workshopOmCheck(model, path);
        if (c.state !== "ok") return "";
        if (typeof c.value === "boolean" && t !== "true" && t !== "false") return "bool";
        if (typeof c.value === "number" && (t === "" || isNaN(Number(t)))) return "number";
        return "";
      }

      function workshopOmMatches(value, wanted) {
        if (value === undefined || value === null) return false;
        return String(value) === String(wanted);
      }

      function workshopOmKeys(v) {
        if (!workshopOmIsBranch(v)) return [];
        if (typeof Map !== "undefined" && v instanceof Map) return Array.from(v.keys()).map(String);
        if (Array.isArray(v)) return v.map(function (_, i) { return String(i); });
        return Object.keys(v);
      }

      // The paths that continue `text`: after a dot the names inside that branch that start with what follows; after name[ the indexes of that list.
      function workshopOmChildren(model, text) {
        if (!model) return [];
        var t = String(text || "");
        var dot = t.lastIndexOf(".");
        var parent = dot >= 0 ? t.slice(0, dot) : "";
        var part = dot >= 0 ? t.slice(dot + 1) : t;
        var open = /^([^\[\]]*)\[(\d*)$/.exec(part);
        var out = [];
        if (open) {
          var listPath = (parent ? parent + "." : "") + open[1];
          workshopOmKeys(workshopOmGet(model, listPath)).forEach(function (k) {
            if (/^\d+$/.test(k) && k.indexOf(open[2]) === 0) out.push(listPath + "[" + k + "]");
          });
          return out.slice(0, WORKSHOP_OM_LIMIT);
        }
        var branch = parent ? workshopOmGet(model, parent) : model;
        var keys = workshopOmKeys(branch).sort();
        var lower = part.toLowerCase();
        for (var i = 0; i < keys.length && out.length < WORKSHOP_OM_LIMIT; i++) {
          if (keys[i].toLowerCase().indexOf(lower) !== 0) continue;
          var child = Array.isArray(branch) ? parent + "[" + keys[i] + "]" : (parent ? parent + "." : "") + keys[i];
          out.push(child);
        }
        return out;
      }

      var workshopStateFieldsSeq = 0;

      function workshopStateNote(css, t) {
        var d = document.createElement("div");
        d.style.cssText = css;
        if (t) d.textContent = t;
        return d;
      }

      // The DOM of the fields: the fold, the path with its suggestions, the value, the Test row. Returns the pieces the wiring needs.
      function workshopStateFieldsDom(opts) {
        var id = "wf-om-" + ++workshopStateFieldsSeq;
        var box = workshopStateNote("display:flex;flex-direction:column;gap:6px;width:100%;");
        box.className = "wf-om-fields";
        var label = function (t) {
          return workshopStateNote("font-size:12px;color:#b0bec5;line-height:1.3;", t);
        };
        box.appendChild(workshopHelpFoldEl({
          title: i18nT('omstate.help_title'),
          rows: [[i18nT('omstate.help_path_label'), i18nT('omstate.help_path')], [i18nT('omstate.help_value_label'), i18nT('omstate.help_value')], [i18nT('omstate.help_test_label'), i18nT('omstate.help_test')]],
        }));
        box.appendChild(label(i18nT('omstate.path_label')));
        var pathInput = workshopInputEl("input", opts.css || "width:100%;");
        pathInput.type = "text";
        pathInput.maxLength = 120;
        pathInput.placeholder = i18nT('omstate.path_ph');
        pathInput.value = opts.path || "";
        pathInput.setAttribute("list", id);
        pathInput.setAttribute("autocomplete", "off");
        pathInput.setAttribute("spellcheck", "false");
        var datalist = document.createElement("datalist");
        datalist.id = id;
        var pathNote = workshopStateNote("font-size:12px;line-height:1.3;min-height:2.7em;color:#ffab91;");
        box.appendChild(pathInput);
        box.appendChild(datalist);
        box.appendChild(pathNote);
        box.appendChild(label(i18nT('omstate.value_label')));
        var valueInput = workshopInputEl("input", opts.css || "width:100%;");
        valueInput.type = "text";
        valueInput.maxLength = 80;
        valueInput.placeholder = i18nT('omstate.value_ph');
        valueInput.value = opts.value === undefined || opts.value === null ? "" : String(opts.value);
        var valueNote = workshopStateNote("font-size:12px;line-height:1.3;min-height:1.4em;color:#ffab91;");
        box.appendChild(valueInput);
        box.appendChild(valueNote);
        var testRow = workshopStateNote("display:flex;align-items:center;gap:8px;flex-wrap:wrap;");
        var testBtn = document.createElement("button");
        testBtn.type = "button";
        testBtn.className = "wf-btn";
        testBtn.textContent = i18nT('omstate.test');
        testBtn.style.cssText = "flex:none;min-height:var(--wf-size-s, 32px);padding:0 12px;";
        testBtn.className = (testBtn.className ? testBtn.className + " " : "") + "wf-hit"; // touched 40 (the scale)
        var testOut = workshopStateNote("flex:1 1 140px;min-width:0;font-size:12px;line-height:1.3;color:#80cbc4;min-height:2.7em;");
        testRow.appendChild(testBtn);
        testRow.appendChild(testOut);
        box.appendChild(testRow);
        return { box: box, pathInput: pathInput, valueInput: valueInput, datalist: datalist, pathNote: pathNote, valueNote: valueNote, testBtn: testBtn, testOut: testOut };
      }

      // What the fields say about the model now: the path note, the value note and the Test line.
      function workshopStateFieldsPaint(d, m) {
        var c = workshopOmCheck(m, d.pathInput.value);
        var shown = "";
        if (c.state === "missing") shown = i18nT('omstate.path_missing');
        else if (c.state === "branch") shown = i18nT('omstate.path_branch');
        else if (c.state === "nomodel" && d.pathInput.value.trim()) shown = i18nT('omstate.no_model');
        d.pathNote.textContent = shown;
        var vc = d.pathInput.value.trim() ? workshopOmValueCheck(m, d.pathInput.value, d.valueInput.value) : "";
        d.valueNote.textContent = vc ? i18nT('omstate.value_' + vc) : "";
        if (c.state !== "ok") {
          d.testOut.textContent = "";
          return;
        }
        var wanted = d.valueInput.value.trim();
        d.testOut.textContent = i18nT('omstate.now', { v: String(c.value) }) + (wanted ? " - " + (workshopOmMatches(c.value, wanted) ? i18nT('omstate.would_be_on') : i18nT('omstate.would_be_off')) : "");
      }

      // opts: { path, value (the saved ones), getModel() -> the live object model, css (extra style of the inputs), onInput() }
      // The two <input> keep working like plain inputs: the page reads .value from them to save.
      function workshopStateFieldsEl(opts) {
        opts = opts || {};
        var d = workshopStateFieldsDom(opts);
        var model = function () {
          return typeof opts.getModel === "function" ? opts.getModel() : null;
        };
        function refresh() {
          workshopStateFieldsPaint(d, model());
        }
        function suggest() {
          d.datalist.innerHTML = "";
          workshopOmChildren(model(), d.pathInput.value).forEach(function (p) {
            var op = document.createElement("option");
            op.value = p;
            d.datalist.appendChild(op);
          });
        }
        d.pathInput.addEventListener("input", function () {
          suggest();
          refresh();
          if (typeof opts.onInput === "function") opts.onInput();
        });
        d.pathInput.addEventListener("focus", suggest);
        d.valueInput.addEventListener("input", function () {
          refresh();
          if (typeof opts.onInput === "function") opts.onInput();
        });
        d.testBtn.addEventListener("click", refresh);
        var idle = 0;
        var timer = setInterval(function () {
          if (!d.box.isConnected) {
            if (d.box._wasConnected || ++idle > 20) clearInterval(timer); // gone from the page, or never put in it
            return;
          }
          d.box._wasConnected = true;
          refresh();
        }, 1500);
        refresh();
        return { el: d.box, pathInput: d.pathInput, valueInput: d.valueInput, refresh: refresh };
      }
