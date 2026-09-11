/* Une partie jouée, écrite par le moteur, pour que la capture ait quelque chose
 * à montrer.
 *
 * Le reproche de la session de design, et il est juste : « les deux audits de
 * design ont validé des pages qui ne montraient rien ». scripts/rendu.mjs
 * capture au tour 1 — aucune caisse ouverte, aucune lettre reçue, aucun ordre
 * jugé — et ce sont des états réels, mais ils ne montrent AUCUN des composants
 * qui portent le contenu : tableaux, fil de lettres, verdicts, registre.
 *
 * Jouer vraiment ne suffit pas : une caisse ne s'ouvre que par les `impacts`
 * du modèle (applyTreasuryOps), et le parcours de capture se fait sans clé.
 * D'où cette partie de démonstration.
 *
 * Elle n'est PAS écrite à la main. Chaque état passe par la fonction du moteur
 * qui le produirait en jeu — applyTreasuryOps, stepTreasuries, applyDriveOps,
 * applyGatheringOps, inaugurate, assessAction — si bien qu'elle ne peut pas
 * décrire un monde que le moteur refuserait, et que le registre porte les
 * lignes que ces mouvements ont réellement écrites. Un état inventé à la main
 * ferait valider à la session de design une page que le jeu ne produit pas :
 * exactement la faute qu'on répare ici.
 *
 *     node scripts/partie-de-demonstration.mjs
 *     → design/fixtures/partie-jouee.json
 */

import fs from "node:fs";
import path from "node:path";

const seed = (await import("../src/runtime/web/generated/defaultScenario.js")).default;
const { HOLY_SEE, CHURCH_START_DATE } = await import("../src/runtime/churchPreset.js");
const { inaugurate } = await import("../src/runtime/inauguration.js");
const { applyTreasuryOps, stepTreasuries } = await import("../src/runtime/treasuries.js");
const { applyDriveOps } = await import("../src/runtime/drives.js");
const { applyGatheringOps } = await import("../src/runtime/gatherings.js");
const { appendRecord } = await import("../src/runtime/record.js");
const { assessAction } = await import("../src/runtime/realityCheck.js");

const IOR = "IOR — Institut pour les Œuvres de Religion";
const CONSEIL = "Conseil pour l'Économie";
const CURIE = "Curie romaine";

const jour = (n) => {
  const d = new Date(CHURCH_START_DATE);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
};

/* ── Le pontificat est signé ──────────────────────────────────────────────── */

let world = inaugurate(seed.data.world, {
  name: "Léon XV",
  declaration: "Remettre les comptes au clair, ouvrir la porte aux périphéries, et juger les dossiers d'abus sans en garder un seul.",
});

/* ── Trois caisses, dont une fédérée sous une autre ───────────────────────── */

const ouvert = applyTreasuryOps(world.treasuries, [
  { op: "open", body: IOR, retain: 0.6, key: "equal" },
  { op: "open", body: CONSEIL, parent: IOR, retain: 0.2, key: "equal" },
  { op: "open", body: CURIE, parent: IOR, retain: 0, key: "equal" },
  { op: "capitalise", body: IOR, amount: 620_000, from: HOLY_SEE },
  { op: "margin", body: IOR, margin: 0.08 },
], { date: jour(1), organizations: world.organizations });
if (ouvert.refusals?.length) { console.error("REFUS :", ouvert.refusals.join("\n")); process.exit(1); }
world = { ...world, treasuries: ouvert.treasuries };

/* ── Une campagne, et un rassemblement tenu ───────────────────────────────── */

const campagne = applyDriveOps(world.drives, [
  { op: "create", name: "Denier pour les périphéries", owner: HOLY_SEE, target: 180, currency: "EUR", note: "Annoncé à la première édition." },
  { op: "pledge", drive: "Denier pour les périphéries", amount: 96, source: "Conférences épiscopales d'Europe" },
  { op: "collect", drive: "Denier pour les périphéries", amount: 61, source: "Premier versement" },
], { date: jour(2), player: HOLY_SEE });
if (campagne.refusals?.length) console.warn("campagne :", campagne.refusals.join(" | "));
world = { ...world, drives: campagne.drives };

const rassemblement = applyGatheringOps(world.gatherings, [
  { op: "plan", name: "Journées de la jeunesse, Kinshasa", host: HOLY_SEE, place: "Kinshasa", continent: "africa", date: jour(3), scale: "continental", cost: 34_000, expected: 1_400_000 },
], { date: jour(2), church: world.church, economies: world.economies, treasuries: world.treasuries });
if (rassemblement.refusals?.length) console.warn("rassemblement :", rassemblement.refusals.join(" | "));
world = { ...world, gatherings: rassemblement.gatherings };

/* ── Le temps passe sur les caisses : c'est ce pas qui écrit le registre ──── */
/* Quatre trimestres, un par tour, plutôt qu'un seul pas d'un an : le registre
 * est un journal de mouvements, et une page qui n'en porterait qu'un ne dirait
 * rien de la façon dont il se lit. */

for (const trimestre of [1, 2, 3, 4]) {
  const pas = stepTreasuries(world.treasuries, {
    organizations: world.organizations,
    economies: world.economies,
    years: 0.25,
    date: jour(trimestre),
  });
  world = {
    ...world,
    treasuries: pas.treasuries,
    economies: { ...world.economies, ...pas.economies },
    record: appendRecord(world.record, pas.rows),
  };
}

/* ── Des ordres au dossier, jugés par le moteur et non par moi ────────────── */

