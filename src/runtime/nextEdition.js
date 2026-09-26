/*! Open Historia — when the next edition goes to press © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The player should not be asked how long the next turn lasts. They are asked
// today — a week, a month, three months, a year — and it is a question they have
// no way to answer well: the right span depends on what is on the desk, which is
// something the engine knows and the player has to guess.
//
// Worse, the question is asked at exactly the wrong moment. A player who has
// just written a letter picks "one year" because it sounds decisive, and the
// reply lands eleven months after it mattered.
//
// So the date is deduced from the dossier, and the button says it before it is
// pressed. A letter answers within the week. A body that must sit needs a month
// to convene. A campaign, a gathering or a building runs to its own date. And an
// empty desk simply carries the world to whatever it was already going to do.
//
// The rule is deliberately legible: a player who reads the date must be able to
// say which order produced it. That is why every span is named, and why the
// engine returns the reason alongside.

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const DAY = 86_400_000;

// What each kind of business needs before there is anything to report. Days,
// because a turn is a calendar and not a number of ticks.
export const SPANS = Object.freeze({
  letter: 7,
  assembly: 30,
  reform: 30,
  campaign: 90,
  gathering: 90,
  idle: 30,
});

// A body has to be summoned, its members have to travel, and it has to sit.
const ASSEMBLY = /\b(consistoire|conclave|synode|concile|assembl[ée]e|congr[èe]s|consistory|synod|council|assembly|congress|convoquer|convoke|summon)\b/i;
// A letter is answered in the ordinary post, not in a season.
const LETTER = /\b(lettre|courrier|[ée]crire|r[ée]pondre|adresse|message|letter|write to|reply|address\b)\b/i;
// Things that run on their own calendar and report when they are done.
const LONG = /\b(campagne|collecte|lev[ée]e de fonds|rassemblement|construire|chantier|programme|drive|fundraising|gathering|build|programme|construction)\b/i;

const kindOf = (order) => {
  const text = `${str(order?.title)} ${str(order?.text)}`;
  // Order matters: an order that convokes an assembly BY letter is still an
  // assembly, because the sitting is what the player is waiting for.
  if (ASSEMBLY.test(text)) return "assembly";
  if (LONG.test(text)) return "campaign";
  if (LETTER.test(text)) return "letter";
  return "reform";
};

const parseDate = (value) => {
  const t = Date.parse(str(value));
  return Number.isFinite(t) ? t : null;
};

/**
 * When the next edition goes to press, and why.
 *
 * Returns { date, days, reason, from } — `from` naming the order that set the
 * pace, so the interface can say "one month · the consistory" rather than an
 * unexplained number.
 *
 * A dated thing already on the books — a gathering convoked for a day, a pledge
 * falling due — outranks the orders: there is no point printing before the thing
 * the player is waiting for has happened.
 */
export const nextEdition = (world, actions, { today = "" } = {}) => {
  const now = parseDate(today);
  if (now == null) return { date: "", days: SPANS.idle, reason: "le pas du monde lui-même", from: "" };

  const planned = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned");

  // The soonest dated thing the world already holds. Anything sooner than that
  // is a turn that prints before its own news.
  let soonest = null;
  for (const g of Array.isArray(world?.gatherings) ? world.gatherings : []) {
    if (lower(g?.status) !== "planned") continue;
    const at = parseDate(g?.date);
    if (at != null && at > now && (soonest == null || at < soonest.at)) {
      soonest = { at, reason: `le rassemblement ${str(g.name) || ""}`.trimEnd(), from: str(g.name) };
    }
  }

  // The pace the desk asks for: the LONGEST of what is queued, because a turn
  // that ends before its slowest order has had time to report tells the player
  // nothing about it.
  let paced = null;
  for (const order of planned) {
    const kind = kindOf(order);
    const days = SPANS[kind] ?? SPANS.reform;
    if (!paced || days > paced.days) {
      paced = {
        days,
        reason: kind === "letter" ? "une lettre à laquelle répondre"
          : kind === "assembly" ? "un corps qui doit siéger"
          : kind === "campaign" ? "une campagne qui attend sa saison"
          : "une réforme qui doit prendre effet",
        from: str(order.title) || str(order.text).slice(0, 48),
      };
    }
  }

  // An empty desk carries the world at its own pace.
  const base = paced ?? { days: SPANS.idle, reason: "rien sur le bureau — le pas du monde lui-même", from: "" };
  const target = now + base.days * DAY;

  // A dated event sooner than that pulls the edition forward: print when there
  // is something to print about.
  const chosen = soonest && soonest.at < target
    ? { at: soonest.at, days: Math.max(1, Math.round((soonest.at - now) / DAY)), reason: soonest.reason, from: soonest.from }
    : { at: target, days: base.days, reason: base.reason, from: base.from };

  return {
    date: new Date(chosen.at).toISOString().slice(0, 10),
    days: chosen.days,
    reason: chosen.reason,
    from: chosen.from,
  };
};
