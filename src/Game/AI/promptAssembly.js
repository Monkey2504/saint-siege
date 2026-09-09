/*! Open Historia — task system-prompt assembly. */
// The system prompt of every structured AI task (gameplay.js runJsonTask) is the
// game's task template — which every save carries as its own FROZEN copy — plus
// the rule blocks appended here at call time. Call-time blocks are the only way a
// rule reaches campaigns that already exist, which is why so many live here; the
// same rule must NOT also be re-sent by the template, so where a template already
// states one, the append is gated on a marker of that text (see TEMPLATE_MARKERS).
//
// Pure (no I/O, no JSX): importable by node --test and by the prompt-size
// measurement script, so the static cost of a task's prompt can be measured.
import { describesTokenizedFinancing, PROJECT_FINANCE_RULES } from "../../runtime/projectFinance.js";
import { ORGANIZATIONS_RULES } from "../../runtime/organizations.js";
import { INTENTS_RULES } from "../../runtime/intents.js";
import { FAITHFUL_RULES } from "../../runtime/churchFaithful.js";
import { CORRESPONDENCE_RULES } from "../../runtime/letterReading.js";
import { LEDGER_HONESTY_RULE } from "../../runtime/claimCheck.js";
import { TREASURY_RULES } from "../../runtime/treasuries.js";
import { LIABILITY_RULES } from "../../runtime/liabilities.js";
import { BODIES_RULE } from "../../runtime/bodyCheck.js";
import { GATHERINGS_RULES } from "../../runtime/gatherings.js";
import { WARS_RULES } from "../../runtime/wars.js";
import { MIGRATION_RULES } from "../../runtime/migration.js";
import { WORLD_REACH_RULES } from "../../runtime/worldReach.js";
import { LEADERS_RULES } from "../../runtime/succession.js";
import { REALITY_RULES } from "../../runtime/realityCheck.js";
import { AUTONOMOUS_POWERS_RULES, ECONOMY_RULES_FOR_SIMULATION } from "../../runtime/economyBridge.js";
import { renderTemplate, resolveHelperValues } from "./promptContext.js";

const normalizeString = (value) => String(value ?? "").trim();

// A call-time block that ALSO lives in the current task template would be sent
// twice to every new game, so each such block is appended only when the (possibly
// frozen, older) template does not already carry its rule. The marker is a phrase
// of the rule as the template states it — chosen so that older frozen templates,
// written before the rule existed there, do not match and still get the append.
export const TEMPLATE_MARKERS = {
  // defaultPrompts.json jumpForward/autoJumpForward "[Player Agency — critical]"
  playerAgency: "binding agreements on the player's behalf",
  // The description-length calibration under "[Event Quality]". Field report:
  // with the floor at 60 words the model settled AT the floor and every event
  // read as a bullet — a dense administrative note, not a scene. The floor is
  // what it anchors on, so the floor is what moved. The marker must be a phrase
  // the CURRENT template carries, or the block is appended on top of the
  // template that already states it and the rule is sent twice.
  descriptionLength: "[Press Register — how every description is written]",
};

export const templateStates = (template, marker) => normalizeString(template).includes(marker);

