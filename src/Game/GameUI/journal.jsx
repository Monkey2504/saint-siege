/* Les pièces typographiques communes au journal.
 *
 * Elles vivaient dans bulletin.jsx, qui était le seul à composer des sections.
 * Depuis que les cahiers et l'aperçu du collège en posent aussi, les garder là
 * obligerait college.jsx à importer bulletin.jsx — qui importe college.jsx pour
 * son hémicycle. Un module neutre coupe le cycle, et évite la seule autre
 * issue : recopier l'en-tête, et le voir diverger d'une page à l'autre.
 */
import React from "react";

/** Une quantité du moteur, en années-subsistance. */
export const fmtSY = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
};

/** Un dénombrement — des personnes, des fidèles. */
export const fmtCount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(Math.round(n));
};

/** Une somme en monnaie du lecteur. `null` pour zéro, à dessein. */
export const fmtMoney = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return null;
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${Math.round(abs / 1e6)}M`;
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`;
  return `${sign}$${Math.round(abs)}`;
};

/**
 * Une somme dans la monnaie du lecteur, en AS seulement quand la page n'a pas
 * de taux pour convertir. Écrite une fois parce qu'elle l'avait été trois :
 * fmtMoney rend null pour zéro, chaque copie retombait sur la branche AS, et
 * une ligne de caisse disait « capital 0 AS à 5,1 % · 11 M$ en main » — deux
 * unités dans une phrase, pour un organisme qui ne détient aucun capital.
 */
export const moneyOf = (sy, usdPerSY) => {
  const n = Number(sy) || 0;
  if (!(usdPerSY > 0)) return `${fmtSY(n)} AS`;
  return fmtMoney(n * usdPerSY) ?? "$0";
};

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
