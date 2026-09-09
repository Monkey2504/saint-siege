/*! Open Historia — a body's own purse: capital, what it earns, what it hands on © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// Until now money belonged to polities. An organisation could pass resolutions
// and hold members, but it could not hold a franc, so anything an international
// body was said to earn or redistribute was narration with nothing under it —
// which is how eleven rounds of "péréquation inter-diocésaine" moved nobody's
// accounts by a euro.
//
// This gives a body a purse. It is deliberately the same shape for a football
// confederation, a Hanseatic league, a religious federation, a sovereign fund
// shared between provinces and a colonial company: a body holds CAPITAL, that
// capital earns at a MARGIN it has actually demonstrated, the body RETAINS a
// share of what it earns, and the rest is DISTRIBUTED to its members by a
// declared key. A member that is itself a body receives into its own purse, so
// a federation of continental bodies inside a world body is the ordinary case
// rather than a special one.
//
// Nothing here is narrated. Capital arrives only from a lever that moved it, a
// distribution happens only when the engine steps the world, and every movement
// leaves a row in the record.

import { economyIndicators, normalizeEconomy } from "./economy.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pos = (v, d = 0) => Math.max(0, finite(v, d));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// How a body splits what it hands on.
//   equal        — one share per member. A league of equals.
//   need         — more to the poorer member, by inverse output per head. The
//                  solidarity key: what "péréquation" actually means.
//   contribution — in proportion to what each member put in. The donors' key.
export const DISTRIBUTION_KEYS = ["equal", "need", "contribution"];

// A body cannot promise a return its own operations have never shown. The cap
// is deliberately generous — an events business can beat a bond — but finite:
// above this, a purse is a story about a purse.
export const MAX_MARGIN = 0.25;

export const normalizeTreasury = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const body = str(entry.body ?? entry.name ?? entry.organization);
  if (!body) return null;
  return {
    body,
    // The body this one pays into and answers to, when it is part of a
    // federation. Empty for a body that stands alone or sits at the top.
    parent: str(entry.parent),
    capital: pos(entry.capital),
    treasury: pos(entry.treasury),
    // What its CAPITAL returns when placed: a yield, set by a lever, never by
    // a sentence, and capped. This is income the engine adds each period.
    margin: clamp(finite(entry.margin, 0), 0, MAX_MARGIN),
    // What its GATHERINGS returned over the last few years, as a share of
    // capital. Reported, never re-earned: the surplus of each gathering has
    // already gone into the purse when it was held, so adding it again as a
    // yield would pay a body twice for the same crowd.
    earnedMargin: clamp(finite(entry.earnedMargin, 0), 0, MAX_MARGIN),
    // Somebody else's unfunded promise that this body has taken on: a pension
    // trust, a bad bank, a sovereign fund standing behind its state
    // (runtime/liabilities.js). Capital already committed to it is not free to
    // stand behind anything more.
    assumedLiabilities: pos(entry.assumedLiabilities),
    // Its campaign fund: money it keeps in hand before anything is handed on,
    // so it can run its own year without asking. A share cannot do this job —
    // retaining a fraction of each period's income builds a buffer whose size
    // depends on how long a turn happens to be, so the same body could fund its
    // programme on monthly turns and not on weekly ones. A sum can.
    reserve: pos(entry.reserve),
    // What it keeps of what it earns; the rest goes to the members.
    retain: clamp(finite(entry.retain, 0.5), 0, 1),
    key: DISTRIBUTION_KEYS.includes(lower(entry.key)) ? lower(entry.key) : "equal",
    // A body founded to finance somebody sends the bulk there before anything
    // is shared out: a company remitting to its crown, a sovereign fund paying
    // the budget, a federation funding the church that created it. The
    // beneficiary takes its share of what is handed on; the remainder is split
    // among the other members by the key.
    beneficiary: str(entry.beneficiary),
    beneficiaryShare: clamp(finite(entry.beneficiaryShare, 0), 0, 1),
    // What the body was founded to deliver each year to that beneficiary, in
    // SY. A purpose repeated in letters and editions is not a purpose the
    // world can hold; written here, the engine measures it every period and
    // says plainly whether it is met, and by how much it falls short.
    annualTarget: pos(entry.annualTarget),
    // What it costs to keep this body running for a year, outside anything it
    // stages: an office, staff, the ordinary work of its region. Its parent
    // pays this first, before any surplus is shared, because a body that
    // cannot open its doors cannot do anything else either.
    operatingBudget: pos(entry.operatingBudget),
    // Through when its running costs are covered. Set by the step.
    fundedUntil: str(entry.fundedUntil),
    // Set by the step: what it actually delivered over the last period, at an
    // annual rate, so target and delivery are read side by side.
    deliveredPerYear: pos(entry.deliveredPerYear),
    // Who put the capital in, by name, for the "contribution" key.
    contributions: Object.fromEntries(Object.entries(entry.contributions ?? {})
      .map(([k, v]) => [str(k), pos(v)]).filter(([k, v]) => k && v > 0)),
    status: lower(entry.status) === "wound-up" ? "wound-up" : "active",
    log: (Array.isArray(entry.log) ? entry.log : []).filter((l) => l && typeof l === "object")
      .map((l) => ({ date: str(l.date), op: str(l.op), amount: finite(l.amount), note: str(l.note) })).slice(-30),
  };
};

export const normalizeTreasuries = (list) => (Array.isArray(list) ? list : [])
  .map(normalizeTreasury).filter(Boolean);

const find = (list, name) => {
  const key = lower(name);
  return key ? list.find((t) => lower(t.body) === key) ?? null : null;
};

// ---- the levers ----------------------------------------------------------------
//
//   {op:"open",       body, parent, margin, retain, key}
//   {op:"capitalise", body, amount, from}          // SY into its capital
//   {op:"margin",     body, margin, note}          // what its operations show
//   {op:"key",        body, key, retain}
//   {op:"windUp",     body}
//
// A body must exist in world.organizations before it can hold a purse: a purse
// with no body behind it is exactly the thing this module exists to prevent.

export const applyTreasuryOps = (treasuries, ops, { date = "", organizations = [] } = {}) => {
  let list = normalizeTreasuries(treasuries);
  const known = new Set((Array.isArray(organizations) ? organizations : [])
    .filter((o) => o && o.status !== "dissolved").map((o) => lower(o.name)));
  const refusals = [];

  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = lower(raw.op);
    const body = str(raw.body ?? raw.name);
    if (!body) { refusals.push(`treasuryOps ${op || "?"} refused: no body named.`); continue; }
    if (known.size && !known.has(lower(body))) {
      refusals.push(`treasuryOps ${op} refused: "${body}" is not a body this world holds — found it with organizationOps first, then give it a purse.`);
      continue;
    }
    const at = find(list, body);
    const entry = { date, op, amount: pos(raw.amount), note: str(raw.note) };

    if (op === "open") {
      if (at) { refusals.push(`treasuryOps open refused: "${body}" already has a purse.`); continue; }
      const parent = str(raw.parent);
      if (parent && known.size && !known.has(lower(parent))) {
        refusals.push(`treasuryOps open refused: parent "${parent}" is not a body this world holds.`);
        continue;
      }
      list = [...list, normalizeTreasury({ ...raw, body, parent, capital: 0, treasury: 0, log: [entry] })];
      continue;
    }
    if (!at) { refusals.push(`treasuryOps ${op} refused: "${body}" has no purse — open one first.`); continue; }
    if (at.status === "wound-up" && op !== "windUp") { refusals.push(`treasuryOps ${op} refused: "${body}" is wound up.`); continue; }

    if (op === "capitalise") {
      if (!(entry.amount > 0)) { refusals.push(`treasuryOps capitalise refused on "${body}": amount must be above zero.`); continue; }
      const from = str(raw.from);
      list = list.map((t) => (t === at ? {
        ...t,
        capital: t.capital + entry.amount,
        contributions: from ? { ...t.contributions, [from]: (t.contributions[from] ?? 0) + entry.amount } : t.contributions,
        log: [...t.log, entry].slice(-30),
      } : t));
    } else if (op === "margin") {
      const margin = clamp(finite(raw.margin, at.margin), 0, MAX_MARGIN);
      if (finite(raw.margin, -1) > MAX_MARGIN) refusals.push(`treasuryOps margin on "${body}" capped at ${Math.round(MAX_MARGIN * 100)}%: a body cannot show a return its operations have not earned.`);
      list = list.map((t) => (t === at ? { ...t, margin, log: [...t.log, { ...entry, amount: margin }].slice(-30) } : t));
    } else if (op === "key") {
      list = list.map((t) => (t === at ? {
        ...t,
        key: DISTRIBUTION_KEYS.includes(lower(raw.key)) ? lower(raw.key) : t.key,
        retain: raw.retain === undefined ? t.retain : clamp(finite(raw.retain, t.retain), 0, 1),
        beneficiary: raw.beneficiary === undefined ? t.beneficiary : str(raw.beneficiary),
        beneficiaryShare: raw.beneficiaryShare === undefined ? t.beneficiaryShare : clamp(finite(raw.beneficiaryShare, t.beneficiaryShare), 0, 1),
        annualTarget: raw.annualTarget === undefined ? t.annualTarget : pos(raw.annualTarget),
        operatingBudget: raw.operatingBudget === undefined ? t.operatingBudget : pos(raw.operatingBudget),
        log: [...t.log, entry].slice(-30),
      } : t));
    } else if (op === "windUp") {
      list = list.map((t) => (t === at ? { ...t, status: "wound-up", log: [...t.log, entry].slice(-30) } : t));
    } else {
      refusals.push(`treasuryOps refused: unknown op "${op}".`);
    }
  }
  return { treasuries: list, refusals };
};

// ---- the step ------------------------------------------------------------------

const membersOf = (organizations, body) => {
  const org = (Array.isArray(organizations) ? organizations : []).find((o) => lower(o?.name) === lower(body));
  return (org?.members ?? []).map(str).filter(Boolean).filter((m) => lower(m) !== lower(body));
};

// Shares by key. Returns a name -> weight map summing to 1, or null when the
// key cannot be applied (nobody to pay).
const sharesFor = (treasury, members, economies) => {
  if (!members.length) return null;
  if (treasury.key === "contribution") {
    const total = members.reduce((s, m) => s + (treasury.contributions[m] ?? 0), 0);
    if (total > 0) return Object.fromEntries(members.map((m) => [m, (treasury.contributions[m] ?? 0) / total]));
    return Object.fromEntries(members.map((m) => [m, 1 / members.length]));
  }
  if (treasury.key === "need") {
    // More to the poorer, measured by the engine's own output per head rather
    // than by a proxy invented here. A member with no economy of its own —
    // another body, a pole with no countries in it yet — counts at the median,
    // so the key neither favours nor punishes what it cannot measure.
    const perHead = members.map((m) => {
      const e = economies?.[m];
      if (!e) return 0;
      try {
        return pos(economyIndicators(normalizeEconomy(e)).outputPerCapita);
      } catch {
        return 0;
      }
    });
    const seen = perHead.filter((v) => v > 0);
    const median = seen.length ? seen.slice().sort((a, b) => a - b)[Math.floor(seen.length / 2)] : 1;
    const weights = perHead.map((v) => 1 / Math.max(0.01, v > 0 ? v : median));
    const total = weights.reduce((s, w) => s + w, 0);
    return Object.fromEntries(members.map((m, i) => [m, weights[i] / total]));
  }
  return Object.fromEntries(members.map((m) => [m, 1 / members.length]));
};

/**
 * One period of every purse: each body earns on its capital at its own margin,
 * keeps its retained share, and hands the rest to its members — a member that
 * is itself a body receives into its purse, a member that is a polity receives
 * into its treasury. Parents are stepped before children so money handed down
 * can be handed on in the same period.
 *
 * Returns new treasuries, new economies, and the record rows for what moved.
 */
