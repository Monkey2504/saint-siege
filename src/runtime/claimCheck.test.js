import test from "node:test";
import assert from "node:assert/strict";
import { LEDGER_HONESTY_RULE, checkLedgerClaims, describeLedgerCorrections } from "./claimCheck.js";

// The real figures from the campaign this was written for.
const holySee = {
  revenue: 335266, spending: 353907, balance: -18641,
  treasury: 10124, endowment: 1741374, unfundedLiabilities: 411339,
};

test("the exact answer that started this is caught: one true figure kept, the other invented", () => {
  const reply = [
    "Dépenses annuelles : 300 000 SY/an (réduites de 320 000 SY à 300 000 SY/an).",
    "Revenus annuels du budget ordinaire : 335 266 SY/an.",
    "Solde budgétaire net : +35 266 SY/an (le déficit initial de -18 641 SY/an est intégralement résorbé).",
  ].join("\n");
  const lines = checkLedgerClaims(reply, holySee);
  assert.ok(lines.some((l) => /deficit is closed/.test(l)), `no surplus claim caught: ${lines}`);
  assert.ok(lines.some((l) => /annual spending as 300,000/.test(l)), `spending not caught: ${lines}`);
  // The revenue figure it got right is not flagged.
  assert.ok(!lines.some((l) => /annual revenue/.test(l)), `a correct figure was flagged: ${lines}`);
});

test("an honest answer is not corrected", () => {
  const reply = "Les dépenses atteignent 353 907 SY par an contre 335 266 SY de recettes : le déficit reste de 18 641 SY, payé sur le patrimoine.";
  assert.deepEqual(checkLedgerClaims(reply, holySee), []);
});

test("a figure about something else is left alone, and rounding is not a lie", () => {
  assert.deepEqual(checkLedgerClaims("La holding rapporterait 30 millions d'euros par an.", holySee), []);
  assert.deepEqual(checkLedgerClaims("Le patrimoine est d'environ 1,74 million de SY.", holySee), [], "a rounding of the true figure passes");
  assert.deepEqual(checkLedgerClaims("Nous comptons 1,4 milliard de fidèles.", holySee), []);
});

test("cash in hand and the pension hole are checked like the rest", () => {
  assert.ok(checkLedgerClaims("Nous avons 80 000 SY en caisse.", holySee).some((l) => /cash in hand as 80,000/.test(l)));
  assert.ok(checkLedgerClaims("Les retraites non financées sont tombées à 200 000 SY.", holySee).some((l) => /unfunded promises as 200,000/.test(l)));
});

test("the correction is shown to the player, and says which side is right", () => {
  const text = describeLedgerCorrections(["It says the deficit is closed. The engine shows a deficit of 18,641 SY a year, still eating the patrimony."]);
  assert.match(text, /Checked against the ledger/);
  assert.match(text, /the figures are right/);
  assert.equal(describeLedgerCorrections([]), "");
});

test("the standing rule tells the model the check exists, and that money lives in the ledger", () => {
  assert.match(LEDGER_HONESTY_RULE, /figures are not yours to choose/);
  assert.match(LEDGER_HONESTY_RULE, /not in the treasury until the ledger says it is/);
  assert.match(LEDGER_HONESTY_RULE, /prints the correction under your answer/);
});

test("nothing is claimed when there are no indicators or no text", () => {
  assert.deepEqual(checkLedgerClaims("Solde +35 266 SY.", null), []);
  assert.deepEqual(checkLedgerClaims("", holySee), []);
});
