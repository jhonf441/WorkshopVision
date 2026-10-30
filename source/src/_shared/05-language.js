      // ---- DWC's language for the workshop macros ----
      //
      // The pages translate their own texts with i18nT (official DWC localization). What is left here is telling the
      // Duet which language DWC uses, because the workshop macros print their messages in it (global.workshopLanguage,
      // see sys/workshop/macros/language.g of WorkshopJog). It is sent only if the global does not match, once per
      // language and page load. Every plugin brings its copy of this file; the state is shared in window.__workshopLanguage.

      // DWC's language: the app's vue-i18n locale (it changes live with the language selector); without that, "es".
      function workshopDwcLanguage() {
        var loc = workshopHostLocale();
        if (loc) return String(loc).slice(0, 2).toLowerCase();
        return "es";
      }

      // QA-09: DWC leaves <html lang="en"> whatever its language, so a screen reader pronounces the Spanish UI in English. The attribute
      // follows DWC's locale (changed only when it differs; DWC does not manage it).
      function workshopHtmlLangSync() {
        try {
          var loc = workshopHostLocale();
          var root = document.documentElement;
          if (loc && root && root.getAttribute("lang") !== String(loc)) root.setAttribute("lang", String(loc));
        } catch (e) {
          /* no document */
        }
      }

      function workshopLanguageSync() {
        workshopHtmlLangSync();
        var S = (window.__workshopLanguage = window.__workshopLanguage || { sent: "" });
        var l = workshopDwcLanguage();
        if (l !== "es") l = "en"; // any other language: English as neutral
        if (S.sent === l) return;
        // the global comes from DWC's store (01-dwc-state.js), not from /machine/status; without a connection yet it is retried on the next call
        var j = typeof workshopStateDwc === "function" ? workshopStateDwc() : null;
        if (!j) return;
        S.sent = l;
        var g = j.global && j.global.workshopLanguage;
        if (g === l) return;
        fetch("/machine/code", { method: "POST", body: 'M98 P"0:/sys/workshop/macros/language.g" L"' + l + '"' }).catch(function () {
          /* without DSF or without WorkshopJog: the macros keep their language */
        });
      }

      workshopLanguageSync();
      setInterval(workshopLanguageSync, 1500);
