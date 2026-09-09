/*! Open Historia — per-game authored regions tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { approximateAreaKm2, isAuthoredRegionId, mergeExtraRegionsIntoSeed, normalizeExtraRegions } from "./extraRegions.js";
import { indexRegionFeatureCollection } from "./regionSeedCore.js";
import { VATICAN_CITY_GEOMETRY, VATICAN_CITY_RING } from "./vaticanBoundary.js";

const square = (id, extra = {}) => ({ type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]] }, properties: { id, ...extra } });

test("normalizeExtraRegions: only drawn (dotless) ids with real polygon geometry survive; later duplicates win", () => {
  const fc = normalizeExtraRegions({ type: "FeatureCollection", features: [
    square("reg_a", { name: "A", owner: "Alpha" }),
    square("ITA.8_1", { name: "GADM ids belong to the tiles" }),
    { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: { id: "reg_point" } },
    { type: "Feature", geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0]]] }, properties: { id: "reg_degenerate" } },
    square("reg_a", { name: "A again", owner: "Beta" }),
    "junk",
  ] });
  assert.equal(fc.features.length, 1);
  assert.deepEqual(fc.features[0].properties, { id: "reg_a", name: "A again", owner: "Beta", gid0: "" });
  assert.equal(normalizeExtraRegions(null).features.length, 0);
  assert.equal(normalizeExtraRegions([square("reg_b")]).features[0].properties.name, "reg_b", "a bare array is accepted; the id names a nameless region");
  assert.equal(isAuthoredRegionId("reg_x"), true);
  assert.equal(isAuthoredRegionId("FRA.1_1"), false);
});

test("mergeExtraRegionsIntoSeed: the game's regions join the seed index as authored geometry with their owner and name", () => {
  const seed = indexRegionFeatureCollection({ type: "FeatureCollection", features: [
    { type: "Feature", geometry: { type: "Polygon", coordinates: [[[5, 5], [6, 5], [6, 6], [5, 5]]] }, properties: { id: "ITA.8_1", owner: "Italy", gid0: "ITA", name: "Lazio" } },
  ] });
  assert.equal(seed.hasDrawn, false);
  const merged = mergeExtraRegionsIntoSeed(seed, [square("reg_v", { name: "Enclave", owner: "Holy See", gid0: "VAT" })]);
  assert.equal(merged.hasDrawn, true);
  assert.equal(merged.hasGadm, true, "still a stock-based map: clicks resolve against the tiles");
  assert.equal(merged.ownersById.get("reg_v"), "Holy See");
  assert.equal(merged.ownersById.get("ITA.8_1"), "Italy", "the scenario's own regions are untouched");
  assert.deepEqual(merged.propsById.get("reg_v"), { owner: "Holy See", gid0: "VAT", name: "Enclave", edited: false, claimants: null });
  assert.equal(merged.authoredFC.features.length, 1, "only the drawn shape renders from GeoJSON");
  assert.equal(mergeExtraRegionsIntoSeed(seed, null), seed, "nothing to add returns the same seed");
  assert.equal(mergeExtraRegionsIntoSeed(null, [square("reg_v")]), null, "no seed yet, nothing to merge into");
  assert.notEqual(seed.ownersById.has("reg_v"), true, "the input seed is not mutated");
});

test("the Vatican boundary is the real one: a closed ring of 257 vertices inside Rome, about half a square kilometre", () => {
  assert.equal(VATICAN_CITY_RING.length, 257);
  assert.deepEqual(VATICAN_CITY_RING[0], VATICAN_CITY_RING.at(-1), "closed ring");
  for (const [lng, lat] of VATICAN_CITY_RING) {
    assert.ok(lng > 12.44 && lng < 12.46 && lat > 41.90 && lat < 41.91, `vertex ${lng},${lat} is not in the Vatican`);
  }
  const km2 = approximateAreaKm2(VATICAN_CITY_GEOMETRY);
  assert.ok(km2 > 0.44 && km2 < 0.52, `area ${km2} km²`);
});
