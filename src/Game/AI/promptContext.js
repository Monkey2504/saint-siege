import dayjs from "dayjs";
import { JSON_URLS, getNationTags, loadRegionCatalog, readJson } from "../../runtime/assets.js";
import { resolveAllCountryTags, resolveCountryTags } from "../../runtime/countryTags.js";
import { toCountryName } from "../../runtime/ownerNames.js";
import {
  buildActionDisplayText,
  isPolityLandless,
  normalizeActionEntry,
  normalizeActions,
  normalizeChats,
  normalizeEvents,
  normalizeWorldState,
} from "../../runtime/gameState.js";
import { buildRegionOwnershipText } from "./regionVocab.js";
import { buildEconomyBrief, seedEconomy, yearOf } from "../../runtime/economyBridge.js";
import { describeOrganizations, seedOrganizations } from "../../runtime/organizations.js";
import { describeIntents, intentsNeedOtherPowers } from "../../runtime/intents.js";
import { describeFaithful } from "../../runtime/churchFaithful.js";
import { describeDrives } from "../../runtime/drives.js";
import { describeRecord } from "../../runtime/record.js";
import { describeTreasuries } from "../../runtime/treasuries.js";
import { describeLiabilities } from "../../runtime/liabilities.js";
import { describeAssembly } from "../../runtime/factions.js";
import { describeGatherings } from "../../runtime/gatherings.js";
import { describeWars } from "../../runtime/wars.js";
import { describeLeaders } from "../../runtime/succession.js";
import { describeMigration } from "../../runtime/migration.js";
import { describeActorReach } from "../../runtime/worldReach.js";
import { describeEditionBalance } from "../../runtime/editionBalance.js";
import { describeDeclarationReactions } from "../../runtime/inauguration.js";
import { assessPlannedActions, describeRealityCheck } from "../../runtime/realityCheck.js";

// Every planned order tested against the player's real numbers, bodies and
// the schemes already running against it (runtime/realityCheck.js). Pure and
// deterministic, so the jump resolution recomputes the same verdicts to cap
// the model's outcomes.
export const buildRealityAssessments = (bundle, { jumpDays = 0 } = {}) => {
  const world = normalizeWorldState(bundle.world);
  const player = normalizeString(bundle.game?.country);
  return assessPlannedActions(bundle.actions, {
    playerPolity: player,
    economy: world.economies?.[player] ?? null,
    world,
    jumpDays,
  });
};

const normalizeString = (value) => String(value ?? "").trim();
const normalizeArray = (value) => (Array.isArray(value) ? value : []);

export const renderTemplate = (template, variables) =>
  String(template ?? "").replace(/\$\{([^}]+)\}/g, (_match, key) => {
    const value = variables[key];
    return value == null ? "" : String(value);
  });

export const resolveHelperValues = (helperTemplates, variables) => {
  let resolved = {};

  for (let pass = 0; pass < 2; pass += 1) {
    resolved = Object.fromEntries(
      Object.entries(helperTemplates).map(([key, template]) => [
        key,
        renderTemplate(template, { ...variables, ...resolved }),
      ]),
    );
  }

  return resolved;
};

export const getUnconsolidatedEvents = (events, world) => {
  const normalizedEvents = normalizeEvents(events);
  const history = normalizeWorldState(world).consolidatedHistory;
  const throughEventId = history.at(-1)?.throughEventId;
  if (!throughEventId) return normalizedEvents;

  const boundaryIndex = normalizedEvents.findIndex((event) => event.id === throughEventId);
  return boundaryIndex >= 0 ? normalizedEvents.slice(boundaryIndex + 1) : normalizedEvents;
};

export const buildEventHistoryText = (events, { limit = 10, world = null } = {}) => {
  const normalizedEvents = world ? getUnconsolidatedEvents(events, world) : normalizeEvents(events);
  if (normalizedEvents.length === 0) {
    return "No unconsolidated events have been recorded yet.";
  }

  return normalizedEvents
    .slice(-limit)
    .map((event) => {
      const date = normalizeString(event.date) || "undated";
      const description = normalizeString(event.description);
      const impactNotes = [];

      if (event.impacts.regionTransfers.length > 0) {
        impactNotes.push(
          `Territorial shifts: ${event.impacts.regionTransfers
            .map((entry) => `${entry.regionName || entry.regionId} -> ${entry.toCode}`)
            .join(", ")}`,
        );
      }

      if (event.impacts.polityChanges.length > 0) {
        impactNotes.push(
          `Polity changes: ${event.impacts.polityChanges
            .map((entry) => `${entry.code}${entry.name ? ` renamed to ${entry.name}` : ""}${entry.color ? ` color ${entry.color}` : ""}`)
            .join(", ")}`,
        );
      }

      return [
        `- ${date}: ${event.title}`,
        description ? `  ${description}` : "",
        impactNotes.length > 0 ? `  ${impactNotes.join(" | ")}` : "",
      ].filter(Boolean).join("\n");
    })
    .join("\n");
};

