/*! Open Historia — what the world's own state already makes true © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// Field report, in the player's words: "on le met sur internet, il y a plein de
// gens qui n'ont pas accès et qui ne vont pas changer le truc." And, on what the
// game master should be: "avoir un truc où on dit, ça c'est important, je le
// mets dans le dur. Je n'invente pas."
//
// The failure this file exists to end. When the model cannot be reached — quota
// spent, key missing, outage — the turn falls back to
// gameplay.js fallbackJumpSimulation, which prints one sentence
// ("<player> begins implementing <order>, producing immediate administrative and
// political consequences that other powers start to notice") and emits
// impacts: { createdChats: [], polityChanges: [], regionTransfers: [] }.
//
// The diagnosis that matters is NOT that the world stops. It does not: the
// engine steps the treasuries, the faithful, the clergy, the abuse files, the
// college's drift and the gatherings that fall due, on every turn, whatever
// wrote the edition. The failure is that the fallback edition says NOTHING about
// any of it. A purse empties, a congress is held, three electors go into
// schism — and the player reads that foreign ministries are adjusting to the
// balance of power. He concludes the game is broken, and comes to ask. Google's
// free tier is 1,000 requests a day, so this is not the exception: for anyone
// playing an evening, it is the game.
//
// So this module invents nothing. Every rule below reads a figure the engine
// already holds and reports what is ALREADY TRUE about it, with the threshold
// that made it worth reporting written down here in the open. The model, when
// it is reachable, writes the prose; when it is not, these facts are still the
// facts, and the player reads them.

import { normalizeTreasuries } from "./treasuries.js";
import { normalizeGatherings } from "./gatherings.js";
import { normalizeDrives, driveMovement, overduePledges } from "./drives.js";
import { normalizeAssembly, standing } from "./factions.js";
import { frontRows } from "./fronts.js";

const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const str = (v) => String(v ?? "").trim();
const DAY = 86_400_000;

const parseDate = (v) => {
  const t = Date.parse(str(v));
  return Number.isFinite(t) ? t : null;
};

const daysBetween = (from, to) => {
  const a = parseDate(from);
  const b = parseDate(to);
  return a == null || b == null ? null : Math.round((b - a) / DAY);
};

// ── The thresholds, in the open ──────────────────────────────────────────────
//
// Every number a rule fires on is named here rather than buried in a condition,
// so a player who asks "why did this happen?" can be given an answer, and so
// changing the game's temperament is one edit rather than a hunt.

/** A purse is reported once what it holds no longer covers what it has promised. */
export const PURSE_COVER_RATIO = 1;
/** A drive that has taken nothing for this long is reported as stalled. */
export const DRIVE_STALL_DAYS = 120;
/** Electors newly past the schism line are always reported, however few. */
export const SCHISM_REPORT_AT = 1;
/** A front is reported when it has moved this far from where it began. */
export const FRONT_MOVE_POINTS = 5;
/** Unity below this is a fracture the edition leads on. */
export const UNITY_ALARM = 85;

const event = ({ date, title, description, kind = "world", importance = "minor", playerRelated = false }) => ({
  date: str(date),
  description: str(description),
  impacts: { createdChats: [], polityChanges: [], regionTransfers: [] },
  importance,
  kind,
  notable: importance === "major",
  playerRelated,
  title: str(title),
});

// ── The rules ────────────────────────────────────────────────────────────────

/** A purse that no longer covers what it has taken on. */
const emptyingPurse = ({ world, to }) => {
  const purses = normalizeTreasuries(world?.treasuries);
  const short = purses
    .map((p) => ({ p, owed: Math.max(0, finite(p.assumedLiabilities)), held: finite(p.treasury) }))
    .filter(({ owed, held }) => owed > 0 && held < owed * PURSE_COVER_RATIO)
    .sort((a, b) => (a.held - a.owed) - (b.held - b.owed));
  if (!short.length) return null;
  const { p, owed, held } = short[0];
  return event({
    date: to,
    title: `${p.body} cannot cover what it has taken on`,
    description: `${p.body} holds ${Math.round(held)} SY against ${Math.round(owed)} SY of promises it has assumed. The shortfall is ${Math.round(owed - held)} SY. Nothing has defaulted yet; the next call on this purse is what decides that.`,
    importance: "major",
    kind: "economy",
    playerRelated: true,
  });
};

