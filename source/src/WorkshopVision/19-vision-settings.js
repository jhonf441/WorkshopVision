      function tvRenderSettings(tv) {
        var aj = {};

        tvAjProcessing(tv, aj);
        tvAjFire(tv, aj);
        tvAjWhere(tv, aj);
        tvAjPhotos(tv, aj);
        tvAjExposure(tv, aj);
        tvAjLight(tv, aj);
        tvAjCamera(tv, aj);
        if (tvAjZones(tv, aj)) return;
      }

      function tvAjFire(tv, aj) {
        var fu = {};
        // ---- fire and smoke watch (2026-10-10, dsf/fuego.py) ----
        // It only works with a LASER job in progress; the card shows what
        // it sees now (queried every 2 s while the tab is open).
        fu.fz = Object.assign({ active: false, action: "pause", sensitivity: "media", deadline: 10, deadline_flame: 2, smoke_acts: false }, (tv.cfg && tv.cfg.fire) || {});
        fu.cF = tvCard(i18nT('vision.fire_and_smoke_watch'), "fire");
        tv.side.appendChild(fu.cF);
        fu.fireSave = function fireSave(ch) {
          return tvCfgSave(tv, function (c) { c.fire = Object.assign({}, fu.fz, c.fire || {}, ch); return c; }).then(function () { tvRenderSide(tv); }, function (e) { tvFlash(tv, e.message, false); });
        };
        // 2026-10-12 (pending 7): with a job in progress the action,
        // the switch-on, the sensitivity and the deadlines do not change without confirming
        // (Understood checkbox). The service also demands it: a change that did not
        // go through /fuego/confirmar is not valid until the job ends.
        var ACC_TXT = { notify: i18nT('vision.just_warn'), pause: i18nT('vision.pause_the_job'), emergency: i18nT('vision.emergency_stop') };
        fu.fireChangeInJob = function fireChangeInJob(ch) {
          var e = tv.tvFireLast;
          if (!e || !e.in_job) return fu.fireSave(ch);
          var notices = [i18nT('vision.a_laser_job_is_running_the')];
          if (ch.active === false) notices.push(i18nT('vision.warn_watch_off'));
          if (ch.action === "notify") notices.push(i18nT('vision.warn_action_warn'));
          if (ch.action === "pause") notices.push(i18nT('vision.warn_action_pause'));
          if (ch.action === "emergency") notices.push(i18nT('vision.warn_action_emergency'));
          if (ch.sensitivity === "low") notices.push(i18nT('vision.warn_sensitivity_low'));
          if (ch.sensitivity === "high") notices.push(i18nT('vision.warn_sensitivity_high'));
          if (ch.deadline_flame === 0) notices.push(i18nT('vision.warn_flame_countdown_immediate'));
          else if (ch.deadline_flame !== undefined) notices.push(i18nT('vision.warn_flame_countdown_s', { s: ch.deadline_flame }));
          if (ch.deadline !== undefined) notices.push(i18nT('vision.smoke_countdown_s_before_acting', { s: ch.deadline }) + (ch.deadline < 10 ? " " + i18nT('vision.less_time_to_cancel_a_false_alarm') : "."));
          var asks = typeof workshopConfirmLevel4 === "function"
            ? workshopConfirmLevel4({ title: i18nT('vision.change_monitoring_during_the_job'), notices: notices, understood: i18nT('vision.understood_i_want_to_change_it'), button: i18nT('vision.change') })
            : Promise.resolve(false);
          return asks.then(function (ok) {
            if (!ok) return;
            return tvPost("/fire/confirm", ch).then(function () { return fu.fireSave(ch); }, function (er) { tvFlash(tv, i18nT('vision.could_not_confirm_the_change_with_v', { v: String(er.message) }), false); });
          });
        };
        fu.requestFire = function requestFire() {
          if (tv.tab !== "settings" || !fu.estF.isConnected) return;
          tvGet("/fire/state").then(function (e) { tv.tvFireLast = e; tvFirePaint(tv, fu, ACC_TXT, e); }, function (er) { fu.estF.textContent = i18nT('vision.the_watch_does_not_respond_v', { v: String(er.message) }); });
          setTimeout(fu.requestFire, tv.tvFireLast && tv.tvFireLast.count ? 1000 : 2000);
        };
        fu.requestHist = function requestHist() {
          if (!fu.histAcc.open) return;
          tvGet("/fire/record?n=30").then(function (r) {
            fu.histF.innerHTML = "";
            if (!r.events.length) fu.histF.appendChild(tvEl("div", "tv-muted", i18nT('vision.no_events_yet')));
            r.events.forEach(function (ev) {
              var row = tvEl("div", ev.photo ? "f" : null);
              row.appendChild(tvEl("b", null, String(ev.hour || "").slice(5) + " " + (fu.EV_TXT[ev.ev] || ev.ev) + (ev.kind ? " " + (ev.kind === "flame" ? i18nT('vision.flame_caps') : i18nT('vision.smoke_caps')) : "") + (ev.test ? " " + i18nT('vision.test_caps_paren') : "") + ": "));
              row.appendChild(document.createTextNode((ev.done ? ev.done + ". " : "") + (ev.reason || "")));
              if (ev.photo) {
                row.title = i18nT('vision.tap_to_see_the_photo');
                row.addEventListener("click", function () {
                  var im = row.querySelector("img");
                  if (im) { im.remove(); return; }
                  im = tvEl("img");
                  im.style.cssText = "width:100%;border-radius:6px;margin-top:4px;display:block";
                  im.src = tvApi("/fire/photo?f=" + encodeURIComponent(ev.photo));
                  row.appendChild(im);
                });
              }
              fu.histF.appendChild(row);
            });
            fu.histF.appendChild(tvEl("div", "tv-muted", i18nT('vision.full_file_v', { v: String(r.file) })));
          }, function (er) { fu.histF.innerHTML = ""; fu.histF.appendChild(tvEl("div", "tv-muted", i18nT('vision.could_not_read_the_history_v', { v: String(er.message) }))); });
        };
        fu.paintTest = function paintTest(sec) {
          var on = sec > 0;
          if ((fu.testView > 0) === on && fu.testView !== -1) return;
          fu.testView = sec;
          fu.btnTest.innerHTML = "";
          fu.btnTest.appendChild(on
            ? tvIBtn("stop", i18nT('vision.stop_the_test'), "warn", function () { tvPost("/fire/test", { sec: 0 }).then(function () { fu.testView = -1; fu.paintTest(0); }); })
            : tvIBtn("fire-alert", i18nT('vision.live_test_2_min'), null, function () {
                tvPost("/fire/test", { sec: 120 }).then(function () { fu.testView = -1; fu.paintTest(120); }, function (er) { fu.resF.innerHTML = ""; fu.resF.appendChild(tvEl("div", "tv-msg err", i18nT('vision.could_not_start_the_test', { v: er.message }))); }); // without flash(): the notice above the panel pushed the card down; what to do is already said by the card next to the camera
              }, null, i18nT('vision.watches_for_2_minutes_without_a')));
        };
        tvFireEnable(tv, fu, aj);
        tvFireOptions(tv, fu, aj);
        tvFireLive(tv, fu, aj);
        tvFireState(tv, fu, aj);
        tvFireHistory(tv, fu, aj);
      }

      function tvFirePaint(tv, fu, ACC_TXT, e) {
          fu.estF.innerHTML = "";
          var txt = { shutdown: i18nT('vision.off'), waiting: i18nT('vision.waiting_for_a_laser_job'), watching: i18nT('vision.watching'), error: i18nT('vision.error_state') }[e.state] || e.state;
          fu.estF.appendChild(tvEl("span", e.state === "watching" ? "ok" : e.state === "error" ? "warn" : null, txt + (e.detail ? ": " + e.detail : "")));
          if (e.state === "watching") fu.estF.appendChild(tvEl("span", e.threshold_flame && e.flame >= e.threshold_flame ? "warn" : null, i18nT('vision.flame_pct_of_image', { v: (e.flame * 100).toFixed(3), t: ((e.threshold_flame || 0) * 100).toFixed(3) }) + (e.base ? " · " + i18nT('vision.contrast_at_start', { c: e.contrast, b: e.base }) : "")));
          if (e.state === "watching" && e.smoke_level !== undefined) fu.estF.appendChild(tvEl("span", e.smoke_level >= 1 ? "warn" : null, i18nT('vision.smoke_pct_of_threshold', { n: Math.round((e.smoke_level || 0) * 100) }) + (e.smoke_reason ? " (" + e.smoke_reason + ")" : "")));
          if (e.test_s > 0) fu.estF.appendChild(tvEl("span", "warn", i18nT('vision.live_test_s_left', { s: e.test_s })));
          if (e.pending) fu.estF.appendChild(tvEl("span", "warn", i18nT('vision.there_is_a_saved_change_list', { list: Object.keys(e.pending).map(function (k) { return k === "action" ? (ACC_TXT[e.pending[k]] || e.pending[k]) : k === "sensitivity" ? i18nT('vision.sensitivity_v', { v: { low: i18nT('vision.low'), media: i18nT('vision.medium'), high: i18nT('vision.high') }[e.pending[k]] || e.pending[k] }) : k === "deadline" ? i18nT('vision.smoke_countdown_v_s', { v: e.pending[k] }) : k === "deadline_flame" ? i18nT('vision.flame_countdown_v_s', { v: e.pending[k] }) : e.pending[k] ? i18nT('vision.monitoring_on') : i18nT('vision.watch_off'); }).join(", "), current: ACC_TXT[e.action_current] || e.action_current })));
          fu.countF.innerHTML = "";
          if (e.count) {
            var pause = e.count.action === "pause";
            fu.countF.appendChild(tvEl("span", null, i18nT(e.count.kind === "flame" ? 'vision.flame_detected_countdown' : 'vision.smoke_detected_countdown', { action: pause ? i18nT('vision.pauses_the_job') : i18nT('vision.emergency_stop_2'), n: e.count.left })));
            fu.countF.appendChild(tvBtn(pause ? i18nT('common.cancel_the_pause') : i18nT('common.cancel_the_stop'), null, function () {
              tvPost("/fire/cancel", {}).then(function (r) {
                tvFlash(tv, r.cancelled ? (pause ? i18nT('common.cancelled_it_will_not_pause') : i18nT('common.cancelled_it_will_not_stop')) + " " + i18nT('common.it_will_not_act_again_for') : r.reason, !!r.cancelled);
              }, function (er) { tvFlash(tv, i18nT('vision.could_not_cancel_v', { v: String(er.message) }), false); });
            }));
          }
          fu.countF.style.display = e.count ? "" : "none";
          if (e.record_n !== fu.histN) { fu.histN = e.record_n; fu.requestHist(); }
          fu.paintTest(e.test_s || 0);
          if (e.alarm) {
            var hour = new Date(e.alarm.ts * 1000).toLocaleTimeString();
            fu.estF.appendChild(tvEl("span", "warn", i18nT('vision.last_detection_at', { time: hour }) + ": " + e.alarm.text + " -- " + e.alarm.action));
          }
          // camera in view while it watches (2026-10-10: "in the live test the camera did not open and I saw nothing") and the detection's photo
          var show = e.test_s > 0 || e.state === "watching";
          fu.liveF.style.display = show ? "" : "none";
          if (show) {
            // what the watch analyzes, with the flame marked in red in real time
            fu.imgF.src = tvApi("/fire/view.jpg?t=" + Date.now());
            fu.capF.textContent = (e.test_s > 0 ? i18nT('vision.live_camera_bring_the_flame', { s: e.test_s }) : i18nT('vision.live_camera')) + ". " + i18nT('vision.in_red_flame_in_violet_white');
          }
          if (e.alarm && e.alarm.photo && fu.photoOnF.getAttribute("data-id") !== String(e.alarm.photo)) {
            fu.photoOnF.setAttribute("data-id", String(e.alarm.photo));
            fu.photoOnF.src = tvApi("/frame.jpg?view=camera&id=" + encodeURIComponent(e.alarm.photo));
            fu.photoOnF.style.display = "";
            fu.capOnF.textContent = i18nT('vision.photo_of_the_last_detection', { time: new Date(e.alarm.ts * 1000).toLocaleTimeString() });
            fu.capOnF.style.display = "";
          }
        }


      function tvAjWhere(tv, aj) {
        // ---- where the camera goes (2026-10-10: the camera moves to the CARRIAGE) ----
        var cWhere = tvCard(i18nT('vision.where_the_camera_is_mounted'), "crosshairs-gps");
        tv.side.appendChild(cWhere);
        var inCarriage = (tv.cfg && tv.cfg.camera_en) === "carriage";
        var secD = tvEl("div", "tv-sec");
        [["gantry", i18nT('vision.on_the_gantry_follows_y_and')], ["carriage", i18nT('vision.on_the_carriage_follows_x_y')]].forEach(function (o) {
          secD.appendChild(
            tvBtn(o[1], (o[0] === "carriage") === inCarriage ? "on" : null, function () {
              if ((o[0] === "carriage") === inCarriage) return;
              tvCfgSave(tv, function (c) { c.camera_en = o[0]; return c; }).then(function () {
                tvFlash(tv, i18nT('vision.saved_the_camera_is_on_the_v', { v: o[0] === "carriage" ? i18nT('vision.carriage_word') : i18nT('vision.gantry_word') }), true);
              }, function (e) { tvFlash(tv, e.message, false); });
            })
          );
        });
        cWhere.appendChild(secD);
        cWhere.appendChild(tvEl("div", "tv-muted", inCarriage
          ? i18nT(tvHasWorkbench(tv) ? 'vision.on_the_carriage_the_image_follows' : 'vision.on_the_carriage_the_image_follows_no_map')
          : i18nT('vision.on_the_gantry_the_image_follows')));
      }

      function tvAjPhotos(tv, aj) {
        var c7 = tvCard(i18nT('vision.measuring_photos'), "camera-iris");
        tv.side.appendChild(c7);
        aj.fc = (tv.state && tv.state.photo) || {};
        var nf = {};
        var r7 = tvEl("div", "tv-prm");
        c7.appendChild(r7);
        function selFs(k, label, opts) {
          r7.appendChild(tvEl("label", null, label));
          var s = tvEl("select", "tv-sel");
          opts.forEach(function (o) {
            var op = tvEl("option", null, o[1]);
            op.value = String(o[0]);
            if (String(aj.fc[k]) === String(o[0])) op.selected = true;
            s.appendChild(op);
          });
          s.addEventListener("change", function () { nf[k] = parseInt(s.value, 10); });
          r7.appendChild(s);
        }
        selFs("fs", i18nT('vision.measuring_photo'), [[19, i18nT('vision.2048_1536_the_maximum')], [15, "1600×1200"], [14, "1280×1024"], [12, "1024×768"], [11, "800×600"]]);
        selFs("video_fs", i18nT('vision.video_monitoring'), [[11, "800×600"], [10, "640×480"], [12, i18nT('vision.res_1024_768_slow')], [0, i18nT('vision.do_not_touch')]]);
        [["zmin", i18nT('vision.minimum_z_for_photos_mm')], ["overlap", i18nT('vision.mosaic_overlap_0_0_5')], ["edge", i18nT('vision.unused_border_0_0_2')]].forEach(function (f) {
          r7.appendChild(tvEl("label", null, f[1]));
          var inp = tvEl("input", "tv-in");
          inp.type = "number";
          inp.step = "any";
          inp.value = aj.fc[f[0]] === undefined ? "" : aj.fc[f[0]];
          inp.addEventListener("change", function () { nf[f[0]] = parseFloat(inp.value); });
          r7.appendChild(inp);
        });
        c7.appendChild(
          tvIBtn("content-save-outline", i18nT('vision.save'), "small", function () {
            tvCfgSave(tv, function (o) { o.photo = Object.assign({}, o.photo || {}, nf); return o; }).then(function () { tvFlash(tv, i18nT('vision.photo_settings_saved'), true); }, function (e) { tvFlash(tv, e.message, false); });
          })
        );
        c7.appendChild(tvEl("div", "tv-muted", i18nT('vision.calibration_is_per_resolution_if_you')));
      }

      function tvAjExposure(tv, aj) {
        // ---- exposicion de la foto de medicion (vision.py: foto_alta) ----
        var ce = tvCard(i18nT('vision.photo_exposure'), "brightness-6");
        tv.side.appendChild(ce);
        var ne = {};
        var modeE = aj.fc.exposure || "auto";
        var secE = tvEl("div", "tv-sec");
        secE.style.flexWrap = "wrap";
        var bodyE = tvEl("div");
        [["auto", i18nT('vision.automatic_f')], ["adjust", i18nT('vision.adjust_by_itself')], ["compensate", i18nT('vision.compensate')], ["manual", i18nT('vision.manual')]].forEach(function (o) {
          var b = tvBtn(o[1], modeE === o[0] ? "on" : null, function () {
            modeE = ne.exposure = o[0];
            Array.prototype.forEach.call(secE.children, function (x) { x.classList.toggle("on", x === b); });
            paintE();
          });
          secE.appendChild(b);
        });
        ce.appendChild(secE);
        ce.appendChild(bodyE);
        function rowE(label, node) {
          var r = tvEl("div", "tv-prm");
          r.style.marginTop = "8px";
          r.appendChild(tvEl("label", null, label));
          r.appendChild(node);
          bodyE.appendChild(r);
        }
        function numE(k, min, max, step) {
          var inp = tvEl("input", "tv-in");
          inp.type = "number";
          inp.min = min;
          inp.max = max;
          inp.step = step;
          inp.style.width = "100%";
          inp.value = ne[k] !== undefined ? ne[k] : aj.fc[k] !== undefined ? aj.fc[k] : "";
          inp.addEventListener("change", function () { ne[k] = parseFloat(inp.value); });
          return inp;
        }
        function levelE() {
          var s = tvEl("select", "tv-sel");
          [[-2, i18nT('vision.2_darker')], [-1, "-1"], [0, "0"], [1, "+1"], [2, i18nT('vision.2_brighter')]].forEach(function (o) {
            var op = tvEl("option", null, o[1]);
            op.value = String(o[0]);
            if (String(ne.ae_level !== undefined ? ne.ae_level : aj.fc.ae_level || 0) === String(o[0])) op.selected = true;
            s.appendChild(op);
          });
          s.addEventListener("change", function () { ne.ae_level = parseInt(s.value, 10); });
          return s;
        }
        var TEXT_E = {
          auto: i18nT('vision.the_camera_decides_by_itself_as'),
          adjust: i18nT('vision.automatic_but_it_checks_the_photo'),
          compensate: i18nT('vision.automatic_with_a_fixed_level_darker'),
          manual: i18nT('vision.fixed_exposure_time_every_photo_comes'),
        };
        function paintE() {
          bodyE.innerHTML = "";
          bodyE.appendChild(tvEl("div", "tv-muted", TEXT_E[modeE]));
          bodyE.firstChild.style.marginTop = "8px";
          if (modeE === "compensate" || modeE === "adjust") rowE(modeE === "adjust" ? i18nT('vision.starting_level') : i18nT('vision.level'), levelE());
          if (modeE === "adjust") rowE(i18nT('vision.target_brightness_0_255'), numE("brightness_obj", 40, 220, 5));
          if (modeE === "manual") rowE(i18nT('vision.exposure_0_1200'), numE("aec_value", 0, 1200, 10));
        }
        paintE();
        var rE = tvEl("div", "tv-row");
        rE.style.marginTop = "8px";
        ce.appendChild(rE);
        rE.appendChild(
          tvIBtn("content-save-outline", i18nT('vision.save'), "small", function () {
            tvCfgSave(tv, function (o) { o.photo = Object.assign({}, o.photo || {}, ne); return o; }).then(function () { tvFlash(tv, i18nT('vision.exposure_saved_it_applies_to_the'), true); }, function (e) { tvFlash(tv, e.message, false); });
          })
        );
        rE.appendChild(tvEl("span", "tv-muted", i18nT('vision.the_surveillance_video_stays_automatic_it')));
      }

      function tvAjLight(tv, aj) {
        // ---- light for the photo (LuzFoto in vision.py) ----
        var cl = tvCard(i18nT('vision.light_for_the_photo'), "lightbulb-on-outline");
        tv.side.appendChild(cl);
        var zonesSel = (aj.fc.light_zones || []).slice();
        var lightJob = aj.fc.light !== 0 && aj.fc.light !== false;
        function chk(text, on, fn) {
          var lb = tvEl("label", "tv-row");
          lb.style.cursor = "pointer";
          var c = tvEl("input");
          c.type = "checkbox";
          c.checked = on;
          c.addEventListener("change", function () { fn(c.checked); });
          lb.appendChild(c);
          lb.appendChild(tvEl("span", null, text));
          return lb;
        }
        cl.appendChild(chk(i18nT('vision.work_light_the_usual_lighting'), lightJob, function (v) { lightJob = v; }));
        var itemsZ = tvEl("div");
        cl.appendChild(itemsZ);
        itemsZ.appendChild(tvEl("div", "tv-muted", i18nT('vision.reading_the_lights_and_status_zones')));
        workshopApiText("lights.get")
          .then(function (t) {
            var c = JSON.parse(t.slice(t.indexOf("{"))).config || {};
            var zs = [];
            (c.zones_extra || []).forEach(function (z, i) { zs.push([String(i), (z.name || i18nT('vision.zone_n', { n: i + 1 })) + " " + i18nT('vision.main_strip')]); });
            (c.strips_extra || []).forEach(function (tr) {
              (tr.zones || []).forEach(function (z, i) { zs.push(["T" + tr.id + ":" + i, (z.name || i18nT('vision.zone_n', { n: i + 1 })) + " (" + (tr.name || tr.id) + ")"]); });
            });
            itemsZ.innerHTML = "";
            if (!zs.length) {
              itemsZ.appendChild(tvEl("div", "tv-muted", i18nT('vision.there_are_no_extra_light_zones')));
              return;
            }
            itemsZ.appendChild(tvEl("div", "tv-muted", i18nT('vision.extra_zones_turned_on_only_for')));
            zs.forEach(function (z) {
              itemsZ.appendChild(chk(z[1], zonesSel.indexOf(z[0]) !== -1, function (v) {
                zonesSel = zonesSel.filter(function (x) { return x !== z[0]; });
                if (v) zonesSel.push(z[0]);
              }));
            });
          })
          .catch(function () {
            itemsZ.innerHTML = "";
            itemsZ.appendChild(tvEl("div", "tv-muted", i18nT('vision.couldn_t_read_the_lights_and')));
          });
        var rL = tvEl("div", "tv-row");
        rL.style.marginTop = "8px";
        cl.appendChild(rL);
        rL.appendChild(
          tvIBtn("content-save-outline", i18nT('vision.save'), "small", function () {
            tvCfgSave(tv, function (o) { o.photo = Object.assign({}, o.photo || {}, { light: lightJob ? 1 : 0, light_zones: zonesSel }); return o; }).then(function () { tvFlash(tv, i18nT('vision.light_for_the_photo_saved'), true); }, function (e) { tvFlash(tv, e.message, false); });
          })
        );
        cl.appendChild(tvEl("div", "tv-muted", i18nT('vision.only_what_was_off_is_turned')));
      }

      function tvAjCamera(tv, aj) {
        // URL
        var c5 = tvCard(i18nT('vision.camera_group'), "cctv");
        tv.side.appendChild(c5);
        var r5 = tvEl("div", "tv-row");
        c5.appendChild(r5);
        var inU = tvEl("input", "tv-in");
        inU.style.width = "100%";
        inU.value = tv.cfg.url || "http://127.0.0.1:8090/stream";
        r5.appendChild(inU);
        r5.appendChild(tvBtn(i18nT('vision.save'), "small", function () {
          var v = inU.value.trim();
          if (!/^https?:\/\//i.test(v)) return tvFlash(tv, i18nT('vision.it_must_start_with_http'), false);
          tvCfgSave(tv, function (o) { o.url = v; return o; }).then(function () { tvFlash(tv, i18nT('vision.saved_if_it_is_another_camera'), true); });
        }));
        c5.appendChild(tvEl("div", "tv-muted", i18nT('vision.camera_source_help')));
      }

      function tvAjZones(tv, aj) {
        // Work zones: the only place where the camera is enabled for the
        // map (request 2026-10-10). WorkshopJog reads mapa.use / mapa.opacity
        // from this same file and uses this address and this calibration; in
        // the map only the Camera layer remains to show or hide it.
        // this card is only about the Workbench map: nothing of it without that plugin (last card of the page)
        if (!tvHasWorkbench(tv)) return true;
        var mp = tv.cfg.map || {};
        var c8 = tvCard(i18nT('vision.work_zones_map'), "map-outline");
        tv.side.appendChild(c8);
        var zt = tvEl("span", "tv-toggle" + (mp.use ? " on" : ""));
        zt.appendChild(tvEl("span", "sw"));
        zt.appendChild(tvEl("span", null, mp.use ? i18nT('vision.the_video_shows_under_the_map') : i18nT('vision.not_used_on_the_map')));
        zt.addEventListener("click", function () { tv.btnZones.click(); });
        c8.appendChild(zt);
        var r6 = tvEl("div", "tv-row");
        r6.style.marginTop = "10px";
        c8.appendChild(r6);
        r6.appendChild(tvEl("span", "tv-muted", i18nT('vision.opacity_on_the_zones_map')));
        var inO = tvEl("input");
        inO.type = "range";
        inO.min = "0.2";
        inO.max = "1";
        inO.step = "0.05";
        inO.value = String(mp.opacity >= 0.1 && mp.opacity <= 1 ? mp.opacity : 0.75);
        inO.addEventListener("change", function () {
          var v = parseFloat(inO.value);
          tvCfgSave(tv, function (o) { o.map = Object.assign({}, o.map || {}, { opacity: v }); return o; });
        });
        r6.appendChild(inO);
        c8.appendChild(tvEl("div", "tv-muted", i18nT('vision.aligned_with_the_calibration_here_and')));
      }

      function tvFireEnable(tv, fu, aj) {
        var tgF = tvEl("span", "tv-toggle" + (fu.fz.active ? " on" : ""));
        tgF.appendChild(tvEl("span", "sw"));
        tgF.appendChild(tvEl("span", null, i18nT('vision.watch_during_laser_jobs')));
        tgF.appendChild(tvEl("b", "est", fu.fz.active ? i18nT('vision.yes') : i18nT('vision.no')));
        tgF.addEventListener("click", function () { if (fu.fz.active) fu.fireChangeInJob({ active: false }); else fu.fireSave({ active: true }); });
        fu.cF.appendChild(tgF);
        fu.cF.appendChild(tvEl("div", "tv-muted", i18nT('vision.while_a_laser_job_runs_the')));
        // usage notice (request 2026-10-10: "I put a candle and it detected nothing;
        // put a usage notice on those functions")
        var useF = tvAcc(tv, "fire-use", i18nT('vision.how_it_works_and_its_limits'), "information-outline", i18nT('vision.read_it_before_relying_on_it'), null, false);
        fu.cF.appendChild(useF.el);
        if (useF.open) {
          [
            [i18nT('vision.when_it_watches'), i18nT('vision.only_with_a_laser_job_running')],
            [i18nT('vision.what_it_detects'), i18nT('vision.flame_very_bright_orange_or_yellow')],
            [i18nT('vision.countdown'), i18nT('vision.countdown_help')],
            [i18nT('vision.changes_during_a_job'), i18nT('vision.with_a_job_running_changing_the')],
            [i18nT('vision.what_it_does_not_detect'), i18nT('vision.the_camera_looks_at_the_bed')],
            [i18nT('vision.how_to_test_it'), i18nT('vision.test_with_the_current_image_shows')],
            [i18nT('vision.limit'), i18nT('vision.it_s_an_aid_not_a')],
          ].forEach(function (q) {
            var d = tvEl("div", "tv-pre");
            d.appendChild(tvEl("b", null, q[0] + ": "));
            d.appendChild(document.createTextNode(q[1]));
            useF.body.appendChild(d);
          });
        }
      }

      function tvFireOptions(tv, fu, aj) {
        fu.cF.appendChild(tvEl("div", "tv-lbl", i18nT('vision.on_detection')));
        var secA = tvEl("div", "tv-sec");
        [["notify", i18nT('vision.just_warn')], ["pause", i18nT('vision.pause_the_job')], ["emergency", i18nT('vision.emergency_stop')]].forEach(function (o) {
          secA.appendChild(tvBtn(o[1], fu.fz.action === o[0] ? "on" : null, function () { if (fu.fz.action !== o[0]) fu.fireChangeInJob({ action: o[0] }); }));
        });
        fu.cF.appendChild(secA);
        fu.cF.appendChild(tvEl("div", "tv-muted", fu.fz.action === "emergency"
          ? i18nT('vision.emergency_stop_m112_cuts_everything_at')
          : fu.fz.action === "pause"
            ? i18nT('vision.pause_m25_stops_a_file_job')
            : i18nT('vision.it_only_logs_and_notifies_the')));
        if (fu.fz.action !== "notify") {
          var pause = fu.fz.action === "pause";
          fu.cF.appendChild(tvEl("div", "tv-lbl", pause ? i18nT('vision.flame_countdown_before_pausing') : i18nT('vision.flame_countdown_before_cutting')));
          var secL = tvEl("div", "tv-sec");
          [[0, i18nT('vision.immediate')], [2, "2 s"], [3, "3 s"]].forEach(function (o) {
            secL.appendChild(tvBtn(o[1], Number(fu.fz.deadline_flame) === o[0] ? "on" : null, function () { if (Number(fu.fz.deadline_flame) !== o[0]) fu.fireChangeInJob({ deadline_flame: o[0] }); }));
          });
          fu.cF.appendChild(secL);
          fu.cF.appendChild(tvEl("div", "tv-muted", i18nT('vision.it_is_a_real_fire_it')));
          var tgH = tvEl("span", "tv-toggle" + (fu.fz.smoke_acts ? " on" : ""));
          tgH.appendChild(tvEl("span", "sw"));
          tgH.appendChild(tvEl("span", null, pause ? i18nT('vision.with_smoke_only_no_flame_also') : i18nT('vision.with_smoke_only_no_flame_also_2')));
          tgH.appendChild(tvEl("b", "est", fu.fz.smoke_acts ? i18nT('vision.yes') : i18nT('vision.no')));
          tgH.addEventListener("click", function () { fu.fireSave({ smoke_acts: !fu.fz.smoke_acts }); });
          fu.cF.appendChild(tgH);
          fu.cF.appendChild(tvEl("div", "tv-muted", i18nT('vision.smoke_is_easier_to_mistake_than')));
          if (fu.fz.smoke_acts) {
            fu.cF.appendChild(tvEl("div", "tv-lbl", i18nT('vision.smoke_countdown_before_acting')));
            var secP = tvEl("div", "tv-sec");
            [5, 10, 20, 30].forEach(function (n) {
              secP.appendChild(tvBtn(n + " s", Number(fu.fz.deadline) === n ? "on" : null, function () { if (Number(fu.fz.deadline) !== n) fu.fireChangeInJob({ deadline: n }); }));
            });
            fu.cF.appendChild(secP);
            fu.cF.appendChild(tvEl("div", "tv-muted", i18nT('vision.time_to_cancel_if_it_is')));
          }
        }
        fu.cF.appendChild(tvEl("div", "tv-lbl", i18nT('vision.sensitivity')));
        var secS = tvEl("div", "tv-sec");
        [["low", i18nT('vision.low')], ["media", i18nT('vision.medium')], ["high", i18nT('vision.high')]].forEach(function (o) {
          secS.appendChild(tvBtn(o[1], fu.fz.sensitivity === o[0] ? "on" : null, function () { if (fu.fz.sensitivity !== o[0]) fu.fireChangeInJob({ sensitivity: o[0] }); }));
        });
        fu.cF.appendChild(secS);
        fu.cF.appendChild(tvEl("div", "tv-muted", i18nT('vision.high_warns_earlier_smaller_flame_less')));
      }

      function tvFireLive(tv, fu, aj) {
        fu.countF = tvEl("div", "tv-count");
        fu.countF.setAttribute("role", "alert");
        fu.countF.style.display = "none";
        fu.cF.appendChild(fu.countF);
        fu.estF = tvEl("div", "tv-info");
        fu.cF.appendChild(fu.estF);
        fu.liveF = tvEl("div");
        fu.liveF.style.display = "none";
        fu.capF = tvEl("div", "tv-muted");
        fu.imgF = tvEl("img");
        fu.imgF.style.cssText = "width:100%;aspect-ratio:4/3;object-fit:contain;background:#000;border-radius:6px;margin-top:4px";
        fu.liveF.appendChild(fu.capF);
        fu.liveF.appendChild(fu.imgF);
        fu.cF.appendChild(fu.liveF);
        fu.capOnF = tvEl("div", "tv-muted");
        fu.capOnF.style.display = "none";
        fu.photoOnF = tvEl("img");
        fu.photoOnF.style.cssText = "width:100%;border-radius:6px;margin-top:4px;display:none";
        fu.cF.appendChild(fu.capOnF);
        fu.cF.appendChild(fu.photoOnF);
        fu.resF = tvEl("div");
        fu.cF.appendChild(fu.resF);
      }

      function tvFireState(tv, fu, aj) {

      }

      function tvFireHistory(tv, fu, aj) {
        // history (sys/workshop/data/vision-fire-log.jsonl): each detection,
        // countdown, cancellation, pause and change with a job in progress
        fu.histN = -1;
        fu.EV_TXT = { detection: i18nT('vision.detection'), notice: i18nT('vision.warning'), count: i18nT('vision.countdown'), act: i18nT('vision.action'), cancelled: i18nT('vision.cancelled'), ignored: i18nT('vision.ignored_waiting'), change_unconfirmed: i18nT('vision.unconfirmed_change'), change_confirmed: i18nT('vision.confirmed_change') };
        fu.histAcc = tvAcc(tv, "fire-hist", i18nT('vision.monitoring_history'), "history", i18nT('vision.latest_detections_and_pauses_with_the'), null, false);
        fu.histF = tvEl("div", "tv-hist");
        fu.requestFire();
        fu.cF.appendChild(
          tvIBtn("camera-outline", i18nT('vision.test_with_the_current_image'), null, function () {
            fu.resF.innerHTML = "";
            fu.resF.appendChild(tvEl("div", "tv-muted", i18nT('vision.measuring')));
            tvPost("/fire/probe", {}).then(function (r) {
              fu.resF.innerHTML = "";
              var pct = r.threshold_flame ? Math.round((r.flame / r.threshold_flame) * 100) : 0;
              fu.resF.appendChild(tvEl("div", r.would_see_flame ? "tv-msg err" : "tv-msg ok",
                (r.would_see_flame ? i18nT('vision.with_this_image_it_would_see') : i18nT('vision.no_flame_in_this_image')) + " " + i18nT('vision.flame_test_result', { img: (r.flame * 100).toFixed(3), pct: pct, thr: (r.threshold_flame * 100).toFixed(3), px: r.stain_px }) + (r.laser_px ? i18nT('vision.laser_dot_in_light_blue') : "") + "."));
              if (r.would_see_flame) fu.resF.appendChild(tvEl("div", "tv-muted", i18nT('vision.to_warn_it_must_last', { s: r.sec })));
              if (r.white_px) fu.resF.appendChild(tvEl("div", "tv-muted", i18nT('vision.in_violet_very_bright_white', { px: r.white_px, pct: Math.round((r.white_frac / r.threshold_flame) * 100) })));
              if (r.would_not_alarm_by && r.would_not_alarm_by.length) fu.resF.appendChild(tvEl("div", "tv-muted", i18nT('vision.would_not_warn_now_because', { reasons: r.would_not_alarm_by.join(", ") })));
              var im = tvEl("img");
              im.src = tvApi("/frame.jpg?view=camera&id=" + encodeURIComponent(r.photo) + "&t=" + Date.now());
              im.style.cssText = "width:100%;border-radius:6px;margin-top:6px";
              fu.resF.appendChild(im);
            }, function (er) {
              fu.resF.innerHTML = "";
              fu.resF.appendChild(tvEl("div", "tv-msg err", i18nT('vision.could_not_test_v', { v: String(er.message) })));
            });
          }, null, i18nT('vision.measures_the_camera_image_now_without'))
        );
        fu.btnTest = tvEl("span");
        fu.cF.appendChild(fu.btnTest);
        fu.testView = -1;
        fu.paintTest(0);
        fu.cF.appendChild(fu.histAcc.el);
        if (fu.histAcc.open) { fu.histAcc.body.appendChild(fu.histF); fu.requestHist(); }
      }