// Capability reference appended to every timeline jump (see runJsonTask below): the
// full menu of world-changing levers the tool schema exposes, so the model always ends
// its system prompt with an explicit list of what it can do and how. Injected at call
// time so it reaches existing frozen-prompt games too.
export const ACTIONS_REFERENCE = "[Actions You Can Take]\nThis is the full menu of levers you have to change the world. Everything you change rides on an event's \"impacts\" object, except the two whole-jump levers noted at the end. Reach for the RIGHT lever, and NEVER narrate a change in an event's text without also emitting the impact that makes it real — narration and world state must always agree.\n\n• regionTransfers — Move a region to a new owner: every conquest, cession, sale, liberation, annexation or hand-over, one entry per region. Shape: {\"regionId\":\"<exact id, or the plain region name if you don't know the id>\",\"regionName\":\"\",\"fromCode\":\"\",\"toCode\":\"<new owner code>\"}. The rules — narration and map must agree, regions not cities, wholeCountry takeovers — are in [Region and City Capture — Map Truth] above.\n\n• polityChanges — Create, rename, recolor, or re-describe a polity. One entry can do any combination: {\"code\":\"<polity code>\",\"name\":\"<new name, only if it changed>\",\"color\":\"#RRGGBB (only if it changed)\",\"aliases\":[\"...\"],\"reputation\":0-100,\"intelligence\":0-100,\"tags\":[\"...\"],\"stats\":{...},\"note\":\"<why>\"}. Create a polity by giving a new code with a name and color. Change name/color ONLY on a regime change (never for a mere new leader). On an ideological or alignment shift, rewrite the COMPLETE tags list (it is a full replacement, not a delta). Set reputation (0 = pariah, 100 = universally trusted) only when this turn's events actually moved a polity's standing. Set intelligence (0 = no service to speak of, 100 = the best in the world) only when something changed it: a purge or defection, a new bureau or budget, a foreign spy ring exposed, a player action that built the service up or ran it down. A country's national statistics move ONLY through \"stats\" here — send just the fields that changed; everything omitted keeps its prior value. That includes WHO LEADS: when a leader is overthrown, assassinated, dies, resigns or is voted out, put the successor's name in stats.leader (together with stats.government and stats.stability when those moved too). An event that narrates a leader falling but leaves stats.leader untouched leaves the OLD name standing on that country's stat sheet, so the story and the sheet disagree. When an event marks something genuinely worth a polity remembering about ITSELF specifically for the rest of the campaign — a war it fought, a coup, an invention, a famous leader's rise or fall — add it with stats.history: [\"<one short dated fact>\"]; entries APPEND, never send the whole list back, and this is what keeps a minor polity's own past from being silently compressed away by the global event log's consolidation.\n\n• unitOps — Move the war on the map with battalions. Four ops:\n    {\"op\":\"spawn\",\"unit\":{\"name\":\"\",\"type\":\"infantry|armor|air|naval|artillery|garrison\",\"ownerCode\":\"\",\"strength\":1-1000,\"lng\":0,\"lat\":0,\"regionId\":\"\"}}\n    {\"op\":\"move\",\"unitId\":\"<existing id>\",\"toLng\":0,\"toLat\":0,\"regionId\":\"\",\"note\":\"\"}\n    {\"op\":\"strength\",\"unitId\":\"<existing id>\",\"strength\":0-1000,\"note\":\"\"}\n    {\"op\":\"remove\",\"unitId\":\"<existing id>\",\"note\":\"\"}\n  Spawn units for mobilizations and reinforcements, move them to reflect offensives, lower their strength as they take losses, and remove them only when destroyed or disbanded. Only reference unit ids that appear in the current-units list. When a front is decisively won, pair the advance with a regionTransfers entry so the border follows the troops.\n\n• markerOps — Place, remove, rename or resize a named structure or city. Four ops:\n    {\"op\":\"build\",\"marker\":{\"name\":\"\",\"kind\":\"<lowercase, e.g. military base / port / embassy / airfield / city>\",\"ownerCode\":\"\",\"lng\":0,\"lat\":0,\"note\":\"\",\"foundedAt\":\"\"}}\n    {\"op\":\"remove\",\"name\":\"<exact existing name>\",\"note\":\"\"}\n    {\"op\":\"rename\",\"name\":\"<current name>\",\"newName\":\"<new name>\",\"note\":\"<why>\"}\n    {\"op\":\"population\",\"name\":\"<city>\",\"population\":<whole number of people>,\"note\":\"<why>\"}\n  Emit build whenever an event founds or constructs a place, remove when one is destroyed, and rename when a city or structure is renamed (rename works on existing map cities too — a city renamed after a leader or ideology, a capital re-designated, a conquered city given the conqueror's name). Structures NEVER move borders: a facility one polity builds inside another's land does not transfer the region, and ownerCode is who runs the facility, not who owns the ground. Emit population whenever an event plausibly moves how many people live somewhere - a siege, famine, epidemic, bombing or evacuation shrinking a city; an industrial boom, resettlement or refugee influx growing one - giving the new TOTAL, not the change. It works on any city on the map, whether the scenario authored it or it came with the world.\n\n• createdChats — Have another polity open a diplomatic chat with the player BECAUSE of this event (a war scare prompting mediation, a border incident prompting an ultimatum, a windfall prompting a trade delegation). Shape: {\"countries\":[\"...\"],\"title\":\"<names the purpose>\",\"speaker\":\"<the initiating polity — never the player>\",\"openingMessage\":\"<that leader's first message, in their voice>\"}. The other side always speaks first; a blank or untitled chat is invalid.\n\n• actionIds — List the ids of the player's queued actions that this event resolves, so the game can clear them from the queue.\n\n• organizationOps — Found, dissolve, join, leave, expel from, or pass a resolution in an international body (see [International Organizations]); a passed resolution with sanctions cuts the target's trade in the engine.\n\n• intentOps — Create, advance, resolve, abandon or expose a polity's or an organization's own standing multi-turn scheme (see [Standing Intents]). A grudge, an encirclement plan, a campaign to force a vote, a scheme against the player's own operations — anything meant to unfold over several periods MUST be a real intent, not just a line in this event's text; an event that narrates an ongoing plot with no intentOps has no memory and cannot be advanced next time.\n\n• canonFacts — One-line, dated, atomic facts THIS event establishes that the campaign must never contradict later (see [World Canon]): a regime change, a war's outcome, a treaty, a divergence from real history. Shape: {\"canonFacts\":[\"<one short, self-contained sentence>\"]}. Unlike everything narrated in an event's text, these are never summarized or reworded again — use them for what the campaign's continuity actually depends on, not routine narration.\n\n• polityChanges.economy — Move a polity's economy through the engine's levers (see [Economy] above): shift capacities by points, set policy, change what the money is, record an innovation. Never write a GDP or a price into an event that the computed figures do not support.\n\n• polityChanges.projectFinance — A decree, action or catalyst that describes tokenised, conditional, or revenue-linked financing for a NEW asset (a bond that pays only if the asset earns, an infrastructure token sale, anything explicitly NOT an ordinary loan) MUST be expressed here, never as ordinary borrowing. {\"op\":\"create\",\"program\":{...}} once, then {\"op\":\"propose\",\"project\":{...}} per asset (see [Tokenised Infrastructure Programmes]). A decree that only NARRATES a token programme without emitting these ops leaves the state’s books on ordinary sovereign debt — the narration and the ledger will disagree, exactly the failure this lever exists to prevent.\n\nWhole-jump levers (top level of your output, NOT inside an event):\n• diplomaticOutreach — Polities reaching out to the player on their OWN initiative this period — treaty feelers, trade proposals, non-aggression pacts, mediation offers, warnings, summit invitations — not tied to any single event. Same shape as createdChats. Open one whenever a polity plausibly would, rather than defaulting to none. Reach WIDE, not just to the handful of powers the campaign already talks to most: a smaller or more marginal polity approaching the player is exactly the kind of thing that makes the world feel inhabited, not just its usual few voices. And never open with the same formula every time (\"Monsieur le Président, ...\" or its equivalent in any language) — the opening line is that polity's own voice and its own urgency: a curt regime states its business, a panicked one leads with the crisis, a ceremonious one may indeed open formally, but only because that IS its character, not because every polity defaults to it.\n• catalyst — An interactive branching scene handed to the player when a moment genuinely demands their decision, or null when none is warranted. Shape: {\"title\":\"\",\"premise\":\"\",\"opening\":\"\",\"choices\":[\"...\", \"...\", up to 5 distinct]}.\n\nKeep the total across createdChats and diplomaticOutreach to at most 3 per jump, and only when the approach genuinely serves the sender's interests.";

