/*! Open Historia — leaders: the seat the player's own order actually vacates and fills © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// runtime/succession.js already makes tenure a mechanism: every polity's seat
// carries a mode, a term, a due date, and the engine steps it — terms fall due,
// life-tenure leaders die on a real hazard, a dead pope opens a conclave. What
// it has never had is a way in from the player's own words. leaderOps is a lever
// the MODEL is asked to carry, and a rule asking a model to carry a lever has
// never once made it carry the lever: the same lesson as the drives, the
// gatherings, the treasury moves and the unfunded promises, for the sixth time.
//
// Field report. A player resigned, named their successor and set the date of the
// election in a single order. The edition narrated all three beautifully. The
// [Leaders] block still listed the incumbent the next morning, and the stat sheet
// went on naming him for another eleven turns. So the engine reads the order.
//
// Four things a player actually writes, and nothing else:
//
//   a successor       "je désigne le cardinal Sarah pour me succéder"
//   a resignation     "je démissionne au 1er avril 2027" / an abdication
//   an appointment    "nommer Jean Dupont à la tête de Pax Africa"
//   a dismissal       "démettre le cardinal Sarah de ses fonctions"
//
// All four end in the ONE lever succession.js already owns — install, remove,
// schedule — so a seat filled from an order and a seat filled by the model come
// out with identical fields. Nothing here invents a field, and nothing here
// invents an office: an order naming a seat the world does not hold is refused
// by name, and a succession dated in the past is refused outright.

import { applyLeaderOps, normalizeLeaders } from "./succession.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
// Accents off for comparison only. A French player writes "François" and the
// stat sheet was seeded "Francois"; without this the engine would tell them the
// office is held by somebody else, which is the opposite of an honest refusal.
const plain = (v) => lower(v).normalize("NFD").replace(/\p{Diacritic}/gu, "");

// ---- dates -------------------------------------------------------------------
//
// A resignation without a date takes effect the day it is given. A resignation
// WITH a date is the whole point of this module, so the date has to survive both
// languages: ISO, "1er avril 2027", "April 1, 2027", "1 April 2027".

const MONTHS = {
  janvier: 1, janv: 1, "février": 2, fevrier: 2, "févr": 2, fevr: 2, mars: 3, avril: 4, avr: 4,
  mai: 5, juin: 6, juillet: 7, juil: 7, "août": 8, aout: 8, septembre: 9, octobre: 10,
  novembre: 11, "décembre": 12, decembre: 12,
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sept: 9, sep: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12, "déc": 12,
};
// Longest first, so "septembre" is not eaten by "sept".
const MONTH_NAMES = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join("|");
const ISO_DATE = /\b(-?\d{4})-(\d{2})-(\d{2})\b/;
const DAY_MONTH_YEAR = new RegExp(`\\b(\\d{1,2})(?:er|st|nd|rd|th)?\\s+(?:de\\s+)?(${MONTH_NAMES})\\.?\\s+(\\d{3,4})\\b`, "i");
const MONTH_DAY_YEAR = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{3,4})\\b`, "i");
const MONTH_YEAR = new RegExp(`\\b(${MONTH_NAMES})\\.?\\s+(\\d{3,4})\\b`, "i");

const pad = (n) => String(n).padStart(2, "0");
const iso = (y, m, d) => `${String(y).padStart(4, "0")}-${pad(m)}-${pad(d)}`;

/** The first date a piece of text carries, as ISO, or "" when it carries none. */
export const readOrderDate = (text) => {
  const s = str(text);
  const a = s.match(ISO_DATE);
  if (a) return `${a[1]}-${a[2]}-${a[3]}`;
  const b = s.match(DAY_MONTH_YEAR);
  if (b) return iso(b[3], MONTHS[lower(b[2])], Number(b[1]));
  const c = s.match(MONTH_DAY_YEAR);
  if (c) return iso(c[3], MONTHS[lower(c[1])], Number(c[2]));
  // A month with no day means the month, and the engine takes its first day
  // rather than inventing a precision the order did not have.
  const d = s.match(MONTH_YEAR);
  if (d) return iso(d[2], MONTHS[lower(d[1])], 1);
  return "";
};

