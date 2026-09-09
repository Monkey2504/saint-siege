/*! Open Historia — unfunded promises tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { LIABILITY_RULES, MAX_REPRICE_SHARE, applyLiabilityMoves, describeLiabilities, ensureLiabilityMovesFromOrders, liabilityMovesFromOrder } from "./liabilities.js";
import { applyTreasuryMoves, stepTreasuries } from "./treasuries.js";

const world = () => ({
  economies: {
    "Saint-Siège": { unfundedLiabilities: 400_000, endowment: 1_700_000, legitimacy: 72, usdPerSY: 1614 },
  },
  treasuries: [
    { body: "Une Seule Église", capital: 640_000, treasury: 500, margin: 0.05, retain: 0.2, key: "need" },
    { body: "Pax Africa", parent: "Une Seule Église", capital: 0, treasury: 900, margin: 0, retain: 1, key: "equal" },
  ],
});

const order = (text) => ({ id: "o1", status: "planned", kind: "action", title: text.slice(0, 40), text });

// Field report: this exact plan was ordered four ways over two hours. Editions
// ratified a ring-fencing calendar at the Council for the Economy. The figure
// stood at 411,339 SY from the first turn to the last.
test("an order to ring-fence a liability moves it only as far as real capital backs it", () => {
  const w = world();
  const moves = liabilityMovesFromOrder(
    order("Transférer le passif à un fonds de cantonnement interne, adossé aux actifs de la holding Une Seule Église."),
    { player: "Saint-Siège", economies: w.economies, treasuries: w.treasuries, date: "2029-08-11" },
  );
  assert.deepEqual(moves, [{ kind: "assign", body: "Une Seule Église", date: "2029-08-11" }]);

  const out = applyLiabilityMoves(w, moves, { player: "Saint-Siège" });
  assert.equal(out.world.economies["Saint-Siège"].unfundedLiabilities, 0, "640,000 of free capital covers all 400,000");
  assert.equal(out.world.treasuries.find((t) => t.body === "Une Seule Église").assumedLiabilities, 400_000);
  assert.ok(out.rows.some((r) => /assumed an unfunded promise/.test(r.what)));
});

test("a carrier with too little capital takes what it can, and the rest stays where it was", () => {
  const w = world();
  w.economies["Saint-Siège"].unfundedLiabilities = 1_000_000;
  const out = applyLiabilityMoves(w, [{ kind: "assign", body: "Une Seule Église", date: "2029-08-11" }], { player: "Saint-Siège" });
  assert.equal(out.world.economies["Saint-Siège"].unfundedLiabilities, 360_000, "only the backed part leaves");
  assert.match(out.refusals[0], /stays with Saint-Siège, because no capital backs that part/);

  // And a body with nothing behind it changes the letterhead and nothing else.
  const empty = applyLiabilityMoves(world(), [{ kind: "assign", body: "Pax Africa", date: "2029-08-11" }], { player: "Saint-Siège" });
  assert.equal(empty.world.economies["Saint-Siège"].unfundedLiabilities, 400_000, "nothing moved");
  assert.match(empty.refusals[0], /change the letterhead and nothing else/);
});

// Committed capital stops paying out, so ring-fencing everything is rarely what
// a player wants. Ordering a share is the difference between a plan and a lurch.
test("an order can ring-fence part of a promise, and the rest stays home on purpose", () => {
  const w = world();
  const moves = liabilityMovesFromOrder(
    order("Cantonner 150 000 SY du passif des retraites dans un fonds fiduciaire porté par la holding Une Seule Église."),
    { player: "Saint-Siège", economies: w.economies, treasuries: w.treasuries, date: "2029-08-11" },
  );
  assert.deepEqual(moves, [{ kind: "assign", body: "Une Seule Église", amount: 150_000, date: "2029-08-11" }]);

  const out = applyLiabilityMoves(w, moves, { player: "Saint-Siège" });
  assert.equal(out.world.economies["Saint-Siège"].unfundedLiabilities, 250_000);
  assert.equal(out.world.treasuries.find((t) => t.body === "Une Seule Église").assumedLiabilities, 150_000);
  assert.match(out.refusals[0], /as ordered/, "asking for part is not a refusal for want of capital");
  assert.ok(!/no capital backs/.test(out.refusals[0]));
});

test("capital already standing behind one promise cannot stand behind another", () => {
  const w = world();
  w.treasuries[0].assumedLiabilities = 600_000;
  const out = applyLiabilityMoves(w, [{ kind: "assign", body: "Une Seule Église", date: "2029-08-11" }], { player: "Saint-Siège" });
  assert.equal(out.world.economies["Saint-Siège"].unfundedLiabilities, 360_000, "only the 40,000 still free was available");
  assert.equal(out.world.treasuries[0].assumedLiabilities, 640_000);
});

test("covering a promise takes real capital out: nothing is created", () => {
  const w = world();
  const moves = liabilityMovesFromOrder(
    order("Provisionner le passif des retraites à hauteur de 120 000 SY."),
    { player: "Saint-Siège", economies: w.economies, treasuries: w.treasuries, date: "2029-08-11" },
  );
  assert.equal(moves[0].kind, "cover");
  assert.equal(moves[0].amount, 120_000);

  const out = applyLiabilityMoves(w, moves, { player: "Saint-Siège" });
  const e = out.world.economies["Saint-Siège"];
  assert.equal(e.unfundedLiabilities, 280_000);
  assert.equal(e.endowment, 1_580_000, "what was set aside left the patrimony");
  assert.equal(400_000 - e.unfundedLiabilities, 1_700_000 - e.endowment, "the two sides match exactly");
});

test("repricing the terms is capped and paid for in legitimacy", () => {
  const w = world();
  // The order's own claim was "the liability falls 15 to 20%". The low end is
  // taken: a plan's optimistic bound is not evidence.
  const moves = liabilityMovesFromOrder(
    order("Relever l'âge de départ à la retraite et réviser l'indice de revalorisation des pensions : le passif baisse de 15 à 20 %."),
    { player: "Saint-Siège", economies: w.economies, treasuries: w.treasuries, date: "2029-08-11" },
  );
  assert.equal(moves[0].kind, "reprice");
  assert.ok(Math.abs(moves[0].share - 0.15) < 1e-9, `share ${moves[0].share}`);

  const out = applyLiabilityMoves(w, moves, { player: "Saint-Siège" });
  const e = out.world.economies["Saint-Siège"];
  assert.ok(Math.abs(e.unfundedLiabilities - 340_000) < 1e-6);
  assert.ok(e.legitimacy < 72, "the people whose terms changed notice");
  assert.ok(out.rows.some((r) => r.kind === "standing"));

  // A plan claiming half is cut to what such a reform really moves.
  const greedy = applyLiabilityMoves(world(), [{ kind: "reprice", share: 0.5 }], { player: "Saint-Siège" });
  assert.ok(Math.abs(greedy.world.economies["Saint-Siège"].unfundedLiabilities - 400_000 * (1 - MAX_REPRICE_SHARE)) < 1e-6);
});

test("the whole four-point plan reads as all three moves, from the player's own order", () => {
  const w = world();
  const plan = order(
    "1. Basculer de la répartition à la capitalisation : geler le régime à prestations définies et basculer sur un régime à cotisations définies. "
    + "2. Transférer le passif à un fonds de cantonnement interne, adossé à la holding Une Seule Église. "
    + "3. Négocier une convention bilatérale avec l'INPS. "
    + "4. Relever l'âge de départ à la retraite de 65 à 67 ans et réviser l'indice de revalorisation des pensions.",
  );
  const out = ensureLiabilityMovesFromOrders(w, [plan], { player: "Saint-Siège", date: "2029-08-11" });
  assert.ok(out.rows.length > 0, "the plan moves the figure instead of being narrated");
  assert.ok(out.world.economies["Saint-Siège"].unfundedLiabilities < 400_000);

  // Terms are rewritten BEFORE anyone shoulders the promise, so the reform is
  // worth the same whichever paragraph the player wrote it in. This plan claims
  // no share for the liability itself, so it gets the engine's own modest 10%:
  // 400,000 becomes 360,000, and all of that fits behind 640,000 of capital.
  assert.equal(out.world.treasuries.find((t) => t.body === "Une Seule Église").assumedLiabilities, 360_000);
  assert.equal(out.world.economies["Saint-Siège"].unfundedLiabilities, 0);

  // A resolved order is not re-applied, and an order about something else moves nothing.
  assert.deepEqual(ensureLiabilityMovesFromOrders(world(), [{ ...plan, status: "resolved" }], { player: "Saint-Siège" }).rows, []);
  assert.deepEqual(liabilityMovesFromOrder(order("Publier les comptes de l'APSA."), { player: "Saint-Siège", economies: w.economies, treasuries: w.treasuries }), []);
});

test("a state that owes nothing unfunded is left alone", () => {
  const clear = { economies: { A: { unfundedLiabilities: 0, endowment: 100 } }, treasuries: [] };
  assert.deepEqual(liabilityMovesFromOrder(order("Provisionner le passif à hauteur de 50 SY."), { player: "A", economies: clear.economies }), []);
  const out = applyLiabilityMoves(clear, [{ kind: "cover", amount: 50 }], { player: "A" });
  assert.match(out.refusals[0], /nothing is unfunded/);
});

// The ring-fence must not be a free lunch: a federation that takes a pension
// hole onto its books and keeps paying out as before has only moved the hole.
test("capital standing behind a promise stops being distributable", () => {
  const before = stepTreasuries(world().treasuries, { organizations: [{ name: "Une Seule Église", members: ["Saint-Siège"] }], economies: { "Saint-Siège": { treasury: 0 } }, years: 1, date: "2030-01-01" });
  const paidBefore = before.economies["Saint-Siège"].treasury;
  assert.ok(paidBefore > 0, "it pays its beneficiary before assuming anything");

  const carried = applyLiabilityMoves(world(), [{ kind: "assign", body: "Une Seule Église", date: "2029-08-11" }], { player: "Saint-Siège" }).world;
  const after = stepTreasuries(carried.treasuries, { organizations: [{ name: "Une Seule Église", members: ["Saint-Siège"] }], economies: { "Saint-Siège": { treasury: 0 } }, years: 1, date: "2030-01-01" });
  const paidAfter = after.economies["Saint-Siège"].treasury;

  assert.ok(paidAfter < paidBefore, `taking the promise on has to cost something: ${paidBefore} then ${paidAfter}`);
  // The promise is paid out of what its capital earns, so only the free
  // 240,000 of the 640,000 still earns: 12,000 a year on top of the 500 already
  // in hand, four fifths of which is handed on.
  assert.ok(Math.abs(paidAfter - (500 + 240_000 * 0.05) * 0.8) < 1e-6, `got ${paidAfter}`);
  assert.ok(after.rows.some((r) => /consumed what that capital earned/.test(r.what)), "the record says why");
});

// The two-move version of the same trick: ring-fence the hole onto a body one
// turn, strip that body's capital the next, and the promise is backed by air.
test("capital standing behind a promise cannot then be endowed away", () => {
  const carried = applyLiabilityMoves(world(), [{ kind: "assign", body: "Une Seule Église", date: "2029-08-11" }], { player: "Saint-Siège" }).world;
  const holding = carried.treasuries.find((t) => t.body === "Une Seule Église");
  assert.equal(holding.assumedLiabilities, 400_000);
  assert.equal(holding.capital, 640_000);

  // 240,000 is free; asking for 500,000 gets the free part and a reason.
  const out = applyTreasuryMoves(carried, [{ kind: "endow", body: "Pax Africa", from: "Une Seule Église", amount: 500_000, date: "2029-09-01" }], { player: "Saint-Siège" });
  assert.equal(out.world.treasuries.find((t) => t.body === "Pax Africa").capital, 240_000);
  assert.equal(out.world.treasuries.find((t) => t.body === "Une Seule Église").capital, 400_000, "what backs the promise stays");
  assert.match(out.refusals[0], /stands behind promises it assumed and cannot leave/);

  // And once nothing is free, nothing at all can leave.
  const again = applyTreasuryMoves(out.world, [{ kind: "endow", body: "Pax Africa", from: "Une Seule Église", amount: 1_000, date: "2029-09-08" }], { player: "Saint-Siège" });
  assert.deepEqual(again.rows, []);
  assert.match(again.refusals[0], /all of it stands behind the 400,000 SY of promises/);
});

test("the block states what is owed, who carries it, and the three honest moves", () => {
  const w = world();
  const carried = applyLiabilityMoves(w, [{ kind: "assign", body: "Une Seule Église", date: "2029-08-11" }], { player: "Saint-Siège" }).world;
  const text = describeLiabilities(carried, "Saint-Siège");
  assert.match(text, /Saint-Siège owes nothing that is unfunded/);
  assert.match(text, /Une Seule Église carries 400,000 SY of it, against 640,000 SY of capital — 240,000 SY still free/);
  assert.match(text, /A liability does not shrink because it changed letterhead/);
  assert.match(LIABILITY_RULES, /COVER|ASSIGN|REPRICE/);
  assert.equal(describeLiabilities({ economies: { A: { unfundedLiabilities: 0 } }, treasuries: [] }, "A"), "");
});
