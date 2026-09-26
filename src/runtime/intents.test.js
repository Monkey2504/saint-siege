/*! Open Historia — standing intents tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEconomy } from "./economy.js";
import { seedEconomy } from "./economyBridge.js";
import { applyIntentEffects, applyIntentOps, describeIntents, intentsNeedOtherPowers, normalizeIntent, normalizeIntents } from "./intents.js";

const encirclement = () => ({ ownerType: "polity", owner: "Prussia", target: "France", kind: "military", summary: "Isolate France diplomatically before striking", secret: true, triggerHint: "France's allies drop away" });
const intents = (list, ops, opts) => applyIntentOps(list, ops, opts).intents;

test("normalizeIntent: owner and summary required, kind/status/stage validated, log capped", () => {
  const it = normalizeIntent({ owner: "Prussia", summary: "Build a rail net to the border", kind: "MILITARY", stage: 140, status: "weird", log: Array.from({ length: 15 }, (_, i) => `entry ${i}`) });
  assert.equal(it.kind, "military");
  assert.equal(it.stage, 100, "clamped to 0-100");
  assert.equal(it.status, "active", "invalid status falls back to active");
  assert.equal(it.log.length, 10, "log capped at 10");
  assert.equal(it.secret, true, "secret defaults true — a scheme is hidden until it says otherwise");
  assert.equal(normalizeIntent({ owner: "Prussia" }), null, "no summary, no intent");
  assert.equal(normalizeIntent({ summary: "x" }), null, "no owner, no intent");
  assert.deepEqual(normalizeIntents("junk"), []);
});

test("create: assigns an id, re-creating the same owner+kind updates in place rather than stacking duplicates", () => {
  let list = intents([], [{ op: "create", intent: encirclement() }], { date: "1875-01-01" });
  assert.equal(list.length, 1);
  assert.equal(list[0].createdAt, "1875-01-01");
  assert.equal(list[0].status, "active");
  const id = list[0].id;

  list = intents(list, [{ op: "create", intent: { ...encirclement(), summary: "Encircle France through Austria and Russia" } }], { date: "1875-06-01" });
  assert.equal(list.length, 1, "same owner+kind updates the existing scheme");
  assert.equal(list[0].id, id, "id is stable across an update");
  assert.equal(list[0].summary, "Encircle France through Austria and Russia");

  // A DIFFERENT kind for the same owner is a separate scheme.
  list = intents(list, [{ op: "create", intent: { ownerType: "polity", owner: "Prussia", kind: "economic", summary: "Undercut French steel exports" } }]);
  assert.equal(list.length, 2);
});

test("advance by id or by {owner, kind}, absolute stage or delta, notes append to a capped log", () => {
  let list = intents([], [{ op: "create", intent: encirclement() }], { date: "1875-01-01" });
  const id = list[0].id;
  list = intents(list, [{ op: "advance", intent: id, stageDelta: 20, note: "Austria signs a secret understanding" }], { date: "1876-01-01" });
  assert.equal(list[0].stage, 20);
  assert.equal(list[0].log[0], "1876-01-01: Austria signs a secret understanding");
  assert.equal(list[0].updatedAt, "1876-01-01");

  list = intents(list, [{ op: "advance", intent: { owner: "Prussia", kind: "military" }, stage: 65 }]);
  assert.equal(list[0].stage, 65, "matched by owner+kind when the id isn't given");

  // Stage clamps to 0-100 even from a delta that would overshoot.
  list = intents(list, [{ op: "advance", intent: id, stageDelta: 1000 }]);
  assert.equal(list[0].stage, 100);
});

test("resolve and abandon close a scheme; a failed resolve keeps its stage, a success maxes it", () => {
  let list = intents([], [{ op: "create", intent: { ...encirclement(), stage: 80 } }], { date: "1875-01-01" });
  const id = list[0].id;
  const failed = intents(list, [{ op: "resolve", intent: id, outcome: "France strikes first", success: false }]);
  assert.equal(failed[0].status, "resolved");
  assert.equal(failed[0].stage, 80, "a failed scheme does not retroactively look complete");
  assert.equal(failed[0].outcome, "France strikes first");

  const succeeded = intents(list, [{ op: "resolve", intent: id, outcome: "France stands alone", success: true }]);
  assert.equal(succeeded[0].stage, 100);

  const abandoned = intents(list, [{ op: "abandon", intent: id, reason: "Bismarck is dismissed" }]);
  assert.equal(abandoned[0].status, "abandoned");
  assert.equal(abandoned[0].outcome, "Bismarck is dismissed");

  // Once resolved, the owner+kind fallback no longer matches it (only ACTIVE
  // schemes are matched that way) — a later create for the same owner+kind
  // starts a fresh scheme instead of reopening the old one.
  const fresh = intents(succeeded, [{ op: "create", intent: { ownerType: "polity", owner: "Prussia", kind: "military", summary: "A new war plan" } }]);
  assert.equal(fresh.length, 2);
});

test("expose flips secret to false and nothing else", () => {
  let list = intents([], [{ op: "create", intent: encirclement() }]);
  const id = list[0].id;
  list = intents(list, [{ op: "expose", intent: id }]);
  assert.equal(list[0].secret, false);
  assert.equal(list[0].summary, encirclement().summary);
});

test("unresolvable ops (bad owner, no summary, unknown id) are dropped, not thrown", () => {
  const list = intents([], [
    { op: "create", intent: { owner: "Prussia" } }, // no summary
    { op: "advance", intent: "no-such-id", stageDelta: 10 },
    { op: "resolve", intent: { owner: "Nobody" }, outcome: "x" },
    { notASchema: true },
    null,
  ]);
  assert.deepEqual(list, []);
});

test("intentsNeedOtherPowers: true only once the player has schemes AND every single one is the player's own", () => {
  assert.equal(intentsNeedOtherPowers([], "Prussia"), false, "no intents at all is not evidence of the bias");
  const playerOnly = intents([], [{ op: "create", intent: { ownerType: "polity", owner: "Prussia", kind: "military", summary: "x" } }]);
  assert.equal(intentsNeedOtherPowers(playerOnly, "Prussia"), true);
  const mixed = intents(playerOnly, [{ op: "create", intent: { ownerType: "polity", owner: "France", target: "Prussia", kind: "military", summary: "y" } }]);
  assert.equal(intentsNeedOtherPowers(mixed, "Prussia"), false, "as soon as ANY other power has one, the bias is resolved");
  assert.equal(intentsNeedOtherPowers(playerOnly, ""), false, "no known player polity, nothing to compare against");
});

test("describeIntents: ground truth shows secrets, the player-facing view hides another power's secret scheme from the player unless they are its target", () => {
  const list = intents([], [
    { op: "create", intent: encirclement() }, // secret, Prussia vs France
    { op: "create", intent: { ownerType: "organization", owner: "International Monetary Fund", target: "Ruritania", kind: "economic", summary: "Build a case for tougher conditionality", secret: false } },
  ], { date: "1875-01-01" });

  const groundTruth = describeIntents(list, { revealSecrets: true });
  assert.match(groundTruth, /Prussia — military against France, stage 0\/100 \[secret\]: Isolate France diplomatically/);
  assert.match(groundTruth, /org:International Monetary Fund — economic against Ruritania/);

  const asFrance = describeIntents(list, { revealSecrets: false, playerPolity: "France" });
  assert.match(asFrance, /Prussia — military/, "the player IS the target, so their own peril is visible to them");

  const asAustria = describeIntents(list, { revealSecrets: false, playerPolity: "Austria" });
  assert.doesNotMatch(asAustria, /Prussia/, "a secret scheme against someone else stays hidden from a third party");
  assert.match(asAustria, /International Monetary Fund/, "a non-secret scheme is visible to everyone");

  assert.equal(describeIntents([]), "");
  // A resolved scheme drops out of both views — it is no longer standing.
  const resolved = intents(list, [{ op: "resolve", intent: { owner: "International Monetary Fund" }, outcome: "done", success: true }]);
  assert.doesNotMatch(describeIntents(resolved, { revealSecrets: true }), /International Monetary Fund/);
});

test("a granted loan is a real effect, not a free-text promise: the lender's treasury falls, the borrower's treasury AND debt rise", () => {
  const request = { ownerType: "polity", owner: "Ruritania", target: "Democratic Republic of the Congo", kind: "economic", summary: "Seek financing from the BPIS for a rail line", secret: false };
  const { intents: afterCreate } = applyIntentOps([], [{ op: "create", intent: request }], { date: "2026-01-01" });
  const id = afterCreate[0].id;

  const granted = applyIntentOps(afterCreate, [
    { op: "resolve", intent: id, outcome: "The BPIS approves the loan", success: true, loan: { amount: 5000, lender: "Democratic Republic of the Congo", borrower: "Ruritania" } },
  ], { date: "2026-02-01" });
  assert.equal(granted.intents[0].status, "resolved");
  assert.deepEqual(granted.effects, [{ type: "loan", lender: "Democratic Republic of the Congo", borrower: "Ruritania", amount: 5000 }]);

  // treasury is an engine stock (not applyEconomyChange-settable), built
  // directly, funded well above the loan so the cap below is not what binds
  // here — a separate test covers the cap itself.
  const economies = {
    "Democratic Republic of the Congo": normalizeEconomy({ ...seedEconomy({ year: 2026, regionShare: 0.02 }), treasury: 50_000 }),
    Ruritania: seedEconomy({ year: 2026, regionShare: 0.005 }),
  };
  const before = { drc: economies["Democratic Republic of the Congo"].treasury, ruritania: { treasury: economies.Ruritania.treasury, debt: economies.Ruritania.debt } };
  const after = applyIntentEffects(economies, granted.effects, { normalizeEconomy });
  assert.equal(after["Democratic Republic of the Congo"].treasury, before.drc - 5000);
  assert.equal(after.Ruritania.treasury, before.ruritania.treasury + 5000);
  assert.equal(after.Ruritania.debt, before.ruritania.debt + 5000);

  // A failed request (success: false, or no loan payload at all) moves no money.
  const refused = applyIntentOps(afterCreate, [{ op: "resolve", intent: id, outcome: "The BPIS declines", success: false, loan: { amount: 5000, lender: "Democratic Republic of the Congo", borrower: "Ruritania" } }]);
  assert.deepEqual(refused.effects, []);
  const promiseOnly = applyIntentOps(afterCreate, [{ op: "resolve", intent: id, outcome: "Agreed in principle", success: true }]);
  assert.deepEqual(promiseOnly.effects, [], "an agreement with no loan payload moves no money");

  // Effects referencing a polity with no economy on record are dropped, not thrown.
  const untouched = applyIntentEffects(economies, [{ type: "loan", lender: "Nowhere", borrower: "Ruritania", amount: 100 }], { normalizeEconomy });
  assert.deepEqual(untouched, economies);
});

test("a loan is capped to what the lender's own treasury actually holds — a narrated figure it cannot back is honored only up to what is real", () => {
  const poorLender = normalizeEconomy({ ...seedEconomy({ year: 2026, regionShare: 0.02 }), treasury: 800 });
  const borrower = seedEconomy({ year: 2026, regionShare: 0.005 });
  const economies = { Lender: poorLender, Borrower: borrower };

  const capped = applyIntentEffects(economies, [{ type: "loan", lender: "Lender", borrower: "Borrower", amount: 5000 }], { normalizeEconomy });
  assert.equal(capped.Lender.treasury, 0, "the lender is drawn down to zero, never into arrears from a loan it chose to make");
  assert.equal(capped.Borrower.treasury, borrower.treasury + 800, "the borrower gets only what the lender actually had");
  assert.equal(capped.Borrower.debt, borrower.debt + 800, "and owes only what it actually received");

  // A lender already in arrears (negative treasury) can fund nothing at all.
  const brokeLender = normalizeEconomy({ ...seedEconomy({ year: 2026, regionShare: 0.02 }), treasury: -500 });
  const nothing = applyIntentEffects({ Lender: brokeLender, Borrower: borrower }, [{ type: "loan", lender: "Lender", borrower: "Borrower", amount: 5000 }], { normalizeEconomy });
  assert.equal(nothing.Lender.treasury, -500);
  assert.equal(nothing.Borrower.treasury, borrower.treasury);
  assert.equal(nothing.Borrower.debt, borrower.debt);
});

test("a resolved hostile intent inflicts the SPECIFIC damage it names — infrastructure, legitimacy, or credit — a promise with no sabotage payload harms nobody", () => {
  const grudge = { ownerType: "polity", owner: "United States", target: "Ruritania", kind: "espionage", summary: "Fund unrest to punish nationalisation", secret: true };
  const { intents: created } = applyIntentOps([], [{ op: "create", intent: grudge }], { date: "2026-01-01" });
  const id = created[0].id;

  const resolved = applyIntentOps(created, [
    { op: "resolve", intent: id, outcome: "Riots break out in three provinces", success: true, sabotage: { target: "Ruritania", kind: "legitimacy", intensity: 0.5 } },
  ], { date: "2026-06-01" });
  assert.deepEqual(resolved.effects, [{ type: "sabotage", target: "Ruritania", kind: "legitimacy", intensity: 0.5, by: "United States" }]);

  const economies = { Ruritania: seedEconomy({ year: 2026, regionShare: 0.01 }) };
  const before = economies.Ruritania;
  const afterLegitimacy = applyIntentEffects(economies, resolved.effects, { normalizeEconomy });
  assert.equal(afterLegitimacy.Ruritania.legitimacy, before.legitimacy - 10, "0.5 intensity is half the 20-point max for legitimacy");
  assert.equal(afterLegitimacy.Ruritania.capital, before.capital, "a legitimacy strike does not also touch capital");

  const infra = applyIntentEffects(economies, [{ type: "sabotage", target: "Ruritania", kind: "infrastructure", intensity: 1 }], { normalizeEconomy });
  assert.ok(infra.Ruritania.capital < before.capital, "full-intensity infrastructure sabotage genuinely destroys capital");
  assert.ok(infra.Ruritania.capital > before.capital * 0.9, "but the maximum single strike is bounded, not catastrophic");

  const credit = applyIntentEffects(economies, [{ type: "sabotage", target: "Ruritania", kind: "credit", intensity: 1 }], { normalizeEconomy });
  assert.equal(credit.Ruritania.fiscalCredibility, Math.max(0, before.fiscalCredibility - 20));

  // A "success" with no sabotage payload, or an unknown kind, harms nobody.
  const promiseOnly = applyIntentOps(created, [{ op: "resolve", intent: id, outcome: "Plot uncovered and abandoned", success: true }]);
  assert.deepEqual(promiseOnly.effects, []);
  assert.deepEqual(applyIntentEffects(economies, [{ type: "sabotage", target: "Ruritania", kind: "poison", intensity: 1 }], { normalizeEconomy }), economies);
});

// La borne de portée coupait les lexiques du préréglage. Le chantier financier
// en déclare une quarantaine ; à 16, « invest » et « deficit » disparaissaient,
// et un pape qui déclarait vouloir combler le déficit n'accrochait personne.
test("un lexique écrit à la main n'est pas tronqué par la borne de portée", async () => {
  const { seededIntents } = await import("./churchPreset.js");
  const ecrits = seededIntents("2026-09-01");
  const normalises = normalizeIntents(ecrits);
  for (const source of ecrits) {
    const vu = normalises.find((it) => it.owner === source.owner && it.kind === source.kind);
    assert.ok(vu, `${source.owner} a disparu à la normalisation`);
    assert.equal(vu.scope.length, (source.scope || []).length,
      `${source.owner} : ${(source.scope || []).length} mots de portée écrits, ${vu.scope.length} gardés`);
  }
});
