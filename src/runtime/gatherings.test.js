import test from "node:test";
import assert from "node:assert/strict";
import { GATHERINGS_RULES, MAX_REACH_SHARE, MIN_COST_PER_HEAD, applyGatheringOps, describeGatherings, normalizeGathering, outcomeOf, reachablePool, realizedMargin, runNationalProgramme, runWorldProgramme } from "./gatherings.js";
import { stepTreasuries } from "./treasuries.js";

const church = { faithful: { africa: 292_141_034, americas: 678_335_095, asia: 156_135_910, europe: 287_794_056, oceania: 11_253_081 } };
const economies = { "Saint-Siège": { population: 501, legitimacy: 71 } };
const purses = [{ body: "Pax Africa", capital: 0, treasury: 0, margin: 0, retain: 1, key: "equal" }];

test("a gathering draws on the people it can reach, and never a continent of them", () => {
  // Money ample, so what binds is the ceiling.
  const g = normalizeGathering({ name: "JMJ Lagos", host: "Pax Africa", continent: "africa", cost: 500_000, expected: 50_000_000 });
  assert.equal(reachablePool(g, { church }), 292_141_034);
  const out = outcomeOf(g, { church, legitimacy: 71 });
  assert.equal(out.ceiling, Math.round(292_141_034 * MAX_REACH_SHARE));
  assert.ok(out.attendance < out.ceiling, "standing thins the crowd");
  assert.ok(out.attendance > 4_000_000, `drew ${out.attendance}`);
});

test("a crowd is never free: the budget in hand decides how many can come", () => {
  const g = { name: "Petit", host: "Pax Africa", continent: "africa", cost: 2_000, expected: 5_000_000 };
  const out = outcomeOf(g, { church, legitimacy: 50 });
  // 2,000 SY of budget hosts 100,000 at the per-head floor, thinned to 65,000.
  assert.equal(out.affordable, 100_000);
  assert.equal(out.attendance, 65_000, "ambition beyond the purse buys nothing");
  assert.ok(out.cost >= out.attendance * MIN_COST_PER_HEAD, "a bigger crowd always costs more");
  // The gate barely covers the ground: the money is in patronage and in what
  // each person spends beyond the basics, which is the real business.
  assert.ok(out.surplus < out.revenue * 0.5, `surplus ${out.surplus} on revenue ${out.revenue}`);
});

test("standing decides how full it is: a discredited host draws fewer", () => {
  const g = { name: "X", host: "Pax Asia", continent: "asia", cost: 100_000, expected: 1_000_000 };
  const trusted = outcomeOf(g, { church, legitimacy: 100 }).attendance;
  const doubted = outcomeOf(g, { church, legitimacy: 10 }).attendance;
  assert.ok(trusted > doubted, `${trusted} vs ${doubted}`);
  assert.equal(doubted, Math.round(1_000_000 * 0.45));
});

test("holding it books the surplus into the host's purse and leaves a record row", () => {
  const planned = applyGatheringOps([], [{
    op: "plan", name: "Pax Africa 2028", host: "Pax Africa", place: "Lagos", continent: "africa",
    date: "2028-07-14", cost: 40_000, expected: 3_000_000, spendPerHead: 0.03,
  }], { date: "2028-04-06", church, economies, treasuries: purses });
  assert.equal(planned.gatherings.length, 1);

  const held = applyGatheringOps(planned.gatherings, [{ op: "hold", gathering: "Pax Africa 2028", patronage: 20_000 }], {
    date: "2028-07-14", church, economies, treasuries: purses,
  });
  const g = held.gatherings[0];
  assert.equal(g.status, "held");
  // The pole's purse held nothing, so only the 20,000 of patronage funded it:
  // that hosts a million at the per-head floor, thinned to 650,000 by a
  // neutral standing.
  assert.equal(g.attendance, 650_000);
  assert.equal(g.revenue, 39_500);
  // It could not fill what 20,000 of patronage would have paid for, so it
  // spent what the crowd actually cost and kept the rest.
  assert.equal(g.cost, 13_000);
  assert.equal(g.surplus, 26_500);
  const purse = held.treasuries.find((t) => t.body === "Pax Africa");
  assert.equal(purse.treasury, 26_500, "the surplus is in the purse, not in the story");
  // Two rows now: what it earned, and the faith it renewed.
  const money = held.rows.find((r) => r.kind === "money");
  const faith = held.rows.find((r) => r.kind === "people");
  assert.match(money.what, /surplus from Pax Africa 2028/);
  assert.match(money.source, /attending/);
  assert.ok(faith.amount > 0, "a crowd that size brings people back");
});

