/*! Open Historia — the reforming pope: the real Church as a playable world © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// A game mode, not a new engine. The Holy See holds its REAL territory — the
// Vatican City enclave inside Rome, traced from OpenStreetMap (0.49 km²,
// runtime/vaticanBoundary.js) and added to the map as this game's own
// region (runtime/extraRegions.js); the Church's real
// counter-powers are landless faction-polities with their own tags, voices
// and — from turn one — standing intents (runtime/intents.js); its real
// governing bodies are organizations with real voting rules
// (runtime/organizations.js); its real finances are the player's economy,
// calibrated so the engine's identities produce the real figures.
//
// Every name, number and conflict below is sourced (research pass of
// 2026-09-06: Praedicate Evangelium; the Holy See's 2024 accounts; Peter's
// Pence 2025; APSA 2024; IOR 2024; the Becciu/Sloane Avenue judgment; the
// College of Cardinals as of 2 Sept 2026; the dubia of Oct 2023; Ad charisma
// tuendum; the 2022 Order of Malta constitution; Annuario Pontificio 2025;
// national church-finance reports for DE/IT/US/FR/ES/PL). Nothing is invented,
// and where the real world publishes nothing (diocesan finances in the Global
// South) the rules say so instead of making a number up.
//
// Playability, deliberately: ALL the real structure lives in the reference
// text the model reads, but only SIX counter-powers are live actors. Games in
// this genre (Suzerain, Pope Simulator) are legible at four to six factions
// and unplayable at twenty; the rest is the machinery the player reforms,
// not opponents to negotiate with every turn.

import { normalizeEconomy } from "./economy.js";
import { EUR_USD_2024 } from "./money.js";
import { anchorUnitValue } from "./economyBridge.js";
import { normalizeIntents } from "./intents.js";
import { normalizeOrganizations } from "./organizations.js";
import { FAITHFUL_2023, normalizeChurch, totalFaithful } from "./churchFaithful.js";
import { normalizeExtraRegions } from "./extraRegions.js";
import { seatAssembly } from "./factions.js";
import { normalizeChurchBody } from "./fronts.js";
import { VATICAN_CITY_CENTER, VATICAN_CITY_GEOMETRY } from "./vaticanBoundary.js";

// The one region the Holy See owns on the map: a drawn ("reg_*") id so the
// renderer paints it over Italy's Lazio tile, named for the model and the
// region list, and owned like any other region through the overrides.
export const VATICAN_REGION_ID = "reg_vatican_city";
export const vaticanRegionFeature = () => ({
  type: "Feature",
  geometry: VATICAN_CITY_GEOMETRY,
  properties: { id: VATICAN_REGION_ID, name: "Cité du Vatican", owner: HOLY_SEE, gid0: "VAT", note: "Enclave de 0,49 km² dans Rome — tracé réel (OpenStreetMap, relation 36989)." },
});

export const HOLY_SEE = "Saint-Siège";
export const CHURCH_FACTION_TAG = "church-faction";
// The mode is the Church as it is — its accounts, College and constitution
// are today's — so a game in it starts today, whatever the scenario's stock date.
export const CHURCH_START_DATE = "2026-09-01";

// ---- the six live counter-powers ---------------------------------------------------------

export const CHURCH_FACTIONS = [
  {
    name: "Bloc des cardinaux des dubia",
    leader: "le cardinal Raymond Leo Burke, avec les cardinaux Brandmüller, Sarah, Zen et Sandoval Íñiguez",
    color: "#7f1d1d",
    tags: [CHURCH_FACTION_TAG, "conservative", "traditionalist", "doctrinal"],
    note: "Les cinq cardinaux qui ont soumis des dubia au pape en octobre 2023 — Walter Brandmüller, Raymond Burke, Joseph Zen, Juan Sandoval Íñiguez, Robert Sarah — et ceux qui les suivent dans le Collège. Ils contestent la synodalité, la bénédiction des couples irréguliers et toute réforme doctrinale ; leurs réponses publiques ont déclaré que celles du pape « n'ont pas résolu les doutes mais les ont approfondis ».",
    history: ["2023-10: Cinq cardinaux (Brandmüller, Burke, Zen, Sandoval Íñiguez, Sarah) publient des dubia contre le pape à la veille du Synode."],
  },
  {
    name: "Chemin synodal allemand",
    leader: "Mgr Georg Bätzing (président de la Conférence épiscopale allemande) et le cardinal Reinhard Marx",
    color: "#1d4ed8",
    tags: [CHURCH_FACTION_TAG, "progressive", "synodal", "reformist"],
    note: "Le Synodaler Weg, porté par le cardinal Reinhard Marx et la Conférence épiscopale allemande — l'Église la plus riche du monde (Kirchensteuer : 6,751 milliards d'euros en 2025). Il pousse vers des structures de gouvernance contraignantes, le diaconat féminin et l'extension du modèle synodal à l'Église universelle ; le Vatican a déclaré qu'il n'a « aucun pouvoir d'obliger les évêques et les fidèles ». La pression progressiste, l'autre mâchoire de l'étau.",
    history: ["2025: La Kirchensteuer allemande atteint 6,751 milliards d'euros malgré la baisse des effectifs."],
  },
  {
    name: "Vieille garde de la Secrétairerie d'État",
    leader: "le cardinal Pietro Parolin, secrétaire d'État",
    color: "#4b5563",
    tags: [CHURCH_FACTION_TAG, "bureaucratic", "curial", "conservative"],
    note: "L'appareil de la Secrétairerie d'État tel qu'il régnait avant Praedicate Evangelium (2022), qui l'a ramenée au rang de simple secrétariat papal à égalité avec les dicastères, et avant le transfert de tous ses fonds et investissements à l'APSA au 1er janvier 2021. L'héritage du réseau Becciu : l'investissement de 350 millions d'euros dans l'immeuble de Sloane Avenue à Londres, 140 millions de perte, le cardinal condamné à cinq ans et demi. L'inertie, les carrières, les réseaux italiens.",
    history: ["2021-01-01: Les fonds et investissements de la Secrétairerie d'État sont transférés à l'APSA.", "2022-06-05: Praedicate Evangelium entre en vigueur et rétrograde la Secrétairerie d'État."],
  },
  {
    name: "Appareil financier du Vatican",
    leader: "Mgr Giordano Piccinotti (président de l'APSA), Maximino Caballero Ledo (préfet de la Secrétairerie pour l'Économie), Jean-Baptiste de Franssu (président de l'IOR)",
    color: "#b45309",
    tags: [CHURCH_FACTION_TAG, "financial", "technocratic", "opaque"],
    note: "L'IOR (5,4 milliards d'euros d'actifs, 32,8 millions de profit en 2024 ; des centaines de comptes fermés depuis 2014), l'APSA (trésorerie et fonds souverain : 62,2 millions de profit exceptionnel, 46,1 millions versés pour couvrir le déficit de la Curie en 2024), l'ASIF (superviseur), le Conseil et la Secrétairerie pour l'Économie, le Réviseur général. Et le fonds de pension : environ 664 millions de dollars de déficit pour le seul Saint-Siège (2022), 1,04 milliard avec la Cité et le Vicariat de Rome — une réforme « urgente et inévitable » confiée au cardinal Farrell en novembre 2024. Là où le scandale guette.",
    history: ["2024-11-19: Le pape déclare le fonds de pension en « grave déséquilibre prospectif » et en confie la réforme au cardinal Farrell."],
  },
  {
    name: "Opus Dei",
    leader: "Mgr Fernando Ocáriz, prélat",
    color: "#111827",
    tags: [CHURCH_FACTION_TAG, "conservative", "network", "autonomous"],
    note: "Prélature personnelle de 85 000 membres (2025). Rétrogradée par le motu proprio Ad charisma tuendum (22 juillet 2022) : son prélat n'est plus évêque mais protonotaire apostolique surnuméraire, et elle relève désormais du Dicastère pour le Clergé. Un réseau discret, riche, présent dans les universités, les finances et les gouvernements des pays catholiques, qui protège son autonomie.",
    history: ["2022-07-22: Ad charisma tuendum retire à l'Opus Dei son prélat-évêque."],
  },
  {
    name: "Compagnie de Jésus",
    leader: "le P. Arturo Sosa, préposé général",
    color: "#065f46",
    tags: [CHURCH_FACTION_TAG, "reformist", "intellectual", "missionary"],
    note: "Les Jésuites : 13 768 membres (2025), l'ordre du pape François, le vivier intellectuel de la réforme — mais avec son propre agenda (Amérique latine, dialogue, justice sociale) et sa propre lecture de ce que « réformer » veut dire. Un allié naturel qui n'est pas un exécutant. Avec les Salésiens (14 614), les Franciscains (15 130), les Capucins (11 092) et les Dominicains (5 369), les ordres pèsent près de la moitié des cardinaux créés récemment.",
    history: ["2025: La Compagnie de Jésus compte 13 768 membres."],
  },
];

// Countries the Church counts as its own — its members in the organization
// sense. Names verbatim as the map knows them; a scenario that lacks one just
// does without it (applyChurchPreset filters to what exists).
export const CATHOLIC_MAJORITY_COUNTRIES = [
  "Brazil", "Mexico", "Philippines", "Italy", "Poland", "Spain", "France",
  "Democratic Republic of the Congo", "Colombia", "Argentina", "Portugal", "Ireland",
  "Peru", "Austria", "Croatia", "Belgium", "Chile", "Venezuela", "Ecuador",
  "Lithuania", "Slovakia", "Slovenia", "Hungary", "Uganda", "Angola", "Paraguay",
  "Bolivia", "Guatemala", "Honduras", "El Salvador", "Nicaragua", "Costa Rica",
  "Panama", "Dominican Republic", "Cuba", "Malta", "Luxembourg", "Timor-Leste",
  "Burundi", "Rwanda", "Equatorial Guinea", "Cabo Verde", "Sao Tome and Principe",
];

// ---- the real governing bodies -----------------------------------------------------------

const F = Object.fromEntries(CHURCH_FACTIONS.map((f) => [f.name.split(" ")[0].toLowerCase(), f.name]));
const DUBIA = CHURCH_FACTIONS[0].name;
const SYNODAL = CHURCH_FACTIONS[1].name;
const OLD_GUARD = CHURCH_FACTIONS[2].name;
const FINANCE = CHURCH_FACTIONS[3].name;
const OPUS = CHURCH_FACTIONS[4].name;
const JESUITS = CHURCH_FACTIONS[5].name;
void F;

export const churchBodies = (availableCountries = []) => {
  const known = new Set(availableCountries.map((n) => String(n ?? "").trim()));
  const catholicMembers = CATHOLIC_MAJORITY_COUNTRIES.filter((n) => known.size === 0 || known.has(n));
  return [
    {
      name: "Catholic Church", kind: "religious", founded: "0033-01-01", seat: "Rome",
      leader: HOLY_SEE, votingRule: "hegemon", universal: false,
      charter: "1,406 milliard de catholiques, 5 430 évêques, 406 996 prêtres (38 % en Europe, 29 % en Amérique, 18 % en Asie, 13,5 % en Afrique), 589 423 religieux, 106 495 séminaristes (Annuario 2025). Le pape gouverne seul en droit ; les pays membres sont ceux à majorité catholique. Les plus peuplés : Brésil 140 M, Mexique 101 M, Philippines 85 M.",
      members: [HOLY_SEE, ...catholicMembers],
    },
    {
      name: "Collège des cardinaux", kind: "political", founded: "1059-01-01", seat: "Rome",
      // A reigning pope is not outvoted by the College either: its power is real
      // but indirect — it elects the NEXT pope, and its consent is what makes a
      // reform hold. That resistance belongs in legitimacy and in the schemes
      // already running, which the engine already prices; a lost ballot here was
      // a lever that does not exist.
      leader: HOLY_SEE, votingRule: "hegemon", universal: false,
      charter: "240 cardinaux vivants, 116 électeurs au 2 septembre 2026 (les plus de 80 ans ne votent plus). Trois ordres : évêques, prêtres, diacres. Le pape décide seul en droit ; le Collège n'oppose pas un vote à un pape régnant. Son pouvoir est ailleurs : il élit le suivant, et son consentement décide si une réforme tient après vous. Le consistoire — créer des cardinaux — est le seul levier qui en déplace durablement l'équilibre ; un conclave élit à la majorité des deux tiers.",
      members: [HOLY_SEE, DUBIA, SYNODAL, OLD_GUARD, OPUS, JESUITS],
    },
    {
      name: "Synode des évêques", kind: "political", founded: "1965-09-15", seat: "Rome",
      // Consultative in law: the assembly votes its propositions and hands them
      // to the pope, who decides whether anything becomes an act. Modelling it
      // as a majority the pope loses 2-1 made a consultative body outrank the
      // office it advises. What resists a papal decision is the Curia's reach
      // and the schemes already in motion, not a vote count.
      leader: HOLY_SEE, votingRule: "hegemon", universal: false,
      charter: "Institution permanente convoquée par le pape ; ses membres sont élus par les conférences épiscopales. Le Synode sur la synodalité (2021-2024) a laissé dix groupes d'étude sur les dossiers brûlants — diaconat féminin, rites orientaux, choix des évêques — dont les rapports ont été reportés ; la phase suivante mène à une assemblée en 2028. Son document final (355 votants) réclame conseils pastoraux obligatoires et participation des laïcs.",
      members: [HOLY_SEE, SYNODAL, DUBIA, JESUITS],
    },
    {
      name: "Curie romaine", kind: "political", founded: "2022-06-05", seat: "Vatican",
      leader: HOLY_SEE, votingRule: "hegemon", universal: false,
      charter: "Selon Praedicate Evangelium (2022) : la Secrétairerie d'État (réduite au rang de secrétariat papal), seize dicastères — Évangélisation ; Doctrine de la Foi ; Service de la Charité ; Églises orientales ; Culte divin ; Causes des saints ; Évêques ; Clergé ; Vie consacrée ; Laïcs, Famille et Vie ; Unité des chrétiens ; Dialogue interreligieux ; Culture et Éducation ; Développement humain intégral ; Textes législatifs ; Communication — trois tribunaux dont la Pénitencerie, et les organes économiques. Environ 4 000 employés. Des laïcs peuvent désormais diriger un dicastère. Le pape commande ; l'appareil obéit à sa vitesse.",
      members: [HOLY_SEE, OLD_GUARD, FINANCE],
    },
    {
      name: "Conseil pour l'Économie", kind: "monetary", founded: "2014-02-24", seat: "Vatican",
      // Its fifteen members are papal appointees and it acts, like every organ of
      // the Curia, in the pope's name and by his authority (Praedicate
      // Evangelium art. 1). It supervises and it can stall — that is the finance
      // apparatus's scheme doing its work — but it does not outvote him.
      leader: HOLY_SEE, votingRule: "hegemon", universal: false,
      charter: "Créé par François en 2014 avec la Secrétairerie pour l'Économie (cardinal Pell) et le Réviseur général pour soumettre APSA, IOR et Secrétairerie d'État à un contrôle unique. Les comptes 2024 : revenus 1,23 milliard d'euros (43 % dons, 40 % immobilier et commerce), déficit structurel ramené de 83,5 à 44,5 millions, Denier de Saint-Pierre 57,6 millions de recettes contre 59,8 de dépenses (63 % apportés par les diocèses). Le déficit de pension reste hors bilan.",
      members: [HOLY_SEE, FINANCE, OLD_GUARD],
    },
    {
      name: "IOR — Institut pour les Œuvres de Religion", kind: "monetary", founded: "1942-06-27", seat: "Vatican",
      leader: FINANCE, votingRule: "weighted", universal: false,
      charter: "La « banque vaticane » : 5,4 milliards d'euros d'actifs, 32,8 millions de profit (2024), devenue bras opérationnel de l'APSA. Réformée depuis 2014 (président Jean-Baptiste de Franssu) : des centaines de comptes fermés, évaluations Moneyval, poursuites contre d'anciens dirigeants. Sa transparence est un chantier, pas un acquis.",
      members: [FINANCE, HOLY_SEE],
    },
  ];
};

// ---- what the counter-powers are already doing on turn one ------------------------------

export const seededIntents = (date = "") => [
  // Each counter-power fights what touches ITS interest (scope) and is
  // indifferent — or an ally — elsewhere. The reality check and the votes
  // read stance and scope; without them every faction would oppose every
  // order, which is neither the Church nor a game.
  { ownerType: "polity", owner: DUBIA, target: HOLY_SEE, kind: "political", secret: true, stage: 20, stance: "hostile",
    // La doctrine telle qu'un pape en parle, et non telle qu'un canoniste
    // l'indexe : l'Évangile, la morale, les sacrements et la messe sont le
    // terrain de ce chantier autant que le mot « doctrine » lui-même.
    scope: ["doctrin", "liturg", "synod", "dubia", "bénédiction", "blessing", "mariage", "marriage", "communion", "divorc", "femme", "women", "diacon", "célibat", "celibacy", "latin", "rite", "tradition",
      "évangile", "evangile", "gospel", "moral", "moraux", "sacrement", "sacrament", "messe", "eucharist", "dogme", "dogma", "avortement", "abortion", "homosex", "lgbt", "gender", "pénitence", "confession"],
    summary: "Préparer une déclaration publique de cardinaux contestant la légitimité doctrinale des réformes, et rallier assez d'électeurs pour bloquer toute décision doctrinale ou liturgique du Collège.",
    triggerHint: "une réforme doctrinale ou liturgique annoncée ; un consistoire qui ne les favorise pas" },
  { ownerType: "polity", owner: SYNODAL, target: HOLY_SEE, kind: "political", secret: false, stage: 30, stance: "neutral",
    scope: ["synod", "allemagne", "germany", "german", "diacon", "laïc", "lay", "conseil", "council", "contraign", "binding"],
    summary: "Obtenir que le modèle synodal allemand — conseils contraignants, diaconat féminin — soit étendu à l'Église universelle, ou avancer sans Rome.",
    triggerHint: "l'assemblée synodale de 2028 ; le sort des groupes d'étude ; un refus romain" },
  { ownerType: "polity", owner: OLD_GUARD, target: HOLY_SEE, kind: "espionage", secret: true, stage: 15, stance: "hostile",
    scope: ["curie", "curia", "secrétairerie", "secretariat", "dicast", "nomination", "appoint", "nommer", "restructur", "fusion", "merge", "préfet", "prefect", "laïc", "lay ", "procédure", "procedure"],
    summary: "Ralentir la réforme de la Curie par les nominations et les procédures, et faire fuiter à la presse italienne tout document qui affaiblit le pape.",
    triggerHint: "une restructuration de dicastère ; un audit ; une nomination de laïc à un poste clé" },
  { ownerType: "polity", owner: FINANCE, target: HOLY_SEE, kind: "economic", secret: true, stage: 25, stance: "hostile",
    // L'argent de l'Église, et pas seulement sa comptabilité. Un pape qui
    // déclare que l'Église est « pour les riches », ou qu'il veut vendre le
    // patrimoine pour les pauvres, vise exactement ce que ce chantier protège :
    // sans ces mots-là, le gardien du coffre ne se sentait visé que par le
    // vocabulaire d'un audit.
    scope: ["audit", "apsa", "ior", "pension", "compte", "account", "financ", "budget", "patrimoine", "immobilier", "real estate", "réviseur", "auditor", "asif", "transparen", "déficit", "deficit", "investisse", "invest",
      "rich", "pauvr", "poor", "argent", "money", "wealth", "fortune", "trésor", "treasur", "caisse", "bourse", "aumône", "obole", "donation", "salaire", "dépens", "vend", "vente", "sell"],
    summary: "Garder hors du périmètre de l'audit les comptes et participations les plus exposés, et présenter le déficit de pension comme soutenable.",
    triggerHint: "un audit externe ; la publication des comptes du fonds de pension ; une enquête de l'ASIF" },
  { ownerType: "polity", owner: OPUS, target: HOLY_SEE, kind: "diplomatic", secret: true, stage: 10, stance: "hostile",
    scope: ["prélature", "prelature", "opus", "ad charisma", "statut", "statute", "clergé", "clergy", "mouvement", "movement", "association"],
    summary: "Recouvrer l'autonomie perdue avec Ad charisma tuendum en obtenant, par ses réseaux dans les gouvernements catholiques, une protection contre toute nouvelle réforme des prélatures.",
    triggerHint: "une révision du statut des prélatures ; un changement au Dicastère pour le Clergé" },
  { ownerType: "polity", owner: JESUITS, target: HOLY_SEE, kind: "political", secret: false, stage: 35, stance: "supportive", scope: [],
    summary: "Porter le programme de réforme — Curie, finances, synodalité — en fournissant au pape ses cadres, ses textes et ses relais dans les conférences épiscopales.",
    triggerHint: "chaque réforme annoncée ; les nominations aux dicastères" },
  // The other side of the ledger, and the one that was missing: four counter-
  // powers were modelled and nothing modelled the Church that actually carries
  // a pontificate out. 5 430 bishops, 407 000 priests, 589 000 religious and
  // 1,4 milliard de fidèles are not a backdrop — they are the apparatus a pope
  // commands, and their default is execution, not resistance. Without these the
  // world could only ever narrate obstruction.
  { ownerType: "organization", owner: "Catholic Church", target: HOLY_SEE, kind: "political", secret: false, stage: 50, stance: "supportive", scope: [],
    summary: "Appliquer ce que Rome décide : les 5 430 évêques, les nonciatures et les conférences épiscopales traduisent chaque décision pontificale en actes dans les diocèses, à la vitesse de l'appareil et non contre lui.",
    triggerHint: "chaque décision pontificale promulguée ; chaque visite et chaque nomination" },
  { ownerType: "organization", owner: "Curie romaine", target: HOLY_SEE, kind: "political", secret: false, stage: 40, stance: "supportive", scope: [],
    summary: "Exécuter les ordres du pape : les seize dicastères et leurs 4 000 employés instruisent, rédigent et promulguent ce que le pape décide, l'inertie ralentissant sans jamais annuler l'autorité.",
    triggerHint: "chaque ordre donné à la Curie ; chaque dicastère saisi d'un dossier" },
].map((it) => ({ ...it, createdAt: date, updatedAt: date }));

// ---- the real money ------------------------------------------------------------------------
//
// Calibrated with the engine's own identities (see economy.js): a ~5,000-person
// institution (4,000 employees, ~880 residents) funded by donations and
// patrimony, not labour — so the honest dollar anchor per head is enormous
// (~615,000 $), and revenue, spending and deficit come out at the real 2024
// figures: 1,230 M EUR revenue, 1,275 M spending, -45 M balance, 6.1% on a
// debt equal to the pension liability. Reserves are NOT the IOR's 5.4 B —
// those are clients' assets, not the Holy See's own.
// The Holy See's CORE accounts (Secretariat for the Economy, 2024 consolidated
// statement, published 26 Nov 2025) — hospitals excluded, because they balance
// themselves (+€18.7 M) and are no lever of the pope's. Every figure is the
// published one; the model's only choices are the perimeter and the anchor.
//   revenue €546.5 M: donations €237 M (43%, +12%), self-generated €217 M
//   (40%; real estate about half), financial income €71.1 M (of which ~€46 M
//   the one-off asset sales/APSA contribution that turned a −€44.4 M
//   operating deficit into the +€1.6 M net), related entities (Governorate)
//   ~€21 M. Expenses €527.8 M (personnel 33%, general 36%, grants €127.9 M).
//   APSA net patrimony €2,597 M (4,234 properties in Italy, ~1,200 abroad).
//   Pension: ~$664 M unfunded for the Holy See alone (Farrell, 2022 basis).
// Le taux vit dans runtime/money.js, avec le format de la monnaie du lecteur :
// il servait ici à entrer dans l'unité du moteur et là-bas à en ressortir, et
// deux copies d'un même taux finissent par diverger. Réexporté pour que rien
// n'ait à changer d'import.
export { EUR_USD_2024 } from "./money.js";
export const ITALY_GDP_PER_HEAD_USD_2024 = 39_000; // the anchor: the Vatican's economy IS Rome's
export const HOLY_SEE_ACCOUNTS_2024 = Object.freeze({
  donationsEur: 237e6, governorateEur: 21e6, commercialEur: 109e6,
  realEstateEur: 108e6, recurringFinancialEur: 25e6, extraordinaryEur: 46e6,
  expensesEur: 527.8e6, patrimonyEur: 2_597e6, unfundedPensionUsd: 664e6,
});
export const holySeeRecurringRevenueEur = () => {
  const A = HOLY_SEE_ACCOUNTS_2024;
  return A.donationsEur + A.governorateEur + A.commercialEur + A.realEstateEur + A.recurringFinancialEur;
};

/**
 * Ce qu'un baptisé donne au Saint-Siège en une année.
 *
 * 237 millions d'euros de dons pour 1,406 milliard de fidèles : seize centimes
 * par tête et par an. Le chiffre surprend, et c'est le vrai — le Denier de
 * Saint-Pierre ne lève que 57,6 millions à lui seul, le reste vient des
 * diocèses et des fondations, et tout cela repose sur le même corps de
 * croyants.
 */
