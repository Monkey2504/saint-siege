/*! Open Historia — the assembly: a hundred and sixty people, each on three axes © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A player could not win an argument. Opposition was a percentage on an intent,
// and the only way to end a body was to decree it away — so a reform was either
// waved through or blocked, and nothing between was ever a figure. There was no
// way to be PROVED RIGHT and gain by it.
//
// So the people who decide are counted, one at a time, and none of them belongs
// to a party. Each elector stands on three axes at once:
//
//   doctrine   traditional, centrist, reforming — what they think the Church is
//   region     where their people are, which is where the baptised are
//   role       curia, diplomacy, field bishops, religious and laity, temporal
//              administration — what they do all day
//
// A cardinal can be African, doctrinally traditional and a missionary at the
// same time, and he votes differently on three different questions. That is the
// whole point: coalitions are not stored, they are COMPUTED from the question,
// so the same hundred and sixty people split one way on doctrine, another way on
// money, and a third way on where a synod should sit.
//
// Two earlier versions of this file got it wrong in ways worth keeping written
// down. The first stored factions with typed seat counts, and gave a German
// reform current twenty-four of a hundred and sixty — fifteen per cent of the
// college to a country holding one and a half per cent of the baptised. The
// second still typed each faction's opinion by hand, so a financial apparatus
// began at minus thirty for no reason anyone could point at. Here the seats come
// from the register's own population, and every opinion starts at zero.

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const pos = (v, d = 0) => Math.max(0, finite(v, d));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Approval runs -100 to +100, is never set by a sentence, and STARTS AT ZERO for
// everybody. An elector does not begin against the player: they begin with no
// opinion and form one from what the player does. A room that is hostile before
// the first decision is not a political system, it is a mood imposed by whoever
// wrote the scenario, and a player can feel the difference at once.
export const APPROVAL_RANGE = 100;
export const MAX_APPROVAL_STEP = 8;

export const ZEALOUS_AT = 60;
export const LOYAL_AT = 20;
export const HOSTILE_AT = -20;
export const RADICAL_AT = -50;
export const SCHISM_AT = -80;

/** What an elector has become, from their opinion alone. */
export const temper = (approval) => {
  const a = clamp(finite(approval, 0), -APPROVAL_RANGE, APPROVAL_RANGE);
  if (a >= ZEALOUS_AT) return "zealous";
  if (a >= LOYAL_AT) return "loyal";
  if (a > HOSTILE_AT) return "wary";
  if (a > RADICAL_AT) return "hostile";
  if (a > SCHISM_AT) return "radical";
  return "schismatic";
};

// The three axes. Every elector carries one value on each, and a question is
// asked ON an axis — which is what makes the same room split differently
// depending on what is put to it.
// A fourth axis, and the only one whose values are NAMES rather than engine
// tokens: the current an elector follows — the Compagnie de Jésus, the Chemin
// synodal, the player's own party. Those are real entities elsewhere in the
// world, with a leader, standing intents and a history, and THEY are
// authoritative: the college only counts how many electors follow each. Nothing
// here creates a second version of a faction, which is what would happen if the
// college kept its own seat totals and the world kept its own schemes with
// nothing holding the two in step.
export const AXES = Object.freeze(["doctrine", "region", "role", "follows"]);

/**
 * What each group judges a pontificate by, and how much any reorganisation
 * costs it. An elector's sensitivity is the sum of their three groups', so an
 * African traditionalist bishop weighs souls, doctrine and the parish at once —
 * and can be pleased on one while offended on another.
 *
 * The keys are the register's own figures (runtime/register.js), so none of this
 * can be satisfied by a story.
 */
