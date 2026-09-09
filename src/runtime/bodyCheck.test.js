import test from "node:test";
import assert from "node:assert/strict";
import { BODIES_RULE, namedBodies, reconcileBodies } from "./bodyCheck.js";

const orgs = [{ name: "Catholic Church", status: "active" }, { name: "Conseil pour l'Économie", status: "active" }];

test("an institution a story acts through is found, an ordinary quotation is not", () => {
  assert.deepEqual(
    namedBodies("Le Conseil a entériné les statuts de la holding événementielle « Une Seule Église, Une Seule Solidarité »."),
    ["Une Seule Église, Une Seule Solidarité"],
  );
  assert.deepEqual(namedBodies("Le pape a déclaré : « la maison brûle »."), [], "a phrase in quotes is not a body");
  assert.deepEqual(namedBodies("Le navire « Santa Maria » a quitté le port."), [], "a named thing that is not an institution is left alone");
  assert.deepEqual(namedBodies(""), []);
});

test("the campaign's own editions are caught: bodies acted through, never founded", () => {
  const events = [
    { title: "Le Conseil pour l'Économie intègre les statuts", description: "Entérinant le décret instaurant la holding événementielle « Une Seule Église, Une Seule Solidarité », dont les comptes seront certifiés.", impacts: {} },
    { title: "Inauguration du pôle continental", description: "La holding a inauguré son pôle continental « Pax Africa » à Lagos.", impacts: {} },
  ];
  const lines = reconcileBodies(events, { organizations: orgs, polities: ["Saint-Siège"] });
  assert.equal(lines.length, 2);
  assert.match(lines[0].text, /«Une Seule Église, Une Seule Solidarité», which this world does not hold/);
  assert.match(lines[0].text, /no members, no seat, no purse and no voice/);
  assert.match(lines[1].text, /Pax Africa/);
});

test("a body the world holds, or one founded in the same event, is not flagged", () => {
  const held = [{ title: "Séance", description: "Le comité « Conseil pour l'Économie » a voté le budget.", impacts: {} }];
  assert.deepEqual(reconcileBodies(held, { organizations: orgs }), []);

  const founded = [{
    title: "Fondation",
    description: "Le pape institue la fédération « Pax Mundi », dont les statuts sont promulgués.",
    impacts: { organizationOps: [{ op: "create", name: "Pax Mundi" }] },
  }];
  assert.deepEqual(reconcileBodies(founded, { organizations: orgs }), [], "founding it in the same edition is exactly right");

  // A longer form of a body already held is the same body.
  const longer = [{ title: "Séance", description: "Le comité « Conseil pour l'Économie du Saint-Siège » a voté le budget.", impacts: {} }];
  assert.deepEqual(reconcileBodies(longer, { organizations: orgs }), []);
});

test("each missing body is named once, however many editions act through it", () => {
  const twice = [
    { title: "A", description: "La ligue « Pax Asia » a été inaugurée.", impacts: {} },
    { title: "B", description: "La ligue « Pax Asia » a certifié ses comptes.", impacts: {} },
  ];
  assert.equal(reconcileBodies(twice, { organizations: orgs }).length, 1);
});

test("the rule says what a body that exists can do, and that it holds for everyone", () => {
  assert.match(BODIES_RULE, /Found it in the very edition that first names it/);
  assert.match(BODIES_RULE, /can hold a purse, can vote, and can refuse/);
  assert.match(BODIES_RULE, /the player's creations and the world's own/);
});

// The false positive this cost: a campaign name beside the word "holding".
test("a named campaign carrying a sum is a drive, not a missing institution", () => {
  const event = {
    title: "Lancement du road-show multilatéral « Pax Mundo 2028 »",
    description: "Le Saint-Siège a lancé le road-show multilatéral de la holding « Pax Mundo 2028 », fixant une cible globale de 500 millions d'euros, sollicitant les conférences épiscopales.",
    impacts: {},
  };
  assert.deepEqual(reconcileBodies([event], { organizations: orgs }), [], "the drives ledger owns this, not the register of bodies");

  // A body founded with no sum in sight is still caught.
  const real = { title: "Institution", description: "Le pape institue la fédération « Pax Mundi », dont les statuts sont promulgués et le siège fixé à Rome.", impacts: {} };
  assert.equal(reconcileBodies([real], { organizations: orgs }).length, 1);
});
