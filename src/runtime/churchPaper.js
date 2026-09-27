/*! Open Historia — ce que le journal de l'Église imprime © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// Deux règles données au modèle, et deux fois ignorées en jouant :
//
// 1. « Pas d'affaires intérieures d'États sans lien avec l'Église. » Une partie
//    a imprimé « Kazakhstan : ajustement budgétaire », une autre « Adoption de
//    nouvelles mesures budgétaires par la Diète à Tokyo », entre deux nouvelles
//    de la Curie. Le lecteur d'un mensuel de l'Église n'a aucune raison de lire
//    ça, et il le lit comme un bug.
// 2. « Pas de paroles ni d'actes nouveaux prêtés aux vrais prélats vivants. »
//    L'édition suivante faisait mener une délégation par « le cardinal Burke »
//    et solliciter des instructions par « le cardinal Farrell ».
//
// La leçon que ce projet a apprise six fois : une règle qui demande au modèle
// de porter une contrainte ne la fait pas porter. Le moteur l'applique donc
// lui-même, sur chaque événement neuf, avant qu'il soit enregistré et relu.

import { ledgerContradictions } from "./claimCheck.js";
import { EUR_USD_2024 } from "./money.js";
import { groupsOn, normalizeAssembly, ownBloc, standing } from "./factions.js";

const str = (v) => String(v ?? "").trim();

// Ce qui fait qu'une nouvelle regarde l'Église. Large à dessein : on ne retire
// que ce qui ne la concerne manifestement pas.
// Chaque mot doit commencer un mot : « annoncée » contenait « nonc » (nonce),
// « promesse » contenait « messe », et le budget de Moscou passait pour une
// nouvelle de l'Église.
const EGLISE = /(?<![\p{L}])(églis|eglis|church|vatican|saint-si[èe]ge|holy see|pap(e|al|auté|e\b)|pontif|cardinal|évêque|eveque|épiscop|episcop|bishop|dioc[èe]s|synod|catholi|curie|curia|prêtre|pretre|priest|clerg|séminair|seminar|fidèles|faithful|nonc(e|es|iature)|dicast[èe]re|religieu|chrétien|chretien|christian|concordat|paroiss|parish|messe|liturg|abus|dubia|jésuite|jesuit|opus dei|conclave|consistoire|consistory|apsa|ior\b|denier de saint-pierre|basilique|pèlerin|pelerin|pilgrim|canoni|mission(naire)?s?\b|congrégation|monast|couvent|abbaye|sœurs?\b|soeurs?\b|frères?\b|moines?|ordres? religieu|caritas|sant'egidio|malte|fsspx|lefebvr)/iu;

/** La nouvelle regarde-t-elle l'Église, le pape ou ses corps ? */
export const regardeLEglise = (event) => {
  if (!event || typeof event !== "object") return false;
  if (event.playerRelated || event.kind === "player") return true;
  return EGLISE.test(`${str(event.title)} ${str(event.description)} ${str(event.actor)}`);
};

// Les vrais prélats vivants que le scénario nomme, et le rôle qui les remplace.
// `defini` : un titre unique (« le camerlingue ») ; sinon un membre d'un groupe
// (« un cardinal du bloc des dubia »).
const PRELATS = [
  { noms: ["Raymond Leo Burke", "Raymond Burke", "Burke"], indefini: "cardinal du bloc des dubia" },
  { noms: ["Walter Brandmüller", "Brandmüller", "Brandmuller"], indefini: "cardinal du bloc des dubia" },
  { noms: ["Robert Sarah", "Sarah"], indefini: "cardinal du bloc des dubia", titreRequis: true },
  { noms: ["Joseph Zen", "Zen"], indefini: "cardinal du bloc des dubia", titreRequis: true },
  { noms: ["Juan Sandoval Íñiguez", "Sandoval Íñiguez", "Sandoval Iñiguez", "Sandoval"], indefini: "cardinal du bloc des dubia" },
  { noms: ["Reinhard Marx", "Marx"], indefini: "cardinal allemand du Chemin synodal", titreRequis: true },
  { noms: ["Georg Bätzing", "Bätzing", "Batzing"], defini: "président de la Conférence épiscopale allemande" },
  { noms: ["Kevin Farrell", "Farrell"], defini: "camerlingue" },
  { noms: ["Pietro Parolin", "Parolin"], defini: "secrétaire d'État" },
  { noms: ["Víctor Manuel Fernández", "Victor Manuel Fernández", "Víctor Fernández", "Fernández", "Fernandez"], defini: "préfet de la Doctrine de la Foi", titreRequis: true },
  { noms: ["Arthur Roche", "Roche"], defini: "préfet du Culte divin", titreRequis: true },
  { noms: ["Fernando Ocáriz", "Ocáriz", "Ocariz"], defini: "prélat de l'Opus Dei" },
  { noms: ["Gerhard Ludwig Müller", "Gerhard Müller"], indefini: "ancien préfet de la Doctrine" },
];

