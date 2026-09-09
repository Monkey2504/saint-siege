/*! Open Historia — unit combat / assault tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The controller (unitsController.js) reads world.json and writes it back, so
// it is not unit-testable as-is. The DECISION it makes is, and it lives here:
// planAssault answers "who defends this objective, what does taking it cost,
// and does it fall" as a pure function of state. The controller is a thin
// caller that only writes what planAssault returns.

import assert from "node:assert/strict";
import test from "node:test";

import {
  applyPlanToUnits,
  contestRadiusKm,
  distanceKm,
  engagementRangeKm,
  isHostileTo,
  planAssault,
  resolveClash,
  selectDefenders,
} from "./unitCombat.js";

// ~111 km per degree of latitude, so offsets below are easy to reason about.
const at = (lat, lng) => ({ lat, lng });

const unit = (id, extra = {}) => ({
  id,
  name: id,
  type: "infantry",
  ownerCode: "Borduria",
  strength: 100,
  status: "idle",
  regionId: "",
  lat: 0,
  lng: 0,
  ...extra,
});

const ATTACKER = unit("att-1", { ownerCode: "Ruritania", type: "armor", strength: 120, ...at(0, 0) });
const REGION = { regionId: "GID-1", regionName: "Provence", owner: "Borduria", ...at(0.2, 0.2) };
const MODERN = "2026-03-01"; // era factor 1.15 — the era the fork is mostly played in
const BRONZE = "1200 BC"; // era factor 0.5

// ---------------------------------------------------------------- defenders

test("selectDefenders: enemies in the region or inside the contest radius, strongest first", () => {
  const units = [
    ATTACKER,
    unit("d-weak", { strength: 40, ...at(0.2, 0.2) }),
    unit("d-strong", { strength: 90, ...at(0.25, 0.25) }),
    unit("d-tagged", { strength: 10, regionId: "GID-1", ...at(40, 40) }), // far away but IN the region
    unit("d-far", { strength: 200, ...at(30, 30) }), // no tag, out of reach
    unit("friend", { ownerCode: "Ruritania", strength: 300, ...at(0.2, 0.2) }),
    unit("routed", { strength: 0, ...at(0.2, 0.2) }),
    unit("ghost", { status: "pending", strength: 80, ...at(0.2, 0.2) }),
  ];

  const defenders = selectDefenders({ units, attacker: ATTACKER, target: REGION, kind: "region", gameDate: MODERN });

  assert.deepEqual(defenders.map((d) => d.id), ["d-strong", "d-weak", "d-tagged"]);
});

test("selectDefenders: own units, dead units and pending deploys never defend", () => {
  const units = [
    unit("friend", { ownerCode: "Ruritania", ...at(0.1, 0.1) }),
    unit("routed", { strength: 0, ...at(0.1, 0.1) }),
    unit("beaten", { status: "defeated", ...at(0.1, 0.1) }),
    unit("ghost", { status: "pending", ...at(0.1, 0.1) }),
    unit("nowhere", { lat: Number.NaN, lng: Number.NaN }),
  ];
  assert.deepEqual(
    selectDefenders({ units, attacker: ATTACKER, target: REGION, kind: "region", gameDate: MODERN }),
    [],
  );
  assert.equal(isHostileTo(unit("x", { ownerCode: "ruritania" }), ATTACKER), false); // case-insensitive
  assert.equal(isHostileTo(unit("x", { ownerCode: "Borduria" }), ATTACKER), true);
});

test("a structure is held by its garrison, not by the province around it", () => {
  // Feature radius is the garrison range; region radius is the attacker's own.
  assert.equal(contestRadiusKm("feature", "armor", MODERN), engagementRangeKm("garrison", MODERN));
  assert.equal(contestRadiusKm("region", "armor", MODERN), engagementRangeKm("armor", MODERN));
  assert.ok(contestRadiusKm("feature", "armor", MODERN) < contestRadiusKm("region", "armor", MODERN));
  // ...and both shrink in an earlier era.
  assert.ok(contestRadiusKm("region", "armor", BRONZE) < contestRadiusKm("region", "armor", MODERN));
});

// ------------------------------------------------------------------- region

test("region with defenders: losses are applied to both sides and the fight is sequential", () => {
  const units = [
    ATTACKER,
    unit("d-a", { strength: 60, ...at(0.2, 0.2) }),
    unit("d-b", { strength: 30, ...at(0.2, 0.2) }),
  ];
  const plan = planAssault({ units, attacker: ATTACKER, target: REGION, kind: "region", gameDate: MODERN, round: 3 });

  assert.equal(plan.ok, true);
  assert.equal(plan.inRange, true);
  assert.equal(plan.unopposed, false);
  assert.equal(plan.defenders.length, 2);
  assert.equal(plan.clashes.length, 2, "both defenders are fought, not just the strongest");
  assert.deepEqual(plan.clashes.map((c) => c.defenderId), ["d-a", "d-b"]);

  // The second clash is fought with what the first one left.
  assert.equal(plan.clashes[1].attackerStrength <= plan.clashes[0].attackerStrength, true);
  assert.equal(plan.attackerStrength, plan.clashes[1].attackerStrength);
  assert.equal(plan.losses.attacker, plan.startStrength - plan.attackerStrength);
  assert.ok(plan.losses.attacker > 0, "taking a defended province costs the attacker");
  assert.ok(plan.losses.defenders > 0, "and it costs the defenders");

  // Each defender's own clash decided its strength — no invented numbers.
  for (const outcome of plan.defenderOutcomes) {
    const clash = plan.clashes.find((c) => c.defenderId === outcome.id);
    assert.equal(outcome.strength, clash.defenderStrength);
    assert.equal(outcome.engaged, true);
  }
  assert.equal(["captured", "repelled", "destroyed"].includes(plan.outcome), true);
  assert.equal(plan.captured, plan.outcome === "captured");
});

test("region with defenders: the losses are exactly what resolveClash says", () => {
  const defender = unit("d-a", { strength: 60, ...at(0.2, 0.2) });
  const plan = planAssault({
    units: [ATTACKER, defender],
    attacker: ATTACKER,
    target: REGION,
    kind: "region",
    gameDate: MODERN,
    round: 7,
  });
  const direct = resolveClash(ATTACKER, defender, 7);
  assert.equal(plan.attackerStrength, direct.attackerStrength);
  assert.equal(plan.defenderOutcomes[0].strength, direct.defenderStrength);
});

test("region without defenders: it falls unopposed, with no losses at all", () => {
  const plan = planAssault({
    units: [ATTACKER, unit("far", { ...at(40, 40) })],
    attacker: ATTACKER,
    target: REGION,
    kind: "region",
    gameDate: MODERN,
  });

  assert.equal(plan.unopposed, true);
  assert.equal(plan.captured, true);
  assert.equal(plan.outcome, "unopposed");
  assert.deepEqual(plan.clashes, []);
  assert.equal(plan.attackerStrength, ATTACKER.strength);
  assert.deepEqual(plan.losses, { attacker: 0, defenders: 0 });
});

test("a province falls only when NO defender is left standing", () => {
  // A defender far too strong to clear: the province cannot be captured.
  const plan = planAssault({
    units: [ATTACKER, unit("wall", { strength: 900, type: "garrison", ...at(0.2, 0.2) })],
    attacker: ATTACKER,
    target: REGION,
    kind: "region",
    gameDate: MODERN,
    round: 2,
  });
  assert.equal(plan.captured, false);
  assert.ok(plan.defenderOutcomes[0].strength > 0);
  assert.equal(["repelled", "destroyed"].includes(plan.outcome), true);
});

test("a defender the spent attacker never reached is left untouched", () => {
  const units = [
    unit("weak-att", { ownerCode: "Ruritania", type: "infantry", strength: 1, ...at(0, 0) }),
    unit("d-a", { strength: 400, type: "armor", ...at(0.1, 0.1) }),
    unit("d-b", { strength: 300, type: "armor", ...at(0.1, 0.1) }),
  ];
  const plan = planAssault({
    units,
    attacker: units[0],
    target: REGION,
    kind: "region",
    gameDate: MODERN,
    round: 1,
  });
  assert.equal(plan.attackerSurvives, false);
  assert.equal(plan.outcome, "destroyed");
  assert.equal(plan.captured, false);
  const untouched = plan.defenderOutcomes.find((o) => !o.engaged);
  assert.ok(untouched, "the second defender was never fought");
  assert.equal(untouched.strength, untouched.before);
});

// ------------------------------------------------------------------ feature

test("feature with a garrison: the structure's defenders are the units standing at it", () => {
  const garrison = unit("gar-1", { type: "garrison", strength: 70, ...at(0.05, 0.05) });
  const units = [
    ATTACKER,
    garrison,
    // Inside the province but well outside the garrison radius: not a defender.
    unit("field-army", { strength: 500, ...at(0.9, 0.9) }),
  ];
  const target = at(0.05, 0.05);
  assert.ok(distanceKm(ATTACKER, target) <= engagementRangeKm(ATTACKER.type, MODERN));

  const plan = planAssault({ units, attacker: ATTACKER, target, kind: "feature", gameDate: MODERN, round: 4 });

  assert.deepEqual(plan.defenders.map((d) => d.id), ["gar-1"]);
  assert.equal(plan.clashes.length, 1);
  assert.equal(plan.unopposed, false);
  assert.equal(plan.defenderOutcomes[0].before, 70);
  assert.notEqual(plan.defenderOutcomes[0].strength, 70, "the garrison took casualties");
});

test("feature without a garrison: taken unopposed, nobody is hurt", () => {
  const plan = planAssault({
    units: [ATTACKER, unit("field-army", { strength: 500, ...at(0.9, 0.9) })],
    attacker: ATTACKER,
    target: at(0.05, 0.05),
    kind: "feature",
    gameDate: MODERN,
  });
  assert.equal(plan.unopposed, true);
  assert.equal(plan.captured, true);
  assert.equal(plan.outcome, "unopposed");
  assert.equal(plan.attackerStrength, ATTACKER.strength);
  assert.deepEqual(plan.losses, { attacker: 0, defenders: 0 });
});

// -------------------------------------------------------------------- reach

test("out-of-range attack resolves nothing: no clash, no losses, no capture", () => {
  const far = { regionId: "GID-9", ...at(30, 30) };
  const plan = planAssault({
    units: [ATTACKER, unit("d-a", { ...at(30, 30) })],
    attacker: ATTACKER,
    target: far,
    kind: "region",
    gameDate: MODERN,
  });

  assert.equal(plan.inRange, false);
  assert.equal(plan.outcome, "unreached");
  assert.equal(plan.captured, false);
  assert.deepEqual(plan.clashes, []);
  assert.deepEqual(plan.defenders, []);
  assert.equal(plan.attackerStrength, ATTACKER.strength);
  assert.deepEqual(plan.losses, { attacker: 0, defenders: 0 });
});

test("reach is era-scaled: the same order resolves in 2026 and is out of reach in 1200 BC", () => {
  const target = at(1.2, 0); // ~133 km — inside a modern armor's reach, outside a Bronze Age one's
  const args = { units: [ATTACKER], attacker: ATTACKER, target, kind: "region" };
  assert.equal(planAssault({ ...args, gameDate: MODERN }).inRange, true);
  assert.equal(planAssault({ ...args, gameDate: BRONZE }).inRange, false);
});

test("a malformed target resolves nothing rather than guessing", () => {
  const bad = planAssault({ units: [ATTACKER], attacker: ATTACKER, target: { lat: "x", lng: null } });
  assert.equal(bad.ok, false);
  assert.equal(bad.outcome, "invalid");
  assert.equal(bad.captured, false);
  assert.equal(planAssault({ units: [], attacker: null, target: REGION }).ok, false);
});

// ----------------------------------------------------- writing the result

test("applyPlanToUnits: the losses reach world.units and the routed leave it", () => {
  const units = [
    ATTACKER,
    unit("d-a", { strength: 60, ...at(0.2, 0.2) }),
    unit("bystander", { ownerCode: "Syldavia", strength: 55, ...at(20, 20) }),
  ];
  const plan = planAssault({ units, attacker: ATTACKER, target: REGION, kind: "region", gameDate: MODERN, round: 3 });
  const next = applyPlanToUnits({
    units,
    attackerId: ATTACKER.id,
    plan,
    point: REGION,
    regionId: plan.captured ? REGION.regionId : "",
    timestamp: "2026-03-01T00:00:00.000Z",
  });

  const attacker = next.find((u) => u.id === ATTACKER.id);
  assert.equal(attacker.strength, plan.attackerStrength);
  assert.equal(attacker.status, "engaged");
  assert.equal(attacker.lat, REGION.lat, "a surviving attacker stands on the objective");
  assert.equal(attacker.lng, REGION.lng);

  const defender = next.find((u) => u.id === "d-a");
  const outcome = plan.defenderOutcomes[0];
  if (outcome.strength > 0) {
    assert.equal(defender.strength, outcome.strength);
    assert.equal(defender.status, "engaged");
  } else {
    assert.equal(defender, undefined, "a destroyed defender leaves the order of battle");
  }

  // Nobody who was not in this battle is touched.
  assert.deepEqual(next.find((u) => u.id === "bystander"), units[2]);
});

test("applyPlanToUnits: a captured province re-tags the attacker; an unresolved plan writes nothing", () => {
  const units = [ATTACKER];
  const won = planAssault({ units, attacker: ATTACKER, target: REGION, kind: "region", gameDate: MODERN });
  assert.equal(won.captured, true);
  const taken = applyPlanToUnits({ units, attackerId: ATTACKER.id, plan: won, point: REGION, regionId: "GID-1" });
  assert.equal(taken[0].regionId, "GID-1");

  const far = planAssault({ units, attacker: ATTACKER, target: at(30, 30), kind: "region", gameDate: MODERN });
  assert.equal(far.inRange, false);
  assert.deepEqual(applyPlanToUnits({ units, attackerId: ATTACKER.id, plan: far, point: at(30, 30) }), units);
  assert.deepEqual(applyPlanToUnits({ units, attackerId: ATTACKER.id, plan: { ok: false } }), units);
});

test("applyPlanToUnits: an annihilated attacker is removed like any routed unit", () => {
  const units = [
    unit("weak-att", { ownerCode: "Ruritania", type: "infantry", strength: 1, ...at(0, 0) }),
    unit("d-a", { strength: 400, type: "armor", ...at(0.1, 0.1) }),
  ];
  const plan = planAssault({ units, attacker: units[0], target: REGION, kind: "region", gameDate: MODERN });
  assert.equal(plan.attackerSurvives, false);
  const next = applyPlanToUnits({ units, attackerId: "weak-att", plan, point: REGION });
  assert.equal(next.some((u) => u.id === "weak-att"), false);
  assert.equal(next.find((u) => u.id === "d-a").status, "engaged");
});

// ------------------------------------------------------------- determinism

test("same inputs, same battle — every time, in any list order", () => {
  const units = [
    ATTACKER,
    unit("d-a", { strength: 60, ...at(0.2, 0.2) }),
    unit("d-b", { strength: 60, ...at(0.21, 0.21) }),
    unit("d-c", { strength: 90, ...at(0.19, 0.19) }),
  ];
  const args = { attacker: ATTACKER, target: REGION, kind: "region", gameDate: MODERN, round: 5 };

  const first = planAssault({ ...args, units });
  const second = planAssault({ ...args, units });
  assert.deepEqual(second, first, "no hidden Math.random anywhere in the path");

  // Storage order must not change the battle: defenders are sorted by strength
  // then id before anything is rolled.
  const shuffled = planAssault({ ...args, units: [units[3], units[0], units[2], units[1]] });
  assert.deepEqual(shuffled.clashes, first.clashes);
  assert.deepEqual(shuffled.defenderOutcomes, first.defenderOutcomes);
  assert.equal(shuffled.attackerStrength, first.attackerStrength);

  // A different round is a different battle (the seed includes it).
  const nextRound = planAssault({ ...args, units, round: 6 });
  assert.notDeepEqual(nextRound.clashes, first.clashes);
});
