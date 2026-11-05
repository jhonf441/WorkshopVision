      // The first rule of every page that has views by role (Camera, Vision...): "full" while the page cannot tell who is looking (no identity yet,
      // a service without a permission table or older than the roles, no users on the machine: everybody is admin), otherwise the role of the person:
      // "viewer" | "operator" | "technician" | "admin". Each page maps that to its own views and features; the service decides what is allowed.
      function workshopIdentityView(identity) {
        if (!identity || !identity.table || identity.compat || identity.configured === false) return "full";
        // users exist and nobody is signed in (role null): a VISITOR, who only looks (it used to be "full": a page that failed on every click)
        return identity.role || "viewer";
      }
