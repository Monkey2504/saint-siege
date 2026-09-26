import test from "node:test";
import assert from "node:assert/strict";
import { DONS_PAR_FIDELE_EUR, HOLY_SEE_ACCOUNTS_2024, transfersForChurchEur } from "./churchPreset.js";
import { FAITHFUL_2023, applyFaithfulOps, normalizeChurch, stepFaithful, totalFaithful } from "./churchFaithful.js";

// « On commence avec le bon nombre de fidèles pour bien financer l'Église, mais
// en fonction de ce que l'on dit ou fait cela doit avoir une influence. Une
// phrase comme "je veux être super riche" dite par le pape doit vider l'Église
// et les finances. »
//
// La chaîne existait sur trois maillons et cassait au quatrième :
//   ce que le pape dit → légitimité → fidèles → [ROMPU] dons → budget
// `transfers` était posé une fois au préréglage et ne bougeait plus. L'Église
// pouvait perdre cent millions de baptisés sans qu'un euro manque aux comptes.

const eglise = (faithful) => normalizeChurch({ faithful, asOf: "2026-09-01", log: [] });

test("les dons du Saint-Siège sont ceux de 2024 quand l'Église est celle de 2024", () => {
  const A = HOLY_SEE_ACCOUNTS_2024;
  const attendu = A.donationsEur + A.governorateEur + A.commercialEur;
  assert.ok(Math.abs(transfersForChurchEur(eglise(FAITHFUL_2023)) - attendu) < 1,
    `${transfersForChurchEur(eglise(FAITHFUL_2023))} ≠ ${attendu}`);
});

test("un baptisé donne seize centimes par an, et c'est le vrai chiffre", () => {
  // 237 M€ de dons pour 1,406 milliard de fidèles.
  assert.ok(DONS_PAR_FIDELE_EUR > 0.16 && DONS_PAR_FIDELE_EUR < 0.18, `${DONS_PAR_FIDELE_EUR} €/fidèle`);
});

test("une Église qui se vide emporte les dons avec elle", () => {
  const plein = transfersForChurchEur(eglise(FAITHFUL_2023));
  const ampute = Object.fromEntries(Object.entries(FAITHFUL_2023).map(([c, n]) => [c, Math.round(n * 0.8)]));
  const apres = transfersForChurchEur(eglise(ampute));
  assert.ok(apres < plein, "les dons doivent suivre les fidèles");
  // Un cinquième des fidèles en moins, c'est un cinquième des DONS en moins —
  // mais pas un cinquième des transferts : le Gouvernorat et les revenus
  // propres viennent de visiteurs et de locataires, pas de baptisés.
  const donsPerdus = HOLY_SEE_ACCOUNTS_2024.donationsEur * 0.2;
  assert.ok(Math.abs((plein - apres) - donsPerdus) < 1e6, `perdu ${Math.round((plein - apres) / 1e6)} M€, attendu ${Math.round(donsPerdus / 1e6)} M€`);
});

test("un pape dont la légitimité s'effondre voit les fidèles partir, donc les dons", () => {
  const depart = eglise(FAITHFUL_2023);
  // Le même temps, à deux standings. 25/100 est un pontificat en crise ;
  // 75/100 un pontificat respecté.
  const effondre = stepFaithful(depart, { years: 5, legitimacy: 25, date: "2031-09-01" });
  const respecte = stepFaithful(depart, { years: 5, legitimacy: 75, date: "2031-09-01" });

  assert.ok(totalFaithful(effondre.faithful) < totalFaithful(respecte.faithful),
    "le standing doit séparer les deux trajectoires");
  assert.ok(transfersForChurchEur(effondre) < transfersForChurchEur(respecte),
    `dons : effondré ${Math.round(transfersForChurchEur(effondre) / 1e6)} M€, respecté ${Math.round(transfersForChurchEur(respecte) / 1e6)} M€`);
});

test("un exode enregistré par le modèle se lit aussi dans la caisse", () => {
  const avant = eglise(FAITHFUL_2023);
  // Ce que le modèle émet après un scandale : des gens qui partent, pour de
  // bon, plafonnés à un cinquième d'un continent (churchFaithful.js).
  const apres = applyFaithfulOps(avant, [
    { op: "shift", continent: "europe", share: -0.2, note: "Après la déclaration du pape sur la richesse" },
  ], { date: "2027-03-01" });

  const perdus = totalFaithful(avant.faithful) - totalFaithful(apres.faithful);
  assert.ok(perdus > 50e6, `${Math.round(perdus / 1e6)} M de fidèles partis`);
  const manque = transfersForChurchEur(avant) - transfersForChurchEur(apres);
  assert.ok(manque > 8e6, `il manque ${Math.round(manque / 1e6)} M€ aux comptes`);
});
