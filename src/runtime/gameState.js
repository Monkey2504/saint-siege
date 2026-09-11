/*! Open Historia — portions (troop deployments + era troop types) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import { JSON_URLS, readJson, writeJson } from "./assets.js";
import { enqueueContentStrings } from "./translator.js";
import { normalizeTagList } from "./countryTags.js";
import { normalizeEconomy } from "./economy.js";
import { applyEconomyChange } from "./economyBridge.js";
import { applyOrganizationEffects, applyOrganizationOps, normalizeOrganizations } from "./organizations.js";
import { applyIntentEffects, applyIntentOps, normalizeIntents } from "./intents.js";
import { applyFaithfulOps, normalizeChurch } from "./churchFaithful.js";
import { applyDriveOps, bookDriveGains, normalizeDrives, syFromMillions } from "./drives.js";
import { appendRecord, normalizeRecord } from "./record.js";
import { applyTreasuryOps, normalizeTreasuries } from "./treasuries.js";
import { normalizeAssembly } from "./factions.js";
import { applyGatheringOps, normalizeGatherings, realizedMargin } from "./gatherings.js";
import { applyMigrationOps, normalizeMigration } from "./migration.js";
import { applyWarOps, normalizeWars } from "./wars.js";
import { applyLeaderOps, normalizeLeaders } from "./succession.js";
import { normalizeExtraRegions } from "./extraRegions.js";
import { applyProgramOps, normalizeProgram } from "./projectFinance.js";
import { dedupeEventLog } from "./eventDedup.js";
import { toCountryName } from "./ownerNames.js";

export const GAME_DEFAULTS = {
  country: "",
  difficulty: "standard",
  gameDate: "",
  language: "English",
  round: 1,
  startDate: "",
};

export const WORLD_DEFAULTS = {
  actionSuggestions: [],
  activeCatalyst: null,
  consolidatedHistory: [],
  // Atomic, dated, one-line facts — a regime change, a war's outcome, a
  // treaty, a divergence from real history — that are NEVER re-summarized,
  // unlike consolidatedHistory's prose. Research on long-running LLM memory
  // is consistent that recursive summarization is lossy (one study found it
  // discards up to 60% of facts); atomic facts recorded once and only ever
  // APPENDED to are the compression-tolerant anchor prose consolidation
  // can't be. Capped generously (200), not because facts should ever be
  // forgotten, but as a last-resort bound.
  canonFacts: [],
  // Per-polity international reputation (0-100), evolved by the AI each turn via
  // polityChanges and fed back into prompts. Authoritative, unlike the on-demand
  // stat sheet it was first read from.
  internationalReputation: {},
  // Per-polity intelligence service (0-100), the same shape and lifecycle as
  // reputation: moved by the AI through polityChanges.intelligence, absent means
  // ordinary.
  intelligence: {},
  // Persisted per-country stat sheets (code -> the full sheet), seeded on first view
  // and thereafter changed ONLY by the AI (polityChanges.stats), so a country's stats
  // stop regenerating/drifting every date change.
  countryStats: {},
  // Per-country tags the AI has changed: owner code -> string[]. The scenario's
  // tags.json holds the map-maker's STARTING tags; this holds every change since,
  // and wins where present (see resolveCountryTags).
  countryTags: {},
  // The economic engine's state per polity (country name -> economy, see
  // runtime/economy.js): seeded from the era the first time a power matters,
  // stepped deterministically across every jump, and moved by the AI only
  // through polityChanges.economy (capacities and policy, never the stocks).
  economies: {},
  // The flows of the last jump, per polity, for the next prompt's "this
  // period" line (see economyBridge.buildEconomyBrief).
  lastEconomyFlows: {},
  // Who actually moved between polities last jump (see runtime/migration.js):
  // the corridors the engine computed from wages, war and border policy, plus
  // the movements an event caused through impacts.migrationOps. The population
  // has ALREADY been moved when this is written — this is the record the
  // prompt narrates from, not a proposal.
  lastMigration: { asOf: "", flows: [], log: [] },
  // International bodies — leagues, alliances, blocs, councils — with their
  // members and resolutions (see runtime/organizations.js). Moved only by
  // impacts.organizationOps; the player acts in them through actions.
  organizations: [],
  // Standing multi-turn schemes a polity OR an organization is working
  // toward — a real record (id, target, stage, status), not a hope that the
  // model re-types the same tag every turn (see runtime/intents.js). Moved
  // only by impacts.intentOps.
  intents: [],
  // The reforming-pope mode's live count of the faithful, per continent —
  // stepped every jump from real demography and the Holy See's standing,
  // moved by impacts.faithfulOps (see runtime/churchFaithful.js). null when
  // the game is not that mode.
  church: null,
  // Fundraising drives (see runtime/drives.js): a target, what was pledged,
  // what was collected, every movement dated. Moved only by impacts.driveOps;
  // what is collected enters the owner's patrimony.
  drives: [],
  // The record (see runtime/record.js): one dated row per stock the engine
  // actually moved. Written by the engine only — narration writes nothing
  // here, which is what makes it a non-narrative floor under the story.
  record: [],
  // Bodies that hold their own money (see runtime/treasuries.js): capital, what
  // it earns, what they keep and what they hand to their members. A federation
  // of continental bodies inside a larger one is the ordinary case.
  treasuries: [],
  // Gatherings a body holds (see runtime/gatherings.js): what each cost,
  // drew and earned. A body's margin is computed from these, never declared.
  gatherings: [],
  // The people who actually decide, counted (see runtime/factions.js): a fixed
  // roll of seats, factions holding parts of it, and each faction's opinion of
  // how the player governs — which moves on the engine's own figures and drags
  // the seats after it. Null until a scenario seeds one.
  assembly: null,
  // Who is at war with whom (see runtime/wars.js): sides (coalitions), status,
  // intensity, casus. Moved only by impacts.warOps; the engine resolves AI
  // clashes from it and sets every economy's atWar from it.
  wars: [],
  // Who leads each polity and under what tenure (see runtime/succession.js):
  // terms fall due, life-tenure leaders die on a deterministic hazard, a dead
  // pope opens a conclave. Moved by impacts.leaderOps and the engine's step.
  leaders: {},
  // Territory THIS game adds on top of its scenario's map — authored regions
  // ("reg_*" ids) rendered over the base geometry and owned through
  // regionOwnershipOverrides (see runtime/extraRegions.js).
  extraRegions: { type: "FeatureCollection", features: [] },
  // Tokenised-infrastructure programmes, one per polity that runs one (see
  // runtime/projectFinance.js). Moved only by polityChanges.projectFinance.
  programs: {},
  // AI renames of STOCK map cities (which live in PMTiles, not world.markers):
  // lowercased original city name -> new display name. world.markers cities are
  // renamed in place by applyMarkerOps; this is the override layer for the rest.
  cityRenames: {},
  // AI changes to a city's POPULATION, same override shape as cityRenames and for
  // the same reason: stock cities live in PMTiles and cannot be edited in place.
  // Lowercased original city name -> number. Applies to authored cities too, so a
  // siege or a boom moves one number wherever the city came from.
  cityPopulations: {},
  // Country-label styling, set in the scenario settings. Empty = the defaults
  // (Impact, white letters, half-black outline). The font renders from the
  // PLAYER's local fonts — the style has no glyphs endpoint, so MapLibre v5
  // rasterizes every glyph client-side using the stack as a CSS font-family.
  labelFont: "",
  labelHaloColor: "",
  labelTextColor: "",
  language: "English",
  lastJumpMode: "",
  lastJumpSummary: "",
  lastJumpTargetDate: "",
  // Structures built during play (world.markers[]): free-form kinds — a city, a
  // military base, a bunker, a missile silo, an embassy — placed at coordinates
  // and rendered as map markers beside the stock cities. Stored here so they
  // share every existing read/write/poll/normalize path, exactly like units.
  markers: [],
  notes: "",
  polityOverrides: {},
  // Region id -> claimant polity names: the world-data way to mark a region
  // DISPUTED (striped in the administrator's + claimants' colors). Same effect
  // as a claimants list on the region's geojson feature, but declarable by a
  // scenario whose geometry ships as an immutable seed (the modern world), and
  // overridable per-world without touching geometry. Wins over feature props.
  regionClaimants: {},
  regionOwnershipOverrides: {},
  simulationHistory: [],
  simulationRules: "",
  startingTimelineText: "",
  units: [],
};

// Military units that ride along inside world state (world.units[]). Stored here
// so they share every existing read/write/poll/normalize path with no server change.
export const UNIT_TYPES = ["infantry", "armor", "air", "naval", "artillery", "garrison"];
const UNIT_TYPE_SET = new Set(UNIT_TYPES);
// "pending" = a player deployment awaiting AI resolution (rendered translucent).
const UNIT_STATUS_SET = new Set(["idle", "moving", "engaged", "defeated", "pending"]);
const UNIT_SOURCE_SET = new Set(["player", "ai", "scenario"]);

// Every caller of this parses a COORDINATE (lng/lat/toLng/toLat), which is why it
// can afford to be lenient in ways a general number parser could not.
//
// It used to be a bare Number(), and a model writing in a language that uses the
// decimal COMMA answers "37,06" — Number() returns NaN, the unit is discarded, and
// the player sees an event describing a deployment with no troops on the map. The
// same went for a coordinate carrying its unit ("37.06°N"). Recover both instead of
// throwing the deployment away.
//
// A comma is only read as a decimal point when it is the ONLY separator: "1,234.5"
// keeps its usual meaning, so a thousands separator can never silently divide a
// value by a thousand.
const finiteOrNull = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }

  let text = value.trim();
  if (!text) return null;

  // A trailing or leading hemisphere letter carries the sign: 37.06 S is -37.06.
  let sign = 1;
  const hemisphere = /^([NSEW])\s*|\s*([NSEW])$/i.exec(text);
  if (hemisphere) {
    const letter = (hemisphere[1] || hemisphere[2]).toUpperCase();
    if (letter === "S" || letter === "W") sign = -1;
    text = text.replace(/^[NSEW]\s*/i, "").replace(/\s*[NSEW]$/i, "");
  }

  if (text.includes(",") && !text.includes(".")) text = text.replace(",", ".");
  // Degree signs, stray spaces, anything else that is not part of a number.
  text = text.replace(/[^\d+\-.eE]/g, "");
  if (!text || !/\d/.test(text)) return null;

  const num = Number(text);
  return Number.isFinite(num) ? sign * num : null;
};

