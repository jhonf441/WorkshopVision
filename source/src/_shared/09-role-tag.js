      // ---- The role chip for the JS pages: plain-DOM twin of vue/_shared36/WfRoleTag.vue (class wf-role-tag, design/family.css FASE3) ----
      //   workshopRoleTagEl(role)  ->  a <span class="wf-role-tag"> "Requires the Technician role", or null
      // It exists ONLY when the access control is ON (auth.whoami says configured: true; with no users everybody can do everything and a role label would look like a
      // restriction that is not there) and it is dimmed (is-have) when the person already has the role. Display only. The text is the key core.role_tag_needs.
      // Pure helpers are separate so a test can read them without a DOM: workshopRoleTagOn(identity), workshopRoleTagHave(role, identity).

      var WORKSHOP_ROLE_TAG_RANK = { viewer: 0, operator: 1, technician: 2, admin: 3 };

      function workshopRoleTagOn(identity) {
        return !!(identity && identity.configured === true);
      }

      function workshopRoleTagHave(role, identity) {
        var mine = identity && identity.role ? identity.role : "";
        if (WORKSHOP_ROLE_TAG_RANK[mine] === undefined || WORKSHOP_ROLE_TAG_RANK[role] === undefined) return false;
        return WORKSHOP_ROLE_TAG_RANK[mine] >= WORKSHOP_ROLE_TAG_RANK[role];
      }

      function workshopRoleTagEl(role) {
        role = role || "technician";
        var id = typeof workshopIdentity === "function" ? workshopIdentity() : null;
        if (!workshopRoleTagOn(id)) return null;
        if (typeof workshopInjectFamily === "function") workshopInjectFamily();
        var text = i18nT("core.role_tag_needs", { role: workshopNoticeRoleName(role) });
        var e = document.createElement("span");
        e.className = "wf-role-tag" + (workshopRoleTagHave(role, id) ? " is-have" : "");
        e.title = text;
        e.textContent = text;
        return e;
      }
