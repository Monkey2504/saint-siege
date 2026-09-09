/*! Open Historia — economy engine tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TAX_RATE, ECONOMY_DEFAULTS, MONETARY_SYSTEM_DEFAULTS,
  annualRevenue, annualSpending, arrearsShare, backingRatio, claimsPrice, debtCeiling, economyIndicators, effectiveMoney,
  evaluateInnovation, evaluateMonetarySystem, explainShortfall, factorShares, fiscalBalance, impliedPriceLevel,
  interestRate, maxTaxEffort, neutralRealRate, normalizeEconomy, normalizeMonetarySystem, outputPerCapita,
  pledgeableValue, policyRate, realOutput, stepEconomy, taxableBase, totalFactorProductivity, trendGrowth, velocityOf,
} from "./economy.js";

// The two ends of the range the engine has to hold in one set of equations:
// a thinly administered agrarian empire on coin, and a dense modern state on
// bank money with a central bank.
const agrarian = () => normalizeEconomy({
  population: 60_000_000, effectiveLand: 45_000_000, capital: 70_000_000,
  technology: 14, administrativeReach: 48, monetization: 35, marketIntegration: 45,
  financialDepth: 8, fiscalCredibility: 55, openness: 8,
  taxRate: 0.16, militaryUpkeep: 1_400_000, civilSpending: 1_900_000,
  monetarySystem: { backing: "commodity", issuer: "mint", rule: "discretionary", convertibility: 1 },
  reserves: 12_000_000,
});
const modern = () => normalizeEconomy({
  population: 66_000_000, effectiveLand: 18_000_000, capital: 7_000_000_000,
  technology: 85, administrativeReach: 97, monetization: 98, marketIntegration: 95,
  financialDepth: 90, fiscalCredibility: 85, openness: 30, investmentShare: 0.22,
  taxRate: 0.45, militaryUpkeep: 60_000_000, civilSpending: 850_000_000,
  monetarySystem: { backing: "none", issuer: "banks", rule: "taylor", convertibility: 0 },
});
const run = (state, years, options) => {
  let s = state;
  let last = null;
  for (let i = 0; i < years; i += 1) { last = stepEconomy(s, { days: 365, ...options }); s = last.economy; }
  return { economy: s, flows: last.flows };
};

// ---- shape ---------------------------------------------------------------------

test("normalizeEconomy fills defaults, clamps capacities, accepts the legacy moneyStock, and seeds money at price 100", () => {
  const e = normalizeEconomy({});
  assert.equal(e.population, ECONOMY_DEFAULTS.population);
  assert.equal(e.taxRate, DEFAULT_TAX_RATE);
  assert.deepEqual(e.monetarySystem, { ...MONETARY_SYSTEM_DEFAULTS });
  assert.ok(e.baseMoney > 0);
  assert.equal(e.creditMoney, 0, "a mint issuer seeds no deposit money");
  assert.ok(Math.abs(impliedPriceLevel(e) - 100) < 1e-6);

  const legacy = normalizeEconomy({ moneyStock: 1234 });
  assert.equal(legacy.baseMoney, 1234);

  const m = modern();
  assert.ok(m.creditMoney > m.baseMoney, "a banking issuer seeds mostly deposit money");
  assert.ok(Math.abs(impliedPriceLevel(m) - 100) < 1e-6);

  const clamped = normalizeEconomy({ technology: 140, monetization: -5, taxRate: 3, population: "x" });
  assert.equal(clamped.technology, 100);
  assert.equal(clamped.monetization, 0);
  assert.equal(clamped.taxRate, 0.9);
  assert.equal(clamped.population, ECONOMY_DEFAULTS.population);
});

test("normalizeMonetarySystem rejects unknown answers and keeps the four questions", () => {
  const s = normalizeMonetarySystem({ backing: "unicorns", issuer: "treasury", rule: "growthLinked", convertibility: 3, claimsHorizon: 7.6 });
  assert.equal(s.backing, "none");
  assert.equal(s.issuer, "treasury");
  assert.equal(s.rule, "growthLinked");
  assert.equal(s.convertibility, 1);
  assert.equal(s.claimsHorizon, 8);
});

// ---- production ----------------------------------------------------------------

test("the reference economy produces the reference output", () => {
  const e = normalizeEconomy({ population: 1_000_000, effectiveLand: 1_000_000, capital: 1_000_000, technology: 0, marketIntegration: 50 });
  assert.ok(Math.abs(outputPerCapita(e) - 1.5) < 1e-9);
  assert.equal(totalFactorProductivity(e), 1);
});

test("factor shares slide from land to capital with technology and always sum to one", () => {
  const low = factorShares({ technology: 0 });
  const high = factorShares({ technology: 100 });
  assert.ok(low.land > high.land && low.capital < high.capital);
  for (const s of [low, high, factorShares({ technology: 37 })]) {
    assert.ok(Math.abs(s.land + s.capital + s.labour - 1) < 1e-12 && s.labour > 0);
  }
});

test("the range holds: antiquity near 2 SY per head, a modern state near 40", () => {
  const a = outputPerCapita(agrarian());
  const m = outputPerCapita(modern());
  assert.ok(a > 1.3 && a < 2.5, `agrarian ${a}`);
  assert.ok(m > 30 && m < 60, `modern ${m}`);
});

test("Malthus binds below the transition and not above it", () => {
  const base = agrarian();
  const crowded = normalizeEconomy({ ...base, population: base.population * 1.5 });
  const agrarianDrop = 1 - outputPerCapita(crowded) / outputPerCapita(base);
  const m = modern();
  const mc = normalizeEconomy({ ...m, population: m.population * 1.5 });
  const modernDrop = 1 - outputPerCapita(mc) / outputPerCapita(m);
  assert.ok(agrarianDrop > modernDrop);

  // Demographic transition: a rich economy's population growth is small or
  // negative rather than the 2% a fed agrarian one manages.
  const richStep = stepEconomy(m, { days: 365 });
  const poorStep = stepEconomy(base, { days: 365 });
  assert.ok(richStep.flows.populationGrowth < poorStep.flows.populationGrowth);
  assert.ok(richStep.flows.populationGrowth < 0.01);
});

// ---- the fisc --------------------------------------------------------------------

test("the fisc: reach and monetization gate the base; the take is Rome's 5% and a modern 45%", () => {
  const e = agrarian();
  const take = annualRevenue(e) / realOutput(e);
  assert.ok(take > 0.035 && take < 0.06, `agrarian take ${take}`);
  assert.ok(taxableBase(normalizeEconomy({ ...e, administrativeReach: 96 })) > taxableBase(e) * 1.8);
  const m = modern();
  const mt = annualRevenue(m) / realOutput(m);
  assert.ok(mt > 0.38 && mt < 0.48, `modern take ${mt}`);
});

test("the effort ceiling: a third of the base for a thin state, more for a modern one, half of output at total war (a broadly legitimate one)", () => {
  assert.ok(maxTaxEffort(agrarian()) < 0.45);
  const peace = maxTaxEffort(modern());
  const war = maxTaxEffort({ ...modern(), atWar: true });
  assert.ok(war > peace);
  // Britain taxed about half of output at total war on the strength of
  // wartime national unity — that took a broadly legitimate state; the
  // benchmark is calibrated at high legitimacy, not modern()'s ordinary 60.
  const m = { ...modern(), legitimacy: 90, atWar: true, taxRate: maxTaxEffort({ ...modern(), legitimacy: 90, atWar: true }) };
  const takeAtWar = annualRevenue(m) / realOutput(m);
  assert.ok(takeAtWar > 0.45 && takeAtWar < 0.75, `war take of output ${takeAtWar}`);
  // Past the ceiling legitimacy bleeds; under it, it recovers. modern()'s own
  // 45% rate needs legitimacy to match (a Scandinavian-scale take is
  // sustained by unusually high trust, not modern()'s ordinary default 60).
  const legitimate = { ...modern(), legitimacy: 85 };
  const over = run({ ...modern(), taxRate: 0.9 }, 3).economy;
  const under = run(legitimate, 3).economy;
  assert.ok(over.legitimacy < modern().legitimacy);
  assert.ok(under.legitimacy >= legitimate.legitimacy);
});

test("legitimacy is a real feedback on the effort ceiling, not just its output: a state the population trusts less is tolerated less", () => {
  const trusted = maxTaxEffort({ ...modern(), legitimacy: 100 });
  const ordinary = maxTaxEffort({ ...modern(), legitimacy: 60 });
  const distrusted = maxTaxEffort({ ...modern(), legitimacy: 0 });
  assert.ok(trusted > ordinary && ordinary > distrusted, `${trusted} > ${ordinary} > ${distrusted}`);
  // Zero legitimacy still leaves some real capacity (a floor, not a
  // shutdown) and the discount is a genuine multiplier on the base
  // administrative-reach ceiling, not a fixed offset.
  assert.ok(distrusted > 0 && distrusted < ordinary * 0.75);
  assert.ok(Math.abs(distrusted / trusted - 0.6) < 0.01, "zero legitimacy caps the ceiling at 60% of what full trust allows");
});

test("credit: the real rate falls with depth (nine to one percent), rises with distrust and burden; r < g widens the ceiling", () => {
  assert.ok(Math.abs(neutralRealRate({ financialDepth: 0 }) - 0.09) < 1e-9);
  assert.ok(Math.abs(neutralRealRate({ financialDepth: 100 }) - 0.01) < 1e-9);
  assert.ok(interestRate(agrarian()) > interestRate(modern()));
  assert.ok(interestRate({ ...modern(), fiscalCredibility: 10 }) > interestRate(modern()));
  assert.ok(interestRate({ ...modern(), debt: taxableBase(modern()) * 3 }) > interestRate(modern()) + 0.05);
  assert.ok(debtCeiling({ ...modern(), monetization: 10 }) < debtCeiling(modern()) / 3);

  const fast = { ...modern(), investmentShare: 0.30 };
  assert.ok(trendGrowth(fast) > trendGrowth(modern()));
  const rg = economyIndicators(fast).rMinusG;
  if (rg < 0) assert.ok(debtCeiling(fast) > debtCeiling({ ...fast, investmentShare: 0.06 }));
});

test("reserves price into the borrowing rate even without convertibility, the way reserve adequacy prices into a sovereign spread", () => {
  const pegless = { ...modern(), monetarySystem: { backing: "commodity", issuer: "banks", rule: "taylor", convertibility: 0 } };
  const noReserves = normalizeEconomy({ ...pegless, reserves: 0 });
  const wellReserved = normalizeEconomy({ ...pegless, reserves: effectiveMoney(normalizeEconomy(pegless)) });
  assert.ok(interestRate(wellReserved) < interestRate(noReserves), "full cover borrows cheaper even though the currency isn't convertible");
  assert.ok(Math.abs(interestRate(noReserves) - interestRate(modern())) < 1e-9, "a declared 'backed' currency with zero actual reserves gets no discount over a plain unbacked one");
});

// ---- stepping ----------------------------------------------------------------------

test("stepping: zero days is the identity, the same inputs always give the same outputs, and a balanced budget mints nothing", () => {
  const e = agrarian();
  assert.deepEqual(stepEconomy(e, { days: 0 }).economy, e);
  assert.deepEqual(stepEconomy(agrarian(), { days: 200, financing: "print" }), stepEconomy(agrarian(), { days: 200, financing: "print" }));
  assert.ok(Math.abs(fiscalBalance(e)) < annualRevenue(e) * 0.05);
  const { flows } = stepEconomy(e, { days: 365 });
  assert.equal(flows.minted, 0);
  assert.equal(flows.borrowed, 0);
});

test("stepping: a deficit printed in a coin economy raises money, then prices, then expectations — and velocity follows (Cagan)", () => {
  const e = normalizeEconomy({ ...agrarian(), militaryUpkeep: agrarian().militaryUpkeep + 1_500_000 });
  assert.ok(fiscalBalance(e) < 0);
  const { economy, flows } = run(e, 5, { financing: "print" });
  assert.ok(flows.minted > 0 && economy.baseMoney > e.baseMoney);
  assert.ok(economy.priceLevel > 115, `five years of debasement: ${economy.priceLevel}`);
  assert.ok(economy.expectedInflation > 0.02);
  assert.ok(velocityOf(economy) > velocityOf(e), "expected inflation lifts velocity");
  assert.equal(economy.debt, 0);
});

test("stepping: printing a large deficit spirals; the same deficit borrowed does not, until lenders stop", () => {
  // Fiscal dominance: no independent central bank to sterilise the printing.
  const big = normalizeEconomy({ ...modern(), civilSpending: modern().civilSpending * 2.0,
    monetarySystem: { backing: "none", issuer: "banks", rule: "discretionary" } });
  // Track the run: what matters is that inflation climbs well past the
  // moderate range, expectations follow, real output turns down, and
  // credibility goes — not the exact reading in any one year.
  let state = big;
  let peak = 0;
  for (let year = 0; year < 6; year += 1) {
    const { economy, flows } = stepEconomy(state, { days: 365, financing: "print" });
    peak = Math.max(peak, flows.inflation);
    state = economy;
  }
  assert.ok(peak > 0.2, `money-financed deficit peaks at ${peak}`);
  assert.ok(state.expectedInflation > 0.1);
  assert.ok(state.fiscalCredibility < big.fiscalCredibility);
  // A constant REAL deficit settles at a steady inflation (Cagan's steady
  // state under adaptive expectations); it does not accelerate on its own.
  // What high inflation does do is stop stimulating and start destroying
  // real activity: the same impulse under 60% expected inflation pulls the
  // gap down where under 2% it pushed it up.
  const calm = stepEconomy({ ...big, expectedInflation: 0.02 }, { days: 365, financing: "print" }).economy;
  const burning = stepEconomy({ ...big, expectedInflation: 0.6 }, { days: 365, financing: "print" }).economy;
  assert.ok(calm.outputGap > 0, "a printed deficit lifts demand while prices are quiet");
  assert.ok(burning.outputGap < 0, "and destroys real activity once they are not");

  const borrowed = run(big, 6, { financing: "borrow" });
  assert.ok(borrowed.economy.debt > 0);
  assert.ok(borrowed.flows.inflation < peak);

  const broke = normalizeEconomy({ ...big, debt: debtCeiling(big) - 1000 });
  const next = stepEconomy(broke, { days: 365, financing: "borrow" });
  assert.ok(next.flows.borrowed <= 1000 + 1e-6);
  assert.ok(next.flows.minted > 0, "lenders refuse, the issuer covers the rest");
});

test("foresight: deep markets price in this period's money creation, so the same printed deficit runs hotter than in a coin economy", () => {
  const deficit = (state) => normalizeEconomy({ ...state, civilSpending: state.civilSpending + realOutput(state) * 0.25 });
  const deep = deficit(normalizeEconomy({ ...modern(), monetarySystem: { backing: "none", issuer: "banks", rule: "discretionary" } }));
  const shallow = deficit(normalizeEconomy({ ...deep, financialDepth: 5 }));
  const d1 = stepEconomy(deep, { days: 365, financing: "print" });
  const s1 = stepEconomy(shallow, { days: 365, financing: "print" });
  assert.ok(d1.economy.expectedInflation > d1.flows.inflation, "expectations run ahead of realised inflation where the budget can be read");
  // A thin coin economy takes MORE realised inflation per SY printed (a smaller
  // money stock), but its expectations only ever follow: purely adaptive.
  assert.ok(s1.economy.expectedInflation <= s1.flows.inflation, "and lag behind it where it cannot");
  // Foresight only anticipates bad news: a balanced economy is not talked into inflation.
  const calm = stepEconomy(normalizeEconomy({ ...modern(), monetarySystem: { backing: "none", issuer: "banks", rule: "discretionary" } }), { days: 365 });
  assert.ok(Math.abs(calm.economy.expectedInflation) < 0.03);
});

test("automatic debt amortization: a primary surplus retires debt before anything is banked, and never overdraws it", () => {
  const surplus = normalizeEconomy({ ...modern(), civilSpending: modern().civilSpending * 0.5, debt: 200_000_000 });
  const { economy, flows } = stepEconomy(surplus, { days: 365 });
  assert.ok(flows.balance > 0, "the fixture runs a primary surplus");
  assert.ok(flows.amortized > 0, "the surplus paid debt down");
  assert.equal(economy.debt, surplus.debt - flows.amortized);
  assert.ok(Math.abs(economy.treasury - (flows.balance - flows.amortized)) < 1e-6, "only the leftover, if any, is banked");

  // Never overdraws: a tiny debt is paid off in full, the rest of a large surplus is banked.
  const almostPaid = normalizeEconomy({ ...surplus, debt: 1000 });
  const step2 = stepEconomy(almostPaid, { days: 365 });
  assert.equal(step2.economy.debt, 0);
  assert.equal(step2.flows.amortized, 1000);
  assert.ok(step2.economy.treasury > 0, "the remainder of the surplus is banked once debt is clear");

  // The policy lever: a state that would rather build a reserve than pay down debt.
  const noAmortization = normalizeEconomy({ ...surplus, debtAmortizationShare: 0 });
  const step3 = stepEconomy(noAmortization, { days: 365 });
  assert.equal(step3.flows.amortized, 0);
  assert.equal(step3.economy.debt, noAmortization.debt);
  assert.ok(step3.economy.treasury > flows.balance - flows.amortized, "the whole surplus banks instead");

  // A deficit is unaffected: amortization only ever applies to an ACTUAL surplus.
  const e = agrarian();
  const deficitStep = stepEconomy(normalizeEconomy({ ...e, militaryUpkeep: e.militaryUpkeep + 1_500_000 }), { days: 365, financing: "borrow" });
  assert.equal(deficitStep.flows.amortized, 0);
});

test("stepping: austerity runs the treasury into arrears and costs credibility", () => {
  const e = normalizeEconomy({ ...agrarian(), militaryUpkeep: agrarian().militaryUpkeep + 1_500_000 });
  const { economy, flows } = stepEconomy(e, { days: 365, financing: "austerity" });
  assert.equal(flows.minted + flows.borrowed, 0);
  assert.ok(economy.treasury < 0);
  assert.ok(economy.fiscalCredibility < e.fiscalCredibility);
});

// ---- bankruptcy is political ------------------------------------------------------------

test("arrears: a treasury below zero at period end is an 'arrears' event, a share of a year's revenue, and bleeds legitimacy at ~12 points per year of revenue unpaid", () => {
  const e = normalizeEconomy({ ...agrarian(), militaryUpkeep: agrarian().militaryUpkeep + 1_500_000 });
  const broke = stepEconomy(e, { days: 365, financing: "austerity" });
  assert.ok(broke.flows.events.includes("arrears"), `events ${broke.flows.events}`);
  assert.ok(broke.flows.arrearsShare > 0 && broke.flows.arrearsShare <= 1);
  const covered = stepEconomy(e, { days: 365, financing: "borrow" });
  assert.ok(!covered.flows.events.includes("arrears"), "a covered deficit is not arrears");
  assert.equal(covered.flows.arrearsShare, 0);
  assert.ok(broke.economy.legitimacy < covered.economy.legitimacy, "the unpaid state loses consent the borrowing one keeps");

  // Calibration: a state that starts one full year of revenue in arrears on
  // an otherwise balanced budget stays there, and loses ~12 points that year
  // against the same state with its bills paid (the 1575 Spanish stop, the
  // 1990s Russian wage arrears: consent gone within a couple of years).
  const yearBehind = normalizeEconomy({ ...agrarian(), treasury: -annualRevenue(agrarian()) });
  const behind = stepEconomy(yearBehind, { days: 365, financing: "austerity" });
  const paid = stepEconomy(agrarian(), { days: 365, financing: "austerity" });
  assert.ok(Math.abs(behind.flows.arrearsShare - 1) < 0.05, `still about a year behind: ${behind.flows.arrearsShare}`);
  const loss = paid.economy.legitimacy - behind.economy.legitimacy;
  assert.ok(loss > 10 && loss < 13, `a year of revenue in arrears costs ~12 points/yr, got ${loss}`);
  assert.ok(Math.abs(arrearsShare(yearBehind) - 1) < 1e-9);
  assert.equal(arrearsShare(agrarian()), 0);
  assert.equal(economyIndicators(yearBehind).arrearsShare, 1);
  assert.equal(economyIndicators(yearBehind).arrears, Math.round(annualRevenue(agrarian())));
});

test("printing: covering a deficit with new money costs legitimacy for the act itself — ~4 points a year at 5% of output — on top of what the inflation it makes costs", () => {
  const base = agrarian();
  const deficit = normalizeEconomy({ ...base, civilSpending: base.civilSpending + realOutput(base) * 0.05 });
  const printed = stepEconomy(deficit, { days: 365, financing: "print" });
  const borrowed = stepEconomy(deficit, { days: 365, financing: "borrow" });
  assert.equal(borrowed.flows.minted, 0, "the fixture's ceiling covers a 5% deficit by borrowing");
  const share = printed.flows.minted / printed.flows.output;
  assert.ok(share > 0.045 && share < 0.06, `printed ${share} of output`);
  const loss = borrowed.economy.legitimacy - printed.economy.legitimacy;
  assert.ok(loss > 3 && loss < 6, `5% of output printed costs 3-5 points/yr beyond borrowing the same, got ${loss}`);
  // A regime printing 10% of output (Weimar 1922, Zimbabwe 2007, Venezuela
  // 2017) is losing consent at a rate that ends it within two or three years.
  const heavy = normalizeEconomy({ ...base, civilSpending: base.civilSpending + realOutput(base) * 0.10 });
  const wrecked = run(heavy, 3, { financing: "print" }).economy;
  assert.ok(wrecked.legitimacy < base.legitimacy - 20, `three years of heavy printing: legitimacy ${wrecked.legitimacy}`);
});

test("regression: an ordinary funded state — the fixtures — never touches arrears or the press, so its legitimacy trajectory is exactly what it was before those terms existed", () => {
  // Values captured on the engine before the arrears and printing terms were
  // added; both fixtures run a surplus (treasury > 0, minted 0) every year,
  // so both new terms are identically zero for them.
  const before = { agrarian: 64.99668028775403, modern: 57.374275503447315 };
  for (const [name, fixture] of [["agrarian", agrarian], ["modern", modern]]) {
    let s = fixture();
    for (let year = 0; year < 5; year += 1) {
      const step = stepEconomy(s, { days: 365 });
      assert.equal(step.flows.minted, 0, `${name} mints nothing`);
      assert.ok(step.economy.treasury >= 0, `${name} is never in arrears`);
      assert.ok(!step.flows.events.includes("arrears"));
      assert.equal(step.flows.arrearsShare, 0);
      s = step.economy;
    }
    assert.ok(Math.abs(s.legitimacy - before[name]) < 1e-6, `${name} legitimacy after five years ${s.legitimacy}, was ${before[name]}`);
    assert.equal(economyIndicators(fixture()).arrearsShare, 0);
  }
});

test("stepping: a central bank under a Taylor rule pulls inflation back toward target after a demand shock", () => {
  const shocked = normalizeEconomy({ ...modern(), outputGap: 0.05, expectedInflation: 0.06 });
  assert.ok(policyRate(shocked) > policyRate(modern()), "the rate rises with inflation and the gap");
  const { economy } = run(shocked, 6);
  assert.ok(economy.expectedInflation < shocked.expectedInflation);
  assert.ok(Math.abs(economy.outputGap) < Math.abs(shocked.outputGap));
  assert.equal(policyRate(agrarian()), null, "a coin economy has no policy rate");
});

test("stepping: a war economy — half of output for six years — is affordable at war and bleeds legitimacy only past the ceiling", () => {
  const m = modern();
  const wartime = normalizeEconomy({ ...m, atWar: true, taxRate: maxTaxEffort({ ...m, atWar: true }),
    militaryUpkeep: realOutput(m) * 0.45 });
  const verdict = explainShortfall(wartime, annualSpending(wartime));
  const { economy } = run(wartime, 6, { financing: "borrow" });
  assert.ok(economy.legitimacy > 30, `legitimacy after six years at war ${economy.legitimacy}`);
  assert.ok(economy.debt > 0 || verdict.affordable);
});

test("stepping: sanctions cut output in proportion to openness, sink the currency, and pass through to prices", () => {
  const open = normalizeEconomy({ ...modern(), openness: 40 });
  const closed = normalizeEconomy({ ...modern(), openness: 5 });
  const hitOpen = stepEconomy(open, { days: 365, sanctions: 0.6 });
  const hitClosed = stepEconomy(closed, { days: 365, sanctions: 0.6 });
  const calm = stepEconomy(open, { days: 365 });
  assert.ok(hitOpen.flows.tradeLoss > hitClosed.flows.tradeLoss);
  assert.ok(hitOpen.flows.tradeLoss > 0.05 && hitOpen.flows.tradeLoss < 0.2, `Russia-sized hit ${hitOpen.flows.tradeLoss}`);
  assert.ok(hitOpen.economy.exchangeRate > calm.economy.exchangeRate, "the currency weakens");
  assert.ok(hitOpen.flows.inflation > calm.flows.inflation, "import prices pass through");
});

// ---- monetary systems: any configuration is judged by the same identities ----------

test("gold standard: printing against reserves drains cover and forces suspension", () => {
  const gold = normalizeEconomy({ ...agrarian(), reserves: 3_000_000,
    militaryUpkeep: agrarian().militaryUpkeep + 2_000_000 });
  assert.ok(backingRatio(gold) < 0.4);
  const { economy, flows } = run(gold, 6, { financing: "print" });
  assert.equal(economy.monetarySystem.convertibility, 0, "convertibility suspended");
  assert.ok(flows.events.includes("convertibility-suspended") || economy.fiscalCredibility < gold.fiscalCredibility);
  const sound = normalizeEconomy({ ...agrarian(), reserves: 60_000_000 });
  assert.equal(run(sound, 6).economy.monetarySystem.convertibility, 1, "a well-covered money keeps its promise");
});

test("peg: holding the anchor fixes the exchange rate until reserves run out, then it breaks with a devaluation", () => {
  const pegged = normalizeEconomy({ ...modern(), reserves: 400_000_000,
    monetarySystem: { backing: "commodity", issuer: "banks", rule: "peg", convertibility: 0.5, anchorInflation: 0.02 },
    expectedInflation: 0.12, civilSpending: modern().civilSpending * 1.5 });
  const first = stepEconomy(pegged, { days: 365, financing: "print" });
  assert.equal(first.economy.exchangeRate, pegged.exchangeRate, "the peg holds while it holds");
  const { economy, flows } = run(pegged, 8, { financing: "print" });
  assert.equal(economy.monetarySystem.rule, "discretionary", "the peg is gone");
  assert.ok(economy.exchangeRate > pegged.exchangeRate * 1.2, "and the currency fell");
  assert.ok(flows.events.includes("peg-broken") || economy.fiscalCredibility < pegged.fiscalCredibility);
});

test("fixed supply: money that grows slower than the economy deflates; faster, inflates", () => {
  const tight = normalizeEconomy({ ...modern(), monetarySystem: { backing: "none", issuer: "banks", rule: "fixed", fixedGrowth: 0 } });
  const loose = normalizeEconomy({ ...modern(), monetarySystem: { backing: "none", issuer: "banks", rule: "fixed", fixedGrowth: 0.12 } });
  const t = run(tight, 4).flows;
  const l = run(loose, 4).flows;
  assert.ok(t.inflation < l.inflation);
  assert.ok(l.inflation > 0.03);
  assert.ok(evaluateMonetarySystem(loose).findings.some((f) => f.factor === "fixedSupply" && /faster/.test(f.detail)));
});

test("securitised future revenue: claims trade at par up to the pledgeable value, then at a discount, and the engine names it", () => {
  const sys = { backing: "futureClaims", issuer: "treasury", rule: "growthLinked", claimsHorizon: 10, claimsIssuanceShare: 0.05 };
  const state = normalizeEconomy({ ...modern(), monetarySystem: sys });
  const pv = pledgeableValue(state);
  assert.ok(pv > taxableBase(state) * 3 && pv < taxableBase(state) * 10, `PV is a few years of collectable revenue: ${pv / taxableBase(state)}`);

  const within = normalizeEconomy({ ...state, claimsOutstanding: pv * 0.5 });
  assert.equal(claimsPrice(within), 1);
  // Twice the pledge does not trade at half: the paper itself raises the rate
  // the pledge is discounted at, so the pledge shrinks under it (Greece, 2012).
  const over = normalizeEconomy({ ...state, claimsOutstanding: pv * 2 });
  assert.ok(claimsPrice(over) < 0.5 && claimsPrice(over) > 0.05, `discount ${claimsPrice(over)}`);
  assert.ok(pledgeableValue(over) < pv, "the paper cheapens the pledge behind it");
  assert.ok(effectiveMoney(over) < effectiveMoney(within) * 2, "paper below par counts for less as money");

  const verdict = evaluateMonetarySystem(over);
  assert.equal(verdict.binding.factor, "pledge");
  assert.match(verdict.binding.detail, /below|% of face/);

  // Over-issuing on the way: modest issuance holds par for years; reckless
  // issuance breaks it and costs credibility, which shrinks the pledge further.
  const modest = run(state, 5).economy;
  assert.ok(claimsPrice(modest) > 0.95, `modest issuance stays near par: ${claimsPrice(modest)}`);
  const reckless = run({ ...state, monetarySystem: { ...sys, claimsIssuanceShare: 2 } }, 5).economy;
  assert.ok(claimsPrice(reckless) < 0.9, `reckless issuance breaks par: ${claimsPrice(reckless)}`);
  assert.ok(reckless.fiscalCredibility < state.fiscalCredibility);
  // And the same paper is far less money in a shallow market.
  const shallow = normalizeEconomy({ ...state, financialDepth: 10, claimsOutstanding: pv * 0.5 });
  assert.ok(effectiveMoney(shallow) - shallow.baseMoney - shallow.creditMoney
    < effectiveMoney(within) - within.baseMoney - within.creditMoney);
});

test("the same identities judge an invented system: a claims-backed money in an agrarian state is bounded by reach, credibility and depth", () => {
  const invented = normalizeEconomy({ ...agrarian(),
    monetarySystem: { backing: "futureClaims", issuer: "treasury", rule: "growthLinked", claimsHorizon: 20, claimsIssuanceShare: 1.5 } });
  const v = evaluateMonetarySystem(invented);
  const factors = v.findings.map((f) => f.factor);
  assert.ok(factors.includes("pledge") && factors.includes("moneyness") && factors.includes("credibility"));
  const moneyness = v.findings.find((f) => f.factor === "moneyness");
  assert.ok(moneyness.severity > 0.6, "at depth 8 such paper barely circulates");
  const after = run(invented, 5).economy;
  assert.ok(claimsPrice(after) < 1, "one and a half times a thin base a year outruns what it can pledge");
});

// ---- verdicts -----------------------------------------------------------------------

test("explainShortfall: affordable means no constraints; otherwise sorted tightest first, every lever present", () => {
  const e = agrarian();
  assert.deepEqual(explainShortfall(e, annualRevenue(e) * 0.5).constraints, []);
  const verdict = explainShortfall(e, annualSpending(e) + 1_500_000);
  assert.equal(verdict.affordable, false);
  for (let i = 1; i < verdict.constraints.length; i += 1) {
    assert.ok(verdict.constraints[i - 1].headroom <= verdict.constraints[i].headroom);
  }
  const factors = verdict.constraints.map((c) => c.factor);
  for (const f of ["monetization", "administrativeReach", "taxRate", "credit", "futureClaims", "monetaryFinancing"]) {
    assert.ok(factors.includes(f), `has ${f}`);
  }
  assert.equal(factors[0], "monetization", "in a thin agrarian state the coin economy binds first");
  for (const c of verdict.constraints) assert.ok(c.detail.length > 20);
});

test("explainShortfall: a modern state has neither reach nor monetization in its way, and monetary financing is named as inflation", () => {
  const e = normalizeEconomy({ ...modern(), administrativeReach: 100, monetization: 100 });
  const verdict = explainShortfall(e, annualSpending(e) * 1.5);
  const factors = verdict.constraints.map((c) => c.factor);
  assert.ok(!factors.includes("administrativeReach") && !factors.includes("monetization"));
  assert.match(verdict.constraints.find((c) => c.factor === "monetaryFinancing").detail, /inflation|tolerable/);
});

test("evaluateInnovation: adoption is the weakest precondition and the binding one is named", () => {
  const notes = { id: "paper-money", requires: { monetization: 60, administrativeReach: 55, fiscalCredibility: 70, technology: 30 } };
  const rome = evaluateInnovation(agrarian(), notes);
  assert.equal(rome.viable, false);
  assert.equal(rome.binding.factor, "technology");
  assert.ok(Math.abs(rome.adoption - 14 / 30) < 1e-3);
  const france = evaluateInnovation(modern(), notes);
  assert.equal(france.viable, true);
  assert.equal(france.binding, null);
  assert.deepEqual(evaluateInnovation(agrarian(), null), { viable: false, adoption: 0, blockers: [], met: [] });
});

test("economyIndicators: derived aggregates are finite and consistent", () => {
  for (const e of [agrarian(), modern()]) {
    const i = economyIndicators(e);
    for (const [key, value] of Object.entries(i)) {
      if (value !== null && typeof value !== "object") assert.ok(Number.isFinite(value) || typeof value === "string", `${key}`);
    }
    assert.ok(Math.abs(i.balance - (i.revenue - i.spending)) <= 1, "rounded independently");
    assert.ok(i.taxTakeOfOutput <= i.reachedShareOfOutput);
    assert.equal(i.priceLevel, 100);
  }
  assert.equal(economyIndicators(agrarian()).policyRate, null);
  assert.ok(economyIndicators(modern()).policyRate > 0);
});
