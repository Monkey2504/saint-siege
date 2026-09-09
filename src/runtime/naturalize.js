/*! Open Historia — a polity becomes an actor the first time the world touches it © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A campaign was played in an empty world and nobody noticed for fifty turns.
//
// Field report, measured on a real save: the world held seven actors and all
// seven were the player's own internal factions. Italy, Germany, Brazil and the
// United States had no economy, no stat sheet and no standing intent — they were
// polygons on a map. So no country could scheme against the player, because a
// scheme needs an owner the engine knows; no country could pay or refuse to pay,
// because every money lever refuses a polity absent from `economies`; the
// reality check's opposition and vote tests only ever saw the six church
// currents; and a letter to Berlin was answered by a voice with no state behind
// it, which is why a promised endowment cost Germany nothing at all.
//
// It also explains the complaint that started the whole session — that everyone
// seems to be plotting. They were not too many: they were the ONLY ones. Six
// actors out of six held an intent, so a hundred per cent of the known world had
// an opinion about the player.
//
// Creating every country up front is not the answer: a modern map is two hundred
// polities, most of which never appear in a given campaign, and seeding them all
// would cost a fortune in tokens and bury the player in noise.
//
// So a polity is naturalised on FIRST CONTACT — the first time the player writes
// to it, an edition names it, or an order names it. From that moment it has an
// economy built by the engine's own prior (runtime/economyBridge.js seedEconomy,
// the same function the refinement pass later corrects), and it can act, pay,
// refuse and scheme exactly like the bodies that were seeded by hand.

import { seedEconomy, yearOf } from "./economyBridge.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();

// Names that are never a polity, however they appear in a sentence. Without this
// an edition mentioning "the Curia" or "Europe" would naturalise a country of
// that name and put a fictional economy in the world.
const NOT_A_POLITY = new Set([
  "europe", "africa", "asia", "america", "americas", "oceania", "the world", "le monde",
  "west", "east", "north", "south", "occident", "orient",
]);

/** Whether the world already treats this name as an actor with its own state. */
export const isActor = (world, name) => {
  const key = str(name);
  if (!key) return false;
  return Boolean(world?.economies?.[key]);
};

/**
 * Every polity the world could naturalise: the ones its map knows by name and
 * that are not already actors. `known` is the country list the interface loads.
 */
export const naturalizable = (world, known) => {
  const list = Array.isArray(known) ? known : [];
  return list
    .map((c) => (typeof c === "string" ? c : str(c?.name)))
    .filter((name) => name && !NOT_A_POLITY.has(lower(name)) && !isActor(world, name));
};

/**
 * Give a polity a real existence: an economy from the engine's own prior, and a
 * place in the world's registers. Returns the world unchanged when the polity is
 * already an actor, so this is safe to call on every contact.
 *
 * `regionShare` is how much of the map it holds, which the caller knows and this
 * module deliberately does not go looking for — the seeding prior is a pure
 * function of year, share, population and tags.
 */
export const naturalize = (world, name, { date = "", regionShare = 0.01, population = null, tags = [], reason = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const key = str(name);
  if (!key || NOT_A_POLITY.has(lower(key))) return { world: w, naturalized: false, reason: "not a polity" };
  if (isActor(w, key)) return { world: w, naturalized: false, reason: "already an actor" };

  const economy = seedEconomy({
    year: yearOf(date) || 2000,
    regionShare,
    population,
    tags: Array.isArray(tags) ? tags : [],
  });

  return {
    world: {
      ...w,
      economies: { ...(w.economies ?? {}), [key]: economy },
      // A note saying WHEN and WHY it entered the campaign, so a player can see
      // that the world grew rather than always having been there.
      polityOverrides: {
        ...(w.polityOverrides ?? {}),
        [key]: {
          ...(w.polityOverrides?.[key] ?? {}),
          name: key,
          enteredAt: str(date),
          enteredBecause: str(reason) || "first contact",
        },
      },
    },
    naturalized: true,
    reason: str(reason) || "first contact",
    economy,
  };
};

/**
 * Naturalise everyone a turn actually touched. `touched` is the names the turn
 * named — chat counterparts, event actors, order subjects — and the caller is
 * expected to have resolved them against the map already, because a name the map
 * does not know is a name nobody should be given an economy for.
 */
export const naturalizeContacts = (world, touched, { date = "", known = [], shareOf = () => 0.01, tagsOf = () => [], reason = "" } = {}) => {
  const names = [...new Set((Array.isArray(touched) ? touched : []).map(str).filter(Boolean))];
  const onMap = new Set(naturalizable(world, known).map(lower));
  let next = world;
  const added = [];
  for (const name of names) {
    if (!onMap.has(lower(name))) continue;
    const out = naturalize(next, name, {
      date,
      regionShare: shareOf(name),
      tags: tagsOf(name),
      reason,
    });
    if (!out.naturalized) continue;
    next = out.world;
    added.push(name);
  }
  return { world: next, added };
};

export const NATURALIZE_RULE = [
  "A polity acts only once the world holds it: an economy, a stat sheet, a place in the registers. The engine naturalises one the first time the campaign really touches it — a letter, an edition that names it, an order that names it — and from then on it can pay, refuse, scheme and be hurt like any other.",
  "So do not write a country doing something consequential before it has been touched: name it in an event first, and the engine gives it an existence the same turn. A promise made by a polity with no economy costs that polity nothing, and the figures will say so.",
].join("\n");