export const GROUP_CONCERNS = Object.freeze({
  // --- doctrine ---
  traditional: { cares: { legitimacy: 2 }, conservatism: 1 },
  centrist: { cares: { legitimacy: 1, balance: 1 }, conservatism: 0.5 },
  reforming: { cares: { faithful: 1, legitimacy: 1 }, conservatism: 0 },
  // --- region: where the people are is what the people count ---
  europe: { cares: { legitimacy: 1, balance: 1 }, conservatism: 0.6 },
  americas: { cares: { faithful: 1, transfers: 1 }, conservatism: 0.3 },
  africa: { cares: { faithful: 2, transfers: 1 }, conservatism: 0.4 },
  asia: { cares: { faithful: 2, legitimacy: 1 }, conservatism: 0.4 },
  oceania: { cares: { faithful: 1 }, conservatism: 0.3 },
  // --- role: what somebody does all day is what they notice ---
  curia: { cares: { legitimacy: 1 }, conservatism: 0.8 },
  diplomacy: { cares: { legitimacy: 2 }, conservatism: 0.4 },
  bishops: { cares: { faithful: 2 }, conservatism: 0.3 },
  orders: { cares: { faithful: 1, transfers: 2 }, conservatism: 0.1 },
  temporal: { cares: { balance: 2, unfundedLiabilities: -2, treasury: 1 }, conservatism: 0.5 },
});

/** One person who votes. */
export const normalizeElector = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const doctrine = lower(entry.doctrine);
  const region = lower(entry.region);
  const role = lower(entry.role);
  if (!doctrine || !region || !role) return null;
  return {
    doctrine, region, role,
    // The current they follow, kept in its own case because it names a body the
    // world holds. Empty means they follow nobody yet, which is a real state:
    // an elector can belong to no current at all and be won by any of them.
    follows: str(entry.follows),
    approval: clamp(finite(entry.approval, 0), -APPROVAL_RANGE, APPROVAL_RANGE),
  };
};

/** The whole body. Its roll is however many electors it holds — no more, no less. */
export const normalizeAssembly = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const electors = (Array.isArray(entry.electors) ? entry.electors : []).map(normalizeElector).filter(Boolean);
  if (!electors.length) return null;
  return { name: str(entry.name) || "Assembly", seats: electors.length, electors };
};

// ---- seating the room ----------------------------------------------------------

// A tiny deterministic generator, so a college seeded from the same figures is
// the same college every time. A scenario that reshuffles itself on reload is
// not a world.
const rng = (seed) => {
  let s = (finite(seed, 1) >>> 0) || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
};

// Draw one value from a set of weights.
const draw = (weights, r) => {
  const entries = Object.entries(weights).filter(([, w]) => pos(w) > 0);
  const total = entries.reduce((s, [, w]) => s + pos(w), 0);
  if (!(total > 0)) return entries[0]?.[0] ?? "";
  let x = r() * total;
  for (const [key, w] of entries) {
    x -= pos(w);
    if (x <= 0) return key;
  }
  return entries[entries.length - 1][0];
};

/**
 * Build the roll from what each axis is KNOWN to look like, rather than from a
 * table somebody typed. `marginals` gives the share of the body on each value of
 * each axis — the region axis is normally the register's own population, so the
 * college follows the faithful and nobody has to keep it in step by hand.
 *
 * The axes are drawn independently, which is the honest default: it says the
 * engine knows the totals and claims no correlation it has not been told about.
 * `correlations` adds the ones a scenario does know — that Europe leans
 * traditional, that the curia sits in Europe — as multipliers on the draw.
 */
export const seatAssembly = ({ seats = 160, marginals = {}, correlations = {}, seed = 7, name = "Assembly" } = {}) => {
  const roll = Math.max(1, Math.round(finite(seats, 160)));
  const r = rng(seed);
  const electors = [];
  for (let i = 0; i < roll; i += 1) {
    const region = draw(marginals.region ?? { europe: 1 }, r);
    // Doctrine and role are drawn conditioned on the region when the scenario
    // says they are related, and independently when it does not.
    const bendDoctrine = correlations?.[region]?.doctrine ?? {};
    const bendRole = correlations?.[region]?.role ?? {};
    const doctrineWeights = {};
    for (const [k, w] of Object.entries(marginals.doctrine ?? { centrist: 1 })) {
      doctrineWeights[k] = pos(w) * (finite(bendDoctrine[k], 1) || 1);
    }
    const roleWeights = {};
    for (const [k, w] of Object.entries(marginals.role ?? { bishops: 1 })) {
      roleWeights[k] = pos(w) * (finite(bendRole[k], 1) || 1);
    }
    const doctrine = draw(doctrineWeights, r);
    const role = draw(roleWeights, r);
    // Who they follow is drawn last, because it depends on the other three: a
    // traditional European curial official and a reforming African bishop are
    // not recruited by the same current. A scenario that declares no currents
    // leaves everyone unattached, which is a legitimate starting state — the
    // room exists before anybody has organised it.
    const followWeights = {};
    for (const [current, base] of Object.entries(marginals.follows ?? {})) {
      const bend = correlations?.[current]?.follows ?? correlations?.[current] ?? {};
      const pull = (finite(bend[doctrine], 1) || 1) * (finite(bend[region], 1) || 1) * (finite(bend[role], 1) || 1);
      followWeights[current] = pos(base) * pull;
    }
    const follows = Object.keys(followWeights).length ? draw(followWeights, r) : "";
    electors.push({ region, doctrine, role, follows, approval: 0 });
  }
  return normalizeAssembly({ name, electors });
};

