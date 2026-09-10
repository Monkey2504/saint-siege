/*! Open Historia — le cabinet: twenty candidates, three seats © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// Field report, in the player's words: "si le gars met sa clé il faut que tout
// de suite on lui demande son nouveau nom de pape, qu'il choisisse 3 conseillers
// parmi une vingtaine qui ont des qualités et défauts différents, et qu'il soit
// dans le jeu. Immersion dès le début."
//
// The rule this file follows, which is the rule this whole codebase keeps
// relearning: a quality is not a sentence in a prompt. Every strength and every
// flaw below is a NUMBER the engine already reads somewhere — the pace the curia
// judges abuse files at, the bend on formation, a purse's margin, a current's
// approval, the cost of a gathering. A adviser who is "rigorous with money" and
// changes no figure is a portrait, and the player would find that out in three
// turns and stop reading the cabinet.
//
// So: pick three of twenty, and the three you pick change what you can do. Every
// one of them has a flaw of the same size as their gift, because a cabinet made
// only of gifts is a cabinet with no decision in it.

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v) => String(v ?? "").trim();

/** How many sit. Three: enough to cover two fronts and leave one uncovered. */
export const SEATS = 3;

// The levers a adviser may move. Named here so a reader can see the whole
// vocabulary at once, and so applyCabinet can refuse anything invented.
export const LEVERS = Object.freeze([
  "pace",        // how fast the curia judges the abuse files (runtime/fronts.js)
  "formation",   // the bend on seminaries and vocations
  "margin",      // what the purses earn on their capital (runtime/treasuries.js)
  "cost",        // what gatherings and works cost, as a multiplier
  "collect",     // the share of pledges that actually arrives (runtime/drives.js)
  "legitimacy",  // standing in the Church, in points
  "reach",       // how far a gathering carries
  "candour",     // how much of the truth the adviser's own reports carry
]);

// A bloc's approval shifts by these when a adviser is seated: a Curia man
// pleases the Curia and irritates the synodals, and neither is free.
const BLOC = Object.freeze({
  dubia: "Bloc des cardinaux des dubia",
  jesuits: "Compagnie de Jésus",
  guard: "Vieille garde de la Secrétairerie d'État",
  opus: "Opus Dei",
  synod: "Chemin synodal allemand",
  money: "Appareil financier du Vatican",
});

/**
 * The twenty. Each carries what they are good at and what it costs to have them
 * in the room, both as figures. `boon` and `bane` are the two halves a player
 * weighs; `blocs` is who is pleased or offended by the appointment itself.
 */