export const DONS_PAR_FIDELE_EUR = HOLY_SEE_ACCOUNTS_2024.donationsEur / totalFaithful(FAITHFUL_2023);

/**
 * Les transferts que perçoit le Saint-Siège, pour un état donné de l'Église.
 *
 * La faute que cela répare : `transfers` était posé une fois au préréglage et
 * ne bougeait plus. Les fidèles, eux, bougent à chaque tour — la démographie
 * réelle, et la légitimité du pontificat (churchFaithful.js). Une Église
 * pouvait donc se vider de cent millions de baptisés sans qu'un euro manque
 * aux comptes, ce qui est exactement l'inverse de ce que le jeu promet : « en
 * fonction de ce que l'on dit ou fait, cela doit avoir une influence ».
 *
 * Les dons suivent les fidèles. Le Gouvernorat (musées, timbres, monnaie) et
 * les revenus propres (immobilier de rapport, éditions, services) ne les
 * suivent pas : ils viennent de visiteurs et de locataires, pas de baptisés.
 * Un pape qui vide l'Église perd donc ses dons, et garde ses loyers — ce qui
 * est plus juste, et plus dur, qu'une chute proportionnelle de tout.
 */
export const transfersForChurchEur = (church) => {
  const A = HOLY_SEE_ACCOUNTS_2024;
  const fideles = totalFaithful(normalizeChurch(church)?.faithful);
  return DONS_PAR_FIDELE_EUR * fideles + A.governorateEur + A.commercialEur;
};

