/*! Open Historia — international organizations tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { applyEconomyChange, seedEconomy } from "./economyBridge.js";
import {
  applyOrganizationEffects, applyOrganizationOps, describeOrganizationForChat, describeOrganizations, describesOrganizationalPower, isMember, organizationTouchesPlayer,
  normalizeOrganization, normalizeOrganizations, ORGANIZATIONS_RULES, seedOrganizations, tallyResolution,
} from "./organizations.js";

const un = () => ({ name: "United Nations", kind: "political", founded: "1945-10-24", seat: "New York", votingRule: "majority", members: ["United States", "France", "Congo"] });

test("normalizeOrganization: id from the name, kind and rule validated, resolutions normalized", () => {
  const o = normalizeOrganization({ name: "North Atlantic Treaty Organization", kind: "ALLIANCE", votingRule: "weird", members: ["France", "France", " United States "], resolutions: [{ title: "Article 5", votesFor: ["France"], votesAgainst: [] }] });
  assert.equal(o.id, "north-atlantic-treaty-organization");
  assert.equal(o.kind, "alliance");
  assert.equal(o.votingRule, "majority");
  assert.deepEqual(o.members, ["France", "United States"]);
  assert.equal(o.resolutions[0].passed, true);
  assert.equal(normalizeOrganization({ kind: "trade" }), null);
  assert.deepEqual(normalizeOrganizations("junk"), []);
});

test("ops: create, join, leave, expel, update, resolve, dissolve — with the effects economies need", () => {
  let { organizations, effects } = applyOrganizationOps([], [
    { op: "create", organization: un() },
    { op: "create", organization: { name: "European Economic Community", kind: "trade", members: ["France"], votingRule: "unanimity" } },
  ], { date: "1957-03-25" });
  assert.equal(organizations.length, 2);
  assert.equal(organizations[1].founded, "1957-03-25", "founding date defaults to the event date");
  assert.deepEqual(effects, [{ type: "tradeAccess", polity: "France", delta: 1, organization: "European Economic Community" }]);

  ({ organizations, effects } = applyOrganizationOps(organizations, [
    { op: "join", organization: "european economic community", member: "Italy" },
    { op: "join", organization: "United Nations", member: "Congo" },
    { op: "expel", organization: "United Nations", member: "France" },
    { op: "update", organization: "United Nations", changes: { leader: "United States", seat: "Geneva" } },
    { op: "resolve", organization: "United Nations", resolution: { title: "Resolution 1", proposedBy: "United States", votesFor: ["United States", "Congo"], votesAgainst: [], date: "1960-07-14", sanctions: { target: "Belgium", intensity: 0.4 } } },
    { op: "resolve", organization: "United Nations", resolution: { title: "Resolution 2", proposedBy: "Congo", votesFor: ["Congo"], votesAgainst: ["United States"], passed: false } },
    { op: "leave", organization: "no such body", member: "Italy" },
  ], { date: "1960-01-01" }));
  const eec = organizations[1];
  const unNow = organizations[0];
  assert.deepEqual(eec.members, ["France", "Italy"]);
  assert.ok(!unNow.members.includes("France"));
  assert.equal(unNow.members.filter((m) => m === "Congo").length, 1, "joining twice does not duplicate");
  assert.equal(unNow.leader, "United States");
  assert.equal(unNow.seat, "Geneva");
  assert.equal(unNow.resolutions.length, 2);
  assert.equal(unNow.resolutions[0].passed, true);
  assert.equal(unNow.resolutions[1].passed, false);
  assert.deepEqual(effects, [
    { type: "tradeAccess", polity: "Italy", delta: 1, organization: "European Economic Community" },
    { type: "sanctions", polity: "Belgium", intensity: 0.4, organization: "United Nations", resolution: "Resolution 1" },
  ]);

  ({ organizations, effects } = applyOrganizationOps(organizations, [{ op: "dissolve", organization: "European Economic Community", date: "1993-11-01" }]));
  assert.equal(organizations[1].status, "dissolved");
  assert.equal(organizations[1].dissolvedAt, "1993-11-01");
  assert.equal(effects.filter((e) => e.type === "tradeAccess" && e.delta === -1).length, 2);

  // Re-founding an existing body merges rather than duplicating.
  ({ organizations } = applyOrganizationOps(organizations, [{ op: "create", organization: { name: "European Economic Community", kind: "trade", members: ["Germany"] } }]));
  assert.equal(organizations.length, 2);
  assert.equal(organizations[1].status, "active");
  assert.deepEqual(organizations[1].members, ["France", "Italy", "Germany"]);
});

test("effects reach the economies: sanctions set the target's cut trade, blocs open members", () => {
  const economies = { Belgium: seedEconomy({ year: 1960, regionShare: 0.005 }), Italy: seedEconomy({ year: 1960, regionShare: 0.01 }) };
  const next = applyOrganizationEffects(economies, [
    { type: "sanctions", polity: "Belgium", intensity: 0.4 },
    { type: "tradeAccess", polity: "Italy", delta: 1 },
    { type: "tradeAccess", polity: "Nobody", delta: 1 },
  ], { applyChange: applyEconomyChange });
  assert.equal(next.Belgium.sanctionsFaced, 0.4);
  assert.equal(next.Italy.openness, economies.Italy.openness + 5);
  assert.equal(next.Italy.marketIntegration, economies.Italy.marketIntegration + 2);
  assert.equal(Object.keys(next).length, 2);
  const lifted = applyOrganizationEffects(next, [{ type: "sanctions", polity: "Belgium", intensity: 0 }], { applyChange: applyEconomyChange });
  assert.equal(lifted.Belgium.sanctionsFaced, 0);
});

test("seedOrganizations: the bodies of the era, once, without touching what exists; universal bodies count everyone a member", () => {
  const now = seedOrganizations([], 2016);
  const names = now.map((o) => o.name);
  for (const n of ["United Nations", "International Monetary Fund", "World Trade Organization", "Interpol", "European Union", "African Union", "NATO", "Eurozone"]) assert.ok(names.includes(n), n);
  for (const n of ["League of Nations", "Warsaw Pact", "Comecon", "General Agreement on Tariffs and Trade", "Organisation of African Unity", "Hanseatic League"]) assert.ok(!names.includes(n), `not in 2016: ${n}`);
  const imf = now.find((o) => o.name === "International Monetary Fund");
  assert.equal(imf.universal, true);
  assert.equal(imf.founded, "1945-01-01");
  assert.ok(isMember(imf, "Democratic Republic of the Congo"));
  const nato = now.find((o) => o.name === "NATO");
  assert.ok(isMember(nato, "France") && !isMember(nato, "Russia"));

  const interwar = seedOrganizations([], 1939).map((o) => o.name);
  assert.ok(interwar.includes("League of Nations") && !interwar.includes("United Nations"));
  const rome = seedOrganizations([], 117).map((o) => o.name);
  assert.ok(!rome.includes("Delian League") && !rome.includes("Catholic Church"), "nothing of the era of Trajan in the catalogue");
  const medieval = seedOrganizations([], 1400).map((o) => o.name);
  assert.ok(medieval.includes("Hanseatic League") && medieval.includes("Imperial Diet of the Holy Roman Empire") && medieval.includes("Catholic Church"));

  // Idempotent, and it never overwrites a body the world already has.
  const custom = [{ name: "NATO", kind: "alliance", members: ["Atlantis"] }];
  const seeded = seedOrganizations(custom, 2016);
  assert.equal(seeded.filter((o) => o.name === "NATO").length, 1);
  assert.deepEqual(seeded.find((o) => o.name === "NATO").members, ["Atlantis"]);
  assert.equal(seedOrganizations(seeded, 2016).length, seeded.length);
  assert.deepEqual(seedOrganizations([], "junk"), []);
});

test("describeOrganizationForChat: a body speaks in its own voice, within its mandate, and knows whether the player is a member", () => {
  const [imf] = seedOrganizations([], 2016).filter((o) => o.name === "International Monetary Fund");
  const text = describeOrganizationForChat(imf, { playerPolity: "Democratic Republic of the Congo" });
  assert.match(text, /is an international body, not a state/);
  assert.match(text, /managing director/);
  assert.match(text, /conditionality/);
  assert.match(text, /Democratic Republic of the Congo is a member/);
  const [nato] = seedOrganizations([], 2016).filter((o) => o.name === "NATO");
  assert.match(describeOrganizationForChat(nato, { playerPolity: "Russia" }), /Russia is NOT a member/);
  assert.equal(describeOrganizationForChat(null), "");
});

test("describeOrganizations: one block per body, the player's membership named, the latest resolution shown", () => {
  const { organizations } = applyOrganizationOps([], [
    { op: "create", organization: un() },
    { op: "resolve", organization: "United Nations", resolution: { title: "Cease fire in Katanga", proposedBy: "Congo", votesFor: ["Congo", "France"], votesAgainst: ["United States"], date: "1961-02-21" } },
  ]);
  const text = describeOrganizations(organizations, { playerPolity: "Congo" });
  assert.match(text, /^United Nations \[political\] founded 1945-10-24, seat New York; majority\./m);
  assert.match(text, /members \(3\): .*Congo is a member/);
  assert.match(text, /latest resolution \(1961-02-21\): "Cease fire in Katanga" — PASSED \(majority: 2 for, 1 against, 0 abstained \(3 members\)\) — proposed by Congo/, "the engine's reason is shown after the title");
  assert.equal(describeOrganizations([]), "");
});

// ---- full: "relevant" — the prompt-budget rendering --------------------------------------

const bodies = () => [
  // The player is a member of this one.
  { ...un(), resolutions: [{ title: "Cease fire in Katanga", proposedBy: "Congo", date: "1961-02-21", votesFor: ["Congo"], votesAgainst: [] }] },
  // ...leads this one...
  { name: "Non-Aligned Movement", kind: "political", members: ["India", "Egypt"], leader: "Congo", charter: "Neither bloc." },
  // ...is sanctioned by this one...
  { name: "Copper Cartel", kind: "trade", members: ["Chile", "Zambia"], charter: "Price floor on copper.",
    resolutions: [{ title: "Embargo", proposedBy: "Chile", date: "1962-01-01", votesFor: ["Chile", "Zambia"], votesAgainst: [], sanctions: { target: "Congo", intensity: 0.4 } }] },
  // ...and has nothing whatever to do with this one.
  { name: "Nordic Council", kind: "political", members: ["Sweden", "Norway", "Denmark"], founded: "1952-03-16", seat: "Copenhagen",
    charter: "A long charter about inter-parliamentary co-operation between the Nordic states.",
    resolutions: [{ title: "Passport union", proposedBy: "Sweden", date: "1954-07-01", votesFor: ["Sweden", "Norway", "Denmark"], votesAgainst: [] }] },
];

test("describeOrganizations full:\"relevant\": member, leader and sanctioned bodies in full; the rest one line each", () => {
  const text = describeOrganizations(bodies(), { playerPolity: "Congo", full: "relevant" });

  // Member: full block, membership named.
  assert.match(text, /United Nations \[political\]/);
  assert.match(text, /Congo is a member/);
  assert.match(text, /latest resolution \(1961-02-21\)/);
  // Leader: full block, charter kept.
  assert.match(text, /Non-Aligned Movement \[political\].*led by Congo/);
  assert.match(text, /charter: Neither bloc\./);
  // A sanction naming the player: full block, so the player can see the sanction.
  assert.match(text, /sanctions on Congo at 40%/);

  // Everything else collapses to one line — still listed, so the model knows it
  // exists, but without its charter, seat, members or resolutions.
  assert.match(text, /^Nordic Council \(political; 3 members\)\.$/m);
  assert.ok(!text.includes("Copenhagen"));
  assert.ok(!text.includes("Passport union"));
  assert.ok(!text.includes("inter-parliamentary"));
});

test("describeOrganizations: the default is unchanged, and no player means no trimming", () => {
  const full = describeOrganizations(bodies(), { playerPolity: "Congo" });
  assert.equal(full, describeOrganizations(bodies(), { playerPolity: "Congo", full: "all" }));
  assert.match(full, /Nordic Council \[political\] founded 1952-03-16, seat Copenhagen/);
  assert.ok(full.length > describeOrganizations(bodies(), { playerPolity: "Congo", full: "relevant" }).length);
  // Nothing to be relevant TO: render everything rather than silently gutting the list.
  assert.equal(describeOrganizations(bodies(), { full: "relevant" }), describeOrganizations(bodies()));
});

test("organizationTouchesPlayer: membership, leadership, a naming resolution, a universal body", () => {
  const [unBody, nam, cartel, nordic] = bodies();
  assert.equal(organizationTouchesPlayer(unBody, "Congo"), true, "member");
  assert.equal(organizationTouchesPlayer(nam, "Congo"), true, "leader");
  assert.equal(organizationTouchesPlayer(cartel, "Congo"), true, "sanctioned");
  assert.equal(organizationTouchesPlayer(nordic, "Congo"), false, "unrelated");
  assert.equal(organizationTouchesPlayer({ ...nordic, universal: true }, "Congo"), true, "universal membership");
  assert.equal(organizationTouchesPlayer({ ...nordic, resolutions: [{ title: "On the Congo question", proposedBy: "Sweden" }] }, "Congo"), true, "named in a resolution");
  assert.equal(organizationTouchesPlayer(nordic, ""), false);
  assert.equal(organizationTouchesPlayer(null, "Congo"), false);
});

// ---- the engine counts the vote ---------------------------------------------------------

const council = (over = {}) => ({ name: "Council", kind: "security", members: ["Athens", "Sparta", "Corinth", "Thebes", "Argos"], votingRule: "majority", ...over });

test("tallyResolution: majority passes on for > against, fails on a tie; abstentions are the members left out", () => {
  const won = tallyResolution(council(), { votesFor: ["Athens", "Sparta", "Corinth"], votesAgainst: ["Thebes"] });
  assert.equal(won.passed, true);
  assert.deepEqual(won.abstained, ["Argos"]);
  assert.equal(won.rule, "majority");
  assert.equal(won.reason, "majority: 3 for, 1 against, 1 abstained (5 members)");
  const tied = tallyResolution(council(), { votesFor: ["Athens", "Sparta"], votesAgainst: ["Thebes", "Argos"], passed: true });
  assert.equal(tied.passed, false, "the model's passed:true does not carry a tie");
  assert.equal(tied.reason, "majority: 2 for, 2 against, 1 abstained (5 members)");
});

test("tallyResolution: unanimity is blocked by a single vote against; abstentions do not block, but half must vote for", () => {
  const blocked = tallyResolution(council({ votingRule: "unanimity" }), { votesFor: ["Athens", "Sparta", "Corinth", "Thebes"], votesAgainst: ["Argos"] });
  assert.equal(blocked.passed, false);
  assert.match(blocked.reason, /^unanimity: 4 for, 1 against, 0 abstained \(5 members\); blocked by Argos$/);
  const consensus = tallyResolution(council({ votingRule: "unanimity" }), { votesFor: ["Athens", "Sparta", "Corinth"], votesAgainst: [] });
  assert.equal(consensus.passed, true, "two abstentions let a consensus through");
  const thin = tallyResolution(council({ votingRule: "unanimity" }), { votesFor: ["Athens"], votesAgainst: [] });
  assert.equal(thin.passed, false, "one vote in five is not a decision of the body");
  assert.match(thin.reason, /too few votes for/);
  assert.equal(tallyResolution(council({ votingRule: "unanimity" }), { votesFor: [], votesAgainst: [] }).passed, false);
});

test("tallyResolution: under hegemon the leader's vote alone decides; without a leader it is a majority", () => {
  const league = council({ votingRule: "hegemon", leader: "athens" });
  const carried = tallyResolution(league, { votesFor: ["Athens"], votesAgainst: ["Sparta", "Corinth", "Thebes", "Argos"] });
  assert.equal(carried.passed, true, "four against cannot outvote the hegemon");
  assert.equal(carried.reason, "hegemon: leader Athens voted for; 1 for, 4 against, 0 abstained (5 members)");
  const vetoed = tallyResolution(league, { votesFor: ["Sparta", "Corinth", "Thebes", "Argos"], votesAgainst: ["Athens"] });
  assert.equal(vetoed.passed, false);
  assert.match(vetoed.reason, /leader Athens voted against/);
  const silent = tallyResolution(league, { votesFor: ["Sparta", "Corinth", "Thebes"], votesAgainst: [] });
  assert.equal(silent.passed, false, "a leader who does not vote for has not decided for");
  assert.match(silent.reason, /did not vote for/);
  const leaderless = tallyResolution(council({ votingRule: "hegemon" }), { votesFor: ["Sparta", "Corinth", "Thebes"], votesAgainst: ["Athens"] });
  assert.equal(leaderless.passed, true);
  assert.match(leaderless.reason, /^hegemon with no leader, so majority: 3 for, 1 against/);
  const foreignLeader = tallyResolution(council({ votingRule: "hegemon", leader: "Persia" }), { votesFor: ["Persia"], votesAgainst: ["Athens", "Sparta"] });
  assert.equal(foreignLeader.passed, false, "a leader who is not a member decides nothing; majority rules");
});

test("tallyResolution: weighted counts the body's weights, 1 each where none are set", () => {
  const fund = council({ votingRule: "weighted", weights: { Athens: 16.5, Sparta: 6, Corinth: 2 } });
  const quota = tallyResolution(fund, { votesFor: ["Athens"], votesAgainst: ["Sparta", "Corinth", "Thebes", "Argos"] });
  assert.equal(quota.passed, true, "16.5 outweighs 6 + 2 + 1 + 1");
  assert.equal(quota.reason, "weighted: 16.5 for vs 10 against by weight; 1 for, 4 against, 0 abstained (5 members)");
  const flat = tallyResolution(council({ votingRule: "weighted" }), { votesFor: ["Athens", "Sparta"], votesAgainst: ["Corinth", "Thebes", "Argos"] });
  assert.equal(flat.passed, false, "no weights table: one member, one vote");
  assert.match(flat.reason, /^weighted: 2 for vs 3 against by weight/);
});

test("tallyResolution: non-members are struck, names match case-insensitively to the canonical member, both sides counts against", () => {
  const t = tallyResolution(council(), { votesFor: ["athens", "ATHENS", "Persia", "Sparta"], votesAgainst: ["Sparta", "Macedon", "thebes"] });
  assert.deepEqual(t.votesFor, ["Athens"]);
  assert.deepEqual(t.votesAgainst, ["Sparta", "Thebes"], "Sparta on both lists is against; Persia and Macedon are not members");
  assert.deepEqual(t.abstained, ["Corinth", "Argos"]);
  assert.equal(t.passed, false);
  // A universal body's electorate is whoever the model listed as voting.
  const ga = tallyResolution({ name: "Assembly", universal: true, members: ["Athens"], votingRule: "majority" }, { votesFor: ["athens", "Persia", "Egypt"], votesAgainst: ["Macedon"], abstained: ["Lydia"] });
  assert.deepEqual(ga.votesFor, ["Athens", "Persia", "Egypt"]);
  assert.deepEqual(ga.abstained, ["Lydia"]);
  assert.equal(ga.passed, true);
  assert.equal(ga.reason, "majority: 3 for, 1 against, 1 abstained (5 voting)");
  assert.equal(tallyResolution(null, { votesFor: ["Athens"] }).passed, false);
});

test("resolve op: the model's passed is ignored, the stored resolution carries the engine's count and reason", () => {
  const { organizations, effects, refusals } = applyOrganizationOps([council()], [
    { op: "resolve", organization: "Council", resolution: { title: "War on Persia", proposedBy: "athens", votesFor: ["Athens", "Persia"], votesAgainst: ["Sparta", "Corinth"], passed: true, sanctions: { target: "Persia", intensity: 0.8 } } },
  ], { date: "-480-01-01" });
  assert.deepEqual(refusals, []);
  const [res] = organizations[0].resolutions;
  assert.equal(res.passed, false, "narrated as passed, but 1 for vs 2 against");
  assert.equal(res.proposedBy, "Athens", "the proposer is stored by the canonical member name");
  assert.deepEqual(res.votesFor, ["Athens"]);
  assert.deepEqual(res.votesAgainst, ["Sparta", "Corinth"]);
  assert.deepEqual(res.abstained, ["Thebes", "Argos"]);
  assert.equal(res.rule, "majority");
  assert.equal(res.reason, "majority: 1 for, 2 against, 2 abstained (5 members)");
  assert.equal(res.title, "War on Persia");
  assert.equal(res.date, "-480-01-01");
  assert.deepEqual(effects, [], "sanctions do not fire on a resolution that failed");
  // Round trip: the stored verdict and reason survive normalization.
  const again = normalizeOrganizations(organizations)[0].resolutions[0];
  assert.equal(again.passed, false);
  assert.equal(again.reason, res.reason);
});

test("resolve op: effects fire only when the tallied vote passed", () => {
  const { effects } = applyOrganizationOps([council()], [
    { op: "resolve", organization: "Council", resolution: { title: "Embargo Persia", votesFor: ["Athens", "Sparta", "Corinth"], votesAgainst: ["Thebes"], passed: false, sanctions: { target: "Persia", intensity: 0.6 } } },
    { op: "resolve", organization: "Council", resolution: { title: "Embargo Macedon", votesFor: ["Athens"], votesAgainst: ["Thebes", "Sparta"], passed: true, sanctions: { target: "Macedon", intensity: 0.6 } } },
  ]);
  assert.deepEqual(effects, [{ type: "sanctions", polity: "Persia", intensity: 0.6, organization: "Council", resolution: "Embargo Persia" }], "the model said failed but the count passed; the model said passed but the count failed");
});

test("resolve op: a dissolved body and a non-member proposer are refused, with the reason returned", () => {
  const dissolved = { ...council(), status: "dissolved", dissolvedAt: "-404-01-01" };
  const a = applyOrganizationOps([dissolved], [{ op: "resolve", organization: "Council", resolution: { title: "Late motion", votesFor: ["Athens", "Sparta"] } }]);
  assert.equal(a.organizations[0].resolutions.length, 0);
  assert.equal(a.refusals.length, 1);
  assert.equal(a.refusals[0].op, "resolve");
  assert.equal(a.refusals[0].organization, "Council");
  assert.equal(a.refusals[0].title, "Late motion");
  assert.match(a.refusals[0].reason, /dissolved \(-404-01-01\)/);

  const b = applyOrganizationOps([council()], [{ op: "resolve", organization: "Council", resolution: { title: "Persian motion", proposedBy: "Persia", votesFor: ["Athens", "Sparta", "Corinth"] } }]);
  assert.equal(b.organizations[0].resolutions.length, 0);
  assert.match(b.refusals[0].reason, /Persia is not a member of Council/);

  // A universal body takes proposals from anyone; a missing proposer is fine anywhere.
  const c = applyOrganizationOps([{ ...council(), universal: true }], [{ op: "resolve", organization: "Council", resolution: { title: "Open motion", proposedBy: "Persia", votesFor: ["Persia", "Athens"] } }]);
  assert.equal(c.organizations[0].resolutions.length, 1);
  assert.deepEqual(c.refusals, []);
  const d = applyOrganizationOps([council()], [{ op: "resolve", organization: "Council", resolution: { title: "Anonymous motion", votesFor: ["Athens", "Sparta", "Corinth"] } }]);
  assert.equal(d.organizations[0].resolutions.length, 1);
  assert.deepEqual(d.refusals, []);
});

test("weights travel through create and update ops", () => {
  let { organizations } = applyOrganizationOps([], [{ op: "create", organization: { ...council(), votingRule: "weighted", weights: { Athens: 10, Sparta: "junk", Corinth: -1 } } }]);
  assert.deepEqual(organizations[0].weights, { Athens: 10 });
  ({ organizations } = applyOrganizationOps(organizations, [{ op: "update", organization: "Council", changes: { weights: { Athens: 3, Sparta: 3 } } }]));
  assert.deepEqual(organizations[0].weights, { Athens: 3, Sparta: 3 });
});

test("describeOrganizations shows the engine's reason; the rules tell the model passed is computed", () => {
  const { organizations } = applyOrganizationOps([council({ votingRule: "unanimity" })], [
    { op: "resolve", organization: "Council", resolution: { title: "Common fleet", proposedBy: "Athens", votesFor: ["Athens", "Sparta", "Corinth", "Thebes"], votesAgainst: ["Argos"], passed: true, date: "-478-01-01" } },
  ]);
  const text = describeOrganizations(organizations);
  assert.match(text, /"Common fleet" — FAILED \(unanimity: 4 for, 1 against, 0 abstained \(5 members\); blocked by Argos\) — proposed by Athens\./);
  assert.match(ORGANIZATIONS_RULES, /passed is COMPUTED by the engine from the members' votes under the body's rule — list every member's vote; a resolution you narrate as passed is only passed if the count says so; abstentions are members you leave out\./);
  assert.ok(!ORGANIZATIONS_RULES.includes('"passed":true'), "the op template no longer invites the model to declare the verdict");
});

test("describesOrganizationalPower: a mechanical, non-LLM detector for leadership and vote language in English and French", () => {
  assert.ok(describesOrganizationalPower("Kabila is confirmed as the new president of the World Trade Organization"));
  assert.ok(describesOrganizationalPower("The Security Council votes narrowly against a resolution to expel the United States"));
  assert.ok(describesOrganizationalPower("Le Congo obtient la présidence de l'Organisation mondiale du commerce"));
  assert.ok(describesOrganizationalPower("Une motion pour expulser un membre est rejetée de justesse"));
  assert.ok(!describesOrganizationalPower("The harvest was good this year and the army marched east"));
  assert.equal(describesOrganizationalPower(""), false);
  assert.equal(describesOrganizationalPower(null), false);
});