export const CANDIDATES = Object.freeze([
  {
    id: "ferrero", name: "Card. Ettore Ferrero", charge: "Préfet de l'Économie",
    line: "A audité trois dicastères avant qu'on lui demande. N'a jamais rendu un rapport aimable.",
    boon: { margin: 0.008 }, boonSays: "Les caisses rendent davantage : il sait ce qu'elles portent.",
    bane: { legitimacy: -3 }, baneSays: "Il humilie ceux qu'il contrôle, et cela se paie en Curie.",
    blocs: { [BLOC.money]: -10, [BLOC.guard]: -4 },
  },
  {
    id: "okonkwo", name: "Mgr Samuel Okonkwo", charge: "Promoteur de justice",
    line: "A instruit soixante dossiers d'abus en huit ans. En a perdu deux, et les nomme encore.",
    boon: { pace: 0.6 }, boonSays: "Les dossiers d'abus sont jugés bien plus vite.",
    bane: { legitimacy: -2 }, baneSays: "Chaque évêque démis laisse une famille de rancunes.",
    blocs: { [BLOC.guard]: -12, [BLOC.synod]: 6 },
  },
  {
    id: "duval", name: "Mère Claire Duval", charge: "Économe générale",
    line: "A tenu les comptes d'une congrégation de neuf mille sœurs sans un découvert.",
    boon: { cost: -0.18 }, boonSays: "Tout coûte moins cher : elle négocie tout, tout le temps.",
    bane: { reach: -0.1 }, baneSays: "Elle taille dans ce qui rayonne autant que dans ce qui gaspille.",
    blocs: { [BLOC.synod]: 8, [BLOC.guard]: -6 },
  },
  {
    id: "castellano", name: "Card. Pietro Castellano", charge: "Doyen de la Rote",
    line: "Cinquante ans de droit canon. Sait exactement ce qu'un pape ne peut pas faire.",
    boon: { legitimacy: 4 }, boonSays: "Vos actes tiennent en droit : personne ne les casse.",
    bane: { pace: -0.25 }, baneSays: "Rien ne sort de son bureau avant d'être inattaquable.",
    blocs: { [BLOC.dubia]: 10, [BLOC.synod]: -6 },
  },
  {
    id: "mendes", name: "Card. João Mendes", charge: "Nonce, trente ans de postes",
    line: "A négocié avec deux dictatures et un schisme. N'a jamais élevé la voix.",
    boon: { legitimacy: 3, reach: 0.12 }, boonSays: "Les États écoutent, et vos voyages portent plus loin.",
    bane: { pace: -0.15 }, baneSays: "Il préfère toujours attendre encore un peu.",
    blocs: { [BLOC.guard]: 8, [BLOC.jesuits]: -4 },
  },
  {
    id: "ruiz", name: "P. Andrés Ruiz, s.j.", charge: "Provincial d'Amérique latine",
    line: "A ouvert onze maisons de formation là où l'Église reculait.",
    boon: { formation: 0.35 }, boonSays: "Les séminaires se remplissent là où vous portez l'effort.",
    bane: { margin: -0.004 }, baneSays: "Il dépense le capital qu'il devrait placer.",
    blocs: { [BLOC.jesuits]: 12, [BLOC.dubia]: -8 },
  },
  {
    id: "achterberg", name: "Mgr Lena Achterberg", charge: "Secrétaire du Synode",
    line: "Fait voter des assemblées qui n'avaient jamais rien voté.",
    boon: { legitimacy: 5 }, boonSays: "Ce que vous faites passer par un corps tient mieux.",
    bane: { cost: 0.12 }, baneSays: "Consulter coûte : les sessions, les voyages, le temps.",
    blocs: { [BLOC.synod]: 14, [BLOC.dubia]: -12 },
  },
  {
    id: "brennan", name: "M. Declan Brennan", charge: "Gestionnaire, laïc",
    line: "Venu de la finance, reste pour la cause. Dit qu'il partira quand on cessera de l'écouter.",
    boon: { margin: 0.012 }, boonSays: "Le patrimoine travaille comme il ne l'a jamais fait.",
    bane: { candour: -0.3 }, baneSays: "Il arrondit les mauvaises nouvelles avant de vous les dire.",
    blocs: { [BLOC.money]: 10, [BLOC.jesuits]: -6 },
  },
  {
    id: "nakamura", name: "Card. Paul Nakamura", charge: "Évangélisation des peuples",
    line: "A vu son diocèse doubler dans un pays où les catholiques sont un demi pour cent.",
    boon: { reach: 0.22 }, boonSays: "Vos rassemblements touchent bien plus loin.",
    bane: { collect: -0.12 }, baneSays: "Il rassemble des foules qui n'ont rien à donner.",
    blocs: { [BLOC.jesuits]: 6 },
  },
  {
    id: "verhoeven", name: "Card. Anton Verhoeven", charge: "Ancien préfet de la Doctrine",
    line: "A écrit les textes que la moitié du collège cite et que l'autre moitié combat.",
    boon: { legitimacy: 4 }, boonSays: "Votre doctrine est inattaquable dans sa lettre.",
    bane: { formation: -0.15 }, baneSays: "Sous lui, une vocation est examinée jusqu'à décourager.",
    blocs: { [BLOC.dubia]: 14, [BLOC.synod]: -10, [BLOC.jesuits]: -4 },
  },
  {
    id: "salib", name: "Mgr Youssef Salib", charge: "Chrétiens d'Orient",
    line: "A fait sortir deux cents familles d'une ville assiégée. Ne dit pas comment.",
    boon: { legitimacy: 4, reach: 0.08 }, boonSays: "Votre voix compte là où l'on meurt pour la foi.",
    bane: { cost: 0.1 }, baneSays: "Ce qu'il obtient, il l'obtient en payant.",
    blocs: { [BLOC.guard]: 4 },
  },
  {
    id: "oyelaran", name: "Card. Grace Oyelaran", charge: "Conférence d'Afrique de l'Ouest",
    line: "Parle pour deux cent millions de baptisés et le rappelle à chaque phrase.",
    boon: { formation: 0.28, reach: 0.1 }, boonSays: "L'Afrique forme et se rassemble comme jamais.",
    bane: { legitimacy: -2 }, baneSays: "L'Europe curiale supporte mal qu'on lui parle ainsi.",
    blocs: { [BLOC.guard]: -8, [BLOC.dubia]: 4 },
  },
  {
    id: "lindqvist", name: "Sr Ingrid Lindqvist", charge: "Sauvegarde des mineurs",
    line: "A écrit le protocole que trente conférences épiscopales ont copié.",
    boon: { pace: 0.4, legitimacy: 3 }, boonSays: "Les dossiers avancent et l'Église en est crue.",
    bane: { cost: 0.08 }, baneSays: "Faire les choses correctement coûte, partout, tout le temps.",
    blocs: { [BLOC.guard]: -10, [BLOC.synod]: 8 },
  },
  {
    id: "moretti", name: "Card. Silvio Moretti", charge: "Secrétairerie d'État",
    line: "Connaît le dossier de chacun. C'est tout ce qu'on sait de lui.",
    boon: { candour: 0.3, legitimacy: 2 }, boonSays: "Rien ne se trame dans la Curie sans que vous le sachiez.",
    bane: { pace: -0.2 }, baneSays: "Il négocie ce qu'il faudrait trancher.",
    blocs: { [BLOC.guard]: 14, [BLOC.synod]: -8 },
  },
  {
    id: "abreu", name: "P. Tomás Abreu", charge: "Aumônier des favelas",
    line: "N'est jamais venu à Rome avant qu'on l'y appelle. Voudrait repartir.",
    boon: { legitimacy: 5 }, boonSays: "Les pauvres reconnaissent votre pontificat, et cela se voit.",
    bane: { margin: -0.006 }, baneSays: "Il ne comprend pas qu'on garde de l'argent quand on manque.",
    blocs: { [BLOC.jesuits]: 8, [BLOC.money]: -10 },
  },
  {
    id: "haugen", name: "M. Erik Haugen", charge: "Communication du Saint-Siège",
    line: "A retourné trois crises en dix ans. Deux méritaient de l'être.",
    boon: { legitimacy: 6 }, boonSays: "Ce que vous faites est compris comme vous l'entendez.",
    bane: { candour: -0.35 }, baneSays: "Il vous montre le monde tel qu'il le raconte.",
    blocs: { [BLOC.money]: 4, [BLOC.dubia]: -4 },
  },
  {
    id: "tenzin", name: "Mgr Karma Tenzin", charge: "Dialogue interreligieux",
    line: "Vingt ans d'Asie. Considère qu'on ne convainc personne en criant.",
    boon: { reach: 0.15, legitimacy: 2 }, boonSays: "Des portes s'ouvrent là où l'Église n'entrait pas.",
    bane: { formation: -0.1 }, baneSays: "Il forme moins de prêtres qu'il ne fait d'amis.",
    blocs: { [BLOC.dubia]: -8, [BLOC.jesuits]: 6 },
  },
  {
    id: "quiroga", name: "Card. Ignacio Quiroga", charge: "Opus Dei",
    line: "Discipline, comptes tenus, et une idée précise de ce que l'Église doit être.",
    boon: { collect: 0.2, margin: 0.005 }, boonSays: "Les promesses faites à votre Église sont tenues.",
    bane: { legitimacy: -3 }, baneSays: "Sa présence dans le cabinet est un signal, et tous le lisent.",
    blocs: { [BLOC.opus]: 16, [BLOC.jesuits]: -10, [BLOC.synod]: -8 },
  },
  {
    id: "bakhita", name: "Sr Josefina Bakhita Wolde", charge: "Migrations",
    line: "A compté les morts d'une traversée, un par un, pour qu'on ne dise pas « des centaines ».",
    boon: { legitimacy: 4, collect: 0.1 }, boonSays: "On donne à une Église qu'on voit là où c'est dur.",
    bane: { cost: 0.15 }, baneSays: "Elle engage l'Église dans des dépenses qui ne rapportent rien.",
    blocs: { [BLOC.synod]: 10, [BLOC.dubia]: -6 },
  },
  {
    id: "faucher", name: "Card. Henri Faucher", charge: "Liturgie",
    line: "Tient que ce qui se voit à l'autel décide de ce qu'on croit.",
    boon: { legitimacy: 3, formation: 0.12 }, boonSays: "Une liturgie tenue attire ceux qui hésitaient.",
    bane: { reach: -0.12 }, baneSays: "Il refuse la moitié de ce qui ferait venir les foules.",
    blocs: { [BLOC.dubia]: 12, [BLOC.synod]: -10 },
  },
]);

