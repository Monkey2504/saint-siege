/* Les cahiers que la maquette journal détache de l'édition.
 *
 * La proposition de la session de design compte six cahiers : l'édition du
 * tour, les ordres, le registre, le collège, les caisses, la correspondance.
 * Les ordres et le registre vivaient jusqu'ici dans la colonne de droite de
 * l'édition ; ils en sortent pour devenir des pages à part entière.
 *
 * Rien n'est réécrit au passage : ce sont les mêmes composants, montés dans le
 * cadre commun des pages. Un cahier qui redessinerait son contenu finirait par
 * diverger de l'édition, et le registre est précisément l'endroit où le jeu
 * promet de ne pas se contredire.
 */
import React, { useEffect, useState } from "react";
import { readGameData, readWorldState } from "../../runtime/gameState.js";
import { ActionsPanel } from "./actions.jsx";
import { Record } from "./bulletin.jsx";
import { CONTENU_TOP } from "./chrome.js";

/** Le cadre d'un cahier : même surface, même géométrie que l'édition. */
const Feuille = ({ surface, nav, children }) => (
  <div
    data-surface={surface}
    style={{
      background: "var(--oh-plate)",
      bottom: 0,
      color: "var(--oh-text)",
      left: 0,
      overflowY: "auto",
      position: "fixed",
      right: 0,
      top: CONTENU_TOP,
      zIndex: 10002,
    }}
  >
    <div style={{ margin: "0 auto", maxWidth: "74rem", padding: "1.6rem 1.5rem 3rem" }}>
      {nav && nav()}
      {children}
    </div>
  </div>
);

/** Les ordres : ce qu'on verse au dossier, et ce que le moteur en a jugé. */
export const Ordres = ({ onOpenAdvisor, nav }) => (
  <Feuille surface="press" nav={nav}>
    <ActionsPanel embedded isOpen onClose={() => {}} onOpenAdvisor={onOpenAdvisor} />
  </Feuille>
);

/** Le registre : les lignes que le moteur a écrites, et rien d'autre. */
export const Registre = ({ nav }) => {
  const [game, setGame] = useState(null);
  const [world, setWorld] = useState(null);

  useEffect(() => {
    let vivant = true;
    Promise.all([
      readGameData().catch(() => null),
      readWorldState({ force: true }).catch(() => null),
    ]).then(([g, w]) => {
      if (!vivant) return;
      setGame(g);
      setWorld(w);
    });
    return () => { vivant = false; };
  }, []);

  const player = game?.country || "";
  const usdPerSY = Number(player ? world?.economies?.[player]?.usdPerSY : 0) || 0;

  return (
    <Feuille surface="press" nav={nav}>
      <Record record={world?.record} treasuries={world?.treasuries} player={player} usdPerSY={usdPerSY} />
    </Feuille>
  );
};
