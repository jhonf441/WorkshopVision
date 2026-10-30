// ---- Control bar: "when closed" and "automatic collapse" settings ----
// 2026-10-12: two independent user settings, the same on every page:
//   closed:    "rail"  = narrow icon rail (default) | "arrow" = whole bar hidden,
//              only a small arrow tab on the edge
//   autoClose: true  = the bar closes by itself (mouse leaves it, tap outside)
//              false = it stays open until the collapse button (default)
// Stored in workshopBarConfig as { cerrada: "riel"|"flecha", colapsoAuto: bool }.
// Pure functions (no DOM) so tests/sidebar-config.test.js can load them.

// Stored config -> { closed: "rail"|"arrow", autoClose: boolean, pushPage: boolean }; anything missing or invalid is rail, no auto,
// push (pushPage: the DWC page narrows to make room for the bar instead of being covered by it; only an explicit false turns it off,
// a bar floating over the page covered the action buttons of DWC's tables).
// Making room only works with the rail: a rail that does not make room would cover DWC, so without push the closed look is the arrow.
function workshopSidebarRead(cfg) {
  var c = cfg && typeof cfg === "object" ? cfg : {};
  var push = c.pushPage !== false;
  return {
    closed: c.closed === "arrow" || !push ? "arrow" : "rail",
    autoClose: c.collapseAuto === true,
    pushPage: push
  };
}

// Internal -> stored values.
function workshopSidebarStore(state) {
  var push = !(state && state.pushPage === false);
  return { closed: state && state.closed === "arrow" || !push ? "arrow" : "rail", collapseAuto: !!(state && state.autoClose), pushPage: push };
}

// Pixels the page gives up on the right for the bar (push layout), 0 when it must not (option off, bar hidden as an arrow, or the
// screen so narrow that the page would be left unusable: then the bar keeps floating over the page).
//   push: option on; collapsed: bar closed (rail or arrow); closed: "rail"|"arrow" look when closed; viewport: window width in px
//   railW / openW: widths of the closed rail and of the open bar; gap: distance from the bar to the window edge plus a breathing space
function workshopSidebarReserve(push, collapsed, closed, viewport, railW, openW, gap) {
  if (!push || !(viewport > 0)) return 0;
  if (collapsed && closed === "arrow") return 0;
  var width = collapsed ? railW : Math.min(openW, viewport - 24);
  var reserve = width + gap;
  var minPage = collapsed ? 300 : 480; // what must be left for the page itself
  if (viewport >= 1264) {
    // DWC lays its cards out in three columns from this width and keeps its 256 px menu next to them: squeezed by the bar the cards
    // overlap and get cut (QA U-11 at 1280 with the bar open), so what is left for the content must still hold three columns.
    // Below it DWC switches to fewer columns by itself and the plain minimum is enough.
    if (viewport - 256 - reserve < 880) return 0;
  }
  return viewport - reserve >= minPage ? reserve : 0;
}

// Should the bar close by itself on this event? Only with automatic collapse
// on, while open, and never while the gear menu or "arrange" is open.
function workshopSidebarShouldAutoClose(autoClose, isOpen, busy) {
  return !!autoClose && !!isOpen && !busy;
}