// The prose "story so far" grows without limit — measured at 37 KB on a long
// save, re-sent on every jump. The newest entries are what a turn actually
// reasons from; the older ones are already the third or fourth lossy pass over
// the same span, and every atomic, dated fact they contain also lives in
// world.canonFacts, which is sent in FULL on every task and is never
// summarised. So the tail keeps only its opening line, and one line tells the
// model where the facts themselves are — no fact is dropped, only prose that
// restates what [World Canon] already states exactly.
export const CONSOLIDATED_HISTORY_FULL_ENTRIES = 6;

const firstSentence = (value) => {
  const text = normalizeString(value);
  const match = /^[\s\S]*?[.!?](?=\s|$)/.exec(text);
  return normalizeString(match ? match[0] : text) || text;
};

export const buildConsolidatedHistoryText = (world, { fullEntries = CONSOLIDATED_HISTORY_FULL_ENTRIES } = {}) => {
  const entries = normalizeWorldState(world).consolidatedHistory;
  if (entries.length === 0) return "No earlier campaign history has been consolidated yet.";

  const keepFrom = Math.max(0, entries.length - Math.max(0, fullEntries));
  const lines = entries.map((entry, index) => {
    const head = `Through ${entry.throughDate || "an earlier date"}: `;
    return `${head}${index < keepFrom ? firstSentence(entry.summary) : entry.summary}`;
  });
  if (keepFrom > 0) {
    lines.push(
      `(The ${keepFrom} older summar${keepFrom === 1 ? "y above is" : "ies above are"} shown as their opening line `
      + "only. Nothing is lost: the atomic, dated facts of those periods are carried in full under "
      + "[World Canon — Established Facts], which is never summarised.)",
    );
  }
  return lines.join("\n\n");
};

// Did a consolidation actually land between these two world states? Both tiers
// of history compaction are the SAME eventConsolidator task and each costs a
// full AI call, so a jump runs at most one of them (see applySimulationResult):
// the second tier would otherwise re-summarise prose the first tier produced
// seconds earlier, in the same turn.
export const consolidationHappened = (worldBefore, worldAfter) =>
  normalizeWorldState(worldAfter).consolidatedHistory.length
  > normalizeWorldState(worldBefore).consolidatedHistory.length;

export const buildCampaignHistoryText = (events, world, { limit = 24 } = {}) => [
  "STORY SO FAR:",
  buildConsolidatedHistoryText(world),
  "",
  "RECENT EVENTS:",
  buildEventHistoryText(events, { limit, world }),
].join("\n");

export const buildChatSummaryText = (chats, { limit = 4 } = {}) => {
  const normalizedChats = normalizeChats(chats);
  if (normalizedChats.length === 0) return "No diplomatic chats are currently recorded.";

  return normalizedChats.slice(0, limit).map((chat) => {
    const participants = chat.countries.map((country) => country.name).join(", ");
    const lastMessage = chat.messages.at(-1);
    return `- ${participants}: ${lastMessage ? `${lastMessage.speaker || lastMessage.role}: ${lastMessage.text}` : "no messages yet"}`;
  }).join("\n");
};

export const buildDetailedChatHistoryText = (chats, { limit = 8, messageLimit = 10 } = {}) => {
  const normalizedChats = normalizeChats(chats);
  if (normalizedChats.length === 0) return "No chats occurred in these rounds.";

  return normalizedChats.slice(0, limit).map((chat, index) => {
    const header = `Chat ${index + 1}: ${chat.countries.map((country) => country.name).join(", ")}`;
    const body = chat.messages.length > 0
      ? chat.messages.slice(-messageLimit).map((message) => `${message.speaker || message.role}: ${message.text}`).join("\n")
      : "No messages yet.";
    return `${header}\n${body}`;
  }).join("\n\n");
};

export const buildAdvisorHistoryText = (messages, { limit = 18 } = {}) => {
  const normalizedMessages = normalizeArray(messages).map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const role = normalizeString(entry.role || entry.speaker || "message");
    const text = normalizeString(entry.text || entry.content || entry.message);
    return role && text ? `${role}: ${text}` : null;
  }).filter(Boolean);

  return normalizedMessages.length > 0
    ? normalizedMessages.slice(-limit).join("\n")
    : "No advisor messages are currently recorded.";
};

// Resolved actions accumulate for the whole campaign, and every one of them used
// to be re-sent on every turn. On a long save that is the bulk of the prompt — a
// player measured 700k of their 803k characters as nothing but old resolved
// actions — and because this history is interpolated into the prompt more than
// once, it was pasted in repeatedly. Events were always capped (eventLimit /
// longEventLimit); actions simply never were. Matching longEventLimit here.
export const ACTION_HISTORY_LIMIT = 24;

