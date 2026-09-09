import test from "node:test";
import assert from "node:assert/strict";
import { RECORD_CAP, RECORD_RULES, appendRecord, describeRecord, normalizeRecord, recordOn, recordTotals } from "./record.js";

// The frame, not a fix: any stock any lever moves leaves one dated row, and
// nothing else may write here.
test("a row needs a subject; anything else is dropped, and the paper is capped", () => {
  assert.deepEqual(normalizeRecord([null, {}, "x", { what: "" }]), []);
  const row = normalizeRecord([{ what: "collected", amount: "12.5", polity: "France", kind: "nonsense" }])[0];
  assert.equal(row.amount, 12.5);
  assert.equal(row.kind, "money", "an unknown kind falls back, it does not invent one");
  assert.equal(row.unit, "SY");
  const many = Array.from({ length: RECORD_CAP + 40 }, (_, i) => ({ what: `row ${i}`, amount: 1 }));
  assert.equal(normalizeRecord(many).length, RECORD_CAP);
});

test("appending keeps order, and adding nothing changes nothing", () => {
  const one = appendRecord([], [{ date: "2026-09-01", what: "loan received", amount: 500, polity: "Rome" }]);
  const two = appendRecord(one, [{ date: "2026-10-01", what: "budget shortfall", amount: -20, polity: "Rome" }]);
  assert.deepEqual(two.map((r) => r.what), ["loan received", "budget shortfall"]);
  assert.deepEqual(appendRecord(two, []), two);
  assert.deepEqual(recordOn(two, "2026-10-01").map((r) => r.what), ["budget shortfall"]);
  assert.equal(recordTotals(two, "Rome").money, 480);
});

test("the empty paper is itself the answer, and says so in the model's own words", () => {
  const text = describeRecord([], { player: "Saint-Siège" });
  assert.match(text, /Nothing has moved yet/);
  assert.match(text, /the stocks are where they started/);
  assert.match(text, /written by the engine, never by narration/i);
});

test("a filled paper prints the dated movements with what caused each", () => {
  const text = describeRecord([
    { date: "2027-03-05", polity: "Saint-Siège", kind: "patrimony", what: "collected on a drive", amount: 331000, source: "drive:500 EUR" },
    { date: "2027-10-12", polity: "Saint-Siège", kind: "money", what: "budget shortfall over the period", amount: -18641, source: "step:balance" },
  ], { player: "Saint-Siège" });
  assert.match(text, /2027-03-05 Saint-Siège: collected on a drive \+331,000 SY \(drive:500 EUR\)/);
  assert.match(text, /2027-10-12 .*budget shortfall over the period −18,641 SY \(step:balance\)/);
  assert.match(text, /the page is right/);
});

test("the rule is general: any lever, any stock, any polity", () => {
  assert.match(RECORD_RULES, /a drive collected, a loan disbursed, a deficit drawn/);
  assert.match(RECORD_RULES, /carries no lever writes nothing here/);
});
