      // ---- the files Vision writes: the dimensions report (CSV), the drawing of a piece (SVG) and the camera image (JPEG) ----
      // What each one holds, built from plain data (tests/vision-files.test.js runs this file without the page), and how it goes to the browser through
      // the shared exchange module (src/_shared/18-exchange*.js, docs-internal/DATA-EXCHANGE.md). The CSV is a Workshop table with fixed English columns;
      // the SVG and the JPEG are a drawing and a picture, not data: they have no envelope.
      var TV_DIMENSIONS_BASE = "workshop-vision-dimensions";
      var TV_PIECE_BASE = "workshop-vision-piece";
      var TV_IMAGE_BASE = "workshop-vision-image";
      // element: "part" (one row) or "hole" (one per hole, number 1..n, in the order along the part). Positions in mm of the machine and from the
      // bottom-left corner of the part along its two sides; length_mm, width_mm and rotation_deg only in the row of the part.
      var TV_DIMENSIONS_COLUMNS = ["element", "number", "machine_x_mm", "machine_y_mm", "along_mm", "across_mm", "diameter_mm", "roundness", "length_mm", "width_mm", "rotation_deg"];

      // a number to two decimals, or nothing (an empty cell) when it is not one
      function tvRound2(v) {
        return typeof v === "number" && isFinite(v) ? Math.round(v * 100) / 100 : null;
      }

      // The table of the dimensions report. part: { corner: [x, y], length, width, rotation }; holes: [{ c: [x, y], along, across, diameter, roundness }]
      // -> { columns, rows } for workshopExchangeExportCsv
      function tvDimensionsTable(part, holes) {
        var rows = [
          {
            element: "part", number: null, machine_x_mm: tvRound2(part.corner[0]), machine_y_mm: tvRound2(part.corner[1]), along_mm: 0, across_mm: 0, diameter_mm: null, roundness: null,
            length_mm: tvRound2(part.length), width_mm: tvRound2(part.width), rotation_deg: tvRound2(part.rotation),
          },
        ];
        (holes || []).forEach(function (h, j) {
          rows.push({
            element: "hole", number: j + 1, machine_x_mm: tvRound2(h.c[0]), machine_y_mm: tvRound2(h.c[1]), along_mm: tvRound2(h.along), across_mm: tvRound2(h.across),
            diameter_mm: h.diameter ? tvRound2(h.diameter) : null, roundness: tvRound2(h.roundness), length_mm: null, width_mm: null, rotation_deg: null,
          });
        });
        return { columns: TV_DIMENSIONS_COLUMNS, rows: rows };
      }

      // The SVG of a piece: its outline and its holes (lists of [x, y] in mm of the machine) with Y downward, 0,0 at the top left corner of the outline,
      // in mm. The comment says which piece it is and where its bottom-left corner was on the machine.
      function tvPieceSvg(outline, holes, name) {
        var polys = [outline].concat(holes || []);
        var xs = [], ys = [];
        polys.forEach(function (p) { p.forEach(function (q) { xs.push(q[0]); ys.push(q[1]); }); });
        var x0 = Math.min.apply(null, xs), y1 = Math.max.apply(null, ys);
        var w = Math.max.apply(null, xs) - x0, h = y1 - Math.min.apply(null, ys);
        var d = polys.map(function (p) {
          return "M" + p.map(function (q) { return (q[0] - x0).toFixed(3) + " " + (y1 - q[1]).toFixed(3); }).join(" L") + " Z";
        }).join(" ");
        return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="' + w.toFixed(3) + 'mm" height="' + h.toFixed(3) + 'mm" viewBox="0 0 ' + w.toFixed(3) + " " + h.toFixed(3) + '">\n' +
          "<!-- Vision: " + String(name).replace(/--/g, "-") + "; bottom-left corner on the machine: X" + x0.toFixed(2) + " Y" + (y1 - h).toFixed(2) + " -->\n" +
          '<path d="' + d + '" fill="none" stroke="#000" stroke-width="0.1" fill-rule="evenodd"/>\n</svg>\n';
      }

      // Each one hands its file to the browser and says whether it could: false when the browser refuses (or, for the image, when there is none).
      function tvSaveDimensions(table) {
        return workshopExchangeExportCsv(TV_DIMENSIONS_BASE, table.columns, table.rows).ok;
      }
      function tvSavePieceSvg(name, outline, holes) {
        return workshopExchangeSaveBlob(workshopExchangeFileName(TV_PIECE_BASE + "-" + String(name).slice(0, 40), "svg"), tvPieceSvg(outline, holes, name), "image/svg+xml");
      }
      function tvSaveJpeg(blob) {
        return workshopExchangeSaveBlob(workshopExchangeFileName(TV_IMAGE_BASE, "jpg"), blob, "image/jpeg");
      }
