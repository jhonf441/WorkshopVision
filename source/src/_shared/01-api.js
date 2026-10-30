      // ---- Client of the central API (2026-10-13) ----
      // The JS plugins call named operations over the HTTP endpoint of the plugin
      //   POST /machine/<WorkshopService | WorkshopRS485>/api  {op, args, confirm, origin}
      // Same logic for the Vue pages in vue/_shared/workshop-api.js: keep them equal.
      // Design: WorkshopService/docs/api/DESIGN.md; external use: docs/api/README.md.
      //
      //   workshopApi("lights.get").then(cfg => ...)              result (object) or message (text)
      //   workshopApi("motors.disable", { axes: ["X"] }, { confirm: true })
      //   workshopRequestMotion(PLUGIN_ID, "move").then(ok => { if (ok) postCode("G28") })
      // Errors reject with an Error carrying .code (unknown_op, invalid_args,
      // confirm_required, motion_denied, failed, service_outdated, unavailable,
      // cancelled...). Retries of a restarting service are silent; opts.onRetry(n, total) lets a page say "reconnecting" (no change to the
      // retries or their timing). A confirmation asked by the service is shown here (level 3 or
      // 4 dialog of 00-core.js / 04-warnings.js) and the call is repeated.

      var WORKSHOP_API_RETRIES = 6; // service restarting: 502/503 from DWS without JSON
      var WORKSHOP_API_RETRY_MS = 2500;
      // English fallbacks; the localized texts are registered by WorkshopService
      // (plugins.WorkshopService.api.*, official DWC localization)
      var WORKSHOP_API_EN = {
        cancel: "Cancel",
        continue: "Continue",
        understood: "I understand, continue",
        cancelled: "Cancelled",
        outdated: "WorkshopService has to be updated: this page uses its API.",
        unavailable: "WorkshopService is not running.",
        confirmTitle: "Confirm",
        checkbox: "I understand the risk",
        pinTitle: "Identify yourself",
        pinHint: "Your name and PIN, given by the administrator.",
        pinName: "Name",
        pinPin: "PIN",
        pinEnter: "Enter",
        pinMissing: "Write your name and PIN.",
        pinWrong: "Wrong name or PIN.",
        loginCancelled: "Identification is needed to continue.",
        signInNeeded: "This action needs you to sign in.",
        signedOut: "Not signed in: you can only look.",
        signInAction: "Sign in",
        forbidden_role: "Your role ({role}) does not allow this: {needed} is needed.",
        forbidden_mode: "Your role cannot operate in {mode} mode: ask the administrator to enable it.",
        forbidden_mode_unknown: "The mode of the machine is not known and your role only operates some modes.",
        forbidden_camera: "Your role is not allowed to see the camera.",
        role_viewer: "Visitor",
        role_operator: "Operator",
        role_technician: "Technician",
        role_admin: "Administrator",
      };

      function workshopApiT(key, params) {
        var k = "plugins.WorkshopService.api." + key;
        var own = workshopHostTranslate(k, params);
        if (own !== null) return own;
        return (WORKSHOP_API_EN[key] || key).replace(/\{(\w+)\}/g, function (m, n) {
          return params && params[n] !== undefined ? params[n] : m;
        });
      }

      function workshopApiLanguage() {
        return String(workshopHostLocale() || "en").slice(0, 2);
      }

      // {es: {...}, en: {...}} sent by the service -> the one of the DWC language
      function workshopApiChoose(texts) {
        if (!texts) return null;
        return texts[workshopApiLanguage()] || texts.en || texts.es || null;
      }

      function workshopApiError(code, message, cuerpo) {
        var e = new Error(message || code);
        e.code = code;
        e.body = cuerpo || null;
        return e;
      }

      function workshopApiOrigin() {
        var sec = String((window.location && window.location.pathname) || "").split("/").filter(Boolean);
        var n = (typeof PLUGIN_ID === "string" && PLUGIN_ID) || sec[sec.length - 1] || "page";
        return String(n).replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 40);
      }

      // true when the DSF plugin of that key is in the object model with a running process (same rule as pluginRunning of vue/_shared/workshop-api.js)
      function workshopApiPluginRunning(key) {
        try {
          var p = workshopPluginOf(workshopPluginsModel(), key);
          return !!(p && p.pid > 0);
        } catch (e) {
          return false;
        }
      }

      // One HTTP call, no dialogs. Resolves the JSON body (ok true or false).
      function workshopApiCall(op, args, opts, attempt) {
        opts = opts || {};
        attempt = attempt || 0;
        var key = opts.plugin || (String(op).indexOf("rs485.") === 0 ? "rs485" : "service");
        var url = "/machine/" + workshopIdInstalled(key) + "/api";
        var h = Object.assign({ "Content-Type": "application/json" }, workshopAuthHeaders()); // who (session token) and which browser
        if (window.__workshopSession) h["X-Session-Key"] = window.__workshopSession;
        var cuerpo = JSON.stringify({ op: op, args: args || {}, confirm: !!opts.confirm, origin: opts.origin || workshopApiOrigin(), lang: workshopApiLanguage() });
        function otraVez() {
          // opts.onRetry(n, total): the page may say "reconnecting"; it changes neither the retries nor their timing
          if (typeof opts.onRetry === "function") {
            try {
              opts.onRetry(attempt + 1, WORKSHOP_API_RETRIES);
            } catch (e) {
              /* a page callback must not break the retry */
            }
          }
          return new Promise(function (r) {
            setTimeout(r, WORKSHOP_API_RETRY_MS);
          }).then(function () {
            return workshopApiCall(op, args, opts, attempt + 1);
          });
        }
        return fetch(url, { method: "POST", headers: h, body: cuerpo }).then(
          function (r) {
            return r
              .json()
              .catch(function () {
                return null;
              })
              .then(function (j) {
                if (j && typeof j === "object" && "ok" in j) {
                  j.status = r.status;
                  return j;
                }
                // DWS has no such endpoint: OUTDATED only when the plugin is installed and running; missing or stopped is just unavailable
                if (r.status === 404 && workshopApiPluginRunning(key)) throw workshopApiError("service_outdated", workshopApiT("outdated"));
                if ((r.status === 500 || r.status === 502 || r.status === 503) && attempt < WORKSHOP_API_RETRIES) return otraVez();
                throw workshopApiError("unavailable", workshopApiT("unavailable") + " (HTTP " + r.status + ")");
              });
          },
          function () {
            if (attempt < WORKSHOP_API_RETRIES) return otraVez();
            throw workshopApiError("unavailable", workshopApiT("unavailable"));
          }
        );
      }

      // Confirmation asked by the service: c = error.confirm {level, texts, reason}
      function workshopApiConfirm(c, textLoose, what) {
        c = c || {};
        var t = workshopApiChoose(c.texts) || {};
        var reason = workshopServiceText(c.reason);
        var title = t.title || workshopApiT("confirmTitle");
        var text = [t.text, reason].filter(Boolean).join(" ") || textLoose || (typeof workshopConfirmDetail === "function" ? workshopConfirmDetail(what) : "");
        if (c.level >= 4 && typeof workshopConfirmLevel4 === "function") {
          return workshopConfirmLevel4({ title: title, notices: [text], understood: workshopApiT("checkbox"), button: workshopApiT("continue") });
        }
        if (typeof workshopConfirmRisk === "function") return workshopConfirmRisk({ title: title, text: text });
        return Promise.resolve(window.confirm(title + "\n\n" + text));
      }

      // Calls an operation: resolves result (if any) or message; rejects Error(.code). A 401 login_required asks for name and PIN
      // (one floating dialog) and repeats the call once; a 403 rejects with a message of the language of the page (.key).
      function workshopApi(op, args, opts) {
        opts = opts || {};
        var byPerson = opts.byPerson !== undefined ? opts.byPerson : workshopAuthRecentGesture(); // started by a touch: if it fails, the person is told
        function fail(err) {
          if (byPerson && !opts.quiet && typeof workshopToast === "function") workshopToast(err.message);
          return err;
        }
        var sentToken = workshopAuthToken(); // the session this call went out with
        return workshopApiCall(op, args, opts).then(function (j) {
          if (j.ok) return j.result !== null && j.result !== undefined ? j.result : j.message;
          var e = j.error || {};
          // No session: a 401 (nothing allowed) or a 403 of the visitor role (anonymous viewer) both mean "sign in first"
          if ((e.code === "login_required" || (e.code === "forbidden" && workshopSignedOut())) && !opts.noLogin && !opts.retried) {
            // The person signed in while this call was in flight (another plugin's dialog): repeat it with the new session, do not ask twice
            var already = workshopAuthToken() && workshopAuthToken() !== sentToken ? Promise.resolve(true) : workshopAuthAsk(workshopApiCall, false);
            return already.then(function (ok) {
              if (!ok) throw fail(workshopApiError("login_required", workshopApiT("signInNeeded"), j));
              return workshopApi(op, args, Object.assign({}, opts, { retried: true, byPerson: byPerson }));
            });
          }
          if (e.code === "forbidden") throw fail(workshopApiForbidden(e, j));
          if (e.code === "confirm_required" && !opts.confirm && !opts.withoutDialog) {
            return workshopApiConfirm(e.confirm, e.message, op).then(function (ok) {
              if (!ok) throw workshopApiError("cancelled", workshopApiT("cancelled"), j);
              return workshopApi(op, args, Object.assign({}, opts, { confirm: true }));
            });
          }
          var msg = e.message || e.code; // already in the language this page asked for
          throw workshopApiError(e.code || "error", msg, j);
        });
      }

      // Like workshopApi but resolves the text of the answer (JSON text or message)
      // and errors as "Error: <message>", for code that parses them.
      function workshopApiText(op, args, opts) {
        return workshopApi(op, args, opts).then(
          function (r) {
            return typeof r === "string" ? r : JSON.stringify(r);
          },
          function (e) {
            if (e && e.code === "cancelled") throw e;
            return "Error: " + (e && e.message ? e.message : e);
          }
        );
      }

      // ---- single owner of the movement (WorkshopService motion_owner.py) ----

      // data.motion published by the service (from the DWC store, no request)
      function workshopMotion() {
        var p = workshopPluginOf(workshopPluginsModel(), "service");
        var d = workshopPluginData(p);
        return (d && d.motion) || null;
      }

      // Reason why the owner blocks a move right now for a page ("" = it does not):
      // a reservation of somebody else, or orders of the G-code bridge. propios =
      // origins that are this page itself (its own reservation does not block it).
      function workshopMotionBlock(own) {
        var m = workshopMotion();
        if (!m) return "";
        own = own || [];
        // the owner of one of this page's own origins but ANOTHER device (07-control-holder.js) blocks too
        if (m.owner && m.owner.origin && (own.indexOf(m.owner.origin) === -1 || (m.owner.device && !workshopControlMine(m.owner)))) return workshopServiceText(m.owner.reason) || m.owner.origin;
        if (m.state === "bridge_active") return workshopMotionReason(m) || "bridge";
        return "";
      }

      // published data: {key, params}; an API answer: the text in the language this page asked for
      function workshopMotionReason(m) {
        if (!m) return "";
        return workshopServiceText(m.reason);
      }

      // Before moving: resolves true (allowed, after a confirmation if needed) or
      // false (cancelled); rejects Error(.code "motion_denied") with the reason.
      // Without the service it resolves true (the page keeps its own checks).
      function workshopRequestMotion(origin, action, text, info) {
        var a = { origin: origin || workshopApiOrigin(), action: action || "move", text: text || "" };
        return workshopApi("motion.ask", a, { withoutDialog: true }).then(
          function (j) {
            if (j.decision === "allow") return true;
            var reason = workshopServiceText(j.reason);
            if (j.decision === "confirm") {
              return workshopApiConfirm({ level: 3, reason: j.reason }, reason, a.text).then(function (ok) {
                if (!ok) return false;
                if (info) info.confirmed = true; // the person accepted the panel: the caller may skip its own question
                return workshopApi("motion.ask", a, { confirm: true, withoutDialog: true }).then(function (k) {
                  return k.decision === "allow";
                });
              });
            }
            throw workshopApiError("motion_denied", reason, j);
          },
          function (e) {
            if (e && (e.code === "service_outdated" || e.code === "unavailable")) return true;
            throw e;
          }
        );
      }

      // Reservation for a long sequence: resolves {token, renovar(), soltar()}.
      function workshopReserveMotion(origen, accion, texto, segundos) {
        segundos = segundos || 60;
        return workshopApi("motion.reserve", { origin: origen || workshopApiOrigin(), action: accion || "sequence", text: texto || "", seconds: segundos }).then(function (r) {
          if (r.decision !== "allow") throw workshopApiError("motion_denied", workshopServiceText(r.reason), r);
          var token = r.token;
          return {
            token: token,
            renew: function (s) {
              return workshopApi("motion.renew", { token: token, seconds: s || segundos });
            },
            release: function () {
              return workshopApi("motion.release", { token: token }).catch(function () {});
            },
          };
        });
      }

      // Who uses this browser, and the start of the session keepalive (the identity is also in workshopIdentity()).
      function workshopWhoami() {
        return workshopAuthRefresh(workshopApiCall);
      }

      function workshopChangePin(oldPin, newPin) {
        return workshopApi("auth.change_pin", { old_pin: oldPin, new_pin: newPin });
      }

      (function () {
        if (typeof window === "undefined" || (window.__workshopAuth && window.__workshopAuth.booted)) return;
        workshopAuthState().booted = true;
        workshopAuthKeepalive(workshopApiCall);
        workshopAuthRefresh(workshopApiCall).catch(function () {}); // so workshopCan() knows the role from the start
      })();