// ---- reading the room ----------------------------------------------------------

/** The groups on one axis: who they are, how many, and what they make of you. */
export const groupsOn = (assembly, axis) => {
  const a = normalizeAssembly(assembly);
  if (!a || !AXES.includes(axis)) return [];
  const by = new Map();
  for (const e of a.electors) {
    const key = e[axis];
    const g = by.get(key) ?? { name: key, axis, seats: 0, approval: 0 };
    g.seats += 1;
    g.approval += e.approval;
    by.set(key, g);
  }
  return [...by.values()]
    .map((g) => ({ ...g, approval: g.seats ? g.approval / g.seats : 0 }))
    .sort((x, y) => y.seats - x.seats);
};

/** How many of the whole body currently back the player, and how many do not. */
export const standing = (assembly) => {
  const a = normalizeAssembly(assembly);
  if (!a) return null;
  const count = (test) => a.electors.filter(test).length;
  const withYou = count((e) => e.approval >= LOYAL_AT);
  return {
    seats: a.seats,
    with: withYou,
    undecided: count((e) => e.approval > HOSTILE_AT && e.approval < LOYAL_AT),
    against: count((e) => e.approval <= HOSTILE_AT),
    zealous: count((e) => e.approval >= ZEALOUS_AT),
    radical: count((e) => e.approval <= RADICAL_AT && e.approval > SCHISM_AT),
    schismatic: count((e) => e.approval <= SCHISM_AT),
    majority: Math.floor(a.seats / 2) + 1,
    carries: withYou * 2 > a.seats,
  };
};

/**
 * The player's own bloc: the electors who follow them, and nobody else. This is
 * the thing a pontificate actually commands — not the whole college, and not the
 * people who merely approve of it this month.
 */
export const ownBloc = (assembly, player) => {
  const a = normalizeAssembly(assembly);
  const name = lower(player);
  if (!a || !name) return { name: str(player), seats: 0, approval: 0 };
  const mine = a.electors.filter((e) => lower(e.follows) === name);
  return {
    name: str(player),
    seats: mine.length,
    approval: mine.length ? mine.reduce((s, e) => s + e.approval, 0) / mine.length : 0,
  };
};

/**
 * Can a decision be carried, alone or by sitting down with others?
 *
 * A pontificate either commands the votes outright or it negotiates. `need` is
 * what the decision takes — a simple threshold, because that is how a body's
 * own rules read, not a share the engine invents. `with` names the currents the
 * player has agreed to sit with; each brings the electors who follow it.
 *
 * A current will not sit with a player it has turned against: below the hostile
 * line it refuses, and the refusal is named, so a player who has burned a bloc
 * cannot buy it back in the same afternoon.
 */