const timeOf = (date) => {
  const s = str(date);
  if (!s) return NaN;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return ms;
  // Bare and pre-1AD years ("-0431", "1200") still order correctly, so the
  // past-date refusal works in every era rather than only in the modern ones.
  const y = /^(-?\d{1,4})/.exec(s);
  return y ? Date.UTC(Number(y[1]), 0, 1) : NaN;
};

const sentences = (text) => str(text).split(/(?<=[.!?;:])\s+|\n+/).filter(Boolean);

// A date has to sit beside the thing it dates. "Je démissionne le 1er avril 2027;
// le concile s'ouvrira le 3 mai" gave the resignation the concile's date until
// the sentence carrying the verb was the one searched first.
const dateNear = (text, re) => {
  for (const s of sentences(text)) {
    if (!re.test(s)) continue;
    const found = readOrderDate(s);
    if (found) return found;
  }
  return readOrderDate(text);
};

// ---- offices -----------------------------------------------------------------
//
// An office is a seat the world already holds: a polity the engine carries, or a
// body founded through organizationOps. Nothing else. An order that seats
// somebody at the head of a dicastery nobody has founded is refused by name —
// inventing the office to satisfy the sentence is exactly how a stat sheet ends
// up full of posts no mechanism ever touches.

const officesOf = ({ leaders = {}, organizations = [], economies = {} } = {}) => {
  const seen = new Map();
  const add = (n) => { const k = lower(n); if (k && !seen.has(k)) seen.set(k, str(n)); };
  for (const name of Object.keys(normalizeLeaders(leaders))) add(name);
  for (const org of Array.isArray(organizations) ? organizations : []) if (org && org.status !== "dissolved") add(org.name);
  for (const name of Object.keys(economies && typeof economies === "object" ? economies : {})) add(name);
  return [...seen.values()];
};

// An order writes a body's name the way a person would — "la holding une seule
// église", not "Une Seule Église, Une Seule Solidarité" — so a name answers to
// itself and to the head of it before any comma or dash, when that head is long
// enough to mean only one thing. Same rule as runtime/liabilities.js.
const namesOffice = (text, office) => {
  const haystack = plain(text);
  const full = plain(office);
  if (!full) return false;
  if (haystack.includes(full)) return true;
  const head = full.split(/\s*[,—–-]\s*/)[0];
  return head.length >= 8 && haystack.includes(head);
};

/** The office a text names, longest match first so a member never wins over its federation. */
const officeIn = (text, offices) => [...offices]
  .sort((a, b) => b.length - a.length)
  .find((o) => namesOffice(text, o)) ?? "";

// The phrase an order uses to point at an office. Read only so a refusal can
// quote what the player actually wrote back at them.
const OFFICE_PHRASE = /(?:[àa] la t[êe]te (?:de la|de l'|de l’|du|des|de)|au poste de|[àa] la (?:pr[ée]sidence|direction|charge) (?:de la|de l'|de l’|du|des|de)|comme (?:chef|dirigeant|pr[ée]sident|gouverneur|pr[ée]fet|secr[ée]taire|patriarche|leader|head) (?:de la|de l'|de l’|du|des|de)|(?:pr[ée]fet|ministre|gouverneur|secr[ée]taire|directeur|chancelier|patriarche) (?:de la|de l'|de l’|du|des|de)|as (?:the )?(?:head|leader|chief|governor|prefect|minister|secretary|president|chancellor) of (?:the )?|to (?:head|lead) (?:the )?|at the head of (?:the )?)\s*([^.,;:!?]{2,60})/i;

const claimedOffice = (text) => str(text.match(OFFICE_PHRASE)?.[1]);

