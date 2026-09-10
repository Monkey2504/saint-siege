import assert from "node:assert/strict";
import test from "node:test";

import {
  CONTINENTS,
  FRONTS,
  PRIESTS_2022,
  SEMINARIANS_2022,
  applyBodyMoves,
  bodyMovesFromOrders,
  ensureBodyFromOrders,
  frontFigures,
  frontRows,
  normalizeChurchBody,
  stepChurchBody,
  totalOf,
} from "./fronts.js";

const order = (text, over = {}) => ({ id: "a1", kind: "action", status: "planned", title: text.slice(0, 40), text, ...over });

test("the body is seeded from the real counts, not from zero", () => {
  const b = normalizeChurchBody(null);
  assert.equal(totalOf(b.priests), 407_730);
  assert.equal(totalOf(b.seminarians), 108_481);
  assert.equal(b.safeguarding.pace, 1);
});

test("left alone, Europe empties and Africa fills — the crisis is the default", () => {
  const after = stepChurchBody(null, { years: 10, date: "2036-01-01" });
  assert.ok(after.priests.europe < PRIESTS_2022.europe * 0.9, "Europe falls");
  assert.ok(after.priests.africa > PRIESTS_2022.africa * 1.15, "Africa rises");
  assert.ok(after.seminarians.europe < SEMINARIANS_2022.europe * 0.8, "European formation empties fastest");
});

test("an order that opens seminaries bends formation where it names, and nowhere else", () => {
  const moves = bodyMovesFromOrders([order("Open and fund twenty new seminaries across Africa.")]);
  assert.ok(moves.formation.africa > 0);
  assert.equal(moves.formation.europe, undefined);
});

test("an order with no place named is a universal instruction, spread across the five", () => {
  const moves = bodyMovesFromOrders([order("Found new seminaries and fund the formation of priests.")]);
  for (const c of CONTINENTS) assert.ok(moves.formation[c] > 0, `${c} bends`);
});

test("naming the subject is not acting on it", () => {
  const moves = bodyMovesFromOrders([order("The crisis of vocations is grave and weighs on the Church.")]);
  assert.deepEqual(moves.formation, {});
  assert.equal(moves.pace, 0);
});

test("a bent formation shows in the seminaries before it shows in the priests", () => {
  const bent = applyBodyMoves(null, bodyMovesFromOrders([order("Open seminaries across Europe.")]));
  const withReform = stepChurchBody(bent, { years: 5 });
  const without = stepChurchBody(null, { years: 5 });
  const dS = withReform.seminarians.europe - without.seminarians.europe;
  const dP = withReform.priests.europe - without.priests.europe;
  assert.ok(dS > 0 && dP > 0, "both move");
  assert.ok(dS / without.seminarians.europe > dP / without.priests.europe, "formation turns first");
});

test("pushing the files makes the curia judge faster; announcing does not", () => {
  const pushed = ensureBodyFromOrders({}, [order("Put judges on every abuse file and sanction the bishops who covered up.")], { years: 1 });
  const idle = ensureBodyFromOrders({}, [order("We reaffirm zero tolerance for abuse.")], { years: 1 });
  assert.ok(pushed.churchBody.safeguarding.judged > idle.churchBody.safeguarding.judged);
  assert.ok(pushed.churchBody.safeguarding.open < idle.churchBody.safeguarding.open);
});

test("no single order settles a front", () => {
  const many = Array.from({ length: 20 }, (_, i) => order("Open seminaries everywhere.", { id: `a${i}` }));
  const bent = applyBodyMoves(null, bodyMovesFromOrders(many));
  for (const c of CONTINENTS) assert.ok(bent.formation[c] <= 3, "the bend is bounded");
  assert.ok(applyBodyMoves(null, { pace: 99 }).safeguarding.pace <= 3);
});

test("six fronts, and finance is one of them rather than all of them", () => {
  assert.equal(FRONTS.length, 6);
  assert.equal(FRONTS.filter((f) => f.key === "finances").length, 1);
});

test("a front the scenario does not hold reads as absent, never as lost", () => {
  const figures = frontFigures({}, "Saint-Siege");
  assert.equal(figures.unity, null);
  assert.equal(figures.vocations, null);
  assert.equal(figures.governance, null);
});

