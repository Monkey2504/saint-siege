/*! Open Historia — engine refusals made visible: every op the engine would not execute, as one event the player reads © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The rule this serves: mechanical, not narrative — and the player must SEE
// what the engine refused. A region transfer that matched no map region, a
// unit op with no usable coordinates, an organization op on a body that does
// not exist, an economy lever for a polity with no economy, a transfer the
// world had no basis for, an order's impacts stripped by its verdict: all of
// these used to vanish into console.warn. Here they become ONE synthetic
// event per turn — kind "engine", title "Not executed" — persisted with the
// turn's events, so it shows in the timeline and sits in the history the
// model reads next turn.
//
// Pure: no store reads, no React. Consoles are the caller's business (they
// still log; see gameplay.js).

import { describeUnitOpRejection, normalizeEventEntry, normalizeUnitOp } from "./gameState.js";
import { normalizeIntents } from "./intents.js";
import { normalizeOrganizations } from "./organizations.js";
import { toCountryName } from "./ownerNames.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);

export const REJECTION_EVENT_KIND = "engine";
export const REJECTION_EVENT_TITLE = "Not executed";

// A line is { text, playerRelated } or a plain string (world-side, not the player's).
const toLine = (entry) => (typeof entry === "string"
  ? { text: str(entry), playerRelated: false }
  : { text: str(entry?.text), playerRelated: Boolean(entry?.playerRelated) });

// The synthetic event, normalized like any other so it persists and renders
// the same way. Null when there is nothing to say.
export const buildRejectionEvent = (lines, { date = "", source = "engine" } = {}) => {
  const list = arr(lines).map(toLine).filter((l) => l.text);
  if (!list.length) return null;
  const unique = [...new Map(list.map((l) => [l.text, l])).values()];
  return normalizeEventEntry({
    date,
    title: REJECTION_EVENT_TITLE,
    description: `The engine refused ${unique.length} change${unique.length === 1 ? "" : "s"} this turn:\n${unique.map((l) => `- ${l.text}`).join("\n")}`,
    importance: "minor",
    kind: REJECTION_EVENT_KIND,
    notable: false,
    playerRelated: unique.some((l) => l.playerRelated),
    source,
  });
};

// ---- finding the refusals ------------------------------------------------------------------
//
// entries: [{ raw, event }] in application order — `raw` is the payload event
// as the model sent it (may be absent), `event` the normalized one the world
// will actually apply. world: the state the impacts will be applied to
// (organizations, intents, units, economies). Mirrors the silent skips in
// gameState.applyEventImpactsToWorld, organizations.applyOrganizationOps,
// intents.applyIntentOps and gameState.applyUnitOps — keep them in step.

const unitOpLabel = (op) => {
  const kind = lower(op?.op) || "(no op)";
  const id = str(op?.unitId || op?.id);
  return `Unit op ${kind}${id ? ` for id ${id}` : ""}`;
};

const orgRef = (raw) => str(typeof raw?.organization === "string" ? raw.organization : raw?.organization?.name ?? raw?.id ?? raw?.name);

const intentRefLabel = (ref) => (ref && typeof ref === "object" ? `${str(ref.owner)}${ref.kind ? `/${str(ref.kind)}` : ""}` : str(ref));

export const collectImpactRejections = (entries, world = {}) => {
  const lines = [];
  const unitIds = new Set(arr(world?.units).map((u) => str(u?.id)).filter(Boolean));
  const orgs = normalizeOrganizations(world?.organizations);
  const orgKeys = new Set(orgs.flatMap((o) => [lower(o.id), lower(o.name)]).filter(Boolean));
  const intents = normalizeIntents(world?.intents);
  const intentIds = new Set(intents.map((it) => lower(it.id)));
  const activeOwners = new Set(intents.filter((it) => it.status === "active").map((it) => lower(it.owner)));
  const activeOwnerKinds = new Set(intents.filter((it) => it.status === "active").map((it) => `${lower(it.owner)}|${it.kind}`));
  const economies = world?.economies && typeof world.economies === "object" ? world.economies : {};

  for (const { raw, event } of arr(entries)) {
    const playerRelated = Boolean(event?.playerRelated);
    const push = (text) => lines.push({ text, playerRelated });
    const at = event?.title ? ` in '${str(event.title)}'` : "";

    // Region transfers the resolver dropped (gameplay.resolveRegionTransfers
    // annotates the raw payload with what it refused and why).
    for (const dropped of arr(raw?.impacts?.droppedRegionTransfers)) {
      const label = str(dropped?.regionName) || str(dropped?.regionId) || "(blank)";
      push(`Region transfer of '${label}' to ${str(dropped?.toCode) || "(nobody)"} dropped${at}: ${str(dropped?.reason) || "refused"}${dropped?.remedy ? ` — what would make it valid: ${str(dropped.remedy)}` : ""}`);
    }

    // Unit ops normalizeEventImpacts threw away (bad coordinates, no owner…).
    for (const entry of arr(raw?.impacts?.unitOps)) {
      if (!normalizeUnitOp(entry)) push(`${unitOpLabel(entry)} rejected${at}: ${describeUnitOpRejection(entry)}`);
    }
    // Unit ops that normalized but name a unit the map does not have —
    // applyUnitOps maps over the list and matches nothing, silently.
    for (const op of arr(event?.impacts?.unitOps)) {
      if (op?.op === "spawn") { if (op.unit?.id) unitIds.add(str(op.unit.id)); continue; }
      if (op?.unitId && !unitIds.has(str(op.unitId))) push(`${unitOpLabel(op)} rejected${at}: no unit with that id is on the map`);
      if (op?.op === "remove" && op.unitId) unitIds.delete(str(op.unitId));
    }

    // Organization ops on a body the world does not hold: applyOrganizationOps
    // `continue`s. Bodies created earlier this turn count.
    for (const op of arr(event?.impacts?.organizationOps)) {
      const kind = lower(op?.op);
      if (kind === "create" || kind === "found") {
        const name = str(op?.organization?.name ?? op?.name);
        if (!name) push(`Organization op create ignored${at}: no name`);
        else orgKeys.add(lower(name));
        continue;
      }
      const ref = orgRef(op);
      if (!ref) push(`Organization op ${kind || "(no op)"} ignored${at}: no body named`);
      else if (!orgKeys.has(lower(ref))) push(`Organization op ${kind} on '${ref}' ignored${at}: no such body`);
      else if (kind === "resolve") {
        // Mirrors organizations.applyOrganizationOps' refusals: a resolution
        // put to a body that no longer sits, or tabled by someone who is not
        // a member of it, is refused there — say so here.
        const body = orgs.find((o) => lower(o.id) === lower(ref) || lower(o.name) === lower(ref));
        const proposedBy = str(op?.resolution?.proposedBy);
        const title = str(op?.resolution?.title) || "(untitled)";
        if (body && body.status !== "active") push(`Resolution '${title}' before ${body.name} refused${at}: the body is ${body.status}, not sitting`);
        else if (body && proposedBy && !body.universal && !body.members.some((m) => lower(m) === lower(proposedBy))) push(`Resolution '${title}' before ${body.name} refused${at}: proposed by ${proposedBy}, who is not a member`);
      }
    }

    // Intent ops on a scheme the world does not hold: applyIntentOps `continue`s.
    for (const op of arr(event?.impacts?.intentOps)) {
      const kind = lower(op?.op);
      if (kind === "create") {
        const src = op?.intent && typeof op.intent === "object" ? op.intent : op;
        if (!str(src?.owner) || !str(src?.summary)) { push(`Intent op create ignored${at}: an intent needs an owner and a summary`); continue; }
        const draftKind = lower(src?.kind) || "other";
        activeOwners.add(lower(src.owner));
        activeOwnerKinds.add(`${lower(src.owner)}|${draftKind}`);
        if (str(src?.id)) intentIds.add(lower(src.id));
        continue;
      }
      const ref = op?.intent ?? op?.id ?? { owner: op?.owner, kind: op?.kind };
      const found = ref && typeof ref === "object"
        ? (ref.kind ? activeOwnerKinds.has(`${lower(ref.owner)}|${lower(ref.kind)}`) : activeOwners.has(lower(ref.owner)))
        : (intentIds.has(lower(ref)) || activeOwners.has(lower(ref)));
      const label = intentRefLabel(ref);
      if (!label) push(`Intent op ${kind || "(no op)"} ignored${at}: no intent named`);
      else if (!found) push(`Intent op ${kind} on '${label}' ignored${at}: no such intent`);
    }

    // Economy levers for a polity with no seeded economy: the apply step skips them.
    for (const change of arr(event?.impacts?.polityChanges)) {
      const code = toCountryName(str(change?.code)) || str(change?.code);
      if (!code) continue;
      if (change?.economy && !economies[code]) push(`Economy change for '${code}' dropped${at}: no economy is seeded for that polity`);
      if (arr(change?.projectFinance).length && !economies[code]) push(`Project finance ops for '${code}' dropped${at}: no economy is seeded for that polity`);
    }
  }
  return lines;
};