export const clampUnitStrength = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 100;
  return Math.max(0, Math.min(1000, Math.round(num)));
};

const cloneValue = (value) => {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const normalizeString = (value) => String(value ?? "").trim();

const normalizeOptionalString = (value) => {
  const nextValue = normalizeString(value);
  return nextValue || "";
};

const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const normalizeTextLike = (value) => {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return normalizeOptionalString(value);
  }

  if (value && typeof value === "object") {
    return normalizeOptionalString(
      value.text ??
        value.title ??
        value.label ??
        value.name ??
        value.summary ??
        value.description ??
        value.content ??
        value.result,
    );
  }

  return "";
};

const generateId = (prefix) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;

const normalizeActionParticipants = (value) =>
  normalizeArray(value)
    .map((entry) => normalizeString(entry))
    .filter(Boolean);

// How to undo a queued manual troop order if its action is deleted before the
// next jump (see unitsController): a deploy is removed again, a move snaps the
// unit back, a long-range order restores the prior status (#368).
const normalizeUnitRevert = (value) => {
  if (!value || typeof value !== "object") return null;
  const unitId = normalizeOptionalString(value.unitId);
  if (!unitId) return null;
  const lng = finiteOrNull(value.lng);
  const lat = finiteOrNull(value.lat);
  // A RESOLVED assault (Game/Map/unitsController attackRegion/attackFeature)
  // undoes more than a position: restoreUnits is the pre-battle snapshot of
  // every unit the clash touched — destroyed ones included, so a wiped-out
  // garrison comes back — and regionOwnership/markerOwner hand a captured
  // province or a seized structure back to whoever held it. Dropping these on
  // write is what left a deleted assault's casualties and capture standing
  // while the attacker walked back to where it started.
  const restoreUnits = normalizeArray(value.restoreUnits)
    .map((entry, index) => normalizeUnitEntry(entry, index))
    .filter(Boolean);
  const regionId = normalizeOptionalString(value.regionOwnership?.regionId);
  const markerId = normalizeOptionalString(value.markerOwner?.markerId);
  return {
    unitId,
    ...(lng !== null && lat !== null ? { lng, lat } : {}),
    ...(value.remove === true ? { remove: true } : {}),
    ...(normalizeOptionalString(value.status) ? { status: normalizeOptionalString(value.status) } : {}),
    ...(restoreUnits.length ? { restoreUnits } : {}),
    ...(regionId ? { regionOwnership: {
      regionId,
      previousOwner: toCountryName(normalizeOptionalString(value.regionOwnership.previousOwner)),
    } } : {}),
    ...(markerId ? { markerOwner: {
      markerId,
      previousOwner: toCountryName(normalizeOptionalString(value.markerOwner.previousOwner)),
    } } : {}),
  };
};

