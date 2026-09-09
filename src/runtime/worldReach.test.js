import test from "node:test";
import assert from "node:assert/strict";
import {
  bindWorldImpacts,
  describeActorReach,
  resolveEventActor,
  assessWorldEvent,
} from "./worldReach.js";

const transferEvent = (over = {}) => ({
  id: "ev1",
  title: "Ultimatum bancaire européen",
  description:
    "Les principales institutions bancaires européennes, coordonnées par la Bundesbank, gèlent les comptes de réserve du Saint-Siège.",
  impacts: {
    regionTransfers: [
      { regionId: "reg_a", regionName: "Latium", fromCode: "Holy See", toCode: "Germany" },
      { regionId: "reg_b", regionName: "Umbria", fromCode: "Holy See", toCode: "Germany" },
    ],
    unitOps: [],
  },
  ...over,
});

// A faction that has said, in its own schemes, exactly what it is about.
const schismatics = {
  id: "german-church",
  ownerType: "faction",
  owner: "Église d'Allemagne",
  target: "Holy See",
  kind: "political",
  summary: "Retenir le produit de la Kirchensteuer",
  stage: 60,
  secret: false,
  stance: "hostile",
  scope: ["kirchensteuer", "synode", "liturgie"],
  status: "active",
};

test("resolveEventActor: the explicit actor, else who changes, else who takes", () => {
  assert.equal(resolveEventActor({ actor: "France" }), "France");
  assert.equal(resolveEventActor({ impacts: { polityChanges: [{ code: "Germany" }] } }), "Germany");
  assert.equal(resolveEventActor(transferEvent()), "Germany");
  assert.equal(resolveEventActor({ title: "Une mauvaise récolte" }), "", "ambience has no actor");
});

test("a faction cannot act outside the remit its own schemes declare", () => {
  const world = { intents: [schismatics], economies: {}, organizations: [], units: [] };
  const event = transferEvent({ actor: "Église d'Allemagne" });

  const assessment = assessWorldEvent(event, { player: "Holy See", world, jumpDays: 60 });
  assert.equal(assessment.actor, "Église d'Allemagne");
  const remit = assessment.constraints.find((c) => c.factor === "remit");
  assert.ok(remit, "freezing sovereign accounts is not liturgy, a synod or the church tax");
  assert.equal(assessment.verdict, "constrained");

  // Inside its declared remit the same faction is not walled.
  const inRemit = assessWorldEvent(
    transferEvent({ actor: "Église d'Allemagne", description: "Le synode retient le produit de la Kirchensteuer." }),
    { player: "Holy See", world, jumpDays: 60 },
  );
  assert.ok(!inRemit.constraints.some((c) => c.factor === "remit"), "the synod and the church tax are its own business");
});

test("a body that has passed no resolution has decided nothing, and its map changes are dropped", () => {
  const world = {
    intents: [],
    economies: {},
    units: [],
    organizations: [{ name: "NATO", members: ["Germany", "France", "Italy"], votingRule: "unanimity", resolutions: [] }],
  };
  const event = transferEvent({ actor: "NATO" });

  const assessment = assessWorldEvent(event, { player: "Holy See", world, jumpDays: 60 });
  const mandate = assessment.constraints.find((c) => c.factor === "mandate");
  assert.ok(mandate, "an alliance acts by resolution");
  assert.equal(assessment.verdict, "blocked");

  const bound = bindWorldImpacts([event], { player: "Holy See", world, jumpDays: 60 });
  assert.deepEqual(bound.events[0].impacts.regionTransfers, [], "the map does not move");
  assert.equal(bound.events[0].title, event.title, "the narration stays: the player must read what was claimed");
  assert.equal(bound.rejections.length, 2);
  assert.match(bound.rejections[0].text, /NATO blocked \(NATO has passed no resolution/);

  // With a resolution carried, the same body acts.
  const voted = {
    ...world,
    organizations: [{ ...world.organizations[0], resolutions: [{ title: "Freeze", passed: true, votesFor: ["Germany", "France", "Italy"], votesAgainst: [] }] }],
  };
  const after = assessWorldEvent(event, { player: "Holy See", world: voted, jumpDays: 60 });
  assert.ok(!after.constraints.some((c) => c.factor === "mandate"));
});

test("the player's own events are left to the player's own verdicts, and ambience is never touched", () => {
  const world = { intents: [schismatics], economies: {}, organizations: [], units: [] };

  const playerEvent = transferEvent({ actor: "Église d'Allemagne", playerRelated: true });
  const boundPlayer = bindWorldImpacts([playerEvent], { player: "Holy See", world, jumpDays: 60 });
  assert.equal(boundPlayer.events[0], playerEvent, "same object: bound upstream, not here");
  assert.equal(boundPlayer.rejections.length, 0);

  const mood = { id: "ev2", title: "Mauvaise récolte", description: "Les moissons sont faibles.", impacts: {} };
  const boundMood = bindWorldImpacts([mood], { player: "Holy See", world, jumpDays: 60 });
  assert.equal(boundMood.events[0], mood, "a mood needs no mandate");
});

test("a constrained world actor reaches one region, not a front", () => {
  const world = { intents: [schismatics], economies: {}, organizations: [], units: [] };
  const bound = bindWorldImpacts([transferEvent({ actor: "Église d'Allemagne" })], { player: "Holy See", world, jumpDays: 60 });
  assert.equal(bound.events[0].impacts.regionTransfers.length, 1);
  assert.equal(bound.events[0].impacts.regionTransfers[0].regionName, "Latium");
  assert.match(bound.rejections[0].text, /reaches one region, not a front/);
});

test("describeActorReach lists what each power actually holds, and never the player", () => {
  const world = {
    economies: { "Holy See": { population: 500 }, Germany: { population: 83000000 } },
    intents: [schismatics],
    organizations: [{ name: "NATO", members: ["Germany"], votingRule: "unanimity", resolutions: [] }],
    units: [{ owner: "Germany", id: "u1" }],
  };
  const text = describeActorReach(world, { player: "Holy See" });
  assert.ok(!text.includes("Holy See"), "the player is described elsewhere");
  assert.match(text, /Germany: has an economy the engine tracks; has forces on the map; sits in NATO/);
  assert.match(text, /Église d'Allemagne: no economy of its own; no forces on the map; sits in no body; declared aims: kirchensteuer, synode, liturgie/);
});

test("a map change nobody made is stripped: the rule given to the model is enforced, not just stated", () => {
  const world = { intents: [], economies: {}, organizations: [], units: [] };
  // No actor, no polity change, no transfer to name a taker — only a unit op.
  const orphan = {
    id: "ev-orphan",
    title: "Un régiment apparaît",
    description: "Sans que personne ne l'ait levé.",
    impacts: { regionTransfers: [], unitOps: [{ op: "spawn", unit: { id: "u9", name: "Ghost" } }] },
  };
  const bound = bindWorldImpacts([orphan], { player: "Holy See", world, jumpDays: 60 });
  assert.deepEqual(bound.events[0].impacts.unitOps, [], "the unit never existed");
  assert.equal(bound.events[0].title, orphan.title, "the narration stays");
  assert.match(bound.rejections[0].text, /Unattributed \(no acting power/);
});
