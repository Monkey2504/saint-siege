/*! Open Historia — the faithful ledger tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { CONTINENTS, FAITHFUL_2023, applyFaithfulOps, describeFaithful, normalizeChurch, stepFaithful, totalFaithful } from "./churchFaithful.js";

const seed = () => normalizeChurch({ faithful: FAITHFUL_2023, asOf: "2023-12-31", log: [] });

test("baseline is the real Annuario Pontificio 2025 figure: 1.406 billion, five continents", () => {
  const total = totalFaithful(FAITHFUL_2023);
  assert.ok(Math.abs(total - 1.406e9) < 5e6, `total ${total}`);
  assert.equal(CONTINENTS.length, 5);
  assert.equal(normalizeChurch(null), null, "no ledger when not in the mode");
  assert.equal(normalizeChurch({}).faithful.africa, FAITHFUL_2023.africa, "missing continents fall back to the real baseline");
});

test("stepFaithful: at baseline standing, one year reproduces the published continental growth (Africa +3.31%, Europe +0.2%, world ≈ +1.15%)", () => {
  const next = stepFaithful(seed(), { years: 1, legitimacy: 70, date: "2024-12-31" });
  assert.ok(Math.abs(next.faithful.africa / FAITHFUL_2023.africa - 1.0331) < 1e-6);
  assert.ok(Math.abs(next.faithful.europe / FAITHFUL_2023.europe - 1.002) < 1e-6);
  const world = totalFaithful(next.faithful) / totalFaithful(FAITHFUL_2023) - 1;
  assert.ok(Math.abs(world - 0.0115) < 0.001, `world growth ${world}`);
  assert.equal(next.asOf, "2024-12-31");
  assert.equal(stepFaithful(seed(), { years: 0 }).faithful.africa, FAITHFUL_2023.africa, "no time, no change");
  assert.equal(stepFaithful(null, { years: 1 }), null);
});

test("stepFaithful: a pope whose standing collapses loses Europe; a respected one retains more — Africa moves half as much", () => {
  const low = stepFaithful(seed(), { years: 1, legitimacy: 20 });
  const high = stepFaithful(seed(), { years: 1, legitimacy: 95 });
  assert.ok(low.faithful.europe < FAITHFUL_2023.europe, "at 20 legitimacy Europe shrinks in absolute terms");
  assert.ok(high.faithful.europe > low.faithful.europe);
  const europeSwing = (high.faithful.europe - low.faithful.europe) / FAITHFUL_2023.europe;
  const africaSwing = (high.faithful.africa - low.faithful.africa) / FAITHFUL_2023.africa;
  assert.ok(Math.abs(europeSwing / africaSwing - 2) < 1e-6, "elasticity where leaving is an act is twice that where growth is by birth");
  assert.ok(low.faithful.africa > FAITHFUL_2023.africa, "Africa still grows even under a discredited pope");
});

test("applyFaithfulOps: a schism moves real people, is logged with its reason, and is capped at a fifth of the continent", () => {
  const out = applyFaithfulOps(seed(), [
    { op: "shift", continent: "Europe", delta: -2_000_000, note: "le Chemin synodal rompt avec Rome" },
    { op: "shift", continent: "asia", share: 0.01 },
    { op: "shift", continent: "atlantis", delta: 5 },
    { op: "shift", continent: "oceania", delta: -50_000_000 },
  ], { date: "2027-03-01" });
  assert.equal(out.faithful.europe, FAITHFUL_2023.europe - 2_000_000);
  assert.equal(out.faithful.asia, Math.round(FAITHFUL_2023.asia * 1.01));
  assert.equal(out.faithful.oceania, Math.round(FAITHFUL_2023.oceania * 0.8), "never more than a fifth at once");
  assert.equal(out.log.length, 3, "the unknown continent is ignored");
  assert.match(out.log[0], /^2027-03-01: europe -2,000,000 — le Chemin synodal/);
  assert.equal(applyFaithfulOps(null, [{ op: "shift", continent: "europe", delta: 1 }]), null, "no ledger, no effect");
});

test("describeFaithful: one line the model and the player can read", () => {
  const text = describeFaithful(applyFaithfulOps(seed(), [{ op: "shift", continent: "europe", delta: -100_000, note: "x" }], { date: "2027-01-01" }));
  assert.match(text, /^1\.406 milliard de fidèles au 2023-12-31/);
  assert.match(text, /africa 281\.0 M \(20\.0%\)/);
  assert.match(text, /Dernier mouvement: 2027-01-01: europe -100,000 — x/);
  assert.equal(describeFaithful(null), "");
});
