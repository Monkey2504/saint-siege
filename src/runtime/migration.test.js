/*! Open Historia — migration engine tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEconomy, outputPerCapita } from "./economy.js";
import { applyEconomyChange } from "./economyBridge.js";
import {
  MAX_JUMP_SHARE, MIGRATION_OP_CAP, MIGRATION_RULES,
  applyMigrationOps, describeMigration, migrationPolicyOf, migrationPressure, normalizeMigration, stepMigration,
} from "./migration.js";

// A polity, in the engine's own terms. normalizeEconomy does not (yet) carry
// migrationPolicy, so it is attached after normalising — exactly as it will
// arrive once ECONOMY_POLICY_FIELDS carries it.
const polity = ({ people = 1e6, technology = 20, capitalPerHead = 2, landPerHead = 1, marketIntegration = 60,
  legitimacy = 60, openness = 30, atWar = false, migrationPolicy = null } = {}) => ({
  ...normalizeEconomy({
    population: people,
    effectiveLand: people * landPerHead,
    capital: people * capitalPerHead,
    technology, marketIntegration, legitimacy, openness, atWar,
  }),
  ...(migrationPolicy ? { migrationPolicy } : {}),
});

// A modern rich economy (~30-40 SY per head) and a modern poor one (~2-4).
const rich = (over = {}) => polity({ people: 80e6, technology: 85, capitalPerHead: 90, marketIntegration: 95, openness: 45, ...over });
const poor = (over = {}) => polity({ people: 40e6, technology: 25, capitalPerHead: 2, marketIntegration: 55, openness: 25, ...over });

const totalPeople = (economies) => Object.values(economies).reduce((sum, e) => sum + e.population, 0);
const applyChanges = (economies, changes) => Object.fromEntries(Object.entries(economies)
  .map(([name, e]) => [name, changes[name] ? applyEconomyChange(e, changes[name]) : normalizeEconomy(e)]));
const corridor = (flows, from, to) => flows.find((f) => f.from === from && f.to === to) ?? null;

test("the fixtures are what they claim: a rich economy really does pay several times a poor one per head", () => {
  assert.ok(outputPerCapita(rich()) > 20, `rich ${outputPerCapita(rich())} SY per head`);
  assert.ok(outputPerCapita(poor()) < 6, `poor ${outputPerCapita(poor())} SY per head`);
  assert.ok(outputPerCapita(rich()) / outputPerCapita(poor()) > 4);
});

test("pressure runs poor → rich and not the reverse, and lands in the measured band (a few tenths of a percent a year)", () => {
  const flows = migrationPressure({ Rich: rich(), Poor: poor() });
  const out = corridor(flows, "Poor", "Rich");
  assert.ok(out, "the poor country sends people to the rich one");
  assert.equal(corridor(flows, "Rich", "Poor"), null, "nobody emigrates toward lower wages in peacetime");
  // OECD-scale peacetime emigration: 0.1-1% of the population a year.
  assert.ok(out.share > 0.001 && out.share < 0.01, `${out.share} of Poor a year`);
  assert.ok(out.people > 0 && Math.abs(out.people - 40e6 * out.share) < 1);
});

test("the mobility transition: the very poorest send FEWER people than the middle-income, though their wage gap is larger", () => {
  const destitute = polity({ people: 40e6, technology: 8, capitalPerHead: 0.4, marketIntegration: 35, openness: 20 });
  const middle = polity({ people: 40e6, technology: 55, capitalPerHead: 12, marketIntegration: 80, openness: 35 });
  const a = corridor(migrationPressure({ Rich: rich(), Poor: destitute }), "Poor", "Rich");
  const b = corridor(migrationPressure({ Rich: rich(), Poor: middle }), "Poor", "Rich");
  assert.ok(outputPerCapita(destitute) < outputPerCapita(middle), "the destitute country is poorer");
  assert.ok(a.share < b.share, `destitute ${a.share} vs middle-income ${b.share} — leaving costs money`);
});

test("war multiplies the outflow by an order of magnitude, and nobody migrates INTO the war", () => {
  const peace = migrationPressure({ Rich: rich(), Poor: poor() });
  const war = migrationPressure({ Rich: rich(), Poor: poor({ atWar: true }) },
    { wars: [{ sides: { a: ["Poor"], b: ["Insurgent Front"] }, status: "active", intensity: 1 }] });
  const before = corridor(peace, "Poor", "Rich").share;
  const after = corridor(war, "Poor", "Rich").share;
  assert.ok(after > before * 10, `${before} → ${after}`);
  // Syria 2012-2016: ~6% of the population a year.
  assert.ok(after > 0.04 && after < 0.09, `wartime outflow ${after} a year`);

  // A war zone attracts no one, even from somewhere poorer still.
  const poorer = polity({ people: 20e6, technology: 12, capitalPerHead: 0.8, marketIntegration: 40 });
  assert.ok(corridor(migrationPressure({ Poor: poor(), Poorer: poorer }), "Poorer", "Poor"), "in peace, the poorer country sends people next door");
  assert.equal(corridor(migrationPressure({ Poor: poor({ atWar: true }), Poorer: poorer }), "Poorer", "Poor"), null, "once it is at war, nobody goes there");
});

test("a collapsed state pushes people out with no war at all — Venezuela's order of magnitude", () => {
  const flows = migrationPressure({ Rich: rich(), Poor: poor({ legitimacy: 15 }) });
  const out = corridor(flows, "Poor", "Rich");
  assert.ok(out.share > 0.02 && out.share < 0.05, `collapse outflow ${out.share} a year (Venezuela ran ~3.8%)`);
});

test("policy is a real lever on both sides: a closed sender is an exit ban, a closed receiver takes a quarter of the share", () => {
  const open = migrationPressure({ Rich: rich(), Poor: poor() });
  const shut = migrationPressure({ Rich: rich(), Poor: poor({ migrationPolicy: "closed" }) });
  assert.ok(corridor(shut, "Poor", "Rich").share < corridor(open, "Poor", "Rich").share * 0.2, "an exit ban cuts the flow by ~90%");

  // Two identical destinations, one closed: it takes far less of the same flow.
  const two = migrationPressure({ Open: rich({ migrationPolicy: "open" }), Shut: rich({ migrationPolicy: "closed" }), Poor: poor() });
  const toOpen = corridor(two, "Poor", "Open").people;
  const toShut = corridor(two, "Poor", "Shut").people;
  assert.ok(toShut > 0 && toOpen / toShut > 4, `${toOpen} to the open door vs ${toShut} to the closed one`);
  // And closing a door DIVERTS people rather than destroying them: the total
  // out of Poor is nearly unchanged, only its split.
  const before = migrationPressure({ Open: rich(), Shut: rich(), Poor: poor() }).filter((f) => f.from === "Poor").reduce((s, f) => s + f.people, 0);
  const after = two.filter((f) => f.from === "Poor").reduce((s, f) => s + f.people, 0);
  assert.ok(Math.abs(after / before - 1) < 0.1, "closing one destination redistributes the same emigrants");
});

test("proximity: a same-continent destination outdraws an identical distant one, and no continent means no distance term", () => {
  const economies = { Near: rich(), Far: rich(), Poor: poor() };
  const flat = migrationPressure(economies);
  assert.ok(Math.abs(corridor(flat, "Poor", "Near").people - corridor(flat, "Poor", "Far").people) < 1, "unknown continents, identical pull");
  const near = migrationPressure(economies, { polities: { Near: { continent: "Europe" }, Far: { continent: "Asia" }, Poor: { continent: "Europe" } } });
  assert.ok(corridor(near, "Poor", "Near").people > corridor(near, "Poor", "Far").people * 1.9, "the neighbour takes about twice the share");
});

test("stepMigration conserves people exactly: what leaves arrives, and the world's headcount does not move", () => {
  const economies = { Rich: rich(), Poor: poor(), Middle: polity({ people: 30e6, technology: 55, capitalPerHead: 12, marketIntegration: 80 }) };
  const before = totalPeople(economies);
  const stepped = stepMigration(economies, { years: 5, date: "2030-01-01" });
  assert.ok(stepped.flows.length >= 2);
  const after = applyChanges(economies, stepped.changes);
  assert.ok(Math.abs(totalPeople(after) - before) < 1, `${before} → ${totalPeople(after)}`);
  const left = stepped.flows.filter((f) => f.from === "Poor").reduce((s, f) => s + f.people, 0);
  assert.ok(Math.abs((economies.Poor.population - after.Poor.population) - left) < 1, "the sender loses exactly the people the corridors carried");
  const arrived = stepped.flows.filter((f) => f.to === "Rich").reduce((s, f) => s + f.people, 0);
  assert.ok(after.Rich.population - economies.Rich.population > 0);
  assert.ok(Math.abs((after.Rich.population - economies.Rich.population) - arrived) < 1, "the receiver gains exactly what arrived");
});

test("the caps hold: no jump, however long or however catastrophic, moves more than the population lever allows", () => {
  const economies = { Rich: rich(), Poor: poor({ atWar: true, legitimacy: 5 }) };
  const stepped = stepMigration(economies, { years: 40, date: "2070-01-01" },);
  const left = stepped.flows.reduce((s, f) => s + f.people, 0);
  assert.ok(left / economies.Poor.population <= MAX_JUMP_SHARE + 1e-9, `${left / economies.Poor.population} of Poor in one jump`);
  assert.ok(Math.abs(stepped.changes.Poor.shift.populationShare) <= 0.2, "inside applyEconomyChange's own ±20%");
  const after = applyChanges(economies, stepped.changes);
  assert.ok(Math.abs(totalPeople(after) - totalPeople(economies)) < 1, "capping a corridor caps BOTH its ends");

  // The receiving cap binds too: a tiny country beside a huge collapsing one.
  const lopsided = { Tiny: rich({ people: 500_000 }), Huge: poor({ people: 200e6, atWar: true, legitimacy: 5 }) };
  const rush = stepMigration(lopsided, { years: 10 });
  const arrived = rush.flows.reduce((s, f) => s + f.people, 0);
  assert.ok(arrived / lopsided.Tiny.population <= MAX_JUMP_SHARE + 1e-9, `${arrived} into 500,000 people`);
  assert.ok(Math.abs(totalPeople(applyChanges(lopsided, rush.changes)) - totalPeople(lopsided)) < 1);
});

test("both sides pay: the sender loses know-how, a fast inflow costs the receiver legitimacy at Germany-2015's order", () => {
  const economies = { Rich: rich({ migrationPolicy: "open" }), Poor: poor({ atWar: true }) };
  const stepped = stepMigration(economies, { years: 1 });
  assert.ok(stepped.changes.Poor.shift.technology < 0, "emigration of the young and schooled is a real drag");
  assert.ok(stepped.changes.Rich.shift.legitimacy < 0, "a fast inflow strains consent");
  const inflow = stepped.flows.reduce((s, f) => s + f.people, 0) / economies.Rich.population;
  assert.ok(inflow > 0.005, `inflow ${inflow} of the receiver's population in a year`);
  // 400 points per unit of excess over the 0.5%/yr a society absorbs unnoticed.
  assert.ok(Math.abs(stepped.changes.Rich.shift.legitimacy + 400 * (inflow - 0.005)) < 0.01);

  // An ordinary peacetime intake is beneath the threshold and costs nothing.
  const calm = stepMigration({ Rich: rich(), Poor: poor() }, { years: 1 });
  assert.equal(calm.changes.Rich.shift.legitimacy, undefined, "0.3%/yr is what every OECD state already absorbs");
  assert.ok(calm.changes.Rich.shift.populationShare > 0, "and it still brings the people");

  // A managed door pays less of the same strain than an open one.
  const managed = stepMigration({ Rich: rich({ migrationPolicy: "managed" }), Poor: poor({ atWar: true }) }, { years: 1 });
  assert.ok(managed.changes.Rich.shift.legitimacy > stepped.changes.Rich.shift.legitimacy, "selection and preparation cost less consent");
});

test("determinism: the same world stepped the same way lands on the same people, twice", () => {
  const world = () => ({ Rich: rich(), Poor: poor(), Middle: polity({ people: 30e6, technology: 55, capitalPerHead: 12 }) });
  const a = stepMigration(world(), { years: 3, date: "2030-01-01" });
  const b = stepMigration(world(), { years: 3, date: "2030-01-01" });
  assert.deepEqual(a.flows, b.flows);
  assert.deepEqual(a.changes, b.changes);
  assert.deepEqual(a.migration, b.migration);
});

test("a world with one polity, no economies, or no elapsed time produces nothing at all", () => {
  assert.deepEqual(migrationPressure({ Only: rich() }), []);
  assert.deepEqual(migrationPressure({}), []);
  assert.deepEqual(migrationPressure(null), []);
  const solo = stepMigration({ Only: rich() }, { years: 10 });
  assert.deepEqual(solo.flows, []);
  assert.deepEqual(solo.changes, {});
  assert.deepEqual(stepMigration({ Rich: rich(), Poor: poor() }, { years: 0 }).flows, []);
  // Two identically rich polities have no gap to move anyone.
  assert.deepEqual(migrationPressure({ A: rich(), B: rich() }), []);
});

test("migrationOps: an event moves real people, is logged with its cause, capped, and refused when it cannot be honoured", () => {
  const economies = { Rich: rich(), Poor: poor() };
  const applied = applyMigrationOps(economies, [
    { op: "flow", from: "Poor", to: "Rich", people: 400_000, cause: "policy", note: "guest-worker treaty" },
    { op: "flow", from: "Rich", to: "Poor", share: 0.001, cause: "climate" },
    { op: "flow", from: "Poor", to: "Atlantis", people: 1000 },
    { op: "flow", from: "Poor", to: "Poor", people: 1000 },
    { op: "flow", from: "Poor", to: "Rich", people: 0 },
    { op: "expel", from: "Poor", to: "Rich", people: 1000 },
    { op: "flow", from: "Poor", to: "Rich", people: 30e6 },
  ], { date: "2031-06-01" });

  assert.equal(applied.flows.length, 3, "three honoured, four rejected outright");
  assert.equal(applied.flows[0].people, 400_000);
  assert.equal(applied.flows[0].cause, "policy");
  assert.equal(applied.flows[1].people, 80_000, "share is a fraction of the SENDER's population");
  assert.equal(applied.flows[2].people, Math.round(40e6 * MIGRATION_OP_CAP), "clamped to 15% of the sender");
  assert.equal(applied.refusals.length, 5, "four refusals and one clamp, all reported");
  assert.match(applied.refusals.join("\n"), /Atlantis" has no economy/);
  assert.match(applied.refusals.join("\n"), /cannot migrate to itself/);
  assert.match(applied.refusals.join("\n"), /unknown op "expel"/);
  assert.match(applied.refusals.join("\n"), /moves nobody/);
  assert.match(applied.refusals.join("\n"), /clamped/);
  assert.match(applied.migration.log[0], /^2031-06-01: Poor → Rich 400,000 \(policy\) — guest-worker treaty$/);

  // The same conservation rule as the computed flows.
  const after = applyChanges(economies, applied.changes);
  assert.ok(Math.abs(totalPeople(after) - totalPeople(economies)) < 1);
  assert.ok(after.Poor.population < economies.Poor.population);

  const nothing = applyMigrationOps(economies, [], {});
  assert.deepEqual(nothing.changes, {});
  assert.deepEqual(nothing.refusals, []);
});

test("normalizeMigration and migrationPolicyOf survive whatever a save file holds", () => {
  assert.deepEqual(normalizeMigration(null), { asOf: "", flows: [], log: [] });
  const cleaned = normalizeMigration({ asOf: " 2030-01-01 ", flows: [{ from: "A", to: "B", people: 5, cause: "nonsense" }, { from: "A", to: "A", people: 5 }, null], log: ["x", "", 3] });
  assert.equal(cleaned.asOf, "2030-01-01");
  assert.equal(cleaned.flows.length, 1);
  assert.equal(cleaned.flows[0].cause, "work", "an unknown cause falls back rather than leaking through");
  assert.deepEqual(cleaned.log, ["x", "3"]);
  assert.equal(migrationPolicyOf({ migrationPolicy: "OPEN" }), "open");
  assert.equal(migrationPolicyOf({ migrationPolicy: "sealed" }), "managed");
  assert.equal(migrationPolicyOf(null), "managed");
});

test("describeMigration: the corridors, the shares, the border policies, in lines the model can narrate", () => {
  const economies = { Rich: rich({ migrationPolicy: "open" }), Poor: poor() };
  const stepped = stepMigration(economies, { years: 2, date: "2032-01-01" });
  const text = describeMigration(stepped.migration, economies, { playerPolity: "Rich" });
  assert.match(text, /people moved along 1 corridor to 2032-01-01/);
  assert.match(text, /Poor → Rich: [\d,]+ \(\d+\.\d\d% of Poor's people\) — work/);
  assert.match(text, /Border policy — Poor: managed; Rich: open\./);
  assert.equal(describeMigration(null, economies), "", "nothing computed yet, nothing said");
  assert.match(MIGRATION_RULES, /^\[Migration — engine state\]/);
  assert.match(MIGRATION_RULES, /migrationOps/);
});
