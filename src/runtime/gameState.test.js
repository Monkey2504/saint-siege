/*! Open Historia — gameState tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { applyEventImpactsToWorld, normalizeWorldState } from "./gameState.js";

const eventWithStats = (code, stats, date = "2026-01-01") => ({
  date, title: "t", description: "d",
  impacts: { polityChanges: [{ code, stats }] },
});

test("polityChanges.stats.history APPENDS to a polity's own record instead of replacing it, and is capped", () => {
  const world = normalizeWorldState({});
  const first = applyEventImpactsToWorld({
    events: [eventWithStats("Ruritania", { leader: "A. Novak", history: ["1926: General Novak seizes power in a bloodless coup"] })],
    world,
  }).world;
  assert.deepEqual(first.countryStats.Ruritania.history, ["1926: General Novak seizes power in a bloodless coup"]);
  assert.equal(first.countryStats.Ruritania.leader, "A. Novak");

  const second = applyEventImpactsToWorld({
    events: [eventWithStats("Ruritania", { history: ["1931: Ruritania invades the Sudetenland-analogue province"] }, "1931-03-01")],
    world: first,
  }).world;
  assert.deepEqual(second.countryStats.Ruritania.history, [
    "1926: General Novak seizes power in a bloodless coup",
    "1931: Ruritania invades the Sudetenland-analogue province",
  ], "the new entry is ADDED, the old one is not lost");
  assert.equal(second.countryStats.Ruritania.leader, "A. Novak", "a stats update that omits leader keeps the prior value");

  // A stats update with no history field at all leaves the record untouched.
  const third = applyEventImpactsToWorld({
    events: [eventWithStats("Ruritania", { stability: 40 }, "1932-01-01")],
    world: second,
  }).world;
  assert.deepEqual(third.countryStats.Ruritania.history, second.countryStats.Ruritania.history);

  // Capped at 10 — the oldest entries fall off, the newest survive.
  let capped = second;
  for (let i = 0; i < 12; i += 1) {
    capped = applyEventImpactsToWorld({ events: [eventWithStats("Ruritania", { history: [`event ${i}`] }, `1940-0${(i % 9) + 1}-01`)], world: capped }).world;
  }
  assert.equal(capped.countryStats.Ruritania.history.length, 10);
  assert.equal(capped.countryStats.Ruritania.history.at(-1), "event 11");
  assert.ok(!capped.countryStats.Ruritania.history.includes("1926: General Novak seizes power in a bloodless coup"), "the oldest entries age out once the cap is exceeded");
});

test("polityChanges.stats.history: a fresh polity with no prior sheet starts a clean history, blank entries are dropped", () => {
  const world = normalizeWorldState({});
  const next = applyEventImpactsToWorld({
    events: [eventWithStats("Ruritania", { history: ["", "  ", "1900: Founded"] })],
    world,
  }).world;
  assert.deepEqual(next.countryStats.Ruritania.history, ["1900: Founded"]);
});

const eventWithCanonFacts = (canonFacts, date = "2026-01-01") => ({
  date, title: "t", description: "d",
  impacts: { canonFacts },
});

test("impacts.canonFacts APPENDS world-level atomic facts, never replaces them — unlike history, these are not per-polity", () => {
  const world = normalizeWorldState({});
  const first = applyEventImpactsToWorld({
    events: [eventWithCanonFacts(["1926-03-01: General Novak seizes power in Ruritania"])],
    world,
  }).world;
  assert.deepEqual(first.canonFacts, ["1926-03-01: General Novak seizes power in Ruritania"]);

  const second = applyEventImpactsToWorld({
    events: [eventWithCanonFacts(["1931-06-01: Ruritania annexes the Sudetenland-analogue province"], "1931-06-01")],
    world: first,
  }).world;
  assert.deepEqual(second.canonFacts, [
    "1926-03-01: General Novak seizes power in Ruritania",
    "1931-06-01: Ruritania annexes the Sudetenland-analogue province",
  ]);

  // An event with no canonFacts at all leaves the ledger untouched.
  const third = applyEventImpactsToWorld({ events: [{ date: "1932-01-01", title: "t", description: "d", impacts: {} }], world: second }).world;
  assert.deepEqual(third.canonFacts, second.canonFacts);
});

test("canonFacts: deduplicated (a fact restated verbatim adds nothing) and capped as a last resort, oldest falling off first", () => {
  const withDupe = applyEventImpactsToWorld({
    events: [eventWithCanonFacts(["Fact A", "Fact A", "Fact B"])],
    world: normalizeWorldState({}),
  }).world;
  assert.deepEqual(withDupe.canonFacts, ["Fact A", "Fact B"]);

  let capped = normalizeWorldState({});
  for (let i = 0; i < 205; i += 1) {
    capped = applyEventImpactsToWorld({ events: [eventWithCanonFacts([`Fact ${i}`], `2026-01-01`)], world: capped }).world;
  }
  assert.equal(capped.canonFacts.length, 200, "capped at 200, a last resort, not a target");
  assert.equal(capped.canonFacts.at(-1), "Fact 204");
  assert.ok(!capped.canonFacts.includes("Fact 0"), "the oldest facts age out only once the generous cap is actually exceeded");
});
