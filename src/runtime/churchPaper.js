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

const str = (v) => String(v ?? "").trim();

// Ce qui fait qu'une nouvelle regarde l'Église. Large à dessein : on ne retire
// que ce qui ne la concerne manifestement pas.
const EGLISE = /(églis|eglis|church|vatican|saint-si[èe]ge|holy see|pap(e|al|auté|e\b)|pontif|cardinal|évêque|eveque|épiscop|episcop|bishop|dioc[èe]s|synod|catholi|curie|curia|prêtre|pretre|priest|clerg|séminair|seminar|fidèles|faithful|nonc|dicast[èe]re|religieu|chrétien|chretien|christian|concordat|paroiss|parish|messe|liturg|abus|dubia|jésuite|jesuit|opus dei|conclave|consistoire|consistory|apsa|ior\b|denier de saint-pierre|basilique|pèlerin|pelerin|pilgrim|canoni|mission(naire)?s?\b|congrégation|monast|couvent|abbaye|sœurs?\b|soeurs?\b|frères?\b|moines?|ordres? religieu|caritas|sant'egidio|malte|fsspx|lefebvr)/i;

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
const ARTICLE = "(\\b(?:par le|pour le|avec le|sur le|le|du|au)\\s+)?";

const accorde = (article, prelat) => {
  const a = str(article).toLowerCase();
  if (prelat.defini) {
    const r = prelat.defini;
    const commenceParVoyelle = /^[aeiouéèêh]/i.test(r);
    if (a === "du") return commenceParVoyelle ? `de l'${r}` : `du ${r}`;
    if (a === "au") return commenceParVoyelle ? `à l'${r}` : `au ${r}`;
    if (a.startsWith("par ") || a.startsWith("pour ") || a.startsWith("avec ") || a.startsWith("sur ")) {
      return `${a.split(" ")[0]} ${commenceParVoyelle ? "l'" : "le "}${r}`;
    }
    return commenceParVoyelle ? `l'${r}` : `le ${r}`;
  }
  const r = prelat.indefini;
  if (a === "du") return `d'un ${r}`;
  if (a === "au") return `à un ${r}`;
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
    re: new RegExp(`${ARTICLE}${titre}${echappe(nom)}\\b`, "gi"),
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
