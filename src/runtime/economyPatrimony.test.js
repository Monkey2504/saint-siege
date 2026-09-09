/*! Open Historia — living on what one owns and what one is given: patrimony, transfers, unfunded promises © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import {
  annualRevenue, debtCeiling, economyIndicators, endowmentIncome, fiscalBalance, interestRate, netPatrimony, nonTaxRevenue,
  normalizeEconomy, stepEconomy, taxRevenue, yearsOfPatrimonyLeft,
} from "./economy.js";
import { applyEconomyChange, describeEconomy } from "./economyBridge.js";

// A small institution that taxes nobody: it lives on an estate and on gifts.
const rentier = (over = {}) => normalizeEconomy({
  population: 500, effectiveLand: 5, capital: 20_000,
  technology: 90, administrativeReach: 100, monetization: 100, marketIntegration: 100,
  financialDepth: 90, fiscalCredibility: 55, legitimacy: 70, openness: 60,
  taxRate: 0, investmentShare: 0, civilSpending: 4_000, transfers: 2_500,
  endowment: 30_000, endowmentYield: 0.05, unfundedLiabilities: 8_000, financing: "drawdown",
  monetarySystem: { backing: "none", issuer: "banks", rule: "peg", anchorInflation: 0.02, convertibility: 1 },
  ...over,
});

test("revenue = tax + patrimony yield + transfers; a zero tax rate is a real choice, not a broken state", () => {
  const e = rentier();
  assert.equal(taxRevenue(e), 0);
  assert.equal(endowmentIncome(e), 1_500);
  assert.equal(nonTaxRevenue(e), 4_000);
  assert.equal(annualRevenue(e), 4_000);
  assert.equal(netPatrimony(e), 22_000);
  const i = economyIndicators(e);
  assert.equal(i.nonTaxShare, 1);
  assert.equal(i.financing, "drawdown");
  assert.ok(i.yearsOfPatrimonyLeft > 0);
  const d = normalizeEconomy({});
  assert.equal(d.endowment, 0); assert.equal(d.transfers, 0); assert.equal(d.unfundedLiabilities, 0);
  assert.equal(nonTaxRevenue(d), 0, "an ordinary state is untouched by the new fields");
});

test("drawdown: a deficit eats the patrimony, next year's yield is smaller, and the spiral is faster than a straight division", () => {
  const e = rentier();
  const deficit = -fiscalBalance(e);
  assert.ok(deficit > 0, `deficit ${deficit}`);
  const { economy: after, flows } = stepEconomy(e, { days: 365, financing: "drawdown" });
  assert.ok(flows.drawn > 0, "the shortfall was drawn from the patrimony");
  assert.equal(flows.borrowed, 0, "nothing borrowed while patrimony remains");
  assert.ok(after.endowment < e.endowment);
  assert.equal(after.debt, 0);
  assert.ok(after.treasury >= 0);
  assert.ok(endowmentIncome(after) < endowmentIncome(e), "yield falls with the stock");
  assert.ok(after.fiscalCredibility < e.fiscalCredibility, "eating capital is read as what it is");
  const naive = e.endowment / deficit;
  assert.ok(yearsOfPatrimonyLeft(e) < naive, `spiral ${yearsOfPatrimonyLeft(e)} vs naive ${naive}`);
});

test("drawdown falls back to borrowing only once the patrimony is gone", () => {
  const { economy: after, flows } = stepEconomy(rentier({ endowment: 100, transfers: 0 }), { days: 365, financing: "drawdown" });
  assert.equal(after.endowment, 0);
  assert.equal(flows.drawn, 100);
  assert.ok(flows.borrowed > 0, "the rest is borrowed");
});

test("transfers survive cut trade (a gift arrives whatever the tariffs), tax revenue does not", () => {
  const taxed = normalizeEconomy({ ...rentier({ endowment: 0, transfers: 0 }), taxRate: 0.3, openness: 80 });
  const gifted = rentier({ endowment: 0, openness: 80 });
  const t = stepEconomy(taxed, { days: 365, sanctions: 1 }).flows;
  const g = stepEconomy(gifted, { days: 365, sanctions: 1 }).flows;
  assert.ok(t.revenue / t.years < annualRevenue(taxed), "tax revenue shrinks with output");
  assert.ok(Math.abs(g.revenue / g.years - annualRevenue(gifted)) < 1e-6, "transfers do not");
});

test("unfunded promises are priced like debt: they raise the rate and lower the ceiling", () => {
  const clean = rentier({ unfundedLiabilities: 0 });
  const promised = rentier({ unfundedLiabilities: 200_000 });
  assert.ok(interestRate(promised) > interestRate(clean));
  assert.ok(debtCeiling(promised) < debtCeiling(clean));
  const { economy: after } = stepEconomy(promised, { days: 365 });
  assert.ok(after.fiscalCredibility < stepEconomy(clean, { days: 365 }).economy.fiscalCredibility, "over-promising costs credibility year by year");
});

test("the AI's levers: transfers set or shifted, endowment and unfunded promises shifted, never set outright; drawdown is a valid financing", () => {
  const e = rentier();
  const cut = applyEconomyChange(e, { shift: { transfers: -1_000, endowment: -5_000, unfundedLiabilities: -3_000 }, set: { financing: "drawdown" } });
  assert.equal(cut.transfers, 1_500);
  assert.equal(cut.endowment, 25_000);
  assert.equal(cut.unfundedLiabilities, 5_000);
  assert.equal(cut.financing, "drawdown");
  const set = applyEconomyChange(e, { set: { transfers: 9_000, endowment: 1e9, unfundedLiabilities: 0 } });
  assert.equal(set.transfers, 9_000);
  assert.equal(set.endowment, e.endowment, "a stock cannot be rewritten by narration");
  assert.equal(set.unfundedLiabilities, e.unfundedLiabilities);
  assert.equal(normalizeEconomy({ financing: "drawdown" }).financing, "drawdown");
});

test("the briefing says where the money comes from and how long the patrimony lasts", () => {
  const text = describeEconomy("Rentier", rentier());
  assert.match(text, /revenue 4,000 \(tax 0, patrimony yield 1,500, transfers\/donations 2,500\)/);
  assert.match(text, /patrimony: 30,000 SY yielding 5\.0%; unfunded promises \(pensions, arrears\) 8,000 SY; net 22,000; deficits are paid by eating the patrimony — gone in about \d+ years/);
});
