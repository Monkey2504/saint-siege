/*! Open Historia — projectFinance: tokenised greenfield infrastructure, judged by the engine © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// A player may decide to fund infrastructure not with sovereign debt but with
// claims on the future cash of assets that do not exist yet: sell tokens on a
// port before the port is built, pay the holders from the port's revenue once
// it earns, keep ownership and control with the state, disburse only against
// verified milestones. This module holds such a PROGRAM as state and judges
// it with the same honesty as the rest of the engine:
//
//   - a token's worth is the present value of cash a project actually earns,
//     not what an expert said it would earn;
//   - an open sale is not a sold sale: uptake depends on the yield offered
//     against the rate money costs, on credibility, on how deep the market is;
//   - a built asset enters the economy's capital stock, so output really rises
//     — and the verdict is whether that rise covers the yield promised;
//   - a social project pays no one back, so it must ride on productive ones
//     whose REALISED yield covers it;
//   - a programme earns the right to bigger projects one success at a time,
//     and loses it faster than it gained it;
//   - a second, price-indexed currency for daily life holds only while the
//     state can actually withdraw money, and a managed conversion channel
//     between the two breeds a black market as soon as the official rate
//     drifts from the market's;
//   - a gold buyback withdraws liquidity only when it is paid for with real
//     revenue or with the foreign money the subscribers brought — paid in
//     freshly issued currency it adds money instead.
//
// Pure, like the rest of the runtime: no store reads, no React, no randomness.
// Amounts are in subsistence-years (SY), the engine's unit; a token is one SY.

import { economyIndicators, normalizeEconomy, realOutput, trendGrowth } from "./economy.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pos = (v, d = 0) => Math.max(0, finite(v, d));
const pct = (v) => clamp(finite(v, 0), 0, 1);
const slug = (name) => lower(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";

export const PROJECT_KINDS = ["productive", "social"];
export const PROJECT_STATUSES = ["proposed", "subscribing", "building", "operating", "failed", "cancelled"];

// The real rate the state's promises are discounted at.
const realRate = (economy) => {
  const e = normalizeEconomy(economy);
  return Math.max(0.005, economyIndicators(e).rMinusG + trendGrowth(e));
};

// ---- shape -------------------------------------------------------------------------

export const normalizeProject = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") return null;
  const name = str(entry.name);
  if (!name) return null;
  const cost = pos(entry.cost);
  return {
    id: str(entry.id) || slug(name) || `project-${index + 1}`,
    name,
    kind: PROJECT_KINDS.includes(lower(entry.kind)) ? lower(entry.kind) : "productive",
    // What is being built, for narration and for what it does to the economy.
    sector: str(entry.sector) || "infrastructure",
    existing: Boolean(entry.existing),                  // brownfield: refused by rule 3
    cost,
    expectedYield: clamp(finite(entry.expectedYield, 0.1), 0, 1), // annual cash / cost once built
    buildYears: clamp(finite(entry.buildYears, 3), 0.25, 30),
    coupledTo: [...new Set((Array.isArray(entry.coupledTo) ? entry.coupledTo : []).map(str).filter(Boolean))],
    status: PROJECT_STATUSES.includes(lower(entry.status)) ? lower(entry.status) : "proposed",
    funded: pos(entry.funded),          // tokens sold against it
    disbursed: pos(entry.disbursed),    // released to construction so far
    progress: pct(entry.progress),      // construction, 0-1
    realizedYield: clamp(finite(entry.realizedYield, 0), 0, 1),
    subscribingYears: pos(entry.subscribingYears),
    delayYears: pos(entry.delayYears),
    startedAt: str(entry.startedAt),
    completedAt: str(entry.completedAt),
    note: str(entry.note),
  };
};

export const normalizeProgram = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const g = entry.governance && typeof entry.governance === "object" ? entry.governance : {};
  const c = entry.conversion && typeof entry.conversion === "object" ? entry.conversion : {};
  const b = entry.goldBuyback && typeof entry.goldBuyback === "object" ? entry.goldBuyback : {};
  return {
    name: str(entry.name) || "Infrastructure token programme",
    tokenLabel: str(entry.tokenLabel) || "investment token",
    currencyBLabel: str(entry.currencyBLabel) || "",
    governance: {
      independentAudit: g.independentAudit !== false,        // rule 2
      publicLedger: g.publicLedger !== false,                // rule 9
      milestoneDisbursement: g.milestoneDisbursement !== false, // rule 4
      revaluationOnCashOnly: g.revaluationOnCashOnly !== false, // rule 2
    },
    // The programme's own record, 0-100: starts at the state's credibility and
    // moves on delivery. Rule 8.
    score: clamp(finite(entry.score, 50), 0, 100),
    largestCompleted: pos(entry.largestCompleted),
    firstTierShareOfOutput: clamp(finite(entry.firstTierShareOfOutput, 0.01), 0.0005, 0.2),
    tokensOutstanding: pos(entry.tokensOutstanding),
    proceedsHeld: pos(entry.proceedsHeld),      // sold but not yet disbursed
    foreignProceedsHeld: pos(entry.foreignProceedsHeld), // the foreign-currency part, usable for buybacks
    cashPaidToHolders: pos(entry.cashPaidToHolders),
    projects: (Array.isArray(entry.projects) ? entry.projects : []).map(normalizeProject).filter(Boolean),
    // Rule 6: currency B indexed to the cost of living, with a managed channel to A.
    currencyB: Boolean(entry.currencyB),
    conversion: {
      managed: c.managed !== false,
      officialRate: Math.max(0.01, finite(c.officialRate, 1)), // B per A
      blackMarketPremium: pct(c.blackMarketPremium),
    },
    // Rule 10.
    goldBuyback: {
      enabled: Boolean(b.enabled),
      thresholdShareOfOutput: clamp(finite(b.thresholdShareOfOutput, 0.03), 0.001, 0.5),
      boughtTotal: pos(b.boughtTotal),
      unfunded: pos(b.unfunded),
    },
    liquidityReleasedThisYear: pos(entry.liquidityReleasedThisYear),
    events: (Array.isArray(entry.events) ? entry.events : []).map(str).filter(Boolean).slice(-30),
  };
};

export const createProgram = (economy, options = {}) => {
  const e = normalizeEconomy(economy);
  return normalizeProgram({ ...options, score: finite(options.score, e.fiscalCredibility) });
};

// Sovereign structuring fee: the state’s cut of capital actually raised,
// credited to its ordinary budget as extraordinary revenue. Taken off the top
// as subscriptions come in — token holders still receive full face value for
// what they paid; only the construction budget sees the other 97%.
const STRUCTURING_FEE_RATE = 0.03;

// How hard simultaneous construction bites execution quality once the load
// gets heavy relative to reach — see stepProgram's buildingLoad/congestion.
const CONGESTION_ELASTICITY = 0.6;

// ---- the valuation the whole thing rests on (rule 5) -----------------------------

// Present value of a project's cash: what it EARNS once built, discounted at
// the real rate, over the asset's life; a project still building counts only
// what has been sunk, discounted for the risk it never finishes.
export const projectValue = (project, economy, { assetLifeYears = 25 } = {}) => {
  const p = normalizeProject(project);
  if (!p) return 0;
  const r = realRate(economy);
  const annuity = (yieldRate, years) => p.cost * yieldRate * (1 - (1 + r) ** -years) / r;
  if (p.status === "operating") return annuity(p.realizedYield, assetLifeYears);
  // Rule 2/5: nothing is worth more than the cash behind it. A project still
  // building counts what has been sunk into it, discounted for the risk it never
  // finishes; a project merely proposed or selling counts nothing (its proceeds
  // sit in the programme's cash and are counted there).
  if (p.status === "building") return p.disbursed * clamp(0.55 + 0.45 * p.progress, 0, 1);
  return 0;
};

export const basketValue = (program, economy) => {
  const prog = normalizeProgram(program);
  if (!prog) return 0;
  return prog.projects.reduce((sum, p) => sum + (p.kind === "productive" ? projectValue(p, economy) : 0), 0) + prog.proceedsHeld;
};

export const tokenPrice = (program, economy) => {
  const prog = normalizeProgram(program);
  if (!prog || prog.tokensOutstanding <= 0) return 1;
  return basketValue(prog, economy) / prog.tokensOutstanding;
};

// ---- eligibility (rules 3, 7, 8) ------------------------------------------------------

export const projectCap = (program, economy) => {
  const prog = normalizeProgram(program);
  const output = realOutput(economy);
  const first = output * (prog?.firstTierShareOfOutput ?? 0.01);
  const earned = prog && prog.largestCompleted > 0 ? prog.largestCompleted * 2 : first;
  const scoreFactor = clamp((prog?.score ?? 50) / 60, 0.25, 1.5);
  return Math.max(first * 0.5, earned * scoreFactor);
};

// Realised yield of the operating productive projects, for coupling.
export const productiveCoverage = (program) => {
  const prog = normalizeProgram(program);
  if (!prog) return 0;
  return prog.projects.filter((p) => p.kind === "productive" && p.status === "operating").reduce((s, p) => s + p.cost * p.realizedYield, 0);
};
export const socialBurden = (program) => {
  const prog = normalizeProgram(program);
  if (!prog) return 0;
  return prog.projects.filter((p) => p.kind === "social" && ["building", "operating", "subscribing"].includes(p.status)).reduce((s, p) => s + p.cost * Math.max(0.05, p.expectedYield), 0);
};

export const checkEligibility = (program, economy, project) => {
  const prog = normalizeProgram(program) ?? createProgram(economy);
  const p = normalizeProject(project);
  const reasons = [];
  if (!p) return { eligible: false, reasons: ["no project"], cap: projectCap(prog, economy) };
  if (p.existing) reasons.push("brownfield: the asset or its revenue already exists — tokenising it is debt in disguise (rule 3); refuse or reformulate as a NEW asset");
  if (p.kind === "productive" && p.expectedYield <= 0) reasons.push("no measurable cash flow once built (rule 3)");
  // A named infrastructure project priced at a tiny fraction of a year's
  // output is not a small project — it is almost always a units slip in the
  // model's own output ("215" meant as "215,000,000" and never scaled up).
  // Catch it here rather than let a six-order-of-magnitude typo become
  // permanent state.
  const output = realOutput(normalizeEconomy(economy));
  const costFloor = Math.max(1000, output * 0.00005);
  // Zero (or negative) is the SAME failure, not a special case exempt from
  // it: a "0 SY" project slipped through here once already, live, because
  // the check only ever fired for a small POSITIVE cost.
  if (p.cost < costFloor) reasons.push(`cost of ${Math.round(p.cost)} SY is implausibly small next to ${Math.round(output)} SY of annual output for a named infrastructure project — this reads like a units/magnitude error (e.g. "215" meant as "215,000,000", or a cost dropped entirely); restate the true cost in full, unabbreviated SY`);
  const cap = projectCap(prog, economy);
  if (p.cost > cap * 1.15) reasons.push(`too large for the programme's record: ${Math.round(p.cost)} SY against a current ceiling of ${Math.round(cap)} SY (rule 8) — deliver a smaller one first`);
  if (p.kind === "social") {
    const need = p.cost * Math.max(0.05, p.expectedYield); // annual running cost
    const coverage = productiveCoverage(prog) - socialBurden(prog);
    if (coverage < need) reasons.push(`a social project needs productive cash to ride on: ${Math.round(need)} SY a year required, ${Math.round(Math.max(0, coverage))} SY a year of REALISED productive yield uncommitted (rule 7) — that is ${Math.round(need / 0.1)} SY of productive capital at 10%`);
  }
  return { eligible: reasons.length === 0, reasons, cap };
};

// ---- subscription (rule 4, honestly) ----------------------------------------------------

// How much of an open sale actually sells in a year: the yield offered
// against the real rate, the programme's record and governance, the depth
// of the domestic market and the openness that lets foreigners in.
export const uptakeRate = (program, economy, project) => {
  const prog = normalizeProgram(program) ?? createProgram(economy);
  const e = normalizeEconomy(economy);
  const p = normalizeProject(project);
  if (!p) return { domestic: 0, foreign: 0, total: 0 };
  const r = realRate(e);
  const gov = prog.governance;
  const governanceBonus = (gov.independentAudit ? 0.1 : -0.15) + (gov.publicLedger ? 0.1 : -0.1) + (gov.milestoneDisbursement ? 0.1 : -0.1);
  const record = prog.score / 100;
  const spread = p.expectedYield * (0.5 + 0.5 * record) - r; // what a holder expects to get, net of what money costs
  const appetite = clamp(0.5 + 4 * spread, 0, 1) * clamp(0.4 + record * 0.6 + governanceBonus, 0.05, 1.2);
  const domestic = clamp(appetite * (0.25 + 0.75 * e.financialDepth / 100) * (0.5 + 0.5 * e.monetization / 100), 0, 1);
  // A foreign holder needs a way to bring earnings home. Inconvertibility
  // blocks capital flight, but the same wall that keeps money in keeps a
  // wary foreign investor's money OUT — real, not decorative: 0% convertible
  // costs foreign uptake 70% of its appetite regardless of how good the deal is.
  const convertibilityFactor = 0.3 + 0.7 * e.monetarySystem.convertibility;
  const foreign = clamp(appetite * (e.openness / 100) * (0.3 + 0.7 * e.fiscalCredibility / 100) * convertibilityFactor, 0, 1);
  return { domestic, foreign, total: clamp(domestic * 0.7 + foreign * 0.6, 0, 1) };
};

// ---- stepping the programme with the economy ----------------------------------------------

// Advance the programme by `years`. Returns the new programme, the changes the
// economy must take (capital built, integration gained, money withdrawn, gold
// bought, credibility moved) and the lines worth narrating.
export const stepProgram = (program, economy, { years = 1, date = "" } = {}) => {
  const prog = normalizeProgram(program);
  if (!prog || years <= 0) return { program: prog, economyDelta: {}, notes: [] };
  const e = normalizeEconomy(economy);
  const output = realOutput(e);
  // Capacity congestion: cement, engineers, and logistics are finite, so
  // several megaprojects under construction AT THE SAME TIME compete for the
  // same scarce capacity — a real cost, not a coincidence of good governance.
  // Measured against how much of a year's output is simultaneously tied up
  // in unfinished construction, and forgiven in proportion to administrative
  // reach: a state that actually runs its whole territory absorbs a heavier
  // simultaneous load than one that only nominally does.
  const buildingLoad = prog.projects.filter((pp) => pp.status === "building").reduce((s, pp) => s + pp.cost, 0) / Math.max(1, output);
  const congestion = clamp(CONGESTION_ELASTICITY * buildingLoad * (1 - e.administrativeReach / 100), 0, 0.5);
  const notes = [];
  let score = prog.score;
  let tokens = prog.tokensOutstanding;
  let proceeds = prog.proceedsHeld;
  let foreignProceeds = prog.foreignProceedsHeld;
  let paid = prog.cashPaidToHolders;
  let released = 0;
  let capitalBuilt = 0;
  let integration = 0;
  let energyAutonomyGain = 0;
  let largestCompleted = prog.largestCompleted;
  let structuringFeeCollected = 0;

  const projects = prog.projects.map((p) => {
    const next = { ...p };
    if (p.status === "subscribing") {
      // Grossed up: the state's cut comes off what is raised, so the sale
      // must clear slightly MORE than the bare construction cost for the NET
      // proceeds reaching the site to still cover it in full (the standard
      // gross-vs-net-proceeds relationship of a fee-bearing issuance).
      const target = p.cost / (1 - STRUCTURING_FEE_RATE);
      const { total, foreign } = uptakeRate(prog, e, p);
      const sold = Math.min(target - p.funded, target * total * Math.min(1, years));
      const fee = sold * STRUCTURING_FEE_RATE;
      next.funded += sold;
      tokens += sold;
      proceeds += sold - fee;
      structuringFeeCollected += fee;
      foreignProceeds += sold * (foreign / Math.max(0.01, total)) * 0.5;
      next.subscribingYears += years;
      if (next.funded >= target * 0.95) {
        next.status = "building"; next.startedAt = date;
        notes.push(`${p.name}: fully subscribed (${Math.round(100 * next.funded / target)}%), construction begins`);
      } else if (next.subscribingYears >= 2) {
        if (next.funded >= target * 0.4) {
          next.status = "building"; next.startedAt = date; next.delayYears += (1 - next.funded / target) * p.buildYears;
          notes.push(`${p.name}: only ${Math.round(100 * next.funded / target)}% subscribed after two years; built in stages, ${next.delayYears.toFixed(1)} years late`);
        } else {
          next.status = "failed"; score = clamp(score - 12, 0, 100);
          notes.push(`${p.name}: the sale failed (${Math.round(100 * next.funded / target)}% subscribed); tokens refunded, the programme's record suffers`);
          // The state's structuring fee, already collected, is not refunded (the
          // pool is programme-wide, not per-project — clamp against overdraw).
          tokens -= next.funded; proceeds = Math.max(0, proceeds - next.funded); next.funded = 0;
        }
      } else {
        notes.push(`${p.name}: ${Math.round(100 * next.funded / target)}% subscribed so far`);
      }
    } else if (p.status === "building") {
      // A staged project keeps selling the unfunded remainder while it builds
      // (same gross-up: see the "subscribing" branch above).
      const target = p.cost / (1 - STRUCTURING_FEE_RATE);
      if (p.funded < target) {
        const { total, foreign } = uptakeRate(prog, e, p);
        const sold = Math.min(target - p.funded, target * total * Math.min(1, years));
        const fee = sold * STRUCTURING_FEE_RATE;
        next.funded += sold; tokens += sold; proceeds += sold - fee;
        structuringFeeCollected += fee;
        foreignProceeds += sold * (foreign / Math.max(0.01, total)) * 0.5;
      }
      // Milestone disbursement: cash leaves the programme only as work is verified.
      const paceYears = p.buildYears + p.delayYears;
      const step = Math.min(1 - p.progress, years / paceYears);
      const tranche = Math.min(proceeds, p.cost * step);
      const gated = prog.governance.milestoneDisbursement ? tranche : Math.min(proceeds, p.cost * step * 1.4); // undisciplined disbursement overpays
      proceeds -= gated; released += gated; next.disbursed += gated;
      // Money leaks in proportion to how loosely it is watched: the work still
      // gets done, but a leakier build is a worse asset (see realizedYield).
      const leakage = (prog.governance.independentAudit ? 0.05 : 0.25) + (prog.governance.milestoneDisbursement ? 0 : 0.1);
      next.progress = clamp(p.progress + Math.min(gated, p.cost * step) / p.cost, 0, 1);
      if (gated < p.cost * step * 0.5 && proceeds <= 0) { next.delayYears += years; notes.push(`${p.name}: construction stalls for want of disbursable funds`); }
      if (next.progress >= 0.999) {
        next.status = "operating"; next.completedAt = date;
        const execution = clamp(0.55 + 0.25 * (e.administrativeReach / 100) + 0.2 * (score / 100), 0.4, 1.05) * (prog.governance.revaluationOnCashOnly ? 1 : 0.9) * (1 - leakage) * (1 - congestion);
        next.realizedYield = clamp(p.expectedYield * execution, 0, 1);
        capitalBuilt += p.cost * (1 - leakage);
        integration += ["port", "road", "rail", "energy", "power", "transport", "infrastructure"].some((k) => lower(p.sector).includes(k)) ? 1 : 0;
        energyAutonomyGain += ["energy", "power"].some((k) => lower(p.sector).includes(k)) ? 4 : 0;
        largestCompleted = Math.max(largestCompleted, p.cost);
        score = clamp(score + (next.delayYears > p.buildYears * 0.3 ? 1 : 4), 0, 100);
        notes.push(`${p.name}: completed${next.delayYears > 0 ? ` ${next.delayYears.toFixed(1)} years late` : ""}; it earns ${Math.round(100 * next.realizedYield)}% a year against ${Math.round(100 * p.expectedYield)}% promised`
          + (congestion > 0.1 ? ` — cement, engineers and logistics were stretched thin across every megaproject running at once, costing it ${Math.round(congestion * 100)}% of its execution quality` : ""));
      }
    } else if (p.status === "operating" && p.kind === "productive") {
      const cash = p.cost * p.realizedYield * years;
      paid += cash;
      if (p.realizedYield < p.expectedYield * 0.6 && !p.note.includes("underperforming")) { next.note = `${p.note} underperforming`.trim(); score = clamp(score - 6, 0, 100); notes.push(`${p.name}: cash falls well short of the expertise; the basket is marked down on cash, as the rule requires`); }
    }
    return next;
  });

  // Rule 7 check every year: social programmes ride on realised productive cash.
  const cover = projects.filter((p) => p.kind === "productive" && p.status === "operating").reduce((s, p) => s + p.cost * p.realizedYield, 0);
  const burden = projects.filter((p) => p.kind === "social" && ["building", "operating"].includes(p.status)).reduce((s, p) => s + p.cost * Math.max(0.05, p.expectedYield), 0);
  if (burden > 0 && cover < burden) { score = clamp(score - 3 * years, 0, 100); notes.push(`social programmes cost ${Math.round(burden)} SY a year but productive projects only earn ${Math.round(cover)}: the coupling rule is broken, the gap comes from the budget`); }

  // Rule 6: the conversion channel. Currency A's market rate follows the token
  // price; an official rate that ignores it opens a black market.
  let conversion = { ...prog.conversion };
  let monetizationShift = 0;
  if (prog.currencyB) {
    const market = tokenPrice({ ...prog, tokensOutstanding: tokens, proceedsHeld: proceeds, projects }, e);
    const premium = conversion.managed ? clamp(Math.abs(market / conversion.officialRate - 1), 0, 1) : 0;
    conversion.blackMarketPremium = premium;
    if (premium > 0.15) { score = clamp(score - 4 * years * premium, 0, 100); monetizationShift = -3 * years * premium; notes.push(`the official A/B rate is ${Math.round(premium * 100)}% off the market's: a black market forms and people leave the official channel`); }
  }

  // Rule 10: the gold buyback withdraws released liquidity above the threshold —
  // out of foreign proceeds or the budget, never out of new issuance.
  const buyback = { ...prog.goldBuyback };
  let goldBought = 0;
  let moneyWithdrawn = 0;
  // How much of a funded buyback came from the STATE's own treasury, as
  // opposed to the programme's foreign proceeds — computed directly here,
  // not backed out from the before/after change in foreignProceeds (which
  // also moves on ordinary subscriptions this same period and would
  // otherwise be misread as a buyback draw).
  let treasuryDrawnForBuyback = 0;
  if (buyback.enabled) {
    const threshold = buyback.thresholdShareOfOutput * output * years;
    const excess = Math.max(0, released - threshold);
    if (excess > 0) {
      const funded = Math.min(excess, foreignProceeds + Math.max(0, e.treasury));
      goldBought = funded; moneyWithdrawn = funded;
      treasuryDrawnForBuyback = Math.max(0, funded - foreignProceeds);
      foreignProceeds = Math.max(0, foreignProceeds - funded);
      buyback.boughtTotal += funded;
      if (funded < excess) { buyback.unfunded += excess - funded; notes.push(`the gold buyback rule triggered on ${Math.round(excess)} SY of liquidity but only ${Math.round(funded)} could be paid for with real money; the rest would have to be printed, which adds money rather than removing it`); }
      else notes.push(`the gold buyback withdrew ${Math.round(funded)} SY of liquidity into reserves`);
    }
  }

  const next = normalizeProgram({
    ...prog, score, tokensOutstanding: tokens, proceedsHeld: proceeds, foreignProceedsHeld: foreignProceeds, cashPaidToHolders: paid,
    projects, largestCompleted, conversion, goldBuyback: buyback, liquidityReleasedThisYear: released / years,
    events: [...prog.events, ...notes.map((n) => `${date || "undated"}: ${n}`)],
  });
  return {
    program: next,
    economyDelta: {
      capital: capitalBuilt, marketIntegration: integration * 1.5, monetization: monetizationShift,
      energyImportShare: -energyAutonomyGain,
      reserves: goldBought, baseMoney: -moneyWithdrawn, treasury: structuringFeeCollected - treasuryDrawnForBuyback,
      fiscalCredibility: (score - prog.score) * 0.3,
      // Cash paid to holders is output that already exists; releasing proceeds is spending into the economy.
      impulse: released,
    },
    notes,
  };
};

// Apply a programme's delta to its economy.
export const applyProgramDelta = (economy, delta) => {
  const e = normalizeEconomy(economy);
  const d = delta && typeof delta === "object" ? delta : {};
  return normalizeEconomy({
    ...e,
    capital: e.capital + finite(d.capital),
    marketIntegration: clamp(e.marketIntegration + finite(d.marketIntegration), 0, 100),
    monetization: clamp(e.monetization + finite(d.monetization), 0, 100),
    energyImportShare: clamp(e.energyImportShare + finite(d.energyImportShare), 0, 100),
    reserves: Math.max(0, e.reserves + finite(d.reserves)),
    baseMoney: Math.max(0, e.baseMoney + finite(d.baseMoney)),
    treasury: e.treasury + finite(d.treasury),
    fiscalCredibility: clamp(e.fiscalCredibility + finite(d.fiscalCredibility), 0, 100),
  });
};

// ---- the levers the simulation (and the player, through it) may pull ---------------------

//   {op:"create", program:{name, tokenLabel, currencyB, currencyBLabel, governance:{...}, goldBuyback:{enabled, thresholdShareOfOutput}, conversion:{officialRate}}}
//   {op:"propose", project:{name, kind, sector, cost, expectedYield, buildYears, existing, coupledTo}}   -> checked, then "subscribing" or refused
//   {op:"cancel", project:"<id or name>"}
//   {op:"setConversion", officialRate, managed}
//   {op:"setBuyback", enabled, thresholdShareOfOutput}
//   {op:"setGovernance", independentAudit, publicLedger, milestoneDisbursement, revaluationOnCashOnly}
export const applyProgramOps = (program, economy, ops) => {
  let prog = normalizeProgram(program);
  const notes = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);
    if (op === "create") { prog = createProgram(economy, { ...(raw.program && typeof raw.program === "object" ? raw.program : raw), projects: prog?.projects ?? [] }); notes.push(`programme "${prog.name}" established`); continue; }
    if (!prog) { notes.push(`no programme exists to ${op} in`); continue; }
    if (op === "propose") {
      const project = normalizeProject(raw.project ?? raw);
      if (!project) continue;
      const verdict = checkEligibility(prog, economy, project);
      if (!verdict.eligible) { notes.push(`${project.name}: REFUSED — ${verdict.reasons.join("; ")}`); continue; }
      const { total } = uptakeRate(prog, economy, project);
      prog = normalizeProgram({ ...prog, projects: [...prog.projects.filter((p) => p.id !== project.id), { ...project, status: "subscribing" }] });
      notes.push(`${project.name}: eligible (ceiling ${Math.round(verdict.cap)} SY); sale opened, expected uptake about ${Math.round(total * 100)}% a year`);
    } else if (op === "cancel") {
      const key = lower(raw.project);
      prog = normalizeProgram({ ...prog, projects: prog.projects.map((p) => (lower(p.id) === key || lower(p.name) === key ? { ...p, status: "cancelled" } : p)) });
    } else if (op === "setconversion") {
      prog = normalizeProgram({ ...prog, conversion: { ...prog.conversion, ...(raw.officialRate !== undefined ? { officialRate: raw.officialRate } : {}), ...(raw.managed !== undefined ? { managed: raw.managed } : {}) } });
    } else if (op === "setbuyback") {
      prog = normalizeProgram({ ...prog, goldBuyback: { ...prog.goldBuyback, ...(raw.enabled !== undefined ? { enabled: raw.enabled } : {}), ...(raw.thresholdShareOfOutput !== undefined ? { thresholdShareOfOutput: raw.thresholdShareOfOutput } : {}) } });
    } else if (op === "setgovernance") {
      prog = normalizeProgram({ ...prog, governance: { ...prog.governance, ...Object.fromEntries(["independentAudit", "publicLedger", "milestoneDisbursement", "revaluationOnCashOnly"].filter((k) => raw[k] !== undefined).map((k) => [k, Boolean(raw[k])])) } });
    }
  }
  return { program: prog, notes };
};

// ---- what the model and the panel read ----------------------------------------------------

const fmt = (n) => Math.round(finite(n)).toLocaleString("en-US");
const pc = (n) => `${(finite(n) * 100).toFixed(1)}%`;

export const describeProgram = (program, economy) => {
  const prog = normalizeProgram(program);
  if (!prog) return "";
  const e = normalizeEconomy(economy);
  const value = basketValue(prog, e);
  const price = tokenPrice(prog, e);
  const cap = projectCap(prog, e);
  const lines = [];
  lines.push(`Programme "${prog.name}": ${fmt(prog.tokensOutstanding)} ${prog.tokenLabel}s outstanding; basket worth ${fmt(value)} SY on CASH (${pc(prog.cashPaidToHolders / Math.max(1, prog.tokensOutstanding))} of face paid out so far) → token price ${price.toFixed(3)}; `
    + `record ${Math.round(prog.score)}/100, largest delivered ${fmt(prog.largestCompleted)} SY, ceiling for the next project ${fmt(cap)} SY; ${fmt(prog.proceedsHeld)} SY sold and not yet disbursed.`);
  lines.push(`  governance: audit ${prog.governance.independentAudit ? "independent" : "POLITICAL"}, ledger ${prog.governance.publicLedger ? "public" : "PRIVATE"}, disbursement ${prog.governance.milestoneDisbursement ? "by verified milestone" : "DISCRETIONARY"}, revaluation ${prog.governance.revaluationOnCashOnly ? "on cash only" : "by opinion"}.`
    + (prog.currencyB ? ` Currency B${prog.currencyBLabel ? ` (${prog.currencyBLabel})` : ""} indexed to the cost of living; A/B channel ${prog.conversion.managed ? `managed at ${prog.conversion.officialRate}` : "free"}${prog.conversion.blackMarketPremium > 0.05 ? `, black-market premium ${pc(prog.conversion.blackMarketPremium)}` : ""}.` : "")
    + (prog.goldBuyback.enabled ? ` Gold buyback above ${pc(prog.goldBuyback.thresholdShareOfOutput)} of output: ${fmt(prog.goldBuyback.boughtTotal)} SY bought${prog.goldBuyback.unfunded > 0 ? `, ${fmt(prog.goldBuyback.unfunded)} SY it could NOT pay for` : ""}.` : ""));
  for (const p of prog.projects.filter((p) => p.status !== "cancelled")) {
    lines.push(`  - ${p.name} [${p.kind}, ${p.sector}] ${fmt(p.cost)} SY, promised ${pc(p.expectedYield)}/yr, ${p.buildYears} yrs: ${p.status}`
      + (p.status === "subscribing" ? ` (${pc(p.funded / p.cost)} subscribed)` : p.status === "building" ? ` (${pc(p.progress)} built${p.delayYears > 0 ? `, ${p.delayYears.toFixed(1)} yrs late` : ""})` : p.status === "operating" ? ` (earning ${pc(p.realizedYield)}/yr → ${fmt(p.cost * p.realizedYield)} SY)` : "")
      + (p.coupledTo.length ? `, coupled to ${p.coupledTo.join(", ")}` : "") + ".");
  }
  const cover = productiveCoverage(prog);
  const burden = socialBurden(prog);
  if (burden > 0) lines.push(`  coupling: social programmes need ${fmt(burden)} SY/yr; realised productive cash ${fmt(cover)} SY/yr → ${cover >= burden ? "covered" : "NOT covered"}.`);
  if (prog.events.length) lines.push(`  recent: ${prog.events.slice(-4).join(" | ")}`);
  return lines.join("\n");
};

// A queued action's own text, checked mechanically (not left to the model's
// judgement) for language describing tokenised or conditional financing. The
// field evidence: an event narrating "emission de tokens greenfield... sans
// ceder la gouvernance... souscription publique sur la blockchain" for a NEW
// port still resolved with an ordinary markerOps:build and no programme —
// the model reached for the older, more familiar lever even with the rule
// documented earlier in the prompt. This lets the caller escalate with a
// short, action-specific directive exactly when it matters, rather than
// trusting recency alone in a very long prompt.
const FINANCING_SIGNAL_TERMS = [
  "tokeniz", "tokenis", "token-financ", "investment token", "revenue-linked", "revenue linked",
  "conditional financing", "no fixed obligation", "milestone disbursement", "greenfield financ",
  "jeton d'investissement", "jetons d'investissement", "financement conditionnel", "engagement conditionnel",
  "obligation conditionnelle", "decaissement par jalon", "décaissement par jalon",
  "decaissement par tranche", "décaissement par tranche", "sans dette", "aucune obligation fixe",
  "emission de tokens", "émission de tokens", "souscription publique", "financement greenfield",
  // Field evidence: the vocabulary an actual playthrough kept using for
  // FOLLOW-UP decrees, once the programme itself already existed and the
  // player no longer felt the need to re-explain the mechanism from scratch.
  "palier", "rwa", "real world asset", "actif reel", "actif réel", "actifs reels", "actifs réels",
  "megaprojet", "mégaprojet", "portefeuille d'infrastructures tokenisees", "portefeuille d'infrastructures tokenisées",
  "monnaie a", "monnaie b", "titrisation", "actif tokenise", "actif tokenisé",
];
// Curly and straight apostrophes both occur in narrated text; match either.
const normalizeApostrophes = (t) => t.replace(/[’‘]/g, "'");
export const describesTokenizedFinancing = (text) => {
  const t = normalizeApostrophes(str(text).toLowerCase());
  return t.length > 0 && FINANCING_SIGNAL_TERMS.some((term) => t.includes(term));
};

export const PROJECT_FINANCE_RULES = `[Tokenised Infrastructure Programmes]
When the player decrees, proposes or negotiates financing that is explicitly conditional or revenue-linked rather than an ordinary loan (“no fixed obligation on the state”, “paid only from the asset’s own revenue”, “tokenised”, “investment certificates”) for something NEW, you MUST route it through the ops below in the SAME event that narrates the decree — create the programme if none exists yet, then propose the project. Narrating the decree’s text without emitting these ops is invalid output: the state’s books stay on ordinary debt (interest accrues, it counts against the debt ceiling) and the decree’s own claim of no fixed obligation becomes false.
A polity may run a programme that funds NEW infrastructure with tokens that are claims on the cash those assets will earn once built — never a share of ownership or control. The engine holds such programmes and judges them; you narrate its verdicts and pull its levers through polityChanges.projectFinance (an array of ops):
{"op":"create","program":{"name":"","tokenLabel":"","currencyB":false,"currencyBLabel":"","governance":{"independentAudit":true,"publicLedger":true,"milestoneDisbursement":true,"revaluationOnCashOnly":true},"goldBuyback":{"enabled":false,"thresholdShareOfOutput":0.03},"conversion":{"officialRate":1,"managed":true}}}
{"op":"propose","project":{"name":"","kind":"productive|social","sector":"port|road|rail|energy|mine|water|health|education|...","cost":<SY>,"expectedYield":<annual cash / cost once built, e.g. 0.12>,"buildYears":3,"existing":false,"coupledTo":["<productive project id>"]}}
{"op":"cancel","project":""} · {"op":"setConversion","officialRate":1,"managed":true} · {"op":"setBuyback","enabled":true,"thresholdShareOfOutput":0.03} · {"op":"setGovernance","independentAudit":true,...}
The engine applies the programme's rules, and you must respect its answers: a project on an asset or revenue that ALREADY exists is brownfield — debt in disguise — and is refused (set "existing":true when that is what was proposed, and narrate the refusal or the reformulation); a project larger than the record allows is refused until a smaller one is delivered; a social project is refused until realised productive cash covers its running cost; an open sale sells only what the yield, the record and the market's depth attract — narrate partial subscriptions and delays as the programme reports them; a completed asset earns what it earns, and the basket is marked on cash, never on opinion; a managed A/B rate that drifts from the market breeds a black market; a gold buyback withdraws liquidity only when paid for with real money. When the player asks for something the rules forbid, do not do it quietly — refuse it in the programme's voice and offer the compliant version. Cost figures are in SY (subsistence-years); convert for colour only.`;
