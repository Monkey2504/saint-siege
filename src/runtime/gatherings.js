/*! Open Historia — gatherings: what a crowd costs, draws and earns © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A body could hold capital and a margin, but the margin was DECLARED: an op
// said "this earns 6%" and the engine believed it. So a federation built to
// gather people and live off what they spend had no way to actually do it, and
// the whole point of the enterprise — the crowds — existed only in prose.
//
// A gathering is therefore state, and its outcome is computed:
//
//   who can come      the reachable pool, bounded — a single gathering draws a
//                     fraction of a continent, never a continent;
//   who does come     that ceiling times the host's standing, because a
//                     discredited host fills fewer seats than a trusted one;
//   what it earns     what each person actually spends, plus the patronage
//                     someone really pledged;
//   what it costs     what was budgeted, and overruns are real;
//   what is left      surplus into the host's purse, loss out of it.
//
// And then the part that matters: the engine computes the return a body's
// gatherings ACTUALLY produced over the last few years, not a figure anyone
// asserted, and carries it beside the body's placement yield. A federation
// that holds nothing shows nothing, however grand its prospectus.
//
// The two are kept apart on purpose. A placement yield is paid on capital every
// period; a crowd's takings are paid once, on the day the tents go up. Folding
// the second into the first — which this module did at first — pays a body
// again every year for a crowd that went home, and the surplus it already
// banked becomes a perpetuity. So `earnedMargin` is reported and `margin` is
// paid, and nothing moves between them.
//
// General by construction. A World Cup, a jubilee, an Olympiad, a trade fair,
// a party congress, a pilgrimage, a coronation: all of them are a crowd, a
// cost, a takings per head and a host who keeps what is left.

import { normalizeTreasuries } from "./treasuries.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pos = (v, d = 0) => Math.max(0, finite(v, d));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const round = (v) => Math.round(v * 100) / 100;
const daysBetween = (a, b) => {
  const da = Date.parse(str(a)); const db = Date.parse(str(b));
  return Number.isFinite(da) && Number.isFinite(db) ? Math.abs(db - da) / 86400000 : Infinity;
};

export const GATHERING_STATUSES = ["planned", "held", "cancelled"];

// No single gathering draws more than this share of the people it can reach.
// World Youth Day at its largest gathered a few million against a billion and
// a half baptised; a World Cup final fills a stadium against a planet. The
// ceiling is what keeps a crowd a crowd rather than a census.
export const MAX_REACH_SHARE = 0.02;

// Three scales, and they are not the same undertaking. A national gathering
// is a diocese or a country's youth coming together — Benin, not Africa — and
// it happens every year without anyone in the centre convoking it. A
// continental one is what a pole stages when it is given the means. A world
// one is the whole federation's, once in several years.
export const GATHERING_SCALES = ["national", "continental", "world"];
// Each share is read against a DIFFERENT pool: a national or continental
// gathering against its own continent, a world one against every baptised
// person alive. So the world share is the smallest of the three, not the
// largest — five per cent of a planet is seventy million people at one event,
// which is not a gathering, it is a migration. World Youth Day at Manila drew
// about five million and at Lisbon about one and a half, against a billion and
// a half baptised: two thousandths is what a world gathering really reaches.
export const REACH_BY_SCALE = Object.freeze({ national: 0.002, continental: 0.02, world: 0.002 });

// What one attendee spends with the host, in subsistence-years: tickets,
// lodging sold through it, food, licensed goods. Lisbon 2023 ran on roughly
// fifty euros a pilgrim, which at a modern anchor is about three hundredths of
// a subsistence-year. The band allows a cheap pilgrimage and a costly final.
export const DEFAULT_SPEND_PER_HEAD = 0.03;
export const MAX_SPEND_PER_HEAD = 0.5;

// And it is not the same money at every scale. A world gathering means flights
// and a week's lodging; a diocesan day means a field, a coach and a sandwich.
// Charging local crowds the price of pilgrims made a year of national events
// across Asia draw three hundred and fifty-nine people, which is not a
// continent, it is a parish.
export const SPEND_PER_HEAD_BY_SCALE = Object.freeze({ national: 0.003, continental: 0.03, world: 0.05 });
export const COST_PER_HEAD_BY_SCALE = Object.freeze({ national: 0.002, continental: 0.02, world: 0.04 });

// What it costs to put one more person on the field: ground, security, water,
// sanitation, transport, stewards. Lisbon spent about what it took per pilgrim,
// which is why these gatherings break even and live off patronage and rights
// rather than off the gate. Without this floor a crowd was free — four million
// could be hosted for the price of three hundred thousand — and the surplus
// was whatever the host felt like declaring.
export const MIN_COST_PER_HEAD = 0.02;

// A margin is the return the last few years of gatherings actually produced.
export const MARGIN_WINDOW_YEARS = 3;

// A great gathering is not only a business: it is a renewal of faith, and the
// register has to feel it. Of those who come, a share go home changed, bring
// someone with them, or return after years away — and the visibility does the
// rest. A fifth is the working figure: World Youth Days are consistently
// credited with a measurable bump in vocations and practice in the host
// region, never with converting the crowd itself.
export const RENEWAL_PER_ATTENDEE = 0.2;
// And no single gathering may move more than this share of a continent's
// faithful, however vast: a crowd renews a region, it does not re-found it.
export const MAX_RENEWAL_SHARE = 0.005;

export const normalizeGathering = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const name = str(entry.name);
  if (!name) return null;
  return {
    id: str(entry.id) || `gathering-${lower(name).replace(/[^a-z0-9]+/g, "-")}`,
    name,
    // The body or polity that runs it and keeps what is left.
    host: str(entry.host),
    place: str(entry.place),
    // Which pool it draws on: a continent for a church's faithful, else the
    // host polity's own people.
    continent: lower(entry.continent),
    date: str(entry.date),
    scale: GATHERING_SCALES.includes(lower(entry.scale)) ? lower(entry.scale) : "continental",
    status: GATHERING_STATUSES.includes(lower(entry.status)) ? lower(entry.status) : "planned",
    cost: pos(entry.cost),
    // What the host expects; the engine will not let it exceed the ceiling.
    expected: pos(entry.expected),
    spendPerHead: clamp(finite(entry.spendPerHead, DEFAULT_SPEND_PER_HEAD), 0, MAX_SPEND_PER_HEAD),
    patronage: pos(entry.patronage),
    // Filled by the engine when it is held.
    attendance: pos(entry.attendance),
    // People the gathering brought back to the faith, or brought in.
    renewed: pos(entry.renewed),
    revenue: pos(entry.revenue),
    surplus: finite(entry.surplus, 0),
    heldAt: str(entry.heldAt),
    note: str(entry.note),
  };
};

export const normalizeGatherings = (list) => (Array.isArray(list) ? list : [])
  .map(normalizeGathering).filter(Boolean).slice(-60);

const find = (list, ref) => {
  const key = lower(ref);
  if (!key) return null;
  return list.find((g) => lower(g.id) === key)
    || list.find((g) => lower(g.name) === key)
    || list.find((g) => lower(g.name).includes(key) || key.includes(lower(g.name)))
    || null;
};

/**
 * How many people this gathering can reach: the faithful of its continent when
 * the world keeps that ledger, otherwise the host polity's population. Zero
 * when the world knows neither, and a gathering that can reach nobody draws
 * nobody.
 */
