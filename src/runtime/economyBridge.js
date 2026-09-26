/*! Open Historia — economyBridge: seeds, steps and narrates the economy engine for a campaign © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// economy.js is a pure engine that knows nothing about the game. This is the
// layer that does: it seeds an economy for a polity from the era and the map,
// steps every polity's economy across a time jump, merges the changes the AI
// is allowed to make, and writes the briefing the simulation prompt reads —
// numbers the model must narrate rather than invent, and the one constraint
// that binds.
//
// Also pure: no store reads, no fetches. Everything it needs comes in as
// arguments, so it is unit-tested like the engine.

import {
  annualSpending, claimsPrice, economyIndicators, evaluateMonetarySystem, explainShortfall,
  normalizeEconomy, normalizeMonetarySystem, outputPerCapita, stepEconomy,
} from "./economy.js";
import { applyProgramDelta, describeProgram, normalizeProgram, stepProgram } from "./projectFinance.js";
import { isMember } from "./organizations.js";

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const str = (value) => String(value ?? "").trim();

// Linear interpolation over era breakpoints: [[year, value], ...].
const byEra = (year, points) => {
  const y = finite(year, 2000);
  if (y <= points[0][0]) return points[0][1];
  for (let i = 1; i < points.length; i += 1) {
    const [x1, v1] = points[i];
    const [x0, v0] = points[i - 1];
    if (y <= x1) return v0 + (v1 - v0) * ((y - x0) / (x1 - x0));
  }
  return points[points.length - 1][1];
};

// World population by year (millions), the usual reconstructions.
const WORLD_POPULATION_M = [[-1000, 50], [1, 230], [1000, 300], [1500, 450], [1800, 1000], [1900, 1650], [1950, 2500], [2000, 6100], [2026, 8200], [2300, 9000]];
// Effective (cultivated, arable-weighted) land on Earth, hectares, by year:
// the world farmed a tenth of what it farms now in antiquity.
const WORLD_EFFECTIVE_LAND_HA = [[1, 1.3e8], [1000, 1.8e8], [1500, 2.5e8], [1800, 4e8], [1900, 8e8], [2000, 1.5e9], [2300, 1.6e9]];

export const yearOf = (date) => {
  const m = /^(-?\d{1,4})/.exec(str(date));
  return m ? Number(m[1]) : 2000;
};

// A first economy for a polity, from nothing but the era, how much of the
// map it holds, and what the map knows about it. Deliberately rough: this is
// the prior the AI refines and the engine then evolves; it only has to be in
// the right decade, not the right year.
export const seedEconomy = ({
  year = 2000,
  regionShare = 0.01,     // share of the world's regions this polity holds
  population = null,      // people, when the map can tell us; else from the share
  tags = [],
  atWar = false,
} = {}) => {
  const y = finite(year, 2000);
  const share = clamp(finite(regionShare, 0.01), 0.0005, 1);
  const tagSet = new Set((Array.isArray(tags) ? tags : []).map((t) => str(t).toLowerCase()));
  const has = (...names) => names.some((n) => tagSet.has(n));

  const technology = byEra(y, [[-500, 6], [1, 12], [1000, 12], [1500, 20], [1700, 26], [1800, 32], [1900, 50], [1950, 66], [2000, 84], [2026, 88], [2300, 95]]);
  const administrativeReach = byEra(y, [[1, 38], [1000, 32], [1500, 40], [1800, 55], [1900, 75], [1950, 88], [2000, 95], [2026, 96]]);
  const monetization = byEra(y, [[1, 30], [1000, 22], [1500, 40], [1800, 60], [1900, 85], [1950, 95], [2000, 98]]);
  const marketIntegration = byEra(y, [[1, 40], [1000, 30], [1500, 45], [1800, 55], [1900, 75], [1950, 85], [2000, 95]]);
  const financialDepth = byEra(y, [[1, 8], [1000, 5], [1500, 12], [1700, 18], [1800, 25], [1900, 45], [1950, 60], [2000, 88], [2026, 92]]);
  const openness = byEra(y, [[1, 8], [1500, 10], [1800, 15], [1900, 25], [1950, 20], [2000, 35], [2026, 40]]);
  // Pre-industrial energy is local (wood, muscle, water, wind): the fossil-fuel
  // and grid trade that creates real import dependence is a 19th-century-on thing.
  const energyImportShare = byEra(y, [[1, 4], [1800, 10], [1900, 25], [1950, 30], [2000, 40], [2026, 42]]);
  const taxRate = byEra(y, [[1, 0.14], [1000, 0.10], [1500, 0.15], [1800, 0.22], [1900, 0.25], [1950, 0.38], [2000, 0.42]]);
  const investmentShare = byEra(y, [[1, 0.05], [1500, 0.06], [1800, 0.08], [1900, 0.14], [1950, 0.20], [2000, 0.22]]);
  const urbanShare = byEra(y, [[1, 0.08], [1500, 0.10], [1800, 0.12], [1900, 0.30], [1950, 0.50], [2000, 0.75], [2026, 0.80]]);

  const worldPopulation = byEra(y, WORLD_POPULATION_M) * 1e6;
  const people = finite(population, 0) > 0 ? finite(population) : worldPopulation * share;
  const effectiveLand = byEra(y, WORLD_EFFECTIVE_LAND_HA) * share;
  // Capital per head rises with know-how: about one year of output in
  // antiquity, two and a half in a modern economy.
  const outputGuess = byEra(y, [[1, 1.7], [1000, 1.6], [1500, 2.2], [1800, 3], [1900, 8], [1950, 15], [2000, 35], [2026, 42]]);
  const capitalToOutput = byEra(y, [[1, 1.0], [1800, 1.5], [1900, 2.0], [2000, 2.5]]);
  const capital = people * outputGuess * capitalToOutput;
  const output = people * outputGuess;

  // What the era's states did with their money. Tags tilt it.
  const militaryShare = atWar ? 0.25 : byEra(y, [[1, 0.03], [1500, 0.02], [1800, 0.03], [1900, 0.03], [1950, 0.05], [2000, 0.02]]);
  const civilShare = byEra(y, [[1, 0.01], [1500, 0.01], [1800, 0.03], [1900, 0.06], [1950, 0.20], [2000, 0.38]]);
  const militaryUpkeep = output * militaryShare * (has("militarist", "expansionist", "military-junta") ? 1.5 : 1);
  const civilSpending = output * civilShare * (has("social-democratic", "socialist", "communist") ? 1.15 : 1);

  const monetarySystem = y < 1914
    ? { backing: "commodity", issuer: y < 1700 ? "mint" : "banks", rule: "discretionary", convertibility: 1 }
    : y < 1973
      ? { backing: "commodity", issuer: "banks", rule: "peg", convertibility: 0.5, anchorInflation: 0.02 }
      : { backing: "none", issuer: "banks", rule: "taylor", convertibility: 0 };
  if (has("communist", "one-party", "totalitarian")) Object.assign(monetarySystem, { issuer: "treasury", rule: "discretionary" });

  return normalizeEconomy({
    population: people,
    effectiveLand,
    capital,
    reserves: monetarySystem.backing === "commodity" ? output * 0.15 : 0,
    technology,
    administrativeReach: administrativeReach * (has("client-state", "puppet-state") ? 0.8 : 1),
    monetization,
    marketIntegration: marketIntegration * (has("isolationist") ? 0.8 : 1),
    financialDepth,
    fiscalCredibility: has("pariah") ? 30 : 55,
    legitimacy: has("authoritarian", "totalitarian") ? 50 : 60,
    openness: openness * (has("isolationist") ? 0.4 : has("pariah") ? 0.6 : 1),
    energyImportShare: energyImportShare * (has("isolationist") ? 0.6 : 1),
    taxRate,
    investmentShare,
    militaryUpkeep,
    civilSpending,
    atWar,
    monetarySystem,
    sanctionsFaced: has("pariah") ? 0.4 : 0,
    financing: "borrow",
  });
};

// ---- the AI's levers -------------------------------------------------------------
//
// What the simulation is allowed to move in an economy through
// polityChanges.economy. Capacities and policy — never the stocks the engine
// computes (output, prices, debt), which would let narration overwrite
// arithmetic. `set` replaces a field, `shift` adds to it (for capacities, in
// points), and monetarySystem is a partial replacement.

export const ECONOMY_CAPACITY_FIELDS = ["technology", "administrativeReach", "monetization", "marketIntegration", "financialDepth", "fiscalCredibility", "legitimacy", "openness", "energyImportShare"];
export const ECONOMY_POLICY_FIELDS = ["taxRate", "investmentShare", "militaryUpkeep", "civilSpending", "transfers", "endowmentYield", "inflationTarget", "atWar", "sanctionsFaced", "financing", "reserves", "migrationPolicy"];
// Stocks the narrative may move by a stated amount (a bequest, an asset sale,
// a pension reform) — never set outright, so a gift cannot rewrite a balance sheet.
export const ECONOMY_SHIFTABLE_STOCKS = ["militaryUpkeep", "civilSpending", "reserves", "transfers", "endowment", "unfundedLiabilities"];

// People are a stock the narrative may MOVE but never set — a plague, a
// famine, war deaths, a deportation, a refugee inflow, an annexed province's
// people — capped like the faithful ledger (see churchFaithful.js) so no
// single event can empty or double a country: ±20% per change, which is the
// Black Death (a third to a half, over several years and several changes)
// at the top of the scale and everything else well under it. Land and
// capital are deliberately NOT scaled with it: fewer people on the same
// land is exactly the post-plague rebound in output per head (and the
// price rise, since the money stock did not shrink), and refugees arriving
// on the same land is the crowding the engine's Malthusian term already
// prices. Two forms: `populationShare` (a signed fraction) and `population`
// (signed people); both go through the same cap.
export const POPULATION_SHIFT_CAP = 0.2;

export const applyEconomyChange = (previous, change) => {
  const prev = normalizeEconomy(previous);
  if (!change || typeof change !== "object") return prev;
  const next = { ...prev };
  const set = change.set && typeof change.set === "object" ? change.set : {};
  const shift = change.shift && typeof change.shift === "object" ? change.shift : {};
  for (const field of [...ECONOMY_CAPACITY_FIELDS, ...ECONOMY_POLICY_FIELDS]) {
    if (set[field] !== undefined) next[field] = set[field];
  }
  for (const field of ECONOMY_CAPACITY_FIELDS) {
    if (Number.isFinite(Number(shift[field]))) next[field] = clamp(finite(next[field]) + finite(shift[field]), 0, 100);
  }
  for (const field of ECONOMY_SHIFTABLE_STOCKS) {
    if (Number.isFinite(Number(shift[field]))) next[field] = Math.max(0, finite(next[field]) + finite(shift[field]));
  }
  if (Number.isFinite(Number(shift.populationShare))) {
    const share = clamp(finite(shift.populationShare), -POPULATION_SHIFT_CAP, POPULATION_SHIFT_CAP);
    next.population = Math.max(1, next.population * (1 + share));
  }
  if (Number.isFinite(Number(shift.population)) && next.population > 0) {
    const share = clamp(finite(shift.population) / next.population, -POPULATION_SHIFT_CAP, POPULATION_SHIFT_CAP);
    next.population = Math.max(1, next.population * (1 + share));
  }
  if (change.monetarySystem && typeof change.monetarySystem === "object") {
    next.monetarySystem = normalizeMonetarySystem({ ...prev.monetarySystem, ...change.monetarySystem });
  }
  if (Array.isArray(change.innovations)) {
    const byId = new Map(prev.innovations.map((i) => [i.id, i]));
    for (const entry of change.innovations) {
      const id = str(entry?.id ?? entry?.name);
      if (id) byId.set(id, { ...(byId.get(id) ?? {}), ...entry, id });
    }
    next.innovations = [...byId.values()];
  }
  return normalizeEconomy(next);
};

// ---- reading the player's own order --------------------------------------------
//
// polityChanges.economy is the model's lever, and the model narrated the lever
// instead of pulling it. An order read "porter le taux d'imposition a 28 %", the
// edition ratified the reform in three paragraphs, and the rate stood exactly
// where it had always stood — the tax rate has never once moved in a real
// campaign. It is the loudest complaint about the whole game: the figures never
// move.
//
// Same lesson as the drives, the gatherings, the treasury moves and the unfunded
// promises (runtime/treasuries.js, runtime/liabilities.js), for the fifth time:
// a rule asking the model to carry a lever does not make it carry the lever. So
// the ENGINE reads the order.
//
// Three things an order can honestly say about a budget, and no more:
//
//   taxRate    the rate is SET to a percentage.
//   spending   a named line — the army, the civil budget — raised or cut by a
//              sum in SY, by a share of itself, or set to a share of output.
//   financing  how the deficit is covered: borrow, print, austerity, drawdown.
//
// Everything moves through applyEconomyChange above, so every cap and clamp the
// engine already had still binds: a rate above what a state can assess is cut
// back, a line cannot be cut below zero, an unknown financing mode is refused.
// This is a floor under the three levers players actually shout about, not a
// second set of levers beside polityChanges.economy.

const orderNumber = (raw) => Math.max(0, finite(String(raw).replace(/[\s  ]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", "."), 0));

// The sentences of an order, so a figure has to sit beside the thing it is
// supposed to describe rather than anywhere on the page.
const sentencesOf = (text) => str(text).split(/(?<=[.!?;:])\s+|\n+/).filter(Boolean);

// Accented words never carry a leading \b: "é" is not a word character, so
// /\b[ée]tablir/ can never match. Boundaries go on the ASCII side only.
const TAX_RATE_PHRASE = /(?:\btaux\s+(?:d'|de\s+l')?(?:imposition|imp[ôo]ts?)|\btaux\s+de\s+pr[ée]l[èe]vements?(?:\s+obligatoires?)?|\bpression\s+fiscale|\bniveau\s+d'imposition|\btax\s+rate|\brate\s+of\s+taxation|\btaxation\s+rate)/i;
// Players write "porter les impôts à 30 %" as often as they write the phrase.
const TAX_GENERAL = /(?:\bimp[ôo]ts?\b|\btaxes?\b|\btaxation\b)/i;
// But a single duty is not what the whole state takes: "porter les taxes sur le
// carburant à 3 %" must not reset a modern state's entire revenue to three
// percent of output. The engine holds ONE rate, so a named base is left alone.
const NARROW_TAX = /(?:\btaxes?\b|\bimp[ôo]ts?\b|\bdroits?\b|\btax\b|\bduty\b|\bduties\b)\s+(?:sur|de|d'|on)\s/i;
const namesTheTaxRate = (sentence) => TAX_RATE_PHRASE.test(sentence) || (TAX_GENERAL.test(sentence) && !NARROW_TAX.test(sentence));
// A rate the order plainly SETS. "à"/"to"/"at" is what makes a figure a target.
//
// The unaccented "a" is not a typo to tolerate grudgingly: it is how French is
// typed at speed, and it is how most of this campaign's orders were written.
// Reading only "à" made "porter le taux de 42 % a 48 %" find no target at all,
// fall through to the bare-percentage branch, and set the rate to the figure the
// order was moving AWAY from. A parser that only understands correctly accented
// French does not understand French. It must sit directly before the figure, so
// the ordinary verb "a" cannot be taken for the preposition.
const TAX_TARGET = /(?:à|\ba\b|\bto\b|\bat\b)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:%|pour ?cent|per ?cent)/gi;
const SET_VERB = /(?:\b(?:porter|fixer|instaurer|set|fix|bring|peg)\b|[ée]tablir)/i;
const PERCENT = /(\d{1,3}(?:[.,]\d+)?)\s*(?:%|pour ?cent|per ?cent)/i;
const SY_AMOUNT = /(\d{1,3}(?:[\s  .,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:sy\b|subsistence)/i;

// The two spending lines the engine actually holds. A sentence names one of
// them; the figure in that sentence belongs to it.
const SPENDING_LINES = [
  { field: "militaryUpkeep", label: "the military line", match: /(?:\b(?:budget|d[ée]penses?|cr[ée]dits?|dotation)\s+(?:de\s+(?:la\s+)?|du\s+|des\s+)?(?:militaires?|d[ée]fense|arm[ée]e|guerre)|\b(?:military|defen[cs]e|army|war)\s+(?:budget|spending|expenditure|outlays?))/i },
  { field: "civilSpending", label: "the civil line", match: /(?:\b(?:budget|d[ée]penses?|cr[ée]dits?|dotation)\s+(?:de\s+(?:la\s+)?|du\s+|des\s+)?(?:civiles?|civils?|sociales?|social|solidarit[ée]|sant[ée]|[ée]ducation)|\b(?:civil|social|welfare|health|education)\s+(?:budget|spending|expenditure|outlays?))/i },
];
const RAISES = /\b(?:augmenter|augmente|accro[îi]tre|relever|rel[èe]ve|porter|hausser|renforcer|raise|raises|increase|boost|lift|expand)\b/i;
const CUTS = /\b(?:r[ée]duire|r[ée]duit|baisser|baisse|diminuer|couper|coupe|abaisser|raboter|sabrer|amputer|comprimer|cut|cuts|reduce|lower|trim|slash|shrink)\b/i;
// How a modern budget is stated: "3 % du PIB", "3% of GDP". It is a SET, so it
// is only read as one when the order says so — with "à"/"to", or a setting verb.
const SHARE_OF_OUTPUT_TO = /(?:à|\bto\b|\bat\b)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:%|pour ?cent|per ?cent)\s*(?:du|de(?:\s+la)?|of(?:\s+the)?)\s*(?:PIB|GDP|production|output|produit\s+int[ée]rieur\s+brut)/i;
const SHARE_OF_OUTPUT_ANY = /(\d{1,3}(?:[.,]\d+)?)\s*(?:%|pour ?cent|per ?cent)\s*(?:du|de(?:\s+la)?|of(?:\s+the)?)\s*(?:PIB|GDP|production|output|produit\s+int[ée]rieur\s+brut)/i;

// Switching how a deficit is covered is only meant when the order is about
// covering something. Without this, "emprunter 30 000 SY pour doter Pax Africa"
// rewrote the state's whole financing rule on its way past.
const FINANCING_CONTEXT = /(?:d[ée]ficit|financ\w+|couvrir|couverture|budget|tr[ée]sorerie|deficit|cover|shortfall|gap)/i;
// What an order moves AWAY from is not what it moves TO. Field report:
// "financer le déficit par l'emprunt plutôt que par la planche à billets"
// switched the state to printing money, because the parser read the last route
// it saw. The rejected route is cut out before any route is read; the cut stops
// at the next clause so the surviving instruction is not swallowed with it.
const REJECTED_ROUTE = /(?:plut[ôo]t\s+que|au\s+lieu\s+d\w*|instead\s+of|rather\s+than|et\s+non\s+par|\bcesser\b|arr[êe]ter\s+de?\b|abandonner|renoncer\s+[àa]|\bne\s+plus\b|\bno\s+longer\b)[^,.;!?]*?(?=\s+(?:et|and|puis|then)\b|[,.;!?]|$)/gi;
const FINANCING_MODES = [
  ["print", /(?:planche\s+[àa]\s+billets|cr[ée]ation\s+mon[ée]taire|mon[ée]tis\w*|battre\s+monnaie|print(?:ing)?\s+money|money\s+creation|monetiz\w*|monetis\w*|seigneuriage|seigniorage)/i],
  ["austerity", /(?:aust[ée]rit[ée]|rigueur\s+budg[ée]taire|[ée]quilibre\s+budg[ée]taire|budget\s+[ée]quilibr[ée]|austerity|balanced\s+budget|no\s+new\s+(?:debt|borrowing)|spending\s+freeze)/i],
  // "puisant", not only "puiser": a player writes "en puisant dans le
  // patrimoine" at least as often as the infinitive, and matching one form of a
  // verb is matching none of them.
  ["drawdown", /(?:puis(?:er|ant|e|ons|ez)\s+dans\s+(?:le\s+|la\s+|les\s+|nos\s+|notre\s+)?(?:patrimoine|dotation|r[ée]serves)|ponction\w*\s+(?:sur\s+)?le\s+patrimoine|vend(?:re|ant|ons)\s+(?:des\s+|les\s+|nos\s+)?actifs|c[ée]d(?:er|ant)\s+des\s+actifs|draw(?:ing)?\s+down|drawdown|sell(?:ing)?\s+assets|eat(?:ing)?\s+into\s+the\s+(?:patrimony|endowment))/i],
  ["borrow", /(?:emprunt\w*|par\s+la\s+dette|recours\s+[àa]\s+la\s+dette|[ée]mission\s+obligataire|borrow\w*|bond\s+issue|debt[- ]financed|issue\s+(?:new\s+)?debt)/i],
];

const rateSetIn = (sentence) => {
  const targets = [...sentence.matchAll(TAX_TARGET)];
  // "de 42 % à 28 %" names where it came from and where it goes: the target is
  // the last one. Never the first, or a reform would land on its own old rate.
  if (targets.length) return orderNumber(targets[targets.length - 1][1]) / 100;
  // A bare percentage is a target only when the sentence says it is setting one.
  // "réduire le taux d'imposition de 5 %" means BY five points, not TO five
  // percent; read as a target it would cut a modern state's revenue by four
  // fifths on a sentence that asked for a trim. So it moves nothing.
  if (!SET_VERB.test(sentence)) return null;
  const bare = sentence.match(PERCENT);
  return bare ? orderNumber(bare[1]) / 100 : null;
};

const spendingMoveIn = (sentence, field, date) => {
  // The VERB is read from the whole sentence, because French puts it first —
  // "réduire le budget de la défense de 20 %". The FIGURE is read from where the
  // line is named onward, because one sentence can carry two of them: "set the
  // tax rate to 30% and cut the defence budget by 10%" took the first figure it
  // saw and cut the army by thirty per cent on an order that asked for ten,
  // spending the tax rate's number on somebody else's budget. A figure belongs
  // to the line it stands beside; a verb belongs to the sentence.
  const named = SPENDING_LINES.find((l) => l.field === field);
  const at = named ? sentence.search(named.match) : -1;
  const beside = at >= 0 ? sentence.slice(at) : sentence;
  // Whichever figure sits by the line, else the sentence's own.
  const figure = (pattern) => beside.match(pattern) ?? sentence.match(pattern);

  const setShare = figure(SHARE_OF_OUTPUT_TO) ?? (SET_VERB.test(sentence) ? figure(SHARE_OF_OUTPUT_ANY) : null);
  if (setShare) return { kind: "spending", line: field, shareOfOutput: orderNumber(setShare[1]) / 100, date };
  // Whichever verb comes first is the one governing the line this sentence
  // names, so "augmenter la défense en réduisant le civil" raises the army.
  const cut = sentence.match(CUTS);
  const up = sentence.match(RAISES);
  if (!cut && !up) return null;
  const direction = !up || (cut && cut.index <= up.index) ? -1 : 1;
  const sum = figure(SY_AMOUNT);
  if (sum) return { kind: "spending", line: field, amount: direction * orderNumber(sum[1]), date };
  const percent = figure(PERCENT);
  if (!percent) return null;
  // "de 1 % du PIB" is a share of OUTPUT, not of the line. Read as a share of
  // the line it would move a budget by a hundredth of what the order meant, so
  // when the order has not plainly SET the line, nothing moves.
  if (SHARE_OF_OUTPUT_ANY.test(sentence)) return null;
  return { kind: "spending", line: field, share: direction * (orderNumber(percent[1]) / 100), date };
};

const financingModeIn = (text) => {
  if (!FINANCING_CONTEXT.test(text)) return null;
  const cleaned = str(text).replace(REJECTED_ROUTE, " ");
  let best = null;
  for (const [mode, pattern] of FINANCING_MODES) {
    const hit = cleaned.match(pattern);
    if (hit && (best === null || hit.index < best.index)) best = { mode, index: hit.index };
  }
  return best ? best.mode : null;
};

/**
 * What a planned order does to the player's own budget: a tax rate set, a
 * spending line moved, the deficit financed another way. Returns [] when the
 * order says nothing of the sort — an order about anything else must move
 * nothing at all.
 */
