/*! Open Historia — the inauguration: a pope names himself and declares his programme © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The first thing a pope does is not advance time. He takes a name, and he tells
// the Church what he was elected to change. Both are state, not ceremony: the
// name is who the world addresses, and the declaration becomes the pope's own
// standing intent — the thing the reality check, the factions' schemes, the
// opening edition and the world's own reach all read. A game in church mode
// cannot run its first jump until this has happened.

import { HOLY_SEE } from "./churchPreset.js";
import { ensureRegisterBaseline } from "./register.js";

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export const INAUGURATION_INTENT_ID = "pope-reform";

/** Church mode: the world carries the faithful ledger the preset seeds. */
export const isChurchGame = (world) => Boolean(world && typeof world === "object" && world.church);

/** A church game whose pope has declared. Other games need no inauguration. */
export const isInaugurated = (world) => {
  if (!isChurchGame(world)) return true;
  const intents = Array.isArray(world.intents) ? world.intents : [];
  return intents.some((it) => str(it?.id) === INAUGURATION_INTENT_ID && str(it?.summary));
};

/**
 * Apply the inauguration to a world: the name on the polity and its stat sheet,
 * the declaration as a standing, public, supportive intent of the Holy See, and
 * the declaration printed into the opening text. Pure: returns a new world.
 */
export const inaugurate = (world, { name, declaration }) => {
  const papalName = str(name);
  const programme = str(declaration);
  if (!papalName) throw new Error("A pope takes a name before anything else.");
  if (!programme) throw new Error("A pope tells the Church what he was elected to change.");

  const w = { ...(world && typeof world === "object" ? world : {}) };

  w.polityOverrides = { ...(w.polityOverrides ?? {}), [HOLY_SEE]: { ...(w.polityOverrides?.[HOLY_SEE] ?? {}), leader: papalName } };
  if (w.countryStats?.[HOLY_SEE]) w.countryStats = { ...w.countryStats, [HOLY_SEE]: { ...w.countryStats[HOLY_SEE], leader: papalName } };

  const others = (Array.isArray(w.intents) ? w.intents : []).filter((it) => str(it?.id) !== INAUGURATION_INTENT_ID);
  w.intents = [
    ...others,
    { id: INAUGURATION_INTENT_ID, ownerType: "polity", owner: HOLY_SEE, target: "", kind: "political", summary: programme, stage: 5, secret: false, stance: "supportive", scope: [], status: "active" },
  ];

  const line = `${papalName} a été élu sur ce programme : ${programme}`;
  const opening = str(w.startingTimelineText);
  w.startingTimelineText = opening.includes(line) ? opening : `${opening} ${line}`.trim();

  // A declaration is a bomb only if the world moves on it. Every hostile scheme
  // whose declared field the programme touches advances — its owners were
  // waiting for exactly this — and the world records that answers are due, so
  // the next edition is held to them (describeDeclarationReactions).
  const touched = reactionsToDeclaration({ ...w, intents: others }, programme);
  const movers = new Set(touched.filter((r) => r.stance === "hostile").map((r) => r.id));
  w.intents = w.intents.map((it) => (movers.has(str(it?.id)) ? { ...it, stage: Math.min(100, Math.round(Number(it.stage) || 0) + REACTION_STAGE_BUMP) } : it));
  w.inauguration = { name: papalName, declaration: programme, answered: false, reactions: touched.map((r) => ({ owner: r.owner, stance: r.stance, hits: r.hits })) };

  // Day one of the pontificate is the day every later figure is measured from.
  return ensureRegisterBaseline(w, HOLY_SEE, { date: str(w.startDate || w.gameDate || "") });
};

// How far a scheme whose field the declaration touches moves on hearing it.
export const REACTION_STAGE_BUMP = 15;

const lower = (v) => str(v).toLowerCase();

/**
 * Which standing schemes the programme touches, and how they stand. A scheme
 * with declared scope keywords is touched when the programme names one of them;
 * a scheme with no scope opposes or supports everything and is always touched.
 * Read from the intents the world holds — the same data the reality check uses
 * to price opposition — never from prose.
 */