export const reachablePool = (gathering, { church = null, economies = {} } = {}) => {
  const continent = lower(gathering.continent);
  if (continent && church?.faithful && Number.isFinite(Number(church.faithful[continent]))) {
    return pos(church.faithful[continent]);
  }
  // A world gathering has no continent, because its continent is all of them.
  // Without this it fell through to the host's population — and a federation is
  // not a polity, so it had none, drew nobody and earned nothing. The whole
  // world scale existed in the constants and nowhere else.
  if (gathering.scale === "world" && church?.faithful) {
    return Object.values(church.faithful).reduce((sum, n) => sum + pos(n), 0);
  }
  const economy = economies?.[gathering.host];
  return pos(economy?.population);
};

/**
 * What actually happens when it is held. Attendance is the ceiling times the
 * host's standing; revenue is what the crowd spends plus the patronage really
 * pledged; the surplus is what is left after the cost.
 */
export const outcomeOf = (gathering, { church = null, economies = {}, legitimacy = 50, purse = null, running = null } = {}) => {
  const g = normalizeGathering(gathering);
  const pool = reachablePool(g, { church, economies });
  const ceiling = pool * (REACH_BY_SCALE[g.scale] ?? MAX_REACH_SHARE);
  // A host nobody trusts draws a thinner crowd; one at the height of its
  // standing draws a little more than it planned.
  // A body that has been kept open all year — an office, staff, the ordinary
  // work in its region — fills its ground better than one that appears from
  // nowhere for a week. A body whose running costs went unmet fills it worse.
  const upkeep = running === true ? 0.1 : running === false ? -0.1 : 0;
  const standing = clamp(0.4 + clamp(finite(legitimacy, 50), 0, 100) / 200 + upkeep, 0.3, 1.1);
  // And nobody stages what they cannot pay for. The budget in hand — the
  // declared cost, or the host's purse when that is smaller — sets how many
  // can be hosted at all, before ambition or the ceiling are consulted.
  const perHeadCost = COST_PER_HEAD_BY_SCALE[g.scale] ?? MIN_COST_PER_HEAD;
  const funds = purse == null ? g.cost : Math.min(g.cost, Math.max(0, pos(purse) + g.patronage));
  const affordable = perHeadCost > 0 ? funds / perHeadCost : Infinity;
  const wanted = Math.min(g.expected || ceiling, ceiling, affordable);
  const attendance = Math.round(Math.max(0, wanted) * standing);
  // A bigger crowd costs more, always. But a host that budgeted for a crowd it
  // could not draw does not burn the whole budget either: it loses what it had
  // already committed — the ground, the staff, the announcements — and keeps
  // the rest. Spending every franc regardless is what made a chapter with a
  // large purse and a small continent post a ruinous loss for a decent year.
  const committed = funds * 0.2;
  const cost = Math.min(funds, Math.max(committed, attendance * perHeadCost));
  // What a head spends also follows the scale, unless the host set a figure.
  const perHeadSpend = g.spendPerHead === DEFAULT_SPEND_PER_HEAD ? (SPEND_PER_HEAD_BY_SCALE[g.scale] ?? g.spendPerHead) : g.spendPerHead;
  const revenue = attendance * perHeadSpend + g.patronage;
  // What it does to the faith of its region: a share of the crowd renewed or
  // brought back, bounded so no gathering re-founds a continent.
  const renewed = Math.round(Math.min(attendance * RENEWAL_PER_ATTENDEE, pool * MAX_RENEWAL_SHARE));
  return {
    pool: Math.round(pool),
    ceiling: Math.round(ceiling),
    affordable: Math.round(Math.min(affordable, ceiling)),
    attendance,
    renewed,
    revenue: round(revenue),
    cost: round(cost),
    surplus: round(revenue - cost),
  };
};