export const buildActionHistoryText = (actions, { includeResolved = false, limit = ACTION_HISTORY_LIMIT } = {}) => {
  const normalizedActions = normalizeActions(actions);
  const renderAction = (action) => {
    const kindLabel = action.kind === "chat" ? "chat" : "action";
    const statusLabel = action.status !== "planned" ? ` [${action.status}]` : "";
    const why = action.outcomeNote ? ` — ${action.outcomeNote}` : "";
    return `- (${kindLabel}) ${action.title}${statusLabel}: ${buildActionDisplayText(action)}${why}`;
  };

  if (!includeResolved) {
    const planned = normalizedActions.filter((action) => action.status === "planned");
    if (planned.length === 0) return "No planned actions are currently queued.";
    return planned.map(renderAction).join("\n");
  }

  if (normalizedActions.length === 0) return "No actions have been recorded yet.";

  // Every PLANNED action survives — those are live orders the model must act on —
  // while only the most recent `limit` finished ones are quoted. The number of
  // dropped entries is stated so the model knows the campaign runs deeper than
  // the excerpt, rather than reading it as a short history.
  const past = normalizedActions.filter((action) => action.status !== "planned");
  const kept = new Set(limit > 0 ? past.slice(-limit) : []);
  const omitted = past.length - kept.size;
  const lines = normalizedActions
    .filter((action) => action.status === "planned" || kept.has(action))
    .map(renderAction);
  if (omitted > 0) {
    lines.unshift(`- (${omitted} earlier resolved action${omitted === 1 ? "" : "s"} omitted from this excerpt)`);
  }
  return lines.join("\n");
};

export const formatActionsForPrompt = (actions) => normalizeArray(actions)
  .map((entry) => {
    if (typeof entry === "string") return entry.trim();
    const normalized = normalizeActionEntry(entry);
    return normalized ? `- ${normalized.title}: ${buildActionDisplayText(normalized)}` : "";
  })
  .filter(Boolean)
  .join("\n");

export const formatDateReadable = (value) => {
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format("D MMMM YYYY") : normalizeString(value);
};

export const buildDifficultyGuidance = (difficulty, mode = "general") => {
  const normalized = normalizeString(difficulty).toLowerCase().replace(/[\s_]+/g, "-");
  const intro = mode === "chats"
    ? "Diplomatic concessions and cooperation should scale with the difficulty."
    : "Long-term success and geopolitical leverage should scale with the difficulty.";

  switch (normalized) {
    case "very-easy": return `${intro} The player can turn even modest preparation into results, and setbacks should stay forgiving.`;
    case "easy": return `${intro} The player can convert reasonable preparation into results relatively easily.`;
    case "hard": return `${intro} The player should need stronger leverage, preparation, and credibility before major outcomes stick.`;
    case "very-hard":
    case "extreme": return `${intro} Major outcomes should require overwhelming preparation, sustained leverage, or unusually favorable conditions.`;
    case "impossible": return `${intro} Outcomes should almost never break the player's way without extraordinary, sustained, multi-front effort.`;
    default: return `${intro} Outcomes should feel plausible and earned without becoming static.`;
  }
};

export const buildRecentRoundsWithDates = (bundle) => {
  const history = normalizeArray(bundle.world?.simulationHistory);
  if (history.length === 0) return `Current round only: ${bundle.game.gameDate || "unknown date"}`;
  return history.slice(0, 8)
    .map((entry) => `${entry.fromDate || "unknown"} -> ${entry.toDate || entry.date || "unknown"}`)
    .join("; ");
};

export const buildUnitsSummaryText = (world) => {
  const units = normalizeArray(world?.units);
  if (units.length === 0) return "No military units are currently deployed on the map.";
  return units.slice(0, 60).map((unit) => {
    const lat = Number(unit.lat);
    const lng = Number(unit.lng);
    const coords = Number.isFinite(lat) && Number.isFinite(lng)
      ? `lat ${lat.toFixed(2)}, lng ${lng.toFixed(2)}`
      : "unknown location";
    return `- ${unit.name} [id ${unit.id}] (${unit.type}, owner ${unit.ownerCode}, strength ${unit.strength}, status ${unit.status}) at ${coords}${unit.regionId ? `, region ${unit.regionId}` : ""}`;
  }).join("\n");
};

