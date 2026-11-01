      // ---- The single standard of the files that leave a page (export) and enter it (import): the pure part ----
      // The same logic is in vue/_shared/data-exchange.js for the Vue pages (tests/data-exchange.test.js runs both over the same cases).
      // The format is documented in docs-internal/DATA-EXCHANGE.md. Pure: no DOM, no network (the browser part is 18-exchange-ui.js).
      //
      // A JSON export is an envelope:  { format, version, plugin, createdAt, machine, data }
      //   format     what the file holds, "workshop-<thing>" (workshop-zones, workshop-lights-profile)
      //   version    integer: the layout of `data` for that format; a reader accepts only the versions it lists (no support for older ones)
      //   plugin     id of the plugin that wrote it (WorkshopWorkbench)
      //   createdAt  ISO 8601, UTC
      //   machine    { name, board, firmware }: where it was written (each one a string or null)
      //   data       the payload; its shape belongs to the format
      // A CSV export is a table with a fixed layout (workshopExchangeCsv below).
      // Nothing is applied from a file without the person confirming a preview of it (workshopExchangeApply, 18-exchange-ui.js).

      var WORKSHOP_EXCHANGE_MAX_BYTES = 5 * 1024 * 1024;
      var WORKSHOP_EXCHANGE_FORMAT_RE = /^workshop(-[a-z0-9]+)+$/;
      var WORKSHOP_EXCHANGE_PLUGIN_RE = /^Workshop[A-Za-z0-9]+$/;
      var WORKSHOP_EXCHANGE_COLUMN_RE = /^[a-z][a-z0-9_]*$/;
      var WORKSHOP_EXCHANGE_CSV_CHARS_RE = /[",\r\n]/;
      var WORKSHOP_EXCHANGE_CSV_FORMULA_RE = /^[=+\-@\t\r]/;
      var WORKSHOP_EXCHANGE_BLOB_MIME_RE = /^[a-z]+\/[a-z0-9.+-]+$/;

      function workshopExchangeTwo(n) {
        return n < 10 ? "0" + n : String(n);
      }

      // "YYYYMMDD-HHMMSS" of a Date, in local time
      function workshopExchangeStamp(now) {
        var d = now instanceof Date ? now : new Date();
        return d.getFullYear() + workshopExchangeTwo(d.getMonth() + 1) + workshopExchangeTwo(d.getDate()) + "-" + workshopExchangeTwo(d.getHours()) + workshopExchangeTwo(d.getMinutes()) + workshopExchangeTwo(d.getSeconds());
      }

      // "YYYY-MM-DD HH:MM:SS" of a Date, in local time (the date format of every CSV cell)
      function workshopExchangeLocalText(now) {
        var d = now instanceof Date ? now : new Date();
        return d.getFullYear() + "-" + workshopExchangeTwo(d.getMonth() + 1) + "-" + workshopExchangeTwo(d.getDate()) + " " + workshopExchangeTwo(d.getHours()) + ":" + workshopExchangeTwo(d.getMinutes()) + ":" + workshopExchangeTwo(d.getSeconds());
      }

      // The name of a downloaded file: <base>-<YYYYMMDD-HHMMSS>.<ext>; the base is lower case letters, digits and hyphens
      function workshopExchangeFileName(base, ext, now) {
        var b = String(base || "workshop").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "workshop";
        var e = String(ext || "json").toLowerCase().replace(/[^a-z0-9]/g, "") || "json";
        return b + "-" + workshopExchangeStamp(now) + "." + e;
      }

      function workshopExchangeShort(v) {
        var t = v === null || v === undefined ? "" : String(v).trim();
        return t ? t.slice(0, 64) : null;
      }

      // { name, board, firmware } from `machine` as given or null for what is missing
      function workshopExchangeMachineOf(machine) {
        var m = machine && typeof machine === "object" ? machine : {};
        return { name: workshopExchangeShort(m.name), board: workshopExchangeShort(m.board), firmware: workshopExchangeShort(m.firmware) };
      }

      // The machine as the object model of DWC tells it (model.network.name, model.boards[0])
      function workshopExchangeMachine(model) {
        var m = model && typeof model === "object" ? model : {};
        var board = Array.isArray(m.boards) && m.boards[0] ? m.boards[0] : {};
        return workshopExchangeMachineOf({ name: m.network && m.network.name, board: board.shortName || board.name, firmware: board.firmwareVersion });
      }

      // The envelope of a JSON export. spec: { format, version, plugin, data, machine, now }. A wrong spec is a bug of the page: it throws.
      function workshopExchangeEnvelope(spec) {
        var s = spec || {};
        if (!WORKSHOP_EXCHANGE_FORMAT_RE.test(String(s.format))) throw new Error("exchange: bad format " + s.format);
        if (!Number.isInteger(s.version) || s.version < 1) throw new Error("exchange: bad version " + s.version);
        if (!WORKSHOP_EXCHANGE_PLUGIN_RE.test(String(s.plugin))) throw new Error("exchange: bad plugin " + s.plugin);
        if (s.data === undefined || s.data === null) throw new Error("exchange: no data");
        var at = s.now instanceof Date ? s.now : new Date();
        return { format: s.format, version: s.version, plugin: s.plugin, createdAt: at.toISOString(), machine: workshopExchangeMachineOf(s.machine), data: s.data };
      }

      // The text of the file
      function workshopExchangeText(envelope) {
        return JSON.stringify(envelope, null, 2) + "\n";
      }

      function workshopExchangeFailure(code, params) {
        return { ok: false, code: code, params: params || {} };
      }

      function workshopExchangeIsEnvelope(e) {
        return (
          !!e &&
          typeof e === "object" &&
          !Array.isArray(e) &&
          WORKSHOP_EXCHANGE_FORMAT_RE.test(String(e.format)) &&
          Number.isInteger(e.version) &&
          e.version >= 1 &&
          WORKSHOP_EXCHANGE_PLUGIN_RE.test(String(e.plugin)) &&
          typeof e.createdAt === "string" &&
          !isNaN(Date.parse(e.createdAt)) &&
          !!e.machine &&
          typeof e.machine === "object" &&
          !Array.isArray(e.machine) &&
          "data" in e
        );
      }

      // Reads and checks the text of a file. spec: { format, versions: [1], plugins: ['WorkshopLights'] (optional), machine (this machine, optional) }.
      // -> { ok: true, envelope, data, warnings: [{ code, params }] } or { ok: false, code, params }
      // codes: read, too_large, not_json, not_workshop, wrong_format, wrong_plugin, wrong_version, no_data. Warnings: other_machine.
      function workshopExchangeRead(text, spec) {
        var s = spec || {};
        if (typeof text !== "string") return workshopExchangeFailure("read");
        if (text.length > WORKSHOP_EXCHANGE_MAX_BYTES) {
          return workshopExchangeFailure("too_large", { mb: Math.ceil(text.length / 1048576), max: Math.floor(WORKSHOP_EXCHANGE_MAX_BYTES / 1048576) });
        }
        var env;
        try {
          env = JSON.parse(text.replace(/^\uFEFF/, ""));
        } catch (e) {
          return workshopExchangeFailure("not_json");
        }
        if (!workshopExchangeIsEnvelope(env)) return workshopExchangeFailure("not_workshop");
        if (env.format !== s.format) return workshopExchangeFailure("wrong_format", { found: env.format, expected: s.format });
        if (Array.isArray(s.plugins) && s.plugins.indexOf(env.plugin) < 0) return workshopExchangeFailure("wrong_plugin", { plugin: env.plugin });
        var versions = Array.isArray(s.versions) ? s.versions : [1];
        if (versions.indexOf(env.version) < 0) return workshopExchangeFailure("wrong_version", { found: env.version, expected: versions.join(", ") });
        if (env.data === null || env.data === undefined) return workshopExchangeFailure("no_data");
        var warnings = [];
        var here = workshopExchangeMachineOf(s.machine).name;
        var there = workshopExchangeShort(env.machine.name);
        if (here && there && here.toLowerCase() !== there.toLowerCase()) warnings.push({ code: "other_machine", params: { machine: there } });
        return { ok: true, envelope: env, data: env.data, warnings: warnings };
      }

      // Applies what was read, and only after the person confirmed the preview. plan: { data, envelope, blockers: [text] }.
      // `confirmed` must be exactly true; a plan with blockers is never applied. Resolves with what apply(data, envelope) returns.
      function workshopExchangeApply(plan, confirmed, apply) {
        function fail(code) {
          var e = new Error("exchange: " + code);
          e.code = code;
          return Promise.reject(e);
        }
        if (confirmed !== true) return fail("not_confirmed");
        if (!plan || plan.data === undefined || typeof apply !== "function") return fail("nothing_to_apply");
        if (Array.isArray(plan.blockers) && plan.blockers.length) return fail("blocked");
        return Promise.resolve().then(function () {
          return apply(plan.data, plan.envelope);
        });
      }

      function workshopExchangeCsvCell(v) {
        var t;
        if (v === null || v === undefined) t = "";
        else if (v instanceof Date) t = isNaN(v.getTime()) ? "" : workshopExchangeLocalText(v);
        else if (typeof v === "number") t = isFinite(v) ? String(v) : "";
        else if (typeof v === "boolean") t = v ? "true" : "false";
        else if (typeof v === "object") t = JSON.stringify(v);
        else t = String(v);
        // a text that starts with = + - @ (or a tab or a return) is read by a spreadsheet as a formula: a quote goes first
        if (typeof v === "string" && WORKSHOP_EXCHANGE_CSV_FORMULA_RE.test(t)) t = "'" + t;
        return WORKSHOP_EXCHANGE_CSV_CHARS_RE.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
      }

      // The text of a CSV file (fixed layout, docs-internal/DATA-EXCHANGE.md): comma separated, CRLF line ends (also after the last row),
      // first row = the column keys (lower case, digits and _; never translated), a cell is quoted when it holds , " or a line break (" doubled),
      // numbers with a dot and no unit, booleans true / false, dates "YYYY-MM-DD HH:MM:SS" local time, nothing = an empty cell.
      // rows: arrays in the order of `columns`, or objects with those keys. The byte order mark is added when the file is saved.
      function workshopExchangeCsv(columns, rows) {
        var cols = (columns || []).map(String);
        cols.forEach(function (c) {
          if (!WORKSHOP_EXCHANGE_COLUMN_RE.test(c)) throw new Error("exchange: bad csv column " + c);
        });
        var lines = [cols.join(",")];
        (rows || []).forEach(function (row) {
          lines.push(
            cols
              .map(function (c, i) {
                return workshopExchangeCsvCell(Array.isArray(row) ? row[i] : row ? row[c] : null);
              })
              .join(",")
          );
        });
        return lines.join("\r\n") + "\r\n";
      }

      // What a file that is not data (a picture, a drawing) is made of, for workshopExchangeSaveBlob: a text, or the bytes (an ArrayBuffer or a typed array).
      // -> { parts: [data], type }, or null when there is nothing to save (empty, or neither a text nor bytes) or the type is not "kind/subtype".
      // A text gets ";charset=utf-8". A Blob is not looked at here: the browser part hands it over as it is.
      function workshopExchangeBlobParts(data, mime) {
        var type = String(mime || "").toLowerCase();
        if (!WORKSHOP_EXCHANGE_BLOB_MIME_RE.test(type)) return null;
        if (typeof data === "string") return data.length ? { parts: [data], type: type + ";charset=utf-8" } : null;
        if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return data.byteLength ? { parts: [data], type: type } : null;
        return null;
      }