// ---- people ------------------------------------------------------------------
//
// Case-sensitive on purpose: a person is a run of capitalised words, and the `i`
// flag would turn that test into "any word at all". So the verb is found with a
// case-insensitive match and the NAME is read out of what follows, untouched.

const NAME_WORD = "(?:[Dd][’'])?\\p{Lu}[\\p{L}’'-]+";
const PARTICLE = "(?:de|du|des|da|van|von|di|del|della|bin|ibn|al|el|of)";
const PERSON = new RegExp(`${NAME_WORD}(?:\\s+(?:${PARTICLE}\\s+)?${NAME_WORD}){0,3}`, "gu");

// Titles and determiners a French order puts in front of a name. Stripped rather
// than matched, so "le cardinal Robert Sarah" gives "Robert Sarah" and not a
// leader called Le.
const NOISE = new Set([
  "le", "la", "les", "l", "the", "un", "une", "a", "an", "mon", "ma", "mes", "my", "notre", "our",
  "son", "sa", "ses", "his", "her", "their", "leur", "de", "du", "des", "of", "et", "and",
  "cardinal", "cardinaux", "monseigneur", "mgr", "pere", "abbe", "dom", "don", "soeur", "sœur",
  "general", "colonel", "amiral", "marechal", "professeur", "docteur", "maitre", "monsieur",
  "madame", "mademoiselle", "m", "mme", "mlle", "sir", "lord", "lady", "dame", "eminence",
  "excellence", "president", "presidente", "premier", "ministre", "prime", "minister", "roi",
  "reine", "king", "queen", "pape", "pope", "je", "j", "i", "nous", "we", "il", "elle", "he", "she",
]);

const cleanName = (raw) => {
  let parts = str(raw).split(/\s+/).filter(Boolean);
  const noise = (w) => NOISE.has(plain(w).replace(/[.,;:'’]+$/, "").replace(/^['’]+/, ""));
  while (parts.length && noise(parts[0])) parts = parts.slice(1);
  while (parts.length && noise(parts[parts.length - 1])) parts = parts.slice(0, -1);
  const name = parts.join(" ").replace(/[.,;:]+$/, "").trim();
  return /\p{Lu}/u.test(name) ? name : "";
};

// A capitalised run that IS an office is the office, not a person: "nommer à la
// tête de Pax Africa le cardinal Sarah" must not seat a leader called Pax Africa.
const isOffice = (name, offices) => offices.some((o) => plain(o) === plain(name)
  || plain(o).split(/\s*[,—–-]\s*/)[0] === plain(name)
  || (o.length >= 5 && plain(name).includes(plain(o))));

const namesIn = (fragment, offices) => [...fragment.matchAll(PERSON)]
  .map((hit) => cleanName(hit[0]))
  .filter((name) => name && !isOffice(name, offices));

/** The first person named after `verb`, in the sentence that carries it. */
const personAfter = (text, verb, offices) => {
  for (const s of sentences(text)) {
    const m = s.match(verb);
    if (!m) continue;
    const found = namesIn(s.slice(m.index + m[0].length), offices);
    if (found.length) return found[0];
  }
  return "";
};

/** The person named just BEFORE `verb` — "le cardinal Sarah me succède". */
const personBefore = (text, verb, offices) => {
  for (const s of sentences(text)) {
    const m = s.match(verb);
    if (!m) continue;
    const found = namesIn(s.slice(0, m.index), offices);
    if (found.length) return found[found.length - 1];
  }
  return "";
};

// Two ways of writing the same person. A dismissal that names somebody the
// office is not held by must be refused, and a surname is how a player writes it.
const samePerson = (a, b) => {
  const x = plain(a).replace(/[.,]/g, "");
  const y = plain(b).replace(/[.,]/g, "");
  if (!x || !y) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  const words = (s) => s.split(/\s+/).filter((w) => w.length >= 3);
  const held = new Set(words(x));
  return words(y).some((w) => held.has(w));
};

// ---- what an order says -------------------------------------------------------

