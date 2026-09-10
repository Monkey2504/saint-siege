/*! Open Historia — the six fronts a pontificate is judged on © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// Field report, in the player's words: "c'est trop finance parce que moi je
// suis financier. Il y a des gens qui ne vont jamais faire un seul truc de
// finances, et tout leur retour ne sera que finance."
//
// He is right, and the code says by how much. The register tracks twelve
// figures; ten of them are money, one is the faithful, one is legitimacy. So
// whatever a player does — fight abuse, ordain, make peace, hand power to a
// synod — the only thing that visibly moves is the treasury. A player who
// spends a pontificate on vocations reads a page that says nothing about
// vocations, concludes the game did not register the reform, and asks someone
// to check the code. That someone was me. His friend will not have me.
//
// The rule was already written — churchFaithful.js FAITHFUL_RULES tells the
// model that "a pope faces six fronts at once, and every edition must show more
// than one of them" — and it was written in a PROMPT. Which is this project's
// oldest lesson, learned six times: a rule that asks the model to carry a lever
// does not make the model carry it. The engine has to hold the figure.
//
// So: six fronts, six measured quantities, all of them read from state the
// engine already moves or moves here. Four were already tracked and never
// surfaced; two (vocations, safeguarding) had no state at all and get it below,
// seeded from the real figures and stepped at the real rates, the way
// churchFaithful.js already does for the baptised.

import { economyIndicators } from "./economy.js";
import { totalFaithful } from "./churchFaithful.js";
import { normalizeAssembly, standing } from "./factions.js";

// Absent stays absent. Number(null) is 0 and Number("") is 0, both of which
// pass isFinite, so the obvious one-liner turns "this scenario has no college"
// into "unity: 0%" — a front nobody is measuring, printed as a front lost. It
// shipped that way to the screen and was caught there, twice in one file.
const num = (v) => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const finite = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const pos = (v) => Math.max(0, finite(v));
const str = (v) => String(v ?? "").trim();
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const CONTINENTS = ["africa", "americas", "asia", "europe", "oceania"];

// ── Vocations ────────────────────────────────────────────────────────────────
//
// Diocesan and religious priests, by continent, at the last count published in
// the Annuario Pontificio (2022), and the annual rate each continent is
// actually moving at. Europe and the Americas fall, Africa and Asia rise, and
// the world total drifts slightly down — which is the crisis the front names.
// A player who does nothing watches Europe empty; a player who works at it can
// bend a rate, and will see the bend.

export const PRIESTS_2022 = Object.freeze({
  africa: 53_734,
  americas: 119_724,
  asia: 68_265,
  europe: 161_596,
  oceania: 4_411,
});

// Compound annual change, from the same source's own decade.
export const PRIESTS_TREND = Object.freeze({
  africa: 0.021,
  americas: -0.004,
  asia: 0.013,
  europe: -0.014,
  oceania: -0.005,
});

// Major seminarians — the men actually in formation. This is the leading
// indicator: it turns years before the priest count does, which is why it is
// worth its own line rather than being folded into the priests.
export const SEMINARIANS_2022 = Object.freeze({
  africa: 34_541,
  americas: 27_665,
  asia: 30_924,
  europe: 14_461,
  oceania: 890,
});

export const SEMINARIANS_TREND = Object.freeze({
  africa: 0.008,
  americas: -0.021,
  asia: -0.011,
  europe: -0.032,
  oceania: -0.014,
});

const normalizeByContinent = (entry, base) => {
  const e = entry && typeof entry === "object" ? entry : {};
  const out = {};
  for (const c of CONTINENTS) out[c] = pos(num(e[c]) ?? base[c]);
  return out;
};

export const totalOf = (byContinent) => CONTINENTS.reduce((s, c) => s + finite(byContinent?.[c]), 0);

// ── Safeguarding ─────────────────────────────────────────────────────────────
//
// The front that has no natural figure, and therefore the one most likely to
// stay unmeasured for ever. What can be counted honestly is the state of the
// files: how many are open, how many have been judged, and how many bishops
// have actually been sanctioned. A pope who announces zero tolerance and judges
// nothing moves the announcement and not the figure — which is the whole point
// of counting it.
//
// The opening state is a backlog, not a clean sheet: a new pontificate inherits
// one. New cases arrive every year whatever the pope does; what he governs is
// how fast they are judged and whether anyone above the accused answers for it.

export const CASES_PER_YEAR = 600;
// A curia that is not pushed judges roughly what it has always judged.
export const BASELINE_JUDGED_SHARE = 0.55;

const normalizeSafeguarding = (entry) => {
  const e = entry && typeof entry === "object" ? entry : {};
  return {
    open: pos(num(e.open) ?? 1_400),
    judged: pos(num(e.judged) ?? 0),
    sanctioned: pos(num(e.sanctioned) ?? 0),
    // How hard the pontificate pushes: 1 is the inherited pace, above 1 is a
    // curia told to clear the backlog. Orders move it; nothing else does.
    //
    // `num() ?? 1`, not `finite(v, 1)`: Number(null) is 0 and passes isFinite,
    // so the fallback never fired and every fresh game opened with a curia
    // judging at a fifth of its inherited pace.
    pace: clamp(num(e.pace) ?? 1, 0.2, 3),
  };
};

export const normalizeChurchBody = (entry) => {
  const e = entry && typeof entry === "object" ? entry : {};
  return {
    priests: normalizeByContinent(e.priests, PRIESTS_2022),
    seminarians: normalizeByContinent(e.seminarians, SEMINARIANS_2022),
    safeguarding: normalizeSafeguarding(e.safeguarding),
    // A per-continent multiplier a reform can bend. 1 is the real trend.
    formation: normalizeByContinent(e.formation, Object.fromEntries(CONTINENTS.map((c) => [c, 1]))),
    asOf: str(e.asOf),
  };
};

/**
 * One turn of the body of the Church: the clergy ages at its real rate, bent by
 * whatever the pontificate has actually done to formation, and the files move
 * at whatever pace the curia has been set.
 */
