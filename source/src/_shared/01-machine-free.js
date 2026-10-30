      // ---- Is the machine free to move / to change settings? (2026-10-12) ----
      // Motion audit (docs-internal/AUDITORIA-MOTION.md, stage
      // 2.0, findings 5-8): each page had its own block and almost all
      // looked only at the FILE job; with a live job being sent
      // live (plugins.WorkshopService.data.liveJob) the origin, the mode or the
      // microstep could be changed in the middle of the job. A single
      // answer, with the reason written for the disabled button:
      //
      //   workshopMachineFree(estado, op) -> { libre, codigo, motivo }
      //     estado  copy of workshopStateDwc() (shape of /machine/status) or the
      //             store's model (plugins as Map); without state = no
      //             connection. If omitted, workshopStateDwc() is read.
      //     op.purpose "mover" (default) or "settings" (origin, zones, mode,
      //             microstep, current: what changes how the job comes out;
      //             with the supply off it is allowed).
      //     op.allowBusy  true = "busy" does not block (another short order in
      //             progress). By default it blocks.
      //     op.now  current time in ms (only for tests).
      //   codes: sinConexion, archivo, pausado, vivo, liveStill, detenida,
      //   ocupada. With confirmar:true (only liveStill) libre is false but the
      //   page can continue if the user confirms with a second double tap
      //   with the reason in view (only on the page: the service is not notified).
      //
      // User decisions (2026-10-12, AUDITORIA 4.8):
      //  - PAUSED file job: "mover" is free (RRF saves the
      //    positions and recovers them on resume; code "pausado" with a notice);
      //    "settings" stays blocked (changing origins throws off the resume).
      //  - Live job: with recent activity (lastActivity < 20 s) or the
      //    machine busy, blocked (the bridge came to wait 15 s per line);
      //    still for more than 20 s, "mover" asks for confirmation; "settings" stays blocked.
      //    Without a readable lastActivity it is treated as recent (the safe way).
      // 2026-10-13: also the view of the single owner of the movement of
      // WorkshopService (data.motion): a reservation of another page or program
      // (codigo "reservada") and orders of the G-code bridge (codigo "puente")
      // block too, with the reason the service publishes. op.origin = who asks
      // (its own reservation does not block it).
      // It is the same table as vue/_shared/machine-free.js (the Vue pages);
      // tests/machine-free.test.js checks that they say the same.
      var WORKSHOP_LIVE_STILL_MS = 20000;
      var WORKSHOP_STATES_FILE = ["processing", "simulating", "pausing", "resuming", "cancelling"];
      var WORKSHOP_STATES_STOPPED = ["halted", "off", "disconnected", "starting", "updating", "flashing"];

      function workshopJobInLive(state) {
        var pl = state && state.plugins;
        var ids = ["WorkshopService"];
        for (var i = 0; pl && i < ids.length; i++) {
          var p = typeof pl.get === "function" ? pl.get(ids[i]) : pl[ids[i]];
          var dd = workshopPluginData(p);
          var v = dd && dd.liveJob;
          if (v && v.active) return v;
        }
        return null;
      }

      // lastActivity: ISO ("2026-10-12T10:30:00") o epoch en segundos/ms -> ms, o 0
      function workshopHourActivity(v) {
        if (typeof v === "number") return v > 1e11 ? v : v * 1000;
        var t = v ? Date.parse(String(v)) : NaN;
        return isFinite(t) ? t : 0;
      }

      function workshopOwnerMotion(state) {
        var pl = state && state.plugins;
        var ids = ["WorkshopService"];
        for (var i = 0; pl && i < ids.length; i++) {
          var p = typeof pl.get === "function" ? pl.get(ids[i]) : pl[ids[i]];
          var dm = workshopPluginData(p);
          if (dm && dm.motion) return dm.motion;
        }
        return null;
      }

      function workshopMachineFree(estado, op) {
        op = op || {};
        if (estado === undefined && typeof workshopStateDwc === "function") estado = workshopStateDwc();
        var s = estado && estado.state && estado.state.status;
        if (!s) return { free: false, code: "sinConexion", reason: i18nT('machineFree.no_connection_to_the_machine') };
        var arch = (estado.job && estado.job.file && estado.job.file.fileName) || "";
        var nombre = arch ? String(arch).split("/").pop() : "";
        if (WORKSHOP_STATES_FILE.indexOf(s) !== -1 || (s === "changingTool" && arch))
          return { free: false, code: "file", reason: i18nT('machineFree.a_job_is_running_2', { name: nombre ? ": " + nombre : "" }) };
        if (s === "paused") {
          if (op.purpose === "settings")
            return { free: false, code: "paused", reason: i18nT('machineFree.a_job_is_paused_resume_or', { name: nombre ? ": " + nombre : "" }) };
          return { free: true, code: "paused", reason: "", notice: i18nT('machineFree.a_job_is_paused_when_resumed', { name: nombre ? ": " + nombre : "" }) };
        }
        var dueno = workshopOwnerMotion(estado);
        if (dueno && dueno.owner && dueno.owner.origin && dueno.owner.origin !== op.origin)
          return { free: false, code: "reserved", reason: workshopServiceText(dueno.owner.reason) || dueno.owner.origin };
        // Movement lock settings of the service (Services page): "duet" = like Duet / DWC, a live job and the bridge do not block
        // MOVING (settings stay protected); release_s = quiet seconds that free the movement (default 20).
        var aj = (dueno && dueno.settings) || {};
        var asDuet = aj.mode === "duet" && op.purpose !== "settings";
        var stillMs = typeof aj.release_s === "number" && aj.release_s > 0 ? aj.release_s * 1000 : WORKSHOP_LIVE_STILL_MS;
        if (dueno && dueno.state === "bridge_active" && op.purpose !== "settings" && !asDuet)
          return { free: false, code: "bridge", reason: workshopServiceText(dueno.reason) };
        var live = asDuet ? null : workshopJobInLive(estado);
        if (live) {
          var nv = i18nT('machineFree.there_is_a_live_job_open_2', { name: live.name && !workshopDefaultKey(live.name, ["svc.live_job_default_name"]) ? ": " + live.name : "" });
          var ahora = op.now || Date.now();
          var last = workshopHourActivity(live.lastActivity);
          var still = last > 0 && ahora - last > stillMs && s !== "busy";
          if (op.purpose !== "settings" && still)
            return { free: false, confirm: true, code: "liveStill", reason: i18nT('machineFree.idle_for_s_if_the_program', { nv: nv, s: Math.round((ahora - last) / 1000) }) };
          return { free: false, code: "live", reason: nv };
        }
        if (WORKSHOP_STATES_STOPPED.indexOf(s) !== -1 && !(s === "off" && op.purpose === "settings"))
          return { free: false, code: "halted", reason: i18nT('machineFree.the_machine_is_not_ready_2', { s: s }) };
        if (s !== "idle" && s !== "off" && !(s === "busy" && (op.allowBusy || asDuet)))
          return { free: false, code: "busy", reason: i18nT('machineFree.the_machine_is_busy_with_another') };
        return { free: true, code: "", reason: "" };
      }
