/*! Open Historia — reforming-pope preset tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { annualRevenue, annualSpending, economyIndicators, fiscalBalance, normalizeEconomy, stepEconomy, taxRevenue } from "./economy.js";
import { CATHOLIC_MAJORITY_COUNTRIES, CHURCH_FACTIONS, CHURCH_FACTION_TAG, EUR_USD_2024, HOLY_SEE, VATICAN_REGION_ID, applyChurchPreset, churchBodies, holySeeEconomy, holySeeRecurringRevenueEur } from "./churchPreset.js";
import { intentsNeedOtherPowers } from "./intents.js";
import { isPolityLandless, normalizeWorldState } from "./gameState.js";
import { normalizeExtraRegions } from "./extraRegions.js";
import { totalFaithful } from "./churchFaithful.js";

test("Holy See economy IS the real 2024 core account: no tax, ~500 residents, patrimony + donations, ~-28 M EUR recurring, pension unfunded, deficits drawn on the patrimony", () => {
  const e = normalizeEconomy(holySeeEconomy());
  const eur = (sy) => (sy * e.usdPerSY) / EUR_USD_2024;
  assert.equal(e.taxRate, 0, "the State taxes nobody");
  assert.equal(taxRevenue(e), 0);
  assert.equal(e.population, 500);
  assert.equal(e.debt, 0, "no sovereign bonds");
  assert.equal(e.financing, "drawdown");
  const revenue = eur(annualRevenue(e));
  const spending = eur(annualSpending(e));
  assert.ok(Math.abs(revenue - holySeeRecurringRevenueEur()) < 1e6, `recurring revenue ${revenue} should be the published 500.0 M`);
  assert.ok(Math.abs(spending - 527.8e6) < 1e6, `spending ${spending} should be the published 527.8 M`);
  assert.ok(Math.abs(eur(fiscalBalance(e)) + 27.8e6) < 1e6, `recurring balance ${eur(fiscalBalance(e))}`);
  assert.ok(Math.abs(eur(e.endowment) - 2_597e6) < 1e6, "APSA net patrimony");
  assert.ok(Math.abs(e.endowmentYield - 0.0512) < 0.001, "real estate + recurring financial income over the patrimony");
  assert.ok(Math.abs(e.unfundedLiabilities * e.usdPerSY - 664e6) < 1e6, "the Farrell pension hole, in dollars as published");
  assert.ok(Math.abs(eur(e.transfers) - 367e6) < 1e6, "donations + Governorate + commercial sales arrive without taxing anyone");
  const i = economyIndicators(e);
  assert.equal(i.nonTaxShare, 1);
  assert.ok(i.yearsOfPatrimonyLeft > 30 && i.yearsOfPatrimonyLeft < 80, `at −28 M a year on 2.6 B the clock reads decades, not centuries: ${i.yearsOfPatrimonyLeft}`);
  assert.equal(e.monetarySystem.rule, "peg", "the euro: no monetary policy of its own");
  // One year on: the one-off in hand covers 2025, then the patrimony pays.
  const y1 = stepEconomy(e, { days: 365, financing: "drawdown" });
  assert.equal(y1.flows.borrowed, 0);
  const y2 = stepEconomy(y1.economy, { days: 365, financing: "drawdown" });
  assert.ok(y2.flows.drawn > 0, "the second year eats patrimony");
  assert.ok(y2.economy.endowment < e.endowment);
});

test("applyChurchPreset: the Holy See, six real factions, six real bodies, seeded intents owned by the counter-powers — and idempotent", () => {
  const once = applyChurchPreset({ organizations: [{ name: "Catholic Church", kind: "religious", members: ["Italy"], votingRule: "hegemon" }, { name: "United Nations", kind: "political", members: ["Italy", "Brazil"], votingRule: "majority" }] }, { date: "2026-09-01", availableCountries: ["Italy", "Brazil", "Poland", "Nowhere"] });
  const twice = applyChurchPreset(once, { date: "2026-09-01", availableCountries: ["Italy", "Brazil", "Poland", "Nowhere"] });

  assert.equal(CHURCH_FACTIONS.length, 6);
  for (const f of CHURCH_FACTIONS) {
    assert.ok(once.polityOverrides[f.name], `${f.name} exists as a polity`);
    assert.ok(once.countryTags[f.name].includes(CHURCH_FACTION_TAG), `${f.name} is tagged as a Church faction`);
    assert.ok(once.countryStats[f.name].history.length > 0, `${f.name} carries its real history`);
  }
  assert.ok(once.polityOverrides[HOLY_SEE]);
  assert.ok(once.economies[HOLY_SEE], "the Holy See has an engine economy");
  assert.equal(Object.keys(once.economies).length, 1, "factions have no economy of their own");

  const bodies = churchBodies().map((b) => b.name);
  assert.equal(bodies.length, 6);
  const church = once.organizations.find((o) => o.name === "Catholic Church");
  assert.equal(church.leader, HOLY_SEE);
  assert.deepEqual([...church.members.filter((m) => m !== HOLY_SEE)].sort(), ["Brazil", "Italy", "Poland"], "membership only names countries the map has");
  assert.ok(once.organizations.some((o) => o.name === "United Nations"), "existing bodies are kept");
  assert.equal(once.organizations.filter((o) => o.name === "Catholic Church").length, 1, "the catalogue's Catholic Church is replaced, not duplicated");

  // Six factions plus the two bodies that carry a pontificate out: a world
  // modelled only as counter-powers could narrate nothing but obstruction.
  assert.equal(once.intents.length, 8);
  assert.equal(intentsNeedOtherPowers(once.intents, HOLY_SEE), false, "the schemes belong to the counter-powers, not the pope");
  assert.ok(once.intents.every((it) => it.target === HOLY_SEE));
  assert.equal(once.intents.filter((it) => it.stance === "supportive").length, 3, "the Jesuits, the universal Church and the Curia carry it out");
  assert.equal(once.intents.filter((it) => it.stance === "hostile").length, 4);

  assert.equal(once.simulationRules.split("[Mode de jeu — Pape réformateur]").length - 1, 1);
  assert.equal(twice.simulationRules.split("[Mode de jeu — Pape réformateur]").length - 1, 1, "rules appended once");
  assert.equal(twice.intents.length, 8, "intents not re-seeded");
  assert.equal(twice.organizations.length, once.organizations.length);
  assert.ok(Math.abs(totalFaithful(once.church.faithful) - 1.406e9) < 5e6, "the faithful ledger is seeded with the real figure");
  assert.deepEqual(twice.church, once.church, "the ledger is not reset on re-apply");
  assert.ok(CATHOLIC_MAJORITY_COUNTRIES.length >= 40);
});

test("normalizeWorldState keeps the ledger through a round-trip and leaves it null for other games", () => {
  const w = normalizeWorldState(applyChurchPreset({}, { date: "2026-09-01" }));
  assert.equal(w.church.asOf, "2023-12-31");
  assert.equal(normalizeWorldState({}).church, null);
});

test("the Holy See holds the real Vatican City: an authored region on the map, owned, with a capital marker — and survives normalization", () => {
  const raw = applyChurchPreset({ regionOwnershipOverrides: { "FRA.1_1": "France" }, markers: [{ id: "m1", name: "Something", lng: 2, lat: 48 }] }, { date: "2026-09-01" });
  const w = normalizeWorldState(raw);
  assert.equal(w.customRegions, true, "authored geometry needs the custom-region renderer on");
  assert.equal(w.extraRegions.features.length, 1);
  const vatican = w.extraRegions.features[0];
  assert.equal(vatican.properties.id, VATICAN_REGION_ID);
  assert.equal(vatican.properties.name, "Cité du Vatican");
  assert.equal(vatican.geometry.coordinates[0].length, 257, "the real OSM boundary, not a box");
  assert.equal(w.regionOwnershipOverrides[VATICAN_REGION_ID], HOLY_SEE);
  assert.equal(w.regionOwnershipOverrides["FRA.1_1"], "France", "existing ownership kept");
  assert.equal(isPolityLandless(w, HOLY_SEE), false, "0.49 km² is territory");
  assert.equal(w.markers.length, 2);
  assert.equal(w.markers.find((m) => m.id === "marker-vatican-city").ownerCode, HOLY_SEE);
  const twice = applyChurchPreset(raw, { date: "2026-09-01" });
  assert.equal(normalizeExtraRegions(twice.extraRegions).features.length, 1, "re-apply does not duplicate the region");
  assert.equal(twice.markers.length, 2, "re-apply does not duplicate the marker");
});
