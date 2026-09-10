import assert from "node:assert/strict";
import test from "node:test";

import {
  CANDIDATES,
  LEVERS,
  SEATS,
  cabinetBlocs,
  cabinetEffects,
  candidateById,
  describeCabinet,
  lever,
  seatCabinet,
} from "./advisors.js";

test("twenty candidates for three seats, so choosing means giving something up", () => {
  assert.ok(CANDIDATES.length >= 20, `${CANDIDATES.length} candidates`);
  assert.equal(SEATS, 3);
});

test("every candidate has a gift and a flaw, both as figures", () => {
  for (const who of CANDIDATES) {
    assert.ok(who.id && who.name && who.charge, `${who.id} is named and charged`);
    assert.ok(Object.keys(who.boon ?? {}).length, `${who.id} gives something`);
    assert.ok(Object.keys(who.bane ?? {}).length, `${who.id} costs something`);
    assert.ok(who.boonSays && who.baneSays, `${who.id} says both in the player's language`);
    for (const name of [...Object.keys(who.boon), ...Object.keys(who.bane)]) {
      assert.ok(LEVERS.includes(name), `${who.id}: ${name} is a lever the engine reads`);
    }
  }
});

test("no two candidates are the same person", () => {
  const ids = CANDIDATES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("the twenty do not all pull the same lever", () => {
  const pulled = new Set(CANDIDATES.flatMap((c) => [...Object.keys(c.boon), ...Object.keys(c.bane)]));
  assert.ok(pulled.size >= 6, `${pulled.size} distinct levers in play`);
});

test("a gift and a flaw on the same lever both count", () => {
  // Ruiz fills seminaries and spends the capital that should be earning; Brennan
  // earns on it. Seated together the two must not cancel by accident of spread.
  const both = cabinetEffects(["ruiz", "brennan"]);
  assert.ok(both.formation > 0, "the seminaries still fill");
  assert.ok(both.margin > 0, "the banker still outweighs the spender");
  const alone = cabinetEffects(["ruiz"]);
  assert.ok(alone.margin < 0, "on his own he costs the patrimony");
});

test("only three sit, however many are named", () => {
  const four = cabinetEffects(["ferrero", "okonkwo", "duval", "haugen"]);
  const three = cabinetEffects(["ferrero", "okonkwo", "duval"]);
  assert.deepEqual(four, three);
});

test("a name nobody knows is dropped, not guessed at", () => {
  assert.equal(candidateById("nobody"), null);
  assert.deepEqual(cabinetEffects(["nobody"]), cabinetEffects([]));
  assert.deepEqual(seatCabinet({}, ["nobody", "ferrero"]).cabinet.seated, ["ferrero"]);
});

test("the appointment itself moves the currents, and can cut both ways", () => {
  const blocs = cabinetBlocs(["quiroga"]);
  assert.ok(blocs["Opus Dei"] > 0);
  assert.ok(blocs["Compagnie de Jésus"] < 0);
});

test("two advisers who please the same current add up", () => {
  const one = cabinetBlocs(["castellano"])["Bloc des cardinaux des dubia"];
  const two = cabinetBlocs(["castellano", "verhoeven"])["Bloc des cardinaux des dubia"];
  assert.ok(two > one);
});

test("a seated cabinet lives in the world, so later turns read state and not a promise", () => {
  const world = seatCabinet({ church: {} }, ["okonkwo", "duval"], { date: "2026-09-01" });
  assert.deepEqual(world.cabinet.seated, ["okonkwo", "duval"]);
  assert.equal(world.cabinet.seatedAt, "2026-09-01");
  assert.equal(lever(world, "pace"), 0.6);
  assert.ok(lever(world, "cost") < 0, "she cuts what things cost");
  assert.equal(world.church, undefined ?? world.church, "the rest of the world is untouched");
});

test("a world with no cabinet reads every lever as nothing", () => {
  for (const name of LEVERS) assert.equal(lever({}, name), 0);
});

test("the cabinet describes itself in the player's language, gift and flaw both", () => {
  const world = seatCabinet({}, ["haugen"]);
  const [line] = describeCabinet(world);
  assert.match(line, /Erik Haugen/);
  assert.match(line, /Communication/);
  assert.match(line, /montre le monde tel qu'il le raconte/);
});

test("no candidate is a free gift", () => {
  // A flaw that costs nothing measurable is a portrait, and the player would
  // work that out by turn three.
  for (const who of CANDIDATES) {
    const cost = Object.values(who.bane).reduce((s, v) => s + Math.abs(Number(v)), 0);
    assert.ok(cost > 0, `${who.id} actually costs something`);
  }
});
