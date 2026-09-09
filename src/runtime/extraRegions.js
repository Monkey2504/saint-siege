/*! Open Historia — per-game authored regions: territory a world adds on top of its scenario's map © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// A scenario's geometry (regions.geojson, or the stock GADM tiles) is static
// map data shared by every game played on it. This is the one place a GAME
// can add territory of its own: a FeatureCollection in world.extraRegions
// whose features are drawn regions ("reg_*" ids — dotless, so the renderer
// treats them as authored geometry exactly like map-editor shapes) painted
// over the base map and owned through regionOwnershipOverrides like any
// other region. First use: the real Vatican City enclave for the reforming
// pope. Pure: no store reads, no React, no asset layer, so it loads anywhere
// (the asset catalog, the map, tests).

const str = (v) => String(v ?? "").trim();
const finite = (v) => Number.isFinite(Number(v));

export const EMPTY_FEATURE_COLLECTION = Object.freeze({ type: "FeatureCollection", features: [] });

// A region id the stock tiles can never carry: no dot (GADM ids are "ITA.8_1").
export const isAuthoredRegionId = (id) => str(id).length > 0 && !str(id).includes(".");

const validRing = (ring) => Array.isArray(ring) && ring.length >= 4 && ring.every((p) => Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]));
const validPolygon = (coords) => Array.isArray(coords) && coords.length >= 1 && coords.every(validRing);

const normalizeGeometry = (geometry) => {
  if (!geometry || typeof geometry !== "object") return null;
  if (geometry.type === "Polygon" && validPolygon(geometry.coordinates)) {
    return { type: "Polygon", coordinates: geometry.coordinates.map((ring) => ring.map(([x, y]) => [Number(x), Number(y)])) };
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 1 && geometry.coordinates.every(validPolygon)) {
    return { type: "MultiPolygon", coordinates: geometry.coordinates.map((poly) => poly.map((ring) => ring.map(([x, y]) => [Number(x), Number(y)]))) };
  }
  return null;
};

export const normalizeExtraRegionFeature = (feature) => {
  if (!feature || typeof feature !== "object") return null;
  const props = feature.properties && typeof feature.properties === "object" ? feature.properties : {};
  const id = str(props.id ?? feature.id);
  if (!isAuthoredRegionId(id)) return null;
  const geometry = normalizeGeometry(feature.geometry);
  if (!geometry) return null;
  return {
    type: "Feature",
    geometry,
    properties: {
      id,
      name: str(props.name) || id,
      owner: str(props.owner),
      gid0: str(props.gid0),
      ...(str(props.note) ? { note: str(props.note) } : {}),
    },
  };
};

// Always a FeatureCollection; invalid entries dropped; later duplicates of an
// id replace earlier ones.
export const normalizeExtraRegions = (value) => {
  const list = Array.isArray(value?.features) ? value.features : Array.isArray(value) ? value : [];
  const byId = new Map();
  for (const raw of list) {
    const f = normalizeExtraRegionFeature(raw);
    if (f) byId.set(f.properties.id, f);
  }
  return byId.size ? { type: "FeatureCollection", features: [...byId.values()] } : EMPTY_FEATURE_COLLECTION;
};

// The map's compact seed index (regionSeedCore.js) with the game's own regions
// folded in — same shape, so every consumer downstream is unchanged. Returns
// the seed itself when there is nothing to add, and null for a null seed
// (geometry not loaded yet: the game's regions wait for it like everything).
export const mergeExtraRegionsIntoSeed = (seed, extraRegions) => {
  if (!seed) return null;
  const extra = normalizeExtraRegions(extraRegions);
  if (!extra.features.length) return seed;
  const ownersById = new Map(seed.ownersById);
  const propsById = new Map(seed.propsById);
  const extraIds = new Set(extra.features.map((f) => f.properties.id));
  const authored = (seed.authoredFC?.features ?? []).filter((f) => !extraIds.has(str(f.properties?.id)));
  for (const f of extra.features) {
    const p = f.properties;
    ownersById.set(p.id, p.owner);
    propsById.set(p.id, { owner: p.owner, gid0: p.gid0, name: p.name, edited: false, claimants: null });
    authored.push(f);
  }
  return { ...seed, ownersById, propsById, authoredFC: { type: "FeatureCollection", features: authored }, hasDrawn: true };
};

// Planar shoelace on the exterior ring, scaled at the ring's mean latitude —
// accurate to well under 1% for anything city-sized; a sanity check on
// authored geometry, not a GIS.
export const approximateAreaKm2 = (geometry) => {
  const g = normalizeGeometry(geometry);
  if (!g) return 0;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  let total = 0;
  for (const poly of polys) {
    const ring = poly[0];
    let a = 0;
    let latSum = 0;
    for (let i = 0; i < ring.length - 1; i += 1) {
      a += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
      latSum += ring[i][1];
    }
    const lat = ((latSum / Math.max(1, ring.length - 1)) * Math.PI) / 180;
    total += (Math.abs(a) / 2) * 111.32 * 111.32 * Math.cos(lat);
  }
  return total;
};