export const normalizeActionEntry = (entry, index = 0) => {
  if (typeof entry === "string") {
    const text = normalizeString(entry);
    if (!text) return null;

    return {
      createdAt: new Date().toISOString(),
      id: generateId(`action-${index}`),
      kind: "action",
      participants: [],
      rawInput: text,
      source: "manual",
      status: "planned",
      text,
      title: text.length > 64 ? `${text.slice(0, 61)}...` : text,
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const rawInput = normalizeTextLike(entry.rawInput || entry.input || entry.text || entry.content);
  const text = normalizeTextLike(entry.text || entry.content || entry.body || rawInput);
  const title =
    normalizeTextLike(entry.title || entry.name) ||
    (text.length > 64 ? `${text.slice(0, 61)}...` : text);

  if (!title && !text && !rawInput) {
    return null;
  }

  const kind =
    normalizeString(entry.kind || entry.type).toLowerCase() === "chat"
      ? "chat"
      : "action";

  const unitRevert = normalizeUnitRevert(entry.unitRevert);

  return {
    chatStarter: normalizeOptionalString(entry.chatStarter || entry.openingMessage),
    createdAt: normalizeOptionalString(entry.createdAt) || new Date().toISOString(),
    id: normalizeOptionalString(entry.id) || generateId(`action-${index}`),
    invitees: normalizeActionParticipants(entry.invitees),
    kind,
    participants: normalizeActionParticipants(entry.participants),
    rawInput: rawInput || text || title,
    source: normalizeOptionalString(entry.source) || "manual",
    // The philosophy a suggested option embodies, when its topic sets several
    // against each other; kept on the queued order so the ledger says which
    // school the player chose.
    ...(normalizeOptionalString(entry.stance) ? { stance: normalizeOptionalString(entry.stance) } : {}),
    status: normalizeOptionalString(entry.status) || "planned",
    suggestionTopic: normalizeOptionalString(entry.suggestionTopic || entry.topic),
    text: text || rawInput || title,
    title: title || rawInput || text,
    ...(unitRevert ? { unitRevert } : {}),
    // How the order actually fared once a jump judged it (runtime/realityCheck.js):
    // the capped outcome and the constraint that decided it, kept so the
    // history the model reads says WHY, not merely "resolved".
    ...(normalizeOptionalString(entry.outcome) ? { outcome: normalizeOptionalString(entry.outcome) } : {}),
    ...(normalizeOptionalString(entry.outcomeNote) ? { outcomeNote: normalizeOptionalString(entry.outcomeNote) } : {}),
    ...(normalizeOptionalString(entry.verdict) ? { verdict: normalizeOptionalString(entry.verdict) } : {}),
  };
};

export const normalizeActions = (actions) =>
  normalizeArray(actions)
    .map((entry, index) => normalizeActionEntry(entry, index))
    .filter(Boolean);

const normalizeCatalystChoice = (entry, index = 0) => {
  if (typeof entry === "string") {
    const text = normalizeString(entry);
    if (!text) {
      return null;
    }

    return {
      id: generateId(`catalyst-choice-${index}`),
      result: "",
      text,
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const text = normalizeTextLike(entry.text || entry.title || entry.label || entry.name);
  if (!text) {
    return null;
  }

  return {
    ...cloneValue(entry),
    id: normalizeOptionalString(entry.id) || generateId(`catalyst-choice-${index}`),
    result: normalizeTextLike(entry.result || entry.summary || entry.outcome || entry.effect || entry.description),
    text,
  };
};

const normalizeCatalystHistoryEntry = (entry, index = 0) => {
  if (typeof entry === "string") {
    const summary = normalizeString(entry);
    if (!summary) {
      return null;
    }

    return {
      choice: `Step ${index + 1}`,
      summary,
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const choice = normalizeTextLike(entry.choice || entry.text || entry.title || entry.name);
  const summary = normalizeTextLike(entry.summary || entry.result || entry.outcome || entry.description);

  if (!choice && !summary) {
    return null;
  }

  return {
    ...cloneValue(entry),
    choice: choice || `Step ${index + 1}`,
    summary,
  };
};

const normalizeCatalyst = (value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const title = normalizeTextLike(value.title || value.name);
  const premise = normalizeTextLike(value.premise || value.summary || value.description);
  const opening = normalizeTextLike(value.opening || value.text || premise);
  const choices = normalizeArray(value.choices)
    .map((entry, index) => normalizeCatalystChoice(entry, index))
    .filter(Boolean);
  const history = normalizeArray(value.history)
    .map((entry, index) => normalizeCatalystHistoryEntry(entry, index))
    .filter(Boolean);

  if (!title && !premise && !opening && choices.length === 0 && history.length === 0) {
    return null;
  }

  return {
    ...cloneValue(value),
    choices,
    history,
    opening,
    premise,
    title,
  };
};

const normalizeReactionMap = (value) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .map(([name, reaction]) => {
        if (!reaction || typeof reaction !== "object") {
          return [name, null];
        }

        const emoji = normalizeOptionalString(reaction.emoji);
        const code = normalizeOptionalString(reaction.code);

        if (!emoji && !code) {
          return [name, null];
        }

        return [
          name,
          {
            ...(code ? { code } : {}),
            ...(emoji ? { emoji } : {}),
          },
        ];
      })
      .filter(([, reaction]) => reaction),
  );
};

const normalizeChatMessage = (message, index = 0) => {
  if (typeof message === "string") {
    const text = normalizeString(message);
    if (!text) return null;

    return {
      code: "",
      id: generateId(`message-${index}`),
      reactions: {},
      role: "system",
      speaker: "",
      text,
      time: "",
    };
  }

  if (!message || typeof message !== "object") {
    return null;
  }

  const text = normalizeOptionalString(message.text || message.message || message.content);
  if (!text) {
    return null;
  }

  return {
    code: normalizeOptionalString(message.code),
    id: normalizeOptionalString(message.id) || generateId(`message-${index}`),
    reactions: normalizeReactionMap(message.reactions),
    role: normalizeOptionalString(message.role || message.sender) || "system",
    speaker: normalizeOptionalString(message.speaker || message.senderName),
    text,
    time: normalizeOptionalString(message.time || message.date),
  };
};

const normalizeChatCountry = (entry) => {
  if (!entry) {
    return null;
  }

  if (typeof entry === "string") {
    const name = normalizeString(entry);
    if (!name) return null;

    return {
      code: "",
      name,
    };
  }

  if (typeof entry !== "object") {
    return null;
  }

  const name = normalizeOptionalString(entry.name || entry.label || entry.country);
  const code = normalizeOptionalString(entry.code || entry.id);

  if (!name && !code) {
    return null;
  }

  return {
    code,
    name: name || code,
  };
};

export const normalizeChatEntry = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const countries = normalizeArray(entry.countries || entry.participants)
    .map((country) => normalizeChatCountry(country))
    .filter(Boolean);
  if (countries.length === 0) return null;

  return {
    countries,
    id: normalizeOptionalString(entry.id) || generateId(`chat-${index}`),
    linkedEventId: normalizeOptionalString(entry.linkedEventId || entry.eventId),
    messages: normalizeArray(entry.messages)
      .map((message, messageIndex) => normalizeChatMessage(message, messageIndex))
      .filter(Boolean),
    source: normalizeOptionalString(entry.source) || "manual",
    status: normalizeOptionalString(entry.status) || "open",
    title: normalizeOptionalString(entry.title),
  };
};

export const normalizeChats = (chats) =>
  normalizeArray(chats)
    .map((entry, index) => normalizeChatEntry(entry, index))
    .filter(Boolean);

const normalizeRegionTransfer = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const regionId = normalizeOptionalString(entry.regionId || entry.id || entry.gid || entry.GID_1);
  // Owners are stored as the FULL COUNTRY NAME. This value is written straight into
  // world.regionOwnershipOverrides, so a model that answered "ESP" out of habit would
  // otherwise mint a phantom country that paints and labels itself beside the real
  // Spain. Canonicalise on the way in, once, rather than papering over it at render.
  const toCode = toCountryName(normalizeOptionalString(entry.toCode || entry.toPolity || entry.ownerCode || entry.owner));
  const fromCode = toCountryName(normalizeOptionalString(entry.fromCode || entry.fromPolity));

  if (!regionId || !toCode) {
    return null;
  }

  return {
    fromCode,
    note: normalizeOptionalString(entry.note || entry.reason),
    regionId,
    regionName: normalizeOptionalString(entry.regionName || entry.name),
    toCode,
  };
};

const normalizePolityChange = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const code = toCountryName(normalizeOptionalString(entry.code || entry.id || entry.polityCode));
  if (!code) {
    return null;
  }

  const rawReputation = Number(entry.reputation ?? entry.internationalReputation);
  const reputation = Number.isFinite(rawReputation)
    ? Math.max(0, Math.min(100, Math.round(rawReputation)))
    : null;
  const rawIntelligence = Number(entry.intelligence ?? entry.intelligenceService);
  const intelligence = Number.isFinite(rawIntelligence)
    ? Math.max(0, Math.min(100, Math.round(rawIntelligence)))
    : null;

  // The AI sends the complete new list, so an empty array is meaningful ("this
  // country no longer has defining tags") while undefined means "unchanged" —
  // null keeps those distinguishable for the apply step below.
  const tags = Array.isArray(entry.tags || entry.countryTags)
    ? normalizeTagList(entry.tags || entry.countryTags)
    : null;

  // Persistent stat-sheet update: keep the partial object as-is (the merge + the Stats
  // pane tolerate missing/extra fields); null means "no stat change this period".
  const stats = entry.stats && typeof entry.stats === "object" && !Array.isArray(entry.stats)
    ? entry.stats
    : null;
  // Economic levers (see economyBridge.applyEconomyChange); null = untouched.
  const economy = entry.economy && typeof entry.economy === "object" && !Array.isArray(entry.economy)
    ? entry.economy
    : null;
  const projectFinance = entry.projectFinance == null
    ? null
    : Array.isArray(entry.projectFinance)
      ? entry.projectFinance.filter((op) => {
          const ok = op && typeof op === "object";
          if (!ok) console.warn("[ai] polityChanges.projectFinance entry dropped — not an object:", op);
          return ok;
        })
      : (console.warn("[ai] polityChanges.projectFinance dropped — not an array:", entry.projectFinance), null);

  return {
    economy,
    projectFinance,
    aliases: normalizeActionParticipants(entry.aliases || entry.additionalNames),
    code,
    color: normalizeOptionalString(entry.color),
    name: normalizeOptionalString(entry.name || entry.newName),
    intelligence,
    note: normalizeOptionalString(entry.note || entry.reason),
    reputation,
    stats,
    tags,
  };
};

export const normalizeUnitEntry = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const lng = finiteOrNull(entry.lng ?? entry.lon ?? entry.longitude);
  const lat = finiteOrNull(entry.lat ?? entry.latitude);
  // Full country name, never a code — same identity everywhere (see ownerNames.js).
  const ownerCode = toCountryName(normalizeOptionalString(entry.ownerCode || entry.owner || entry.code));
  if (lng === null || lat === null || (lng === 0 && lat === 0) || !ownerCode) {
    return null;
  }

  const type = normalizeOptionalString(entry.type).toLowerCase();
  const status = normalizeOptionalString(entry.status).toLowerCase();
  const source = normalizeOptionalString(entry.source).toLowerCase();
  const timestamp = new Date().toISOString();

  return {
    id: normalizeOptionalString(entry.id) || generateId(`unit-${index}`),
    name: normalizeOptionalString(entry.name) || "Unit",
    type: UNIT_TYPE_SET.has(type) ? type : "infantry",
    ownerCode,
    strength: clampUnitStrength(entry.strength ?? 100),
    lng,
    lat,
    regionId: normalizeOptionalString(entry.regionId),
    status: UNIT_STATUS_SET.has(status) ? status : "idle",
    note: normalizeOptionalString(entry.note),
    source: UNIT_SOURCE_SET.has(source) ? source : "scenario",
    orderId: normalizeOptionalString(entry.orderId),
    createdAt: normalizeOptionalString(entry.createdAt) || timestamp,
    updatedAt: normalizeOptionalString(entry.updatedAt) || timestamp,
  };
};

export const normalizeUnits = (units) =>
  normalizeArray(units)
    .map((entry, index) => normalizeUnitEntry(entry, index))
    .filter(Boolean);

// A structure built during play: any named point on the map — city, military
// base, bunker, missile silo, embassy, port. `kind` is deliberately free-form
// (lowercased for stable styling/grouping); unknown kinds are first-class.
export const normalizeMarkerEntry = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const lng = finiteOrNull(entry.lng ?? entry.lon ?? entry.longitude);
  const lat = finiteOrNull(entry.lat ?? entry.latitude);
  const name = normalizeOptionalString(entry.name || entry.title);
  if (lng === null || lat === null || (lng === 0 && lat === 0) || !name) {
    return null;
  }

  return {
    id: normalizeOptionalString(entry.id) || generateId(`marker-${index}`),
    name,
    kind: (normalizeOptionalString(entry.kind || entry.type) || "landmark").toLowerCase(),
    ownerCode: toCountryName(normalizeOptionalString(entry.ownerCode || entry.owner || entry.code)),
    lng,
    lat,
    note: normalizeOptionalString(entry.note || entry.description),
    foundedAt: normalizeOptionalString(entry.foundedAt || entry.date),
    createdAt: normalizeOptionalString(entry.createdAt) || new Date().toISOString(),
  };
};

