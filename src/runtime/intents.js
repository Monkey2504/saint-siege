/*! Open Historia — standing intents: what a nation or a body is quietly working toward, across turns © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The world used to "remember" a power's ongoing scheme as a loose "intent:"
// string inside its tag list — a list the model rewrites wholesale every
// turn, so nothing actually guaranteed the intent survived, advanced, or was
// ever read back. This gives every polity AND every organization a real,
// schema-validated, multi-turn record instead: a scheme has an id, a target,
// a stage that moves, and a status, exactly like a resolution or a project —
// not a hope that a small local model re-types the same sentence twice.
//
// Pure, like organizations.js and projectFinance.js: no store reads, no React.

export const INTENT_OWNER_TYPES = ["polity", "organization"];
export const INTENT_KINDS = ["economic", "diplomatic", "military", "espionage", "political", "other"];
export const INTENT_STATUSES = ["active", "resolved", "abandoned"];
// What a scheme means for its target. Opposition has to be SPECIFIC or the
// world reads as a conspiracy: a power that fights the player's every move,
// whatever it is, is not a counter-power, it is a wall. "hostile" works
// against the target, "neutral" pursues its own line beside it, "supportive"
// works for it.
export const INTENT_STANCES = ["hostile", "neutral", "supportive"];
export const SABOTAGE_KINDS = ["infrastructure", "legitimacy", "credit"];

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const slug = (s) => lower(s).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "intent";

export const normalizeIntent = (entry, index = 0) => {
  if (!entry || typeof entry !== "object") return null;
  const owner = str(entry.owner);
  const summary = str(entry.summary);
  if (!owner || !summary) return null;
  const ownerType = INTENT_OWNER_TYPES.includes(lower(entry.ownerType)) ? lower(entry.ownerType) : "polity";
  const kind = INTENT_KINDS.includes(lower(entry.kind)) ? lower(entry.kind) : "other";
  const status = INTENT_STATUSES.includes(lower(entry.status)) ? lower(entry.status) : "active";
  return {
    id: str(entry.id) || `${slug(owner)}-${slug(entry.kind ?? "intent")}-${index + 1}`,
    ownerType,
    owner,
    target: str(entry.target),
    kind,
    summary,
    stage: Math.round(clamp(finite(entry.stage, 0), 0, 100)),
    secret: entry.secret === undefined ? true : Boolean(entry.secret),
    // Hostility is declared, never assumed. Defaulting to "hostile" made every
    // scheme the model created without a stance a plot against its target —
    // which, in a game where most intents target the player, read as a world
    // that conspires in permanence. A scheme with no stated stance pursues
    // its own line beside its target.
    stance: INTENT_STANCES.includes(lower(entry.stance)) ? lower(entry.stance) : "neutral",
    // Lower-cased keywords naming what the scheme is ABOUT ("liturgy",
    // "audit", "curia"). An order that mentions none of them is not this
    // scheme's business — see realityCheck.assessAction. Empty = everything
    // the target does, which is what a total enemy actually is.
    // La borne était à 16, et elle coupait des lexiques écrits à la main : le
    // chantier financier du préréglage en déclarait 19, et « deficit »,
    // « investisse » et « invest » tombaient par-dessus bord sans que rien ne le
    // dise. Une borne reste nécessaire — une portée vient aussi du texte d'un
    // joueur ou d'un modèle — mais elle doit être plus large que ce qu'un auteur
    // écrit, pas plus étroite. `classify` garde la sienne à 16 : celle-là est
    // dérivée d'une table de sujets, pas rédigée.
    scope: (Array.isArray(entry.scope) ? entry.scope : []).map((k) => lower(k)).filter(Boolean).slice(0, 64),
    triggerHint: str(entry.triggerHint),
    status,
    outcome: str(entry.outcome),
    createdAt: str(entry.createdAt),
    updatedAt: str(entry.updatedAt) || str(entry.createdAt),
    log: (Array.isArray(entry.log) ? entry.log : []).map(str).filter(Boolean).slice(-10),
  };
};

export const normalizeIntents = (list) => (Array.isArray(list) ? list : []).map(normalizeIntent).filter(Boolean);

// Match by id first (the stable handle a well-behaved model reuses); failing
// that, the first ACTIVE intent for the same owner (+ kind, when given) — a
// small local model rarely recalls an exact id across many turns, and this
// keeps the fallback from grabbing an unrelated, already-resolved scheme.
const find = (list, ref) => {
  if (ref && typeof ref === "object") {
    const owner = lower(ref.owner);
    const kind = ref.kind ? lower(ref.kind) : null;
    return list.findIndex((it) => it.status === "active" && lower(it.owner) === owner && (!kind || it.kind === kind));
  }
  const key = lower(ref);
  if (!key) return -1;
  const byId = list.findIndex((it) => lower(it.id) === key);
  if (byId >= 0) return byId;
  return list.findIndex((it) => it.status === "active" && lower(it.owner) === key);
};

// ---- the levers ------------------------------------------------------------------------
//
//   {op:"create", intent:{ownerType, owner, target, kind, summary, secret, triggerHint}}
//   {op:"advance", intent:"<id>"|{owner,kind}, stage:0-100 (absolute) OR stageDelta, note}
//   {op:"resolve", intent:"<id>"|{owner,kind}, outcome, success}
//   {op:"abandon", intent:"<id>"|{owner,kind}, reason}
//   {op:"expose", intent:"<id>"|{owner,kind}}   // the target or the player learns of it
//
// A create for an owner+kind pair that already has an ACTIVE intent updates
// it in place instead of stacking duplicates — the same "re-founding merges"
// rule organizations.js uses for create.

// A hostile scheme against a target moves on its own at most once in this
// many days. It may move any time the target's OWN orders touch it (an event
// resolving a player order is "provoked"); left alone, a plot is a slow thing,
// not a drumbeat every edition.
export const HOSTILE_ADVANCE_COOLDOWN_DAYS = 45;

const daysBetween = (a, b) => {
  const da = Date.parse(str(a)); const db = Date.parse(str(b));
  if (!Number.isFinite(da) || !Number.isFinite(db)) return Infinity;
  return Math.abs(db - da) / 86_400_000;
};

export const applyIntentOps = (intents, ops, { date = "", provoked = false } = {}) => {
  let list = normalizeIntents(intents);
  const effects = [];
  const refusals = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);
    if (op === "create") {
      const src = raw.intent && typeof raw.intent === "object" ? raw.intent : raw;
      const draft = normalizeIntent({ ...src, createdAt: src.createdAt ?? date, updatedAt: date }, list.length);
      if (!draft) continue;
      const existing = find(list, { owner: draft.owner, kind: draft.kind });
      if (existing >= 0) list[existing] = { ...list[existing], ...draft, id: list[existing].id, log: list[existing].log };
      else list.push(draft);
      continue;
    }
    const at = find(list, raw.intent ?? raw.id ?? { owner: raw.owner, kind: raw.kind });
    if (at < 0) continue;
    const it = list[at];
    if (op === "advance") {
      const stage = raw.stage !== undefined ? clamp(finite(raw.stage, it.stage), 0, 100) : clamp(it.stage + finite(raw.stageDelta, 10), 0, 100);
      const note = str(raw.note);
      // The cool-down: a hostile, targeted scheme that moved within the window
      // does not move again on its own. Provoked (the target's own order in
      // this very event) it may.
      const lastMove = it.log.length ? str(it.log.at(-1)).slice(0, 10) : "";
      if (it.stance === "hostile" && it.target && !provoked && stage > it.stage && lastMove && daysBetween(lastMove, date) < HOSTILE_ADVANCE_COOLDOWN_DAYS) {
        refusals.push(`${it.owner}'s scheme against ${it.target} ("${it.summary.slice(0, 60)}…") already moved on ${lastMove}; unprovoked, it moves again only after ${HOSTILE_ADVANCE_COOLDOWN_DAYS} days.`);
        continue;
      }
      list[at] = { ...it, stage, updatedAt: date || it.updatedAt, log: [...it.log, `${date || "undated"}: ${note || `stage ${stage}`}`].slice(-10) };
    } else if (op === "resolve") {
      const success = raw.success !== false;
      list[at] = { ...it, status: "resolved", stage: success ? 100 : it.stage, outcome: str(raw.outcome), updatedAt: date || it.updatedAt };
      // A resolved economic intent MAY move real money — a sovereign loan
      // requested and granted, a bailout, a bloc paying to settle a dispute.
      // This is never done through the generic AI economy lever (treasury
      // and debt are engine stocks the rules say are never set directly);
      // it becomes a trusted effect instead, exactly like an organization's
      // voted sanction, applied to economies only through applyIntentEffects.
      const loan = raw.loan && typeof raw.loan === "object" ? raw.loan : null;
      if (success && loan) {
        const amount = Math.max(0, finite(loan.amount, 0));
        const lender = str(loan.lender) || (it.ownerType === "polity" ? it.owner : "");
        const borrower = str(loan.borrower) || it.target;
        if (amount > 0 && lender && borrower && lender !== borrower) effects.push({ type: "loan", lender, borrower, amount });
      }
      // A resolved hostile intent (sabotage, funded unrest, a cyberattack, a
      // destabilisation campaign) MAY do real damage — never through the
      // generic economy lever, which is for the polity's OWN policy choices,
      // not an attack another polity inflicts on it. Same trusted-effect
      // path as a loan; see applyIntentEffects.
      const sabotage = raw.sabotage && typeof raw.sabotage === "object" ? raw.sabotage : null;
      if (success && sabotage) {
        const target = str(sabotage.target) || it.target;
        const kind = SABOTAGE_KINDS.includes(lower(sabotage.kind)) ? lower(sabotage.kind) : "legitimacy";
        const intensity = clamp(finite(sabotage.intensity, 0.3), 0, 1);
        if (target) effects.push({ type: "sabotage", target, kind, intensity, by: it.owner });
      }
    } else if (op === "abandon") {
      list[at] = { ...it, status: "abandoned", outcome: str(raw.reason) || it.outcome, updatedAt: date || it.updatedAt };
    } else if (op === "expose") {
      list[at] = { ...it, secret: false, updatedAt: date || it.updatedAt };
    }
  }
  return { intents: list, effects, refusals };
};

// A granted loan moves real SY directly: the lender's treasury falls (it can
// go negative, i.e. arrears, exactly like any other treasury draw); the
// borrower receives the cash AND the matching liability, so its own
// interest and debt ceiling take over from here. This is the disbursement,
// not a repayment schedule — servicing the debt is the borrower's own
// interestRate/spending identity from the next step on, same as any debt.
// A resolved hostile intent does real damage of the kind it named:
//   infrastructure — sabotage, a cyberattack on critical assets: capital lost,
//     up to 5% of the stock at full intensity.
//   legitimacy — funded unrest, a destabilisation campaign: public trust
//     erodes, up to 20 points at full intensity, the same order of magnitude
//     stepEconomy's own shocks (overreach, inflation) already move it by.
//   credit — pressure on lenders, a whisper campaign against a currency:
//     fiscal credibility erodes by the same order, up to 20 points.
// A threatened power that only ever gets diplomatic replies is not a real
// adversary; this is what makes "we lost interests here" cost the target
// something real, the way the target losing them cost the aggressor nothing
// free either.
const SABOTAGE_MAGNITUDE = { infrastructure: 0.05, legitimacy: 20, credit: 20 };

export const applyIntentEffects = (economies, effects, { normalizeEconomy }) => {
  const next = { ...(economies && typeof economies === "object" ? economies : {}) };
  for (const effect of Array.isArray(effects) ? effects : []) {
    if (!effect || typeof effect !== "object") continue;
    if (effect.type === "loan") {
      const lender = str(effect.lender);
      const borrower = str(effect.borrower);
      if (!next[lender] || !next[borrower]) continue;
      const requested = Math.max(0, finite(effect.amount, 0));
      if (requested <= 0) continue;
      // A lender can only actually disburse what it holds — capped to its
      // own treasury, exactly like the project-finance gold buyback caps a
      // purchase to what real money is on hand (see projectFinance.js). A
      // "loan" the AI narrates as granted for more than the lender actually
      // has is honored only up to what is real; the rest never moves.
      const amount = Math.min(requested, Math.max(0, next[lender].treasury));
      if (amount <= 0) continue;
      next[lender] = normalizeEconomy({ ...next[lender], treasury: next[lender].treasury - amount });
      next[borrower] = normalizeEconomy({ ...next[borrower], treasury: next[borrower].treasury + amount, debt: next[borrower].debt + amount });
    } else if (effect.type === "sabotage") {
      const target = str(effect.target);
      if (!next[target] || !SABOTAGE_KINDS.includes(effect.kind)) continue;
      const intensity = clamp(finite(effect.intensity, 0), 0, 1);
      const e = next[target];
      if (effect.kind === "infrastructure") next[target] = normalizeEconomy({ ...e, capital: Math.max(0, e.capital * (1 - SABOTAGE_MAGNITUDE.infrastructure * intensity)) });
      else if (effect.kind === "legitimacy") next[target] = normalizeEconomy({ ...e, legitimacy: clamp(e.legitimacy - SABOTAGE_MAGNITUDE.legitimacy * intensity, 0, 100) });
      else if (effect.kind === "credit") next[target] = normalizeEconomy({ ...e, fiscalCredibility: clamp(e.fiscalCredibility - SABOTAGE_MAGNITUDE.credit * intensity, 0, 100) });
    }
  }
  return next;
};

// Field evidence: the mechanism got used, but only ever for the PLAYER's own
// polity — the entire point of a standing intent is a scheme that exists
// without the player, so "every intent traces back to the player" is exactly
// backwards. True only once there is at least one intent AND every one of
// them is the player's own — an empty list is not evidence of the bias.
export const intentsNeedOtherPowers = (intents, playerPolity) => {
  const list = normalizeIntents(intents);
  const player = str(playerPolity);
  return list.length > 0 && player.length > 0 && list.every((it) => it.owner === player);
};

// ---- the player's own long game, read from their own order ------------------------------
//
// Everything above gives every OTHER actor a standing scheme: a polity, a body,
// a bloc — each carried across turns with an id, a stage and a cool-down. The
// player had none. Their long game lived as prose inside an order that was read
// once, narrated, and thrown away, so the one actor the game is actually about
// was the only one who could not hold a plan.
//
// Same lesson as the drives, the gatherings, the treasury moves and the
// liabilities, for the sixth time: a rule asking the model to carry intentOps
// did not make it carry them. An order read "Ouvrir un plan pluriannuel : sortir
// des terres rares chinoises d'ici cinq ans, discrètement" and the next edition
// wrote a fine essay on strategic autonomy while world.intents stayed empty. So
// the engine reads the order.
//
// Two things this section deliberately refuses to do, both learned the hard way:
//
//   It does not invent a date field. An intent is stamped createdAt/updatedAt by
//   normalizeIntent above, and by nothing else. runtime/factions.js was found
//   reading `since` on an intent — a field the engine has never once written —
//   which made driftFromBlunders dead code that a green suite hid, because the
//   fixture invented the field the code was looking for. So nothing below reads
//   a date the engine does not write, and the tests build their fixtures with
//   applyIntentOps rather than by hand.
//
//   It does not give the player a private door. Everything here goes THROUGH
//   applyIntentOps, so the merge-on-recreate, the 0-100 clamp and above all the
//   hostile cool-down bite the player exactly as hard as they bite the powers
//   scheming against them. A player whose own plots advanced every edition while
//   everyone else's crawled would not be playing the same world.

// How far a single order may push a standing plan. The prompt already tells the
// model 5-25 for its own advances; the player's order gets the same ceiling,
// because a plan one sentence can carry from nothing to done is not a plan.
export const MAX_ORDER_ADVANCE = 25;
// What an order that names no figure is worth — applyIntentOps' own default.
const DEFAULT_ORDER_ADVANCE = 10;
// How much of the player's own sentence is kept as the plan's summary.
const SUMMARY_CAP = 180;

// Accent-blind matching, so "marché" and "marche" are the same word to the
// engine and a player who typed fast is not silently ignored.
const fold = (v) => lower(v).normalize("NFD").replace(/[̀-ͯ]/g, "");

// Sentences. The split keeps a colon INSIDE the sentence on purpose: a French
// order writes "Ouvrir un plan pluriannuel : sortir des terres rares chinoises",
// and cutting at the colon left the plan with "Ouvrir un plan pluriannuel" as
// its whole summary — a scheme whose aim had been thrown away.
const sentences = (text) => str(text).split(/(?<=[.!?;])\s+|\n+/).map(str).filter(Boolean);

// A standing plan is not an act. What makes it one is that the player says it
// runs past this turn, so this marker is required before any order opens one —
// without it, every ordinary instruction with the word "objectif" in it would
// become a multi-turn scheme.
const STANDING_MARKER = /\b(?:long terme|long-terme|longue haleine|pluriannuel\w*|au long cours|dans la dur[ée]e|durablement|permanent\w*|sur (?:plusieurs|deux|trois|quatre|cinq|six|sept|huit|neuf|dix|\d+)\s+(?:tours?|ann[ée]es?|mois|l[ée]gislatures?|mandats?)|d'ici (?:\d+|deux|trois|quatre|cinq|six|sept|dix)\s+(?:ans?|ann[ée]es?)|standing|long[- ]term|long game|multi[- ]?year|over (?:several|two|three|four|five|ten|\d+)\s+(?:turns?|years?)|for years|by \d{4})\b/i;

// "but" is left out of the bare noun list on purpose: it is also an English
// conjunction, and "we hold the line over five years, but …" was opening plans.
const PLAN_NOUN = /(?:\b(?:plans?|desseins?|objectifs?|strat[ée]gies?|man(?:œ|oe)uvres?|campagnes?|intentions?|feuille de route|ligne de conduite|aims?|objectives?|goals?|schemes?|designs?|standing intent|road ?map)\b|\b(?:le|notre|mon|son) but\b)/i;

const ADVANCES = /\b(?:fai(?:re|s|tes)\s+(?:avancer|progresser)|avanc\w*|progress\w*|pouss\w*|acc[ée]l[ée]r\w*|relanc\w*|poursuiv\w*|continu\w*|[ée]tape suivante|passer [àa] l'[ée]tape|advanc\w*|push\w*|press\w*|carry (?:on|forward)|step up|next stage|move [^.]{0,20}forward)\b/i;
const ABANDONS = /\b(?:abandonn\w*|renonc\w*|enterr\w*|class\w+ sans suite|met(?:tre|s|tons|tez)? fin|suspend\w*|abandon\w*|drop\w*|call(?:ing|ed)? off|giv\w+ up|shelv\w*|abort\w*|scrap\w*|wind (?:up|down))\b/i;
const EXPOSES = /\b(?:[ée]vent\w*|r[ée]v[ée]l\w*|d[ée]voil\w*|divulgu\w*|d[ée]masqu\w*|d[ée]nonc\w*|rendre publi\w*|mettre au jour|publi\w*|expos\w*|reveal\w*|unmask\w*|leak\w*|make public|bring to light|denounc\w*|blow the (?:cover|lid))\b/i;
// Exposure needs something in the sentence that says a HIDDEN thing is meant,
// or the guard is just the verb: "publier les comptes de l'APSA" is an order
// about accounts, and it was tripping the exposure branch every turn.
const PLOT = /\b(?:complots?|conspirations?|machinations?|intrigues?|man(?:œ|oe)uvres? secr[èe]tes?|plans? secrets?|op[ée]ration secr[èe]te|plots?|conspirac\w*|secret (?:plan|scheme|operation)|covert (?:plan|scheme|operation)|schemes?)\b/i;

const SECRETLY = /\b(?:secr[èe]t\w*|discr[èe]t\w*|en sous-main|confidentiel\w*|[àa] l'insu|sans l'[ée]bruiter|covert\w*|quietly|in secret|unannounced|off the books)\b/i;
const OPENLY = /\b(?:publiquement|ouvertement|au grand jour|d[ée]clar[ée]\w*|assum[ée]\w*|publicly|openly|declared|in the open|on the record)\b/i;

const AGAINST = /\b(?:contre|[àa] l'encontre de|vis-[àa]-vis de|against|aimed at|targeting|directed at)\s+([^,.;:!?]{2,60})/i;
const SUPPORTS = /\b(?:en faveur de|au profit de|aux c[ôo]t[ée]s de|pour soutenir|pour appuyer|in (?:favour|favor) of|in support of|alongside|to back)\s+([^,.;:!?]{2,60})/i;
const HOSTILE_VERB = /\b(?:affaibl\w*|[ée]vinc\w*|bris\w*|sabot\w*|bloqu\w*|contrer|contrecarr\w*|isol\w*|[ée]vince|renvers\w*|undermin\w*|weaken\w*|block\w*|oust\w*|thwart\w*|isolat\w*|counter\w*)\b/i;
const SUPPORTIVE_VERB = /\b(?:soutenir|soutien|appuyer|aider|renforcer|consolider|support\w*|back\w*|help\w*|strengthen\w*|shore up)\b/i;

// Points an order names for an advance: "avancer de 15 points", "push it 20%".
const POINTS = /(\d{1,3})\s*(?:points?|pts?|%)/i;

// What a plan is ABOUT, in the player's own vocabulary. The words that matched
// become the scheme's SCOPE as well as its kind, and that is deliberate: scope
// decides which of the player's later orders the scheme bites on
// (realityCheck.assessAction), and the engine has no business deciding that on
// the player's behalf. Their own words decide, or the scope is empty.
const TOPICS = [
  ["economic", ["tarif", "droits de douane", "commerce", "marché", "crédit", "dette", "monnaie", "devise", "terres rares", "énergie", "gaz", "pétrole", "investissement", "industrie", "subvention", "impôt", "sanction", "tariff", "trade", "market", "credit", "debt", "currency", "rare earths", "energy", "oil", "investment", "industry", "subsidy", "tax"]],
  ["diplomatic", ["diplomatie", "diplomatique", "alliance", "traité", "négociation", "reconnaissance", "ambassade", "médiation", "sommet", "adhésion", "diplomacy", "diplomatic", "treaty", "negotiation", "recognition", "embassy", "mediation", "summit", "accession"]],
  ["military", ["militaire", "armée", "guerre", "frontière", "dissuasion", "réarmement", "flotte", "défense", "military", "army", "war", "border", "deterrence", "rearmament", "fleet", "defence", "defense"]],
  ["espionage", ["espionnage", "renseignement", "sabotage", "infiltration", "taupe", "cyber", "écoutes", "espionage", "intelligence", "spy", "mole", "wiretap"]],
  ["political", ["élection", "parlement", "constitution", "référendum", "coalition", "majorité", "réforme", "opinion", "election", "parliament", "referendum", "majority", "reform"]],
];

const wordRe = (literal) => new RegExp(`(?<![a-z0-9])${fold(literal).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:s|es|x)?(?![a-z0-9])`, "i");
const TOPIC_MATCHERS = TOPICS.map(([kind, words]) => [kind, words.map((w) => [w, wordRe(w)])]);

const classify = (text) => {
  const hay = fold(text);
  const scope = [];
  let best = { kind: "other", hits: 0 };
  for (const [kind, words] of TOPIC_MATCHERS) {
    let hits = 0;
    for (const [word, re] of words) if (re.test(hay)) { hits += 1; scope.push(lower(word)); }
    if (hits > best.hits) best = { kind, hits };
  }
  return { kind: best.kind, scope: [...new Set(scope)].slice(0, 16) };
};

// Every power this world actually holds — its economies and its bodies. A
// target is one of these or it is nothing: a scheme aimed at a name nobody in
// the world has heard of is exactly the invented state the engine refuses.
const powersOf = (economies, organizations) => [
  ...Object.keys(economies && typeof economies === "object" ? economies : {}),
  ...(Array.isArray(organizations) ? organizations : []).map((o) => str(o?.name)),
].map(str).filter(Boolean);

// Longest first, so "Congo-Brazzaville" wins over "Congo" when both are held.
const namedIn = (text, names, exclude = "") => {
  const hay = fold(text);
  return [...new Set(names.map(str).filter(Boolean))]
    .filter((n) => n.length >= 3 && lower(n) !== lower(exclude) && hay.includes(fold(n)))
    .sort((a, b) => b.length - a.length);
};

const STOPWORDS = new Set(["contre", "pendant", "toujours", "notamment", "comme", "entre", "avant", "depuis", "encore", "autour", "cette", "leurs", "nombre", "moment", "against", "toward", "towards", "through", "before", "during", "within", "between", "because", "without", "should", "standing"]);
// Words long enough to mean something on their own. Six letters is the line
// that keeps "notre" and "their" out without losing "tarifs" or "credit".
const keywordsOf = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length >= 6 && !STOPWORDS.has(w));

/**
 * Which standing plan an order is talking about. An id the order quotes wins;
 * then a scope keyword, a distinctive word of the summary, or the target's own
 * name; then, when only one plan is open at all, that one. Never a guess
 * between two — an order that could mean either is refused and says which two,
 * because silently pushing the wrong scheme is worse than pushing none.
 */