// Structures founded during play (world.markers): cities, military bases,
// bunkers, missile silos, embassies. Listed with coordinates so the model can
// reference, defend, target, or expand them — and knows their names are taken.
export const buildMarkersSummaryText = (world) => {
  const markers = normalizeArray(world?.markers);
  if (markers.length === 0) return "No structures have been built during play yet.";
  return markers.slice(0, 60).map((marker) => {
    const lat = Number(marker.lat);
    const lng = Number(marker.lng);
    const coords = Number.isFinite(lat) && Number.isFinite(lng)
      ? `lat ${lat.toFixed(2)}, lng ${lng.toFixed(2)}`
      : "unknown location";
    return `- ${marker.name} [id ${marker.id}] (${marker.kind}${marker.ownerCode ? `, owner ${marker.ownerCode}` : ""}) at ${coords}${marker.note ? ` — ${marker.note}` : ""}`;
  }).join("\n");
};

// City coordinates for the model, so troop deployments and events land on the
// actual city instead of a guess. Two sources, mirroring the map's own layer:
// custom-city scenarios use their era set; everything else uses the significant
// slice of the stock database (capitals + metropolises). Only the stock slice is
// cached — it's a static asset, while the custom set changes with the scenario.
const CITY_CATALOG_LIMIT = 200;
let _stockCityCatalogCache = null;

// Same resolution the editor's city importer uses: the seed rides the content
// node on web builds and same-origin /assets locally.
// (`import.meta.env` is undefined outside Vite — node --test — so it is read
// defensively; the pure helpers in this module are unit-tested there.)
const CITY_SEED_URL = `${(import.meta.env?.VITE_OH_PMTILES_URL || "/assets").replace(/\/$/, "")}/cities-seed.json`;

const formatCityLine = (name, country, lat, lng, extra = "") =>
  `- ${name}${country ? ` (${country})` : ""}: lat ${Number(lat).toFixed(2)}, lng ${Number(lng).toFixed(2)}${extra}`;

export const buildCityCatalogText = async (world) => {
  try {
    if (world?.customCities) {
      const geojson = await readJson(JSON_URLS.citiesGeojson, { defaultValue: null, force: true });
      const features = normalizeArray(geojson?.features)
        .filter((feature) => Array.isArray(feature?.geometry?.coordinates))
        .sort((a, b) =>
          (b.properties?.tier ?? 0) - (a.properties?.tier ?? 0)
          || (b.properties?.population ?? 0) - (a.properties?.population ?? 0))
        .slice(0, CITY_CATALOG_LIMIT);
      if (features.length) {
        return features.map((feature) => {
          const props = feature.properties ?? {};
          const [lng, lat] = feature.geometry.coordinates;
          return formatCityLine(props.city || props.name || "Unnamed", "", lat, lng, props.capital === "primary" ? " (capital)" : "");
        }).join("\n");
      }
      return "No city coordinate catalog is available.";
    }

    if (_stockCityCatalogCache) return _stockCityCatalogCache;
    const response = await fetch(CITY_SEED_URL);
    const seed = response.ok ? await response.json() : [];
    const significant = normalizeArray(seed)
      .filter((city) => Array.isArray(city?.coord)
        && (city.capital === "primary" || (city.population ?? 0) >= 2000000))
      .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
      .slice(0, CITY_CATALOG_LIMIT);
    if (significant.length) {
      _stockCityCatalogCache = significant.map((city) =>
        formatCityLine(city.name, city.country, city.coord[1], city.coord[0], city.capital === "primary" ? " (capital)" : ""),
      ).join("\n");
      return _stockCityCatalogCache;
    }
    return "No city coordinate catalog is available.";
  } catch {
    // A missing catalog degrades to the old behavior (model guesses), never breaks a jump.
    return "No city coordinate catalog is available.";
  }
};

const loadRegions = async () => loadRegionCatalog().catch(() => []);

// The land the player's polity holds — or an explicit statement that it holds none.
// A landless player is a deliberate scenario, not missing data (a government in
// exile, a stateless movement leading a campaign to take a nation back), so it must
// read to the model as an intentional condition rather than an empty field, or the
// model tries to run a normal territorial power and invents holdings.
const LANDLESS_PLAYER_TEXT =
  "This polity is LANDLESS — it currently holds no territory. It is a stateless "
  + "actor (a government-in-exile, a movement, or a power that has lost its land), "
  + "and its story is about influence, alliances, insurgency, and the fight to gain "
  + "or retake territory — not about administering provinces it does not have.";

export const buildPlayerPolityRegionsText = async (bundle, regionCatalog = null) => {
  const playerCode = normalizeString(bundle.game.country);
  if (!playerCode) return "No player polity is currently set.";
  const world = normalizeWorldState(bundle.world);
  const entries = Object.entries(world.regionOwnershipOverrides);
  const owns = entries.some(([, ownerCode]) => normalizeString(ownerCode).toLowerCase() === playerCode.toLowerCase());
  // Zero regions AND the polity exists = deliberately landless. Distinguish that
  // from a scenario that simply ships no override list (a stock modern map, where
  // the player owns their country through the base tiles, not an override).
  // isPolityLandless is the shared source of truth for that line (see gameState).
  if (!owns) {
    return isPolityLandless(world, playerCode)
      ? LANDLESS_PLAYER_TEXT
      : "No explicit player region override list is currently recorded.";
  }
  const regions = regionCatalog ?? await loadRegions();
  const lookup = new Map(regions.map((region) => [region.id, region]));
  const names = entries
    .filter(([, ownerCode]) => normalizeString(ownerCode).toLowerCase() === playerCode.toLowerCase())
    .slice(0, 24)
    .map(([regionId]) => lookup.get(regionId)?.name || regionId);
  return names.join(", ");
};

