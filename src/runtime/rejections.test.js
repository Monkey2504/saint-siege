/*! Open Historia — tests: engine refusals become one visible event © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEvents, normalizeWorldState } from "./gameState.js";
import { buildRejectionEvent, collectImpactRejections, REJECTION_EVENT_KIND, REJECTION_EVENT_TITLE } from "./rejections.js";

test("buildRejectionEvent: one normalized event, kind engine, minor, one line per refusal, playerRelated when any line concerns the player; nothing when there is nothing to say", () => {
  const event = buildRejectionEvent([
    { text: "Order 'Invade Poland' blocked: region transfer of 'Pomorskie' to Germany not executed", playerRelated: true },
    "Organization op join on 'NATOO' ignored: no such body",
    "Organization op join on 'NATOO' ignored: no such body",
  ], { date: "1939-09-01" });
  assert.equal(event.kind, REJECTION_EVENT_KIND);
  assert.equal(event.title, REJECTION_EVENT_TITLE);
  assert.equal(event.importance, "minor");
  assert.equal(event.notable, false);
  assert.equal(event.playerRelated, true);
  assert.equal(event.date, "1939-09-01");
  assert.equal(event.source, "engine");
  assert.match(event.description, /^The engine refused 2 changes this turn:\n- Order 'Invade Poland' blocked.*\n- Organization op join on 'NATOO' ignored: no such body$/);
  assert.deepEqual(event.impacts.regionTransfers, [], "the synthetic event carries no impacts of its own");
  assert.ok(event.id && event.createdAt, "normalized like any other event");
  // Round-trips through the event log's normalizer unchanged.
  assert.deepEqual(normalizeEvents([event])[0], event);

  const worldOnly = buildRejectionEvent(["Unit op move for id x rejected: no unit with that id is on the map"]);
  assert.equal(worldOnly.playerRelated, false);
  assert.match(worldOnly.description, /refused 1 change this turn/);
  assert.equal(buildRejectionEvent([]), null);
  assert.equal(buildRejectionEvent([{ text: "  " }]), null);
});

const world = normalizeWorldState({
  units: [{ id: "u1", name: "1st Corps", ownerCode: "Germany", lng: 13.4, lat: 52.5 }],
  organizations: [{ name: "NATO", kind: "alliance", members: ["United States", "France"] }],
  intents: [{ id: "fr-1", owner: "France", kind: "diplomatic", summary: "Court Warsaw", status: "active" }],
  economies: { Germany: { seed: "ai" } },
});

test("collectImpactRejections: every silent skip becomes a line — dropped transfers (from the resolver's annotation), unit ops that normalize to nothing or name no unit, organization and intent ops on bodies the world lacks, economy levers for un-seeded polities", () => {
  const raw = {
    title: "The Reich moves",
    playerRelated: true,
    impacts: {
      droppedRegionTransfers: [
        { regionId: "Bayern", regionName: "", toCode: "Austria", reason: "no such region — no map region matches that id or name", remedy: "the region's exact in-game name in regionId" },
        { regionId: "POL.11_1", regionName: "Pomorskie", toCode: "Germany", reason: "Germany has no forces", remedy: "a unit on the map" },
      ],
      unitOps: [
        { op: "move", unitId: "u1", toLng: 0, toLat: 0 },
        { op: "spawn", unit: { name: "Ghost", lng: 37.06, lat: 55 } },
        { op: "move", unitId: "u404", toLng: 21, toLat: 52 },
        { op: "spawn", unit: { id: "u2", name: "New", ownerCode: "Germany", lng: 21, lat: 52 } },
        { op: "strength", unitId: "u2", strength: 50 },
      ],
      organizationOps: [
        { op: "join", organization: "NATOO", member: "Poland" },
        { op: "join", organization: "nato", member: "Germany" },
        { op: "create", organization: { name: "Axis", members: ["Germany", "Italy"] } },
        { op: "leave", organization: "Axis", member: "Italy" },
        { op: "create", organization: {} },
        { op: "dissolve" },
      ],
      intentOps: [
        { op: "advance", intent: "fr-1", stageDelta: 10 },
        { op: "advance", intent: { owner: "Spain", kind: "military" } },
        { op: "resolve", intent: "de-99" },
        { op: "create", intent: { owner: "Germany", kind: "military", summary: "Take the corridor" } },
        { op: "advance", intent: { owner: "Germany", kind: "military" } },
        { op: "create", intent: { owner: "Germany" } },
        { op: "abandon" },
      ],
      polityChanges: [
        { code: "Germany", economy: { shift: { openness: 1 } } },
        { code: "Poland", economy: { shift: { openness: 1 } }, projectFinance: [{ op: "start" }] },
      ],
    },
  };
  const [event] = normalizeEvents([raw]);
  const lines = collectImpactRejections([{ raw, event }], world);
  const texts = lines.map((l) => l.text);
  assert.ok(lines.every((l) => l.playerRelated === true), "lines inherit the event's playerRelated");
  assert.deepEqual(texts, [
    "Region transfer of 'Bayern' to Austria dropped in 'The Reich moves': no such region — no map region matches that id or name — what would make it valid: the region's exact in-game name in regionId",
    "Region transfer of 'Pomorskie' to Germany dropped in 'The Reich moves': Germany has no forces — what would make it valid: a unit on the map",
    "Unit op move for id u1 rejected in 'The Reich moves': move to 0,0 — the output template's placeholder, not a real position",
    "Unit op spawn rejected in 'The Reich moves': spawn has no owner",
    "Unit op move for id u404 rejected in 'The Reich moves': no unit with that id is on the map",
    "Organization op join on 'NATOO' ignored in 'The Reich moves': no such body",
    "Organization op create ignored in 'The Reich moves': no name",
    "Organization op dissolve ignored in 'The Reich moves': no body named",
    "Intent op advance on 'Spain/military' ignored in 'The Reich moves': no such intent",
    "Intent op resolve on 'de-99' ignored in 'The Reich moves': no such intent",
    "Intent op create ignored in 'The Reich moves': an intent needs an owner and a summary",
    "Intent op abandon ignored in 'The Reich moves': no intent named",
    "Economy change for 'Poland' dropped in 'The Reich moves': no economy is seeded for that polity",
    "Project finance ops for 'Poland' dropped in 'The Reich moves': no economy is seeded for that polity",
  ]);
});

test("collectImpactRejections: nothing to report is an empty list; a raw entry may be absent; world-side events yield world-side lines", () => {
  const [clean] = normalizeEvents([{ title: "Quiet", impacts: { unitOps: [{ op: "move", unitId: "u1", toLng: 14, toLat: 52 }], organizationOps: [{ op: "join", organization: "NATO", member: "Poland" }] } }]);
  assert.deepEqual(collectImpactRejections([{ raw: undefined, event: clean }], world), []);
  const [bad] = normalizeEvents([{ title: "Elsewhere", playerRelated: false, impacts: { unitOps: [{ op: "remove", unitId: "nope" }] } }]);
  const lines = collectImpactRejections([{ event: bad }], world);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].playerRelated, false);
  assert.deepEqual(collectImpactRejections(null, world), []);
});
