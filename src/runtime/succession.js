/*! Open Historia — succession: leaders are mortal and elected, as state the engine steps © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// A country's leader used to be a string on its stat sheet that changed only
// when the model remembered to change it — so a president served for twenty
// years, a ninety-year-old king never died, and a pope's death was whatever
// the narration felt like. This makes tenure a MECHANISM: every polity's
// leader has a mode (election, hereditary, life, appointment, conclave), a
// term where terms exist, a birth year where one is known, and the engine
// steps them — a term that reaches its date is DUE; a life-tenure leader
// carries an annual mortality hazard rolled deterministically (seeded on
// polity + date, the PRNG unitCombat.js uses for battles) so the same save
// replayed gives the same death; a dead pope opens a conclave.
//
// The model resolves what falls due through a typed op (install / remove /
// schedule); the engine refuses to let a term run past its date or a dead
// leader govern. Never a regime hard-coded: the same step for the United
// States (4-year term), France (5), a Saudi king (life, hereditary), the
// Holy See (conclave) and a Bronze Age chief (life, no birth year known).
//
// Pure: no store reads, no React, no Math.random.

import { seededRandom } from "../Game/Map/unitCombat.js";

export const LEADER_MODES = ["election", "hereditary", "life", "appointment", "conclave"];
export const DUE_KINDS = ["election", "conclave", "death-risk", "term-end"];

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---- dates -------------------------------------------------------------------------------
// Game dates are ISO "YYYY-MM-DD" wherever the calendar reaches; a bare year
// ("-0431", "1200") still parses to a year so the step works before 1 AD.

const DAY_MS = 86_400_000;
export const yearOfDate = (date) => {
  const m = /^(-?\d{1,4})/.exec(str(date));
  return m ? Number(m[1]) : NaN;
};
const parseDate = (date) => {
  const s = str(date);
  if (!s) return NaN;
  const ms = Date.parse(s);
  if (Number.isFinite(ms)) return ms;
  const y = yearOfDate(s);
  return Number.isFinite(y) ? Date.UTC(y, 0, 1) : NaN;
};
const isoDate = (ms) => {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const yy = y < 0 ? `-${String(-y).padStart(4, "0")}` : String(y).padStart(4, "0");
  return `${yy}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};
export const addYears = (date, years) => {
  const ms = parseDate(date);
  if (!Number.isFinite(ms)) return "";
  const d = new Date(ms);
  d.setUTCFullYear(d.getUTCFullYear() + Math.round(finite(years, 0)));
  return isoDate(d.getTime());
};
const addDays = (date, days) => {
  const ms = parseDate(date);
  return Number.isFinite(ms) ? isoDate(ms + finite(days, 0) * DAY_MS) : "";
};

// ---- state -------------------------------------------------------------------------------
//
//   leaders[polity] = { name, since, born, termYears, mode, nextDue, dueKind, vacantSince, log }
//   termYears 0 = for life (or until removed); nextDue is set only when a term exists.

export const normalizeLeader = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const mode = LEADER_MODES.includes(lower(entry.mode)) ? lower(entry.mode) : "life";
  // An unknown birth year is unknown (no mortality roll), never year 0.
  const born = entry.born === null || entry.born === undefined || entry.born === "" ? NaN : finite(entry.born, NaN);
  const termYears = Math.max(0, Math.round(finite(entry.termYears, 0)));
  // How the last seat was vacated (a death the engine rolled, a removal the
  // model ordered) — kept so the vacancy line can say who and why.
  const exit = (v) => (v && typeof v === "object" && str(v.name) ? { name: str(v.name), date: str(v.date), ...(str(v.reason) ? { reason: str(v.reason) } : {}) } : null);
  return {
    name: str(entry.name),
    since: str(entry.since),
    born: Number.isFinite(born) ? Math.round(born) : null,
    termYears,
    mode,
    nextDue: str(entry.nextDue),
    dueKind: DUE_KINDS.includes(lower(entry.dueKind)) ? lower(entry.dueKind) : "",
    vacantSince: str(entry.vacantSince),
    ...(exit(entry.died) ? { died: exit(entry.died) } : {}),
    ...(exit(entry.removed) ? { removed: exit(entry.removed) } : {}),
    log: (Array.isArray(entry.log) ? entry.log : []).map(str).filter(Boolean).slice(-8),
  };
};

export const normalizeLeaders = (map) => {
  const out = {};
  for (const [polity, entry] of Object.entries(map && typeof map === "object" ? map : {})) {
    const name = str(polity);
    const leader = normalizeLeader(entry);
    if (name && leader) out[name] = leader;
  }
  return out;
};

// ---- seeding ------------------------------------------------------------------------------
//
// A PRIOR, not a fact: the mode is read off the stat sheet's government text
// and the polity's tags with a few keyword families, the term off a small
// table of constitutions, the first due date as now + term (the real
// electoral calendar is unknown here). The model refines all of it through
// leaderOps — an install with the real born year, a schedule with the real
// next election date. Wrong-decade priors get corrected; missing state never does.

export const TERM_YEARS = Object.freeze({
  "united states": 4, "usa": 4, "united states of america": 4,
  "france": 5, "germany": 4, "united kingdom": 5, "britain": 5, "great britain": 5,
  "italy": 5, "spain": 4, "canada": 4, "australia": 3, "japan": 4, "india": 5,
  "brazil": 4, "mexico": 6, "argentina": 4, "russia": 6, "south korea": 5, "philippines": 6,
  "turkey": 5, "indonesia": 5, "nigeria": 4, "south africa": 5, "poland": 4, "ukraine": 5,
  "israel": 4, "egypt": 6, "pakistan": 5, "iran": 4, "chile": 4, "colombia": 4,
});
export const DEFAULT_TERM_YEARS = 5;

const has = (text, re) => re.test(text);
const RE_PAPAL = /pontif|papal|papacy|holy see|saint-si[eè]ge|vatican|conclave/;
const RE_ONE_PARTY = /one-party|single-party|communist|people'?s republic|socialist republic|party-state|politburo/;
const RE_AUTOCRACY = /dictator|junta|military (rule|government|regime)|autocra|totalitarian|despot|tyrann|caudillo|strongman/;
const RE_MONARCHY = /monarch|kingdom|king\b|queen\b|empire|emperor|empress|emirate|sultanate|principality|duchy|khanate|shogun|caliph|tsar|czar|pharaoh|dynast|shah\b|raj\b|maharaja|regency/;
const RE_ELECTION = /republic|democra|parliament|presiden|federal|federation|commonwealth|confederation|elect/;
const RE_THEOCRACY = /theocra|clerical|islamic republic|supreme leader/;

export const inferLeaderMode = (polity, government, tags = []) => {
  const gov = lower(government);
  const tagText = (Array.isArray(tags) ? tags : []).map(lower).join(" ");
  const name = lower(polity);
  if (has(gov, RE_PAPAL) || has(name, RE_PAPAL) || (has(tagText, /theocratic/) && has(`${gov} ${name}`, /vatican|holy see|saint-si|papal|pontif/))) return { mode: "conclave", termYears: 0 };
  if (has(gov, RE_ONE_PARTY) || has(tagText, /one-party|single-party|communist/)) return { mode: "appointment", termYears: 0 };
  // A crown — absolute, constitutional or parliamentary — passes by blood and
  // for life; where the head of GOVERNMENT is elected, the stat sheet's
  // `leader` still names the sovereign in most such sheets, so hereditary.
  if (has(gov, RE_MONARCHY) || has(tagText, /\bmonarchy\b|\bmonarchist\b/)) return { mode: "hereditary", termYears: 0 };
  if (has(gov, RE_AUTOCRACY) || has(tagText, /dictatorship|junta|autocra|totalitarian/)) return { mode: "life", termYears: 0 };
  if (has(gov, RE_THEOCRACY) || has(tagText, /theocratic/)) return { mode: "life", termYears: 0 };
  if (has(gov, RE_ELECTION) || has(tagText, /democra|republic/)) return { mode: "election", termYears: TERM_YEARS[name] ?? DEFAULT_TERM_YEARS };
  if (has(tagText, /authoritarian/)) return { mode: "life", termYears: 0 };
  return { mode: "life", termYears: 0 };
};

export const seedLeaderFromStats = (polity, stats, tags = [], date = "") => {
  const name = str(polity);
  if (!name) return null;
  const sheet = stats && typeof stats === "object" ? stats : {};
  const { mode, termYears } = inferLeaderMode(name, sheet.government, tags);
  const born = finite(sheet.leaderBorn ?? sheet.born, NaN);
  return normalizeLeader({
    name: str(sheet.leader),
    since: date,
    born: Number.isFinite(born) ? born : null,
    termYears,
    mode,
    nextDue: termYears > 0 ? addYears(date, termYears) : "",
    dueKind: termYears > 0 ? (mode === "election" ? "election" : "term-end") : "",
    log: [`${date || "undated"}: seeded as ${mode}${termYears ? ` (${termYears}-year term)` : ""} from "${str(sheet.government) || "no government text"}" — a prior, refine with leaderOps`],
  });
};

// ---- the engine's step --------------------------------------------------------------------
//
// One jump from `date` over `days`. For every polity:
//   • a term (nextDue) that falls inside the window and was not resolved by an
//     install dated after it is DUE — kind "election" for election mode,
//     "term-end" otherwise — and the seat is marked vacantSince = nextDue: the
//     engine does not let a term run past its date;
//   • a leader with a known birth year faces the annual hazard below, rolled
//     once per year of the window with a stream seeded on polity + window, so
//     the same save replayed dies (or lives) identically. A death vacates the
//     seat ("death-risk"), and under conclave mode also queues a "conclave".
// Mortality at age a: 2%/yr at 70, tripling per decade (6% at 80, 16% at 90,
// 0.7% at 60, 0.2% at 50), capped at 50% — a smooth Gompertz-like curve, the
// same for every leader in every era, whether a president or a pope.

export const annualMortality = (age) => {
  const a = finite(age, NaN);
  if (!Number.isFinite(a) || a < 0) return 0;
  return clamp(0.02 * 3 ** ((a - 70) / 10), 0, 0.5);
};

export const stepLeaders = (leaders, { date = "", days = 0 } = {}) => {
  const state = normalizeLeaders(leaders);
  const due = [];
  const from = parseDate(date);
  const span = Math.max(0, finite(days, 0));
  const to = Number.isFinite(from) ? from + span * DAY_MS : NaN;
  const endDate = Number.isFinite(to) ? isoDate(to) : date;
  for (const [polity, leader] of Object.entries(state)) {
    let next = leader;
    // 1. Terms.
    const dueAt = parseDate(next.nextDue);
    if (!next.vacantSince && next.termYears > 0 && Number.isFinite(dueAt) && Number.isFinite(to) && dueAt <= to) {
      const kind = next.mode === "election" ? "election" : "term-end";
      due.push({ polity, kind, date: next.nextDue, reason: `${next.name || "the incumbent"}'s ${next.termYears}-year term (${next.mode}) reaches ${next.nextDue} inside this jump; the seat must be filled by leaderOps install (re-election is an install of the same name)` });
      next = { ...next, vacantSince: next.nextDue, dueKind: kind, log: [...next.log, `${next.nextDue}: term ended — ${kind} due`].slice(-8) };
    }
    // 2. Mortality — every human leader, whatever the mode.
    if (!next.vacantSince && next.name && Number.isFinite(next.born) && Number.isFinite(from) && span > 0) {
      const rand = seededRandom(`${polity}|${date}|${span}`);
      const startYear = new Date(from).getUTCFullYear();
      const years = span / 365.25;
      const whole = Math.floor(years);
      const rest = years - whole;
      let died = "";
      for (let i = 0; i <= whole && !died; i += 1) {
        const share = i < whole ? 1 : rest;
        if (share <= 0) break;
        const age = startYear + i - next.born;
        if (rand() < annualMortality(age) * share) died = addDays(date, Math.min(span, Math.round((i + 0.5 * share) * 365.25)));
      }
      if (died) {
        const age = new Date(parseDate(died)).getUTCFullYear() - next.born;
        due.push({ polity, kind: "death-risk", date: died, reason: `${next.name} (${next.mode}, born ${next.born}) dies aged about ${age} on ${died}; the seat is vacant` });
        next = { ...next, vacantSince: died, dueKind: next.mode === "conclave" ? "conclave" : (next.mode === "election" ? "election" : "term-end"), died: { name: next.name, date: died }, log: [...next.log, `${died}: ${next.name} dies aged about ${age}`].slice(-8) };
        if (leader.mode === "conclave") due.push({ polity, kind: "conclave", date: died, reason: `the see is vacant after ${leader.name}'s death; a conclave must elect a successor (leaderOps install, mode "conclave")` });
      }
    }
    state[polity] = next;
  }
  return { leaders: state, due, asOf: endDate };
};

// ---- the levers -------------------------------------------------------------------------
//
//   {op:"install",  polity, name, mode?, termYears?, born?, since?}   fills or replaces the seat; re-election = same name
//   {op:"remove",   polity, reason}                                   coup, resignation, impeachment, assassination
//   {op:"schedule", polity, nextDue, kind:"election"|"conclave"|"term-end"}   the real calendar, when known

export const applyLeaderOps = (leaders, ops, { date = "" } = {}) => {
  const state = normalizeLeaders(leaders);
  const refusals = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);
    const polity = str(raw.polity);
    if (!polity) { refusals.push(`leaderOps ${op || "?"}: polity is required`); continue; }
    const prev = state[polity] ?? null;
    if (op === "install") {
      const name = str(raw.name);
      if (!name) { refusals.push(`leaderOps install: ${polity} needs a name`); continue; }
      if (raw.mode !== undefined && !LEADER_MODES.includes(lower(raw.mode))) { refusals.push(`leaderOps install: ${polity}: mode "${str(raw.mode)}" is not one of ${LEADER_MODES.join(", ")}`); continue; }
      const mode = raw.mode !== undefined ? lower(raw.mode) : (prev?.mode ?? "life");
      const termYears = raw.termYears !== undefined ? Math.max(0, Math.round(finite(raw.termYears, 0))) : (mode === prev?.mode ? prev.termYears : (mode === "election" ? (TERM_YEARS[lower(polity)] ?? DEFAULT_TERM_YEARS) : 0));
      const born = raw.born !== undefined ? finite(raw.born, NaN) : (prev && lower(prev.name) === lower(name) ? prev.born : NaN);
      if (raw.born !== undefined && Number.isFinite(born) && Number.isFinite(yearOfDate(date)) && yearOfDate(date) - born < 15) { refusals.push(`leaderOps install: ${name} born ${born} would be ${yearOfDate(date) - born} in ${date}`); continue; }
      const since = str(raw.since) || date;
      const nextDue = termYears > 0 ? addYears(since, termYears) : "";
      const same = prev && lower(prev.name) === lower(name);
      state[polity] = normalizeLeader({
        name, since, born: Number.isFinite(born) ? born : null, termYears, mode, nextDue,
        dueKind: termYears > 0 ? (mode === "election" ? "election" : "term-end") : "",
        vacantSince: "",
        log: [...(prev?.log ?? []), `${date || "undated"}: ${name} ${same ? "confirmed" : "installed"} (${mode}${termYears ? `, ${termYears}-year term to ${nextDue}` : ""})${raw.reason ? ` — ${str(raw.reason)}` : ""}`],
      });
    } else if (op === "remove") {
      if (!prev) { refusals.push(`leaderOps remove: ${polity} has no leader on record`); continue; }
      if (prev.vacantSince || !prev.name) { refusals.push(`leaderOps remove: ${polity}'s seat is already vacant${prev.vacantSince ? ` since ${prev.vacantSince}` : ""}`); continue; }
      state[polity] = { ...prev, vacantSince: date, dueKind: prev.mode === "conclave" ? "conclave" : (prev.mode === "election" ? "election" : "term-end"), removed: { name: prev.name, date, reason: str(raw.reason) }, log: [...prev.log, `${date || "undated"}: ${prev.name} removed${raw.reason ? ` — ${str(raw.reason)}` : ""}`].slice(-8) };
    } else if (op === "schedule") {
      if (!prev) { refusals.push(`leaderOps schedule: ${polity} has no leader on record`); continue; }
      const kind = DUE_KINDS.includes(lower(raw.kind)) && lower(raw.kind) !== "death-risk" ? lower(raw.kind) : "";
      const at = parseDate(raw.nextDue);
      if (!kind) { refusals.push(`leaderOps schedule: ${polity}: kind must be election, conclave or term-end`); continue; }
      if (!Number.isFinite(at)) { refusals.push(`leaderOps schedule: ${polity}: nextDue "${str(raw.nextDue)}" is not a date`); continue; }
      const now = parseDate(date);
      if (Number.isFinite(now) && at < now) { refusals.push(`leaderOps schedule: ${polity}: nextDue ${str(raw.nextDue)} is before ${date}`); continue; }
      state[polity] = { ...prev, nextDue: isoDate(at), dueKind: kind, log: [...prev.log, `${date || "undated"}: ${kind} scheduled for ${isoDate(at)}`].slice(-8) };
    } else {
      refusals.push(`leaderOps: unknown op "${op}" (expected install, remove or schedule)`);
    }
  }
  return { leaders: state, refusals };
};

// ---- what the model and the player read --------------------------------------------------
//
// One line per polity that matters NOW: the player's own, every vacant seat,
// and every seat whose due date falls within a year of `date` — the model is
// told in [Leaders] that these MUST be resolved this jump.

const WITHIN_DAYS = 366;

export const describeLeaders = (leaders, { date = "", playerPolity = "" } = {}) => {
  const state = normalizeLeaders(leaders);
  const now = parseDate(date);
  const player = lower(playerPolity);
  const lines = [];
  for (const [polity, l] of Object.entries(state).sort(([a], [b]) => a.localeCompare(b))) {
    const dueAt = parseDate(l.nextDue);
    const soon = Number.isFinite(dueAt) && (!Number.isFinite(now) || dueAt - now <= WITHIN_DAYS * DAY_MS);
    const mine = player && lower(polity) === player;
    if (!mine && !l.vacantSince && !soon) continue;
    const age = Number.isFinite(l.born) && Number.isFinite(yearOfDate(date)) ? `, aged ${yearOfDate(date) - l.born}` : "";
    if (l.vacantSince) {
      lines.push(`${polity} — VACANT since ${l.vacantSince}${l.died ? ` (${l.died.name} died)` : l.removed ? ` (${l.removed.name} removed${l.removed.reason ? `: ${l.removed.reason}` : ""})` : ""} — DUE: ${l.dueKind || "install"} this jump (leaderOps install)`);
      continue;
    }
    const term = l.termYears ? `${l.termYears}-year term, next due ${l.nextDue || "unscheduled"}` : "for life";
    lines.push(`${polity} — ${l.name || "(no name on record — install one)"} (${l.mode}${l.since ? `, since ${l.since}` : ""}${age}; ${term})${soon ? ` — DUE: ${l.dueKind || "election"} by ${l.nextDue}` : ""}${mine ? " [player]" : ""}`);
  }
  return lines.join("\n");
};

export const LEADERS_RULES = `[Leaders — engine state]
Every polity's leader above is a STATE with a tenure mode and, where terms exist, a due date; the engine steps it every jump. A due election, conclave, term-end or vacancy listed in [Leaders] MUST be resolved this jump with impacts.leaderOps — the engine does not let a term run past its date or a dead leader govern: a seat left unresolved stays VACANT and is listed again next jump. Fill or replace a seat with {"op":"install","polity":"<name>","name":"<leader>","mode":"election|hereditary|life|appointment|conclave","termYears":<0 = for life>,"born":<year>}; re-election or confirmation is an install of the same name. A coup, resignation, impeachment or assassination is {"op":"remove","polity":"<name>","reason":"<why>"} followed, now or next jump, by an install. When you know the real calendar — the actual next election date, a planned party congress — set it with {"op":"schedule","polity":"<name>","nextDue":"YYYY-MM-DD","kind":"election|conclave|term-end"}; the dates seeded by the engine are priors, not facts, and refining them is expected. Deaths are the engine's: a leader with a known birth year faces a real annual mortality (about 2% at 70, 6% at 80, 16% at 90) rolled deterministically, and a death listed above has ALREADY happened — narrate it, do not undo it, and give the polity its successor. A dead or elected-out leader must also leave the stat sheet: pair the install with polityChanges.stats.leader.`;
