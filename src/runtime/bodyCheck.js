/*! Open Historia — a body named in a story must be a body the world holds © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The lever to found an organisation has always existed (organizationOps
// create). It was simply never used: a real campaign ran eleven rounds of
// editions inaugurating « Une Seule Église, Une Seule Solidarité », « Pax
// Africa », « Pax Asia » and « Pax America », validating their statutes and
// certifying their accounts — and the world held none of them. They could not
// be written to, could not answer, could not hold a franc, could not vote.
// They were scenery.
//
// So the same treatment money got: the engine reads each edition, finds the
// bodies it names, and says which ones do not exist. The refusal is visible in
// the game and read by the next turn, which is what turns "you may found a
// body" into "found it or stop naming it".
//
// General by construction: it knows nothing about churches or holdings, only
// that a story naming an institution should be a story about an institution
// the world holds.

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();

// Names a story sets apart with quotation marks. Every campaign that invents a
// body names it this way, in French or English, because that is how one
// introduces a proper name.
const QUOTED = /[«"“]\s*([A-ZÀ-ÖØ-Þ][^»"”\n]{2,70}?)\s*[»"”]/g;

// The words that make a named thing an institution rather than a ship, a
// treaty or a nickname. One of these must appear beside the name.
const INSTITUTIONAL = /\b(holding|f[ée]d[ée]ration|federation|confederation|conf[ée]d[ée]ration|organisation|organization|conseil|council|comit[ée]|committee|commission|ligue|league|alliance|fonds|fund|agence|agency|autorit[ée]|authority|bureau|institut|institute|soci[ée]t[ée]|company|consortium|syndicat|union|assembl[ée]e|assembly|p[ôo]le|pole|chapter|banque|bank|tribunal|court|acad[ée]mie|academy|observatoire|secr[ée]tariat|secretariat)\b/i;

// What a story does WITH an institution, as opposed to merely mentioning one.
const ACTS = /\b(fond\w*|found\w*|cr[ée]\w*|creat\w*|inaugur\w*|[ée]tabli\w*|establish\w*|lanc\w*|launch\w*|constitu\w*|statuts?|charter|si[èe]ge|headquarters|adh[ée]r\w*|joins?\b|membre|member|pr[ée]side\w*|chairs?\b|vote\w*|d[ée]cide\w*|decides?\b|ratifi\w*|ratif\w*|certifi\w*|approuv\w*|approve\w*|budget|comptes?|accounts?)\b/i;

// A named CAMPAIGN is not a body. Field report: an edition launched "the
// holding's multilateral road show « Pax Mundo 2028 », target 500 million
// euros" and the check called it a missing institution because the word
// "holding" stood beside it. It was a drive that failed to be opened, which is
// a different miss with a different remedy — so a name introduced as a
// subscription, a road show or an appeal, with a sum, belongs to the drives
// ledger and is left to it.
const CAMPAIGN = /\b(road[ -]?show|souscription|subscription|campagne|campaign|appel (?:aux dons|de fonds)|levée de fonds|fundrais\w*|collecte|drive|tourn[ée]e|programme|program)\b/i;
const HAS_SUM = /\d[\d .,]*\s*(millions?|milliards?|billions?|bn|M€|M\$)/i;

const eventText = (event) => `${str(event?.title)} ${str(event?.description)}`;

/** Every institution-looking name a text sets in quotation marks. */
export const namedBodies = (text) => {
  const s = str(text);
  const out = [];
  for (const m of s.matchAll(QUOTED)) {
    const name = str(m[1]);
    if (!name || name.length < 3) continue;
    // The words around the name decide whether it is an institution.
    const at = m.index ?? 0;
    const around = s.slice(Math.max(0, at - 120), at + m[0].length + 120);
    if (!INSTITUTIONAL.test(around) && !INSTITUTIONAL.test(name)) continue;
    if (!ACTS.test(around)) continue;
    // Introduced as a campaign carrying a sum: that is a drive, not a body.
    // The sum may sit anywhere in the edition, not only beside the name.
    if (CAMPAIGN.test(around) && HAS_SUM.test(s)) continue;
    if (!out.includes(name)) out.push(name);
  }
  return out;
};

const known = (organizations, polities) => {
  const set = new Set();
  for (const o of Array.isArray(organizations) ? organizations : []) {
    if (o?.name) set.add(lower(o.name));
  }
  for (const p of Array.isArray(polities) ? polities : []) if (p) set.add(lower(p));
  return set;
};

// A name the world holds under a slightly different form — "Une Seule Église"
// against "Une Seule Église, Une Seule Solidarité" — is the same body.
const heldAlready = (set, name) => {
  const key = lower(name);
  if (set.has(key)) return true;
  for (const held of set) {
    if (held.length >= 6 && (held.includes(key) || key.includes(held))) return true;
  }
  return false;
};

/**
 * Bodies an edition acted through that the world does not hold. One refusal
 * line each, in the shape the visible rejection event and the next turn's
 * history already use.
 */
export const reconcileBodies = (events, { organizations = [], polities = [] } = {}) => {
  const set = known(organizations, polities);
  const out = [];
  const said = new Set();
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== "object" || !event.title) continue;
    const created = new Set((Array.isArray(event.impacts?.organizationOps) ? event.impacts.organizationOps : [])
      .filter((o) => ["create", "found"].includes(lower(o?.op)))
      .map((o) => lower(o?.name)));
    for (const name of namedBodies(eventText(event))) {
      if (heldAlready(set, name) || created.has(lower(name)) || said.has(lower(name))) continue;
      said.add(lower(name));
      out.push({
        text: `"${str(event.title).slice(0, 60)}" acts through «${name}», which this world does not hold: it has no members, no seat, no purse and no voice, so nothing it was said to decide happened. Found it with organizationOps {"op":"create"} in the edition that first names it, or write the story without it.`,
        playerRelated: Boolean(event.playerRelated),
      });
    }
  }
  return out;
};

export const BODIES_RULE = [
  "[Bodies Must Exist]",
  "An institution your story acts through — a federation, a council, a fund, a continental chapter — must be a body this world holds. Found it in the very edition that first names it, with impacts.organizationOps {\"op\":\"create\", \"name\", \"kind\", \"founded\", \"seat\", \"charter\", \"members\", \"leader\", \"votingRule\"}, and only then have it inaugurate, validate, certify or decide anything.",
  "A body that exists can be written to in correspondence, can answer in its own voice, can hold a purse, can vote, and can refuse. A body that was only ever named is scenery: the engine says so in front of the player, and nothing it was said to decide has happened.",
  "This is the same for the player's creations and the world's own.",
].join("\n");
