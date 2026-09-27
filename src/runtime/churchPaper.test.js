import assert from "node:assert/strict";
import test from "node:test";

import { regardeLEglise, sansPrelatsReels, trierPourLeJournal } from "./churchPaper.js";

test("les vrais prélats deviennent leur rôle, accordé à l'article", () => {
  assert.equal(
    sansPrelatsReels("Une délégation du bloc des dubia, emmenée par le cardinal Burke, a été reçue."),
    "Une délégation du bloc des dubia, emmenée par un cardinal du bloc des dubia, a été reçue.",
  );
  assert.equal(
    sansPrelatsReels("Cette fuite contraint la Curie. Le cardinal Farrell sollicite des instructions."),
    "Cette fuite contraint la Curie. Le camerlingue sollicite des instructions.",
  );
  assert.equal(sansPrelatsReels("une note du cardinal Parolin"), "une note du secrétaire d'État");
  assert.equal(sansPrelatsReels("selon le cardinal Víctor Manuel Fernández"), "selon le préfet de la Doctrine de la Foi");
});

test("un nom court n'est remplacé que précédé d'un titre", () => {
  assert.equal(sansPrelatsReels("Sarah, une employée de l'APSA"), "Sarah, une employée de l'APSA");
  assert.equal(sansPrelatsReels("les écrits de Karl Marx"), "les écrits de Karl Marx");
  assert.equal(sansPrelatsReels("le cardinal Marx répond"), "Un cardinal allemand du Chemin synodal répond");
});

test("les affaires intérieures d'un État sans lien avec l'Église ne sont pas imprimées", () => {
  const japon = { title: "Adoption de nouvelles mesures budgétaires par la Diète à Tokyo", description: "Un plan de relance de 3 200 milliards de yens.", kind: "world", playerRelated: false };
  const kinshasa = { title: "Ouverture de l'assemblée des évêques en RDC", description: "Les séminaires locaux…", kind: "world", playerRelated: false };
  const joueur = { title: "Réforme", description: "…", kind: "player", playerRelated: true };
  assert.equal(regardeLEglise(japon), false);
  assert.equal(regardeLEglise(kinshasa), true);
  const { gardes, retires } = trierPourLeJournal([japon, kinshasa, joueur]);
  assert.equal(gardes.length, 2);
  assert.equal(retires[0].title, japon.title);
});

test("un chiffre du récit que les comptes contredisent reçoit la note du registre", async () => {
  const { noteDuRegistre } = await import("./churchPaper.js");
  const comptes = { revenue: 500e6, spending: 528e6, balance: -28e6, treasury: 10e6, endowment: 2.6e9, unfundedLiabilities: 614e6 };
  assert.equal(
    noteDuRegistre("pour atténuer le déficit structurel, évalué à 44,5 millions d'euros par an", comptes),
    "Au registre : solde de l'année en déficit de 28,0 M€.",
  );
  assert.equal(noteDuRegistre("un déficit de 29 millions d'euros", comptes), "", "un arrondi n'est pas une contradiction");
  assert.equal(noteDuRegistre("le passif du fonds de pension, estimé à 664 millions de dollars", comptes), "", "des dollars convertis");
});

test("« de » et « à » devant un nom s'accordent aussi", () => {
  assert.equal(sansPrelatsReels("l'invitation de cardinal Burke"), "l'invitation d'un cardinal du bloc des dubia");
  assert.equal(sansPrelatsReels("une lettre de Pietro Parolin"), "une lettre du secrétaire d'État");
  assert.equal(sansPrelatsReels("écrire à Kevin Farrell"), "écrire au camerlingue");
});
