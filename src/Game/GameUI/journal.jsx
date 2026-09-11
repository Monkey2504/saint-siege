/* Les pièces typographiques communes au journal.
 *
 * Elles vivaient dans bulletin.jsx, qui était le seul à composer des sections.
 * Depuis que les cahiers et l'aperçu du collège en posent aussi, les garder là
 * obligerait college.jsx à importer bulletin.jsx — qui importe college.jsx pour
 * son hémicycle. Un module neutre coupe le cycle, et évite la seule autre
 * issue : recopier l'en-tête, et le voir diverger d'une page à l'autre.
 */
import React from "react";

/** Le titre d'une section, sous son filet gras, avec sa mention à droite. */
export const SectionHead = ({ children, aside }) => (
  <div
    style={{
      alignItems: "baseline",
      borderBottom: "4px solid var(--oh-text-strong)",
      display: "flex",
      gap: "1rem",
      justifyContent: "space-between",
      paddingBottom: "0.4rem",
    }}
  >
    <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>{children}</span>
    {aside && <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{aside}</span>}
  </div>
);
