      // ---- Light theme of the floating panels (2026-10-10) ----
      // Request: "what happened with the sidebar's light color". The bar,
      // the jog, the camera viewer and its sheets were written for a dark
      // background, with hundreds of inline colors that also change live
      // (states, armed buttons). Instead of rewriting each one, with DWC's
      // light theme this module reads the REAL color of each element of
      // those panels and moves it to the light palette of DESIGN.md:
      //   - dark gray backgrounds -> white / #f5f7f8 / neutral button #eceff1
      //   - dark backgrounds with a hue (brown, dark red) -> the same very light hue
      //   - color fills (blue, green, orange, red of the buttons) do not change
      //   - light text -> dark, only if the background behind it ended up light
      //     (the white text of a blue button stays white); pastel accents
      //     (amber, green, red, blue) go to their dark version of the same hue
      //   - borders and translucent white veils -> translucent black
      // The original is saved and returns as is with the dark theme. A
      // MutationObserver repeats the step when the code changes a color.
      // Panels: children of <body> with id emergency-fab-* / workshop-* or with
      // data-tp-panel. This file goes in all the plugins: it is installed once.
      (function () {
        if (window.__tpTheme) return;
        var api = (window.__tpTheme = { version: 1 });
        var white = { r: 255, g: 255, b: 255, a: 1 };

        function esClaro() {
          var app = document.querySelector(".v-application");
          return !!(app && app.classList.contains(workshopHostThemeLightClass()));
        }
        function parse(s) {
          var m = /rgba?\(([^)]+)\)/.exec(s || "");
          if (!m) return null;
          var p = m[1].split(",").map(function (x) { return parseFloat(x); });
          return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
        }
        function css(c) {
          var r = Math.round(c.r), g = Math.round(c.g), b = Math.round(c.b);
          return c.a < 1 ? "rgba(" + r + "," + g + "," + b + "," + +c.a.toFixed(3) + ")" : "rgb(" + r + "," + g + "," + b + ")";
        }
        function hsl(c) {
          var r = c.r / 255, g = c.g / 255, b = c.b / 255;
          var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
          if (mx !== mn) {
            var d = mx - mn;
            s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
            h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
            h *= 60;
          }
          return { h: h, s: s, l: l };
        }
        function desdeHsl(h, s, l, a) {
          function f(n) {
            var k = (n + h / 30) % 12, q = s * Math.min(l, 1 - l);
            return 255 * (l - q * Math.max(-1, Math.min(k - 3, 9 - k, 1)));
          }
          return { r: f(0), g: f(8), b: f(4), a: a };
        }
        function lum(c) {
          return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
        }
        function hex(h) {
          return { r: parseInt(h.substr(1, 2), 16), g: parseInt(h.substr(3, 2), 16), b: parseInt(h.substr(5, 2), 16), a: 1 };
        }
        // mixes a color over another opaque one (to know the real background)
        function over(c, base) {
          var a = c.a;
          return { r: c.r * a + base.r * (1 - a), g: c.g * a + base.g * (1 - a), b: c.b * a + base.b * (1 - a), a: 1 };
        }

        // Background: returns the new colour, or null if it stays the same.
        function background(c) {
          if (c.a === 0) return null;
          var t = hsl(c), blanco = c.r > 200 && c.g > 200 && c.b > 200, negro = c.r < 40 && c.g < 40 && c.b < 40;
          if (c.a < 1) {
            if (blanco) return { r: 0, g: 0, b: 0, a: Math.min(0.12, c.a * 0.7) }; // velo blanco -> velo gris
            if (negro) return c.a >= 0.45 ? null : { r: 0, g: 0, b: 0, a: c.a * 0.2 }; // fondo de modal / rotulo sobre video: igual
            if (t.l < 0.3) return { r: 245, g: 247, b: 248, a: c.a }; // velo oscuro de color
            return null;
          }
          if (t.l >= 0.45) return null; // ya claro o color medio
          if (t.s < 0.3) {
            if (t.l < 0.16) return hex("#ffffff"); // panel (#1e272c, #121212)
            if (t.l < 0.24) return hex("#f5f7f8"); // tarjeta interior (#263238, #1b2327)
            return hex("#eceff1"); // boton / chip neutro (#37474f, #455a64, #424242)
          }
          if (t.l < 0.25 || (t.s < 0.45 && t.l < 0.4)) {
            // dark with a hue (armed brown, dark red): the same very light hue
            return desdeHsl(t.h, Math.min(0.6, t.s + 0.2), 0.92, 1);
          }
          return null; // relleno de color (azul, verde, naranja, rojo): igual
        }

        // Text on a light background: dark version of the same hue.
        function text(c) {
          if (lum(c) < 0.5) return null;
          var t = hsl(c);
          if (t.s < 0.25 || c.a < 1) {
            var a = c.a < 1 ? c.a : t.l > 0.85 ? 1 : 0.65;
            if (a >= 0.8) return hex("#212121");
            if (a >= 0.55) return hex("#616161");
            return { r: 0, g: 0, b: 0, a: 0.5 };
          }
          // yellows and lime greens need more darkness to be read
          var l = t.h >= 40 && t.h <= 100 ? 0.28 : 0.36;
          return desdeHsl(t.h, Math.max(0.6, Math.min(t.s, 0.9)), l, 1);
        }

        function edge(c) {
          if (c.a === 0) return null;
          var t = hsl(c);
          if (c.r > 200 && c.g > 200 && c.b > 200) return { r: 0, g: 0, b: 0, a: Math.max(0.1, Math.min(0.3, c.a * 0.7)) };
          if (t.s < 0.3 && t.l < 0.45) return hex("#cfd8dc");
          if (t.s >= 0.3 && lum(c) > 0.6) return text(c); // borde pastel de acento
          return null;
        }

        // --- estilo original guardado ---
        function readDecl(s) {
          var d = document.createElement("div");
          d.setAttribute("style", s || "");
          var o = {};
          for (var i = 0; i < d.style.length; i++) {
            var k = d.style[i];
            o[k] = [d.style.getPropertyValue(k), d.style.getPropertyPriority(k)];
          }
          return o;
        }
        function writeDecl(o) {
          return Object.keys(o)
            .map(function (k) { return k + ":" + o[k][0] + (o[k][1] ? " !" + o[k][1] : ""); })
            .join(";");
        }
        // The panel's code changed the style after we moved it to
        // light: only what the code changed is carried to the saved original.
        function updateOriginal(el) {
          var current = el.getAttribute("style");
          if (el.__tpOut === undefined) {
            el.__tpOrig = current;
            return;
          }
          if (current === el.__tpOut) return;
          var before = readDecl(el.__tpOut), now = readDecl(current), orig = readDecl(el.__tpOrig);
          Object.keys(now).forEach(function (k) {
            if (!before[k] || before[k][0] !== now[k][0] || before[k][1] !== now[k][1]) orig[k] = now[k];
          });
          Object.keys(before).forEach(function (k) {
            if (!now[k]) delete orig[k];
          });
          el.__tpOrig = writeDecl(orig);
        }
        function restore(el) {
          if (el.__tpOut === undefined) return;
          if (el.__tpOrig == null) el.removeAttribute("style");
          else el.setAttribute("style", el.__tpOrig);
          el.__tpOut = undefined;
        }

        // effective (opaque) background behind the element
        function backgroundOf(el) {
          var p = el.parentElement;
          while (p && p !== document.body) {
            if (p.__tpEff) return p.__tpEff;
            p = p.parentElement;
          }
          return white;
        }

        function pass(el) {
          updateOriginal(el);
          // leer los colores originales
          if (el.__tpOut !== undefined) {
            if (el.__tpOrig == null) el.removeAttribute("style");
            else el.setAttribute("style", el.__tpOrig);
          }
          var cs = getComputedStyle(el);
          var base = backgroundOf(el);
          var nuevo = {};
          var bg = parse(cs.backgroundColor), eff = base;
          if (bg && bg.a > 0) {
            var nb = background(bg);
            if (nb) nuevo["background-color"] = css(nb);
            eff = over(nb || bg, base);
          }
          // gradients (joystick background): each dark color by its light version
          var bi = cs.backgroundImage;
          if (bi && bi.indexOf("gradient") !== -1) {
            var change = false;
            var bi2 = bi.replace(/rgba?\([^)]+\)/g, function (s) {
              var c = parse(s), n = c && background(c);
              if (!n) return s;
              change = true;
              return css(n);
            });
            if (change) {
              nuevo["background-image"] = bi2;
              if (!bg || bg.a === 0) eff = hex("#eceff1");
            }
          }
          el.__tpEff = eff;
          var tx = parse(cs.color);
          if (lum(eff) > 0.6) {
            var nt = tx && text(tx);
            if (nt) nuevo.color = css(nt);
          } else if (tx && lum(eff) < 0.45 && lum(over(tx, eff)) < 0.35) {
            // color button that inherited the panel's white text (which already
            // went dark): it goes back to white
            nuevo.color = "#ffffff";
          }
          ["top", "right", "bottom", "left"].forEach(function (s) {
            if (!parseFloat(cs["border-" + s + "-width"])) return;
            var bc = parse(cs["border-" + s + "-color"]), nbc = bc && edge(bc);
            if (nbc) nuevo["border-" + s + "-color"] = css(nbc);
          });
          // shadows designed for a dark background: softer ones
          if (cs.boxShadow && cs.boxShadow !== "none" && /rgba\(0, 0, 0, 0\.[5-9]/.test(cs.boxShadow)) nuevo["box-shadow"] = "0 4px 14px rgba(0,0,0,0.18)";
          var claves = Object.keys(nuevo);
          if (!claves.length) {
            el.__tpOut = el.getAttribute("style");
            return;
          }
          claves.forEach(function (k) { el.style.setProperty(k, nuevo[k], "important"); });
          el.__tpOut = el.getAttribute("style");
        }

        function arbol(root, fn) {
          fn(root);
          var all = root.getElementsByTagName("*");
          for (var i = 0; i < all.length; i++) fn(all[i]);
        }
        function esPanel(el) {
          if (!el || el.nodeType !== 1 || el.parentElement !== document.body) return false;
          if (/^(STYLE|SCRIPT|LINK)$/.test(el.tagName)) return false;
          return /^(emergency-fab|workshop-)/.test(el.id || "") || el.hasAttribute("data-tp-panel");
        }
        function paneles() {
          return Array.prototype.filter.call(document.body.children, esPanel);
        }

        var claro = false;
        var pending = [];
        var scheduled = false;
        var obs = typeof MutationObserver === "function" ? new MutationObserver(alChange) : null;

        function watch(p) {
          if (!obs || p.__tpWatched) return;
          p.__tpWatched = true;
          obs.observe(p, { subtree: true, childList: true, attributes: true, attributeFilter: ["style", "class"] });
        }
        function alChange(muts) {
          if (!claro) return;
          muts.forEach(function (m) {
            if (m.type === "attributes") {
              var el = m.target;
              if (m.attributeName === "style" && el.getAttribute("style") === el.__tpOut) return;
              pending.push(el);
            } else {
              m.addedNodes.forEach(function (n) { if (n.nodeType === 1) pending.push(n); });
            }
          });
          if (pending.length && !scheduled) {
            scheduled = true;
            (window.requestAnimationFrame || setTimeout)(processPending);
          }
        }
        function processPending() {
          scheduled = false;
          var items = pending;
          pending = [];
          if (!claro) return;
          items = items.filter(function (el, i) {
            if (!el.isConnected || items.indexOf(el) !== i) return false;
            // if an ancestor also changed, it is already passed with it
            return !items.some(function (o) { return o !== el && o.contains(el); });
          });
          items.forEach(function (el) { arbol(el, pass); });
        }

        function apply() {
          var now = esClaro();
          if (now === claro && !now) return;
          claro = now;
          document.documentElement.classList.toggle("tp-bright", claro);
          paneles().forEach(function (p) {
            watch(p);
            arbol(p, claro ? pass : restore);
          });
        }
        api.applyChanges = apply;

        function start() {
          var app = document.querySelector(".v-application");
          if (!app || !document.body) {
            setTimeout(start, 1000);
            return;
          }
          apply();
          if (!obs) return;
          new MutationObserver(function () {
            if (esClaro() !== claro) apply();
          }).observe(app, { attributes: true, attributeFilter: ["class"] });
          // panels that appear later (each plugin creates its own on load)
          new MutationObserver(function (muts) {
            muts.forEach(function (m) {
              m.addedNodes.forEach(function (n) {
                if (!esPanel(n)) return;
                watch(n);
                if (claro) arbol(n, pass);
              });
            });
          }).observe(document.body, { childList: true });
        }
        if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
        else start();
      })();
