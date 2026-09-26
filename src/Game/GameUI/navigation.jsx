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
import React, { useEffect, useRef, useState } from "react";
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
    {/* `minWidth: 0` : un élément de flexbox ne descend pas sous la largeur de
        son contenu sans lui, et `overflowX: auto` n'y change rien. Le rail des
        six cahiers mesure plus de six cents pixels ; à 390 px, il poussait donc
        la ligne — et avec elle la page entière — au-delà de l'écran, et la une
        se faisait couper par la droite : le chapô, la photographie, tout. */}
    <div className="oh-cahiers-rail" style={{ display: "flex", gap: "1.4rem", minWidth: 0, overflowX: "auto" }}>
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
    {/* Mesuré à 390 px : ce groupe faisait 412 pixels de large et poussait la
        page entière au-delà de l'écran — la une s'y faisait couper par la
        droite, chapô et photographie compris. Le compte des cahiers ne se
        coupe pas (whiteSpace nowrap), et j'y ai ajouté deux boutons. Il se
        replie maintenant sur lui-même, et le compte se coupe à l'étroit
        (theme.css, @media max-width 40rem). */}
    <div style={{ alignItems: "baseline", display: "flex", flexWrap: "wrap", gap: "0.9rem", justifyContent: "flex-end", minWidth: 0 }}>
      {apercu && (
        <span className="oh-cahiers-apercu" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", whiteSpace: "nowrap" }}>
          {apercu}
        </span>
      )}
      {/* Clé, Triche et Bibliothèque vivaient en clair sur la ligne des
          cahiers, à égalité avec eux. Un joueur qui découvrait le jeu lisait
          « TRICHE » à côté de « COLLÈGE ». Ils passent sous le ⋮ : toujours à
          un clic, plus en vitrine. */}
      <MenuDeLaFeuille />
    </div>
  </nav>
);

const entreeDuMenu = {
  background: "none",
  border: 0,
  color: "var(--oh-text)",
  cursor: "pointer",
  display: "block",
  fontFamily: "var(--oh-font-body)",
  fontSize: "var(--oh-t-xs)",
  padding: "0.45rem 0.9rem",
  textAlign: "left",
  whiteSpace: "nowrap",
  width: "100%",
};

const MenuDeLaFeuille = () => {
  const [ouvert, setOuvert] = useState(false);
  const boite = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const fermer = (e) => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    const echap = (e) => { if (e.key === "Escape") setOuvert(false); };
    document.addEventListener("mousedown", fermer);
    document.addEventListener("keydown", echap);
    return () => { document.removeEventListener("mousedown", fermer); document.removeEventListener("keydown", echap); };
  }, [ouvert]);
  const choisir = (faire) => () => { setOuvert(false); faire(); };
  return (
    <span ref={boite} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setOuvert((o) => !o)}
        title="Plus"
        aria-haspopup="menu"
        aria-expanded={ouvert}
        style={{ background: "none", border: 0, color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-sm)", lineHeight: 1, padding: "0 0 0 0.2rem" }}
      >
        ⋮
      </button>
      {ouvert && (
        <div
          role="menu"
          style={{
            background: "var(--oh-plate)",
            border: "1px solid var(--oh-line)",
            boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
            padding: "0.3rem 0",
            position: "absolute",
            right: 0,
            top: "calc(100% + 0.4rem)",
            zIndex: 50,
          }}
        >
          <button type="button" role="menuitem" style={entreeDuMenu} onClick={choisir(() => openLibraryTab("games"))}>Vos parties</button>
          <button type="button" role="menuitem" style={entreeDuMenu} onClick={choisir(() => ouvrirLEcranDesCles())}>Clé d'accès au modèle</button>
          <button type="button" role="menuitem" style={{ ...entreeDuMenu, color: "var(--oh-text-dim)" }} onClick={choisir(() => ouvrirLaTriche())}>Banc d'essai (triche)</button>
        </div>
      )}
    </span>
  );
};
