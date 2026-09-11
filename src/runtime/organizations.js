/*! Open Historia — international organizations: leagues, alliances, blocs, their members and resolutions © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The Delian League, the Hansa, the Concert of Europe, the League of Nations,
// the UN, NATO, Comecon, OPEC, the EU: every era has bodies in which polities
// act together, and a player who cannot join, leave, propose or be voted
// against is missing half of diplomacy. This holds them as state — members,
// seat, voting rule, the resolutions passed — so the simulation can advance
// them, the player can act in them, and the UI can show them.
//
// Pure, like economy.js: no store reads, no React.

export const ORGANIZATION_KINDS = ["alliance", "security", "trade", "monetary", "political", "religious", "league", "other"];
export const VOTING_RULES = ["unanimity", "majority", "weighted", "hegemon"];

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const names = (list) => [...new Set((Array.isArray(list) ? list : []).map(str).filter(Boolean))];
const slug = (name) => lower(name).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "org";
// Vote weights for a "weighted" body: {member: number ≥ 0}; anything else is dropped.
const weights = (obj) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = str(k); const n = Number(v);
    if (key && Number.isFinite(n) && n >= 0) out[key] = n;
  }
  return out;
};

export const normalizeResolution = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") return null;
  const title = str(entry.title);
  if (!title) return null;
  const sanctions = entry.sanctions && typeof entry.sanctions === "object" && str(entry.sanctions.target)
    ? { target: str(entry.sanctions.target), intensity: clamp(finite(entry.sanctions.intensity, 0), 0, 1) }
    : null;
  return {
    id: str(entry.id) || `res-${index + 1}`,
    date: str(entry.date),
    title,
    text: str(entry.text),
    proposedBy: str(entry.proposedBy),
    votesFor: names(entry.votesFor),
    votesAgainst: names(entry.votesAgainst),
    abstained: names(entry.abstained),
    // A stored resolution keeps the verdict the engine gave it (see tallyResolution);
    // the raw fallback only serves resolutions that never went through a "resolve" op.
    passed: entry.passed === undefined ? names(entry.votesFor).length > names(entry.votesAgainst).length : Boolean(entry.passed),
    rule: VOTING_RULES.includes(lower(entry.rule)) ? lower(entry.rule) : "",
    reason: str(entry.reason),
    sanctions,
  };
};

export const normalizeOrganization = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") return null;
  const name = str(entry.name);
  if (!name) return null;
  const kind = ORGANIZATION_KINDS.includes(lower(entry.kind)) ? lower(entry.kind) : "other";
  return {
    id: str(entry.id) || slug(name),
    name,
    kind,
    founded: str(entry.founded ?? entry.foundedAt),
    seat: str(entry.seat ?? entry.headquarters),
    charter: str(entry.charter ?? entry.purpose ?? entry.description),
    members: names(entry.members),
    leader: str(entry.leader ?? entry.hegemon),
    votingRule: VOTING_RULES.includes(lower(entry.votingRule)) ? lower(entry.votingRule) : "majority",
    // Only a "weighted" body reads these (IMF quotas, EU qualified majority, the
    // Diet's estates); members without a weight vote at 1.
    weights: weights(entry.weights),
    status: lower(entry.status) === "dissolved" ? "dissolved" : "active",
    dissolvedAt: str(entry.dissolvedAt),
    // A universal body counts every recognised state a member (the UN, the
    // IMF, the WTO); its members list then only names those worth naming.
    universal: Boolean(entry.universal),
    resolutions: (Array.isArray(entry.resolutions) ? entry.resolutions : []).map(normalizeResolution).filter(Boolean).slice(-40),
  };
};

export const normalizeOrganizations = (list) =>
  (Array.isArray(list) ? list : []).map(normalizeOrganization).filter(Boolean);

const find = (list, ref) => {
  const key = lower(ref);
  if (!key) return -1;
  return list.findIndex((o) => lower(o.id) === key || lower(o.name) === key);
};

// ---- counting the vote -----------------------------------------------------------------
//
// The model narrates who voted how; the engine decides whether that carries.
// "Mechanical, not narrative": passed is never what the story says, it is what
// the count under the body's rule says. Pure: (organization, resolution) →
// {passed, votesFor, votesAgainst, abstained, rule, reason}.
//
// Electorate. A listed body's electorate is its members, by their canonical
// names (voters are matched case-insensitively; non-members are struck; a
// member named on both sides is counted against, since a "for" that is also a
// "no" is no "for"). A universal body (the UN, the IMF) has no full members
// list — everyone belongs — so the polities the model actually listed as
// voting or abstaining are its electorate. Members named nowhere abstained.
//
// Rules.
//   majority   for > against.
//   unanimity  nobody against, and at least one for. Abstentions do not block
//              (NATO and the EU decide by consensus, where an abstention lets a
//              decision through), but a body cannot decide by the votes of a
//              handful: at least half the electorate must have voted for.
//   hegemon    the leading power's vote decides, whatever the rest did: passed
//              iff the leader (who must be a member) is among the ayes. A body
//              under "hegemon" with no leader falls back to majority.
//   weighted   each member's vote counts its weight from org.weights (quota,
//              qualified-majority population weight, estates); a member without
//              a weight counts 1, so a body with no weights table is a majority
//              vote. passed iff weighted for > weighted against.

const uniqueCI = (list) => {
  const seen = new Set(); const out = [];
  for (const n of list) { const k = lower(n); if (k && !seen.has(k)) { seen.add(k); out.push(n); } }
  return out;
};
const fmtWeight = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export const tallyResolution = (organization, resolution) => {
  const o = normalizeOrganization(organization);
  const r = resolution && typeof resolution === "object" ? resolution : {};
  const rawFor = names(r.votesFor); const rawAgainst = names(r.votesAgainst); const rawAbstained = names(r.abstained);
  if (!o) return { passed: false, votesFor: [], votesAgainst: [], abstained: [], rule: "majority", reason: "no such body: nothing to count" };

  const memberByKey = new Map(o.members.map((m) => [lower(m), m]));
  const canonical = (n) => memberByKey.get(lower(n)) ?? n;
  const electorate = o.universal ? uniqueCI([...rawFor, ...rawAgainst, ...rawAbstained].map(canonical)) : o.members;
  const inElectorate = new Set(electorate.map(lower));
  const againstKeys = new Set(rawAgainst.map(lower).filter((k) => inElectorate.has(k)));
  const forKeys = new Set(rawFor.map(lower).filter((k) => inElectorate.has(k) && !againstKeys.has(k)));
  const votesFor = electorate.filter((m) => forKeys.has(lower(m)));
  const votesAgainst = electorate.filter((m) => againstKeys.has(lower(m)));
  const abstained = electorate.filter((m) => !forKeys.has(lower(m)) && !againstKeys.has(lower(m)));

  const size = electorate.length;
  const counts = `${votesFor.length} for, ${votesAgainst.length} against, ${abstained.length} abstained (${size} ${o.universal ? "voting" : "members"})`;
  const leader = o.leader && (o.universal || memberByKey.has(lower(o.leader))) ? canonical(o.leader) : "";
  const rule = o.votingRule;
  let passed = false; let reason = "";
  if (rule === "unanimity") {
    passed = votesAgainst.length === 0 && votesFor.length >= 1 && votesFor.length * 2 >= size;
    reason = `unanimity: ${counts}${votesAgainst.length ? `; blocked by ${votesAgainst.join(", ")}` : passed ? "" : "; too few votes for to carry"}`;
  } else if (rule === "hegemon" && leader) {
    passed = forKeys.has(lower(leader));
    const how = passed ? "voted for" : againstKeys.has(lower(leader)) ? "voted against" : "did not vote for";
    reason = `hegemon: leader ${leader} ${how}; ${counts}`;
  } else if (rule === "weighted") {
    const weightByKey = new Map(Object.entries(o.weights).map(([k, v]) => [lower(k), v]));
    const weightOf = (m) => weightByKey.get(lower(m)) ?? 1;
    const wFor = votesFor.reduce((s, m) => s + weightOf(m), 0);
    const wAgainst = votesAgainst.reduce((s, m) => s + weightOf(m), 0);
    passed = wFor > wAgainst;
    reason = `weighted: ${fmtWeight(wFor)} for vs ${fmtWeight(wAgainst)} against by weight; ${counts}`;
  } else {
    passed = votesFor.length > votesAgainst.length;
    reason = `${rule === "hegemon" ? "hegemon with no leader, so majority" : "majority"}: ${counts}`;
  }
  return { passed, votesFor, votesAgainst, abstained, rule, reason };
};

// ---- the levers ----------------------------------------------------------------------
//
//   {op:"create", organization:{name, kind, founded, seat, charter, members, leader, votingRule, weights}}
//   {op:"dissolve", organization:"<name or id>", date}
//   {op:"join"|"leave"|"expel", organization, member}
//   {op:"update", organization, changes:{name, kind, seat, charter, leader, votingRule, weights}}
//   {op:"resolve", organization, resolution:{title, text, proposedBy, votesFor, votesAgainst, abstained, date, sanctions:{target, intensity}}}
//     — "passed" in the op is ignored; the engine counts the vote (tallyResolution).
//
// Returns the new list plus the side effects the world must apply — sanctions
// voted, trade access gained or lost — so economies stay in step, and the
// refusals: ops that were valid JSON but not valid politics (a resolution in a
// dissolved body, a proposal from a non-member), each {op, organization, title, reason}.

export const applyOrganizationOps = (organizations, ops, { date = "" } = {}) => {
  let list = normalizeOrganizations(organizations);
  const effects = [];
  const refusals = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);
    if (op === "create" || op === "found") {
      const org = normalizeOrganization({ ...(raw.organization && typeof raw.organization === "object" ? raw.organization : raw), founded: raw.organization?.founded ?? raw.founded ?? date });
      if (!org) continue;
      const existing = find(list, org.name);
      if (existing >= 0) {
        // Re-founding an existing body merges its members rather than duplicating it.
        list[existing] = { ...list[existing], ...org, id: list[existing].id, members: names([...list[existing].members, ...org.members]), status: "active", dissolvedAt: "", resolutions: list[existing].resolutions };
      } else {
        list.push(org);
      }
      for (const m of org.members) if (org.kind === "trade" || org.kind === "monetary") effects.push({ type: "tradeAccess", polity: m, delta: +1, organization: org.name });
      continue;
    }
    const at = find(list, raw.organization ?? raw.id ?? raw.name);
    if (at < 0) continue;
    const org = list[at];
    if (op === "dissolve") {
      for (const m of org.members) if (org.kind === "trade" || org.kind === "monetary") effects.push({ type: "tradeAccess", polity: m, delta: -1, organization: org.name });
      list[at] = { ...org, status: "dissolved", dissolvedAt: str(raw.date) || date };
    } else if (op === "join") {
      const member = str(raw.member);
      // A dissolved body cannot take a member. Field report: this branch set
      // status:"active" on every join, so acceding to a body that had been
      // wound up quietly brought it back from the dead — the same body the
      // "resolve" op below refuses to let sit was sitting again the moment
      // anybody joined it, and nothing in the record said how. Dissolution is a
      // fact about the world; only an explicit "create" (which merges and
      // re-founds in the open) may undo it.
      if (org.status !== "active") {
        refusals.push({ op: "join", organization: org.name, title: "", reason: `${org.name} is dissolved${org.dissolvedAt ? ` (${org.dissolvedAt})` : ""} and cannot take a member; re-found it before anyone accedes to it` });
        continue;
      }
      if (member && !org.members.includes(member)) {
        list[at] = { ...org, members: [...org.members, member] };
        if (org.kind === "trade" || org.kind === "monetary") effects.push({ type: "tradeAccess", polity: member, delta: +1, organization: org.name });
      }
    } else if (op === "leave" || op === "expel") {
      const member = str(raw.member);
      if (member && org.members.includes(member)) {
        list[at] = { ...org, members: org.members.filter((m) => m !== member), leader: org.leader === member ? "" : org.leader };
        if (org.kind === "trade" || org.kind === "monetary") effects.push({ type: "tradeAccess", polity: member, delta: -1, organization: org.name });
      }
    } else if (op === "update") {
      const changes = raw.changes && typeof raw.changes === "object" ? raw.changes : raw;
      list[at] = normalizeOrganization({ ...org, ...Object.fromEntries(["name", "kind", "seat", "charter", "leader", "votingRule", "weights"].filter((k) => changes[k] !== undefined).map((k) => [k, changes[k]])), id: org.id, members: org.members, resolutions: org.resolutions });
    } else if (op === "resolve") {
      const proposed = normalizeResolution({ ...(raw.resolution && typeof raw.resolution === "object" ? raw.resolution : raw), date: raw.resolution?.date ?? raw.date ?? date }, org.resolutions.length);
      if (!proposed) continue;
      if (org.status !== "active") {
        refusals.push({ op: "resolve", organization: org.name, title: proposed.title, reason: `${org.name} is dissolved${org.dissolvedAt ? ` (${org.dissolvedAt})` : ""} and cannot pass resolutions` });
        continue;
      }
      const proposer = org.members.find((m) => lower(m) === lower(proposed.proposedBy)) ?? "";
      if (proposed.proposedBy && !org.universal && !proposer) {
        refusals.push({ op: "resolve", organization: org.name, title: proposed.title, reason: `${proposed.proposedBy} is not a member of ${org.name} and cannot propose there` });
        continue;
      }
      // The model's "passed" is not consulted: the members' votes under the body's rule decide.
      const tally = tallyResolution(org, proposed);
      const resolution = { ...proposed, proposedBy: proposer || proposed.proposedBy, votesFor: tally.votesFor, votesAgainst: tally.votesAgainst, abstained: tally.abstained, passed: tally.passed, rule: tally.rule, reason: tally.reason };
      list[at] = { ...org, resolutions: [...org.resolutions, resolution].slice(-40) };
      if (resolution.passed && resolution.sanctions) {
        effects.push({ type: "sanctions", polity: resolution.sanctions.target, intensity: resolution.sanctions.intensity, organization: org.name, resolution: resolution.title });
      }
    }
  }
  return { organizations: list, effects, refusals };
};

// Apply the side effects to the economies map (see economyBridge): a voted
// sanction sets the target's cut trade access; a trade or monetary bloc opens
// its members' economies a little, and closes them again on leaving.
export const applyOrganizationEffects = (economies, effects, { applyChange }) => {
  const next = { ...(economies && typeof economies === "object" ? economies : {}) };
  for (const effect of Array.isArray(effects) ? effects : []) {
    const target = str(effect?.polity);
    if (!target || !next[target]) continue;
    if (effect.type === "sanctions") {
      next[target] = applyChange(next[target], { set: { sanctionsFaced: clamp(finite(effect.intensity, 0), 0, 1) } });
    } else if (effect.type === "tradeAccess") {
      next[target] = applyChange(next[target], { shift: { openness: 5 * Math.sign(finite(effect.delta, 0)), marketIntegration: 2 * Math.sign(finite(effect.delta, 0)) } });
    }
  }
  return next;
};

// ---- bodies the player's own order founds, dissolves, joins or leaves --------------------
//
// Sixth time, same lesson. organizationOps has existed as long as this module
// has, and a rule asking the model to carry it did not make it carry it: eleven
// rounds of editions inaugurated « Une Seule Église », « Pax Africa » and « Pax
// Asia », validated their statutes and certified their accounts, and the world
// held none of them (runtime/bodyCheck.js says exactly that to the player's
// face, every turn, which is a diagnosis and not a cure).
//
// And its absence starved the two parsers that DO read the order. A gathering is
// only convoked in a body the world holds (gatheringFromOrder matches its host
// against the list of bodies); a purse is only opened for a body the world holds
// (applyTreasuryOps refuses one otherwise). So the single most natural order a
// player writes — found the federation, convoke its first summit, give it a
// budget — produced the body, the summit and the money all at once: none of
// them, three separate silences with one cause.
//
// So the engine reads the order for the four things that can honestly happen to
// a body: it is founded, it is dissolved, somebody joins or leaves it, or
// somebody is thrown out of it. Everything it needs must already be in the
// world — a member it does not know is refused by name rather than conjured.

// Orders are written by a French-speaking player, so both languages, always.
const FOUNDS = /\b(fond(?:e|er|ent|ons|ez|é|ée|és|ées|ation|ations)\b|fondant|cr[ée]\w*|institu(?:e|er|ons|ez|ent|é|ée|tion)\b|[ée]tabli\w*|[ée]tablir|constitu(?:e|er|ons|ez|ent|é|ée|tion)\b|[ée]rige\w*|found\w*|creat\w*|establish\w*|set up|charter\w*)/i;
const DISSOLVES = /\b(dissou\w*|dissolution|dissolv\w*|abol[iy]\w*|abolition|supprim\w*|liquid\w*|met(?:tre|s)? fin [àa]|disband\w*|wind(?:s|ing)? up|wound up|shut(?: it)? down|close down|clos\w* down)/i;
const JOINS = /\b(adh[ée]r\w*|adh[ée]sion|rejoin\w*|rejoindre|int[èe]gre\w*|int[ée]grer|acc[èe]de\w*|acc[ée]der|accession|admission|admet\w*|admettre|entre\w* (?:dans|au sein)|joins?\b|join\b|joining|accede\w*|acceding|enter\w* into)/i;
const LEAVES = /\b(quitt\w*|se retire\w*|se retirer|retrait\b|sort(?:ir|ie|ent)? de|leaves?\b|leave\b|leaving|withdraw\w*|exits?\b|exiting|d[ée]missionn\w*|renonce\w* [àa] (?:sa )?(?:place|si[èe]ge|adh[ée]sion))/i;
const EXPELS = /\b(expuls\w*|exclu(?:t|re|s|e|sion|ent)\b|excluant|renvoi\w*|chasse\w* de|radi[ée]?\w* de|expel\w*|expell\w*|eject\w*|oust\w*|throw\w* out|kick\w* out|remove\w* [A-ZÀ-Ö]?\w* ?from)/i;

// The words that make a named thing an institution rather than a ship, a treaty
// or a nickname — the same list runtime/bodyCheck.js uses to decide that a story
// is acting through a body, kept in step with it on purpose.
const INSTITUTION = /\b(holding|f[ée]d[ée]ration|federation|confederation|conf[ée]d[ée]ration|organisation|organization|conseil|council|comit[ée]|committee|commission|ligue|league|alliance|pacte|pact|fonds|fund|agence|agency|autorit[ée]|authority|bureau|institut|institute|soci[ée]t[ée]|company|consortium|syndicat|union|assembl[ée]e|assembly|p[ôo]le|pole|chapter|banque|bank|tribunal|court|acad[ée]mie|academy|observatoire|secr[ée]tariat|secretariat|communaut[ée]|community|bloc|club|congr[èe]s|congress|synode|synod|ordre|order)\b/i;

// How a body is named on the page. Every campaign that founds one sets the name
// in quotation marks, because that is how a proper name is introduced.
const QUOTED_NAME = /[«"“]\s*([^»"”\n]{2,70}?)\s*[»"”]/;
// And when it is not quoted, the name is a run of capitals around or after the
// institutional word: "la Ligue des Nations Africaines", "fonder une fédération
// Pax Mundi". Two forms, because the institutional word is part of the name when
// it is capitalised and not part of it when it is not — reading "Ligue des
// Nations" as "Nations" would found a body under half its own name.
const CAP = "[A-ZÀ-ÖØ-Þ][\\p{L}\\p{N}'’-]{1,28}";
const LINK = "(?:de|du|des|d['’]|l['’]|la|le|les|et|of|the|and|for|pour)";
const INSTITUTION_WORDS = INSTITUTION.source.replace(/^\\b\(|\)\\b$/g, "");
const NAMED_AFTER = new RegExp(`(?:${INSTITUTION_WORDS})\\s+(?:${LINK}\\s*)*(${CAP}(?:\\s+(?:${LINK}\\s+)*${CAP})*)`, "iu");
const NAMED_WITH = new RegExp(`((?:${INSTITUTION_WORDS})(?:\\s+(?:${LINK}\\s+)*${CAP})+)`, "u");

// A body's seat, when the order gives it one.
const SEAT = new RegExp(`(?:si[èe]ge(?:\\s+social)?(?:\\s+(?:est|sera|se trouve|fix[ée]|[ée]tabli))?\\s*(?:[àa]|en|dans|au|aux)\\s+|seat\\s+(?:in|at)\\s+|headquarter(?:ed|s)?\\s+(?:in|at)\\s+|bas[ée]e?\\s+[àa]\\s+|based\\s+in\\s+)(${CAP}(?:[- ]${CAP}){0,2})`, "u");

// What kind of body it is. Order matters: the more consequential reading wins,
// because "kind" is not a label — a trade or monetary bloc opens its members'
// economies and a political one does not, so a commercial league is trade first
// and a league second.
const KIND_WORDS = [
  [/\b(mon[ée]taire|monetary|currency union|banque centrale|central bank)\b/i, "monetary"],
  [/\b(commerc\w*|trade|march[ée] commun|common market|douani[èe]re|customs union|libre-?[ée]change|free trade|tarifaire|tariff)\b/i, "trade"],
  [/\b(s[ée]curit[ée]|security|d[ée]fens\w*|defen[cs]e|militaire|military)\b/i, "security"],
  [/\b(alliance|pacte|pact|coalition)\b/i, "alliance"],
  [/\b(religieu\w*|religious|[ée]glise|church|synod\w*|[oœ]cum[ée]nique|ecumenical|interreligieu\w*|interfaith|foi\b|faith)\b/i, "religious"],
  [/\b(ligue|league|hanse|hansa)\b/i, "league"],
  [/\b(politique|political|conseil|council|assembl[ée]e|assembly|f[ée]d[ée]ration|federation|conf[ée]d[ée]ration|confederation|union|communaut[ée]|community)\b/i, "political"],
];

// How it decides. Weighted is read first on purpose: "majorité qualifiée" is a
// weighted vote and contains the word for a plain majority, so testing majority
// first would quietly turn every qualified majority into one member one voice.
const RULE_WORDS = [
  [/\b(pond[ée]r\w*|quotes?[- ]parts?|quotas?|au prorata|weighted|majorit[ée] qualifi[ée]\w*|qualified majority)\b/i, "weighted"],
  [/\b(unanimit[ée]|unanime\w*|consensus|unanimity|unanimous|droit de veto|chaque membre peut bloquer|every member can block)\b/i, "unanimity"],
  [/\b(h[ée]g[ée]mon\w*|hegemon\w*|voix pr[ée]pond[ée]rante|casting vote|le fondateur d[ée]cide|d[ée]cision (?:du|de la) (?:fondateur|pr[ée]sident|souverain|pape)|founder decides|leader decides)\b/i, "hegemon"],
  [/\b(majorit[ée]|majoritaire|majority)\b/i, "majority"],
];

// A sentence ends at a full stop, not at a colon or a semicolon: "Fonder la
// fédération « Pax Mundi » ; membres fondateurs : le Nigéria et l'Angola" is ONE
// order about one body, and splitting it at the punctuation left the founding
// verb in one fragment and the members in another, so the body was founded empty.
const sentencesOf = (text) => str(text).split(/(?<=[.!?])\s+|\n+/).map(str).filter(Boolean);

// Whether a text names something, on whole-word boundaries. Field report: a
// plain `includes` matched "Niger" inside "Nigeria", so an order admitting
// Nigeria to a bloc admitted Niger as well — a state that had asked for nothing.
// `\b` is no use here because the names carry accents and apostrophes.
const LETTERISH = /[\p{L}\p{N}]/u;
export const mentionsName = (text, name) => {
  const hay = lower(text);
  const needle = lower(name);
  if (!needle || !hay) return false;
  for (let from = 0; ;) {
    const at = hay.indexOf(needle, from);
    if (at < 0) return false;
    const before = at > 0 ? hay[at - 1] : " ";
    const after = at + needle.length < hay.length ? hay[at + needle.length] : " ";
    if (!LETTERISH.test(before) && !LETTERISH.test(after)) return true;
    from = at + 1;
  }
};

// An order writes a body's name the way a person would — "la holding une seule
// église" for « Une Seule Église, Une Seule Solidarité » — so a body answers to
// its name and to the head of it before any comma or dash, when that head is
// long enough to mean only one body. Same rule as runtime/liabilities.js.
const namesBody = (text, body) => {
  if (mentionsName(text, body)) return true;
  const head = str(body).split(/\s*[,—–-]\s*/)[0];
  return head.length >= 8 && mentionsName(text, head);
};

