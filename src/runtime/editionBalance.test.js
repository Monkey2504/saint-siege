import test from "node:test";
import assert from "node:assert/strict";
import { MONEY_SHARE_CEILING, describeEditionBalance, frontsOf, measureEdition } from "./editionBalance.js";

const ev = (title, description, extra = {}) => ({ id: title, title, description, ...extra });

test("frontsOf reads the six fronts off the Church's own words, and money off the reality check's classifier", () => {
  assert.deepEqual(frontsOf(ev("Le Synode de Francfort officialise l'autonomie financière", "Les prélats votent la constitution d'un fonds national géré par des conseils laïcs, s'accaparant la Kirchensteuer.")).sort(), ["governance", "money", "unity"]);
  assert.deepEqual(frontsOf(ev("Canonisation à Saint-Pierre", "Cent mille pèlerins pour la messe de canonisation.")), ["liturgy"]);
  assert.deepEqual(frontsOf(ev("Ultimatum bancaire", "Les banques gèlent les comptes de la Curie devant le déficit.")).sort(), ["governance", "money"]);
  assert.deepEqual(frontsOf(ev("Récolte", "Les moissons sont faibles en Ombrie.")), []);
});

test("measureEdition counts stories, not engine lines, and reports the share money took", () => {
  const edition = [
    ev("Gel des comptes", "Les banques gèlent les lignes de crédit face au déficit."),
    ev("Emprunt Lumen bloqué", "L'appareil financier refuse l'émission des obligations."),
    ev("Ultimatum de la Bundesbank", "Un ultimatum sur les flux financiers du Saint-Siège."),
    ev("Pèlerinage jubilaire", "Deux millions de pèlerins à Rome pour le jubilé."),
    ev("Not executed", "engine lines", { kind: "engine" }),
  ];
  const m = measureEdition(edition);
  assert.equal(m.total, 4, "the engine's own event is not a story");
  assert.equal(m.counts.money, 3);
  assert.equal(m.counts.liturgy, 1);
  assert.equal(m.moneyShare, 0.75);
});

test("describeEditionBalance names the lopsidedness as a measured figure, and stays silent before any edition exists", () => {
  assert.equal(describeEditionBalance([]), "");
  const text = describeEditionBalance([
    ev("Gel des comptes", "Les banques gèlent les lignes de crédit face au déficit."),
    ev("Emprunt bloqué", "Refus d'émettre les obligations, déficit structurel."),
    ev("Ultimatum", "Un ultimatum bancaire sur le budget."),
    ev("Pèlerinage", "Des pèlerins pour la messe."),
  ]);
  assert.match(text, /\[Edition Balance — last jump, measured\]/);
  assert.match(text, /4 events/);
  assert.match(text, /Money took 75% of the edition — above the 34% ceiling/);
  assert.match(text, /at most a third of the events may be about money/);
  assert.ok(MONEY_SHARE_CEILING < 0.5, "money may lead, it may not be the paper");

  const balanced = describeEditionBalance([
    ev("Pèlerinage", "Des pèlerins pour la messe."),
    ev("Nomination", "Un nouvel évêque pour un séminaire en crise de vocations."),
    ev("Déficit", "Le budget reste en déficit."),
  ]);
  assert.match(balanced, /Money took 33% of the edition\./);
  assert.ok(!/ceiling/.test(balanced));
});