const identify = (candidates, text) => {
  const hay = fold(text);
  const byId = candidates.filter((it) => hay.includes(fold(it.id)));
  if (byId.length) return byId.length === 1 ? { hit: byId[0] } : { among: byId };
  const byWord = candidates.filter((it) => it.scope.some((k) => k.length >= 4 && hay.includes(fold(k)))
    || keywordsOf(it.summary).some((w) => hay.includes(w))
    || (it.target && hay.includes(fold(it.target))));
  if (byWord.length) return byWord.length === 1 ? { hit: byWord[0] } : { among: byWord };
  if (candidates.length === 1) return { hit: candidates[0] };
  return { among: candidates };
};

const short = (s, n = 60) => (str(s).length > n ? `${str(s).slice(0, n)}…` : str(s));
const listPlans = (list) => list.map((it) => `"${short(it.summary, 48)}" (${it.id})`).join(", ");

/**
 * What an order does to the player's own standing plans, plus what it does to
 * somebody else's secret one. Returns the moves the levers need. A move of kind
 * "refuse" carries a reason and nothing else: a parse that knows the world well
 * enough to say WHY it did nothing is worth more than an empty array, and this
 * is how that reason reaches the player through applyIntentMoves.
 *
 * One order opens at most one plan, advances at most one, abandons at most one
 * and exposes at most one. A player who wants two writes two orders, which is
 * also how they get two summaries instead of one sentence standing for both.
 */