export const buildWorldSummary = async (bundle, regionCatalog = null) => {
  const world = normalizeWorldState(bundle.world);
  const regions = regionCatalog ?? await loadRegions();
  const regionLookup = new Map(regions.map((region) => [region.id, region]));
  const territoryEntries = Object.entries(world.regionOwnershipOverrides);
  const territorySummary = territoryEntries.length === 0
    ? "No territorial overrides from the base scenario are currently recorded."
    : territoryEntries.slice(0, 60).map(([regionId, ownerCode]) => {
      const region = regionLookup.get(regionId);
      return `- ${region?.name || regionId}${region?.country ? ` (${region.country})` : ""} -> ${ownerCode}`;
    }).join("\n");
  const polities = Object.values(world.polityOverrides);
  const politySummary = polities.length === 0
    ? "No dynamic polity overrides are currently recorded."
    : polities.slice(0, 16).map((entry) =>
      // `note` is the polity's lore — the author's (or the faction creator's) own
      // description of who this power is. It was persisted but never reached the
      // model, so a player-written backstory did nothing. It steers the story now.
      `- ${entry.code}: ${entry.name || entry.code}${entry.color ? ` (${entry.color})` : ""}${entry.aliases.length > 0 ? ` aliases ${entry.aliases.join(", ")}` : ""}${entry.note ? ` — ${entry.note}` : ""}`,
    ).join("\n");

  // What each country IS: the map-maker's tags with the AI's own changes layered
  // over them. This is the whole reason tags exist — the model reads it for every
  // task, so "socialist, anti-nato" steers what the Soviet Union plausibly does
  // without any rule saying so. Capped at 40 countries for prompt budget; drop
  // whole countries rather than truncate one list, since "- SOV: socialist," reads
  // as corrupt data to the model.
  const baseTags = await getNationTags().catch(() => ({}));
  const tagged = resolveAllCountryTags(baseTags, world);
  const taggedCodes = Object.keys(tagged);
  const tagSummary = taggedCodes.length === 0
    ? "No countries have defining tags."
    : taggedCodes.slice(0, 40).map((code) => `- ${code}: ${tagged[code].join(", ")}`).join("\n")
      + (taggedCodes.length > 40 ? `\n(+${taggedCodes.length - 40} more tagged countries not listed)` : "");
  const playerTags = resolveCountryTags(baseTags, world, bundle.game.country);

  // The region vocabulary the jump prompt promises ("every ... region ... separated
  // by a comma ... ANALYZE THIS INCREDIBLY CAREFULLY"). Until now nothing filled it,
  // so on a stock map the model saw ZERO region names and invented ones that then
  // failed resolveRegionTransfers and got silently dropped — a narrated capture that
  // never moved the map. buildRegionOwnershipText is TIERED so we hand names where
  // they are needed without dumping all ~3000 provinces every jump: FULL `name (id)`
  // lists only for the powers IN PLAY (the "focus" set below), and codes-only for
  // everyone else (the model names their regions on demand and the retry resolves
  // them). Focus = the player, anyone already re-owned, scenario-defined actors, and
  // the player's active chat partners — the likely belligerents.
  // Every focus token is a FULL COUNTRY NAME, because that is what the vocabulary is
  // keyed by (regionOwnerName). A legacy override still holding "ESP" is canonicalised
  // so it matches "Spain" — otherwise that power silently drops out of the enumerated
  // section and the model is left inventing its region names again.
  const playerName = toCountryName(normalizeString(bundle.game.country));
  const overrideOwnerNames = [...new Set(
    territoryEntries.map(([, owner]) => toCountryName(normalizeString(owner))).filter(Boolean),
  )];
  const actorNames = polities.map((entry) => toCountryName(normalizeString(entry?.code))).filter(Boolean);
  const chatNames = normalizeArray(bundle.chats).flatMap((chat) =>
    normalizeArray(chat?.countries).map((country) => toCountryName(normalizeString(country?.code))).filter(Boolean));
  const focusCodes = [playerName, ...overrideOwnerNames, ...actorNames, ...chatNames].filter(Boolean);
  lastFocus = [...new Set(focusCodes)];
  // Owner name -> display name for both sections: base country names from the catalog,
  // with dynamic polity overrides layered on top (a re-owned/renamed power wins).
  const polityNames = {};
  for (const region of regions) {
    const name = String(region.country || toCountryName(region.countryCode) || "").toLowerCase();
    if (name && !polityNames[name]) polityNames[name] = region.country || toCountryName(region.countryCode);
  }
  for (const entry of polities) {
    if (entry?.code) polityNames[toCountryName(String(entry.code)).toLowerCase()] = entry.name || toCountryName(entry.code);
  }
  const regionOwnershipCatalog = buildRegionOwnershipText(regions, world.regionOwnershipOverrides, {
    focusCodes,
    polityNames,
  });

  return [
    `Player polity: ${bundle.game.country || "Unknown polity"}${playerTags.length ? ` (${playerTags.join(", ")})` : ""}`,
    `Current round: ${bundle.game.round || 1}`,
    `Current date: ${bundle.game.gameDate || "unknown"}`,
    `Language: ${world.language || bundle.game.language || "English"}`,
    `Difficulty: ${bundle.game.difficulty || "standard"}`,
    `World before round one: ${world.startingTimelineText || "No world briefing provided."}`,
    `Simulation rules: ${world.simulationRules || "No extra simulation rules were provided."}`,
    "",
    "Territorial changes from the base scenario:",
    territorySummary,
    "",
    "Map ownership (this IS the comma-separated region list referenced above — the "
      + "region vocabulary for regionTransfers):",
    regionOwnershipCatalog,
    "",
    "Dynamic polity overrides:",
    politySummary,
    "",
    "What each country is (ideology, alignment, posture). Treat these as binding "
      + "characterisation: act, speak and react in keeping with them, and only change "
      + "them via polityChanges when events genuinely reshape a country.",
    tagSummary,
    "",
    world.activeCatalyst
      ? `Active catalyst: ${world.activeCatalyst.title || "untitled"} - ${world.activeCatalyst.premise || world.activeCatalyst.opening || ""}`
      : "No active catalyst scene.",
  ].join("\n");
};