/* Les verdicts ne sont pas choisis : ces ordres sont écrits, le moteur les juge,
 * et la partie porte ce qu'il a répondu. Depuis un pontificat qui a encore sa
 * trésorerie, il rend « exécuté en entier » et « accordé en partie » ; il ne
 * rend PAS « refusé », dont le seuil (sévérité 0,9) demande qu'il ne reste plus
 * rien à payer. La session de design ne verra donc pas la pastille rouge sur
 * cette partie-ci, et c'est une vérité du jeu, pas un trou de la capture. */
const ORDRES = [
  { id: "ordre-1", title: "Ouvrir les comptes de l'APSA à un réviseur extérieur",
    text: "Confier à un réviseur extérieur l'audit complet des comptes de l'APSA, y compris les participations, et en publier les conclusions." },
  { id: "ordre-2", title: "Financer un hôpital dans chaque diocèse d'Afrique",
    text: "Financer dès cette année la construction d'un hôpital dans chacun des six cents diocèses d'Afrique, sur le budget du Saint-Siège." },
  { id: "ordre-3", title: "Ouvrir le diaconat aux femmes",
    text: "Promulguer un motu proprio ouvrant le diaconat aux femmes dans toute l'Église latine." },
];
const actions = ORDRES.map((o, i) => {
  const verdict = assessAction(o, { playerPolity: HOLY_SEE, economy: world.economies?.[HOLY_SEE], world, jumpDays: 90 });
  return {
    ...o, kind: "action", status: "planned", date: jour(4),
    assessment: verdict,
    // La ligne que l'édition affiche sous l'ordre.
    displayText: o.text,
    order: i,
  };
});

/* ── Une lettre reçue, et une réponse : le Courrier a enfin un fil ────────── */

const chats = [{
  id: "chat-chemin-synodal",
  countries: ["Chemin synodal allemand"],
  title: "Sur l'extension du modèle synodal",
  createdAt: jour(3),
  messages: [
    { role: "assistant", speaker: "Chemin synodal allemand", date: jour(3),
      content: "Très Saint-Père, l'assemblée de Francfort a pris acte de votre programme. Nous y lisons une ouverture que nous attendions depuis trois pontificats. Mais nous la lisons aussi comme un silence sur les conseils contraignants et sur le diaconat féminin, et un silence, à Rome, a toujours valu réponse. Nous vous demandons de dire si l'extension du modèle allemand à l'Église universelle est à l'ordre du jour du prochain Synode, ou si elle ne l'est pas. Nous avancerons dans un cas comme dans l'autre ; nous préférons avancer avec vous." },
    { role: "user", speaker: HOLY_SEE, date: jour(4),
      content: "Le Synode traitera de la gouvernance partagée. Il en traitera à partir des travaux déjà déposés, les vôtres compris, et sans décision arrêtée d'avance. Je vous demande une chose en retour : que rien ne soit promulgué à Francfort avant que le Synode ait parlé." },
    { role: "assistant", speaker: "Chemin synodal allemand", date: jour(4),
      content: "Nous l'entendons, et nous tiendrons. Mais le Synode a une date, et nos assemblées en ont une aussi. Si la vôtre glisse, la nôtre ne glissera pas." },
  ],
}];

/* ── Ce que l'édition a imprimé ───────────────────────────────────────────── */

const events = [
  { id: "ev-1", date: jour(4), title: "L'appareil financier obtient que l'audit s'arrête au seuil des participations",
    description: "Le réviseur extérieur nommé par Léon XV a reçu mandat sur les comptes de l'APSA. Le périmètre exclut les participations détenues par la Secrétairerie d'État — celles-là mêmes où le scandale de Sloane Avenue avait pris. Le cardinal Ferrero parle d'un « calendrier », pas d'un refus.",
    location: "Rome" },
  { id: "ev-2", date: jour(3), title: "Le Denier pour les périphéries dépasse la moitié de sa cible",
    description: "Quatre-vingt-seize millions d'euros promis, soixante et un encaissés. Les conférences européennes portent l'essentiel ; l'Amérique du Nord n'a rien annoncé.",
    location: "Rome" },
  { id: "ev-3", date: jour(2), title: "Kinshasa accueillera les Journées de la jeunesse",
    description: "Le choix d'une capitale africaine pour la première grande convocation du pontificat a été lu, à la Curie, comme la traduction du mot « périphéries ».",
    location: "Kinshasa" },
];

/* ── Écrit ────────────────────────────────────────────────────────────────── */

const game = {
  ...seed.data.game,
  country: HOLY_SEE,
  startDate: CHURCH_START_DATE,
  gameDate: jour(4),
  round: 4,
};

const partie = { game, world, actions, chat: chats, events, advisor: [] };
const sortie = path.resolve("design/fixtures/partie-jouee.json");
fs.mkdirSync(path.dirname(sortie), { recursive: true });
fs.writeFileSync(sortie, JSON.stringify(partie, null, 2) + "\n");

const ko = Math.round(fs.statSync(sortie).size / 1024);
console.log(`design/fixtures/partie-jouee.json — ${ko} Ko`);
console.log(`  tour ${game.round}, ${game.gameDate}`);
console.log(`  ${world.treasuries.length} caisses · ${world.drives?.length ?? 0} campagne · ${world.gatherings?.length ?? 0} rassemblement`);
console.log(`  ${(world.record?.length ?? 0)} lignes au registre · ${actions.length} ordres jugés · ${events.length} événements · ${chats[0].messages.length} lettres`);
for (const a of actions) console.log(`  ordre « ${a.title.slice(0, 46)}… » → ${a.assessment?.verdict ?? "?"}`);
const rendus = new Set(actions.map((a) => a.assessment?.verdict));
if (!rendus.has("constrained")) console.warn("  ATTENTION : aucun ordre « accordé en partie » — la capture ne montrera qu'un seul état de verdict.");
if (!rendus.has("blocked")) console.log("  (« refusé » n'est pas atteignable tant que la trésorerie tient : c'est le jeu, pas la capture.)");
