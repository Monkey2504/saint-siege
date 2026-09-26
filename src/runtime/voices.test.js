/*! Open Historia — correspondent voice tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { VOICE_RULES, describeVoice, voiceFor, wantOf } from "./voices.js";

const world = () => ({
  player: "Saint-Siège",
  economies: {
    France: { transfers: 1000, endowment: 0, endowmentYield: 0, civilSpending: 900, militaryUpkeep: 50 },
    Allemagne: { transfers: 500, endowment: 0, endowmentYield: 0, civilSpending: 900, militaryUpkeep: 200 },
    Turquie: { transfers: 800, endowment: 0, endowmentYield: 0, civilSpending: 700, militaryUpkeep: 100, unfundedLiabilities: 4000 },
  },
  intents: [
    { owner: "France", target: "Saint-Siège", kind: "diplomatic", status: "active", secret: false, summary: "" },
    { owner: "Turquie", target: "Grèce", kind: "political", status: "active", secret: false, summary: "peser sur les Balkans" },
  ],
});

// "Si je parle à la France, l'Allemagne et la Turquie, elles ne doivent
// ABSOLUMENT pas avoir ni la même intention, ni la même façon de parler, ni les
// mêmes tics de discussion."
test("three correspondents share nothing: not the want, not the register, not the habit", () => {
  const w = world();
  const of = (n) => voiceFor(n, { intents: w.intents, economies: w.economies, player: w.player });
  const [fr, de, tr] = [of("France"), of("Allemagne"), of("Turquie")];

  // Every one of the four dimensions differs across the three.
  for (const field of ["want", "register", "tic", "refusal"]) {
    const values = new Set([fr[field], de[field], tr[field]]);
    assert.equal(values.size, 3, `all three share too much on "${field}": ${[...values].join(" | ")}`);
  }

  // And the wants are the ones the world actually justifies, not decoration.
  assert.match(fr.want, /openly working against Saint-Siège/, "France carries an open scheme against the player");
  assert.match(de.want, /short of money/, "Germany spends past its revenue");
  assert.match(tr.want, /peser sur les Balkans/, "Turkey is pursuing its own scheme elsewhere");
});

test("a voice is the same in April as it was in March", () => {
  const w = world();
  const once = voiceFor("France", { intents: w.intents, economies: w.economies, player: w.player });
  const twice = voiceFor("France", { intents: w.intents, economies: w.economies, player: w.player });
  assert.deepEqual(once, twice, "a correspondent who changes manner between letters is a different person each time");

  // The manner survives even when the situation moves; only the want follows it.
  const later = voiceFor("France", { intents: [], economies: w.economies, player: w.player });
  assert.equal(later.register, once.register);
  assert.equal(later.tic, once.tic);
  assert.notEqual(later.want, once.want, "the want follows the world, the manner does not");
});

test("what a correspondent wants is computed, never invented", () => {
  const w = world();
  // A secret scheme against the player reads differently from an open one.
  const secret = wantOf("France", {
    intents: [{ owner: "France", target: "Saint-Siège", kind: "espionage", status: "active", secret: true }],
    economies: w.economies, player: w.player,
  });
  assert.match(secret, /will not admit to/);
  assert.match(secret, /espionage/);

  // A polity that owes more than it set aside is defensive about its books.
  assert.match(wantOf("Turquie", { intents: [], economies: w.economies, player: w.player }), /owes more than it has set aside/);

  // A resolved scheme is not a want: only active ones count.
  const done = wantOf("France", {
    intents: [{ owner: "France", target: "Saint-Siège", kind: "diplomatic", status: "resolved" }],
    economies: {}, player: w.player,
  });
  assert.match(done, /wants standing/, "with nothing pressing, a polity wants to be treated as an equal");
});

test("the block tells the model it is a person and not a diplomatic average", () => {
  const w = world();
  const text = describeVoice(voiceFor("France", { intents: w.intents, economies: w.economies, player: w.player }));
  assert.match(text, /\[You Are France, and You Sound Like Nobody Else\]/);
  assert.match(text, /What you want:/);
  assert.match(text, /Your habit, and it must appear:/);
  assert.match(text, /Your red line:/);
  assert.match(text, /recognise a fourth without seeing the name on it/);
  assert.equal(describeVoice(null), "");
  assert.equal(voiceFor("", {}), null);

  assert.match(VOICE_RULES, /Two different polities must never read alike/);
  assert.match(VOICE_RULES, /Do not invent a want that the figures do not support/);
});

test("a scenario's own tags outrank the drawn manner", () => {
  const holy = voiceFor("Saint-Siège", { tags: ["theocratic"], player: "France" });
  const street = voiceFor("Commune", { tags: ["revolutionary"], player: "France" });
  assert.equal(holy.formality, "high");
  assert.equal(street.formality, "low");
  assert.equal(voiceFor("Belgique", { tags: [], player: "France" }).formality, "normal");
});

// « Ces devenu n'importe quoi les reponse. » Antigua-et-Barbuda chiffrait un
// bonjour à « deux points de base sur nos fonds de réserve ». Les chiffres
// bornent ce qu'une lettre peut affirmer ; ils ne sont pas un quota par lettre.
test("les règles de voix interdisent de chiffrer une politesse", () => {
  assert.match(VOICE_RULES, /not a quota of figures/, "les chiffres bornent, ils n'obligent pas");
  assert.match(VOICE_RULES, /Never price courtesy/, "un bonjour ne se chiffre pas");
  assert.match(VOICE_RULES, /no proposal, do not invent one/, "on n'invente pas la proposition à laquelle réagir");
});