// The powers in play as of the last world summary, for the economy brief.
let lastFocus = [];

// Economies for the powers in play. A power the world has not seeded yet gets
// an era seed here so the prompt never lacks it; the jump persists the seeds
// (see gameplay.js applySimulationResult) so the engine evolves ONE state.
export const economiesForPrompt = (bundle, regions, focus) => {
  const world = normalizeWorldState(bundle.world);
  const year = yearOf(bundle.game.gameDate || bundle.game.startDate);
  const total = Math.max(1, regions.length);
  const owned = new Map();
  for (const region of regions) {
    const owner = toCountryName(normalizeString(world.regionOwnershipOverrides?.[region.id] || region.country || region.countryCode));
    if (owner) owned.set(owner, (owned.get(owner) || 0) + 1);
  }
  const tags = resolveAllCountryTags({}, world);
  const economies = { ...world.economies };
  for (const name of focus) {
    if (!name || economies[name]) continue;
    // An internal Church faction (the reforming-pope mode) is a bloc of
    // cardinals or an order, not a country: seeding it a national economy
    // would hand "the dubia cardinals" a GDP. It reasons from its tags and
    // intents instead; only the Holy See itself has an economy.
    if ((tags[name] || []).includes("church-faction")) continue;
    economies[name] = seedEconomy({ year, regionShare: (owned.get(name) || 1) / total, tags: tags[name] || [] });
  }
  return economies;
};

