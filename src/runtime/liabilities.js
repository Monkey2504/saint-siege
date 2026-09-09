/*! Open Historia — unfunded promises: covering, ring-fencing, repricing © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A state can owe what no lender ever priced: pensions promised to people who
// have not retired, arrears, guarantees. The engine has carried that as
// `unfundedLiabilities` from the start, and it bites — it raises the borrowing
// rate, eats the fiscal room, and subtracts from the patrimony to give the net.
//
// What it had no way to do was CHANGE. A player ordered a pension reform four
// separate ways over two hours; the editions narrated a ring-fencing calendar
// ratified by the Council for the Economy, and the figure stood at 411,339 SY
// from the first turn to the last. Same lesson as the drives, the gatherings and
// the treasury moves, for the fourth time: a rule asking the model to carry a
// lever does not make it carry the lever. So the engine reads the order.
//
// Three things can honestly be done to an unfunded promise, and no more:
//
//   cover     put real capital behind it. The promise stands, but it is funded:
//             what is set aside leaves the patrimony and the unfunded figure
//             falls by the same amount. Nothing is created.
//
//   assign    move it to a body that will carry it — a pension trust, a
//             sovereign fund, a bad bank. This is where a plan usually cheats:
//             a liability does not shrink by changing whose balance sheet it
//             sits on. So it moves only as far as that body's capital can
//             actually back it, and the rest stays exactly where it was, with
//             the engine saying so.
//
//   reprice   change the terms — a later retirement age, a weaker indexation.
//             This genuinely lowers the present value, and it is the only one of
//             the three that destroys an obligation rather than moving it. It is
//             therefore bounded, and it is paid for in legitimacy: the people
//             whose terms just changed notice.
//
// General by construction: a republic funding its civil-service pensions, a
// company carrying a closed scheme, a crown guaranteeing a bank. All of them are
// a promise, a fund that may or may not back it, and terms that can be rewritten
// at a political price.

import { normalizeTreasuries } from "./treasuries.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pos = (v, d = 0) => Math.max(0, finite(v, d));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Rewriting the terms of a promise is real, and it is not unlimited. Actuarial
// reforms of this kind — two years on the age, indexation cut to prices — move
// the present value by something like a sixth. A plan claiming a third is
// claiming to have abolished a fifth of what it owes by arithmetic alone.
export const MAX_REPRICE_SHARE = 0.2;

// What rewriting the terms costs in standing, at the full cut. The people whose
// pension just got smaller are constituents, and in this engine legitimacy is
// what a state spends when it takes something back.
export const REPRICE_LEGITIMACY_COST = 6;

// ---- reading the order -------------------------------------------------------

const COVERS = /\b(provisionn\w*|couvrir|couvre\w*|adosse\w*|financer? (?:le|la|les) (?:passif|dette actuarielle|retraites?|engagements?)|mettre de côté|set aside|fund (?:the )?(?:pension|liabilit|obligation)\w*|pre-?fund\w*|capitalis\w* (?:le|la) (?:passif|retraite))/i;
const ASSIGNS = /\b(cantonne\w*|cantonnement|sortir (?:le|la|ce) (?:passif|dette)|transf[èe]r\w*[^.]{0,60}(?:passif|dette actuarielle|retraites?|engagements?)|ring[- ]?fenc\w*|bad bank|fonds? (?:fiduciaire|de cantonnement|dédiée?s? aux retraites)|sovereign trust|pension (?:trust|fund))/i;
const REPRICES = /\b(âge (?:légal )?(?:de )?(?:départ|de la retraite)|relever l'âge|retirement age|paramètres? actuariel\w*|actuarial (?:parameters?|assumptions?)|indice de revalorisation|revalorisation des pensions|indexation|désindex\w*|réviser? les (?:conditions|paramètres)|prestations définies[^.]{0,60}cotisations définies|defined[- ]benefit[^.]{0,60}defined[- ]contribution)/i;

const SY_AMOUNT = /(\d{1,3}(?:[  .,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:sy\b|subsistence)/i;

// A share the order itself claims — "le passif baisse de 15 à 20 %". When the
// order names a range the engine takes the LOW end: a plan's own optimistic
// bound is not evidence.
//
// The percentage has to be ABOUT the liability. Field report: the first version
// read the plan's line "réduit le nombre de bénéficiaires dépendant à 100 % de
// la caisse vaticane", clipped "100" to two digits, and repriced the pension
// debt by 0%. So the sentence must also say that a value falls, and the number
// is read whole.
const PERCENT = /\b(\d{1,3}(?:[.,]\d+)?)\s*(?:%|pour ?cent|per ?cent)|\b(\d{1,3}(?:[.,]\d+)?)\s*(?:à|a|-|to)\s*(\d{1,3}(?:[.,]\d+)?)\s*(?:%|pour ?cent|per ?cent)/;
const FALLS = /\b(baisse|baisser|réduit|reduit|réduire|diminu\w*|abaiss\w*|allège\w*|allege\w*|falls?|drops?|lowers?|reduc\w*|cut\w*)\b/i;
const OF_THE_DEBT = /\b(passif|dette|valeur actuelle|engagements?|obligations?|liabilit\w*|present value|actuariel\w*|actuarial)\b/i;

// The sentences of a text, so a figure can be required to sit beside the thing
// it is supposed to describe rather than anywhere on the page.
const sentences = (text) => str(text).split(/(?<=[.!?;:])\s+|\n+/).filter(Boolean);

// The share an order claims off the liability, or null when it claims none.
const claimedShare = (text) => {
  for (const sentence of sentences(text)) {
    if (!FALLS.test(sentence) || !OF_THE_DEBT.test(sentence)) continue;
    const hit = sentence.match(PERCENT);
    if (!hit) continue;
    // A range gives its low end; a single figure is taken as written.
    const share = (hit[2] ? num(hit[2]) : num(hit[1])) / 100;
    if (share > 0) return share;
  }
  return null;
};

// An order writes a body's name the way a person would: "la holding une seule
// église", not "Une Seule Église, Une Seule Solidarité". So a body answers to
// its name, and to the head of it before any comma or dash, when that head is
// long enough to mean only one body.
const namesBody = (text, body) => {
  const haystack = lower(text);
  const full = lower(body);
  if (!full) return false;
  if (haystack.includes(full)) return true;
  const head = full.split(/\s*[,—–-]\s*/)[0];
  return head.length >= 8 && haystack.includes(head);
};