export const normalizeMarkers = (markers) =>
  normalizeArray(markers)
    .map((entry, index) => normalizeMarkerEntry(entry, index))
    .filter(Boolean);

// One AI-authored mutation to the built-structure list: build | remove.
const normalizeMarkerOp = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const op = normalizeOptionalString(entry.op).toLowerCase();

  if (op === "build" || op === "found") {
    const marker = normalizeMarkerEntry(entry.marker ?? entry, 0);
    if (!marker) return null;
    return { op: "build", marker };
  }

  if (op === "remove" || op === "destroy") {
    const markerId = normalizeOptionalString(entry.markerId || entry.id);
    const name = normalizeOptionalString(entry.name);
    if (!markerId && !name) return null;
    return { op: "remove", markerId, name, note: normalizeOptionalString(entry.note) };
  }

  if (op === "rename") {
    const markerId = normalizeOptionalString(entry.markerId || entry.id);
    const name = normalizeOptionalString(entry.name || entry.from || entry.oldName);
    const newName = normalizeOptionalString(entry.newName || entry.to);
    if ((!markerId && !name) || !newName) return null;
    return { op: "rename", markerId, name, newName, note: normalizeOptionalString(entry.note) };
  }

  if (op === "population") {
    const markerId = normalizeOptionalString(entry.markerId || entry.id);
    const name = normalizeOptionalString(entry.name || entry.city);
    const population = Number(entry.population ?? entry.value);
    // 0 is a real outcome — a city emptied by war or evacuation — so only a
    // non-finite or negative number is rejected.
    if ((!markerId && !name) || !Number.isFinite(population) || population < 0) return null;
    return {
      op: "population",
      markerId,
      name,
      population: Math.round(population),
      note: normalizeOptionalString(entry.note),
    };
  }

  return null;
};

// Apply a batch of marker ops (pure). Rebuilding under an existing name
// replaces it rather than stacking duplicates; removal matches id first, then
// exact name — the AI usually knows the name, rarely the id.
export const applyMarkerOps = (markers, ops) => {
  let next = normalizeMarkers(markers);
  for (const op of normalizeArray(ops)) {
    if (op.op === "build") {
      next = [
        ...next.filter((marker) => marker.name.toLowerCase() !== op.marker.name.toLowerCase()),
        op.marker,
      ];
    } else if (op.op === "remove") {
      next = next.filter((marker) =>
        op.markerId ? marker.id !== op.markerId : marker.name.toLowerCase() !== op.name.toLowerCase());
    } else if (op.op === "rename") {
      next = next.map((marker) =>
        (op.markerId ? marker.id === op.markerId : marker.name.toLowerCase() === (op.name || "").toLowerCase())
          ? { ...marker, name: op.newName }
          : marker);
    }
  }
  return next;
};

// One AI-authored mutation to the unit list: spawn | move | strength | remove.
// Why normalizeUnitOp refused an entry, in words a player can paste into a bug
// report. Mirrors the checks below — keep the two in step.
export const describeUnitOpRejection = (entry) => {
  if (!entry || typeof entry !== "object") return "not an object";
  const op = normalizeOptionalString(entry.op).toLowerCase();
  if (!op) return "no op (expected spawn, move, strength or remove)";
  if (op === "spawn") {
    const unit = entry.unit ?? entry;
    if (!unit || typeof unit !== "object") return "spawn without a unit";
    const lng = finiteOrNull(unit.lng ?? unit.lon ?? unit.longitude);
    const lat = finiteOrNull(unit.lat ?? unit.latitude);
    if (lng === null || lat === null) {
      // The usual cause: a non-numeric coordinate ("37,06", "37.06°N") that JSON
      // carried through as a string and Number() turned into NaN.
      return `spawn has unusable coordinates (lng=${JSON.stringify(unit.lng)}, lat=${JSON.stringify(unit.lat)})`;
    }
    if (lng === 0 && lat === 0) return "spawn at 0,0 — the output template's placeholder, not a real position";
    if (!normalizeOptionalString(unit.ownerCode || unit.owner || unit.code)) return "spawn has no owner";
    return "spawn rejected";
  }
  if (!normalizeOptionalString(entry.unitId || entry.id)) return `${op} without a unitId`;
  if (op === "move") {
    const toLng = finiteOrNull(entry.toLng ?? entry.lng);
    const toLat = finiteOrNull(entry.toLat ?? entry.lat);
    if (toLng === null || toLat === null) return `move has unusable destination (toLng=${JSON.stringify(entry.toLng)}, toLat=${JSON.stringify(entry.toLat)})`;
    if (toLng === 0 && toLat === 0) return "move to 0,0 — the output template's placeholder, not a real position";
  }
  return `unknown op "${op}"`;
};

export const normalizeUnitOp = (entry) => {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const op = normalizeOptionalString(entry.op).toLowerCase();
  const unitId = normalizeOptionalString(entry.unitId || entry.id);

  if (op === "spawn") {
    const unit = normalizeUnitEntry(entry.unit ?? entry, 0);
    if (!unit) return null;
    unit.source = "ai";
    return { op, unit };
  }

  if (!unitId) {
    return null;
  }

  if (op === "move") {
    const toLng = finiteOrNull(entry.toLng ?? entry.lng);
    const toLat = finiteOrNull(entry.toLat ?? entry.lat);
    if (toLng === null || toLat === null || (toLng === 0 && toLat === 0)) return null;
    return {
      op,
      unitId,
      toLng,
      toLat,
      regionId: normalizeOptionalString(entry.regionId),
      note: normalizeOptionalString(entry.note),
    };
  }

  if (op === "strength") {
    return { op, unitId, strength: clampUnitStrength(entry.strength ?? 0), note: normalizeOptionalString(entry.note) };
  }

  if (op === "remove") {
    return { op, unitId, note: normalizeOptionalString(entry.note) };
  }

  return null;
};

// Apply a batch of unit ops to a unit list (pure). Ops referencing unknown ids
// are silently ignored; units reduced to <=0 strength are dropped.
export const applyUnitOps = (units, ops) => {
  let next = normalizeUnits(units);
  for (const op of normalizeArray(ops)) {
    if (op.op === "spawn") {
      // Idempotent: skip a spawn whose unit id is already present, so a re-applied
      // op batch can't duplicate a unit (mirrors the event-restatement de-dup).
      const spawnId = op.unit?.id;
      if (!spawnId || !next.some((unit) => unit.id === spawnId)) next.push(op.unit);
    } else if (op.op === "move") {
      next = next.map((unit) =>
        unit.id === op.unitId
          ? {
              ...unit,
              lng: op.toLng,
              lat: op.toLat,
              regionId: op.regionId || unit.regionId,
              status: "moving",
              updatedAt: new Date().toISOString(),
            }
          : unit,
      );
    } else if (op.op === "strength") {
      next = next.map((unit) =>
        unit.id === op.unitId
          ? { ...unit, strength: op.strength, status: op.strength <= 0 ? "defeated" : unit.status, updatedAt: new Date().toISOString() }
          : unit,
      );
    } else if (op.op === "remove") {
      next = next.filter((unit) => unit.id !== op.unitId);
    }
  }
  return next.filter((unit) => unit.strength > 0 && unit.status !== "defeated");
};

const normalizeEventImpacts = (value) => {
  if (!value || typeof value !== "object") {
    return {
      actionIds: [],
      createdChats: [],
      markerOps: [],
      organizationOps: [],
      intentOps: [],
      canonFacts: [],
      faithfulOps: [],
      driveOps: [],
      treasuryOps: [],
      gatheringOps: [],
      migrationOps: [],
      warOps: [],
      leaderOps: [],
      actionOutcomes: [],
      polityChanges: [],
      regionTransfers: [],
      unitOps: [],
    };
  }

  return {
    actionIds: normalizeActionParticipants(value.actionIds),
    createdChats: normalizeChats(value.createdChats),
    markerOps: normalizeArray(value.markerOps).map(normalizeMarkerOp).filter(Boolean),
    organizationOps: normalizeArray(value.organizationOps).filter((entry) => entry && typeof entry === "object"),
    intentOps: normalizeArray(value.intentOps).filter((entry) => entry && typeof entry === "object"),
    canonFacts: normalizeArray(value.canonFacts).map((s) => normalizeOptionalString(s)).filter(Boolean),
    faithfulOps: normalizeArray(value.faithfulOps).filter((entry) => entry && typeof entry === "object"),
    driveOps: normalizeArray(value.driveOps).filter((entry) => entry && typeof entry === "object"),
    treasuryOps: normalizeArray(value.treasuryOps).filter((entry) => entry && typeof entry === "object"),
    gatheringOps: normalizeArray(value.gatheringOps).filter((entry) => entry && typeof entry === "object"),
    migrationOps: normalizeArray(value.migrationOps).filter((entry) => entry && typeof entry === "object"),
    warOps: normalizeArray(value.warOps).filter((entry) => entry && typeof entry === "object"),
    leaderOps: normalizeArray(value.leaderOps).filter((entry) => entry && typeof entry === "object"),
    actionOutcomes: normalizeArray(value.actionOutcomes).filter((entry) => entry && typeof entry === "object"),
    polityChanges: normalizeArray(value.polityChanges).map(normalizePolityChange).filter(Boolean),
    regionTransfers: normalizeArray(value.regionTransfers).map(normalizeRegionTransfer).filter(Boolean),
    // Say WHY a unit op was thrown away. A dropped op is the difference between an
    // event that narrates a deployment and troops that actually appear on the map,
    // and it used to vanish into .filter(Boolean) without a word — leaving no way
    // to tell "the model never emitted one" from "it emitted one we rejected".
    // Region transfers have logged their drops for a while; units now match.
    unitOps: normalizeArray(value.unitOps)
      .map((entry, index) => {
        const normalized = normalizeUnitOp(entry);
        if (!normalized) {
          console.warn(
            `[ai] unitOps[${index}] dropped — ${describeUnitOpRejection(entry)}:`,
            entry,
          );
        }
        return normalized;
      })
      .filter(Boolean),
  };
};

