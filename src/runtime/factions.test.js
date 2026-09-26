/*! Open Historia — assembly tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import {
  ASSEMBLY_RULES, AXES, LOYAL_AT, MAX_APPROVAL_STEP, RADICAL_AT, SCHISM_AT,
  applySpeech, describeAssembly, driftFromBlunders, groupsOn, judgeGovernance,
  PERSUASION_MAX_STEP, affinity, coalition, normalizeAssembly, ownBloc, persuadeNeighbours,
  putToTheVote, seatAssembly, speechFromOrder, standing, temper,
} from "./factions.js";

// The register's own faithful. The college follows these, so nobody has to keep
// it in step by hand.
const faithful = { africa: 300_758_728, americas: 683_387_291, asia: 157_020_133, europe: 288_517_667, oceania: 11_449_799 };

const college = () => seatAssembly({
  name: "Collège des cardinaux et évêques",
  seats: 160,
  marginals: {
    region: faithful,
    doctrine: { traditional: 40, centrist: 70, reforming: 50 },
    role: { curia: 40, diplomacy: 20, bishops: 50, orders: 30, temporal: 20 },
  },
  correlations: {
    europe: { doctrine: { traditional: 1.4 }, role: { curia: 2.5, temporal: 2.5, diplomacy: 1.8 } },
    africa: { doctrine: { traditional: 1.3 }, role: { bishops: 1.6, curia: 0.3, temporal: 0.2 } },
    americas: { doctrine: { reforming: 1.2 }, role: { bishops: 1.4, orders: 1.3, curia: 0.4 } },
    asia: { role: { orders: 1.5, bishops: 1.3, curia: 0.3 } },
    oceania: { role: { bishops: 1.4, curia: 0.2 } },
  },
  seed: 11,
});

test("the roll is the people in it, and the same figures always seat the same room", () => {
  const a = college();
  assert.equal(a.seats, 160);
  assert.equal(a.electors.length, 160);
  assert.deepEqual(a, college(), "a college that reshuffles on reload is not a world");

  // Every elector stands on all three axes, and every axis accounts for all 160.
  for (const axis of AXES) {
    assert.equal(groupsOn(a, axis).reduce((s, g) => s + g.seats, 0), 160, `the ${axis} axis must hold everyone`);
  }
});

// "24 sur 160 pour les cardinaux allemands, ça donne un poids démesuré à
// l'Allemagne par rapport au reste du monde."
test("the regions follow the faithful, so no country can outweigh a continent", () => {
  const a = college();
  const by = Object.fromEntries(groupsOn(a, "region").map((g) => [g.name, g.seats]));
  const everyone = Object.values(faithful).reduce((x, y) => x + y, 0);

  for (const [region, people] of Object.entries(faithful)) {
    const expected = (people / everyone) * 160;
    assert.ok(Math.abs(by[region] - expected) <= 12,
      `${region} holds ${by[region]} seats against ${Math.round(expected)} of the faithful`);
  }
  assert.ok(by.americas > by.europe, "the Americas hold more of the baptised than Europe, and so more of the college");
  assert.ok(by.oceania <= 5, `Oceania is 0.8% of the baptised, got ${by.oceania} seats`);

  // Move the faithful and the college follows, with nobody retyping it.
  const grown = seatAssembly({ seats: 160, marginals: { region: { ...faithful, africa: faithful.africa * 3 }, doctrine: { centrist: 1 }, role: { bishops: 1 } }, seed: 11 });
  const africaNow = groupsOn(grown, "region").find((g) => g.name === "africa").seats;
  assert.ok(africaNow > by.africa, "a continent that grows gains seats by itself");
});

test("nobody starts against the player, and the whole body is undecided on day one", () => {
  const s = standing(college());
  assert.equal(s.with, 0);
  assert.equal(s.against, 0);
  assert.equal(s.undecided, 160, "no opinion is invented before the first decision");
  assert.equal(s.carries, false);
  assert.equal(s.majority, 81);
});

// "Un cardinal africain peut être à la fois conservateur sur la doctrine,
// priorité missionnaire et représentant de l'Afrique."
test("one elector weighs three things at once and can be pleased and offended in the same year", () => {
  const a = college();
  // A year of souls and of upheaval: the missionary in them approves, the
  // conservative in them does not.
  const out = judgeGovernance(a, { movements: { faithful: 0.5 }, upheaval: 1, date: "2030-01-01" });
  const before = Object.fromEntries(groupsOn(a, "doctrine").map((g) => [g.name, g.approval]));
  const after = Object.fromEntries(groupsOn(out.assembly, "doctrine").map((g) => [g.name, g.approval]));

  assert.ok(after.reforming > before.reforming, "those indifferent to change keep the gain");
  assert.ok(after.traditional < after.reforming, "those for whom any change is a loss keep less of it");
  assert.ok(out.rows.length > 0 && out.rows.every((r) => AXES.includes(r.axis)), "the report is by group, not by person");

  // Nobody's mind turns in a week.
  const wild = judgeGovernance(a, { movements: { faithful: 99, legitimacy: 99, balance: 99 } });
  assert.ok(wild.assembly.electors.every((e) => Math.abs(e.approval) <= MAX_APPROVAL_STEP));
});

test("the money men and the missionaries read the same year differently", () => {
  const a = college();
  // Accounts cleaned, nothing else moved.
  const out = judgeGovernance(a, { movements: { balance: 1.6, unfundedLiabilities: -1, treasury: 1 }, date: "2030-01-01" });
  const by = Object.fromEntries(groupsOn(out.assembly, "role").map((g) => [g.name, g.approval]));
  assert.ok(by.temporal > 0, "the people who keep the books notice the books");
  assert.ok(by.temporal > by.bishops, "the bishops do not, because they count souls");
});

test("a question passes on the count, and the same room splits differently by question", () => {
  const a = college();
  // A curial reform: the field is for it, the house is against it.
  const curia = putToTheVote(a, { pleases: ["bishops", "orders", "reforming"], offends: ["curia", "traditional"] });
  assert.equal(curia.ayes + curia.noes + curia.abstain, 160);
  assert.ok(curia.passed, `the field outnumbers the house: ${curia.ayes} to ${curia.noes}`);

  // A doctrinal tightening splits the very same people the other way.
  const doctrine = putToTheVote(a, { pleases: ["traditional", "curia"], offends: ["reforming", "orders"] });
  assert.ok(doctrine.noes > 0 && doctrine.ayes > 0);
  assert.notDeepEqual([curia.ayes, curia.noes], [doctrine.ayes, doctrine.noes], "coalitions are computed from the question");

  // And standing carries what interest alone would not: a trusted pontificate
  // wins a vote it would otherwise lose.
  const warm = { ...a, electors: a.electors.map((e) => ({ ...e, approval: 70 })) };
  const hard = putToTheVote(a, { offends: ["bishops", "orders", "curia"] });
  const easier = putToTheVote(warm, { offends: ["bishops", "orders", "curia"] });
  assert.ok(easier.ayes > hard.ayes, "a room that trusts you carries things it mildly dislikes");
});

test("a speech is worth your standing, reaches whom it names, and lying costs", () => {
  const a = college();
  const order = { id: "s", text: "Prononcer un discours devant les bishops pour les convaincre de suivre la réforme." };
  const speech = speechFromOrder(order, { assembly: a, legitimacy: 80 });
  assert.ok(speech && speech.at.includes("bishops"), "the engine reads the order rather than waiting for a lever");

  const out = applySpeech(a, speech);
  const after = Object.fromEntries(groupsOn(out.assembly, "role").map((g) => [g.name, g.approval]));
  assert.ok(after.bishops > 0, "the group addressed is moved");
  assert.equal(after.curia, 0, "and nobody else is");

  // Standing is what a speech is made of.
  const weak = applySpeech(a, speechFromOrder(order, { assembly: a, legitimacy: 15 }));
  const weakBishops = groupsOn(weak.assembly, "role").find((g) => g.name === "bishops").approval;
  assert.ok(after.bishops > weakBishops);

  // The room has the ledger too.
  const lying = applySpeech(a, speech, { honest: false });
  assert.ok(groupsOn(lying.assembly, "role").find((g) => g.name === "bishops").approval < 0);
  assert.match(lying.refusals[0], /the claims did not match it/);

  // Those past arguing do not hear one.
  const lost = { ...a, electors: a.electors.map((e) => ({ ...e, approval: RADICAL_AT - 5 })) };
  const deaf = applySpeech(lost, speechFromOrder(order, { assembly: lost, legitimacy: 90 }));
  assert.match(deaf.refusals.find((r) => /stopped listening/.test(r)) ?? "", /only results will move them/);

  assert.equal(speechFromOrder({ id: "x", text: "Publier les comptes de l'APSA." }, { assembly: a }), null);
});

test("a scheme that runs a year and produces nothing warms the room to whoever delivers", () => {
  const a = college();
  // `createdAt` is the field normalizeIntent actually stamps. An earlier version
  // of this test invented `since`, which is the field the code was wrongly
  // reading — so the suite was green while the mechanism had never once fired
  // against a real save. Fixtures must use the shape the engine really writes.
  const out = driftFromBlunders(a, [
    { owner: "quiconque", status: "active", stage: 45, createdAt: "2029-01-01" },
    { owner: "un autre", status: "active", stage: 30, createdAt: "2029-01-01" },
    { owner: "trop récent", status: "active", stage: 30, createdAt: "2030-06-01" },
    { owner: "abouti", status: "active", stage: 100, createdAt: "2029-01-01" },
  ], { asOf: "2030-08-01", date: "2030-08-01" });
  assert.ok(out.assembly.electors.every((e) => e.approval === 2), "two stale schemes, two points");
  assert.match(out.rows[0].reason, /2 chantiers contre vous ont tourné un an sans rien produire/);
  assert.deepEqual(driftFromBlunders(a, [], { asOf: "2030-08-01" }).rows, []);
});

test("an opinion can go all the way in either direction, and the engine names where", () => {
  assert.equal(temper(80), "zealous");
  assert.equal(temper(LOYAL_AT), "loyal");
  assert.equal(temper(0), "wary");
  assert.equal(temper(-30), "hostile");
  assert.equal(temper(RADICAL_AT - 1), "radical");
  assert.equal(temper(SCHISM_AT - 1), "schismatic");

  const a = college();
  const split = { ...a, electors: a.electors.map((e, i) => ({ ...e, approval: i < 20 ? 90 : i < 40 ? -95 : 0 })) };
  const s = standing(split);
  assert.equal(s.zealous, 20);
  assert.equal(s.schismatic, 20);
  const text = describeAssembly(split);
  assert.match(text, /20 of them would follow you anywhere/);
  assert.match(text, /20 are leaving/);
});

test("the block states the roll, the count for and against, and each axis", () => {
  const text = describeAssembly(college());
  assert.match(text, /160 electors\. With you 0, undecided 160, against you 0/);
  assert.match(text, /A majority is 81; you are 81 short/);
  assert.match(text, /By doctrine: /);
  assert.match(text, /By region: /);
  assert.match(text, /By role: /);
  assert.match(ASSEMBLY_RULES, /Coalitions are computed from the question, never stored/);
  assert.equal(describeAssembly(null), "");
  assert.equal(normalizeAssembly({ electors: [] }), null);
});

// "Il faudrait une faction du pape qui peut décider si elle arrive soit à avoir
// 50 soutiens, soit à s'asseoir avec d'autres."
test("the player commands only who follows them, and needs a coalition for the rest", () => {
  const a = normalizeAssembly({
    name: "Collège",
    electors: [
      ...Array.from({ length: 38 }, () => ({ doctrine: "centrist", region: "europe", role: "curia", follows: "Saint-Siège" })),
      ...Array.from({ length: 30 }, () => ({ doctrine: "reforming", region: "americas", role: "bishops", follows: "Ordres missionnaires", approval: 25 })),
      ...Array.from({ length: 25 }, () => ({ doctrine: "traditional", region: "europe", role: "curia", follows: "Bloc doctrinal", approval: -40 })),
      ...Array.from({ length: 67 }, () => ({ doctrine: "centrist", region: "africa", role: "bishops" })),
    ],
  });
  assert.equal(a.seats, 160);
  assert.equal(ownBloc(a, "Saint-Siège").seats, 38);

  // Alone, short of fifty.
  const alone = coalition(a, { player: "Saint-Siège", need: 50 });
  assert.equal(alone.alone, 38);
  assert.equal(alone.carriesAlone, false);
  assert.equal(alone.short, 12);
  assert.equal(alone.unattached, 67, "and it says where the missing votes could come from");

  // Sitting down with a current that is well disposed carries it.
  const sat = coalition(a, { player: "Saint-Siège", need: 50, sitWith: ["Ordres missionnaires"] });
  assert.equal(sat.held, 68);
  assert.equal(sat.carries, true);
  assert.equal(sat.short, 0);
  assert.deepEqual(sat.partners.map((p) => p.name), ["Ordres missionnaires"]);

  // A current the player has turned against refuses, and says why.
  const spurned = coalition(a, { player: "Saint-Siège", need: 50, sitWith: ["Bloc doctrinal"] });
  assert.equal(spurned.held, 38, "a refusal brings nothing");
  assert.equal(spurned.carries, false);
  assert.match(spurned.refused[0].why, /against you \(-40\) and will not sit down/);

  // A current nobody in this body follows brings nothing, and says so.
  const ghost = coalition(a, { player: "Saint-Siège", need: 50, sitWith: ["Une organisation inventée"] });
  assert.match(ghost.refused[0].why, /nobody in this body follows them/);

  // A pontificate that commands fifty outright needs nobody.
  const strong = normalizeAssembly({ electors: a.electors.map((e, i) => (i < 60 ? { ...e, follows: "Saint-Siège" } : e)) });
  assert.equal(coalition(strong, { player: "Saint-Siège", need: 50 }).carriesAlone, true);
});

test("following a current is a fourth axis, and the unattached are named", () => {
  assert.ok(AXES.includes("follows"));
  const a = normalizeAssembly({
    electors: [
      { doctrine: "centrist", region: "europe", role: "curia", follows: "Saint-Siège" },
      { doctrine: "centrist", region: "europe", role: "curia" },
    ],
  });
  // The empty group is not printed as a faction called "".
  const text = describeAssembly(a);
  assert.match(text, /By follows: Saint-Siège 1/);
  assert.doesNotMatch(text, /By follows: [^\n]*\s{2}/);
  assert.match(text, /1 follow no current at all/);
});

// "Dans les électeurs qui se radicalisent, certains pourraient essayer de
// convaincre d'autres, en bien ou en mal." Opinion moved from governing, from
// speeches and from rivals' failures — never from one elector talking to the
// next, so a college could hold twenty zealots and twenty radicals for a year
// with nothing passing between them.
test("only the convinced preach, and they are heard by their own kind first", () => {
  const near = { doctrine: "traditional", region: "africa", role: "bishops", follows: "Rome" };
  const far = { doctrine: "reforming", region: "europe", role: "curia", follows: "Autre" };
  const a = normalizeAssembly({
    electors: [
      { ...near, approval: 80 },              // a zealot
      { ...near, approval: 0 },               // one of his own, undecided
      { ...far, approval: 0 },                // a stranger, undecided
      { doctrine: "traditional", region: "europe", role: "curia", follows: "Autre", approval: 0 },
    ],
  });
  const out = persuadeNeighbours(a, { date: "2030-01-01" });
  const [, sameKind, stranger, partial] = out.assembly.electors;

  assert.ok(sameKind.approval > 0, "his own are carried");
  assert.equal(stranger.approval, 0, "somebody who shares nothing hears nothing");
  assert.ok(partial.approval > 0 && partial.approval < sameKind.approval,
    `sharing one axis carries less than sharing all four: ${partial.approval} vs ${sameKind.approval}`);
  assert.ok(out.rows.length > 0 && out.rows.every((r) => AXES.includes(r.axis)));
});

test("a radical works the room the other way, and a committed listener is nearly deaf", () => {
  const kin = { doctrine: "reforming", region: "americas", role: "orders", follows: "Ordres" };
  const a = normalizeAssembly({
    electors: [
      { ...kin, approval: -70 },   // radicalised against the player
      { ...kin, approval: 0 },     // undecided, same kind
      { ...kin, approval: 55 },    // committed the other way
    ],
  });
  const out = persuadeNeighbours(a, { date: "2030-01-01" });
  const [, undecided, committed] = out.assembly.electors;

  assert.ok(undecided.approval < 0, "the undecided are pulled against the player");
  assert.ok(committed.approval > 50, "somebody already convinced the other way barely moves");
  assert.ok(Math.abs(55 - committed.approval) < Math.abs(undecided.approval),
    "conviction is a defence: the committed move less than the undecided");
});

test("nobody preaches when nobody has gone to an extreme, and no turn is a landslide", () => {
  const a = college();
  assert.deepEqual(persuadeNeighbours(a).rows, [], "a wholly undecided room argues about nothing");

  // Even a room half made of zealots moves slowly: a college is not a crowd.
  const stirred = { ...a, electors: a.electors.map((e, i) => ({ ...e, approval: i % 2 ? 90 : 0 })) };
  const out = persuadeNeighbours(stirred, { date: "2030-01-01" });
  const moved = out.assembly.electors.map((e, i) => Math.abs(e.approval - (i % 2 ? 90 : 0)));
  assert.ok(Math.max(...moved) <= PERSUASION_MAX_STEP + 1e-9,
    `no elector may be swung more than ${PERSUASION_MAX_STEP} in one turn, got ${Math.max(...moved)}`);
  assert.equal(out.assembly.seats, 160, "the roll is untouched");
});

test("affinity is the share of the four axes two electors have in common", () => {
  const base = { doctrine: "traditional", region: "africa", role: "bishops", follows: "Rome" };
  assert.equal(affinity(base, base), 1);
  assert.equal(affinity(base, { ...base, follows: "Autre" }), 0.75);
  assert.equal(affinity(base, { doctrine: "reforming", region: "europe", role: "curia", follows: "Autre" }), 0);
  assert.equal(affinity(null, base), 0);
  // An elector attached to no current does not count that as something shared.
  assert.equal(affinity({ ...base, follows: "" }, { ...base, follows: "" }), 0.75);
});
