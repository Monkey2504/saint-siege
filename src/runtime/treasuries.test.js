import test from "node:test";
import assert from "node:assert/strict";
import { DISTRIBUTION_KEYS, MAX_MARGIN, TREASURY_RULES, applyTreasuryOps, applyTreasuryMoves, describeTreasuries, normalizeTreasury, stepTreasuries, treasuryMovesFromOrder } from "./treasuries.js";

// A federation of continental bodies inside a world body, which is the ordinary
// case here and not a special one: FIFA and its confederations, a Hanseatic
// league and its quarters, a religious federation and its continental poles.
const orgs = [
  { name: "Une Seule Église", status: "active", members: ["Pax Africa", "Pax Asia", "Saint-Siège"] },
  { name: "Pax Africa", status: "active", members: ["Nigeria", "Angola"] },
  { name: "Pax Asia", status: "active", members: ["Philippines"] },
];

test("a purse belongs to a body the world actually holds", () => {
  const r = applyTreasuryOps([], [{ op: "open", body: "Ligue fantôme" }], { date: "2027-01-01", organizations: orgs });
  assert.equal(r.treasuries.length, 0);
  assert.match(r.refusals[0], /not a body this world holds/);
  const ok = applyTreasuryOps([], [{ op: "open", body: "Une Seule Église", retain: 0.5, key: "need" }], { date: "2027-01-01", organizations: orgs });
  assert.equal(ok.treasuries.length, 1);
  assert.equal(ok.treasuries[0].key, "need");
});

test("capital arrives only through the lever, is attributed, and a margin cannot be invented", () => {
  let list = applyTreasuryOps([], [{ op: "open", body: "Une Seule Église" }], { organizations: orgs }).treasuries;
  const r = applyTreasuryOps(list, [
    { op: "capitalise", body: "Une Seule Église", amount: 1000, from: "Chemin synodal allemand" },
    { op: "capitalise", body: "Une Seule Église", amount: 0 },
    { op: "margin", body: "Une Seule Église", margin: 0.9 },
  ], { date: "2027-01-01", organizations: orgs });
  const t = r.treasuries[0];
  assert.equal(t.capital, 1000);
  assert.equal(t.contributions["Chemin synodal allemand"], 1000);
  assert.equal(t.margin, MAX_MARGIN, "an impossible return is capped, not accepted");
  assert.ok(r.refusals.some((x) => /amount must be above zero/.test(x)));
  assert.ok(r.refusals.some((x) => /capped at 25%/.test(x)));
});

test("a purse earns, keeps its share, and hands the rest down the federation", () => {
  let list = applyTreasuryOps([], [
    { op: "open", body: "Une Seule Église", retain: 0.5, key: "equal" },
    { op: "open", body: "Pax Africa", parent: "Une Seule Église", retain: 0, key: "equal" },
    { op: "open", body: "Pax Asia", parent: "Une Seule Église", retain: 0, key: "equal" },
    { op: "capitalise", body: "Une Seule Église", amount: 1000, from: "Chemin synodal allemand" },
    { op: "margin", body: "Une Seule Église", margin: 0.1 },
  ], { date: "2027-01-01", organizations: orgs }).treasuries;

  const economies = { "Saint-Siège": { treasury: 0 }, Nigeria: { treasury: 0 }, Angola: { treasury: 0 }, Philippines: { treasury: 0 } };
  const out = stepTreasuries(list, { organizations: orgs, economies, years: 1, date: "2028-01-01" });

  const top = out.treasuries.find((t) => t.body === "Une Seule Église");
  // Earned 100, kept half, handed 50 to three members equally.
  assert.ok(Math.abs(top.treasury - 50) < 1e-6, `top kept ${top.treasury}`);
  assert.ok(Math.abs(out.economies["Saint-Siège"].treasury - 50 / 3) < 1e-6, "a polity member is paid into its treasury");

  // The continental bodies received into their OWN purses and, retaining
  // nothing, passed it on to their national members in the same period.
  assert.ok(Math.abs(out.economies.Nigeria.treasury - (50 / 3) / 2) < 1e-6, "money handed down two levels in one step");
  assert.ok(Math.abs(out.economies.Philippines.treasury - 50 / 3) < 1e-6);
  const africa = out.treasuries.find((t) => t.body === "Pax Africa");
  assert.ok(Math.abs(africa.treasury) < 1e-6, "a body retaining nothing keeps nothing");

  // Every movement left a row for the record.
  assert.ok(out.rows.some((r) => /rendement de son capital placé/.test(r.what)));
  assert.ok(out.rows.some((r) => r.polity === "Nigeria" && r.amount > 0));
  assert.ok(out.rows.some((r) => r.amount < 0 && /reversé à/.test(r.what)));
});