export const economyMovesFromOrder = (order, { player = "", economies = {}, date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  if (!text) return [];
  // No economy, nothing to move in: the levers are that polity's own state.
  if (!economies || typeof economies !== "object" || !economies[str(player)]) return [];
  const moves = [];

  for (const sentence of sentencesOf(text)) {
    if (namesTheTaxRate(sentence)) {
      const rate = rateSetIn(sentence);
      if (rate != null) moves.push({ kind: "taxRate", rate, date });
    }
    for (const line of SPENDING_LINES) {
      if (!line.match.test(sentence)) continue;
      const move = spendingMoveIn(sentence, line.field, date);
      // One sentence, one figure, one line: a sentence naming both budgets has
      // one number in it, and guessing which half it belongs to invents money.
      if (move) { moves.push(move); break; }
    }
  }

  const mode = financingModeIn(text);
  if (mode) moves.push({ kind: "financing", mode, date });
  return moves;
};

const FINANCING_WORDS = {
  borrow: "l'emprunt",
  print: "la création de monnaie",
  austerity: "l'austérité, en ramenant la dépense à ce qui est encaissé",
  drawdown: "la ponction sur le patrimoine",
};

/**
 * Applies those moves to the player's economy, through applyEconomyChange so
 * every cap the engine already had still binds. Returns the new world, the
 * record rows for what actually shifted, and the refusals a player needs to
 * read — the same three the treasury and liability movers return.
 */
export const applyEconomyMoves = (world, moves, { player = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const economies = { ...(w.economies ?? {}) };
  const name = str(player);
  const rows = [];
  const refusals = [];
  const list = Array.isArray(moves) ? moves : [];
  const raw = economies[name];
  if (!raw) return { world, rows: [], refusals: list.length ? [`economy: no polity named "${name}".`] : [] };
  let economy = normalizeEconomy(raw);

  for (const move of list) {
    const date = str(move?.date);

    if (move.kind === "taxRate") {
      const before = economy.taxRate;
      const revenueBefore = economyIndicators(economy).revenue;
      const next = applyEconomyChange(economy, { set: { taxRate: finite(move.rate, before) } });
      if (Math.abs(next.taxRate - before) < 1e-9) {
        refusals.push(`tax rate unchanged: ${name} already taxes at ${pct(before)}.`);
        continue;
      }
      // The engine's own ceiling on what a state can take is not negotiable by
      // an order; say so rather than letting the figure quietly land elsewhere.
      if (Math.abs(next.taxRate - finite(move.rate, before)) > 1e-9) {
        refusals.push(`tax rate held at ${pct(next.taxRate)}: ${pct(finite(move.rate, before))} is past what any state can actually assess and collect.`);
      }
      const revenueAfter = economyIndicators(next).revenue;
      rows.push({ date, polity: name, kind: "money", what: `taux d'imposition porté de ${pct(before)} à ${pct(next.taxRate)}`, amount: revenueAfter - revenueBefore, unit: "SY", source: "order:taxRate", note: "what the state collects at the new rate, less what it collected at the old one — the reach of the state still decides how much of it arrives" });
      economy = next;
      continue;
    }

    if (move.kind === "spending") {
      const field = str(move.line);
      const line = SPENDING_LINES.find((l) => l.field === field);
      if (!line) { refusals.push(`spending refused: "${field}" is not a line this engine holds.`); continue; }
      const before = finite(economy[field]);
      let change = null;
      if (move.shareOfOutput != null) {
        change = { set: { [field]: Math.max(0, finite(move.shareOfOutput)) * economyIndicators(economy).output } };
      } else if (move.amount != null) {
        change = { shift: { [field]: finite(move.amount) } };
      } else if (move.share != null) {
        if (!(before > 0)) { refusals.push(`spending refused: ${line.label} of ${name} already stands at nothing, so there is no share of it to move.`); continue; }
        change = { shift: { [field]: before * finite(move.share) } };
      } else {
        refusals.push(`spending refused on ${line.label}: no amount, share or target was given.`);
        continue;
      }
      const next = applyEconomyChange(economy, change);
      const delta = finite(next[field]) - before;
      if (Math.abs(delta) < 1e-9) { refusals.push(`${line.label} of ${name} unchanged: it already stands at ${fmt(before)} SY a year.`); continue; }
      // A line cannot be cut below zero, and an order that asked for more than
      // the line holds got what the line held. The player reads which it was.
      if (move.amount != null && Math.abs(delta) + 1e-9 < Math.abs(finite(move.amount))) {
        refusals.push(`${line.label} of ${name} could only move ${fmt(Math.abs(delta))} SY a year: it stood at ${fmt(before)}, and a budget cannot go below nothing.`);
      }
      rows.push({ date, polity: name, kind: "money", what: `${line.label} ${delta > 0 ? "raised" : "cut"} to ${fmt(next[field])} SY a year`, amount: delta, unit: "SY", source: `order:spending:${field}` });
      economy = next;
      continue;
    }

    if (move.kind === "financing") {
      const mode = str(move.mode);
      if (!FINANCING_WORDS[mode]) { refusals.push(`financing refused: "${mode}" is not one of borrow, print, austerity, drawdown.`); continue; }
      if (economy.financing === mode) { refusals.push(`financement inchangé : ${name} couvre déjà ses déficits par ${FINANCING_WORDS[mode]}.`); continue; }
      const next = applyEconomyChange(economy, { set: { financing: mode } });
      const balance = economyIndicators(next).balance;
      // Nothing has moved yet — the switch decides what the NEXT step does with
      // the gap — so the row carries no sum and names the gap it will govern.
      rows.push({ date, polity: name, kind: "money", what: `les déficits sont désormais couverts par ${FINANCING_WORDS[mode]}`, amount: 0, unit: "SY", source: `order:financing:${mode}`, note: balance < 0 ? `${fmt(-balance)} SY a year runs through this route from the next period` : "the budget is covered, so nothing runs through it yet" });
      economy = next;
      continue;
    }

    refusals.push(`economy: unknown move "${str(move?.kind)}".`);
  }

  if (!rows.length) return { world, rows: [], refusals };
  // The raw entry is kept underneath: it may carry campaign fields the engine's
  // own normalizer knows nothing about, and a budget change must not drop them.
  economies[name] = { ...raw, ...economy };
  return { world: { ...w, economies }, rows, refusals };
};

/** Every queued order, read for what it does to the player's budget. */
export const ensureEconomyMovesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const moves = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")
    .flatMap((order) => economyMovesFromOrder(order, { player, economies: w.economies, date }));
  if (!moves.length) return { world: w, rows: [], refusals: [] };
  return applyEconomyMoves(w, moves, { player });
};

export const ECONOMY_ORDER_RULES = [
  "The budget is engine state, and the engine reads the player's own order for three levers before the period is narrated: a tax rate SET to a percentage, a named spending line raised or cut, and how deficits are covered. What it reads, it moves — and what it moved is in the record, in SY.",
  "So never narrate a tax rise, a budget cut or a switch to borrowing as done. Report what the figures actually did: an edition that announces a cut the record does not show is exactly the complaint this exists to answer.",
  "A tax rate is SET, never nudged: \"porter le taux d'imposition a 28 %\", \"set the tax rate to 28%\". The ceiling on what a state can assess and collect still binds, and a rate the reach of the state cannot reach raises less than it promises — the fiscal verdict says which.",
  "A spending line is the military line or the civil line, moved by a sum in SY, by a share of itself, or set to a share of output (\"3 % du PIB\", \"3% of GDP\"). It cannot go below nothing, and cutting the military line under what the forces in being require makes the unfunded share desert at the rate the army line states.",
  "Financing is one of borrow, print, austerity or drawdown, and switching it governs what the NEXT period does with the gap, not what this one already did. What an order moves away from is not what it moves to: name the route the state is taking.",
  "Everything else in an economy still moves through polityChanges.economy — capacities in points, transfers, the patrimony, the monetary system. This is a floor under the three levers a player shouts about, not a replacement for the levers.",
].join("\n");

// ---- refining a seed once, with the model's historical judgement --------------------
//
// The era seed is a prior in the right decade. The model knows that Prussia
// in 1750 taxed harder than France and that Venice's markets ran deeper than
// Castile's; it is asked ONCE per polity for the corrections — population,
// capacities, policy, what the money was — and the engine takes it from
// there. Stocks the engine computes are never accepted.

export const describeSeedForRefinement = (name, economy) => {
  const e = normalizeEconomy(economy);
  const i = economyIndicators(e);
  return `${name}: population ${fmt(e.population)}; output per head ${i.outputPerCapita} SY; `
    + `technology ${Math.round(e.technology)}, administrativeReach ${Math.round(e.administrativeReach)}, monetization ${Math.round(e.monetization)}, `
    + `marketIntegration ${Math.round(e.marketIntegration)}, financialDepth ${Math.round(e.financialDepth)}, fiscalCredibility ${Math.round(e.fiscalCredibility)}, `
    + `legitimacy ${Math.round(e.legitimacy)}, openness ${Math.round(e.openness)}; taxRate ${e.taxRate.toFixed(2)}, investmentShare ${e.investmentShare.toFixed(2)}, `
    + `military ${pct(e.militaryUpkeep / Math.max(1, i.output))} of output, civil ${pct(e.civilSpending / Math.max(1, i.output))} of output; `
    + `money: ${describeSystem(e.monetarySystem)}${e.atWar ? "; at war" : ""}.`;
};

export const refineSeed = (economy, refinement) => {
  const prev = normalizeEconomy(economy);
  if (!refinement || typeof refinement !== "object") return prev;
  const r = refinement;
  const capacities = {};
  for (const field of ECONOMY_CAPACITY_FIELDS) if (Number.isFinite(Number(r[field]))) capacities[field] = Number(r[field]);
  const output = Math.max(1, economyIndicators(prev).output);
  const set = {
    ...capacities,
    ...(Number.isFinite(Number(r.taxRate)) ? { taxRate: Number(r.taxRate) } : {}),
    ...(Number.isFinite(Number(r.investmentShare)) ? { investmentShare: Number(r.investmentShare) } : {}),
    ...(Number.isFinite(Number(r.militaryShareOfOutput)) ? { militaryUpkeep: clamp(Number(r.militaryShareOfOutput), 0, 0.8) * output } : {}),
    ...(Number.isFinite(Number(r.civilShareOfOutput)) ? { civilSpending: clamp(Number(r.civilShareOfOutput), 0, 0.8) * output } : {}),
    ...(typeof r.atWar === "boolean" ? { atWar: r.atWar } : {}),
    ...(Number.isFinite(Number(r.sanctionsFaced)) ? { sanctionsFaced: Number(r.sanctionsFaced) } : {}),
  };
  let next = applyEconomyChange(prev, { set, monetarySystem: r.monetarySystem });
  // Two INITIAL conditions the model may set once (never later): the debt the
  // polity starts with, and the dollar value of a subsistence-year.
  if (Number.isFinite(Number(r.debtShareOfOutput))) next = normalizeEconomy({ ...next, debt: clamp(Number(r.debtShareOfOutput), 0, 5) * output });
  if (Number.isFinite(Number(r.gdpPerCapitaUsd)) && Number(r.gdpPerCapitaUsd) > 0) next = anchorUnitValue(next, r.gdpPerCapitaUsd);
  if (Number.isFinite(Number(r.population)) && Number(r.population) > 1000) {
    // Population moves land and capital per head, so the stocks per head are
    // preserved: the correction is about how many people, not how rich.
    const ratio = Number(r.population) / prev.population;
    next = normalizeEconomy({ ...next, population: Number(r.population), effectiveLand: next.effectiveLand * ratio, capital: next.capital * ratio, baseMoney: 0, creditMoney: 0 });
  }
  return normalizeEconomy({ ...next, seed: "ai" });
};

// ---- pinning the AI's stat sheet to the engine ---------------------------------------
//
// The stat sheet is prose the model writes, and a regenerated sheet used to
// drift on every number. The fields the engine actually computes are pinned
// here after generation: the model keeps the era currency and the wording,
// the engine keeps the ratios, so three regenerations agree three times.

// Language names the game uses -> locales for number formatting.
const LOCALES = { english: "en", french: "fr", german: "de", spanish: "es", italian: "it", portuguese: "pt", dutch: "nl", polish: "pl", russian: "ru", turkish: "tr", japanese: "ja", chinese: "zh", korean: "ko", arabic: "ar" };
const localeFor = (language) => LOCALES[str(language).toLowerCase()] || (str(language).length === 2 ? str(language).toLowerCase() : "en");

const money = (n, locale) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "";
  const abs = Math.abs(v);
  const [d, unit] = abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : [1, ""];
  const digits = d === 1 ? 0 : abs / d >= 100 ? 0 : 1;
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v / d)}${unit ? ` ${unit}` : ""} USD`;
};

// The dollar anchor: the model's GDP-per-head estimate, once, gives dollars
// per subsistence-year for this polity; from then on the currency figures on
// its sheet are the engine's output at that anchor.
export const anchorUnitValue = (economy, gdpPerCapitaUsd) => {
  const e = normalizeEconomy(economy);
  const usd = Number(gdpPerCapitaUsd);
  if (!Number.isFinite(usd) || usd <= 0) return e;
  const perHead = economyIndicators(e).outputPerCapita;
  return normalizeEconomy({ ...e, usdPerSY: perHead > 0 ? usd / perHead : 0 });
};

// Fields the model writes once and events may change, but a regenerate must
// not: they are carried over from the previous sheet when there is one.
const STICKY_TOP = ["capital", "continent", "government", "leader"];
const STICKY_ECONOMY = ["currency", "unemployment"];

export const pinStatSheetToEngine = (sheet, economy, { previous = null, language = "English" } = {}) => {
  if (!sheet || typeof sheet !== "object" || !economy) return sheet;
  const e = normalizeEconomy(economy);
  const i = economyIndicators(e);
  const output = Math.max(1, i.output);
  const locale = localeFor(language);
  // ASCII minus: the sheet's surplus/deficit label looks for "-".
  const signed = (n) => `${n >= 0 ? "+" : "-"}${(Math.abs(n) * 100).toFixed(1)}%`;
  const prev = previous && typeof previous === "object" ? previous : null;
  const eco = { ...(prev?.economy && typeof prev.economy === "object" ? prev.economy : {}), ...(sheet.economy && typeof sheet.economy === "object" ? sheet.economy : {}) };
  for (const k of STICKY_ECONOMY) if (prev?.economy?.[k]) eco[k] = prev.economy[k];
  eco.gdpGrowth = signed(i.trendGrowth + i.outputGap * 0.5);
  eco.inflation = signed(i.expectedInflation);
  eco.publicDebt = `${(100 * e.debt / output).toFixed(1)}% GDP`;
  eco.budgetBalance = `${signed(i.balance / output)} GDP`;
  if (e.usdPerSY > 0) {
    eco.gdp = money(output * e.usdPerSY, locale);
    eco.gdpPerCapita = money(i.outputPerCapita * e.usdPerSY, locale);
  } else if (prev?.economy?.gdp) {
    eco.gdp = prev.economy.gdp;
    eco.gdpPerCapita = prev.economy.gdpPerCapita ?? eco.gdpPerCapita;
  }
  const next = { ...sheet, economy: eco, stability: Math.round(e.legitimacy) };
  for (const k of STICKY_TOP) if (prev?.[k]) next[k] = prev[k];
  if (prev?.gdpBreakdown && typeof prev.gdpBreakdown === "object") next.gdpBreakdown = prev.gdpBreakdown;
  // A regenerated sheet is a fresh AI compilation of the country in general —
  // it knows nothing of what THIS specific campaign recorded about it. The
  // country's own accumulated history (see gameState.js's polityChanges.stats
  // handling) must survive that regeneration, not just a plain field carried
  // sticky, since a fresh sheet never states one at all.
  if (Array.isArray(prev?.history)) next.history = prev.history;
  const COMPUTED_INDICES = ["economicIndependence", "sovereignty", "foodAutonomy", "energyAutonomy", "internalSecurity"];
  const indices = { ...(prev?.indices && typeof prev.indices === "object" ? prev.indices : {}), ...(next.indices && typeof next.indices === "object" ? next.indices : {}) };
  for (const k of Object.keys(prev?.indices ?? {})) if (k !== "internationalReputation" && !COMPUTED_INDICES.includes(k)) indices[k] = prev.indices[k];
  indices.economicIndependence = Math.round(100 - 0.5 * e.openness - 0.5 * e.sanctionsFaced * 100);
  // How much of its own territory the state actually runs, net of what
  // creditors and sanctioning powers can dictate from outside.
  const debtToOutput = e.debt / output;
  indices.sovereignty = Math.round(clamp(e.administrativeReach - 20 * e.sanctionsFaced - 15 * clamp(debtToOutput / 1.5, 0, 1), 0, 100));
  // Land per head against a technology-scaled subsistence benchmark: the
  // better the yield per hectare, the less land a self-sufficient diet needs.
  const requiredLandPerCapita = 5 / Math.max(1, e.technology);
  const landPerCapita = e.effectiveLand / Math.max(1, e.population);
  indices.foodAutonomy = Math.round(clamp(50 * Math.sqrt(Math.max(0, landPerCapita / requiredLandPerCapita)), 0, 100));
  indices.energyAutonomy = Math.round(clamp(100 - e.energyImportShare, 0, 100));
  // Legitimacy less what actually erodes public order: active war, inflation
  // eating real wages past the point people tolerate, and a demand slump.
  indices.internalSecurity = Math.round(clamp(e.legitimacy - (e.atWar ? 15 : 0) - 40 * clamp(e.expectedInflation - 0.1, 0, 1) - (20 / 0.15) * clamp(-e.outputGap, 0, 0.15), 0, 100));
  if (Object.keys(indices).length) next.indices = indices;
  return next;
};

// Re-pin every polity's PERSISTED stat sheet to its (just-stepped) economy, so
// the sheet never drifts from the panel that computes the same numbers. Prose
// fields are untouched — pinStatSheetToEngine already carries them forward
// from the sheet itself when no separate "previous" is given. Field report:
// a sheet's "public debt: 0.0% GDP" standing next to a moteur panel that
// (correctly) said 9.5% — the sheet was pinned once, at generation, and never
// again as the campaign advanced.
export const repinCountryStats = (countryStats, economies, { language = "English" } = {}) => {
  const stats = countryStats && typeof countryStats === "object" ? countryStats : {};
  const econ = economies && typeof economies === "object" ? economies : {};
  const next = { ...stats };
  for (const [code, sheet] of Object.entries(stats)) {
    if (econ[code] && sheet && typeof sheet === "object") next[code] = pinStatSheetToEngine(sheet, econ[code], { language });
  }
  return next;
};

// ---- forces in being: what the units on the map cost --------------------------------
//
// Until now `militaryUpkeep` (a spending line) and `world.units` (the army on
// the map) never referenced each other: a state could field twenty armies on
// a two-percent budget. What a soldier costs is derived from the economy,
// not from the era's name — a soldier's pay tracks the wage, which tracks
// output per head, and the kit around him grows with know-how (a spear and
// rations at one end; aircraft, vehicles, munitions, pensions at the other).
//
//   cost per soldier-year = output per head × 10^(technology/100)
//
// Two anchors, both from the engine's own fixtures (economy.test.js):
//   · an agrarian empire (1.7 SY per head, technology 14): 1.38 × 1.7 ≈ 2.3 SY
//     per soldier — a legionary's 225 denarii plus rations and kit — so
//     300,000 men cost ~690k SY, ~15% of a revenue of 4.4M SY (Rome under
//     the Principate spent about that share on the army itself; the rest of
//     the military budget was donatives and discharge bonuses);
//   · a modern state (39 SY per head, technology 85): 7.1 × 39 ≈ 275 SY per
//     soldier, so a million troops cost ~275M SY — 2.1% of the output of a
//     330-million-person economy (the United States: 1.3M active, ~3% of
//     GDP; France: 200k active on 60M SY, the fixture's actual budget).
//
// Strength is the map's abstract 0-1000 scale. One point stands for 500
// soldiers, so a strength-100 unit is ~50,000 (a corps, two legions), and a
// strength-1000 unit half a million — the resolution a world map can show.
export const SOLDIERS_PER_STRENGTH_POINT = 500;
const UPKEEP_COST_MULTIPLIER_AT_FULL_TECHNOLOGY = 10;
// Underfunding is a real choice with a real cost: soldiers who are not paid
// desert, are not fed, are not re-equipped. Half the unfunded share is lost
// each year (a force at 50% funding loses a quarter of its strength a year;
// one at 0% loses half — Spain's unpaid tercios did not vanish, they
// mutinied and melted), capped at half a year's strength.
const ATTRITION_PER_UNFUNDED_SHARE = 0.5;
const ATTRITION_CAP_PER_YEAR = 0.5;

export const costPerSoldier = (economy) => {
  const e = normalizeEconomy(economy);
  return outputPerCapita(e) * UPKEEP_COST_MULTIPLIER_AT_FULL_TECHNOLOGY ** (e.technology / 100);
};
export const costPerStrengthPoint = (economy) => costPerSoldier(economy) * SOLDIERS_PER_STRENGTH_POINT;

// The polity's own live units. Units carry the owner's FULL country name
// (gameState.js normalizeUnitEntry), the same key world.economies uses.
const ownerOf = (unit) => str(unit?.ownerCode ?? unit?.owner ?? unit?.country);
export const unitsOf = (units, polity) => {
  const name = str(polity);
  if (!name || !Array.isArray(units)) return [];
  return units.filter((u) => u && typeof u === "object" && ownerOf(u) === name && u.status !== "defeated" && finite(u.strength) > 0);
};

// SY per year the given units need to stay in being. Pass a polity's own
// units (unitsOf); a defeated or zero-strength unit costs nothing.
export const requiredUpkeep = (units, economy) => {
  const list = Array.isArray(units) ? units : [];
  const strength = list.reduce((sum, u) => sum + (u && u.status !== "defeated" ? Math.max(0, finite(u?.strength)) : 0), 0);
  return strength * costPerStrengthPoint(economy);
};

// Required against paid: the funded share and the unfunded remainder.
export const upkeepFunding = (units, economy) => {
  const e = normalizeEconomy(economy);
  const required = requiredUpkeep(units, e);
  const paid = e.militaryUpkeep;
  const fundedShare = required > 0 ? clamp(paid / required, 0, 1) : 1;
  return { required, paid, fundedShare, shortfall: 1 - fundedShare, perStrengthPoint: costPerStrengthPoint(e) };
};

// Share of unit strength lost to underfunding over `years`: the per-year
// rate compounds, so a half-year jump costs about half of a year's loss.
export const attritionOver = (shortfall, years) => {
  const perYear = clamp(ATTRITION_PER_UNFUNDED_SHARE * clamp(finite(shortfall), 0, 1), 0, ATTRITION_CAP_PER_YEAR);
  if (perYear <= 0 || !(years > 0)) return 0;
  return 1 - (1 - perYear) ** years;
};

// ---- stepping a whole world ----------------------------------------------------------

const DAY_MS = 86_400_000;
export const daysBetween = (from, to) => {
  const a = Date.parse(str(from));
  const b = Date.parse(str(to));
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, (b - a) / DAY_MS);
};

// Advance every economy in world.economies by the jump. Returns the new map
// and the flows per polity, for the narrative layer.
// International reputation used to be a number the AI moved and nothing else
// ever read — a polity could be a pariah on the sheet and borrow like a
// trusted one underneath. Standing in the world IS credit risk (the market's
// own reading of default and expropriation risk moves with it), so it drifts
// fiscal credibility toward it a little every period — slowly, like
// credibility itself already moves, not a snap to the reputation number.
const REPUTATION_CREDIBILITY_PULL_PER_YEAR = 0.15;

// Every economy's exchangeRate is an index on the SAME abstract scale (100 at
// seeding, walking with its own PPP/shocks since — see stepEconomy) — so a
// currency's rate against any OTHER currency, or against the world as a
// whole, is already implicit in the numbers the engine has always kept; nothing
// new needs to be invented to compare them. What was missing is any
// consequence: a currency that gets cheaper than the pack should win some
// real export competitiveness (Marshall-Lerner, not just the import-price
// pass-through the engine already had), scaled by how trade-exposed the
// economy actually is (openness) — a real, if modest, reward for staying
// competitive and a real cost for an overvalued currency that prices its own
// exports out, distinct from and on top of ordinary inflation dynamics.
const TRADE_COMPETITIVENESS_ELASTICITY = 0.08;

// The organizationOps "join"/"create" effects already open a member's
// economy (see organizations.js applyOrganizationEffects) — but a UNIVERSAL
// body (the WTO chief among them) counts every recognised state a member
// WITHOUT that state ever going through a join op, so it never earned that
// bump: nominal WTO membership opened nothing. A floor, not a repeating
// shift (idempotent, cannot compound or be undone by a tag), and modest
// enough that only an isolationist or pariah state whose seeded openness
// sits below it is actually affected — a genuinely open economy already
// clears it on its own.
const WTO_MEMBER_OPENNESS_FLOOR = 30;

// The cross-rate between two economies' currencies: how many units of A's
// currency one unit of B's buys, given both indices share the same abstract
// 100-at-seeding scale. >1 means A's currency is weaker than B's.
export const crossExchangeRate = (economyA, economyB) => {
  const a = normalizeEconomy(economyA).exchangeRate;
  const b = normalizeEconomy(economyB).exchangeRate;
  return b > 0 ? a / b : null;
};

// One economy's currency position against the average of every OTHER known
// economy — the same relative-cheapness reading stepWorldEconomies' trade
// competitiveness pass acts on, in plain language. "" when there is nothing
// else known to compare against (a solo economy has no "rest of the world").
export const describeCurrencyPosition = (economy, allEconomies) => {
  const e = normalizeEconomy(economy);
  const all = allEconomies && typeof allEconomies === "object" ? allEconomies : {};
  const rates = Object.values(all).map((o) => normalizeEconomy(o).exchangeRate).filter((r) => Number.isFinite(r) && r > 0);
  if (rates.length < 2) return "";
  const worldRate = rates.reduce((a2, b2) => a2 + b2, 0) / rates.length;
  if (worldRate <= 0) return "";
  const cheapness = (e.exchangeRate - worldRate) / worldRate;
  if (cheapness > 0) return `currency vs the rest of the world: ${pct(cheapness)} cheaper than average — a real export edge, scaled by openness.`;
  if (cheapness < 0) return `currency vs the rest of the world: ${pct(-cheapness)} dearer than average — exports lose some edge for it, scaled by openness.`;
  return "currency vs the rest of the world: at the world average.";
};

// `units` is the world's unit list (world.units). When it is given, every
// polity's forces in being are costed against its militaryUpkeep: the
// shortfall share comes back in flows[name].upkeepShortfall and the strength
// each polity's units lose over this jump in attrition[name] (0-1; the
// CALLER multiplies unit strength by 1 − attrition — the bridge does not own
// the unit list). Omit `units` and none of this runs: no attrition, no line.
export const stepWorldEconomies = (economies, days, { programs = {}, date = "", reputation = {}, organizations = [], units = null } = {}) => {
  const wto = Array.isArray(organizations) ? organizations.find((o) => o?.name === "World Trade Organization" && o.status !== "dissolved") : null;
  const next = {};
  const flows = {};
  const nextPrograms = {};
  const attrition = {};
  const years = Math.max(0, finite(days, 0)) / 365.2425;
  for (const [name, state] of Object.entries(economies && typeof economies === "object" ? economies : {})) {
    let e = normalizeEconomy(state);
    // A tokenised-infrastructure programme moves first: what it built enters
    // the capital stock, what it withdrew leaves the money stock, and what it
    // released is spent into demand — then the economy steps on that.
    const program = normalizeProgram(programs?.[name]);
    if (program && years > 0) {
      const stepped = stepProgram(program, e, { years, date });
      nextPrograms[name] = stepped.program;
      e = applyProgramDelta(e, stepped.economyDelta);
      const output = Math.max(1, economyIndicators(e).output);
      e = normalizeEconomy({ ...e, outputGap: clamp(e.outputGap + 0.3 * finite(stepped.economyDelta.impulse) / output, -0.15, 0.15) });
    } else if (program) {
      nextPrograms[name] = program;
    }
    // Forces in being are costed against the budget BEFORE the step, on the
    // economy that pays them this period; the shortfall is what the army
    // actually went without.
    const upkeep = Array.isArray(units) ? upkeepFunding(unitsOf(units, name), e) : null;
    const stepped = stepEconomy(e, { days, financing: e.financing, sanctions: e.sanctionsFaced });
    let economy = stepped.economy;
    let periodFlows = stepped.flows;
    if (upkeep) {
      periodFlows = { ...periodFlows, requiredUpkeep: upkeep.required, upkeepShortfall: upkeep.shortfall };
      const lost = attritionOver(upkeep.shortfall, years);
      if (lost > 0) attrition[name] = lost;
    }
    const rep = Number(reputation?.[name]);
    if (Number.isFinite(rep) && years > 0) {
      const pull = clamp(REPUTATION_CREDIBILITY_PULL_PER_YEAR * years, 0, 1);
      economy = normalizeEconomy({ ...economy, fiscalCredibility: economy.fiscalCredibility + (clamp(rep, 0, 100) - economy.fiscalCredibility) * pull });
    }
    if (wto && isMember(wto, name) && economy.openness < WTO_MEMBER_OPENNESS_FLOOR) {
      economy = normalizeEconomy({ ...economy, openness: WTO_MEMBER_OPENNESS_FLOOR });
    }
    next[name] = economy;
    flows[name] = periodFlows;
  }
  // Trade competitiveness: a second pass, once every economy has its NEW
  // exchangeRate, so being cheaper or dearer than the world one's own step
  // just produced is what counts — not last period's rates.
  if (years > 0) {
    const rates = Object.values(next).map((e) => e.exchangeRate).filter((r) => Number.isFinite(r) && r > 0);
    const worldRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0;
    if (worldRate > 0) {
      for (const name of Object.keys(next)) {
        const e = next[name];
        const relativeCheapness = clamp((e.exchangeRate - worldRate) / worldRate, -1, 1);
        const boost = TRADE_COMPETITIVENESS_ELASTICITY * relativeCheapness * (e.openness / 100) * years;
        if (boost !== 0) next[name] = normalizeEconomy({ ...e, outputGap: clamp(e.outputGap + boost, -0.15, 0.15) });
      }
    }
  }
  return { economies: next, flows, programs: nextPrograms, attrition };
};

// ---- the briefing the model reads ---------------------------------------------------------

const fmt = (n) => Math.round(finite(n)).toLocaleString("en-US");
const pct = (n) => `${(finite(n) * 100).toFixed(1)}%`;

const describeSystem = (sys) => {
  const s = normalizeMonetarySystem(sys);
  const parts = [`${s.backing === "none" ? "unbacked" : s.backing === "commodity" ? "commodity-backed" : "backed by claims on future revenue"}`,
    `issued by ${s.issuer}`, `rule: ${s.rule}`, s.convertibility > 0 ? `convertible (${Math.round(s.convertibility * 100)}%)` : "not convertible"];
  return `${s.label ? `"${s.label}" — ` : ""}${parts.join(", ")}`;
};

// Forces in being against the budget: from the polity's units when the
// caller has them, else from what the last step recorded in its flows.
const upkeepFor = (economy, units, flows) => {
  if (Array.isArray(units)) return upkeepFunding(units, economy);
  const recorded = Number(flows?.requiredUpkeep);
  if (!Number.isFinite(recorded)) return null;
  const e = normalizeEconomy(economy);
  const fundedShare = recorded > 0 ? clamp(e.militaryUpkeep / recorded, 0, 1) : 1;
  return { required: recorded, paid: e.militaryUpkeep, fundedShare, shortfall: 1 - fundedShare, perStrengthPoint: costPerStrengthPoint(e) };
};
const describeUpkeep = (upkeep) => {
  if (!upkeep || !(upkeep.required > 0)) return "";
  return `forces in being require ${fmt(upkeep.required)} SY/yr; funded at ${pct(upkeep.fundedShare)}`
    + (upkeep.shortfall > 0 ? ` — the unfunded ${pct(upkeep.shortfall)} deserts, starves or rusts at ${pct(attritionOver(upkeep.shortfall, 1))} of strength a year` : "");
};

// One polity, in full: the numbers, the fiscal verdict, the monetary verdict.
// `units` — the polity's OWN units (unitsOf) — prices its forces in being.
export const describeEconomy = (name, economy, { flows = null, full = true, units = null } = {}) => {
  const e = normalizeEconomy(economy);
  const i = economyIndicators(e);
  const lines = [];
  lines.push(`${name}: output ${fmt(i.output)} SY/yr (${i.outputPerCapita} per head, ${fmt(i.population)} people), `
    + `trend growth ${pct(i.trendGrowth)}, prices ${i.priceLevel} (expected inflation ${pct(i.expectedInflation)}), `
    + (i.nonTaxShare > 0
      ? `revenue ${fmt(i.revenue)} (tax ${fmt(i.taxRevenue)}${i.endowmentIncome > 0 ? `, patrimony yield ${fmt(i.endowmentIncome)}` : ""}${i.transfers > 0 ? `, transfers/donations ${fmt(i.transfers)}` : ""}), `
      : `state takes ${pct(i.taxTakeOfOutput)} of output = ${fmt(i.revenue)}, `)
    + `spends ${fmt(i.spending)}, balance ${fmt(i.balance)}; `
    + `debt ${fmt(i.debt)} (${i.debtOfOutput ?? 0}x output, ceiling ${fmt(i.debtCeiling)}) at ${pct(i.interestRate)}; `
    + `legitimacy ${i.legitimacy}, credibility ${i.fiscalCredibility}.`);
  if (i.arrearsShare > 0) {
    lines.push(`  in arrears: ${pct(i.arrearsShare)} of a year's revenue unpaid (${fmt(i.arrears)} SY owed to soldiers, suppliers and pensioners) — legitimacy bleeding until it is paid or covered.`);
  }
  const upkeepLine = describeUpkeep(upkeepFor(e, units, flows));
  if (upkeepLine) lines.push(`  army: ${upkeepLine}.`);
  if (i.endowment > 0 || i.unfundedLiabilities > 0) {
    lines.push(`  patrimony: ${fmt(i.endowment)} SY${e.usdPerSY > 0 ? ` ≈ ${money(i.endowment * e.usdPerSY, "en")}` : ""} yielding ${pct(i.endowmentYield)}`
      + `${i.unfundedLiabilities > 0 ? `; unfunded promises (pensions, arrears) ${fmt(i.unfundedLiabilities)} SY${e.usdPerSY > 0 ? ` ≈ ${money(i.unfundedLiabilities * e.usdPerSY, "en")}` : ""}; net ${fmt(i.netPatrimony)}` : ""}`
      + `${i.financing === "drawdown" ? `; deficits are paid by eating the patrimony${i.yearsOfPatrimonyLeft != null ? ` — gone in about ${i.yearsOfPatrimonyLeft} years at this deficit` : ""}` : ""}.`);
  }
  if (!full) return lines.join("\n");
  lines.push(`  capacities: technology ${Math.round(e.technology)}, administrative reach ${Math.round(e.administrativeReach)}, monetization ${Math.round(e.monetization)}, `
    + `market integration ${Math.round(e.marketIntegration)}, financial depth ${Math.round(e.financialDepth)}, openness ${Math.round(e.openness)}`
    + `${e.atWar ? "; AT WAR (mobilisation tolerated)" : ""}${e.sanctionsFaced > 0 ? `; under sanctions (${Math.round(e.sanctionsFaced * 100)}% of trade cut)` : ""}.`);
  lines.push(`  money: ${describeSystem(e.monetarySystem)}; velocity ${i.velocity}`
    + `${i.backingRatio != null ? `, reserve cover ${pct(i.backingRatio)} (${fmt(e.reserves)} SY${e.usdPerSY > 0 ? ` ≈ ${money(e.reserves * e.usdPerSY, "en")}` : ""} held)` : ""}`
    + `${e.claimsOutstanding > 0 ? `, ${fmt(e.claimsOutstanding)} SY of claims at ${Math.round(claimsPrice(e) * 100)}% of face` : ""}`
    + `${i.policyRate != null ? `, policy rate ${pct(i.policyRate)}` : ""}.`);
  const verdict = explainShortfall(e, annualSpending(e));
  if (!verdict.affordable) {
    const c = verdict.constraints[0];
    lines.push(`  fiscal verdict: spending exceeds revenue by ${fmt(verdict.gap)} SY/yr; the binding constraint is ${c.factor} — ${c.detail}`);
  } else {
    lines.push(`  fiscal verdict: the budget is covered.`);
  }
  const monetaryVerdict = evaluateMonetarySystem(e);
  if (monetaryVerdict.binding && monetaryVerdict.binding.severity > 0.3) lines.push(`  monetary verdict: ${monetaryVerdict.binding.factor} — ${monetaryVerdict.binding.detail}`);
  if (flows) {
    const f = flows;
    const bits = [];
    if (f.drawn > 0) bits.push(`sold or consumed ${fmt(f.drawn)} of the patrimony to cover the deficit`);
    if (f.borrowed > 0) bits.push(`borrowed ${fmt(f.borrowed)}`);
    if (f.minted > 0) bits.push(`created ${fmt(f.minted)} of new money to cover the deficit`);
    if (f.claimsIssued > 0) bits.push(`issued ${fmt(f.claimsIssued)} of revenue claims`);
    if (f.tradeLoss > 0) bits.push(`lost ${pct(f.tradeLoss)} of output to cut trade`);
    if (Math.abs(f.depreciation) > 0.02) bits.push(`currency ${f.depreciation > 0 ? "weakened" : "strengthened"} ${pct(Math.abs(f.depreciation))}`);
    for (const ev of f.events ?? []) bits.push(ev.replace(/-/g, " "));
    lines.push(`  this period: inflation ${pct(f.inflation)}${bits.length ? "; " + bits.join("; ") : ""}.`);
  }
  if (e.innovations.length) {
    lines.push(`  innovations: ${e.innovations.map((n) => `${n.name} (${Math.round(n.adoption * 100)}% adopted)`).join(", ")}.`);
  }
  return lines.join("\n");
};

