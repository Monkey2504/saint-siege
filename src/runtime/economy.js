/*! Open Historia — economy: a deterministic macro engine spanning antiquity to the present © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Why this exists.
//
// Until now the economy was narrated, not simulated. The model was asked how a
// player's monetary reform turned out and had no numbers to answer with, so it
// answered from tone: on an easy difficulty everything worked, on a hard one
// everything met "complications". Neither is a verdict. A player who wants to
// invent an economy and find out whether it holds needs an arbiter that cannot
// flatter them, and that can say WHICH constraint bit.
//
// So the arithmetic lives here, and the model only narrates what this returns.
//
// Two design rules follow from that.
//
// RANGE. One engine has to cover Rome in 117, a total war in 1943 and sanctions
// in 2022, which rules out modern aggregates as primitives: there is no
// "unemployment rate" for the Caledonian tribes, and a GDP in dollars is a
// category error two thousand years before the dollar. The primitives are the
// things every economy in every era has — land, people, capital, know-how, how
// far the state's writ and the market's reach extend — in an era-neutral
// numéraire, the SUBSISTENCE-YEAR (SY): what one person needs to live for a
// year (Allen's bare-bones basket; Maddison's $400 floor). Output per head runs
// about 1.5 SY for a subsistence economy, 2 for Rome, 3-4 for Holland in 1700,
// 40+ for a rich country today. Modern aggregates are derived on the way out.
//
// NO PRIVILEGED REGIME. A player may invent a money the world has never used —
// claims on future harvests, a fixed-supply token, a gold peg in 2040. If the
// engine hard-coded "coin" and "central bank with a Taylor rule" it could only
// ever say "that is not one of my two cases". So it does not code regimes; it
// codes the MECHANISMS every monetary arrangement is made of — what backs the
// money, who issues it, by what rule, and whether it can be redeemed — and any
// system, historical or invented, is a point in that space. The gold standard,
// Bretton Woods, fiat with an inflation target, a currency board and a
// securitised-future-revenue money are all configurations, not special cases,
// and the same identities judge each of them.
//
// Calibration. The shape follows the compact macro-historical models that
// reproduce two millennia of Maddison data (Korotayev's world model; Hansen &
// Prescott's land-using and capital-using technologies). The numbers come from
// measured series: Scheidel & Friesen for the Roman fisc (~5% of GDP), Maddison's
// English coin-stock benchmarks for velocity (3-9), Schmelzing's eight centuries
// of safe real rates (9% in the 1400s, ~1% now), Dincecco on fiscal capacity,
// Cagan on hyperinflation, and the WWII record (32-50% of GDP for six years).
//
// Pure and dependency-free: no store reads, no React, no
// clock, no randomness. The same state stepped by the same days always lands
// on the same numbers.

// ---- constants -----------------------------------------------------------------

export const REFERENCE_OUTPUT_PER_CAPITA = 1.5;
export const REFERENCE_LAND_PER_CAPITA = 1.0;   // effective hectares per person
export const REFERENCE_CAPITAL_PER_CAPITA = 1.0; // SY of capital per person

// TFP at technology 100 relative to 0. With deep capital and land out of the
// picture this lands a modern economy near 40 SY per head.
const TFP_AT_FULL_TECHNOLOGY = 6;

// Factor shares slide from land-heavy to capital-heavy with technology: the
// structural transformation is what rising know-how does, not a switch.
const LAND_SHARE_AGRARIAN = 0.55;
const LAND_SHARE_MODERN = 0.05;
const CAPITAL_SHARE_AGRARIAN = 0.10;
const CAPITAL_SHARE_MODERN = 0.40;

// A state with no money economy still takes a share of what it reaches —
// tithes, corvée, cattle. Monetization governs how much more, and how cheaply.
const IN_KIND_TAX_FLOOR = 0.35;

// Velocity. English coin turned over 8.7 times a year in 1282 and 3-5 times
// through the early modern period; deposit money turns over 1.5-2 times.
const VELOCITY_THIN = 8;
const VELOCITY_MONETIZED = 3.5;
const VELOCITY_BANKING = 1.6;

// Cagan: the demand for real balances falls as expected inflation rises, so
// velocity climbs — the engine of every hyperinflation. Capped so the identity
// stays finite while prices go vertical.
// Cagan's 3-7 is per unit of MONTHLY inflation; in annual terms that is ~0.5.
const CAGAN_SEMI_ELASTICITY = 0.5;
const VELOCITY_CAP_MULTIPLIER = 60;
const EXPECTATION_ADAPTATION_PER_YEAR = 0.5;
// How much of this period's money creation the public prices in at once, in
// the deepest markets; a coin economy with no press to read prices in none.
const FORESIGHT_AT_FULL_DEPTH = 0.6;

// Prices walk toward the identity: half the gap closes each year. Rome's
// prices lagged debasement for decades and then broke — that is this lag plus
// the Cagan feedback once expectations move.
const PRICE_ADJUSTMENT_PER_YEAR = 0.5;

// The safe real rate has fallen for six centuries (9.1% in the 15th century,
// 6.1% in the 16th, 4.6% in the 17th, 3.5% in the 18th, ~1% now). What drives
// it is the depth of financial markets, so that is what sets it here.
const REAL_RATE_SHALLOW = 0.09;
const REAL_RATE_DEEP = 0.01;

const TAYLOR_INFLATION_WEIGHT = 0.5;
const TAYLOR_GAP_WEIGHT = 0.5;
export const DEFAULT_INFLATION_TARGET = 0.02;

const GAP_DECAY_PER_YEAR = 0.5;
// Demand can only pull real output so far from potential before it is
// capacity, not demand, that binds; beyond this the push goes into prices.
const GAP_LIMIT = 0.15;
const GAP_FISCAL_MULTIPLIER = 0.6;
const GAP_RATE_SENSITIVITY = 0.6;
const PHILLIPS_SLOPE = 0.4;
// Money-financed demand stops raising real output once inflation is high,
// and beyond ~40% a year (Bruno & Easterly) it destroys it: prices lose their
// information, contracts shorten, capital flees. So the fiscal impulse fades
// out and an inflation drag takes over.
const INFLATION_IMPULSE_FADE = 0.5;   // expected inflation at which the impulse is fully gone
const INFLATION_DRAG_THRESHOLD = 0.2;
const INFLATION_DRAG = 0.3;

// Output per head above which the Malthusian link between surplus and births
// is cut and fertility falls with income instead (Korotayev's demographic
// equation stops holding near $3,500 of 1990, about 8 SY).
const DEMOGRAPHIC_TRANSITION_SY = 8;

// Trade. Losing market access hurts in proportion to openness (Russia 2022:
// openness ~0.25, partial cut, output 3-6 points lower; Iran 2018-21: -2.7%/yr,
// the rial -44%/yr, inflation 36%).
const SANCTION_OUTPUT_ELASTICITY = 0.5;
const SANCTION_DEPRECIATION_PER_YEAR = 0.6;
const IMPORT_PRICE_PASSTHROUGH = 0.5;

// Tanzi-Olivera: taxes are assessed on last period's prices and paid in this
// period's money, so the faster prices move, the less the state collects in
// real terms. At Weimar rates this is what turns high inflation into a
// spiral: the deficit the printing was meant to cover grows as it prints.
// The lag shrinks as collection modernises.
const TANZI_COLLECTION_LAG_YEARS = 0.5;

// A redeemable money survives as long as holders believe the reserves are
// there. Below this cover, with prices already moving, they stop believing.
const CONVERTIBILITY_RUN_COVER = 0.15;

// Bankruptcy is political. A state that stops paying — soldiers, suppliers,
// pensioners — loses consent in proportion to how much it owes them: one full
// year of revenue in arrears costs ~12 points a year (a state that has not
// paid anyone for a year is a state people stop obeying: the Spanish crown's
// 1575 stop drove the Army of Flanders to mutiny and the Sack of Antwerp
// within a year; the 1990s Russian wage-arrears crisis broke the government's
// standing in two). Covering a deficit by creating money is the same theft
// spread thinner — the inflation term below already charges for the prices
// it produces, this charges for the act: 5% of output a year printed costs
// ~4 points a year on its own, so a regime printing 10% (Weimar 1922-23,
// Zimbabwe 2007-08, Venezuela 2016-18) is at ~8/yr before the inflation
// term bites and loses consent within two or three years, as those did.
const ARREARS_LEGITIMACY_PER_YEAR = 12;
const PRINTING_LEGITIMACY_PER_OUTPUT_SHARE = 80;

export const DEFAULT_TAX_RATE = 0.12;
// Real return on a patrimony that is mostly let real estate and a conservative
// portfolio: APSA earned €62 M on €2.6 B net in 2024 (2.4%), university and
// sovereign endowments target 3-5% real. 3% is the middle of that.
export const DEFAULT_ENDOWMENT_YIELD = 0.03;
const DAYS_PER_YEAR = 365.2425;

// ---- helpers ---------------------------------------------------------------------

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const clampPct = (value, fallback = 50) => {
  const n = Number(value);
  return Number.isFinite(n) ? clamp(n, 0, 100) : fallback;
};
const positive = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};
const finite = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const oneOf = (value, options, fallback) => (options.includes(value) ? value : fallback);

// ---- the monetary system ------------------------------------------------------------
//
// Four questions describe any money. The answers are a configuration, and the
// engine judges the configuration; nothing below is a named regime.
//
//   backing   what stands behind a unit —
//               "none"          the issuer's say-so (fiat)
//               "commodity"     a stock of something real, held in reserve
//               "futureClaims"  a pledge of revenue the state expects to collect
//   issuer    who creates it — "mint", "banks", "treasury", "market"
//   rule      how much is created —
//               "discretionary" whatever the deficit needs (the mint, or MMT)
//               "taylor"        a central bank leaning against inflation and the gap
//               "fixed"         a set growth rate, come what may (a bullion economy,
//                               a hard-capped token)
//               "peg"           whatever holds the exchange rate against an anchor
//               "growthLinked"  issuance tied to expected future revenue (the
//                               securitised money case)
//   convertibility  0-1, whether a holder can redeem the unit for the backing
//
// A gold standard is {commodity, mint, fixed, 1}. Bretton Woods is {commodity,
// banks, peg, partial}. Modern fiat is {none, banks, taylor, 0}. A currency
// board is {commodity, banks, peg, 1}. A money made of claims on the next ten
// years' taxes is {futureClaims, treasury, growthLinked, 0} — and the engine
// will say exactly how much of that can be issued before it trades below par.

export const BACKINGS = ["none", "commodity", "futureClaims"];
export const ISSUERS = ["mint", "banks", "treasury", "market"];
export const RULES = ["discretionary", "taylor", "fixed", "peg", "growthLinked"];

export const MONETARY_SYSTEM_DEFAULTS = Object.freeze({
  label: "",                 // what the system is called in this world, for narration
  backing: "none",
  issuer: "mint",
  rule: "discretionary",
  convertibility: 0,
  fixedGrowth: 0.02,         // rule "fixed": base money growth per year
  anchorInflation: 0.02,     // rule "peg": the inflation the anchor imports
  claimsHorizon: 10,         // backing "futureClaims": years of revenue pledged
  claimsIssuanceShare: 0,    // rule "growthLinked": share of the taxable base securitised per year
});

export const normalizeMonetarySystem = (entry) => {
  const raw = entry && typeof entry === "object" ? entry : {};
  const D = MONETARY_SYSTEM_DEFAULTS;
  return {
    label: String(raw.label ?? "").trim(),
    backing: oneOf(raw.backing, BACKINGS, D.backing),
    issuer: oneOf(raw.issuer, ISSUERS, D.issuer),
    rule: oneOf(raw.rule, RULES, D.rule),
    convertibility: clamp(finite(raw.convertibility, D.convertibility), 0, 1),
    fixedGrowth: clamp(finite(raw.fixedGrowth, D.fixedGrowth), -0.5, 1),
    anchorInflation: clamp(finite(raw.anchorInflation, D.anchorInflation), -0.1, 1),
    claimsHorizon: clamp(Math.round(finite(raw.claimsHorizon, D.claimsHorizon)), 1, 100),
    claimsIssuanceShare: clamp(finite(raw.claimsIssuanceShare, D.claimsIssuanceShare), 0, 5),
  };
};

// ---- the shape of an economy ---------------------------------------------------------

export const ECONOMY_DEFAULTS = Object.freeze({
  // --- stocks ---
  population: 1_000_000,
  effectiveLand: 1_000_000,  // effective hectares: arable-weighted, not raw area
  capital: 1_000_000,        // SY of accumulated capital
  treasury: 0,               // SY in hand; negative means arrears
  debt: 0,                   // SY owed to lenders
  baseMoney: 0,              // SY-equivalent of issuer-created money; 0 = seed from the identity
  creditMoney: 0,            // SY-equivalent of money created by bank lending
  claimsOutstanding: 0,      // face value of securitised future revenue in circulation
  reserves: 0,               // SY of commodity held against a backed money
  priceLevel: 100,           // index, 100 at seeding
  exchangeRate: 100,         // index; higher = weaker currency
  expectedInflation: 0,      // annual rate the public expects
  outputGap: 0,              // demand relative to potential, as a fraction
  // A state can live on something other than taxing its own people: a
  // patrimony that yields (the Holy See's APSA estate and portfolio, a
  // sovereign fund, crown lands), inflows nobody here produced (donations,
  // foreign aid, remittances to the treasury, a subsidy from a patron), and it
  // can owe what no lender priced (an unfunded pension, arrears). Stocks in
  // SY, flows in SY per year.
  endowment: 0,              // SY of productive patrimony held by the state
  unfundedLiabilities: 0,    // SY promised (pensions, arrears) with nothing set aside

  // --- capacities, 0-100 ---
  technology: 10,            // what the society knows how to do; drives TFP and factor shares
  administrativeReach: 40,   // how much of its territory the state can assess and enforce in
  monetization: 25,          // how much of the economy runs on money rather than self-consumption
  marketIntegration: 30,     // roads, ports, safe passage, common weights
  financialDepth: 10,        // banks, bond markets, tradable paper; sets the real rate and how money-like a claim is
  fiscalCredibility: 50,     // whether creditors and holders expect promises to be kept
  legitimacy: 60,            // whether the population accepts the state's demands
  openness: 15,              // trade share of output
  energyImportShare: 30,     // share of energy needs sourced from imports or foreign-controlled infrastructure

  // --- policy, set by the player ---
  taxRate: DEFAULT_TAX_RATE,
  investmentShare: 0.06,
  militaryUpkeep: 0,         // SY per year for forces in being
  civilSpending: 0,          // SY per year: roads, doles, courts, schools, pensions
  transfers: 0,              // SY per year received without taxing anyone: donations, aid, tribute, a patron's subsidy
  // SY per year a polity receives from bodies with a purse — a federation
  // remitting to the church that founded it, a sovereign fund paying its
  // state's budget (runtime/treasuries.js). Kept apart from `transfers` because
  // the engine rewrites it every period from what actually moved, while
  // `transfers` is the player's own standing donations. Without it the largest
  // inflow in a campaign reached the treasury and never reached the BALANCE:
  // cash climbed from 8 to 35 million while the page went on printing
  // "−$30M a year", and no figure on it appeared to move.
  bodyTransfers: 0,
  endowmentYield: DEFAULT_ENDOWMENT_YIELD, // real annual return the patrimony throws off
  inflationTarget: DEFAULT_INFLATION_TARGET,
  atWar: false,              // total mobilisation is tolerated; the ceiling on effort lifts
  sanctionsFaced: 0,         // 0-1, share of trade access currently cut by others
  // How deficits are covered: borrow | print | austerity | drawdown. "drawdown"
  // eats the patrimony first — the state sells or consumes what it owns, and
  // next year's yield is smaller for it — and borrows only once it is gone.
  financing: "borrow",
  // Border policy (see runtime/migration.js): open | managed | closed. It
  // scales how much of the computed migration pressure is actually realised,
  // in both directions, and costs something either way.
  migrationPolicy: "managed",
  // Share of a PRIMARY SURPLUS applied to retiring debt each period, rather
  // than banked in the treasury. 1 = a surplus always pays debt down first;
  // 0 = a state that prefers to build a reserve instead (a sovereign fund).
  debtAmortizationShare: 1,
  monetarySystem: MONETARY_SYSTEM_DEFAULTS,

  innovations: [],
});

const normalizeInnovation = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const id = String(entry.id ?? entry.name ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(entry.name ?? id).trim() || id,
    adoption: clamp(finite(entry.adoption, 0), 0, 1),
    adoptedAt: String(entry.adoptedAt ?? "").trim(),
    effects: entry.effects && typeof entry.effects === "object" ? entry.effects : {},
    requires: entry.requires && typeof entry.requires === "object" ? entry.requires : {},
  };
};

export const normalizeEconomy = (entry) => {
  const raw = entry && typeof entry === "object" ? entry : {};
  const D = ECONOMY_DEFAULTS;
  const economy = {
    population: positive(raw.population, D.population),
    effectiveLand: positive(raw.effectiveLand, D.effectiveLand),
    capital: Math.max(0, finite(raw.capital, D.capital)),
    treasury: finite(raw.treasury, D.treasury),
    debt: Math.max(0, finite(raw.debt, D.debt)),
    // moneyStock is accepted as a legacy alias for baseMoney.
    baseMoney: Math.max(0, finite(raw.baseMoney ?? raw.moneyStock, 0)),
    creditMoney: Math.max(0, finite(raw.creditMoney, 0)),
    claimsOutstanding: Math.max(0, finite(raw.claimsOutstanding, 0)),
    reserves: Math.max(0, finite(raw.reserves, 0)),
    priceLevel: positive(raw.priceLevel, D.priceLevel),
    exchangeRate: positive(raw.exchangeRate, D.exchangeRate),
    expectedInflation: clamp(finite(raw.expectedInflation, 0), -0.2, 50),
    outputGap: clamp(finite(raw.outputGap, 0), -GAP_LIMIT, GAP_LIMIT),
    endowment: Math.max(0, finite(raw.endowment, 0)),
    unfundedLiabilities: Math.max(0, finite(raw.unfundedLiabilities, 0)),

    technology: clampPct(raw.technology, D.technology),
    administrativeReach: clampPct(raw.administrativeReach, D.administrativeReach),
    monetization: clampPct(raw.monetization, D.monetization),
    marketIntegration: clampPct(raw.marketIntegration, D.marketIntegration),
    financialDepth: clampPct(raw.financialDepth, D.financialDepth),
    fiscalCredibility: clampPct(raw.fiscalCredibility, D.fiscalCredibility),
    legitimacy: clampPct(raw.legitimacy, D.legitimacy),
    openness: clampPct(raw.openness, D.openness),
    energyImportShare: clampPct(raw.energyImportShare, D.energyImportShare),

    taxRate: clamp(finite(raw.taxRate, DEFAULT_TAX_RATE), 0, 0.9),
    investmentShare: clamp(finite(raw.investmentShare, D.investmentShare), 0, 0.6),
    militaryUpkeep: Math.max(0, finite(raw.militaryUpkeep, 0)),
    civilSpending: Math.max(0, finite(raw.civilSpending, 0)),
    transfers: Math.max(0, finite(raw.transfers, 0)),
    bodyTransfers: Math.max(0, finite(raw.bodyTransfers, 0)),
    endowmentYield: clamp(finite(raw.endowmentYield, D.endowmentYield), 0, 0.2),
    inflationTarget: clamp(finite(raw.inflationTarget, D.inflationTarget), -0.05, 0.5),
    atWar: Boolean(raw.atWar),
    sanctionsFaced: clamp(finite(raw.sanctionsFaced, 0), 0, 1),
    financing: oneOf(raw.financing === "debase" ? "print" : raw.financing, ["borrow", "print", "austerity", "drawdown"], "borrow"),
    migrationPolicy: oneOf(raw.migrationPolicy, ["open", "managed", "closed"], "managed"),
    debtAmortizationShare: clamp(finite(raw.debtAmortizationShare, 1), 0, 1),
    // Where the starting numbers came from: an era prior, or that prior
    // refined once by the model against the polity's actual history.
    seed: oneOf(raw.seed, ["era", "ai"], "era"),
    // Dollars (international, PPP) per subsistence-year, learned once from the
    // model's GDP-per-head estimate so the stat sheet's currency figures can be
    // derived from the engine ever after. 0 = not yet anchored.
    usdPerSY: Math.max(0, finite(raw.usdPerSY, 0)),
    monetarySystem: normalizeMonetarySystem(raw.monetarySystem),

    innovations: Array.isArray(raw.innovations) ? raw.innovations.map(normalizeInnovation).filter(Boolean) : [],
  };
  // Money is seeded from the identity so a new economy starts at price level
  // 100 by construction. Under a banking issuer most of it is deposit money.
  if (economy.baseMoney <= 0 && economy.creditMoney <= 0) {
    const total = (economy.priceLevel / 100) * rawOutput(economy) / velocityOf(economy);
    const bankShare = economy.monetarySystem.issuer === "banks" ? clamp(economy.financialDepth / 100, 0, 0.95) : 0;
    economy.creditMoney = total * bankShare;
    economy.baseMoney = total - economy.creditMoney;
  }
  return economy;
};

// ---- production ---------------------------------------------------------------------

export const factorShares = (economy) => {
  const t = clampPct(economy?.technology, 10) / 100;
  const land = LAND_SHARE_AGRARIAN + (LAND_SHARE_MODERN - LAND_SHARE_AGRARIAN) * t;
  const capital = CAPITAL_SHARE_AGRARIAN + (CAPITAL_SHARE_MODERN - CAPITAL_SHARE_AGRARIAN) * t;
  return { land, capital, labour: 1 - land - capital };
};

export const totalFactorProductivity = (economy) =>
  Math.exp((clampPct(economy?.technology, 10) / 100) * Math.log(TFP_AT_FULL_TECHNOLOGY));

// Potential output per head: a Cobb-Douglas in per-capita terms. Malthus falls
// out on its own — hold land and know-how fixed, raise population, and output
// per head declines.
const rawPotentialPerCapita = (e) => {
  const { land, capital } = factorShares(e);
  return REFERENCE_OUTPUT_PER_CAPITA
    * totalFactorProductivity(e)
    * ((e.effectiveLand / e.population) / REFERENCE_LAND_PER_CAPITA) ** land
    * ((e.capital / e.population) / REFERENCE_CAPITAL_PER_CAPITA) ** capital
    * (0.7 + 0.6 * (clampPct(e.marketIntegration, 30) / 100));
};
const rawOutputPerCapita = (e) => rawPotentialPerCapita(e) * (1 + clamp(finite(e.outputGap, 0), -GAP_LIMIT, GAP_LIMIT));
const rawOutput = (e) => rawOutputPerCapita(e) * e.population;

export const potentialOutputPerCapita = (economy) => rawPotentialPerCapita(normalizeEconomy(economy));
export const outputPerCapita = (economy) => rawOutputPerCapita(normalizeEconomy(economy));
export const realOutput = (economy) => rawOutput(normalizeEconomy(economy));

// ---- money ------------------------------------------------------------------------------

// Structural velocity: thin coin -> monetized coin -> deposit money.
const structuralVelocity = (e) => {
  const m = clampPct(e.monetization, 25) / 100;
  const coin = VELOCITY_THIN + (VELOCITY_MONETIZED - VELOCITY_THIN) * m;
  const banked = clamp((clampPct(e.financialDepth, 10) / 100 - 0.2) / 0.6, 0, 1);
  return coin + (VELOCITY_BANKING - coin) * banked;
};

// Velocity with Cagan's feedback: people hold less money the faster they
// expect it to lose value.
export const velocityOf = (economy) => {
  const e = economy && typeof economy === "object" ? economy : {};
  const base = structuralVelocity(e);
  const expected = clamp(finite(e.expectedInflation, 0), -0.2, 50);
  return Math.min(base * VELOCITY_CAP_MULTIPLIER, base * Math.exp(CAGAN_SEMI_ELASTICITY * Math.max(0, expected)));
};

// The neutral real rate: what safe money costs before the state's own record
// is priced in. Falls with financial depth — six centuries in one line.
export const neutralRealRate = (economy) =>
  REAL_RATE_SHALLOW + (REAL_RATE_DEEP - REAL_RATE_SHALLOW) * (clampPct(economy?.financialDepth, 10) / 100);

// Trend real growth, for r - g.
export const trendGrowth = (economy) => {
  const e = normalizeEconomy(economy);
  const y = rawPotentialPerCapita(e);
  const depreciation = 0.02 + 0.04 * (e.technology / 100);
  const { capital } = factorShares(e);
  const k = e.capital / e.population;
  const capitalGrowth = k > 0 ? e.investmentShare * y / k - depreciation : 0;
  return clamp(capital * capitalGrowth + intrinsicPopulationGrowth(e), -0.1, 0.15);
};

// What future revenue is actually worth today: the taxable base the state can
// collect (not the output it cannot), grown at trend, discounted at the real
// rate it borrows at, over the pledged horizon, weighted by whether anyone
// believes the pledge. This is the ceiling on any money made of promises.
export const pledgeableValue = (economy) => {
  const e = normalizeEconomy(economy);
  const base = taxableBase(e);
  const g = trendGrowth(e);
  const r = Math.max(0.005, realBorrowingRate(e));
  let sum = 0;
  for (let t = 1; t <= e.monetarySystem.claimsHorizon; t += 1) sum += ((1 + g) / (1 + r)) ** t;
  return base * sum * (e.fiscalCredibility / 100);
};

// What a unit of securitised revenue trades at: par while the pledge covers
// the paper, a discount as soon as it does not.
export const claimsPrice = (economy) => {
  const e = normalizeEconomy(economy);
  if (e.claimsOutstanding <= 0) return 1;
  return clamp(pledgeableValue(e) / e.claimsOutstanding, 0, 1);
};

// How money-like a tradable claim is: it only circulates where there is a
// market to pass it in.
const claimMoneyness = (e) => 0.2 + 0.8 * (clampPct(e.financialDepth, 10) / 100);

// Everything that functions as money, at what it is actually worth.
export const effectiveMoney = (economy) => {
  const e = normalizeEconomy(economy);
  return e.baseMoney + e.creditMoney + e.claimsOutstanding * claimsPrice(e) * claimMoneyness(e);
};

// Reserve cover of a backed money.
export const backingRatio = (economy) => {
  const e = normalizeEconomy(economy);
  if (e.monetarySystem.backing !== "commodity") return null;
  const money = effectiveMoney(e);
  return money > 0 ? e.reserves / money : 1;
};

export const impliedPriceLevel = (economy) => {
  const e = normalizeEconomy(economy);
  const output = rawOutput(e);
  return output > 0 ? 100 * (effectiveMoney(e) * velocityOf(e)) / output : e.priceLevel;
};

// A policy rate exists only under a rule that sets one.
export const policyRate = (economy) => {
  const e = normalizeEconomy(economy);
  if (e.monetarySystem.rule !== "taylor") return null;
  const expected = e.expectedInflation;
  return Math.max(0, neutralRealRate(e) + expected
    + TAYLOR_INFLATION_WEIGHT * (expected - e.inflationTarget) + TAYLOR_GAP_WEIGHT * e.outputGap);
};

// ---- the fisc -----------------------------------------------------------------------------

export const taxableBase = (economy) => {
  const e = normalizeEconomy(economy);
  return rawOutput(e) * (e.administrativeReach / 100) * (IN_KIND_TAX_FLOOR + (1 - IN_KIND_TAX_FLOOR) * e.monetization / 100);
};

// Real revenue erodes with expected inflation through the collection lag.
const tanziErosion = (e) => {
  const lag = TANZI_COLLECTION_LAG_YEARS * (1 - 0.6 * (clampPct(e.financialDepth, 10) / 100));
  return 1 / (1 + Math.max(0, finite(e.expectedInflation, 0)) * lag);
};

export const taxRevenue = (economy) => {
  const e = normalizeEconomy(economy);
  return taxableBase(e) * e.taxRate * tanziErosion(e);
};

// What the state receives WITHOUT taxing its own people: the yield on what it
// owns, and what others give it. Neither erodes through a collection lag —
// rent and a donation arrive as money, not as an assessment.
export const endowmentIncome = (economy) => {
  const e = normalizeEconomy(economy);
  return e.endowment * e.endowmentYield;
};
export const nonTaxRevenue = (economy) => {
  const e = normalizeEconomy(economy);
  return endowmentIncome(e) + e.transfers + e.bodyTransfers;
};

export const annualRevenue = (economy) => {
  const e = normalizeEconomy(economy);
  return taxRevenue(e) + nonTaxRevenue(e);
};

// The tax rate a society will bear before collection turns coercive and
// legitimacy bleeds. Rome managed ~5% of output; a modern peacetime state
// 40-47%; at total war Britain TAXED about half of output and borrowed the
// rest — the 75% Germany reached in 1944 was plunder and forced saving, not
// tax. On the assessed base, so it composes with reach.
// A state the population sees as legitimate is trusted further before the
// same rate reads as extraction rather than a fair ask — and overreach is
// what erodes legitimacy in the first place (see stepEconomy below), so a
// state that once taxes past what it is trusted for tightens its own future
// ceiling: a real feedback, not a one-off penalty.
const LEGITIMACY_CEILING_FLOOR = 0.6;
export const maxTaxEffort = (economy) => {
  const e = normalizeEconomy(economy);
  const modern = (e.administrativeReach / 100) * (e.monetization / 100);
  const base = clamp(0.35 + 0.15 * modern + (e.atWar ? 0.05 * modern : 0), 0.35, 0.9);
  return base * (LEGITIMACY_CEILING_FLOOR + (1 - LEGITIMACY_CEILING_FLOOR) * (e.legitimacy / 100));
};

export const administrativeCost = (economy) => {
  const e = normalizeEconomy(economy);
  return annualRevenue(e) * (0.10 + 0.25 * (1 - e.administrativeReach / 100));
};

// Claims are debt in another dress; lenders price them as such. The burden
// premium is capped: Greece paid ~30% at the worst of 2012, not 140%.
const BURDEN_PREMIUM_CAP = 0.25;
// Reserves price into the spread creditors charge even with no convertibility
// to defend: a visible hard-asset buffer is exactly what rating agencies read
// as external-shock capacity, independent of the exchange regime. A declared
// "backed" currency sitting on no reserves at all earns none of that discount.
const RESERVE_RATE_DISCOUNT_CAP = 0.02;
const reserveDiscount = (e) => {
  const cover = backingRatio(e);
  return cover == null ? 0 : RESERVE_RATE_DISCOUNT_CAP * clamp(cover, 0, 1);
};

// What creditors weigh the debt against: not only the tax base but everything
// the state collects — a patrimony's yield and standing transfers service debt
// as well as a tax does. An unfunded promise (a pension nobody set money aside
// for) counts on the other side: it is a claim on the same revenue, priced as
// such since the rating agencies started reading pension notes.
// Non-tax revenue is expressed as the base a typical modern take (25% of the
// assessed base) would need to raise it, so a rent-fed state and a tax-fed one
// are weighed on one scale.
const REFERENCE_TAKE_OF_BASE = 0.25;
const serviceableRevenueBase = (e) => taxableBase(e) + nonTaxRevenue(e) / REFERENCE_TAKE_OF_BASE;

const realBorrowingRate = (e) => {
  const base = serviceableRevenueBase(e);
  const burden = base > 0 ? (e.debt + e.claimsOutstanding + e.unfundedLiabilities) / base : 10;
  const premium = Math.min(BURDEN_PREMIUM_CAP, 0.03 * Math.max(0, burden - 1) ** 1.5);
  return neutralRealRate(e) + 0.10 * (1 - e.fiscalCredibility / 100) + premium - reserveDiscount(e);
};

// Nominal rate the state borrows at; under a policy rule the policy rate is a floor.
export const interestRate = (economy) => {
  const e = normalizeEconomy(economy);
  const nominal = realBorrowingRate(e) + Math.max(0, e.expectedInflation);
  const floor = policyRate(e);
  return floor == null ? nominal : Math.max(nominal, floor);
};

// Reinhart & Rogoff's "debt intolerance": the ceiling is not a constant but
// revenue capacity, credibility, the depth of the domestic investor base —
// and it recedes when the economy outgrows its interest (r < g: Japan).
export const debtCeiling = (economy) => {
  const e = normalizeEconomy(economy);
  const credibility = e.fiscalCredibility / 100;
  const depth = clamp((e.monetization / 100) * (0.4 + 0.6 * e.financialDepth / 100), 0, 1);
  const rMinusG = realBorrowingRate(e) - trendGrowth(e);
  const relief = clamp(1 + 4 * Math.max(0, -rMinusG) / 0.02, 1, 3);
  return Math.max(0, serviceableRevenueBase(e) * (0.3 + 3.5 * credibility * depth) * relief - e.claimsOutstanding - e.unfundedLiabilities);
};

// The patrimony net of what is promised against it. Negative = the state owes
// more than it owns before a single lender is counted.
export const netPatrimony = (economy) => {
  const e = normalizeEconomy(economy);
  return e.endowment - e.unfundedLiabilities;
};

// At the current deficit, how many years before the patrimony is gone under a
// drawdown — each year's draw also removes that year's yield, so it runs out
// faster than a straight division says. null when there is no deficit or no
// patrimony to draw on.
export const yearsOfPatrimonyLeft = (economy) => {
  const e = normalizeEconomy(economy);
  const deficit = -fiscalBalance(e);
  if (deficit <= 0 || e.endowment <= 0) return null;
  let stock = e.endowment;
  let years = 0;
  while (stock > 0 && years < 200) {
    // the deficit widens as the yield on the shrinking stock falls away
    stock -= deficit + (e.endowment - stock) * e.endowmentYield;
    years += 1;
  }
  return years;
};

export const annualSpending = (economy) => {
  const e = normalizeEconomy(economy);
  return e.militaryUpkeep + e.civilSpending + administrativeCost(e) + e.debt * interestRate(e);
};

export const fiscalBalance = (economy) => annualRevenue(economy) - annualSpending(economy);

// ---- demography ------------------------------------------------------------------------------

const intrinsicPopulationGrowth = (e) => {
  const y = rawOutputPerCapita(e);
  // Below the transition people multiply on the surplus. This is the rate
  // BETWEEN plagues and famines; the mortality shocks that held the long-run
  // average near zero are the narrative layer's to deal.
  if (y < DEMOGRAPHIC_TRANSITION_SY) return clamp((y - 1) * 0.01, -0.03, 0.012);
  const past = clamp((y - DEMOGRAPHIC_TRANSITION_SY) / 30, 0, 1);
  return 0.012 * (1 - past) - 0.005 * past;
};

// ---- stepping the economy forward ----------------------------------------------------------------

// Advance an economy by `days`.
//   financing  how a deficit is covered once the monetary rule has had its say —
//     "borrow"    issue debt up to the ceiling; the rest is printed
//     "print"     create base money for the shortfall ("debase" is an alias)
//     "austerity" cover nothing; run the treasury into arrears
//   sanctions  0-1, how much of the economy's trade access is cut this period
export const stepEconomy = (economy, {
  days = DAYS_PER_YEAR,
  financing = "borrow",
  sanctions = 0,
  populationGrowth = null,
  technologyDrift = 0,
} = {}) => {
  const e = normalizeEconomy(economy);
  const years = Math.max(0, finite(days, 0)) / DAYS_PER_YEAR;
  if (years === 0) return { economy: e, flows: emptyFlows() };
  const sys = e.monetarySystem;
  const cut = clamp(finite(sanctions, 0), 0, 1);
  const openness = e.openness / 100;
  const events = [];

  // --- real side ---
  const tradeLoss = SANCTION_OUTPUT_ELASTICITY * openness * cut;
  const output = rawOutput(e) * (1 - tradeLoss);

  // --- the fisc ---
  // Cut trade hits what the country produces; a rent or a gift arrives anyway.
  const revenue = (taxRevenue(e) * (1 - tradeLoss) + nonTaxRevenue(e)) * years;
  const interest = e.debt * interestRate(e) * years;
  const admin = administrativeCost(e) * years;
  const military = e.militaryUpkeep * years;
  const civil = e.civilSpending * years;
  const spending = interest + admin + military + civil;

  let treasury = e.treasury + revenue - spending;
  let debt = e.debt;
  let baseMoney = e.baseMoney;
  let creditMoney = e.creditMoney;
  let claimsOutstanding = e.claimsOutstanding;
  let reserves = e.reserves;
  let endowment = e.endowment;
  let convertibility = sys.convertibility;
  let rule = sys.rule;
  let borrowed = 0;
  let drawn = 0;
  let minted = 0;
  let claimsIssued = 0;
  let claimsProceeds = 0;

  // --- the monetary rule creates money on its own terms first ---
  let creditGrowth = 0;
  if (rule === "growthLinked") {
    // Securitise a slice of expected revenue: the treasury sells claims at
    // what the market thinks they are worth, which is par only while the
    // pledge still covers the paper.
    claimsIssued = sys.claimsIssuanceShare * taxableBase(e) * years;
    claimsOutstanding += claimsIssued;
    claimsProceeds = claimsIssued * claimsPrice({ ...e, claimsOutstanding });
    treasury += claimsProceeds;
  } else if (rule === "taylor") {
    const stance = policyRate(e) - (neutralRealRate(e) + e.expectedInflation);
    creditGrowth = (trendGrowth(e) + e.inflationTarget) - 0.8 * stance;
  } else if (rule === "fixed") {
    creditGrowth = sys.fixedGrowth;
  } else if (rule === "peg") {
    creditGrowth = trendGrowth(e) + sys.anchorInflation;
  }
  if (sys.issuer === "banks") creditMoney *= Math.max(0.5, 1 + creditGrowth * years);
  else baseMoney *= Math.max(0.5, 1 + creditGrowth * years);

  // A primary surplus retires debt before it is ever banked.
  let amortized = 0;
  if (treasury > 0 && debt > 0) {
    amortized = Math.min(debt, treasury * e.debtAmortizationShare);
    debt -= amortized;
    treasury -= amortized;
  }

  // --- then the deficit is covered ---
  const mode = financing === "debase" ? "print" : financing;
  if (treasury < 0) {
    // A drawdown state eats its patrimony first — it sells or spends what it
    // owns — and only borrows once that is gone. The yield lost with it is
    // next year's problem, which is exactly the real spiral.
    if (mode === "drawdown" && endowment > 0) {
      drawn = Math.min(-treasury, endowment);
      endowment -= drawn;
      treasury += drawn;
    }
  }
  if (treasury < 0) {
    const shortfall = -treasury;
    if (mode === "borrow" || mode === "drawdown") {
      const room = Math.max(0, debtCeiling({ ...e, claimsOutstanding }) - debt);
      borrowed = Math.min(shortfall, room);
      debt += borrowed;
      treasury += borrowed;
      if (treasury < 0) { minted = -treasury; baseMoney += minted; treasury = 0; }
    } else if (mode === "print") {
      minted = shortfall; baseMoney += minted; treasury = 0;
    }
  }
  if (minted > 0 && (rule === "fixed" || rule === "peg")) events.push("rule-broken");
  // Only austerity leaves the treasury below zero: borrowing and printing
  // always cover the rest. What is left unpaid is arrears — real people not paid.
  if (treasury < 0) events.push("arrears");

  // --- a backed money can be run on, and a peg can break ---
  const moneyNow = baseMoney + creditMoney + claimsOutstanding * claimsPrice({ ...e, claimsOutstanding }) * claimMoneyness(e);
  if (sys.backing === "commodity") {
    // Redemptions and sanctions drain reserves; a peg leaks them whenever
    // domestic prices outrun the anchor.
    const leak = rule === "peg" ? Math.max(0, e.expectedInflation - sys.anchorInflation) * moneyNow : 0;
    reserves = Math.max(0, reserves - (leak + 0.3 * cut * reserves + 0.5 * minted * convertibility) * years);
    const cover = moneyNow > 0 ? reserves / moneyNow : 1;
    if (convertibility > 0 && cover < CONVERTIBILITY_RUN_COVER && e.expectedInflation > 0.03) {
      convertibility = 0;
      events.push("convertibility-suspended");
    }
    if (rule === "peg" && reserves <= 0) {
      rule = "discretionary";
      events.push("peg-broken");
    }
  }

  // --- demand ---
  const impulse = output > 0 ? (spending - revenue - claimsProceeds) / years / output : 0;
  const realPolicy = rule === "taylor" ? policyRate(e) - e.expectedInflation - neutralRealRate(e) : 0;
  const expected = Math.max(0, e.expectedInflation);
  const impulseWeight = clamp(1 - expected / INFLATION_IMPULSE_FADE, 0, 1);
  const drag = INFLATION_DRAG * Math.max(0, expected - INFLATION_DRAG_THRESHOLD);
  const outputGap = clamp(
    e.outputGap * (1 - GAP_DECAY_PER_YEAR) ** years
      + (GAP_FISCAL_MULTIPLIER * impulse * impulseWeight - GAP_RATE_SENSITIVITY * realPolicy - drag) * Math.min(1, years),
    -GAP_LIMIT, GAP_LIMIT);

  // --- capital, people, know-how ---
  const depreciationRate = 0.02 + 0.04 * (e.technology / 100);
  const investment = output * e.investmentShare * years;
  const capital = Math.max(0, e.capital + investment - e.capital * depreciationRate * years);
  const growth = populationGrowth == null ? intrinsicPopulationGrowth(e) : finite(populationGrowth, 0);
  const population = Math.max(1, e.population * (1 + growth * years));
  const technology = clampPct(e.technology + finite(technologyDrift, 0) * years, e.technology);

  // --- the exchange rate ---
  const foreignInflation = sys.anchorInflation;
  const held = rule === "peg" && !events.includes("peg-broken");
  const ppp = held ? 1 : (1 + Math.max(-0.5, e.expectedInflation)) / (1 + foreignInflation);
  const shock = held ? 1 : 1 + SANCTION_DEPRECIATION_PER_YEAR * cut;
  const broke = events.includes("peg-broken") ? 1.3 : 1;
  const exchangeRate = e.exchangeRate * ppp ** years * shock ** years * broke;
  const depreciation = exchangeRate / e.exchangeRate - 1;

  // --- prices ---
  const next = { ...e, capital, population, technology, baseMoney, creditMoney, claimsOutstanding, reserves, endowment,
    debt, treasury, outputGap, exchangeRate, monetarySystem: { ...sys, convertibility, rule } };
  const target = impliedPriceLevel(next);
  const closed = 1 - (1 - PRICE_ADJUSTMENT_PER_YEAR) ** years;
  const walked = e.priceLevel + (target - e.priceLevel) * closed;
  const priceLevel = Math.max(1, walked
    * (1 + PHILLIPS_SLOPE * outputGap * years)
    * (1 + IMPORT_PRICE_PASSTHROUGH * openness * Math.max(0, depreciation)));
  const inflation = (priceLevel / e.priceLevel) ** (1 / years) - 1;
  // Expectations adapt to what happened — and, where markets are deep enough
  // to read a budget, they also look FORWARD: money created this period is
  // inflation people price in before it reaches the shops. That foresight is
  // what lets a large money-financed deficit accelerate into a spiral rather
  // than settle (Sargent's "ends of four big inflations": the public prices
  // the regime, not the last print). Bad news is anticipated; good news is
  // waited for. Under a credible target with a banking system to transmit it,
  // expectations are pulled back toward the target as well.
  const adapted = e.expectedInflation + (inflation - e.expectedInflation) * (1 - (1 - EXPECTATION_ADAPTATION_PER_YEAR) ** years);
  const moneyBefore = effectiveMoney(e);
  const moneyGrowth = moneyBefore > 0 && years > 0 ? (moneyNow / moneyBefore - 1) / years : 0;
  const anticipated = moneyGrowth - trendGrowth(e);
  const foresight = anticipated > adapted ? FORESIGHT_AT_FULL_DEPTH * (e.financialDepth / 100) : 0;
  const lookedAhead = adapted + (anticipated - adapted) * foresight;
  const anchor = rule === "taylor" ? clamp(0.4 * (e.financialDepth / 100) * (e.fiscalCredibility / 100) * years, 0, 1) : 0;
  const expectedInflation = clamp(lookedAhead + (e.inflationTarget - lookedAhead) * anchor, -0.2, 50);

  // --- trust ---
  const overreach = Math.max(0, e.taxRate - maxTaxEffort(e));
  const printedShare = output > 0 ? minted / years / output : 0;
  // Arrears as a share of a year's revenue: what the state has not paid,
  // against what it collects. Both bleed legitimacy (see the constants).
  const arrearsShare = arrearsShareOf(treasury, revenue / years);
  const legitimacy = clampPct(e.legitimacy + (-40 * overreach - 8 * Math.max(0, inflation - 0.1)
    - ARREARS_LEGITIMACY_PER_YEAR * arrearsShare - PRINTING_LEGITIMACY_PER_OUTPUT_SHARE * printedShare + 1) * years, e.legitimacy);
  const parLoss = 1 - claimsPrice(next);
  const shocks = (events.includes("convertibility-suspended") ? 10 : 0) + (events.includes("peg-broken") ? 15 : 0)
    + (events.includes("rule-broken") ? 5 : 0);
  // Eating one's patrimony to pay the bills is read for what it is: the
  // faster the draw, the less anyone believes next year is covered. And a
  // state whose unfunded promises exceed what it owns is watched as one that
  // will, one day, not pay someone.
  const drawShare = e.endowment > 0 ? drawn / years / e.endowment : 0;
  const overpromised = e.unfundedLiabilities > e.endowment && e.unfundedLiabilities > 0 ? 1 : 0;
  const fiscalCredibility = clampPct(
    e.fiscalCredibility + ((treasury < 0 ? -6 : drawn > 0 ? 0 : 0.5) - 60 * printedShare - 20 * parLoss - 15 * drawShare - overpromised) * years - shocks,
    e.fiscalCredibility);

  return {
    economy: normalizeEconomy({ ...next, priceLevel, expectedInflation, legitimacy, fiscalCredibility }),
    flows: {
      years, output, revenue, spending, interest, admin, military, civil,
      balance: revenue - spending, borrowed, drawn, minted, amortized, claimsIssued, claimsProceeds, claimsPrice: claimsPrice(next),
      investment, creditGrowth, inflation, priceLevel, depreciation, exchangeRate, outputGap,
      populationGrowth: growth, tradeLoss, policyRate: policyRate(e), arrearsShare, events,
    },
  };
};

const emptyFlows = () => ({
  years: 0, output: 0, revenue: 0, spending: 0, interest: 0, admin: 0, military: 0, civil: 0,
  balance: 0, borrowed: 0, drawn: 0, minted: 0, amortized: 0, claimsIssued: 0, claimsProceeds: 0, claimsPrice: 1,
  investment: 0, creditGrowth: 0, inflation: 0, priceLevel: 100, depreciation: 0, exchangeRate: 100, outputGap: 0,
  populationGrowth: 0, tradeLoss: 0, policyRate: null, arrearsShare: 0, events: [],
});

// Unpaid obligations as a share of a year's revenue, 0-1. A negative treasury
// IS arrears (see ECONOMY_DEFAULTS); a state with nothing coming in and
// anything unpaid is fully in arrears.
const arrearsShareOf = (treasury, annualRevenueNow) => {
  if (!(treasury < 0)) return 0;
  return annualRevenueNow > 0 ? clamp(-treasury / annualRevenueNow, 0, 1) : 1;
};
export const arrearsShare = (economy) => {
  const e = normalizeEconomy(economy);
  return arrearsShareOf(e.treasury, annualRevenue(e));
};

// ---- verdicts ---------------------------------------------------------------------------------------

// When something cannot be afforded, say WHICH number is in the way and what it
// would take. Sorted tightest first.
export const explainShortfall = (economy, requiredAnnualSpend) => {
  const e = normalizeEconomy(economy);
  const required = Math.max(0, finite(requiredAnnualSpend, 0));
  const revenue = annualRevenue(e);
  const output = rawOutput(e);
  const gap = required - revenue;
  if (gap <= 0) return { affordable: true, gap: 0, revenue, required, constraints: [] };

  const constraints = [];
  const reach = e.administrativeReach / 100;
  const monetized = e.monetization / 100;
  if (reach < 0.95) {
    constraints.push({
      factor: "administrativeReach", value: Math.round(e.administrativeReach),
      headroom: output * (IN_KIND_TAX_FLOOR + (1 - IN_KIND_TAX_FLOOR) * monetized) * e.taxRate - revenue,
      detail: `Only ${Math.round(reach * 100)}% of the country is close enough to the state to be assessed at all; the rest pays nothing whatever the rate says.`,
    });
  }
  if (monetized < 0.95) {
    constraints.push({
      factor: "monetization", value: Math.round(e.monetization), headroom: output * reach * e.taxRate - revenue,
      detail: `Most of what the state reaches is consumed where it is grown, not sold; only a share can be taken as anything but grain and labour.`,
    });
  }
  const effort = maxTaxEffort(e);
  const rateHeadroom = taxableBase(e) * clamp(effort - e.taxRate, 0, 1);
  constraints.push({
    factor: "taxRate", value: Number(e.taxRate.toFixed(3)), headroom: rateHeadroom,
    detail: rateHeadroom > 0
      ? `The rate could rise to about ${Math.round(effort * 100)}% of the assessed base${e.atWar ? " under wartime mobilisation" : ""} before collection turns coercive and legitimacy bleeds.`
      : `The rate already stands at what this society will bear${e.atWar ? ", even at war" : ""}; pushing it costs legitimacy directly.`,
  });
  const room = Math.max(0, debtCeiling(e) - e.debt);
  const rReal = realBorrowingRate(e);
  const g = trendGrowth(e);
  constraints.push({
    factor: "credit", value: Math.round(room), headroom: room,
    detail: room <= 0
      ? `No lender will advance more: the debt already stands at what this base can service.`
      : `Lenders would advance about ${Math.round(room)} SY at ${(interestRate(e) * 100).toFixed(1)}% — once. `
        + (g > rReal ? `The economy outgrows its interest (r < g), so a stable debt share is sustainable.`
          : `Interest outruns growth (r > g): every SY borrowed compounds unless the primary balance covers it.`),
  });
  const pledge = Math.max(0, pledgeableValue(e) - e.claimsOutstanding);
  constraints.push({
    factor: "futureClaims", value: Math.round(pledge), headroom: pledge * claimMoneyness(e),
    detail: pledge <= 0
      ? `Future revenue is already pledged to the hilt: any further claim would trade below par from the day it is issued.`
      : `About ${Math.round(pledge)} SY of the next ${e.monetarySystem.claimsHorizon} years' collectable revenue could still be pledged at par; `
        + `with financial depth at ${Math.round(e.financialDepth)}, such paper circulates at ${Math.round(claimMoneyness(e) * 100)}% of face.`,
  });
  constraints.push({
    factor: "monetaryFinancing", value: Math.round(gap), headroom: Infinity,
    detail: `The issuer could simply create the shortfall; at ${Math.round(100 * gap / output)}% of output a year that is `
      + `${gap / output > 0.1 ? "the road to hyperinflation" : gap / output > 0.03 ? "several points of inflation" : "tolerable for a while"}`
      + (e.monetarySystem.rule === "fixed" || e.monetarySystem.rule === "peg" ? `, and it breaks the ${e.monetarySystem.rule === "peg" ? "peg" : "issuance rule"}.` : "."),
  });

  constraints.sort((a, b) => a.headroom - b.headroom);
  return { affordable: false, gap, revenue, required, constraints };
};

// Whether a monetary system — any monetary system — holds, and where it is
// weakest. Returns findings sorted by severity; the first is the one to name.
export const evaluateMonetarySystem = (economy) => {
  const e = normalizeEconomy(economy);
  const sys = e.monetarySystem;
  const findings = [];
  const add = (factor, severity, detail, extra = {}) => findings.push({ factor, severity: clamp(severity, 0, 1), detail, ...extra });

  if (sys.backing === "futureClaims" || e.claimsOutstanding > 0 || sys.rule === "growthLinked") {
    const pv = pledgeableValue(e);
    const price = claimsPrice(e);
    const perYear = sys.claimsIssuanceShare * taxableBase(e);
    const yearsToPar = perYear > 0 ? Math.max(0, pv - e.claimsOutstanding) / perYear : Infinity;
    add("pledge", 1 - price,
      price >= 1
        ? `Claims trade at par: ${Math.round(e.claimsOutstanding)} SY issued against ${Math.round(pv)} SY of collectable future revenue`
          + (perYear > 0 ? `; at ${Math.round(perYear)} SY a year the pledge is exhausted in about ${yearsToPar.toFixed(1)} years.` : ".")
        : `Claims trade at ${Math.round(price * 100)}% of face: ${Math.round(e.claimsOutstanding)} SY issued against only ${Math.round(pv)} SY the state can credibly collect over ${sys.claimsHorizon} years.`,
      { pledgeableValue: pv, claimsPrice: price, yearsToPar });
    add("moneyness", 1 - claimMoneyness(e),
      `With financial depth at ${Math.round(e.financialDepth)}, a claim passes as money at ${Math.round(claimMoneyness(e) * 100)}% of face; the rest is a bond people hold, not a coin they spend.`);
    add("credibility", 1 - e.fiscalCredibility / 100,
      `The pledge is discounted by credibility ${Math.round(e.fiscalCredibility)}/100 before anything else.`);
  }
  if (sys.backing === "commodity") {
    const cover = backingRatio(e);
    add("reserves", cover >= 1 ? 0 : cover < CONVERTIBILITY_RUN_COVER ? 1 : 1 - cover,
      `Reserves cover ${Math.round(cover * 100)}% of the money in circulation, worth ${Math.round(reserveDiscount(e) * 10000) / 100} points off the state's borrowing rate regardless of convertibility`
        + (sys.convertibility > 0 ? (cover < CONVERTIBILITY_RUN_COVER ? ` — and below the ${Math.round(CONVERTIBILITY_RUN_COVER * 100)}% at which a redeemable money is run on.` : `; convertibility itself holds while holders believe that.`) : `; not convertible, so no run is possible, but the reserve still buys cheaper credit.`),
      { cover });
  }
  if (sys.rule === "peg") {
    const drift = e.expectedInflation - sys.anchorInflation;
    add("peg", clamp(drift / 0.1, 0, 1),
      drift > 0.01
        ? `Domestic prices outrun the anchor by ${(drift * 100).toFixed(1)} points a year; the peg leaks reserves at that rate until it breaks.`
        : `Prices track the anchor; the peg costs nothing while that lasts.`);
  }
  if (sys.rule === "fixed") {
    const need = trendGrowth(e) + e.inflationTarget;
    add("fixedSupply", clamp(Math.abs(sys.fixedGrowth - need) / 0.05, 0, 1),
      sys.fixedGrowth < need - 0.01
        ? `Money grows ${(sys.fixedGrowth * 100).toFixed(1)}% a year against a ${(need * 100).toFixed(1)}% economy: prices must fall to fit, and debts weigh more every year.`
        : sys.fixedGrowth > need + 0.01
          ? `Money grows faster than the economy it prices; the excess is inflation by construction.`
          : `The fixed growth roughly matches the economy; prices are stable as long as nothing else moves.`);
  }
  if (sys.rule === "taylor") {
    add("policy", e.financialDepth < 40 ? 0.7 : 0,
      e.financialDepth < 40
        ? `A policy rate needs a banking system to transmit through; at depth ${Math.round(e.financialDepth)} it moves little.`
        : `A policy rate of ${((policyRate(e) ?? 0) * 100).toFixed(1)}% leans against expected inflation of ${(e.expectedInflation * 100).toFixed(1)}%.`);
  }
  add("expectations", clamp(e.expectedInflation / 0.5, 0, 1),
    e.expectedInflation > 0.2
      ? `Expected inflation of ${Math.round(e.expectedInflation * 100)}% has velocity at ${velocityOf(e).toFixed(1)} times structural: holders are fleeing the unit.`
      : `Expected inflation of ${(e.expectedInflation * 100).toFixed(1)}%: velocity is near its structural level.`);

  findings.sort((a, b) => b.severity - a.severity);
  return { system: sys, findings, binding: findings[0] ?? null, price: impliedPriceLevel(e) };
};

export const evaluateInnovation = (economy, innovation) => {
  const e = normalizeEconomy(economy);
  const spec = normalizeInnovation(innovation);
  if (!spec) return { viable: false, adoption: 0, blockers: [], met: [] };
  const blockers = [];
  const met = [];
  for (const [factor, minimum] of Object.entries(spec.requires)) {
    const have = clampPct(e[factor], 0);
    const need = clampPct(minimum, 0);
    if (have >= need) met.push({ factor, have, need });
    else blockers.push({ factor, have, need, shortfall: need - have, ratio: need > 0 ? have / need : 1 });
  }
  const ratios = Object.entries(spec.requires).map(([factor, minimum]) => {
    const need = clampPct(minimum, 0);
    return need <= 0 ? 1 : clamp(clampPct(e[factor], 0) / need, 0, 1);
  });
  const adoption = ratios.length === 0 ? 1 : Math.min(...ratios);
  blockers.sort((a, b) => a.ratio - b.ratio);
  return { viable: blockers.length === 0, adoption: Number(adoption.toFixed(3)), blockers, met, binding: blockers[0] ?? null };
};

// ---- presentation ------------------------------------------------------------------------------------

export const economyIndicators = (economy) => {
  const e = normalizeEconomy(economy);
  const output = rawOutput(e);
  const base = taxableBase(e);
  const r = interestRate(e);
  const g = trendGrowth(e);
  const pr = policyRate(e);
  return {
    monetarySystem: e.monetarySystem,
    outputPerCapita: Number(rawOutputPerCapita(e).toFixed(2)),
    output: Math.round(output),
    population: Math.round(e.population),
    outputGap: Number(e.outputGap.toFixed(3)),
    trendGrowth: Number(g.toFixed(4)),
    revenue: Math.round(annualRevenue(e)),
    taxRevenue: Math.round(taxRevenue(e)),
    endowmentIncome: Math.round(endowmentIncome(e)),
    transfers: Math.round(e.transfers),
    nonTaxShare: annualRevenue(e) > 0 ? Number((nonTaxRevenue(e) / annualRevenue(e)).toFixed(3)) : 0,
    endowment: Math.round(e.endowment),
    endowmentYield: Number(e.endowmentYield.toFixed(4)),
    unfundedLiabilities: Math.round(e.unfundedLiabilities),
    netPatrimony: Math.round(netPatrimony(e)),
    yearsOfPatrimonyLeft: yearsOfPatrimonyLeft(e),
    financing: e.financing,
    spending: Math.round(annualSpending(e)),
    balance: Math.round(fiscalBalance(e)),
    treasury: Math.round(e.treasury),
    arrears: Math.round(Math.max(0, -e.treasury)),
    arrearsShare: Number(arrearsShare(e).toFixed(3)),
    taxTakeOfOutput: output > 0 ? Number((annualRevenue(e) / output).toFixed(4)) : 0,
    reachedShareOfOutput: output > 0 ? Number((base / output).toFixed(4)) : 0,
    maxTaxEffort: Number(maxTaxEffort(e).toFixed(3)),
    debt: Math.round(e.debt),
    debtOfOutput: output > 0 ? Number((e.debt / output).toFixed(2)) : null,
    debtCeiling: Math.round(debtCeiling(e)),
    claimsOutstanding: Math.round(e.claimsOutstanding),
    claimsPrice: Number(claimsPrice(e).toFixed(3)),
    pledgeableValue: Math.round(pledgeableValue(e)),
    interestRate: Number(r.toFixed(4)),
    policyRate: pr == null ? null : Number(pr.toFixed(4)),
    rMinusG: Number((realBorrowingRate(e) - g).toFixed(4)),
    effectiveMoney: Math.round(effectiveMoney(e)),
    backingRatio: backingRatio(e) == null ? null : Number(backingRatio(e).toFixed(3)),
    priceLevel: Number(e.priceLevel.toFixed(1)),
    impliedPriceLevel: Number(impliedPriceLevel(e).toFixed(1)),
    expectedInflation: Number(e.expectedInflation.toFixed(4)),
    velocity: Number(velocityOf(e).toFixed(2)),
    exchangeRate: Number(e.exchangeRate.toFixed(1)),
    legitimacy: Math.round(e.legitimacy),
    fiscalCredibility: Math.round(e.fiscalCredibility),
  };
};