test("the solidarity key really sends more to the poorer member", () => {
  const two = [{ name: "Fonds", status: "active", members: ["Rich", "Poor"] }];
  let list = applyTreasuryOps([], [
    { op: "open", body: "Fonds", retain: 0, key: "need" },
    { op: "capitalise", body: "Fonds", amount: 1000 },
    { op: "margin", body: "Fonds", margin: 0.1 },
  ], { organizations: two }).treasuries;
  const economies = { Rich: { treasury: 0, population: 10, capital: 900, land: 50, technology: 90 }, Poor: { treasury: 0, population: 200, capital: 20, land: 40, technology: 5 } };
  const out = stepTreasuries(list, { organizations: two, economies, years: 1, date: "2028-01-01" });
  assert.ok(out.economies.Poor.treasury > out.economies.Rich.treasury, "need pays the poorer more");
  assert.ok(Math.abs((out.economies.Poor.treasury + out.economies.Rich.treasury) - 100) < 1e-6, "all of it is handed on");
});

test("the contribution key pays back in proportion to what was put in", () => {
  const two = [{ name: "Fonds", status: "active", members: ["A", "B"] }];
  let list = applyTreasuryOps([], [
    { op: "open", body: "Fonds", retain: 0, key: "contribution" },
    { op: "capitalise", body: "Fonds", amount: 300, from: "A" },
    { op: "capitalise", body: "Fonds", amount: 100, from: "B" },
    { op: "margin", body: "Fonds", margin: 0.1 },
  ], { organizations: two }).treasuries;
  const out = stepTreasuries(list, { organizations: two, economies: { A: { treasury: 0 }, B: { treasury: 0 } }, years: 1, date: "2028-01-01" });
  assert.ok(Math.abs(out.economies.A.treasury - 30) < 1e-6);
  assert.ok(Math.abs(out.economies.B.treasury - 10) < 1e-6);
});

test("a body that has run nothing earns nothing, and a wound-up purse is still", () => {
  const one = [{ name: "Fonds", status: "active", members: ["A"] }];
  const idle = applyTreasuryOps([], [{ op: "open", body: "Fonds" }, { op: "capitalise", body: "Fonds", amount: 1000 }], { organizations: one }).treasuries;
  const out = stepTreasuries(idle, { organizations: one, economies: { A: { treasury: 0 } }, years: 1, date: "2028-01-01" });
  assert.equal(out.economies.A.treasury, 0, "no margin, no money");
  assert.deepEqual(out.rows, []);

  const closed = applyTreasuryOps(idle, [{ op: "windUp", body: "Fonds" }], { organizations: one }).treasuries;
  assert.deepEqual(stepTreasuries(closed, { organizations: one, economies: { A: { treasury: 0 } }, years: 1 }).rows, []);
});

test("the block names each purse, its levels and its key, and states the voice rule", () => {
  const list = applyTreasuryOps([], [
    { op: "open", body: "Une Seule Église", retain: 0.4, key: "need" },
    { op: "open", body: "Pax Africa", parent: "Une Seule Église" },
    { op: "capitalise", body: "Une Seule Église", amount: 1000 },
    { op: "margin", body: "Une Seule Église", margin: 0.06 },
  ], { organizations: orgs }).treasuries;
  const text = describeTreasuries(list, { organizations: orgs });
  assert.match(text, /Une Seule Église: capital 1,000 SY placed at 6% a year/);
  assert.match(text, /keeps 40% for working capital and investment, hands the rest to 3 members by need/);
  assert.match(text, /Pax Africa \(within Une Seule Église\)/);
  assert.match(text, /also has a voice/);
  assert.equal(describeTreasuries([]), "");
  assert.deepEqual(DISTRIBUTION_KEYS, ["equal", "need", "contribution"]);
  assert.match(TREASURY_RULES, /found it with organizationOps first/);
});

