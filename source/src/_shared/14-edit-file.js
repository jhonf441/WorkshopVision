      // Opens the editor of DWC (the same dialog the Files > Macros page uses) on a file of the SD, from a plugin
      // that has no Vue component of its own. The dialog loads nothing by itself: the text is passed in, and it
      // saves on its own (upload to the same path) when the user presses Save.
      //   workshopEditFile("0:/macros/jog/my-light.g", { alCerrar: fn, plantilla: "text if the file is new" })
      // Resolves true when the dialog was opened.
      function workshopEditFile(path, opts) {
        opts = opts || {};
        var url = "/machine/file/" + encodeURI(path);
        return fetch(url, { cache: "no-store" })
          .then(function (r) {
            return r.ok ? r.text() : r.status === 404 ? opts.template || "" : Promise.reject(new Error("HTTP " + r.status));
          })
          .then(function (text) {
            return workshopHostOpenEditor({ path: path, content: text, onClose: opts.onClose });
          })
          .catch(function (e) {
            console.error("[Taller] could not open the editor:", e);
            return false;
          });
      }
