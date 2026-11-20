      // ---- Block with reason in Vision (step 8 of the access control, document PASO8-PLUGINS: "Despues: los que ya comprueban por nivel") ----
      // Under each button that calls an operation of the service API ONE note (class wf-reason, the shared 09-access-reason.js) says why the service would
      // refuse it to this person (profile and rule, ceiling, no rule, condition, or the role) from ONE batched auth.can per screen. The buttons keep what they
      // do and how they are confirmed.
      //   workarea     machine.workarea.save   "use as cutting area" of a detected sheet                 (technician)
      //   processing   modules.set             the switch of the camera processing                      (technician)
      // NOT covered, on purpose: almost everything else in this plugin is a direct call to the Vision server on port 8095 (tvPost: photo, detect, calibrate,
      // fire watch, crossings...). Those calls are NOT operations of the service API contract, so auth.can does not know them (it would answer "administrator
      // only" for a name it does not know): they keep the table of vision_access.py and the role sentence of 09-vision-roles.js. vision.post is not called from
      // this plugin (the Workbench calls it); settings.set is only read by the guided calibration (tvCan), its save is a call to port 8095.
      // The stops of the plugin (/crosses/cancel, /fire/cancel) go to port 8095, are never asked here and carry no note.
      var TV_REASON_OPS = {
        workarea: ["machine.workarea.save"],
        processing: ["modules.set"],
      };

      // The note of a group: an empty element that fills itself when something blocks (and says nothing when nothing does)
      function tvReasonEl(group) {
        if (typeof workshopReasonGroupEl !== "function") return document.createComment("");
        var box = workshopReasonGroupEl(TV_REASON_OPS[group] || [], { need: "technician", subject: i18nT("subjects_vision." + group) });
        box.style.marginTop = "6px";
        box.style.flexBasis = "100%";
        return box;
      }