/** Gatherings whose day has come. The engine holds them; nobody said so. */
const gatheringsHeld = ({ world, from, to }) => {
  const due = normalizeGatherings(world?.gatherings).filter((g) => {
    if (g.status !== "planned" || !g.date) return false;
    const at = parseDate(g.date);
    const start = parseDate(from);
    const end = parseDate(to);
    return at != null && end != null && at <= end && (start == null || at > start);
  });
  if (!due.length) return null;
  const first = due[0];
  const rest = due.length - 1;
  return event({
    date: first.date,
    title: `${first.name} is held`,
    description: `${first.name} takes place as convoked${first.host ? `, hosted by ${first.host}` : ""}. The engine settles its attendance, its cost and what it returns to the purse that paid for it${rest > 0 ? `, along with ${rest} other gathering${rest === 1 ? "" : "s"} falling in the same period` : ""}. The figures stand in the register, not in this account of them.`,
    importance: "major",
    kind: "church",
    playerRelated: true,
  });
};

/** Pledges made and not paid, past the grace period the engine already allows. */
const pledgesUnpaid = ({ world, to }) => {
  const late = overduePledges(world?.drives, { asOf: to });
  if (!late.length) return null;
  const total = late.reduce((s, entry) => s + finite(entry.owed), 0);
  const names = late.slice(0, 3).map((entry) => entry.drive.name).filter(Boolean);
  const worst = late[0];
  return event({
    date: to,
    title: `${late.length} pledge${late.length === 1 ? "" : "s"} past due`,
    description: `Money promised and not paid${names.length ? `: ${names.join(", ")}${late.length > names.length ? ", among others" : ""}` : ""}. ${Math.round(total)} in all, the oldest untouched for ${worst.days} days. A pledge is not a receipt, and the register has never counted it as one.`,
    importance: "minor",
    kind: "economy",
    playerRelated: true,
  });
};

/** A campaign that has taken nothing since the last edition. */
const stalledDrive = ({ world, from, to }) => {
  const stalled = normalizeDrives(world?.drives)
    .filter((d) => d.status === "open" && d.target > 0)
    .map((d) => ({ d, moved: finite(driveMovement(d, from).collected) }))
    .filter(({ d, moved }) => moved <= 0 && (daysBetween(d.startedAt, to) ?? 0) >= DRIVE_STALL_DAYS);
  if (!stalled.length) return null;
  const { d } = stalled[0];
  return event({
    date: to,
    title: `${d.name} has taken nothing since the last edition`,
    description: `${d.name} stands at ${Math.round(d.collected)} collected against a target of ${Math.round(d.target)}, with ${Math.round(d.pledged - d.collected)} pledged and unpaid. It moved by nothing this period. Whatever the stories say about it, the register is where money either arrives or does not.`,
    importance: "minor",
    kind: "economy",
    playerRelated: true,
  });
};

/** The college, when it has broken rather than merely disagreed. */
const collegeFracture = ({ world, to }) => {
  const assembly = normalizeAssembly(world?.assembly);
  if (!assembly) return null;
  const where = standing(assembly);
  if (!where) return null;
  const gone = finite(where.schismatic);
  const hard = finite(where.radical);
  if (gone < SCHISM_REPORT_AT && hard === 0) return null;
  return event({
    date: to,
    title: gone >= SCHISM_REPORT_AT
      ? `${gone} elector${gone === 1 ? "" : "s"} out of communion`
      : `${hard} elector${hard === 1 ? "" : "s"} have hardened against the pontificate`,
    description: `Of ${where.seats} who vote, ${where.with} stand with the pontificate, ${where.undecided} are undecided and ${where.against} against. ${hard} have radicalised${gone > 0 ? ` and ${gone} have gone into schism` : ""}. A majority needs ${where.majority}.`,
    importance: gone >= SCHISM_REPORT_AT ? "major" : "minor",
    kind: "church",
    playerRelated: true,
  });
};