const TITRE = "(?:cardinal|card\\.|mgr|monseigneur|mons\\.|évêque|archevêque|père|don|prélat)";
const echappe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Article devant le nom (ou devant le titre), pour accorder le remplacement.
const ARTICLE = "((?<![\\p{L}])(?:par le|pour le|avec le|sur le|le|du|au|de|à)\\s+)?";

const accorde = (article, prelat) => {
  const a = str(article).toLowerCase();
  if (prelat.defini) {
    const r = prelat.defini;
    const commenceParVoyelle = /^[aeiouéèêh]/i.test(r);
    if (a === "du" || a === "de") return commenceParVoyelle ? `de l'${r}` : `du ${r}`;
    if (a === "au" || a === "à") return commenceParVoyelle ? `à l'${r}` : `au ${r}`;
    if (a.startsWith("par ") || a.startsWith("pour ") || a.startsWith("avec ") || a.startsWith("sur ")) {
      return `${a.split(" ")[0]} ${commenceParVoyelle ? "l'" : "le "}${r}`;
    }
    return commenceParVoyelle ? `l'${r}` : `le ${r}`;
  }
  const r = prelat.indefini;
  if (a === "du" || a === "de") return `d'un ${r}`;
  if (a === "au" || a === "à") return `à un ${r}`;
  if (a.startsWith("par ") || a.startsWith("pour ") || a.startsWith("avec ") || a.startsWith("sur ")) return `${a.split(" ")[0]} un ${r}`;
  return `un ${r}`;
};

const MOTIFS = PRELATS.flatMap((prelat) => prelat.noms.map((nom) => {
  // Un nom de famille court et courant (Sarah, Zen, Marx, Roche…) n'est
  // remplacé que précédé d'un titre : « la Sarah » ou « Karl Marx » ne sont
  // pas des cardinaux.
  const titre = prelat.titreRequis && !nom.includes(" ") ? `${TITRE}\\s+` : `(?:${TITRE}\\s+)?`;
  return {
    prelat,
    re: new RegExp(`${ARTICLE}${titre}${echappe(nom)}(?![\\p{L}])`, "giu"),
  };
}));

const majuscule = (texte, index, remplacement) => {
  // En début de phrase, le remplacement prend la majuscule.
  const avant = texte.slice(0, index).trimEnd();
  return !avant || /[.!?:«"]$/.test(avant) ? remplacement.charAt(0).toUpperCase() + remplacement.slice(1) : remplacement;
};

/** Remplace, dans un texte, les vrais prélats vivants par leur rôle. */
export const sansPrelatsReels = (texte) => {
  let out = str(texte);
  if (!out) return out;
  for (const { prelat, re } of MOTIFS) {
    out = out.replace(re, (m, article, index, tout) => majuscule(tout, index, accorde(article, prelat)));
  }
  return out;
};

/**
 * Le tri du journal, appliqué aux événements neufs d'une partie du Saint-Siège :
 * les vrais prélats deviennent leur rôle, et les affaires intérieures d'États
 * sans lien avec l'Église ne sont pas imprimées.
 */
export const trierPourLeJournal = (events) => {
  const gardes = [];
  const retires = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!event) continue;
    const propre = {
      ...event,
      title: sansPrelatsReels(event.title),
      description: sansPrelatsReels(event.description),
    };
    if (regardeLEglise(propre)) gardes.push(propre);
    else retires.push(propre);
  }
  return { gardes, retires };
};

// ── Les chiffres des comptes ─────────────────────────────────────────────────
//
// Relevé en jouant : une édition écrivait « le déficit structurel, évalué à
// 44,5 millions d'euros par an » sur la même page où les Comptes affichaient
// −28 M€. Le conseiller avait déjà son contrôle (claimCheck.js) ; l'édition,
// qui est ce que le joueur lit le plus, n'en avait aucun. Le moteur ne réécrit
// pas le récit : il imprime à la suite ce que dit le registre, comme il le fait
// sous une réponse du conseiller.


const MONNAIE = ["revenue", "spending", "balance", "treasury", "endowment", "unfundedLiabilities"];
const NOM_DU_POSTE = {
  revenue: "recettes annuelles",
  spending: "dépenses annuelles",
  balance: "solde de l'année",
  treasury: "trésorerie",
  endowment: "patrimoine",
  unfundedLiabilities: "promesses non financées (retraites)",
};
// Au-delà d'un quart d'écart, ce n'est plus un arrondi ni le chiffre d'un
// autre moment du tour : c'est un autre chiffre.
const ECART = 0.25;

const enEuros = (eur) => {
  const a = Math.abs(eur);
  if (a >= 1e9) return `${(a / 1e9).toFixed(2).replace(".", ",")} Md€`;
  if (a >= 1e6) return `${(a / 1e6).toFixed(a >= 1e8 ? 0 : 1).replace(".", ",")} M€`;
  return `${Math.round(a).toLocaleString("fr-FR")} €`;
};