// Render a task's template with its variables and append every call-time rule
// block that applies. `difficultyText` is the rendered difficulty directive
// (runtime/difficulty.js) — empty when game data could not be read.
export const composeTaskSystemPrompt = (taskKey, {
  template,
  helpers = {},
  variables = {},
  difficultyText = "",
} = {}) => {
  const helperValues = resolveHelperValues(helpers, variables);
  let systemPrompt = renderTemplate(template, {
    ...variables,
    ...helperValues,
  });

  // The chosen difficulty steers every simulation task (see runtime/difficulty.js).
  if (difficultyText) systemPrompt = `${systemPrompt}\n\n${difficultyText}`;

  // Player agency: jumps must never sign the player up for landmark decisions.
  // The current template states this rule itself (defaultPrompts.json
  // "[Player Agency — critical]"); it is appended here only for a game whose
  // frozen copy of the task prompt predates that, because a call-time directive
  // is the only way a rule reaches campaigns that already exist. Field report:
  // "the AI just makes events saying that you form a treaty with another
  // country ... it just doesn't give you a choice and makes it an event."
  if (["jumpForward", "autoJumpForward"].includes(taskKey)) {
    const playerName = normalizeString(variables.playerPolity) || "the player's polity";
    if (!templateStates(template, TEMPLATE_MARKERS.playerAgency)) {
      systemPrompt = `${systemPrompt}\n\n[Player Agency]\n${playerName} is controlled by a human player. Never commit ${playerName} to a major decision the player did not actually make: do not sign treaties, alliances, ceasefires, surrenders, trade pacts, unions, or other binding agreements on the player's behalf, do not accept or reject offers for them, and do not have ${playerName} take landmark unilateral action (declaring war, ceding territory, changing government) unless it directly executes one of the player's planned actions, chat replies, or explicit requests. When another polity seeks such an agreement or decision from the player, present it as something the player can answer: a diplomaticOutreach entry or an impacts.createdChats chat where the counterpart speaks first and makes the proposal, or an event describing the offer as OPEN and awaiting the player's response. Events remain free to narrate what other polities do among themselves and to resolve the player's own queued actions exactly as ordered.`;
    }
    // No restating: the model is shown the recent timeline as context and, left
    // unchecked, re-narrates events it already reported — each restatement gets a
    // fresh id, so the same event stacks up and shows turn after turn. A content-key
    // de-dup on the write path (dedupeGeneratedEvents) drops exact/same-date
    // restatements; this directive stops the "rolling-date" ones (the same situation
    // re-narrated under each new turn's date) that a de-dup can't catch. Appended at
    // call time so existing frozen-prompt campaigns get it too.
    systemPrompt = `${systemPrompt}\n\n[New Developments Only]\nThe events shown to you above have ALREADY happened and appear only as context. Do NOT restate, rephrase, re-report, or re-narrate them. Emit ONLY genuinely NEW developments that occur during THIS period. If an ongoing situation (a war, a crisis, an occupation) has no new development this period, do not emit an event for it.`;
    // Place renaming: appended at call time so existing frozen-prompt campaigns get it
    // too; the markerOps rename op ships via the LIVE tool schema either way.
    systemPrompt = `${systemPrompt}\n\n[Place Renaming]\nYou may rename places when the story warrants it (a city renamed after a leader or ideology, a capital re-designated, a colonial name replaced, a conquered city given the conqueror's name). Emit an impacts.markerOps entry {"op":"rename","name":"<current name>","newName":"<new name>","note":"<why>"}. This works on structures you built AND on existing map cities. Do it sparingly and only when a real event motivates it.`;
  }

  // The consolidator's summary REPLACES what it covers, so anything it leaves out
  // is gone from the campaign for good. Existing games carry frozen prompts, so
  // both the instruction and the order list have to arrive at call time.
  if (taskKey === "eventConsolidator") {
    systemPrompt = `${systemPrompt}\n\n[Durable Canon]\nThis summary REPLACES the material it covers: once consolidated, those events, conversations and player orders are never sent to the simulation again, so whatever you omit is lost permanently. Carry forward explicitly, as standing facts rather than narration:\n1. How this world has DIVERGED from real history — states that never formed, wars that never happened, rulers who never fell, borders that never moved. Name them. A later model that sees only a gap fills it from real history and invents powers this campaign does not contain.\n2. The lasting CONSEQUENCES of the player's own orders, not the orders themselves.\n3. Commitments still in force: treaties, alliances, occupations, debts, standing grievances.\nBrevity matters, but never at the cost of a divergence or a commitment that is still true.`;
    const resolvedOrders = normalizeString(variables?.actionsToConsolidate);
    if (resolvedOrders && !resolvedOrders.startsWith("No ")) {
      systemPrompt = `${systemPrompt}\n\n[Player Orders Being Consolidated]\nThese are the player's own resolved orders for the period covered by this summary. Record what they CHANGED about the world; the order text itself is being discarded.\n${resolvedOrders}`;
    }
  }

  // The ONE authoritative statement of the regionTransfers rules for a jump
  // (the template's output-format paragraph and ACTIONS_REFERENCE only point
  // here). Two recurring field reports, opposite in direction:
  //  - Map truth: invasions narrated turn after turn with zero regionTransfers,
  //    so the map never moves — partly an over-cautious reading of the agency
  //    rule ("don't act for the player") as "don't move the map".
  //  - Territory is owned by REGIONS, but the model kept naming CITIES in
  //    regionTransfers (e.g. "Toulouse"), which match no region and are silently
  //    dropped. Force region names, and teach the take-the-whole-region
  //    (default) vs capture-only-the-city (markerOps) distinction.
  // Appended at call time so existing frozen-prompt campaigns get it too.
  if (["jumpForward", "autoJumpForward"].includes(taskKey)) {
    const playerName = normalizeString(variables.playerPolity) || "the player's polity";
    systemPrompt = `${systemPrompt}\n\n[Region and City Capture — Map Truth]\nTerritorial narration and the map must never disagree. If an event's title or description says territory was captured, seized, occupied, annexed, ceded, liberated, retaken, or otherwise changed hands, that SAME event MUST carry impacts.regionTransfers entries covering every region it names or implies — a capture claim with no regionTransfers is invalid output that breaks the map. Emit one entry per affected region; when you do not know a region's exact id, put its plain name in regionId and the engine will resolve it. Resolving ${playerName}'s own ordered military operations into their territorial outcomes is REQUIRED and is never a player-agency violation: the agency rule restricts unprompted decisions, not the map consequences of offensives the player actually ordered. In an active war, sustained successful offensives normally transfer regions every jump. If nothing genuinely changed hands this period, keep capture language out of the event text.\nOn this map, territory is owned by REGIONS, and impacts.regionTransfers MUST name a region exactly as it appears in the [Game Map Description] above — never a city, town, port, or landmark. Cities such as Toulouse or Narbonne are only markers that sit INSIDE a region; a regionTransfer whose regionId is a city name matches no region and is silently discarded, so the border never moves even though the event says it did. To capture a place and the ground around it, transfer the REGION that contains it, and set fromCode to that region\u2019s current owner.\nTaking a region takes everything inside it, cities included — that is the normal case, so a city changing hands usually means transferring its whole region. To capture ONLY a city while its region stays with its current owner (a besieged holdout, an occupied port, an enclave), do NOT name it in regionTransfers; instead emit an impacts.markerOps build for it — {\"op\":\"build\",\"marker\":{\"name\":\"<city>\",\"kind\":\"city\",\"ownerCode\":\"<new holder>\",\"lng\":<lng>,\"lat\":<lat>}} — using that city\u2019s coordinates from [City Coordinates]. That places the city under the new owner without moving the region border.\nWhen a polity is conquered, annexed, partitioned, or unified OUTRIGHT — every region it still holds changing hands at once — you do not need one entry per region. Emit a SINGLE regionTransfer with "wholeCountry": true, put the losing polity's name in regionId instead of a region name, and set toCode to whoever takes it; the engine expands that into every region that polity currently owns. Use this ONLY for a total takeover of everything it holds. Any partial gain — a province, a border strip, a few regions — stays as ordinary per-region transfers, which remain the normal case.`;
  }

  // Polities are identified by their full country name EVERYWHERE. A model that
  // answers "ESP" gets canonicalised on ingest, but it also then reasons about "ESP"
  // and "Spain" as if they were two powers, so state the rule rather than only
  // repairing the output.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n[Polity Names]\nEvery polity is identified ONLY by its full country name, exactly as written in the map description — "Spain", "United States", "Soviet Union". NEVER use a country code or abbreviation such as "ESP", "USA" or "SOV", anywhere, in any field. This applies to every owner field despite their names: toCode, fromCode, ownerCode and a polity's code all take the FULL NAME. A code is not a shorter way of writing a country here; it is a different, non-existent polity, and using one creates a phantom country on the map beside the real one.`;
  }

  // Units kept landing at 0,0 (null island) because the model copied the lng:0,lat:0
  // placeholder from the output template; guide it to real coordinates.
  if (["jumpForward", "autoJumpForward"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n[Unit Coordinates]\nWhenever an event says a force is raised, mobilised, garrisoned, landed, reinforced, redeployed or moved, that event MUST carry the matching impacts.unitOps — a spawn for a force that now exists, a move for one that relocated. An event that describes troops without unitOps produces a story about an army the map never shows.\nWrite every coordinate as a plain decimal number, using a POINT for the decimal mark and no other characters: lng 37.06, not "37,06", not "37.06°E". Every unitOps spawn and move MUST use the real-world longitude and latitude of where the unit actually is or is going. The lng 0 / lat 0 shown in the output template is ONLY a placeholder \u2014 0,0 is open ocean off West Africa, never a valid position, and a unit placed there is discarded. Set lng and lat to the actual coordinates: use the values from [City Coordinates] for a unit at or near one of those cities, or the real coordinates of the region or front where the action happens.`;
  }

  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    const reputationContext = normalizeString(variables.playerPolityReputationContext);
    if (reputationContext) {
      systemPrompt = `${systemPrompt}\n\n[International Reputation]\n${reputationContext}\nLow international reputation should reduce trade, trust, and coalition support, and should make nearby rivals more likely to sanction, isolate, or form balancing alliances. High reputation should improve access, trust, and coalition-building. When events this turn change how the world regards a polity, record the new value by including a "reputation" field (an integer 0-100) on that polity's impacts.polityChanges entry: aggression, broken treaties, and atrocities lower it; cooperation, aid, and honored commitments raise it. Only include reputation when it actually changes.`;
    }
  }

  // The economy: computed figures the model narrates, and the levers it may
  // move. Appended at call time so it reaches every existing game.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor", "countryStatSheet"].includes(taskKey)) {
    const brief = normalizeString(variables.economyBrief);
    if (brief) systemPrompt = `${systemPrompt}\n\n${ECONOMY_RULES_FOR_SIMULATION}\n\n[Computed Economies as of ${variables.date || "now"}]\n${brief}`;
  }
  if (taskKey === "countryStatSheet" && normalizeString(variables.economyBrief)) {
    systemPrompt = `${systemPrompt}\n\n[Definitions]\nUse these definitions exactly, so the same country gives the same figures every time: unemployment is the ILO rate (job-seekers as a share of the labour force, as national statistics or the ILO report it for this date - NOT the share in informal work); GDP per head is in international (PPP) US dollars of today; public debt is gross general-government debt; the GDP breakdown is agriculture / industry / services shares of value added. Also fill gdpPerCapitaUsd: GDP per head in international (PPP) US dollars of today, as a plain number (a subsistence economy ~600, Rome ~900, Holland in 1700 ~2500, a rich country today ~45000). It is used once to convert the engine's figures into currency; the engine's growth, inflation, debt and balance figures above are authoritative and will overwrite yours.`;
  }
  // Field report: a country with a thin or empty target dossier got the
  // PLAYER's own capital, leader and currency copied onto it — the only vivid
  // detail in context was "player polity", so a small local model defaulted
  // to it. The target is almost never the player; say so explicitly.
  if (taskKey === "countryStatSheet") {
    const player = normalizeString(variables.playerPolity);
    systemPrompt = `${systemPrompt}\n\n[Not The Player]\nThe polity in "Compile the national stat sheet for ..." is the TARGET of this sheet. Unless that name IS ${player || "the player's own polity"}, this is a DIFFERENT country: it must never receive ${player || "the player"}'s capital, leader, government type, or currency. A thin or empty target dossier means invent a plausible, ERA-APPROPRIATE capital, leader and currency for THAT country from your own knowledge of it — never copy them from ${player || "the player's polity"} just because it is the most detailed thing you were shown.`;
  }
  // The bodies polities act through, and the rules for moving them.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    const orgs = normalizeString(variables.organizationsSummary);
    systemPrompt = `${systemPrompt}\n\n[Existing International Organizations]\n${orgs || "None recorded yet."}\n\n${ORGANIZATIONS_RULES}`;
    // A body that holds its own money and pays its members. Stated even when
    // empty, so the lever is known before the first federation exists.
    const purses = normalizeString(variables.treasuriesSummary);
    systemPrompt = `${systemPrompt}\n\n${purses || `[Bodies With a Purse — engine state]\nNo body holds money of its own yet.\n\n${TREASURY_RULES}`}`;
    // A body named in a story must be a body the world holds, or it is scenery
    // the engine refuses in front of the player (runtime/bodyCheck.js).
    systemPrompt = `${systemPrompt}\n\n${BODIES_RULE}`;
    // What is promised and unfunded, and the only three things that can honestly
    // be done to it. Stated even when nothing is owed, so an edition never again
    // ratifies a ring-fencing calendar that moves nothing
    // (runtime/liabilities.js).
    // The people who actually decide, and what each of them makes of the year.
    const room = normalizeString(variables.assemblySummary);
    if (room) systemPrompt = `${systemPrompt}\n\n${room}`;
    const promises = normalizeString(variables.liabilitiesSummary);
    systemPrompt = `${systemPrompt}\n\n${promises || `[Unfunded Promises — engine state]\nNothing is owed that nobody has funded.\n\n${LIABILITY_RULES}`}`;
  }
  // Standing multi-turn schemes — a polity's or organization's own plan,
  // tracked as real state instead of a tag re-typed from memory each turn.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    const intents = normalizeString(variables.intentsSummary);
    systemPrompt = `${systemPrompt}\n\n[Standing Intents — Current]\n${intents || "None recorded yet."}\n\n${INTENTS_RULES}`;
  }
  // The world's canon: atomic, dated facts that are NEVER re-summarized,
  // unlike the prose "story so far" (which — measured against a real
  // campaign — is lossy by nature: recursive summarization loses real
  // detail every pass, a documented failure mode, not a hypothetical one).
  // Kept in full always: even a few hundred one-line facts costs far less
  // than the same information trapped in prose ever would.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    const facts = normalizeString(variables.canonFactsText);
    systemPrompt = `${systemPrompt}\n\n[World Canon — Established Facts]\n${facts || "None recorded yet."}\n\nThese facts are settled and permanent — never contradict, retcon, or drift from any of them, however long ago they were established. When THIS event establishes a new fact of the same kind (a regime change, a war's outcome, a treaty, a divergence from real history) that future turns must never contradict, record it with impacts.canonFacts: ["<one short, dated, self-contained sentence>"]. These are never reworded or removed later, so state each one precisely enough to stand alone. Routine narration does not belong here — only what the campaign's own continuity depends on.`;
  }
  // Field evidence: every standing intent recorded so far belongs to the
  // PLAYER's own polity — the mechanism exists for the world scheming
  // without the player, and it has only ever been used to remember the
  // player's own plans instead. State-derived (read straight from world
  // state, not a keyword), so it fires every relevant turn.
  if (["jumpForward", "autoJumpForward"].includes(taskKey) && variables.intentsAllPlayerOwned) {
    systemPrompt = `${systemPrompt}\n\n[Standing Intents — Missing Other Powers]\nEvery standing intent that exists right now belongs to the player's own polity. That is backwards: this mechanism exists so OTHER powers and organizations can scheme independently, not so the player's own plans get a memory. In THIS jump, give at least one OTHER polity or organization — one with a real reason to, given its tags, economy, and recent history — a standing intent of its own via impacts.intentOps {"op":"create",...}. A power whose interests the player has displaced, undercut, or threatened is the natural candidate: it does not simply accept that quietly.`;
  }
  // Tokenised-infrastructure programmes: the lever and the rules the engine enforces.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n${PROJECT_FINANCE_RULES}`;
  }
  // Every planned order tested against the world's real numbers (budget,
  // reach, legitimacy, credibility, the bodies that must vote and who inside
  // them schemes against the player, time, forces) — the verdict caps what
  // may be narrated, and the model must name the friction. State-derived:
  // empty when nothing is queued. Also for the advisor (main.jsx).
  if (["jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey) && normalizeString(variables.realityCheckText)) {
    systemPrompt = `${systemPrompt}\n\n[Reality Check — Planned Orders]\n${normalizeString(variables.realityCheckText)}\n\n${REALITY_RULES}`;
  }
  // Who is actually at war, and who is due to die, be elected, or be elected
  // pope. Both are engine state (runtime/wars.js, runtime/succession.js): the
  // model narrates from them and moves them only through warOps / leaderOps —
  // it may not write a battle, a casualty or a succession by hand.
  if (["jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n[Wars — Current]\n${normalizeString(variables.warsSummary) || "No war is being fought anywhere in this world right now."}\n\n${WARS_RULES}`;
    const leaders = normalizeString(variables.leadersSummary);
    if (leaders) systemPrompt = `${systemPrompt}\n\n[Leaders — Current]\n${leaders}\n\n${LEADERS_RULES}`;
  }
  // Who moved, and why. Computed every jump from the wage gap, war, collapse
  // and each border's policy (runtime/migration.js): the model narrates the
  // corridors the engine produced, and moves people itself only through
  // migrationOps. Stated even when empty, so its absence is not read as an
  // oversight the model should fill in.
  if (["jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    const migration = normalizeString(variables.migrationSummary);
    systemPrompt = `${systemPrompt}\n\n[Migration]\n${migration || "No computed corridor has moved anyone yet — wages, war and border policy will produce them from this jump on."}\n\n${MIGRATION_RULES}`;
  }
  // Reforming-pope mode only (state-derived: the ledger exists or it does
  // not): the live count of the faithful, then the lever that moves it.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor", "countryStatSheet", "pregameHistory"].includes(taskKey) && normalizeString(variables.churchSummary)) {
    systemPrompt = `${systemPrompt}\n\n[Église — fidèles, état du moteur]\n${normalizeString(variables.churchSummary)}\n\n${FAITHFUL_RULES}`;
    // What the last jump was actually about, as a measured count (runtime/
    // editionBalance.js): the rule on the six fronts is a wish until the model is
    // told, in figures, how far its last edition strayed from it.
    if (normalizeString(variables.editionBalanceText)) systemPrompt = `${systemPrompt}

${normalizeString(variables.editionBalanceText)}`;
    // The answers the pope's declaration is owed, until an edition has given them.
    if (normalizeString(variables.declarationReactionsText)) systemPrompt = `${systemPrompt}

${normalizeString(variables.declarationReactionsText)}`;
  }
  // What each power can actually bring to bear, and the rule that the check is
  // the same for everyone (runtime/worldReach.js). Without this the player was
  // held to budget, reach, legitimacy, votes and forces while the world's own
  // moves were held to nothing — so a schismatic national church could command
  // the European banking system, and every turn read as the whole world acting
  // against the player at once.
  if (["jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey)) {
    const reach = normalizeString(variables.actorReachSummary);
    systemPrompt = `${systemPrompt}\n\n${reach ? `${reach}\n\n` : ""}${WORLD_REACH_RULES}`;
  }
  // The world lives without the player: every power pursues its own intent.
  if (["jumpForward", "autoJumpForward"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n${AUTONOMOUS_POWERS_RULES}`;
  }
  // Suggested orders must sometimes force a real choice: philosophies in
  // conflict, not variants of one line. State-independent, so it holds for
  // every polity and every era; the schema validation enforces the shape.
  if (taskKey === "actions") {
    systemPrompt = `${systemPrompt}\n\n[Suggestions — philosophies in conflict]\nAt least one topic, and ideally half of them, must set genuinely different philosophies of government against each other rather than offer variants of one line: for such a topic, write its \`dilemma\` (one sentence: what the options disagree on and what choosing one costs) and give EACH option a distinct \`stance\` of two or three words naming the school it embodies — tradition against reform, austerity against expansion, concession against confrontation, centralisation against devolution, the schools that actually exist in this polity's world. The options under a dilemma are mutually exclusive or in real tension: taking one forecloses or weakens another, so the choice costs something. Every option must be defensible by a real school of thought; never strawman one to sell another, never rank them, never hint at the right answer. A topic whose options are merely complementary leaves \`dilemma\` empty and may omit stances.`;
  }
  // The record: every stock the engine actually moved, turn by turn, with the
  // rule that narration writes nothing here (runtime/record.js). The frame is
  // general — any lever that moves any stock leaves a row — so a turn is
  // written against a non-narrative floor rather than against its own memory.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey) && normalizeString(variables.recordSummary)) {
    systemPrompt = `${systemPrompt}\n\n${normalizeString(variables.recordSummary)}\n\n${LEDGER_HONESTY_RULE}`;
  }
  // Money raised is a figure the engine holds (runtime/drives.js): every task
  // that narrates or plans a drive sees the target, the pledges, the
  // collections and the rule that words move nothing. State-derived: empty
  // when no drive exists.
  if (["actions", "jumpForward", "autoJumpForward", "catalystCreation", "catalystExecutor"].includes(taskKey) && normalizeString(variables.drivesSummary)) {
    systemPrompt = `${systemPrompt}\n\n${normalizeString(variables.drivesSummary)}`;
  }
  // Every path that writes a letter to the player — a chat a jump opens, a note
  // between rounds — is held to the same correspondence rules as a reply in a
  // thread (runtime/letterReading.js, also applied by main.jsx at reply time).
  if (["jumpForward", "autoJumpForward", "idleDiplomacy", "catalystExecutor"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n${CORRESPONDENCE_RULES}`;
  }

  // Appended only for a game whose frozen copy of the task prompt predates the
  // length recalibration under "[Event Quality]" (the current template states
  // it). Field report: with the earlier, un-versioned patches that used to
  // lengthen this gone, events reverted to the base engine's own terse
  // 25-40-word default and read as bullet points rather than prose.
  if (["jumpForward", "autoJumpForward", "pregameHistory"].includes(taskKey) && !templateStates(template, TEMPLATE_MARKERS.descriptionLength)) {
    systemPrompt = `${systemPrompt}

[Press Register — how every description is written]
This supersedes any earlier instruction asking for a scene or for atmosphere. Write as a newspaper, never as a novel. The first sentence states what happened, to whom, and where — the fact, not the weather. Then, in this order as they apply: who said what (quote them, briefly), the figures (money, votes, numbers of people), what it cost, and what it changes for the player. No atmosphere, no scene-setting, no "the corridors were abuzz", no adjectives that carry no information, no sentence that could be deleted without losing a fact. Plain, specific, sourced in the world state. Length follows what happened: about 130-180 words for a notable but ordinary event, 220-320 for a genuinely significant turn, more for a truly rare and momentous one. No description may be under 110 words — but every one of those words must report something. Write fewer events rather than shorter or emptier ones.`;
  }

  // The actions menu goes last so the system prompt for every jump ends with the full
  // list of levers the model can pull (reaches existing games too — see ACTIONS_REFERENCE).
  if (["jumpForward", "autoJumpForward"].includes(taskKey)) {
    systemPrompt = `${systemPrompt}\n\n${ACTIONS_REFERENCE}`;
  }

  // Mechanical escalation, placed last (closest to output): if what the
  // player queued (or a direct GM request) actually reads as tokenised or
  // conditional financing, say so explicitly and forbid the fallback the
  // field evidence showed the model reaching for instead (an event narrating
  // exactly this kind of financing, resolved with an ordinary markerOps:build
  // and no programme at all).
  if (["jumpForward", "autoJumpForward", "gameMaster"].includes(taskKey)) {
    const candidateText = [variables.plannedActions, variables.actionInput, variables.gameMasterRequest].filter(Boolean).join("\n");
    if (describesTokenizedFinancing(candidateText)) {
      systemPrompt = `${systemPrompt}\n\n[Project Finance — Action Detected]\nA queued action or request this period describes tokenised, conditional, or revenue-linked financing. Do NOT resolve it with only markerOps or narration — that leaves no programme, no token price, and no fiscal verdict behind it, only a building on the map. In THIS output, emit polityChanges.projectFinance ops for it: create the programme first if [Computed Economies] above lists none yet for this polity, then propose the project, inferring its cost, expectedYield, buildYears and sector from the action’s own text. A markerOps build for the finished structure is fine IN ADDITION once construction later completes — never as a substitute for the projectFinance ops themselves.`;
    }
  }

  // Field evidence, escalated: once a programme already exists for this
  // polity, "create" had already fired once and the model still narrated
  // eight further named assets over the following turns without ever
  // proposing a single one — treating the initial create as having settled
  // the matter. This check does not depend on keywords at all: presence of
  // "Programme "" in the computed brief IS the polity actually having one,
  // read straight from world state, so it fires every relevant turn, not
  // only the turn a trigger phrase happens to appear in.
  if (["jumpForward", "autoJumpForward"].includes(taskKey) && /Programme "/.test(normalizeString(variables.economyBrief))) {
    systemPrompt = `${systemPrompt}\n\n[Project Finance — Programme Already Active]\nThis polity already runs a tokenised-infrastructure programme (see [Computed Economies] above). From here on, "create" is never needed again — but EVERY newly named asset the narration commits capital to, under any label (a "palier"/tier, a tranche, an RWA, an actif réel, a mégaprojet, or simply a named project), MUST get its own {"op":"propose","project":{...}} in the SAME event that first names it. A named asset that appears in the story with no matching propose op is invalid output: the programme's project list must never silently fall behind what is narrated, however many turns have already gone by without one.`;
  }

  return systemPrompt;
};