export const candidateById = (id) => CANDIDATES.find((c) => c.id === str(id)) ?? null;

/**
 * The cabinet's net effect on each lever: the seated advisers' boons and banes
 * summed. Unknown ids are dropped rather than guessed at.
 */
export const cabinetEffects = (ids) => {
  const out = Object.fromEntries(LEVERS.map((lever) => [lever, 0]));
  // Summed half by half. Spreading boon and bane into one object would have let
  // a flaw silently ERASE the gift it sits beside whenever both name the same
  // lever — an adviser who earns on the patrimony and spends it would have read
  // as one who only spends.
  for (const id of Array.isArray(ids) ? ids.slice(0, SEATS) : []) {
    const who = candidateById(id);
    if (!who) continue;
    for (const half of [who.boon, who.bane]) {
      for (const [name, value] of Object.entries(half ?? {})) {
        if (LEVERS.includes(name)) out[name] += finite(value);
      }
    }
  }
  return out;
};

/** What the appointments themselves do to each current's approval. */
export const cabinetBlocs = (ids) => {
  const out = {};
  for (const id of Array.isArray(ids) ? ids.slice(0, SEATS) : []) {
    const who = candidateById(id);
    if (!who) continue;
    for (const [bloc, delta] of Object.entries(who.blocs ?? {})) {
      out[bloc] = finite(out[bloc]) + finite(delta);
    }
  }
  return out;
};

/**
 * Seat a cabinet on the world. Stores the choice and the standing effects, so
 * every later turn reads them from state rather than from a remembered promise.
 */
export const seatCabinet = (world, ids, { date = "" } = {}) => {
  const seated = (Array.isArray(ids) ? ids : []).map(str).filter((id) => candidateById(id)).slice(0, SEATS);
  return {
    ...world,
    cabinet: {
      seated,
      effects: cabinetEffects(seated),
      blocs: cabinetBlocs(seated),
      seatedAt: str(date),
    },
  };
};

/** The standing value of one lever, 0 when no cabinet has been seated. */
export const lever = (world, name) => finite(world?.cabinet?.effects?.[str(name)]);

/** A line per seated adviser, for the page and for the model's own briefing. */
export const describeCabinet = (world) => {
  const seated = Array.isArray(world?.cabinet?.seated) ? world.cabinet.seated : [];
  return seated.map((id) => {
    const who = candidateById(id);
    return who ? `${who.name}, ${who.charge} — ${who.boonSays} ${who.baneSays}` : "";
  }).filter(Boolean);
};