export const stepChurchBody = (body, { years = 0, date = "" } = {}) => {
  const b = normalizeChurchBody(body);
  const span = Math.max(0, finite(years));
  if (span <= 0) return { ...b, asOf: str(date) || b.asOf };

  const priests = {};
  const seminarians = {};
  for (const c of CONTINENTS) {
    // Formation bends the seminarians first and the priests only through them:
    // a vocations drive cannot conjure a priest, it fills a seminary, and the
    // seminary answers years later. That lag is the front's real shape.
    const bend = clamp(finite(b.formation[c], 1), 0.2, 3);
    const sTrend = finite(SEMINARIANS_TREND[c]) + (bend - 1) * 0.04;
    const pTrend = finite(PRIESTS_TREND[c]) + (bend - 1) * 0.012;
    seminarians[c] = pos(b.seminarians[c] * (1 + sTrend) ** span);
    priests[c] = pos(b.priests[c] * (1 + pTrend) ** span);
  }

  const arriving = CASES_PER_YEAR * span;
  const capacity = CASES_PER_YEAR * BASELINE_JUDGED_SHARE * b.safeguarding.pace * span;
  const judged = Math.min(b.safeguarding.open + arriving, capacity);
  return {
    ...b,
    priests,
    seminarians,
    safeguarding: {
      ...b.safeguarding,
      open: pos(b.safeguarding.open + arriving - judged),
      judged: pos(b.safeguarding.judged + judged),
    },
    asOf: str(date) || b.asOf,
  };
};

// ── What the player's own orders do to the body ──────────────────────────────
//
// The lesson this project has learned six times: a rule that asks the model to
// carry a lever does not make the model carry it. So the engine reads the
// orders itself, exactly as liabilities.js and drives.js do, and a reform that
// names a front moves that front's figure whatever the edition says about it.
//
// Deliberately narrow. These match an order that says what it does — open
// seminaries, put judges on the files, hand a decision to a synod — and ignore
// an order that merely mentions the subject, because a pope who writes "the
// vocations crisis is grave" has not opened a seminary.