/**
 * Un mot de portée est cherché en DÉBUT de mot, jamais n'importe où dedans.
 *
 * `text.includes(k)` accrochait au milieu des mots : « Autriche » contient
 * « riche », « tricher » contient « rich ». Un pape qui parlait de l'Autriche
 * déclenchait l'appareil financier. La frontière de gauche seule est gardée —
 * les mots de portée sont des radicaux (« financ », « transparen »,
 * « investisse ») et doivent continuer d'attraper leurs déclinaisons.
 */
const DEBUT_DE_MOT = /[a-zà-öø-ÿ0-9]/i;
const nommeLeMot = (texte, mot) => {
  let i = texte.indexOf(mot);
  while (i !== -1) {
    if (i === 0 || !DEBUT_DE_MOT.test(texte[i - 1])) return true;
    i = texte.indexOf(mot, i + 1);
  }
  return false;
};

export const reactionsToDeclaration = (world, declaration) => {
  const text = lower(declaration);
  const intents = Array.isArray(world?.intents) ? world.intents : [];
  return intents
    .filter((it) => it && lower(it.status || "active") === "active" && str(it.id) !== INAUGURATION_INTENT_ID && lower(it.owner) !== lower(HOLY_SEE))
    .map((it) => {
      const scope = (Array.isArray(it.scope) ? it.scope : []).map(lower).filter(Boolean);
      const hits = scope.filter((k) => nommeLeMot(text, k));
      return { id: str(it.id), owner: str(it.owner), stance: lower(it.stance) || "hostile", hits, touched: scope.length === 0 || hits.length > 0 };
    })
    .filter((r) => r.touched);
};

/**
 * The block the model reads while answers are still due: who was touched by the
 * declaration and how they stand, with the demand that each answers in this
 * edition. Empty once the world has answered, or when nothing was declared.
 */
export const describeDeclarationReactions = (world) => {
  // A game that declared before the inauguration sheet existed carries the
  // programme as an intent but no record of answers owed. The intent is the
  // declaration; the answers are still due until one edition has given them.
  let record = world?.inauguration;
  if (!record) {
    const intent = (Array.isArray(world?.intents) ? world.intents : []).find((it) => str(it?.id) === INAUGURATION_INTENT_ID && str(it?.summary));
    if (intent) {
      const name = str(world?.polityOverrides?.[HOLY_SEE]?.leader) || "The pope";
      record = { name, declaration: str(intent.summary), answered: false, reactions: reactionsToDeclaration(world, intent.summary).map((r) => ({ owner: r.owner, stance: r.stance, hits: r.hits })) };
    }
  }
  if (!record || record.answered || !str(record.declaration)) return "";
  const lines = (Array.isArray(record.reactions) ? record.reactions : []).map((r) =>
    `- ${r.owner} (${r.stance}${r.hits?.length ? `; touched on: ${r.hits.join(", ")}` : "; touched on everything"})`,
  );
  return [
    "[Declaration — answers due this edition]",
    `${str(record.name)} declared before the Church: "${str(record.declaration)}"`,
    lines.length
      ? `The following powers hold standing schemes this declaration touches, and each MUST answer it in this edition — a statement, a move, a leak, a closing of ranks — in character with its stance:\n${lines.join("\n")}`
      : "No standing scheme names what was declared; the Church at large still answers a new pope's first word.",
    "A declaration nobody answers is a modelling error: the world heard it.",
    "If you are writing the pre-game history: its LAST event is dated the start date and is the election itself — the name taken, the declaration as it was made, and the first answers of the powers above, that same day. Everything before it is what led here.",
  ].join("\n");
};

/** After a jump has been narrated, the answers are no longer due. */
export const markDeclarationAnswered = (world) => {
  if (world?.inauguration?.answered) return world;
  if (world?.inauguration) return { ...world, inauguration: { ...world.inauguration, answered: true } };
  // Declared by the old path (intent only): record that the edition has answered,
  // or the fallback in describeDeclarationReactions would demand it every turn.
  const declared = (Array.isArray(world?.intents) ? world.intents : []).some((it) => str(it?.id) === INAUGURATION_INTENT_ID);
  return declared ? { ...world, inauguration: { answered: true } } : world;
};