// ---- the levers ----------------------------------------------------------------
//
//   {op:"plan",   name, host, place, continent, date, cost, expected, spendPerHead, patronage}
//   {op:"hold",   gathering, costOverrun, patronage, note}
//   {op:"cancel", gathering, reason}

export const applyGatheringOps = (gatherings, ops, { date = "", church = null, economies = {}, treasuries = [] } = {}) => {
  let list = normalizeGatherings(gatherings);
  const purses = new Map((Array.isArray(treasuries) ? treasuries : []).map((t) => [lower(t.body), { ...t }]));
  const refusals = [];
  const rows = [];
  // Faith the gatherings renewed, handed to the church ledger by the caller.
  const faithfulOps = [];

  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);

    if (op === "plan") {
      const planned = normalizeGathering({ ...raw, date: str(raw.date) || date, status: "planned" });
      if (!planned || !planned.host) { refusals.push(`gatheringOps plan refused: a gathering needs a name and a host.`); continue; }
      if (find(list, planned.name)) { refusals.push(`gatheringOps plan refused: "${planned.name}" is already planned.`); continue; }
      list = [...list, planned];
      continue;
    }

    const g = find(list, raw.gathering ?? raw.name ?? raw.id);
    if (!g) { refusals.push(`gatheringOps ${op || "?"} refused: no gathering named "${str(raw.gathering ?? raw.name ?? raw.id)}".`); continue; }
    if (g.status !== "planned") { refusals.push(`gatheringOps ${op} refused: "${g.name}" is already ${g.status}.`); continue; }

    if (op === "cancel") {
      list = list.map((x) => (x === g ? { ...x, status: "cancelled", note: str(raw.reason) || x.note } : x));
      continue;
    }
    if (op !== "hold") { refusals.push(`gatheringOps refused: unknown op "${op}".`); continue; }

    // Held. The engine decides the crowd and the takings; an overrun and any
    // patronage that actually arrived are the only things the story may add.
    const economy = economies?.[g.host] ?? null;
    const withExtras = { ...g, cost: g.cost + pos(raw.costOverrun), patronage: g.patronage + pos(raw.patronage) };
    const purse = purses.get(lower(g.host));
    const legitimacy = finite(economy?.legitimacy, finite(economies?.[str(raw.hostPolity)]?.legitimacy, 50));
    // Was this body kept open? Only meaningful for one that has a standing
    // budget at all; a body with none is judged on its legitimacy alone.
    const running = purse && purse.operatingBudget > 0
      ? Boolean(purse.fundedUntil) && str(purse.fundedUntil) >= str(g.date).slice(0, 4)
      : null;
    // What it can actually spend: its cash, and behind that its capital, which
    // it sells down to stage something it judges worth staging. Field report:
    // Pax Africa was endowed with 30,000 SY of capital for the Lagos summit,
    // could only reach its 966 SY of cash, drew a twentieth of the crowd it
    // should have and lost money. An endowment that cannot fund the thing it
    // was given for is not an endowment.
    const spendable = purse ? pos(purse.treasury) + pos(purse.capital) : finite(economy?.treasury, null);
    const out = outcomeOf(withExtras, { church, economies, legitimacy, running, purse: spendable });
    if (out.attendance <= 0) {
      refusals.push(`gatheringOps hold on "${g.name}": nobody it can reach — the world holds no people for ${g.continent || g.host}, so it draws nobody and earns nothing.`);
    }
    list = list.map((x) => (x === g ? {
      ...x, status: "held", heldAt: date || x.date,
      cost: out.cost, attendance: out.attendance, revenue: out.revenue, surplus: out.surplus, renewed: out.renewed,
      note: str(raw.note) || x.note,
    } : x));

    if (purse) {
      // Cash first, then capital: what it spent beyond its cash was capital
      // sold, and that has to leave the balance sheet rather than be forgiven.
      const cash = finite(purse.treasury, 0) + out.surplus;
      if (cash >= 0) {
        purse.treasury = cash;
      } else {
        purse.treasury = 0;
        purse.capital = Math.max(0, finite(purse.capital, 0) + cash);
      }
      purses.set(lower(g.host), purse);
    } else if (out.surplus !== 0) {
      refusals.push(`gatheringOps hold on "${g.name}": ${g.host} has no purse, so its ${out.surplus > 0 ? "surplus" : "loss"} went nowhere — open one with treasuryOps first.`);
    }