// The block the simulation prompt receives. Player in full; the powers in
// play in one line each; and the rules of engagement with these numbers.
// `units` is the WORLD's unit list; each polity is priced on its own share of it.
export const buildEconomyBrief = (economies, { playerPolity = "", focus = [], flows = {}, programs = {}, units = null } = {}) => {
  const all = economies && typeof economies === "object" ? economies : {};
  const names = Object.keys(all);
  if (names.length === 0) return "";
  const player = str(playerPolity);
  const own = (name) => (Array.isArray(units) ? unitsOf(units, name) : null);
  const lines = [];
  if (player && all[player]) {
    lines.push(describeEconomy(player, all[player], { flows: flows[player] ?? null, full: true, units: own(player) }));
    const position = describeCurrencyPosition(all[player], all);
    if (position) lines.push(`  ${position}`);
  }
  const progs = programs && typeof programs === "object" ? programs : {};
  for (const [name, program] of Object.entries(progs)) {
    if (all[name] && program) lines.push(describeProgram(program, all[name]).split("\n").map((l) => (name === player ? l : "  " + l)).join("\n"));
  }
  // State the ABSENCE explicitly for the player's own polity too, not just
  // the presence: silence here reads as "the brief didn't mention it" rather
  // than "none exists". Field report: an advisor with no structured output
  // at all filled that ambiguity with an invented, internally-consistent
  // portfolio that persisted purely because it kept quoting its own past reply.
  if (player && all[player] && !progs[player]) {
    lines.push(`${player}: no tokenised-infrastructure programme has been created yet — no projects, no portfolio, nothing to report.`);
  }
  const others = [...new Set([...focus, ...names])].filter((n) => n !== player && all[n]).slice(0, 12);
  if (others.length) {
    lines.push("Other powers (computed):");
    for (const n of others) lines.push("  " + describeEconomy(n, all[n], { flows: flows[n] ?? null, full: false, units: own(n) }));
  }
  return lines.join("\n");
};