// No tax (the State taxes neither residents nor employees), ~500 residents
// inside the walls (458 citizens + non-citizens; the ~4,000 employees live in
// Italy and are a COST), a patrimony that yields, donations and sales that
// arrive without taxing anyone, an unfunded pension that is a promise and not
// a bond, and deficits paid — as in fact — by drawing on the patrimony.
export const holySeeEconomy = () => {
  const base = normalizeEconomy({
    population: 500, effectiveLand: 5, capital: 20_000,
    technology: 90, administrativeReach: 100, monetization: 100, marketIntegration: 100,
    financialDepth: 92, fiscalCredibility: 55, legitimacy: 70, openness: 60,
    taxRate: 0, investmentShare: 0, financing: "drawdown",
    monetarySystem: { backing: "none", issuer: "banks", rule: "peg", anchorInflation: 0.02, convertibility: 1, label: "Euro (Saint-Siège)" },
    seed: "ai",
  });
  const anchored = anchorUnitValue(base, ITALY_GDP_PER_HEAD_USD_2024);
  const sy = (eur) => (eur * EUR_USD_2024) / anchored.usdPerSY;
  const A = HOLY_SEE_ACCOUNTS_2024;
  const revenueEur = holySeeRecurringRevenueEur();
  return normalizeEconomy({
    ...anchored,
    endowment: sy(A.patrimonyEur),
    endowmentYield: (A.realEstateEur + A.recurringFinancialEur) / A.patrimonyEur,
    transfers: sy(transfersForChurchEur({ faithful: FAITHFUL_2023 })),
    // The engine charges its own administration at 10% of revenue at full reach.
    civilSpending: sy(A.expensesEur - 0.10 * revenueEur),
    unfundedLiabilities: (A.unfundedPensionUsd) / anchored.usdPerSY,
    treasury: sy(A.extraordinaryEur), // the 2024 one-off, in hand
    debt: 0, reserves: 0,
  });
};

