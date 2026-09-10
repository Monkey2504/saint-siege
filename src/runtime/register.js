/*! Open Historia — the register: every figure with its movement since the pontificate began © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A reform is judged by what it moved. The register therefore prints, beside
// each figure, where it stood when the game began and which way it has gone —
// computed from a baseline the world stores once, never from a narrated claim.
// The faithful are on it: for a Church, the count of the baptised is the first
// figure a pontificate is measured by.

import { economyIndicators } from "./economy.js";
import { totalFaithful } from "./churchFaithful.js";
import { frontFigures } from "./fronts.js";

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** The figures the register tracks, read from the engine's own state. */
export const registerFigures = (world, player) => {
  const economy = player ? world?.economies?.[player] : null;
  const i = economy ? economyIndicators(economy) : null;
  return {
    // The ledger keeps the baptised by continent; the register prints the sum.
    faithful: world?.church?.faithful ? num(totalFaithful(world.church.faithful)) : null,
    // What is actually in hand. "Do I have the money?" is this line and no
    // other: a patrimony is not cash, a pledge is not cash, and a story
    // saying a sum was credited moves nothing here unless an op moved it.
    treasury: i ? i.treasury : null,
    balance: i ? i.balance : null,
    yearsOfPatrimonyLeft: i ? num(i.yearsOfPatrimonyLeft) : null,
    endowment: i ? i.endowment : null,
    endowmentYield: i ? i.endowmentYield : null,
    transfers: i ? i.transfers : null,
    // What the bodies this polity belongs to actually pay it, per year. On its
    // own line rather than folded into donations: a player who builds a
    // federation to finance a state has to be able to read whether it does.
    bodyTransfers: economy ? num(economy.bodyTransfers) : null,
    taxRevenue: i ? i.taxRevenue : null,
    unfundedLiabilities: i ? i.unfundedLiabilities : null,
    legitimacy: economy ? num(economy.legitimacy) : null,
  };
};

/**
 * The baseline is set once — at the inauguration for a new game, at the first
 * reading for a game that predates the register — and never moved afterwards,
 * so every later comparison is against the same day. Returns the same world
 * when nothing had to change.
 */
export const ensureRegisterBaseline = (world, player, { date = "" } = {}) => {
  if (!world || typeof world !== "object") return world;
  const figures = registerFigures(world, player);
  const fronts = frontFigures(world, player);
  const empty = (o) => Object.values(o).every((v) => v == null);
  // A game already under way, from before the six fronts existed, has a
  // baseline for the money and none for the rest. It gets one, once, against
  // today — otherwise every front would read "flat" for ever in exactly the
  // games that most need to see them move.
  if (world.registerBaseline && typeof world.registerBaseline === "object") {
    if (world.registerBaseline.fronts || empty(fronts)) return world;
    return { ...world, registerBaseline: { ...world.registerBaseline, fronts } };
  }
  if (empty(figures) && empty(fronts)) return world;
  return { ...world, registerBaseline: { date: String(date || ""), figures, fronts } };
};

// Which way is good. Debt-like figures fall to improve; everything else rises.
const IMPROVES_WHEN_FALLING = new Set(["unfundedLiabilities"]);

/**
 * One row per figure: the current value, the baseline, the change and whether
 * that change is an improvement. `direction` is "up", "down" or "flat"; `good`
 * is true when the movement is the right way for that figure.
 */
export const registerRows = (world, player) => {
  const now = registerFigures(world, player);
  const base = world?.registerBaseline?.figures ?? null;
  return Object.entries(now).map(([key, value]) => {
    const from = base ? num(base[key]) : null;
    const delta = value != null && from != null ? value - from : null;
    const eps = Math.abs(from ?? 0) * 0.002;
    const direction = delta == null || Math.abs(delta) <= eps ? "flat" : delta > 0 ? "up" : "down";
    const good = direction === "flat" ? null : IMPROVES_WHEN_FALLING.has(key) ? direction === "down" : direction === "up";
    return { key, value, from, delta, direction, good };
  });
};