export const buildPromptContext = async (bundle, {
  actionInput = "",
  advisorLimit = 18,
  catalystChoice = "",
  catalystHistory = "",
  catalystOpening = "",
  catalystPremise = "",
  chat = null,
  chatLimit = 8,
  chatsToConsolidate = "",
  eventLimit = 10,
  eventsToConsolidate = "",
  gameMasterRequest = "",
  longEventLimit = 24,
  // `nextSpeaker` and `descriptionToAction` interpolate only a handful of small
  // variables (PLAYER_POLITY, THIS_CHATS_MOST_RECENT_SPEAKER, CHAT_PARTICIPANTS,
  // THIS_CHAT_HISTORY / WORLD_BEFORE_ROUND_ONE_TEXT, HISTORICAL_PRESET_SIMULATION_RULES,
  // ORIGIN_ROUND_DATE, DESCRIPTION_ACTION_TEXT, GRAND_MAP_DESCRIPTION_NO_CITY,
  // PLAYER_ACTIONS_THIS_ROUND, language) and composeTaskSystemPrompt appends no
  // call-time block to either. Everything else was still being built for them —
  // the 200-city catalogue and its network fetch, the campaign history, the
  // organizations and intents summaries, the reality check, the economy brief —
  // and then thrown away. `minimal` skips those builders and returns "" for
  // them; what these two tasks actually receive is unchanged.
  minimal = false,
  respondingPolityName = "",
  targetDate = "",
} = {}) => {
  const normalizedChat = chat && typeof chat === "object" ? normalizeChats([chat])[0] : null;
  const regionCatalog = await loadRegions();
  const world = normalizeWorldState(bundle.world);
  const date = bundle.game.gameDate || "";
  const target = targetDate || date;
  const playerPolity = bundle.game.country || "";
  const worldSummary = await buildWorldSummary(bundle, regionCatalog);
  // buildWorldSummary emits territory, the region vocabulary, polity overrides,
  // tags and the catalyst — never the city catalogue, which reaches a prompt
  // only through CITY_COORDINATES (${citiesSummary}). Kept as its own key so
  // GRAND_MAP_DESCRIPTION_NO_CITY resolves to a value that is city-free BY
  // CONSTRUCTION rather than by coincidence, and so a future city section added
  // to worldSummary cannot leak into the tasks that asked not to have one.
  const worldSummaryNoCity = worldSummary;
  const citiesSummary = minimal ? "" : await buildCityCatalogText(bundle.world);
  const recentEvents = minimal ? "" : buildEventHistoryText(bundle.events, { limit: eventLimit, world: bundle.world });
  const campaignHistory = minimal ? "" : buildCampaignHistoryText(bundle.events, bundle.world, { limit: longEventLimit });
  const allActions = minimal ? "" : buildActionHistoryText(bundle.actions, { includeResolved: true });
  const actionText = minimal ? "" : formatActionsForPrompt(bundle.actions);
  const consolidatedChatIds = new Set(world.consolidatedHistory.flatMap((entry) => entry.chatIds));
  const unconsolidatedChats = normalizeChats(bundle.chats)
    .filter((entry) => !consolidatedChatIds.has(entry.id));
  const currentChat = normalizedChat ?? unconsolidatedChats[0] ?? null;
  const seededOrganizations = minimal
    ? []
    : seedOrganizations(world.organizations, yearOf(bundle.game.gameDate || bundle.game.startDate));
  // One computation, two consumers: `economies` (the raw map the jump persists)
  // and `economyBrief` (its rendering) used to call economiesForPrompt twice,
  // re-seeding every unseeded power a second time for no reason.
  const economies = minimal ? {} : economiesForPrompt(bundle, regionCatalog, lastFocus);

  return {
    actionInput,
    actions: actionText,
    advisorMessages: minimal ? "" : buildAdvisorHistoryText(bundle.advisor || [], { limit: advisorLimit }),
    allActions,
    catalystChoice,
    catalystDate: date,
    catalystHistory,
    catalystOpening,
    catalystPercent: normalizeArray(bundle.world?.activeCatalyst?.history).length > 0
      ? `${Math.min(100, normalizeArray(bundle.world.activeCatalyst.history).length * 50)}%`
      : "0%",
    catalystPremise,
    citiesSummary,
    // `chat` (JSON.stringify of every unconsolidated chat) is gone: no template
    // in defaultPrompts.json, no helper, and no renderTemplate caller ever
    // referenced ${chat} — it was serialised in full on every task and never
    // read. The chats themselves still reach the model as prose, through
    // chatHistory / chatHistoryLong / chatSummary / chatsToConsolidate.
    chatHistory: currentChat?.messages?.map((message) => `${message.speaker || message.role}: ${message.text}`).join("\n") || "No chat history.",
    chatHistoryLong: minimal ? "" : buildDetailedChatHistoryText(unconsolidatedChats, { limit: chatLimit }),
    chatParticipants: currentChat?.countries?.map((country) => country.name).join(", ") || "",
    chatSummary: minimal ? "" : buildChatSummaryText(unconsolidatedChats),
    chatsToConsolidate: minimal ? "" : (chatsToConsolidate || buildDetailedChatHistoryText(unconsolidatedChats, { limit: 12, messageLimit: 50 })),
    consolidatedHistory: minimal ? "" : buildConsolidatedHistoryText(bundle.world),
    date,
    dateReadable: formatDateReadable(date),
    difficulty: bundle.game.difficulty || "standard",
    difficultyGuidanceChats: buildDifficultyGuidance(bundle.game.difficulty, "chats"),
    difficultyGuidanceJumpForward: buildDifficultyGuidance(bundle.game.difficulty, "jump"),
    eventsToConsolidate: minimal ? "" : (eventsToConsolidate || buildEventHistoryText(bundle.events, { limit: 12 })),
    gameMasterRequest,
    language: bundle.world.language || bundle.game.language || "English",
    lastSpeaker: currentChat?.messages?.at(-1)?.speaker || "",
    markersSummary: minimal ? "" : buildMarkersSummaryText(bundle.world),
    numberOfRegions: String(regionCatalog.length),
    plannedActions: buildActionHistoryText(bundle.actions),
    playerBattalionSummaries: minimal ? "" : buildUnitsSummaryText(bundle.world),
    playerPolity: playerPolity || "Unknown polity",
    playerPolityRegions: minimal ? "" : await buildPlayerPolityRegionsText(bundle, regionCatalog),
    recentEvents,
    recentEventsLong: campaignHistory,
    recentRoundsWithDates: buildRecentRoundsWithDates(bundle),
    respondingPolityName: respondingPolityName || currentChat?.countries.find((country) => country.name !== bundle.game.country)?.name || "",
    round: String(bundle.game.round || 1),
    simulationRules: normalizeString(bundle.world.simulationRules) || "No extra simulation rules were provided.",
    startDate: bundle.game.startDate || "",
    targetDate: target,
    targetDateReadable: formatDateReadable(target),
    unitsSummary: minimal ? "" : buildUnitsSummaryText(bundle.world),
    worldBeforeRoundOne: normalizeString(bundle.world.startingTimelineText) || "No pre-game world briefing was provided.",
    worldSummary,
    worldSummaryNoCity,
    organizations: seededOrganizations,
    // "relevant": bodies the player is in, leads, or is named by a resolution or
    // sanction of, render in full; every other body is one line. See
    // describeOrganizations in runtime/organizations.js.
    organizationsSummary: minimal ? "" : describeOrganizations(seededOrganizations, { playerPolity, full: "relevant" }),
    intentsSummary: minimal ? "" : describeIntents(world.intents, { revealSecrets: true }),
    canonFactsText: minimal ? "" : world.canonFacts.join("\n"),
    churchSummary: minimal ? "" : describeFaithful(world.church),
    // Every fundraising drive with its target, pledges and collections, and
    // the rule that words move nothing (runtime/drives.js). "Last edition" is
    // measured from the previous jump's date.
    drivesSummary: minimal ? "" : describeDrives(world.drives, { player: playerPolity, sinceDate: world.simulationHistory?.[0]?.fromDate || "", asOf: target || date }),
    // The paper: every stock the engine actually moved, turn by turn. It is
    // what the world reasons about money from (runtime/record.js).
    recordSummary: minimal ? "" : describeRecord(world.record, { player: playerPolity }),
    // Bodies that hold their own money and pay their members
    // (runtime/treasuries.js). Empty until one has been given a purse.
    treasuriesSummary: minimal ? "" : describeTreasuries(world.treasuries, { organizations: seededOrganizations }),
    // Promises nobody funded, and who now carries them (runtime/liabilities.js).
    liabilitiesSummary: minimal ? "" : describeLiabilities(world, playerPolity),
    // The people who decide, counted, and what each faction makes of the year
    // the player has just had (runtime/factions.js).
    assemblySummary: minimal ? "" : describeAssembly(world.assembly),
    // Crowds: what each gathering cost, drew and earned (runtime/gatherings.js).
    gatheringsSummary: minimal ? "" : describeGatherings(world.gatherings, { asOf: target || date, church: world.church, economies }),
    warsSummary: minimal ? "" : describeWars(world.wars, { playerPolity }),
    leadersSummary: minimal ? "" : describeLeaders(world.leaders, { date, playerPolity }),
    migrationSummary: minimal ? "" : describeMigration(world.lastMigration, economies, { playerPolity }),
    // What each power actually holds. A power absent from this block has no
    // lever the model may lend it (runtime/worldReach.js).
    actorReachSummary: minimal ? "" : describeActorReach({ ...world, economies }, { player: playerPolity }),
    // What the last jump was actually about, measured (runtime/editionBalance.js):
    // the events the newest history entry produced, else the newest eight.
    // Answers the world still owes the pope's declaration (runtime/inauguration.js).
    declarationReactionsText: minimal ? "" : describeDeclarationReactions(world),
    editionBalanceText: minimal ? "" : describeEditionBalance((() => {
      const all = Array.isArray(bundle?.events) ? bundle.events : [];
      const ids = new Set(world?.simulationHistory?.[0]?.eventIds ?? []);
      const last = ids.size ? all.filter((e) => ids.has(e?.id)) : [];
      return last.length ? last : [...all].sort((a, b) => String(b?.date).localeCompare(String(a?.date))).slice(0, 8);
    })(), { world, player: playerPolity }),
    realityCheckText: minimal
      ? ""
      : describeRealityCheck(buildRealityAssessments(bundle, { jumpDays: Math.max(0, dayjs(target).diff(dayjs(date), "day") || 0) })),
    intentsAllPlayerOwned: minimal ? false : intentsNeedOtherPowers(world.intents, playerPolity),
    economies,
    economyBrief: minimal ? "" : buildEconomyBrief(economies, {
      playerPolity,
      focus: lastFocus,
      flows: world.lastEconomyFlows ?? {},
      programs: world.programs ?? {},
    }),
  };
};
