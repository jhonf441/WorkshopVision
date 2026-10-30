      // ---- Screen colors (2026-10-10, DESIGN.md section 2) ----
      // Request: "the mode colors look too loud". Lights saves LED colors
      // (pure: #0000ff, #00ff00, #8c00ff) and the buttons copied them
      // as they were. On screen the SCREEN VERSION of the same hue is used:
      // same hue, fixed saturation and lightness, so all the buttons weigh
      // the same and the mode is still recognized by its color.
      //   use "relleno": button/chip background with white text (S <= 62 %, L 42 %)
      //   use "texto":   text or border on a dark background (S <= 70 %, L 72 %)
      //   use "claro":   text or border on a light background (S <= 65 %, L 34 %)
      // Grays (no hue) stay as they are. What is not #rrggbb comes back the same.
      function workshopHexHsl(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
        if (!m) return null;
        var r = parseInt(m[1], 16) / 255, g = parseInt(m[2], 16) / 255, b = parseInt(m[3], 16) / 255;
        var mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, h = 0, s = 0;
        if (mx !== mn) {
          var d = mx - mn;
          s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
          h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
          h /= 6;
        }
        return { h: h, s: s, l: l };
      }
      function workshopHslHex(h, s, l) {
        var f = function (n) {
          var k = (n + h * 12) % 12;
          var a = s * Math.min(l, 1 - l);
          var c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
          return ("0" + Math.round(c * 255).toString(16)).slice(-2);
        };
        return "#" + f(0) + f(8) + f(4);
      }
      function workshopColorScreen(hex, use) {
        var c = workshopHexHsl(hex);
        if (!c) return hex;
        if (c.s < 0.08) return hex; // gris, blanco o negro: igual
        var t = { fill: [0.62, 0.42], text: [0.7, 0.72], bright: [0.65, 0.34] }[use || "fill"] || [0.62, 0.42];
        return workshopHslHex(c.h, Math.min(c.s, t[0]), t[1]);
      }
      // Text that is read on a background (#111 on light, white on dark)
      function workshopTextOver(hex) {
        var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || "").trim());
        if (!m) return "#fff";
        var l = 0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16);
        return l > 160 ? "#111" : "#fff";
      }