export const stepTreasuries = (treasuries, { organizations = [], economies = {}, years = 0, date = "" } = {}) => {
  const list = normalizeTreasuries(treasuries);
  const span = Math.max(0, finite(years, 0));
  if (!list.length || span <= 0) return { treasuries: list, economies: economies ?? {}, rows: [] };

  // Parents first: depth by how many purses sit above each body.
  const depth = (t, seen = new Set()) => {
    if (!t.parent || seen.has(lower(t.body))) return 0;
    seen.add(lower(t.body));
    const up = find(list, t.parent);
    return up ? 1 + depth(up, seen) : 0;
  };
  const order = [...list].sort((a, b) => depth(a) - depth(b));

  const purses = new Map(list.map((t) => [lower(t.body), { ...t }]));
  const nextEconomies = { ...(economies ?? {}) };
  const rows = [];
  // What each polity was paid by bodies this period, so it can be written back
  // as an annual rate of income rather than as cash that appeared from nowhere.
  const paidToPolities = {};

  for (const original of order) {
    const t = purses.get(lower(original.body));
    if (!t || t.status !== "active") continue;

    // A body invests in the same world its federation does. So one that holds
    // capital but has never shown a rate of its own earns at its parent's rate
    // rather than at nothing: a chapter endowed with fifty million that returns
    // zero is not endowed, it is warehousing money. The rate is inherited only
    // for the period's earning — it is not written into the body, because the
    // body has still shown nothing, and the day its parent's rate changes, its
    // own follows.
    const rate = t.margin > 0 ? t.margin : clamp(finite(find(list, t.parent)?.margin, 0), 0, MAX_MARGIN);
    // Capital standing behind an unfunded promise earns for the people it was
    // promised to, not for the body holding it (runtime/liabilities.js). So only
    // the free part reaches the purse. Charging it at the payout stage instead
    // let a body that never distributes — a chapter retaining everything —
    // shoulder a pension scheme for nothing and spend the proceeds on crowds.
    const free = Math.max(0, t.capital - pos(t.assumedLiabilities));
    const earned = free * rate * span;
    if (earned > 0) {
      t.treasury += earned;
      rows.push({ date, polity: t.body, kind: "money", what: "return on its placed capital", amount: earned, unit: "SY", source: `placement:${Math.round(rate * 1000) / 10}% on capital${t.margin > 0 ? "" : `, the rate of ${t.parent}`}` });
    }
    const serviced = pos(t.assumedLiabilities) * rate * span;
    if (serviced > 0) {
      rows.push({ date, polity: t.body, kind: "standing", what: "its assumed promise consumed what that capital earned", amount: -serviced, unit: "SY", source: "liability:serviced" });
    }

    // Running costs first. Each member that has a standing budget is kept open
    // for the period before anything is shared out — a federation that shares
    // a surplus while its chapters cannot pay their staff has its order of
    // business backwards. What is paid is consumed, not banked.
    for (const child of membersOf(organizations, t.body)) {
      const purse = purses.get(lower(child));
      if (!purse || purse.status !== "active" || !(purse.operatingBudget > 0)) continue;
      const owed = purse.operatingBudget * span;
      const paid = Math.min(owed, t.treasury);
      if (!(paid > 0)) continue;
      t.treasury -= paid;
      // The money reaches the chapter and is its to spend: it funds the year's
      // ordinary work — the national gatherings it holds without anyone in
      // Rome convoking them (runtime/gatherings.js runNationalProgramme).
      purse.treasury += paid;
      purse.fundedUntil = paid + 1e-9 >= owed ? date : purse.fundedUntil;
      rows.push({ date, polity: child, kind: "money", what: "running costs met", amount: paid, unit: "SY", source: `budget:${t.body}` });
      rows.push({ date, polity: t.body, kind: "money", what: `kept ${child} open`, amount: -paid, unit: "SY", source: "budget" });
      if (paid + 1e-9 < owed) {
        rows.push({ date, polity: child, kind: "standing", what: "short of its running costs", amount: -(owed - paid), unit: "SY", source: "budget:shortfall" });
      }
    }

    // Capital standing behind somebody else's unfunded promise is not free
    // (runtime/liabilities.js). What that share of the capital earns is what
    // services the promise, so it cannot ALSO be handed to the members: a
    // federation that takes a pension hole onto its books and keeps paying out
    // as before has simply moved the hole, which is the trick the ring-fence
    // exists to hide. So the committed share of the purse stays in the purse,
    // and the player sees exactly what assuming the promise costs them.
    // The promise is already paid for above, out of what its capital earns, so
    // the purse itself is handed on whole. Charging it twice — once on the
    // earning and again on the payout — made a body pay a pension scheme
    // roughly twice over, which is its own kind of dishonest figure.
    // The campaign fund comes off the top. What a body keeps to do its own work
    // is not a share of what passes through it — it is a sum it must have in
    // hand — and only what sits ABOVE that sum is anyone else's.
    const spare = Math.max(0, t.treasury - t.reserve);
    const payout = spare * (1 - t.retain);
    if (!(payout > 0)) continue;
    const members = membersOf(organizations, t.body);

    // The body it exists to finance is paid first, out of what is handed on;
    // only the remainder is shared among the others by the key.
    const shares = {};
    let toBeneficiary = 0;
    if (t.beneficiary && t.beneficiaryShare > 0) {
      toBeneficiary = payout * t.beneficiaryShare;
      shares[t.beneficiary] = toBeneficiary / payout;
    }
    const rest = members.filter((m) => lower(m) !== lower(t.beneficiary));
    const restShares = sharesFor(t, rest, nextEconomies);
    const restWeight = 1 - (toBeneficiary / payout);
    if (restShares && restWeight > 0) {
      for (const [m, w] of Object.entries(restShares)) shares[m] = (shares[m] ?? 0) + w * restWeight;
    } else if (!Object.keys(shares).length) {
      continue; // nobody to pay: the money stays in the purse
    }

    let handed = 0;
    for (const [member, weight] of Object.entries(shares)) {
      const amount = payout * weight;
      if (!(amount > 0)) continue;
      const childPurse = purses.get(lower(member));
      if (childPurse && childPurse.status === "active") {
        childPurse.treasury += amount;
        handed += amount;
        rows.push({ date, polity: member, kind: "money", what: `received from ${t.body}`, amount, unit: "SY", source: `federation:${t.key}` });
      } else if (nextEconomies[member]) {
        nextEconomies[member] = { ...nextEconomies[member], treasury: finite(nextEconomies[member].treasury, 0) + amount };
        // Also counted as income, not only as cash. Landing it in the treasury
        // alone left the polity's BALANCE untouched, so the largest inflow of a
        // campaign was invisible on the page that reports the year.
        paidToPolities[member] = (paidToPolities[member] ?? 0) + amount;
        handed += amount;
        rows.push({ date, polity: member, kind: "money", what: `received from ${t.body}`, amount, unit: "SY", source: `federation:${t.key}` });
      }
      // A member the world holds nothing for receives nothing: the money stays
      // in the purse rather than vanishing into a name.
    }
    // What the beneficiary actually got, at an annual rate, so the purpose can
    // be read against the delivery rather than against the story.
    if (t.beneficiary) {
      const got = payout * (shares[t.beneficiary] ?? 0);
      t.deliveredPerYear = span > 0 ? got / span : 0;
    }
    if (handed > 0) {
      t.treasury -= handed;
      rows.push({ date, polity: t.body, kind: "money", what: `distributed to ${Object.keys(shares).length} members`, amount: -handed, unit: "SY", source: `federation:${t.key}` });
    }
  }

  // The period's payments, written back as the annual rate they represent. A
  // polity that stopped being paid this period drops to zero rather than
  // carrying last year's figure forever — the run-rate is what is happening
  // now, not what once happened.
  for (const name of Object.keys(nextEconomies)) {
    const rate = (paidToPolities[name] ?? 0) / span;
    if (rate === finite(nextEconomies[name]?.bodyTransfers, 0)) continue;
    nextEconomies[name] = { ...nextEconomies[name], bodyTransfers: rate };
  }

  return { treasuries: [...purses.values()], economies: nextEconomies, rows };
};