test("a gathering that costs more than it takes drains the purse", () => {
  const rich = [{ body: "Pax Oceania", capital: 0, treasury: 10_000, margin: 0, retain: 1, key: "equal" }];
  const planned = applyGatheringOps([], [{ op: "plan", name: "Petit rassemblement", host: "Pax Oceania", continent: "oceania", date: "2028-05-01", cost: 9_000, expected: 100_000 }], { date: "2028-04-06", church, treasuries: rich });
  const held = applyGatheringOps(planned.gatherings, [{ op: "hold", gathering: "Petit rassemblement", costOverrun: 3_000 }], { date: "2028-05-01", church, treasuries: rich });
  assert.ok(held.gatherings[0].surplus < 0, `surplus ${held.gatherings[0].surplus}`);
  assert.ok(held.treasuries[0].treasury < 10_000, "a badly judged gathering hurts");
  assert.match(held.rows.find((r) => r.kind === "money").what, /loss on Petit rassemblement/);
});

test("a margin is what was earned over the window, and nothing when nothing was held", () => {
  const held = [
    { name: "A", host: "Pax Africa", status: "held", heldAt: "2027-07-01", surplus: 30_000 },
    { name: "B", host: "Pax Africa", status: "held", heldAt: "2028-07-01", surplus: 30_000 },
    { name: "C", host: "Pax Africa", status: "held", heldAt: "2019-01-01", surplus: 900_000 },
    { name: "D", host: "Pax Asia", status: "held", heldAt: "2028-07-01", surplus: 50_000 },
  ];
  // Two inside the three-year window, 60,000 over three years, on 500,000 of capital.
  assert.ok(Math.abs(realizedMargin(held, "Pax Africa", { asOf: "2028-08-01", capital: 500_000 }) - 0.04) < 1e-9);
  assert.equal(realizedMargin(held, "Pax Europa", { asOf: "2028-08-01", capital: 500_000 }), 0, "a body that held nothing earns nothing");
  assert.equal(realizedMargin(held, "Pax Africa", { asOf: "2028-08-01", capital: 0 }), 0);
});

test("a crowd is paid for once: its takings never become a yield on capital", () => {
  const endowed = [{ body: "Pax Africa", capital: 500_000, treasury: 40_000, margin: 0.05, retain: 1, key: "equal", status: "active" }];
  const planned = applyGatheringOps([], [{ op: "plan", name: "Pax Africa 2028", host: "Pax Africa", continent: "africa", date: "2028-07-14", cost: 20_000, expected: 900_000, spendPerHead: 0.06 }], { date: "2028-04-06", church, treasuries: endowed });
  const held = applyGatheringOps(planned.gatherings, [{ op: "hold", gathering: "Pax Africa 2028" }], { date: "2028-07-14", church, treasuries: endowed });
  const purse = held.treasuries.find((t) => t.body === "Pax Africa");

  assert.ok(held.gatherings[0].surplus > 0, "the gathering has to earn for the test to mean anything");
  assert.equal(purse.margin, 0.05, "holding a gathering does not raise the return paid on placed capital");
  assert.ok(purse.earnedMargin > 0, "what the crowd returned is reported against the body");

  // And the reported figure must not reach the payer: one period of the purse
  // pays the placement and nothing more.
  const stepped = stepTreasuries(held.treasuries, { organizations: [], economies: {}, years: 1, date: "2029-07-14" });
  const paid = stepped.rows.filter((r) => r.polity === "Pax Africa" && r.amount > 0).reduce((s, r) => s + r.amount, 0);
  assert.ok(Math.abs(paid - 500_000 * 0.05) < 1, `a year pays the placement alone, got ${paid}`);
});

