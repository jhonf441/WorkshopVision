      // ---- Which modes this machine uses (FFF / Laser / CNC): the JS twin of vue/_shared/machine-modes.js ----
      // ONE source of truth: the machine profile of the service, field mode_policies.<FFF|Laser|CNC>.enabled (profile.get / profile.set,
      // central API, no M-codes). An absent entry means "not answered yet". When the service has no profile operation (or the role
      // cannot write it) the answer is kept in this browser under the SAME key the Vue plugins use (localStorage workshopMachineModes).
      // What the board shows (capabilities.get) only PRESELECTS the question, it never decides.
      //
      //   workshopModes.load().then(function (info) { ... })    -> { state, detected, profile, viaService }, never rejects
      //   workshopModes.save(answer, profile).then(...)        -> { viaService }
      // The pure rules (no DOM, no network) are tests/workbench-modes.test.js material.

      var WORKSHOP_MODES = ["FFF", "Laser", "CNC"];
      var WORKSHOP_MODES_LOCAL_KEY = "workshopMachineModes";

      // ONE rule for "may this person switch the machine mode?" (owner 2026-11-06), twin of vue/_shared36/mode-switch.js: the mode buttons of the
      // bar switched without a word while the Printing page asked for a session. Switching the mode is the technician's (WorkshopService
      // dsf/permissions.py: "technician ... changes mode / head"); the macro runs through DWC, so the technician rank is asked through the
      // operation that marks that role (RANK_OPS.technician of vue/_shared36/role-view.js), as roleAtLeast('technician') does everywhere else.
      var WORKSHOP_MODE_SWITCH_ROLE = "technician";
      var WORKSHOP_MODE_SWITCH_OP = "settings.set";

      // "resolving" | "ok" | "session" | "role"; "ok" while nothing is known (hiding is a courtesy, the service decides)
      function workshopModeSwitchAccess() {
        return typeof workshopAccessState === "function" ? workshopAccessState(WORKSHOP_MODE_SWITCH_OP) : "ok";
      }

      function workshopCanSwitchMode() {
        var a = workshopModeSwitchAccess();
        return a === "ok" || a === "resolving";
      }

      // the sentence that says why the person may not switch the mode ("" when they may): the same one of every notice (09-notice-dom.js)
      function workshopModeSwitchReason() {
        var a = workshopModeSwitchAccess();
        if (a !== "session" && a !== "role") return "";
        return typeof workshopNoticeText === "function" ? workshopNoticeText(a, WORKSHOP_MODE_SWITCH_ROLE) : a;
      }

      // The mode the machine is really in: ONE rule for every JS plugin (twin of vue/_shared36/current-mode.js and of real_mode.py of the service).
      // state.machineMode is what RRF applies; global.selectedMode is written by the select*.g macros BEFORE the M45x, so when the M45x fails it
      // says one mode while the machine is in another. The machine is the truth: selectedMode only when the model has no known machineMode.
      // -> "FFF" | "Laser" | "CNC", or "" when the model says nothing.
      function workshopCurrentMode(model) {
        var machine = model && model.state && model.state.machineMode;
        if (WORKSHOP_MODES.indexOf(machine) >= 0) return machine;
        var selected = model && model.global && model.global.selectedMode;
        return WORKSHOP_MODES.indexOf(selected) >= 0 ? selected : "";
      }

      // answer: { FFF, Laser, CNC } with true / false / null (null = not answered)
      function workshopModesEmpty() {
        return { FFF: null, Laser: null, CNC: null };
      }

      // The answer stored in the profile (profile.get -> .profile)
      function workshopModesFromProfile(profile) {
        var out = workshopModesEmpty();
        var pol = (profile && profile.mode_policies) || {};
        WORKSHOP_MODES.forEach(function (m) {
          if (pol[m] && typeof pol[m].enabled === "boolean") out[m] = pol[m].enabled;
        });
        return out;
      }

      // The answer kept in the browser (lower-case keys, like the Vue plugins write it) -> { FFF, Laser, CNC }
      function workshopModesFromLocal(raw) {
        var out = workshopModesEmpty();
        if (!raw || typeof raw !== "object") return out;
        WORKSHOP_MODES.forEach(function (m) {
          if (typeof raw[m.toLowerCase()] === "boolean") out[m] = raw[m.toLowerCase()];
        });
        return out;
      }

      function workshopModesIsAnswered(answer) {
        return !!answer && WORKSHOP_MODES.some(function (m) { return typeof answer[m] === "boolean"; });
      }

      // a mode with no entry counts as off once the person has answered
      function workshopModesFill(answer) {
        var out = workshopModesEmpty();
        WORKSHOP_MODES.forEach(function (m) { out[m] = !!answer && answer[m] === true; });
        return out;
      }

      // The profile answer wins; then the one kept in the browser; else nothing. -> { answer, answered, source }
      function workshopModesState(fromProfile, fromLocal) {
        if (workshopModesIsAnswered(fromProfile)) return { answer: workshopModesFill(fromProfile), answered: true, source: "profile" };
        if (workshopModesIsAnswered(fromLocal)) return { answer: workshopModesFill(fromLocal), answered: true, source: "local" };
        return { answer: workshopModesEmpty(), answered: false, source: "none" };
      }

      // What the board suggests (capabilities.get). -> { FFF, Laser, CNC, known }
      function workshopModesDetect(caps) {
        var c = (caps && caps.capabilities) || null;
        if (!c) return { FFF: true, Laser: false, CNC: false, known: false };
        function present(k) { return !!(c[k] && c[k].present); }
        var listed = (c.modes && c.modes.available) || [];
        function has(n) { return listed.indexOf(n) >= 0; }
        return { FFF: present("extruder") || has("FFF"), Laser: present("laser") || has("Laser"), CNC: present("spindle") || has("CNC"), known: true };
      }

      // The modes switched on, in order: [] while nothing is answered
      function workshopModesEnabled(state) {
        return state && state.answered ? WORKSHOP_MODES.filter(function (m) { return state.answer[m]; }) : [];
      }

      // The `changes` of profile.set for a new answer, keeping the min_role the profile may already hold
      function workshopModesChanges(answer, currentProfile) {
        var cur = (currentProfile && currentProfile.mode_policies) || {};
        var pol = {};
        WORKSHOP_MODES.forEach(function (m) {
          pol[m] = { enabled: answer[m] === true, min_role: cur[m] && cur[m].min_role ? cur[m].min_role : null };
        });
        return { mode_policies: pol };
      }

      // Switch ONE mode on or off keeping the others. -> new answer
      function workshopModesWith(state, mode, on, detected) {
        var base = state && state.answered ? state.answer : { FFF: !!(detected && detected.FFF), Laser: false, CNC: false };
        var out = workshopModesFill(base);
        out[mode] = !!on;
        return out;
      }

      // Several modes at once: picks = { Laser: bool, CNC: bool }; FFF stays as answered (or as the board suggests while nothing is answered)
      function workshopModesSet(state, picks, detected) {
        var base = state && state.answered ? state.answer : { FFF: !!(detected && detected.FFF), Laser: false, CNC: false };
        var out = workshopModesFill(base);
        Object.keys(picks || {}).forEach(function (m) { if (WORKSHOP_MODES.indexOf(m) >= 0) out[m] = !!picks[m]; });
        return out;
      }

      // Is the page of the laser / CNC work open? Pure.
      //   state    workshopModesState(...)
      //   current  the mode the machine is in now ("Laser" | "CNC" | "FFF" | "?" when not read yet)
      //   work     the modes the page serves (["Laser", "CNC"])
      // -> { open, reason }   reason: "ready" (a work mode is on) | "inferred" (nothing answered, but the machine is in a work mode now:
      // the page keeps working for machines set up before the question existed) | "unanswered" | "off" (answered, no work mode) |
      // "elsewhere" (a work mode is on but the machine is in another one now)
      function workshopModesGate(state, current, work) {
        var inWork = work.indexOf(current) >= 0;
        if (!state || !state.answered) return inWork ? { open: true, reason: "inferred" } : { open: false, reason: "unanswered" };
        var on = work.filter(function (m) { return state.answer[m]; });
        if (!on.length) return { open: false, reason: "off" };
        if (current === "?" || on.indexOf(current) >= 0) return { open: true, reason: "ready" };
        return { open: false, reason: "elsewhere" };
      }

      // The steps of the guide, in order, each with whether it is done. Pure.
      //   answer  step: say that the machine does laser or CNC work (an answer: it is applied by the guide itself)
      //   switch  step: the machine has to be in one of those modes (manual: the person switches it, "check" reads the machine again)
      function workshopModesGuideSteps(state, current, work) {
        var on = work.filter(function (m) { return state && state.answered && state.answer[m]; });
        var steps = [{ id: "answer", kind: "apply", done: on.length > 0 }];
        var known = current !== "?" && current !== undefined && current !== null;
        if (on.length > 0 && known && on.indexOf(current) < 0) steps.push({ id: "switch", kind: "manual", done: false, mode: current });
        return steps;
      }

      // Load and save (the profile of the service first, the browser second)
      function workshopModesReadLocal() {
        try {
          return workshopModesFromLocal(JSON.parse(localStorage.getItem(WORKSHOP_MODES_LOCAL_KEY) || "null"));
        } catch (e) {
          return workshopModesEmpty(); // no storage: the question is asked again
        }
      }
      function workshopModesWriteLocal(answer) {
        try {
          var raw = {};
          WORKSHOP_MODES.forEach(function (m) { raw[m.toLowerCase()] = answer[m] === true; });
          localStorage.setItem(WORKSHOP_MODES_LOCAL_KEY, JSON.stringify(raw));
        } catch (e) {
          /* not critical */
        }
      }

      var workshopModes = {
        load: function (force) {
          return workshopProfile.get(force).then(function (snap) {
            var via = !!snap.loaded;
            return {
              state: workshopModesState(via ? workshopModesFromProfile(snap.profile) : null, workshopModesReadLocal()),
              detected: workshopModesDetect(snap.caps),
              profile: via ? snap.profile : null,
              viaService: via,
            };
          });
        },
        save: function (answer, profile) {
          var clean = workshopModesFill(answer);
          return Promise.resolve()
            .then(function () { return workshopApi("profile.set", { changes: workshopModesChanges(clean, profile) }); })
            .then(function () { workshopProfile.reset(); workshopModesWriteLocal(clean); return { viaService: true }; })
            .catch(function () { workshopModesWriteLocal(clean); return { viaService: false }; });
        },
      };
