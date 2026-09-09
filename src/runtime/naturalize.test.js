/*! Open Historia — naturalisation tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { NATURALIZE_RULE, isActor, naturalizable, naturalize, naturalizeContacts } from "./naturalize.js";
import { annualRevenue } from "./economy.js";

// Field report, from a real save fifty turns in: seven actors, all seven of them
// the player's own internal factions. Not one country existed.
const emptyWorld = () => ({
  economies: { "Saint-Siège": { population: 501, taxRate: 0 } },
  polityOverrides: { "Saint-Siège": { name: "Saint-Siège" } },
});
const KNOWN = ["Italy", "Germany", "Brazil", "United States", "Saint-Siège"];

test("a country the world has never touched is not an actor, and can become one", () => {
  const w = emptyWorld();
  assert.equal(isActor(w, "Germany"), false);
  assert.equal(isActor(w, "Saint-Siège"), true);
  assert.deepEqual(naturalizable(w, KNOWN), ["Italy", "Germany", "Brazil", "United States"]);

  const out = naturalize(w, "Germany", { date: "2029-10-01", regionShare: 0.006, reason: "the player wrote to them" });
  assert.equal(out.naturalized, true);
  assert.equal(isActor(out.world, "Germany"), true);
  assert.equal(out.world.polityOverrides.Germany.enteredAt, "2029-10-01");
  assert.equal(out.world.polityOverrides.Germany.enteredBecause, "the player wrote to them");

  // And it is a real economy, not a placeholder: it can raise revenue, which is
  // what makes a promise from it cost it something.
  assert.ok(annualRevenue(out.world.economies.Germany) > 0);
  assert.ok(out.world.economies.Germany.population > 0);
});

test("naturalising is idempotent, so it is safe on every contact", () => {
  const once = naturalize(emptyWorld(), "Italy", { date: "2029-10-01" });
  const twice = naturalize(once.world, "Italy", { date: "2030-01-01" });
  assert.equal(twice.naturalized, false);
  assert.match(twice.reason, /already an actor/);
  assert.equal(twice.world.polityOverrides.Italy.enteredAt, "2029-10-01", "the date it entered is not rewritten");
  assert.deepEqual(twice.world.economies.Italy, once.world.economies.Italy);
});

// Without this an edition writing "the Church in Europe" would put a fictional
// economy called Europe into the world.
test("a continent, a direction or a nothing is never given an economy", () => {
  const w = emptyWorld();
  for (const name of ["Europe", "africa", "the world", "Occident", "", "   "]) {
    const out = naturalize(w, name, { date: "2029-10-01" });
    assert.equal(out.naturalized, false, `${name} must not become a polity`);
    assert.deepEqual(out.world, w);
  }
  assert.deepEqual(naturalizable(w, ["Europe", "Italy"]), ["Italy"]);
});

test("a turn naturalises everyone it touched, and only names the map knows", () => {
  const out = naturalizeContacts(emptyWorld(), ["Germany", "Brazil", "Atlantis", "Saint-Siège"], {
    date: "2029-10-08",
    known: KNOWN,
    shareOf: (n) => (n === "Brazil" ? 0.06 : 0.006),
    tagsOf: () => ["republic"],
    reason: "named in this edition",
  });
  assert.deepEqual(out.added, ["Germany", "Brazil"], "a name the map does not know is given nothing, and the player is already an actor");
  assert.equal(isActor(out.world, "Atlantis"), false);
  // The share it holds reaches the prior: a bigger country is a bigger economy.
  assert.ok(out.world.economies.Brazil.population > out.world.economies.Germany.population);

  // Nothing touched, nothing created.
  assert.deepEqual(naturalizeContacts(emptyWorld(), [], { known: KNOWN }).added, []);
});

test("the rule tells the model an untouched polity cannot pay for anything", () => {
  assert.match(NATURALIZE_RULE, /A polity acts only once the world holds it/);
  assert.match(NATURALIZE_RULE, /costs that polity nothing/);
});