// "Il faut la même logique pour la holding, qui doit engager des événements
// planétaires." The world scale existed in the constants and nowhere else: a
// world gathering has no continent, so the pool fell through to the host's
// population — and a federation is not a polity, so it drew nobody.
test("the federation holds a world gathering against every baptised person alive", () => {
  const everyone = Object.values(church.faithful).reduce((a, b) => a + b, 0);
  const world = {
    church,
    economies: {},
    gatherings: [],
    organizations: [],
    treasuries: [
      { body: "Une Seule Église", capital: 0, treasury: 200_000, margin: 0, retain: 0, key: "need", reserve: 150_000, status: "active" },
      { body: "Pax Africa", parent: "Une Seule Église", capital: 0, treasury: 5_000, margin: 0, retain: 1, key: "equal", status: "active" },
    ],
  };
  const out = runWorldProgramme(world, { asOf: "2030-07-20", years: 1 });
  assert.deepEqual(out.held, ["Une Seule Église"], "only the body nothing sits above holds it");

  const g = out.world.gatherings.at(-1);
  assert.equal(g.scale, "world");
  assert.ok(g.attendance > 0, "it draws from the whole Church, not from a host that has no people");
  assert.ok(g.attendance <= everyone * 0.002, `two thousandths of the baptised is the ceiling, drew ${g.attendance}`);

  // The renewal lands across the continents where the faithful actually are.
  const africa = out.faithfulOps.find((op) => op.continent === "africa");
  assert.ok(africa && africa.delta > 0);
  assert.ok(Math.abs(out.faithfulOps.reduce((s, op) => s + op.delta, 0) - g.renewed) < 1, "all of it is placed somewhere");

  // Once every few years, not every turn.
  assert.deepEqual(runWorldProgramme(out.world, { asOf: "2031-07-20", years: 1 }).held, [], "a world gathering is rare or it is not an event");
  assert.deepEqual(runWorldProgramme(out.world, { asOf: "2034-07-20", years: 1 }).held, ["Une Seule Église"]);

  // A federation with no campaign fund holds nothing: this is what the reserve is for.
  const broke = { ...world, treasuries: world.treasuries.map((t) => (t.parent ? t : { ...t, treasury: 0 })) };
  assert.deepEqual(runWorldProgramme(broke, { asOf: "2030-07-20", years: 1 }).held, []);
});

test("refusals are named: an unknown gathering, one already held, a host with no purse", () => {
  const r1 = applyGatheringOps([], [{ op: "hold", gathering: "Nothing" }], { date: "2028-01-01" });
  assert.match(r1.refusals[0], /no gathering named "Nothing"/);

  const planned = applyGatheringOps([], [{ op: "plan", name: "G", host: "Pax Asia", continent: "asia", cost: 10, expected: 1000 }], { date: "2028-01-01", church });
  const once = applyGatheringOps(planned.gatherings, [{ op: "hold", gathering: "G" }], { date: "2028-02-01", church, treasuries: [] });
  assert.match(once.refusals.find((x) => /no purse/.test(x)) ?? "", /has no purse/);
  const twice = applyGatheringOps(once.gatherings, [{ op: "hold", gathering: "G" }], { date: "2028-03-01", church });
  assert.match(twice.refusals[0], /already held/);

  const nowhere = applyGatheringOps([], [{ op: "plan", name: "H", host: "Nobody", continent: "", cost: 0, expected: 10 }], { date: "2028-01-01" });
  const drew = applyGatheringOps(nowhere.gatherings, [{ op: "hold", gathering: "H" }], { date: "2028-02-01" });
  assert.match(drew.refusals[0], /nobody it can reach/);
});

