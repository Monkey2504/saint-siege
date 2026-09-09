/*! Open Historia — what the last edition was about, measured © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The complaint: every turn of the Vatican game was banks, lawsuits and
// ultimatums, when a pope's world is mostly the faith. A rule in the prompt can
// ask for balance, but a rule is a wish. This measures what the last jump was
// actually about, with the same classifier the reality check uses on orders
// (runtime/realityCheck.js), and hands the model the count at call time — so
// "too much money" is a figure it is told, computed from what it wrote, not a
// mood the player has to argue.

import { classifyAction } from "./realityCheck.js";
import { normalizeIntents } from "./intents.js";

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());
const lower = (v) => str(v).toLowerCase();

// The fronts a pontificate is actually judged on, in the order the press lists
// them for a new pope. "money" is the reality-check domains that spend, tax or
// borrow; the other five are read off the words the Church itself uses.
export const FAITH_FRONTS = Object.freeze({
  unity: /\b(unity|unité|schism|schisme|synodal path|chemin synodal|kirchensteuer|autonom|dubia|traditionalist|traditionaliste|progressive|progressiste|communion|excommunic)/i,
  abuse: /\b(abuse|abus|survivor|victime|victim|cover-?up|dissimul|tolérance zéro|zero tolerance|canonical trial|procès canonique)/i,
  governance: /\b(synod|synode|synodality|synodalité|lay|laïc|women|femmes|deacon|diacre|diaconat|curia|curie|dicaster|dicastère|governance|gouvernance|reform of the|réforme de la)/i,
  vocations: /\b(vocation|seminar|séminaire|priest|prêtre|ordination|religious life|vie consacrée|novice|convent|couvent|monaster|monastère)/i,
  peace: /\b(peace|paix|war|guerre|ceasefire|cessez-le-feu|persecut|persécut|nuncio|nonce|mediation|médiation|refugee|réfugié|humanitarian|humanitaire)/i,
  liturgy: /\b(liturg|mass\b|messe|encyclical|encyclique|canoni[sz]ation|saints?(?!-)|pilgrim|pèlerin|jubilee|jubilé|catechism|catéchisme|doctrine|sacrament|sacrement|baptis)/i,
});

const MONEY_DOMAINS = new Set(["spending", "tax", "monetary"]);

const eventText = (event) => `${str(event?.title)} ${str(event?.description)}`;

/** Which fronts one event touches. Money is decided by the reality check's own classifier. */
export const frontsOf = (event) => {
  const text = eventText(event);
  const fronts = new Set();
  for (const [front, re] of Object.entries(FAITH_FRONTS)) if (re.test(text)) fronts.add(front);
  if (classifyAction(text).some((d) => MONEY_DOMAINS.has(d)) || /\b(bank|banque|loan|prêt|deficit|déficit|budget|patrimon|pension|retraite|treasury|trésor|euro|dollar|million|milliard|billion)\b/i.test(text)) fronts.add("money");
  return [...fronts];
};

/**
 * The mix of one edition: how many events touched each front, how many were
 * about money, and the share money took. Events the world attributes to the
 * engine (rejections, battles) are not stories and are left out.
 */
export const measureEdition = (events, { world = null, player = "" } = {}) => {
  const stories = (Array.isArray(events) ? events : []).filter((e) => e && e.title && lower(e.kind) !== "engine");
  const counts = Object.fromEntries([...Object.keys(FAITH_FRONTS), "money"].map((k) => [k, 0]));
  const hostiles = world ? hostilePowers(world, player) : [];
  let untouched = 0;
  let against = 0;
  for (const event of stories) {
    const fronts = frontsOf(event);
    if (!fronts.length) untouched += 1;
    for (const f of fronts) counts[f] += 1;
    if (movesAgainstPlayer(event, { player, hostiles })) against += 1;
  }
  const total = stories.length;
  const moneyShare = total ? counts.money / total : 0;
  const againstShare = total ? against / total : 0;
  return {
    total, counts, untouched,
    moneyShare: Number(moneyShare.toFixed(2)),
    against,
    againstShare: Number(againstShare.toFixed(2)),
    againstAllowed: againstAllowance(total),
  };
};

// The share of money above which an edition is judged lopsided. A third: money
// is one front of six, permanent and hard, and it may lead — it may not be the
// whole paper.
export const MONEY_SHARE_CEILING = 0.34;