export const normalizeEventEntry = (entry, index = 0) => {
  if (typeof entry === "string") {
    const title = normalizeString(entry);
    if (!title) return null;

    return {
      createdAt: new Date().toISOString(),
      date: "",
      description: "",
      id: generateId(`event-${index}`),
      impacts: normalizeEventImpacts(null),
      importance: "minor",
      kind: "world",
      notable: false,
      playerRelated: false,
      source: "scenario",
      title,
    };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const title =
    normalizeOptionalString(entry.title || entry.headline || entry.name) ||
    normalizeOptionalString(entry.description || entry.summary);

  if (!title) {
    return null;
  }

  return {
    // Who acts, when this event moves the map. Kept because the same reality
    // check that binds the player's orders binds the world's own moves from
    // their actor's side (runtime/worldReach.js); dropping it here would leave
    // that check guessing from the impacts alone.
    actor: normalizeOptionalString(entry.actor),
    createdAt: normalizeOptionalString(entry.createdAt) || new Date().toISOString(),
    date: normalizeOptionalString(entry.date),
    description: normalizeOptionalString(entry.description || entry.summary || entry.text),
    id: normalizeOptionalString(entry.id) || generateId(`event-${index}`),
    impacts: normalizeEventImpacts(entry.impacts),
    importance: normalizeOptionalString(entry.importance) || "minor",
    kind: normalizeOptionalString(entry.kind) || "world",
    notable: Boolean(entry.notable),
    playerRelated: Boolean(entry.playerRelated),
    source: normalizeOptionalString(entry.source) || "scenario",
    title,
  };
};

export const normalizeEvents = (events) => {
  if (Array.isArray(events)) {
    return events
      .map((entry, index) => normalizeEventEntry(entry, index))
      .filter(Boolean);
  }

  if (events && typeof events === "object") {
    if (Array.isArray(events.events)) {
      return normalizeEvents(events.events);
    }

    return Object.values(events)
      .map((entry, index) => normalizeEventEntry(entry, index))
      .filter(Boolean);
  }

  return [];
};

const normalizePolityOverride = (key, value) => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const code = normalizeOptionalString(value.code) || normalizeOptionalString(key);
  if (!code) {
    return null;
  }

  return {
    aliases: normalizeActionParticipants(value.aliases || value.additionalNames),
    code,
    color: normalizeOptionalString(value.color),
    // The leader a player chose at the inauguration (runtime/inauguration.js).
    // It was dropped here on every read, so the papal name lasted exactly until
    // the next normalisation and the sheet's model-written leader took over.
    leader: normalizeOptionalString(value.leader),
    name: normalizeOptionalString(value.name || value.label),
    note: normalizeOptionalString(value.note),
  };
};

const normalizeActionSuggestions = (value) =>
  normalizeArray(value).map((topic) => {
    if (!topic || typeof topic !== "object") {
      return null;
    }

    const title = normalizeOptionalString(topic.title || topic.name);
    if (!title) {
      return null;
    }

    return {
      actions: normalizeArray(topic.actions).map((entry, index) => normalizeActionEntry(entry, index)).filter(Boolean),
      description: normalizeOptionalString(topic.description),
      // What the options under this topic disagree on, when they embody
      // different philosophies (gameplaySchemas.js, promptAssembly.js).
      dilemma: normalizeOptionalString(topic.dilemma),
      id: normalizeOptionalString(topic.id) || generateId("topic"),
      title,
    };
  }).filter(Boolean);

const normalizeConsolidatedHistory = (value) => normalizeArray(value)
  .map((entry) => {
    if (!entry || typeof entry !== "object") return null;
    const summary = normalizeTextLike(entry.summary);
    if (!summary) return null;
    return {
      // Ids of the resolved player orders folded into this summary. Without it the
      // same orders would be re-summarised every consolidation, and — because this
      // object is a fixed whitelist — an actionIds written by the consolidator
      // would be dropped on the next read and the tracking would never stick.
      actionIds: normalizeActionParticipants(entry.actionIds),
      chatIds: normalizeActionParticipants(entry.chatIds),
      createdAt: normalizeOptionalString(entry.createdAt) || new Date().toISOString(),
      source: normalizeOptionalString(entry.source) || "ai",
      summary,
      throughDate: normalizeOptionalString(entry.throughDate),
      throughEventId: normalizeOptionalString(entry.throughEventId),
      throughRound: Number.isFinite(Number(entry.throughRound))
        ? Math.max(0, Math.trunc(Number(entry.throughRound)))
        : 0,
    };
  })
  .filter(Boolean);

const CANON_FACTS_CAP = 200;
// Deduplicated (a fact restated verbatim adds nothing) and capped as a last
// resort, never re-summarized — see canonFacts' own comment on WORLD_DEFAULTS.
const normalizeCanonFacts = (value) => {
  const seen = new Set();
  const out = [];
  for (const entry of normalizeArray(value)) {
    const fact = normalizeTextLike(entry);
    if (!fact || seen.has(fact)) continue;
    seen.add(fact);
    out.push(fact);
  }
  return out.slice(-CANON_FACTS_CAP);
};

