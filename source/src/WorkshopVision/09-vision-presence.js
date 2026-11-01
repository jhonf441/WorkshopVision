      // ---- Other plugins: is it there? ----
      // Rule of the owner: a plugin that refers to another one shows nothing about it (no button, link, text, card or hint: hidden,
      // not disabled) while the other one is not installed or not enabled in DWC. The answer is workshopPluginActive(key) of
      // src/_shared/13-presence.js (the same for every plugin; it never looks at the routes). A text that names the other plugin comes in two
      // variants, "key" and "key_no_<plugin>" (the second says what cannot be done here without naming it, or is left out): tvTx picks.
      // Ask when a card is built or drawn, not once at load: a plugin can be started or stopped meanwhile.

      // The text that names the plugin `plugin` (a key of WORKSHOP_IDS), or its variant without the name when that plugin is not there.
      // A text that names two plugins takes an array: the variant is "key_no_<a>" or "key_no_<a>_<b>" with the ones that are missing.
      function tvTx(key, plugin, params) {
        var miss = (Array.isArray(plugin) ? plugin : [plugin]).filter(function (p) { return !workshopPluginActive(p); });
        return i18nT(miss.length ? key + "_no_" + miss.join("_") : key, params);
      }