const num = (raw) => pos(Number(String(raw).replace(/[  ]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".")));

/**
 * What an order does to the player's unfunded promises. Nothing moves without
 * the engine finding the thing it acts on: an amount, a body, or terms.
 */
export const liabilityMovesFromOrder = (order, { player = "", economies = {}, treasuries = [], date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  if (!text) return [];
  const owed = pos(economies?.[player]?.unfundedLiabilities);
  if (!(owed > 0)) return [];

  const purses = normalizeTreasuries(treasuries);
  const named = purses.filter((t) => namesBody(text, t.body));
  const moves = [];

  // Order matters, and it is not the order the sentences happen to appear in.
  // Rewriting the terms shrinks the OBLIGATION, so it comes first: do it after
  // ring-fencing and it only touches the rump the state still holds, while the
  // part already shouldered by a trust keeps its old, larger terms — the same
  // reform worth less for having been written in a different paragraph.
  if (REPRICES.test(text)) {
    // Silence gets the engine's own modest number rather than the order's
    // ambition; a claim about the liability gets its own figure, capped.
    const share = claimedShare(text) ?? (MAX_REPRICE_SHARE / 2);
    moves.push({ kind: "reprice", share: clamp(share, 0, MAX_REPRICE_SHARE), date });
  }

  // "Cover 200 000 SY of the pension liability." A figure is required: covering
  // a promise is spending, and spending without a number is a wish.
  const amount = text.match(SY_AMOUNT);
  if (COVERS.test(text) && amount) {
    moves.push({ kind: "cover", amount: Math.min(owed, num(amount[1])), from: named[0]?.body ?? "", date });
  }

  // "Ring-fence the liability in a dedicated trust, backed by the holding."
  // No figure needed: what moves is decided by what the body can actually back.
  if (ASSIGNS.test(text) && named.length) {
    // The body that will carry it is the one the order names; when it names the
    // federation and a chapter, the one holding the most capital carries it.
    const carrier = [...named].sort((a, b) => b.capital - a.capital)[0];
    // A figure lets the player ring-fence PART of it. Without one the carrier
    // takes as much as its free capital can stand behind, which is the whole
    // promise when it is rich enough — and that is rarely what a player wants,
    // because committed capital stops paying out. Ordering a share is the
    // difference between a plan and a lurch.
    const capped = text.match(SY_AMOUNT);
    moves.push({ kind: "assign", body: carrier.body, ...(capped ? { amount: Math.min(owed, num(capped[1])) } : {}), date });
  }

  return moves;
};

/**
 * Applies the moves to the world. Returns the new world, the record rows for
 * what actually shifted, and the refusals a player needs to read.
 */
export const applyLiabilityMoves = (world, moves, { player = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const economies = { ...(w.economies ?? {}) };
  const economy = economies[player];
  const rows = [];
  const refusals = [];
  if (!economy) return { world: w, rows, refusals: [`liabilities: no polity named "${player}".`] };

  let purses = normalizeTreasuries(w.treasuries).map((t) => ({ ...t }));
  let owed = pos(economy.unfundedLiabilities);
  let endowment = pos(economy.endowment);
  let legitimacy = finite(economy.legitimacy, 50);

  for (const move of Array.isArray(moves) ? moves : []) {
    if (!(owed > 0)) { refusals.push("liabilities: nothing is unfunded, so there is nothing to act on."); continue; }
    const date = str(move?.date);

    if (move.kind === "cover") {
      // Set aside from a body's capital if the order named one, otherwise from
      // the state's own patrimony. Either way it LEAVES: a promise is funded by
      // real assets or it is not funded.
      const want = Math.min(owed, pos(move.amount));
      if (!(want > 0)) continue;
      const i = purses.findIndex((t) => lower(t.body) === lower(move.from));
      const available = i >= 0 ? purses[i].capital : endowment;
      const set = Math.min(want, available);
      if (!(set > 0)) {
        refusals.push(`liabilities cover refused: ${i >= 0 ? purses[i].body : player} holds nothing to set aside.`);
        continue;
      }
      if (set + 1e-9 < want) refusals.push(`liabilities cover cut to ${fmt(set)} SY: that is all ${i >= 0 ? purses[i].body : player} holds.`);
      if (i >= 0) purses[i] = { ...purses[i], capital: purses[i].capital - set };
      else endowment -= set;
      owed -= set;
      rows.push({ date, polity: i >= 0 ? purses[i].body : player, kind: "patrimony", what: "capital set aside against an unfunded promise", amount: -set, unit: "SY", source: "liability:cover" });
      rows.push({ date, polity: player, kind: "patrimony", what: "unfunded promises covered", amount: -set, unit: "SY", source: `liability:cover${i >= 0 ? `:${purses[i].body}` : ""}` });
      continue;
    }

    if (move.kind === "assign") {
      // The honest half of a ring-fence. A liability does not shrink because it
      // changed balance sheet: it moves only as far as the carrier's capital can
      // stand behind it. Field report: a plan declared a 664 M$ hole gone by
      // transferring it to a holding — the holding's capital was already
      // promised elsewhere, and the hole was exactly as large the next morning.
      const i = purses.findIndex((t) => lower(t.body) === lower(move.body));
      if (i < 0) { refusals.push(`liabilities assign refused: no body named "${str(move.body)}" has a purse.`); continue; }
      const carrier = purses[i];
      const free = Math.max(0, carrier.capital - pos(carrier.assumedLiabilities));
      // As much as the order asked for, and never more than the capital behind it.
      const wanted = move.amount == null ? owed : Math.min(owed, pos(move.amount));
      const moved = Math.min(wanted, free);
      if (!(moved > 0)) {
        refusals.push(`liabilities assign refused: ${carrier.body} has no capital free to stand behind the promise, so moving it there would change the letterhead and nothing else.`);
        continue;
      }
      const left = owed - moved;
      purses[i] = { ...carrier, assumedLiabilities: pos(carrier.assumedLiabilities) + moved };
      owed = left;
      rows.push({ date, polity: carrier.body, kind: "patrimony", what: `assumed an unfunded promise from ${player}`, amount: moved, unit: "SY", source: "liability:assign" });
      rows.push({ date, polity: player, kind: "patrimony", what: `unfunded promises carried by ${carrier.body}`, amount: -moved, unit: "SY", source: "liability:assign" });
      // Say WHY the rest stayed: an order that asked for part of it got what it
      // asked for, which is not the same as being refused for want of capital.
      if (left > 1e-9 && moved + 1e-9 >= wanted) {
        refusals.push(`liabilities assign: ${fmt(moved)} SY of the promise now sits with ${carrier.body}, as ordered; ${fmt(left)} SY stays with ${player}.`);
      } else if (left > 1e-9) {
        refusals.push(`liabilities assign: ${carrier.body} could stand behind ${fmt(moved)} SY of it; ${fmt(left)} SY stays with ${player}, because no capital backs that part.`);
      }
      continue;
    }

    if (move.kind === "reprice") {
      const share = clamp(finite(move.share, 0), 0, MAX_REPRICE_SHARE);
      if (!(share > 0)) continue;
      const cut = owed * share;
      owed -= cut;
      // The only one of the three that destroys an obligation, and the only one
      // with somebody on the other side of it.
      const cost = REPRICE_LEGITIMACY_COST * (share / MAX_REPRICE_SHARE);
      legitimacy = clamp(legitimacy - cost, 0, 100);
      rows.push({ date, polity: player, kind: "patrimony", what: `unfunded promises repriced by ${Math.round(share * 1000) / 10}%`, amount: -cut, unit: "SY", source: "liability:reprice" });
      rows.push({ date, polity: player, kind: "standing", what: "terms rewritten on people already promised", amount: -cost, unit: "pt", source: "liability:reprice" });
      continue;
    }

    refusals.push(`liabilities: unknown move "${str(move?.kind)}".`);
  }

  economies[player] = { ...economy, unfundedLiabilities: Math.max(0, owed), endowment: Math.max(0, endowment), legitimacy };
  return { world: { ...w, economies, treasuries: purses }, rows, refusals };
};

/** Every planned order, read for what it does to the player's promises. */
export const ensureLiabilityMovesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const moves = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned")
    .flatMap((order) => liabilityMovesFromOrder(order, { player, economies: w.economies, treasuries: w.treasuries, date }));
  if (!moves.length) return { world: w, rows: [], refusals: [] };
  return applyLiabilityMoves(w, moves, { player });
};

const fmt = (n) => Math.round(n).toLocaleString("en-US");

/** What the model and the player read about promises nobody has funded. */
export const describeLiabilities = (world, player) => {
  const w = world && typeof world === "object" ? world : {};
  const economy = w.economies?.[player];
  const owed = pos(economy?.unfundedLiabilities);
  const carried = normalizeTreasuries(w.treasuries).filter((t) => pos(t.assumedLiabilities) > 0);
  if (!(owed > 0) && !carried.length) return "";

  const lines = ["[Unfunded Promises — engine state]"];
  if (owed > 0) {
    lines.push(`- ${player} owes ${fmt(owed)} SY that nothing has been set aside for. It raises what ${player} pays to borrow, it eats the room to spend, and it is subtracted from the patrimony to give what ${player} is actually worth.`);
  } else {
    lines.push(`- ${player} owes nothing that is unfunded.`);
  }
  for (const t of carried) {
    const free = Math.max(0, t.capital - pos(t.assumedLiabilities));
    lines.push(`- ${t.body} carries ${fmt(t.assumedLiabilities)} SY of it, against ${fmt(t.capital)} SY of capital — ${fmt(free)} SY still free to stand behind more.`);
  }
  lines.push("", LIABILITY_RULES);
  return lines.join("\n");
};

export const LIABILITY_RULES = [
  "A promise nobody funded is state, not narration, and it moves only three ways. The engine reads the player's own order for them, so do not narrate a reduction it did not make — report what the figures did.",
  "COVER: capital is set aside against the promise. What is set aside LEAVES the patrimony or the body's capital, and the unfunded figure falls by exactly that. Nothing is created; a promise is funded by real assets or it is not funded.",
  "ASSIGN: the promise moves to a body that will carry it — a trust, a sovereign fund, a bad bank. It moves ONLY as far as that body's free capital can stand behind it, and the remainder stays where it was. A liability does not shrink because it changed letterhead, and an edition that says the hole has gone when the engine says it has not is wrong.",
  `REPRICE: the terms themselves change — a later age, a weaker indexation — and this is the only one that destroys an obligation rather than moving it. The engine caps it at ${Math.round(MAX_REPRICE_SHARE * 100)}% of the present value and charges legitimacy for it, because the people whose terms just changed are constituents and they notice.`,
  "So a plan that freezes a scheme, ring-fences the balance and rewrites the terms does all three, and the engine will show exactly how much each part was actually worth. Say which one an event is doing, and never claim a fourth.",
].join("\n");
