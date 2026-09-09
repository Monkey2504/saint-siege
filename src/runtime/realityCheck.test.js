/*! Open Historia — reality check tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { annualRevenue, fiscalBalance, normalizeEconomy } from "./economy.js";
import { applyActionOutcomes, assessAction, assessPlannedActions, assessRegionTransfer, bindImpactsToVerdicts, classifyAction, describeRealityCheck, eventsForOrder } from "./realityCheck.js";
import { applyChurchPreset, HOLY_SEE } from "./churchPreset.js";
import { normalizeWorldState } from "./gameState.js";

const order = (text, over = {}) => ({ id: "a1", status: "planned", kind: "action", title: text.slice(0, 40), text, ...over });

const solid = () => normalizeEconomy({
  population: 60e6, effectiveLand: 18e6, capital: 7e9, technology: 85, administrativeReach: 95, monetization: 98, marketIntegration: 95,
  financialDepth: 90, fiscalCredibility: 80, legitimacy: 75, openness: 30, taxRate: 0.35, investmentShare: 0.2, civilSpending: 1,
  monetarySystem: { backing: "none", issuer: "banks", rule: "taylor", convertibility: 0 },
});

test("classifyAction: multilingual keyword classes, several at once, general when none", () => {
  assert.deepEqual(classifyAction("Construire une autoroute vers le port"), ["spending"]);
  assert.ok(classifyAction("Reform the Curia and appoint a lay prefect").includes("reform"));
  assert.ok(classifyAction("Reform the Curia and appoint a lay prefect").includes("personnel"));
  assert.deepEqual(classifyAction("Host a cultural festival"), ["general"]);
});

test("a solid state with a covered budget: a reform is feasible over a long jump; over a one-month jump it can only be BEGUN (time is the sole constraint)", () => {
  const a = assessAction(order("Decree a reform of the civil service"), { playerPolity: "France", economy: solid(), world: {}, jumpDays: 30 });
  assert.equal(a.verdict, "constrained", "a reform does not show results in a month");
  assert.ok(a.constraints.every((c) => c.factor === "time"), JSON.stringify(a.constraints));
  const long = assessAction(order("Decree a reform of the civil service"), { playerPolity: "France", economy: solid(), world: {}, jumpDays: 1000 });
  assert.equal(long.verdict, "feasible");
  assert.equal(long.constraints.length, 0, "a three-year jump gives a reform time to show");
});

test("a weak state: spending under a deficit, a reform beyond the state's reach, an unpopular tax — constrained, with the numbers named", () => {
  const weak = normalizeEconomy({ ...solid(), administrativeReach: 40, legitimacy: 35, civilSpending: 1e12 });
  const ctx = { playerPolity: "Ruritania", economy: weak, world: {}, jumpDays: 365 };
  const build = assessAction(order("Build a national rail network"), ctx);
  assert.equal(build.verdict, "constrained");
  assert.ok(build.constraints.some((c) => c.factor === "budget" && /short by/.test(c.detail)));
  assert.ok(build.constraints.some((c) => c.factor === "reach" && /40%/.test(c.detail)));
  const tax = assessAction(order("Raise a new land tax"), ctx);
  assert.ok(tax.constraints.some((c) => c.factor === "legitimacy" && /35\/100/.test(c.detail)));
});

test("nothing to pay with blocks a purchase; no forces blocks an attack — the only two hard walls", () => {
  const broke = normalizeEconomy({ ...solid(), treasury: 0, civilSpending: 1e12, financing: "austerity" });
  const buy = assessAction(order("Purchase new trains for the national railways"), { playerPolity: "X", economy: broke, world: {}, jumpDays: 365 });
  assert.equal(buy.verdict, "blocked");
  assert.match(buy.constraints[0].detail, /nothing to pay with/);
  const attack = assessAction(order("Invade the neighbour"), { playerPolity: "X", economy: solid(), world: { units: [] }, jumpDays: 30 });
  assert.equal(attack.verdict, "blocked");
  assert.equal(attack.constraints[0].factor, "forces");
});

test("the pope decides; what resists is the schemes already running and the time it takes, never a lost ballot in his own household", () => {
  const world = normalizeWorldState(applyChurchPreset({}, { date: "2026-09-01" }));
  const ctx = { playerPolity: HOLY_SEE, economy: world.economies[HOLY_SEE], world, jumpDays: 180 };
  const a = assessAction(order("Put a liturgical reform to the vote of the Collège des cardinaux and restructure the Curie romaine"), ctx);
  assert.equal(a.verdict, "constrained");

  // Every curial body is led by the pope under the hegemon rule, because in law
  // they act in his name (Praedicate Evangelium art. 1) and the Synod is
  // consultative. Seeding them as majorities gave the pope one vote in three and
  // lost him every initiative 2-1 — organs of his own household outranking the
  // office that appoints them.
  assert.ok(!a.constraints.some((c) => c.factor === "vote"), `no body outvotes the pope: ${JSON.stringify(a.constraints)}`);

  const opposition = a.constraints.find((c) => c.factor === "opposition");
  assert.ok(opposition, "the resistance is real, it is just not a ballot");
  assert.match(opposition.detail, /Bloc des cardinaux des dubia/, "the dubia fight liturgy");
  assert.match(opposition.detail, /Vieille garde/, "the old guard's scheme against restructuring is on the list");
  assert.match(opposition.detail, /working for you: Compagnie de Jésus/);
  assert.ok(!/Opus Dei/.test(opposition.detail), "Opus Dei has no stake in liturgy or the Curia: not against");

  const time = a.constraints.find((c) => c.factor === "time");
  assert.ok(time, "a restructuring shows results in years, not in one jump");

  const text = describeRealityCheck([a]);
  assert.match(text, /→ CONSTRAINED/);
  assert.match(text, /what would change it/);
});

test("opposition is specific: a financial audit meets only the financial apparatus, not the dubia; one early scheme is a warning, not a wall", () => {
  const world = normalizeWorldState(applyChurchPreset({}, { date: "2026-09-01" }));
  const ctx = { playerPolity: HOLY_SEE, economy: world.economies[HOLY_SEE], world, jumpDays: 400 };
  const a = assessAction(order("Order an external audit of every APSA account and publish the pension fund's books"), ctx);
  const opposition = a.constraints.find((c) => c.factor === "opposition");
  assert.ok(opposition, JSON.stringify(a.constraints));
  assert.match(opposition.detail, /Appareil financier du Vatican/);
  assert.ok(!/dubia|Opus Dei|Vieille garde/.test(opposition.detail), "nobody else has a stake in an audit");
  assert.ok(opposition.severity < 0.4, `a single scheme at 25% is a caveat, not a constraint: ${opposition.severity}`);
  const social = assessAction(order("Launch a worldwide listening campaign among the faithful"), ctx);
  assert.ok(!social.constraints.some((c) => c.factor === "opposition"), "an order nobody's scope touches has no opposition at all");
});

test("a body that decides by unanimity is scored as such (the enum is \"unanimity\", not \"unanimous\")", () => {
  const world = { organizations: [{ name: "Security Council", kind: "political", votingRule: "unanimity", members: ["X", "A", "B"] }], intents: [] };
  const a = assessAction(order("Bring the matter before the Security Council"), { playerPolity: "X", economy: solid(), world, jumpDays: 400 });
  const vote = a.constraints.find((c) => c.factor === "vote");
  assert.ok(vote, "the body is named, the player is a member: it must vote");
  assert.match(vote.detail, /unanimity vote/);
  assert.ok(vote.severity >= 0.4, `unanimity adds its own weight: ${vote.severity}`);
});

test("applyActionOutcomes: the model's outcome is capped by the verdict and the deciding constraint is kept; chats and forgotten orders keep the default", () => {
  const actions = [order("Build a rail network", { id: "a1" }), order("Invade", { id: "a2" }), order("Talk", { id: "a3", kind: "chat" }), order("Minor thing", { id: "a4" })];
  const assessments = [
    { id: "a1", verdict: "constrained", constraints: [{ factor: "budget", detail: "short by 10" }] },
    { id: "a2", verdict: "blocked", constraints: [{ factor: "forces", detail: "no forces" }] },
    { id: "a4", verdict: "feasible", constraints: [] },
  ];
  const out = applyActionOutcomes(actions, [
    { actionId: "a1", outcome: "success", reason: "everyone cheered" },
    { actionId: "a2", outcome: "partial", reason: "advanced 20 km" },
    { actionId: "a4", outcome: "success", reason: "done" },
  ], assessments);
  assert.equal(out[0].status, "partial");
  assert.match(out[0].outcomeNote, /short by 10 \(narrated: everyone cheered\)/);
  assert.equal(out[1].status, "failed");
  assert.equal(out[1].outcomeNote, "no forces (narrated: advanced 20 km)");
  assert.equal(out[2].status, "resolved", "a chat is not judged; it takes the default");
  assert.equal(out[3].status, "succeeded");
  assert.equal(out[3].outcomeNote, "done");
  assert.equal(assessPlannedActions(actions, { playerPolity: "X", economy: solid(), world: {} }).length, 3, "chats are not assessed");
});

// ---- which events are an order's (A1 linkage) ----------------------------------------------

const ev = (title, over = {}) => ({ id: `e-${title}`, title, description: "", kind: "world", playerRelated: false, impacts: { actionIds: [], actionOutcomes: [], regionTransfers: [], unitOps: [], createdChats: [] }, ...over });

test("eventsForOrder: linked by actionIds, by actionOutcomes, or by the order's title inside the player's own event — never by title alone on a world event", () => {
  const invade = { id: "a1", title: "Invade Poland" };
  const events = [
    ev("By id", { impacts: { actionIds: ["a1"], actionOutcomes: [] } }),
    ev("By outcome", { impacts: { actionIds: [], actionOutcomes: [{ actionId: "a1", outcome: "success" }] } }),
    ev("Germany moves to invade poland at dawn", { kind: "player", playerRelated: true }),
    ev("Poland braces as rumours say Berlin may Invade Poland", { kind: "world", playerRelated: false }),
    ev("Unrelated", { kind: "player", playerRelated: true, description: "A budget is passed." }),
    ev("Other order", { impacts: { actionIds: ["a2"], actionOutcomes: [{ actionId: "a2" }] } }),
  ];
  assert.deepEqual(eventsForOrder(events, invade).map((e) => e.title), ["By id", "By outcome", "Germany moves to invade poland at dawn"]);
  assert.deepEqual(eventsForOrder(events, { id: "zzz", title: "War" }), [], "a 3-letter title never matches by text");
  assert.deepEqual(eventsForOrder(events, { id: "a2", title: "Something else entirely..." }).map((e) => e.title), ["Other order"]);
  const truncated = { id: "x", title: "Germany moves to invade poland at d..." };
  assert.equal(eventsForOrder(events, truncated).length, 1, "a title cut with an ellipsis matches on its stem");
  assert.deepEqual(eventsForOrder(null, invade), []);
  assert.deepEqual(eventsForOrder(events, null), []);
});

// ---- the verdict binds the impacts (A1) -------------------------------------------------------

const t = (name, to) => ({ regionId: `${name}-id`, regionName: name, toCode: to, fromCode: "Poland", note: "" });

test("bindImpactsToVerdicts: a blocked order's event loses its transfers and unit ops (narration and chats stay); a constrained one keeps at most ONE transfer; an unrelated event keeps everything, same object", () => {
  const orders = [{ id: "a1", title: "Invade Poland" }, { id: "a2", title: "Reclaim the border strip" }];
  const assessments = [
    { id: "a1", title: "Invade Poland", verdict: "blocked", constraints: [{ factor: "forces", detail: "no forces exist on the map under this polity's command" }] },
    { id: "a2", title: "Reclaim the border strip", verdict: "constrained", constraints: [{ factor: "budget", detail: "short by 10" }] },
  ];
  const blocked = ev("Panzers roll", { playerRelated: true, kind: "player", impacts: { actionIds: ["a1"], actionOutcomes: [], regionTransfers: [t("Pomorskie", "Germany"), t("Lodzkie", "Germany")], unitOps: [{ op: "spawn", unit: { id: "u9" } }], createdChats: [{ title: "Berlin calls Warsaw" }] } });
  const constrained = ev("Border skirmish", { impacts: { actionIds: [], actionOutcomes: [{ actionId: "a2", outcome: "success" }], regionTransfers: [t("Slaskie", "Germany"), t("Opolskie", "Germany"), t("Lubuskie", "Germany")], unitOps: [{ op: "move", unitId: "u1" }] } });
  const world = ev("France takes Saar", { impacts: { actionIds: [], actionOutcomes: [], regionTransfers: [t("Saar", "France"), t("Pfalz", "France")], unitOps: [{ op: "move", unitId: "u2" }] } });
  const { events, rejections } = bindImpactsToVerdicts([blocked, constrained, world], orders, assessments);

  assert.deepEqual(events[0].impacts.regionTransfers, []);
  assert.deepEqual(events[0].impacts.unitOps, []);
  assert.equal(events[0].impacts.createdChats.length, 1, "chats are kept");
  assert.equal(events[0].title, "Panzers roll", "narration is kept");
  assert.equal(events[1].impacts.regionTransfers.length, 1);
  assert.equal(events[1].impacts.regionTransfers[0].regionName, "Slaskie", "the first listed transfer is the one kept");
  assert.equal(events[1].impacts.unitOps.length, 1, "a constrained order keeps its unit ops");
  assert.equal(events[2], world, "an unrelated event is untouched, same object");
  assert.equal(rejections.length, 3 + 2);
  assert.ok(rejections.every((r) => r.playerRelated));
  assert.match(rejections[0].text, /Order 'Invade Poland' blocked \(no forces exist.*\): region transfer of 'Pomorskie' to Germany/);
  assert.match(rejections[2].text, /unit op spawn of u9/);
  assert.match(rejections[3].text, /Order 'Reclaim the border strip' constrained.*'Opolskie' to Germany.*keeps only the first, 'Slaskie' to Germany/);
});

test("bindImpactsToVerdicts: an event tied to both a blocked and a constrained order is blocked; a feasible order strips nothing", () => {
  const orders = [{ id: "a1", title: "Invade" }, { id: "a2", title: "Skirmish" }, { id: "a3", title: "Build roads" }];
  const assessments = [
    { id: "a1", verdict: "blocked", constraints: [] },
    { id: "a2", verdict: "constrained", constraints: [] },
    { id: "a3", verdict: "feasible", constraints: [] },
  ];
  const both = ev("Both", { impacts: { actionIds: ["a2", "a1"], actionOutcomes: [], regionTransfers: [t("A", "X")], unitOps: [] } });
  const fine = ev("Roads", { impacts: { actionIds: ["a3"], actionOutcomes: [], regionTransfers: [t("B", "X"), t("C", "X")], unitOps: [] } });
  const { events, rejections } = bindImpactsToVerdicts([both, fine], orders, assessments);
  assert.deepEqual(events[0].impacts.regionTransfers, []);
  assert.equal(events[1], fine);
  assert.equal(rejections.length, 1);
  assert.match(rejections[0].text, /^Order 'Invade' blocked: region transfer/);
});

// ---- a region transfer needs a reason to exist (A4) --------------------------------------------

const transfer = (over = {}) => ({ toPolity: "Germany", regionId: "POL.11_1", regionName: "Pomorskie", losingPolity: "Poland", ...over });

test("assessRegionTransfer: allowed via a unit — strongly when the unit stands in the region or the losing side's territory, weakly when the taker merely has any unit", () => {
  const inRegion = assessRegionTransfer(transfer(), { units: [{ id: "u1", name: "3rd Army", ownerCode: "Germany", regionId: "POL.11_1" }] });
  assert.equal(inRegion.allowed, true);
  assert.match(inRegion.basis, /3rd Army.*in the region/);
  const inTerritory = assessRegionTransfer(transfer(), { units: [{ id: "u1", ownerCode: "Germany", regionId: "POL.3_1" }], losingRegionIds: ["POL.3_1", "POL.11_1"] });
  assert.match(inTerritory.basis, /in Poland's territory/);
  const weak = assessRegionTransfer(transfer(), { units: [{ id: "u1", ownerCode: "Germany", regionId: "DEU.2_1" }] });
  assert.equal(weak.allowed, true);
  assert.match(weak.basis, /weak form/);
  const spawned = assessRegionTransfer(transfer(), { units: [], spawnedOwners: new Set(["Germany"]) });
  assert.equal(spawned.allowed, true, "a unit spawned in the same payload counts as forces");
  const someoneElse = assessRegionTransfer(transfer(), { units: [{ id: "u1", ownerCode: "France", regionId: "POL.11_1" }] });
  assert.equal(someoneElse.allowed, false, "another polity's unit is no basis");
});

test("assessRegionTransfer: allowed via an active intent of the taker naming the losing side or the region, or a passed resolution the taker stood behind", () => {
  const byTarget = assessRegionTransfer(transfer(), { intents: [{ owner: "Germany", target: "Poland", kind: "military", summary: "Recover the corridor", status: "active" }] });
  assert.equal(byTarget.allowed, true);
  assert.match(byTarget.basis, /active intent "Recover the corridor" names Poland/);
  const bySummary = assessRegionTransfer(transfer(), { intents: [{ owner: "Germany", target: "", kind: "political", summary: "Bring Pomorskie back by plebiscite", status: "active" }] });
  assert.equal(bySummary.allowed, true);
  const resolved = assessRegionTransfer(transfer(), { intents: [{ owner: "Germany", target: "Poland", summary: "old", status: "resolved" }] });
  assert.equal(resolved.allowed, false, "a resolved intent is spent");
  const othersIntent = assessRegionTransfer(transfer(), { intents: [{ owner: "France", target: "Poland", summary: "x", status: "active" }] });
  assert.equal(othersIntent.allowed, false);
  const resolution = assessRegionTransfer(transfer(), { organizations: [{ name: "League of Nations", members: ["Germany", "France"], resolutions: [{ title: "Pomorskie plebiscite", text: "", proposedBy: "Germany", votesFor: ["Germany", "France"], votesAgainst: [], passed: true }] }] });
  assert.equal(resolution.allowed, true);
  assert.match(resolution.basis, /League of Nations passed "Pomorskie plebiscite"/);
  const failedVote = assessRegionTransfer(transfer(), { organizations: [{ name: "League", members: ["Germany"], resolutions: [{ title: "Pomorskie plebiscite", proposedBy: "Germany", votesFor: [], votesAgainst: ["France"], passed: false }] }] });
  assert.equal(failedVote.allowed, false);
});

test("assessRegionTransfer: allowed by the player's consent when the player is the losing side and a planned order names the region or the taker; not when the player is not the loser", () => {
  const consent = assessRegionTransfer(transfer(), { playerPolity: "Poland", plannedActions: [{ id: "a1", status: "planned", kind: "action", title: "Cede Pomorskie to Germany", text: "Sign the treaty." }] });
  assert.equal(consent.allowed, true);
  assert.match(consent.basis, /Poland's own order "Cede Pomorskie to Germany".*consent/);
  const byTaker = assessRegionTransfer(transfer(), { playerPolity: "Poland", plannedActions: [{ id: "a1", status: "planned", title: "Sell the coast to Germany", text: "" }] });
  assert.equal(byTaker.allowed, true);
  const notPlayer = assessRegionTransfer(transfer({ losingPolity: "Lithuania" }), { playerPolity: "Poland", plannedActions: [{ id: "a1", status: "planned", title: "Cede Pomorskie to Germany" }] });
  assert.equal(notPlayer.allowed, false, "consent only counts from the polity that loses the region");
  const resolvedOrder = assessRegionTransfer(transfer(), { playerPolity: "Poland", plannedActions: [{ id: "a1", status: "resolved", title: "Cede Pomorskie to Germany" }] });
  assert.equal(resolvedOrder.allowed, false, "only a PLANNED order is consent");
  const chat = assessRegionTransfer(transfer(), { playerPolity: "Poland", plannedActions: [{ id: "a1", status: "planned", kind: "chat", title: "Talk to Germany about Pomorskie" }] });
  assert.equal(chat.allowed, false, "a chat is outreach, not a cession");
});

test("assessRegionTransfer: a whole-country conquest needs forces; otherwise the transfer is refused with the reason and what would make it valid", () => {
  const conquest = assessRegionTransfer(transfer({ wholeCountry: true }), { units: [{ id: "u1", ownerCode: "Germany" }] });
  assert.equal(conquest.allowed, true);
  assert.match(conquest.basis, /whole-country conquest/);
  const bare = assessRegionTransfer(transfer({ wholeCountry: true }), { units: [], playerPolity: "Poland" });
  assert.equal(bare.allowed, false);
  assert.match(bare.reason, /region transfer of 'Pomorskie' to Germany refused: Germany has no forces, no intent and no resolution that reaches Pomorskie/);
  assert.match(bare.remedy, /a unit on the map \(in Poland's territory\), an active intent or a passed resolution naming Pomorskie or Poland, or a planned order of Poland ceding it/);
  const nobody = assessRegionTransfer(transfer({ toPolity: "" }), {});
  assert.equal(nobody.allowed, false);
  assert.match(nobody.reason, /no receiving polity/);
});

test("suing, policing and sanctioning are not military orders: only an order that commits armed force can be walled for having none", () => {
  const ctx = { playerPolity: "Holy See", economy: solid(), world: { units: [] }, jumpDays: 60 };
  const sue = assessAction(order("Mandater un cabinet d'avocats pour attaquer en justice la confiscation devant les cours européennes"), ctx);
  assert.ok(!sue.domains.includes("military"), "'attaquer en justice' is a lawsuit");
  assert.ok(!sue.constraints.some((c) => c.factor === "forces"), "a lawsuit needs no army");
  const police = assessAction(order("Activer la police vaticane pour des perquisitions ciblées"), ctx);
  assert.ok(!police.constraints.some((c) => c.factor === "forces"), "a state polices without an army");
  const strike = assessAction(order("Answer the general strike with a negotiated settlement"), ctx);
  assert.ok(!strike.constraints.some((c) => c.factor === "forces"), "a labour strike is not a military strike");
  const invasion = assessAction(order("Envahir la Bavière et y déployer trois régiments"), ctx);
  assert.ok(invasion.domains.includes("military"));
  assert.equal(invasion.constraints[0].factor, "forces", "a real invasion still needs an army");
  assert.equal(invasion.verdict, "blocked");
});

test("mobilising and deploying are only armed force when what they act on is armed", () => {
  const ctx = { playerPolity: "Holy See", economy: solid(), world: { units: [] }, jumpDays: 60 };

  // Field report: this fundraising plan came back "no forces exist on the map"
  // because its first sentence mobilised a diplomatic network.
  const fundraising = assessAction(order(
    "Mobilisation immédiate de notre réseau diplomatique et de nos cardinaux des périphéries pour approcher les grands mécènes, en échange d'obligations adossées aux revenus futurs des rassemblements",
  ), ctx);
  assert.ok(!fundraising.domains.includes("military"), "mobilising a network is not a military order");
  assert.ok(!fundraising.constraints.some((c) => c.factor === "forces"), "raising money needs no army");

  const platform = assessAction(order("Deploy a global crowdfunding platform for the faithful"), ctx);
  assert.ok(!platform.constraints.some((c) => c.factor === "forces"), "deploying a platform needs no army");

  // The same two verbs with an armed object must still be caught, including when
  // no other word in the military table appears.
  const reserves = assessAction(order("Mobilise the reserves along the northern frontier"), ctx);
  assert.ok(reserves.domains.includes("military"), "mobilising reserves is a military order");
  assert.ok(reserves.constraints.some((c) => c.factor === "forces"), "it needs an army it does not have");

  const garrison = assessAction(order("Déployer deux régiments de la garde sur la frontière"), ctx);
  assert.ok(garrison.constraints.some((c) => c.factor === "forces"));
});

// Field report: a pension reform came back BLOCKED, "no forces exist on the map
// under this polity's command", because the player had pasted the engine's own
// budget readout into the order — and that readout says the army costs nothing.
test("a budget line naming the army is an accounting label, not an order committing force", () => {
  const ctx = { playerPolity: "Holy See", economy: solid(), world: { units: [] }, jumpDays: 60 };

  const pension = assessAction(order(
    "Basculer le régime de retraite de la Curie vers la capitalisation et transférer le passif à un fonds de cantonnement. "
    + "Patrimoine 1 739 557 SY, épuisé dans ~36 ans à ce déficit\nDépenses = army 0 + civil 320k + adm 13k",
  ), ctx);
  assert.ok(!pension.domains.includes("military"), "a ledger line is not a military order");
  assert.ok(!pension.constraints.some((c) => c.factor === "forces"), "a pension reform needs no army");
  assert.notEqual(pension.verdict, "blocked", "the reform must be judged on its money, not on a budget label");

  // The exemption is narrow: a force word with a figure that really is an order
  // still counts, because its verb and object survive the strike-out.
  const raise = assessAction(order("Lever une armée de 20 000 soldats et la déployer sur la frontière"), ctx);
  assert.ok(raise.constraints.some((c) => c.factor === "forces"), "a real levy still needs an army");
});

// Removing the bogus military tag must not also remove the money test: the
// reform was meeting the deficit only because a budget label had mislabelled it
// as a military order.
test("an order about debt or a funded liability meets the budget it draws on", () => {
  // Deliberately in deficit: spending far past what the tax take can cover.
  const base = solid();
  const short = normalizeEconomy({ ...base, treasury: 500, civilSpending: annualRevenue(base) * 2, financing: "drawdown", endowment: 40_000 });
  assert.ok(fiscalBalance(short) < 0, "the fixture must actually be in deficit");
  const ctx = { playerPolity: "Holy See", economy: short, world: { units: [] }, jumpDays: 60 };

  const debt = assessAction(order("Restructurer la dette de la Curie et l'adosser à un fonds dédié"), ctx);
  assert.ok(debt.domains.includes("monetary"));
  assert.ok(debt.constraints.some((c) => c.factor === "budget"), "a debt reform draws on the same budget as anything else");

  // A tax order is not told that revenue is short: changing revenue is its point.
  const tax = assessAction(order("Relever le prélèvement sur les diocèses"), ctx);
  assert.ok(tax.domains.includes("tax"));
  assert.ok(!tax.constraints.some((c) => c.factor === "budget"), "raising revenue is not a new expense");
});