test("the block states what was drawn, and what a planned one can reach and afford", () => {
  const list = [
    { name: "Pax Africa 2028", host: "Pax Africa", place: "Lagos", status: "held", heldAt: "2028-07-14", attendance: 650_000, revenue: 39_500, cost: 20_000, surplus: 19_500 },
    { name: "Pax Europa 2029", host: "Pax Europa", continent: "europe", status: "planned", date: "2029-05-01", cost: 30_000, expected: 2_000_000 },
  ];
  const text = describeGatherings(list, { church });
  assert.match(text, /650,000 attended; took 39,500 SY against 20,000 SY of cost; surplus 19,500 SY to Pax Africa/);
  assert.match(text, /the pool it can reach is 287,794,056, so at most 5,755,881 can come, and its budget hosts 1,500,000/);
  assert.match(GATHERINGS_RULES, /Do not write an attendance figure/);
  assert.match(GATHERINGS_RULES, /A federation that holds nothing earns nothing/);
  assert.match(GATHERINGS_RULES, /A crowd is never free/);
  assert.equal(describeGatherings([]), "");
});

// "Les événements nationaux, je ne vais pas intervenir dessus." A chapter kept
// open holds its own year, on its own budget, without anyone convoking it.
test("a chapter with a running budget holds its national year by itself", () => {
  const world = {
    church,
    economies: {},
    gatherings: [],
    treasuries: [
      { body: "Pax Africa", parent: "H", capital: 0, treasury: 5_000, margin: 0, retain: 1, key: "equal", operatingBudget: 4_000, fundedUntil: "2028-05-08", status: "active" },
      { body: "Pax Oceania", parent: "H", capital: 0, treasury: 0, margin: 0, retain: 1, key: "equal", operatingBudget: 1_000, status: "active" },
      { body: "Sans budget", parent: "H", capital: 0, treasury: 9_000, margin: 0, retain: 1, key: "equal", operatingBudget: 0, status: "active" },
      // Named in the language the world is played in: this is Europe, and it
      // held nothing for a year because the pattern looked for "europe".
      { body: "Pax Europa", parent: "H", capital: 0, treasury: 5_000, margin: 0, retain: 1, key: "equal", operatingBudget: 4_000, fundedUntil: "2028-05-08", status: "active" },
    ],
  };
  const out = runNationalProgramme(world, { asOf: "2028-12-31", years: 1, organizations: [{ name: "Pax Africa", members: ["Nigeria", "Benin", "Angola"] }] });
  assert.deepEqual(out.held, ["Pax Africa", "Pax Europa"], "every funded chapter with money holds its year — and a chapter is found by its own name, whatever the world calls its continent");

  const g = out.world.gatherings.find((x) => x.host === "Pax Africa");
  assert.equal(out.world.gatherings.find((x) => x.host === "Pax Europa").continent, "europe");
  assert.equal(g.scale, "national");
  assert.equal(g.place, "Nigeria, Benin, Angola", "it names the countries it actually gathers");
  // A national scale reaches a tenth of what a continental one does.
  assert.ok(g.attendance > 0 && g.attendance < 292_141_034 * 0.002, `drew ${g.attendance}`);
  assert.ok(g.surplus > 0, "a year of ordinary work pays for itself and a little more");
  assert.match(out.rows.find((r) => r.kind === "money").what, /surplus from its national gatherings/);
  assert.ok(out.world.treasuries[0].treasury > 5_000, "what it earned is in its purse");

  // Nothing runs without a period, and a body with no continent is left alone.
  assert.deepEqual(runNationalProgramme(world, { asOf: "2028-12-31", years: 0 }).held, []);
});