test("unity measures the fracture, not the pope's popularity", () => {
  const world = {
    assembly: {
      seats: 4,
      electors: [
        { id: "1", approval: 60, doctrine: "a", region: "africa", role: "bishops", follows: "x" },
        { id: "2", approval: 30, doctrine: "a", region: "africa", role: "bishops", follows: "x" },
        { id: "3", approval: -60, doctrine: "a", region: "africa", role: "bishops", follows: "y" },
        { id: "4", approval: -90, doctrine: "a", region: "africa", role: "bishops", follows: "y" },
      ],
    },
  };
  // One radical and one schismatic out of four: the body is half fractured.
  assert.equal(frontFigures(world, "Saint-Siege").unity, 50);
});

test("a pope who is disliked but has broken nothing keeps the Church whole", () => {
  const elector = (id, approval) => ({ id, approval, doctrine: "a", region: "africa", role: "bishops", follows: "x" });
  // Nobody follows him; nobody has gone into schism either.
  const sullen = { assembly: { seats: 4, electors: [elector("1", -10), elector("2", -15), elector("3", 0), elector("4", 5)] } };
  assert.equal(frontFigures(sullen, "Saint-Siege").unity, 100);
});

test("governance reads what the pope did, not what he called it", () => {
  const world = {
    record: [
      { kind: "resolution" }, { kind: "resolution" },
      { kind: "decree" }, { kind: "decree" }, { kind: "decree" }, { kind: "decree" },
    ],
  };
  assert.ok(Math.abs(frontFigures(world, "x").governance - 33.33) < 0.1);
});

test("peace counts the powers working against you, and falling is the good way", () => {
  const world = {
    intents: [
      { owner: "Germany", target: "Saint-Siege", kind: "undermine" },
      { owner: "Turkey", target: "Saint-Siege", kind: "pressure" },
      { owner: "France", target: "Saint-Siege", kind: "cooperate" },
      { owner: "Saint-Siege", target: "Saint-Siege", kind: "oppose" },
    ],
  };
  assert.equal(frontFigures(world, "Saint-Siege").peace, 2);
  const rows = frontRows({ ...world, registerBaseline: { fronts: { peace: 4 } } }, "Saint-Siege");
  const peace = rows.find((r) => r.key === "peace");
  assert.equal(peace.direction, "down");
  assert.equal(peace.good, true);
});

test("a front nobody measures reaches the page as absent, not as zero", () => {
  // Caught on screen: every front read "0%" in a game with no college, no
  // clergy ledger and no record — which says "you have lost the unity of the
  // Church" when the truth is that nothing is watching it. frontFigures was
  // right and frontRows flattened the nulls on the way out.
  const rows = frontRows({}, "Saint-Siege");
  for (const key of ["unity", "safeguarding", "governance", "vocations"]) {
    assert.equal(rows.find((r) => r.key === key).value, null, `${key} is absent, not zero`);
  }
});

test("a real zero is still a zero", () => {
  const world = { intents: [{ owner: "France", target: "Saint-Siege", kind: "cooperate" }] };
  assert.equal(frontRows(world, "Saint-Siege").find((r) => r.key === "peace").value, 0);
});

test("every front carries a movement against the same baseline", () => {
  const rows = frontRows({}, "x");
  assert.equal(rows.length, 6);
  for (const row of rows) assert.ok("delta" in row && "good" in row && row.label);
});

test("a fresh Holy See game opens with all six fronts held, not with four blanks", async () => {
  // The college was once written, tested and seeded from nowhere, so a fresh
  // game reached a College tab that could never show anything. The same trap,
  // one module later: without a seed in the preset, the body of the Church
  // would not exist until the first turn had run.
  const { applyChurchPreset } = await import("./churchPreset.js");
  const world = applyChurchPreset({});
  const held = frontRows(world, "Saint-Siège").filter((r) => r.value != null);
  assert.ok(held.some((r) => r.key === "unity"), "the college is seated");
  assert.ok(held.some((r) => r.key === "vocations"), "the clergy is counted");
  assert.ok(held.some((r) => r.key === "safeguarding"), "the files exist");
});