export const intentMovesFromOrder = (order, { player = "", intents = [], economies = {}, organizations = [], date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  const me = str(player);
  if (!text || !me) return [];

  const list = normalizeIntents(intents);
  const mine = list.filter((it) => it.status === "active" && lower(it.owner) === lower(me));
  const theirSecrets = list.filter((it) => it.status === "active" && it.secret && lower(it.owner) !== lower(me));
  const powers = powersOf(economies, organizations);
  const moves = [];
  const refuse = (reason) => moves.push({ kind: "refuse", reason, date });
  let exposed = false; let advanced = false; let abandoned = false; let opened = false;

  for (const sentence of sentences(text)) {
    // ---- exposing somebody else's scheme
    if (!exposed && EXPOSES.test(sentence)
      && (PLOT.test(sentence) || namedIn(sentence, theirSecrets.map((it) => it.owner), me).length)) {
      exposed = true;
      const owner = namedIn(sentence, theirSecrets.map((it) => it.owner), me)[0] ?? "";
      // Only a scheme aimed at the player can honestly be published by the
      // player: a secret plot against a third party has, by the rule this
      // module enforces everywhere else, never leaked into anything they read.
      const mineToTell = theirSecrets.filter((it) => lower(it.target) === lower(me) && (!owner || lower(it.owner) === lower(owner)));
      if (!mineToTell.length) {
        const elsewhere = theirSecrets.filter((it) => !owner || lower(it.owner) === lower(owner));
        const who = owner || namedIn(sentence, powers, me)[0] || "";
        if (elsewhere.length) {
          refuse(`intents expose refused: ${elsewhere[0].owner}'s scheme is not aimed at ${me} and is still secret — nothing about it has reached ${me}'s services to publish. It becomes exposable when a spy is caught, a leak lands, or the scheme surfaces on its own.`);
        } else {
          refuse(`intents expose refused: this world holds no secret scheme${who ? ` of ${who}'s` : ""} aimed at ${me}. Nothing is on record to bring into the open.`);
        }
        continue;
      }
      const found = identify(mineToTell, sentence);
      if (!found.hit) { refuse(`intents expose refused: the order could mean either of ${listPlans(found.among)} — name the one you are publishing.`); continue; }
      moves.push({ kind: "expose", id: found.hit.id, date });
      continue;
    }

    // ---- the player's own plans. All three need a plan word in the sentence:
    // without it "verser une avance de trésorerie" and "drop the tariff" were
    // firing the advance and abandon branches on every economic order.
    const aboutAPlan = PLAN_NOUN.test(sentence) || mine.some((it) => fold(sentence).includes(fold(it.id)));

    if (!abandoned && aboutAPlan && ABANDONS.test(sentence)) {
      abandoned = true;
      if (!mine.length) { refuse(`intents abandon refused: ${me} holds no standing plan to drop.`); continue; }
      const found = identify(mine, sentence);
      if (!found.hit) { refuse(`intents abandon refused: the order could mean either of ${listPlans(found.among)} — name the one you are dropping.`); continue; }
      moves.push({ kind: "abandon", id: found.hit.id, reason: short(sentence, SUMMARY_CAP), date });
      continue;
    }

    if (!advanced && aboutAPlan && ADVANCES.test(sentence)) {
      advanced = true;
      if (!mine.length) { refuse(`intents advance refused: ${me} holds no standing plan to press on — open one first, saying what it aims at and over what horizon.`); continue; }
      const found = identify(mine, sentence);
      if (!found.hit) { refuse(`intents advance refused: the order could mean either of ${listPlans(found.among)} — name the one you are pressing on.`); continue; }
      const asked = Number(sentence.match(POINTS)?.[1]);
      const wanted = Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_ORDER_ADVANCE;
      if (wanted > MAX_ORDER_ADVANCE) {
        refuse(`intents advance on "${short(found.hit.summary, 48)}" capped at ${MAX_ORDER_ADVANCE} points: an order asked for ${wanted}, and a plan one sentence carries from nothing to done is not a plan.`);
      }
      moves.push({ kind: "advance", id: found.hit.id, stageDelta: Math.min(wanted, MAX_ORDER_ADVANCE), note: short(sentence, SUMMARY_CAP), date });
      continue;
    }

    // ---- opening one of the player's own
    if (opened || !PLAN_NOUN.test(sentence) || !STANDING_MARKER.test(text)) continue;
    opened = true;
    const aim = short(sentence, SUMMARY_CAP);
    if (!aim) { refuse("intents open refused: the order names a plan but states no aim, and a scheme with no aim in words is not a scheme."); continue; }

    // The target has to be a power the world holds. When the order aims the
    // plan at a name nobody has heard of, that is refused by name rather than
    // quietly opened targetless — a plan against nobody is not the plan the
    // player wrote.
    const hostileAt = text.match(AGAINST)?.[1] ?? "";
    const supportiveAt = text.match(SUPPORTS)?.[1] ?? "";
    const named = namedIn(text, powers, me);
    const inTail = (tail) => namedIn(tail, powers, me)[0] ?? "";
    const target = inTail(hostileAt) || inTail(supportiveAt) || named[0] || "";
    if (!target && (hostileAt || supportiveAt)) {
      refuse(`intents open refused: the order aims a standing plan at "${short(str(hostileAt || supportiveAt), 40)}", and this world holds no polity or body by that name. Name it as the world does, or drop the target.`);
      continue;
    }

    const stance = (hostileAt && inTail(hostileAt)) || (HOSTILE_VERB.test(text) && target) ? "hostile"
      : (supportiveAt && inTail(supportiveAt)) || (SUPPORTIVE_VERB.test(text) && target) ? "supportive"
        : "neutral";
    const { kind, scope } = classify(text);
    moves.push({
      kind: "open",
      date,
      intent: {
        ownerType: "polity",
        owner: me,
        target,
        kind,
        summary: aim,
        // Secret unless the order says it is declared — the same default
        // normalizeIntent uses, so the player's own plan is no more visible to
        // the world than anyone else's until they say it is.
        secret: OPENLY.test(text) ? false : (SECRETLY.test(text) || true),
        stance,
        scope,
        triggerHint: "",
      },
    });
  }

  return moves;
};

const stanceWord = (it) => (it.stance === "hostile" ? "against" : it.stance === "supportive" ? "for" : "toward");
const aimedAt = (it) => (it.target ? ` ${stanceWord(it)} ${it.target}` : "");

/**
 * Applies those moves through applyIntentOps — never around it, so the player's
 * own scheme meets the same merge, the same clamp and the same hostile
 * cool-down as every scheme aimed at them. Returns the new world, the record
 * rows for what actually moved, and the refusals in words.
 *
 * Ops go one at a time on purpose: it is the only way to say WHICH plan a row
 * belongs to, and the cool-down has to see the log the previous op just wrote.
 */
export const applyIntentMoves = (world, moves, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const me = str(player);
  const rows = [];
  const refusals = [];
  let list = normalizeIntents(w.intents);
  let touched = false;

  for (const move of Array.isArray(moves) ? moves : []) {
    if (!move || typeof move !== "object") continue;
    const when = str(move.date) || str(date);
    if (move.kind === "refuse") { refusals.push(str(move.reason)); continue; }

    let op = null;
    let before = null;
    if (move.kind === "open") {
      op = { op: "create", intent: { ...move.intent, createdAt: when, updatedAt: when } };
    } else {
      before = list.find((it) => it.id === str(move.id)) ?? null;
      if (!before) { refusals.push(`intents ${move.kind} refused: this world holds no standing plan "${str(move.id)}".`); continue; }
      if (before.status !== "active") { refusals.push(`intents ${move.kind} refused: "${short(before.summary, 48)}" is already ${before.status}.`); continue; }
      if (move.kind === "advance") op = { op: "advance", intent: before.id, stageDelta: finite(move.stageDelta, DEFAULT_ORDER_ADVANCE), note: str(move.note) };
      else if (move.kind === "abandon") op = { op: "abandon", intent: before.id, reason: str(move.reason) };
      else if (move.kind === "expose") {
        if (!before.secret) { refusals.push(`intents expose refused: ${before.owner}'s scheme is already in the open; there is nothing left to publish.`); continue; }
        op = { op: "expose", intent: before.id };
      } else { refusals.push(`intents: unknown move "${str(move.kind)}".`); continue; }
    }

    const applied = applyIntentOps(list, [op], { date: when, provoked: false });
    refusals.push(...(applied.refusals ?? []));
    const next = applied.intents;

    if (move.kind === "open") {
      const owner = str(move.intent?.owner) || me;
      const wanted = INTENT_KINDS.includes(lower(move.intent?.kind)) ? lower(move.intent.kind) : "other";
      const it = next.find((x) => x.status === "active" && lower(x.owner) === lower(owner) && x.kind === wanted);
      if (!it) { refusals.push("intents open refused: an intent needs an owner and an aim, and the order gave one without the other."); continue; }
      const was = list.find((x) => x.id === it.id) ?? null;
      touched = true;
      list = next;
      // A fresh plan's stage is 0, and 0 is the honest figure: the row says a
      // plan now stands, at nothing out of a hundred, which is exactly what the
      // player has bought with the order. Restating one that already runs keeps
      // its ground, so the row carries the stage it is at.
      rows.push({
        date: when,
        polity: it.owner,
        kind: "standing",
        what: `${was ? "restated" : "opened"} a standing plan${aimedAt(it)}${it.secret ? ", secret" : ""}: ${short(it.summary, 90)}`,
        amount: it.stage,
        unit: "pt",
        source: `intent:${was ? "restate" : "open"}:${it.id}`,
      });
      continue;
    }

    const after = next.find((x) => x.id === before.id) ?? before;
    if (after.stage === before.stage && after.status === before.status && after.secret === before.secret) {
      // applyIntentOps refused it — the cool-down, most often — and has already
      // said so in its own words. Nothing moved, so nothing is written down.
      continue;
    }
    touched = true;
    list = next;

    if (move.kind === "advance") {
      rows.push({ date: when, polity: after.owner, kind: "standing", what: `pressed a standing plan on${aimedAt(after)}: ${short(after.summary, 90)}`, amount: after.stage - before.stage, unit: "pt", source: `intent:advance:${after.id}` });
    } else if (move.kind === "abandon") {
      rows.push({ date: when, polity: after.owner, kind: "standing", what: `abandoned a standing plan at stage ${before.stage}: ${short(after.summary, 90)}`, amount: -before.stage, unit: "pt", source: `intent:abandon:${after.id}` });
    } else if (move.kind === "expose") {
      // Both sides, the way a treasury move leaves a row on each purse: the
      // power whose scheme is now public, and the player who published it.
      rows.push({ date: when, polity: after.owner, kind: "standing", what: `its secret plan${aimedAt(after)} is in the open at stage ${after.stage}: ${short(after.summary, 90)}`, amount: 0, unit: "pt", source: `intent:expose:${after.id}` });
      rows.push({ date: when, polity: me, kind: "standing", what: `published ${after.owner}'s scheme`, amount: 0, unit: "pt", source: `intent:expose:${after.id}` });
    }
  }

  if (!touched) return { world, rows: [], refusals };
  return { world: { ...w, intents: list }, rows, refusals };
};

/** Every planned order, read for what it does to the standing plans. */
export const ensureIntentMovesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const moves = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")
    .flatMap((order) => intentMovesFromOrder(order, {
      player, intents: w.intents, economies: w.economies, organizations: w.organizations, date,
    }));
  if (!moves.length) return { world: w, rows: [], refusals: [] };
  return applyIntentMoves(w, moves, { player, date });
};

export const INTENT_ORDER_RULES = [
  "The player's own long game is state, not prose. The engine reads the player's own order for it — open, advance, abandon, expose — and writes the result into the standing intents above, so a plan announced once is still there ten turns later with a stage on it. Report what the engine did; never narrate a plan moving that the block above does not show moving.",
  "OPEN: an order that names a plan AND says it runs past this turn (\"un plan pluriannuel\", \"objectif de long terme\", \"d'ici cinq ans\", \"a standing aim\", \"over five years\") opens one standing intent owned by the player. Its kind and its scope are taken from the player's own words, never invented; its target must be a power this world actually holds; it is secret unless the order says it is declared. One order opens one plan.",
  `ADVANCE: an order that presses an open plan on moves it by the points the order names, capped at ${MAX_ORDER_ADVANCE} — a plan one sentence carries from nothing to done is not a plan. An order that could mean two open plans moves neither, and says which two.`,
  "ABANDON: an order that drops a plan closes it, and the stage it had reached is lost rather than quietly kept for a later reopening.",
  "EXPOSE: the player can publish only a secret scheme aimed at THEM — the only kind their own services could have learned of. A secret scheme aimed at a third party is refused in so many words, and becomes exposable when a spy is caught, a leak lands, or the scheme surfaces on its own.",
  `A plan the player opens is bound by exactly the rules everyone else's is: restating it merges rather than stacks, its stage is clamped to 0-100, and a HOSTILE plan with a target advances at most once every ${HOSTILE_ADVANCE_COOLDOWN_DAYS} days unless the target's own move provokes it. The player has no private door into this mechanism.`,
].join("\n");

// ---- what the model reads ---------------------------------------------------------------
//
// Ground truth for the GM-level prompt (jumpForward/autoJumpForward): shows
// EVERYTHING, secret or not, so the model can advance a scheme intelligently.
// `revealSecrets: false` is for anything player-facing (an advisor or a
// diplomatic voice), where a secret intent must stay invisible until exposed.

export const describeIntents = (intents, { revealSecrets = true, playerPolity = "" } = {}) => {
  const list = normalizeIntents(intents).filter((it) => it.status === "active");
  const player = str(playerPolity);
  const visible = revealSecrets ? list : list.filter((it) => !it.secret || it.owner === player || it.target === player);
  if (visible.length === 0) return "";
  return visible.map((it) => {
    const who = `${it.ownerType === "organization" ? "org:" : ""}${it.owner}`;
    const against = it.target ? ` against ${it.target}` : "";
    const hidden = it.secret ? " [secret]" : "";
    const last = it.log.at(-1);
    return `${who} — ${it.kind}${against}, stage ${it.stage}/100${hidden}: ${it.summary}`
      + `${it.triggerHint ? ` (advances on: ${it.triggerHint})` : ""}${last ? `; last: ${last}` : ""}`;
  }).join("\n");
};

export const INTENTS_RULES = `[Standing Intents]
Every scheme a polity OR an international organization is quietly working toward is listed above (secret ones are marked [secret] and are your memory alone — never let their content leak into an event's text, a diplomatic message, or anything the player reads, unless the intent has been exposed or the owner itself has chosen to act it out openly). Use them so the world has a real memory of its own plans instead of improvising a new one every turn:
• When a power (or an organization, acting through its members or its own institutional interest) forms a real multi-turn aim because of what just happened — a grudge from a broken promise, a plan to encircle a rival, a campaign to force a resolution through, a scheme to catch the player's spies, a push to corner a market — record it with impacts.intentOps {"op":"create","intent":{"ownerType":"polity|organization","owner":"<exact polity or organization name>","target":"<polity or organization it is aimed at, or empty for no single target>","kind":"economic|diplomatic|military|espionage|political|other","summary":"<the actual plan, one sentence>","secret":true|false,"triggerHint":"<what makes it advance or pay off>"}}.
• Every jump, advance at least one open intent that plausibly moved: {"op":"advance","intent":"<id>","stageDelta":<5 to 25>,"note":"<what changed>"}. Prefer the intents that are NOT aimed at the player: a power's own succession, its own reform, its quarrel with a third party. A hostile scheme aimed at the player moves on its own at most once every ${HOSTILE_ADVANCE_COOLDOWN_DAYS} days — the engine refuses a second unprovoked advance inside that window — and moves any time the player's own order touches its scope. Plots are slow; a world where every faction advances against the player every edition is not a hard world, it is a cartoon. An intent nearing 100 should be the reason an event happens, not a coincidence next to it — resolve it with {"op":"resolve","intent":"<id>","outcome":"<what happened>","success":true|false} when it pays off or collapses, or {"op":"abandon","intent":"<id>","reason":"<why>"} when circumstances kill it.
• Two intents can collide: one polity's scheme against another is that other polity's problem to notice, react to, or counter-scheme against — spin up a second intent for the target when that's the realistic response.
• Opposition is SPECIFIC, never universal. Every intent carries a "stance" toward its target — "hostile" (works against it), "neutral" (pursues its own line beside it), "supportive" (works for it) — and a "scope": a few lower-case keywords naming what it is actually about ("liturgy", "audit", "curia", "tariffs", "border"). A hostile scheme bites only on orders inside its scope; on everything else its owner is indifferent, or an ally. NEVER let every power oppose every order the player makes: that is not a hard world, it is an incoherent one. A reform that gives a bloc what it wants makes that bloc supportive — record it (advance its intent with a note, or create a supportive intent). The engine counts votes and opposition from these two fields, so set them honestly.
• A secret intent becomes visible to its target (and so to the player, if they are the target) only through {"op":"expose","intent":"<id>"} — triggered by a caught spy, a leak, a betrayal, or the scheme's own culmination — never by simply narrating its content while it is still marked secret.
• Organizations scheme too, through their own institutional interest or a bloc of members, independent of any single state: the IMF quietly building a case for tougher conditionality, a trade bloc angling to force a member's hand, a security council power maneuvering toward a resolution it hasn't yet dared propose. Give these the same treatment, with ownerType "organization" and owner the body's exact name.
• A country independently coming to the player's own bank, fund, or lending programme for financing is an intent the BORROWER creates, target the player's polity (or the institution's owning polity), kind "economic" — this is the mechanism for "the world asks ME for something" rather than the other way round. When such a request is actually GRANTED, the money must be real: resolve it with {"op":"resolve","intent":"<id>","outcome":"<what was agreed>","success":true,"loan":{"amount":<SY>,"lender":"<the lending polity>","borrower":"<the borrowing polity>"}}. This moves the SY directly between the two economies — the lender's treasury falls by that amount, the borrower's treasury rises and its debt rises by the same amount, and from then on the borrower services that debt like any other (its own interest rate, its own debt ceiling). Never narrate a loan as granted without this "loan" payload — an agreement with no loan field is a promise, not money. The lender can only actually pay out what its own treasury holds — the engine honors the loan up to that real amount, never more, however large a figure the narration names.
• A power whose interests, monopoly, proxy, or standing the player has genuinely displaced does NOT simply accept it and reply diplomatically — that is a hegemon that has never lost anything. Give it a SECRET intent (kind "espionage" or "military") — sabotage, funded unrest, a cyberattack on critical infrastructure, a whisper campaign against the target's credit — and when it actually pays off, the damage must be real: resolve it with {"op":"resolve","intent":"<id>","outcome":"<what happened>","success":true,"sabotage":{"target":"<the harmed polity>","kind":"infrastructure|legitimacy|credit","intensity":0-1}}. infrastructure destroys real capital, legitimacy erodes public trust, credit erodes fiscal credibility — pick whichever the scheme actually targeted. This is the ONLY way a scheme costs its victim something real; narrating a sabotage or a cyberattack succeeding with no sabotage payload leaves the target completely unharmed underneath the story.`;
