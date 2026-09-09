/*! Open Historia — unit orders & deployment controller © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Shared troop interaction state + mutations.
//
// Holds the current unit list in memory (refreshed from world.json every 5s so
// AI-spawned/moved units appear) and applies player mutations immediately for
// snappy feedback, persisting them to world.json. A tiny pub/sub lets the map
// layer, the selection popup and the Forces panel re-render on change.
//
// Player deploy is purely local (you place your own pieces). Move and attack
// write immediately AND queue a machine-readable order (as an action) so the AI
// honors/contests them on the next time-jump. Combat uses the seeded resolver
// in unitCombat.js for instant feedback; the AI reconciles fronts on the jump.
//
// Mechanical, not narrative: ALL THREE attack paths — unit (attackWith),
// structure/city (attackFeature) and province (attackRegion) — are resolved
// here, from state, before anything is queued. The queued order exists so the
// model NARRATES the battle; it states the computed casualties and outcome as
// facts the model must respect rather than asking it to decide them.

import {
  readWorldState,
  writeWorldState,
  readGameData,
  readActionsState,
  writeActionsState,
  normalizeUnitEntry,
} from "../../runtime/gameState.js";
import {
  resolveClash,
  planAssault,
  applyPlanToUnits,
  distanceKm,
  engagementRangeKm,
  moveLeashKm,
} from "./unitCombat.js";
import { toCountryName } from "../../runtime/ownerNames.js";

let units = [];
let playerCode = "";
let round = 1;
let gameDate = "";
let allowedUnitTypes = null; // null = all types allowed; else the scenario's whitelist
let interactionMode = { kind: "idle" }; // idle | deploy | move | attack
let pollTimer = null;
let busy = false; // suppress poll overwrite mid-commit

const listeners = new Set();
const emit = () => {
  for (const fn of [...listeners]) {
    try {
      fn();
    } catch (error) {
      console.error("units listener failed:", error);
    }
  }
};

export const subscribeUnits = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

// Visual override for the staged event reveal (see time.jsx): while a turn's
// events are being revealed one by one, the map shows the units as of the last
// revealed event rather than the final post-jump list. null = live state.
let unitsOverride = null;
export const setUnitsOverride = (list) => {
  unitsOverride = Array.isArray(list) ? list : null;
  emit();
};

export const getUnits = () => unitsOverride ?? units;
export const getUnitById = (id) => (unitsOverride ?? units).find((unit) => unit.id === id) ?? null;
export const getPlayerCode = () => playerCode;
// The scenario's allowed deployable troop types, or null when unrestricted.
export const getAllowedUnitTypes = () => allowedUnitTypes;
export const getInteractionMode = () => interactionMode;
export const setInteractionMode = (next) => {
  interactionMode = next && next.kind ? next : { kind: "idle" };
  emit();
};
export const clearInteractionMode = () => setInteractionMode({ kind: "idle" });

const refresh = async () => {
  if (busy) return;
  try {
    const [world, game] = await Promise.all([
      readWorldState({ force: true }),
      readGameData({ force: true }),
    ]);
    units = world.units ?? [];
    playerCode = game.country ?? "";
    round = game.round ?? 1;
    gameDate = game.gameDate || game.startDate || "";
    allowedUnitTypes = Array.isArray(world.allowedUnitTypes) && world.allowedUnitTypes.length
      ? world.allowedUnitTypes
      : null;
    emit();
  } catch (error) {
    console.error("Failed to refresh units:", error);
  }
};

export const startUnitsSync = () => {
  if (pollTimer) return () => {};
  refresh();
  pollTimer = setInterval(refresh, 5000);
  return () => {
    clearInterval(pollTimer);
    pollTimer = null;
  };
};

// Read-modify-write world.units while preserving the rest of world state.
//
// `worldPatch` is an optional (world) => partial-world used by the few
// mutations that change more than the order of battle: taking a province
// writes regionOwnershipOverrides, seizing a structure rewrites that marker's
// ownerCode. Both go through writeWorldState — the same normalized path the
// cheat panel and the jump pipeline use — so nothing here invents a new store.
const commit = async (mutator, worldPatch = null) => {
  busy = true;
  try {
    const world = await readWorldState({ force: true });
    const nextUnits = mutator(world.units ?? []);
    const patch = typeof worldPatch === "function" ? worldPatch(world) : worldPatch;
    const saved = await writeWorldState({ ...world, ...(patch ?? {}), units: nextUnits });
    units = saved.units ?? nextUnits;
    emit();
    return units;
  } catch (error) {
    console.error("Failed to commit units:", error);
    return units;
  } finally {
    busy = false;
  }
};

// unitRevert records how to undo the order if the player deletes the queued
// action before the next jump (#368): without it, a manual move stayed on the
// map while the AI was never told about it.
const queueOrder = async (text, unitRevert = null) => {
  try {
    const actions = await readActionsState({ force: true });
    actions.push({
      kind: "action",
      source: "order",
      status: "planned",
      text,
      title: text.length > 60 ? `${text.slice(0, 57)}...` : text,
      ...(unitRevert ? { unitRevert } : {}),
    });
    await writeActionsState(actions);
  } catch (error) {
    console.error("Failed to queue order:", error);
  }
};

// Undo a queued manual order whose action the player deleted (#368): a pending
// deploy is removed again, a moved unit snaps back to its recorded position,
// and a long-range/approach order restores the unit's prior status.
//
// A RESOLVED assault (attackRegion/attackFeature) carries more than a position:
// `restoreUnits` is the pre-battle snapshot of every unit the clash touched
// (the attacker plus each defender, destroyed ones included, so a wiped-out
// garrison comes back), and `regionOwnership`/`markerOwner` undo a capture.
// NOTE: runtime/gameState.js#normalizeUnitRevert currently keeps only
// { unitId, lng, lat, remove, status } and DROPS the three fields above when
// the action is written, so today those branches are dead until that
// normalizer is widened (the exact snippet is in this change's report). They
// are read defensively so revert becomes complete the moment it is.
export const revertUnitOrder = async (revert) => {
  const unitId = String(revert?.unitId ?? "").trim();
  if (!unitId) return;
  if (revert.remove) {
    await commit((list) => list.filter((u) => u.id !== unitId));
    return;
  }

  const restore = (Array.isArray(revert.restoreUnits) ? revert.restoreUnits : []).filter(
    (entry) => entry && String(entry.id ?? "").trim(),
  );

  // Hand the province / the structure back to whoever held it before the
  // assault. An absent previousOwner means there was no override at all, so
  // the key is deleted rather than written back as an empty owner.
  const worldPatch = (world) => {
    const patch = {};
    const region = revert.regionOwnership;
    if (region && String(region.regionId ?? "").trim()) {
      const overrides = { ...(world.regionOwnershipOverrides ?? {}) };
      if (region.previousOwner) overrides[String(region.regionId)] = region.previousOwner;
      else delete overrides[String(region.regionId)];
      patch.regionOwnershipOverrides = overrides;
    }
    const marker = revert.markerOwner;
    if (marker && String(marker.markerId ?? "").trim()) {
      patch.markers = (world.markers ?? []).map((entry) =>
        String(entry.id) === String(marker.markerId)
          ? { ...entry, ownerCode: marker.previousOwner ?? "" }
          : entry,
      );
    }
    return patch;
  };

  await commit((list) => {
    const timestamp = new Date().toISOString();
    let next = list.map((u) => {
      if (u.id !== unitId) return u;
      return {
        ...u,
        ...(Number.isFinite(revert.lng) && Number.isFinite(revert.lat) ? { lng: revert.lng, lat: revert.lat } : {}),
        ...(revert.status ? { status: revert.status } : {}),
        updatedAt: timestamp,
      };
    });
    if (restore.length) {
      const byId = new Map(restore.map((entry) => [String(entry.id), entry]));
      next = next.map((u) =>
        byId.has(String(u.id)) ? { ...u, ...byId.get(String(u.id)), updatedAt: timestamp } : u,
      );
      for (const entry of restore) {
        if (!next.some((u) => String(u.id) === String(entry.id))) {
          next.push({ ...entry, updatedAt: timestamp });
        }
      }
    }
    return next;
  }, worldPatch);
};

export const deployUnit = async ({ type, strength, name, lng, lat }) => {
  if (!playerCode) await refresh();
  // Deploy as PENDING (rendered translucent): the player states an intent, and the
  // AI confirms, relocates or rejects it on the next time-jump.
  // Built outside the commit so the queued order can reference its id.
  const unit = normalizeUnitEntry({
    type,
    strength,
    name,
    lng,
    lat,
    ownerCode: playerCode || "PLAYER",
    source: "player",
    status: "pending",
  });
  if (!unit) return units;
  const saved = await commit((list) => [...list, unit]);
  await queueOrder(
    `Deploy request: ${name || type} (${type}, strength ${strength}, owner ${playerCode || "PLAYER"}) at ` +
      `lat ${lat.toFixed(2)}, lng ${lng.toFixed(2)}. Currently pending — confirm it into the order of battle, ` +
      `reposition it, or reject it as the front and logistics allow.`,
    { unitId: unit.id, remove: true },
  );
  return saved;
};

// A clicked map location described by the region beneath it (see
// resolveRegionAt in Nations.jsx): { regionId, regionName, owner, country, lng, lat }.
// Orders name the PLACE ("Provence in Kingdom of France") rather than bare
// coordinates, so the AI can resolve the order against the region it names.
const isOwnRegion = (unit, region) => {
  const owner = toCountryName(region?.owner ?? "");
  return Boolean(owner) && (owner === unit.ownerCode || owner === toCountryName(unit.ownerCode));
};

const placePhrase = (region, at) =>
  region?.regionName
    ? `${region.regionName}${region.owner ? ` in ${region.owner}` : ""}` +
      `${region.regionId ? ` (region id ${region.regionId})` : ""} — at ${at}`
    : at;

export const moveUnitTo = async (unitId, lng, lat, region = null) => {
  const unit = getUnitById(unitId);
  if (!unit) return { resolved: false };

  const distance = distanceKm(unit, { lng, lat });
  const leash = moveLeashKm(unit.type, gameDate);
  const place = placePhrase(region, `lat ${lat.toFixed(2)}, lng ${lng.toFixed(2)}`);

  // Beyond the era/type leash the unit does NOT teleport: it stays put with a
  // long-range order the AI advances (or rejects) realistically over turns.
  if (distance > leash) {
    await commit((list) =>
      list.map((u) =>
        u.id === unitId ? { ...u, status: "moving", updatedAt: new Date().toISOString() } : u,
      ),
    );
    await queueOrder(
      `Long-range movement order: ${unit.name} (${unit.type}, id ${unit.id}, owner ${unit.ownerCode}) is ordered to ` +
        `${place} — about ${Math.round(distance)} km away, beyond a single ` +
        `${unit.type} move in this era (~${leash} km). Advance it realistically across turns given the era, terrain ` +
        `and transport available, or reject the order with an event explaining why it is infeasible.`,
      { unitId: unit.id, status: unit.status },
    );
    return { resolved: false, distance, leash };
  }

  await commit((list) =>
    list.map((u) =>
      u.id === unitId
        ? { ...u, lng, lat, status: "moving", updatedAt: new Date().toISOString() }
        : u,
    ),
  );
  await queueOrder(
    `Move ${unit.name} (${unit.type}, id ${unit.id}, owner ${unit.ownerCode}) to ${place}.`,
    { unitId: unit.id, lng: unit.lng, lat: unit.lat, status: unit.status },
  );
  return { resolved: true, distance, leash };
};

export const attackWith = async (attackerId, targetId) => {
  const attacker = getUnitById(attackerId);
  const defender = getUnitById(targetId);
  if (!attacker || !defender || attackerId === targetId) return { resolved: false };

  // Out-of-range attacks don't resolve instantly (no striking across the
  // planet): they become an approach order the AI plays out over turns,
  // judged against the era, unit type and logistics.
  const distance = distanceKm(attacker, defender);
  const range = engagementRangeKm(attacker.type, gameDate);
  if (distance > range) {
    await commit((list) =>
      list.map((u) =>
        u.id === attackerId ? { ...u, status: "moving", updatedAt: new Date().toISOString() } : u,
      ),
    );
    await queueOrder(
      `Attack order (approach required): ${attacker.name} (${attacker.type}, id ${attacker.id}, owner ${attacker.ownerCode}) ` +
        `is ordered against ${defender.name} (id ${defender.id}, owner ${defender.ownerCode}) about ${Math.round(distance)} km away — ` +
        `beyond its ~${range} km engagement reach for this era. March/sail/fly it toward the target realistically across turns ` +
        `and resolve the clash when contact is actually possible, or reject the order with an event explaining why it is infeasible.`,
      { unitId: attacker.id, status: attacker.status },
    );
    return { resolved: false, distance, range };
  }

  const result = resolveClash(attacker, defender, round);
  await commit((list) =>
    list
      .map((u) => {
        if (u.id === attackerId) {
          const survives = result.attackerStrength > 0;
          return {
            ...u,
            strength: result.attackerStrength,
            status: survives ? "engaged" : "defeated",
            lng: survives && result.captured ? defender.lng : u.lng,
            lat: survives && result.captured ? defender.lat : u.lat,
            updatedAt: new Date().toISOString(),
          };
        }
        if (u.id === targetId) {
          return {
            ...u,
            strength: result.defenderStrength,
            status: result.defenderStrength > 0 ? "engaged" : "defeated",
            updatedAt: new Date().toISOString(),
          };
        }
        return u;
      })
      .filter((u) => u.strength > 0),
  );

  await queueOrder(
    `Attack: ${attacker.name} (id ${attacker.id}, owner ${attacker.ownerCode}) assaults ` +
      `${defender.name} (id ${defender.id}, owner ${defender.ownerCode}). Local resolution -> ` +
      `attacker strength ${result.attackerStrength}, defender strength ${result.defenderStrength}` +
      `${result.captured ? "; attacker holds the field (consider a regionTransfer)" : ""}. ` +
      `Escalate, reinforce or counterattack as the wider front warrants.`,
  );
  return { resolved: true, distance, range };
};

// ---- resolved assaults ---------------------------------------------------
// Attacking a province or a structure is resolved HERE, by planAssault, before
// anything is queued: the objective's defenders are the enemy units standing
// on it, and the seeded resolver decides the casualties and the outcome. The
// queued order still exists so the AI narrates the battle — it just narrates a
// result it is given instead of inventing one.

const casualtyReport = (plan) =>
  plan.defenderOutcomes
    .map(
      (outcome) =>
        `${outcome.name || outcome.type} (${outcome.type}, id ${outcome.id}, owner ${outcome.ownerCode}) ` +
        `strength ${outcome.before} -> ${outcome.strength}` +
        `${outcome.destroyed ? " — destroyed" : ""}${outcome.engaged ? "" : " — never engaged"}`,
    )
    .join("; ");

const assaultFacts = (attacker, plan) =>
  `Defense met: ${plan.unopposed ? "none — the objective was undefended" : casualtyReport(plan)}. ` +
  `Attacker ${attacker.name} (${attacker.type}, id ${attacker.id}, owner ${attacker.ownerCode}) strength ` +
  `${plan.startStrength} -> ${plan.attackerStrength}${plan.attackerSurvives ? "" : " — destroyed"}.`;

const NARRATE_ONLY =
  "These numbers were computed by the engine and are ALREADY APPLIED to world state. Narrate this battle in an " +
  "event and carry it forward (reinforcements, counterattacks, political fallout are yours), but do not re-decide, " +
  "soften or contradict the strengths and the outcome stated above.";

// Write the resolved battle to world.units — attacker and every defender it
// actually met — plus whatever ownership the capture changed. Returns the
// pre-battle snapshot of the units it touched, which is the revert payload.
const applyAssaultToUnits = async (attacker, plan, point, capturedRegionId, worldPatch) => {
  const snapshot = [attacker, ...plan.defenders].map((unit) => ({ ...unit }));
  await commit(
    (list) =>
      applyPlanToUnits({
        units: list,
        attackerId: attacker.id,
        plan,
        point,
        regionId: capturedRegionId,
      }),
    worldPatch,
  );
  return snapshot;
};

// Attack aimed at a map feature — a city or a built structure (world.markers) —
// rather than another unit. A building has no strength of its own and gets no
// invented HP: the assault resolves against its GARRISON, the enemy units
// standing at the marker's coordinates. Beat them (or find none) and the
// objective is taken — a seized structure's marker changes hands right here;
// a city has no world record of its own, so the order states the fall as a
// fact and names the regionTransfer that reflects it. Out of range it becomes
// an approach order exactly like a long-range unit attack.
export const attackFeature = async (attackerId, target) => {
  const attacker = getUnitById(attackerId);
  const point = { lng: Number(target?.lng), lat: Number(target?.lat) };
  if (!attacker || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return { resolved: false };
  // Ordering troops against their own structure is a misclick, not an order.
  if (target.source === "marker" && target.ownerCode && target.ownerCode === attacker.ownerCode) {
    return { resolved: false, ownTarget: true };
  }

  const targetLabel = target.source === "marker"
    ? `the ${target.kind ? `${target.kind} ` : ""}structure "${target.name || "unnamed"}"` +
      `${target.ownerCode ? ` held by ${target.ownerCode}` : ""}${target.id ? ` (marker id ${target.id})` : ""}`
    : `the city of ${target.name || "an unnamed city"}`;
  const at = `lat ${point.lat.toFixed(2)}, lng ${point.lng.toFixed(2)}`;

  const distance = distanceKm(attacker, point);
  const range = engagementRangeKm(attacker.type, gameDate);
  if (distance > range) {
    await commit((list) =>
      list.map((u) =>
        u.id === attackerId ? { ...u, status: "moving", updatedAt: new Date().toISOString() } : u,
      ),
    );
    await queueOrder(
      `Attack order (approach required): ${attacker.name} (${attacker.type}, id ${attacker.id}, owner ${attacker.ownerCode}) ` +
        `is ordered to assault ${targetLabel} at ${at}, about ${Math.round(distance)} km away — beyond its ~${range} km ` +
        `engagement reach for this era. March/sail/fly it toward the objective realistically across turns and resolve the ` +
        `assault when contact is actually possible, or reject the order with an event explaining why it is infeasible.`,
      { unitId: attacker.id, status: attacker.status },
    );
    return { resolved: false, distance, range };
  }

  const plan = planAssault({
    units: getUnits(),
    attacker,
    target: point,
    kind: "feature",
    gameDate,
    round,
  });

  // A seized structure changes hands in world.markers — the same record the
  // editor and markerOps write. A city is not a world record, so nothing is
  // written for it and the order names the regionTransfer that reflects it.
  const markerId = target.source === "marker" ? String(target.id ?? "").trim() : "";
  const seizure = { previousOwner: "" };
  const worldPatch =
    plan.captured && markerId
      ? (world) => {
          const markers = world.markers ?? [];
          seizure.previousOwner =
            markers.find((entry) => String(entry.id) === markerId)?.ownerCode ?? "";
          return {
            markers: markers.map((entry) =>
              String(entry.id) === markerId ? { ...entry, ownerCode: attacker.ownerCode } : entry,
            ),
          };
        }
      : null;

  // The attacker now stands in the objective's province whether it won or not,
  // so its regionId follows it: that tag is position, not ownership, and it is
  // what makes it a defender if the province is counterattacked next.
  const hostRegionId = String(target.hostRegionId ?? "").trim();
  const snapshot = await applyAssaultToUnits(attacker, plan, point, hostRegionId, worldPatch);

  const outcomeLine = plan.captured
    ? markerId
      ? `Outcome: the objective has been TAKEN — ${targetLabel} now belongs to ${attacker.ownerCode}, and that ` +
        `owner change is ALREADY WRITTEN to world.markers. If the truth of the assault is that it was levelled ` +
        `rather than seized, use markerOps to remove it; otherwise leave the marker standing.`
      : `Outcome: the objective has been TAKEN — the garrison is gone and ${attacker.ownerCode} holds ` +
        `${targetLabel}. A city has no world record of its own, so reflect the fall with a regionTransfer of ` +
        `${hostRegionId || `the province at ${at}`} to ${attacker.ownerCode} if the province follows the city.`
    : !plan.attackerSurvives
      ? `Outcome: the assault FAILED — the attacking force was destroyed and the garrison still holds ${targetLabel}. ` +
        `Do not transfer it or remove its marker.`
      : `Outcome: the assault was REPELLED — surviving defenders still hold ${targetLabel} and the attacker is dug ` +
        `in at the objective. Do not transfer it or remove its marker.`;

  await queueOrder(
    `Assault RESOLVED: ${attacker.name} (${attacker.type}, id ${attacker.id}, owner ${attacker.ownerCode}) assaulted ` +
      `${targetLabel} at ${at}. ${assaultFacts(attacker, plan)} ${outcomeLine} ${NARRATE_ONLY}`,
    {
      unitId: attacker.id,
      lng: attacker.lng,
      lat: attacker.lat,
      status: attacker.status,
      restoreUnits: snapshot,
      ...(plan.captured && markerId
        ? { markerOwner: { markerId, previousOwner: seizure.previousOwner } }
        : {}),
    },
  );
  return {
    resolved: true,
    distance,
    range,
    outcome: plan.outcome,
    captured: plan.captured,
    defenders: plan.defenders.length,
    attackerStrength: plan.attackerStrength,
  };
};

export const removeUnit = async (unitId) =>
  commit((list) => list.filter((u) => u.id !== unitId));

// Attack aimed at a PROVINCE (a region under the cursor) rather than another
// unit or a city/marker. A province has no strength of its own, so the assault
// resolves against what actually defends it: the enemy units whose regionId is
// that region, plus any standing inside the attacker's era-scaled engagement
// reach of the clicked point. Clear them (or find none) and the province is
// TAKEN — regionOwnershipOverrides is written here, the same key the jump
// pipeline's regionTransfers write. Out of range it becomes an approach order,
// exactly like a long-range unit attack.
export const attackRegion = async (attackerId, target) => {
  const attacker = getUnitById(attackerId);
  const point = { lng: Number(target?.lng), lat: Number(target?.lat) };
  if (!attacker || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) return { resolved: false };
  // Ordering troops against a province they already hold is a misclick, not an order.
  if (isOwnRegion(attacker, target)) return { resolved: false, ownTarget: true };

  const at = `lat ${point.lat.toFixed(2)}, lng ${point.lng.toFixed(2)}`;
  const regionLabel = target.regionName
    ? `the province of ${target.regionName}` +
      `${target.owner ? `, held by ${target.owner}` : ""}${target.regionId ? ` (region id ${target.regionId})` : ""}`
    : `the area at ${at}`;
  const place = placePhrase(target, at);

  const distance = distanceKm(attacker, point);
  const range = engagementRangeKm(attacker.type, gameDate);
  if (distance > range) {
    await commit((list) =>
      list.map((u) =>
        u.id === attackerId ? { ...u, status: "moving", updatedAt: new Date().toISOString() } : u,
      ),
    );
    await queueOrder(
      `Attack order (approach required): ${attacker.name} (${attacker.type}, id ${attacker.id}, owner ${attacker.ownerCode}) ` +
        `is ordered to assault ${place}, about ${Math.round(distance)} km away — beyond its ~${range} km ` +
        `engagement reach for this era. March/sail/fly it toward the province realistically across turns and resolve the ` +
        `assault when contact is actually possible, or reject the order with an event explaining why it is infeasible.`,
      { unitId: attacker.id, status: attacker.status },
    );
    return { resolved: false, distance, range };
  }

  const plan = planAssault({
    units: getUnits(),
    attacker,
    target,
    kind: "region",
    gameDate,
    round,
  });

  const regionId = String(target.regionId ?? "").trim();
  const capture = { previousOwner: "" };
  const worldPatch =
    plan.captured && regionId
      ? (world) => {
          capture.previousOwner = world.regionOwnershipOverrides?.[regionId] ?? "";
          return {
            regionOwnershipOverrides: {
              ...(world.regionOwnershipOverrides ?? {}),
              [regionId]: attacker.ownerCode,
            },
          };
        }
      : null;

  // Position, not ownership: a surviving attacker is inside that province now
  // (see attackFeature), which is what makes it a defender of it next turn.
  const snapshot = await applyAssaultToUnits(attacker, plan, point, regionId, worldPatch);

  const holder = target.owner || "its current holder";
  const outcomeLine = plan.captured
    ? regionId
      ? `Outcome: the province has FALLEN — region ${regionId} is owned by ${attacker.ownerCode} as of now, and that ` +
        `transfer is ALREADY WRITTEN to world.regionOwnershipOverrides. Do not issue another regionTransfer for it.` +
        `${plan.unopposed ? " It was taken unopposed: there was no battle, so do not narrate casualties." : ""}`
      : `Outcome: the attacker holds the field at ${at}, but the order carried no region id, so no ownership could ` +
        `be written — apply a regionTransfer of the province at ${at} to ${attacker.ownerCode} yourself.`
    : !plan.attackerSurvives
      ? `Outcome: the assault FAILED — the attacking force was destroyed. ${regionLabel} stays with ${holder}; ` +
        `do not transfer it.`
      : `Outcome: the assault was REPELLED — surviving defenders still hold the ground and the attacker is dug in ` +
        `at the objective. ${regionLabel} stays with ${holder}; do not transfer it.`;

  await queueOrder(
    `Assault RESOLVED: ${attacker.name} (${attacker.type}, id ${attacker.id}, owner ${attacker.ownerCode}) attacked ` +
      `${regionLabel} — ${place}. ${assaultFacts(attacker, plan)} ${outcomeLine} ${NARRATE_ONLY}`,
    {
      unitId: attacker.id,
      lng: attacker.lng,
      lat: attacker.lat,
      status: attacker.status,
      restoreUnits: snapshot,
      ...(plan.captured && regionId
        ? { regionOwnership: { regionId, previousOwner: capture.previousOwner } }
        : {}),
    },
  );
  return {
    resolved: true,
    distance,
    range,
    outcome: plan.outcome,
    captured: plan.captured,
    defenders: plan.defenders.length,
    attackerStrength: plan.attackerStrength,
  };
};

export const disbandUnit = async (unitId) => {
  const unit = getUnitById(unitId);
  if (!unit) return;
  await commit((list) => list.filter((u) => u.id !== unitId));
  await queueOrder(
    `Disband order: ${unit.name} (${unit.type}, id ${unit.id}, owner ${unit.ownerCode}) is decommissioned and stood down.`,
  );
};