/** Les indicateurs du moteur (en AS), convertis en euros. */
export const comptesEnEuros = (indicators, usdPerSY) => {
  if (!indicators || !(Number(usdPerSY) > 0)) return null;
  const k = Number(usdPerSY) / EUR_USD_2024;
  const out = { ...indicators };
  for (const key of MONNAIE) if (Number.isFinite(Number(out[key]))) out[key] = Number(out[key]) * k;
  return out;
};

/** Ce que le registre dit, quand un récit contredit les comptes (ou ""). */
export const noteDuRegistre = (texte, comptesEur) => {
  if (!comptesEur) return "";
  const lignes = [];
  const vus = new Set();
  for (const c of ledgerContradictions(texte, comptesEur)) {
    if (vus.has(c.key)) continue;
    const actual = Number(c.actual);
    if (!Number.isFinite(actual)) continue;
    if (c.kind === "figure") {
      let dit = Number(c.claimed);
      if (/dollar|\$|usd/i.test(String(c.after || ""))) dit /= EUR_USD_2024;
      if (Math.abs(dit - Math.abs(actual)) / Math.max(Math.abs(actual), 1) <= ECART) continue;
    }
    vus.add(c.key);
    const poste = NOM_DU_POSTE[c.key] || c.key;
    lignes.push(c.key === "balance"
      ? `${poste} ${actual < 0 ? "en déficit de" : "en excédent de"} ${enEuros(actual)}`
      : `${poste} : ${enEuros(actual)}`);
  }
  return lignes.length ? `Au registre : ${lignes.join(" ; ")}.` : "";
};

// Les comptes du registre sont ceux du Saint-Siège : une nouvelle sur le budget
// d'un autre (Moscou, Tokyo, une conférence épiscopale) ne se vérifie pas
// contre eux. Relevé en jouant : la note du registre tombait sous le budget russe.
const COMPTES_DU_SAINT_SIEGE = /(?<![\p{L}])(saint-si[èe]ge|vatican|curie|apsa|ior\b|denier de saint-pierre|fonds de pension|secrétari(at|e) pour l'économie|conseil pour l'économie|dicast[èe]re|pape|pontif)/iu;
/** La nouvelle parle-t-elle de l'argent du Saint-Siège lui-même ? */
export const parleDesComptesDuSaintSiege = (event) => Boolean(event && (event.playerRelated
  || COMPTES_DU_SAINT_SIEGE.test(`${str(event.title)} ${str(event.description)}`)));

// ── Les décomptes du collège ────────────────────────────────────────────────
//
// Relevé en jouant : « 42 voix acquises à votre courant, 15 oppositions
// déclarées du bloc traditionaliste, et 103 électeurs indécis » sur une page où
// le collège affichait 0 favorables, 160 indécis, 0 hostiles. Le modèle a la
// consigne de n'imprimer que les décomptes du moteur ; il ne la tient pas
// toujours. Un décompte que le moteur ne connaît pas reçoit, à la suite, le
// décompte du collège — comme un chiffre des comptes reçoit celui du registre.


const DECOMPTE = /(?<![\p{L}\p{N}])(\d{1,3})\s+(?:voix|électeurs|electeurs|cardinaux|indécis|opposants?|oppositions?|favorables|hostiles|suffrages|votants?|abstentions?)(?![\p{L}])/giu;

/** Les nombres qu'un récit peut écrire sur le collège, et le résumé à imprimer. */
export const decomptesDuCollege = (assembly, player) => {
  const a = normalizeAssembly(assembly);
  if (!a) return null;
  const s = standing(a);
  const mien = ownBloc(a, player).seats;
  const permis = new Set([a.seats, s.majority, s.with, s.undecided, s.against, mien, Math.max(0, s.majority - mien)]);
  const courants = [];
  for (const axis of ["doctrine", "region", "role", "follows"]) {
    for (const g of groupsOn(a, axis)) {
      permis.add(g.seats);
      if (axis === "follows" && g.name && g.name !== player) courants.push(g.seats);
    }
  }
  // Une coalition du courant du pape avec un autre courant est un décompte réel.
  for (const n of courants) permis.add(mien + n);
  const resume = `${a.seats} électeurs ; votre courant vote avec vous (${mien} voix), il en faut ${s.majority} ; opinion de la salle : ${s.with} favorables, ${s.undecided} indécis, ${s.against} hostiles`;
  return { permis, resume };
};

/** Le décompte du collège, quand un récit en écrit un autre (ou ""). */
export const noteDuCollege = (texte, decomptes) => {
  if (!decomptes) return "";
  for (const m of String(texte ?? "").matchAll(DECOMPTE)) {
    const n = Number(m[1]);
    if (n < 10) continue; // « cinq cardinaux », « trois votants » : pas un décompte de la salle
    if (!decomptes.permis.has(n)) return `Au collège : ${decomptes.resume}.`;
  }
  return "";
};