// "Chacun des pôles dispose d'un fonds de campagne de façon autonome, mais doit
// quand même renvoyer le reste vers le Vatican." A share cannot express that: a
// fraction of each period's income builds a buffer whose size depends on how
// long a turn happens to be, so the same chapter funds its year on monthly turns
// and starves on weekly ones. A sum is turn-length blind.
test("a body keeps its campaign fund off the top and hands on only what sits above it", () => {
  const list = [
    { body: "Fédération", capital: 0, treasury: 0, margin: 0, retain: 0, key: "equal", status: "active" },
    { body: "Pôle", parent: "Fédération", capital: 0, treasury: 5_000, margin: 0, retain: 0, key: "equal", reserve: 4_000, beneficiary: "Rome", beneficiaryShare: 1, status: "active" },
  ];
  const orgs = [{ name: "Pôle", members: ["Rome"] }];
  const out = stepTreasuries(list, { organizations: orgs, economies: { Rome: { treasury: 0 } }, years: 1, date: "2030-01-01" });
  assert.equal(out.economies.Rome.treasury, 1_000, "only the 1,000 above the campaign fund goes up");
  assert.equal(out.treasuries.find((t) => t.body === "Pôle").treasury, 4_000, "the campaign fund stays in hand");

  // At or below the fund, nothing is handed on at all.
  const lean = stepTreasuries(
    list.map((t) => (t.body === "Pôle" ? { ...t, treasury: 3_000 } : t)),
    { organizations: orgs, economies: { Rome: { treasury: 0 } }, years: 1, date: "2030-01-01" },
  );
  assert.equal(lean.economies.Rome.treasury, 0, "a chapter short of its own year sends nothing upward");
  assert.equal(lean.treasuries.find((t) => t.body === "Pôle").treasury, 3_000);
});

test("a purse survives a round-trip and rejects nonsense", () => {
  assert.equal(normalizeTreasury(null), null);
  assert.equal(normalizeTreasury({ capital: 5 }), null, "a purse with no body is nothing");
  const t = normalizeTreasury({ body: "X", retain: 5, margin: -2, key: "whatever", capital: -3 });
  assert.equal(t.retain, 1);
  assert.equal(t.margin, 0);
  assert.equal(t.key, "equal");
  assert.equal(t.capital, 0);
});

// "Le but de la holding est de financer l'Église : c'est à l'Église que doit
// revenir la majorité des revenus, en dehors du fonds de roulement et des
// investissements." A purpose a body can be held to, not a wish.
test("a body founded to finance somebody sends it the majority, and the rest is shared", () => {
  const fed = [{ name: "Holding", status: "active", members: ["Église", "Pole A", "Pole B", "Pole C"] }];
  const list = applyTreasuryOps([], [
    { op: "open", body: "Holding", retain: 0.2, key: "equal" },
    { op: "key", body: "Holding", beneficiary: "Église", beneficiaryShare: 0.7 },
    { op: "capitalise", body: "Holding", amount: 1000 },
    { op: "margin", body: "Holding", margin: 0.1 },
  ], { organizations: fed }).treasuries;

  const economies = { "Église": { treasury: 0 }, "Pole A": { treasury: 0 }, "Pole B": { treasury: 0 }, "Pole C": { treasury: 0 } };
  const out = stepTreasuries(list, { organizations: fed, economies, years: 1, date: "2028-01-01" });

  // Earned 100; kept 20 for working capital; handed on 80, of which 70% to the
  // Church and the remaining 24 split three ways.
  assert.ok(Math.abs(out.economies["Église"].treasury - 56) < 1e-6, `church got ${out.economies["Église"].treasury}`);
  assert.ok(Math.abs(out.economies["Pole A"].treasury - 8) < 1e-6);
  assert.ok(Math.abs(out.economies["Pole C"].treasury - 8) < 1e-6);
  assert.ok(out.economies["Église"].treasury > 100 / 2, "the majority of what was earned reaches the body it finances");

  const text = describeTreasuries(out.treasuries, { organizations: fed });
  assert.match(text, /keeps 20% for working capital and investment/);
  assert.match(text, /70% of it to Église, which it exists to finance/);
});

