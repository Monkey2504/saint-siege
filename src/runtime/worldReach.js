/*! Open Historia — the same check for everyone © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The player's orders were held to budget, reach, legitimacy, votes, standing
// opposition, time and forces. The world's own moves were held to nothing. So a
// player with an empty treasury could not send a letter, while a national church
// in schism could coordinate the whole European banking system against him — and
// the game read as though everyone were against the player by construction.
//
// This module runs the SAME assessment on the world's actors and binds their
// events the same way. Nothing here is a new scale or a new judgement: it calls
// realityCheck.assessAction with the acting entity in the player's place, and
// strips exactly what bindImpactsToVerdicts strips.
//
// It adds two constraints that only make sense for a non-player actor, and both
// read declared state rather than guessing from prose:
//
//   remit  — a faction declares what it is about (intents carry `scope`). An
//            event that has it acting on something outside that list is the
//            model lending it a reach it never claimed.
//   mandate— a body acts by resolution. An organization that moves the map
//            without one has not decided anything; it is a name in a sentence.

import { assessAction } from "./realityCheck.js";
import { normalizeOrganizations } from "./organizations.js";
import { normalizeIntents } from "./intents.js";

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const lower = (v) => str(v).toLowerCase();

// What the model is told, at call time, about acting in the world's name.
export const WORLD_REACH_RULES = [
  "[World Actors — Reach]",
  "The reality check applies to EVERY actor, not only the player. A world event that moves the map is assessed against the acting power's own budget, administrative reach, legitimacy, standing opposition and forces, exactly as a player order is, and its map changes are dropped when that assessment blocks it.",
  "Name the acting power in `actor` on any event whose impacts move the map. An event with no actor is ambience — weather, markets, a mood — and must carry no region transfer and no unit op.",
  "A power may use only what it commands. A faction acts inside the remit its own schemes declare; outside it, it can talk, leak and lobby, not seize or freeze.",
  "A body — an alliance, a bloc, a council — acts only through a resolution that PASSED. Absent that, its members act individually or not at all.",
  "Escalation is proportionate to what the escalating side actually holds. A dispute with one national church does not become a continental banking blockade, and a third party joins only when it has its own stated intent or a resolution binding it.",
].join("\n");

/**
 * Who acts in this event. Explicit `actor` first, then the polity the event
 * changes, then the polity a region is transferred TO — the taker is the one
 * doing something. Ambience returns "".
 */
export const resolveEventActor = (event) => {
  const explicit = str(event?.actor);
  if (explicit) return explicit;
  const impacts = event?.impacts && typeof event.impacts === "object" ? event.impacts : {};
  const change = Array.isArray(impacts.polityChanges) ? impacts.polityChanges.find(Boolean) : null;
  if (change) return str(change.name) || str(change.code);
  const transfer = Array.isArray(impacts.regionTransfers) ? impacts.regionTransfers.find(Boolean) : null;
  if (transfer) return str(transfer.toCode);
  return "";
};

const movesTheMap = (event) => {
  const impacts = event?.impacts && typeof event.impacts === "object" ? event.impacts : {};
  const transfers = Array.isArray(impacts.regionTransfers) ? impacts.regionTransfers.length : 0;
  const unitOps = Array.isArray(impacts.unitOps) ? impacts.unitOps.length : 0;
  return transfers + unitOps > 0;
};

const eventText = (event) => `${str(event?.title)} ${str(event?.description)}`;

/**
 * One world event against the world, from the acting power's side.
 * Returns null when there is nothing to assess (no actor, or the player's own —
 * those are already bound to the player's order verdicts).
 */
export const assessWorldEvent = (event, ctx = {}) => {
  const actor = resolveEventActor(event);
  if (!actor) return null;
  const player = str(ctx.player);
  if (player && lower(actor) === lower(player)) return null;

  const world = ctx.world && typeof ctx.world === "object" ? ctx.world : {};
  const economies = world.economies && typeof world.economies === "object" ? world.economies : {};
  const organizations = normalizeOrganizations(world.organizations);
  const intents = normalizeIntents(world.intents);
  const text = eventText(event);

  // The actor's own economy, if the world holds one for it. A faction has none,
  // and then the money constraints simply do not fire — which is correct: a
  // faction has no treasury to be short of.
  const economyKey = Object.keys(economies).find((key) => lower(key) === lower(actor));
  const assessment = assessAction(
    { id: str(event?.id), title: str(event?.title), text: str(event?.description) },
    {
      playerPolity: actor,
      economy: economyKey ? economies[economyKey] : null,
      world: { organizations: world.organizations, intents: world.intents, units: world.units },
      jumpDays: ctx.jumpDays,
    },
  );

  const constraints = [...assessment.constraints];
  const push = (factor, severity, detail, remedy) => constraints.push({ factor, severity, detail, remedy });

  // --- remit: a faction acts on what its own schemes are about ---------------
  const own = intents.filter((it) => lower(it.owner) === lower(actor) && it.status === "active");
  const isPolity = Boolean(economyKey);
  if (!isPolity && own.length) {
    const declared = [...new Set(own.flatMap((it) => it.scope))];
    // No declared scope at all means the faction claims everything, which is
    // what a total enemy is; that is a choice the world made and is left alone.
    if (declared.length && !declared.some((keyword) => lower(text).includes(keyword))) {
      push("remit", 0.85,
        `${actor} acts here on something outside anything it has declared (${declared.join(", ")}); a faction has no lever it never reached for`,
        "have it work through a power that does hold the lever, or declare the aim first");
    }
  }

  // --- mandate: a body acts by resolution ------------------------------------
  const body = organizations.find((o) => lower(o.name) === lower(actor));
  if (body) {
    const passed = body.resolutions.filter((r) => r.passed);
    if (!passed.length) {
      push("mandate", 0.95,
        `${body.name} has passed no resolution: a body that has not voted has decided nothing, whatever is said in its name`,
        `put it to ${body.name} and carry the vote (${body.votingRule}) before it acts`);
    }
  }

  constraints.sort((a, b) => b.severity - a.severity);
  const worst = constraints.reduce((m, c) => Math.max(m, c.severity), 0);
  const verdict = worst >= 0.9 ? "blocked" : worst >= 0.4 ? "constrained" : "feasible";
  return { ...assessment, actor, constraints, verdict };
};