// ---- money the player moves between bodies -----------------------------------
//
// Same lesson as the drives and the gatherings: a rule asking the model to
// carry treasuryOps did not make it carry them. An order read "doter Pax
// Africa de 30 000 SY prélevés sur le capital de la holding" and the turn
// narrated a disbursement that moved nothing. So the engine reads the order.

const ENDOWS = /\b(dote\w*|doter|dotation de|capitalis\w*|capitaliser|abonde\w*|endow\w*|fund\w*|inject\w*|transf[èe]re\w*|verser [àa])\b/i;
const PLACES_OWN = /\b(plac\w*[^.]{0,40}(capital|productif)|capital productif|invest\w*[^.]{0,30}(tr[ée]sorerie|liquidit)|tr[ée]sorerie[^.]{0,30}capital)\b/i;
const SY_AMOUNT = /(\d{1,3}(?:[  .,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:sy\b|subsistence)/i;
// A standing allowance to keep a chapter open between its great gatherings,
// as opposed to a one-off endowment of capital.
const RUNNING_BUDGET = /\b(budget de (?:base|fonctionnement)|budget annuel|dotation annuelle|frais de fonctionnement|running (?:costs?|budget)|operating budget|standing budget|annual budget|de quoi (?:fonctionner|tourner))\b/i;

/**
 * Capital an order moves into a body: from the body it sits within, or from
 * the player, in the engine's own unit. Returns the ops the levers need, plus
 * the rows for the record. Nothing moves without a figure and a named body.
 */
export const treasuryMovesFromOrder = (order, { player = "", treasuries = [], date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  const purses = normalizeTreasuries(treasuries);
  const named = purses.filter((t) => text.toLowerCase().includes(lower(t.body)));
  const moves = [];

  // "Place your cash in productive capital": every body the order names, or
  // every body when it names none, turns its idle treasury into capital.
  if (PLACES_OWN.test(text)) {
    for (const t of (named.length ? named : purses)) {
      if (t.treasury > 0) moves.push({ kind: "place", body: t.body, amount: t.treasury, date });
    }
  }

  // "Give each pole a standing budget of N SY a year": the running costs their
  // parent will meet before anything is shared, so a chapter can keep its
  // doors open between the great gatherings.
  const budget = text.match(SY_AMOUNT);
  if (RUNNING_BUDGET.test(text) && budget) {
    const sy = pos(Number(budget[1].replace(/[  .,]/g, "")));
    const targets = named.length ? named : purses.filter((t) => t.parent);
    for (const t of targets) if (sy > 0) moves.push({ kind: "budget", body: t.body, amount: sy, date });
    if (moves.length) return moves;
  }

  // "Endow X with N SY, taken from Y": capital out of the parent's purse, or
  // the player's patrimony, into the named body.
  const amount = text.match(SY_AMOUNT);
  if (ENDOWS.test(text) && amount && named.length) {
    const sy = pos(Number(amount[1].replace(/[  .,]/g, "")));
    // The body being endowed is the one that is NOT the source: when two are
    // named, the one that sits inside the other receives.
    const target = named.find((t) => t.parent && named.some((o) => lower(o.body) === lower(t.parent))) ?? named[0];
    const source = named.find((t) => lower(t.body) !== lower(target.body)) ?? purses.find((t) => lower(t.body) === lower(target.parent)) ?? null;
    if (sy > 0) moves.push({ kind: "endow", body: target.body, from: source ? source.body : player, amount: sy, date });
  }
  return moves;
};

/** Applies those moves to the purses and the player's patrimony. */
export const applyTreasuryMoves = (world, moves, { player = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const purses = normalizeTreasuries(w.treasuries);
  const economies = { ...(w.economies ?? {}) };
  const rows = [];
  const refusals = [];
  const at = (name) => purses.findIndex((t) => lower(t.body) === lower(name));

  for (const move of Array.isArray(moves) ? moves : []) {
    const i = at(move.body);
    if (i < 0) { refusals.push(`${move.kind} refused: "${move.body}" has no purse.`); continue; }
    if (move.kind === "place") {
      const sum = Math.min(purses[i].treasury, move.amount);
      if (!(sum > 0)) continue;
      purses[i] = { ...purses[i], treasury: purses[i].treasury - sum, capital: purses[i].capital + sum };
      rows.push({ date: move.date, polity: move.body, kind: "patrimony", what: "cash placed as capital", amount: sum, unit: "SY", source: "order:placement" });
      continue;
    }
    // Endowment: it has to come from somewhere that actually holds it.
    const j = at(move.from);
    // Capital standing behind an unfunded promise is not the giver's to give
    // (runtime/liabilities.js). Without this a player could ring-fence a pension
    // hole onto a body one turn and strip that body's capital the next, leaving
    // the promise backed by nothing — which is the exact trick the ring-fence
    // exists to prevent, performed in two moves instead of one.
    const pledged = j >= 0 ? pos(purses[j].assumedLiabilities) : 0;
    const available = j >= 0 ? Math.max(0, purses[j].capital - pledged) : pos(economies[move.from]?.endowment);
    const sum = Math.min(move.amount, available);
    if (!(sum > 0)) {
      refusals.push(pledged > 0
        ? `endowment refused: ${move.from} holds ${fmt(purses[j].capital)} SY but all of it stands behind the ${fmt(pledged)} SY of promises it assumed. Free the promise first, or raise new capital.`
        : `endowment refused: ${move.from || player} holds nothing to give "${move.body}".`);
      continue;
    }
    if (sum < move.amount) {
      refusals.push(pledged > 0
        ? `endowment to "${move.body}" cut to ${fmt(sum)} SY: ${move.from} holds ${fmt(purses[j].capital)} SY, but ${fmt(pledged)} SY of it stands behind promises it assumed and cannot leave.`
        : `endowment to "${move.body}" cut to ${fmt(sum)} SY: ${move.from} holds no more.`);
    }
    if (j >= 0) purses[j] = { ...purses[j], capital: purses[j].capital - sum };
    else if (economies[move.from]) economies[move.from] = { ...economies[move.from], endowment: pos(economies[move.from].endowment) - sum };
    purses[i] = { ...purses[i], capital: purses[i].capital + sum, contributions: { ...purses[i].contributions, [move.from]: (purses[i].contributions[move.from] ?? 0) + sum } };
    rows.push({ date: move.date, polity: move.from, kind: "patrimony", what: `endowed ${move.body}`, amount: -sum, unit: "SY", source: "order:endowment" });
    rows.push({ date: move.date, polity: move.body, kind: "patrimony", what: `endowed by ${move.from}`, amount: sum, unit: "SY", source: "order:endowment" });
  }

  return rows.length ? { world: { ...w, treasuries: purses, economies }, rows, refusals } : { world, rows: [], refusals };
};

/** Reads every queued order and moves what they say to move. */
export const ensureTreasuryMovesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const moves = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")
    .flatMap((order) => treasuryMovesFromOrder(order, { player, treasuries: w.treasuries, date }));
  return applyTreasuryMoves(w, moves, { player });
};

const fmt = (n) => Math.round(n).toLocaleString("en-US");

/** What the model and the player read: every purse, what it holds and hands on. */
export const describeTreasuries = (treasuries, { organizations = [] } = {}) => {
  const list = normalizeTreasuries(treasuries).filter((t) => t.status === "active");
  if (!list.length) return "";
  const lines = ["[Bodies With a Purse — engine state]"];
  for (const t of list) {
    const members = membersOf(organizations, t.body);
    lines.push(
      `- ${t.body}${t.parent ? ` (within ${t.parent})` : ""}: capital ${fmt(t.capital)} SY placed at ${Math.round(t.margin * 1000) / 10}% a year`
      + (t.earnedMargin > 0 ? `, and its gatherings returned a further ${Math.round(t.earnedMargin * 1000) / 10}% of that capital a year (already banked, never paid twice)` : "")
      + `; ${fmt(t.treasury)} SY in hand`
      + (t.reserve > 0 ? `, of which ${fmt(t.reserve)} SY is its own campaign fund and is never handed on` : "")
      + `; keeps ${Math.round(t.retain * 100)}%${t.reserve > 0 ? " of what is above that" : ""} for working capital and investment, hands the rest`
      + (t.beneficiary && t.beneficiaryShare > 0
        ? ` — ${Math.round(t.beneficiaryShare * 100)}% of it to ${t.beneficiary}, which it exists to finance, and the remainder to the other ${Math.max(0, members.length - 1)} member${members.length === 2 ? "" : "s"} by ${t.key}.`
        : ` to ${members.length} member${members.length === 1 ? "" : "s"} by ${t.key}.`)
      + (t.annualTarget > 0
        ? ` It was founded to deliver ${fmt(t.annualTarget)} SY a year to ${t.beneficiary || "its beneficiary"}; it is delivering ${fmt(t.deliveredPerYear)}${t.deliveredPerYear + 0.005 * t.annualTarget < t.annualTarget
          ? `, short by ${fmt(t.annualTarget - t.deliveredPerYear)} a year. Closing that gap needs more capital in the purse, or operations that actually earn more than a placement — say which, and what it would take.`
          : ` — the purpose is met.`}`
        : ""),
    );
  }
  lines.push("", TREASURY_RULES);
  return lines.join("\n");
};

export const TREASURY_RULES = [
  "A body's money is its own, and moves only through impacts.treasuryOps: {op:\"open\"|\"capitalise\"|\"margin\"|\"key\"|\"windUp\", body, parent, amount, from, margin, retain, key}. The body must already exist in the world's organizations — found it with organizationOps first.",
  "Capital arrives only from somewhere real: a drive collected for it, a member's payment, a state endowing it. Say where with `from`, so the engine can tell who is carrying the undertaking.",
  "A body has two ways to earn, and they are never the same money. `margin` is the return on capital it has PLACED — a placement, capped, and it earns nothing on capital it does not hold. What its GATHERINGS take is paid into its purse the day each one is held, once; the engine reports that as its earned return so a prospectus can be checked against real crowds, but it is never paid a second time as a yield.",
  "A body founded to finance somebody says so: `beneficiary` names it and `beneficiaryShare` is the share of what is handed on that goes there first, before anything is shared among the others. A sovereign fund paying its state's budget, a company remitting to its crown, a federation financing the church that created it — all of them set this rather than trusting a story to send the money home.",
  "`retain` is what the body keeps for working capital and investment, and nothing else: a body that retains most of what it earns while claiming to finance someone is not financing them, and the figures say so.",
  "`reserve` is a SUM, not a share: the campaign fund a body must have in hand to do its own work — hold its own year of gatherings, keep its staff — before anything at all is handed on. Set it to what that work actually costs in a year. A chapter with a reserve and no retained share is exactly a body that funds itself and sends every penny above that upward, which is what a federation of self-governing chapters looks like.",
  "Each period the engine makes every purse earn, keeps the retained share and pays the rest — the beneficiary first, then the members — a member that is itself a body receives into its own purse, so a federation of continental bodies hands money down through its levels. Never narrate a distribution: set the key and let the step do it, then report what it did.",
  "A body with a purse also has a voice: it speaks for itself in correspondence and in the world's events, defends its own budget, and can refuse what its members will not fund.",
].join("\n");
