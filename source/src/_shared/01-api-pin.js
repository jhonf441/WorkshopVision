      // ---- Floating sign that asks for name and PIN (F1-A of the redesign, 2026-10-21) ----
      // It appears only when the service answers 401 login_required; one dialog serves every caller (01-api-auth.js). Look of the
      // floating panels of DESIGN.md: dark window #1e272c, text #eceff1, secondary #b0bec5, main button #1976d2, error text #ef9a9a.
      // Same code for the Vue pages in vue/_shared/pin-dialog.js: keep them equal.
      //
      //   workshopPinDialog(login, t) -> Promise<boolean>   login(name, pin) resolves null (logged in) or { message, wait_s } (refused)

      var WORKSHOP_PIN_NAME_KEY = "workshop-last-user";
      // Length of the PIN each person typed the last time it worked, in this browser only: when that many digits are typed the sign
      // enters by itself (no Enter). The service is never asked how long the PIN is; a wrong automatic try forgets the length.
      var WORKSHOP_PIN_LEN_KEY = "workshop-pin-len:";

      function workshopPinEl(tag, css, text) {
        var e = document.createElement(tag);
        if (css) e.style.cssText = css;
        if (text !== undefined) e.textContent = text;
        return e;
      }

      var WORKSHOP_PIN_LOCK = "M12,17A2,2 0 0,0 14,15C14,13.89 13.1,13 12,13A2,2 0 0,0 10,15A2,2 0 0,0 12,17M18,8A2,2 0 0,1 20,10V20A2,2 0 0,1 18,22H6A2,2 0 0,1 4,20V10C4,8.89 4.9,8 6,8H7V6A5,5 0 0,1 12,1A5,5 0 0,1 17,6V8H18M12,3A3,3 0 0,0 9,6V8H15V6A3,3 0 0,0 12,3Z";
      var WORKSHOP_PIN_EYE = "M12,9A3,3 0 0,0 9,12A3,3 0 0,0 12,15A3,3 0 0,0 15,12A3,3 0 0,0 12,9M12,17A5,5 0 0,1 7,12A5,5 0 0,1 12,7A5,5 0 0,1 17,12A5,5 0 0,1 12,17M12,4.5C7,4.5 2.73,7.61 1,12C2.73,16.39 7,19.5 12,19.5C17,19.5 21.27,16.39 23,12C21.27,7.61 17,4.5 12,4.5Z";

      function workshopPinIcon(path, size, color) {
        var s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        s.setAttribute("viewBox", "0 0 24 24");
        s.setAttribute("width", size);
        s.setAttribute("height", size);
        s.style.cssText = "fill:" + color + ";flex:none;";
        var p = document.createElementNS("http://www.w3.org/2000/svg", "path");
        p.setAttribute("d", path);
        s.appendChild(p);
        return s;
      }

      function workshopPinField(label, type, mode) {
        var wrap = workshopPinEl("label", "display:block;margin-top:12px;font-size:11px;font-weight:500;letter-spacing:0.4px;text-transform:uppercase;color:#b0bec5;");
        wrap.appendChild(document.createTextNode(label));
        var input = workshopPinEl(
          "input",
          "display:block;width:100%;box-sizing:border-box;margin-top:4px;padding:8px 12px;font-size:16px;min-height:44px;" +
            "background:#263238;color:#eceff1;border:1px solid rgba(255,255,255,0.23);border-radius:4px;outline:none;text-transform:none;letter-spacing:normal;font-family:inherit;"
        );
        input.type = type;
        if (mode) input.setAttribute("inputmode", mode);
        // Accent border while the field has the focus, red while the sign shows an error (workshopPinPaintError)
        input.addEventListener("focus", function () {
          input.style.borderColor = "#1976d2";
        });
        input.addEventListener("blur", function () {
          input.style.borderColor = input.getAttribute("data-bad") ? "#ef9a9a" : "rgba(255,255,255,0.23)";
        });
        // On the kiosk (squeekboard) the keyboard only comes out for a touch on the field; a field that already has the focus from
        // code gets no second chance, so each touch takes the focus away and gives it back (and focusin, right after the touch, asks the keyboard helper again).
        input.addEventListener("pointerup", function () {
          if (document.activeElement !== input) return;
          input.blur();
          input.focus();
        });
        wrap.appendChild(input);
        return { wrap: wrap, input: input };
      }

      function workshopPinLastName() {
        try {
          return window.localStorage.getItem(WORKSHOP_PIN_NAME_KEY) || "";
        } catch (e) {
          return "";
        }
      }

      function workshopPinLength(name) {
        try {
          return parseInt(window.localStorage.getItem(WORKSHOP_PIN_LEN_KEY + String(name).trim().toLowerCase()), 10) || 0;
        } catch (e) {
          return 0;
        }
      }

      function workshopPinRememberLength(name, len) {
        try {
          var k = WORKSHOP_PIN_LEN_KEY + String(name).trim().toLowerCase();
          if (len) window.localStorage.setItem(k, String(len));
          else window.localStorage.removeItem(k);
        } catch (e) {
          /* not important */
        }
      }

      function workshopPinRemember(name) {
        try {
          window.localStorage.setItem(WORKSHOP_PIN_NAME_KEY, name);
        } catch (e) {
          /* not important */
        }
      }

      // The pieces of the sign: v = { back, box, name, pin, msg, bo, bc, row }
      function workshopPinBuild(t) {
        var v = {};
        v.back = workshopPinEl("div", "position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,0.55);display:flex;align-items:flex-start;justify-content:center;padding:16px;overflow:auto;");
        v.back.setAttribute("data-tp-panel", "1");
        v.back.setAttribute("data-tp-pin", "1"); // its own touches do not count as the person's action (01-api-auth.js)
        v.box = workshopPinEl(
          "div",
          "background:#1e272c;color:#eceff1;border:1px solid rgba(255,255,255,0.12);border-radius:8px;margin:auto 0;font-family:Roboto,Helvetica,Arial,sans-serif;" +
            "max-width:360px;width:100%;padding:16px 18px 14px;font-size:13px;line-height:1.45;box-shadow:0 8px 30px rgba(0,0,0,0.5);"
        );
        v.box.setAttribute("role", "dialog");
        v.box.setAttribute("aria-modal", "true");
        var head = workshopPinEl("div", "display:flex;align-items:center;gap:12px;");
        var badge = workshopPinEl("div", "width:40px;height:40px;border-radius:50%;background:rgba(25,118,210,0.2);display:flex;align-items:center;justify-content:center;flex:none;");
        badge.appendChild(workshopPinIcon(WORKSHOP_PIN_LOCK, 22, "#90caf9"));
        var titles = workshopPinEl("div", "min-width:0;");
        titles.appendChild(workshopPinEl("div", "font-size:14px;font-weight:600;color:#90caf9;", t("pinTitle")));
        titles.appendChild(workshopPinEl("div", "color:#b0bec5;font-size:12px;", t("pinHint")));
        head.appendChild(badge);
        head.appendChild(titles);
        v.box.appendChild(head);
        v.name = workshopPinField(t("pinName"), "text");
        v.name.input.setAttribute("autocomplete", "username");
        v.name.input.setAttribute("autocapitalize", "none");
        v.name.input.setAttribute("autocorrect", "off");
        v.name.input.setAttribute("spellcheck", "false");
        v.name.input.setAttribute("enterkeyhint", "next");
        v.name.input.value = workshopPinLastName();
        // A PIN is digits only (the service refuses anything else): the field is a numeric one (inputmode numeric, so the kiosk keyboard is
        // the number pad). It is a text field hidden with CSS, not type=password: a password field makes the keyboard ask for the full layout.
        v.pin = workshopPinField(t("pinPin"), "text", "numeric");
        v.pin.input.style.setProperty("-webkit-text-security", "disc");
        v.pin.input.setAttribute("pattern", "[0-9]*");
        v.pin.input.setAttribute("autocomplete", "off");
        v.pin.input.setAttribute("enterkeyhint", "go");
        v.pin.input.style.paddingRight = "48px";
        // Eye to see the PIN being typed (own PIN, own screen)
        var eye = workshopPinEl("button", "position:absolute;right:2px;bottom:0;width:44px;height:44px;background:transparent;border:0;border-radius:4px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;");
        eye.type = "button";
        eye.setAttribute("tabindex", "-1");
        eye.appendChild(workshopPinIcon(WORKSHOP_PIN_EYE, 20, "#b0bec5"));
        eye.addEventListener("pointerdown", function (ev) {
          ev.preventDefault(); // does not take the focus (and the keyboard) away from the PIN
        });
        eye.addEventListener("click", function () {
          var shown = v.pin.input.style.getPropertyValue("-webkit-text-security") === "none";
          v.pin.input.style.setProperty("-webkit-text-security", shown ? "disc" : "none");
          eye.firstChild.style.fill = shown ? "#b0bec5" : "#90caf9";
        });
        v.pin.wrap.style.position = "relative";
        v.pin.wrap.appendChild(eye);
        v.msg = workshopPinEl("div", "min-height:20px;margin-top:10px;font-size:12px;color:#ef9a9a;");
        v.row = workshopPinEl("div", "display:flex;gap:8px;justify-content:flex-end;margin-top:6px;");
        v.bc = workshopPinEl("button", "background:transparent;color:#eceff1;border:0;border-radius:6px;padding:8px 16px;min-height:44px;font-size:13px;font-weight:500;text-transform:uppercase;letter-spacing:0.4px;cursor:pointer;font-family:inherit;", t("cancel"));
        v.bo = workshopPinEl("button", "background:#1976d2;color:#fff;border:0;border-radius:6px;padding:8px 20px;min-height:44px;font-size:13px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;cursor:pointer;font-family:inherit;", t("pinEnter"));
        v.bc.type = v.bo.type = "button";
        v.row.appendChild(v.bc);
        v.row.appendChild(v.bo);
        [v.name.wrap, v.pin.wrap, v.msg, v.row].forEach(function (x) {
          v.box.appendChild(x);
        });
        v.back.appendChild(v.box);
        return v;
      }

      // Red border on both fields while the sign shows an error
      function workshopPinPaintError(v, on) {
        [v.name.input, v.pin.input].forEach(function (i) {
          if (on) i.setAttribute("data-bad", "1");
          else i.removeAttribute("data-bad");
          i.style.borderColor = on ? "#ef9a9a" : "rgba(255,255,255,0.23)";
        });
      }

      // The first empty field gets the focus; on the kiosk the keyboard comes out through the helper (02-kiosk-keyboard.js)
      function workshopPinFocusFirst(v) {
        (v.name.input.value ? v.pin.input : v.name.input).focus();
      }

      function workshopPinDialog(login, t) {
        return new Promise(function (resolve) {
          var v = workshopPinBuild(t);
          var busy = false;
          function end(ok) {
            document.removeEventListener("keydown", key, true);
            if (v.back.parentNode) v.back.parentNode.removeChild(v.back);
            resolve(ok);
          }
          function refused(err) {
            busy = false;
            v.bo.disabled = false;
            v.bo.style.opacity = "1";
            v.pin.input.value = "";
            v.msg.textContent = err.message || t("pinWrong");
            workshopPinPaintError(v, true);
            v.pin.input.focus();
          }
          function submit() {
            if (busy) return;
            var name = v.name.input.value.trim();
            if (!name || !v.pin.input.value) {
              v.msg.textContent = t("pinMissing");
              workshopPinPaintError(v, true);
              return;
            }
            busy = true;
            v.bo.disabled = true;
            v.bo.style.opacity = "0.5";
            v.msg.textContent = "";
            workshopPinPaintError(v, false);
            var typed = v.pin.input.value;
            Promise.resolve(login(name, typed)).then(
              function (err) {
                if (err) {
                  workshopPinRememberLength(name, 0);
                  return refused(err);
                }
                workshopPinRemember(name);
                workshopPinRememberLength(name, typed.length);
                end(true);
              },
              function () {
                refused({ message: t("unavailable") });
              }
            );
          }
          function key(ev) {
            if (ev.key === "Escape") end(false);
            else if (ev.key === "Enter") {
              // From the name Enter goes on to the PIN; from the PIN it signs in
              if (ev.target === v.name.input && !v.pin.input.value) v.pin.input.focus();
              else submit();
            }
          }
          v.bc.addEventListener("click", function () {
            end(false);
          });
          v.bo.addEventListener("click", submit);
          v.pin.input.addEventListener("input", function () {
            var digits = v.pin.input.value.replace(/\D/g, "");
            if (digits !== v.pin.input.value) v.pin.input.value = digits; // digits only
            var want = workshopPinLength(v.name.input.value);
            if (want && v.pin.input.value.length === want) submit();
          });
          document.addEventListener("keydown", key, true);
          (document.fullscreenElement || document.body).appendChild(v.back);
          workshopPinFocusFirst(v);
        });
      }
