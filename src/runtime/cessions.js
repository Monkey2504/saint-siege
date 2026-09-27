// Ce qu'une vente rapporte, écrit par le moteur.
//
// Relevé en jouant : « vendre l'immeuble de rapport de l'APSA à Milan pour
// 30 millions d'euros » était accordé, l'édition racontait la procédure de
// vente, puis sa conclusion — et ni « En main » ni le patrimoine ne bougeaient
// d'un euro. Le moteur n'avait aucun chemin pour une cession : elle ne vivait
// que dans le récit. Une vente est un échange d'actifs : le bien sort du
// patrimoine placé, le prix entre en caisse. La richesse nette ne change pas,
// mais ce que le pape a en main, si.
//
// Quand l'argent entre :
//   - ordre exécuté en entier : ce tour ;
//   - ordre engagé (accordé en partie pour la seule raison du temps) : le tour
//     où son échéance est atteinte, une seule fois ;
//   - ordre freiné par autre chose (opposition, vote…) ou refusé : pas d'argent.
// Sans prix écrit dans l'ordre, rien n'entre : le moteur ne fixe pas le prix
// d'un immeuble à la place du joueur.

import { EUR_USD_2024 } from "./money.js";

const str = (v) => String(v ?? "").trim();
const num = (s) => Number(String(s).replace(/\s/g, "").replace(",", "."));

// Vendre, céder, mettre en vente — pas « la vente des indulgences » dans un
// autre sens : il faut un verbe d'ordre. Unicode, pour « céder ».
const VENTE = /(?<![\p{L}])(vend(re|ez|ons|u|ue|us|ues)?|c[ée]d(er|ez|ons)|mettre en vente|mise en vente|ali[ée]ner|sell|sale of)(?![\p{L}])/iu;
// Ce qui ne se vend pas (même liste d'esprit que realityCheck.INALIENABLE) :
// l'ordre est de toute façon refusé, on ne l'encaisse jamais.
const INVENDABLE = /(chapelle sixtine|basilique saint-pierre|mus[ée]es? du vatican|biblioth[èe]que apostolique|archives apostoliques|pi[èe]ta|castel gandolfo)/iu;

const MONTANT = [
  // 1,2 milliard d'euros · 1,2 Md€ · 1,2 milliards
  { re: /(\d+(?:[.,]\d+)?)\s*(?:milliards?|mds?)\s*(?:d['’]\s*|de\s+)?(euros?|€|dollars?|\$)?/iu, facteur: 1e9 },
  // 30 millions d'euros · 30 M€ · 30 millions
  { re: /(\d+(?:[.,]\d+)?)\s*(?:millions?|m(?=\s*[€$]))\s*(?:d['’]\s*|de\s+)?(euros?|€|dollars?|\$)?/iu, facteur: 1e6 },
];

/**
 * Le prix écrit dans un ordre de vente, en dollars (l'unité de conversion du
 * moteur), ou 0 si l'ordre ne vend rien ou ne dit pas son prix.
 */
export const prixDeCession = (texte) => {
  const t = str(texte);
  if (!VENTE.test(t) || INVENDABLE.test(t)) return 0;
  for (const { re, facteur } of MONTANT) {
    const m = t.match(re);
    if (!m) continue;
    const valeur = num(m[1]) * facteur;
    if (!(valeur > 0)) continue;
    const dollars = /dollar|\$/i.test(m[2] || "");
    return dollars ? valeur : valeur * EUR_USD_2024;
  }
  return 0;
};

/**
 * Les ventes à encaisser ce tour.
 *
 * `ordres` : les ordres du dossier après jugement (runtime/realityCheck.js,
 * applyActionOutcomes). `date` : la date de la nouvelle feuille.
 * Rend `{ ventes: [{ ordre, dollars }], ids }` — `ids` sont les ordres à marquer
 * `cessionEncaissee` pour qu'une échéance ne paie qu'une fois.
 */
export const cessionsAEncaisser = (ordres, date) => {
  const ventes = [];
  for (const o of Array.isArray(ordres) ? ordres : []) {
    if (!o || o.kind === "chat" || o.cessionEncaissee) continue;
    const dollars = prixDeCession(`${o.title ?? ""} ${o.text ?? ""}`);
    if (!dollars) continue;
    const executeCeTour = o.outcome === "success" && o.judgedOn === date;
    const echeanceAtteinte = o.enCours && o.echeance && str(o.echeance) <= str(date);
    if (executeCeTour || echeanceAtteinte) ventes.push({ ordre: o, dollars });
  }
  return { ventes, ids: ventes.map((v) => v.ordre.id) };
};

/**
 * Applique les ventes à l'économie du pape : le prix entre en caisse, le bien
 * sort du patrimoine placé. Une vente ne peut pas sortir plus que le
 * patrimoine ne contient. Rend l'économie nouvelle et les lignes du registre.
 */
export const encaisserLesCessions = (eco, ventes, { date, polity }) => {
  const usdPerSY = Number(eco?.usdPerSY) || 0;
  if (!eco || !(usdPerSY > 0) || !ventes.length) return { eco, lignes: [], encaisses: [] };
  let treasury = Number(eco.treasury) || 0;
  let endowment = Math.max(0, Number(eco.endowment) || 0);
  const lignes = [];
  const encaisses = [];
  for (const { ordre, dollars } of ventes) {
    const sy = Math.min(dollars / usdPerSY, endowment);
    if (!(sy > 0)) continue;
    treasury += sy;
    endowment -= sy;
    const titre = str(ordre.title).slice(0, 70);
    lignes.push(
      { date, polity, kind: "money", what: `vente conclue, prix encaissé : « ${titre} »`, amount: sy, unit: "SY", source: `order:sale:${ordre.id}` },
      { date, polity, kind: "patrimony", what: `bien sorti du patrimoine placé : « ${titre} »`, amount: -sy, unit: "SY", source: `order:sale-asset:${ordre.id}` },
    );
    encaisses.push({ ordre, sy });
  }
  return { eco: { ...eco, treasury, endowment }, lignes, encaisses };
};
