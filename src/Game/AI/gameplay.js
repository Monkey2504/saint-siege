/*! Open Historia — portions (briefing dossiers + timeout/fallback hardening) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import { callAI } from "./main.jsx";
import { normalizePromptPack } from "./gameplayPrompts.js";
import { getGameplayTool, validateGameplayPayload } from "./gameplaySchemas.js";
import { toCountryName } from "../../runtime/ownerNames.js";
import { describesOrganizationalPower } from "../../runtime/organizations.js";
import { applyFaithfulOps, stepFaithful } from "../../runtime/churchFaithful.js";
import { ensureBodyFromOrders } from "../../runtime/fronts.js";
import { bequestEvent, bequestFor, consequencesOf } from "../../runtime/consequences.js";
import { filterUnitOpsByWars, resolveAiClashes, warEconomyFlags } from "../../runtime/wars.js";
import { seedLeaderFromStats, stepLeaders } from "../../runtime/succession.js";
import { stepMigration } from "../../runtime/migration.js";
import { applyActionOutcomes, assessRegionTransfer, bindImpactsToVerdicts } from "../../runtime/realityCheck.js";
import { buildRejectionEvent, collectImpactRejections } from "../../runtime/rejections.js";
import { bindWorldImpacts } from "../../runtime/worldReach.js";
import { describeLetter, readLetter } from "../../runtime/letterReading.js";
import { ensureDrivesFromOrders, pruneDormantDrives, reconcileNarration } from "../../runtime/drives.js";
import { appendRecord } from "../../runtime/record.js";
import { ensureTreasuryMovesFromOrders, stepTreasuries } from "../../runtime/treasuries.js";
import { ensureLiabilityMovesFromOrders } from "../../runtime/liabilities.js";
import { applySpeech, driftFromBlunders, judgeGovernance, persuadeNeighbours, speechFromOrder, standing } from "../../runtime/factions.js";
import { checkLedgerClaims } from "../../runtime/claimCheck.js";
import { naturalizeContacts } from "../../runtime/naturalize.js";
import { economyIndicators } from "../../runtime/economy.js";
import { registerRows } from "../../runtime/register.js";
import { ensureGatheringsFromOrders, holdDueGatherings, realizedMargin, runNationalProgramme, runWorldProgramme } from "../../runtime/gatherings.js";
import { reconcileBodies } from "../../runtime/bodyCheck.js";
import { markDeclarationAnswered } from "../../runtime/inauguration.js";
import { buildRealityAssessments } from "./promptContext.js";
import { HOLY_SEE } from "../../runtime/churchPreset.js";
import { applyEconomyChange, daysBetween, describeEconomy, anchorUnitValue, describeSeedForRefinement, ensureEconomyMovesFromOrders, pinStatSheetToEngine, refineSeed, repinCountryStats, stepWorldEconomies } from "../../runtime/economyBridge.js";
import { composeTaskSystemPrompt } from "./promptAssembly.js";
import { echoesExistingMessage, renderOpenChatsForPrompt } from "../../runtime/chatEcho.js";
import {
  buildActionHistoryText,
  buildChatSummaryText,
  buildDetailedChatHistoryText,
  buildEventHistoryText,
  buildPromptContext,
  consolidationHappened,
  getUnconsolidatedEvents,
} from "./promptContext.js";
import {
  JSON_URLS,
  loadCountryNames,
  loadRegionCatalog,
  readJson,
  writeJson,
} from "../../runtime/assets.js";
import {
  applyEventImpactsToWorld,
  normalizeActionEntry,
  normalizeEventEntry,
  normalizeActions,
  normalizeChatEntry,
  normalizeChats,
  normalizeEvents,
  normalizeGameData,
  normalizeWorldState,
  readActionsState,
  readChatsState,
  readEventsState,
  readGameData,
  readGameStateBundle,
  readWorldState,
  writeActionsState,
  writeChatsState,
  writeEventsState,
  writeGameData,
  writeWorldState,
} from "../../runtime/gameState.js";
import { dedupeGeneratedEvents } from "../../runtime/eventDedup.js";
import { difficultyDirective } from "../../runtime/difficulty.js";
import { MAP_SETTING_KEYS, getMapSetting } from "../../runtime/mapSettings.js";
import { getReasoningEnabled } from "./providerConfig.js";

const CHAT_HINT_PATTERNS = [
  /\bchat\b/i,
  /\bconference\b/i,
  /\bcontact\b/i,
  /\bdiplomac/i,
  /\bmeet\b/i,
  /\bmessage\b/i,
  /\bnegotiat/i,
  /\boutreach\b/i,
  /\bparley\b/i,
  /\bpeace talk/i,
  /\breach out\b/i,
  /\bspeak with\b/i,
  /\bsummit\b/i,
  /\btalk to\b/i,
  /\btalks? with\b/i,
  /\bпереговор/i,
  /\bвстрет/i,
  /\bдипломат/i,
  /\bсвяз/i,
  /\bчат/i,
  /\bдоговор/i,
];

const DEFAULT_SUGGESTION_TOPICS = [
  {
    title: "Stabilize the domestic front",
    description: "Keep the home front orderly and reduce the chance of internal drift while outside pressure builds.",
  },
  {
    title: "Shape the diplomatic field",
    description: "Use talks, signals, and leverage to narrow hostile options before the next crisis hardens.",
  },
  {
    title: "Prepare military leverage",
    description: "Create visible readiness and practical reserves so rivals must factor your capability into their plans.",
  },
  {
    title: "Secure economic depth",
    description: "Expand the industrial and fiscal base that decides whether later gambles are sustainable.",
  },
];

const cloneValue = (value) => {
  if (value == null) return value;
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const normalizeString = (value) => String(value ?? "").trim();
const normalizeArray = (value) => (Array.isArray(value) ? value : []);

const parseIsoDate = (value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalizeString(value));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return null;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= daysInMonth[month - 1] ? { day, month, year } : null;
};

const addIsoDays = (value, days) => {
  const parsed = parseIsoDate(value);
  if (!parsed) return "";
  const date = new Date(0);
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCFullYear(parsed.year, parsed.month - 1, parsed.day);
  date.setUTCDate(date.getUTCDate() + days);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 1 || year > 9999) return "";
  return `${String(year).padStart(4, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
};

export const validateTimelineDates = ({ candidate, mode, originDate, targetDate, requireAdvance = false }) => {
  const stopDate = normalizeString(candidate?.stopDate);
  if (!parseIsoDate(originDate)) {
    const eventDates = normalizeArray(candidate?.events).map((event) => normalizeString(event?.date));
    const outputDates = [stopDate, ...eventDates];
    const malformedIsoIndex = outputDates.findIndex((date) => /^\d{4}-/.test(date) && !parseIsoDate(date));
    if (malformedIsoIndex >= 0) {
      const path = malformedIsoIndex === 0 ? "$.stopDate" : `$.events[${malformedIsoIndex - 1}].date`;
      return `${path} must be a real Gregorian date when using YYYY-MM-DD format.`;
    }
    // A whole-day advance was requested but the model kept the clock where it
    // was — the stuck-save signature (it then re-simulates the past instead of
    // the future). Reject on the strict attempt so the retry moves time forward.
    if (requireAdvance && stopDate && stopDate === normalizeString(originDate)) {
      return `$.stopDate must move time forward - it must not equal the current date ${originDate}.`;
    }
    if (parseIsoDate(stopDate)) {
      let previousDate = "";
      for (let index = 0; index < eventDates.length; index += 1) {
        if (!parseIsoDate(eventDates[index])) return `$.events[${index}].date must use the same YYYY-MM-DD format as $.stopDate.`;
        if (eventDates[index] > stopDate) return `$.events[${index}].date must not be later than ${stopDate}.`;
        if (previousDate && eventDates[index] < previousDate) return `$.events[${index}].date must not precede the previous event date.`;
        previousDate = eventDates[index];
      }
    }
    return "";
  }
  if (!parseIsoDate(stopDate)) return `$.stopDate must be a real date in YYYY-MM-DD format; received ${stopDate || "an empty value"}.`;
  if (mode === "auto") {
    if (stopDate <= originDate || stopDate > targetDate) {
      return `$.stopDate must be after ${originDate} and no later than ${targetDate}.`;
    }
  } else if (stopDate !== targetDate) {
    return `$.stopDate must equal the requested target date ${targetDate}.`;
  }

  let previousDate = originDate;
  for (let index = 0; index < normalizeArray(candidate?.events).length; index += 1) {
    const eventDate = normalizeString(candidate.events[index]?.date);
    if (!parseIsoDate(eventDate)) return `$.events[${index}].date must be a real date in YYYY-MM-DD format.`;
    // Events dated ON the origin date are legitimate for every jump length: a
    // sub-day skip stays on that date, and a 1-day jump's window used to be a
    // single legal date ("after Jan 14 and no later than Jan 15") that models
    // constantly missed by dating events "today" — burning the strict attempt
    // (and the whole turn, when the retry ran out of road) over nothing.
    if (eventDate < originDate || eventDate > stopDate) {
      return `$.events[${index}].date must be on or after ${originDate} and no later than ${stopDate}.`;
    }
    if (eventDate < previousDate) return `$.events[${index}].date must not precede the previous event date.`;
    previousDate = eventDate;
  }
  return "";
};

// Attempt-2 salvage for timeline dates: rather than discarding a finished
// (possibly very long) generation to the canned fallback because the model
// simulated a little past the window, pull the strays in. Events dated on or
// before the origin land on the first simulated day, events past the stop land
// on the stop date, unparseable dates become the stop date, and ordering is
// restored monotonically. The CONTENT is untouched — a good story with sloppy
// dates beats canned events every time (a 1-day skip whose model "kept going"
// used to trash the whole turn exactly this way).
export const clampTimelineDates = (candidate, { mode, originDate, targetDate }) => {
  if (!parseIsoDate(originDate)) return; // textual/BCE scenarios use the lenient branch
  let stopDate = normalizeString(candidate?.stopDate);
  if (mode === "auto") {
    if (!parseIsoDate(stopDate) || stopDate <= originDate || stopDate > targetDate) stopDate = targetDate;
  } else {
    stopDate = targetDate;
  }
  candidate.stopDate = stopDate;
  // Mirrors validation: on-or-after the origin is in-window for every jump
  // length, so strays dated before the origin pull up to the origin itself.
  const floor = originDate > stopDate ? stopDate : originDate;
  let previous = floor;
  for (const event of normalizeArray(candidate?.events)) {
    if (!event || typeof event !== "object") continue;
    let date = normalizeString(event.date);
    if (!parseIsoDate(date)) date = stopDate;
    if (date <= originDate) date = floor;
    if (date > stopDate) date = stopDate;
    if (date < previous) date = previous;
    event.date = date;
    previous = date;
  }
};

const sentenceCase = (value) => {
  const text = normalizeString(value);
  if (!text) return "";
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
};

const maybeJsonParse = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

// Parse, and when that fails, repair the JSON slips small local models make
// most: trailing commas before } or ], and curly "smart" quotes as string
// delimiters. Repairs are only ever attempted AFTER a strict parse failed, so
// well-formed output is never touched.
const lenientJsonParse = (value) => {
  const direct = maybeJsonParse(value);
  if (direct) return direct;
  const repaired = value
    .replace(/[“”]/g, '"')
    .replace(/,\s*([}\]])/g, "$1");
  return maybeJsonParse(repaired);
};

// Every balanced top-level {...} or [...] block in the text, string-aware, in
// order of appearance. A greedy first-{-to-last-} regex dies when the model
// writes prose containing a brace after its JSON, or emits two objects; walking
// candidates and parsing each one survives both.
const balancedJsonCandidates = (text) => {
  const candidates = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let opener = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (start === -1) {
      if (ch === "{" || ch === "[") {
        start = i;
        depth = 1;
        opener = ch;
        inString = false;
        escaped = false;
      }
      continue;
    }
    if (escaped) {
      escaped = false;
    } else if (ch === "\\") {
      escaped = inString;
    } else if (ch === '"') {
      inString = !inString;
    } else if (!inString) {
      if (ch === "{" || ch === "[") depth += 1;
      else if (ch === "}" || ch === "]") {
        depth -= 1;
        if (depth === 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  // Objects first: the payload is an object, and a stray inline array (e.g. in
  // the model's commentary) must not shadow it.
  return candidates.sort((a, b) => (a[0] === "{" ? 0 : 1) - (b[0] === "{" ? 0 : 1));
};

export const extractJsonPayload = (rawText) => {
  // Reasoning models (and several Ollama chat templates) prepend a think block
  // the strict parser chokes on; the answer follows it.
  const text = rawText
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^[\s\S]*?<\/think>/i, "")
    .trim();

  const direct = lenientJsonParse(text);
  if (direct) return direct;

  // Any fenced block, not just ```json — small models label fences ```JSON,
  // ```javascript, or not at all.
  for (const fence of text.matchAll(/```[a-z]*\s*([\s\S]*?)```/gi)) {
    const parsed = fence[1] ? lenientJsonParse(fence[1].trim()) : null;
    if (parsed && typeof parsed === "object") return parsed;
  }

  for (const candidate of balancedJsonCandidates(text)) {
    const parsed = lenientJsonParse(candidate);
    if (parsed && typeof parsed === "object") return parsed;
  }

  return null;
};

const loadPromptCatalog = async ({ force = false } = {}) =>
  normalizePromptPack(await readJson(JSON_URLS.prompts, { defaultValue: {}, force }));

const MILITARY_ACTION_PATTERN =
  /\b(troop|army|armies|attack|invade|invasion|deploy|fleet|navy|naval|air force|airforce|bomb|siege|offensive|battalion|regiment|garrison|blockade|mobiliz)/i;

// Reach/logistics doctrine for the AI. Deliberately CONDITIONAL: it only
// rides along when the turn actually involves forces (units on the map or
// military-sounding orders), so peaceful turns don't pay the context cost.
const buildMilitaryFeasibilityText = (world, actionsText) => {
  const hasUnits = normalizeArray(world?.units).length > 0;
  if (!hasUnits && !MILITARY_ACTION_PATTERN.test(actionsText || "")) {
    return "";
  }

  return [
    "",
    "MILITARY FEASIBILITY — test every deploy request, move/attack order and your own unitOps against the era and the unit's type before honoring it:",
    "- Era reach: before ~1500, armies march on foot or horse and cross water only by coastal shipping — intercontinental operations are impossible. ~1500–1850 (age of sail): overseas action needs fleets and friendly ports and takes months. 1850–1945: rail and steamships speed logistics; aircraft stay short-ranged until the 1940s. After 1945: global power projection belongs only to major powers with bases, carriers or allies along the route.",
    "- Unit type: air units are fastest but need airbases or carriers within range and cannot hold ground; naval units move only by sea; infantry, armor and artillery crawl overland and need supply lines; garrisons do not travel.",
    "- Distance: compare the unit's coordinates with the target's. An order beyond plausible reach or pace is NOT executed as given — reject it, or convert it into a partial advance with an event explaining the delay, the transport it would need, or why it failed.",
    "- Never teleport units: each move op may only cover what that unit could actually travel in the elapsed time; long campaigns should progress across several turns.",
  ].join("\n");
};

const STAT_SHEETS_STORAGE_KEY = "oh-stat-sheets";

const readStoredStatSheets = () => {
  try {
    return JSON.parse(localStorage.getItem(STAT_SHEETS_STORAGE_KEY)) ?? {};
  } catch {
    return {};
  }
};

// International reputation the AI evolves each turn (world.internationalReputation),
// surfaced to prompts. Falls back to the last stat sheet the player viewed, then a
// neutral 50 — so it is never "unknown".
const buildPlayerPolityReputationText = async (bundle) => {
  const playerCode = normalizeString(bundle.game.country);
  if (!playerCode) {
    return "No player polity is currently set.";
  }
  const world = bundle.world && typeof bundle.world === "object" ? bundle.world : {};
  let reputation = Number(world.internationalReputation?.[playerCode]);
  if (!Number.isFinite(reputation)) {
    const gameKey = normalizeString(bundle.game.id || bundle.game.name || "game");
    reputation = Number(readStoredStatSheets()[`${gameKey}:${playerCode}`]?.sheet?.indices?.internationalReputation);
  }
  if (!Number.isFinite(reputation)) {
    reputation = 50;
  }
  const clamped = Math.max(0, Math.min(100, Math.round(reputation)));
  const band = clamped >= 70 ? "well-regarded" : clamped >= 40 ? "mixed" : "poor";
  return `International reputation: ${clamped}/100 (${band}).`;
};

const buildTemplateVariables = async (bundle, options = {}) => {
  const variables = await buildPromptContext(bundle, options);
  return {
    ...variables,
    playerPolityReputationContext: await buildPlayerPolityReputationText(bundle),
    unitsSummary:
      variables.unitsSummary +
      buildMilitaryFeasibilityText(bundle.world, buildActionHistoryText(bundle.actions)),
  };
};

// Give the AI real time: local/self-hosted models (and reasoning modes) often
// need well over a minute per turn. The old 12s default silently discarded
// their answers and served the canned fallback instead — turns "completed"
// with nothing to show. The UI has spinners; waiting beats silently wrong.

// ...but "no deadline at all" is not the same thing as patience. With the
// "limit AI generation" setting off, timeoutMs resolved to 0 and the task had
// NO deadline: a provider that accepts the request and then never answers hung
// the turn forever, with no fallback and no way back except reloading. Ten
// minutes is far more than any local model needs for one task and still
// guarantees the turn ends. Callers that pass their own timeoutMs > 0 (the
// 300 s jumpForward and pregameHistory overrides) keep it exactly.
const DEFAULT_TASK_DEADLINE_MS = 600000;

// Output-token budgets, per task. Left uncapped, a provider's own maximum is
// used (64k+ on some models); nothing here needs that, and an unbounded budget
// is what a runaway generation bills for. These are ceilings, not targets —
// each is several times the largest well-formed answer the task's schema can
// produce — so a healthy turn never reaches them. A caller that passes its own
// maxTokens wins; a task absent from this table stays uncapped (pregameHistory,
// idleDiplomacy).
const TASK_MAX_TOKENS = {
  jumpForward: 16000,
  autoJumpForward: 16000,
  eventConsolidator: 6000,
  countryStatSheet: 3000,
  economySeed: 3000,
  nextSpeaker: 3000,
  descriptionToAction: 3000,
  catalystCreation: 8000,
  catalystExecutor: 8000,
  catalystSummary: 8000,
  actions: 6000,
  gameMaster: 8000,
};

// Reasoning models bill thinking against the SAME budget as the answer
// (OpenAI's max_completion_tokens, and local backends' enable_thinking path),
// so a 3000-token ceiling meant for a stat sheet would be spent thinking and
// return nothing — the exact truncation failure the uncapped default was
// introduced to fix. When the reasoning toggle is on, every ceiling gets room
// for the thinking too. (Anthropic is unaffected: main.jsx enables `thinking`
// only for non-tool calls, and every task here sends a tool.)
const REASONING_HEADROOM_TOKENS = 16000;

const taskMaxTokens = (taskKey, requested) => {
  if (Number(requested) > 0) return Number(requested);
  const budget = TASK_MAX_TOKENS[taskKey];
  if (!budget) return 0;
  return getReasoningEnabled() ? budget + REASONING_HEADROOM_TOKENS : budget;
};

const runJsonTask = async (taskKey, {
  fallback,
  maxTokens,
  signal,
  timeoutMs = getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 120000 : 0,
  userMessage,
  validatePayload,
  variables,
}) => {
  const prompts = await loadPromptCatalog();
  // The chosen difficulty steers every simulation task (see runtime/difficulty.js).
  let difficultyText = "";
  try {
    const game = await readGameData();
    difficultyText = difficultyDirective(game.difficulty);
  } catch {
    // Without game data the task still runs at its default temperament.
  }
  const systemPrompt = composeTaskSystemPrompt(taskKey, {
    difficultyText,
    helpers: prompts.helpers,
    template: prompts.tasks[taskKey],
    variables,
  });

  const controller = new AbortController();
  // Let an external signal (the player pressing Cancel) abort the in-flight AI
  // call too — the abort propagates through callAI to the server relay.
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  const effectiveTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TASK_DEADLINE_MS;
  const tokenBudget = taskMaxTokens(taskKey, maxTokens);
  const deadline = Date.now() + effectiveTimeoutMs;
  const timeoutError = new Error(`AI task "${taskKey}" timed out.`);
  const timeoutId = setTimeout(() => controller.abort(timeoutError), effectiveTimeoutMs);
  const tool = getGameplayTool(taskKey);
  const history = [{ role: "user", parts: [{ text: userMessage }] }];
  let failureReason = "The model did not return valid structured output.";

  try {
    for (let outputAttempt = 1; outputAttempt <= 2; outputAttempt += 1) {
      const response = await callAI(systemPrompt, history, {
        // A long/action-heavy turn's JSON must not be truncated mid-response — a
        // cut-off response won't parse, so runJsonTask falls back to canned events
        // that carry NO regionTransfers and NO diplomacy, which is why the map
        // never changed and no chats opened. Hence generous per-task ceilings
        // (TASK_MAX_TOKENS) rather than none at all; 0 means uncapped and main.jsx
        // then lets the provider use its own model maximum, as before.
        deadline,
        ...(tokenBudget > 0 ? { maxTokens: tokenBudget } : {}),
        signal: controller.signal,
        tool,
      });
      const rawText = typeof response === "string" ? response : normalizeString(response?.rawText);
      const parsed = response?.toolInput ?? extractJsonPayload(rawText);
      // A single mistyped optional field must not discard the whole turn to the
      // canned fallback: the model sometimes returns `catalyst` as a prose string
      // instead of the object|null the jump schema requires. Coerce any non-object
      // catalyst to null (= no catalyst offered this turn) so the turn's real
      // content (events, transfers, chats) still validates and applies.
      if (parsed && typeof parsed === "object" && parsed.catalyst != null
          && (typeof parsed.catalyst !== "object" || Array.isArray(parsed.catalyst))) {
        parsed.catalyst = null;
      }
      // Same idea for markerOps. The engine has always accepted `found`/`destroy`
      // as aliases and a build written flat, but the schema only ever allowed the
      // canonical spelling — and a single rejected op fails the WHOLE payload, so
      // one flattened building cost the player the entire turn. Rewrite to the
      // canonical shape here, before validation, so the turn survives.
      for (const event of Array.isArray(parsed?.events) ? parsed.events : []) {
        const ops = event?.impacts?.markerOps;
        if (!Array.isArray(ops)) continue;
        event.impacts.markerOps = ops.map((op) => {
          if (!op || typeof op !== "object") return op;
          const kind = String(op.op ?? "").trim().toLowerCase();
          const canonical = kind === "found" ? "build" : kind === "destroy" ? "remove" : kind;
          if (canonical !== "build" || op.marker) return { ...op, op: canonical };
          // Flat build: lift the structure's own fields under `marker`.
          const { op: _op, note, ...marker } = op;
          return { op: "build", marker, ...(note == null ? {} : { note }) };
        });
      }
      // Say WHY nothing could be parsed. "Did not contain parseable JSON" reads
      // the same whether the reply was cut off at the model's output ceiling,
      // refused on safety, or written as prose by a model too small to call a
      // tool — and only the first of those is fixed by a bigger token budget.
      const stopped = normalizeString(response?.finishReason).toUpperCase();
      const why = stopped === "MAX_TOKENS"
        ? ` The reply was cut off at the model's output limit after ${rawText.length} characters, so the JSON was incomplete — a smaller turn or a model with a larger output budget will fix it.`
        : stopped && stopped !== "STOP"
          ? ` The model stopped early (${stopped}).`
          : rawText
            ? ` The model answered in prose instead of calling the tool (${rawText.length} characters), which usually means the model is too small for a payload this size.`
            : " The model returned nothing at all.";
      let validation = parsed
        ? validateGameplayPayload(taskKey, parsed)
        : { valid: false, error: `Response did not contain parseable JSON or tool arguments.${why}` };
      if (validation.valid && validatePayload) {
        // finalAttempt tells the validator this is the last chance: callers use
        // it to switch from strict (return a corrective error for the retry) to
        // salvage (repair the payload in place). It MUST come from here, not
        // from counting validator invocations — when attempt 1 dies at the
        // schema/parse level this validator never runs, so an invocation
        // counter would treat attempt 2 as "first", return strict feedback
        // meant for the model, and hand the player a fallback whose reason
        // reads "Resend the same response with ..." (a real field report).
        const taskError = normalizeString(
          await validatePayload(parsed, { attempt: outputAttempt, finalAttempt: outputAttempt === 2 }),
        );
        if (taskError) validation = { valid: false, error: taskError };
      }

      if (validation.valid) {
        return { generation: { source: "ai", fallbackReason: "" }, payload: parsed };
      }

      failureReason = validation.error;
      if (outputAttempt === 1 && !controller.signal.aborted) {
        history.push({
          role: "model",
          parts: [{ text: rawText || JSON.stringify(parsed ?? null) }],
        });
        // A model that answered with a tool call is told to call it again; one
        // that answered in prose (local models without tool support) is told to
        // answer in raw JSON — telling it to call a tool it cannot see wastes
        // the one retry this task gets.
        // A reply that ran out of room is not corrected by asking for the same
        // thing again: it has to be asked for smaller. Field report: a quarter
        // of a campaign's turns fell back, and the retry re-requested the very
        // payload that had just overrun.
        const retryInstruction = stopped === "MAX_TOKENS"
          ? "Your previous answer ran out of output room and was cut off mid-JSON. Answer again, COMPLETE and much shorter: the fewest events the turn allows, one or two sentences of description each, and no optional field you do not need. A short valid turn is worth more than a long broken one."
          : response?.toolInput
            ? `Call ${tool?.name || "the required tool"} again with corrected input.`
            : "Respond again with ONLY the corrected JSON object - no prose, no explanations, no markdown fences, just the JSON.";
        history.push({
          role: "user",
          parts: [{ text: `Your previous structured answer failed validation: ${validation.error} ${retryInstruction}` }],
        });
        continue;
      }
    }
  } catch (error) {
    const actualError = controller.signal.aborted ? controller.signal.reason : error;
    failureReason = normalizeString(actualError?.message || actualError) || failureReason;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }

  // A deliberate user cancel must NOT silently fall back to canned events —
  // propagate the abort so the caller can quietly cancel the jump with no state
  // change. (A timeout still uses the fallback, as before.)
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("Timeline jump cancelled.", "AbortError");
  }

  if (typeof fallback !== "function") {
    throw new Error(`AI task "${taskKey}" failed: ${failureReason}`);
  }

  console.warn(`[ai] task "${taskKey}" failed (${failureReason}) — using the deterministic fallback.`);
  return {
    generation: { source: "fallback", fallbackReason: failureReason },
    payload: await fallback(),
  };
};

const CONSOLIDATION_INTERVAL_ROUNDS = 5;
const CONSOLIDATION_RETAIN_EVENTS = 24;
const CONSOLIDATION_SIZE_THRESHOLD = 48;
const CONSOLIDATION_BATCH_SIZE = 60;

const consolidateHistoryBatch = async (bundle, events, chats, actions = []) => {
  const variables = await buildTemplateVariables(bundle, {
    // Resolved orders are consolidated alongside the events they caused. Capping
    // the history that gets SENT each turn is not enough on its own: drop the old
    // orders without recording what they did and the model loses the campaign's
    // divergences from real history, then refills the gap from real history. A
    // player hit exactly that — a 1920s Europe with no WW1 and a surviving Tsar
    // started growing a Soviet Union that never existed.
    actionsToConsolidate: buildActionHistoryText(actions, {
      includeResolved: true,
      limit: actions.length || 1,
    }),
    chatsToConsolidate: buildDetailedChatHistoryText(chats, { limit: chats.length || 1, messageLimit: 100 }),
    eventsToConsolidate: buildEventHistoryText(events, { limit: events.length || 1 }),
  });
  const { generation, payload } = await runJsonTask("eventConsolidator", {
    fallback: () => ({
      summary: [
        events.map((event) => `${event.date || "undated"} ${event.title}: ${event.description}`).join("; "),
        buildChatSummaryText(chats, { limit: chats.length || 1 }),
        actions.length ? `Player orders resolved: ${actions.map((action) => action.title).join("; ")}` : "",
      ].filter(Boolean).join("\n"),
    }),
    timeoutMs: getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 60000 : 0,
    // Spelled out here (not left to the system prompt alone) because a game
    // may carry its own frozen copy of the eventConsolidator prompt from
    // before keyFacts existed — this userMessage is built fresh every call,
    // never frozen, so it works regardless of which prompt version a save has.
    userMessage: "Consolidate the supplied campaign history with the required tool. Also fill keyFacts: zero or more short, dated, ATOMIC facts from this batch that a future turn must never contradict (a regime change, a war's outcome, a treaty, a territorial change, a divergence from real history) — unlike summary, these are never reworded or shortened again, so state each one precisely enough to stand alone.",
    variables,
  });
  return {
    generation,
    summary: normalizeString(payload?.summary),
    // A safety net alongside the per-event mechanism (impacts.canonFacts):
    // extracted from the RAW events being consolidated, not from prose that
    // has already been through a lossy pass, so it stays trustworthy even
    // when nothing was flagged as a canon fact when the events first happened.
    keyFacts: normalizeArray(payload?.keyFacts).map((s) => normalizeString(s)).filter(Boolean),
  };
};

const compactHistoryIfNeeded = async (bundle) => {
  const world = normalizeWorldState(bundle.world);
  const unconsolidatedEvents = getUnconsolidatedEvents(bundle.events, world);
  const shouldCompactEvents =
    unconsolidatedEvents.length > CONSOLIDATION_SIZE_THRESHOLD ||
    (bundle.game.round % CONSOLIDATION_INTERVAL_ROUNDS === 0 &&
      unconsolidatedEvents.length > CONSOLIDATION_RETAIN_EVENTS);
  const priorChatIds = new Set(world.consolidatedHistory.flatMap((entry) => entry.chatIds));
  const closedChats = normalizeChats(bundle.chats)
    .filter((chat) => chat.status === "closed" && !priorChatIds.has(chat.id));
  const eventsToConsolidate = shouldCompactEvents
    ? unconsolidatedEvents.slice(0, -CONSOLIDATION_RETAIN_EVENTS).slice(0, CONSOLIDATION_BATCH_SIZE)
    : [];

  if (eventsToConsolidate.length === 0 && closedChats.length === 0) return world;

  // Ride along with a consolidation that is happening anyway — no extra AI call,
  // which matters when the point of the exercise is to shrink cost. Orders already
  // folded into an earlier summary are skipped.
  const priorActionIds = new Set(world.consolidatedHistory.flatMap((entry) => entry.actionIds));
  const actionsToConsolidate = normalizeActions(bundle.actions)
    .filter((action) => action.status !== "planned" && action.id && !priorActionIds.has(action.id))
    .slice(0, CONSOLIDATION_BATCH_SIZE);

  const { generation, summary, keyFacts } = await consolidateHistoryBatch(
    bundle,
    eventsToConsolidate,
    closedChats,
    actionsToConsolidate,
  );
  if (!summary) return world;
  const throughEvent = eventsToConsolidate.at(-1);

  return normalizeWorldState({
    ...world,
    consolidatedHistory: [
      ...world.consolidatedHistory,
      {
        actionIds: actionsToConsolidate.map((action) => action.id),
        chatIds: closedChats.map((chat) => chat.id),
        createdAt: new Date().toISOString(),
        source: generation.source,
        summary,
        throughDate: throughEvent?.date || bundle.game.gameDate,
        throughEventId: throughEvent?.id || world.consolidatedHistory.at(-1)?.throughEventId || "",
        throughRound: bundle.game.round,
      },
    ],
    canonFacts: [...world.canonFacts, ...keyFacts],
  });
};

// The first tier keeps growing consolidatedHistory forever — measured against
// a real campaign, 16 entries already ran to 37,000+ characters sent on
// EVERY jumpForward call, the single largest piece of an already 100,000+
// character prompt. This is the second tier the field measurement called
// for: once the array holds more than the recent window, fold everything
// OLDER than that window into ONE new, denser entry — the same
// eventConsolidator task, run again on already-consolidated prose instead of
// raw events, so old history keeps compressing instead of accumulating
// without limit. Recent history stays untouched (full fidelity where it
// matters most); only the tail — the part a jumpForward rarely needs in
// detail — gets folded, repeatedly, as the campaign grows.
const ANCIENT_HISTORY_ENTRY_THRESHOLD = 10;
const ANCIENT_HISTORY_RECENT_KEPT = 6;

const condenseAncientHistoryIfNeeded = async (bundle) => {
  const world = normalizeWorldState(bundle.world);
  const entries = world.consolidatedHistory;
  if (entries.length <= ANCIENT_HISTORY_ENTRY_THRESHOLD) return world;

  const toCondense = entries.slice(0, entries.length - ANCIENT_HISTORY_RECENT_KEPT);
  const kept = entries.slice(entries.length - ANCIENT_HISTORY_RECENT_KEPT);
  if (toCondense.length < 2) return world; // nothing worth condensing into itself

  const variables = await buildTemplateVariables(bundle, {
    eventsToConsolidate: toCondense.map((entry) => `${entry.throughDate || "undated"}: ${entry.summary}`).join("\n\n"),
    chatsToConsolidate: "",
  });
  const { generation, payload } = await runJsonTask("eventConsolidator", {
    fallback: () => ({ summary: toCondense.map((entry) => entry.summary).join(" ") }),
    timeoutMs: getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 60000 : 0,
    userMessage: "The passages below are NOT raw events — they are already-consolidated chronicle summaries from an earlier compression pass. Compress them FURTHER into a single, noticeably shorter account covering the same span: preserve every territorial change, major diplomatic outcome, and any divergence from real history, but drop repeated or now-minor detail. This is a second compression pass, not a first one.",
    variables,
  });
  const summary = normalizeString(payload?.summary);
  if (!summary) return world;

  const last = toCondense.at(-1);
  return normalizeWorldState({
    ...world,
    consolidatedHistory: [
      {
        actionIds: toCondense.flatMap((entry) => entry.actionIds),
        chatIds: toCondense.flatMap((entry) => entry.chatIds),
        createdAt: new Date().toISOString(),
        source: generation.source,
        summary,
        throughDate: last.throughDate,
        throughEventId: last.throughEventId,
        throughRound: last.throughRound,
      },
      ...kept,
    ],
  });
};

const mergePolityCatalog = (countryCatalog, world) => {
  const merged = new Map();

  for (const country of countryCatalog) {
    if (!country) continue;
    merged.set((country.code || country.name).toUpperCase(), {
      code: country.code || "",
      name: country.name || country.code || "",
    });
  }

  for (const polity of Object.values(normalizeWorldState(world).polityOverrides)) {
    if (!polity) continue;
    merged.set((polity.code || polity.name).toUpperCase(), {
      code: polity.code,
      name: polity.name || polity.code,
    });

    if (polity.name) {
      merged.set(polity.name.toUpperCase(), {
        code: polity.code,
        name: polity.name,
      });
    }
  }

  return Array.from(merged.values());
};

// ---- Simulation busy lock ---------------------------------------------------
// The idle diplomacy drip (maybeSendIdleDiplomacy below) must never run - and
// above all never WRITE chat state - while a jump, game-master command, or
// catalyst stage is in flight: those read the full state bundle at entry and
// write it all back at the end, so a concurrent chat write would be silently
// clobbered (or worse, interleave with the rollback snapshot). Every simulation
// entry point wraps itself in beginSimulation/endSimulation; the drip checks
// the counter before starting AND before writing, and simply skips its turn.
// The counter is also the single authority on whether a turn may START at all
// (see simulateTimelineJump): a screen's own flag only knows about that screen.
let activeSimulations = 0;
// Screens watch the lock so a control can show itself busy while a turn started
// from ANOTHER screen is running. A watcher must not be able to break the lock,
// hence the try around each call.
const simulationBusyWatchers = new Set();
const notifySimulationBusy = () => {
  const busy = activeSimulations > 0;
  for (const watch of simulationBusyWatchers) {
    try {
      watch(busy);
    } catch (error) {
      console.warn("[ai] a simulation busy watcher threw; ignoring it.", error);
    }
  }
};
const beginSimulation = () => { activeSimulations += 1; notifySimulationBusy(); };
const endSimulation = () => { activeSimulations = Math.max(0, activeSimulations - 1); notifySimulationBusy(); };
export const isSimulationBusy = () => activeSimulations > 0;
// Returns its own unsubscribe, so a React effect can return it directly.
export const subscribeSimulationBusy = (watch) => {
  if (typeof watch !== "function") return () => {};
  simulationBusyWatchers.add(watch);
  return () => { simulationBusyWatchers.delete(watch); };
};

const resolveInvitees = async (names, world, additionalCountries = []) => {
  const countryCatalog = [
    ...mergePolityCatalog(await loadCountryNames(), world),
    ...normalizeArray(additionalCountries).map((entry) => ({
      code: normalizeString(entry?.code),
      name: normalizeString(entry?.name || entry?.code),
    })),
  ];
  const lookup = new Map();

  for (const country of countryCatalog) {
    lookup.set((country.name || "").toUpperCase(), country);
    if (country.code) {
      lookup.set(country.code.toUpperCase(), country);
    }
  }

  const resolved = normalizeArray(names)
    .map((reference) => {
      const candidates = typeof reference === "string"
        ? [reference]
        : [reference?.name, reference?.code];
      return candidates
        .map((candidate) => lookup.get(normalizeString(candidate).toUpperCase()) || null)
        .find(Boolean) || null;
    })
    .filter(Boolean);
  const unique = new Map(resolved.map((entry) => [entry.code || entry.name, entry]));
  return Array.from(unique.values()).map((entry) => ({
      code: entry.code || "",
      name: entry.name || entry.code || "",
    }));
};

const inferInviteeNames = async (text, world, playerCountry = "") => {
  const countryCatalog = mergePolityCatalog(await loadCountryNames(), world);
  const normalizedText = normalizeString(text).toLowerCase();

  return countryCatalog
    .filter((country) => country.name && country.name.toLowerCase() !== normalizeString(playerCountry).toLowerCase())
    .filter((country) => normalizedText.includes(country.name.toLowerCase()))
    .slice(0, 5)
    .map((country) => country.name);
};

const fallbackActionSuggestions = async (bundle) => {
  const recentTitles = normalizeEvents(bundle.events).slice(-3).map((event) => event.title);
  const topics = DEFAULT_SUGGESTION_TOPICS.map((topic, index) => {
    const recentTitle = recentTitles[index];
    const actions = [
      normalizeActionEntry({
        kind: "action",
        source: "suggested",
        text: `Issue a concrete order addressing ${recentTitle || topic.title.toLowerCase()} and assign a responsible ministry or command.`,
        title: recentTitle ? `Respond to ${recentTitle}` : `Act on ${topic.title}`,
      }),
      normalizeActionEntry({
        kind: "action",
        source: "suggested",
        text: `Prepare a second-order measure that protects ${bundle.game.country || "the polity"} if this line of effort triggers resistance.`,
        title: "Create a contingency layer",
      }),
    ].filter(Boolean);

    return {
      actions,
      description: topic.description,
      id: `fallback-topic-${index}`,
      title: recentTitle || topic.title,
    };
  });

  return { topics };
};

const fallbackDescriptionToAction = async (rawInput, bundle) => {
  const trimmed = normalizeString(rawInput);
  const isChat = CHAT_HINT_PATTERNS.some((pattern) => pattern.test(trimmed));
  const inferredInvitees = isChat
    ? await inferInviteeNames(trimmed, bundle.world, bundle.game.country)
    : [];
  const title = sentenceCase(trimmed.split(/[.!?]/)[0] || trimmed);
  const expandedText = isChat
    ? `${trimmed}. Clarify the objective, the concession you can offer, and the outcome you want before the exchange hardens.`
    : `${trimmed}. Define the instrument, timing, and expected political or military effect so the move can be executed cleanly.`;

  return {
    chatStarter: isChat ? trimmed : "",
    invitees: inferredInvitees,
    kind: isChat ? "chat" : "action",
    text: expandedText.slice(0, 520),
    title: title.length > 72 ? `${title.slice(0, 69)}...` : title,
  };
};

const pickMentionedSpeaker = (messageText, participants, excludedSpeaker) => {
  const normalizedText = normalizeString(messageText).toLowerCase();
  if (!normalizedText) return null;

  return (
    participants.find((country) => {
      if (country.name === excludedSpeaker) return false;
      return normalizedText.includes(country.name.toLowerCase());
    }) ?? null
  );
};

const fallbackNextSpeaker = ({ chat, excludedSpeaker }) => {
  const normalizedChat = normalizeChats([chat])[0];
  if (!normalizedChat) {
    return { nextSpeaker: "" };
  }

  const lastMessage = normalizedChat.messages.at(-1);
  const mentionedSpeaker = pickMentionedSpeaker(lastMessage?.text, normalizedChat.countries, excludedSpeaker);
  if (mentionedSpeaker) {
    return { nextSpeaker: mentionedSpeaker.name };
  }

  const fallbackCountry =
    normalizedChat.countries.find((country) => country.name !== excludedSpeaker) ??
    normalizedChat.countries[0] ??
    { name: "" };

  return {
    nextSpeaker: fallbackCountry.name,
  };
};

export const buildGeneratedChat = async (chatLike, linkEventId, world, { fallbackTitle = "", playerName = "" } = {}) => {
  const countriesInput = Array.isArray(chatLike?.countries) ? chatLike.countries : [];
  const countries = await resolveInvitees(countriesInput, world);
  if (countries.length === 0) return null;

  // The initiating polity speaks first — and it is never the player. When the
  // model names no speaker (or names the player), attribute the opener to the
  // first non-player participant.
  const playerKey = normalizeString(playerName).toUpperCase();
  const matchesPlayer = (country) =>
    playerKey && (normalizeString(country.name).toUpperCase() === playerKey || normalizeString(country.code).toUpperCase() === playerKey);
  const speakerKey = normalizeString(chatLike?.speaker).toUpperCase();
  const initiator =
    countries.find((country) =>
      speakerKey && !matchesPlayer(country)
      && (normalizeString(country.name).toUpperCase() === speakerKey || normalizeString(country.code).toUpperCase() === speakerKey))
    ?? countries.find((country) => !matchesPlayer(country))
    ?? countries[0];

  const entry = normalizeChatEntry({
    countries,
    id: chatLike?.id,
    linkedEventId: linkEventId,
    messages:
      Array.isArray(chatLike?.messages) && chatLike.messages.length > 0
        ? chatLike.messages
        : chatLike?.openingMessage
        ? [
            {
              code: initiator?.code || "",
              role: "leader",
              speaker: initiator?.name || normalizeString(chatLike?.speaker),
              text: chatLike.openingMessage,
              time: "",
            },
          ]
        : [],
    source: normalizeString(chatLike?.source) || "invitation",
    status: "open",
    // A chat must say why it exists: the model's title, else the causing
    // event's title, else at least the participants.
    title: chatLike?.title || fallbackTitle || `Chat with ${countries.map((country) => country.name).join(", ")}`,
  });
  // The initiating polity always speaks first. If no first message survives
  // normalization (the model gave no openingMessage, or only blank text), this
  // would be a titled-but-empty "mystery chat" the player can't make sense of
  // ("no clue why talks started"). Drop it instead of opening an empty thread —
  // such chats otherwise slipped through on the salvage/final AI attempt (where
  // validateChatOpener is no longer enforced) and as opener-less idle-diplomacy
  // notes. Every caller already treats a null return as "no chat".
  if (!entry || entry.messages.length === 0) return null;
  return entry;
};

// Region ownership is keyed by the map's own region id (GID_1, e.g. "DEU.2_1"),
// but the prompts ask the model for a region's original NAME in regionId, and the
// model is never shown an id to copy. An unresolved name is not inert: it becomes
// regionOwnershipOverrides["Bayern"], which matches no geometry feature and so
// paints nothing while still counting as a map change in the timeline. Turn names
// into real ids here; whatever cannot be resolved is REPORTED back to the caller
// so the model can be retried with the real region names in hand (see
// validateGeneratedWorldChanges), and only after that is it dropped so a phantom
// key never reaches the world state.
const regionKey = (value) => normalizeString(value)
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/\s+/g, " ");

// Returns { unresolved, unjustified }: the transfers no map region matched, and
// the ones the world had no basis for (see assessRegionTransfer). Both are
// DROPPED from the payload and recorded on the container as
// impacts.droppedRegionTransfers [{regionId, regionName, toCode, reason, remedy}],
// which rejections.collectImpactRejections turns into the visible "Not
// executed" event once the turn applies. `player` and `actions` (the player's
// polity and its planned orders) feed the consent rule.
const resolveRegionTransfers = async (containers, world, { player = "", actions = [] } = {}) => {
  const catalog = await loadRegionCatalog().catch(() => []);
  // Without a catalog we cannot tell a good id from a bad one, and dropping real
  // transfers would be worse than the phantom keys — leave the payload alone.
  if (catalog.length === 0) return { unresolved: [], unjustified: [] };

  const byId = new Map();
  const byName = new Map();
  for (const region of catalog) {
    byId.set(region.id, region);
    const key = regionKey(region.name);
    if (!key) continue;
    const bucket = byName.get(key);
    if (bucket) bucket.push(region);
    else byName.set(key, [region]);
  }
  const worldState = normalizeWorldState(world);
  const owners = worldState.regionOwnershipOverrides;
  // Owner comparisons are case- and diacritic-insensitive, and the model may
  // name a polity by its era DISPLAY name or an alias ("Second Polish
  // Republic") while ownership is keyed by the owner token ("Poland") —
  // canonicalize through the polity registry before comparing.
  const ownerAlias = new Map();
  for (const [token, entry] of Object.entries(worldState.polityOverrides ?? {})) {
    const canonical = regionKey(token);
    if (!canonical) continue;
    ownerAlias.set(canonical, canonical);
    const displayName = regionKey(entry?.name);
    if (displayName) ownerAlias.set(displayName, canonical);
    for (const alias of entry?.aliases ?? []) {
      const aliasKey = regionKey(alias);
      if (aliasKey) ownerAlias.set(aliasKey, canonical);
    }
  }
  const canonicalOwnerKey = (token) => {
    const key = regionKey(token);
    return ownerAlias.get(key) ?? key;
  };
  const ownerKeyOf = (regionId) => {
    // A legacy save can still hold a code here; canonicalise so it keys as the same
    // owner as everything else rather than as a second, phantom power.
    const override = toCountryName(normalizeString(owners[regionId]));
    if (override) return canonicalOwnerKey(override);
    // No override yet (e.g. the FIRST invasion of a war): the region is still held by
    // its base owner, which the catalog carries. Fall back to it — otherwise
    // regionsOwnedBy() is empty for any not-yet-overridden owner, so disambiguation,
    // the containment near-miss, AND buildTransferFeedback's candidate list all fail
    // exactly when the model most needs them (the transfer that STARTS a conflict).
    const region = byId.get(regionId);
    return canonicalOwnerKey(region?.country || toCountryName(region?.countryCode) || "");
  };
  const regionsOwnedBy = (ownerToken) => {
    const key = canonicalOwnerKey(ownerToken);
    if (!key) return [];
    return catalog.filter((region) => ownerKeyOf(region.id) === key);
  };
  // The polity a region is held by right now, as a display name (override
  // first, then the catalog's base owner) — the "losing side" of a transfer.
  const currentOwnerName = (regionId) => {
    const override = toCountryName(normalizeString(owners[regionId]));
    if (override) return override;
    const region = byId.get(regionId);
    return region?.country || toCountryName(region?.countryCode) || "";
  };
  // Every owner key in this resolver is a full country NAME (ownerKeyOf canonicalises
  // codes on the way through), so a country can be matched directly.
  // Whole-country transfer: one entry that hands over EVERY region a polity still
  // holds (total conquest, annexation, unification, partition). Regions the winner
  // already owns are skipped so a self-transfer can't blank an owner.
  const expandWholeCountry = (transfer) => {
    const target = toCountryName(normalizeString(transfer?.regionId) || normalizeString(transfer?.regionName));
    const key = canonicalOwnerKey(target);
    if (!key) return [];
    const toKey = canonicalOwnerKey(toCountryName(transfer?.toCode));
    const owned = catalog.filter((region) => {
      const owner = ownerKeyOf(region.id);
      return owner === key && owner !== toKey;
    });
    return owned.map((region) => ({
      ...transfer,
      fromCode: toCountryName(normalizeString(transfer?.fromCode)) || target,
      regionId: region.id,
      regionName: region.name,
      wholeCountry: undefined,
    }));
  };

  const resolve = (transfer) => {
    // A model that did emit a real id keeps working.
    if (byId.has(normalizeString(transfer?.regionId))) return normalizeString(transfer.regionId);
    const fromKey = canonicalOwnerKey(transfer?.fromCode);
    // Otherwise the name may be in either field: the prompt puts it in regionId,
    // the schema also offers regionName.
    for (const candidate of [transfer?.regionId, transfer?.regionName]) {
      const query = regionKey(candidate);
      if (!query) continue;
      const matches = byName.get(query) ?? [];
      if (matches.length === 1) return matches[0].id;
      // Region names repeat across countries ("Santa Cruz", "Georgia"). Prefer the
      // one the transfer says it is taking territory from; a guess would flip a
      // border on the wrong continent, which is worse than changing nothing.
      if (matches.length > 1 && fromKey) {
        const owned = matches.filter((region) => ownerKeyOf(region.id) === fromKey);
        if (owned.length === 1) return owned[0].id;
      }
      // Near-miss within the losing side's own regions: containment either way
      // ("Ostpreussen" for "Ostpreussen-Sud") is safe when it is unique there.
      if (fromKey && query.length >= 4) {
        const contains = regionsOwnedBy(transfer.fromCode).filter((region) => {
          const name = regionKey(region.name);
          return name.includes(query) || query.includes(name);
        });
        if (contains.length === 1) return contains[0].id;
      }
    }
    return "";
  };

  // How many regions an UNFLAGGED transfer may move by being reinterpreted as a
  // polity name. A real whole-country handover is dozens of regions and should say
  // so with wholeCountry:true; a handful is the plausible size of a region/polity
  // name collision, which is the case this fallback exists for.
  const IMPLICIT_WHOLE_COUNTRY_LIMIT = 3;

  // ---- A4: a transfer needs a reason to exist (realityCheck.assessRegionTransfer) ----
  // The world the transfer is judged against: the units on the map plus the
  // owners of any unit this same payload SPAWNS (a war the model narrates and
  // arms in one answer), the standing intents and resolutions, and the
  // player's planned orders for the consent rule.
  const spawnedOwners = new Set();
  for (const { impacts } of containers) {
    for (const op of normalizeArray(impacts?.unitOps)) {
      if (normalizeString(op?.op).toLowerCase() !== "spawn") continue;
      const unit = op?.unit && typeof op.unit === "object" ? op.unit : op;
      const owner = toCountryName(normalizeString(unit?.ownerCode || unit?.owner || unit?.code));
      if (owner) spawnedOwners.add(owner);
    }
  }
  const plannedActions = normalizeArray(actions).filter((a) => a && (a.status ?? "planned") === "planned" && a.kind !== "chat");
  const losingIdsByOwner = new Map();
  const losingRegionIds = (owner) => {
    const key = canonicalOwnerKey(owner);
    if (!key) return [];
    if (!losingIdsByOwner.has(key)) losingIdsByOwner.set(key, catalog.filter((region) => ownerKeyOf(region.id) === key).map((region) => region.id));
    return losingIdsByOwner.get(key);
  };
  const justify = (transfer) => {
    const to = toCountryName(normalizeString(transfer?.toCode));
    const losing = currentOwnerName(transfer.regionId) || toCountryName(normalizeString(transfer?.fromCode));
    // Handing a region to the polity that already holds it changes nothing —
    // never worth a refusal.
    if (to && canonicalOwnerKey(to) === canonicalOwnerKey(losing)) return { allowed: true, basis: "already held" };
    return assessRegionTransfer(
      {
        toPolity: to,
        regionId: transfer.regionId,
        regionName: byId.get(transfer.regionId)?.name || normalizeString(transfer?.regionName),
        losingPolity: losing,
        wholeCountry: transfer?.conquest === true,
      },
      {
        units: worldState.units,
        spawnedOwners,
        intents: worldState.intents,
        organizations: worldState.organizations,
        playerPolity: normalizeString(player),
        plannedActions,
        losingRegionIds: losingRegionIds(losing),
      },
    );
  };

  const unresolved = [];
  const unjustified = [];
  for (const { impacts, path } of containers) {
    const transfers = normalizeArray(impacts?.regionTransfers);
    if (transfers.length === 0) continue;
    const resolved = [];
    const dropped = [];
    for (const transfer of transfers) {
      // An explicit whole-country transfer expands FIRST: "annex Belgium" must move
      // every Belgian region even though a region may share the country's name.
      if (transfer?.wholeCountry === true) {
        const expanded = expandWholeCountry(transfer);
        if (expanded.length) {
          console.info(
            `[ai] ${path}.regionTransfers expanded whole country ` +
              `"${normalizeString(transfer?.regionId)}" -> ${normalizeString(transfer?.toCode)}: ` +
              `${expanded.length} region(s).`,
          );
          // `conquest` marks the expansion as a DECLARED whole-country conquest
          // for rule (d) below; normalizeRegionTransfer drops the key later.
          resolved.push(...expanded.map((entry) => ({ ...entry, conquest: true })));
          continue;
        }
      }
      const regionId = resolve(transfer);
      if (regionId) {
        transfer.regionId = regionId;
        resolved.push(transfer);
        continue;
      }
      // Not a region the map knows — it MAY be a POLITY the model meant wholesale
      // ("Austria-Hungary is partitioned"). But the prompt also tells the model to
      // put a plain REGION name in regionId whenever it does not know the id, so an
      // unmatched name is the ROUTINE case here, not an exceptional one. Expanding
      // every one of them meant a single fuzzy name could hand over an entire
      // nation's territory in a turn whose events never mentioned it — reported as
      // "captured one region and it reverted all of Ukraine".
      //
      // An explicit wholeCountry:true still expands without limit (handled above);
      // that is the model saying it means a whole nation. Without the flag, accept
      // an expansion only while it is small enough to be a genuine name collision.
      // Anything larger goes to the retry, which names the exact region that failed
      // to match — and if the retry runs out, dropping one transfer is a far smaller
      // failure than silently moving a country.
      const expanded = expandWholeCountry(transfer);
      if (expanded.length && expanded.length <= IMPLICIT_WHOLE_COUNTRY_LIMIT) {
        console.info(
          `[ai] ${path}.regionTransfers treated "${normalizeString(transfer?.regionId)}" as a whole ` +
            `country -> ${normalizeString(transfer?.toCode)}: ${expanded.length} region(s).`,
        );
        resolved.push(...expanded);
        continue;
      }
      if (expanded.length) {
        console.warn(
          `[ai] ${path}.regionTransfers REFUSED to treat "${normalizeString(transfer?.regionId)}" as a ` +
            `whole country -> ${normalizeString(transfer?.toCode)}: it would move ${expanded.length} ` +
            `regions and the transfer did not set wholeCountry. Asking for an exact region id instead.`,
        );
      }
      unresolved.push({
        label: normalizeString(transfer?.regionName) || normalizeString(transfer?.regionId),
        fromCode: normalizeString(transfer?.fromCode),
        path,
        candidates: regionsOwnedBy(transfer?.fromCode),
      });
      dropped.push({
        regionId: normalizeString(transfer?.regionId),
        regionName: normalizeString(transfer?.regionName),
        toCode: toCountryName(normalizeString(transfer?.toCode)) || normalizeString(transfer?.toCode),
        reason: "no such region — no map region matches that id or name",
        remedy: "the region's exact in-game name in regionId, with fromCode set to its current owner",
      });
      console.warn(
        `[ai] ${path}.regionTransfers dropped "${normalizeString(transfer?.regionId)}"` +
          `${transfer?.regionName ? ` (${normalizeString(transfer.regionName)})` : ""} -> ` +
          `${normalizeString(transfer?.toCode)}: no map region matches that id or name.`,
      );
    }
    // Every resolved transfer must now have a basis in the world (A4).
    const justified = [];
    for (const transfer of resolved) {
      const verdict = justify(transfer);
      if (verdict.allowed) {
        justified.push(transfer);
        continue;
      }
      const regionName = byId.get(transfer.regionId)?.name || normalizeString(transfer?.regionName) || normalizeString(transfer?.regionId);
      const toCode = toCountryName(normalizeString(transfer?.toCode)) || normalizeString(transfer?.toCode);
      unjustified.push({ path, label: regionName, toCode, reason: verdict.reason, remedy: verdict.remedy });
      dropped.push({ regionId: normalizeString(transfer?.regionId), regionName, toCode, reason: verdict.reason, remedy: verdict.remedy });
      console.warn(`[ai] ${path}.regionTransfers dropped "${regionName}" -> ${toCode}: ${verdict.reason}. What would make it valid: ${verdict.remedy}`);
    }
    impacts.regionTransfers = justified;
    impacts.droppedRegionTransfers = dropped;
  }
  return { unresolved, unjustified };
};

// One retry's worth of corrective vocabulary: the exact regions the losing side
// currently owns, so a model that wrote "Pomerania" can resend the same answer
// with the real names/ids ("Pomorskie (POL.11_1)") instead of losing the map
// change entirely. The lists stay small — one owner's regions, not the world's.
const buildTransferFeedback = (unresolved, unjustified = []) => {
  const lines = [];
  // A transfer the world has no basis for: the model is told exactly what the
  // engine would accept as a basis, and may drop it, ground it, or retarget it.
  for (const entry of unjustified.slice(0, 3)) {
    lines.push(
      `${entry.path}.regionTransfers: "${entry.label}" -> ${entry.toCode} has no basis in the world — ${entry.reason}. ` +
        `What would make it valid: ${entry.remedy}. Either drop this transfer, or give it a basis in the same answer ` +
        `(a unitOps spawn or move of ${entry.toCode}'s forces there, an intentOps create for ${entry.toCode} naming it), or change toCode to the polity that actually took it.`,
    );
  }
  for (const entry of unresolved.slice(0, 3)) {
    const target = entry.label || "(blank)";
    if (entry.candidates.length > 0) {
      const listed = entry.candidates.slice(0, 40)
        .map((region) => `${region.name} (${region.id})`)
        .join(", ");
      const more = entry.candidates.length > 40 ? `, +${entry.candidates.length - 40} more` : "";
      lines.push(
        `${entry.path}.regionTransfers: no map region matches "${target}". ` +
          `Regions currently owned by ${entry.fromCode}: ${listed}${more}.`,
      );
    } else {
      lines.push(
        `${entry.path}.regionTransfers: no map region matches "${target}"` +
          `${entry.fromCode ? ` and no regions are recorded for owner "${entry.fromCode}"` : ""}. ` +
          `Use the region's exact in-game name in regionId, and set fromCode to the region's current owner so the engine can locate it.`,
      );
    }
  }
  lines.push(
    unresolved.length > 0
      ? "Resend the same response with these regionTransfers corrected to exact regionId values (or exact names) from the lists above; drop a transfer only if no listed region matches your intent."
      : "Resend the same response with these regionTransfers dropped, grounded, or retargeted as described above.",
  );
  return lines.join("\n");
};

// Also canonicalizes region ids in place (see resolveRegionTransfers): runJsonTask
// hands the accepted payload straight to the caller, and a payload is only accepted
// once this returns clean, so every applied transfer has passed through here.
//
// strictTransfers: when set, an unresolvable transfer FAILS validation with the
// losing owner's real region list, so runJsonTask's retry gives the model the
// vocabulary to fix its own answer. Callers set it on every attempt EXCEPT the
// last (runJsonTask passes finalAttempt to validatePayload) — the final answer
// must never be rejected into the canned fallback over a name.

// An AI-opened chat must arrive with a reason and a first message — the
// initiating polity speaks first. Empty string when the entry is fine.
const validateChatOpener = (chatLike, path) => {
  const hasMessages = Array.isArray(chatLike?.messages) && chatLike.messages.length > 0;
  if (!normalizeString(chatLike?.title)) {
    return `${path}.title must name the purpose of the chat.`;
  }
  if (!hasMessages && !normalizeString(chatLike?.openingMessage)) {
    return `${path}.openingMessage must carry the initiating polity's first message - never open an empty chat.`;
  }
  return "";
};

// Event text that claims territory changed hands. Word-boundary anchored so
// "preoccupied" or "occupational" never match; deliberately narrow (capture
// verbs, not war verbs) so a defensive battle that moved no borders — a
// legitimate zero-transfer turn — never trips the reluctance guard below.
const CAPTURE_LANGUAGE = /\b(captur\w*|seiz\w*|annex\w*|conquer\w*|occup(?:y|ies|ied|ation)|overr[au]n|liberat\w*|retak\w*|retaken|recaptur\w*|cedes?|ceded|ceding|cession|fell to|falls? to)\b/i;

// Strict/salvage discipline, the same contract clampTimelineDates follows:
// the FIRST attempt returns corrective errors so the model can fix its own
// answer; the SECOND attempt never rejects a finished generation — invalid
// ops are DROPPED in place instead ("$.events[4].impacts.unitOps[0].unitId
// does not identify an existing unit" used to trash whole good turns to the
// canned fallback over one stale id).
export const validateGeneratedWorldChanges = async (candidate, world, { strictTransfers = false, player = "", actions = [] } = {}) => {
  const strict = strictTransfers;
  const containers = Array.isArray(candidate?.events)
    ? candidate.events.map((event, index) => ({ impacts: event?.impacts, path: `$.events[${index}].impacts` }))
    : [{ impacts: candidate?.impacts, path: "$.impacts" }];
  const { unresolved, unjustified } = await resolveRegionTransfers(containers, world, { player, actions });
  if (strict && (unresolved.length > 0 || unjustified.length > 0)) {
    return buildTransferFeedback(unresolved, unjustified);
  }
  // Reluctance guard (strict attempt only): events that NARRATE a capture while
  // the whole payload ships ZERO regionTransfers are the recurring field report
  // — "two turns of invasions and not a single province transferred". One
  // corrective retry asks the model to reconcile narration with the map (or to
  // strip the capture language if genuinely nothing changed hands). English
  // verb heuristic only — a non-English game just never gets this extra nudge —
  // and the final attempt always passes through salvage, so it can never cost a
  // finished turn. Only for event-shaped payloads: a $.impacts container has no
  // narration to check.
  if (strict && Array.isArray(candidate?.events)) {
    const totalTransfers = containers.reduce(
      (sum, { impacts }) => sum + normalizeArray(impacts?.regionTransfers).length,
      0,
    );
    if (totalTransfers === 0) {
      const captureEvent = candidate.events.find((event) =>
        CAPTURE_LANGUAGE.test(`${normalizeString(event?.title)} ${normalizeString(event?.description)}`));
      if (captureEvent) {
        return `Your events describe territory changing hands (e.g. "${normalizeString(captureEvent.title) || "an event"}") but the payload contains ZERO impacts.regionTransfers. Territorial narration and the map must never disagree: add impacts.regionTransfers entries ({"regionId": exact id or the region's plain name, "toCode": the new owner}) to EVERY event whose text says a region was captured, seized, occupied, annexed, ceded, liberated, or retaken, covering each region it names or implies. If nothing genuinely changed hands in this period, remove the capture language from those events instead, and resend.`;
      }
    }
    // Same guard, for organizations: a polity narrated into a leadership role
    // or a body narrated as voting/censuring/expelling, with zero
    // organizationOps anywhere in the payload — field report: the player
    // described becoming president of the UN or the WTO, and nearly getting
    // a member expelled, and NONE of it was ever recorded (leader stayed
    // blank, no resolution exists), so it could never be read back or acted
    // on again.
    const totalOrgOps = containers.reduce((sum, { impacts }) => sum + normalizeArray(impacts?.organizationOps).length, 0);
    if (totalOrgOps === 0) {
      const powerEvent = candidate.events.find((event) =>
        describesOrganizationalPower(`${normalizeString(event?.title)} ${normalizeString(event?.description)}`));
      if (powerEvent) {
        return `Your events describe a leadership role or a vote in an international body (e.g. "${normalizeString(powerEvent.title) || "an event"}") but the payload contains ZERO impacts.organizationOps. Add {"op":"update","organization":"<exact name>","changes":{"leader":"<polity>"}} for a leadership change, or {"op":"resolve","organization":"<exact name>","resolution":{...}} for a vote or censure (passed:false for a near-miss) — see [International Organizations]. If nothing genuinely was decided in this period, remove that language from those events instead, and resend.`;
      }
    }
  }
  const unitIds = new Set(normalizeWorldState(world).units.map((unit) => normalizeString(unit.id)).filter(Boolean));
  const generatedPolities = [];
  for (const { impacts } of containers) generatedPolities.push(...normalizeArray(impacts?.polityChanges));

  for (const { impacts, path } of containers) {
    const keptChats = [];
    for (let index = 0; index < normalizeArray(impacts?.createdChats).length; index += 1) {
      const createdChat = impacts.createdChats[index];
      const countries = await resolveInvitees(createdChat?.countries, world, generatedPolities);
      if (countries.length === 0) {
        if (strict) return `${path}.createdChats[${index}].countries must contain at least one known polity.`;
        continue; // salvage: drop the unresolvable chat, keep the turn
      }
      if (strict) {
        const chatError = validateChatOpener(createdChat, `${path}.createdChats[${index}]`);
        if (chatError) return chatError;
      }
      keptChats.push(createdChat);
    }
    if (impacts && Array.isArray(impacts.createdChats)) impacts.createdChats = keptChats;

    const keptUnitOps = [];
    for (let index = 0; index < normalizeArray(impacts?.unitOps).length; index += 1) {
      const operation = impacts.unitOps[index];
      const operationPath = `${path}.unitOps[${index}]`;
      if (operation.op === "spawn") {
        if (!normalizeString(operation.unit?.name) || !normalizeString(operation.unit?.ownerCode)) {
          if (strict) return `${operationPath}.unit must have nonblank name and ownerCode values.`;
          continue;
        }
        const spawnedId = normalizeString(operation.unit?.id);
        if (spawnedId && unitIds.has(spawnedId)) {
          if (strict) return `${operationPath}.unit.id duplicates an existing unit.`;
          delete operation.unit.id; // salvage: let normalization mint a fresh id
        } else if (spawnedId) {
          unitIds.add(spawnedId);
        }
        keptUnitOps.push(operation);
        continue;
      }

      const unitId = normalizeString(operation.unitId);
      if (!unitId) {
        if (strict) return `${operationPath}.unitId must not be blank.`;
        continue;
      }
      if (!unitIds.has(unitId)) {
        if (strict) return `${operationPath}.unitId does not identify an existing unit.`;
        continue; // salvage: drop the op aimed at a unit that no longer exists
      }
      if (operation.op === "remove" || (operation.op === "strength" && operation.strength === 0)) unitIds.delete(unitId);
      keptUnitOps.push(operation);
    }
    if (impacts && Array.isArray(impacts.unitOps)) impacts.unitOps = keptUnitOps;

    // Marker ops that would be silently dropped by normalization instead fail
    // the strict attempt, so the retry tells the model what was missing.
    const keptMarkerOps = [];
    for (let index = 0; index < normalizeArray(impacts?.markerOps).length; index += 1) {
      const operation = impacts.markerOps[index];
      const operationPath = `${path}.markerOps[${index}]`;
      const op = normalizeString(operation?.op).toLowerCase();
      if (op === "build" || op === "found") {
        const marker = operation.marker ?? operation;
        if (!normalizeString(marker?.name)) {
          if (strict) return `${operationPath}.marker.name must not be blank.`;
          continue;
        }
        if (!Number.isFinite(Number(marker?.lng)) || !Number.isFinite(Number(marker?.lat))) {
          if (strict) return `${operationPath}.marker must carry numeric lng and lat coordinates.`;
          continue;
        }
      } else if (op === "remove" || op === "destroy") {
        if (!normalizeString(operation?.name) && !normalizeString(operation?.markerId)) {
          if (strict) return `${operationPath} must carry the name (or markerId) of the structure to remove.`;
          continue;
        }
      }
      keptMarkerOps.push(operation);
    }
    if (impacts && Array.isArray(impacts.markerOps)) impacts.markerOps = keptMarkerOps;
  }

  // Unprompted outreach chats (top-level, not tied to an event) need real
  // participants exactly like createdChats do.
  if (Array.isArray(candidate?.diplomaticOutreach)) {
    const keptOutreach = [];
    for (let index = 0; index < candidate.diplomaticOutreach.length; index += 1) {
      const countries = await resolveInvitees(
        candidate.diplomaticOutreach[index]?.countries,
        world,
        generatedPolities,
      );
      if (countries.length === 0) {
        if (strict) return `$.diplomaticOutreach[${index}].countries must contain at least one known polity.`;
        continue;
      }
      if (strict) {
        const chatError = validateChatOpener(candidate.diplomaticOutreach[index], `$.diplomaticOutreach[${index}]`);
        if (chatError) return chatError;
      }
      keptOutreach.push(candidate.diplomaticOutreach[index]);
    }
    candidate.diplomaticOutreach = keptOutreach;
  }

  return "";
};

const fallbackJumpSimulation = async ({ bundle, days, mode, targetDate }) => {
  const plannedActions = normalizeActions(bundle.actions).filter((action) => action.status === "planned");
  const firstThreeActions = plannedActions.slice(0, 3);
  const events = [];

  // Ancient/FMG scenarios may use textual or BCE dates. Only perform calendar
  // arithmetic on strict Gregorian dates; otherwise preserve the scenario text.
  const advanceGameDate = (dayCount) =>
    addIsoDays(bundle.game.gameDate, dayCount) || normalizeString(bundle.game.gameDate);

  if (firstThreeActions.length > 0) {
    firstThreeActions.forEach((action, index) => {
      const eventDate = advanceGameDate(
        Math.max(1, Math.round(((index + 1) / (firstThreeActions.length + 1)) * Math.max(days, 1))),
      );

      events.push({
        date: eventDate,
        description:
          action.kind === "chat"
            ? `${bundle.game.country} opens a deliberate diplomatic channel tied to ${action.title.toLowerCase()}, forcing counterparts to weigh terms instead of guessing intent.`
            : `${bundle.game.country} begins implementing ${action.title.toLowerCase()}, producing immediate administrative and political consequences that other powers start to notice.`,
        impacts: {
          createdChats:
            action.kind === "chat" && action.invitees.length > 0 && action.chatStarter
              ? [
                  {
                    countries: action.invitees,
                    openingMessage: action.chatStarter,
                    speaker: bundle.game.country,
                    title: action.title,
                  },
                ]
              : [],
          polityChanges: [],
          regionTransfers: [],
        },
        importance: index === firstThreeActions.length - 1 ? "major" : "minor",
        kind: action.kind === "chat" ? "diplomacy" : "player",
        notable: index === firstThreeActions.length - 1,
        playerRelated: true,
        title:
          action.kind === "chat"
            ? `${bundle.game.country} opens a diplomatic channel`
            : `${bundle.game.country} acts on ${action.title.toLowerCase()}`,
      });
    });
  } else {
    const midpoint = advanceGameDate(Math.max(1, Math.round(Math.max(days, 1) / 2)));
    events.push({
      date: midpoint,
      description: `Foreign ministries and general staffs keep adjusting to the current balance of power while ${bundle.game.country} gathers its next move.`,
      impacts: {
        createdChats: [],
        polityChanges: [],
        regionTransfers: [],
      },
      importance: mode === "auto" ? "major" : "minor",
      kind: "world",
      notable: mode === "auto",
      playerRelated: false,
      title: "The international balance remains in motion",
    });
  }

  // What the world's own state already makes true (runtime/consequences.js).
  //
  // Without this, a fallback edition was one generic sentence and three empty
  // impact lists — while the engine, on the very same turn, emptied a purse,
  // held a congress, let pledges lapse and pushed electors into schism. The
  // player read that foreign ministries were adjusting to the balance of power
  // and concluded the game was broken. On Google's free tier — 1,000 requests a
  // day — that is not the rare case, it is most of an evening's play.
  //
  // These entries invent nothing: each one reports a figure the engine holds,
  // past a threshold written down in that file. They go LAST so the real state
  // of the world closes the edition, and they carry the same shape as any other
  // event, so nothing downstream needs to know where they came from.
  const stateOfTheWorld = consequencesOf(bundle.world, bundle.game, {
    player: bundle.game.country,
    from: bundle.game.gameDate,
    to: targetDate,
  });
  events.push(...stateOfTheWorld);

  // The catalyst is a scene the player is asked to judge, so it belongs to what
  // the world did, not to the last thing the player typed.
  const lastEvent = stateOfTheWorld.at(-1) ?? events.at(-1) ?? null;
  const catalyst = lastEvent
    ? {
        choices: [
          "Press the advantage immediately",
          "Probe cautiously before committing",
          "Hold position and gather more intelligence",
        ],
        opening: `${lastEvent.title}. ${lastEvent.description}`,
        premise: `This scene begins as ${lastEvent.title.toLowerCase()} reaches the point where direct judgment matters.`,
        title: lastEvent.title,
      }
    : null;

  return {
    catalyst,
    clearActions: true,
    events,
    stopDate: targetDate,
    summary: stateOfTheWorld.length
      ? `Written without the model. What follows is not narration: ${stateOfTheWorld.map((e) => e.title.toLowerCase()).join("; ")}.`
      : plannedActions.length > 0
        ? `${bundle.game.country} moves from planning into execution, and the world begins adjusting to the turn's most concrete orders.`
        : `Time advances without a direct order from ${bundle.game.country}, but the wider system keeps shifting and building pressure.`,
  };
};

const normalizeGeneratedEvent = (entry, index = 0) => {
  const normalized = normalizeEvents([entry])[0];
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    id: normalized.id || `generated-event-${index}`,
  };
};

const MAX_ROLLBACK_SNAPSHOTS = 12;

// Persist the PRE-turn state so the cheats menu's "Roll back turn" can restore it.
// A dedicated per-game runtime asset (storage/snapshots.json) — never bundled with
// a scenario or dragged through the 5s poll — capped so a long game can't grow it
// without bound. Purely best-effort: a snapshot failure must never break a turn.
const captureRollbackSnapshot = async ({ round, fromDate, toDate, game, world, events, actions, chat, colors }) => {
  try {
    const prior = await readJson(JSON_URLS.snapshots, { defaultValue: [], force: true }).catch(() => []);
    const list = Array.isArray(prior) ? prior : [];
    const snapshot = {
      id: `snap-${round}-${Date.now()}`,
      round,
      fromDate,
      toDate,
      capturedAt: new Date().toISOString(),
      state: {
        game: cloneValue(game),
        world: cloneValue(world),
        events: cloneValue(events),
        actions: cloneValue(actions),
        chat: cloneValue(chat),
        colors: cloneValue(colors),
      },
    };
    await writeJson(JSON_URLS.snapshots, [snapshot, ...list].slice(0, MAX_ROLLBACK_SNAPSHOTS));
  } catch (error) {
    console.warn("[rollback] snapshot capture failed:", error);
  }
};

// Restore points, newest first (index 0 = undo the most recent turn). Shared by
// the cheats menu and the timeline's Undo control.
export const loadRollbackSnapshots = async () => {
  const list = await readJson(JSON_URLS.snapshots, { defaultValue: [], force: true }).catch(() => []);
  return Array.isArray(list) ? list : [];
};

// Roll back to the start of the turn captured at `index`: restore the six
// per-turn assets, discard that restore point and every newer one (those turns
// no longer happened), and return the freshly-normalized bundle so the caller
// can update immediately. Returns null if there is no such snapshot.
export const rollBackToSnapshot = async (index = 0) => {
  const snapshots = await loadRollbackSnapshots();
  const snap = snapshots[index];
  if (!snap) return null;
  const s = snap.state ?? {};
  await Promise.all([
    writeJson(JSON_URLS.game, s.game ?? {}, { pretty: true }),
    writeJson(JSON_URLS.world, s.world ?? {}, { pretty: true }),
    writeJson(JSON_URLS.events, s.events ?? [], { pretty: true }),
    writeJson(JSON_URLS.actions, s.actions ?? [], { pretty: true }),
    writeJson(JSON_URLS.chat, s.chat ?? [], { pretty: true }),
    writeJson(JSON_URLS.colors, s.colors ?? {}, { pretty: true }),
  ]);
  await writeJson(JSON_URLS.snapshots, snapshots.slice(index + 1));
  const bundle = await readGameStateBundle({ force: true });
  return { bundle, round: snap.round, remaining: snapshots.length - (index + 1) };
};

// Once per polity, after its first jump: ask the model to correct the era
// prior the engine started that polity on (population, capacities, policy,
// what the money was) with the polity's actual history. One call for all the
// unrefined powers in play, player first; failures leave the prior in place.
const refineEconomySeeds = async () => {
  const bundle = await readGameStateBundle({ force: true });
  const world = normalizeWorldState(bundle.world);
  const player = normalizeString(bundle.game.country);
  const pending = Object.entries(world.economies)
    .filter(([, economy]) => economy.seed !== "ai")
    .sort(([a], [b]) => (a === player ? -1 : b === player ? 1 : 0))
    .slice(0, 8);
  if (pending.length === 0) return;
  const variables = await buildTemplateVariables(bundle);
  const { payload } = await runJsonTask("economySeed", {
    fallback: () => ({ economies: [] }),
    timeoutMs: getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 90000 : 0,
    userMessage: "Correct the priors with the required tool.",
    variables: {
      ...variables,
      economySeedPriors: pending.map(([name, economy]) => describeSeedForRefinement(name, economy)).join("\n"),
    },
  });
  const byName = new Map(pending);
  const latest = normalizeWorldState((await readGameStateBundle({ force: true })).world);
  const economies = { ...latest.economies };
  let changed = 0;
  for (const entry of normalizeArray(payload?.economies)) {
    const name = normalizeString(entry?.polity);
    if (!byName.has(name) || !economies[name]) continue;
    economies[name] = refineSeed(economies[name], entry);
    changed += 1;
  }
  // Whatever the model did not improve is still marked refined: one ask.
  for (const [name] of pending) if (economies[name] && economies[name].seed !== "ai") economies[name] = { ...economies[name], seed: "ai" };
  await writeWorldState({ ...latest, economies });
  if (changed) console.info(`[ai] economy seeds refined for ${changed} polit${changed === 1 ? "y" : "ies"}.`);
};

const applySimulationResult = async ({
  baseActions,
  baseChats,
  baseColors,
  baseEvents,
  baseGame,
  baseWorld,
  result,
}) => {
  // Each normalized event is kept beside the RAW payload entry it came from:
  // the refusals the resolver annotated on the raw impacts, and the unit ops
  // normalization throws away, are only visible on the raw side.
  const rawByEvent = new Map();
  const generatedEvents = normalizeArray(result.events)
    .map((entry, index) => {
      const event = normalizeGeneratedEvent({
        ...entry,
        source: entry?.source || result.generation?.source || "ai",
      }, index);
      if (event) rawByEvent.set(event, entry);
      return event;
    })
    .filter(Boolean);
  // The model is shown the running timeline as context and tends to restate events
  // it already reported; each restatement gets a fresh random id, so only a
  // content-key de-dup catches it. Drop restatements BEFORE they persist, apply
  // impacts, or land in this turn's record (also see the [New Developments Only]
  // directive in buildTemplateVariables).
  const priorEvents = normalizeEvents(baseEvents);
  const freshEvents = dedupeGeneratedEvents(priorEvents, generatedEvents);
  const nextGame = normalizeGameData({
    ...baseGame,
    gameDate: normalizeString(result.stopDate) || baseGame.gameDate,
    round: (baseGame.round || 1) + 1,
  });
  const plannedActionSnapshot = normalizeActions(baseActions).filter((action) => action.status === "planned");
  // Each order's fate: the model's outcome, capped by the verdict the same
  // deterministic check computed for the prompt (runtime/realityCheck.js), with
  // the deciding constraint kept on the entry so next turn's history says why.
  const realityAssessments = buildRealityAssessments({ game: baseGame, world: baseWorld, actions: baseActions }, { jumpDays: daysBetween(baseGame.gameDate, nextGame.gameDate) });
  const narratedOutcomes = freshEvents.flatMap((event) => (Array.isArray(event.impacts?.actionOutcomes) ? event.impacts.actionOutcomes : []));
  const nextActions = result.clearActions
    ? applyActionOutcomes(normalizeActions(baseActions), narratedOutcomes, realityAssessments, { defaultStatus: "resolved" })
    : normalizeActions(baseActions);

  // The verdict binds the impacts (realityCheck.bindImpactsToVerdicts): an
  // event executing a BLOCKED order loses its region transfers and unit ops
  // before anything touches the world; a CONSTRAINED order's event keeps at
  // most one transfer. Narration and chats stay. Events with no order linkage
  // are the world's own moves and pass untouched.
  const bound = bindImpactsToVerdicts(freshEvents, plannedActionSnapshot, realityAssessments);
  // Casualties are the engine's to compute, not the model's to assert: a
  // "strength" op that lowers a unit whose owner is in no active war is a
  // battle that cannot have happened (runtime/wars.js). Stripped before the
  // world sees it, and reported like any other refusal.
  const warState = normalizeWorldState(baseWorld).wars;
  const warRejections = [];
  const warFiltered = bound.events.map((event) => {
    if (!event.impacts?.unitOps?.length) return event;
    const { kept, dropped } = filterUnitOpsByWars(event.impacts.unitOps, normalizeWorldState(baseWorld).units, warState);
    for (const text of dropped) warRejections.push({ text, playerRelated: Boolean(event.playerRelated) });
    return dropped.length ? { ...event, impacts: { ...event.impacts, unitOps: kept } } : event;
  });

  // The same check, for everyone (runtime/worldReach.js). The player's orders
  // were held to budget, reach, legitimacy, votes and forces while the world's
  // own moves were held to nothing, which is why every turn read as the whole
  // world acting against the player at once. A world event that moves the map is
  // now assessed from its actor's side and stripped on the same terms: a faction
  // reaching outside the remit its own schemes declare, or a body that has
  // passed no resolution, keeps its narration and loses its map changes.
  const worldBound = bindWorldImpacts(warFiltered, {
    player: baseGame.country ?? "",
    world: normalizeWorldState(baseWorld),
    jumpDays: daysBetween(baseGame.gameDate, nextGame.gameDate),
  });
  const boundEvents = worldBound.events;

  // Seed the economies of the powers this jump was simulated with (the prompt
  // used in-memory seeds; persisting them here is what lets the engine evolve
  // ONE state rather than reseeding every turn), then apply the AI's levers.
  const seededWorld = {
    ...baseWorld,
    economies: { ...(result.economies ?? {}), ...normalizeWorldState(baseWorld).economies },
    organizations: normalizeWorldState(baseWorld).organizations.length ? normalizeWorldState(baseWorld).organizations : (result.organizations ?? []),
  };

  // Every refusal, in one visible event (runtime/rejections.js): the strips
  // above, the transfers the resolver dropped, unit ops that normalized to
  // nothing or name no unit, organization and intent ops on bodies the world
  // does not hold, economy levers for un-seeded polities. Persisted with the
  // turn's events, so the player reads it in the timeline and the model sees
  // it in next turn's history. Consoles still log each one.
  const rejectionLines = [
    ...bound.rejections,
    ...warRejections,
    ...worldBound.rejections,
    ...collectImpactRejections(boundEvents.map((event, index) => ({ raw: rawByEvent.get(freshEvents[index]), event })), normalizeWorldState(seededWorld)),
    // A story that says money arrived without the op that moves it: the
    // ledger did not change, and the player is told so in the same edition
    // rather than discovering it eleven rounds later (runtime/drives.js).
    ...reconcileNarration(boundEvents, { drives: normalizeWorldState(seededWorld).drives, player: baseGame.country ?? "" }),
    // An institution the edition acted through that the world does not hold:
    // it has no members, no purse and no voice, so nothing it decided happened
    // (runtime/bodyCheck.js).
    ...reconcileBodies(boundEvents, {
      organizations: normalizeWorldState(seededWorld).organizations,
      polities: Object.keys(normalizeWorldState(seededWorld).economies ?? {}),
    }),
  ];
  for (const line of rejectionLines) console.warn(`[engine] not executed: ${line.text}`);
  const rejectionEvent = buildRejectionEvent(rejectionLines, { date: nextGame.gameDate });
  const turnEvents = rejectionEvent ? [...boundEvents, rejectionEvent] : boundEvents;
  // Battles the engine resolves and successions that fall due are appended
  // once the world has been stepped, below.
  const battleEvents = [];
  let nextEvents = [...priorEvents, ...turnEvents];
  const nextChats = [...normalizeChats(baseChats)];
  // Chats this turn CREATED, kept apart from the pre-turn snapshot. A turn takes a
  // while to generate and the player can edit the chat list while it runs, so the
  // write at the end merges these onto whatever is actually stored by then rather
  // than putting the stale snapshot back. See the re-read before writeChatsState.
  const generatedChats = [];

  const { colors: nextColors, world: worldAfterImpacts } = applyEventImpactsToWorld({
    colors: baseColors,
    events: boundEvents,
    world: {
      ...seededWorld,
      activeCatalyst: result.catalyst ?? null,
      actionSuggestions: [],
      lastJumpMode: normalizeString(result.mode),
      lastJumpSummary: normalizeString(result.summary),
      lastJumpTargetDate: nextGame.gameDate,
      simulationHistory: [
        {
          catalyst: result.catalyst ? cloneValue(result.catalyst) : null,
          date: nextGame.gameDate,
          // Filled in below, once the engine has resolved this jump's battles
          // and successions: those are this turn's events too, and a history
          // entry that omits them makes them unfindable from the round.
          eventIds: turnEvents.map((event) => event.id),
          fallbackReason: normalizeString(result.generation?.fallbackReason),
          fromDate: baseGame.gameDate,
          mode: normalizeString(result.mode) || "jump",
          plannedActions: plannedActionSnapshot,
          round: nextGame.round,
          summary: normalizeString(result.summary),
          source: result.generation?.source || "ai",
          toDate: nextGame.gameDate,
        },
        ...normalizeWorldState(baseWorld).simulationHistory,
      ].slice(0, 12),
    },
  });
  // Then the engine advances every economy across the time that passed. The
  // flows are kept for the next prompt's "this period" line.
  const elapsed = daysBetween(baseGame.gameDate, nextGame.gameDate);
  const advanced = stepWorldEconomies(normalizeWorldState(worldAfterImpacts).economies, elapsed, { programs: normalizeWorldState(worldAfterImpacts).programs, date: nextGame.gameDate, reputation: normalizeWorldState(worldAfterImpacts).internationalReputation, organizations: normalizeWorldState(worldAfterImpacts).organizations, units: normalizeWorldState(worldAfterImpacts).units });
  // Forces cost what they cost: a polity that funds its army below what its
  // units in being require loses strength over the jump (economyBridge
  // attritionOver) — desertion, no shells, no fuel. A unit worn to nothing
  // leaves the map.
  const attrition = advanced.attrition ?? {};
  const wornUnits = normalizeWorldState(worldAfterImpacts).units
    .map((u) => { const lost = attrition[u.ownerCode]; return lost > 0 ? { ...u, strength: Math.max(0, Math.round(u.strength * (1 - lost))) } : u; })
    .filter((u) => u.strength > 0);

  // Then people move. Migration is computed the same way the economy is — from
  // the wage gap, war, collapse and each border's policy, over the same elapsed
  // time — and its deltas go back through the one gated population lever, so
  // what leaves one polity arrives in another and no head is created or lost
  // (runtime/migration.js). After the economy step, because people move on the
  // period's wages; before repinCountryStats, so the sheets show who is there.
  const migrated = stepMigration(advanced.economies, {
    years: elapsed / 365.2425,
    wars: normalizeWorldState(worldAfterImpacts).wars,
    polities: normalizeWorldState(worldAfterImpacts).countryStats,
    migration: normalizeWorldState(worldAfterImpacts).lastMigration,
    date: nextGame.gameDate,
  });
  const economiesAfterMigration = Object.fromEntries(Object.entries(advanced.economies)
    .map(([name, economy]) => [name, migrated.changes[name] ? applyEconomyChange(economy, migrated.changes[name]) : economy]));

  const worldWithImpacts = { ...worldAfterImpacts, economies: economiesAfterMigration, lastEconomyFlows: advanced.flows, lastMigration: migrated.migration, programs: { ...normalizeWorldState(worldAfterImpacts).programs, ...advanced.programs },
    units: wornUnits,
    countryStats: repinCountryStats(normalizeWorldState(worldAfterImpacts).countryStats, economiesAfterMigration, { language: nextGame.language }) };
  // A gathering convoked for a date the turn has now passed is held, on the
  // calendar rather than at the model's discretion (runtime/gatherings.js).
  {
    const due = holdDueGatherings(worldWithImpacts, { asOf: nextGame.gameDate });
    if (due.held.length) {
      Object.assign(worldWithImpacts, due.world);
      worldWithImpacts.record = appendRecord(worldWithImpacts.record, due.rows);
      if (due.faithfulOps?.length && worldWithImpacts.church) {
        worldWithImpacts.church = applyFaithfulOps(worldWithImpacts.church, due.faithfulOps, { date: nextGame.gameDate });
      }
      for (const line of due.refusals) console.warn(`[gatherings] ${line}`);
      console.warn(`[gatherings] held on the calendar: ${due.held.join(", ")}`);
      // What the crowds returned is RECORDED, not re-earned: each surplus went
      // into the host's purse on the day it was held, so paying it again as a
      // yield on capital would pay the body twice for one crowd.
      worldWithImpacts.treasuries = (worldWithImpacts.treasuries ?? []).map((t) => ({
        ...t,
        earnedMargin: realizedMargin(worldWithImpacts.gatherings, t.body, { asOf: nextGame.gameDate, capital: t.capital }),
      }));
    }
  }

  // Then every body with a purse earns on its capital and hands its members
  // their share — a federation pays its continental bodies, which pay their
  // own members, all inside this one period (runtime/treasuries.js).
  {
    const stepped = stepTreasuries(normalizeWorldState(worldAfterImpacts).treasuries, {
      organizations: normalizeWorldState(worldAfterImpacts).organizations,
      economies: worldWithImpacts.economies,
      years: elapsed / 365.25,
      date: nextGame.gameDate,
    });
    if (stepped.rows.length) {
      worldWithImpacts.treasuries = stepped.treasuries;
      worldWithImpacts.economies = stepped.economies;
      worldWithImpacts.record = appendRecord(worldWithImpacts.record, stepped.rows);
    }
  }

  // Then the ordinary year of every chapter kept open: the national gatherings
  // it holds across its own countries, on the running budget its parent just
  // paid, without anyone in the centre convoking them. This is what a standing
  // budget is FOR — a pole that only existed between grand summits now has a
  // year of its own (runtime/gatherings.js).
  {
    const programme = runNationalProgramme(worldWithImpacts, {
      asOf: nextGame.gameDate,
      years: elapsed / 365.25,
      organizations: normalizeWorldState(worldWithImpacts).organizations,
    });
    if (programme.held.length) {
      Object.assign(worldWithImpacts, programme.world);
      worldWithImpacts.record = appendRecord(worldWithImpacts.record, programme.rows);
      if (programme.faithfulOps?.length && worldWithImpacts.church) {
        worldWithImpacts.church = applyFaithfulOps(worldWithImpacts.church, programme.faithfulOps, { date: nextGame.gameDate });
      }
      console.warn(`[gatherings] national programmes held by: ${programme.held.join(", ")}`);
    }
  }

  // And the one the whole federation holds together, once every few years, out
  // of its own campaign fund: the planetary gathering that is the reason such a
  // body exists at all (runtime/gatherings.js).
  {
    const world = runWorldProgramme(worldWithImpacts, {
      asOf: nextGame.gameDate,
      years: elapsed / 365.25,
      organizations: normalizeWorldState(worldWithImpacts).organizations,
    });
    if (world.held.length) {
      Object.assign(worldWithImpacts, world.world);
      worldWithImpacts.record = appendRecord(worldWithImpacts.record, world.rows);
      if (world.faithfulOps?.length && worldWithImpacts.church) {
        worldWithImpacts.church = applyFaithfulOps(worldWithImpacts.church, world.faithfulOps, { date: nextGame.gameDate });
      }
      console.warn(`[gatherings] world gathering held by: ${world.held.join(", ")}`);
    }
  }

  // And then the room judges the year. Every faction reads the same figures and
  // reaches its own verdict, because each judges by what it exists for — one
  // counts souls, another counts accounts — and the seats follow those verdicts
  // slowly (runtime/factions.js). This is what makes governing, rather than
  // decreeing, the way to carry a body.
  if (worldWithImpacts.assembly) {
    const rowsFor = registerRows(worldWithImpacts, nextGame.country || "");
    // What each figure did since the pontificate began, as a signed relative
    // change — the register already computes exactly this.
    const movements = Object.fromEntries(rowsFor
      .filter((r) => r.from != null && r.delta != null && r.from !== 0)
      .map((r) => [r.key, r.delta / Math.abs(r.from)]));
    // How much was reorganised: an order that dissolves, merges or refounds
    // something is upheaval, and the factions that liked things as they were
    // feel it whatever the reform was worth.
    const churn = plannedActionSnapshot.filter((a) => /\b(dissou\w*|dissolv\w*|supprim\w*|refond\w*|réorganis\w*|reorganis\w*|fusionn\w*|abolir|abolish|merge|restructur\w*)/i
      .test(`${a.title ?? ""} ${a.text ?? ""}`)).length;

    // Speeches the player actually gave, read from their own orders. Written and
    // tested and never called: the College page queued the order and no code
    // path ever read it back, so "Put it to them" moved nothing at all. A lever
    // with no caller is worse than a missing one — it looks like it works.
    let spoken = worldWithImpacts.assembly;
    for (const order of plannedActionSnapshot) {
      const legitimacy = Number(worldWithImpacts.economies?.[nextGame.country]?.legitimacy);
      const speech = speechFromOrder(order, {
        assembly: spoken,
        legitimacy: Number.isFinite(legitimacy) ? legitimacy : 50,
        date: nextGame.gameDate,
      });
      if (!speech) continue;
      // The room has the ledger too: a speech whose figures the engine can
      // check and finds false costs ground instead of winning it.
      const economy = worldWithImpacts.economies?.[nextGame.country];
      const claims = economy ? checkLedgerClaims(`${order?.title ?? ""} ${order?.text ?? ""}`, economyIndicators(economy)) : [];
      const applied = applySpeech(spoken, speech, { honest: !claims.length });
      if (claims.length) console.warn(`[assembly] the speech claimed ${claims.length} figure(s) the ledger contradicts`);
      spoken = applied.assembly;
      for (const line of applied.refusals) console.warn(`[assembly] ${line}`);
      console.warn(`[assembly] speech delivered to ${speech.at.length ? speech.at.join(", ") : "the whole room"}`);
    }
    worldWithImpacts.assembly = spoken;

    const judged = judgeGovernance(worldWithImpacts.assembly, {
      movements,
      upheaval: Math.min(1, churn / 2),
      date: nextGame.gameDate,
    });
    const blundered = driftFromBlunders(judged.assembly, worldWithImpacts.intents, {
      asOf: nextGame.gameDate, date: nextGame.gameDate,
    });
    // And then they work on each other. Those who have gone to an extreme argue
    // with the people around them, for the player or against — heard in
    // proportion to what they share, and hardly at all by anyone already
    // committed the other way. Without it a college could hold twenty zealots
    // and twenty radicals for a year with nothing passing between them.
    const preached = persuadeNeighbours(blundered.assembly, { date: nextGame.gameDate });
    worldWithImpacts.assembly = preached.assembly;
    if (preached.preachers) console.warn(`[assembly] ${preached.preachers} electors worked on the room`);

    // One row per group that actually shifted, so the paper reads the room
    // rather than a hundred and sixty individual moods.
    for (const row of [...judged.rows, ...blundered.rows, ...preached.rows]) {
      worldWithImpacts.record = appendRecord(worldWithImpacts.record, [{
        date: nextGame.gameDate, polity: row.group, kind: "standing",
        what: row.reason, amount: row.step, unit: "pt",
        source: `assembly:${row.axis || "all"}:${row.seats} electors`,
      }]);
    }
    const room = standing(worldWithImpacts.assembly);
    if (room) console.warn(`[assembly] with you ${room.with}, undecided ${room.undecided}, against ${room.against} of ${room.seats}`);
  }

  // The record's own line for this turn: what the engine's step actually did
  // to the player's stocks over the elapsed time (runtime/record.js). Written
  // from the flows, never from the narration, so the paper is a trace.
  {
    const who = baseGame.country ?? "";
    const flow = advanced.flows?.[who];
    const rows = [];

    // Money that arrives without being asked for (runtime/consequences.js).
    //
    // The player kept having to ask me to invent a donor, because the engine
    // never produced one: every inflow beyond the standing `transfers` came
    // from the model, so a world without the model was a world where nothing
    // could ever arrive and a pope in deficit had no move that was not a cut.
    // The rule instead: legacies run at a fixed share of the standing donation
    // flow, scaled by how far the pontificate is trusted, inside a band. Small
    // on purpose — not a way out of a deficit, just the reason holding your
    // standing is worth something in cash as well as in votes.
    if (who && Number(flow?.years) > 0) {
      const economy = worldWithImpacts.economies?.[who];
      const left = bequestFor(economy, { years: Number(flow.years) });
      if (left > 0) {
        worldWithImpacts.economies = {
          ...worldWithImpacts.economies,
          [who]: { ...economy, treasury: (Number.isFinite(Number(economy?.treasury)) ? Number(economy.treasury) : 0) + left },
        };
        rows.push({ date: nextGame.gameDate, polity: who, kind: "money", what: "legs et dons non sollicités", amount: left, unit: "SY", source: "step:bequests" });
        const entry = bequestEvent({ amount: left, player: who, date: nextGame.gameDate, economy });
        if (entry) {
          const normalized = normalizeEventEntry({ ...entry, id: `bequest-${nextGame.round}` }, turnEvents.length + battleEvents.length);
          if (normalized) battleEvents.push(normalized);
        }
      }
    }

    if (flow && Number(flow.years) > 0) {
      if (Math.round(Number(flow.balance) || 0) !== 0) {
        rows.push({ date: nextGame.gameDate, polity: who, kind: "money", what: Number(flow.balance) < 0 ? "déficit du budget sur la période" : "excédent du budget sur la période", amount: Number(flow.balance), unit: "SY", source: "step:balance" });
      }
      if (Number(flow.drawn) > 0) {
        rows.push({ date: nextGame.gameDate, polity: who, kind: "patrimony", what: "patrimoine vendu pour payer les factures", amount: -Number(flow.drawn), unit: "SY", source: "step:drawdown" });
      }
      if (Number(flow.borrowed) > 0) {
        rows.push({ date: nextGame.gameDate, polity: who, kind: "money", what: "emprunté", amount: Number(flow.borrowed), unit: "SY", source: "step:borrowing" });
      }
    }
    if (rows.length) worldWithImpacts.record = appendRecord(worldWithImpacts.record, rows);
  }
  // Reforming-pope mode: the faithful move with real demography and the
  // Holy See's standing over the same elapsed time (null ledger → untouched).
  if (normalizeWorldState(worldAfterImpacts).church) {
    worldWithImpacts.church = stepFaithful(normalizeWorldState(worldAfterImpacts).church, { years: elapsed / 365.25, legitimacy: advanced.economies?.[HOLY_SEE]?.legitimacy, date: nextGame.gameDate });

    // The other five fronts (runtime/fronts.js). The clergy ages at its real
    // rate, the abuse files move at whatever pace the curia has been set, and
    // BOTH are bent by what the player's own orders actually say — read here,
    // from the orders, rather than asked of the model in a prompt. A pope who
    // opens seminaries across Africa sees Africa's seminaries fill whatever the
    // edition writes about it, and a pope who only announces zero tolerance
    // watches the backlog grow exactly as it would have without him.
    const body = ensureBodyFromOrders(worldWithImpacts, plannedActionSnapshot, {
      years: elapsed / 365.25,
      date: nextGame.gameDate,
    });
    worldWithImpacts.churchBody = body.churchBody;
    if (body.notes.length) {
      worldWithImpacts.record = appendRecord(worldWithImpacts.record, body.notes.map((what) => ({
        date: nextGame.gameDate, polity: HOLY_SEE, kind: "body", what, source: "orders:fronts",
      })));
    }

    // The edition just narrated is the one the declaration was owed; from here on
    // the answers are no longer due (runtime/inauguration.js).
    Object.assign(worldWithImpacts, markDeclarationAnswered(worldWithImpacts));
  }

  // War is state, and the fighting resolves from it: every pair of units on
  // opposite sides of an active war standing within engagement range clashes
  // once, deterministically (runtime/wars.js resolveAiClashes → unitCombat's
  // resolveClash, the same arithmetic the player's own attacks use). The
  // battles become events for the next turn to narrate; a polity's economy is
  // on a war footing exactly while it is in an active war, never otherwise.
  const warsNow = normalizeWorldState(worldWithImpacts).wars;
  const clashes = resolveAiClashes(worldWithImpacts.units, warsNow, { round: nextGame.round, date: nextGame.gameDate });
  worldWithImpacts.units = clashes.units.filter((u) => u.strength > 0);
  worldWithImpacts.wars = clashes.wars;
  const warFlags = warEconomyFlags(warsNow);
  worldWithImpacts.economies = Object.fromEntries(Object.entries(worldWithImpacts.economies ?? {})
    .map(([name, economy]) => [name, economy?.atWar === Boolean(warFlags[name]) ? economy : { ...economy, atWar: Boolean(warFlags[name]) }]));
  for (const battle of clashes.events) {
    const entry = normalizeEventEntry({ ...battle, id: `battle-${nextGame.round}-${turnEvents.length + battleEvents.length}` }, battleEvents.length);
    if (entry) battleEvents.push(entry);
  }

  // Leaders are mortal and their terms run out (runtime/succession.js): the
  // engine seeds a leader for every polity whose stat sheet names one, then
  // steps the calendar and the mortality hazard across the jump. What comes
  // due — an election, a conclave, a death — is an event the NEXT turn must
  // resolve with leaderOps; nothing here invents a successor.
  const seededLeaders = { ...normalizeWorldState(worldWithImpacts).leaders };
  for (const [polity, stats] of Object.entries(normalizeWorldState(worldWithImpacts).countryStats ?? {})) {
    if (!seededLeaders[polity] && stats?.leader) {
      const seed = seedLeaderFromStats(polity, stats, normalizeWorldState(worldWithImpacts).countryTags?.[polity] ?? [], baseGame.gameDate);
      if (seed) seededLeaders[polity] = seed;
    }
  }
  const stepped = stepLeaders(seededLeaders, { date: baseGame.gameDate, days: elapsed });
  worldWithImpacts.leaders = stepped.leaders;
  for (const due of stepped.due) {
    const entry = normalizeEventEntry({
      date: due.date || nextGame.gameDate,
      kind: "succession",
      importance: due.kind === "death-risk" || due.kind === "conclave" ? "major" : "minor",
      source: "engine",
      notable: true,
      playerRelated: due.polity === baseGame.country,
      participants: [due.polity],
      title: due.kind === "conclave" ? `${due.polity}: the see falls vacant` : due.kind === "death-risk" ? `${due.polity}: the head of state dies` : `${due.polity}: the seat falls due`,
      description: due.reason,
    }, battleEvents.length);
    if (entry) battleEvents.push(entry);
  }

  if (battleEvents.length) {
    nextEvents = [...nextEvents, ...battleEvents];
    // This round's history entry was written before the engine resolved them.
    const round = worldWithImpacts.simulationHistory?.[0];
    if (round) round.eventIds = [...round.eventIds, ...battleEvents.map((event) => event.id)];
  }

  // A polity the campaign has actually touched becomes an actor
  // (runtime/naturalize.js). Measured on a real save fifty turns in: the world
  // held seven actors and all seven were the player's own internal factions, so
  // no country could scheme, pay, refuse or be hurt, and a letter to Berlin was
  // answered by a voice with no state behind it. Naturalising every country up
  // front would be two hundred economies of noise; naturalising the ones a turn
  // names costs nothing and makes them real from the moment they matter.
  {
    const touched = [
      ...boundEvents.map((event) => normalizeString(event.actor)),
      ...boundEvents.flatMap((event) => normalizeArray(event.impacts?.createdChats).flatMap((c) => normalizeArray(c?.countries).map(normalizeString))),
      ...normalizeArray(nextChats).flatMap((c) => normalizeArray(c?.countries).map((x) => normalizeString(x?.name))),
    ].filter(Boolean).filter((name) => name !== normalizeString(baseGame.country));

    if (touched.length) {
      const known = await loadCountryNames().catch(() => []);
      const grown = naturalizeContacts(worldWithImpacts, touched, {
        date: nextGame.gameDate,
        known,
        // Share of the map it holds, from the ownership the world already knows.
        shareOf: (name) => {
          const owned = Object.values(normalizeWorldState(worldWithImpacts).regionOwnershipOverrides ?? {})
            .filter((owner) => normalizeString(owner) === name).length;
          const total = Math.max(1, Object.keys(normalizeWorldState(worldWithImpacts).regionOwnershipOverrides ?? {}).length);
          return owned > 0 ? Math.max(0.0005, owned / total) : 0.005;
        },
        tagsOf: (name) => normalizeArray(worldWithImpacts.countryTags?.[name]),
        reason: "named in this edition",
      });
      if (grown.added.length) {
        Object.assign(worldWithImpacts, grown.world);
        console.warn(`[naturalize] entered the campaign: ${grown.added.join(", ")}`);
      }
    }
  }

  let nextWorld = worldWithImpacts;

  for (const event of boundEvents) {
    for (const createdChat of event.impacts.createdChats) {
      const nextChat = await buildGeneratedChat(createdChat, event.id, worldWithImpacts, {
        fallbackTitle: event.title,
        playerName: baseGame.country,
      });
      if (nextChat) { nextChats.unshift(nextChat); generatedChats.unshift(nextChat); }
    }
  }

  // Unprompted outreach: polities reaching out on their own initiative during
  // the simulated period, not tied to any event (treaty feelers, summit
  // invitations). Same chat machinery, no linked event.
  for (const chatLike of normalizeArray(result.outreach)) {
    const nextChat = await buildGeneratedChat({ ...chatLike, source: "outreach" }, "", worldWithImpacts, {
      playerName: baseGame.country,
    });
    if (nextChat) { nextChats.unshift(nextChat); generatedChats.unshift(nextChat); }
  }

  if (result.mode === "jump" || result.mode === "auto") {
    const historyBefore = worldWithImpacts;
    try {
      nextWorld = await compactHistoryIfNeeded({
        actions: nextActions,
        chats: nextChats,
        events: nextEvents,
        game: nextGame,
        world: worldWithImpacts,
      });
    } catch (error) {
      console.warn("[ai] campaign history consolidation failed; the completed turn will still be saved.", error);
    }
    // Both tiers are the SAME eventConsolidator task, and both cost a full AI
    // call. If the first tier just ran, the newest entry is seconds old — folding
    // it straight back into a second-pass summary would compress prose the model
    // has not even seen once yet, for a second call in the same jump. The tail
    // condensation is not urgent: it happens on the next jump that does not
    // consolidate, which is the overwhelming majority of them.
    if (!consolidationHappened(historyBefore, nextWorld)) {
      try {
        nextWorld = await condenseAncientHistoryIfNeeded({
          actions: nextActions, chats: nextChats, events: nextEvents, game: nextGame, world: nextWorld,
        });
      } catch (error) {
        console.warn("[ai] ancient-history condensation failed; the completed turn will still be saved.", error);
      }
    }
  }

  // Re-read the chat list instead of writing the pre-turn snapshot back over it.
  // Turns take a while, and anything the player did to the list while one ran —
  // deleting a thread, archiving one — exists only in storage. Writing baseChats
  // on top resurrected deleted chats, and the AI's next message then landed in the
  // revived thread instead of opening a fresh one. Falls back to the snapshot if
  // the read fails, which is the old behaviour and never loses a generated chat.
  let chatsToWrite;
  try {
    chatsToWrite = [...generatedChats, ...normalizeChats(await readChatsState({ force: true }))];
  } catch {
    chatsToWrite = nextChats;
  }

  await Promise.all([
    writeActionsState(nextActions),
    writeChatsState(chatsToWrite),
    writeEventsState(nextEvents),
    writeGameData(nextGame),
    writeJson(JSON_URLS.colors, nextColors, { pretty: true }),
    writeWorldState(nextWorld),
  ]);

  // The turn's new state is now persisted. Web-mode encrypted sync listens for this
  // to back up the turn (replacing a fixed 20s poll); it is a no-op in desktop mode
  // where nothing listens. Firing here — the single choke point every turn type runs
  // through (jump, auto-jump, catalyst, game-master) — means the sync's full scan
  // sees the committed round.
  if (typeof window !== "undefined") window.dispatchEvent(new Event("oh:turn-complete"));

  // Snapshot the state we just replaced so it can be rolled back to (best-effort).
  await captureRollbackSnapshot({
    round: baseGame.round || 1,
    fromDate: baseGame.gameDate || baseGame.startDate || "",
    toDate: nextGame.gameDate || "",
    game: baseGame,
    world: baseWorld,
    events: baseEvents,
    actions: baseActions,
    chat: baseChats,
    colors: baseColors,
  });

  return {
    actions: nextActions,
    chats: chatsToWrite, // what was actually persisted, not the pre-turn snapshot
    colors: nextColors,
    events: nextEvents,
    game: nextGame,
    generation: result.generation ?? { source: "ai", fallbackReason: "" },
    world: nextWorld,
  };
};

export const generateActionSuggestions = async ({ force = true } = {}) => {
  const bundle = await readGameStateBundle({ force });
  const variables = await buildTemplateVariables(bundle);
  const { payload } = await runJsonTask("actions", {
    fallback: () => fallbackActionSuggestions(bundle),
    userMessage: "Generate current strategic action suggestions as JSON only.",
    variables,
  });

  const normalizeTopics = (raw) =>
    normalizeArray(raw)
      .map((topic, topicIndex) => {
        if (!topic || typeof topic !== "object") {
          return null;
        }

        const title = normalizeString(topic.title || topic.name);
        if (!title) {
          return null;
        }

        return {
          actions: normalizeArray(topic.actions)
            .map((action, actionIndex) =>
              normalizeActionEntry(
                {
                  ...action,
                  source: "suggested",
                  suggestionTopic: title,
                },
                actionIndex,
              ),
            )
            .filter(Boolean),
          description: normalizeString(topic.description),
          id: normalizeString(topic.id) || `topic-${topicIndex}`,
          title,
        };
      })
      .filter(Boolean);

  // Models told "JSON only" mislabel or wrap the list — accept the common
  // shapes (top-level array, topics, suggestions) before giving up.
  let topics = normalizeTopics(
    Array.isArray(payload) ? payload : payload?.topics ?? payload?.suggestions,
  );

  // A parseable-but-EMPTY answer used to be accepted as "no suggestions were
  // generated" — the deterministic fallback (which always has topics) now
  // covers it, same as empty timeline turns.
  if (topics.length === 0) {
    console.warn("[ai] action suggestions came back empty — using the deterministic fallback.");
    topics = normalizeTopics((await fallbackActionSuggestions(bundle))?.topics);
  }

  const world = normalizeWorldState(await readWorldState());
  world.actionSuggestions = topics;
  await writeWorldState(world);

  return topics;
};

// Freeform AI intelligence briefing on a specific country/polity, grounded in the
// current world state. Returned as plain-text bullet points for the region popup.
// Everything the game state actually records about ONE polity — the target's
// dossier for intelligence briefings. The generic world summary truncates hard
// (24 of possibly thousands of region overrides, 16 polities), so without this
// the target usually isn't in the prompt at all and the AI can only shrug.
const buildTargetDossier = async (bundle, code) => {
  const world = normalizeWorldState(bundle.world);
  const lines = [];

  const economy = code ? world.economies?.[code] : null;
  if (economy) lines.push("Economy (computed by the engine; treat as ground truth):" + String.fromCharCode(10) + describeEconomy(code, economy, { full: true }));

  // What THIS specific campaign has recorded about the polity itself — a war
  // it fought, a coup, an invention — independent of the global event log and
  // its consolidation, which favour the player and the great powers and can
  // compress a minor polity's own history away with nothing left naming it.
  const history = code ? world.countryStats?.[code]?.history : null;
  if (Array.isArray(history) && history.length > 0) {
    lines.push(`This polity's own recorded history (do not contradict; you may reference or build on it):\n- ${history.join("\n- ")}`);
  }

  const polity = code ? world.polityOverrides?.[code] : null;
  if (polity) {
    lines.push(
      `Polity: ${polity.name || code} (code ${code})${
        polity.aliases?.length > 0 ? ` — also known as ${polity.aliases.join(", ")}` : ""
      }`,
    );
    if (polity.note) lines.push(`Notes: ${polity.note}`);
  }

  const overrides = Object.entries(world.regionOwnershipOverrides ?? {});
  const owned = code ? overrides.filter(([, owner]) => owner === code) : [];
  if (owned.length > 0) {
    const regionCatalog = await loadRegionCatalog();
    const regionLookup = new Map(regionCatalog.map((region) => [region.id, region]));
    const names = owned.slice(0, 40).map(([regionId]) => {
      const region = regionLookup.get(regionId);
      return region ? `${region.name}${region.country ? ` (${region.country})` : ""}` : regionId;
    });
    lines.push(
      `Territory: holds ${owned.length} regions${owned.length > names.length ? ", including" : ""}: ${names.join(", ")}${
        owned.length > names.length ? ", …" : ""
      }`,
    );
  } else if (code) {
    lines.push(
      overrides.length > 0
        ? `Territory: no regions on the current map are recorded as held by ${code}.`
        : `Territory: holds its modern-day territory (no territorial changes recorded).`,
    );
  }

  const units = normalizeArray(bundle.world?.units).filter((unit) => unit?.ownerCode === code);
  if (units.length > 0) {
    const byType = new Map();
    let strength = 0;
    for (const unit of units) {
      byType.set(unit.type, (byType.get(unit.type) || 0) + 1);
      strength += Number(unit.strength) || 0;
    }
    const composition = Array.from(byType.entries()).map(([type, n]) => `${n} ${type}`).join(", ");
    lines.push(`Deployed forces: ${units.length} units (${composition}), combined strength ${strength}.`);
  } else {
    lines.push("Deployed forces: none currently on the map.");
  }

  return lines.join("\n");
};

export const generateCountryStats = async ({ code, name } = {}) => {
  const bundle = await readGameStateBundle({ force: true });
  const variables = await buildTemplateVariables(bundle);
  const target = name || code || "the polity";
  const playerPolity = variables.playerPolity || bundle?.game?.country || "the player";
  const dossier = await buildTargetDossier(bundle, normalizeString(code));
  const era = normalizeString(bundle.world?.simulationRules).slice(0, 700);
  const system =
    `You are the intelligence advisor in an alternate-history strategy game. ` +
    `The current date is ${variables.date || "unknown"}. The player leads ${playerPolity}. ` +
    `Give a concise intelligence briefing on ${target}${code ? ` (code ${code})` : ""}. ` +
    `Treat the TARGET DOSSIER and WORLD STATE below as ground truth. Where specifics are not recorded, ` +
    `give your best historical estimate for this era, people and region — you are the advisor, and ` +
    `plausible estimates are your job. Never answer with "unknown", "no data" or "not specified"; ` +
    `mark guesses with "(est.)" instead. ` +
    `Cover government/leadership, territory & key regions, military strength, economy, and diplomatic posture toward ${playerPolity}.\n\n` +
    (era ? `ERA & WORLD RULES:\n${era}\n\n` : "") +
    `TARGET DOSSIER:\n${dossier || "(nothing recorded)"}\n\n` +
    `WORLD STATE:\n${variables.worldSummary || variables.grandMapDescription || "(no summary)"}\n\n` +
    `RECENT EVENTS:\n${variables.recentEvents || "(none)"}\n\n` +
    `Respond in ${variables.language || "English"} as 4-6 short bullet points, each prefixed with "- ". No preamble, no closing remarks.`;
  const raw = await callAI(system, [
    { role: "user", parts: [{ text: `Give me the intelligence briefing on ${target}.` }] },
  ]);
  return String(raw || "").trim();
};

// Structured national stat sheet for the Stats tab, grounded in the same
// campaign context as the intelligence briefing.
export const generateCountryStatSheet = async ({ code, name } = {}) => {
  const bundle = await readGameStateBundle({ force: true });
  const variables = await buildTemplateVariables(bundle);
  const target = name || code || "the polity";
  const dossier = await buildTargetDossier(bundle, normalizeString(code));
  const era = normalizeString(bundle.world?.simulationRules).slice(0, 700);
  const { payload } = await runJsonTask("countryStatSheet", {
    userMessage: [
      `Compile the national stat sheet for ${target}${code ? ` (code ${code})` : ""}.`,
      era ? `ERA & WORLD RULES:\n${era}` : "",
      `TARGET DOSSIER:\n${dossier || "(nothing recorded)"}`,
    ].filter(Boolean).join("\n\n"),
    variables,
  });
  // Persist into world state so the sheet SURVIVES date changes and the AI can mutate
  // it via polityChanges.stats (see applyEventImpactsToWorld) — "stats persist and only
  // change when the AI changes them". Re-read the world first to avoid clobbering a
  // concurrent jump's write.
  const statCode = normalizeString(code);
  // The engine's figures win over the model's guesses on every field the
  // engine computes, and the fields the model writes once are carried over
  // from the previous sheet, so a regenerated sheet cannot drift. The first
  // sheet also anchors the polity's dollar value of a subsistence-year, after
  // which GDP is the engine's output at that anchor.
  if (statCode && payload && typeof payload === "object") {
    const bundleNow = await readGameStateBundle({ force: true });
    const worldNow = normalizeWorldState(bundleNow.world);
    let engineEconomy = worldNow.economies?.[statCode] ?? variables.economies?.[statCode] ?? null;
    if (engineEconomy && Number(payload.gdpPerCapitaUsd) > 0 && !(Number(engineEconomy.usdPerSY) > 0)) {
      engineEconomy = anchorUnitValue(engineEconomy, payload.gdpPerCapitaUsd);
      await writeWorldState({ ...worldNow, economies: { ...worldNow.economies, [statCode]: engineEconomy } });
    }
    if (engineEconomy) {
      const pinned = pinStatSheetToEngine(payload, engineEconomy, { previous: worldNow.countryStats?.[statCode] ?? null, language: variables.language });
      Object.assign(payload, pinned);
    }
  }
  if (statCode && payload && typeof payload === "object") {
    try {
      const world = normalizeWorldState(await readWorldState({ force: true }));
      await writeWorldState({ ...world, countryStats: { ...world.countryStats, [statCode]: payload } });
    } catch (error) {
      console.warn("[ai] failed to persist country stats:", error);
    }
  }
  return payload;
};

export const refinePlayerAction = async (rawInput, { persist = true, signal } = {}) => {
  const bundle = await readGameStateBundle({ force: true });
  // descriptionToAction reads only WORLD_BEFORE_ROUND_ONE_TEXT,
  // HISTORICAL_PRESET_SIMULATION_RULES, ORIGIN_ROUND_DATE, PLAYER_POLITY,
  // DESCRIPTION_ACTION_TEXT, GRAND_MAP_DESCRIPTION_NO_CITY,
  // PLAYER_ACTIONS_THIS_ROUND and ${language}, and gets no call-time block —
  // so the heavy builders were pure waste here (see buildPromptContext minimal).
  const variables = await buildTemplateVariables(bundle, { actionInput: rawInput, minimal: true });
  const { payload } = await runJsonTask("descriptionToAction", {
    fallback: () => fallbackDescriptionToAction(rawInput, bundle),
    // Improve can be stopped mid-generation, exactly like a timeline jump.
    // runJsonTask already links an external signal to the controller it hands
    // the provider, so on a local model the next token write fails and inference
    // stops rather than running to completion unheard.
    signal,
    userMessage: "Convert the player's raw intent into one structured in-game command as JSON only.",
    variables,
  });

  const invitees = normalizeArray(payload?.invitees).map((entry) => normalizeString(entry)).filter(Boolean);
  const action = normalizeActionEntry({
    chatStarter: normalizeString(payload?.chatStarter),
    invitees,
    kind: normalizeString(payload?.kind).toLowerCase() === "chat" ? "chat" : "action",
    rawInput,
    source: "manual",
    status: "planned",
    text: normalizeString(payload?.text),
    title: normalizeString(payload?.title),
  });

  if (!action) {
    throw new Error("Could not convert the action into a structured command.");
  }

  if (persist) {
    const nextActions = [...(await readActionsState({ force: true })), action];
    await writeActionsState(nextActions);
  }

  return action;
};

export const chooseNextDiplomaticSpeaker = async ({
  chat,
  excludeSpeaker = "",
} = {}) => {
  const bundle = await readGameStateBundle({ force: true });
  const normalizedChat = normalizeChats([chat])[0];
  if (!normalizedChat) {
    return "";
  }

  // nextSpeaker reads only PLAYER_POLITY, THIS_CHATS_MOST_RECENT_SPEAKER,
  // CHAT_PARTICIPANTS and THIS_CHAT_HISTORY — all of which minimal still builds.
  const variables = await buildTemplateVariables(bundle, { chat: normalizedChat, minimal: true });
  const { payload } = await runJsonTask("nextSpeaker", {
    fallback: () => fallbackNextSpeaker({ chat: normalizedChat, excludedSpeaker: excludeSpeaker }),
    userMessage: "Choose the next speaker as JSON only.",
    variables: {
      ...variables,
      lastSpeaker: excludeSpeaker || variables.lastSpeaker,
    },
  });

  const nextSpeaker = normalizeString(payload?.nextSpeaker);
  if (!nextSpeaker) {
    return fallbackNextSpeaker({ chat: normalizedChat, excludedSpeaker: excludeSpeaker }).nextSpeaker;
  }

  const validSpeaker =
    normalizedChat.countries.find((country) => country.name.toLowerCase() === nextSpeaker.toLowerCase()) ??
    normalizedChat.countries.find((country) => country.name !== excludeSpeaker);

  return validSpeaker?.name || "";
};

export const consolidateRecentHistory = async ({ limit = 12 } = {}) => {
  const bundle = await readGameStateBundle({ force: true });
  const events = getUnconsolidatedEvents(bundle.events, bundle.world).slice(0, limit);
  const chats = normalizeChats(bundle.chats).filter((chat) => chat.status === "closed").slice(0, limit);
  const { summary } = await consolidateHistoryBatch(bundle, events, chats);
  return summary;
};

export const createCatalyst = async ({ force = true } = {}) => {
  const bundle = await readGameStateBundle({ force });
  const variables = await buildTemplateVariables(bundle);
  const { payload } = await runJsonTask("catalystCreation", {
    fallback: () => ({
      choices: [
        "Intervene decisively",
        "Probe for weakness first",
        "Remain cautious and observe",
      ],
      opening: normalizeEvents(bundle.events).at(-1)?.description || "A turning point begins to unfold.",
      premise: normalizeEvents(bundle.events).at(-1)?.title || "A decisive moment takes shape.",
      title: normalizeEvents(bundle.events).at(-1)?.title || "Emerging Catalyst",
    }),
    userMessage: "Design the next catalyst scene as JSON only.",
    variables,
  });

  const catalyst = {
    choices: normalizeArray(payload?.choices).map((entry) => normalizeString(entry)).filter(Boolean).slice(0, 5),
    opening: normalizeString(payload?.opening),
    premise: normalizeString(payload?.premise),
    title: normalizeString(payload?.title),
  };

  const world = normalizeWorldState(await readWorldState({ force: true }));
  world.activeCatalyst = catalyst;
  await writeWorldState(world);
  return catalyst;
};

export const advanceActiveCatalyst = async (choiceText) => {
  beginSimulation();
  try {
  const bundle = await readGameStateBundle({ force: true });
  const baseColors = await readJson(JSON_URLS.colors, { defaultValue: {}, force: true });
  const world = normalizeWorldState(bundle.world);
  const catalyst = world.activeCatalyst;

  if (!catalyst) {
    throw new Error("No active catalyst is available.");
  }

  const catalystHistoryText = normalizeArray(catalyst.history)
    .map((entry) => `${entry.choice}: ${entry.summary}`)
    .join("\n");
  const variables = await buildTemplateVariables(bundle, {
    catalystChoice: choiceText,
    catalystHistory: catalystHistoryText,
    catalystOpening: catalyst.opening || "",
    catalystPremise: catalyst.premise || catalyst.title || "",
  });

  const { payload } = await runJsonTask("catalystExecutor", {
    fallback: () => {
      const resolved = normalizeArray(catalyst.history).length >= 1;
      const existingChoices = normalizeArray(catalyst.choices)
        .map((entry) => normalizeString(entry))
        .filter(Boolean);
      const distinctChoices = Array.from(
        new Map(existingChoices.map((choice) => [choice.toLocaleLowerCase(), choice])).values(),
      );
      const nextChoices = distinctChoices.length >= 2
        ? distinctChoices.slice(0, 5)
        : ["Press the advantage", "Reassess the situation"];
      return {
        nextChoices: resolved ? [] : nextChoices,
        resolved,
        summary: `${choiceText} becomes the line of action inside "${catalyst.title || "the scene"}", pushing the situation toward a definite outcome.`,
      };
    },
    userMessage: "Continue the catalyst scene as JSON only.",
    variables,
  });

  const historyEntry = {
    choice: choiceText,
    summary: normalizeString(payload?.summary),
  };

  const nextCatalyst = {
    ...catalyst,
    choices: normalizeArray(payload?.nextChoices).map((entry) => normalizeString(entry)).filter(Boolean).slice(0, 5),
    history: [...normalizeArray(catalyst.history), historyEntry],
    opening: normalizeString(payload?.summary) || catalyst.opening,
  };

  if (!payload?.resolved) {
    const nextWorld = {
      ...world,
      activeCatalyst: nextCatalyst,
    };
    await writeWorldState(nextWorld);
    return {
      catalyst: nextCatalyst,
      world: nextWorld,
    };
  }

  const summaryVariables = await buildTemplateVariables(bundle, {
    catalystHistory: [...normalizeArray(catalyst.history), historyEntry]
      .map((entry) => `${entry.choice}: ${entry.summary}`)
      .join("\n"),
    catalystPremise: catalyst.premise || catalyst.title || "",
  });
  const { generation: summaryGeneration, payload: summaryPayload } = await runJsonTask("catalystSummary", {
    fallback: () => ({
      description: historyEntry.summary,
      importance: "major",
      title: catalyst.title || "Catalyst resolved",
    }),
    userMessage: "Summarize the finished catalyst into one campaign event as JSON only.",
    variables: summaryVariables,
  });

  const catalystEvent = normalizeGeneratedEvent({
    date: bundle.game.gameDate,
    description: normalizeString(summaryPayload?.description),
    impacts: {
      createdChats: [],
      polityChanges: [],
      regionTransfers: [],
    },
    importance: normalizeString(summaryPayload?.importance) || "major",
    kind: "catalyst",
    notable: true,
    playerRelated: true,
    title: normalizeString(summaryPayload?.title) || catalyst.title || "Catalyst resolved",
    source: summaryGeneration.source,
  });

  return applySimulationResult({
    baseActions: bundle.actions,
    baseChats: bundle.chats,
    baseColors,
    baseEvents: bundle.events,
    baseGame: bundle.game,
    baseWorld: {
      ...bundle.world,
      activeCatalyst: null,
    },
    result: {
      catalyst: null,
      clearActions: false,
      events: catalystEvent ? [catalystEvent] : [],
      mode: "catalyst",
      stopDate: bundle.game.gameDate,
      summary: normalizeString(summaryPayload?.description) || historyEntry.summary,
      generation: summaryGeneration,
    },
  });
  } finally {
    endSimulation();
  }
};

// Event density per skip length (player-tuned): longer skips must return
// proportionally more events, and short ones must stay brief.
const eventCountRangeForDays = (days) => {
  if (days < 1) return [1, 1];   // sub-day skip (e.g. 6 hours)
  if (days <= 7) return [1, 2];
  if (days <= 31) return [5, 7];
  if (days <= 92) return [10, 13];
  if (days <= 184) return [19, 27];
  return [29, 37];
};

// Human-readable label for the skipped span, used in the AI prompt. Collapses
// whole-day counts into weeks/months/years where they divide evenly.
const formatDurationLabel = (days) => {
  if (days < 1) {
    const hours = Math.max(1, Math.round(days * 24));
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const whole = Math.round(days);
  const pluralize = (n, unit) => `${n} ${unit}${n === 1 ? "" : "s"}`;
  if (whole % 365 === 0) return pluralize(whole / 365, "year");
  if (whole % 30 === 0) return pluralize(whole / 30, "month");
  if (whole % 7 === 0) return pluralize(whole / 7, "week");
  return pluralize(whole, "day");
};

export const simulateTimelineJump = async ({ days, mode = "jump", signal } = {}) => {
  // Two doors open onto this turn - the bulletin's press block and the map's
  // timeline panel - and each used to guard itself with its OWN local flag, so
  // neither could see the other. Field report: sending the edition to press
  // while the timeline panel was already running the same jump simulated the
  // turn twice; both runs had read the same bundle at entry and wrote it all
  // back at the end, so the treasury moved twice and a gathering was held
  // twice. The lock belongs here, where both doors lead. Refused BEFORE
  // beginSimulation so the refusal's own exit cannot decrement the count of
  // the turn that is genuinely running.
  if (isSimulationBusy()) {
    throw new Error("A turn is already being simulated. Wait for it to finish before starting another.");
  }
  beginSimulation();
  try {
  const bundle = await readGameStateBundle({ force: true });
  // An order that announces a drive with a target ("raise 500 million") makes
  // the drive exist BEFORE the model writes the turn, so the prompt carries
  // its figures and the only way to move them (runtime/drives.js).
  const withDrives = ensureDrivesFromOrders(bundle.world, bundle.actions, { player: bundle.game?.country || "", date: bundle.game?.gameDate || "" });
  // And the other way round: a drive opened by an order that never came to
  // anything closes itself, so the ledger lists what is running rather than
  // a column of abandoned campaigns all printing "nothing moved".
  const pruned = pruneDormantDrives(withDrives.drives, { asOf: bundle.game?.gameDate || "" });
  let nextWorld = pruned.closed.length ? { ...withDrives, drives: pruned.drives } : withDrives;
  for (const line of pruned.closed) console.warn(`[drives] ${line}`);
  // A gathering the player convokes is read from the order, exactly as a drive
  // is: telling the model to carry the lever did not make it carry the lever —
  // a turn narrated "Convocation du rassemblement de Pax Africa à Lagos,
  // budget 40 000 SY" and moved nothing at all.
  const bodyNames = normalizeWorldState(nextWorld).organizations.filter((o) => o.status !== "dissolved").map((o) => o.name);
  const seeded = ensureGatheringsFromOrders(nextWorld, bundle.actions, { date: bundle.game?.gameDate || "", bodies: bodyNames });
  nextWorld = seeded.world;
  for (const g of seeded.added) console.warn(`[gatherings] convoked from an order: ${g.name} on ${g.date}, budget ${Math.round(g.cost)} SY`);
  // Likewise money the order moves between bodies: an endowment out of the
  // parent's capital, or a body's idle cash turned into capital. Field report:
  // an edition narrated "décaissement de 30 000 SY pour doter Pax Africa" and
  // the pole's capital stayed at zero.
  const moved = ensureTreasuryMovesFromOrders(nextWorld, bundle.actions, { player: bundle.game?.country || "", date: bundle.game?.gameDate || "" });
  if (moved.rows.length) {
    nextWorld = { ...moved.world, record: appendRecord(moved.world.record, moved.rows) };
    for (const row of moved.rows) console.warn(`[treasuries] from an order: ${row.polity} ${row.what} ${Math.round(row.amount)} SY`);
  }
  for (const line of moved.refusals) console.warn(`[treasuries] ${line}`);
  // And what an order does to promises nobody has funded: capital set aside
  // against them, a trust made to carry them as far as its capital reaches, or
  // the terms themselves rewritten. Field report: a pension reform was ordered
  // four ways over two hours, editions ratified a ring-fencing calendar, and the
  // figure stood at 411,339 SY from the first turn to the last.
  const promises = ensureLiabilityMovesFromOrders(nextWorld, bundle.actions, { player: bundle.game?.country || "", date: bundle.game?.gameDate || "" });
  if (promises.rows.length) {
    nextWorld = { ...promises.world, record: appendRecord(promises.world.record, promises.rows) };
    for (const row of promises.rows) console.warn(`[liabilities] from an order: ${row.polity} ${row.what} ${Math.round(row.amount)} ${row.unit}`);
  }
  for (const line of promises.refusals) console.warn(`[liabilities] ${line}`);
  // And the budget itself: a tax rate set, a spending line moved, the deficit
  // financed another way. The player's most central economic lever had no reader
  // at all, so an order to raise the rate was narrated as a reform passed and
  // the rate never moved once in a whole pontificate.
  const budget = ensureEconomyMovesFromOrders(nextWorld, bundle.actions, { player: bundle.game?.country || "", date: bundle.game?.gameDate || "" });
  if (budget.rows.length) {
    nextWorld = { ...budget.world, record: appendRecord(budget.world.record, budget.rows) };
    for (const row of budget.rows) console.warn(`[economy] from an order: ${row.what}`);
  }
  for (const line of budget.refusals) console.warn(`[economy] ${line}`);
  if (nextWorld !== bundle.world) {
    await writeWorldState(nextWorld);
    bundle.world = nextWorld;
  }
  const baseColors = await readJson(JSON_URLS.colors, { defaultValue: {}, force: true });
  // Fractional days are allowed so sub-day skips (e.g. 6h = 0.25) work; the game
  // date only advances in whole days, so a sub-day skip keeps the same date.
  const safeDays = Math.max(0, Number(days) || 0);
  if (safeDays <= 0) {
    throw new Error("Choose a time-skip amount greater than zero.");
  }
  const dateStep = Math.max(0, Math.round(safeDays));
  const originDate = normalizeString(bundle.game.gameDate);
  const targetDate = dateStep >= 1 ? (addIsoDays(originDate, dateStep) || originDate) : originDate;
  if (dateStep >= 1 && parseIsoDate(originDate) && targetDate === originDate) {
    throw new Error("The requested jump exceeds the supported date range.");
  }
  const variables = await buildTemplateVariables(bundle, { targetDate });
  const durationLabel = formatDurationLabel(safeDays);
  let [minEvents, maxEvents] = eventCountRangeForDays(safeDays);
  // Guarantee at least one event per queued action, so each planned action has a
  // slot to resolve into (bounded so a huge queue can't demand absurd counts).
  const plannedActionCount = normalizeActions(bundle.actions).filter((action) => action.status === "planned").length;
  if (plannedActionCount > minEvents) {
    minEvents = Math.min(plannedActionCount, 37);
    maxEvents = Math.max(maxEvents, minEvents + 3);
  }
  const { generation, payload } = await runJsonTask(mode === "auto" ? "autoJumpForward" : "jumpForward", {
    fallback: () => fallbackJumpSimulation({ bundle, days: dateStep || 1, mode, targetDate }),
    signal,
    // The jump IS the game — by default generation waits as long as the model
    // needs (0 disables the deadline in runJsonTask), so the canned fallback is
    // only reachable through a real error, never a slow local/reasoning model.
    // The "Limit AI generation" toggle opts back into a 5-minute bound for
    // players who prefer a guaranteed turn over a guaranteed answer (Cancel
    // works either way).
    timeoutMs: getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 300000 : 0,
    userMessage:
      mode === "auto"
        ? "Simulate an auto-jump and stop at the next notable or player-relevant event. Return JSON only. " +
          "Scale the events array to the time actually covered before your stop point: roughly 1-2 events per week, " +
          "5-7 per month, 10-13 per quarter, up to 29-37 for a full year — spread their dates across the covered period."
        : `Simulate a standard jump forward to the requested target date. Return JSON only. The "events" array must ` +
          `contain between ${minEvents} and ${maxEvents} events (this jump covers ${durationLabel}), with their dates ` +
           `spread across the skipped period.`,
    validatePayload: async (candidate, { finalAttempt } = {}) => {
      // Shape-of-story problems (event count, stray dates) are STRICT while a
      // retry remains — the model gets the exact error and usually fixes its
      // own answer — and SALVAGED on the final attempt: a finished generation
      // must never lose to the canned fallback over its date stamps, an extra
      // event, or an invented region name. finalAttempt comes from runJsonTask
      // itself (never from counting our own invocations — a schema failure on
      // attempt 1 skips this validator entirely, which used to make attempt 2
      // look "first" and leak strict feedback out as the fallback reason).
      const strict = !finalAttempt;
      const eventCount = normalizeArray(candidate?.events).length;
      if (strict && mode !== "auto" && (eventCount < minEvents || eventCount > maxEvents)) {
        return `$.events must contain between ${minEvents} and ${maxEvents} events; received ${eventCount}.`;
      }
      const dateError = validateTimelineDates({ candidate, mode, originDate, targetDate, requireAdvance: dateStep >= 1 });
      if (dateError) {
        if (strict) return dateError;
        clampTimelineDates(candidate, { mode, originDate, targetDate });
      }
      return await validateGeneratedWorldChanges(candidate, bundle.world, { strictTransfers: strict, player: bundle.game.country, actions: bundle.actions });
    },
    variables,
  });

  const result = {
    // The era seeds the prompt reasoned with, so the jump persists them and
    // the engine evolves one state instead of reseeding every turn.
    economies: variables.economies ?? {},
    organizations: variables.organizations ?? [],
    catalyst: payload?.catalyst ?? null,
    clearActions: payload?.clearActions !== false,
    events: normalizeArray(payload?.events),
    mode,
    outreach: normalizeArray(payload?.diplomaticOutreach),
    stopDate: normalizeString(payload?.stopDate) || targetDate,
    summary: normalizeString(payload?.summary),
    generation,
  };

  const applied = await applySimulationResult({
    baseActions: bundle.actions,
    baseChats: bundle.chats,
    baseColors,
    baseEvents: bundle.events,
    baseGame: bundle.game,
    baseWorld: bundle.world,
    result,
  });
  // The first jump a power appears in is simulated on its era prior; right after,
  // the model corrects that prior once and the engine carries on from there.
  await refineEconomySeeds().catch((error) => console.warn("[ai] economy seed refinement skipped.", error));
  return applied;
  } finally {
    endSimulation();
  }
};

export const simulateAutoJump = async ({ days = 365, signal } = {}) =>
  simulateTimelineJump({ days, mode: "auto", signal });

export const applyGameMasterCommand = async (requestText) => {
  beginSimulation();
  try {
  const bundle = await readGameStateBundle({ force: true });
  const baseColors = await readJson(JSON_URLS.colors, { defaultValue: {}, force: true });
  const variables = await buildTemplateVariables(bundle, { gameMasterRequest: requestText });
  const { generation, payload } = await runJsonTask("gameMaster", {
    fallback: () => ({
      impacts: {
        polityChanges: [],
        regionTransfers: [],
      },
      summary: "No deterministic GM fallback changes were inferred from the request.",
    }),
    userMessage: "Apply the GM request as JSON only.",
    validatePayload: (candidate, { finalAttempt } = {}) =>
      validateGeneratedWorldChanges(candidate, bundle.world, { strictTransfers: !finalAttempt, player: bundle.game.country, actions: bundle.actions }),
    variables,
  });

  // The RAW payload impacts travel to applySimulationResult (which normalizes
  // every event itself), so the refusals the resolver annotated on them and any
  // unit op normalization throws away are still there to be reported.
  const gmRaw = {
    date: bundle.game.gameDate,
    description: normalizeString(payload?.summary),
    impacts: payload?.impacts,
    importance: "major",
    kind: "game-master",
    notable: true,
    playerRelated: true,
    title: "Game master intervention",
    source: generation.source,
  };
  const gmEvent = normalizeGeneratedEvent(gmRaw);

  if (!gmEvent) {
    throw new Error("The game master request did not produce a valid change set.");
  }

  return applySimulationResult({
    baseActions: bundle.actions,
    baseChats: bundle.chats,
    baseColors,
    baseEvents: bundle.events,
    baseGame: bundle.game,
    baseWorld: bundle.world,
    result: {
      economies: variables.economies ?? {},
      catalyst: null,
      clearActions: false,
      events: [gmRaw],
      mode: "game-master",
      stopDate: bundle.game.gameDate,
      summary: gmEvent.description,
      generation,
    },
  });
  } finally {
    endSimulation();
  }
};

// ---- Pre-game history -------------------------------------------------------
// Pre-game backstory dates must sit strictly before round one. Strict/salvage
// like the jump validators: attempt 1 returns corrective errors the model can
// fix, attempt 2 drops what cannot be placed instead of rejecting the turn.
// Non-Gregorian scenarios ("1200 BCE") skip date checks entirely — the model
// is told to match the scenario's own dating style and we take it at its word.
const validatePregameEvents = (candidate, { startDate, strict }) => {
  const events = normalizeArray(candidate?.events);
  if (events.length === 0) return "$.events must contain at least one pre-game event.";
  if (!parseIsoDate(startDate)) return "";
  if (strict) {
    let previous = "";
    for (let index = 0; index < events.length; index += 1) {
      const date = normalizeString(events[index]?.date);
      if (!parseIsoDate(date)) {
        return `$.events[${index}].date must be a real YYYY-MM-DD date.`;
      }
      if (date >= startDate) {
        return `$.events[${index}].date must be strictly before the game start date ${startDate} — these events are pre-game history.`;
      }
      if (previous && date < previous) {
        return `$.events[${index}].date must not be earlier than the previous event — order the backstory chronologically.`;
      }
      previous = date;
    }
    return "";
  }
  candidate.events = events
    .filter((event) => {
      const date = normalizeString(event?.date);
      return parseIsoDate(date) && date < startDate;
    })
    .sort((a, b) => normalizeString(a.date).localeCompare(normalizeString(b.date)));
  return "";
};

// A fresh game whose scenario wrote a "World Before Round One" briefing gets
// its backstory generated once, the first time the player opens it: the
// briefing (plus rules and map) becomes real timeline events dated before the
// start. Deliberately NOT applySimulationResult — the clock must stay at the
// start date, round must stay 1, and backstory events carry no impacts (the
// scenario's world already reflects them). The simulationHistory entry it
// writes doubles as the done-marker, so it can never run twice.
export const maybeGeneratePregameHistory = async () => {
  if (isSimulationBusy()) return null;
  const bundle = await readGameStateBundle({ force: true });
  const briefing = normalizeString(bundle.world.startingTimelineText);
  if (!briefing) return null;
  if (normalizeEvents(bundle.events).length > 0) return null;
  if ((normalizeWorldState(bundle.world).simulationHistory ?? []).length > 0) return null;
  const startDate = normalizeString(bundle.game.startDate || bundle.game.gameDate);
  if (!startDate) return null;

  beginSimulation();
  try {
    const variables = await buildTemplateVariables(bundle);
    const { payload } = await runJsonTask("pregameHistory", {
      timeoutMs: getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 300000 : 0,
      userMessage: "Write the pre-game historical timeline as JSON only.",
      validatePayload: (candidate, { finalAttempt } = {}) =>
        validatePregameEvents(candidate, { startDate, strict: !finalAttempt }),
      variables,
    });

    // The player may have switched games while this generated — the runtime
    // endpoints follow the ACTIVE game, so re-verify the same fresh game is
    // still there before writing anything.
    const [eventsNow, worldNow, gameNow] = await Promise.all([
      readEventsState({ force: true }),
      readWorldState({ force: true }),
      readGameData({ force: true }),
    ]);
    if (normalizeEvents(eventsNow).length > 0) return null;
    const currentWorld = normalizeWorldState(worldNow);
    if ((currentWorld.simulationHistory ?? []).length > 0) return null;
    if (normalizeString(gameNow.startDate || gameNow.gameDate) !== startDate) return null;

    const generatedEvents = normalizeArray(payload?.events)
      .map((entry, index) =>
        normalizeGeneratedEvent({ ...entry, impacts: undefined, source: "pregame" }, index))
      .filter(Boolean);
    if (generatedEvents.length === 0) return null;

    const summary = normalizeString(payload?.summary);
    currentWorld.simulationHistory = [
      {
        catalyst: null,
        date: startDate,
        eventIds: generatedEvents.map((event) => event.id),
        fallbackReason: "",
        fromDate: normalizeString(generatedEvents[0]?.date) || startDate,
        mode: "pregame",
        plannedActions: [],
        round: 1,
        summary,
        source: "ai",
        toDate: startDate,
      },
    ];
    await Promise.all([
      writeEventsState(generatedEvents),
      writeWorldState(currentWorld),
    ]);
    return generatedEvents;
  } catch {
    // Silent: backstory is a bonus. The next open retries.
    return null;
  } finally {
    endSimulation();
  }
};

// ---- Idle diplomacy drip ----------------------------------------------------
// While the player sits between jumps, the world occasionally speaks first:
// on each real-world-minute tick (the caller's cadence) there is a small chance
// one polity sends a short note to the player's inbox. Hard-suspended while any
// simulation is in flight (busy lock above), never stacked, and silent on any
// failure — there is no canned fallback small talk.
// Raised from 1/20: at 1/20 (with a 60s visible-tab-only roll) a player waited ~20
// idle minutes just to CONSULT the model, and most consulted rolls still returned
// null — so AI-initiated chats felt almost nonexistent. 1/8 keeps a parked tab from
// filling the inbox while making an idle approach actually plausible; the jump-path
// cap (see defaultPrompts.json) remains the primary source of diplomacy.
const IDLE_DIPLOMACY_CHANCE = 1 / 8;
let idleDiplomacyInFlight = false;

export const maybeSendIdleDiplomacy = async ({ chance = IDLE_DIPLOMACY_CHANCE } = {}) => {
  if (idleDiplomacyInFlight || isSimulationBusy()) return null;
  if (Math.random() >= chance) return null;
  idleDiplomacyInFlight = true;
  try {
    const bundle = await readGameStateBundle({ force: true });
    if (!normalizeString(bundle.game?.country)) return null; // no active game
    const variables = await buildTemplateVariables(bundle);
    const openChats = normalizeChats(bundle.chats);
    // The prompt template shows only ONE line per chat (chatSummary: the last
    // message, prefixed by its speaker), and a note sent to a polity the player
    // is already talking to gets APPENDED to that thread. So the model was asked
    // for an opener while its note became a reply, with almost none of the
    // conversation in view — which is how a polity ended up answering a hostile
    // message with an unrelated pleasantry, and how it ended up repeating the
    // player's own line back at them.
    // Where the player's letter is the last thing said in a thread, the note
    // that lands there is a reply, and is held to what that letter actually
    // says — the same reading a reply in the thread itself gets (main.jsx).
    const awaiting = openChats
      .filter((chat) => chat.status !== "closed" && chat.messages?.at(-1)?.role === "user")
      .slice(-4)
      .map((chat) => {
        const who = (chat.countries ?? []).map((c) => c.name).filter(Boolean).join(", ") || "unknown";
        return `To ${who}:\n${describeLetter(readLetter(chat.messages.at(-1).text), { sender: bundle.game.country })}`;
      });
    const conversationContext = [
      "",
      "These are the conversations already open with the player, oldest message first:",
      "",
      renderOpenChatsForPrompt(openChats),
      "",
      ...(awaiting.length ? ["Letters from the player still unanswered, read as they stand:", "", awaiting.join("\n\n"), ""] : []),
      "A note addressed to a polity the player is ALREADY talking to is appended to that"
      + " conversation, so it must read as the next thing that polity says: answer what was"
      + " actually said, never restate or quote it back, and never open as though the exchange"
      + " were new. If nothing there warrants a reply and no polity has a fresh reason to"
      + " write, return {\"chat\": null}.",
    ].join("\n");
    const { payload } = await runJsonTask("idleDiplomacy", {
      timeoutMs: getMapSetting(MAP_SETTING_KEYS.limitAiGeneration) ? 60000 : 0,
      userMessage:
        "A quiet moment between rounds. Decide whether any single polity would send the player a short diplomatic note right now."
        + conversationContext
        + "\n\nReturn JSON only.",
      validatePayload: async (candidate, { finalAttempt } = {}) => {
        if (candidate?.chat == null) return "";
        const countries = await resolveInvitees(candidate.chat.countries, bundle.world);
        if (countries.length === 0) {
          return "$.chat.countries must contain at least one known polity (or chat must be null).";
        }
        // Strict on attempt 1: make the model give the note a title AND a first
        // line, so the player can see why the polity reached out. Salvage on the
        // final attempt — buildGeneratedChat drops an opener-less note rather
        // than posting an empty "mystery" thread.
        return finalAttempt ? "" : validateChatOpener(candidate.chat, "$.chat");
      },
      variables,
    });
    if (!payload?.chat) return null;
    // A jump may have started while the model was thinking; its state bundle
    // predates our write, so drop the note rather than race the save.
    if (isSimulationBusy()) return null;
    const built = await buildGeneratedChat({ ...payload.chat, source: "outreach" }, "", bundle.world, {
      playerName: bundle.game.country,
    });
    if (!built) return null;
    const chats = normalizeChats(await readChatsState({ force: true }));
    // A note from a country the player already has an open 1:1 with lands in
    // that thread; anything else (including group approaches) opens a new chat.
    const single = built.countries.length === 1 ? regionKey(built.countries[0].name) : "";
    const existing = single
      ? chats.find((chat) => chat.status !== "closed"
          && Array.isArray(chat.countries)
          && chat.countries.length === 1
          && regionKey(chat.countries[0]?.name) === single)
      : null;
    let nextChats;
    if (existing) {
      const note = built.messages[0];
      if (!note) return null;
      // Even told not to, a model hands back the line it was just shown. Posting
      // it would have the polity parrot the player in their own thread, which is
      // worse than saying nothing — and silence is what this whole path defaults
      // to anyway.
      if (echoesExistingMessage(note.text, existing.messages)) return null;
      nextChats = chats.map((chat) => (chat === existing
        ? { ...chat, messages: [...chat.messages, { ...note, time: normalizeString(bundle.game?.gameDate) }] }
        : chat));
    } else {
      nextChats = [built, ...chats];
    }
    if (isSimulationBusy()) return null;
    await writeChatsState(nextChats);
    return built;
  } catch {
    return null; // silence is always the safe outcome
  } finally {
    idleDiplomacyInFlight = false;
  }
};