// ---- the reference the model reads: everything real, once -----------------------------------

export const CHURCH_REFERENCE = `[Mode de jeu — Pape réformateur]
Le joueur est le pape, chef du Saint-Siège : un État dont le seul territoire est la Cité du Vatican (0,49 km² dans Rome, tracée sur la carte sous le nom « Cité du Vatican ») et dont la puissance est l'Église catholique — 1,406 milliard de fidèles, 5 430 évêques, 406 996 prêtres, 589 423 religieux, 106 495 séminaristes (Annuario Pontificio 2025). Le jeu est la réforme de l'Église DE L'INTÉRIEUR : la Curie, les finances, la synodalité, les nominations — contre de vrais contre-pouvoirs, avec de vrais leviers, dans de vraies administrations. Ce n'est pas la géopolitique du Vatican ; la diplomatie avec les États compte seulement quand elle sert ou menace la réforme.

Les faits ci-dessous sont réels et ne se contredisent pas.

Administration (Praedicate Evangelium, 19 mars 2022, en vigueur le 5 juin 2022) : la Secrétairerie d'État est ramenée au rang de secrétariat papal, à égalité avec les seize dicastères (Évangélisation ; Doctrine de la Foi ; Service de la Charité ; Églises orientales ; Culte divin ; Causes des saints ; Évêques ; Clergé ; Vie consacrée ; Laïcs, Famille et Vie ; Unité des chrétiens ; Dialogue interreligieux ; Culture et Éducation ; Développement humain intégral ; Textes législatifs ; Communication), trois tribunaux dont la Pénitencerie apostolique, et les organes économiques : Conseil pour l'Économie, Secrétairerie pour l'Économie, APSA (trésorerie et fonds souverain), Réviseur général, ASIF (superviseur), IOR (bras opérationnel de l'APSA). Des laïcs peuvent diriger un dicastère. Environ 4 000 employés. Le pape gouverne la Curie seul en droit ; en fait, elle obéit à sa propre vitesse.

Finances centrales (bilan consolidé 2024, publié le 26 novembre 2025) : produits d'exploitation 1,23 milliard d'euros contre 1,275 de charges, soit un déficit d'exploitation de 44,4 millions (83,5 en 2023) ; résultat net +1,6 million SEULEMENT grâce à ~46 millions de produits exceptionnels (ventes d'actifs, contribution APSA) — 2023 s'était soldé par −51,2 millions nets. Hôpitaux exclus (ils s'équilibrent seuls, +18,7 millions), le cœur du Saint-Siège encaisse 546,5 millions : dons 237 (43 %, +12 %), revenus propres 217 (40 %, immobilier pour moitié, éditions et services pour l'autre), produits financiers 71,1, Gouvernorat ~21 ; et dépense 527,8 (personnel 33 %, frais généraux 36 %, subventions 127,9). Hors exceptionnel, le cœur perd donc ~28 millions par an. Le Saint-Siège NE LÈVE AUCUN IMPÔT : ni sur les ~500 résidents, ni sur les ~4 000 employés (qui vivent en Italie et sont une charge) ; il n'émet aucune dette souveraine ; ses déficits sont couverts en PUISANT dans le patrimoine — c'est exactement ainsi que le moteur le traite (taux d'imposition 0, revenus = rendement du patrimoine + transferts, financement « drawdown », passif de pension hors dette). APSA : patrimoine net 2 597 millions (4 234 immeubles en Italie, ~1 200 à l'étranger ; −145 millions de réévaluation en 2024), 62,2 millions de profit, 46,1 versés pour le déficit. Denier de Saint-Pierre 2025 : 57,6 millions de recettes, 59,8 de dépenses, 63 % venant des diocèses ; en 2024 le fonds a dû puiser 16,5 millions dans son capital, en 2025 rien. IOR : 5,4 milliards d'actifs de clients, 32,8 millions de profit. Fonds de pension : ~664 millions de dollars non financés pour le seul Saint-Siège (base 2022), 1,04 milliard avec la Cité du Vatican et le Vicariat de Rome — « grave déséquilibre prospectif », réforme confiée au cardinal Farrell (novembre 2024). Le scandale de référence : 350 millions d'euros investis par la Secrétairerie d'État dans l'immeuble de Sloane Avenue à Londres (160 en 2014, 190 en 2018-2019), 140 millions de perte, le cardinal Becciu condamné à cinq ans et demi, retrial partiel ordonné en 2025.

Finances par pays (réelles) — c'est le vrai « chiffre d'affaires » de l'Église, et il n'appartient PAS au Saint-Siège mais aux Églises nationales : Allemagne, Kirchensteuer (8-9 % de l'impôt sur le revenu) 6,751 milliards d'euros en 2025, de loin la plus riche ; États-Unis, dons volontaires : 5,8 milliards de dollars de quêtes dominicales, ~11 milliards de budget paroissial, hôpitaux catholiques ~98,6 milliards de dépenses, Catholic Charities 4,67 milliards (dont 2,9 de l'État) ; Italie, otto per mille (0,8 %) ~1 milliard d'euros par an ; France, Denier de l'Église 212 millions (2024), 622 millions toutes ressources ; Espagne, case IRPF (0,7 %) 429,3 millions (2024) ; Pologne, Fundusz Kościelny du budget de l'État 257 millions de złotys (2024), 275,7 (2025) ; Autriche, Kirchenbeitrag 1,1 % du revenu. Sud global (Brésil, Mexique, Philippines, RDC, Afrique) : quêtes locales et subsides, comptes NON publiés — ne jamais inventer un chiffre national ; les Œuvres pontificales missionnaires redistribuent ~106 millions de dollars par an à 1 150 diocèses, 30 000 séminaristes à 700 dollars. Un pape ne peut PAS taxer ces Églises : il ne peut que persuader, contraindre canoniquement, ou dépendre de leur Denier.

Contre-pouvoirs réels (les six factions listées comme polités sont les acteurs vivants ; tous les autres — FSSPX, Ordre de Malte, conférences épiscopales — sont des sources de crise ponctuelles) : le Collège des cardinaux (240 vivants, 116 électeurs au 2 septembre 2026 ; le consistoire est le levier qui en change l'équilibre) ; les cinq cardinaux des dubia d'octobre 2023 (Brandmüller, Burke, Zen, Sandoval Íñiguez, Sarah) ; le Chemin synodal allemand (cardinal Marx) auquel le Vatican a dénié tout pouvoir contraignant ; l'Opus Dei (85 000 membres, prélat privé de l'épiscopat par Ad charisma tuendum, 22 juillet 2022) ; la FSSPX (~600 000 fidèles, ~700 prêtres, 2 évêques ; crise 2026 sur des ordinations épiscopales illicites, appel du pape, suspension et dialogue théologique) ; l'Ordre de Malte (~13 500 membres ; François a forcé la démission du Grand Maître Festing en 2017, dissous le Conseil souverain et promulgué une nouvelle constitution le 3 septembre 2022 — le précédent d'un pape qui reprend en main un corps souverain) ; les ordres : Jésuites 13 768, Salésiens 14 614, Franciscains 15 130, Capucins 11 092, Dominicains 5 369.

Les vrais leviers du pape : le consistoire (créer des cardinaux) ; le motu proprio et la constitution apostolique (réformer une structure par décret) ; l'encyclique et l'exhortation (fixer la doctrine et le cap) ; les nominations (évêques, préfets, laïcs à la tête d'un dicastère) ; l'audit et la publication des comptes ; la restructuration ou la fusion d'un dicastère ; la reprise en main d'un corps (précédent Malte) ; le synode (consulter, puis trancher) ; la sanction canonique (démission forcée, retrait d'un titre, excommunication). Les vrais risques : le schisme (une réforme trop rapide, un Collège divisé), le scandale financier (un compte caché, une perte), la fuite à la presse, la démission forcée, l'isolement dans sa propre Curie, la mort ou l'incapacité du pape. Sa légitimité dans le moteur EST son standing dans l'Église : sous 40, le schisme devient possible ; au-dessus de 80, il peut trancher là où un autre devrait négocier.

Règles de simulation de ce mode : les six factions NE S'OPPOSENT PAS À TOUT — chacune combat ce qui touche SON intérêt (les dubia la doctrine et la liturgie ; la Vieille garde la Curie et les nominations ; l'Appareil financier l'audit et les comptes ; l'Opus Dei le statut des prélatures), reste indifférente ailleurs, et peut être ralliée par une réforme qui lui donne ce qu'elle veut ; la Compagnie de Jésus PORTE la réforme ; le Chemin synodal pousse ses propres réformes et ne s'oppose qu'à ce qui le bride. Un pape qui réforme les finances a les dubia pour lui ou indifférents, pas contre lui. Les réformes se prennent par résolution des corps qui votent réellement (Collège des cardinaux, Synode des évêques, Conseil pour l'Économie) ou par décret dans la Curie (hegemon) ; chaque faction vote selon son caractère et ses intentions déclarées ou secrètes ; un vote perdu n'est pas un échec du récit mais une contrainte réelle. Les six factions poursuivent leurs intentions chaque tour sans attendre le pape. Le Saint-Siège n'a ni armée ni territoire à conquérir : jamais d'unités militaires, jamais de transfert de région vers lui ; la Cité du Vatican ne change de mains que par un événement d'une gravité historique (occupation, fin des accords du Latran de 1929). La monnaie est l'euro sous ancrage fixe — le pape n'a aucune politique monétaire et ne peut ni imprimer ni dévaluer.`;

