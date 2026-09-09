/*! Open Historia — gameplaySchemas tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { validateGameplayPayload } from "./gameplaySchemas.js";

const baseSheet = () => ({
  capital: "Kinshasa", continent: "Africa", government: "Republic", leader: "X", stability: 74,
  indices: { sovereignty: 85, foodAutonomy: 50, energyAutonomy: 85, economicIndependence: 80, internalSecurity: 65, internationalReputation: 72 },
  economy: { gdp: "1B", gdpGrowth: "1%", gdpPerCapita: "100", currency: "X", inflation: "1%", unemployment: "5%", publicDebt: "0", budgetBalance: "+1" },
  gdpBreakdown: { agriculture: 35, industry: 35, services: 30 },
});

test("countryStatSheet schema: history carried forward by pinStatSheetToEngine still validates (regression: 'the stat sheet failed to validate: $.history is not allowed')", () => {
  // pinStatSheetToEngine (economyBridge.js) carries prev.history forward onto
  // a freshly-regenerated sheet, and isValidStatSheet (stats.jsx) re-checks
  // the augmented sheet against this exact schema before showing it — field
  // report: adding history to statsUpdateSchema (the polityChanges.stats
  // shape) alone was not enough, this is a SEPARATE schema for the task's
  // own output, and had no history field, so every sheet with a recorded
  // history silently failed to display.
  const withHistory = { ...baseSheet(), history: ["1965: Mobutu seizes power in a coup"] };
  const result = validateGameplayPayload("countryStatSheet", withHistory);
  assert.equal(result.valid, true, result.error);

  // Still optional: a sheet with no history at all (most generations, before
  // anything has been recorded) validates exactly as before.
  assert.equal(validateGameplayPayload("countryStatSheet", baseSheet()).valid, true);
});

// Suggested orders: some topics must set philosophies against each other, and
// a topic that names a dilemma must give each option its own stance.
const topic = (over = {}) => ({ title: "Pension fund", description: "The gap.", actions: [{ title: "Sell", text: "Sell APSA property." }, { title: "Borrow", text: "Issue a bond." }], ...over });

test("actions schema: two merely complementary topics are refused — one must force a choice", () => {
  const result = validateGameplayPayload("actions", { topics: [topic(), topic({ title: "Synod" })] });
  assert.equal(result.valid, false);
  assert.match(result.error, /genuinely different philosophies/);
});

test("actions schema: a dilemma needs a distinct stance on every option", () => {
  const contested = topic({ dilemma: "Patrimony or markets.", actions: [{ title: "Sell", text: "Sell property.", stance: "patrimonial prudence" }, { title: "Borrow", text: "Issue a bond.", stance: "market financing" }] });
  assert.equal(validateGameplayPayload("actions", { topics: [contested, topic()] }).valid, true);
  const repeated = topic({ dilemma: "Patrimony or markets.", actions: [{ title: "Sell", text: "Sell.", stance: "prudence" }, { title: "Borrow", text: "Borrow.", stance: "prudence" }] });
  assert.match(validateGameplayPayload("actions", { topics: [repeated] }).error, /distinct stance/);
  const missing = topic({ dilemma: "Patrimony or markets.", actions: [{ title: "Sell", text: "Sell.", stance: "prudence" }, { title: "Borrow", text: "Borrow." }] });
  assert.match(validateGameplayPayload("actions", { topics: [missing] }).error, /distinct stance/);
  // A single topic with no dilemma still passes: the rule asks for a choice
  // among topics, not that a lone topic be a dilemma.
  assert.equal(validateGameplayPayload("actions", { topics: [topic()] }).valid, true);
});
