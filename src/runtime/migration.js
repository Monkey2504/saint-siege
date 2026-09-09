/*! Open Historia — migration: who leaves, who arrives, and what it costs both sides © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Why this exists.
//
// Migration was narration. The model could write "a wave of refugees reached
// Germany" and nothing underneath changed: not one person left Syria, not one
// arrived in Berlin, no budget felt it, no election turned on it. In a game
// whose modern scenarios are dominated by exactly this — the Mediterranean,
// the southern US border, Ukraine 2022, the Gulf's imported workforce, Japan's
// closed door and the demography behind it — that is a hole where a force
// should be.
//
// So migration is COMPUTED here, from state the engine already holds, the same
// way the economy and the faithful are: a pressure model over every ordered
// pair of polities, a policy lever every polity has, real consequences on both
// sides, and a typed op for the movements an EVENT causes that the pressure
// model would not produce on its own.
//
// The shape of the model is the standard one in the economics of migration: a
// gravity/discrete-choice structure. A sender has a PROPENSITY to emigrate
// (how many leave, as a share of its own people per year), and the leavers are
// split among destinations by their relative ATTRACTIVENESS. That structure is
// what keeps the arithmetic honest: a poor country next to twenty rich ones
// does not lose twenty times as many people as one next to a single rich
// neighbour — it loses the same people, differently distributed — and what
// leaves is exactly what arrives.
//
// Every coefficient below is anchored to a measured figure, stated in the
// comment beside it. Pure: no store reads, no React, no clock, no randomness.

import { outputPerCapita } from "./economy.js";
import { POPULATION_SHIFT_CAP, applyEconomyChange } from "./economyBridge.js";
import { activeWarsOf } from "./wars.js";

// ---- the policy lever ------------------------------------------------------------
//
// Every polity has one, in every era: a city that grants the freedom of the
// city to incomers, an empire that settles veterans where it likes, a state
// that builds a wall, a bloc with free movement inside it.
//
//   open     doors held open — a labour programme, free movement, an asylum
//            policy that says yes (Germany 2015, the Gulf's kafala intake,
//            Schengen's internal border)
//   managed  the ordinary modern default: selection, quotas, work permits
//   closed   exit or entry is policed (the Berlin Wall, Tokugawa sakoku,
//            Japan's postwar door, a militarised border)
export const MIGRATION_POLICIES = ["open", "managed", "closed"];
export const DEFAULT_MIGRATION_POLICY = "managed";

// What an event says a movement was FOR. Narrative, but typed, so the prompt
// and the log can say why without the model inventing a vocabulary each turn.
export const MIGRATION_CAUSES = ["war", "famine", "work", "persecution", "policy", "climate"];

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };

// ---- how many leave --------------------------------------------------------------
//
// PEACETIME_DRIFT — the flow that happens with no wage gap at all: students,
// spouses, retirees, transfers, people who simply go. The world's migrant
// stock is ~3.6% of humanity (UN DESA 2020: 281 M of 7.8 B), accumulated over
// a working lifetime, which is a gross flow of order a tenth of a percent a
// year. 0.15%/yr.
const PEACETIME_DRIFT = 0.0015;

// WAGE_ELASTICITY — per unit of LOG wage gap to the best destination reachable.
// Wages are the strongest measured driver of voluntary migration (Clemens'
// "place premium"). Calibrated on the largest modern corridor: Mexico's output
// per head runs ~15 SY against the United States' ~39 (a log gap of 0.96), and
// Mexican gross emigration at its 1995-2007 peak ran ~0.5% of the population a
// year (~500 k on ~100 M). 0.0015 + 0.0025 × 0.96 ≈ 0.39%/yr, and the same
// coefficient puts an ordinary rich-to-rich corridor (log gap ~0.15) at
// ~0.19%/yr, which is the observed OECD-to-OECD order of magnitude.
const WAGE_ELASTICITY = 0.0025;

// MOBILITY_INCOME_SY — the mobility transition (Zelinsky; Clemens 2014): the
// very poorest emigrate LESS than the middle-income, because leaving costs
// money — a passage, a smuggler, a year without earnings. Emigration rates peak
// around $5,000-10,000 GDP per head PPP; at ~$1,250 per subsistence-year that
// is about 6 SY. Below it the economic term is scaled down proportionally, so
// the model reproduces the hump (rates rise with development, then fall as the
// gap that drove them closes) instead of a straight "poorest move most".
// Deliberately NOT applied to the war/collapse push: people flee on foot.
const MOBILITY_INCOME_SY = 6;

// WAR_PUSH_PER_YEAR — at full intensity. Syria 2012-2016: ~5 M refugees out of
// a pre-war ~21 M in four years ≈ 6% of the population a year. Ukraine 2022 ran
// higher for a few months (~8 M crossings out of 41 M) but a third returned
// within the year; 6%/yr at intensity 1 is the sustained figure of the two.
const WAR_PUSH_PER_YEAR = 0.06;

// A state whose legitimacy has collapsed pushes people out without a war:
// repression, expropriation, a currency that no longer buys food. Venezuela
// 2015-2019: ~4.6 M out of ~30 M in four years ≈ 3.8%/yr, with no war fought.
// At legitimacy 15 this yields 0.05 × (40-15)/40 ≈ 3.1%/yr, the same order.
const COLLAPSE_LEGITIMACY = 40;
const COLLAPSE_PUSH_PER_YEAR = 0.05;

// Nothing moves more than this in a year. Ukraine 2022 is the ceiling of the
// observed record: ~15% of the population abroad at the peak of the first year.
export const MAX_EMIGRATION_PER_YEAR = 0.15;
// And nothing moves more than this across ONE jump, in or out, whatever the
// jump's length — just under the ±20% the population lever itself allows
// (economyBridge POPULATION_SHIFT_CAP), so a computed flow is never silently
// clipped by the gate that applies it.
export const MAX_JUMP_SHARE = 0.18;

// ---- where they go ---------------------------------------------------------------

// A sender under a war or a collapse sends people to whoever is NEXT DOOR, not
// only to whoever is richer: Syria's refugees went to Turkey (richer) but also
// to Lebanon and Jordan (comparable or poorer), and proximity beat wages.
// A floor on the attraction term, applied only while a push is running, so
// ordinary economic migration stays strictly poor→rich.
const REFUGE_FLOOR = 0.3;

// Most migration is regional: the UN's own count has the majority of
// international migrants from Africa, Asia and Europe living within their own
// region. Doubling the weight of a same-continent destination reproduces that
// where the world state knows a polity's continent, and is simply skipped
// where it does not (see `polities` in migrationPressure) — the engine does
// not fake a distance it cannot compute.
const SAME_CONTINENT_MULTIPLIER = 2;

// What the receiver's policy does to its share of the flow. "closed" at 0.25:
// Japan's net migration has run ~0.1-0.15% of population a year against an
// OECD norm of 0.3-0.6% at comparable wages — roughly a quarter. "open" at
// 1.4: an open-door year (Germany and Sweden 2015, at ~1.4% and ~1.7% of
// population against their ordinary ~0.5%) is about half again the managed
// rate before the pressure itself is counted.
const ENTRY_BY_POLICY = { open: 1.4, managed: 1, closed: 0.25 };

// And what the SENDER's policy does: "closed" is an exit ban. The GDR lost
// ~2.7 M of 18 M between 1949 and 1961 (~1.2%/yr, 1.8% in 1953); after the
// Wall, a few thousand a year — a cut of about ninety percent.
const EXIT_BY_POLICY = { open: 1, managed: 1, closed: 0.1 };

// ---- what it costs both sides -----------------------------------------------------

// The sender: emigrants are younger and better schooled than those who stay,
// so a sustained outflow is a real drag on what the country knows how to do —
// Jamaica, Guyana and Haiti have lost 70-85% of their tertiary-educated to
// emigration, and the Balkans and the Baltics lost a fifth of their working-age
// population in two decades. Charged on GROSS outflow (the people who left, not
// the net balance): losing 1% of the population costs 0.15 points of
// technology, so a decade at that rate costs 1.5 points — the register the
// economy's own rules use, where a reform is worth 3-10.
const BRAIN_DRAIN_TECHNOLOGY_POINTS = 15;
const MAX_TECHNOLOGY_LOSS = 10;

// The receiver: a fast inflow strains consent. Not the stock — the RATE. An
// ordinary OECD intake (0.3-0.6%/yr) passes unnoticed, so only the excess over
// 0.5%/yr is charged. Germany 2015 took ~1.1 M asylum seekers on 81 M (1.4% in
// one year); the excess of 0.9 points × 400 = 3.6 points of legitimacy, which
// is the order of a real but survivable political shock (the AfD went from
// 4.7% in 2013 to 12.6% in 2017 — a party into parliament, not a state
// overthrown). A state that selected and prepared for its intake pays less of
// it; one that simply opened the door pays all of it.
const ABSORPTION_TOLERANCE_PER_YEAR = 0.005;
const LEGITIMACY_POINTS_PER_EXCESS = 400;
const STRAIN_BY_POLICY = { open: 1, managed: 0.6, closed: 0.3 };
const MAX_LEGITIMACY_LOSS = 20;

// Below this a corridor is rounding, not a migration: it is dropped rather
// than reported as a movement of eleven people.
const MIN_FLOW_PEOPLE = 1000;

// One migrationOp never moves more than this share of the sender's people —
// the same discipline the faithful ledger uses, and inside the population
// lever's own ±20%.
export const MIGRATION_OP_CAP = 0.15;

// ---- state ------------------------------------------------------------------------
//
// What the last jump actually moved, kept for the prompt (so the model narrates
// the engine's corridors instead of inventing its own) and for the player.

export const MIGRATION_DEFAULTS = Object.freeze({ asOf: "", flows: [], log: [] });

export const migrationPolicyOf = (economy) => {
  const value = lower(economy?.migrationPolicy);
  return MIGRATION_POLICIES.includes(value) ? value : DEFAULT_MIGRATION_POLICY;
};

const normalizeFlow = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const from = str(entry.from);
  const to = str(entry.to);
  const people = Math.round(Math.max(0, finite(entry.people, 0)));
  if (!from || !to || from === to || people <= 0) return null;
  return {
    from,
    to,
    people,
    cause: MIGRATION_CAUSES.includes(lower(entry.cause)) ? lower(entry.cause) : "work",
    note: str(entry.note),
  };
};

export const normalizeMigration = (entry) => {
  const raw = entry && typeof entry === "object" ? entry : {};
  return {
    asOf: str(raw.asOf),
    flows: (Array.isArray(raw.flows) ? raw.flows : []).map(normalizeFlow).filter(Boolean).slice(0, 40),
    log: (Array.isArray(raw.log) ? raw.log : []).map(str).filter(Boolean).slice(-12),
  };
};

// ---- the pressure model -----------------------------------------------------------

// Everything the model needs about one polity, read once.
const profileOf = (economies, wars, polities) => {
  const map = new Map();
  const all = economies && typeof economies === "object" ? economies : {};
  const meta = polities && typeof polities === "object" ? polities : {};
  for (const [rawName, state] of Object.entries(all)) {
    const name = str(rawName);
    if (!name || !state || typeof state !== "object") continue;
    const fighting = activeWarsOf(wars, name);
    map.set(name, {
      name,
      population: Math.max(1, finite(state.population, 1)),
      // Output per head is the wage: the engine's own single number for how
      // well a person lives here, in subsistence-years.
      wage: Math.max(0.1, outputPerCapita(state)),
      legitimacy: clamp(finite(state.legitimacy, 60), 0, 100),
      openness: clamp(finite(state.openness, 15), 0, 100),
      policy: migrationPolicyOf(state),
      atWar: fighting.length > 0 || Boolean(state.atWar),
      // The war list carries an intensity; a bare atWar flag with no war
      // record is taken at the middle of the scale.
      warIntensity: fighting.length ? Math.max(...fighting.map((w) => finite(w.intensity, 0.5))) : (state.atWar ? 0.5 : 0),
      continent: lower(meta[name]?.continent),
    });
  }
  return map;
};

const byFlowSize = (a, b) => b.people - a.people
  || (a.from < b.from ? -1 : a.from > b.from ? 1 : 0)
  || (a.to < b.to ? -1 : a.to > b.to ? 1 : 0);

// For each ordered pair (from → to), the yearly flow as a share of the
// SENDER's population, plus the same figure in people. `wars` is the world's
// war list (runtime/wars.js); `polities` is any name-keyed map carrying a
// `continent` — the persisted stat sheets do — and is optional: with no
// continent known, the distance term is simply not applied.
export const migrationPressure = (economies, { wars = [], polities = {} } = {}) => {
  const people = profileOf(economies, wars, polities);
  if (people.size < 2) return [];
  const out = [];
  for (const from of people.values()) {
    // What pushes people out regardless of where they would go.
    const push = (from.atWar ? WAR_PUSH_PER_YEAR * Math.max(0.1, from.warIntensity) : 0)
      + COLLAPSE_PUSH_PER_YEAR * Math.max(0, (COLLAPSE_LEGITIMACY - from.legitimacy) / COLLAPSE_LEGITIMACY);

    // Where they could go, and how attractive each is. A polity at war
    // attracts nobody: people do not migrate INTO a war.
    const options = [];
    let totalWeight = 0;
    let bestGap = 0;
    for (const to of people.values()) {
      if (to.name === from.name || to.atWar) continue;
      const gap = Math.max(0, Math.log(to.wage / from.wage));
      const attraction = gap + (push > 0 ? REFUGE_FLOOR : 0);
      if (!(attraction > 0)) continue;
      const weight = attraction
        * to.population                                    // gravity: mass absorbs
        * (0.5 + to.openness / 100)                        // how connected/permeable it is
        * (0.5 + to.legitimacy / 100)                      // whether it can absorb anyone at all
        * ENTRY_BY_POLICY[to.policy]
        * (from.continent && to.continent && from.continent === to.continent ? SAME_CONTINENT_MULTIPLIER : 1);
      if (!(weight > 0)) continue;
      options.push({ to, weight, gap });
      totalWeight += weight;
      if (gap > bestGap) bestGap = gap;
    }
    if (!(totalWeight > 0)) continue;

    // How many leave, before they are told apart by destination.
    const liquidity = clamp(from.wage / MOBILITY_INCOME_SY, 0, 1);
    const economic = (PEACETIME_DRIFT + WAGE_ELASTICITY * bestGap) * liquidity;
    const propensity = Math.min(MAX_EMIGRATION_PER_YEAR, (economic + push) * EXIT_BY_POLICY[from.policy]);
    if (!(propensity > 0)) continue;
    const cause = from.atWar ? "war" : push > 0 ? "persecution" : "work";

    for (const option of options) {
      const share = propensity * (option.weight / totalWeight);
      if (!(share > 0)) continue;
      out.push({
        from: from.name,
        to: option.to.name,
        share,                                   // per year, of the sender's population
        people: from.population * share,         // per year
        wageRatio: option.to.wage / from.wage,
        cause,
      });
    }
  }
  out.sort(byFlowSize);
  return out;
};

// ---- the deltas the caller applies ------------------------------------------------
//
// Never applied here: this module owns no economies. It returns, per polity, a
// change object for economyBridge's applyEconomyChange — the one gated path
// that already caps a population move at ±20% and clamps capacities to 0-100.
//
//   { "<polity>": { shift: { populationShare, technology, legitimacy } } }
//
// Population is NET (what arrived less what left), so applying every change
// conserves heads exactly: each polity's delta is population × share = in −
// out, and the two sums cancel. Technology and legitimacy are charged on the
// GROSS flows, because a country that loses 300,000 of its young and gains
// 300,000 strangers has had both things happen to it, not neither.
const changesFor = (flows, people, years) => {
  const gross = new Map();
  const bump = (name, key, value) => {
    const entry = gross.get(name) ?? { in: 0, out: 0 };
    entry[key] += value;
    gross.set(name, entry);
  };
  for (const flow of flows) {
    bump(flow.from, "out", flow.people);
    bump(flow.to, "in", flow.people);
  }
  const changes = {};
  for (const [name, totals] of gross) {
    const profile = people.get(name);
    if (!profile) continue;
    const shift = {};
    const net = (totals.in - totals.out) / profile.population;
    if (net !== 0) shift.populationShare = net;
    if (totals.out > 0) {
      shift.technology = -Math.min(MAX_TECHNOLOGY_LOSS, BRAIN_DRAIN_TECHNOLOGY_POINTS * (totals.out / profile.population));
    }
    if (totals.in > 0) {
      const rate = totals.in / profile.population / Math.max(1e-9, years);
      const excess = Math.max(0, rate - ABSORPTION_TOLERANCE_PER_YEAR);
      const points = Math.min(MAX_LEGITIMACY_LOSS, LEGITIMACY_POINTS_PER_EXCESS * excess * years * STRAIN_BY_POLICY[profile.policy]);
      if (points > 0) shift.legitimacy = -points;
    }
    if (Object.keys(shift).length) changes[name] = { shift };
  }
  return changes;
};

// One jump. Returns the new migration record, the realised corridors, and the
// per-polity changes for applyEconomyChange.
export const stepMigration = (economies, { years = 0, wars = [], polities = {}, migration = null, date = "" } = {}) => {
  const state = normalizeMigration(migration);
  const elapsed = Math.max(0, finite(years, 0));
  const people = profileOf(economies, wars, polities);
  const pressure = elapsed > 0 ? migrationPressure(economies, { wars, polities }) : [];
  if (pressure.length === 0) return { migration: { ...state, flows: [] }, flows: [], changes: {} };

  // A jump's cap binds on the TOTAL, so every corridor out of one sender is
  // scaled by the same factor: the destinations' relative pull is unchanged,
  // only the number who go.
  const outShare = new Map();
  for (const flow of pressure) outShare.set(flow.from, (outShare.get(flow.from) ?? 0) + flow.share * elapsed);
  let flows = pressure.map((flow) => {
    const total = outShare.get(flow.from) ?? 0;
    const scale = total > MAX_JUMP_SHARE ? MAX_JUMP_SHARE / total : 1;
    return { ...flow, people: (people.get(flow.from)?.population ?? 0) * flow.share * elapsed * scale };
  });
  // And the same on the receiving side: no country takes in more than the cap
  // in one jump, whatever the pressure. Scaling the PAIR, not one side of it,
  // is what keeps departures and arrivals equal.
  const inPeople = new Map();
  for (const flow of flows) inPeople.set(flow.to, (inPeople.get(flow.to) ?? 0) + flow.people);
  flows = flows.map((flow) => {
    const cap = (people.get(flow.to)?.population ?? 0) * MAX_JUMP_SHARE;
    const total = inPeople.get(flow.to) ?? 0;
    return total > cap && total > 0 ? { ...flow, people: flow.people * (cap / total) } : flow;
  });

  flows = flows
    .map((flow) => ({ ...flow, people: Math.round(flow.people) }))
    .filter((flow) => flow.people >= MIN_FLOW_PEOPLE)
    .sort(byFlowSize);
  if (flows.length === 0) return { migration: { ...state, flows: [] }, flows: [], changes: {} };

  const moved = flows.reduce((sum, flow) => sum + flow.people, 0);
  return {
    migration: {
      asOf: date || state.asOf,
      flows: flows.map(({ from, to, people: n, cause }) => ({ from, to, people: n, cause, note: "" })),
      log: [...state.log, `${date || "undated"}: computed — ${moved.toLocaleString("en-US")} people along ${flows.length} corridor${flows.length === 1 ? "" : "s"}`].slice(-12),
    },
    flows,
    changes: changesFor(flows, people, elapsed),
  };
};

// ---- the model's lever ------------------------------------------------------------
//
//   {op:"flow", from:"<polity>", to:"<polity>", people:<number> | share:<fraction of
//    the sender's population>, cause:"war|famine|work|persecution|policy|climate",
//    note:"<why>"}
//
// For a movement an EVENT causes that the pressure model would never produce
// on its own: an expulsion, a population exchange, a guest-worker treaty, a
// boat crisis, a returning diaspora. Refused (and reported) when either side
// is unknown, when it is a polity moving people to itself, or when there is
// nothing to move; clamped, like the faithful ledger, when it is bigger than
// any single event has a right to be.

export const applyMigrationOps = (economies, ops, { migration = null, date = "" } = {}) => {
  const state = normalizeMigration(migration);
  const all = economies && typeof economies === "object" ? economies : {};
  const people = profileOf(all, [], {});
  const flows = [];
  const refusals = [];
  const log = [...state.log];
  for (const [index, raw] of (Array.isArray(ops) ? ops : []).entries()) {
    if (!raw || typeof raw !== "object") continue;
    if (lower(raw.op) !== "flow") { refusals.push(`migrationOps[${index}] refused: unknown op "${str(raw.op)}"`); continue; }
    const from = str(raw.from);
    const to = str(raw.to);
    if (!people.has(from) || !people.has(to)) {
      refusals.push(`migrationOps[${index}] refused: ${!people.has(from) ? `"${from}"` : `"${to}"`} has no economy in this world`);
      continue;
    }
    if (from === to) { refusals.push(`migrationOps[${index}] refused: ${from} cannot migrate to itself`); continue; }
    const population = people.get(from).population;
    const requested = raw.share !== undefined ? population * finite(raw.share, 0) : finite(raw.people, 0);
    if (!(requested > 0)) { refusals.push(`migrationOps[${index}] refused: ${from} → ${to} moves nobody`); continue; }
    const cap = population * MIGRATION_OP_CAP;
    const moved = Math.round(Math.min(requested, cap));
    if (moved < requested) {
      refusals.push(`migrationOps[${index}] clamped: ${from} → ${to} asked for ${Math.round(requested).toLocaleString("en-US")}, capped at ${Math.round(MIGRATION_OP_CAP * 100)}% of ${from}'s people (${moved.toLocaleString("en-US")})`);
    }
    const cause = MIGRATION_CAUSES.includes(lower(raw.cause)) ? lower(raw.cause) : "policy";
    const note = str(raw.note);
    flows.push({ from, to, people: moved, cause, note });
    log.push(`${date || "undated"}: ${from} → ${to} ${moved.toLocaleString("en-US")} (${cause})${note ? ` — ${note}` : ""}`);
  }
  if (flows.length === 0) return { migration: state, changes: {}, flows: [], refusals };
  return {
    // An op is a movement inside this period, so its consequences are charged
    // at a one-year rate — the same arithmetic a one-year jump would apply.
    changes: changesFor(flows, people, 1),
    flows,
    migration: {
      asOf: date || state.asOf,
      flows: [...state.flows, ...flows].slice(-40),
      log: log.slice(-12),
    },
    refusals,
  };
};

// ---- what the model and the player read --------------------------------------------

const fmt = (n) => Math.round(finite(n)).toLocaleString("en-US");
const pct = (n) => `${(finite(n) * 100).toFixed(2)}%`;

export const describeMigration = (migration, economies, { playerPolity = "" } = {}) => {
  const state = normalizeMigration(migration);
  if (state.flows.length === 0 && state.log.length === 0) return "";
  const all = economies && typeof economies === "object" ? economies : {};
  const lines = [];
  if (state.flows.length) {
    const moved = state.flows.reduce((sum, flow) => sum + flow.people, 0);
    lines.push(`${fmt(moved)} people moved along ${state.flows.length} corridor${state.flows.length === 1 ? "" : "s"}${state.asOf ? ` to ${state.asOf}` : ""} — computed from wages, war and policy:`);
    for (const flow of state.flows.slice(0, 8)) {
      const senders = Math.max(1, finite(all[flow.from]?.population, 0));
      lines.push(`  ${flow.from} → ${flow.to}: ${fmt(flow.people)} (${pct(flow.people / senders)} of ${flow.from}'s people) — ${flow.cause}${flow.note ? `; ${flow.note}` : ""}`);
    }
    if (state.flows.length > 8) lines.push(`  (${state.flows.length - 8} smaller corridors not listed)`);
  }
  const named = new Set([...state.flows.flatMap((flow) => [flow.from, flow.to]), ...(str(playerPolity) ? [str(playerPolity)] : [])]);
  const policies = [...named].filter((name) => all[name]).map((name) => `${name}: ${migrationPolicyOf(all[name])}`);
  if (policies.length) lines.push(`Border policy — ${policies.join("; ")}.`);
  const last = state.log.at(-1);
  if (last && !state.flows.length) lines.push(`Last movement: ${last}.`);
  return lines.join("\n");
};

export const MIGRATION_RULES = `[Migration — engine state]
The corridors above are COMPUTED by the engine every jump, for every ordered pair of polities, from state you cannot argue with: the gap in output per head (people move toward higher wages — the single strongest real driver), whether the sender is at war or its legitimacy has collapsed, whether the receiver's doors are open, how open and how governed it is, and how close it is. They are already applied — the senders have lost those people and the receivers have gained them before you write a word. Narrate THESE flows: the town in the sender that empties, the strain in the receiver's politics, the remittances, the election that turns on it. Never invent a different figure, and never narrate a wave the list above does not contain.
Both sides pay. A sustained outflow costs the sender real know-how (its young and its schooled are the ones who leave), and an inflow that is FAST relative to the receiver's population costs the receiver legitimacy — an ordinary intake passes unnoticed, an intake several times that does not. A polity that closes its borders keeps the legitimacy and forgoes the labour and the people; one that opens them gains the people and pays the political price. Both are real choices; write them as choices, not as virtue or as folly.
The lever is border policy: {"code":"<polity>","economy":{"set":{"migrationPolicy":"open|managed|closed"}}} — a visa programme, a labour treaty, free movement inside a bloc, a wall, an exit ban. Change it when a government actually changes it, and the computed flows above will move next jump.
For a movement an EVENT causes that wages and war would NOT have produced — an expulsion, a population exchange, a guest-worker agreement, a boat crisis, a diaspora returning after a peace, a coast lost to the sea — use impacts.migrationOps [{"op":"flow","from":"<polity people leave>","to":"<polity they reach>","people":<number> (or "share":<fraction of the sender's population>),"cause":"war|famine|work|persecution|policy|climate","note":"<why>"}]. Both polities must exist in this world, and no single op moves more than 15% of the sender's people. A movement of people narrated without this op did not happen: nobody left, nobody arrived, and the next turn's numbers will contradict your story.`;