const transferLabel = (t) => `'${str(t?.regionName) || str(t?.regionId)}' to ${str(t?.toCode)}`;
const unitOpLabel = (op) => `${str(op?.op)}${op?.unitId ? ` for id ${str(op.unitId)}` : op?.unit?.id ? ` of ${str(op.unit.id)}` : ""}`;

/**
 * Bind the world's own events to the world's own verdicts, with exactly the
 * stripping the player's events get: a blocked actor keeps its narration and
 * loses its map changes; a constrained one keeps at most one region transfer.
 * Events that move nothing are never touched — a mood needs no mandate.
 */
export const bindWorldImpacts = (events, ctx = {}) => {
  const list = Array.isArray(events) ? events : [];
  const rejections = [];

  const bound = list.map((event) => {
    if (!event || typeof event !== "object") return event;
    // The player's own orders are bound by their own verdicts upstream; binding
    // them twice would strip a success the player legitimately won.
    if (event.playerRelated) return event;
    if (!movesTheMap(event)) return event;

    const transfers = Array.isArray(event.impacts?.regionTransfers) ? event.impacts.regionTransfers : [];
    const unitOps = Array.isArray(event.impacts?.unitOps) ? event.impacts.unitOps : [];

    // The rule the model is given says an event with no actor is ambience and
    // carries no map change. Saying it is not enough: a map change nobody made
    // is stripped here, so the rule holds whether or not the model followed it.
    if (!resolveEventActor(event)) {
      const why = "no acting power: a map change nobody made is ambience, not an act";
      for (const t of transfers) rejections.push({ text: `Unattributed (${why}): region transfer of ${transferLabel(t)} in '${str(event.title)}' not executed`, playerRelated: false });
      for (const op of unitOps) rejections.push({ text: `Unattributed (${why}): unit op ${unitOpLabel(op)} in '${str(event.title)}' not executed`, playerRelated: false });
      return { ...event, impacts: { ...event.impacts, regionTransfers: [], unitOps: [] } };
    }

    const assessment = assessWorldEvent(event, ctx);
    if (!assessment || assessment.verdict === "feasible") return event;
    const why = assessment.constraints?.[0]?.detail || "";
    const who = assessment.actor;

    if (assessment.verdict === "blocked") {
      for (const t of transfers) rejections.push({ text: `${who} blocked${why ? ` (${why})` : ""}: region transfer of ${transferLabel(t)} in '${str(event.title)}' not executed`, playerRelated: false });
      for (const op of unitOps) rejections.push({ text: `${who} blocked${why ? ` (${why})` : ""}: unit op ${unitOpLabel(op)} in '${str(event.title)}' not executed`, playerRelated: false });
      return { ...event, impacts: { ...event.impacts, regionTransfers: [], unitOps: [] } };
    }

    if (transfers.length <= 1) return event;
    for (const t of transfers.slice(1)) rejections.push({ text: `${who} constrained${why ? ` (${why})` : ""}: region transfer of ${transferLabel(t)} in '${str(event.title)}' dropped — a partial success reaches one region, not a front`, playerRelated: false });
    return { ...event, impacts: { ...event.impacts, regionTransfers: [transfers[0]] } };
  });

  return { events: bound, rejections };
};

/**
 * What each power can bring to bear, for the prompt. Only powers the world
 * actually holds something for are listed: an actor absent from this block has
 * no lever the model may lend it.
 */
export const describeActorReach = (world, { player = "", limit = 8 } = {}) => {
  const economies = world?.economies && typeof world.economies === "object" ? world.economies : {};
  const organizations = normalizeOrganizations(world?.organizations);
  const intents = normalizeIntents(world?.intents).filter((it) => it.status === "active");
  const units = Array.isArray(world?.units) ? world.units : [];

  const lines = [];
  const owners = [...new Set(intents.map((it) => it.owner).filter(Boolean))];
  const powers = [...new Set([...Object.keys(economies), ...owners])]
    .filter((name) => lower(name) !== lower(player))
    .slice(0, limit);

  for (const name of powers) {
    const hasUnits = units.some((u) => lower(u?.owner ?? u?.ownerCode ?? u?.country) === lower(name));
    const bodies = organizations.filter((o) => o.members.some((m) => lower(m) === lower(name))).map((o) => o.name);
    const own = intents.filter((it) => lower(it.owner) === lower(name));
    const scope = [...new Set(own.flatMap((it) => it.scope))];
    const parts = [
      Object.keys(economies).some((k) => lower(k) === lower(name)) ? "has an economy the engine tracks" : "no economy of its own",
      hasUnits ? "has forces on the map" : "no forces on the map",
      bodies.length ? `sits in ${bodies.join(", ")}` : "sits in no body",
      scope.length ? `declared aims: ${scope.join(", ")}` : "no declared aims",
    ];
    lines.push(`- ${name}: ${parts.join("; ")}`);
  }

  if (!lines.length) return "";
  return ["[World Actors — Reach]", ...lines].join("\n");
};