export const coalition = (assembly, { player = "", need = 50, sitWith = [] } = {}) => {
  const a = normalizeAssembly(assembly);
  if (!a) return null;
  const mine = ownBloc(a, player);
  const asked = [...new Set(sitWith.map(str).filter(Boolean))];

  const partners = [];
  const refused = [];
  for (const name of asked) {
    if (lower(name) === lower(player)) continue;
    const followers = a.electors.filter((e) => lower(e.follows) === lower(name));
    if (!followers.length) {
      refused.push({ name, seats: 0, why: "nobody in this body follows them" });
      continue;
    }
    const mood = followers.reduce((s, e) => s + e.approval, 0) / followers.length;
    if (mood <= HOSTILE_AT) {
      refused.push({ name, seats: followers.length, why: `they are against you (${Math.round(mood)}) and will not sit down` });
      continue;
    }
    partners.push({ name, seats: followers.length, approval: Math.round(mood) });
  }

  const brought = partners.reduce((s, p) => s + p.seats, 0);
  const held = mine.seats + brought;
  // The unattached: electors following no current at all. They are not in the
  // room's arithmetic until somebody wins them, and saying how many there are is
  // the difference between "you are short" and "you are short, and here is where
  // the votes could come from".
  const unattached = a.electors.filter((e) => !e.follows).length;

  return {
    need: Math.max(0, Math.round(finite(need, 50))),
    alone: mine.seats,
    partners,
    refused,
    held,
    short: Math.max(0, Math.max(0, Math.round(finite(need, 50))) - held),
    carriesAlone: mine.seats >= Math.max(0, Math.round(finite(need, 50))),
    carries: held >= Math.max(0, Math.round(finite(need, 50))),
    unattached,
    seats: a.seats,
  };
};

/**
 * Whether a question put to the body passes, and by how much. A question names
 * the groups it pleases and the groups it offends — on ANY axis — so a reform of
 * the curia can be popular in Africa and hated in Rome, and the count says which
 * wins. This is what replaces deciding by decree.
 */
export const putToTheVote = (assembly, { pleases = [], offends = [] } = {}) => {
  const a = normalizeAssembly(assembly);
  if (!a) return null;
  const forIt = new Set(pleases.map(lower));
  const against = new Set(offends.map(lower));
  let ayes = 0;
  let noes = 0;
  for (const e of a.electors) {
    const tags = [e.doctrine, e.region, e.role];
    // An elector's own opinion of the player is worth as much as one group's
    // interest: a pontificate people trust carries things they mildly dislike.
    let lean = e.approval / 40;
    for (const t of tags) {
      if (forIt.has(t)) lean += 1;
      if (against.has(t)) lean -= 1;
    }
    if (lean > 0) ayes += 1;
    else if (lean < 0) noes += 1;
  }
  // Carried only by a majority OF THE BODY, not by outnumbering whoever
  // happened to care. `ayes > noes` called four votes against nothing a pass
  // while a hundred and fifty-six electors sat indifferent — which is not how
  // any assembly decides, and it told the player a measure would carry when it
  // would not have been put.
  const majority = Math.floor(a.seats / 2) + 1;
  return { ayes, noes, abstain: a.seats - ayes - noes, majority, passed: ayes >= majority, seats: a.seats };
};

// ---- how the room judges the way you govern ---------------------------------------

/**
 * Every elector reads the same year and reaches their own verdict, because each
 * judges by what their three groups care about. A traditional African bishop
 * weighs souls, doctrine and the parish at once, and can be pleased on one while
 * offended on another — which is why no single figure ever carries the room.
 *
 * `movements` is what each register figure did, as a signed relative change.
 * `upheaval` is how much was reorganised, 0 to 1.
 */
export const judgeGovernance = (assembly, { movements = {}, upheaval = 0, date = "" } = {}) => {
  const a = normalizeAssembly(assembly);
  if (!a) return { assembly, rows: [] };
  const churn = clamp(finite(upheaval, 0), 0, 1);

  const electors = a.electors.map((e) => {
    let verdict = 0;
    let conservatism = 0;
    for (const tag of [e.doctrine, e.region, e.role]) {
      const concern = GROUP_CONCERNS[tag];
      if (!concern) continue;
      conservatism += concern.conservatism / 3;
      for (const [key, weight] of Object.entries(concern.cares)) {
        const moved = finite(movements[key], 0);
        if (moved !== 0) verdict += clamp(moved, -1, 1) * weight * 10;
      }
    }
    verdict -= churn * conservatism * MAX_APPROVAL_STEP;
    if (verdict === 0) return e;
    const step = clamp(verdict, -MAX_APPROVAL_STEP, MAX_APPROVAL_STEP);
    return { ...e, approval: clamp(e.approval + step, -APPROVAL_RANGE, APPROVAL_RANGE) };
  });

  const next = { ...a, electors };
  // One row per group that actually shifted, so a player reads the room and not
  // a hundred and sixty individual moods.
  const rows = [];
  for (const axis of AXES) {
    const before = new Map(groupsOn(a, axis).map((g) => [g.name, g.approval]));
    for (const g of groupsOn(next, axis)) {
      const moved = g.approval - (before.get(g.name) ?? 0);
      if (Math.abs(moved) < 0.05) continue;
      rows.push({
        date, axis, group: g.name, seats: g.seats,
        approval: Math.round(g.approval * 10) / 10, step: Math.round(moved * 10) / 10,
        reason: moved > 0 ? "approves of how you are governing" : "disapproves of how you are governing",
      });
    }
  }
  return { assembly: next, rows };
};

