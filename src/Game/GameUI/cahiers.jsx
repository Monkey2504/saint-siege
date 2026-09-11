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
import dayjs from "dayjs";
import { ActionsPanel } from "./actions.jsx";
import { Record } from "./bulletin.jsx";
import { EnTeteDeCahier } from "./journal.jsx";
import { CONTENU_TOP } from "./chrome.js";

/** Le cadre d'un cahier : même surface, même géométrie que l'édition. */
const Feuille = ({ surface, nav, entete = null, children }) => (
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
      {entete}
      {nav && nav()}
      {children}
    </div>
  </div>
);


/** La partie en cours, lue une fois. Les deux cahiers en ont besoin pour la
 *  mention de tour que les quatre autres portent déjà. */
const usePartie = () => {
  const [etat, setEtat] = useState({ game: null, world: null });
  useEffect(() => {
    let vivant = true;
    Promise.all([
      readGameData().catch(() => null),
      readWorldState({ force: true }).catch(() => null),
    ]).then(([game, world]) => { if (vivant) setEtat({ game, world }); });
    return () => { vivant = false; };
  }, []);
  return etat;
};

/** La mention de droite d'un bandeau de cahier : le tour, et sa date. */
const mentionDeTour = (game) => {
  const date = game?.gameDate ? dayjs(game.gameDate) : null;
  return date && date.isValid()
    ? `Tour ${game?.round || 1} · ${date.format("D MMMM YYYY")}`
    : `Tour ${game?.round || 1}`;
};

/** Les ordres : ce qu'on verse au dossier, et ce que le moteur en a jugé. */
export const Ordres = ({ onOpenAdvisor, nav }) => {
  const { game } = usePartie();
  return (
    <Feuille surface="press" nav={nav} entete={<EnTeteDeCahier titre="Les Ordres" mention={mentionDeTour(game)} sousMention="Ce qui prendra effet au prochain tour" />}>
      <ActionsPanel embedded isOpen onClose={() => {}} onOpenAdvisor={onOpenAdvisor} />
    </Feuille>
  );
};

/** Le registre : les lignes que le moteur a écrites, et rien d'autre. */
export const Registre = ({ nav }) => {
  const { game, world } = usePartie();
  const player = game?.country || "";
  const usdPerSY = Number(player ? world?.economies?.[player]?.usdPerSY : 0) || 0;

  return (
    <Feuille surface="press" nav={nav} entete={<EnTeteDeCahier titre="Le Registre" mention={mentionDeTour(game)} sousMention={`Unité : ${usdPerSY > 0 ? "euros, convertis des années-subsistance" : "années-subsistance (AS)"}`} />}>
      <Record record={world?.record} treasuries={world?.treasuries} player={player} usdPerSY={usdPerSY} />
    </Feuille>
  );
};
