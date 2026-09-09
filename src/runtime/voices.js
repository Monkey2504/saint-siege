/*! Open Historia — every correspondent speaks in their own voice © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The letters are where the world stops being a spreadsheet. They are the only
// place a player meets anybody, and a player said it plainly: writing to France,
// to Germany and to Turkey must not feel like writing to the same person three
// times. Not the same wants, not the same register, not the same verbal habits.
//
// Today they do feel the same, and the reason is structural. The diplomatic
// prompt is handed the speaker's NAME, the world state and the thread — and
// nothing about who this correspondent IS as a correspondent. So the model
// improvises a manner on every call, and an improvised manner regresses to the
// same courteous diplomatic average every time. Worse, it is re-improvised each
// turn: the polity that was brusque in March is emollient in April, because
// nothing carried its manner forward.
//
// The fix is the one this codebase has used all the way down: do not ask the
// model to remember a personality — give it the state.
//
// A voice has two halves, and they are built differently on purpose.
//
//   what it WANTS      computed from the polity's real situation: the schemes
//                      it is running, whether its budget is short, whether it
//                      is beholden to the player or the player to it. This is
//                      never invented, because a correspondent that wants
//                      something the figures do not support is a liar the
//                      player cannot catch.
//
//   how it SPEAKS      drawn once from tables, deterministically from the
//                      name, so a polity's manner is stable for the whole
//                      campaign and two polities are never alike. Manner is
//                      colour, and colour may be arbitrary as long as it never
//                      moves.

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// A stable number from a name: the same polity draws the same manner in every
// game, on every machine, for ever. Nothing here may use Math.random.
const seedOf = (name) => {
  let h = 2166136261;
  const s = lower(name);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
};
const pick = (list, seed, salt) => list[(seed + salt * 2654435761) % list.length];

// --- how it speaks -------------------------------------------------------------

// Register: how much ceremony the letter carries. Not a mood — a house style.
const REGISTERS = [
  "formal and ceremonious: full titles, the long courtesy before the point, never a contraction",
  "dry and administrative: numbered points, dates, references to earlier correspondence",
  "warm and personal: first names where protocol allows, a remark about the reader before business",
  "blunt to the edge of rudeness: the demand in the first sentence, no softening",
  "lawyerly: every concession hedged, every commitment conditional on something else",
  "grandiloquent: history, destiny and the judgement of posterity invoked over small matters",
];

// A habit the reader will come to recognise. One each, and it must recur.
const TICS = [
  "always opens by naming the exact date of the player's last letter",
  "never uses the player's title, only the name of their state",
  "closes every letter with a proverb or a line of scripture",
  "asks one question at the end and refuses to move until it is answered",
  "refers to itself in the plural — 'we', 'this government', never 'I'",
  "mentions a domestic constraint in every letter: a parliament, a synod, a street",
  "quantifies everything, even courtesies: 'three points', 'the second of which'",
  "apologises for the length of the letter, then writes at length anyway",
  "opens with a complaint about being kept waiting, however briefly",
  "signs off with an offer that is slightly better than what was asked, and a hook attached",
];

// What it will not do, whatever it is offered. A correspondent with no red line
// is a correspondent who says yes eventually, and nobody remembers those.
const REFUSALS = [
  "will not accept anything that reads as charity",
  "will not sign anything its neighbours have not been told about first",
  "will not discuss money in the first exchange of any negotiation",
  "will not concede a point of doctrine or principle, however small the practical cost",
  "will not put anything in writing that a rival could read aloud",
  "will not deal at all while a grievance it has named goes unanswered",
];

const LENGTHS = [
  "two or three sentences, never more",
  "a short paragraph, dense",
  "two paragraphs: the courtesy, then the business",
  "one long paragraph that circles the point before landing on it",
];

// --- what it wants -------------------------------------------------------------

/**
 * The correspondent's aim, computed from what the world actually holds. Order
 * matters: a scheme in motion outranks a budget problem, which outranks the
 * ordinary business of being owed something.
 */
export const wantOf = (name, { intents = [], economies = {}, player = "" } = {}) => {
  const mine = (Array.isArray(intents) ? intents : [])
    .filter((it) => lower(it?.owner) === lower(name) && str(it?.status) === "active");
  const againstPlayer = mine.find((it) => lower(it?.target) === lower(player));
  if (againstPlayer) {
    return againstPlayer.secret
      ? `is running a scheme against ${player} it will not admit to (${str(againstPlayer.kind)}), so it probes and flatters and gives nothing away`
      : `is openly working against ${player} on ${str(againstPlayer.kind)} matters, and says so`;
  }
  if (mine.length) return `is pursuing ${str(mine[0].summary) || str(mine[0].kind)}, and bends every exchange back toward it`;

  const e = economies?.[str(name)];
  if (e) {
    const revenue = finite(e.transfers) + finite(e.endowment) * finite(e.endowmentYield);
    const spend = finite(e.civilSpending) + finite(e.militaryUpkeep);
    if (spend > revenue * 1.1) return "is short of money and will turn any subject toward what it costs and who pays";
    if (finite(e.unfundedLiabilities) > 0) return "owes more than it has set aside, and is defensive about its accounts";
  }
  return "wants standing more than anything material: to be consulted, named, and treated as an equal";
};

// --- the voice -----------------------------------------------------------------

/**
 * The whole correspondent, ready to be put in front of a model. Deterministic:
 * the same name and the same world always give the same voice.
 */
export const voiceFor = (name, { intents = [], economies = {}, tags = [], player = "" } = {}) => {
  const who = str(name);
  if (!who) return null;
  const seed = seedOf(who);
  const marks = (Array.isArray(tags) ? tags : []).map(lower);
  return {
    name: who,
    want: wantOf(who, { intents, economies, player }),
    register: pick(REGISTERS, seed, 1),
    tic: pick(TICS, seed, 2),
    refusal: pick(REFUSALS, seed, 3),
    length: pick(LENGTHS, seed, 4),
    // A tag the scenario already carries is worth more than any table, so it is
    // allowed to override the drawn register.
    formality: marks.includes("theocratic") || marks.includes("monarchy") ? "high" : marks.includes("revolutionary") ? "low" : "normal",
  };
};

/** The block the diplomatic prompt carries for whoever is speaking. */
export const describeVoice = (voice) => {
  if (!voice) return "";
  return [
    `[You Are ${voice.name}, and You Sound Like Nobody Else]`,
    `What you want: you ${voice.want}.`,
    `Your register: ${voice.register}.`,
    `Your habit, and it must appear: you ${voice.tic}.`,
    `Your red line: you ${voice.refusal}.`,
    `Your length: ${voice.length}.`,
    "",
    "This is who you are in every letter of this campaign, not a mood for today. A reader who has had three letters from you must be able to recognise a fourth without seeing the name on it. Do not drift toward polite diplomatic prose: that is the voice of nobody.",
  ].join("\n");
};

export const VOICE_RULES = [
  "Every correspondent has a voice of their own, carried in the block above, and it is the same voice in every letter of the campaign. It is not a mood: a polity that is ceremonious in March is ceremonious in April, whatever has happened between.",
  "Two different polities must never read alike. If the reply you are about to write could have been sent by any of the others with the name swapped, it is wrong — rewrite it with the register, the habit and the red line you were given.",
  "What a correspondent WANTS is computed from what the world actually holds — its schemes, its budget, what it owes. Do not invent a want that the figures do not support, and do not let a polity offer money it does not have.",
].join("\n");