export const ECONOMY_RULES_FOR_SIMULATION = `[Economy]
The figures below are COMPUTED by the game's economic engine from land, people, capital, know-how, the reach of the state and the depth of its markets, in subsistence-years (SY: what one person needs to live a year). They are the truth of this world. Never invent a different GDP, revenue, debt or inflation figure; narrate THESE, in era-appropriate terms (denarii, florins, pounds, dollars — convert for colour, keep the proportions).
When the player orders something that costs money, the "fiscal verdict" line already says whether it is covered and, if not, WHICH constraint binds. Write that constraint into the event: the reform takes hold where the state's reach allows and fails where it does not; the army is raised on borrowing at the stated rate, or on new money with the stated inflation; the paper money circulates only as far as the markets are deep. Never resolve an economic initiative as a plain success or a plain failure — give the graded outcome the numbers imply, and name the reason so the player can act on it.
To CHANGE an economy, emit a polityChanges entry with an "economy" field. You may move capacities in points ({"shift":{"administrativeReach":+5}} for a census or a new bureaucracy, {"shift":{"monetization":+8}} for coinage reform, {"shift":{"financialDepth":+6}} for a bank or a bourse, {"shift":{"fiscalCredibility":-15}} for a default) and set policy ({"set":{"taxRate":0.2,"atWar":true,"militaryUpkeep":<SY per year>,"civilSpending":<SY per year>,"financing":"borrow|print|austerity|drawdown","sanctionsFaced":0.0-1.0,"transfers":<SY per year>}}). A state need not live on taxes: "transfers" is what it receives without taxing anyone (donations, foreign aid, a patron's subsidy, tribute — set it, or {"shift":{"transfers":-<SY per year>}} when a scandal or a rupture dries it up), its "patrimony yield" is the return on what it owns ({"shift":{"endowment":+/-<SY>}} for a bequest, a confiscation or an asset sale), and "unfunded promises" are pensions or arrears nobody set money aside for ({"shift":{"unfundedLiabilities":-<SY>}} when a reform funds them). Under "drawdown" a deficit is paid by eating the patrimony — the "patrimony" line says how many years are left at the current deficit; that number is the clock the player is on. People are moved, never set: a plague, a famine, war deaths, a deportation, a refugee inflow or an annexed province's inhabitants are {"shift":{"populationShare":-0.08}} (a signed fraction, capped at ±0.2 per change) or {"shift":{"population":-450000}} (signed people, same cap) — land and capital stay, so the survivors are richer per head and prices rise, as after every real plague. Forces in being cost what the "army" line says — the units on the map, priced per soldier from output per head and know-how — and "militaryUpkeep" is what the state actually pays: when it is below what the forces require, the unfunded share deserts, starves or rusts at up to half its strength a year (the engine removes it from the units), so raising an army without raising the budget is a real choice with a real cost, and "in arrears" (a treasury below zero under austerity) bleeds legitimacy every period it stands. To change what the money IS, send {"monetarySystem":{"backing":"none|commodity|futureClaims","issuer":"mint|banks|treasury|market","rule":"discretionary|taylor|fixed|peg|growthLinked","convertibility":0-1,"claimsHorizon":<years>,"claimsIssuanceShare":<share of the tax base per year>,"label":"<its name>"}} — an invented monetary system is described this way, and the engine will judge it on the same identities as any other. To record an adopted innovation send {"innovations":[{"id":"","name":"","adoption":0-1,"requires":{"<capacity>":<minimum 0-100>}}]}. Capacities move by a few points a year at most; a reform is a shift of 3-10, a revolution 15-25. Output, prices, debt and revenue are never set directly — they follow.
Every polity's exchangeRate index sits on the same abstract scale, so a currency's real position against another (or against the world) is always in these figures — the "currency vs the rest of the world" line states it directly, and it is not decorative: a currency trading cheaper than the world average genuinely wins export competitiveness (feeding output), and one trading dearer genuinely loses some, both scaled by openness. Narrate a competitive devaluation, a strong-currency policy, or a currency war as touching real trade volume and output, not just the price of imports.`;

export const AUTONOMOUS_POWERS_RULES = `[Autonomous Powers]
The other polities are not waiting for the player. Each period, every power in play pursues its OWN aims — a succession, a harvest failure, a border war with a third party, a trade fight, a reform, a purge, an alliance that has nothing to do with the player — whether or not the player spoke to it. At least a third of this period's events must be things other powers did to each other or to themselves, with no player involvement, and they must follow from that power's tags, economy and recent history rather than from what the player is doing. "Its own aims" means its own world — not the player: a power whose only recorded aim is a scheme against the player still has a country, a treasury, a succession, neighbours and a public to attend to, and most of what it does in a period is that. Stories of powers moving AGAINST the player are capped by the engine at a quarter of the edition (one in a short edition); anything beyond is not printed. The player's own apparatus — ministries, envoys, allies, the bodies under the player's authority — carries the player's orders out by default and appears doing so; resistance is a constraint inside a faction's declared scope, not a fresh plot every period. A power's ONGOING scheme — something that unfolds over several periods rather than resolving in one — is not narrated from scratch each time: it is a standing intent, tracked as real state (see [Standing Intents] below), not a tag you hope to retype the same way twice.`;