const FORMATION = /\b(s[ée]minaire|seminar(y|ies|ians)|vocation|ordination|ordain|formation|noviciat|novitiate)\b/i;
const OPENS = /\b(ouvr|open|fond|found|cr[ée]|create|financ|fund|dot|endow|relanc|revive|multipli|expand|augment|increase)\w*/i;
const CLOSES = /\b(ferm|clos|supprim|suppress|r[ée]duis|reduce|cut|fusionn|merge)\w*/i;

const FILES = /\b(abus|abuse|safeguard|victim|CDF|doctrine de la foi|tribunal|canonical trial|proc[èe]s canonique|z[ée]ro tol[ée]rance|zero tolerance)\b/i;
const PUSH = /\b(juge|judge|instrui|try|sanction|d[ée]mets|remove|acc[ée]l[ée]r|accelerat|prioritis|prioriz|renforc|strengthen|double|triple)\w*/i;

const CONTINENT_WORDS = Object.freeze({
  africa: /\bafric/i,
  americas: /\bam[ée]ric|\blatin america|\bunited states|\b[ée]tats-unis/i,
  asia: /\basia|\basie/i,
  europe: /\beurop/i,
  oceania: /\bocean/i,
});

const bodyOf = (order) => `${str(order?.title)} ${str(order?.text)}`;

/** How far one order bends a front. Bounded, so no single order settles a front. */
export const MAX_FORMATION_BEND = 0.6;
export const MAX_PACE_STEP = 0.5;

/**
 * The moves a player's planned orders make on the body of the Church.
 * Returns { formation: {continent: delta}, pace: delta, notes: [] }.
 */
export const bodyMovesFromOrders = (orders) => {
  const moves = { formation: {}, pace: 0, notes: [] };
  for (const order of Array.isArray(orders) ? orders : []) {
    if (!order || typeof order !== "object") continue;
    if (order.kind === "chat") continue;
    if ((order.status ?? "planned") !== "planned") continue;
    const text = bodyOf(order);

    if (FORMATION.test(text) && (OPENS.test(text) || CLOSES.test(text))) {
      const bend = (OPENS.test(text) ? 1 : -1) * MAX_FORMATION_BEND;
      // Named continents take the whole bend; an order with no place named is
      // a universal instruction and spreads across all five.
      const named = CONTINENTS.filter((c) => CONTINENT_WORDS[c].test(text));
      const targets = named.length ? named : CONTINENTS;
      const share = named.length ? bend : bend / 2;
      for (const c of targets) moves.formation[c] = finite(moves.formation[c]) + share;
      moves.notes.push(`${OPENS.test(text) ? "Formation opened" : "Formation cut"}: ${targets.join(", ")}`);
    }

    if (FILES.test(text) && PUSH.test(text)) {
      moves.pace += MAX_PACE_STEP;
      moves.notes.push("The files are pushed: the curia judges faster.");
    }
  }
  return moves;
};

/** Apply those moves to the body, bounded so a front cannot be settled in one turn. */
export const applyBodyMoves = (body, moves) => {
  const b = normalizeChurchBody(body);
  if (!moves) return b;
  const formation = { ...b.formation };
  for (const c of CONTINENTS) {
    formation[c] = clamp(finite(formation[c], 1) + finite(moves.formation?.[c]), 0.2, 3);
  }
  return {
    ...b,
    formation,
    safeguarding: { ...b.safeguarding, pace: clamp(b.safeguarding.pace + finite(moves.pace), 0.2, 3) },
  };
};

/**
 * The whole of a turn for the body: read the orders, apply what they do, then
 * step. One call, so a caller cannot step and forget to read the orders — which
 * is precisely how driftFromBlunders spent months as dead code.
 */
export const ensureBodyFromOrders = (world, orders, { years = 0, date = "" } = {}) => {
  const moves = bodyMovesFromOrders(orders);
  const moved = applyBodyMoves(world?.churchBody, moves);
  return { churchBody: stepChurchBody(moved, { years, date }), notes: moves.notes };
};

// ── The six fronts ───────────────────────────────────────────────────────────

