/*! Open Historia — outage notice tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { OUTAGE_LANGUAGES, outageNotice } from "./outageNotice.js";

// Field report: a French player read eight canned editions in a row, then read
// an English banner explaining why — because the quota that killed the turns
// also killed the translator that would have translated the explanation.
test("the outage notice reads in the player's language without the model", () => {
  const fr = outageNotice("fr", { run: 8, since: "10 Oct 2028" });
  assert.match(fr.label, /vraie édition/);
  assert.match(fr.body, /Les 8 dernières éditions/);
  assert.match(fr.body, /depuis le 10 Oct 2028/);
  assert.equal(fr.reasonLabel, "Raison rapportée");
  assert.ok(!/offline stub|editions were written/.test(fr.body), "no English leaks into the French notice");

  // A regional tag still finds its language.
  assert.deepEqual(outageNotice("fr-CA", { run: 8, since: "10 Oct 2028" }), fr);
  assert.deepEqual(outageNotice("FR", { run: 8, since: "10 Oct 2028" }), fr);
});

test("one edition is singular, and a language nobody has written falls back to English", () => {
  const one = outageNotice("fr", { run: 1 });
  assert.match(one.body, /Cette édition/);
  assert.ok(!/dernières/.test(one.body), "a single edition is not a run");

  const unknown = outageNotice("sw", { run: 3, since: "10 Oct 2028" });
  assert.match(unknown.body, /The last 3 editions/, "an unwritten language reads English, never nothing");
  assert.deepEqual(unknown, outageNotice("", { run: 3, since: "10 Oct 2028" }));
  assert.deepEqual(unknown, outageNotice(null, { run: 3, since: "10 Oct 2028" }));
});

test("every written language answers for both counts, and none is left half-translated", () => {
  for (const code of OUTAGE_LANGUAGES) {
    for (const run of [1, 5]) {
      const notice = outageNotice(code, { run, since: "10 Oct 2028" });
      for (const [field, value] of Object.entries(notice)) {
        assert.equal(typeof value, "string", `${code}.${field} must be a string`);
        assert.ok(value.trim().length > 0, `${code}.${field} is empty`);
      }
      assert.ok(!/undefined|NaN|\[object/.test(notice.body), `${code} at run ${run}: ${notice.body}`);
    }
  }
  assert.ok(OUTAGE_LANGUAGES.includes("en"), "English is the fallback and must exist");
  assert.ok(OUTAGE_LANGUAGES.includes("fr"));
});

test("a missing or nonsense run count still reads as one edition", () => {
  assert.match(outageNotice("en", {}).body, /This edition was written/);
  assert.match(outageNotice("en", { run: 0 }).body, /This edition was written/);
  assert.match(outageNotice("en", { run: -4 }).body, /This edition was written/);
  assert.match(outageNotice("en").body, /This edition was written/);
  // No date is simply no clause, not a dangling preposition.
  assert.ok(!/starting\s*\./.test(outageNotice("en", { run: 3 }).body));
});
