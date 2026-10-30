      // ---- Mirror of the status LEDs in the interface (window.__workshop.ledState) ----
      //
      // WorkshopService (dsf/status_light.py) publishes in
      // plugins.WorkshopService.data:
      //   statusLightSecs    [[hex, level 0..1, count], ...] = the status
      //                      zone as it is painted NOW (turns, pause
      //                      blinking, progress bar, split...)
      //   statusLightActive [{id, hex}] active states (air, laser, no_homing...)
      //   statusLightAuto / statusLightPiActive / statusLightText
      // It is read from DWC's store (it arrives through the websocket instantly, there is no need to
      // wait for the 2 s poll) and painted on the elements registered with
      // paint(el, mode). A single reader for all the plugins: the first
      // one to load creates it, the others reuse it.
      //   mode "fondo":   background = the strip (gradient by stretches), white text
      //   mode "borde":   3px line below with the strip (headers, buttons)
      //   mode "insignia": NOT a strip: color dot with the state's effect
      //                   (blinking, pulse...) and its name; it comes from
      //                   statusIndicator (the state shown by the "screen" output
      //                   of the Lights and states page)
      //   mode "tira":    dots, one per LED: the status zone; the COMPLETE
      //                   strip (ledStrip) only when the lighting has
      //                   control (automatic off); it does not overflow with
      //                   many LEDs (see tiraEstilo)
      // Without a backend (WorkshopService down) the original style is restored.
      var ledState =
        workshop.ledState ||
        (workshop.ledState = (function () {
          var subs = [];
          var painted = []; // {el, modo, orig}
          var current = { active: false, secs: [], activeList: [], color: null, text: "", led_strip: [], stateSpan: null, indicator: null };
          var lastKey = "";

          function datosPcc() {
            try {
              var p = workshopPluginOf(workshopHostPluginsModel(), "service");
              return workshopPluginData(p);
            } catch (e) {
              return null;
            }
          }

          function read() {
            var d = datosPcc();
            var secs = (d && Array.isArray(d.statusLightSecs) && d.statusLightSecs) || [];
            // It is shown even if the automatic status lights are off:
            // in that case the lighting takes these LEDs and the Pi publishes its
            // color (or off), so the screen keeps copying the real strip.
            var activo = !!(d && d.statusLightPiActive !== false && String(d.statusLightPiActive) !== "False" && secs.length);
            // the state names and the reason come as {key, params}: shown in the language of this DWC
            var activos = (d && Array.isArray(d.statusLightActive) && workshopServiceTexts(d.statusLightActive)) || [];
            // Complete strip (WorkshopService 2026-10-10) ONLY when the lighting
            // has control of the whole strip (automatic status lights
            // off); with the automatic one, the status zone (the rest
            // says nothing about the machine's state). User's request.
            var lt = d && d.ledStrip;
            var auto = !(d && (d.statusLightAuto === false || String(d.statusLightAuto) === "False"));
            var strip = (!auto && lt && Array.isArray(lt.secs) && lt.secs.length && lt.secs) || secs;
            // indicator on screen (WorkshopService 2026-10-12): the current state with its color and effect
            var si = d && workshopServiceTexts(d.statusIndicator);
            var indicador =
              si && si.state
                ? {
                    id: si.state.id,
                    name: si.state.name,
                    hex: si.state.hex,
                    effect: si.state.effect || "steady",
                    reason: si.reason || "",
                    combine: si.combine || "priority",
                    turnS: si.turn_s || 1.5,
                    baseHex: si.mode_hex || null,
                    test: si.test || null,
                    activeList: (si.active || []).map(function (a) {
                      return { id: a.id, name: a.name, hex: a.hex, effect: a.effect || "steady" };
                    }),
                  }
                : null;
            var key = JSON.stringify([activo, secs, activos, strip, indicador]);
            if (key === lastKey) return;
            lastKey = key;
            var lit = secs.filter(function (s) {
              return s[1] > 0;
            });
            current = {
              active: activo,
              secs: secs,
              activeList: activos,
              color: activo && lit.length ? lit[0][0] : null,
              text: (d && workshopServiceText(d.statusLightText)) || "",
              led_strip: strip,
              stripFull: strip !== secs,
              stateSpan: lt && Array.isArray(lt.state) ? lt.state : null,
              indicator: indicador,
            };
            paintTodo();
            subs.slice().forEach(function (fn) {
              try {
                fn(current);
              } catch (e) {
                console.error("[ledState]", e);
              }
            });
          }

          // Effects of the indicator (the same as lights_config.EFFECTS): the screen animates them by itself, the
          // service only publishes the name of the effect.
          // Effects without CSS animations (2026-10-14). A CSS animation makes the browser draw a new frame on every
          // refresh (60 a second) for as long as it runs, even while the value does not change; on the Pi screen that
          // kept the compositor busy all the time. Here ONE timer sets the opacity of the animated elements and
          // wakes up only when something changes: a blink or a double flash at the exact moment of each edge (so the
          // rhythm is the same as before, with no extra frames), a pulse in steps of 100 ms. It stops when no element
          // is on the page and does nothing while the tab is hidden.
          var FX_PULSO_MS = 100;
          var FX_PERIOD = { blink_slow: 1.6, blink: 1.2, blink_fast: 0.8, double: 1.6, pulse: 2.4 };
          var FX_BORDES = { double: [0.18, 0.31, 0.49, 1] }; // phases where a double flash changes
          var fxReg = [];
          var fxTimer = 0;
          function fxShape(effect, t) {
            var p = FX_PERIOD[effect];
            var ph = (t % p) / p;
            if (effect === "pulse") return ph < 0.5 ? ph * 2 : (1 - ph) * 2;
            if (effect === "double") return ph < 0.18 || (ph >= 0.31 && ph < 0.49) ? 1 : 0;
            return ph < 0.5 ? 1 : 0;
          }
          // seconds until the shape of this effect changes
          function fxNext(effect, t) {
            var p = FX_PERIOD[effect];
            if (effect === "pulse") return FX_PULSO_MS / 1000;
            var ph = (t % p) / p;
            var bordes = FX_BORDES[effect] || [0.5, 1];
            for (var i = 0; i < bordes.length; i++) if (bordes[i] > ph + 1e-6) return (bordes[i] - ph) * p;
            return (1 - ph) * p;
          }
          function fxTick() {
            fxTimer = 0;
            var t = performance.now() / 1000;
            fxReg = fxReg.filter(function (r) { return r.el.isConnected; });
            if (!fxReg.length) return;
            var wait = 1;
            fxReg.forEach(function (r) {
              var s = (r.lo + (r.hi - r.lo) * fxShape(r.effect, t)).toFixed(2);
              if (r.el._fxOp !== s) {
                r.el._fxOp = s;
                r.el.style.opacity = s;
              }
              wait = Math.min(wait, fxNext(r.effect, t));
            });
            // hidden tab: look again in a second (nothing is drawn there anyway)
            fxTimer = setTimeout(fxTick, document.hidden ? 1000 : Math.max(16, Math.round(wait * 1000) + 2));
          }
          // el = element to animate; efecto = effect name of the indicator; hi / lo = opacity of the on / off part
          function fxAnimate(el, effect, hi, lo) {
            el.style.animation = "none";
            fxReg = fxReg.filter(function (r) { return r.el !== el; });
            if (!FX_PERIOD[effect]) {
              el.style.opacity = "";
              el._fxOp = null;
              return;
            }
            fxReg.push({ el: el, effect: effect, hi: hi === undefined ? 1 : hi, lo: lo === undefined ? 0.1 : lo });
            clearTimeout(fxTimer);
            fxTick();
          }

          // color of a stretch with its brightness: level 0 = off (dark gray)
          function colorSegment(s) {
            if (!(s[1] > 0)) return "rgba(40,40,40,0.9)";
            var h = s[0].replace("#", "");
            var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
            var a = 0.6 + 0.4 * Math.sqrt(Math.min(1, s[1])); // a dim LED still looks on (as on the strip)
            return "rgba(" + r + "," + g + "," + b + "," + a + ")";
          }

          function degradado(secs) {
            var total = secs.reduce(function (t, s) {
              return t + s[2];
            }, 0);
            if (!total) return "none";
            var pos = 0, parts = [];
            secs.forEach(function (s) {
              var c = colorSegment(s);
              var a = (pos / total) * 100, b = ((pos + s[2]) / total) * 100;
              parts.push(c + " " + a.toFixed(2) + "%", c + " " + b.toFixed(2) + "%");
              pos += s[2];
            });
            return "linear-gradient(90deg," + parts.join(",") + ")";
          }

          // Scalable strip (request 2026-10-10: "that it does not overflow with many LEDs,
          // ultra small but showing the real count"). A SINGLE element:
          // background = gradient with a stretch per LED (each LED takes 1/N of the
          // width, whether 10 or 1000) + separators on top while they fit (>= 4 px
          // per LED). With less room it stays a continuous bar with the
          // real proportion of each color; the count goes in the title.
          function tiraEstilo(secs, ancho) {
            var total = secs.reduce(function (t, s) {
              return t + s[2];
            }, 0);
            var base = { height: "8px", borderRadius: "4px", backgroundRepeat: "no-repeat", backgroundSize: "100% 100%", minWidth: "0", width: "100%", boxSizing: "border-box" };
            if (!total) {
              base.backgroundImage = "none";
              return base;
            }
            var by = (ancho || 200) / total;
            var layers = [];
            if (by >= 4) {
              var g = by >= 9 ? 2 : 1;
              var step = "calc(100% / " + total + ")";
              layers.push(
                "repeating-linear-gradient(90deg, transparent 0, transparent calc(" + step + " - " + g + "px), rgba(0,0,0,0.85) calc(" + step + " - " + g + "px), rgba(0,0,0,0.85) " + step + ")"
              );
            }
            layers.push(degradado(secs));
            base.backgroundImage = layers.join(",");
            var lit = secs.filter(function (s) {
              return s[1] > 0;
            });
            base.boxShadow = lit.length ? "0 0 5px " + colorSegment(lit[0]) : "none";
            return base;
          }

          function stripTitle(secs, full) {
            var total = secs.reduce(function (t, s) {
              return t + s[2];
            }, 0);
            var on = secs.reduce(function (t, s) {
              return t + (s[1] > 0 ? s[2] : 0);
            }, 0);
            return full
              ? i18nT('ledState.leds_the_whole_strip_the_lighting', { total: total, on: on })
              : i18nT('ledState.status_leds_on', { total: total, on: on });
          }

          function line(p) {
            // own line (absolute child, without events): the element's owner
            // can rewrite its background/style without deleting it
            var l = p.line;
            if (!l || l.parentNode !== p.el) {
              l = document.createElement("span");
              l.className = "workshop-led-line";
              l.style.cssText = "position:absolute;left:0;right:0;bottom:0;height:3px;pointer-events:none;border-radius:0 0 3px 3px;z-index:1;";
              if (getComputedStyle(p.el).position === "static") p.el.style.position = "relative";
              p.el.appendChild(l);
              p.line = l;
            }
            return l;
          }

          function pastel(i, size, p) {
            return workshopLedPastel(i, size, p, fxAnimate);
          }

          // badge: pastel of the state (with its effects) + the state's name, not a strip of LEDs
          function pintarInsignia(p) {
            var el = p.el;
            var i = current.indicator;
            // repaint only when something changed: rebuilding the nodes drops any text being selected
            var signature = i ? JSON.stringify([i.hex, i.effect, i.name, i.activeList.map(function (a) { return [a.id, a.hex, a.effect]; }), i.reason, i.combine, i.turnS, i.baseHex, i.id]) : "";
            if (p._signature === signature && (el.firstChild || !i)) return;
            p._signature = signature;
            if (p._tm) {
              clearInterval(p._tm);
              p._tm = null;
            }
            el.textContent = "";
            if (!i) {
              el.style.display = "none";
              return;
            }
            el.style.display = "inline-flex";
            el.style.alignItems = "center";
            el.style.gap = "6px";
            var dot = pastel(i, 12, p);
            var txt = document.createElement("span");
            txt.style.cssText = "overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
            txt.textContent = i.name + (i.activeList.length > 1 ? "  +" + (i.activeList.length - 1) : "");
            el.appendChild(dot);
            el.appendChild(txt);
            el.title = i.name + (i.reason ? " - " + i.reason : "");
          }

          function pintar(p) {
            var el = p.el;
            if (p.mode === "badge") {
              pintarInsignia(p);
              return;
            }
            if (p.mode === "led_strip") {
              el.textContent = "";
              if (!current.active) {
                el.style.display = "none";
                return;
              }
              // same strip as vue/_shared/LedStrip.vue (Lights and Service pages)
              el.style.display = "block";
              var est = tiraEstilo(current.led_strip, el.clientWidth);
              Object.keys(est).forEach(function (k) {
                el.style[k] = est[k];
              });
              el.title = stripTitle(current.led_strip, current.stripFull);
              // el ancho decide si caben separadores: repintar si cambia
              if (!p.ro && typeof ResizeObserver === "function") {
                var w0 = el.clientWidth;
                p.ro = new ResizeObserver(function () {
                  if (Math.abs(el.clientWidth - w0) < 2) return;
                  w0 = el.clientWidth;
                  pintar(p);
                });
                p.ro.observe(el);
              }
              return;
            }
            if (p.mode === "edge") {
              var l = line(p);
              var ind = current.indicator;
              l.style.display = current.active || ind ? "block" : "none";
              if (ind) {
                // indicator on screen: a line of the state's color, with its effect
                l.style.background = ind.hex;
                fxAnimate(l, ind.effect, 1, 0.1);
                el.title = ind.name + (ind.reason ? " - " + ind.reason : "");
              } else if (current.active) {
                l.style.background = degradado(current.secs);
              }
              return;
            }
            // background: DWC's status chip takes the state's color
            if (current.indicator) {
              el.style.backgroundImage = "none";
              el.style.backgroundColor = workshopColorScreen(current.indicator.hex, "fill");
              el.style.color = "#fff";
              el.style.textShadow = "none";
              return;
            }
            if (!current.active) {
              el.style.backgroundColor = p.orig.backgroundColor;
              el.style.backgroundImage = p.orig.backgroundImage;
              el.style.color = p.orig.color;
              el.style.textShadow = p.orig.textShadow;
              return;
            }
            el.style.backgroundImage = degradado(current.secs);
            el.style.color = "#fff";
            el.style.textShadow = "0 0 3px #000, 0 0 2px #000";
          }

          function paintTodo() {
            painted = painted.filter(function (p) {
              return p.el.isConnected || Date.now() - p.since < 5000;
            });
            painted.forEach(function (p) {
              if (p.el.isConnected) pintar(p);
            });
          }

          setInterval(read, 150);

          return {
            fx: fxAnimate,
            get: function () {
              return current;
            },
            subscribe: function (fn) {
              subs.push(fn);
              try {
                fn(current);
              } catch (e) {
                /* nada */
              }
              return function () {
                subs = subs.filter(function (f) {
                  return f !== fn;
                });
              };
            },
            // Paints the element with the strip; repeating on the same element does not duplicate
            paint: function (el, mode) {
              if (!el) return;
              var ya = painted.find(function (p) {
                return p.el === el;
              });
              if (ya) {
                ya.mode = mode || ya.mode;
              } else {
                ya = {
                  el: el,
                  mode: mode || "edge",
                  since: Date.now(),
                  orig: { backgroundColor: el.style.backgroundColor, backgroundImage: el.style.backgroundImage, color: el.style.color, textShadow: el.style.textShadow },
                };
                painted.push(ya);
              }
              pintar(ya);
            },
            unpaint: function (el) {
              var p = painted.find(function (x) {
                return x.el === el;
              });
              if (!p) return;
              current = Object.assign({}, current);
              var a = current.active, ind = current.indicator;
              current.active = false;
              current.indicator = null;
              pintar(p);
              current.active = a;
              current.indicator = ind;
              painted = painted.filter(function (x) {
                return x !== p;
              });
            },
            // state color if active (for air, laser buttons...)
            colorOf: function (id) {
              if (!current.active) return null;
              var e = current.activeList.find(function (x) {
                return x.id === id;
              });
              return e ? e.hex : null;
            },
            gradient: degradado,
            color: colorSegment,
            stripStyle: tiraEstilo,
          };
        })());