test("with no other member, the beneficiary takes all that is handed on", () => {
  const solo = [{ name: "Fonds", status: "active", members: ["Crown"] }];
  const list = applyTreasuryOps([], [
    { op: "open", body: "Fonds", retain: 0.1 },
    { op: "key", body: "Fonds", beneficiary: "Crown", beneficiaryShare: 1 },
    { op: "capitalise", body: "Fonds", amount: 1000 },
    { op: "margin", body: "Fonds", margin: 0.1 },
  ], { organizations: solo }).treasuries;
  const out = stepTreasuries(list, { organizations: solo, economies: { Crown: { treasury: 0 } }, years: 1, date: "2028-01-01" });
  assert.ok(Math.abs(out.economies.Crown.treasury - 90) < 1e-6);
});

// "Le but est d'avoir 30 M/an pour financer les besoins du Vatican." Repeated
// in letters, it was nowhere; written here, it is measured every period.
test("a body carries the sum it was founded to deliver, and the engine says when it falls short", () => {
  const fed = [{ name: "Holding", status: "active", members: ["Église", "Pole A"] }];
  const list = applyTreasuryOps([], [
    { op: "open", body: "Holding", retain: 0.2, key: "equal" },
    { op: "key", body: "Holding", beneficiary: "Église", beneficiaryShare: 0.7, annualTarget: 100 },
    { op: "capitalise", body: "Holding", amount: 1000 },
    { op: "margin", body: "Holding", margin: 0.1 },
  ], { organizations: fed }).treasuries;

  const out = stepTreasuries(list, { organizations: fed, economies: { "Église": { treasury: 0 }, "Pole A": { treasury: 0 } }, years: 1, date: "2028-01-01" });
  const t = out.treasuries[0];
  assert.ok(Math.abs(t.deliveredPerYear - 56) < 1e-6, `delivered ${t.deliveredPerYear}`);

  const text = describeTreasuries(out.treasuries, { organizations: fed });
  assert.match(text, /founded to deliver 100 SY a year to Église/);
  assert.match(text, /delivering 56, short by 44 a year/);
  assert.match(text, /more capital in the purse, or operations that actually earn more than a placement/);
});

test("a purpose that is met is stated as met, and a body with no target says nothing about one", () => {
  const fed = [{ name: "Holding", status: "active", members: ["Église"] }];
  const list = applyTreasuryOps([], [
    { op: "open", body: "Holding", retain: 0 },
    { op: "key", body: "Holding", beneficiary: "Église", beneficiaryShare: 1, annualTarget: 50 },
    { op: "capitalise", body: "Holding", amount: 1000 },
    { op: "margin", body: "Holding", margin: 0.1 },
  ], { organizations: fed }).treasuries;
  const out = stepTreasuries(list, { organizations: fed, economies: { "Église": { treasury: 0 } }, years: 1, date: "2028-01-01" });
  assert.match(describeTreasuries(out.treasuries, { organizations: fed }), /delivering 100 — the purpose is met/);

  const plain = applyTreasuryOps([], [{ op: "open", body: "Holding" }], { organizations: fed }).treasuries;
  assert.doesNotMatch(describeTreasuries(plain, { organizations: fed }), /founded to deliver/);
});

