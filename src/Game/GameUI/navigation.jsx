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
import { openLibraryTab } from "./libraryBar.jsx";
import { ouvrirLEcranDesCles, ouvrirLaTriche } from "./triche.js";

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
              borderBottom: actif ? "var(--oh-filet-fort) solid var(--oh-text-strong)" : "var(--oh-filet-fort) solid transparent",
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
    <div style={{ alignItems: "baseline", display: "flex", gap: "0.9rem" }}>
      {apercu && (
        <span className="oh-cahiers-apercu" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", whiteSpace: "nowrap" }}>
          {apercu}
        </span>
      )}
      {/* L'écran des clés. Il ne paraissait qu'au tout premier lancement — et
          c'est le jour où la clé cesse de marcher qu'on veut le relire. */}
      <button
        type="button"
        onClick={() => ouvrirLEcranDesCles()}
        title="Rouvrir l'écran des clés"
        style={{
          background: "none",
          border: 0,
          color: "var(--oh-text-dim)",
          cursor: "pointer",
          fontFamily: "var(--oh-font-label)",
          fontSize: "var(--oh-t-2xs)",
          letterSpacing: "var(--oh-label-track)",
          lineHeight: 1,
          padding: 0,
          textTransform: "var(--oh-label-case)",
        }}
      >
        Clé
      </button>
      {/* Le banc d'essai. Il vit derrière les Réglages, eux-mêmes derrière un
          bouton que le journal ne montre pas : depuis que la feuille part du
          bord de l'écran, il n'y avait plus d'endroit d'où l'atteindre en
          jouant. Il est ici, discret, à côté de la porte de la bibliothèque. */}
      <button
        type="button"
        onClick={() => ouvrirLaTriche()}
        title="Banc d'essai — forcer l'état du monde"
        style={{
          background: "none",
          border: 0,
          color: "var(--oh-text-dim)",
          cursor: "pointer",
          fontFamily: "var(--oh-font-label)",
          fontSize: "var(--oh-t-2xs)",
          letterSpacing: "var(--oh-label-track)",
          lineHeight: 1,
          padding: 0,
          textTransform: "var(--oh-label-case)",
        }}
      >
        Triche
      </button>
      {/* La porte de la bibliothèque. Elle flottait sur la page ; depuis que la
          feuille part du bord de l'écran, elle passait dessous et le joueur se
          retrouvait enfermé dans sa partie. Elle est ici, au bout de la ligne. */}
      <button
        type="button"
        onClick={() => openLibraryTab("games")}
        title="Votre bibliothèque"
        style={{
          background: "none",
          border: 0,
          color: "var(--oh-text-dim)",
          cursor: "pointer",
          fontSize: "var(--oh-t-sm)",
          lineHeight: 1,
          padding: "0 0 0 0.2rem",
        }}
      >
        ⋮
      </button>
    </div>
  </nav>
);
