/*! Open Historia — wars: who is actually at war with whom, as state the engine enforces © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The world used to know a war only as prose: an event said "Ruritania
// invades", the next jump's model re-read it (or not) and invented casualties,
// captures and peace terms by hand. Nothing checked that a battle happened
// between belligerents, that a region moved between enemies, or that the
// economy's wartime footing (economy.atWar) had anything to do with it.
//
// This is the war as STATE: a declared war has two sides (coalitions), a date,
// a status, an intensity and a casus. Everything martial hangs off it —
//   • the economy: economies[p].atWar follows isAtWar (warEconomyFlags);
//   • combat: the engine resolves AI clashes itself, deterministically, only
//     between units on opposite sides of an ACTIVE war (resolveAiClashes);
//   • the model: it may not write casualties by hand outside a war
//     (filterUnitOpsByWars), and the rules text tells it so.
// Mechanical, not narrative: the same rule for every polity in every era —
// a Bronze Age raid, the Peloponnesian War and a 2026 border war all pass
// through the same declare / join / ceasefire / end ops.
//
// Pure, like intents.js and churchFaithful.js: no store reads, no React, no
// Math.random — every roll is seeded on ids and the round (unitCombat.js).

import { distanceKm, engagementRangeKm, resolveClash } from "../Game/Map/unitCombat.js";

export const WAR_STATUSES = ["active", "ceasefire", "ended"];
export const WAR_OUTCOMES = ["a", "b", "stalemate"];
export const WAR_SIDES = ["a", "b"];

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const slug = (s) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const yearOf = (date) => { const m = /^(-?\d{1,4})/.exec(str(date)); return m ? m[1] : ""; };
const names = (list) => {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const n = str(raw);
    if (n && !out.some((x) => lower(x) === lower(n))) out.push(n);
  }
  return out;
};

export const normalizeWar = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") return null;
  const sides = entry.sides && typeof entry.sides === "object" ? entry.sides : {};
  const a = names(sides.a ?? entry.attackers ?? (entry.attacker ? [entry.attacker] : []));
  const b = names(sides.b ?? entry.defenders ?? (entry.defender ? [entry.defender] : [])).filter((n) => !a.some((x) => lower(x) === lower(n)));
  if (a.length === 0 || b.length === 0) return null;
  const status = WAR_STATUSES.includes(lower(entry.status)) ? lower(entry.status) : "active";
  return {
    id: str(entry.id) || `war-${slug(a[0])}-${slug(b[0])}-${yearOf(entry.since) || index + 1}`,
    sides: { a, b },
    since: str(entry.since),
    status,
    intensity: clamp(finite(entry.intensity, 0.5), 0, 1),
    casus: str(entry.casus),
    outcome: WAR_OUTCOMES.includes(lower(entry.outcome)) ? lower(entry.outcome) : "",
    terms: str(entry.terms),
    endedAt: str(entry.endedAt),
    log: (Array.isArray(entry.log) ? entry.log : []).map(str).filter(Boolean).slice(-12),
  };
};

export const normalizeWars = (list) => {
  const out = [];
  const seen = new Set();
  for (const [index, entry] of (Array.isArray(list) ? list : []).entries()) {
    const war = normalizeWar(entry, index);
    if (!war || seen.has(lower(war.id))) continue;
    seen.add(lower(war.id));
    out.push(war);
  }
  return out;
};

// ---- queries ----------------------------------------------------------------------------

export const sideOf = (war, polity) => {
  const key = lower(polity);
  if (!key || !war) return "";
  if (war.sides.a.some((n) => lower(n) === key)) return "a";
  if (war.sides.b.some((n) => lower(n) === key)) return "b";
  return "";
};

export const isActiveWar = (war) => Boolean(war) && war.status === "active";

// Every ACTIVE war in which x and y stand on opposite sides — coalitions
// included: a member of side a is at war with every member of side b, not
// only with the polity that was declared against. A ceasefire is not an
// active war (no battles, no conquest) but is not peace either (see declare).
export const warsBetween = (wars, x, y) => {
  const list = normalizeWars(wars);
  const kx = lower(x);
  const ky = lower(y);
  if (!kx || !ky || kx === ky) return [];
  return list.filter((w) => {
    if (!isActiveWar(w)) return false;
    const sx = sideOf(w, kx);
    const sy = sideOf(w, ky);
    return Boolean(sx) && Boolean(sy) && sx !== sy;
  });
};

export const isAtWar = (wars, x) => normalizeWars(wars).some((w) => isActiveWar(w) && sideOf(w, x) !== "");

export const activeWarsOf = (wars, x) => normalizeWars(wars).filter((w) => isActiveWar(w) && sideOf(w, x) !== "");

// Any war (active OR under ceasefire) between two polities — what "declare"
// checks, so a ceasefire cannot be papered over by declaring a second war.
const openWarBetween = (list, x, y) => list.find((w) => {
  if (w.status === "ended") return false;
  const sx = sideOf(w, x);
  const sy = sideOf(w, y);
  return Boolean(sx) && Boolean(sy) && sx !== sy;
});

// ---- the levers -------------------------------------------------------------------------
//
//   {op:"declare",   attacker, defender, casus, allies?:[...]}      allies join the attacker's side
//   {op:"join",      war:<id>, polity, side:"a"|"b"}
//   {op:"ceasefire", war:<id>}
//   {op:"end",       war:<id>, outcome:"a"|"b"|"stalemate", terms?}
//   {op:"intensity", war:<id>, delta:<signed, 0-1 scale>}
//
// `war` may also be given as {between:[x, y]} or as "x vs y" when the model
// does not recall the id — the same leniency intents.js gives its ids.

const findWar = (list, ref) => {
  if (ref && typeof ref === "object") {
    const pair = Array.isArray(ref.between) ? ref.between : [ref.attacker ?? ref.a, ref.defender ?? ref.b];
    const w = openWarBetween(list, str(pair[0]), str(pair[1]));
    return w ? list.indexOf(w) : -1;
  }
  const key = lower(ref);
  if (!key) return -1;
  const byId = list.findIndex((w) => lower(w.id) === key);
  if (byId >= 0) return byId;
  const vs = /^(.+?)\s+(?:vs\.?|v\.?|versus|against)\s+(.+)$/i.exec(str(ref));
  if (vs) {
    const w = openWarBetween(list, vs[1], vs[2]);
    return w ? list.indexOf(w) : -1;
  }
  // Last resort: the only open war a named polity is in.
  const mine = list.filter((w) => w.status !== "ended" && sideOf(w, key));
  return mine.length === 1 ? list.indexOf(mine[0]) : -1;
};

const stamp = (date, text) => `${date || "undated"}: ${text}`;

export const applyWarOps = (wars, ops, { date = "" } = {}) => {
  const list = normalizeWars(wars);
  const refusals = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);
    if (op === "declare") {
      const attacker = str(raw.attacker);
      const defender = str(raw.defender);
      if (!attacker || !defender) { refusals.push("warOps declare: attacker and defender are both required"); continue; }
      if (lower(attacker) === lower(defender)) { refusals.push(`warOps declare: ${attacker} cannot declare war on itself`); continue; }
      const existing = openWarBetween(list, attacker, defender);
      if (existing && existing.status === "active") {
        refusals.push(`warOps declare: ${attacker} and ${defender} are already at war (${existing.id}); use join, intensity or end on it`);
        continue;
      }
      if (existing) {
        // A ceasefire broken is the SAME war resumed, not a second one.
        const at = list.indexOf(existing);
        list[at] = { ...existing, status: "active", log: [...existing.log, stamp(date, `ceasefire broken by ${attacker}${raw.casus ? ` — ${str(raw.casus)}` : ""}`)].slice(-12) };
        continue;
      }
      const allies = names(raw.allies).filter((n) => lower(n) !== lower(attacker) && lower(n) !== lower(defender));
      // An ally already at war with the attacker cannot march beside it.
      const usable = allies.filter((n) => !openWarBetween(list, n, attacker));
      for (const n of allies) if (!usable.includes(n)) refusals.push(`warOps declare: ally ${n} is itself at war with ${attacker} and cannot join its side`);
      const draft = normalizeWar({
        sides: { a: [attacker, ...usable], b: [defender] },
        since: date,
        status: "active",
        intensity: raw.intensity !== undefined ? raw.intensity : 0.5,
        casus: raw.casus,
        log: [stamp(date, `${attacker} declares war on ${defender}${usable.length ? ` with ${usable.join(", ")}` : ""}${raw.casus ? ` — ${str(raw.casus)}` : ""}`)],
      }, list.length);
      if (list.some((w) => lower(w.id) === lower(draft.id))) draft.id = `${draft.id}-${list.length + 1}`;
      list.push(draft);
      continue;
    }

    const at = findWar(list, raw.war ?? raw.id ?? raw);
    if (at < 0) { refusals.push(`warOps ${op || "?"}: no open war matches ${JSON.stringify(raw.war ?? raw.id ?? "")}`); continue; }
    const war = list[at];
    if (war.status === "ended") { refusals.push(`warOps ${op}: ${war.id} already ended (${war.outcome || "no outcome"})`); continue; }

    if (op === "join") {
      const polity = str(raw.polity);
      const side = WAR_SIDES.includes(lower(raw.side)) ? lower(raw.side) : "";
      if (!polity || !side) { refusals.push(`warOps join: polity and side ("a"|"b") are required for ${war.id}`); continue; }
      if (sideOf(war, polity)) { refusals.push(`warOps join: ${polity} is already in ${war.id} on side ${sideOf(war, polity)}`); continue; }
      const enemies = war.sides[side === "a" ? "b" : "a"];
      const friends = war.sides[side];
      const clash = friends.find((n) => openWarBetween(list, n, polity));
      if (clash) { refusals.push(`warOps join: ${polity} is at war with ${clash}, who is on side ${side} of ${war.id}`); continue; }
      list[at] = {
        ...war,
        sides: { ...war.sides, [side]: [...friends, polity] },
        log: [...war.log, stamp(date, `${polity} joins side ${side} against ${enemies.join(", ")}`)].slice(-12),
      };
    } else if (op === "ceasefire") {
      if (war.status === "ceasefire") { refusals.push(`warOps ceasefire: ${war.id} is already under ceasefire`); continue; }
      list[at] = { ...war, status: "ceasefire", log: [...war.log, stamp(date, `ceasefire${raw.terms ? ` — ${str(raw.terms)}` : ""}`)].slice(-12) };
    } else if (op === "end") {
      const outcome = WAR_OUTCOMES.includes(lower(raw.outcome)) ? lower(raw.outcome) : "";
      if (!outcome) { refusals.push(`warOps end: ${war.id} needs an outcome of "a", "b" or "stalemate"`); continue; }
      const winner = outcome === "stalemate" ? "stalemate" : `side ${outcome} (${war.sides[outcome].join(", ")}) prevails`;
      list[at] = { ...war, status: "ended", outcome, terms: str(raw.terms), endedAt: date, log: [...war.log, stamp(date, `peace — ${winner}${raw.terms ? `; ${str(raw.terms)}` : ""}`)].slice(-12) };
    } else if (op === "intensity") {
      const delta = finite(raw.delta, NaN);
      if (!Number.isFinite(delta)) { refusals.push(`warOps intensity: ${war.id} needs a numeric delta`); continue; }
      const intensity = clamp(war.intensity + delta, 0, 1);
      list[at] = { ...war, intensity, log: [...war.log, stamp(date, `intensity ${delta >= 0 ? "+" : ""}${delta.toFixed(2)} → ${intensity.toFixed(2)}${raw.note ? ` — ${str(raw.note)}` : ""}`)].slice(-12) };
    } else {
      refusals.push(`warOps: unknown op "${op}" (expected declare, join, ceasefire, end or intensity)`);
    }
  }
  return { wars: list, refusals };
};

// ---- consequences the engine owns --------------------------------------------------------

// economy.atWar is not a mood the model sets; it follows the war state. The
// caller (gameplay.applySimulationResult) does, every jump, for every seeded
// economy p:  economies[p] = normalizeEconomy({ ...economies[p], atWar: Boolean(flags[p]?.atWar) })
// with flags = warEconomyFlags(world.wars). A polity in no active war is at
// peace whatever the narration says; one in an active war is at war.
export const warEconomyFlags = (wars) => {
  const out = {};
  for (const w of normalizeWars(wars)) {
    if (!isActiveWar(w)) continue;
    for (const n of [...w.sides.a, ...w.sides.b]) out[n] = { atWar: true };
  }
  return out;
};

// ---- AI-side combat --------------------------------------------------------------------
//
// The player's own clashes resolve on the map at the moment of the order
// (unitsController.js → resolveClash). Everything else — two AI powers'
// armies meeting, an AI force sitting in range of the player's — resolves
// HERE, once per jump, from state alone: every pair of units on opposite
// sides of an active war within engagement range fights exactly once per
// round, seeded on (attackerId, defenderId, round), so re-running a jump
// re-derives the same battle. The attacker of a pair is the unit whose reach
// covers the distance; when both reach, the unit on the side that DECLARED
// (side a) attacks. Losses scale with the war's intensity: a phoney war
// produces skirmishes, a total war produces the full resolveClash losses.

const LOSS_SCALE_FLOOR = 0.25;
const fightable = (u) => u && typeof u === "object" && finite(u.strength) > 0 && u.status !== "defeated" && u.status !== "pending" && Number.isFinite(Number(u.lng)) && Number.isFinite(Number(u.lat));

export const resolveAiClashes = (units, wars, { round = 1, date = "" } = {}) => {
  const list = (Array.isArray(units) ? units : []).map((u) => ({ ...u }));
  const wList = normalizeWars(wars);
  const battles = [];
  const events = [];
  const warLogs = new Map();
  // Sorted by id so the sequence — and so the compounding of losses for a
  // unit facing several enemies — is the same however the list was stored.
  const order = list.map((u, i) => ({ u, i })).filter(({ u }) => fightable(u)).sort((x, y) => str(x.u.id).localeCompare(str(y.u.id)));
  for (let p = 0; p < order.length; p += 1) {
    for (let q = p + 1; q < order.length; q += 1) {
      const A = list[order[p].i];
      const B = list[order[q].i];
      if (!fightable(A) || !fightable(B)) continue;
      const ownerA = str(A.ownerCode ?? A.owner);
      const ownerB = str(B.ownerCode ?? B.owner);
      if (!ownerA || !ownerB || lower(ownerA) === lower(ownerB)) continue;
      const between = warsBetween(wList, ownerA, ownerB);
      if (between.length === 0) continue;
      const km = distanceKm(A, B);
      const reachA = engagementRangeKm(A.type, date) >= km;
      const reachB = engagementRangeKm(B.type, date) >= km;
      if (!reachA && !reachB) continue;
      const war = between[0];
      let attacker = A;
      let defender = B;
      if (reachA && reachB) {
        if (sideOf(war, ownerB) === "a" && sideOf(war, ownerA) !== "a") { attacker = B; defender = A; }
      } else if (reachB) { attacker = B; defender = A; }
      const clash = resolveClash(attacker, defender, round);
      const scale = LOSS_SCALE_FLOOR + (1 - LOSS_SCALE_FLOOR) * war.intensity;
      const attackerLoss = Math.round((attacker.strength - clash.attackerStrength) * scale);
      const defenderLoss = Math.round((defender.strength - clash.defenderStrength) * scale);
      attacker.strength = Math.max(0, attacker.strength - attackerLoss);
      defender.strength = Math.max(0, defender.strength - defenderLoss);
      attacker.status = attacker.strength > 0 ? "engaged" : "defeated";
      defender.status = defender.strength > 0 ? "engaged" : "defeated";
      const where = { lng: Number(defender.lng), lat: Number(defender.lat) };
      const winner = clash.attackerWins ? attacker : defender;
      const routed = attacker.strength === 0 ? attacker : defender.strength === 0 ? defender : null;
      battles.push({ warId: war.id, attackerId: attacker.id, defenderId: defender.id, attackerLoss, defenderLoss, attackerWins: clash.attackerWins, routed: routed ? routed.id : "", where, distanceKm: Math.round(km) });
      const aOwner = str(attacker.ownerCode ?? attacker.owner);
      const dOwner = str(defender.ownerCode ?? defender.owner);
      events.push({
        date,
        kind: "war",
        importance: routed ? "major" : "minor",
        source: "engine",
        warId: war.id,
        title: `${aOwner}'s ${str(attacker.name) || attacker.type} engages ${dOwner}'s ${str(defender.name) || defender.type}`,
        description: `${str(attacker.name) || attacker.type} (${aOwner}) attacked ${str(defender.name) || defender.type} (${dOwner}) at about ${Math.round(km)} km. `
          + `${str(winner.name) || winner.type} held the field; losses ${attackerLoss} for the attacker, ${defenderLoss} for the defender`
          + `${routed ? `; ${str(routed.name) || routed.type} was destroyed` : ""}. (${war.id}, intensity ${war.intensity.toFixed(2)})`,
        participants: [aOwner, dOwner],
      });
      const line = stamp(date, `${str(attacker.name) || attacker.type} vs ${str(defender.name) || defender.type}: -${attackerLoss}/-${defenderLoss}${routed ? " (rout)" : ""}`);
      warLogs.set(war.id, [...(warLogs.get(war.id) ?? []), line]);
    }
  }
  const nextWars = wList.map((w) => (warLogs.has(w.id) ? { ...w, log: [...w.log, ...warLogs.get(w.id)].slice(-12) } : w));
  return { units: list, wars: nextWars, battles, events };
};

// The model may not write casualties by hand: a "strength" op that LOWERS a
// unit whose owner is in no active war is a battle that cannot have happened
// (attrition for unpaid upkeep is the economy's, and resolved there). A raise
// (reinforcement, re-equipment) and every other op pass through; ops naming
// a unit the world does not hold are left to the pipeline's own id check.
export const filterUnitOpsByWars = (unitOps, units, wars) => {
  const kept = [];
  const dropped = [];
  const byId = new Map((Array.isArray(units) ? units : []).filter((u) => u && typeof u === "object").map((u) => [str(u.id), u]));
  for (const op of Array.isArray(unitOps) ? unitOps : []) {
    if (!op || typeof op !== "object" || lower(op.op) !== "strength") { kept.push(op); continue; }
    const unit = byId.get(str(op.unitId ?? op.id));
    if (!unit) { kept.push(op); continue; }
    const owner = str(unit.ownerCode ?? unit.owner);
    const target = finite(op.strength, NaN);
    if (!Number.isFinite(target) || target >= finite(unit.strength)) { kept.push(op); continue; }
    if (isAtWar(wars, owner)) { kept.push(op); continue; }
    dropped.push(`unitOps strength on ${str(unit.name) || unit.id} (${owner}): ${owner} is in no active war, so casualties (${unit.strength} → ${target}) cannot be written by hand; declare the war with warOps and the engine resolves the fighting`);
  }
  return { kept, dropped };
};

// ---- what the model and the player read --------------------------------------------------

export const describeWars = (wars, { playerPolity = "" } = {}) => {
  const list = normalizeWars(wars).filter((w) => w.status !== "ended");
  if (list.length === 0) return "";
  const player = lower(playerPolity);
  return list.map((w) => {
    const you = player && sideOf(w, player) ? ` [${playerPolity} on side ${sideOf(w, player)}]` : "";
    const last = w.log.at(-1);
    return `${w.id}: ${w.sides.a.join(" + ")} (a) vs ${w.sides.b.join(" + ")} (b) — ${w.status}${w.since ? ` since ${w.since}` : ""}, intensity ${w.intensity.toFixed(2)}${w.casus ? `, casus: ${w.casus}` : ""}${you}${last ? `; last: ${last}` : ""}`;
  }).join("\n");
};

export const WARS_RULES = `[Wars — engine state]
The wars listed above are the ONLY wars that exist. No battle, casualty, occupation, siege or conquest can happen between two polities that are not on opposite sides of an ACTIVE war in that list — declare one first with impacts.warOps {"op":"declare","attacker":"<polity>","defender":"<polity>","casus":"<why>","allies":["<co-belligerents on the attacker's side>"]}. A regionTransfer between two belligerents needs their war to be active; a transfer between polities at peace is a cession or a sale, never a capture. Others enter with {"op":"join","war":"<id>","polity":"<name>","side":"a"|"b"}; fighting pauses with {"op":"ceasefire","war":"<id>"}; peace is {"op":"end","war":"<id>","outcome":"a"|"b"|"stalemate","terms":"<what was agreed>"} — a war never simply fades out of the narration, it ends with an outcome. Escalation and exhaustion move {"op":"intensity","war":"<id>","delta":<signed, e.g. +0.2>}.
The engine, not you, resolves the fighting: every jump, units on opposite sides of an active war that stand within engagement range clash deterministically and their losses are applied; the results are listed as events for you to narrate. Do NOT write casualties yourself — a unitOps "strength" that lowers a unit whose owner is in no active war is discarded. A polity's economy is on a war footing (atWar) exactly while it is in an active war, never otherwise.`;