export const FRONTS = Object.freeze([
  { key: "unity", label: "Unité de l'Église", unit: "share" },
  { key: "safeguarding", label: "Abus : dossiers jugés", unit: "share" },
  { key: "governance", label: "Synodalité et gouvernement", unit: "share" },
  { key: "vocations", label: "Vocations", unit: "count" },
  { key: "peace", label: "Diplomatie et paix", unit: "count" },
  { key: "finances", label: "Finances", unit: "money" },
]);

/**
 * Where each front stands, read from the engine's own state. A null means the
 * scenario does not hold that front — never a zero, which would print as a
 * front lost rather than a front absent.
 */
export const frontFigures = (world, player) => {
  const economy = player ? world?.economies?.[player] : null;
  const i = economy ? economyIndicators(economy) : null;
  const assembly = normalizeAssembly(world?.assembly);
  const where = assembly ? standing(assembly) : null;
  const body = world?.churchBody ? normalizeChurchBody(world.churchBody) : null;

  // Unity is NOT how many follow the pope. A body can be whole and disagree
  // with him, and a pope with a devoted half of a split college has broken the
  // Church, not united it. What this front measures is the fracture: the share
  // of the body that has radicalised or gone into schism, subtracted from
  // whole. A pope who loses an argument keeps his unity; a pope who drives a
  // quarter of the college out of communion does not.
  const unity = where && where.seats
    ? clamp(100 - ((where.radical + where.schismatic) / where.seats) * 100, 0, 100)
    : null;

  // Of every file this pontificate has faced, the share it has answered.
  const files = body ? body.safeguarding.open + body.safeguarding.judged : 0;
  const safeguarding = body && files > 0 ? (body.safeguarding.judged / files) * 100 : null;

  // Governance: of the decisions taken, the share that went through a body that
  // actually voted rather than a decree. Read from the record the engine keeps,
  // so a pope who says "synodal" and decrees everything reads as what he did.
  const record = Array.isArray(world?.record) ? world.record : [];
  const decisions = record.filter((r) => r && (r.kind === "resolution" || r.kind === "decree"));
  const governance = decisions.length
    ? (decisions.filter((r) => r.kind === "resolution").length / decisions.length) * 100
    : null;

  // Peace: how many powers still hold a hostile standing intent against this
  // polity. A count, falling is good — the engine already tracks the intents.
  const intents = Array.isArray(world?.intents) ? world.intents : [];
  const hostile = intents.filter((intent) => {
    const target = str(intent?.target).toLowerCase();
    const owner = str(intent?.owner).toLowerCase();
    const kind = str(intent?.kind ?? intent?.type).toLowerCase();
    return target === str(player).toLowerCase()
      && owner !== str(player).toLowerCase()
      && /hostil|pressure|undermine|oppose|block|discredit/.test(kind);
  }).length;

  return {
    unity,
    safeguarding,
    governance,
    vocations: body ? totalOf(body.seminarians) : null,
    priests: body ? totalOf(body.priests) : null,
    peace: intents.length ? hostile : null,
    faithful: world?.church?.faithful ? num(totalFaithful(world.church.faithful)) : null,
    finances: i ? i.balance : null,
    treasury: i ? i.treasury : null,
    legitimacy: economy ? num(economy.legitimacy) : null,
  };
};

// Which way is good. Two of the six improve by falling: an open-file count and
// a count of powers working against you.
const IMPROVES_WHEN_FALLING = new Set(["peace"]);

/**
 * Every front with its movement since the pontificate began — the same contract
 * as the register's rows, so a page can print both from one shape.
 */
export const frontRows = (world, player) => {
  const now = frontFigures(world, player);
  const base = world?.registerBaseline?.fronts ?? null;
  return FRONTS.map(({ key, label, unit }) => {
    const value = num(now[key]);
    const from = base ? num(base[key]) : null;
    const delta = value != null && from != null ? value - from : null;
    const eps = Math.abs(from ?? 0) * 0.002;
    const direction = delta == null || Math.abs(delta) <= eps ? "flat" : delta > 0 ? "up" : "down";
    const good = direction === "flat" ? null : IMPROVES_WHEN_FALLING.has(key) ? direction === "down" : direction === "up";
    return { key, label, unit, value, from, delta, direction, good };
  });
};
