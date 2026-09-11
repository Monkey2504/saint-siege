/* La ligne des cahiers, telle que la maquette journal la dessine.
 *
 * Elle n'est pas une barre d'application flottant au-dessus de la page : c'est
 * une ligne du journal, entre deux filets, en petites capitales, sous le
 * bandeau. D'où le fait qu'elle soit rendue PAR chaque page, à l'endroit que
 * cette page lui donne, et non posée sur l'écran par main.jsx — le bandeau de
 * l'édition passe avant elle, ce qu'une barre fixe ne saurait faire.
 *
 * À droite, ce que la feuille contient. La maquette met ce compte sur la même
 * ligne, en regard des cahiers.
 */
import React from "react";

export const BarreDesCahiers = ({ sections, current, onSelect, apercu = "" }) => (
  <nav
    className="oh-cahiers"
    style={{
      alignItems: "baseline",
      borderBottom: "1px solid var(--oh-line)",
      borderTop: "1px solid var(--oh-line)",
      display: "flex",
      flexWrap: "wrap",
      gap: "0.2rem 1.4rem",
      justifyContent: "space-between",
      margin: "0 0 1.4rem",
      padding: "0.4rem 0",
    }}
  >
    <div className="oh-cahiers-rail" style={{ display: "flex", gap: "1.4rem", overflowX: "auto" }}>
      {sections.map(([id, label]) => {
        const actif = current === id;
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              background: "none",
              border: 0,
              // L'actif se distingue par l'encre et le soulignement, pas par un
              // pavé de couleur : une feuille imprimée n'a pas de bouton actif.
              borderBottom: actif ? "2px solid var(--oh-text-strong)" : "2px solid transparent",
              color: actif ? "var(--oh-text-strong)" : "var(--oh-text-dim)",
              cursor: "pointer",
              fontFamily: "var(--oh-font-label)",
              fontSize: "var(--oh-t-2xs)",
              fontWeight: "var(--oh-label-weight)",
              letterSpacing: "var(--oh-label-track)",
              padding: "0.15rem 0",
              textTransform: "var(--oh-label-case)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
    {apercu && (
      <span className="oh-cahiers-apercu" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", whiteSpace: "nowrap" }}>
        {apercu}
      </span>
    )}
  </nav>
);
