      // ---- texts the WorkshopService publishes on its own (plugin data) ----
      //
      // {key, params} -> the text in the language of this DWC. The service never renders them: two viewers with different
      // languages each see their own. The templates are a copy of the published keys of the service (area "svc" of
      // src/_shared/i18n, synced by tools/sync_service_texts.py; the numbers already come formatted). A plain string (data of
      // an older service) is shown as it is. Same logic in vue/_shared/service-text.js: keep them equal.
      function workshopServiceText(v) {
        if (v === null || v === undefined) return "";
        if (typeof v !== "object") return String(v);
        if (Array.isArray(v)) return v.map(workshopServiceText).join(", ");
        var p = v.params || {};
        if (v.key === "_raw") return String((workshopDwcLanguage() === "es" ? p.es : p.en) || p.es || "");
        if (v.key === "_join") return (p.items || []).map(workshopServiceText).join(p.sep === null || p.sep === undefined ? ", " : p.sep);
        if (!v.key) return "";
        var q = {};
        Object.keys(p).forEach(function (k) {
          q[k] = p[k] !== null && typeof p[k] === "object" ? workshopServiceText(p[k]) : p[k];
        });
        var t = i18nT("svc." + v.key, q);
        return typeof t !== "string" || t === "svc." + v.key || t === "plugins." + PLUGIN_ID + ".svc." + v.key ? v.key : t;
      }
      // A message as published: an object with exactly "key" and "params" (other objects with a "key" field are data).
      function workshopIsServiceMessage(v) {
        return !!v && typeof v === "object" && !Array.isArray(v) && typeof v.key === "string" && Object.keys(v).length === 2 && "params" in v;
      }
      // The same structure with every message replaced by its text (for code that reads a whole published object).
      function workshopServiceTexts(v) {
        if (workshopIsServiceMessage(v)) return workshopServiceText(v);
        if (Array.isArray(v)) return v.map(workshopServiceTexts);
        if (v && typeof v === "object") {
          var out = {};
          Object.keys(v).forEach(function (k) { out[k] = workshopServiceTexts(v[k]); });
          return out;
        }
        return v;
      }
      // A name the user can change whose factory value is one of the i18n keys `keys` (full keys: "svc.live_job_default_name",
      // "buttons.light_on_btn"): workshopDefaultKey gives the key whose Spanish or English text it still is (case and spaces
      // aside; the first key for an empty name), or null for a name the person or the program gave.
      function workshopDefaultKey(value, keys) {
        var v = String(value === null || value === undefined ? "" : value).trim().toLowerCase();
        var list = [].concat(keys || []);
        if (!v) return list.length ? list[0] : null;
        for (var i = 0; i < list.length; i++) {
          if (v === String(i18nT(list[i], "es")).trim().toLowerCase() || v === String(i18nT(list[i], "en")).trim().toLowerCase()) return list[i];
        }
        return null;
      }
      // The name to show: a default one in the language of this DWC, any other as it is.
      function workshopDefaultName(value, keys) {
        var k = workshopDefaultKey(value, keys);
        return k ? String(i18nT(k)) : String(value === null || value === undefined ? "" : value).trim();
      }