// ---- electors working on each other ------------------------------------------------

// Only those who have gone past arguing do the arguing. An undecided elector
// persuades nobody: they have no position to carry, and a room where everyone
// influences everyone equally converges to its own average within a few turns,
// which is the opposite of politics.
// Calibrated against the gap it multiplies, which runs to two hundred points.
// At 0.5 every listener hit the cap below, and hitting the cap erases the whole
// point: a neighbour who shares one axis then moved exactly as far as one who
// shares all four. The force has to leave the cap for the extreme cases only.
export const PERSUASION_FORCE = 0.03;
// How much of what they hear an elector actually takes. Deliberately small: a
// college is not a crowd, and a bloc that could flip the room in one turn would
// make governing irrelevant.
export const PERSUASION_MAX_STEP = 2.5;

/**
 * How much one elector listens to another, from 0 to 1: the share of the four
 * axes they have in common. A traditional African bishop hears a traditional
 * African bishop; he barely hears a reforming European curial official, however
 * loudly that one talks.
 */
export const affinity = (a, b) => {
  if (!a || !b) return 0;
  let shared = 0;
  for (const axis of AXES) {
    const x = str(a[axis]);
    if (x && lower(x) === lower(b[axis])) shared += 1;
  }
  return shared / AXES.length;
};

/**
 * The electors who have gone to an extreme work on the people around them, for
 * you or against you. This is the piece that was missing: opinion moved from the
 * player's governing, the player's speeches and rivals' failures, and never from
 * one elector talking to the next — so a college could hold twenty zealots and
 * twenty radicals for a year and nothing passed between them.
 *
 * Three rules keep it from becoming a landslide. Only the convinced persuade.
 * They are heard in proportion to what they share with the listener. And a
 * listener already committed the other way hardly hears at all — which is what
 * produces blocs that harden rather than a room that agrees.
 */
export const persuadeNeighbours = (assembly, { date = "" } = {}) => {
  const a = normalizeAssembly(assembly);
  if (!a) return { assembly, rows: [] };

  const preachers = a.electors.filter((e) => e.approval >= ZEALOUS_AT || e.approval <= RADICAL_AT);
  if (!preachers.length) return { assembly: a, rows: [] };

  const electors = a.electors.map((listener) => {
    let pull = 0;
    for (const preacher of preachers) {
      if (preacher === listener) continue;
      const heard = affinity(preacher, listener);
      if (!heard) continue;
      // Nobody is argued across the whole room: what carries is the gap between
      // them, and only a fraction of it.
      const gap = preacher.approval - listener.approval;
      // A listener already committed the other way is nearly deaf to this
      // preacher. Without it the loudest camp simply wins, and the college stops
      // being a place where two convictions can coexist.
      const deafness = (preacher.approval > 0) === (listener.approval > 0) || listener.approval === 0
        ? 1
        : 0.25;
      pull += gap * heard * deafness * (PERSUASION_FORCE / preachers.length);
    }
    if (!pull) return listener;
    const step = clamp(pull, -PERSUASION_MAX_STEP, PERSUASION_MAX_STEP);
    return { ...listener, approval: clamp(listener.approval + step, -APPROVAL_RANGE, APPROVAL_RANGE) };
  });

  const next = { ...a, electors };
  // Reported by group, like every other movement, so the player reads the room
  // and not a hundred and sixty conversations.
  const rows = [];
  for (const axis of AXES) {
    const before = new Map(groupsOn(a, axis).map((g) => [g.name, g.approval]));
    for (const g of groupsOn(next, axis)) {
      const moved = g.approval - (before.get(g.name) ?? 0);
      if (Math.abs(moved) < 0.05) continue;
      rows.push({
        date, axis, group: g.name, seats: g.seats,
        approval: Math.round(g.approval * 10) / 10, step: Math.round(moved * 10) / 10,
        reason: moved > 0 ? "was talked round by those already with you" : "was talked round by those already against you",
      });
    }
  }
  return { assembly: next, rows, preachers: preachers.length };
};

