/*! Open Historia — visual direction © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// One direction: the Bulletin. Two others (an atlas plate, an assembly's minutes)
// were shipped for a while as switchable palettes, but once the front page was
// rebuilt as a real newspaper the switch only changed colours and no longer the
// page — a control that half-works is worse than none. The attribute on <html>
// stays, so every token in theme.css keeps one resolution path and a future
// direction can be added without touching components.

export const VISUAL_THEME = "bulletin";

/** Called once at boot, before the first paint. */
export function initVisualTheme() {
  const root = globalThis.document?.documentElement;
  if (root) root.dataset.ohTheme = VISUAL_THEME;
  return VISUAL_THEME;
}