// Same lesson a third time: a rule asking the model to carry treasuryOps did
// not make it carry them. An edition narrated "décaissement de 30 000 SY pour
// doter Pax Africa" and the pole's capital stayed at zero. So the engine reads
// the order.
test("an order that endows a body moves capital out of the one that funds it", () => {
  const world = {
    treasuries: [
      { body: "Holding", capital: 100_000, treasury: 500, margin: 0.05, retain: 0.2, key: "need" },
      { body: "Pax Africa", parent: "Holding", capital: 0, treasury: 900, margin: 0, retain: 1, key: "equal" },
    ],
    economies: {},
  };
  const order = { id: "o", text: "Doter Pax Africa de 30 000 SY prélevés sur le capital de la holding Holding pour financer son rassemblement." };
  const moves = treasuryMovesFromOrder(order, { player: "Rome", treasuries: world.treasuries, date: "2028-05-08" });
  assert.deepEqual(moves, [{ kind: "endow", body: "Pax Africa", from: "Holding", amount: 30_000, date: "2028-05-08" }]);

  const out = applyTreasuryMoves(world, moves, { player: "Rome" });
  assert.equal(out.world.treasuries.find((t) => t.body === "Holding").capital, 70_000);
  const pole = out.world.treasuries.find((t) => t.body === "Pax Africa");
  assert.equal(pole.capital, 30_000);
  assert.equal(pole.contributions.Holding, 30_000, "who paid is recorded");
  assert.equal(out.rows.length, 2, "both sides leave a row");
});

test("an endowment is cut to what the giver actually holds", () => {
  const world = { treasuries: [{ body: "Holding", capital: 5_000 }, { body: "Pole", parent: "Holding", capital: 0 }], economies: {} };
  const out = applyTreasuryMoves(world, [{ kind: "endow", body: "Pole", from: "Holding", amount: 30_000, date: "2028-05-08" }], {});
  assert.equal(out.world.treasuries.find((t) => t.body === "Pole").capital, 5_000);
  assert.match(out.refusals[0], /cut to 5,?000 SY|cut to 5000 SY/);
});

test("an order to place idle cash turns treasury into capital, and nothing else", () => {
  const world = { treasuries: [{ body: "Pole", capital: 0, treasury: 900 }], economies: {} };
  const moves = treasuryMovesFromOrder({ id: "p", text: "Ordonner au Pole de placer sa trésorerie en capital productif." }, { treasuries: world.treasuries, date: "2028-05-08" });
  assert.deepEqual(moves, [{ kind: "place", body: "Pole", amount: 900, date: "2028-05-08" }]);
  const out = applyTreasuryMoves(world, moves, {});
  const t = out.world.treasuries[0];
  assert.equal(t.capital, 900);
  assert.equal(t.treasury, 0);
  assert.match(out.rows[0].what, /liquidités placées en capital/);

  // An order about nothing of the sort moves nothing.
  assert.deepEqual(treasuryMovesFromOrder({ id: "q", text: "Publier les comptes de l'APSA." }, { treasuries: world.treasuries }), []);
});

test("a body's capital earns its federation's rate until it has shown one of its own", () => {
  const list = [
    { body: "Holding", capital: 100_000, treasury: 0, margin: 0.05, retain: 1, key: "equal", status: "active" },
    // Endowed, and it has never run anything: it earns what the federation earns.
    { body: "Pole", parent: "Holding", capital: 1_000, treasury: 0, margin: 0, retain: 1, key: "equal", status: "active" },
    // It has shown its own rate, so that is what it earns.
    { body: "Éprouvé", parent: "Holding", capital: 1_000, treasury: 0, margin: 0.12, retain: 1, key: "equal", status: "active" },
    // Nobody above it and nothing shown: it earns nothing, and no rate is invented.
    { body: "Seul", capital: 1_000, treasury: 0, margin: 0, retain: 1, key: "equal", status: "active" },
  ];
  const out = stepTreasuries(list, { organizations: [], economies: {}, years: 1, date: "2029-01-01" });
  const got = (name) => out.treasuries.find((t) => t.body === name);
  assert.ok(Math.abs(got("Pole").treasury - 50) < 1e-6, `endowed capital cannot return zero, got ${got("Pole").treasury}`);
  assert.equal(got("Pole").margin, 0, "the rate is borrowed for the period, not written into the body");
  assert.ok(Math.abs(got("Éprouvé").treasury - 120) < 1e-6);
  assert.equal(got("Seul").treasury, 0, "no parent and nothing shown earns nothing, rather than an invented rate");
  assert.match(out.rows.find((r) => r.polity === "Pole").source, /the rate of Holding/);
});