/** The name a sentence gives a body: quoted first, then the capitalised run. */
const bodyNameIn = (sentence) => {
  const quoted = sentence.match(QUOTED_NAME);
  if (quoted && str(quoted[1]).length >= 3) return str(quoted[1]);
  const withWord = sentence.match(NAMED_WITH);
  if (withWord) return str(withWord[1]);
  const after = sentence.match(NAMED_AFTER);
  return after ? str(after[1]) : "";
};

const firstMatch = (pairs, text, fallback) => (pairs.find(([re]) => re.test(text)) ?? [null, fallback])[1];

/**
 * What an order does to the world's bodies. Nothing is invented: a member must
 * be a polity or a body the world already holds, and a body that is acted on
 * rather than founded is carried by the name the order used, so the apply step
 * can refuse it out loud when the world holds nothing of the sort.
 */
export const organizationMovesFromOrder = (order, { player = "", organizations = [], polities = [], date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  if (!text) return [];
  const held = normalizeOrganizations(organizations);
  const knownNames = [...new Set([...(Array.isArray(polities) ? polities : []).map(str), ...held.map((o) => o.name)])].filter(Boolean);
  const moves = [];

  for (const sentence of sentencesOf(text)) {
    // The body this sentence is about, when the world already holds it. The
    // longest match wins so "Pax Africa" is not read as "Africa".
    const heldHere = held.filter((o) => namesBody(sentence, o.name)).sort((a, b) => b.name.length - a.name.length);
    const target = heldHere[0] ?? null;
    // Everyone the sentence names that the world knows, minus the body itself:
    // a member is never invented, it is recognised.
    const namedKnown = knownNames
      .filter((n) => mentionsName(sentence, n))
      .filter((n) => !target || lower(n) !== lower(target.name))
      .sort((a, b) => b.length - a.length)
      .filter((n, i, all) => !all.slice(0, i).some((longer) => lower(longer).includes(lower(n))));

    const founds = FOUNDS.test(sentence);
    const acts = JOINS.test(sentence) || LEAVES.test(sentence) || EXPELS.test(sentence);
    // A founding verb beside a body the world already holds, in a sentence that
    // is really about membership — "le Nigéria rejoint la fédération « Pax
    // Africa » fondée l'an dernier" — is a past participle, not a founding.
    if (founds && !(target && acts) && (INSTITUTION.test(sentence) || QUOTED_NAME.test(sentence))) {
      const name = bodyNameIn(sentence);
      moves.push({
        kind: "found",
        name,
        orgKind: firstMatch(KIND_WORDS, sentence, "other"),
        seat: str((sentence.match(SEAT) ?? [])[1]),
        // A charter nobody wrote is worse than the player's own sentence: the
        // sentence is what they actually asked the body to be, and the model
        // reads it back next turn instead of inventing a purpose.
        charter: sentence.slice(0, 160),
        members: namedKnown.filter((n) => !name || lower(n) !== lower(name)),
        votingRule: firstMatch(RULE_WORDS, sentence, ""),
        date,
      });
      continue;
    }

    const named = target ? target.name : bodyNameIn(sentence);
    if (!named) continue;

    if (DISSOLVES.test(sentence)) { moves.push({ kind: "dissolve", name: named, date }); continue; }
    // Expulsion before departure: a member thrown out and a member walking out
    // are the same row with a different author, and "exclure" must not be read
    // as a resignation.
    if (EXPELS.test(sentence)) { moves.push({ kind: "expel", name: named, member: namedKnown[0] ?? "", date }); continue; }
    // The player's own order that names no other polity is about the player:
    // "Adhérer à l'OPEP" is the player acceding, and nobody else.
    if (JOINS.test(sentence)) { moves.push({ kind: "join", name: named, member: namedKnown[0] ?? str(player), date }); continue; }
    if (LEAVES.test(sentence)) { moves.push({ kind: "leave", name: named, member: namedKnown[0] ?? str(player), date }); continue; }
  }
  return moves;
};

/**
 * Applies those moves to the world's bodies. Returns the new world, the rows for
 * the record, the refusals the player needs to read, and the effects a member's
 * arrival or departure has on the economies — the caller applies those with
 * applyOrganizationEffects, exactly as gameState does for the model's own ops.
 */
export const applyOrganizationMoves = (world, moves, { player = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  let list = normalizeOrganizations(w.organizations);
  const rows = [];
  const refusals = [];
  const effects = [];
  const knows = (name) => {
    const key = lower(name);
    if (!key) return false;
    return Object.keys(w.economies ?? {}).some((p) => lower(p) === key) || list.some((o) => lower(o.name) === key);
  };
  const run = (op) => {
    const applied = applyOrganizationOps(list, [op], { date: str(op.date) });
    list = applied.organizations;
    effects.push(...applied.effects);
    return applied;
  };

  for (const move of Array.isArray(moves) ? moves : []) {
    if (!move || typeof move !== "object") continue;
    const date = str(move.date);
    const name = str(move.name);
    const at = find(list, name);
    const org = at >= 0 ? list[at] : null;

    if (move.kind === "found") {
      if (!name) {
        refusals.push("organizations found refused: the order founds a body but the engine could not read its name. Write the name in quotation marks — « Pax Mundi » — and it will be founded.");
        continue;
      }
      if (org) {
        refusals.push(`organizations found refused: "${org.name}" is already a body this world holds${org.status === "dissolved" ? `, dissolved ${org.dissolvedAt || "earlier"}` : ` with ${org.members.length} member${org.members.length === 1 ? "" : "s"}`}. Act through it, or found the new body under a name of its own.`);
        continue;
      }
      const members = (Array.isArray(move.members) ? move.members : []).map(str).filter(Boolean);
      const unknown = members.filter((m) => !knows(m));
      for (const m of unknown) refusals.push(`organizations found: "${m}" is not a polity or body this world knows, so it was left out of the founding members of "${name}".`);
      run({
        op: "create",
        organization: {
          name,
          kind: move.orgKind,
          founded: date,
          seat: str(move.seat),
          charter: str(move.charter),
          members: members.filter((m) => knows(m)),
          votingRule: str(move.votingRule),
        },
        date,
      });
      const founded = list[find(list, name)];
      rows.push({ date, polity: str(player) || name, kind: "standing", what: `a fondé ${name}`, amount: founded.members.length, unit: "members", source: `order:found:${founded.kind}` });
      continue;
    }

    if (!org) {
      refusals.push(`organizations ${str(move.kind) || "?"} refused: "${name}" is not a body this world holds — found it first, and then it can be joined, left or wound up.`);
      continue;
    }

    if (move.kind === "dissolve") {
      if (org.status === "dissolved") {
        refusals.push(`organizations dissolve refused: "${org.name}" was already dissolved${org.dissolvedAt ? ` on ${org.dissolvedAt}` : ""}.`);
        continue;
      }
      const had = org.members.length;
      run({ op: "dissolve", organization: org.name, date });
      rows.push({ date, polity: org.name, kind: "standing", what: "dissous", amount: -had, unit: "members", source: "order:dissolve" });
      continue;
    }

    const member = str(move.member);
    if (!member) {
      refusals.push(`organizations ${move.kind} refused on "${org.name}": the order names nobody to ${move.kind === "expel" ? "expel" : move.kind === "join" ? "admit" : "withdraw"}.`);
      continue;
    }
    if (!knows(member)) {
      refusals.push(`organizations ${move.kind} refused: "${member}" is not a polity or body this world knows, so it cannot ${move.kind === "join" ? "join" : "be removed from"} "${org.name}".`);
      continue;
    }
    // A dissolved body has no membership to change. Joining one used to revive
    // it silently (see applyOrganizationOps), which is how a body that had been
    // wound up came back with no event, no date and no vote behind it.
    if (org.status !== "active") {
      refusals.push(`organizations ${move.kind} refused: "${org.name}" was dissolved${org.dissolvedAt ? ` on ${org.dissolvedAt}` : ""}, so there is nothing to ${move.kind === "join" ? "join" : "leave"}. Re-found it before anyone sits in it again.`);
      continue;
    }
    const inside = org.members.some((m) => lower(m) === lower(member));
    if (move.kind === "join" && inside) {
      refusals.push(`organizations join refused: ${member} is already a member of "${org.name}".`);
      continue;
    }
    if (move.kind !== "join" && !inside) {
      refusals.push(`organizations ${move.kind} refused: ${member} is not a member of "${org.name}", so it cannot be ${move.kind === "expel" ? "expelled from" : "withdrawn from"} it.`);
      continue;
    }
    // The canonical spelling, so the members list does not grow two of the same
    // polity in different cases.
    const canonical = org.members.find((m) => lower(m) === lower(member))
      ?? Object.keys(w.economies ?? {}).find((p) => lower(p) === lower(member))
      ?? list.find((o) => lower(o.name) === lower(member))?.name
      ?? member;
    run({ op: move.kind, organization: org.name, member: canonical, date });
    rows.push({
      date, polity: canonical, kind: "standing",
      what: move.kind === "join" ? `joined ${org.name}` : move.kind === "expel" ? `expelled from ${org.name}` : `left ${org.name}`,
      amount: move.kind === "join" ? 1 : -1, unit: "members", source: `order:${move.kind}`,
    });
  }

  return rows.length ? { world: { ...w, organizations: list }, rows, refusals, effects } : { world, rows: [], refusals, effects };
};

/** Every queued order, read for the bodies it founds, winds up, joins or leaves. */
export const ensureOrganizationMovesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const polities = Object.keys(w.economies ?? {});
  const moves = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")
    .flatMap((order) => organizationMovesFromOrder(order, { player, organizations: w.organizations, polities, date }));
  if (!moves.length) return { world, rows: [], refusals: [], effects: [] };
  return applyOrganizationMoves(w, moves, { player });
};

export const ORGANIZATION_ORDER_RULES = [
  "• THE ENGINE READS THE PLAYER'S ORDER FOR BODIES. An order that founds a body, winds one up, joins or leaves one, or expels a member has already been carried out before you write: the body is in the list above, with the members, seat, kind and voting rule the order gave it. Do not carry organizationOps for it a second time — report what the engine did, and use the ops only for what the WORLD does on its own.",
  "• It founds nothing it cannot read: a member the world does not hold is left out by name, a body founded under a name the world already holds is refused, and a body that does not exist cannot be dissolved, joined or left. Those refusals are shown to the player, so write the turn around what actually happened rather than around what was asked for.",
  "• A dissolved body is dissolved: it cannot sit, cannot resolve, and cannot take a member. Somebody acceding to it does not revive it — only founding it again does, and that is an event with a date.",
].join("\n");

// ---- the bodies each era actually had ----------------------------------------------------
//
// So a modern game can talk to the IMF on its first day rather than after a
// jump has founded it. Membership lists name the powers a player is likely to
// meet, by the game's full country names; "universal" bodies count every
// recognised state a member. Dates are founding and dissolution years.

const P5 = ["United States", "United Kingdom", "France", "Russia", "China"];
const G7 = ["United States", "United Kingdom", "France", "Germany", "Italy", "Japan", "Canada"];
const EU_CORE = ["Germany", "France", "Italy", "Spain", "Netherlands", "Belgium", "Poland", "Sweden", "Austria", "Portugal", "Greece", "Ireland", "Denmark", "Finland", "Czechia", "Romania", "Hungary"];
const NATO_1949 = ["United States", "United Kingdom", "France", "Canada", "Italy", "Netherlands", "Belgium", "Norway", "Denmark", "Portugal", "Iceland", "Luxembourg"];

export const ORGANIZATION_CATALOGUE = [
  { name: "Delian League", kind: "league", from: -478, to: -404, seat: "Delos, then Athens", leader: "Athens", votingRule: "hegemon", charter: "Greek cities under Athenian leadership against Persia; tribute in ships or silver.", members: ["Athens"] },
  { name: "Peloponnesian League", kind: "alliance", from: -550, to: -366, seat: "Sparta", leader: "Sparta", votingRule: "hegemon", charter: "Sparta's allies, bound to follow her in war.", members: ["Sparta"] },
  { name: "Catholic Church", kind: "religious", from: 380, to: 9999, seat: "Rome", leader: "Papal States", votingRule: "hegemon", charter: "The Latin Church: excommunication, interdict, crusade, arbitration between Christian princes.", universal: false, members: [] },
  { name: "Imperial Diet of the Holy Roman Empire", kind: "political", from: 962, to: 1806, seat: "Regensburg", leader: "Holy Roman Empire", votingRule: "weighted", charter: "The estates of the Empire in assembly: imperial taxes, war, and the peace of the land.", members: ["Holy Roman Empire"] },
  { name: "Hanseatic League", kind: "trade", from: 1356, to: 1669, seat: "Lübeck", votingRule: "majority", charter: "Northern trading cities: common privileges, staple rights, and the will to blockade a king who breaks them.", members: [] },
  { name: "Concert of Europe", kind: "security", from: 1815, to: 1914, seat: "by congress", votingRule: "unanimity", charter: "The great powers keep the balance and settle disputes by congress.", members: ["United Kingdom", "France", "Russia", "Austria", "Prussia"] },
  { name: "Universal Postal Union", kind: "other", from: 1874, to: 9999, seat: "Bern", votingRule: "majority", charter: "One postal territory for the world.", universal: true, members: [] },
  { name: "League of Nations", kind: "political", from: 1920, to: 1946, seat: "Geneva", votingRule: "unanimity", charter: "Collective security, arbitration, mandates; sanctions by unanimous Council.", members: ["United Kingdom", "France", "Italy", "Japan", "Germany", "Soviet Union"] },
  { name: "Interpol", kind: "other", from: 1923, to: 9999, seat: "Lyon", votingRule: "majority", charter: "Police cooperation between member states: notices, extradition requests, no jurisdiction of its own and no political cases.", universal: true, members: [] },
  { name: "Commonwealth of Nations", kind: "political", from: 1931, to: 9999, seat: "London", leader: "United Kingdom", votingRule: "unanimity", charter: "Former British dominions and colonies, in free association.", members: ["United Kingdom", "Canada", "Australia", "India", "South Africa", "Nigeria", "Kenya"] },
  { name: "International Monetary Fund", kind: "monetary", from: 1945, to: 9999, seat: "Washington", leader: "United States", votingRule: "weighted", charter: "Balance-of-payments lending under conditionality; surveillance of exchange and fiscal policy; quotas weight the vote.", universal: true, members: [] },
  { name: "World Bank", kind: "monetary", from: 1945, to: 9999, seat: "Washington", leader: "United States", votingRule: "weighted", charter: "Development lending and project finance to member governments.", universal: true, members: [] },
  { name: "United Nations", kind: "political", from: 1945, to: 9999, seat: "New York", votingRule: "majority", charter: "The General Assembly of all recognised states; resolutions carry weight, not force.", universal: true, members: [] },
  { name: "United Nations Security Council", kind: "security", from: 1945, to: 9999, seat: "New York", votingRule: "hegemon", charter: "Binding resolutions, sanctions, peacekeeping and the use of force; any permanent member's veto blocks.", members: P5 },
  { name: "Arab League", kind: "political", from: 1945, to: 9999, seat: "Cairo", votingRule: "unanimity", charter: "Arab states in coordination on politics, economy and security.", members: ["Egypt", "Saudi Arabia", "Iraq", "Syria", "Jordan", "Lebanon", "Morocco", "Algeria"] },
  { name: "General Agreement on Tariffs and Trade", kind: "trade", from: 1947, to: 1994, seat: "Geneva", votingRule: "unanimity", charter: "Rounds of tariff reduction among contracting parties.", universal: true, members: [] },
  { name: "Organization of American States", kind: "political", from: 1948, to: 9999, seat: "Washington", leader: "United States", votingRule: "majority", charter: "The states of the Americas: democracy, security, dispute settlement.", members: ["United States", "Mexico", "Brazil", "Argentina", "Colombia", "Chile", "Peru", "Canada"] },
  { name: "NATO", kind: "alliance", from: 1949, to: 9999, seat: "Brussels", leader: "United States", votingRule: "unanimity", charter: "An attack on one is an attack on all (Article 5); decisions by consensus of the North Atlantic Council.", members: [...NATO_1949, "Germany", "Spain", "Turkey", "Greece", "Poland"] },
  { name: "Comecon", kind: "trade", from: 1949, to: 1991, seat: "Moscow", leader: "Soviet Union", votingRule: "hegemon", charter: "Economic coordination of the socialist bloc under Moscow.", members: ["Soviet Union", "Poland", "East Germany", "Czechoslovakia", "Hungary", "Romania", "Bulgaria"] },
  { name: "Warsaw Pact", kind: "alliance", from: 1955, to: 1991, seat: "Moscow", leader: "Soviet Union", votingRule: "hegemon", charter: "The socialist bloc's military alliance under Soviet command.", members: ["Soviet Union", "Poland", "East Germany", "Czechoslovakia", "Hungary", "Romania", "Bulgaria"] },
  { name: "European Economic Community", kind: "trade", from: 1957, to: 1993, seat: "Brussels", votingRule: "unanimity", charter: "A common market and customs union of Western European states.", members: ["France", "West Germany", "Italy", "Netherlands", "Belgium", "Luxembourg"] },
  { name: "OPEC", kind: "trade", from: 1960, to: 9999, seat: "Vienna", leader: "Saudi Arabia", votingRule: "unanimity", charter: "Oil exporters coordinating production quotas and price.", members: ["Saudi Arabia", "Iran", "Iraq", "Kuwait", "Venezuela", "Nigeria", "Algeria", "United Arab Emirates"] },
  { name: "Non-Aligned Movement", kind: "political", from: 1961, to: 9999, seat: "rotating", votingRule: "majority", charter: "States refusing alignment with either bloc.", members: ["India", "Egypt", "Indonesia", "Yugoslavia", "Ghana"] },
  { name: "Organisation of African Unity", kind: "political", from: 1963, to: 2002, seat: "Addis Ababa", votingRule: "majority", charter: "African states: decolonisation, sovereignty, and non-interference in borders.", members: ["Ethiopia", "Egypt", "Nigeria", "Ghana", "Algeria", "Kenya", "Tanzania", "Democratic Republic of the Congo"] },
  { name: "ASEAN", kind: "political", from: 1967, to: 9999, seat: "Jakarta", votingRule: "unanimity", charter: "Southeast Asian states: consensus, non-interference, economic integration.", members: ["Indonesia", "Malaysia", "Philippines", "Singapore", "Thailand", "Vietnam"] },
  { name: "G7", kind: "political", from: 1975, to: 9999, seat: "rotating", votingRule: "unanimity", charter: "The largest advanced economies coordinating by summit; no charter, no secretariat.", members: G7 },
  { name: "ECOWAS", kind: "trade", from: 1975, to: 9999, seat: "Abuja", leader: "Nigeria", votingRule: "majority", charter: "West African economic community; a standby force since the 1990s.", members: ["Nigeria", "Ghana", "Senegal", "Ivory Coast", "Mali", "Niger", "Burkina Faso"] },
  { name: "Mercosur", kind: "trade", from: 1991, to: 9999, seat: "Montevideo", votingRule: "unanimity", charter: "South American customs union.", members: ["Brazil", "Argentina", "Uruguay", "Paraguay"] },
  { name: "SADC", kind: "trade", from: 1992, to: 9999, seat: "Gaborone", leader: "South Africa", votingRule: "majority", charter: "Southern African development community; free trade area and a mutual defence pact.", members: ["South Africa", "Angola", "Democratic Republic of the Congo", "Tanzania", "Zambia", "Zimbabwe", "Mozambique", "Botswana", "Namibia"] },
  { name: "European Union", kind: "political", from: 1993, to: 9999, seat: "Brussels", votingRule: "weighted", charter: "Single market, customs union, common trade policy; the Commission negotiates for all; unanimity on foreign policy and enlargement, qualified majority elsewhere.", members: EU_CORE },
  { name: "World Trade Organization", kind: "trade", from: 1995, to: 9999, seat: "Geneva", votingRule: "unanimity", charter: "Trade rules, most-favoured-nation, and a dispute settlement body whose rulings authorise retaliation.", universal: true, members: [] },
  { name: "Eurozone", kind: "monetary", from: 1999, to: 9999, seat: "Frankfurt", leader: "Germany", votingRule: "weighted", charter: "The euro under the European Central Bank: one policy rate, no national printing press, fiscal rules.", members: ["Germany", "France", "Italy", "Spain", "Netherlands", "Belgium", "Austria", "Portugal", "Greece", "Ireland", "Finland"] },
  { name: "G20", kind: "political", from: 1999, to: 9999, seat: "rotating", votingRule: "unanimity", charter: "The largest economies coordinating by summit.", members: [...G7, "China", "India", "Brazil", "Russia", "South Africa", "Mexico", "Indonesia", "Turkey", "Saudi Arabia", "Argentina", "South Korea", "Australia"] },
  { name: "Shanghai Cooperation Organisation", kind: "security", from: 2001, to: 9999, seat: "Beijing", leader: "China", votingRule: "unanimity", charter: "Eurasian security and economic cooperation led by China and Russia.", members: ["China", "Russia", "Kazakhstan", "Kyrgyzstan", "Tajikistan", "Uzbekistan", "India", "Pakistan", "Iran"] },
  { name: "African Union", kind: "political", from: 2002, to: 9999, seat: "Addis Ababa", votingRule: "majority", charter: "All African states: peace and security council, sanctions on unconstitutional changes of government, continental free trade.", members: ["Ethiopia", "Egypt", "Nigeria", "South Africa", "Kenya", "Algeria", "Ghana", "Tanzania", "Democratic Republic of the Congo", "Angola", "Morocco", "Senegal"] },
  { name: "BRICS", kind: "political", from: 2009, to: 9999, seat: "rotating", votingRule: "unanimity", charter: "Large emerging economies coordinating outside the Western order; a development bank since 2015.", members: ["Brazil", "Russia", "India", "China", "South Africa"] },
];

// The bodies that existed in `year`, as fresh organizations. Existing ones
// (by name) are kept as they are — this only fills what the world lacks.
export const seedOrganizations = (existing, year) => {
  const list = normalizeOrganizations(existing);
  const have = new Set(list.map((o) => lower(o.name)));
  const y = Number(year);
  if (!Number.isFinite(y)) return list;
  const added = ORGANIZATION_CATALOGUE
    .filter((o) => y >= o.from && y <= o.to && !have.has(lower(o.name)))
    .map((o) => normalizeOrganization({ ...o, founded: o.from > 0 ? `${String(o.from).padStart(4, "0")}-01-01` : `${o.from} BC`, universal: Boolean(o.universal) }));
  return [...list, ...added];
};

// Whether a polity sits in a body: listed, or the body is universal.
export const isMember = (organization, polity) => {
  const o = normalizeOrganization(organization);
  return !!o && (o.universal || o.members.includes(str(polity)));
};

// ---- speaking as a body -----------------------------------------------------------------

// What a body's voice is, for the diplomatic chat: it is not a country, it
// speaks for its members within its mandate, and it can promise only what its
// rule lets it decide.
export const describeOrganizationForChat = (organization, { playerPolity = "" } = {}) => {
  const o = normalizeOrganization(organization);
  if (!o) return "";
  const member = isMember(o, playerPolity);
  const voice = o.kind === "monetary" ? "its managing director and staff — technocratic, conditional, precise about numbers"
    : o.kind === "trade" ? "its secretariat and the chair of its council — procedural, rules-first, mindful of every member's trade"
    : o.kind === "alliance" || o.kind === "security" ? "its secretary-general and the council of members — collective, cautious, bound by consensus and by its leading power"
    : o.kind === "religious" ? "its spiritual head and curia — doctrinal, patient, wielding recognition and censure rather than armies"
    : "its secretary-general or presidency — diplomatic, procedural, speaking for the membership as a whole";
  return `${o.name} is an international body, not a state. It speaks through ${voice}. Mandate: ${o.charter || "as its members define it"}. Seat: ${o.seat || "unspecified"}. `
    + `Members: ${o.universal ? "every recognised state" : o.members.join(", ") || "none"}${o.leader ? `; leading power ${o.leader}` : ""}. Decisions by ${o.votingRule}${o.votingRule === "hegemon" ? " (a leading or permanent member can block alone)" : ""}. `
    + `${playerPolity} is ${member ? "a member" : "NOT a member"}. It can promise only what its rule and mandate allow — a loan comes with conditions, a ruling follows procedure, sanctions need a vote of the members, admission is the members' decision — and it says so; it never commands a member state, and it refers what it cannot decide to its members or its council.`;
};

// ---- what the model and the player read ------------------------------------------------

// Does this body actually touch the player? Membership (a universal body counts
// everyone), leadership, or a resolution that names the player — as its target,
// its proposer, one of its voters, or in its own text. Anything else is a body
// the player is merely aware of, and one line about it is enough.
export const organizationTouchesPlayer = (organization, polity) => {
  const o = normalizeOrganization(organization);
  const player = str(polity);
  if (!o || !player) return false;
  if (o.universal || o.members.includes(player) || o.leader === player) return true;
  const needle = player.toLowerCase();
  return o.resolutions.some((r) =>
    r.sanctions?.target === player
    || r.proposedBy === player
    || r.votesFor.includes(player)
    || r.votesAgainst.includes(player)
    || r.abstained.includes(player)
    || r.title.toLowerCase().includes(needle)
    || r.text.toLowerCase().includes(needle));
};

// `full` decides how much of each body is rendered:
//   "all"      (default) — every body in full, exactly as before.
//   "relevant" — full only for the bodies that TOUCH the player (member, leader,
//     or a resolution/sanction naming it); every other body collapses to one
//     line, `name (kind; N members)`. On a long save the organizations block is
//     one of the largest unbounded variables in the prompt, and most of it is
//     charters and old resolutions of bodies the player has nothing to do with.
//     The bodies themselves are still all listed, so nothing disappears from the
//     model's view of what exists — only the detail it cannot act on.
export const describeOrganizations = (organizations, { playerPolity = "", full = "all" } = {}) => {
  const list = normalizeOrganizations(organizations);
  if (list.length === 0) return "";
  const player = str(playerPolity);
  const trim = full === "relevant" && player !== "";
  return list.map((o) => {
    if (trim && !organizationTouchesPlayer(o, player)) {
      return `${o.name} (${o.kind}; ${o.universal ? "universal membership" : `${o.members.length} member${o.members.length === 1 ? "" : "s"}`}${o.status === "dissolved" ? "; dissolved" : ""}).`;
    }
    const last = o.resolutions.at(-1);
    const head = `${o.name} [${o.kind}${o.status === "dissolved" ? `, dissolved ${o.dissolvedAt || ""}` : ""}]${o.founded ? ` founded ${o.founded}` : ""}${o.seat ? `, seat ${o.seat}` : ""}; ${o.votingRule}${o.leader ? `, led by ${o.leader}` : ""}.`;
    const members = `  members (${o.members.length}): ${o.members.join(", ") || "none"}${player && o.members.includes(player) ? ` — ${player} is a member` : ""}.`;
    const charter = o.charter ? `  charter: ${o.charter}` : "";
    // The reason is the engine's count ("majority: 4 for, 2 against, 1 abstained (7 members)"),
    // so the model sees how the verdict was reached, not just what it was.
    const res = last ? `  latest resolution (${last.date || "undated"}): "${last.title}" — ${last.passed ? "PASSED" : "FAILED"} (${last.reason || `${last.votesFor.length} for, ${last.votesAgainst.length} against`}) — proposed by ${last.proposedBy || "unknown"}${last.sanctions ? `; sanctions on ${last.sanctions.target} at ${Math.round(last.sanctions.intensity * 100)}%` : ""}.` : "";
    return [head, members, charter, res].filter(Boolean).join("\n");
  }).join("\n");
};

// A mechanical, non-LLM detector for the same failure the tokenized-finance
// one catches: a queued action or an already-narrated event describes a
// leadership role or a vote in a body, but the words alone are not what makes
// it real — see [International Organizations]. English and French, since the
// game narrates in whatever language the player set.
const ORGANIZATIONAL_POWER_SIGNAL_TERMS = [
  "president of the", "presidency of the", "chair of the", "chairs the", "chairman of the", "chairwoman of the",
  "secretary-general of", "leads the united nations", "leads the world trade organization", "leads the security council",
  "expel", "expulsion", "suspend from", "suspension from", "vote to remove", "veto",
  "président de l'", "président du", "présidence de l'", "présidence du", "préside l'", "préside le",
  "secrétaire général de", "expulser", "expulsion", "suspendre de", "suspension de",
];
const normalizeApostrophesOrg = (t) => t.replace(/[’‘]/g, "'");
export const describesOrganizationalPower = (text) => {
  const t = normalizeApostrophesOrg(str(text).toLowerCase());
  return t.length > 0 && ORGANIZATIONAL_POWER_SIGNAL_TERMS.some((term) => t.includes(term));
};

export const ORGANIZATIONS_RULES = `[International Organizations]
Polities act together in bodies — leagues, alliances, trade blocs, monetary unions, councils, churches — and those bodies are part of the world state, listed above when any exist. Keep them alive and consequential:
• If the list is EMPTY and this era had such bodies, found the ones that actually existed at this date on your first jump, with their real members, seat and voting rule (the Delian League; the Hanseatic League; the Holy Roman Empire's Diet; the Concert of Europe; the League of Nations 1920-46; the United Nations and its Security Council from 1945; NATO 1949; the Warsaw Pact 1955-91; Comecon; the EEC/EU; OPEC; the Arab League; the OAU/African Union; ASEAN; the Commonwealth; in a fictional world, whatever its lore has). Create them with impacts.organizationOps {"op":"create","organization":{"name":"","kind":"alliance|security|trade|monetary|political|religious|league","founded":"YYYY-MM-DD","seat":"","charter":"<one line>","members":["..."],"leader":"","votingRule":"unanimity|majority|weighted|hegemon"}}.
• Members act through them: a crisis produces a resolution ({"op":"resolve","organization":"<name>","resolution":{"title":"","text":"","proposedBy":"","votesFor":["..."],"votesAgainst":["..."],"abstained":["..."],"date":"YYYY-MM-DD","sanctions":{"target":"<polity>","intensity":0-1}}}) — vote each member in character. passed is COMPUTED by the engine from the members' votes under the body's rule — list every member's vote; a resolution you narrate as passed is only passed if the count says so; abstentions are members you leave out. Under "majority" more for than against carries; under "unanimity" one vote against blocks (abstentions do not, but at least half the members must vote for); under "hegemon" the leading power's vote alone decides; under "weighted" each vote counts the body's "weights":{"<member>":n} (1 each if none are set). Non-members' votes are struck, a dissolved body cannot resolve, and a non-member cannot propose. A passed resolution with sanctions cuts the target's trade access by the engine; lifting sanctions is a resolution with intensity 0.
• Membership moves only through ops: {"op":"join"|"leave"|"expel","organization":"","member":""}; {"op":"dissolve","organization":"","date":""}; {"op":"update","organization":"","changes":{...}}. Joining a trade or monetary bloc opens a member's economy; leaving closes it.
• LEADERSHIP AND VOTES ARE NOT PROSE. When an event's text says a polity becomes president, chair, secretary-general, or otherwise leads a body, that MUST carry {"op":"update","organization":"<exact name>","changes":{"leader":"<polity>"}} in the SAME event. When an event's text says a body voted, censured, sanctioned, suspended or came close to expelling a member, that MUST carry a {"op":"resolve",...} resolution recording exactly how each member voted; the engine decides whether it passed — a near-miss is a resolution whose votes fall short, not silence. An event that narrates a leadership role or a vote with no matching op is invalid output: the story and the organization's own record will disagree forever after, and nothing about that leadership or vote will ever be visible to future turns.
• The player's polity joins, leaves, founds or proposes ONLY when the player's own actions say so; the other members then answer in character — admission can be refused, a proposal voted down, a member expelled. Never enrol the player silently.
• At least once every few periods, some body should do something on its own — a summit, a censure, an aid programme, a new member — as part of the world living without the player.
• A body created BY a ruler to serve them is theirs: its leader is that ruler and its rule is "hegemon". A council of appointees does not outvote the office that appoints it, and an advisory assembly hands its conclusions to the sovereign rather than binding them. Reserve "majority" and "unanimity" for bodies whose members are genuinely independent of each other — an alliance of states, a trade bloc, an elected chamber.
• Do not answer a ruler's initiative by inventing another administration. New bodies are founded when the world plausibly founds one, not as a way of adding a veto: a scheme already running, an empty treasury, an administration that reaches half the territory, or a delay are what stand in the way. A ruler who is blocked at every turn by organs of their own making is a modelling error, not a hard game.`;
