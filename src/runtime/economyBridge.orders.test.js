import test from "node:test";
import assert from "node:assert/strict";
import { economyIndicators, normalizeEconomy } from "./economy.js";
import {
  ECONOMY_ORDER_RULES, applyEconomyMoves, economyMovesFromOrder, ensureEconomyMovesFromOrders,
} from "./economyBridge.js";

// A modern state, because that is the campaign these orders get written in: a
// 42% take, an army line and a civil line an order can name, and deficits
// covered by borrowing until somebody says otherwise.
const world = (over = {}) => ({
  economies: {
    France: normalizeEconomy({
      population: 68_000_000,
      effectiveLand: 3.0e7,
      capital: 68_000_000 * 40 * 2.5,
      technology: 88, administrativeReach: 96, monetization: 98, marketIntegration: 95,
      financialDepth: 92, fiscalCredibility: 70, legitimacy: 60, openness: 40,
      taxRate: 0.42, investmentShare: 0.22,
      militaryUpkeep: 60_000_000, civilSpending: 900_000_000,
      financing: "borrow",
      ...over,
    }),
    Brazil: normalizeEconomy({ population: 210_000_000, taxRate: 0.33 }),
  },
});

const franceIn = (w) => normalizeEconomy(w.economies.France);

// The complaint this whole module exists to answer: the model narrated the
// lever instead of pulling it, and the tax rate never moved once in a real
// campaign. Now the engine reads the order.
test("an order that sets the tax rate moves the rate, and the revenue with it", () => {
  const w = world();
  const order = { id: "o1", text: "Porter le taux d'imposition de 42 % a 48 % pour financer la remise a niveau des hopitaux." };
  const moves = economyMovesFromOrder(order, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(moves, [{ kind: "taxRate", rate: 0.48, date: "2027-03-04" }], "the target is the rate it goes TO, never the one it comes from");

  const before = economyIndicators(franceIn(w)).revenue;
  const out = applyEconomyMoves(w, moves, { player: "France" });
  const after = franceIn(out.world);
  assert.ok(Math.abs(after.taxRate - 0.48) < 1e-9, `tax rate stood at ${after.taxRate}`);
  assert.equal(out.rows.length, 1);
  assert.match(out.rows[0].what, /tax rate moved from 42.0% to 48.0%/);
  assert.equal(out.rows[0].source, "order:taxRate");
  assert.ok(out.rows[0].amount > 0, "a higher rate collects more, and the row says how much");
  assert.ok(Math.abs(out.rows[0].amount - (economyIndicators(after).revenue - before)) < 1, "the row carries the revenue the change is actually worth");
  assert.notEqual(out.world, w, "the world the caller gets back is the changed one");
});

// French says "de 5 %" for BY five points and "a 5 %" for TO five percent. Read
// the first as a target and a trim of the army budget becomes a state taking a
// twentieth of its economy, so an order that does not plainly set a rate sets
// nothing at all.
test("a rate the order only nudges is not read as a rate the order sets", () => {
  const w = world();
  const moves = economyMovesFromOrder({ id: "o2", text: "Reduire le taux d'imposition de 5 % au profit des menages." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(moves, []);
});

test("a named spending line is cut by a share of itself", () => {
  const w = world();
  const moves = economyMovesFromOrder({ id: "o3", text: "Reduire le budget militaire de 20 % des cette annee." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(moves, [{ kind: "spending", line: "militaryUpkeep", share: -0.2, date: "2027-03-04" }]);

  const out = applyEconomyMoves(w, moves, { player: "France" });
  assert.ok(Math.abs(franceIn(out.world).militaryUpkeep - 48_000_000) < 1e-6, "60 million less a fifth");
  assert.ok(Math.abs(out.rows[0].amount + 12_000_000) < 1e-6, "the row is signed, and it is the sum that left");
  assert.equal(out.rows[0].source, "order:spending:militaryUpkeep");
  assert.match(out.rows[0].what, /cut to 48,000,000 SY a year/);
});

test("a spending line is raised by a sum in the engine's own unit", () => {
  const w = world();
  const moves = economyMovesFromOrder({ id: "o4", text: "Augmenter les depenses sociales de 25 000 000 SY par an." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(moves, [{ kind: "spending", line: "civilSpending", amount: 25_000_000, date: "2027-03-04" }]);
  const out = applyEconomyMoves(w, moves, { player: "France" });
  assert.ok(Math.abs(franceIn(out.world).civilSpending - 925_000_000) < 1e-6);
  assert.ok(out.rows[0].amount > 0);
});

// How a modern budget is actually stated. "3 % du PIB" is a target, not a
// change, so it is read as one only when the order plainly sets it there.
test("a military line set to a share of output lands on the engine's own output", () => {
  const w = world();
  const moves = economyMovesFromOrder({ id: "o5", text: "Porter le budget de la defense a 3 % du PIB avant 2030." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(moves, [{ kind: "spending", line: "militaryUpkeep", shareOfOutput: 0.03, date: "2027-03-04" }]);

  const output = economyIndicators(franceIn(w)).output;
  const out = applyEconomyMoves(w, moves, { player: "France" });
  assert.ok(Math.abs(franceIn(out.world).militaryUpkeep - 0.03 * output) < 1, `army line stood at ${franceIn(out.world).militaryUpkeep} against an output of ${output}`);
  assert.ok(out.rows[0].amount > 0, "three percent of a modern economy is well above the sixty million it was paying");
});

// Field report: "financer le deficit par l'emprunt plutot que par la planche a
// billets" switched the state to printing money, because the parser read the
// last route it saw. What an order moves AWAY from is not what it moves TO.
test("the route an order rejects is not the route it takes", () => {
  const w = world({ financing: "print" });
  const both = [
    "Financer le deficit par l'emprunt plutot que par la planche a billets.",
    "Cesser la planche a billets et financer le deficit par l'emprunt.",
    "Au lieu de la creation monetaire, couvrir le deficit par l'emprunt.",
  ];
  for (const text of both) {
    const moves = economyMovesFromOrder({ id: "f", text }, { player: "France", economies: w.economies, date: "2027-03-04" });
    assert.deepEqual(moves, [{ kind: "financing", mode: "borrow", date: "2027-03-04" }], `read the wrong route out of: ${text}`);
  }

  const out = applyEconomyMoves(w, economyMovesFromOrder({ id: "f", text: both[0] }, { player: "France", economies: w.economies, date: "2027-03-04" }), { player: "France" });
  assert.equal(franceIn(out.world).financing, "borrow");
  assert.match(out.rows[0].what, /deficits are now covered by borrowing/);
  assert.equal(out.rows[0].amount, 0, "the switch governs the next period's gap; nothing has moved yet");
});

test("austerity and a patrimony drawdown are read as themselves", () => {
  const w = world();
  const austere = economyMovesFromOrder({ id: "a", text: "Couvrir le deficit par l'austerite budgetaire, sans dette nouvelle." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(austere, [{ kind: "financing", mode: "austerity", date: "2027-03-04" }]);
  const drawn = economyMovesFromOrder({ id: "d", text: "Couvrir le deficit en puisant dans le patrimoine de l'Etat." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(drawn, [{ kind: "financing", mode: "drawdown", date: "2027-03-04" }]);
  assert.equal(franceIn(applyEconomyMoves(w, drawn, { player: "France" }).world).financing, "drawdown");
});

test("English orders move the same figures as French ones", () => {
  const w = world();
  const moves = economyMovesFromOrder({ id: "e", text: "Set the tax rate to 30% and cut the defence budget by 10%." }, { player: "France", economies: w.economies, date: "2027-03-04" });
  assert.deepEqual(moves, [
    { kind: "taxRate", rate: 0.3, date: "2027-03-04" },
    { kind: "spending", line: "militaryUpkeep", share: -0.1, date: "2027-03-04" },
  ]);
  const out = applyEconomyMoves(w, moves, { player: "France" });
  const after = franceIn(out.world);
  assert.ok(Math.abs(after.taxRate - 0.3) < 1e-9);
  assert.ok(Math.abs(after.militaryUpkeep - 54_000_000) < 1e-6);
  assert.equal(out.rows.length, 2, "two levers, two rows");
});

// Everything goes through applyEconomyChange, so every cap the engine already
// had still binds — and the player is told which one bound, rather than finding
// a figure quietly sitting somewhere else.
test("the engine's own caps still bind, and say so", () => {
  const w = world();
  const greedy = applyEconomyMoves(w, [{ kind: "taxRate", rate: 0.95, date: "2027-03-04" }], { player: "France" });
  assert.ok(Math.abs(franceIn(greedy.world).taxRate - 0.9) < 1e-9, "a rate no state can collect is cut back, not accepted");
  assert.ok(greedy.refusals.some((r) => /past what any state can actually assess/.test(r)));

  const overCut = applyEconomyMoves(w, [{ kind: "spending", line: "militaryUpkeep", amount: -90_000_000, date: "2027-03-04" }], { player: "France" });
  assert.equal(franceIn(overCut.world).militaryUpkeep, 0, "a budget cannot go below nothing");
  assert.ok(Math.abs(overCut.rows[0].amount + 60_000_000) < 1e-6, "the row is what actually left, not what was asked for");
  assert.ok(overCut.refusals.some((r) => /could only move 60,000,000 SY a year/.test(r)));
});

test("a lever already where the order wants it moves nothing and says why", () => {
  const w = world();
  const out = applyEconomyMoves(w, [
    { kind: "taxRate", rate: 0.42, date: "2027-03-04" },
    { kind: "financing", mode: "borrow", date: "2027-03-04" },
  ], { player: "France" });
  assert.deepEqual(out.rows, []);
  assert.equal(out.world, w, "nothing moved, so the caller keeps the world it had");
  assert.ok(out.refusals.some((r) => /already taxes at 42.0%/.test(r)));
  assert.ok(out.refusals.some((r) => /already covers deficits by borrowing/.test(r)));
});

// The whole point of a parser that reads orders is that it stays silent about
// orders that are not about the budget. A treasury endowment belongs to
// runtime/treasuries.js and must stay there.
test("an order about something else moves nothing at all", () => {
  const w = world();
  const elsewhere = [
    "Publier les comptes de la Banque de France et recevoir l'ambassadeur du Bresil.",
    "Doter Pax Africa de 30 000 SY prelevees sur le capital de la holding pour financer son rassemblement.",
    "Porter les taxes sur le carburant a 3 % pour apaiser les transporteurs.",
    "Nommer un nouveau ministre des affaires etrangeres.",
  ];
  for (const text of elsewhere) {
    assert.deepEqual(economyMovesFromOrder({ id: "x", text }, { player: "France", economies: w.economies, date: "2027-03-04" }), [], `moved something on: ${text}`);
  }
  const out = ensureEconomyMovesFromOrders(w, elsewhere.map((text, i) => ({ id: `x${i}`, text })), { player: "France", date: "2027-03-04" });
  assert.deepEqual(out.rows, []);
  assert.equal(out.world, w);
});

test("only planned, non-chat orders are read, and a polity with no economy is refused", () => {
  const w = world();
  const order = { id: "p", text: "Porter le taux d'imposition a 48 %." };
  const done = ensureEconomyMovesFromOrders(w, [{ ...order, status: "resolved" }, { ...order, kind: "chat" }], { player: "France", date: "2027-03-04" });
  assert.deepEqual(done.rows, []);

  const live = ensureEconomyMovesFromOrders(w, [order], { player: "France", date: "2027-03-04" });
  assert.equal(live.rows.length, 1);
  assert.ok(Math.abs(franceIn(live.world).taxRate - 0.48) < 1e-9);
  assert.equal(franceIn(live.world).population, franceIn(w).population, "one lever moved, and nothing else did");
  assert.ok(Math.abs(normalizeEconomy(live.world.economies.Brazil).taxRate - 0.33) < 1e-9, "another power's budget is untouched");

  const nobody = applyEconomyMoves(w, [{ kind: "taxRate", rate: 0.5, date: "" }], { player: "Atlantis" });
  assert.deepEqual(nobody.rows, []);
  assert.match(nobody.refusals[0], /no polity named "Atlantis"/);
});

test("the rules block tells the model the engine has already moved these levers", () => {
  assert.match(ECONOMY_ORDER_RULES, /the engine reads the player's own order/);
  assert.match(ECONOMY_ORDER_RULES, /borrow, print, austerity or drawdown/);
  assert.match(ECONOMY_ORDER_RULES, /never narrate a tax rise, a budget cut or a switch to borrowing as done/);
});
