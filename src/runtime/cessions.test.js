import assert from "node:assert/strict";
import test from "node:test";

import { cessionsAEncaisser, encaisserLesCessions, prixDeCession } from "./cessions.js";
import { EUR_USD_2024 } from "./money.js";

test("le prix d'une vente se lit dans l'ordre, en euros, en millions ou en milliards", () => {
  assert.equal(prixDeCession("Vendre l'immeuble de rapport de l'APSA à Milan pour 30 millions d'euros."), 30e6 * EUR_USD_2024);
  assert.equal(prixDeCession("Céder la participation pour 1,2 milliard d'euros"), 1.2e9 * EUR_USD_2024);
  assert.equal(prixDeCession("Mettre en vente trois appartements à Rome, 12 M€"), 12e6 * EUR_USD_2024);
  assert.equal(prixDeCession("Vendre l'immeuble de Londres pour 50 millions de dollars"), 50e6, "des dollars restent des dollars");
  assert.equal(prixDeCession("Vendre l'immeuble de Milan"), 0, "sans prix, rien n'entre");
  assert.equal(prixDeCession("Financer 30 millions d'euros de bourses"), 0, "pas de vente, pas de cession");
  assert.equal(prixDeCession("Vendre la chapelle Sixtine pour 5 milliards d'euros"), 0, "l'inaliénable ne s'encaisse jamais");
});

test("exécutée en entier : encaissée ce tour ; engagée : à l'échéance, une seule fois", () => {
  const vente = (id, extra) => ({ id, kind: "action", title: `Vendre l'immeuble ${id} pour 10 millions d'euros`, text: "", ...extra });
  const ordres = [
    vente("a", { outcome: "success", judgedOn: "2026-10-01" }),
    vente("b", { outcome: "partial", judgedOn: "2026-10-01", enCours: true, echeance: "2027-04-01" }),
    vente("c", { outcome: "partial", judgedOn: "2026-10-01" }),
    vente("d", { outcome: "failure", judgedOn: "2026-10-01" }),
  ];
  assert.deepEqual(cessionsAEncaisser(ordres, "2026-10-01").ids, ["a"]);
  const plusTard = ordres.map((o) => (o.id === "a" ? { ...o, cessionEncaissee: true } : o));
  assert.deepEqual(cessionsAEncaisser(plusTard, "2027-04-01").ids, ["b"]);
  const deuxFois = plusTard.map((o) => (o.id === "b" ? { ...o, cessionEncaissee: true } : o));
  assert.deepEqual(cessionsAEncaisser(deuxFois, "2027-05-01").ids, []);
});

test("une vente fait passer le prix du patrimoine à la caisse, jamais plus que le patrimoine", () => {
  const eco = { usdPerSY: 10000, treasury: 100, endowment: 5000 };
  const ordre = { id: "m", title: "Vendre l'immeuble de Milan pour 30 millions d'euros" };
  const dollars = prixDeCession(ordre.title);
  const { eco: apres, lignes } = encaisserLesCessions(eco, [{ ordre, dollars }], { date: "2026-10-01", polity: "Saint-Siège" });
  const sy = dollars / 10000;
  assert.ok(Math.abs(apres.treasury - (100 + sy)) < 1e-9);
  assert.ok(Math.abs(apres.endowment - (5000 - sy)) < 1e-9);
  assert.equal(lignes.length, 2);
  assert.equal(lignes[0].kind, "money");
  assert.equal(lignes[1].kind, "patrimony");
  const pauvre = encaisserLesCessions({ usdPerSY: 10000, treasury: 0, endowment: 100 }, [{ ordre, dollars }], { date: "d", polity: "p" });
  assert.equal(pauvre.eco.endowment, 0);
  assert.equal(pauvre.eco.treasury, 100);
});