export const normalizeWorldState = (world) => {
  const nextWorld = world && typeof world === "object" ? world : {};
  const polityOverrides = Object.fromEntries(
    Object.entries(nextWorld.polityOverrides ?? {})
      .map(([key, value]) => [key, normalizePolityOverride(key, value)])
      .filter(([, value]) => value),
  );

  const regionOwnershipOverrides = Object.fromEntries(
    Object.entries(nextWorld.regionOwnershipOverrides ?? {})
      // Canonicalise on READ too, so a save written before this migrated still
      // resolves to the same owner identity as everything computed now.
      .map(([regionId, ownerCode]) => [normalizeOptionalString(regionId), toCountryName(normalizeOptionalString(ownerCode))])
      .filter(([regionId, ownerCode]) => regionId && ownerCode),
  );

  const regionClaimants = Object.fromEntries(
    Object.entries(nextWorld.regionClaimants ?? {})
      .map(([regionId, claimants]) => [
        normalizeOptionalString(regionId),
        normalizeArray(claimants).map((name) => normalizeOptionalString(name)).filter(Boolean).slice(0, 4),
      ])
      .filter(([regionId, claimants]) => regionId && claimants.length),
  );

  const internationalReputation = Object.fromEntries(
    Object.entries(nextWorld.internationalReputation ?? {})
      .map(([polityCode, value]) => [normalizeOptionalString(polityCode), Number(value)])
      .filter(([polityCode, value]) => polityCode && Number.isFinite(value))
      .map(([polityCode, value]) => [polityCode, Math.max(0, Math.min(100, Math.round(value)))]),
  );

  // Same treatment as reputation: name-keyed, integer, 0-100.
  const intelligence = Object.fromEntries(
    Object.entries(nextWorld.intelligence ?? {})
      .map(([polityCode, value]) => [normalizeOptionalString(polityCode), Number(value)])
      .filter(([polityCode, value]) => polityCode && Number.isFinite(value))
      .map(([polityCode, value]) => [polityCode, Math.max(0, Math.min(100, Math.round(value)))]),
  );

  // Keyed by country NAME, verbatim — same namespace as internationalReputation
  // above, polityOverrides and colors. This used to uppercase while its neighbours
  // did not, so one applyEventImpacts change.code landed under two different keys
  // (countryTags["RUSSIA"] but internationalReputation["Russia"]). Harmless while
  // owners were uppercase GADM codes; a silent desync the moment they are names.
  const countryTags = Object.fromEntries(
    Object.entries(nextWorld.countryTags ?? {})
      .map(([country, list]) => [normalizeOptionalString(country), normalizeTagList(list)])
      .filter(([country, list]) => country && list.length),
  );

  // Persisted per-country stat sheets: keep each code -> sheet-object entry as-is (the
  // Stats pane tolerates missing fields). Explicit, not via the spread — new-field trap.
  const countryStats = Object.fromEntries(
    Object.entries(nextWorld.countryStats ?? {})
      .filter(([code, sheet]) => normalizeOptionalString(code) && sheet && typeof sheet === "object"),
  );
  // A leader chosen by the player (the inauguration's override) is the leader:
  // a jump that rewrites the sheet with the leader it remembers does not
  // un-elect a pope. Enforced on read so every consumer of the sheet agrees.
  for (const [name, override] of Object.entries(polityOverrides)) {
    if (override.leader && countryStats[name] && countryStats[name].leader !== override.leader) {
      countryStats[name] = { ...countryStats[name], leader: override.leader };
    }
  }
  const economies = Object.fromEntries(
    Object.entries(nextWorld.economies ?? {})
      .filter(([name, state]) => normalizeOptionalString(name) && state && typeof state === "object")
      .map(([name, state]) => [normalizeOptionalString(name), normalizeEconomy(state)]),
  );
  const lastEconomyFlows = nextWorld.lastEconomyFlows && typeof nextWorld.lastEconomyFlows === "object" ? nextWorld.lastEconomyFlows : {};

  return {
    ...WORLD_DEFAULTS,
    ...nextWorld,
    countryTags,
    countryStats,
    economies,
    lastEconomyFlows,
    // Explicit, not via the ...WORLD_DEFAULTS spread — the documented
    // new-world-field trap: a spread default is silently dropped the first
    // time a save written before it round-trips through here.
    lastMigration: normalizeMigration(nextWorld.lastMigration),
    organizations: normalizeOrganizations(nextWorld.organizations),
    intents: normalizeIntents(nextWorld.intents),
    church: normalizeChurch(nextWorld.church),
    drives: normalizeDrives(nextWorld.drives),
    record: normalizeRecord(nextWorld.record),
    treasuries: normalizeTreasuries(nextWorld.treasuries),
    gatherings: normalizeGatherings(nextWorld.gatherings),
    assembly: normalizeAssembly(nextWorld.assembly),
    wars: normalizeWars(nextWorld.wars),
    leaders: normalizeLeaders(nextWorld.leaders),
    extraRegions: normalizeExtraRegions(nextWorld.extraRegions),
    programs: Object.fromEntries(Object.entries(nextWorld.programs ?? {}).map(([name, program]) => [normalizeOptionalString(name), normalizeProgram(program)]).filter(([name, program]) => name && program)),
    actionSuggestions: normalizeActionSuggestions(nextWorld.actionSuggestions),
    activeCatalyst: normalizeCatalyst(nextWorld.activeCatalyst),
    consolidatedHistory: normalizeConsolidatedHistory(nextWorld.consolidatedHistory),
    canonFacts: normalizeCanonFacts(nextWorld.canonFacts),
    internationalReputation,
    intelligence,
    labelFont: normalizeOptionalString(nextWorld.labelFont),
    labelHaloColor: normalizeOptionalString(nextWorld.labelHaloColor),
    labelTextColor: normalizeOptionalString(nextWorld.labelTextColor),
    language: normalizeOptionalString(nextWorld.language) || WORLD_DEFAULTS.language,
    lastJumpMode: normalizeOptionalString(nextWorld.lastJumpMode),
    lastJumpSummary: normalizeOptionalString(nextWorld.lastJumpSummary),
    lastJumpTargetDate: normalizeOptionalString(nextWorld.lastJumpTargetDate),
    notes: normalizeOptionalString(nextWorld.notes),
    polityOverrides,
    regionClaimants,
    regionOwnershipOverrides,
    simulationHistory: normalizeArray(nextWorld.simulationHistory)
      .map((entry) => {
        if (!entry || typeof entry !== "object") {
          return null;
        }

        return {
          ...cloneValue(entry),
          catalyst: normalizeCatalyst(entry.catalyst),
          date: normalizeOptionalString(entry.date),
          eventIds: normalizeActionParticipants(entry.eventIds),
          fallbackReason: normalizeOptionalString(entry.fallbackReason),
          fromDate: normalizeOptionalString(entry.fromDate || entry.startDate),
          mode: normalizeOptionalString(entry.mode),
          plannedActions: normalizeActions(entry.plannedActions || entry.actions),
          round:
            Number.isFinite(Number(entry.round)) && Number(entry.round) > 0
              ? Math.trunc(Number(entry.round))
              : 0,
          summary: normalizeTextLike(entry.summary),
          source: normalizeOptionalString(entry.source) || "ai",
          toDate: normalizeOptionalString(entry.toDate || entry.endDate || entry.date),
        };
      })
      .filter(Boolean),
    markers: normalizeMarkers(nextWorld.markers),
    // Explicit (not via the ...WORLD_DEFAULTS spread) so this new field survives every
    // write path — the documented new-world-field trap.
    cityRenames: Object.fromEntries(
      Object.entries(nextWorld.cityRenames && typeof nextWorld.cityRenames === "object" ? nextWorld.cityRenames : {})
        .map(([key, value]) => [normalizeString(key).toLowerCase(), normalizeString(value)])
        .filter(([key, value]) => key && value),
    ),
    cityPopulations: Object.fromEntries(
      Object.entries(nextWorld.cityPopulations && typeof nextWorld.cityPopulations === "object" ? nextWorld.cityPopulations : {})
        .map(([city, value]) => [normalizeOptionalString(city).toLowerCase(), Number(value)])
        .filter(([city, value]) => city && Number.isFinite(value) && value >= 0),
    ),
    simulationRules: normalizeOptionalString(nextWorld.simulationRules),
    startingTimelineText: normalizeOptionalString(nextWorld.startingTimelineText),
    units: normalizeUnits(nextWorld.units),
  };
};

// Does a polity currently hold no territory? A stateless actor — a
// government-in-exile, a movement, or a person with no country of their own.
// Single source of truth for "landless", used by both the AI prompt
// (buildPlayerPolityRegionsText) and the UI flag resolvers: a landless polity
// with no flag of its own must NOT borrow the code-derived country flag (a
// "stateless person in Japan" is not Japan), so the flag shows neutral instead.
//
// The distinction that matters: owning a region via an override = has land; but
// a scenario that ships NO override list at all means the polity owns its country
// through the base map tiles (a stock modern map), which is NOT landless.
export const isPolityLandless = (world, code) => {
  const polityCode = normalizeString(code);
  if (!polityCode) return false;
  const normalized = normalizeWorldState(world);
  const entries = Object.entries(normalized.regionOwnershipOverrides);
  const owns = entries.some(
    ([, ownerCode]) => normalizeString(ownerCode).toLowerCase() === polityCode.toLowerCase(),
  );
  if (owns) return false;
  const isKnownPolity = Boolean(normalized.polityOverrides?.[polityCode]);
  // No override list AND not a declared polity = stock map, owns via base tiles.
  if (entries.length === 0 && !isKnownPolity) return false;
  return true;
};

