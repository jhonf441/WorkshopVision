      // ---- The single standard of the files that leave a page and enter it: the browser part (18-exchange.js is the pure part) ----
      // Save a file, pick a file and the import flow with a preview. The same logic is in vue/_shared/data-exchange-ui.js for the Vue pages.
      // A page never builds a Blob, a download link or a file input of its own (tests/no-adhoc-exchange.test.js).
      //
      //   workshopExchangeExportJson({ format, version, plugin, data, model })   -> { ok, name }   downloads the envelope of data
      //   workshopExchangeExportCsv(base, columns, rows)                         -> { ok, name }   downloads a CSV with the fixed layout
      //   workshopExchangeSaveBlob(name, data, mime)                             -> boolean        downloads a picture or a drawing (a Blob, a text or the bytes)
      //   workshopExchangeImport({ what, accept, spec, model, preview, apply, notify })
      //       what     text for the title of the preview ("zones")
      //       spec     { format, versions, plugins }  (workshopExchangeRead)
      //       model    object model of DWC (workshopStateDwc()), to name this machine and warn when the file comes from another one
      //       preview  (data, envelope) -> { rows: [{ label, value }], warnings: [text], blockers: [text] }, or a Promise of it (a question to the service);
      //                changes nothing. If it throws or rejects, the import ends: the page is told and nothing is applied
      //       apply    (data, envelope) -> Promise; runs only after the person pressed Apply in the preview, never when there are blockers
      //       notify   (text, ok) the page's own message line: failures of the file and of apply come here
      //     -> Promise<{ state: 'applied' | 'cancelled' | 'rejected' | 'failed' }>   (failed: the preview or apply threw)

      // Hands what make() builds (a Blob) to the browser as a file called `name`. Returns false when the browser does not allow it.
      function workshopExchangeDownload(name, make) {
        try {
          var url = URL.createObjectURL(make());
          var a = document.createElement("a");
          a.href = url;
          a.download = name;
          a.style.display = "none";
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          setTimeout(function () {
            URL.revokeObjectURL(url);
          }, 2000);
          return true;
        } catch (e) {
          return false;
        }
      }

      // Hands a text to the browser as a file. Returns false when the browser does not allow it. bom: a byte order mark goes first
      // (CSV: so a spreadsheet opens the accents correctly)
      function workshopExchangeSave(name, text, mime, bom) {
        return workshopExchangeDownload(name, function () {
          return new Blob([(bom ? "\uFEFF" : "") + text], { type: mime + ";charset=utf-8" });
        });
      }

      // Hands a picture or a drawing to the browser as a file: a Blob (a canvas gives one), a text or the bytes. It is not data, so it has no envelope.
      // Returns false when there is nothing to save (an empty Blob, text or bytes) or the browser does not allow it.
      function workshopExchangeSaveBlob(name, data, mime) {
        if (typeof Blob !== "undefined" && data instanceof Blob) {
          return data.size > 0 && workshopExchangeDownload(name, function () {
            return data;
          });
        }
        var b = workshopExchangeBlobParts(data, mime);
        return !!b && workshopExchangeDownload(name, function () {
          return new Blob(b.parts, { type: b.type });
        });
      }

      function workshopExchangeExportJson(opts) {
        var o = opts || {};
        var envelope = workshopExchangeEnvelope({ format: o.format, version: o.version, plugin: o.plugin, data: o.data, machine: workshopExchangeMachine(o.model) });
        var name = workshopExchangeFileName(o.format, "json");
        return { ok: workshopExchangeSave(name, workshopExchangeText(envelope), "application/json", false), name: name };
      }

      function workshopExchangeExportCsv(base, columns, rows) {
        var name = workshopExchangeFileName(base, "csv");
        return { ok: workshopExchangeSave(name, workshopExchangeCsv(columns, rows), "text/csv", true), name: name };
      }

      // Asks the person for a file: resolves the File, or null when the dialog is closed. Call it straight from the click.
      function workshopExchangePick(accept) {
        return new Promise(function (resolve) {
          var input = document.createElement("input");
          input.type = "file";
          input.accept = accept || ".json,application/json";
          input.style.display = "none";
          function end(file) {
            if (input.parentNode) input.parentNode.removeChild(input);
            resolve(file);
          }
          input.addEventListener("change", function () {
            end(input.files && input.files[0] ? input.files[0] : null);
          });
          input.addEventListener("cancel", function () {
            end(null);
          });
          document.body.appendChild(input);
          input.click();
        });
      }

      // the catalog key of every code of workshopExchangeRead (tests/data-exchange-ui.test.js checks each one exists in both languages)
      var WORKSHOP_EXCHANGE_ERROR_KEYS = {
        read: "exchange.err_read",
        too_large: "exchange.err_too_large",
        not_json: "exchange.err_not_json",
        not_workshop: "exchange.err_not_workshop",
        wrong_format: "exchange.err_wrong_format",
        wrong_plugin: "exchange.err_wrong_plugin",
        wrong_version: "exchange.err_wrong_version",
        no_data: "exchange.err_no_data",
      };
      var WORKSHOP_EXCHANGE_WARNING_KEYS = { other_machine: "exchange.warn_other_machine" };

      function workshopExchangeErrorText(read) {
        return i18nT(WORKSHOP_EXCHANGE_ERROR_KEYS[read.code] || WORKSHOP_EXCHANGE_ERROR_KEYS.read, read.params);
      }

      // The text of a File checked as a Workshop file (workshopExchangeRead): the size is looked at before the file is read
      function workshopExchangeReadFile(file, spec) {
        if (file && file.size > WORKSHOP_EXCHANGE_MAX_BYTES) {
          return Promise.resolve({ ok: false, code: "too_large", params: { mb: Math.ceil(file.size / 1048576), max: Math.floor(WORKSHOP_EXCHANGE_MAX_BYTES / 1048576) } });
        }
        return Promise.resolve()
          .then(function () {
            return file.text();
          })
          .catch(function () {
            return null;
          })
          .then(function (text) {
            return workshopExchangeRead(text, spec);
          });
      }

      function workshopExchangeEl(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
      }

      var WORKSHOP_EXCHANGE_BTN = "border:0;border-radius:6px;padding:8px 14px;min-height:44px;font-size:14px;cursor:pointer;color:#fff;";

      function workshopExchangeLists(box, view) {
        view.warnings.forEach(function (w) {
          box.appendChild(workshopExchangeEl("div", "color:#ffb74d;margin-top:8px;", w));
        });
        view.blockers.forEach(function (b) {
          box.appendChild(workshopExchangeEl("div", "color:#ef9a9a;margin-top:8px;font-weight:600;", b));
        });
        if (!view.rows.length) return;
        var list = workshopExchangeEl("div", "margin-top:10px;padding:8px 10px;border-radius:4px;background:rgba(255,255,255,0.05);");
        view.rows.forEach(function (r) {
          var row = workshopExchangeEl("div", "display:flex;gap:12px;justify-content:space-between;padding:2px 0;");
          row.appendChild(workshopExchangeEl("span", "color:#b0bec5;", r.label));
          row.appendChild(workshopExchangeEl("span", "text-align:right;word-break:break-word;", r.value));
          list.appendChild(row);
        });
        box.appendChild(list);
      }

      // The preview: what the file holds and what would change. Resolves true only when the person presses Apply (Escape and Cancel give false).
      // view: { title, source, rows, warnings, blockers, note, applyLabel, cancelLabel }. With blockers there is no Apply button.
      function workshopExchangeDialog(view) {
        return new Promise(function (resolve) {
          var back = workshopExchangeEl("div", "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:16px;overflow:auto;");
          back.setAttribute("data-workshop-exchange", "1");
          var box = workshopExchangeEl(
            "div",
            "background:#1e272c;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-left:4px solid #1976d2;border-radius:6px;max-width:520px;width:100%;max-height:100%;overflow:auto;padding:14px 16px;font-size:13px;line-height:1.45;font-family:Roboto,Helvetica,Arial,sans-serif;box-shadow:0 8px 30px rgba(0,0,0,0.5);"
          );
          box.setAttribute("role", "dialog");
          box.setAttribute("aria-modal", "true");
          box.setAttribute("aria-label", String(view.title));
          box.appendChild(workshopExchangeEl("div", "font-size:16px;font-weight:600;color:#90caf9;margin-bottom:4px;", view.title));
          box.appendChild(workshopExchangeEl("div", "color:#b0bec5;", view.source));
          workshopExchangeLists(box, view);
          box.appendChild(workshopExchangeEl("div", "color:#b0bec5;margin-top:10px;", view.note));
          var buttons = workshopExchangeEl("div", "display:flex;gap:8px;justify-content:flex-end;margin-top:12px;");
          var cancel = workshopExchangeEl("button", WORKSHOP_EXCHANGE_BTN + "background:#455a64;", view.cancelLabel);
          cancel.type = "button";
          cancel.setAttribute("data-exchange", "cancel");
          buttons.appendChild(cancel);
          function key(ev) {
            if (ev.key === "Escape") end(false);
          }
          function end(value) {
            document.removeEventListener("keydown", key, true);
            if (back.parentNode) back.parentNode.removeChild(back);
            resolve(value);
          }
          cancel.addEventListener("click", function () {
            end(false);
          });
          if (!view.blockers.length) {
            var ok = workshopExchangeEl("button", WORKSHOP_EXCHANGE_BTN + "background:#1976d2;font-weight:600;", view.applyLabel);
            ok.type = "button";
            ok.setAttribute("data-exchange", "apply");
            ok.addEventListener("click", function () {
              end(true);
            });
            buttons.appendChild(ok);
          }
          document.addEventListener("keydown", key, true);
          box.appendChild(buttons);
          back.appendChild(box);
          (document.fullscreenElement || document.body).appendChild(back);
          cancel.focus();
        });
      }

      function workshopExchangeView(read, o) {
        return new Promise(function (resolve) {
          resolve(o.preview ? o.preview(read.data, read.envelope) : null);
        }).then(function (preview) {
          var p = preview || {};
          var env = read.envelope;
          var when = new Date(env.createdAt).toLocaleString();
          var blockers = p.blockers || [];
          return {
            title: i18nT("exchange.title", { what: o.what || "" }),
            source: env.machine.name
              ? i18nT("exchange.source_machine", { plugin: env.plugin, date: when, machine: env.machine.name })
              : i18nT("exchange.source", { plugin: env.plugin, date: when }),
            rows: p.rows || [],
            warnings: read.warnings
              .filter(function (w) {
                return WORKSHOP_EXCHANGE_WARNING_KEYS[w.code];
              })
              .map(function (w) {
                return i18nT(WORKSHOP_EXCHANGE_WARNING_KEYS[w.code], w.params);
              })
              .concat(p.warnings || []),
            blockers: blockers,
            note: blockers.length ? i18nT("exchange.blocked") : i18nT("exchange.note"),
            applyLabel: i18nT("exchange.apply"),
            cancelLabel: blockers.length ? i18nT("exchange.close") : i18nT("exchange.cancel"),
          };
        });
      }

      // The import flow of a file already chosen: read and check it, show the preview, and only if the person presses Apply run apply.
      function workshopExchangeImportFile(file, opts) {
        var o = opts || {};
        var notify = typeof o.notify === "function" ? o.notify : function () {};
        var spec = Object.assign({}, o.spec, { machine: workshopExchangeMachine(o.model) });
        return workshopExchangeReadFile(file, spec).then(function (read) {
          if (!read.ok) {
            notify(workshopExchangeErrorText(read), false);
            return { state: "rejected", code: read.code };
          }
          return workshopExchangeView(read, o).then(
            function (view) {
              return workshopExchangeDialog(view).then(function (confirmed) {
                if (!confirmed) return { state: "cancelled" };
                return workshopExchangeApply({ data: read.data, envelope: read.envelope, blockers: view.blockers }, true, o.apply).then(
                  function () {
                    return { state: "applied" };
                  },
                  function (e) {
                    notify(String((e && e.message) || e), false);
                    return { state: "failed", error: e };
                  }
                );
              });
            },
            function (e) {
              notify(String((e && e.message) || e), false);
              return { state: "failed", error: e };
            }
          );
        });
      }

      function workshopExchangeImport(opts) {
        return workshopExchangePick((opts && opts.accept) || ".json,application/json").then(function (file) {
          return file ? workshopExchangeImportFile(file, opts) : { state: "cancelled" };
        });
      }