// ---- speeches the player makes ----------------------------------------------------
//
// Read from the player's own order, for the fifth time and the same reason: a
// rule asking the model to carry a lever has never once made it carry the lever.

const SPEAKS = /\b(discours|allocution|homélie|homelie|adresse\w* (?:à|a|au[x]?) |consistoire|s'adresse|prendre la parole|plaide\w*|convaincre|persuade\w*|address(?:es|ing)? the|speech|homily|appeal to|make the case)/i;

/**
 * The order a page writes when the player addresses the room. It lives beside
 * the parser that reads it back, so the words the interface writes and the words
 * the engine looks for can never drift apart.
 */
export const speechOrderText = (body, group, what) => {
  const at = str(group) || str(body) || "the assembly";
  return `Address ${at} with a speech to win them over. ${str(what)}`.trim();
};

/** A speech in an order: whom it is aimed at, and what standing backs it. */
export const speechFromOrder = (order, { assembly = null, legitimacy = 50, date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  const a = normalizeAssembly(assembly);
  if (!text || !a || !SPEAKS.test(text)) return null;
  // Aimed at whichever groups it names, on any axis; at the whole room otherwise.
  const named = AXES.flatMap((axis) => groupsOn(a, axis).map((g) => g.name))
    .filter((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
  return { kind: "speech", at: [...new Set(named)], weight: clamp(finite(legitimacy, 50) / 100, 0, 1), date };
};

/**
 * What a speech does. It reaches the people it was aimed at, it is worth what
 * the speaker's standing is worth, and it never reaches those who have stopped
 * listening. A speech the ledger contradicts costs opinion instead of winning it.
 */
export const applySpeech = (assembly, speech, { honest = true } = {}) => {
  const a = normalizeAssembly(assembly);
  if (!a || !speech) return { assembly, rows: [], refusals: [] };

  const aimed = new Set((speech.at ?? []).map(lower));
  const hears = (e) => !aimed.size || aimed.has(e.doctrine) || aimed.has(e.region) || aimed.has(e.role);
  const audience = a.electors.filter(hears);
  if (!audience.length) return { assembly: a, rows: [], refusals: ["speech: nobody in the room it was aimed at."] };

  const refusals = [];
  let deaf = 0;
  const electors = a.electors.map((e) => {
    if (!hears(e)) return e;
    // The room has the ledger too. A claim it can check and finds false costs.
    if (!honest) return { ...e, approval: clamp(e.approval - 4, -APPROVAL_RANGE, APPROVAL_RANGE) };
    // Those already past arguing do not hear an argument.
    if (e.approval <= RADICAL_AT) { deaf += 1; return e; }
    // Worth the speaker's standing, and more to those already near.
    const near = 1 - Math.abs(e.approval - LOYAL_AT) / (APPROVAL_RANGE * 1.5);
    return { ...e, approval: clamp(e.approval + speech.weight * 6 * near, -APPROVAL_RANGE, APPROVAL_RANGE) };
  });

  if (!honest) refusals.push("speech: the room has the ledger too, and the claims did not match it.");
  if (deaf) refusals.push(`speech: ${deaf} of them have stopped listening to argument — only results will move them now.`);
  return { assembly: { ...a, electors }, rows: [], refusals };
};

// ---- a faction that has been wrong in public ---------------------------------------

export const BLUNDER_DAYS = 240;

/**
 * A scheme against the player that has run a long time and produced nothing is a
 * faction wrong in public, and the room charges for it. The intent's owner is
 * matched to a group on any axis, so a scenario's own factions reach the college
 * without the college having to know their names.
 */
export const driftFromBlunders = (assembly, intents, { asOf = "", date = "" } = {}) => {
  const a = normalizeAssembly(assembly);
  if (!a) return { assembly, rows: [] };
  const end = Date.parse(str(asOf));
  const stale = (Array.isArray(intents) ? intents : []).filter((it) => {
    if (str(it?.status) !== "active" || pos(it?.stage) >= 100) return false;
    // An intent is stamped `createdAt` by normalizeIntent (runtime/intents.js),
    // never `since` and never `date`. Reading the wrong field made this whole
    // mechanism dead code that no test caught, because the fixture invented the
    // field the code was looking for — the classic way a green suite hides a
    // subsystem that has never once run against real state.
    const began = Date.parse(str(it?.createdAt || it?.since || it?.date));
    return Number.isFinite(end) && Number.isFinite(began) && (end - began) / 86_400_000 >= BLUNDER_DAYS;
  });
  if (!stale.length) return { assembly: a, rows: [] };
  // Everyone warms slightly to the one who is actually delivering.
  const step = Math.min(3, stale.length);
  const electors = a.electors.map((e) => ({ ...e, approval: clamp(e.approval + step, -APPROVAL_RANGE, APPROVAL_RANGE) }));
  return {
    assembly: { ...a, electors },
    rows: [{ date, axis: "", group: "the whole room", seats: a.seats, step, reason: `${stale.length} scheme${stale.length === 1 ? "" : "s"} against you ran a year and produced nothing` }],
  };
};

// ---- what the model and the player read ---------------------------------------------

const fmt = (n) => Math.round(n).toLocaleString("en-US");

export const describeAssembly = (assembly) => {
  const a = normalizeAssembly(assembly);
  if (!a) return "";
  const s = standing(a);
  const lines = [
    `[${a.name} — engine state]`,
    `${a.seats} electors. With you ${s.with}, undecided ${s.undecided}, against you ${s.against}. ${s.carries ? "You carry this body." : `A majority is ${s.majority}; you are ${Math.max(0, s.majority - s.with)} short.`}`,
  ];
  for (const axis of AXES) {
    const groups = groupsOn(a, axis).filter((g) => g.name);
    if (!groups.length) continue;
    lines.push(`By ${axis}: ` + groups
      .map((g) => `${g.name} ${fmt(g.seats)} (${g.approval > 0 ? "+" : ""}${Math.round(g.approval)})`)
      .join(", ") + ".");
  }
  const loose = a.electors.filter((e) => !e.follows).length;
  if (loose) lines.push(`${loose} follow no current at all and can be won by any of them.`);
  if (s.zealous) lines.push(`${s.zealous} of them would follow you anywhere.`);
  if (s.radical) lines.push(`${s.radical} have radicalised against you and no longer hear an argument.`);
  if (s.schismatic) lines.push(`${s.schismatic} are leaving.`);
  lines.push("", ASSEMBLY_RULES);
  return lines.join("\n");
};

export const ASSEMBLY_RULES = [
  "The people who decide are COUNTED, one at a time, and none of them belongs to a party. Each stands on three axes at once — doctrine, region, role — so the same body splits one way on a doctrinal question, another way on money, and a third on where a synod should sit. Coalitions are computed from the question, never stored: never write that 'the conservatives' or 'the Africans' did something as a bloc unless the question was actually on that axis.",
  "No elector begins against the player. Every opinion starts at zero and is earned, in either direction, by what the player actually does — so a body that has turned hostile did so for reasons on the record, and the player can point at them. Never write anyone as opposed by nature or by tradition.",
  "Opinion moves on the engine's own figures, and every elector weighs the three things their groups care about at once. An African traditional bishop can be pleased that souls rose and offended that the house was reorganised, in the same year, and end roughly where he started. No single figure ever carries the room.",
  "Reorganising anything costs you the people who liked it as it was, however good the reform, and the engine charges for it whether the story mentions it or not.",
  "A speech is worth the speaker's standing, reaches the groups it names, and does not reach anyone who has already stopped listening. A speech whose claims the ledger contradicts LOSES opinion: the room has the figures too.",
  "A question put to the body passes on the count, not on the player's will. Say what a reform pleases and what it offends, and report the count the engine returns — including when it fails.",
  "The player commands only the electors who FOLLOW them, which is almost never the whole room. Anything else is carried by sitting down with other currents, and each brings the electors who follow it — so a pontificate either has the votes outright or it negotiates for them, and the engine says which. A current the player has turned against refuses to sit down at all, and the refusal names the reason: a bloc that has been burned cannot be bought back the same afternoon.",
  "Electors who follow no current are the ones actually in play. Name them when a vote is close: that is where the votes a player is short of would have to come from.",
].join("\n");
