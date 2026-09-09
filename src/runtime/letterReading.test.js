import test from "node:test";
import assert from "node:assert/strict";
import { CORRESPONDENCE_RULES, describeLetter, describeStanding, readLetter } from "./letterReading.js";

test("the correspondence rules are one text for every power, every path and every era", () => {
  assert.match(CORRESPONDENCE_RULES, /same rules for everyone/);
  assert.match(CORRESPONDENCE_RULES, /a state, a faction, an international body/);
  assert.match(CORRESPONDENCE_RULES, /Opposition has a perimeter/);
  assert.match(CORRESPONDENCE_RULES, /every era and every scenario/);
});
import { applyChurchPreset, HOLY_SEE } from "./churchPreset.js";

const OLD_GUARD = "Vieille garde de la Secrétairerie d'État";

test("readLetter finds the figures, the conditions and the asks, mechanically", () => {
  const r = readLetter("Vous ne m'avez pas compris alors je vais être clair : nous allons ramener +/- 30 millions par an sans lever le moindre sou des caisses directes de l'Église. Une fois cela fait, un audit de la situation sera plus que nécessaire.");
  assert.ok(r.figures.some((f) => /30 millions/.test(f)), `figures: ${r.figures}`);
  assert.ok(r.conditions.some((s) => /sans lever/.test(s)), "the 'without touching the coffers' condition is read");
  assert.ok(r.conditions.some((s) => /Une fois cela fait/.test(s)), "the sequence 'once that is done' is read");
  assert.equal(r.clarifies, true, "the sender says they were misunderstood");
  assert.equal(r.greetingOnly, false);
});

test("a greeting is a greeting, not a proposal", () => {
  const r = readLetter("Bonjour, Éminence.");
  assert.equal(r.greetingOnly, true);
  assert.match(describeLetter(r, { sender: "Saint-Siège" }), /Answer it in kind/);
  assert.doesNotMatch(describeLetter(r, { sender: "Saint-Siège" }), /Figures stated/);
});

test("describeLetter turns what was read into obligations, including the restatement when misunderstood", () => {
  const text = describeLetter(readLetter("Je vais être clair : 500 millions d'euros de capital, sans toucher au patrimoine immobilier. Acceptez-vous un audit ensuite ?"), { sender: "Saint-Siège" });
  assert.match(text, /Figures stated by Saint-Siège: .*500 millions/);
  assert.match(text, /Conditions and sequences/);
  assert.match(text, /What is asked/);
  assert.match(text, /restate in ONE sentence/);
  assert.match(text, /refuse as written, never a harsher version/);
});

test("describeStanding reads the faction from the engine and bounds its opposition to its own ground", () => {
  const world = applyChurchPreset({}, { date: "2026-09-01" });
  const text = describeStanding(world, OLD_GUARD, { player: HOLY_SEE });
  assert.match(text, new RegExp(`You are ${OLD_GUARD.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
  assert.match(text, /Led by: le cardinal Pietro Parolin/);
  assert.match(text, /Character: bureaucratic, curial, conservative/);
  assert.match(text, /The ground your aims fight on: .*curie/);
  assert.match(text, /perimeter/, "a hostile faction is told its opposition has a perimeter");
  assert.match(text, /A greeting is answered as a greeting/);
  assert.doesNotMatch(text, /Ralentir la réforme/, "a secret scheme is not listed among what is declared");
});

test("a supportive faction and an unknown polity get the matching stance, never the hostile caricature", () => {
  const world = applyChurchPreset({}, { date: "2026-09-01" });
  assert.match(describeStanding(world, "Compagnie de Jésus", { player: HOLY_SEE }), /You carry Saint-Siège's programme/);
  assert.match(describeStanding(world, "Italie", { player: HOLY_SEE }), /no standing quarrel/);
  assert.equal(describeStanding(world, "", { player: HOLY_SEE }), "");
});

test("the inaugurated name on the override outranks a leader the jump wrote on the sheet", () => {
  const world = applyChurchPreset({}, { date: "2026-09-01" });
  world.polityOverrides[HOLY_SEE] = { ...(world.polityOverrides[HOLY_SEE] ?? {}), leader: "Léon XV" };
  world.countryStats = { [HOLY_SEE]: { leader: "François", government: "Monarchie élective" } };
  assert.match(describeStanding(world, HOLY_SEE), /Led by: Léon XV — Monarchie élective/);
});
