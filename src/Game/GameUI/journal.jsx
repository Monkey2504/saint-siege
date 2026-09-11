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

/**
 * Un entier écrit à la française : séparateur de milliers, et le vrai signe
 * moins (U+2212) plutôt que le trait d'union que rend toLocaleString. « −18641
 * AS » ne se lit pas ; « −18 641 AS » se lit.
 */
export const fmtEntier = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("fr-FR").replace("-", "−");
};

/** Le titre d'une section, sous son filet gras, avec sa mention à droite. */
export const SectionHead = ({ children, aside }) => (
  <div
    style={{
      alignItems: "baseline",
      borderBottom: "var(--oh-filet-fort) solid var(--oh-text-strong)",
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

/**
 * Un cahier vide. Ce qu'un journal fait d'une page sans matière n'est pas de
 * laisser la grille de la page pleine avec des colonnes creuses : il recompose
 * sur une seule colonne, monte le corps, et ancre le tout en haut sous
 * l'en-tête. La phrase reste celle qui était écrite — elle est juste — ; c'est
 * la mise en page qui manquait.
 */
export const CahierVide = ({ children, quoiFaire, ton }) => (
  <div style={{ margin: 0, maxWidth: "62ch", padding: "2rem 0 0" }}>
    <p
      style={{
        color: ton === "alert" ? "var(--oh-alert)" : "var(--oh-text)",
        fontFamily: "var(--oh-font-serif)",
        fontSize: "var(--oh-t-lg)",
        fontStyle: "italic",
        fontWeight: 400,
        lineHeight: 1.35,
        margin: 0,
      }}
    >
      {children}
    </p>
    {quoiFaire && (
      <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.6, margin: "0.9rem 0 0" }}>
        {quoiFaire}
      </p>
    )}
  </div>
);

/**
 * Le bandeau d'un cahier : son nom, et la mention qu'il porte à droite. Quatre
 * cahiers sur six l'avaient ; les Ordres et le Registre ouvraient directement
 * sur la barre de navigation, ce qui les faisait lire comme des panneaux et non
 * comme des pages. Le filet du bas est le plus lourd de la page : c'est lui qui
 * l'ouvre, et il n'y en a qu'un.
 */
export const EnTeteDeCahier = ({ titre, mention, sousMention }) => (
  <header style={{ borderBottom: "var(--oh-filet-manchette) solid var(--oh-text-strong)", paddingBottom: "0.5rem" }}>
    <div style={{ alignItems: "end", display: "flex", flexWrap: "wrap", gap: "1rem", justifyContent: "space-between" }}>
      <div>
        <div className="oh-label" style={{ color: "var(--oh-text-dim)" }}>Saint-Siège · cahier</div>
        <h1
          style={{
            color: "var(--oh-text-strong)",
            fontFamily: "var(--oh-font-serif)",
            fontSize: "var(--oh-t-3xl)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 1,
            margin: "0.1rem 0 0",
          }}
        >
          {titre}
        </h1>
      </div>
      {(mention || sousMention) && (
        <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, textAlign: "right" }}>
          {mention && <div className="oh-label" style={{ color: "var(--oh-text-strong)" }}>{mention}</div>}
          {sousMention && <div>{sousMention}</div>}
        </div>
      )}
    </div>
  </header>
);