const RESIGNS = /\b(d[ée]mission\w*|d[ée]missionn\w+|j'abdique|abdiqu\w+|abdication|renonc\w+\s+(?:au|[àa])\s+[^.]{0,40}(?:minist[èe]re|tr[ôo]ne|charge|si[èe]ge|fonctions?)|me\s+retire\s+(?:de|du)\s+[^.]{0,30}(?:charge|fonctions?|tr[ôo]ne|si[èe]ge)|quitte\w*\s+(?:mes|ses)\s+fonctions|c[èe]de\w*\s+(?:ma|sa)\s+place|resign\w*|steps?\s+down|stands?\s+down|standing\s+down|relinquish\w*\s+(?:the\s+)?office|leaves?\s+office)\b/i;
const ABDICATES = /\b(abdiqu\w+|abdication|abdicat\w+|tr[ôo]ne)\b/i;

const DISMISSES = /\b(d[ée]met\w*|d[ée]mettre|r[ée]voqu\w+|destitu\w+|limog\w+|relever?\s+[^.]{0,40}de\s+ses\s+fonctions|renvoi\w+|renvoyer|dismiss\w*|sack\w+|depos\w+|oust\w*|remove\w*\s+[^.]{0,40}\bfrom\s+(?:office|the\s+post|his\s+post|her\s+post)|relieve\w*\s+[^.]{0,40}\bof\s+(?:his|her|their)\s+(?:duties|post|office))\b/i;

const SUCCEEDS = /\b(successeur\w*|succession|succ[èe]d\w+|succ[ée]d\w+|successor|succeeds?|succeeding)\b/i;
const SUCCESSOR_IS = /\b(?:successeur|successor)\s*(?:sera|est|will\s+be|is|:|,)/i;
const NAMES_SUCCESSOR = /\b(d[ée]sign\w+|nomm\w+|choisi\w*|appoint\w*|designat\w*|nam(?:e|es|ing))\b/i;
const SUCCEEDS_ME = /\b(me\s+succ[èe]d\w*|me\s+succ[ée]dera|will\s+succeed\s+me|succeeds?\s+me)\b/i;

const APPOINTS = /\b(nomme\w*|nommer|nommons|d[ée]sign\w+|install\w+|[ée]l[èe]v\w+|port\w+\s+[^.]{0,20}[àa]\s+la\s+t[êe]te|appoint\w*|nam(?:e|es|ing)|elevat\w*)\b/i;

// An election or a conclave the player themself puts a date on. The engine's own
// seeded calendar is a prior; a date the player sets is a fact, and it belongs in
// nextDue where [Leaders] will read it back.
const SETS_VOTE = /\b([ée]lections?|scrutin|conclave|r[ée]f[ée]rendum|referendum|congr[èe]s\s+du\s+parti|party\s+congress|election|ballot)\b/i;
const CALLS_VOTE = /\b(convoqu\w+|fixe\w*|fixer|annonc\w+|organis\w+|programm\w+|tiendra|aura\s+lieu|se\s+tiendra|ouvrira|call\w*|schedul\w+|sets?\b|holds?\b|will\s+be\s+held|opens?\b|announc\w+)\b/i;

// The office a first-person order is about: one's own seat, unless the order
// plainly speaks of another and never mentions one's own.
const officeFor = (text, mine, offices) => {
  if (mine && namesOffice(text, mine)) return mine;
  return officeIn(text, offices.filter((o) => lower(o) !== lower(mine))) || mine;
};

/**
 * What an order does to the seats the world holds. Returns moves, never state:
 *
 *   {kind:"vacate",   office, name, at, why}   a resignation, abdication, dismissal
 *   {kind:"install",  office, name, at, why}   a successor named, somebody appointed
 *   {kind:"schedule", office, at, dueKind}     an election or conclave date the player set
 *
 * `at` is ISO, or "" for "the day this order is given". Nothing is decided here:
 * an unknown office and a date in the past both travel as moves so that
 * applyLeaderMoves can refuse them out loud, by name.
 */
export const leaderMovesFromOrder = (order, { player = "", leaders = {}, organizations = [], economies = {}, date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  if (!text) return [];
  const offices = officesOf({ leaders, organizations, economies });
  const seats = normalizeLeaders(leaders);
  const mine = str(player);
  const moves = [];

  if (RESIGNS.test(text)) {
    moves.push({
      kind: "vacate",
      office: officeFor(text, mine, offices),
      name: "",
      at: dateNear(text, RESIGNS),
      why: ABDICATES.test(text) ? "abdication" : "resignation",
    });
  }

  if (DISMISSES.test(text)) {
    const who = personAfter(text, DISMISSES, offices);
    const claimed = claimedOffice(text);
    // No office in the phrase? Then it is the office this person actually holds
    // — real state, read off the seats, never a guess. A dismissal that reaches
    // neither is refused rather than falling back on the player's own seat: an
    // order sacking a governor must not unseat the player by default.
    const held = who ? Object.keys(seats).find((p) => seats[p].name && samePerson(seats[p].name, who)) : "";
    const office = officeIn(claimed, offices) || held || "";
    if (who || office || OFFICE_PHRASE.test(text)) {
      moves.push({ kind: "vacate", office, name: who, at: dateNear(text, DISMISSES), why: "dismissal", claimed });
    }
  }

  if (SUCCEEDS.test(text)) {
    const who = personAfter(text, SUCCESSOR_IS, offices)
      || personAfter(text, NAMES_SUCCESSOR, offices)
      || personBefore(text, SUCCEEDS_ME, offices);
    moves.push({
      kind: "install",
      office: officeFor(text, mine, offices),
      name: who,
      at: dateNear(text, SUCCEEDS) || dateNear(text, RESIGNS),
      why: "succession",
    });
  } else if (APPOINTS.test(text) && OFFICE_PHRASE.test(text)) {
    // An appointment needs a post to be appointed TO. Without that phrase
    // "nommer une commission d'enquête" seated a commission as head of state.
    const claimed = claimedOffice(text);
    moves.push({
      kind: "install",
      office: officeIn(claimed, offices),
      name: personAfter(text, APPOINTS, offices),
      at: dateNear(text, APPOINTS),
      why: "appointment",
      claimed,
    });
  }

  if (SETS_VOTE.test(text) && CALLS_VOTE.test(text)) {
    const at = dateNear(text, SETS_VOTE);
    if (at) {
      moves.push({
        kind: "schedule",
        office: officeFor(text, mine, offices),
        at,
        dueKind: /conclave/i.test(text) ? "conclave" : "election",
        why: "calendar",
      });
    }
  }

  return moves;
};

const dueKindFor = (seat) => (seat?.mode === "conclave" ? "conclave" : (seat?.mode === "election" ? "election" : "term-end"));

const seatRow = (date, office, what, amount, why) => ({ date, polity: office, kind: "standing", what, amount, unit: "seat", source: `order:${why}` });

// Seats are vacated before they are filled, and the calendar is set last, so an
// order that resigns, names a successor and fixes the election date in one
// sentence lands in that order however the sentence was written. Written the
// other way round, the install's own term overwrote the date the player set.
const RANK = { vacate: 0, install: 1, schedule: 2 };

/**
 * Applies those moves to the world's seats through the one lever succession.js
 * owns, so a seat filled from an order carries exactly the fields a seat filled
 * by leaderOps carries. Returns the new world, the rows for the record, and the
 * refusals the player needs to read.
 */
export const applyLeaderMoves = (world, moves, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const offices = officesOf({ leaders: w.leaders, organizations: w.organizations, economies: w.economies });
  const canonical = (name) => offices.find((o) => lower(o) === lower(str(name))) ?? "";
  let leaders = normalizeLeaders(w.leaders);
  let countryStats = w.countryStats && typeof w.countryStats === "object" ? { ...w.countryStats } : {};
  let polityOverrides = w.polityOverrides && typeof w.polityOverrides === "object" ? { ...w.polityOverrides } : {};
  const rows = [];
  const refusals = [];
  const now = timeOf(date);

  // The stat sheet, not just the engine's seat. Field report, and the reason
  // this module exists at all: polityOverrides[polity].leader is re-applied over
  // countryStats on EVERY read of the world (runtime/gameState.js), so a pope who
  // resigned kept being written back onto the sheet over each successor the model
  // installed. Filling a seat repoints that pin; emptying one releases it, which
  // is what lets the next install take.
  const pin = (office, name) => {
    if (countryStats[office]) countryStats = { ...countryStats, [office]: { ...countryStats[office], leader: name } };
    // Updated, never created: an override is also what marks a polity KNOWN to
    // the game, and seating a foreign leader must not quietly promote their
    // country into the player's own namespace.
    if (polityOverrides[office]) polityOverrides = { ...polityOverrides, [office]: { ...polityOverrides[office], leader: name } };
  };

  const run = (ops, when) => {
    const out = applyLeaderOps(leaders, ops, { date: when });
    leaders = out.leaders;
    for (const line of out.refusals) refusals.push(`leaders: ${line}`);
    return !out.refusals.length;
  };

  for (const move of [...(Array.isArray(moves) ? moves : [])].sort((a, b) => (RANK[a?.kind] ?? 9) - (RANK[b?.kind] ?? 9))) {
    if (!move || typeof move !== "object") continue;
    const why = str(move.why) || str(move.kind);
    const office = canonical(move.office);
    if (!office) {
      const claimed = str(move.claimed) || str(move.office);
      refusals.push(claimed
        ? `leaders ${why} refused: "${claimed}" is not an office this world holds. Found the body with organizationOps first, then seat someone in it.`
        : str(move.name)
          ? `leaders ${why} refused: no office this world holds is held by ${str(move.name)}, so there is nothing to remove them from.`
          : `leaders ${why} refused: the order names no office this world holds.`);
      continue;
    }

    const at = str(move.at);
    const when = timeOf(at);
    if (at && Number.isFinite(when) && Number.isFinite(now) && when < now) {
      refusals.push(`leaders ${why} refused: ${at} is before ${date} — the engine does not seat or unseat anyone in the past. Give a date from ${date} onward.`);
      continue;
    }
    // Announced, not done. A date still ahead leaves the holder in the office
    // until that day; the engine records the day the seat falls due instead of
    // pretending the chair is already empty.
    const ahead = Boolean(at) && Number.isFinite(when) && Number.isFinite(now) && when > now;
    const on = at || date;
    const seat = leaders[office] ?? null;

    if (move.kind === "vacate") {
      if (!seat || !seat.name) { refusals.push(`leaders ${why} refused: the world holds no one in the office of ${office}, so no one can leave it.`); continue; }
      if (seat.vacantSince) { refusals.push(`leaders ${why} refused: ${office} has been vacant since ${seat.vacantSince} — install someone before removing them.`); continue; }
      if (str(move.name) && !samePerson(seat.name, move.name)) {
        refusals.push(`leaders ${why} refused: ${office} is held by ${seat.name}, not ${str(move.name)}. The engine will not unseat somebody the world does not have in the chair.`);
        continue;
      }
      if (!str(move.name) && why === "dismissal") {
        refusals.push(`leaders dismissal refused: the order does not say who is being removed from ${office}. Name them and the engine will unseat them.`);
        continue;
      }
      if (ahead) {
        if (!run([{ op: "schedule", polity: office, nextDue: at, kind: dueKindFor(seat) }], date)) continue;
        rows.push(seatRow(date, office, `${seat.name} announced leaving the office of ${office} on ${at}`, 0, why));
        refusals.push(`leaders ${why}: ${seat.name} holds ${office} until ${at}, so the engine lists the seat as falling due that day rather than emptying it today.`);
        continue;
      }
      if (!run([{ op: "remove", polity: office, reason: why }], on)) continue;
      rows.push(seatRow(on, office, `${seat.name} left the office of ${office}`, -1, why));
      pin(office, "");
      continue;
    }

    if (move.kind === "install") {
      const name = str(move.name);
      if (!name) {
        refusals.push(`leaders ${why} refused: the order does not name the person to take the office of ${office}. Write the name and the engine will seat them.`);
        continue;
      }
      if (ahead) {
        // The successor is real and the date is real, but one does not sit in an
        // occupied chair. The name goes to the record, where the model reads it
        // back on the turn the seat actually falls due.
        if (seat && !run([{ op: "schedule", polity: office, nextDue: at, kind: dueKindFor(seat) }], date)) continue;
        rows.push(seatRow(date, office, `${name} designated to take the office of ${office} on ${at}`, 0, why));
        refusals.push(`leaders ${why}: ${name} does not hold ${office} yet — the seat falls due ${at}, and the engine seats nobody before that day.`);
        continue;
      }
      const leaving = seat && seat.name && !seat.vacantSince && !samePerson(seat.name, name) ? seat.name : "";
      const ops = leaving ? [{ op: "remove", polity: office, reason: why }] : [];
      ops.push({ op: "install", polity: office, name, since: on, reason: why });
      if (!run(ops, on)) continue;
      if (leaving) rows.push(seatRow(on, office, `${leaving} left the office of ${office}`, -1, why));
      rows.push(seatRow(on, office, `${name} took the office of ${office}`, 1, why));
      pin(office, name);
      continue;
    }

    if (move.kind === "schedule") {
      if (!seat) { refusals.push(`leaders calendar refused: the world holds no seat for ${office}, so there is no date to set.`); continue; }
      if (!at) { refusals.push(`leaders calendar refused: ${office} — the order sets no date the engine can read.`); continue; }
      const kind = str(move.dueKind) === "conclave" ? "conclave" : dueKindFor(seat);
      if (!run([{ op: "schedule", polity: office, nextDue: at, kind }], date)) continue;
      rows.push(seatRow(date, office, `${kind} for ${office} set for ${at}`, 0, "calendar"));
      continue;
    }

    refusals.push(`leaders: unknown move "${str(move.kind)}".`);
  }

  if (!rows.length) return { world: w, rows: [], refusals };
  return { world: { ...w, leaders, countryStats, polityOverrides }, rows, refusals };
};

/** Every planned order, read for what it does to the seats the world holds. */
export const ensureLeaderMovesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const moves = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")
    .flatMap((order) => leaderMovesFromOrder(order, { player, leaders: w.leaders, organizations: w.organizations, economies: w.economies, date }));
  if (!moves.length) return { world: w, rows: [], refusals: [] };
  return applyLeaderMoves(w, moves, { player, date });
};

export const LEADER_ORDER_RULES = [
  "A resignation, an abdication, a successor named, an appointment to an office or a dismissal from one is read off the player's own order by the engine and applied to the seat BEFORE you write a word. So never narrate a leader standing down and leave them in office: read [Leaders] and the record, and write what actually happened to the chair.",
  "An office is a seat the world already holds — a polity the engine carries, or a body founded through organizationOps. An order seating somebody at the head of anything else is refused by name and nothing moves; found the body first.",
  "A succession dated in the past is refused outright. A date still ahead does NOT empty the chair: the holder keeps the office until that day and the engine lists the seat as falling due then, so an announced resignation stays an announcement, and a designated successor is in the record rather than in office.",
  "A dismissal must name the person. The engine refuses to unseat somebody the office is not actually held by, and says who holds it instead.",
  "When a seat is filled or emptied from an order the engine also moves the stat sheet, so the departed leader stops being written back over each successor. It cannot know a new leader's birth year: pair your edition with a leaderOps install carrying `born`, or that leader will never face the mortality every other one does.",
].join("\n");
