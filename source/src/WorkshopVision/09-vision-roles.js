      // ---- Views by role for the Vision page (F3-C, 2026-10-21) ----
      //
      // The SERVER decides (permissions.py of the service for vision.post, vision_access.py for the direct calls on port 8095); this only
      // hides what the role cannot do and writes the rest in plain words. From the identity of workshopIdentity() (01-api-auth.js):
      //   full        no identity yet, or a machine without users / a service older than the roles: the whole page, as before
      //   technician  technician and admin: everything (the 17 detection parameters under "Advanced", every calibration method, fire watch)
      //   operator    operator: step by step, take a photo, detect the part, see the bed, and the guided calibration (no technical parameters)
      //   viewer      a viewer: a clear message (the camera and the actions are the operator's)
      // Pure functions first (tests/vision-roles.test.js loads this file alone); the ones that touch the page are at the end.

      // The role each direct POST of the Vision server needs: the same table as vision_access.py (a test compares them).
      // null = any caller (stopping is never blocked); a path that is not here needs a technician.
      var TV_POST_ROLES = {
        "/photo": "operator",
        "/detect": "operator",
        "/measure": "operator",
        "/record/search": "operator",
        "/fire/cancel": "operator",
        "/fire/confirm": "operator",
        "/crosses/cancel": null,
      };
      var TV_OPERATOR_SECTIONS = ["wizard", "detect", "guided"];
      var TV_RANK = { viewer: 0, operator: 1, technician: 2, admin: 3 };
      var TV_GOOD_ERROR_MM = 0.6; // the same limits as the calibration cards (19-vision-cal.js: "bueno")
      var TV_FAIR_ERROR_MM = 1.0;

      function tvViewOf(identity) {
        if (!identity || !identity.table || !identity.role || identity.compat || identity.configured === false) return "full";
        if (identity.role === "viewer") return "viewer";
        return identity.role === "operator" ? "operator" : "technician";
      }

      function tvPostRole(path) {
        return Object.prototype.hasOwnProperty.call(TV_POST_ROLES, path) ? TV_POST_ROLES[path] : "technician";
      }

      function tvIsTechView(view) {
        return view === "full" || view === "technician";
      }

      // The guided calibration is one more item of the "Camera" group; the operator only gets the sections it can use.
      function tvSectionsFor(view, all) {
        var guided = ["guided", i18nT("vision.guided_calibration"), "target", i18nT("vision.guided_calibration_tip")];
        return all.map(function (g) {
          var items = g.items.filter(function (it) { return tvIsTechView(view) || TV_OPERATOR_SECTIONS.indexOf(it[0]) >= 0; });
          if (g.items.some(function (it) { return it[0] === "calibrate"; })) {
            var at = items.findIndex(function (it) { return it[0] === "calibrate"; });
            items.splice(at < 0 ? 0 : at, 0, guided);
          }
          return { group: g.group, items: items };
        }).filter(function (g) { return g.items.length; });
      }

      function tvSectionIdsFor(view, all) {
        var ids = [];
        tvSectionsFor(view, all).forEach(function (g) { g.items.forEach(function (it) { ids.push(it[0]); }); });
        return ids;
      }

      // How good a calibration is, in the words the page shows: "good" | "fair" | "bad" (error in mm after the fit).
      function tvGuidedQuality(errorMm) {
        if (typeof errorMm !== "number" || !isFinite(errorMm)) return "bad";
        return errorMm < TV_GOOD_ERROR_MM ? "good" : errorMm < TV_FAIR_ERROR_MM ? "fair" : "bad";
      }

      // The steps of the guided calibration and where the person is.
      //   inp = { cameraOk, marksKnown (markers with a saved position), seen (markers found in the photo, null = no photo yet),
      //           result (the calibration computed, not saved), saved, canCalibrate, canSave }
      // -> { steps: [{id, done}], now: id of the first step not done ("" when all are), blocked: "" | reason, quality }
      function tvGuidedPlan(inp) {
        var quality = inp.result ? tvGuidedQuality(inp.result.error_mm) : null;
        var done = {
          image: !!inp.cameraOk,
          sheet: inp.marksKnown >= 4,
          photo: inp.seen !== null && inp.seen !== undefined && inp.seen >= 4,
          calibrate: !!inp.result && quality !== "bad", // a bad fit is not a calibration: the step stays open and asks for another photo
          save: !!inp.saved,
        };
        var ids = ["image", "sheet", "photo", "calibrate", "save"];
        var now = ids.find(function (id) { return !done[id]; }) || "";
        var blocked = "";
        if (now === "image") blocked = "no_camera";
        else if (now === "sheet") blocked = "no_marks";
        else if (now === "calibrate" && inp.canCalibrate === false) blocked = "cannot_calibrate";
        else if (now === "save" && inp.canSave === false) blocked = "cannot_save";
        return {
          steps: ids.map(function (id) { return { id: id, done: done[id] }; }),
          now: now,
          blocked: blocked,
          quality: quality,
        };
      }

      // ---- what touches the page ----

      function tvView() {
        return tvViewOf(typeof workshopIdentity === "function" ? workshopIdentity() : null);
      }

      function tvIsTech() {
        return tvIsTechView(tvView());
      }

      // Identity headers for the calls the page makes straight to the Vision server (port 8095): the same ones as for the API.
      function tvIdHeaders() {
        return typeof workshopAuthHeaders === "function" ? workshopAuthHeaders() : {};
      }

      function tvCan(op, args) {
        return typeof workshopCan !== "function" || workshopCan(op, args ? { args: args } : undefined);
      }

      // The person logged in, out or changed role: the sections and the cards follow.
      function tvWatchIdentity(tv) {
        if (typeof workshopOnIdentity !== "function") return;
        tv.offIdentity = workshopOnIdentity(function () {
          if (!tv.alive) return;
          tvEnsureTab(tv);
          tvPaintNav(tv);
          tvRenderAll(tv);
        });
      }

      // Keeps tv.tab inside what the view shows (a saved "calibrate" for an operator, a role that changed).
      function tvEnsureTab(tv) {
        var ids = tvSectionIdsFor(tvView(), TV_SECTIONS);
        if (ids.indexOf(tv.tab) >= 0) return false;
        tv.tab = ids.indexOf("detect") >= 0 ? "detect" : ids[0];
        return true;
      }