if (out.renewed > 0 && g.continent) {
      faithfulOps.push({ op: "shift", continent: g.continent, delta: out.renewed, note: `Foi ravivée par ${g.name}` });
      rows.push({ date: date || g.date, polity: g.host, kind: "people", what: `foi ravivée par ${g.name}`, amount: out.renewed, unit: "people", source: `gathering:${out.attendance.toLocaleString("en-US")} attending` });
    }
    rows.push({
      date: date || g.date, polity: g.host, kind: "money",
      what: out.surplus >= 0 ? `surplus from ${g.name}` : `loss on ${g.name}`,
      amount: out.surplus, unit: "SY", source: `gathering:${out.attendance.toLocaleString("en-US")} attending`,
    });
  }

  // What the crowds returned, against each host's capital. This is REPORTED,
  // never re-earned: every surplus above went into the purse on the day it was
  // held, so adding it to `margin` — which stepTreasuries pays out on capital
  // each period — would pay a body twice for one crowd, and keep paying it for
  // years after the tents came down. It is set here rather than in the callers
  // so no caller can forget it, and so nobody can quietly make it a yield.
  const marked = [...purses.values()].map((t) => ({
    ...t,
    earnedMargin: realizedMargin(list, t.body, { asOf: date, capital: t.capital }),
  }));

  return { gatherings: list, treasuries: marked, refusals, rows, faithfulOps };
};

/**
 * The return a body's gatherings actually produced over the window, as a share
 * of its capital. This is what a margin IS: what was earned, not what was
 * promised. A body that has held nothing returns 0.
 */
export const realizedMargin = (gatherings, body, { asOf = "", capital = 0, years = MARGIN_WINDOW_YEARS } = {}) => {
  if (!(capital > 0)) return 0;
  const end = Date.parse(str(asOf));
  const held = normalizeGatherings(gatherings).filter((g) => g.status === "held" && lower(g.host) === lower(body));
  const inWindow = held.filter((g) => {
    if (!Number.isFinite(end)) return true;
    const at = Date.parse(g.heldAt || g.date);
    return !Number.isFinite(at) || (end - at) / 86_400_000 <= years * 365.25;
  });
  if (!inWindow.length) return 0;
  const total = inWindow.reduce((s, g) => s + g.surplus, 0);
  return Math.max(0, total / years / capital);
};

// ---- gatherings the player orders --------------------------------------------
//
// A rule telling the model to carry gatheringOps did not make it carry them: a
// turn narrated "Convocation officielle du premier rassemblement de Pax Africa
// à Lagos, budget de 40 000 SY" and moved nothing, exactly as the drives did
// before the engine started reading the orders itself. So it reads them here
// too. What the player wrote is what happens, and the model is left to narrate
// rather than to remember a lever.

