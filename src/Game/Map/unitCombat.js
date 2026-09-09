/*! Open Historia — unit combat resolution © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// Deterministic, reproducible unit combat.
//
// A seeded PRNG (xmur3 hash -> mulberry32) derives outcomes from
// (attacker.id, defender.id, round) so the same clash always yields the same
// result and the AI can re-derive it when it adjudicates a jump.

const xmur3 = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};

const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// One deterministic stream of [0,1) numbers per seed string. The same seed
// always yields the same sequence, which is what lets the engine re-derive a
// battle, a death roll or an election from state alone (see runtime/wars.js
// and runtime/succession.js) instead of remembering a dice throw.
export const seededRandom = (seed) => mulberry32(xmur3(String(seed ?? ""))());

// Rock-paper-scissors-style multiplier for attacker type vs defender type.
const ADVANTAGE = {
  armor: { infantry: 1.5, artillery: 1.3, garrison: 1.2, armor: 1.0, air: 0.7, naval: 0.5 },
  infantry: { artillery: 1.4, garrison: 1.1, infantry: 1.0, armor: 0.7, air: 0.6, naval: 0.5 },
  artillery: { garrison: 1.5, infantry: 1.2, armor: 1.0, artillery: 1.0, naval: 0.8, air: 0.5 },
  air: { naval: 1.5, armor: 1.4, artillery: 1.3, infantry: 1.2, garrison: 1.1, air: 1.0 },
  naval: { armor: 1.3, garrison: 1.2, infantry: 1.1, naval: 1.0, artillery: 1.0, air: 0.7 },
  garrison: { infantry: 1.2, garrison: 1.0, armor: 0.8, artillery: 0.7, naval: 0.7, air: 0.6 },
};

const advantage = (a, b) => ADVANTAGE[a]?.[b] ?? 1.0;

// ---- reach & feasibility -------------------------------------------------
// Units can't act across the planet at will: attacks resolve instantly only
// inside an era- and type-appropriate engagement range, and movement orders
// beyond a leash become multi-turn orders for the AI instead of teleports.

const EARTH_RADIUS_KM = 6371;

export const distanceKm = (a, b) => {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad((b.lat ?? 0) - (a.lat ?? 0));
  const dLng = toRad((b.lng ?? 0) - (a.lng ?? 0));
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat ?? 0)) * Math.cos(toRad(b.lat ?? 0)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(s)));
};

// Immediate engagement range: how far a unit can strike RIGHT NOW.
const ENGAGEMENT_RANGE_KM = {
  garrison: 60,
  infantry: 100,
  artillery: 200,
  armor: 150,
  naval: 500,
  air: 1200,
};

// One-order movement leash: how far a single move order may relocate a unit
// before it has to become a multi-turn campaign the AI advances realistically.
const MOVE_LEASH_KM = {
  garrison: 200,
  infantry: 800,
  artillery: 800,
  armor: 1000,
  naval: 4000,
  air: 3000,
};

// Logistics scale with the era: a 1200 BC army does not operate like 1944.
export const eraReachFactor = (gameDate) => {
  const match = /(-?\d{3,4})/.exec(String(gameDate ?? ""));
  const bce = /BC|BCE/i.test(String(gameDate ?? ""));
  const year = match ? Number(match[1]) * (bce ? -1 : 1) : 2000;
  if (year < 1500) return 0.5;
  if (year < 1850) return 0.7;
  if (year < 1945) return 1;
  return 1.15;
};

export const engagementRangeKm = (type, gameDate) =>
  Math.round((ENGAGEMENT_RANGE_KM[type] ?? 100) * eraReachFactor(gameDate));

export const moveLeashKm = (type, gameDate) =>
  Math.round((MOVE_LEASH_KM[type] ?? 800) * eraReachFactor(gameDate));

export const resolveClash = (attacker, defender, round = 1) => {
  const rand = seededRandom(`${attacker.id}|${defender.id}|${round}`);
  const aPower = attacker.strength * advantage(attacker.type, defender.type) * (0.85 + 0.3 * rand());
  const dPower = defender.strength * advantage(defender.type, attacker.type) * (0.85 + 0.3 * rand()) * 1.1; // defender's-ground bonus
  const total = aPower + dPower || 1;
  const attackerWins = aPower >= dPower;
  const decisiveness = Math.abs(aPower - dPower) / total; // 0 = even, 1 = rout

  const attackerLoss = attackerWins ? 0.1 + 0.25 * (1 - decisiveness) : 0.35 + 0.45 * decisiveness;
  const defenderLoss = attackerWins ? 0.35 + 0.45 * decisiveness : 0.1 + 0.25 * (1 - decisiveness);

  const attackerStrength = Math.max(0, Math.round(attacker.strength * (1 - attackerLoss)));
  const defenderStrength = Math.max(0, Math.round(defender.strength * (1 - defenderLoss)));

  return {
    attackerStrength,
    defenderStrength,
    attackerWins,
    captured: defenderStrength <= 0 && attackerStrength > 0,
  };
};

// ---- assaults on an objective (a province, a city, a structure) ----------
//
// Attacking anything that is not a unit used to resolve NOTHING: the
// controller flagged the attacker "engaged" and asked the model to invent the
// defense it met, the casualties and the outcome. That is narrative, not
// mechanical. A province has no strength of its own and a building has no HP —
// but the troops standing on them do, so an assault resolves against THOSE,
// through the same seeded resolver a unit-vs-unit clash already uses. Nothing
// new is invented: defenders are the enemy units already in world.units, and
// reach is the same era-scaled engagement range.

const lower = (value) => String(value ?? "").trim().toLowerCase();

// Same predicate wars.js uses before an AI clash: a unit that can actually
// fight (alive, not already routed, not an unconfirmed player deploy, placed).
const fightable = (unit) =>
  Boolean(unit) &&
  typeof unit === "object" &&
  Number(unit.strength) > 0 &&
  unit.status !== "defeated" &&
  unit.status !== "pending" &&
  Number.isFinite(Number(unit.lng)) &&
  Number.isFinite(Number(unit.lat));

// Owner identity is a canonical country NAME everywhere (ownerNames.js), so a
// case-insensitive compare is the whole test — no alliance model exists yet.
export const isHostileTo = (unit, attacker) => {
  const a = lower(attacker?.ownerCode ?? attacker?.owner);
  const b = lower(unit?.ownerCode ?? unit?.owner);
  return Boolean(a) && Boolean(b) && a !== b;
};

// How far from the objective a unit still counts as defending it.
//   • a PROVINCE is contested across the attacker's own engagement reach: if a
//     defender is close enough that the attacker could have struck it directly,
//     it is close enough to stand in the way of taking the province;
//   • a STRUCTURE or CITY is held by its garrison — whoever actually stands at
//     it — so the radius is the garrison engagement range, the shortest one in
//     the table. Both scale with the era through eraReachFactor.
export const contestRadiusKm = (kind, attackerType, gameDate) =>
  kind === "feature"
    ? engagementRangeKm("garrison", gameDate)
    : engagementRangeKm(attackerType, gameDate);

// Who defends the objective. For a province, membership is either explicit
// (unit.regionId is that region) or positional (inside the contest radius);
// for a structure it is positional only. Sorted strongest first, ties broken
// by id, so the resolution ORDER — and therefore the compounded losses — is
// the same however world.units happened to be stored.
export const selectDefenders = ({ units = [], attacker, target = {}, kind = "region", gameDate = "" }) => {
  if (!attacker) return [];
  const point = { lng: Number(target?.lng), lat: Number(target?.lat) };
  const hasPoint = Number.isFinite(point.lng) && Number.isFinite(point.lat);
  const radius = contestRadiusKm(kind, attacker.type, gameDate);
  const regionId = kind === "region" ? String(target?.regionId ?? "").trim() : "";

  return (Array.isArray(units) ? units : [])
    .filter((unit) => unit && unit.id !== attacker.id && fightable(unit) && isHostileTo(unit, attacker))
    .filter((unit) => {
      if (regionId && String(unit.regionId ?? "").trim() === regionId) return true;
      return hasPoint && distanceKm(unit, point) <= radius;
    })
    .sort(
      (a, b) => Number(b.strength) - Number(a.strength) || String(a.id).localeCompare(String(b.id)),
    );
};

// The whole decision, as a pure function of state: who defends, what the
// clashes cost both sides, and whether the objective falls. The controller is
// a thin caller — it only writes what this returns.
//
// Defenders are fought SEQUENTIALLY, strongest first, with the attacker's
// losses carried into the next clash. Resolving only against the strongest
// would make a province held by three divisions cost exactly what one costs,
// and would leave the other two either untouched or vanished for no reason;
// sequential resolution is also what makes "no defender remains" a real,
// checkable condition for a capture. It is the same compounding wars.js uses
// for AI clashes. Every roll is seeded on (attacker.id, defender.id, round),
// so the same inputs always give the same battle.
export const planAssault = ({
  units = [],
  attacker,
  target = {},
  kind = "region",
  gameDate = "",
  round = 1,
} = {}) => {
  const point = { lng: Number(target?.lng), lat: Number(target?.lat) };
  if (!attacker || !Number.isFinite(point.lng) || !Number.isFinite(point.lat)) {
    return { ok: false, outcome: "invalid", inRange: false, captured: false, defenders: [], clashes: [] };
  }

  const distance = distanceKm(attacker, point);
  const range = engagementRangeKm(attacker.type, gameDate);
  const inRange = distance <= range;
  const base = {
    ok: true,
    kind,
    distance,
    range,
    inRange,
    attackerId: attacker.id,
    startStrength: Number(attacker.strength) || 0,
  };

  // Out of reach: nothing is resolved here, exactly as before — the controller
  // turns it into a multi-turn approach order.
  if (!inRange) {
    return {
      ...base,
      defenders: [],
      clashes: [],
      defenderOutcomes: [],
      attackerStrength: base.startStrength,
      attackerSurvives: base.startStrength > 0,
      captured: false,
      unopposed: false,
      outcome: "unreached",
      losses: { attacker: 0, defenders: 0 },
    };
  }

  const defenders = selectDefenders({ units, attacker, target, kind, gameDate });
  let attackerStrength = base.startStrength;
  const clashes = [];
  const defenderOutcomes = [];

  for (const defender of defenders) {
    const before = Number(defender.strength) || 0;
    if (attackerStrength <= 0) {
      // The attacker is spent; the defenders it never reached are untouched.
      defenderOutcomes.push({
        id: defender.id,
        name: defender.name,
        type: defender.type,
        ownerCode: defender.ownerCode,
        before,
        strength: before,
        destroyed: false,
        engaged: false,
      });
      continue;
    }
    const clash = resolveClash({ ...attacker, strength: attackerStrength }, defender, round);
    clashes.push({
      defenderId: defender.id,
      attackerStrength: clash.attackerStrength,
      defenderStrength: clash.defenderStrength,
      attackerWins: clash.attackerWins,
    });
    attackerStrength = clash.attackerStrength;
    defenderOutcomes.push({
      id: defender.id,
      name: defender.name,
      type: defender.type,
      ownerCode: defender.ownerCode,
      before,
      strength: clash.defenderStrength,
      destroyed: clash.defenderStrength <= 0,
      engaged: true,
    });
  }

  const attackerSurvives = attackerStrength > 0;
  const unopposed = defenders.length === 0;
  const cleared = defenderOutcomes.every((entry) => entry.strength <= 0);
  const captured = attackerSurvives && cleared;

  return {
    ...base,
    defenders,
    clashes,
    defenderOutcomes,
    attackerStrength,
    attackerSurvives,
    captured,
    unopposed,
    outcome: unopposed
      ? "unopposed"
      : !attackerSurvives
        ? "destroyed"
        : captured
          ? "captured"
          : "repelled",
    losses: {
      attacker: base.startStrength - attackerStrength,
      defenders: defenderOutcomes.reduce((sum, entry) => sum + (entry.before - entry.strength), 0),
    },
  };
};

// The resolved battle as a world.units transform: the attacker takes its
// losses and stands on the objective it stormed, every defender it met takes
// its own, and anything reduced to nothing leaves the order of battle — the
// same rule attackWith already applied to a unit-vs-unit clash. Pure, so the
// controller stays a thin caller: it hands this list to writeWorldState.
export const applyPlanToUnits = ({
  units = [],
  attackerId,
  plan,
  point = {},
  regionId = "",
  timestamp = new Date().toISOString(),
} = {}) => {
  const list = Array.isArray(units) ? units : [];
  if (!plan?.ok || !plan.inRange) return list;

  const outcomes = new Map((plan.defenderOutcomes ?? []).map((entry) => [String(entry.id), entry]));
  const onObjective = Number.isFinite(Number(point.lng)) && Number.isFinite(Number(point.lat));

  return list
    .map((unit) => {
      if (String(unit.id) === String(attackerId)) {
        return {
          ...unit,
          strength: plan.attackerStrength,
          status: plan.attackerSurvives ? "engaged" : "defeated",
          ...(plan.attackerSurvives && onObjective
            ? { lng: Number(point.lng), lat: Number(point.lat) }
            : {}),
          ...(plan.attackerSurvives && regionId ? { regionId } : {}),
          updatedAt: timestamp,
        };
      }
      const outcome = outcomes.get(String(unit.id));
      if (!outcome) return unit;
      return {
        ...unit,
        strength: outcome.strength,
        status: outcome.strength > 0 ? "engaged" : "defeated",
        updatedAt: timestamp,
      };
    })
    .filter((unit) => Number(unit.strength) > 0);
};
