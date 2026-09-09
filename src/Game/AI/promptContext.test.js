/*! Open Historia — prompt-context assembly tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildConsolidatedHistoryText,
  buildPromptContext,
  consolidationHappened,
  CONSOLIDATED_HISTORY_FULL_ENTRIES,
  resolveHelperValues,
} from "./promptContext.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PACK = JSON.parse(fs.readFileSync(path.join(HERE, "defaultPrompts.json"), "utf8"));

// The stock city catalogue is fetched from /assets/cities-seed.json, which has
// no meaning outside the app. Serve a real one so the test can prove the city
// lines exist and then prove they are absent from the city-free map.
const CITY_SEED = Array.from({ length: 40 }, (_v, i) => ({
  name: `Testopolis ${i}`,
  country: "Testland",
  coord: [10 + i, 20 + i],
  population: 9000000 - i * 1000,
  capital: i === 0 ? "primary" : "",
}));

const withCitySeed = async (run) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("cities-seed.json")) return { ok: true, json: async () => CITY_SEED };
    if (typeof original === "function") return original(url, init);
    throw new Error("no network in tests");
  };
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
};

const bundle = (overrides = {}) => ({
  game: { country: "Holy See", round: 7, gameDate: "2027-03-04", startDate: "2025-01-01", difficulty: "hard", language: "English" },
  world: {},
  events: [],
  actions: [],
  chats: [],
  advisor: [],
  ...overrides,
});

// ---- 1. the city-free map variant -------------------------------------------

test("worldSummaryNoCity is a city-free map: the catalogue exists, and none of it is in that variable", async () => {
  const variables = await withCitySeed(() => buildPromptContext(bundle()));

  // The catalogue really was built, so the assertion below is not vacuous.
  assert.match(variables.citiesSummary, /Testopolis 0 \(Testland\)/);
  assert.ok(variables.citiesSummary.split("\n").length >= 20, "expected a real city catalogue");

  assert.ok(!variables.worldSummaryNoCity.includes("Testopolis"), "the city-free map must carry no city lines");
  assert.ok(!/lat \d+\.\d\d, lng \d+\.\d\d/.test(variables.worldSummaryNoCity), "no city coordinate lines either");
});

test("GRAND_MAP_DESCRIPTION_NO_CITY resolves to the city-free map, GRAND_MAP_DESCRIPTION to the plain one", () => {
  const resolved = resolveHelperValues(PROMPT_PACK.helpers, {
    worldSummary: "PLAIN-MAP",
    worldSummaryNoCity: "NO-CITY-MAP",
    citiesSummary: "- Testopolis: lat 1.00, lng 2.00",
  });
  assert.equal(resolved.GRAND_MAP_DESCRIPTION_NO_CITY, "NO-CITY-MAP");
  assert.equal(resolved.GRAND_MAP_DESCRIPTION, "PLAIN-MAP");
  // The catalogue reaches a prompt only through its own helper.
  assert.equal(resolved.CITY_COORDINATES, "- Testopolis: lat 1.00, lng 2.00");
});

// ---- 2. the minimal context option ------------------------------------------

// Every ${...} nextSpeaker and descriptionToAction interpolate, read from the
// shipped pack rather than restated here — if a template starts asking for
// something new, this test fails instead of the game silently losing it.
const tokensOf = (template) => [...new Set(String(template).matchAll(/\$\{([^}]+)\}/g))].map((m) => m[1]);

test("{ minimal: true } still produces everything nextSpeaker and descriptionToAction interpolate", async () => {
  const chat = {
    id: "c1",
    countries: [{ code: "Holy See", name: "Holy See" }, { code: "Italy", name: "Italy" }],
    messages: [{ role: "user", speaker: "Holy See", text: "We propose a concordat." },
      { role: "model", speaker: "Italy", text: "Rome is listening." }],
  };
  const world = {
    simulationRules: "The Curia governs by synod.",
    startingTimelineText: "A reforming pope has just been elected.",
    organizations: [{ name: "United Nations", kind: "political", members: ["Italy"] }],
    intents: [{ id: "i1", owner: "Italy", summary: "Delay the concordat", kind: "other", stance: "hostile" }],
    canonFacts: ["2025-01-01 A reforming pope was elected."],
    consolidatedHistory: [{ summary: "Early rounds. More prose.", throughDate: "2026-01-01", throughEventId: "e1" }],
  };
  const actions = [{ id: "a1", kind: "action", status: "planned", title: "Send an envoy", text: "Send an envoy to Milan." }];
  const events = [{ id: "e9", date: "2027-02-01", title: "Synod opens", description: "Bishops gather." }];

  const options = { chat, actionInput: "Send an envoy to Milan.", minimal: true };
  const full = await withCitySeed(() => buildPromptContext(bundle({ world, actions, events, chats: [chat] }), { chat, actionInput: "Send an envoy to Milan." }));
  const minimal = await withCitySeed(() => buildPromptContext(bundle({ world, actions, events, chats: [chat] }), options));

  const needed = new Set([
    ...tokensOf(PROMPT_PACK.tasks.nextSpeaker),
    ...tokensOf(PROMPT_PACK.tasks.descriptionToAction),
  ]);
  const helpers = resolveHelperValues(PROMPT_PACK.helpers, full);
  const helpersMinimal = resolveHelperValues(PROMPT_PACK.helpers, minimal);

  for (const token of needed) {
    const inFull = token in PROMPT_PACK.helpers ? helpers[token] : full[token];
    const inMinimal = token in PROMPT_PACK.helpers ? helpersMinimal[token] : minimal[token];
    assert.equal(inMinimal, inFull, `minimal changed what these tasks receive for \${${token}}`);
    assert.notEqual(String(inFull ?? ""), "", `\${${token}} should be non-empty in this fixture`);
  }

  // And it genuinely skipped the expensive work nothing here reads.
  for (const skipped of ["citiesSummary", "organizationsSummary", "intentsSummary", "canonFactsText",
    "economyBrief", "realityCheckText", "recentEventsLong", "consolidatedHistory", "allActions",
    "chatHistoryLong", "chatsToConsolidate", "markersSummary", "unitsSummary"]) {
    assert.equal(minimal[skipped], "", `${skipped} should not be built in minimal mode`);
    assert.notEqual(full[skipped], "", `${skipped} should be non-empty in the full fixture`);
  }
  assert.deepEqual(minimal.economies, {});
  assert.deepEqual(minimal.organizations, []);
});

test("the dead ${chat} variable is gone; the chats still reach the model as prose", async () => {
  const chat = {
    id: "c1",
    countries: [{ code: "Holy See", name: "Holy See" }, { code: "Italy", name: "Italy" }],
    messages: [{ role: "user", speaker: "Holy See", text: "We propose a concordat." }],
  };
  const variables = await withCitySeed(() => buildPromptContext(bundle({ chats: [chat] })));
  assert.equal("chat" in variables, false);
  assert.match(variables.chatSummary, /concordat/);
  assert.match(variables.chatHistoryLong, /concordat/);

  // Nothing in the shipped pack ever asked for it.
  const everyTemplate = JSON.stringify(PROMPT_PACK);
  assert.equal(everyTemplate.includes("${chat}"), false);
});

// ---- 3. the consolidated-history trim ---------------------------------------

const historyOf = (count) => ({
  consolidatedHistory: Array.from({ length: count }, (_v, i) => ({
    summary: `Opening line ${i}. Second sentence ${i} that costs real tokens. Third sentence ${i} that costs more.`,
    throughDate: `20${20 + i}-01-01`,
    throughEventId: `e${i}`,
  })),
});

test("buildConsolidatedHistoryText: the newest entries in full, older ones as their first sentence, pointing at [World Canon]", () => {
  const kept = CONSOLIDATED_HISTORY_FULL_ENTRIES;
  const text = buildConsolidatedHistoryText(historyOf(kept + 4));

  // The four oldest keep only their opening line.
  for (let i = 0; i < 4; i += 1) {
    assert.ok(text.includes(`Opening line ${i}.`), `entry ${i} should keep its opening line`);
    assert.ok(!text.includes(`Second sentence ${i} `), `entry ${i} should be trimmed to one sentence`);
  }
  // The newest six survive whole.
  for (let i = 4; i < kept + 4; i += 1) {
    assert.ok(text.includes(`Third sentence ${i} that costs more.`), `entry ${i} should be kept in full`);
  }
  assert.match(text, /4 older summaries above are shown as their opening line only/);
  assert.match(text, /\[World Canon — Established Facts\]/);
  // Every period is still dated and present — nothing disappears from the list.
  for (let i = 0; i < kept + 4; i += 1) assert.ok(text.includes(`Through 20${20 + i}-01-01:`));
});

test("buildConsolidatedHistoryText: a short history is untouched and shorter than a long one's rendering", () => {
  const short = buildConsolidatedHistoryText(historyOf(CONSOLIDATED_HISTORY_FULL_ENTRIES));
  assert.ok(!short.includes("World Canon"), "no trim note when nothing was trimmed");
  assert.ok(short.includes("Third sentence 0 that costs more."));
  assert.equal(buildConsolidatedHistoryText({}), "No earlier campaign history has been consolidated yet.");

  // The trim is what makes a long history affordable.
  const long = historyOf(24);
  const trimmed = buildConsolidatedHistoryText(long);
  const untrimmed = buildConsolidatedHistoryText(long, { fullEntries: 24 });
  assert.ok(trimmed.length < untrimmed.length * 0.7, `expected a real saving, got ${trimmed.length} vs ${untrimmed.length}`);
});

// ---- 4. one consolidation per jump ------------------------------------------

test("consolidationHappened: true only when the first tier actually added an entry", () => {
  const before = historyOf(3);
  assert.equal(consolidationHappened(before, historyOf(4)), true);
  assert.equal(consolidationHappened(before, before), false);
  assert.equal(consolidationHappened(before, historyOf(3)), false);
  // The second tier REPLACES a run of old entries with one denser entry, so it
  // shortens the list — never mistake that for a first-tier consolidation.
  assert.equal(consolidationHappened(before, historyOf(1)), false);
  assert.equal(consolidationHappened({}, {}), false);
});