// ---- applying it to a freshly created game ---------------------------------------------------

const str = (v) => String(v ?? "").trim();

// Returns a NEW world with the mode merged in. `availableCountries` are the
// map's country names, so the Church's membership only names what exists;
// pass [] to accept the whole list (tests). Idempotent: applying twice does
// not duplicate factions, bodies or intents.
export const applyChurchPreset = (world, { date = "", availableCountries = [] } = {}) => {
  const w = world && typeof world === "object" ? { ...world } : {};
  const polityOverrides = { ...(w.polityOverrides ?? {}) };
  const countryTags = { ...(w.countryTags ?? {}) };
  const countryStats = { ...(w.countryStats ?? {}) };

  polityOverrides[HOLY_SEE] = {
    ...(polityOverrides[HOLY_SEE] ?? {}),
    name: HOLY_SEE, aliases: ["Vatican", "Holy See", "Vatican City", "Cité du Vatican"], color: "#facc15",
    note: polityOverrides[HOLY_SEE]?.note || "Le pape et le gouvernement central de l'Église catholique. Un État sans territoire dont la puissance est spirituelle, institutionnelle et financière.",
  };
  countryTags[HOLY_SEE] = ["theocratic", "neutral", "non-aligned", "city-state", "reformist"];

  // Real territory: the Vatican City enclave, added as THIS game's own region
  // and owned by the Holy See (the map's renderer, click resolution, labels
  // and the AI's region vocabulary all read it like any drawn region).
  const extraRegions = normalizeExtraRegions([...(normalizeExtraRegions(w.extraRegions).features), vaticanRegionFeature()]);
  const regionOwnershipOverrides = { ...(w.regionOwnershipOverrides ?? {}), [VATICAN_REGION_ID]: HOLY_SEE };
  const markers = Array.isArray(w.markers) && w.markers.some((m) => m?.id === "marker-vatican-city") ? w.markers : [
    ...(Array.isArray(w.markers) ? w.markers : []),
    { id: "marker-vatican-city", name: "Cité du Vatican", kind: "capital", ownerCode: HOLY_SEE, lng: VATICAN_CITY_CENTER[0], lat: VATICAN_CITY_CENTER[1], note: "Siège du pape. 0,49 km², ~880 résidents, ~4 000 employés.", foundedAt: "1929-02-11" },
  ];
  countryStats[HOLY_SEE] = {
    ...(countryStats[HOLY_SEE] ?? {}),
    capital: "Cité du Vatican", continent: "Europe", government: "Monarchie élective absolue (pontificat)",
    history: [...(countryStats[HOLY_SEE]?.history ?? []),
      "2022-06-05: Praedicate Evangelium réforme la Curie romaine : seize dicastères, la Secrétairerie d'État rétrogradée.",
      "2023-12: Le cardinal Becciu est condamné à cinq ans et demi pour l'affaire de Sloane Avenue (140 millions d'euros de perte).",
      "2024-11-19: Le fonds de pension est déclaré en grave déséquilibre prospectif (~664 M$ de déficit).",
    ].slice(-10),
  };

  for (const f of CHURCH_FACTIONS) {
    polityOverrides[f.name] = { ...(polityOverrides[f.name] ?? {}), name: f.name, aliases: [], color: f.color, note: f.note };
    countryTags[f.name] = f.tags;
    countryStats[f.name] = { ...(countryStats[f.name] ?? {}), capital: "Rome", continent: "Europe", government: "Faction interne de l'Église catholique", ...(f.leader ? { leader: f.leader } : {}), history: [...(countryStats[f.name]?.history ?? []), ...f.history].slice(-10) };
  }

  const existingOrgs = normalizeOrganizations(w.organizations).filter((o) => !churchBodies().some((b) => b.name === o.name));
  const organizations = normalizeOrganizations([...churchBodies(availableCountries), ...existingOrgs]);

  const existingIntents = normalizeIntents(w.intents);
  const seeded = normalizeIntents(seededIntents(date)).filter((it) => !existingIntents.some((e) => e.owner === it.owner && e.kind === it.kind && e.status === "active"));
  const intents = [...existingIntents, ...seeded];

  const economies = { ...(w.economies ?? {}), [HOLY_SEE]: w.economies?.[HOLY_SEE] ?? holySeeEconomy() };

  const rules = str(w.simulationRules);
  const simulationRules = rules.includes("[Mode de jeu — Pape réformateur]") ? rules : [rules, CHURCH_REFERENCE].filter(Boolean).join("\n\n");

  const canonFacts = [...new Set([...(Array.isArray(w.canonFacts) ? w.canonFacts : []),
    "2022-03-19: La constitution apostolique Praedicate Evangelium réorganise la Curie romaine en seize dicastères.",
    "2023-10: Cinq cardinaux publient des dubia contre le pape.",
    "2024-11-19: Le fonds de pension du Vatican est déclaré en grave déséquilibre prospectif.",
  ])];

  // The faithful, live: real end-2023 baseline, stepped every jump from real
  // continental growth and the Holy See's standing (see churchFaithful.js).
  const church = normalizeChurch(w.church) ?? normalizeChurch({ faithful: FAITHFUL_2023, asOf: "2023-12-31", log: [] });

  // The college that actually decides: 160 electors, each standing on doctrine,
  // region, role and the current they follow. The regions come from the church's
  // own faithful, so the body is the world in miniature and nobody keeps it in
  // step by hand. Seeded HERE, with the rest of the scenario — the seating
  // function was written, tested, and called from nowhere, so a fresh game
  // reached a College tab that could never show anything at all.
  const assembly = w.assembly ?? seatAssembly({
    name: "Collège des cardinaux et évêques",
    seats: 160,
    marginals: {
      region: church.faithful,
      doctrine: { traditional: 40, centrist: 70, reforming: 50 },
      role: { curia: 40, diplomacy: 20, bishops: 50, orders: 30, temporal: 20 },
      // The currents are the bodies this preset has just created, so the college
      // counts THEIR followers and never becomes a second version of them. The
      // empty key is the unattached: the electors actually in play.
      follows: {
        [HOLY_SEE]: 34,
        "Bloc des cardinaux des dubia": 18,
        "Compagnie de Jésus": 16,
        "Vieille garde de la Secrétairerie d'État": 10,
        "Opus Dei": 8,
        "Chemin synodal allemand": 6,
        "Appareil financier du Vatican": 5,
        "": 43,
      },
    },
    correlations: {
      europe: { doctrine: { traditional: 1.4 }, role: { curia: 2.5, temporal: 2.5, diplomacy: 1.8 } },
      africa: { doctrine: { traditional: 1.3 }, role: { bishops: 1.6, curia: 0.3, temporal: 0.2 } },
      americas: { doctrine: { reforming: 1.2 }, role: { bishops: 1.4, orders: 1.3, curia: 0.4 } },
      asia: { role: { orders: 1.5, bishops: 1.3, curia: 0.3 } },
      oceania: { role: { bishops: 1.4, curia: 0.2 } },
      // Who each current recruits. A German current draws Germans, which is why
      // it holds seven seats and not twenty-four.
      "Bloc des cardinaux des dubia": { traditional: 4, europe: 1.6, curia: 1.5, reforming: 0.05 },
      "Chemin synodal allemand": { reforming: 3, europe: 3, africa: 0.05, asia: 0.05, americas: 0.1 },
      "Compagnie de Jésus": { orders: 3, reforming: 1.6, americas: 1.4, asia: 1.4 },
      "Vieille garde de la Secrétairerie d'État": { curia: 4, europe: 2.5, diplomacy: 2 },
      "Appareil financier du Vatican": { temporal: 6, europe: 3 },
      "Opus Dei": { traditional: 2, europe: 1.5, americas: 1.3 },
      [HOLY_SEE]: { centrist: 1.6 },
    },
    seed: 11,
  });

  // The body of the Church, live: priests and seminarians by continent at their
  // real counts, and the abuse files with the backlog a pontificate inherits
  // (runtime/fronts.js). Seeded HERE for the same reason the college is — a
  // front that only comes into being after the first turn is a front the
  // opening page cannot show, and a player reading "not held" on his first
  // edition concludes the game does not track it at all.
  const churchBody = w.churchBody ?? normalizeChurchBody({ asOf: "2022-12-31" });

  return { ...w, polityOverrides, countryTags, countryStats, organizations, intents, economies, simulationRules, canonFacts, church, assembly, churchBody, extraRegions, regionOwnershipOverrides, markers, customRegions: true };
};
