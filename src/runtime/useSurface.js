/*! Open Historia — which room of the house the player is standing in © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

import { useEffect } from "react";

// A section declares its room and the whole document takes that room's palette
// (theme.css, [data-surface]). The attribute goes on <html>, not only on the
// section's own container, for two reasons:
//
//   The chrome belongs to the room. The tab bar, the top bar and the date
//   widget sit outside every section's container; if the room stopped at the
//   container's edge, the letters page would be writing paper framed in
//   newsprint.
//
//   A canvas cannot resolve a custom property. The adviser's charts read the
//   tokens off document.documentElement and pass real values to Chart.js
//   (GameUI/advisor.jsx). Published at the root, a chart drawn in the ledger is
//   drawn in the ledger's colours; scoped to a container, it would have gone on
//   using the paper's ink on the ledger's ground.
//
// The attribute is removed on unmount so a section that closes leaves the house
// as it found it.
export const useSurface = (room) => {
  useEffect(() => {
    if (typeof document === "undefined" || !room) return undefined;
    const root = document.documentElement;
    const previous = root.getAttribute("data-surface");
    root.setAttribute("data-surface", room);
    return () => {
      if (previous) root.setAttribute("data-surface", previous);
      else root.removeAttribute("data-surface");
    };
  }, [room]);
};