const CONVOKES = /\b(convoqu\w*|convocation|rassemblement|rencontre|congr[èe]s|assises|sommet|summit|jubil[ée]|festival|journ[ée]es mondiales|gathering|convene\w*|hold a\b)/i;
const CONTINENT_WORDS = [
  [/\b(afrique|africa|african|lagos|nairobi|kinshasa|abidjan|accra)\b/i, "africa"],
  [/\b(am[ée]rique|america|americas|latino|brésil|bresil|brazil|s[ãa]o paulo|mexico|bogot[áa]|lima|new york)\b/i, "americas"],
  [/\b(asie|asia|asian|manille|manila|philippines|inde|india|s[ée]oul|seoul|tokyo)\b/i, "asia"],
  [/\b(europe|european|lisbonne|lisbon|madrid|paris|rome|cologne|varsovie)\b/i, "europe"],
  [/\b(oc[ée]anie|oceania|sydney|melbourne|auckland)\b/i, "oceania"],
];
// "40 000 SY", "40000 SY", "un budget de 5 000".
const BUDGET = /(\d{1,3}(?:[  .,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:sy\b|subsistence)/i;
// `\b` before an accented preposition is unreliable without the unicode flag,
// so the boundary is stated as "start, or a space" instead — otherwise "à
// Lagos" was never read and every gathering lost its place.
const PLACE = /(?:^|\s)(?:à|a|in|at)\s+([A-ZÀ-Ö][\wÀ-ÖØ-öø-ÿ'’-]{2,24}(?:\s+[A-ZÀ-Ö][\wÀ-ÖØ-öø-ÿ'’-]{2,24})?)/u;
// "en juillet 2028", "in July 2028", "2028-07".
const MONTHS = ["janvier|january", "février|fevrier|february", "mars|march", "avril|april", "mai|may", "juin|june", "juillet|july", "août|aout|august", "septembre|september", "octobre|october", "novembre|november", "décembre|decembre|december"];

const whenFrom = (text, fallback) => {
  const iso = str(text).match(/\b(20\d{2})-(\d{2})(?:-(\d{2}))?\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3] ?? "15"}`;
  for (let i = 0; i < MONTHS.length; i += 1) {
    const m = str(text).match(new RegExp(`\\b(?:${MONTHS[i]})\\s+(20\\d{2})\\b`, "i"));
    if (m) return `${m[1]}-${String(i + 1).padStart(2, "0")}-15`;
  }
  const year = str(text).match(/\b(20\d{2})\b/);
  return year ? `${year[1]}-06-15` : str(fallback);
};

/**
 * The gathering an order convokes, or null. The host is whichever body the
 * world holds that the order names; the continent comes from the host's name
 * or the place; the budget from the figure written, or a fifth of the host's
 * purse when none is.
 */
export const gatheringFromOrder = (order, { date = "", bodies = [], treasuries = [] } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  if (!CONVOKES.test(text)) return null;
  const host = (Array.isArray(bodies) ? bodies : []).find((b) => str(b) && text.toLowerCase().includes(lower(b)));
  if (!host) return null;
  const continent = (CONTINENT_WORDS.find(([re]) => re.test(`${host} ${text}`)) ?? [])[1] ?? "";
  const budget = text.match(BUDGET);
  const purse = (Array.isArray(treasuries) ? treasuries : []).find((t) => lower(t.body) === lower(host));
  const cost = budget
    ? pos(Number(budget[1].replace(/[  .,]/g, "")))
    : Math.round(pos(purse?.treasury) * 0.2);
  const place = (text.match(PLACE) ?? [])[1] ?? "";
  const when = whenFrom(text, date);
  return normalizeGathering({
    id: str(order?.id) ? `gathering-${order.id}` : "",
    name: `${host} — ${place || when}`,
    host, place, continent, date: when, cost,
    // What the host hopes for: left open, so the engine's own ceiling and the
    // budget decide it rather than a number nobody grounded.
    expected: 0,
    status: "planned",
  });
};

/** Gatherings the player's orders convoke and the world does not yet hold. */
export const ensureGatheringsFromOrders = (world, actions, { date = "", bodies = [] } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const list = normalizeGatherings(w.gatherings);
  const added = [];
  // Only orders still queued. Reading resolved ones invented gatherings that
  // had supposedly happened months earlier — a summit of the Conseil pour
  // l'Économie in November 2027, held to an audience of nobody — because an
  // old order mentioned a body and a date that were already in the past.
  for (const order of (Array.isArray(actions) ? actions : []).filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")) {
    const g = gatheringFromOrder(order, { date, bodies, treasuries: w.treasuries });
    if (!g) continue;
    // And never one whose day has already gone: a gathering is convoked for a
    // date to come, not discovered in the past.
    if (date && g.date && g.date < str(date)) continue;
    if (list.some((x) => x.id === g.id || (lower(x.host) === lower(g.host) && x.date === g.date))) continue;
    list.push(g);
    added.push(g);
  }
  return added.length ? { world: { ...w, gatherings: list }, added } : { world, added: [] };
};

/**
 * Holds every planned gathering whose day has come. The engine resolves them
 * on the calendar rather than waiting for a turn to remember: a gathering
 * convoked for July happens in July.
 */
export const holdDueGatherings = (world, { asOf = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const due = normalizeGatherings(w.gatherings).filter((g) => g.status === "planned" && g.date && str(asOf) && g.date <= str(asOf));
  if (!due.length) return { world, rows: [], refusals: [], faithfulOps: [], held: [] };
  const applied = applyGatheringOps(w.gatherings, due.map((g) => ({ op: "hold", gathering: g.id })), {
    date: asOf, church: w.church, economies: w.economies, treasuries: w.treasuries,
  });
  return {
    world: { ...w, gatherings: applied.gatherings, treasuries: applied.treasuries.length ? applied.treasuries : w.treasuries },
    rows: applied.rows,
    refusals: applied.refusals,
    // The faith these crowds renewed, for the caller to hand to the register.
    faithfulOps: applied.faithfulOps ?? [],
    held: due.map((g) => g.name),
  };
};

/**
 * The ordinary year of a chapter that has been kept open: the national
 * gatherings it holds across its own countries without anyone in the centre
 * convoking them, funded out of the running budget its parent paid. One entry
 * per body per period, because the player does not steer these and does not
 * want a list of them — only the figure they produced.
 */
export const runNationalProgramme = (world, { asOf = "", years = 0, organizations = [] } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const span = Math.max(0, finite(years, 0));
  if (!(span > 0) || !str(asOf)) return { world, rows: [], held: [], faithfulOps: [] };

  const purses = normalizeTreasuries(w.treasuries).map((t) => ({ ...t }));
  const gatherings = normalizeGatherings(w.gatherings);
  const rows = [];
  const held = [];
  const faithfulOps = [];

  for (const t of purses) {
    // Only a chapter with a standing budget, money to spend and a continent to
    // gather in. A body nobody funds holds nothing, which is the point.
    if (t.status !== "active" || !(t.operatingBudget > 0) || !(t.treasury > 0)) continue;
    // A chapter is named for its continent, and it is named in whatever
    // language the world is played in. "Pax Europa" is Europe, "Pax America"
    // is the Americas, and a body whose name matched neither silently held
    // nothing for a year: Pax Europa ran no programme at all because the
    // pattern looked for "europe". So the endings are matched, not just one
    // spelling, and anything unmatched is left alone rather than guessed at.
    const continent = (lower(t.body).match(/afric|americ|asia|europ|ocean/) || [])[0];
    const key = { afric: "africa", americ: "americas", asia: "asia", europ: "europe", ocean: "oceania" }[continent];
    if (!key || !w.church?.faithful?.[key]) continue;

    // Once a year, not once a turn, and the year is the calendar year rather
    // than a rolling count of days. On weekly turns this produced a string of
    // near-identical entries — six hundred people here, twenty-six there — all
    // named for the same year, which read as duplicates and told nobody
    // anything. A chapter's ordinary year is one entry, and a chapter that
    // held its 2028 programme holds the next one in 2029, not ten months later
    // in the middle of it.
    const year = str(asOf).slice(0, 4);
    const alreadyThisYear = gatherings.some((x) => x.scale === "national" && x.status === "held"
      && lower(x.host) === lower(t.body) && str(x.heldAt || x.date).slice(0, 4) === year);
    if (alreadyThisYear) continue;

    // What it may spend: the year's budget, or its cash if that is less. On a
    // short turn it still holds its year, because the year is the unit.
    // Its year costs what it has: the budget its parent paid plus whatever it
    // has earned, which is exactly what sits in its purse. A tenth is held back
    // so one bad year cannot leave it with nothing at all.
    // Its year costs what it has, but never more than a full house would cost:
    // Oceania's eleven million faithful cannot absorb the purse of a chapter
    // that has been saving, and money it cannot use stays in the purse.
    const fullHouse = pos(w.church?.faithful?.[key]) * REACH_BY_SCALE.national * COST_PER_HEAD_BY_SCALE.national;
    const spend = Math.min(t.treasury * 0.9, fullHouse);
    if (!(spend > 0)) continue;
    const members = (Array.isArray(organizations) ? organizations : []).find((o) => lower(o?.name) === lower(t.body))?.members ?? [];
    const where = members.length ? members.slice(0, 3).join(", ") : "across the continent";
    const g = normalizeGathering({
      id: `gathering-national-${lower(t.body).replace(/[^a-z0-9]+/g, "-")}-${str(asOf)}`,
      name: `${t.body} — national gatherings, ${str(asOf).slice(0, 4)}`,
      host: t.body, place: where, continent: key, date: asOf, scale: "national",
      cost: spend, expected: 0, status: "planned",
    });
    const out = outcomeOf(g, { church: w.church, economies: w.economies, legitimacy: 50, running: true, purse: t.treasury });
    if (out.attendance <= 0) continue;

    t.treasury = Math.max(0, t.treasury - out.cost + out.revenue);
    gatherings.push({ ...g, status: "held", heldAt: asOf, attendance: out.attendance, renewed: out.renewed, revenue: out.revenue, cost: out.cost, surplus: out.surplus });
    held.push(t.body);
    if (out.renewed > 0) {
      faithfulOps.push({ op: "shift", continent: key, delta: out.renewed, note: `Faith renewed by the national gatherings of ${t.body}` });
      rows.push({ date: asOf, polity: t.body, kind: "people", what: "foi ravivée par ses rassemblements nationaux", amount: out.renewed, unit: "people", source: `national:${out.attendance.toLocaleString("en-US")} attending` });
    }
    rows.push({
      date: asOf, polity: t.body, kind: "money",
      what: out.surplus >= 0 ? "surplus from its national gatherings" : "loss on its national gatherings",
      amount: out.surplus, unit: "SY", source: `national:${out.attendance.toLocaleString("en-US")} attending`,
    });
  }

  if (!held.length) return { world, rows: [], held: [], faithfulOps: [] };
  const all = normalizeGatherings(gatherings);
  // Reported, not re-earned — see applyGatheringOps.
  const marked = purses.map((t) => ({ ...t, earnedMargin: realizedMargin(all, t.body, { asOf, capital: t.capital }) }));
  return { world: { ...w, treasuries: marked, gatherings: all }, rows, held, faithfulOps };
};

// A world gathering is not an annual affair. World Youth Day runs on a two-to-
// three-year cycle, an Olympiad and a World Cup on four: the whole point is that
// it is rare enough to be an event. Three years is the working figure.
export const WORLD_CYCLE_YEARS = 3;

// And it waits until it can stage something worth staging. Field report: the
// federation held its first world gathering the moment the lever existed, on
// the one and a quarter million dollars that happened to be in its purse, and
// drew twenty-nine thousand people — a conference, not a planetary event, and
// it burnt the three-year cycle on it. A tenth of a full house is the floor.
export const MIN_WORLD_SHARE = 0.1;

/**
 * The federation's own undertaking: the planetary gathering it stages out of its
 * campaign fund, once every few years, without being convoked. The continental
 * chapters hold their years (runNationalProgramme); this is the one the whole
 * body holds together, and the reason a federation exists at all.
 *
 * Same shape as the chapters' programme: the root body spends what it has, up
 * to what a full house would cost, and the engine says how many came.
 */
export const runWorldProgramme = (world, { asOf = "", years = 0, organizations = [] } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const span = Math.max(0, finite(years, 0));
  if (!(span > 0) || !str(asOf)) return { world, rows: [], held: [], faithfulOps: [] };

  const purses = normalizeTreasuries(w.treasuries).map((t) => ({ ...t }));
  // The federation itself: the body nothing sits above.
  const federation = purses.find((t) => t.status === "active" && !t.parent && t.reserve > 0 && t.treasury > 0);
  if (!federation) return { world, rows: [], held: [], faithfulOps: [] };

  const faithful = w.church?.faithful ?? {};
  const everyone = Object.values(faithful).reduce((sum, n) => sum + pos(n), 0);
  if (!(everyone > 0)) return { world, rows: [], held: [], faithfulOps: [] };

  const gatherings = normalizeGatherings(w.gatherings);
  const last = gatherings.filter((x) => x.scale === "world" && x.status === "held").at(-1);
  if (last && daysBetween(last.heldAt || last.date, asOf) < WORLD_CYCLE_YEARS * 365.25) {
    return { world, rows: [], held: [], faithfulOps: [] };
  }

  // What it may spend: its campaign fund, and never more than filling every
  // seat it is allowed to reach would cost.
  const fullHouse = everyone * REACH_BY_SCALE.world * COST_PER_HEAD_BY_SCALE.world;
  const spend = Math.min(federation.treasury * 0.9, fullHouse);
  if (!(spend >= fullHouse * MIN_WORLD_SHARE)) return { world, rows: [], held: [], faithfulOps: [] };

  const g = normalizeGathering({
    id: `gathering-world-${lower(federation.body).replace(/[^a-z0-9]+/g, "-")}-${str(asOf)}`,
    name: `${federation.body} — world gathering, ${str(asOf).slice(0, 4)}`,
    host: federation.body, place: "across the world", continent: "", date: asOf, scale: "world",
    cost: spend, expected: 0, status: "planned",
  });
  const out = outcomeOf(g, { church: w.church, economies: w.economies, legitimacy: 50, running: true, purse: federation.treasury });
  if (out.attendance <= 0) return { world, rows: [], held: [], faithfulOps: [] };

  federation.treasury = Math.max(0, federation.treasury - out.cost + out.revenue);
  gatherings.push({ ...g, status: "held", heldAt: asOf, attendance: out.attendance, renewed: out.renewed, revenue: out.revenue, cost: out.cost, surplus: out.surplus });

  const rows = [];
  const faithfulOps = [];
  // A world gathering renews the whole Church, so the renewal is spread across
  // the continents in proportion to where the faithful actually are, rather
  // than landing on one of them.
  if (out.renewed > 0) {
    for (const [continent, count] of Object.entries(faithful)) {
      const delta = out.renewed * (pos(count) / everyone);
      if (delta >= 1) faithfulOps.push({ op: "shift", continent, delta, note: `Foi ravivée par ${g.name}` });
    }
    rows.push({ date: asOf, polity: federation.body, kind: "people", what: `foi ravivée par son rassemblement mondial`, amount: out.renewed, unit: "people", source: `world:${out.attendance.toLocaleString("en-US")} attending` });
  }
  rows.push({
    date: asOf, polity: federation.body, kind: "money",
    what: out.surplus >= 0 ? "surplus from its world gathering" : "loss on its world gathering",
    amount: out.surplus, unit: "SY", source: `world:${out.attendance.toLocaleString("en-US")} attending`,
  });

  return { world: { ...w, treasuries: purses, gatherings: normalizeGatherings(gatherings) }, rows, held: [federation.body], faithfulOps };
};

const fmt = (n) => Math.round(n).toLocaleString("en-US");

export const describeGatherings = (gatherings, { asOf = "", church = null, economies = {} } = {}) => {
  const list = normalizeGatherings(gatherings);
  if (!list.length) return "";
  const lines = ["[Gatherings — engine state]"];
  for (const g of list.slice(-10)) {
    if (g.status === "held") {
      lines.push(`- ${g.name} (${g.place || g.continent || g.host}, ${g.heldAt || g.date}): ${fmt(g.attendance)} attended; took ${fmt(g.revenue)} SY against ${fmt(g.cost)} SY of cost; ${g.surplus >= 0 ? "surplus" : "loss"} ${fmt(Math.abs(g.surplus))} SY to ${g.host}.`);
    } else if (g.status === "planned") {
      const out = outcomeOf(g, { church, economies, legitimacy: 50 });
      lines.push(`- ${g.name} (${g.place || g.continent || g.host}, planned for ${g.date}): budgeted ${fmt(g.cost)} SY, expecting ${fmt(g.expected)}; the pool it can reach is ${fmt(out.pool)}, so at most ${fmt(out.ceiling)} can come, and its budget hosts ${fmt(out.affordable)}.`);
    }
  }
  lines.push("", GATHERINGS_RULES);
  return lines.join("\n");
};

export const GATHERINGS_RULES = [
  "A gathering people travel to — a jubilee, a congress, a final, a fair, a pilgrimage — is state, not scenery: plan it with impacts.gatheringOps {\"op\":\"plan\", name, host, place, continent, date, cost, expected, spendPerHead, patronage}, then hold it with {\"op\":\"hold\", gathering, costOverrun, patronage}.",
  "The crowd is not yours to choose. The engine takes the people the host can actually reach, caps a single gathering at a fraction of them, and thins it by the host's standing — so a discredited host fills fewer seats and no gathering ever draws a continent. Do not write an attendance figure; write the event and let the engine say how many came.",
  "A crowd is never free: hosting one more person costs ground, water, stewards and transport, so the budget in hand decides how many can come before ambition does. A host with a small purse holds a small gathering, however many it can reach.",
  "What it earns is what the crowd spends plus the patronage someone really pledged; what it costs is the budget, and never less than what the crowd costs to host. So these break even on the gate alone — the money is in what each person spends beyond the basics, and in patronage and rights. A federation that wants a return must sell something, not merely assemble people.",
  "What a gathering leaves is paid into the host's purse the day it is held, once. The engine also reports it as the return its crowds produced over the last three years, so a prospectus can be read against real attendance — but that figure is never paid out again as a yield. A federation that holds nothing earns nothing from crowds, whatever its prospectus says, and the engine will keep printing the zero.",
  "The host must already have a purse (treasuryOps) and must be a body or polity the world holds. This is the same for the player's gatherings and anyone else's.",
].join("\n");