/** A front that has moved measurably since the pontificate began. */
const frontMoved = ({ world, player, to }) => {
  const moved = frontRows(world, player)
    .filter((row) => row.value != null && row.delta != null && Math.abs(row.delta) >= FRONT_MOVE_POINTS)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  if (!moved.length) return null;
  const row = moved[0];
  const way = row.good ? "the right way" : "the wrong way";
  return event({
    date: to,
    title: `${row.label}: ${row.direction === "up" ? "up" : "down"} ${Math.abs(Math.round(row.delta))} since the start of the pontificate`,
    description: `${row.label} stands at ${Math.round(row.value)}${row.unit === "share" ? "%" : ""}, against ${Math.round(row.from)}${row.unit === "share" ? "%" : ""} when this pontificate began. That is ${way}. This is the engine's own count, not an account of it.`,
    importance: row.good === false ? "major" : "minor",
    kind: "church",
    playerRelated: true,
  });
};

const RULES = [emptyingPurse, gatheringsHeld, collegeFracture, pledgesUnpaid, stalledDrive, frontMoved];

/**
 * Everything the world's own state already makes true and nobody has said.
 *
 * Ordered by weight, capped, and never invented: each entry is one figure the
 * engine holds, reported past a threshold written down above. Safe to call
 * whether or not the model answered — it reads state and mutates nothing.
 */
export const consequencesOf = (world, game, { player = "", from = "", to = "", limit = 4 } = {}) => {
  const ctx = { world, game, player: player || game?.country || "", from, to: to || game?.gameDate || "" };
  const out = [];
  for (const rule of RULES) {
    if (out.length >= limit) break;
    let entry = null;
    // A rule that throws must never take the turn down with it: the whole point
    // of this file is to be the thing that still works when nothing else does.
    try { entry = rule(ctx); } catch { entry = null; }
    if (entry && entry.title) out.push(entry);
  }
  return out;
};

// ── Money that arrives without being asked for ───────────────────────────────
//
// The other half of "je n'invente pas". The player kept having to ask me to
// invent a donor, because the engine never produces one: every inflow beyond the
// standing `transfers` came from the model, so a world without the model is a
// world where nothing can ever arrive.
//
// The rule instead. A Church of this size is left legacies continuously — the
// same donors as the standing flow, some of whom die — and how much arrives
// depends on whether the pontificate is trusted. So: a fraction of the standing
// donation flow, scaled by legitimacy against its baseline. It is small on
// purpose. It is not a way out of a deficit; it is the reason a pope who holds
// his standing is not left with only bad options.

/** Legacies run at this share of the standing donation flow, per year. */
export const BEQUEST_SHARE = 0.08;
/** The standing against which legacies are neither swollen nor starved. */
export const LEGITIMACY_BASELINE = 50;
/** However well or badly a pontificate stands, legacies move within this band. */
export const BEQUEST_BAND = Object.freeze({ min: 0.25, max: 2 });

/**
 * What arrives unasked over `years`, in SY. Reads the economy, decides nothing
 * else — the caller books it.
 */
export const bequestFor = (economy, { years = 0 } = {}) => {
  const span = Math.max(0, finite(years));
  const standingFlow = Math.max(0, finite(economy?.transfers));
  if (span <= 0 || standingFlow <= 0) return 0;
  const trust = finite(economy?.legitimacy, LEGITIMACY_BASELINE) / LEGITIMACY_BASELINE;
  const scale = Math.min(BEQUEST_BAND.max, Math.max(BEQUEST_BAND.min, trust));
  return standingFlow * BEQUEST_SHARE * scale * span;
};

/**
 * The legacy as an event, so the money that arrives is also money the player is
 * told about. Returns null when nothing arrived worth a line.
 */
export const bequestEvent = ({ amount, player, date, economy }) => {
  const sy = finite(amount);
  if (sy <= 0) return null;
  const trust = finite(economy?.legitimacy, LEGITIMACY_BASELINE);
  return event({
    date,
    title: "Legacies and unsolicited gifts",
    description: `${Math.round(sy)} SY reaches ${player} from legacies and gifts nobody solicited — wills settled, parishes remitting more than they owed, donors who gave without being asked. The flow follows the standing of the pontificate, which is ${Math.round(trust)}/100: it swells when the Church is trusted and dries when it is not.`,
    importance: "minor",
    kind: "economy",
    playerRelated: true,
  });
};