// Recover a Gregorian date stored in a loose format back to strict YYYY-MM-DD.
// Older builds wrote the model's stopDate verbatim, so real saves hold values
// like "2016-12-31T00:00:00.000Z" or "December 31, 2016" — the header displays
// them fine, but date math (addIsoDays) rejects them, so every jump silently
// computes target == origin and the game clock freezes forever while the model
// re-simulates the past. Deliberately non-Gregorian scenario dates ("1200 BCE")
// don't parse and pass through untouched.
const canonicalizeDateString = (value) => {
  const text = normalizeOptionalString(value);
  if (!text || /^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  // An ISO date prefix (datetime forms) is authoritative — slicing it avoids
  // the timezone day-shift of parsing "...T00:00:00Z" into local time.
  const prefix = /^(\d{4}-\d{2}-\d{2})[T ]/.exec(text);
  if (prefix) return prefix[1];
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    if (year >= 1 && year <= 9999) {
      return `${String(year).padStart(4, "0")}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
    }
  }
  return text;
};

export const normalizeGameData = (game) => {
  const nextGame = game && typeof game === "object" ? game : {};

  return {
    ...GAME_DEFAULTS,
    ...nextGame,
    country: normalizeOptionalString(nextGame.country),
    difficulty: normalizeOptionalString(nextGame.difficulty) || GAME_DEFAULTS.difficulty,
    gameDate: canonicalizeDateString(nextGame.gameDate),
    language: normalizeOptionalString(nextGame.language) || GAME_DEFAULTS.language,
    round:
      Number.isFinite(Number(nextGame.round)) && Number(nextGame.round) > 0
        ? Math.trunc(Number(nextGame.round))
        : GAME_DEFAULTS.round,
    startDate: canonicalizeDateString(nextGame.startDate),
  };
};

export const buildActionDisplayText = (action) => {
  const normalized = normalizeActionEntry(action);
  if (!normalized) {
    return "";
  }

  return normalized.kind === "chat" && normalized.chatStarter
    ? `${normalized.title}: ${normalized.chatStarter}`
    : normalized.text;
};

export const readWorldState = async ({ force = false } = {}) =>
  normalizeWorldState(await readJson(JSON_URLS.world, { defaultValue: WORLD_DEFAULTS, force }));

export const writeWorldState = async (world, options = {}) => {
  const normalized = normalizeWorldState(world);
  // Edited/AI-written polity names, aliases and notes get translated (and
  // saved to the server language pack) the moment they're written, not when
  // they first happen to be rendered somewhere.
  enqueueContentStrings(normalized.polityOverrides);
  return writeJson(JSON_URLS.world, normalized, { pretty: true, ...options });
};

export const readGameData = async ({ force = false } = {}) =>
  normalizeGameData(await readJson(JSON_URLS.game, { defaultValue: GAME_DEFAULTS, force }));

export const writeGameData = async (game, options = {}) =>
  writeJson(JSON_URLS.game, normalizeGameData(game), { pretty: true, ...options });

export const readActionsState = async ({ force = false } = {}) =>
  normalizeActions(await readJson(JSON_URLS.actions, { defaultValue: [], force }));

export const writeActionsState = async (actions, options = {}) =>
  writeJson(JSON_URLS.actions, normalizeActions(actions), { pretty: true, ...options });

export const readEventsState = async ({ force = false } = {}) =>
  normalizeEvents(await readJson(JSON_URLS.events, { defaultValue: [], force }));

export const writeEventsState = async (events, options = {}) => {
  // Choke-point safety net: no writer can persist a log that already contains
  // exact-duplicate events (the AI restating its own timeline). See eventDedup.js.
  const normalized = dedupeEventLog(normalizeEvents(events));
  // New/edited event text follows the UI language immediately (see above).
  enqueueContentStrings(normalized);
  return writeJson(JSON_URLS.events, normalized, { pretty: true, ...options });
};

export const readChatsState = async ({ force = false } = {}) =>
  normalizeChats(await readJson(JSON_URLS.chat, { defaultValue: [], force }));

export const writeChatsState = async (chats, options = {}) =>
  writeJson(JSON_URLS.chat, normalizeChats(chats), { pretty: true, ...options });

export const readGameStateBundle = async ({ force = false } = {}) => {
  const [actions, chats, events, game, world] = await Promise.all([
    readActionsState({ force }),
    readChatsState({ force }),
    readEventsState({ force }),
    readGameData({ force }),
    readWorldState({ force }),
  ]);

  return {
    actions,
    chats,
    events,
    game,
    world,
  };
};

export const applyEventImpactsToWorld = ({ colors = {}, events = [], world }) => {
  const nextColors = cloneValue(colors) ?? {};
  const nextWorld = normalizeWorldState(world);

  for (const event of normalizeEvents(events)) {
    for (const transfer of event.impacts.regionTransfers) {
      nextWorld.regionOwnershipOverrides[transfer.regionId] = transfer.toCode;
    }

    for (const change of event.impacts.polityChanges) {
      nextWorld.polityOverrides[change.code] = {
        ...(nextWorld.polityOverrides[change.code] ?? {
          aliases: [],
          code: change.code,
          color: "",
          name: "",
          note: "",
        }),
        ...(change.aliases?.length > 0 ? { aliases: change.aliases } : {}),
        ...(change.color ? { color: change.color } : {}),
        ...(change.name ? { name: change.name } : {}),
        ...(change.note ? { note: change.note } : {}),
      };

      if (change.color) {
        const normalizedColor = normalizeOptionalString(change.color);
        const hexMatch = /^#?([a-f0-9]{6})$/i.exec(normalizedColor);
        if (hexMatch) {
          const hex = hexMatch[1];
          nextColors[change.code] = [
            Number.parseInt(hex.slice(0, 2), 16),
            Number.parseInt(hex.slice(2, 4), 16),
            Number.parseInt(hex.slice(4, 6), 16),
          ];
        }
      }

      // An intelligence rating the AI set this turn — a purge, a new bureau, a
      // defector — becomes the polity's authoritative value.
      if (Number.isFinite(change.intelligence)) {
        if (!nextWorld.intelligence || typeof nextWorld.intelligence !== "object") nextWorld.intelligence = {};
        nextWorld.intelligence[change.code] = change.intelligence;
      }

      // Reputation the AI set this turn becomes the polity's authoritative value.
      if (Number.isFinite(change.reputation)) {
        nextWorld.internationalReputation[change.code] = change.reputation;
        // Keep the persisted sheet's reputation index in sync with the authoritative value.
        if (nextWorld.countryStats?.[change.code]?.indices) {
          nextWorld.countryStats[change.code] = {
            ...nextWorld.countryStats[change.code],
            indices: { ...nextWorld.countryStats[change.code].indices, internationalReputation: change.reputation },
          };
        }
      }

      // The economy moves only through the bridge's levers: capacities and
      // policy, never the stocks the engine computes.
      if (change.economy && nextWorld.economies?.[change.code]) {
        nextWorld.economies = { ...nextWorld.economies, [change.code]: applyEconomyChange(nextWorld.economies[change.code], change.economy) };
      } else if (change.economy) {
        // Visible to the player through rejections.collectImpactRejections; logged here too.
        console.warn(`[ai] polityChanges.economy for "${change.code}" dropped — no economy is seeded for that polity.`);
      }
      // A programme's levers, checked by its own rules; refusals are logged.
      if (change.projectFinance?.length && nextWorld.economies?.[change.code]) {
        const applied = applyProgramOps(nextWorld.programs?.[change.code] ?? null, nextWorld.economies[change.code], change.projectFinance);
        if (applied.program) nextWorld.programs = { ...(nextWorld.programs ?? {}), [change.code]: applied.program };
        for (const note of applied.notes) console.info("[projectFinance] " + change.code + ": " + note);
      }

      // Persistent stat sheet: merge the AI's changed fields into the stored sheet so a
      // country's stats change ONLY when the AI changes them (not every date). Deep-merge
      // the nested groups and mirror the reputation index into the authoritative store.
      if (change.stats && typeof change.stats === "object") {
        if (!nextWorld.countryStats || typeof nextWorld.countryStats !== "object") nextWorld.countryStats = {};
        const prev = nextWorld.countryStats[change.code] && typeof nextWorld.countryStats[change.code] === "object"
          ? nextWorld.countryStats[change.code]
          : {};
        const merged = { ...prev, ...change.stats };
        for (const group of ["indices", "economy", "gdpBreakdown"]) {
          if (change.stats[group] && typeof change.stats[group] === "object") {
            merged[group] = { ...(prev[group] || {}), ...change.stats[group] };
          }
        }
        // This country's own past — a war it fought, a coup, an invention —
        // survives independent of the global event timeline and consolidation,
        // which favour the player and the great powers and can compress a
        // minor polity's own history away with nothing left naming it. New
        // entries APPEND (never replace, so a regeneration cannot erase what
        // was recorded), capped so the sheet stays a memory, not a chronicle.
        if (Array.isArray(change.stats.history) && change.stats.history.length) {
          const additions = change.stats.history.map((s) => String(s ?? "").trim()).filter(Boolean);
          merged.history = [...(Array.isArray(prev.history) ? prev.history : []), ...additions].slice(-10);
        } else {
          merged.history = Array.isArray(prev.history) ? prev.history : [];
        }
        nextWorld.countryStats[change.code] = merged;
        const rep = Number(merged.indices?.internationalReputation);
        if (Number.isFinite(rep)) {
          nextWorld.internationalReputation[change.code] = Math.max(0, Math.min(100, Math.round(rep)));
        }
      }

      // Tags the AI set this turn replace the scenario's starting tags for this
      // country, wholesale — the model sends the complete list, so a revolution
      // that drops "socialist" must actually drop it. null means "unchanged",
      // which is why normalizePolityChange distinguishes null from [].
      if (Array.isArray(change.tags)) {
        if (!nextWorld.countryTags || typeof nextWorld.countryTags !== "object") {
          nextWorld.countryTags = {};
        }
        if (change.tags.length) nextWorld.countryTags[change.code] = change.tags;
        else delete nextWorld.countryTags[change.code];
      }
    }

    if (event.impacts.unitOps?.length) {
      nextWorld.units = applyUnitOps(nextWorld.units, event.impacts.unitOps);
    }

    if (event.impacts.organizationOps?.length) {
      const applied = applyOrganizationOps(nextWorld.organizations, event.impacts.organizationOps, { date: event.date });
      nextWorld.organizations = applied.organizations;
      if (applied.effects.length && nextWorld.economies) {
        nextWorld.economies = applyOrganizationEffects(nextWorld.economies, applied.effects, { applyChange: applyEconomyChange });
      }
    }

    if (event.impacts.intentOps?.length) {
      // An event that resolves one of the player's own orders provokes the
      // schemes it touches; any other event moves a hostile scheme only
      // outside its cool-down (runtime/intents.js).
      const provoked = Boolean(event.playerRelated) || (Array.isArray(event.impacts.actionIds) && event.impacts.actionIds.length > 0);
      const applied = applyIntentOps(nextWorld.intents, event.impacts.intentOps, { date: event.date, provoked });
      for (const line of applied.refusals ?? []) console.warn(`[intents] ${line}`);
      nextWorld.intents = applied.intents;
      if (applied.effects.length && nextWorld.economies) {
        nextWorld.economies = applyIntentEffects(nextWorld.economies, applied.effects, { normalizeEconomy });
        // A loan that really moved SY between two treasuries is two rows: the
        // paper shows both sides, so neither can be narrated away later.
        const rows = [];
        for (const eff of applied.effects) {
          if (eff?.type !== "loan" || !(eff.amount > 0)) continue;
          rows.push({ date: event.date, polity: eff.borrower, kind: "money", what: "prêt reçu", amount: eff.amount, unit: "SY", source: `loan:${eff.lender}` });
          rows.push({ date: event.date, polity: eff.lender, kind: "money", what: "prêt versé", amount: -eff.amount, unit: "SY", source: `loan:${eff.borrower}` });
        }
        nextWorld.record = appendRecord(nextWorld.record, rows);
      }
    }

    // World canon: atomic, dated facts that are never re-summarized (see
    // WORLD_DEFAULTS.canonFacts) — appended here, straight from the event
    // that established them, before any consolidation has a chance to
    // dilute them.
    if (event.impacts.canonFacts?.length) {
      nextWorld.canonFacts = normalizeCanonFacts([...(Array.isArray(nextWorld.canonFacts) ? nextWorld.canonFacts : []), ...event.impacts.canonFacts]);
    }

    // Real people moving between the Church's continents — only in the
    // reforming-pope mode (no ledger, no effect), only through the typed op.
    if (event.impacts.faithfulOps?.length && nextWorld.church) {
      nextWorld.church = applyFaithfulOps(nextWorld.church, event.impacts.faithfulOps, { date: event.date });
    }

    // Money a drive raised — only through the typed op (runtime/drives.js).
    // What is collected is booked into the owner's patrimony in the engine's
    // unit; refusals (an unknown drive, a collection over what was pledged)
    // are logged the way warOps' are.
    if (event.impacts.driveOps?.length) {
      const applied = applyDriveOps(nextWorld.drives, event.impacts.driveOps, { date: event.date });
      nextWorld.drives = applied.drives;
      if (nextWorld.economies && Object.keys(applied.gains).length) {
        // The record is written from what was actually booked, in the engine's
        // own unit — so the paper and the patrimony can never disagree.
        const rows = [];
        for (const [owner, gains] of Object.entries(applied.gains)) {
          const economy = nextWorld.economies[owner];
          if (!economy) continue;
          for (const g of gains) {
            const sy = syFromMillions(g.millions, g.currency, economy);
            if (sy > 0) rows.push({ date: event.date, polity: owner, kind: "patrimony", what: "collecté par une campagne", amount: sy, unit: "SY", source: `drive:${g.millions} ${g.currency}` });
          }
        }
        nextWorld.economies = bookDriveGains(nextWorld.economies, applied.gains, { normalizeEconomy });
        nextWorld.record = appendRecord(nextWorld.record, rows);
      }
      for (const line of applied.refusals) console.warn(`[drives] ${line}`);
    }

    // A body's own purse: opened, capitalised, its margin set, its key chosen
    // (runtime/treasuries.js). The distribution itself is the engine's step,
    // not an op — nobody narrates a payout.
    if (event.impacts.treasuryOps?.length) {
      const applied = applyTreasuryOps(nextWorld.treasuries, event.impacts.treasuryOps, { date: event.date, organizations: nextWorld.organizations });
      nextWorld.treasuries = applied.treasuries;
      for (const line of applied.refusals) console.warn(`[treasuries] ${line}`);
    }

    // Crowds: what a gathering cost, drew and earned, with the surplus into
    // the host's purse (runtime/gatherings.js). The engine decides how many
    // came; the story may add only an overrun and the patronage that arrived.
    if (event.impacts.gatheringOps?.length) {
      const applied = applyGatheringOps(nextWorld.gatherings, event.impacts.gatheringOps, {
        date: event.date,
        church: nextWorld.church,
        economies: nextWorld.economies,
        treasuries: nextWorld.treasuries,
      });
      nextWorld.gatherings = applied.gatherings;
      if (applied.treasuries.length) nextWorld.treasuries = applied.treasuries;
      nextWorld.record = appendRecord(nextWorld.record, applied.rows);
      // A great gathering is a renewal of faith, so the register feels it.
      if (applied.faithfulOps?.length && nextWorld.church) {
        nextWorld.church = applyFaithfulOps(nextWorld.church, applied.faithfulOps, { date: event.date });
      }
      for (const line of applied.refusals) console.warn(`[gatherings] ${line}`);
      // What the gatherings returned is recorded against the body, so its
      // prospectus can be checked against its crowds. It is NOT added to the
      // margin: the surplus was already paid into the purse the day the
      // gathering was held, and a yield on capital would pay it a second time.
      nextWorld.treasuries = nextWorld.treasuries.map((t) => ({
        ...t,
        earnedMargin: realizedMargin(nextWorld.gatherings, t.body, { asOf: event.date, capital: t.capital }),
      }));
    }

    // People an EVENT moved between two polities — an expulsion, a population
    // exchange, a guest-worker treaty, a boat crisis (runtime/migration.js).
    // The ordinary wage-and-war flows are NOT here: those are computed and
    // applied by the engine's own step (see gameplay.js). Both sides move
    // through the same gated population lever, so what leaves arrives, and
    // refusals (an unknown polity, a movement over the cap) are logged the
    // way warOps' are.
    if (event.impacts.migrationOps?.length && nextWorld.economies) {
      const applied = applyMigrationOps(nextWorld.economies, event.impacts.migrationOps, { migration: nextWorld.lastMigration, date: event.date });
      if (applied.flows.length) {
        nextWorld.economies = Object.fromEntries(Object.entries(nextWorld.economies)
          .map(([name, economy]) => [name, applied.changes[name] ? applyEconomyChange(economy, applied.changes[name]) : economy]));
        nextWorld.lastMigration = applied.migration;
      }
      for (const line of applied.refusals) console.warn(`[migration] ${line}`);
    }

    // Wars declared, joined, paused, ended or escalated — the state every
    // battle, capture and wartime economy hangs off (runtime/wars.js).
    // Refusals (a duplicate declaration, joining an ended war) are logged here;
    // gameplay.js surfaces them to the player through the rejection event.
    if (event.impacts.warOps?.length) {
      const applied = applyWarOps(nextWorld.wars, event.impacts.warOps, { date: event.date });
      nextWorld.wars = applied.wars;
      for (const line of applied.refusals) console.warn(`[wars] ${line}`);
    }

    // Leaders installed, removed or rescheduled (runtime/succession.js) — the
    // model's answer to what the engine's step declared due.
    if (event.impacts.leaderOps?.length) {
      const applied = applyLeaderOps(nextWorld.leaders, event.impacts.leaderOps, { date: event.date });
      nextWorld.leaders = applied.leaders;
      for (const line of applied.refusals) console.warn(`[leaders] ${line}`);
    }

    if (event.impacts.markerOps?.length) {
      const before = normalizeMarkers(nextWorld.markers);
      nextWorld.markers = applyMarkerOps(nextWorld.markers, event.impacts.markerOps);
      // A rename that matched no existing structure is a STOCK-map city rename (stock
      // cities live in PMTiles, not world.markers) — record it as an override layer so
      // the label layer can show the new name (see Cities.jsx / cityRenames).
      for (const raw of normalizeArray(event.impacts.markerOps)) {
        const op = normalizeMarkerOp(raw);
        if (!op || !op.name) continue;
        const matched = before.some((m) =>
          op.markerId ? m.id === op.markerId : m.name.toLowerCase() === op.name.toLowerCase());
        if (op.op === "rename" && !matched) {
          nextWorld.cityRenames = { ...(nextWorld.cityRenames || {}), [op.name.toLowerCase()]: op.newName };
        }
        // Population is recorded in the override for EVERY city, matched or not.
        // A built marker keeps its own population field, but the map reads the
        // override for both layers, so writing it here is what makes the change
        // visible without a second code path per city source.
        if (op.op === "population") {
          nextWorld.cityPopulations = {
            ...(nextWorld.cityPopulations || {}),
            [op.name.toLowerCase()]: op.population,
          };
        }
      }
    }
  }

  return {
    colors: nextColors,
    world: nextWorld,
  };
};
