      // CSS of the Vision page (injected once by tvInjectStyle in 10-vision.js)
      var TV_CSS =
      // Page tokens (2026-10-13, "Vision looks very different from the other plugins"): the same
      // surfaces as the Vue pages (v-card of DWC: #1e1e1e dark / #fff light, 4 px corners, elevation 2,
      // no border), v-card-text grey for secondary text, grey--text for help text.
      ".tv-page{padding:0;color:#fff;font-size:14px;font-family:Roboto,sans-serif;--tv-card:#1e1e1e;--tv-sombra:0 3px 1px -2px rgba(0,0,0,.2),0 2px 2px 0 rgba(0,0,0,.14),0 1px 5px 0 rgba(0,0,0,.12);--tv-sec:rgba(255,255,255,.7);--tv-faint:#9e9e9e;--tv-interna:rgba(128,128,128,.09);--tv-line:rgba(255,255,255,.12);--tv-outline:rgba(255,255,255,.23);--tv-field:rgba(255,255,255,.3);--tv-hover:rgba(128,128,128,.12)}" +
      ".theme--light .tv-page{--tv-card:#fff;--tv-sec:rgba(0,0,0,.6);--tv-faint:#666;--tv-line:rgba(0,0,0,.12);--tv-outline:rgba(0,0,0,.23);--tv-field:rgba(0,0,0,.23)}" +
      ".tv-turns{display:inline-block;animation:tv-turns 0.9s linear infinite}@keyframes tv-turns{to{transform:rotate(360deg)}}" +
      ".tv-ic{font-size:18px;line-height:1;vertical-align:middle}" +
      ".tv-sec{display:inline-flex;background:transparent;border:1px solid var(--tv-outline,#455a64);border-radius:6px;padding:2px;gap:2px}" +
      ".tv-sec .tvb{border:none;background:transparent;border-radius:6px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px;color:#b0bec5}" +
      ".tv-sec .tvb.on{background:#1976d2;color:#fff}.tv-sec .tvb:hover:not(.on){background:var(--tv-hover,#263238)}" +
      ".tv-lbl{font-size:12px;font-weight:600;margin:10px 0 4px;opacity:.85}" + // titulito de un grupo (Vigilancia de fuego)
      // cuenta regresiva antes de pausar por fuego/humo (2026-10-12): relleno de aviso, texto blanco
      ".tv-count{background:#e65100;color:#fff;border-radius:6px;padding:8px 10px;margin:6px 0;display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:13px;font-weight:600}" +
      ".tv-count .tvb{background:transparent;border:1px solid #fff;color:#fff;min-height:32px}" +
      ".tv-hist{font-size:12px;margin-top:4px}.tv-hist>div{padding:3px 0;border-bottom:1px solid rgba(255,255,255,.08)}.tv-hist>div.f{cursor:pointer}" +
      ".theme--light .tv-hist>div{border-bottom-color:rgba(0,0,0,.08)}" +
      ".tv-toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:inherit;user-select:none;min-height:32px;box-sizing:border-box;padding:4px 10px;border-radius:6px;border:1px solid var(--tv-outline,#455a64);background:transparent}" +
      ".tv-toggle .sw{width:30px;height:16px;border-radius:8px;background:#455a64;position:relative;flex:none;transition:background .2s}" +
      ".tv-toggle .sw:after{content:'';position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#eceff1;transition:left .2s}" +
      ".tv-toggle.on .sw{background:#2e7d32}.tv-toggle.on .sw:after{left:16px}" +
      ".tv-toggle .est{min-width:20px;color:var(--tv-faint,#90a4ae)}.tv-toggle:not(.on){opacity:.8}" +
      ".tv-toggle.on{background:rgba(46,125,50,.22);border-color:#2e7d32}.tv-toggle.on .est{color:#a5d6a7}" +
      // cuerpo
      ".tv-main{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;justify-content:center;flex:1 1 auto;min-width:0}" +
      ".tv-body{display:flex;gap:14px;align-items:flex-start}" +
      ".tv-notice{border-top-color:#e65100}" +
      ".tv-check{display:flex;align-items:center;gap:8px;cursor:pointer;margin:4px 0 8px}.tv-pre{white-space:pre-line;font-size:13px;margin-bottom:6px}" +
      ".tv-lib-it .tv-in,.tv-acts .tv-in{width:auto;flex:1 1 140px;min-width:0}" +
      ".tv-steps{display:flex;flex-direction:column;gap:8px}.tv-step{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--tv-line);border-radius:6px;padding:8px 10px}" +
      ".tv-step .n{flex:none;width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:700;background:rgba(255,255,255,.1)}" +
      ".tv-step.done .n{background:#2e7d32;color:#fff}.tv-step.now{border-color:#1976d2;background:rgba(25,118,210,.08)}.tv-step.now .n{background:#1976d2;color:#fff}.tv-step .b{flex:1;min-width:0}.tv-step .tt{font-weight:500}" +
      ".tv-lib{display:flex;flex-direction:column;gap:6px}.tv-lib-it{display:flex;align-items:center;gap:8px;border:1px solid var(--tv-line);border-radius:6px;padding:6px 8px}.tv-lib-it svg{flex:none;width:44px;height:44px}.tv-lib-it .b{flex:1;min-width:0}" +
      ".tv-delta{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-top:6px}.tv-delta div{border:1px solid var(--tv-line);border-radius:6px;padding:6px;text-align:center}.tv-delta b{display:block;font-size:18px}.tv-delta .height{color:#ff8a65}" +
      // the right panel always in ONE column (2026-10-10: with a narrow image "almost three columns" formed)
      // and with no width cap: it fills what the image leaves ("a piece is left that looks empty")
      // margin auto: if the panel goes down (kiosk ~1100px) the image, with a width cap from the height, stays centered and not to one side
      // 2026-10-11 ("it still has two columns: if I do not see the camera I do not know what to touch in the options"):
      // camera and options always side by side (except phone, see @media 700px); the image shrinks
      // flex 1000 / 1 (2026-10-11, "with zoom out the columns do not adjust"): the image takes
      // almost all the leftover; when it reaches its height cap, the rest goes to the options
      ".tv-left{flex:1000 1 0;min-width:0}.tv-side{flex:1 1 clamp(260px,26%,380px);min-width:260px;display:grid;grid-template-columns:minmax(0,1fr);gap:10px;align-content:start;align-items:start}" +
      ".tv-main.only .tv-left{display:none}.tv-main.only .tv-side{flex:1 1 100%;max-width:none;display:block;column-width:360px;column-gap:10px}.tv-main.only .tv-side>*{break-inside:avoid;margin:0 0 10px}" +
      ".tv-bar{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0 4px}" +
      // buttons (DESIGN.md 2, "Panel / pagina JS"): secondary = outlined, main = filled blue,
      // text button = no border. Over the image (.tv-ov, .tv-pad, full screen) they stay filled grey.
      ".tv-ov .tvb,.tv-pad .tvb,.tv-left.tv-full .tvb{background:#455a64;border-color:#455a64;color:#eceff1}" +
      ".tv-ov .tvb.on,.tv-ov .tvb.primary,.tv-pad .tvb.on,.tv-pad .tvb.primary,.tv-left.tv-full .tvb.on,.tv-left.tv-full .tvb.primary{background:#1976d2;border-color:#1976d2;color:#fff}" +
      ".tv-ov .tvb.ghost,.tv-pad .tvb.ghost{background:transparent;border-color:transparent;color:#90caf9}" +
      ".tv-ov .tv-sec .tvb{background:transparent;border-color:transparent;color:#b0bec5}.tv-ov .tv-sec .tvb.on{background:#1976d2;color:#fff}" +
      ".tv-ov .tv-toggle{color:#eceff1;border-color:#455a64;background:#1e272c}" +
      ".tv-kind{display:inline-flex;align-items:center;gap:6px}.tv-dot{width:10px;height:10px;border-radius:50%;display:inline-block;flex:none}" +
      ".tv-tchip{background:transparent;border:1px solid var(--tv-outline);color:var(--tv-sec);border-radius:16px;padding:4px 11px}.tv-tchip.on{background:var(--tv-hover);color:inherit;border-color:var(--c)}" +
      ".tv-tchip.on .tv-dot{box-shadow:0 0 0 3px rgba(255,255,255,.08)}" +
      ".tv-sep{width:1px;height:22px;background:var(--tv-line);margin:0 2px}" +
      ".tv-spacer{flex:1}" +
      // imagen
      ".tv-stage{position:relative;background:#0d1114;border-radius:4px;overflow:hidden;line-height:0;user-select:none;touch-action:none;border:1px solid var(--tv-line)}" +
      ".tv-stage img{width:100%;height:auto;display:block;min-height:180px;background:transparent}.tv-stage img:not([src]),.tv-stage img[src='']{visibility:hidden}" +
      ".tv-stage svg{position:absolute;left:0;top:0;width:100%;height:100%}" +
      ".tv-stage .tv-empty{position:absolute;inset:0;display:flex;flex-direction:column;gap:8px;align-items:center;justify-content:center;line-height:1.4;color:#b0bec5;padding:20px;text-align:center;background:#0d1114;z-index:2}" +
      ".tv-stage .tv-empty .tv-ic{font-size:42px;opacity:.6}" +
      ".tv-ov{position:absolute;display:flex;gap:6px;align-items:center;line-height:1.3;pointer-events:none}" +
      ".tv-ov>*{pointer-events:auto}" +
      ".tv-ov.tl{top:8px;left:8px}.tv-ov.tr{top:8px;right:8px}.tv-ov.bl{bottom:8px;left:8px}.tv-ov.br{bottom:8px;right:8px;max-width:70%}" +
      ".tv-glass{background:rgba(16,22,26,.78);backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.08);border-radius:8px}" +
      ".tv-ov .tv-sec{background:rgba(16,22,26,.78);backdrop-filter:blur(4px);border-color:rgba(255,255,255,.1)}" +
      ".tv-badge{padding:4px 10px;font-size:12px;color:#eceff1;display:inline-flex;align-items:center;gap:6px}" +
      ".tv-badge.live .tv-ic{color:#ef9a9a}.tv-badge.photo .tv-ic{color:#90caf9}" +
      // 2026-10-11 ("let all that camera's functions be contained"): the viewer is
      // a frame with its bars inside, like the Workbench map
      ".tv-left{position:relative}" + // the bar's menus are placed inside the viewer
      ".tv-badge.envivo{background:rgba(183,28,28,.75)}.tv-badge.envivo .tv-ic{color:#fff;animation:tvLat 1.4s ease-in-out infinite}" +
      "@keyframes tvLat{50%{opacity:.35}}" +
      ".tv-badge.pausa{background:rgba(38,50,56,.85)}" +
      ".tv-readout{padding:6px 10px;font-size:13px;color:#e0f7fa;line-height:1.35}.tv-readout b{font-size:16px;color:#00e5ff;font-weight:600}" +
      ".tv-info{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;font-size:12px;color:var(--tv-sec);min-height:20px}" +
      ".tv-info>span{background:var(--tv-interna);border-radius:10px;padding:2px 8px}" +
      ".tv-info>span.warn{color:#ffb74d}" +
      // tarjetas
      ".tv-muted{color:var(--tv-faint);font-size:12px;line-height:1.45}" +
      // messages like a dense text v-alert: tinted fill, icon in the meaning colour, 4 px corners
      ".tv-msg{font-size:13px;padding:4px 0;margin:6px 0;line-height:1.4;white-space:pre-line;display:flex;gap:8px;align-items:flex-start;color:var(--tv-sec)}" +
      ".tv-msg .tv-ic{font-size:18px;margin-top:-1px;color:var(--wf-icon)}.tv-msg.ok .tv-ic{color:var(--wf-ok)}.tv-msg.err .tv-ic{color:var(--wf-err)}" +
      ".tv-stats{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px;margin:6px 0}" +
      ".tv-stat{background:var(--tv-interna);border-radius:8px;padding:6px 9px}.tv-stat .k{font-size:11px;color:var(--tv-faint)}.tv-stat .v{font-size:16px;font-weight:500;font-variant-numeric:tabular-nums}" +
      ".tv-steps{display:flex;flex-direction:column;gap:2px}" +
      ".tv-step{display:flex;gap:10px;padding:6px 0}.tv-step .num{width:22px;height:22px;border-radius:50%;flex:none;display:inline-flex;align-items:center;justify-content:center;font-size:12px;font-weight:600;background:#455a64;color:#fff}" +
      ".tv-step.done .num{background:#2e7d32}.tv-step .bd{flex:1;min-width:0}.tv-step .tt{font-weight:500;margin-bottom:4px}" +
      // detecciones
      ".tv-filt{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:6px}" +
      ".tv-item{border-left:4px solid #888;padding:7px 10px;margin:6px 0;background:var(--tv-interna);border-radius:6px;cursor:pointer}" +
      ".tv-item:hover{background:var(--tv-hover)}.tv-item.sel{background:rgba(25,118,210,.18);outline:1px solid #90caf9}" +
      ".tv-item .t{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tv-sec)}.tv-item .big{font-size:16px;font-weight:500;color:inherit;margin:2px 0;font-variant-numeric:tabular-nums}" +
      ".tv-item .v{font-size:12px;color:var(--tv-sec);line-height:1.45;white-space:pre-line}" +
      ".tv-acts{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:5px;margin-top:8px}.tv-acts .tvb{justify-content:center}" +
      ".tv-list{max-height:56vh;overflow:auto;padding-right:2px}" +
      ".tv-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:5px 0}" +
      ".tv-in{background:var(--tv-card);color:inherit;border:1px solid var(--tv-field);border-radius:4px;padding:5px 7px;min-height:32px;box-sizing:border-box;font-size:13px;width:80px}" +
      ".tv-in:focus,.tv-sel:focus{outline:none;border-color:#1976d2}" +
      ".tv-sel{background:var(--tv-card);color:inherit;border:1px solid var(--tv-field);border-radius:4px;padding:5px;min-height:32px;box-sizing:border-box;font-size:13px}" +
      ".tv-prm{display:grid;grid-template-columns:1fr minmax(100px,170px);gap:5px 10px;align-items:center;font-size:12px}" +
      ".tv-tbl{width:100%;border-collapse:collapse;font-size:13px}.tv-tbl td,.tv-tbl th{padding:4px 6px;border-bottom:1px solid var(--tv-line);text-align:left}.tv-tbl th{color:var(--tv-sec);font-size:12px;font-weight:500}" +
      ".tv-ind{display:flex;align-items:center;gap:8px;padding:5px 0;font-size:13px}.tv-ind .tv-ic{font-size:18px}" +
      ".tv-prog{height:6px;background:#455a64;border-radius:4px;overflow:hidden;margin:6px 0}.tv-prog>div{height:100%;background:#1976d2}" +
      // DWC light theme (2026-10-10, DESIGN.md light palette): white cards and
      // dark text; the image and what floats over it (.tv-stage / .tv-ov) stay dark
      ".theme--light .tv-page{color:#212121}" +
      ".theme--light .tv-step,.theme--light .tv-lib-it,.theme--light .tv-delta div{border-color:rgba(0,0,0,.12)}" +
      ".theme--light .tv-step .n{background:#eceff1;color:#263238}.theme--light .tv-step.now{background:rgba(25,118,210,.06)}" +
      // light theme: the steps done / the current one with their color (before they looked washed out) and the Move panel (dark) with its light text
      ".theme--light .tv-step.done .n{background:#2e7d32;color:#fff}.theme--light .tv-step.now .n{background:#1976d2;color:#fff}" +
      ".theme--light .tv-pad,.theme--light .tv-pad .tv-muted,.theme--light .tv-pad .pos,.theme--light .tv-pad .data{color:#b0bec5}.theme--light .tv-pad .h,.theme--light .tv-pad .data b{color:#eceff1}" +
      ".theme--light .tv-pad .seguro{color:#a5d6a7}.theme--light .tv-pad .err{color:#ef9a9a}" +
      ".theme--light .tv-sec .tvb{color:#616161;background:transparent}" +
      ".theme--light .tv-sec .tvb.on{background:#1976d2;color:#fff}" +
      ".theme--light .tv-sec .tvb:hover:not(.on){background:#eceff1}" +
      ".theme--light .tv-toggle .sw{background:#b0bec5}" +
      ".theme--light .tv-toggle .sw:after{background:#fff}" +
      ".theme--light .tv-toggle.on{background:rgba(46,125,50,.12);border-color:#2e7d32}.theme--light .tv-toggle.on .est{color:#2e7d32}" +
      ".theme--light .tvb.ghost{background:transparent;border-color:transparent;color:#1565c0}" +
      ".theme--light .tvb.ghost:hover{background:rgba(21,101,192,.08)}" +
      ".theme--light .tv-ov .tvb.ghost,.theme--light .tv-pad .tvb.ghost{color:#90caf9}" +
      ".theme--light .tvb:disabled{opacity:.55}" +
      ".theme--light .tv-info>span.warn{color:#b26a00}" +
      ".theme--light .tv-step .num{background:#b0bec5;color:#fff}" +
      ".theme--light .tv-step.done .num{background:#2e7d32}" +
      ".theme--light .tv-item.sel{background:#e3f2fd;outline-color:#1976d2}" +
      ".theme--light .tv-prog{background:#e0e0e0}" +
      ".theme--light .tv-ov .tv-sec{background:rgba(16,22,26,.78);border-color:rgba(255,255,255,.1)}" +
      ".theme--light .tv-ov .tv-sec .tvb{color:#b0bec5}" +
      ".theme--light .tv-ov .tv-sec .tvb.on{background:#1976d2;color:#fff}" +
      // visor (rediseno 2026-10-10): barra de arriba, zoom, cuadricula, mover la camara
      ".tv-grp{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}" +
      ".tv-zbox{position:relative;transform-origin:0 0}" +
      ".tv-stage.pan svg{cursor:grab}.tv-stage.panning svg{cursor:grabbing}.tv-stage.move svg{cursor:crosshair}" +
      ".tv-cursor{padding:4px 10px;font-size:12px;color:#eceff1;font-variant-numeric:tabular-nums;white-space:nowrap}" +
      ".tv-pad{position:absolute;right:8px;top:50%;transform:translateY(-50%);padding:8px;flex-direction:column;gap:6px;line-height:1.35;color:#eceff1;font-size:12px;width:184px}" +
      ".tv-pad .h{display:flex;align-items:center;gap:6px;font-weight:600;font-size:13px}.tv-pad .h .tv-ic{color:#ffe082;font-size:16px}" +
      ".tv-pad .pos{color:#b0bec5;font-variant-numeric:tabular-nums}" +
      ".tv-pad .dp{display:grid;grid-template-columns:repeat(3,1fr);gap:4px}" +
      ".tv-pad .tvb{justify-content:center;padding:4px 6px}" +
      ".tv-pad .steps{display:flex;gap:3px;align-items:center}.tv-pad .steps .tvb{flex:1;padding:3px 4px;font-size:12px}" +
      ".tv-pad .zz{display:grid;grid-template-columns:1fr 1fr;gap:4px}.tv-pad .zz .tvb{font-size:12px}" +
      ".tv-pad .err{color:#ef9a9a}.tv-pad .tv-muted{font-size:11px}" +
      // own full screen (2026-10-10: the browser's failed): the image column covers the whole window
      ".tv-left.tv-full{position:fixed;inset:0;z-index:1500;max-width:none !important;background:#0d1114;padding:10px 12px;overflow:hidden;color:#eceff1;display:flex;flex-direction:column}" +
      ".tv-left.tv-full .tv-stage{margin:0 auto;border-radius:0;border:none;flex:none;width:100%}" +
      ".tv-pad .h{cursor:move;touch-action:none;user-select:none}.tv-pad .h .tvb{margin-left:auto;min-height:28px;padding:2px 6px}" +
      ".tv-pad .seguro{display:flex;gap:5px;align-items:flex-start;font-size:11px;color:#a5d6a7;line-height:1.35}.tv-pad .seguro .tv-ic{font-size:14px}" +
      ".tv-pad .data{font-size:11px;color:#b0bec5;line-height:1.35}.tv-pad .data b{color:#eceff1;font-weight:500}.tv-pad .data .more{color:#a5d6a7}.tv-pad .data .minus{color:#ffb74d}" +
      // Viewer work bar (2026-10-11, "arrange all the function buttons",
      // same style as the Workbench bar): square buttons with icon on top and
      // short name below, in blocks of the same function; the rarely used in small menus
      ".tv-dock{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;padding:4px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:8px;position:relative;line-height:1}" +
      ".tv-dock>*{flex:none}.tv-dock>.gap{flex:1 1 0;min-width:0}" +
      ".tv-ib{min-width:42px;min-height:44px;margin:0;padding:4px 4px 3px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:#455a64;color:#eceff1;border:1px solid rgba(255,255,255,.3);border-radius:7px;cursor:pointer;touch-action:manipulation;position:relative;font:inherit;line-height:1;box-sizing:border-box}" +
      ".tv-ib .tv-ic{font-size:20px;pointer-events:none}.tv-ib .cap{font-size:10px;line-height:1.05;white-space:nowrap;pointer-events:none;font-variant-numeric:tabular-nums}" +
      ".tv-ib:hover:not(:disabled){filter:brightness(1.2)}.tv-ib:disabled{opacity:.45;cursor:default}" +
      ".tv-ib.half{min-width:34px}" +
      ".tv-ib.on,.tv-ib.prim{background:#1976d2;border-color:#90caf9;color:#fff}" +
      ".tv-ib.live{background:#ff8f00;border-color:#ffe082;color:#fff}" +
      ".tv-ib.open{background:#37474f;border-color:#90caf9}" +
      ".tv-ib .dots{position:absolute;top:3px;right:3px;display:flex;gap:1px;pointer-events:none}.tv-ib .dots i{width:6px;height:6px;border-radius:50%;display:block}" +
      ".tv-pair{display:inline-flex;border:1px solid rgba(255,255,255,.3);border-radius:8px;overflow:hidden;background:#455a64}" +
      ".tv-pair .tv-ib{border:0;border-radius:0}.tv-pair .tv-ib+.tv-ib{border-left:1px solid rgba(255,255,255,.18)}" +
      ".tv-dock.without-names .cap{display:none}.tv-dock.without-names .tv-ib{min-width:38px;min-height:36px}.tv-dock.without-names .tv-ib.half{min-width:32px}" +
      // bar menus: they open upward stuck to their button; tapping outside or Esc closes them
      ".tv-dpop{position:absolute;z-index:8;display:none;background:var(--tv-card);border:1px solid var(--tv-line);border-radius:6px;padding:8px 10px;box-shadow:0 6px 20px rgba(0,0,0,.55);font-size:12px;color:#eceff1;width:max-content;max-width:min(340px,calc(100% - 8px));line-height:1.35;box-sizing:border-box}" +
      ".tv-dpop h4{margin:0 0 6px;font-size:13px;font-weight:600;color:#90caf9}" +
      ".tv-dpop .dsec{margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,.1)}" +
      ".tv-dpop .dlbl{font-size:11px;color:#b0bec5;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px}" +
      ".tv-dpop .drow{display:flex;flex-wrap:wrap;gap:4px;align-items:center}.tv-dpop .tv-muted{font-size:11px;margin-top:4px}" +
      ".tv-dpop .it{display:flex;gap:9px;align-items:flex-start;padding:6px 8px;border-radius:6px;cursor:pointer;min-height:32px;box-sizing:border-box}.tv-dpop .it:hover{background:var(--tv-hover)}" +
      ".tv-dpop .it .tv-dot{margin-top:3px}.tv-dpop .it .n{font-size:13px;color:#eceff1}.tv-dpop .it .d{font-size:11px;color:#b0bec5}" +
      ".tv-dpop .footer{display:flex;gap:6px;justify-content:flex-end;border-top:1px solid rgba(255,255,255,.08);margin-top:4px;padding-top:6px}" +
      ".tv-info .tv-dot{width:8px;height:8px;margin-right:3px;vertical-align:baseline}" +
      ".theme--light .tv-dock{background:rgba(0,0,0,.03);border-color:rgba(0,0,0,.1)}" +
      ".theme--light .tv-ib{background:#eceff1;color:#263238;border-color:#cfd8dc}.theme--light .tv-ib:hover:not(:disabled){filter:brightness(.96)}" +
      ".theme--light .tv-pair{background:#eceff1;border-color:#cfd8dc}.theme--light .tv-pair .tv-ib+.tv-ib{border-left-color:rgba(0,0,0,.12)}" +
      ".theme--light .tv-ib.on,.theme--light .tv-ib.prim{background:#1976d2;border-color:#1976d2;color:#fff}" +
      ".theme--light .tv-ib.live{background:#ff8f00;border-color:#ff8f00;color:#fff}.theme--light .tv-ib.open{background:#cfd8dc;border-color:#1976d2}" +
      ".theme--light .tv-dpop{color:#212121;box-shadow:0 4px 14px rgba(0,0,0,.18)}.theme--light .tv-dpop h4{color:#1565c0}" +
      ".theme--light .tv-dpop .dsec{border-top-color:rgba(0,0,0,.08)}.theme--light .tv-dpop .dlbl{color:#616161}" +
      ".theme--light .tv-dpop .it .n{color:#212121}.theme--light .tv-dpop .it .d{color:#616161}.theme--light .tv-dpop .footer{border-top-color:rgba(0,0,0,.08)}" +
      "@media (max-width:700px){.tv-pad{top:auto;bottom:44px;transform:none;width:160px}}" +
      "@media (max-width:700px){.tv-side{flex:1 1 100%}.tv-ov.br{max-width:100%;left:8px}}" +
      // ---- the family (src/_shared/05-family-css.js) draws the bar, menu, cards, buttons and states; below, what is Vision's own ----
      ".tv-page{--wf-badge:#ad1457;--wf-sec:#ad1457}" +
      ".tv-page h3{margin:0 0 8px 0;font-size:16px;font-weight:600;letter-spacing:0;color:inherit;display:flex;align-items:center;gap:8px}" +
      ".tv-page h3 .tv-ic{color:var(--wf-icon);font-size:20px}.tv-page h3 .n{margin-left:auto;font-size:12px;color:var(--tv-faint);font-weight:400}" +
      ".tv-hd .tv-toggle{margin:0}" +
      ".tv-nav{position:sticky;top:64px;flex:none;width:190px;display:flex;flex-direction:column;padding:0 4px 8px 0}" +
      ".tvn-head{display:flex;align-items:center;justify-content:space-between}.tv-nav.collapsed .tvn-head{flex-direction:column-reverse;justify-content:center}" +
      ".tvn-pin{width:auto!important;min-width:32px;padding:0 8px;display:inline-flex;align-items:center;gap:4px;font-size:12px}.tvn-pin.pinned{opacity:1}" +
      ".tvn-fold{align-self:flex-end;background:transparent;border:none;color:inherit;opacity:.7;cursor:pointer;height:32px;width:32px;border-radius:6px}.tvn-fold:hover{background:rgba(128,128,128,.12);opacity:1}" +
      ".tvn-group{padding:12px 12px 4px}.tvn-group[data-group='0']{margin-top:0;border-top:0}" +
      ".tv-nav-item{display:flex;align-items:center;gap:10px;width:100%;min-height:40px;padding:6px 12px;text-align:left;cursor:pointer}.tv-nav-item .tx{line-height:1.25}" +
      "@media (pointer:coarse),(max-width:599px){.tv-nav-item{min-height:44px}}" +
      ".tv-nav.collapsed{width:52px}.tv-nav.collapsed .tx,.tv-nav.collapsed .tvn-group{display:none}.tv-nav.collapsed .tv-nav-item{justify-content:center;padding:6px 0}" +
      "@media (max-width:900px){.tv-body{flex-direction:column}.tv-nav,.tv-nav.collapsed{position:static;width:100%;flex-direction:row;flex-wrap:wrap;padding:0 0 4px}.tvn-group,.tvn-fold{display:none}.tv-nav-item,.tv-nav.collapsed .tv-nav-item{width:auto;justify-content:flex-start;padding:6px 8px}.tv-nav.collapsed .tx{display:inline}}" +
      ".tv-left.tv-full{border:0;border-radius:0}" +
      ".tv-acc{padding:0;overflow:hidden}.tv-acc-h .tv-ic.m{color:var(--wf-icon);font-size:20px}.tv-acc-h .tag{border:0;padding:0;height:auto;line-height:1.4;color:var(--tv-sec)}" +
      ".tv-acc-h{display:flex;align-items:center;gap:10px;min-height:48px;box-sizing:border-box;padding:10px 16px;cursor:pointer;user-select:none}.tv-acc-h:hover{background:var(--tv-hover)}" +
      ".tv-acc-h .tt{font-size:16px;font-weight:600;letter-spacing:0}.tv-acc-h .ss{font-size:12px;color:var(--tv-sec)}.tv-acc-h .tag{margin-left:auto;font-size:12px;white-space:nowrap}" +
      ".tv-acc-b{padding:0 16px 16px 16px;border-top:1px solid var(--tv-line)}.tv-acc-b>:first-child{margin-top:10px}" +
      ".tv-tchip.on .tv-dot{box-shadow:none}" +
      ".tv-step.now{background:transparent;border-top:2px solid var(--wf-sec)}.tv-step.done .n{background:var(--wf-ok)}.tv-step.now .n{background:var(--wf-accent)}" +
      ".tv-info>span{background:transparent;border:1px solid var(--tv-line)}" +
      ".tv-stat,.tv-delta div{background:transparent;border:1px solid var(--tv-line);border-radius:8px}" +
      ".tv-toggle.on,.theme--light .tv-toggle.on{background:transparent;border-color:var(--wf-ok)}.tv-toggle.on .est{color:inherit}" +
      // the buttons of the family, painted for what floats over the image (dark, filled), and the variants of Vision
      ".tvb.warn{color:#ef6c00;border-color:#ef6c00}.tvb.small{padding:3px 8px;font-size:12px}.tvb.ghost{border-color:transparent;color:var(--wf-info)}.tvb.big{padding:8px 14px}" +
      ".tv-sec .tvb.on{background:rgba(128,128,128,.22);font-weight:600}.tv-ov .tv-sec .tvb.on{background:#1976d2;color:#fff}" +
      ".tvb.on{background:rgba(128,128,128,.18);border-color:var(--wf-icon);font-weight:600}" +
      ".tv-sec .tvb{border-color:transparent}"
      ;
