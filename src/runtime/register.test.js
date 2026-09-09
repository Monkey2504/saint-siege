import test from "node:test";
import assert from "node:assert/strict";
import { ensureRegisterBaseline, registerFigures, registerRows } from "./register.js";
import { applyChurchPreset, HOLY_SEE } from "./churchPreset.js";

const start = () => applyChurchPreset({}, { date: "2026-09-01" });

test("registerFigures reads the faithful and the engine's own indicators, nothing narrated", () => {
  const f = registerFigures(start(), HOLY_SEE);
  assert.ok(f.faithful > 1_000_000_000, "the baptised are counted from the ledger");
  assert.ok(f.endowment > 0);
  assert.equal(f.taxRevenue, 0, "the Holy See taxes nobody");
  assert.ok(f.balance < 0, "the structural deficit is real");
  assert.ok(f.unfundedLiabilities > 0);
});

test("the baseline is set once and never moved", () => {
  const w0 = start();
  const w1 = ensureRegisterBaseline(w0, HOLY_SEE, { date: "2026-09-01" });
  assert.ok(w1.registerBaseline, "set on first reading");
  assert.equal(w1.registerBaseline.date, "2026-09-01");
  const later = { ...w1, church: { ...w1.church, faithful: { ...w1.church.faithful, africa: w1.church.faithful.africa + 5_000_000 } } };
  const w2 = ensureRegisterBaseline(later, HOLY_SEE, { date: "2027-01-01" });
  assert.equal(w2, later, "same object: an existing baseline is left alone");
  assert.equal(w2.registerBaseline.figures.faithful, w1.registerBaseline.figures.faithful);
});

test("registerRows says which way each figure moved and whether that is good", () => {
  const w = ensureRegisterBaseline(start(), HOLY_SEE, { date: "2026-09-01" });
  const moved = {
    ...w,
    church: { ...w.church, faithful: { ...w.church.faithful, europe: w.church.faithful.europe + 20_000_000 } },
    economies: { ...w.economies, [HOLY_SEE]: { ...w.economies[HOLY_SEE], unfundedLiabilities: w.economies[HOLY_SEE].unfundedLiabilities * 0.8 } },
  };
  const rows = Object.fromEntries(registerRows(moved, HOLY_SEE).map((r) => [r.key, r]));
  assert.equal(rows.faithful.direction, "up");
  assert.equal(rows.faithful.good, true, "more faithful is the right way");
  assert.equal(rows.faithful.delta, 20_000_000);
  assert.equal(rows.unfundedLiabilities.direction, "down");
  assert.equal(rows.unfundedLiabilities.good, true, "a smaller unfunded promise is the right way");
  assert.equal(rows.endowmentYield.direction, "flat");
  assert.equal(rows.endowmentYield.good, null);
});

test("without a baseline every row is flat and carries no claim", () => {
  const rows = registerRows(start(), HOLY_SEE);
  assert.ok(rows.every((r) => r.direction === "flat" && r.from == null && r.delta == null));
});
