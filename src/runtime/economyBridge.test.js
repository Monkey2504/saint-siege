/*! Open Historia — economyBridge tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { annualRevenue, economyIndicators, normalizeEconomy, outputPerCapita, realOutput } from "./economy.js";
import {
  POPULATION_SHIFT_CAP, SOLDIERS_PER_STRENGTH_POINT,
  anchorUnitValue, applyEconomyChange, attritionOver, buildEconomyBrief, costPerSoldier, crossExchangeRate, daysBetween, describeEconomy,
  pinStatSheetToEngine, refineSeed, repinCountryStats, requiredUpkeep, seedEconomy, stepWorldEconomies, unitsOf, upkeepFunding, yearOf,
} from "./economyBridge.js";
import { applyProgramDelta, normalizeProgram, stepProgram } from "./projectFinance.js";
import { normalizeOrganization } from "./organizations.js";

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));

test("yearOf reads a campaign date, including four-digit ancient years", () => {
  assert.equal(yearOf("0117-01-01"), 117);
  assert.equal(yearOf("1939-09-01"), 1939);
  assert.equal(yearOf("2026-03-01"), 2026);
  assert.equal(yearOf("garbage"), 2000);
});

test("seedEconomy lands in the right era: antiquity near 2 SY per head on coin, the present near 40 on fiat", () => {
  const rome = seedEconomy({ year: 117, regionShare: 0.25 });
  const y = outputPerCapita(rome);
  assert.ok(y > 1.2 && y < 2.6, `Rome ${y}`);
  assert.equal(rome.monetarySystem.backing, "commodity");
  assert.equal(rome.monetarySystem.issuer, "mint");
  assert.ok(rome.financialDepth < 15);
  const take = economyIndicators(rome).taxTakeOfOutput;
  assert.ok(take > 0.02 && take < 0.08, `Roman take ${take}`);

  const now = seedEconomy({ year: 2016, regionShare: 0.02, population: 66e6 });
  const yn = outputPerCapita(now);
  assert.ok(yn > 20 && yn < 60, `modern ${yn}`);
  assert.equal(now.monetarySystem.rule, "taylor");
  assert.equal(now.population, 66e6);
  const mid = seedEconomy({ year: 1939, regionShare: 0.03 });
  assert.equal(mid.monetarySystem.rule, "peg", "the interwar world pegs to gold");
  assert.ok(outputPerCapita(mid) > yn / 8 && outputPerCapita(mid) < yn);
});

test("seedEconomy: tags tilt the seed", () => {
  const base = seedEconomy({ year: 2000, regionShare: 0.02 });
  const pariah = seedEconomy({ year: 2000, regionShare: 0.02, tags: ["pariah"] });
  assert.ok(pariah.fiscalCredibility < base.fiscalCredibility);
  assert.ok(pariah.sanctionsFaced > 0);
  assert.ok(pariah.openness < base.openness);
  const soviet = seedEconomy({ year: 1950, regionShare: 0.1, tags: ["communist"] });
  assert.equal(soviet.monetarySystem.issuer, "treasury");
  assert.equal(soviet.monetarySystem.rule, "discretionary");
  const war = seedEconomy({ year: 1940, regionShare: 0.02, atWar: true });
  assert.ok(war.militaryUpkeep > base.militaryUpkeep * 0 && war.atWar);
});

test("applyEconomyChange: set replaces, shift adds within bounds, the monetary system merges, stocks are never touched", () => {
  const e = seedEconomy({ year: 1200, regionShare: 0.01 });
  const next = applyEconomyChange(e, {
    set: { taxRate: 0.2, atWar: true, financing: "print" },
    shift: { administrativeReach: 200, monetization: -5, militaryUpkeep: 1000 },
    monetarySystem: { rule: "fixed", fixedGrowth: 0.01, label: "silver penny" },
    innovations: [{ id: "census", name: "Domesday census", adoption: 0.4, requires: { administrativeReach: 30 } }],
  });
  assert.equal(next.taxRate, 0.2);
  assert.equal(next.atWar, true);
  assert.equal(next.financing, "print");
  assert.equal(next.administrativeReach, 100);
  assert.equal(next.monetization, e.monetization - 5);
  assert.equal(next.militaryUpkeep, e.militaryUpkeep + 1000);
  assert.equal(next.monetarySystem.rule, "fixed");
  assert.equal(next.monetarySystem.backing, e.monetarySystem.backing, "unnamed answers keep their value");
  assert.equal(next.monetarySystem.label, "silver penny");
  assert.equal(next.innovations.length, 1);
  assert.equal(next.priceLevel, e.priceLevel);
  assert.equal(next.debt, e.debt);
  // Garbage is ignored, and a second innovation with the same id merges.
  const again = applyEconomyChange(next, { set: { output: 5, priceLevel: 9 }, innovations: [{ id: "census", adoption: 0.9 }] });
  assert.equal(again.priceLevel, e.priceLevel);
  assert.equal(again.innovations[0].adoption, 0.9);
  assert.deepEqual(applyEconomyChange(e, null), e);
});

test("stepWorldEconomies advances every polity by the jump using its own financing and sanctions", () => {
  const economies = {
    France: seedEconomy({ year: 2016, regionShare: 0.02, population: 66e6 }),
    Iran: applyEconomyChange(seedEconomy({ year: 2016, regionShare: 0.02, tags: ["pariah"] }), { set: { sanctionsFaced: 0.8, financing: "print" } }),
  };
  assert.equal(daysBetween("2016-01-01", "2016-07-01"), 182);
  const { economies: next, flows } = stepWorldEconomies(economies, 182);
  assert.ok(next.France && next.Iran);
  assert.ok(flows.Iran.tradeLoss > flows.France.tradeLoss);
  assert.ok(next.Iran.exchangeRate > economies.Iran.exchangeRate);
  assert.ok(Math.abs(flows.France.years - 0.5) < 0.01);
  assert.deepEqual(stepWorldEconomies({}, 100), { economies: {}, flows: {}, programs: {}, attrition: {} });
});

// ---- forces in being ---------------------------------------------------------------------

// The engine's own two fixtures (economy.test.js), so the anchors are checked
// on the same numbers the engine is calibrated on.
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
const army = (owner, soldiers, extra = {}) => ({ ownerCode: owner, type: "infantry", strength: soldiers / SOLDIERS_PER_STRENGTH_POINT, ...extra });

test("requiredUpkeep: a soldier costs a levy's keep in an agrarian economy and many subsistence-years in a modern one — 300k men at ~15% of Rome's revenue, a million at ~2% of a modern great power's output", () => {
  const a = agrarian();
  const perLegionary = costPerSoldier(a);
  assert.ok(perLegionary > 1.5 && perLegionary < 3, `an agrarian soldier-year costs ${perLegionary} SY`);
  const legions = requiredUpkeep([army("Rome", 300_000)], a);
  const share = legions / annualRevenue(a);
  assert.ok(share > 0.12 && share < 0.2, `300,000 men take ${share} of an agrarian empire's revenue`);

  const m = modern();
  const perSoldier = costPerSoldier(m);
  assert.ok(perSoldier > 150 && perSoldier < 400, `a modern soldier-year costs ${perSoldier} SY`);
  assert.ok(perSoldier / outputPerCapita(m) > 5, "several times what one person produces: kit, not just pay");
  // A million troops in a 330-million-person state at the fixture's output per head.
  const million = requiredUpkeep([army("United States", 1_000_000)], m);
  const greatPowerOutput = realOutput(m) * (330 / 66);
  const ofOutput = million / greatPowerOutput;
  assert.ok(ofOutput > 0.015 && ofOutput < 0.035, `a million troops take ${ofOutput} of a great power's output`);
  // And the fixture's own 60M SY budget funds a France-sized force, not a superpower's.
  assert.ok(m.militaryUpkeep / perSoldier > 150_000 && m.militaryUpkeep / perSoldier < 300_000);

  // Derived from the economy, not the era's name: the same men cost more as know-how rises.
  assert.ok(costPerSoldier({ ...a, technology: 60 }) > perLegionary);
  // Nothing on the map costs nothing; a defeated or empty unit costs nothing either.
  assert.equal(requiredUpkeep([], a), 0);
  assert.equal(requiredUpkeep([army("Rome", 50_000, { status: "defeated" }), { ownerCode: "Rome", strength: 0 }], a), 0);
  assert.equal(requiredUpkeep(null, a), 0);
});

test("unitsOf picks a polity's own live units by full country name and nothing else", () => {
  const units = [army("Rome", 50_000), army("Parthia", 50_000), army("Rome", 10_000, { status: "defeated" }), { owner: "Rome", strength: 20 }, null, { ownerCode: "Rome" }];
  const own = unitsOf(units, "Rome");
  assert.equal(own.length, 2, "the live Roman units, whichever owner field they carry; a defeated or strengthless one is not in being");
  assert.deepEqual(unitsOf(units, "Egypt"), []);
  assert.deepEqual(unitsOf(null, "Rome"), []);
});

test("stepWorldEconomies: an army the budget does not pay for wastes away — the unfunded share loses half its strength a year, a funded one loses nothing, and nothing happens when no units are given", () => {
  const a = agrarian();
  const required = requiredUpkeep([army("Rome", 300_000)], a);
  const economies = {
    Funded: applyEconomyChange(a, { set: { militaryUpkeep: required * 1.2 } }),
    Half: applyEconomyChange(a, { set: { militaryUpkeep: required * 0.5 } }),
    Unpaid: applyEconomyChange(a, { set: { militaryUpkeep: 0 } }),
    Unarmed: applyEconomyChange(a, { set: { militaryUpkeep: 0 } }),
  };
  const units = [army("Funded", 300_000), army("Half", 300_000), army("Unpaid", 300_000), army("Nobody", 300_000)];
  const { flows, attrition } = stepWorldEconomies(economies, 365.2425, { units });
  assert.equal(flows.Funded.upkeepShortfall, 0);
  assert.ok(Math.abs(flows.Funded.requiredUpkeep - required) < 1e-6);
  assert.equal(attrition.Funded, undefined, "a funded army does not waste");
  assert.ok(Math.abs(flows.Half.upkeepShortfall - 0.5) < 1e-9);
  assert.ok(Math.abs(attrition.Half - 0.25) < 1e-6, `half funded: a quarter lost in a year, got ${attrition.Half}`);
  assert.equal(flows.Unpaid.upkeepShortfall, 1);
  assert.ok(Math.abs(attrition.Unpaid - 0.5) < 1e-6, `unpaid: half lost in a year (the cap), got ${attrition.Unpaid}`);
  assert.equal(flows.Unarmed.requiredUpkeep, 0, "no units on the map, nothing required");
  assert.equal(flows.Unarmed.upkeepShortfall, 0);
  assert.equal(attrition.Unarmed, undefined);
  assert.equal(attrition.Nobody, undefined, "units of a polity with no economy are nobody's business here");

  // The loss compounds by time: a half-year jump costs about half a year's loss, not all of it.
  const { attrition: halfYear } = stepWorldEconomies({ Unpaid: economies.Unpaid }, 365.2425 / 2, { units });
  assert.ok(halfYear.Unpaid > 0.25 && halfYear.Unpaid < 0.35, `half a year unpaid: ${halfYear.Unpaid}`);
  assert.ok(Math.abs(attritionOver(1, 0.5) - (1 - Math.sqrt(0.5))) < 1e-9);
  assert.equal(attritionOver(0, 1), 0);
  assert.equal(attritionOver(-1, 1), 0);

  // Without units, the mechanism is off entirely: nothing costed, nothing lost.
  const { flows: blind, attrition: none } = stepWorldEconomies(economies, 365, {});
  assert.deepEqual(none, {});
  assert.equal(blind.Unpaid.requiredUpkeep, undefined);
  // The budget is NOT floored to what the army needs: underfunding is the player's choice.
  const { economies: after } = stepWorldEconomies({ Unpaid: economies.Unpaid }, 365, { units });
  assert.equal(after.Unpaid.militaryUpkeep, 0);
});

test("upkeepFunding reads the identity the panel and the brief show: required, paid, funded share", () => {
  const a = agrarian();
  const f = upkeepFunding([army("Rome", 300_000)], a);
  assert.ok(Math.abs(f.required - requiredUpkeep([army("Rome", 300_000)], a)) < 1e-9);
  assert.equal(f.paid, a.militaryUpkeep);
  assert.equal(f.fundedShare, 1, "the fixture's budget covers 300,000 men");
  assert.equal(f.shortfall, 0);
  const g = upkeepFunding([army("Rome", 1_200_000)], a);
  assert.ok(g.fundedShare < 1 && g.fundedShare > 0 && Math.abs(g.fundedShare + g.shortfall - 1) < 1e-12);
  assert.deepEqual(upkeepFunding([], a).fundedShare, 1);
});

test("describeEconomy and buildEconomyBrief price the forces in being — from the units when given, from the last step's flows when not", () => {
  const a = agrarian();
  const units = [army("Rome", 1_200_000), army("Parthia", 100_000)];
  const text = describeEconomy("Rome", a, { full: true, units: unitsOf(units, "Rome") });
  assert.match(text, /army: forces in being require [\d,]+ SY\/yr; funded at \d+\.\d%/);
  assert.match(text, /deserts, starves or rusts at \d+\.\d% of strength a year/);
  const funded = describeEconomy("Rome", a, { full: true, units: unitsOf(units, "Parthia") });
  assert.match(funded, /funded at 100\.0%/);
  assert.doesNotMatch(funded, /deserts/);
  assert.doesNotMatch(describeEconomy("Rome", a, { full: true }), /forces in being/);
  assert.doesNotMatch(describeEconomy("Rome", a, { full: true, units: [] }), /forces in being/, "no units, no line");

  // The brief filters the WORLD's units per polity, for the player and the other powers alike.
  const brief = buildEconomyBrief({ Rome: a, Parthia: a }, { playerPolity: "Rome", units });
  assert.match(brief, /Rome: output[\s\S]*army: forces in being require/);
  assert.match(brief, /Parthia: output[\s\S]*army: forces in being require [\d,]+ SY\/yr; funded at 100\.0%/);

  // From flows: what the last step recorded is enough for the next prompt.
  const { flows } = stepWorldEconomies({ Rome: a }, 365, { units });
  const fromFlows = describeEconomy("Rome", a, { full: false, flows: flows.Rome });
  assert.match(fromFlows, /forces in being require/);
});

test("describeEconomy names arrears: a state that has stopped paying is told so, and why it matters", () => {
  const a = agrarian();
  const broke = normalizeEconomy({ ...a, treasury: -annualRevenue(a) * 0.4 });
  const text = describeEconomy("Rome", broke, { full: false });
  assert.match(text, /in arrears: 40\.0% of a year's revenue unpaid \([\d,]+ SY owed[^)]*\) — legitimacy bleeding/);
  assert.doesNotMatch(describeEconomy("Rome", a, { full: false }), /in arrears/);
});

// ---- people are moved, never set ---------------------------------------------------------

test("applyEconomyChange: population is SHIFTED by a share or a head count, capped at ±20% per change, and the land and capital stay — so a plague leaves the survivors richer per head and dearer prices", () => {
  const e = seedEconomy({ year: 1347, regionShare: 0.02 });
  const plague = applyEconomyChange(e, { shift: { populationShare: -0.15 } });
  assert.ok(Math.abs(plague.population - e.population * 0.85) < 1, "a 15% mortality shift");
  assert.equal(plague.effectiveLand, e.effectiveLand, "the land does not die");
  assert.equal(plague.capital, e.capital);
  assert.ok(outputPerCapita(plague) > outputPerCapita(e), "fewer people on the same land: output per head rises (the post-Black-Death wage)");
  assert.ok(economyIndicators(plague).impliedPriceLevel > economyIndicators(e).impliedPriceLevel, "the same money over less output: prices rise");

  // The cap: no single change empties or doubles a country.
  const wiped = applyEconomyChange(e, { shift: { populationShare: -0.9 } });
  assert.ok(Math.abs(wiped.population - e.population * (1 - POPULATION_SHIFT_CAP)) < 1);
  const flooded = applyEconomyChange(e, { shift: { populationShare: 3 } });
  assert.ok(Math.abs(flooded.population - e.population * (1 + POPULATION_SHIFT_CAP)) < 1);

  // Absolute people go through the same cap.
  const refugees = applyEconomyChange(e, { shift: { population: 100_000 } });
  assert.ok(Math.abs(refugees.population - (e.population + 100_000)) < 1);
  const deported = applyEconomyChange(e, { shift: { population: -e.population } });
  assert.ok(Math.abs(deported.population - e.population * (1 - POPULATION_SHIFT_CAP)) < 1, "an attempted deportation of everyone is capped too");

  // Never SET: a population in `set` is ignored, and garbage is ignored.
  assert.equal(applyEconomyChange(e, { set: { population: 5 } }).population, e.population);
  assert.equal(applyEconomyChange(e, { shift: { populationShare: "many" } }).population, e.population);
  assert.equal(applyEconomyChange(e, { shift: { population: NaN } }).population, e.population);
});

test("stepWorldEconomies: international reputation drifts fiscal credibility, slowly, toward the reputation number — never for a polity reputation says nothing about", () => {
  const base = seedEconomy({ year: 2016, regionShare: 0.02, population: 66e6 });
  const pariah = { France: applyEconomyChange(base, { set: { fiscalCredibility: 80 } }), Egypt: applyEconomyChange(base, { set: { fiscalCredibility: 80 } }) };
  const { economies: afterYear } = stepWorldEconomies(pariah, 365, { reputation: { France: 10 } });
  const { economies: noReputationOption } = stepWorldEconomies(pariah, 365);
  assert.ok(afterYear.France.fiscalCredibility < pariah.France.fiscalCredibility, "a shunned polity's credibility is pulled down toward its reputation");
  // Egypt has no reputation entry either way, so it moves identically with or
  // without the option — isolating the pull from credibility's own ordinary
  // (reputation-independent) drift, rather than assuming it stays frozen.
  assert.equal(afterYear.Egypt.fiscalCredibility, noReputationOption.Egypt.fiscalCredibility, "no reputation entry means no pull at all");
  assert.equal(noReputationOption.France.fiscalCredibility, noReputationOption.Egypt.fiscalCredibility, "omitting reputation entirely pulls nobody");

  // The pull is gradual (15%/year), not a snap to the reputation number.
  assert.ok(afterYear.France.fiscalCredibility > 10, "one year does not erase 70 points of credibility");
  const { economies: afterFiveYears } = stepWorldEconomies(pariah, 365 * 5, { reputation: { France: 10 } });
  assert.ok(afterFiveYears.France.fiscalCredibility < afterYear.France.fiscalCredibility, "credibility keeps drifting toward reputation the longer it stays low");

  // A well-regarded polity is pulled UP, not just ever down.
  const distrusted = applyEconomyChange(base, { set: { fiscalCredibility: 20 } });
  const { economies: trusted } = stepWorldEconomies({ Chile: distrusted }, 365, { reputation: { Chile: 95 } });
  assert.ok(trusted.Chile.fiscalCredibility > distrusted.fiscalCredibility);
});

test("stepWorldEconomies: WTO membership floors openness, but only when it is actually a member and only up from BELOW the floor", () => {
  const wto = normalizeOrganization({ name: "World Trade Organization", kind: "trade", universal: true });
  const dissolvedWto = normalizeOrganization({ name: "World Trade Organization", kind: "trade", universal: true, status: "dissolved" });
  const shut = applyEconomyChange(seedEconomy({ year: 2016, regionShare: 0.02, tags: ["isolationist"] }), {});

  const { economies: floored } = stepWorldEconomies({ DRC: shut }, 365, { organizations: [wto] });
  assert.ok(floored.DRC.openness >= 30, `floored to at least the WTO minimum, got ${floored.DRC.openness}`);

  // With no WTO in the world at all (a pre-1995 game, or one that never
  // founded it), the floor never applies.
  const { economies: noFloor } = stepWorldEconomies({ DRC: shut }, 365, { organizations: [] });
  assert.ok(noFloor.DRC.openness < 30, "no WTO recorded, no floor");

  // A dissolved WTO (a fictional or alternate-history collapse) does not floor anyone either.
  const { economies: afterCollapse } = stepWorldEconomies({ DRC: shut }, 365, { organizations: [dissolvedWto] });
  assert.equal(afterCollapse.DRC.openness, noFloor.DRC.openness);

  // A genuinely open economy already clears the floor on its own — the
  // mechanism never LOWERS anything, only raises what sits below it.
  const alreadyOpen = applyEconomyChange(seedEconomy({ year: 2016, regionShare: 0.02 }), { set: { openness: 70 } });
  const { economies: unaffected } = stepWorldEconomies({ DRC: alreadyOpen }, 365, { organizations: [wto] });
  assert.ok(Math.abs(unaffected.DRC.openness - alreadyOpen.openness) < 5, "an already-open economy is not artificially pinned by the floor either way");
});

test("crossExchangeRate: every economy's index shares one abstract scale, so a rate between any two is already implicit", () => {
  // exchangeRate is a stock the engine derives (see economy.js), not a lever
  // applyEconomyChange's set/shift will touch — built directly here, the way
  // economy.test.js builds fixtures for other stocks it needs to control.
  const strong = normalizeEconomy({ ...seedEconomy({ year: 2016, regionShare: 0.02 }), exchangeRate: 80 });
  const weak = normalizeEconomy({ ...seedEconomy({ year: 2016, regionShare: 0.02 }), exchangeRate: 160 });
  assert.equal(crossExchangeRate(weak, strong), 2, "the weaker currency's index is twice the stronger one's");
  assert.equal(crossExchangeRate(strong, weak), 0.5);
  assert.equal(crossExchangeRate(strong, strong), 1);
});

test("stepWorldEconomies: a currency cheaper than the world's own average wins real export competitiveness, a dearer one loses it — both scaled by openness", () => {
  // exchangeRate and outputGap are engine-derived stocks, not levers
  // applyEconomyChange's set/shift touches — built directly, as above.
  // Higher exchangeRate = a WEAKER, cheaper currency (see its own field
  // comment in economy.js) — the one that should win export competitiveness.
  const base = seedEconomy({ year: 2016, regionShare: 0.02, population: 66e6 });
  const fixture = (openness, exchangeRate) => normalizeEconomy({ ...base, openness, exchangeRate, outputGap: 0 });
  // Rates chosen so the group's mean lands exactly on atAverage's own rate
  // (150 + 150 + 90 + 130) / 4 = 130 — a genuine "sits at the average", not
  // an approximation.
  const cheapOpenTrader = fixture(60, 150);
  const cheapClosedEconomy = fixture(5, 150);
  const dearOpenTrader = fixture(60, 90);
  const atAverage = fixture(60, 130);
  const { economies } = stepWorldEconomies({ cheapOpenTrader, cheapClosedEconomy, dearOpenTrader, atAverage }, 365);

  // Compared against sitting exactly at the world average (which isolates
  // whatever the engine's OTHER, trade-unrelated outputGap dynamics
  // contribute from this same starting point) rather than an absolute zero.
  assert.ok(economies.cheapOpenTrader.outputGap > economies.atAverage.outputGap, "weaker than the world average, trade-exposed: a real output boost");
  assert.ok(economies.dearOpenTrader.outputGap < economies.atAverage.outputGap, "stronger than the world average, trade-exposed: a real output cost");
  assert.ok(economies.cheapOpenTrader.outputGap > economies.cheapClosedEconomy.outputGap, "the SAME relative cheapness matters less to a closed economy (openness 5) than an open one (60)");

  // Sitting exactly at the world average contributes ~nothing beyond whatever
  // the engine's OTHER outputGap dynamics already do on their own — compare
  // against the same economy stepped alone (nothing to be relatively cheap
  // or dear against there) rather than assuming an absolute value.
  const soloAtAverage = stepWorldEconomies({ atAverage }, 365).economies.atAverage.outputGap;
  assert.ok(Math.abs(economies.atAverage.outputGap - soloAtAverage) < 1e-9, "at the world average, identical to having nothing to compare against");

  // A single-economy world has nothing to be relatively cheap or dear
  // against, so the SAME economy (openTrader, genuinely cheap) gets no boost
  // when it is the only one in the map.
  const alone = stepWorldEconomies({ cheapOpenTrader }, 365).economies.cheapOpenTrader.outputGap;
  assert.ok(alone < economies.cheapOpenTrader.outputGap, "the very same cheap currency gets no competitiveness boost with no one to be cheap against");
});

test("refineSeed: the model corrects capacities, policy, money and population once; stocks per head are preserved; junk is ignored", () => {
  const prior = seedEconomy({ year: 1750, regionShare: 0.02 });
  assert.equal(prior.seed, "era");
  const refined = refineSeed(prior, {
    polity: "Prussia", population: 4_000_000, administrativeReach: 62, fiscalCredibility: 70, taxRate: 0.24,
    militaryShareOfOutput: 0.06, monetarySystem: { rule: "fixed", label: "thaler" }, output: 999, priceLevel: 5,
  });
  assert.equal(refined.seed, "ai");
  assert.equal(refined.population, 4_000_000);
  assert.equal(refined.administrativeReach, 62);
  assert.equal(refined.taxRate, 0.24);
  assert.equal(refined.monetarySystem.rule, "fixed");
  assert.equal(refined.monetarySystem.backing, prior.monetarySystem.backing);
  assert.ok(Math.abs(outputPerCapita(refined) - outputPerCapita(prior)) / outputPerCapita(prior) < 0.05, "output per head survives a population correction");
  assert.equal(refined.priceLevel, 100, "stocks the engine computes are never accepted");
  assert.ok(refined.militaryUpkeep > 0);
  assert.equal(refineSeed(prior, null).seed, "era");
});

test("pinStatSheetToEngine: the engine's ratios overwrite the model's, the prose and currency survive", () => {
  const e = seedEconomy({ year: 2016, regionShare: 0.02, population: 80e6 });
  const sheet = { capital: "Kinshasa", stability: 30, indices: { culturalInfluence: 60, economicIndependence: 45 },
    economy: { gdp: "35 billion USD", gdpPerCapita: "480 USD", currency: "Congolese franc", inflation: "9%", publicDebt: "5 billion USD", budgetBalance: "-110 billion francs", unemployment: "45%" } };
  const pinned = pinStatSheetToEngine(sheet, e);
  assert.equal(pinned.economy.gdp, "35 billion USD");
  assert.equal(pinned.economy.currency, "Congolese franc");
  assert.equal(pinned.economy.unemployment, "45%");
  assert.match(pinned.economy.inflation, /^[+−]\d+\.\d%$/);
  assert.match(pinned.economy.publicDebt, /% GDP$/);
  assert.match(pinned.economy.budgetBalance, /% GDP$/);
  assert.equal(pinned.stability, Math.round(e.legitimacy));
  assert.match(pinned.economy.budgetBalance, /^[+-]/, "ASCII sign, so the sheet's deficit label works");
  assert.deepEqual(pinStatSheetToEngine(sheet, e), pinned, "deterministic: three regenerations agree");
  assert.equal(pinStatSheetToEngine(sheet, null), sheet);

  // Anchored: GDP and GDP per head are the engine's output in dollars, in the game's locale.
  const anchored = anchorUnitValue(e, 480);
  assert.ok(anchored.usdPerSY > 0);
  const fr = pinStatSheetToEngine(sheet, anchored, { language: "French" });
  assert.match(fr.economy.gdpPerCapita, /^480(,0)? USD$/);
  assert.match(fr.economy.gdp, /^\d+,\d B USD$/);
  assert.match(pinStatSheetToEngine(sheet, anchored, { language: "English" }).economy.gdp, /^\d+\.\d B USD$/);

  // Sticky: what the model wrote last time survives a regeneration; the engine's fields do not.
  const previous = { ...pinned, capital: "Léopoldville", leader: "Someone", gdpBreakdown: { agriculture: 40, industry: 25, services: 35 },
    economy: { ...pinned.economy, unemployment: "45%", currency: "Franc congolais" }, indices: { ...pinned.indices, culturalInfluence: 61 },
    history: ["1965: Mobutu seizes power in a coup"] };
  const regenerated = { ...sheet, capital: "Kinshasa", leader: "Other", gdpBreakdown: { agriculture: 20, industry: 40, services: 40 },
    economy: { ...sheet.economy, unemployment: "8%", currency: "CDF", inflation: "50%" }, indices: { culturalInfluence: 30, economicIndependence: 10 } };
  const again = pinStatSheetToEngine(regenerated, anchored, { previous, language: "English" });
  assert.equal(again.capital, "Léopoldville");
  assert.equal(again.leader, "Someone");
  assert.equal(again.economy.unemployment, "45%");
  assert.equal(again.economy.currency, "Franc congolais");
  assert.deepEqual(again.gdpBreakdown, previous.gdpBreakdown);
  assert.equal(again.indices.culturalInfluence, 61, "an index the engine does not compute stays sticky");
  assert.notEqual(again.economy.inflation, "50%", "the engine's inflation, not the model's");
  assert.deepEqual(again.history, previous.history, "the polity's own recorded history survives a fresh AI compilation, which never states one at all");
  assert.deepEqual(pinStatSheetToEngine(regenerated, anchored).history, undefined, "with no previous sheet at all, there is nothing to carry forward");
});

test("pinStatSheetToEngine: sovereignty, food/energy autonomy and internal security are engine ratios, not sticky AI guesses", () => {
  const e = seedEconomy({ year: 2016, regionShare: 0.02, population: 80e6 });
  const stale = { indices: { sovereignty: 5, foodAutonomy: 5, energyAutonomy: 5, internalSecurity: 5 } };
  const pinned = pinStatSheetToEngine({ indices: {} }, e, { previous: stale });
  const i = economyIndicators(e);
  const debtToOutput = e.debt / Math.max(1, i.output);
  assert.equal(pinned.indices.sovereignty, Math.round(clamp(e.administrativeReach - 20 * e.sanctionsFaced - 15 * clamp(debtToOutput / 1.5, 0, 1), 0, 100)));
  const requiredLandPerCapita = 5 / Math.max(1, e.technology);
  const landPerCapita = e.effectiveLand / Math.max(1, e.population);
  assert.equal(pinned.indices.foodAutonomy, Math.round(clamp(50 * Math.sqrt(Math.max(0, landPerCapita / requiredLandPerCapita)), 0, 100)));
  assert.equal(pinned.indices.energyAutonomy, Math.round(clamp(100 - e.energyImportShare, 0, 100)));
  assert.equal(pinned.indices.internalSecurity, Math.round(clamp(e.legitimacy - (e.atWar ? 15 : 0) - 40 * clamp(e.expectedInflation - 0.1, 0, 1) - (20 / 0.15) * clamp(-e.outputGap, 0, 0.15), 0, 100)));
  for (const k of ["sovereignty", "foodAutonomy", "energyAutonomy", "internalSecurity"]) {
    assert.ok(pinned.indices[k] >= 0 && pinned.indices[k] <= 100, `${k} stays within 0-100`);
    assert.notEqual(pinned.indices[k], 5, `${k} overwrites the stale sticky value with the engine's own`);
  }

  // War, high inflation and a demand slump all cost internal security.
  const strained = { ...e, atWar: true, expectedInflation: 0.6, outputGap: -0.15 };
  const strainedPinned = pinStatSheetToEngine({ indices: {} }, strained);
  assert.ok(strainedPinned.indices.internalSecurity < pinned.indices.internalSecurity, "war, inflation and recession erode internal security");

  // A land-rich, low-population polity reads as more food-autonomous than a crowded one at the same technology.
  // Crowded first, so the baseline sits below the index's 100 cap and the comparison is meaningful.
  const crowded = { ...e, population: e.population * 20 };
  const crowdedPinned = pinStatSheetToEngine({ indices: {} }, crowded);
  const landRich = { ...crowded, effectiveLand: crowded.effectiveLand * 5 };
  const landRichPinned = pinStatSheetToEngine({ indices: {} }, landRich);
  assert.ok(landRichPinned.indices.foodAutonomy > crowdedPinned.indices.foodAutonomy, "more land per head reads as more food-autonomous");

  // A completed energy-sector project measurably narrows import dependence.
  const beforeProject = normalizeEconomy(e);
  const program = normalizeProgram({ proceedsHeld: 2000, projects: [{ id: "dam", name: "Dam", kind: "productive", sector: "energy", cost: 1000, expectedYield: 0.1, buildYears: 1, status: "building", funded: 2000, disbursed: 900, progress: 0.9 }] });
  const { economyDelta } = stepProgram(program, beforeProject, { years: 1, date: "2020-01-01" });
  const afterProject = applyProgramDelta(beforeProject, economyDelta);
  assert.ok(afterProject.energyImportShare < beforeProject.energyImportShare, "a completed energy project reduces import dependence");
  const afterPinned = pinStatSheetToEngine({ indices: {} }, afterProject);
  assert.ok(afterPinned.indices.energyAutonomy > pinned.indices.energyAutonomy, "completing an energy asset raises the energy-autonomy index");
});

test("repinCountryStats: a persisted sheet is re-synced to the engine after every jump, never left stale", () => {
  const e0 = applyEconomyChange(seedEconomy({ year: 2016, regionShare: 0.02, population: 80e6 }), { set: { debt: 0 } });
  const sheet = pinStatSheetToEngine({ capital: "Kinshasa", economy: { gdp: "35 B USD", currency: "Franc congolais" } }, e0);
  assert.equal(sheet.economy.publicDebt, "0.0% GDP", "no debt yet");

  // The campaign advances: the polity borrows. The persisted sheet, on its own,
  // would go stale right here — this is the field report's exact split screen
  // (panel says one number, sheet still says the old one).
  const e1 = { ...e0, debt: economyIndicators(e0).output * 0.095 };
  const countryStats = { "Democratic Republic of the Congo": sheet, "Nowhere": { economy: {} } };
  const economies = { "Democratic Republic of the Congo": e1 };
  const repinned = repinCountryStats(countryStats, economies);
  assert.equal(repinned["Democratic Republic of the Congo"].economy.publicDebt, "9.5% GDP", "the sheet now agrees with the engine");
  assert.equal(repinned["Democratic Republic of the Congo"].economy.gdp, sheet.economy.gdp, "prose GDP is untouched (no dollar anchor set)");
  assert.equal(repinned["Democratic Republic of the Congo"].capital, "Kinshasa", "sticky prose survives");
  assert.deepEqual(repinned["Nowhere"], countryStats["Nowhere"], "a country with no tracked economy is left exactly as it was");
  assert.deepEqual(repinCountryStats(null, economies), {});
  assert.deepEqual(repinCountryStats(countryStats, null)["Democratic Republic of the Congo"], sheet, "no economies: nothing to re-pin against, sheet unchanged");
});

test("describeEconomy and buildEconomyBrief name the binding constraint and the monetary verdict", () => {
  const rome = applyEconomyChange(seedEconomy({ year: 117, regionShare: 0.25 }), { shift: { militaryUpkeep: 3_000_000 } });
  const text = describeEconomy("Rome", rome, { full: true });
  assert.match(text, /Rome: output [\d,]+ SY\/yr/);
  assert.match(text, /fiscal verdict: spending exceeds revenue .* binding constraint is (monetization|administrativeReach|taxRate)/);
  assert.match(text, /commodity-backed, issued by mint/);
  const short = describeEconomy("Rome", rome, { full: false });
  assert.ok(short.split("\n").length === 1);

  const brief = buildEconomyBrief({ Rome: rome, Parthia: seedEconomy({ year: 117, regionShare: 0.08 }) }, { playerPolity: "Rome", focus: ["Parthia"] });
  assert.ok(brief.startsWith("Rome:"));
  assert.match(brief, /Other powers \(computed\):\n  Parthia:/);
  assert.equal(buildEconomyBrief({}, { playerPolity: "Rome" }), "");
});

test("buildEconomyBrief states the player's currency position against the rest of the world, when there is more than one economy to compare", () => {
  const base = seedEconomy({ year: 2016, regionShare: 0.02 });
  const cheap = normalizeEconomy({ ...base, exchangeRate: 140 });
  const dear = normalizeEconomy({ ...base, exchangeRate: 80 });
  const cheapBrief = buildEconomyBrief({ Ours: cheap, Rival: dear }, { playerPolity: "Ours" });
  assert.match(cheapBrief, /currency vs the rest of the world: [\d.]+% cheaper than average — a real export edge/);
  const dearBrief = buildEconomyBrief({ Ours: dear, Rival: cheap }, { playerPolity: "Ours" });
  assert.match(dearBrief, /currency vs the rest of the world: [\d.]+% dearer than average — exports lose some edge/);
  // Nothing to compare against with only the player's own economy known.
  assert.doesNotMatch(buildEconomyBrief({ Ours: cheap }, { playerPolity: "Ours" }), /currency vs the rest of the world/);
});

test("describeEconomy: an ANCHORED commodity-backed economy with reserves does not throw, and states the reserve cover in SY and USD", () => {
  // Regression test: a local `const money = evaluateMonetarySystem(e)` used to
  // shadow the module-level `money` USD formatter for the whole function, so
  // this exact branch (anchored, backingRatio != null) threw "Cannot access
  // 'money' before initialization" in production — every existing test used
  // an un-anchored economy (usdPerSY === 0), which short-circuits past the
  // formatter call entirely and never exercised the bug.
  const anchored = applyEconomyChange(anchorUnitValue(seedEconomy({ year: 117, regionShare: 0.25 }), 900), { set: { reserves: 1000 } });
  const text = describeEconomy("Rome", anchored, { full: true });
  assert.match(text, /reserve cover [\d.]+% \([\d,]+ SY ≈ [\d,.]+ USD held\)/);
});

test("buildEconomyBrief states explicitly when the player's own polity has NO programme, not just when it has one", () => {
  const rome = seedEconomy({ year: 117, regionShare: 0.25 });
  const noProgramme = buildEconomyBrief({ Rome: rome }, { playerPolity: "Rome" });
  assert.match(noProgramme, /Rome: no tokenised-infrastructure programme has been created yet/);
  // A third power's absence of a programme is not the player's business to be told about.
  assert.ok(!noProgramme.includes("Parthia: no tokenised"));

  const withProgramme = buildEconomyBrief({ Rome: rome }, { playerPolity: "Rome", programs: { Rome: { name: "CIT", score: 50 } } });
  assert.ok(!withProgramme.includes("no tokenised-infrastructure programme"));
  assert.match(withProgramme, /Programme "CIT"/);
});