// ---- how much of the edition is the world moving against the player ------------
//
// The second complaint, and the one that made the game feel like a siege: every
// edition read as organisations plotting against the pope rather than a
// pontificate governing. Same treatment as money — measured, not asked for.

// Words that make a story an act AGAINST the player rather than a story about
// the player. "The curia resists", "a bloc forms against", "leaks to the press".
const AGAINST = /\b(against|contre|resist|résist|oppos|block\w*|bloqu|obstruct|entrav|sabotag|undermin|saper|conspir|complot|plot\b|scheme|manœuvre|manoeuvre|intrigue|leak\w*|fuite\w*|coalition contre|front commun|défi\b|defiance|ultimatum|threat\w*|menac|denounc|dénonc|condemn|condamn|revolt|révolt|rebell|schism|schisme|boycott|veto|censure|frondeur|dissiden)/i;

const eventActor = (event) => str(event?.actor)
  || str((Array.isArray(event?.impacts?.polityChanges) ? event.impacts.polityChanges.find(Boolean) : null)?.name)
  || "";

/**
 * Is this story a power moving against the player? Either it is explicitly
 * attributed to someone else and its words are adversarial, or it names one of
 * the player's declared hostile counter-powers doing something to the player.
 */
export const movesAgainstPlayer = (event, { player = "", hostiles = [] } = {}) => {
  const text = eventText(event);
  if (!AGAINST.test(text)) return false;
  const actor = eventActor(event);
  const p = lower(player);
  if (p && lower(actor) === p) return false;           // the player pushing back is not a plot
  if (actor && hostiles.some((h) => lower(h) === lower(actor))) return true;
  if (!p) return Boolean(actor);
  // No attributed actor: it counts when the player is named as the object.
  return text.toLowerCase().includes(p) || hostiles.some((h) => text.toLowerCase().includes(lower(h)));
};

// A quarter of the edition, and never more than one story in a short edition.
export const AGAINST_SHARE_CEILING = 0.25;
export const againstAllowance = (total) => Math.max(1, Math.floor(total * AGAINST_SHARE_CEILING));

/** The powers whose declared schemes are hostile to the player right now. */
export const hostilePowers = (world, player) => normalizeIntents(world?.intents)
  .filter((it) => it.status === "active" && it.stance === "hostile" && (!it.target || lower(it.target) === lower(player)))
  .map((it) => it.owner)
  .filter((v, i, a) => v && a.indexOf(v) === i);

/**
 * The block the model reads at call time. Empty when there is no previous
 * edition to measure, so a first turn is not lectured about a mix it never wrote.
 */
export const describeEditionBalance = (events, { world = null, player = "" } = {}) => {
  const m = measureEdition(events, { world, player });
  if (!m.total) return "";
  const line = (front, label) => `${label} ${m.counts[front]}`;
  const lopsided = m.moneyShare > MONEY_SHARE_CEILING;
  const besieged = m.against > m.againstAllowed;
  return [
    "[Edition Balance — last jump, measured]",
    `${m.total} events. By front: ${[
      line("money", "money"), line("unity", "unity"), line("abuse", "abuse"), line("governance", "governance"),
      line("vocations", "vocations"), line("peace", "peace"), line("liturgy", "liturgy & doctrine"),
    ].join("; ")}${m.untouched ? `; on none of the six fronts ${m.untouched}` : ""}.`,
    `Money took ${Math.round(m.moneyShare * 100)}% of the edition${lopsided ? ` — above the ${Math.round(MONEY_SHARE_CEILING * 100)}% ceiling. This jump, at most a third of the events may be about money; the rest must come from the other five fronts.` : "."}`,
    // Said only when something was actually aimed at the player: a calm
    // edition is not lectured about a siege it never wrote.
    ...(m.against > 0
      ? [`${m.against} of ${m.total} events had a power moving against ${player || "the player"}${besieged
        ? ` — above the ceiling of ${m.againstAllowed}. This jump, AT MOST ${m.againstAllowed} may. The player governs; they are not besieged. Write what the player's own apparatus DID with the orders it was given, what the world did among itself, and what ordinary business a pontificate transacts. Opposition that does appear must come from a faction acting inside its own declared scope, at a moment its own scheme actually reached — never a fresh plot invented to fill an edition.`
        : `, within the ${m.againstAllowed} this edition allows.`}`]
      : []),
  ].join("\n");
};
