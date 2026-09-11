import test from "node:test";
import assert from "node:assert/strict";
import { INAUGURATION_INTENT_ID, describeDeclarationReactions, inaugurate, isChurchGame, isInaugurated, markDeclarationAnswered } from "./inauguration.js";
import { HOLY_SEE } from "./churchPreset.js";
import { assessAction } from "./realityCheck.js";

const churchWorld = () => ({
  church: { faithful: 1406000000, asOf: "2026-09-01", log: [] },
  intents: [{ id: "dubia-1", owner: "Bloc des cardinaux des dubia", target: HOLY_SEE, kind: "political", summary: "x", stage: 20, secret: true, stance: "hostile", scope: ["liturgy"], status: "active" }],
  polityOverrides: { [HOLY_SEE]: { name: HOLY_SEE } },
  countryStats: { [HOLY_SEE]: { leader: "Le Souverain Pontife" } },
  startingTimelineText: "You have been elected.",
});

test("only a church game needs an inauguration, and it needs one until the pope has declared", () => {
  assert.equal(isChurchGame({ economies: {} }), false);
  assert.equal(isInaugurated({ economies: {} }), true, "a republic does not take a papal name");
  assert.equal(isChurchGame(churchWorld()), true);
  assert.equal(isInaugurated(churchWorld()), false, "elected, but silent so far");
});

test("inaugurate names the pope on the polity and the stat sheet, and turns the declaration into his standing intent", () => {
  const w = inaugurate(churchWorld(), { name: "Leo XV", declaration: "Gather the faithful of the whole world and make the Church young again." });
  assert.equal(w.polityOverrides[HOLY_SEE].leader, "Leo XV");
  assert.equal(w.countryStats[HOLY_SEE].leader, "Leo XV");
  const own = w.intents.find((it) => it.id === INAUGURATION_INTENT_ID);
  assert.ok(own, "the programme is state");
  assert.equal(own.owner, HOLY_SEE);
  assert.equal(own.secret, false, "declared before the Church, not schemed");
  assert.equal(own.stance, "supportive");
  assert.match(w.startingTimelineText, /Leo XV a été élu sur ce programme : Gather the faithful/);
  assert.equal(isInaugurated(w), true);
  assert.equal(w.intents.length, 2, "the dubia's scheme is untouched");
});

test("inaugurating twice replaces the declaration instead of stacking two", () => {
  const once = inaugurate(churchWorld(), { name: "Leo XV", declaration: "First." });
  const twice = inaugurate(once, { name: "Leo XV", declaration: "Second." });
  assert.equal(twice.intents.filter((it) => it.id === INAUGURATION_INTENT_ID).length, 1);
  assert.equal(twice.intents.find((it) => it.id === INAUGURATION_INTENT_ID).summary, "Second.");
});

test("a name and a declaration are both required", () => {
  assert.throws(() => inaugurate(churchWorld(), { name: "", declaration: "x" }), /takes a name/);
  assert.throws(() => inaugurate(churchWorld(), { name: "Leo XV", declaration: "  " }), /tells the Church/);
});

test("a declaration moves the schemes it touches and records that answers are due", () => {
  const world = {
    ...churchWorld(),
    intents: [
      { id: "dubia", owner: "Bloc des cardinaux des dubia", target: HOLY_SEE, kind: "political", summary: "x", stage: 20, secret: true, stance: "hostile", scope: ["liturgy", "doctrine"], status: "active" },
      { id: "finance", owner: "Appareil financier du Vatican", target: HOLY_SEE, kind: "economic", summary: "y", stage: 25, secret: true, stance: "hostile", scope: ["apsa", "ior", "audit"], status: "active" },
      { id: "jesuits", owner: "Compagnie de Jésus", target: HOLY_SEE, kind: "political", summary: "z", stage: 10, secret: false, stance: "supportive", scope: [], status: "active" },
    ],
  };
  const w = inaugurate(world, { name: "Leo XV", declaration: "Open the accounts of the APSA and reform the liturgy." });

  const dubia = w.intents.find((it) => it.id === "dubia");
  const finance = w.intents.find((it) => it.id === "finance");
  const jesuits = w.intents.find((it) => it.id === "jesuits");
  assert.equal(dubia.stage, 35, "the dubia heard 'liturgy' and moved");
  assert.equal(finance.stage, 40, "the finance apparatus heard 'APSA' and moved");
  assert.equal(jesuits.stage, 10, "a supportive scheme is touched but does not mobilise against him");

  assert.equal(w.inauguration.answered, false);
  assert.deepEqual(w.inauguration.reactions.map((r) => r.owner).sort(), ["Appareil financier du Vatican", "Bloc des cardinaux des dubia", "Compagnie de Jésus"]);

  const text = describeDeclarationReactions(w);
  assert.match(text, /\[Declaration — answers due this edition\]/);
  assert.match(text, /Leo XV declared before the Church/);
  assert.match(text, /Bloc des cardinaux des dubia \(hostile; touched on: liturgy\)/);
  assert.match(text, /Compagnie de Jésus \(supportive; touched on everything\)/);
  assert.match(text, /each MUST answer it in this edition/);

  const answered = markDeclarationAnswered(w);
  assert.equal(describeDeclarationReactions(answered), "", "once narrated, no longer due");
  assert.equal(markDeclarationAnswered(answered), answered, "idempotent, same object");
});

test("a scheme whose field the declaration does not touch does not move", () => {
  const world = { ...churchWorld(), intents: [{ id: "finance", owner: "Appareil financier du Vatican", target: HOLY_SEE, kind: "economic", summary: "y", stage: 25, secret: true, stance: "hostile", scope: ["apsa", "ior"], status: "active" }] };
  const w = inaugurate(world, { name: "Leo XV", declaration: "Reform the liturgy." });
  assert.equal(w.intents.find((it) => it.id === "finance").stage, 25);
  assert.deepEqual(w.inauguration.reactions, []);
  assert.match(describeDeclarationReactions(w), /No standing scheme names what was declared/);
});

test("the declaration is read by the reality check as the pope's own line, never as opposition to him", () => {
  const w = inaugurate(churchWorld(), { name: "Leo XV", declaration: "Reform the Curia and open its accounts." });
  const a = assessAction({ id: "o1", title: "Open the Curia's accounts", text: "Publish the full accounts of every dicastery." }, { playerPolity: HOLY_SEE, economy: null, world: w, jumpDays: 90 });
  const opposition = a.constraints.find((c) => c.factor === "opposition");
  assert.ok(!opposition || !/Leo XV|Saint-Siège/.test(opposition.detail), "his own programme is not counted against him");
});
