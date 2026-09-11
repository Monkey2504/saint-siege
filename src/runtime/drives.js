/*! Open Historia — fundraising drives: money raised is a figure the engine holds, not a phrase © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A player who runs a road show to raise 500 million was told, edition after
// edition, that it "went very well" — and no figure anywhere ever moved. A
// drive is therefore state: a target, what has been pledged, what has actually
// been collected, and a log of every movement with its date. The model moves
// it only through impacts.driveOps; a narrated success without an op moves
// nothing, and the register prints the zero. Collected money is real: it
// enters the owner's patrimony (economy.endowment) in the engine's own unit.
//
// Same rules for everyone: any polity's drive — a war loan subscription in
// 1916, a diaspora bond, a papal road show — is the same object.

const str = (v) => String(v ?? "").trim();
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
const round1 = (v) => Math.round(v * 10) / 10;

// USD per unit of the drive's currency, for the conversion into the economy's
// subsistence-years through economy.usdPerSY. Unknown currencies count as USD.
const USD_PER = { USD: 1, EUR: EUR_USD_2024, GBP: 1.278, CHF: 1.136, JPY: 0.0066, CAD: 0.73, AUD: 0.66 };
const CURRENCY_ALIASES = [
  [/€|\beuros?\b|\beur\b/i, "EUR"],
  [/\$|\bdollars?\b|\busd\b/i, "USD"],
  [/£|\bpounds?\b|\blivres?\b|\bgbp\b/i, "GBP"],
  [/\bfrancs?\b|\bchf\b/i, "CHF"],
  [/\byen\b|\bjpy\b/i, "JPY"],
];

const currencyOf = (text, fallback = "USD") => {
  for (const [re, code] of CURRENCY_ALIASES) if (re.test(text)) return code;
  return fallback;
};

// "500 millions d'euros", "500 M€", "$2bn", "1,5 milliard", "300 million dollars".
const AMOUNT = /(?:[€$£]\s*)?(\d{1,3}(?:[ .,]\d{3})*(?:[.,]\d+)?|\d+(?:[.,]\d+)?)\s*(millions?|milliards?|billions?|mio|mrd|bn|m€|m\$|m\b|k€)?\s*(?:d['’]\s*)?([€$£]|euros?|dollars?|pounds?|livres?|francs?|usd|eur|gbp|chf)?/i;

// The amount in millions of the currency named, or null when the text carries
// no order of magnitude (a bare "500" is not a fundraising target).
export const parseAmountMillions = (text) => {
  const s = str(text);
  // Every candidate, not only the first: a year inside a campaign's name
  // ("Pax Mundo 2028") used to match first, yield nothing, and blind the
  // parser to the "500 millions d'euros" three lines later.
  for (const m of s.matchAll(new RegExp(AMOUNT.source, "gi"))) {
    const parsed = readAmount(m, s);
    if (parsed) return parsed;
  }
  return null;
};

const readAmount = (m, s = "") => {
  const rawNumber = m[1].replace(/[ ]/g, "");
  // "1,5" is a decimal in French; "1,500" is a thousand separator.
  const normalized = /^\d{1,3}(,\d{3})+$/.test(rawNumber) ? rawNumber.replace(/,/g, "") : rawNumber.replace(",", ".");
  const value = Number(normalized);
  const unit = str(m[2]).toLowerCase();
  const symbol = str(m[3]);
  if (!Number.isFinite(value) || value <= 0) return null;
  let millions;
  if (/^(milliard|billion|mrd|bn)/.test(unit)) millions = value * 1000;
  else if (/^(million|mio|m)/.test(unit)) millions = value;
  else if (unit === "k€") millions = value / 1000;
  else if (symbol && value >= 1_000_000) millions = value / 1_000_000;
  else return null;
  return { millions: round1(millions), currency: currencyOf(`${unit} ${symbol} ${s}`, "USD") };
};

// "road-show" with a hyphen is how a French edition writes it, and missing it
// meant an entire campaign went untracked in a real game.
const FUNDRAISING = /\b(lever|levée|levee|road[ -]?show|fundrais|raise|collecter|collecte|souscription|subscription|appel aux dons|dons|donors?|mécènes?|mecenes?|pledg|capital d['’]amorçage|seed capital|emprunt public|bond drive|campagne de financement|financing campaign)/i;

/**
 * An order that launches a fundraising drive and names no sum. The ledger can
 * only follow a figure, so an order like this produces a drive that can never
 * be credited — which is exactly how a road show ran for eleven rounds while
 * its 500 M target lived only in the player's letters. Told before the order is
 * queued, the player writes the number themselves.
 */
export const driveNeedsFigure = (text) => {
  const s = str(text);
  return Boolean(s) && FUNDRAISING.test(s) && parseAmountMillions(s) == null;
};

/** Every distinct sum a text names, largest first. */
export const allAmountsMillions = (text) => {
  const out = [];
  const seen = new Set();
  for (const chunk of str(text).split(/(?<=[.!?;\n])/)) {
    const a = parseAmountMillions(chunk);
    if (a && !seen.has(`${a.millions}${a.currency}`)) { seen.add(`${a.millions}${a.currency}`); out.push(a); }
  }
  return out.sort((x, y) => y.millions - x.millions);
};

// A planned order that announces a drive with a target becomes one.
export const driveFromOrder = (order, { owner = "", date = "" } = {}) => {
  const text = str(typeof order === "string" ? order : `${order?.title ?? ""}. ${order?.text ?? order?.rawInput ?? ""}`);
  if (!FUNDRAISING.test(text)) return null;
  // A drive with no figure in the order is still a drive. The real campaign
  // that prompted all this ran a road show for eleven rounds whose target
  // (500 M) lived only in the pope's letters, never in an order — so nothing
  // tracked it and the editions were free to say it went well. Untargeted, it
  // is followed at zero until the target is set, which is already an answer to
  // "have I got the money".
  const amount = parseAmountMillions(text) ?? { millions: 0, currency: currencyOf(text, "EUR") };
  // A manual order's title is its whole text; a drive is named short, by what
  // it is and what it seeks, so the register reads "Road show (500 M EUR)"
  // rather than a sentence cut in the middle.
  const title = str(typeof order === "object" ? order?.title : "") || text.slice(0, 60);
  const kind = (text.match(/road ?show|souscription|subscription|bond drive|emprunt public|appel aux dons|fundrais\w*|levée de fonds|levee de fonds|campagne de financement|financing campaign/i) || [""])[0];
  const named = kind ? kind.charAt(0).toUpperCase() + kind.slice(1).toLowerCase() : "Fundraising drive";
  const short = title.length <= 48 && !/[.!?]\s+\S/.test(title)
    ? title
    : `${named}${amount.millions > 0 ? ` (${amount.millions >= 1000 ? `${round1(amount.millions / 1000)} bn` : `${round1(amount.millions)} M`} ${amount.currency})` : ""}`;
  return normalizeDrive({
    id: str(typeof order === "object" ? order?.id : "") ? `drive-${order.id}` : `drive-${Date.now()}`,
    actionId: str(typeof order === "object" ? order?.id : ""),
    owner,
    name: short,
    target: amount.millions,
    currency: amount.currency,
    startedAt: date,
  });
};

export const normalizeDrive = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const name = str(entry.name || entry.title);
  const id = str(entry.id) || (name ? `drive-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : "");
  if (!id) return null;
  return {
    id,
    actionId: str(entry.actionId),
    owner: str(entry.owner),
    name: name || id,
    currency: str(entry.currency).toUpperCase() || "USD",
    target: Math.max(0, num(entry.target)),
    pledged: Math.max(0, num(entry.pledged)),
    collected: Math.max(0, num(entry.collected)),
    status: ["open", "closed"].includes(str(entry.status)) ? str(entry.status) : "open",
    startedAt: str(entry.startedAt),
    closedAt: str(entry.closedAt),
    log: Array.isArray(entry.log) ? entry.log.filter((l) => l && typeof l === "object").map((l) => ({
      date: str(l.date), op: str(l.op), amount: num(l.amount), source: str(l.source), note: str(l.note),
    })).slice(-40) : [],
  };
};

export const normalizeDrives = (list) => (Array.isArray(list) ? list.map(normalizeDrive).filter(Boolean) : []);

// Drives the planned orders announce and the world does not yet hold. Returns
// the same world when nothing had to change.
export const ensureDrivesFromOrders = (world, actions, { player = "", date = "" } = {}) => {
  const w = world && typeof world === "object" ? world : {};
  const drives = normalizeDrives(w.drives);
  // Only what is queued now. Reading every order ever given was right once, to
  // recover a campaign that predated this ledger, but as standing behaviour it
  // keeps rediscovering months-old orders and opening drives for them — two
  // empty duplicates of "Road show" appeared that way, beside the closed
  // originals. An order resolved long ago has had its turn.
  const orders = (Array.isArray(actions) ? actions : [])
    .filter((a) => a && typeof a === "object" && a.kind !== "chat" && (a.status ?? "planned") === "planned");
  const added = [];
  for (const order of orders) {
    const drive = driveFromOrder(order, { owner: player, date });
    if (!drive) continue;
    // One drive per campaign, not one per order: a road show ordered again
    // next round is the same road show. Matched by the order it came from,
    // then by owner + name, then by owner + target.
    const dup = drives.some((d) => d.actionId && d.actionId === drive.actionId)
      || drives.some((d) => d.owner === drive.owner && d.status === "open" && d.name.toLowerCase() === drive.name.toLowerCase())
      || drives.some((d) => d.owner === drive.owner && d.status === "open" && d.currency === drive.currency && d.target === drive.target && d.target > 0);
    if (!dup) { drives.push(drive); added.push(drive); }
  }
  return added.length ? { ...w, drives } : world;
};

// `strict`: exact id or name only. The loose match exists so an op can name a
// drive the way the story does; it must NOT decide whether a new drive already
// exists, or "Road show II" is refused as a duplicate of "Road show".
const findDrive = (drives, ref, { strict = false } = {}) => {
  const key = str(ref).toLowerCase();
  if (!key) return null;
  const exact = drives.find((d) => d.id.toLowerCase() === key) || drives.find((d) => d.name.toLowerCase() === key);
  if (exact || strict) return exact || null;
  return drives.find((d) => d.name.toLowerCase().includes(key) || key.includes(d.name.toLowerCase())) || null;
};

// Ce qu'une somme de campagne vaut en dollars. Les chiffres d'une campagne sont
// des MILLIONS dans sa propre monnaie, jamais des années-subsistance : le cahier
// des comptes les passait par moneyOf, qui convertit des AS, et « 96 millions
// d'euros promis » s'imprimait « 143 k€ ». La conversion existait déjà, enfermée
// dans syFromMillions ; elle sort d'un cran pour que l'affichage s'en serve.
export const usdFromMillions = (millions, currency) =>
  num(millions) * 1e6 * (USD_PER[str(currency).toUpperCase()] ?? 1);

// SY the economy books for an amount in the drive's currency.
export const syFromMillions = (millions, currency, economy) => {
  const usdPerSY = num(economy?.usdPerSY);
  if (!(usdPerSY > 0)) return 0;
  return usdFromMillions(millions, currency) / usdPerSY;
};

// The only lever. Returns the drives after the ops, the SY each owner's
// patrimony gains from what was collected, and every refusal in words.
export const applyDriveOps = (drives, ops, { date = "", player = "" } = {}) => {
  let list = normalizeDrives(drives);
  const gains = {};
  const refusals = [];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const op = str(raw.op).toLowerCase();
    const amount = round1(Math.max(0, num(raw.amount)));
    const source = str(raw.source);
    const note = str(raw.note);
    if (op === "create") {
      const created = normalizeDrive({ ...raw, owner: str(raw.owner) || player, startedAt: date, pledged: 0, collected: 0 });
      if (!created || !(created.target > 0)) { refusals.push(`driveOps create refused: a drive needs a name and a target above zero.`); continue; }
      if (findDrive(list, created.name, { strict: true })) { refusals.push(`driveOps create refused: "${created.name}" already exists.`); continue; }
      list = [...list, { ...created, log: [{ date, op: "create", amount: created.target, source, note }] }];
      continue;
    }
    const drive = findDrive(list, raw.drive ?? raw.name ?? raw.id);
    if (!drive) { refusals.push(`driveOps ${op || "?"} refused: no drive named "${str(raw.drive ?? raw.name ?? raw.id)}" exists.`); continue; }
    if (drive.status === "closed" && op !== "close") { refusals.push(`driveOps ${op} refused: "${drive.name}" is closed.`); continue; }
    const entry = { date, op, amount, source, note };
    if (op === "pledge") {
      if (!(amount > 0)) { refusals.push(`driveOps pledge refused on "${drive.name}": amount must be above zero.`); continue; }
      // Nothing is pledged to a campaign that has not said what it seeks.
      if (!(drive.target > 0)) { refusals.push(`driveOps pledge refused on "${drive.name}": the drive has no target yet — set one with {"op":"create"} before anyone pledges to it.`); continue; }
      // No single edition raises more than the whole target again.
      const cap = Math.max(drive.target, 1);
      const granted = Math.min(amount, cap);
      if (granted < amount) refusals.push(`driveOps pledge on "${drive.name}" capped at ${granted} (one edition cannot pledge more than the whole target).`);
      list = list.map((d) => (d === drive ? { ...d, pledged: round1(d.pledged + granted), log: [...d.log, { ...entry, amount: granted }].slice(-40) } : d));
    } else if (op === "collect") {
      const available = round1(drive.pledged - drive.collected);
      const granted = Math.min(amount, Math.max(0, available));
      if (!(granted > 0)) { refusals.push(`driveOps collect refused on "${drive.name}": nothing pledged remains to collect (pledged ${drive.pledged}, collected ${drive.collected}).`); continue; }
      if (granted < amount) refusals.push(`driveOps collect on "${drive.name}" capped at ${granted}: only what was pledged can be collected.`);
      list = list.map((d) => (d === drive ? { ...d, collected: round1(d.collected + granted), log: [...d.log, { ...entry, amount: granted }].slice(-40) } : d));
      gains[drive.owner] = (gains[drive.owner] ?? []).concat([{ millions: granted, currency: drive.currency }]);
    } else if (op === "withdraw") {
      // A pledge that fell through.
      const granted = Math.min(amount, Math.max(0, round1(drive.pledged - drive.collected)));
      if (!(granted > 0)) { refusals.push(`driveOps withdraw refused on "${drive.name}": no uncollected pledge to withdraw.`); continue; }
      list = list.map((d) => (d === drive ? { ...d, pledged: round1(d.pledged - granted), log: [...d.log, { ...entry, amount: granted }].slice(-40) } : d));
    } else if (op === "close") {
      list = list.map((d) => (d === drive ? { ...d, status: "closed", closedAt: date, log: [...d.log, entry].slice(-40) } : d));
    } else {
      refusals.push(`driveOps refused: unknown op "${op}".`);
    }
  }
  return { drives: list, gains, refusals };
};

// Books what was collected into each owner's patrimony. Returns new economies.
export const bookDriveGains = (economies, gains, { normalizeEconomy = (e) => e } = {}) => {
  const out = { ...(economies ?? {}) };
  for (const [owner, list] of Object.entries(gains ?? {})) {
    const economy = out[owner];
    if (!economy) continue;
    const sy = list.reduce((sum, g) => sum + syFromMillions(g.millions, g.currency, economy), 0);
    if (sy > 0) out[owner] = normalizeEconomy({ ...economy, endowment: num(economy.endowment) + sy });
  }
  return out;
};

const fmtM = (v) => (Math.abs(v) >= 1000 ? `${round1(v / 1000)} bn` : `${round1(v)} M`);

// ---- where the money comes from ---------------------------------------------
//
// "Ce n'est pas à l'Allemagne seule de payer … je veux que ce soit une
// construction mondiale." A purpose like that is checkable: add up what each
// named source has actually put in, and the engine can say whether the thing
// is world-funded or one donor's project wearing a global name. Nobody has to
// take the story's word for it, and the same measure works for a war loan, a
// party's funding or a bank's deposits.

/** What each named source has pledged and paid, largest first. */
export const sourceShares = (drives, { owner = "" } = {}) => {
  const list = normalizeDrives(drives).filter((d) => !owner || d.owner === owner);
  const by = new Map();
  for (const d of list) {
    for (const l of d.log) {
      if (!["pledge", "collect"].includes(l.op) || !(l.amount > 0)) continue;
      const key = l.source || "unattributed";
      const row = by.get(key) ?? { source: key, pledged: 0, collected: 0 };
      if (l.op === "pledge") row.pledged = round1(row.pledged + l.amount);
      else row.collected = round1(row.collected + l.amount);
      by.set(key, row);
    }
  }
  const rows = [...by.values()];
  const totalPledged = rows.reduce((s, r) => s + r.pledged, 0);
  const totalCollected = rows.reduce((s, r) => s + r.collected, 0);
  return rows
    .map((r) => ({
      ...r,
      shareOfPledged: totalPledged > 0 ? Number((r.pledged / totalPledged).toFixed(3)) : 0,
      shareOfCollected: totalCollected > 0 ? Number((r.collected / totalCollected).toFixed(3)) : 0,
    }))
    .sort((a, b) => (b.pledged + b.collected) - (a.pledged + a.collected));
};

// Above this share from one source, a "world" undertaking is one donor's.
export const CONCENTRATION_CEILING = 0.4;

/** The one line that says whether the money is broad or comes from one place. */
export const describeConcentration = (drives, { owner = "" } = {}) => {
  const rows = sourceShares(drives, { owner });
  if (!rows.length) return "";
  const top = rows[0];
  const total = rows.reduce((s, r) => s + r.pledged, 0);
  if (!(total > 0)) return "";
  const share = Math.round(top.shareOfPledged * 100);
  const others = rows.length - 1;
  // Where the money comes from, never who owns the thing: a contributor is a
  // contributor, and a donor funding the whole of something owns none of it.
  return `Who is paying: ${rows.length} named ${rows.length === 1 ? "contributor" : "contributors"}; the largest, ${top.source}, provides ${share}% of everything pledged (${fmtM(top.pledged)}). This is the source of the funds, not a claim on the undertaking.`
    + (top.shareOfPledged > CONCENTRATION_CEILING
      ? ` One contributor is carrying it${others ? `, against ${others} other${others === 1 ? "" : "s"}` : " alone"}: an undertaking meant to be worldwide is paid for from one place, which is a dependence, not a transfer of ownership. Broadening it means new contributors actually pledging, not more said about the ones already in.`
      : " No single contributor carries it.");
};

// Movement since a date: the sum of pledges and collections logged after it.
export const driveMovement = (drive, sinceDate = "") => {
  const since = str(sinceDate);
  const recent = drive.log.filter((l) => !since || l.date > since);
  return {
    pledged: round1(recent.filter((l) => l.op === "pledge").reduce((s, l) => s + l.amount, 0) - recent.filter((l) => l.op === "withdraw").reduce((s, l) => s + l.amount, 0)),
    collected: round1(recent.filter((l) => l.op === "collect").reduce((s, l) => s + l.amount, 0)),
  };
};

// ---- narration against the ledger -------------------------------------------
//
// The failure this catches, from a real campaign: eleven rounds of editions
// announcing a road show, a holding, "l'enregistrement des 500 millions d'euros
// de dotation initiale sur les comptes de l'IOR" — and the patrimony unchanged
// to the euro from the first day to the last. The story had the money; the
// engine never did. An event that says a sum was received must carry the op
// that moves it, and when it does not, the engine says so out loud.

// Words that assert money ARRIVED. "dotation" was in this list and should
// never have been: it names the endowment itself, so an edition transmitting
// "l'échéancier pour le solde de la dotation allemande" — a payment schedule,
// which moves nothing by design — was called a false claim of receipt.
const RECEIVED = /\b(encaiss\w*|reçu\w*|recu\w*|received|credited|crédit[ée]\w*|versé\w*|verse[ée]s?\b|enregistr\w*|registered|deposit\w*|déposé\w*|collect[ée]\w*|disburse\w*|transferr?[ée]\w*|entrée en caisse|abond\w*)/i;
const PROMISED = /\b(promis\w*|pledg\w*|engage\w*|s'engage|commit(?:ted|ment)s?\b|souscri\w*|annonc\w*|intention de donner)/i;
// A calendar for a future payment is the opposite of a payment: it says when
// money WILL move, so nothing is claimed to have moved yet.
const SCHEDULED = /\b([ée]ch[ée]ancier|calendrier|schedule[ds]?\b|timetable|[ée]tal[ée]\w*|par tranches?|in instal?ments?|à venir|a venir|prévu\w*|forthcoming|upcoming)\b/i;
// A demand, an obligation or a condition: the money has NOT arrived, whatever
// verb of payment the sentence uses. "exigeant le versement", "doit être
// versée", "tant que les fonds n'auront pas été crédités" are all this.
const NOT_YET = /\b(exige\w*|exigea\w*|r[ée]clam\w*|injonction|somm\w*\s+de\s+verser|demand\w*|doit [êe]tre|doivent [êe]tre|devra\w*|tant que|jusqu'[àa]|sous r[ée]serve|[àa] condition|conditionn\w*|suspensiv\w*|n'aur\w* pas|ne ser\w* pas|must be|shall be|is to be|until|pending|subject to|provided that|requir\w*)\b/i;

// Sentences, roughly: a claim lives in one, and reading across several is what
// produced every false alarm this check has had.
const sentencesOf = (text) => str(text).split(/(?<=[.!?;])\s+|\n+/).map((s) => s.trim()).filter(Boolean);

/**
 * The sum an event states as HAVING ARRIVED — one sentence asserting receipt,
 * carrying the figure, and free of demand, condition, promise or schedule.
 * Null when the edition is talking about money that has not moved, which is
 * most of the time and must never be called a false claim.
 */
export const claimedReceipt = (text) => {
  for (const sentence of sentencesOf(text)) {
    if (!RECEIVED.test(sentence)) continue;
    if (NOT_YET.test(sentence) || PROMISED.test(sentence) || SCHEDULED.test(sentence)) continue;
    const amount = parseAmountMillions(sentence);
    if (amount) return amount;
  }
  return null;
};

/**
 * Events that speak of money arriving without an op that moved any. Returns one
 * refusal line per offending event — the same shape warOps and migrationOps
 * refusals use, so they land in the visible rejection event and in next turn's
 * history.
 */
// A campaign an edition LAUNCHES with a target of its own: it must open a
// drive, or the ledger has nothing to follow and the next eleven editions are
// free to say it went well. Field report: "le road-show multilatéral « Pax
// Mundo 2028 », fixant une cible globale de 500 millions d'euros" opened
// nothing at all.
// "lancé", "lancement", "lance" — and NOT "s'engagent", which is a donor
// promising, not a campaign opening.
const LAUNCHES = /\b(lanc\w*|launch\w*|ouvre\w*|opens?\b|inaugur\w*|d[ée]marr\w*|fixant une cible|sets? a target)\b/i;

export const reconcileNarration = (events, { drives = [], player = "" } = {}) => {
  const known = normalizeDrives(drives);
  const names = known.map((d) => d.name.toLowerCase());
  const out = [];
  for (const event of Array.isArray(events) ? events : []) {
    if (!event || typeof event !== "object" || !event.title) continue;
    const text = `${str(event.title)} ${str(event.description)}`;

    // A campaign launched with a figure and no drive behind it.
    if (FUNDRAISING.test(text) && LAUNCHES.test(text)) {
      const target = parseAmountMillions(text);
      const ops = Array.isArray(event.impacts?.driveOps) ? event.impacts.driveOps : [];
      const opened = ops.some((o) => str(o?.op).toLowerCase() === "create");
      const alreadyKnown = names.some((n) => n.length > 4 && text.toLowerCase().includes(n));
      if (target && !opened && !alreadyKnown) {
        out.push({
          text: `"${str(event.title).slice(0, 70)}" launches a campaign for ${fmtM(target.millions)} ${target.currency} and opens no drive: the ledger has no target to follow, so nothing it raises can ever be counted. Open it with driveOps {"op":"create", name, target, currency} in the edition that launches it.`,
          playerRelated: Boolean(event.playerRelated),
        });
      }
    }
    const ops = Array.isArray(event.impacts?.driveOps) ? event.impacts.driveOps : [];
    const moved = ops.some((o) => ["collect", "pledge"].includes(str(o?.op).toLowerCase()) && num(o?.amount) > 0);
    if (moved) continue;
    // Sentence by sentence, not event by event. Three false alarms came from
    // reading a sum in one sentence and a word like "versée" or "crédités" in
    // another: an edition demanding 250 M and saying the decrees stay blocked
    // "tant que les fonds n'auront pas été crédités" was called a false claim
    // of receipt. A claim that money ARRIVED is one sentence saying so, with
    // the sum in it, in no demand and under no condition.
    const amount = claimedReceipt(text);
    if (!amount) continue;
    const known = names.find((n) => text.toLowerCase().includes(n));
    out.push({
      text: `"${str(event.title).slice(0, 70)}" says ${fmtM(amount.millions)} ${amount.currency} reached ${player || "the treasury"}, with no driveOps to move it: nothing was credited, and the ledger still shows what it showed before${known ? ` for "${known}"` : ""}.`,
      playerRelated: Boolean(event.playerRelated),
    });
  }
  return out;
};

// ---- a pledge nobody ever collects -------------------------------------------
//
// The failure this closes, from a real campaign: 250 M were pledged, the
// donor wrote twice in correspondence that the transfer was ordered and then
// that it was in the clearing system, and across fourteen editions and four
// months not one carried a driveOp. It was not a scheme — the donor had no
// hostile intent — it was that nothing ever obliged an edition to settle the
// thing. A promise with no deadline is a promise nobody has to keep.

// How long a pledge may sit before an edition must settle it.
export const PLEDGE_GRACE_DAYS = 90;

const daysBetween = (a, b) => {
  const da = Date.parse(str(a)); const db = Date.parse(str(b));
  return Number.isFinite(da) && Number.isFinite(db) ? Math.round((db - da) / 86_400_000) : 0;
};

/** Pledges promised and still unpaid past the grace period, oldest first. */
export const overduePledges = (drives, { asOf = "", graceDays = PLEDGE_GRACE_DAYS } = {}) => {
  const out = [];
  for (const d of normalizeDrives(drives)) {
    if (d.status !== "open") continue;
    const owed = round1(d.pledged - d.collected);
    if (!(owed > 0)) continue;
    // Dated from the last movement of any kind: a drive that moved recently is
    // not overdue, whatever it still owes.
    const since = d.log.filter((l) => ["pledge", "collect"].includes(l.op)).at(-1)?.date || d.startedAt;
    const days = asOf && since ? daysBetween(since, asOf) : 0;
    if (days > graceDays) out.push({ drive: d, owed, since, days });
  }
  return out.sort((a, b) => b.days - a.days);
};

export const describeOutstanding = (drives, { asOf = "", player = "" } = {}) => {
  const late = overduePledges(drives, { asOf });
  if (!late.length) return "";
  const lines = ["[Pledges Owed — settle them this edition]"];
  for (const { drive, owed, since, days } of late) {
    lines.push(`- ${fmtM(owed)} ${drive.currency} pledged to "${drive.name}" has been owed since ${since}, ${days} days, and has never been paid.`);
  }
  lines.push(
    "A promise this old is not background: THIS edition settles each of them, one of three ways, and each way is an op.",
    "It arrives: {\"op\":\"collect\", drive, amount, source} — write the transfer as the event it is.",
    "It falls through: {\"op\":\"withdraw\", drive, amount, note} — the donor reneged, went broke, attached a condition that was refused. Say who and why.",
    "It is genuinely blocked: name the impediment in the event — a bank, a regulator, a body withholding consent, a war — and give that impediment an owner who can be argued with or defeated. An impediment with no name is not an impediment, it is a delay you invented.",
    `What you may not do again is have the donor say the money is coming. ${player || "The player"} has been told that twice and the ledger has not moved; a third time is not diplomacy, it is the engine failing to resolve its own state.`,
  );
  return lines.join("\n");
};

// ---- drives nobody feeds -----------------------------------------------------
//
// An order that mentioned raising money opened a drive, and if the campaign
// never happened the drive sat there forever, printing "nothing moved since
// the last edition" beside four others exactly like it. A ledger that lists
// what was abandoned as loudly as what is running teaches the reader to stop
// reading it.

// A drive that has never received anything closes itself after this long.
export const DORMANT_DAYS = 120;

/**
 * Closes drives that were opened and then never fed: nothing pledged, nothing
 * collected, and no movement for the dormancy period. Returns the same array
 * when nothing had to close, and a line per closure for the visible log.
 */
export const pruneDormantDrives = (drives, { asOf = "" } = {}) => {
  const list = normalizeDrives(drives);
  if (!str(asOf)) return { drives: list, closed: [] };
  const closed = [];
  const next = list.map((d) => {
    if (d.status !== "open" || d.pledged > 0 || d.collected > 0) return d;
    const since = d.log.at(-1)?.date || d.startedAt;
    if (!since || daysBetween(since, asOf) < DORMANT_DAYS) return d;
    closed.push(`"${d.name}" was opened on ${since} and never received anything; it is closed.`);
    return { ...d, status: "closed", closedAt: asOf, log: [...d.log, { date: asOf, op: "close", amount: 0, source: "", note: "Dormant: nothing was ever pledged to it" }].slice(-40) };
  });
  return { drives: closed.length ? next : list, closed };
};

export const DRIVES_RULES = [
  "Money raised exists only through impacts.driveOps: {op:\"pledge\"|\"collect\"|\"withdraw\"|\"close\"|\"create\", drive:<name>, amount:<millions in the drive's currency>, source:<who gave>, note}. A pledge is a promise; collect is what actually reached the treasury and only what was pledged can be collected; withdraw is a pledge that fell through.",
  "An event that says a drive went well, that donors were won, that a tour raised money, MUST carry the pledge or collect op with the figure — or it raised nothing, the register prints the zero, and the next edition is told so. If nothing moved, say plainly that nothing moved and why.",
  "Figures are earned, not narrated: a single edition cannot pledge more than the drive's whole target, and a road show that meets a dozen donors pledges what a dozen donors give. What is collected enters the owner's patrimony in the engine and shows in the ledger from the next edition.",
  "A drive with no target set cannot succeed: before anything is pledged to it, it needs a figure. Either the player's order names one, or an early event settles it with {\"op\":\"create\"} carrying the target the campaign is actually organised around — a board's resolution, a prospectus, a subscription notice. Until then, write it as a campaign being prepared, never as one bringing money in.",
  "This is the same for every polity's drive — the player's, a rival's, a body's.",
].join("\n");

export const describeDrives = (drives, { player = "", sinceDate = "", asOf = "" } = {}) => {
  const list = normalizeDrives(drives);
  if (!list.length) return "";
  const lines = ["[Fundraising Drives — engine state]"];
  for (const d of list) {
    const mv = driveMovement(d, sinceDate);
    const remaining = Math.max(0, round1(d.target - d.pledged));
    const last = d.log.at(-1);
    lines.push(
      `- ${d.name} (${d.owner || "?"}${d.owner && d.owner === player ? ", the player" : ""}; ${d.status}; ${d.currency}): ${d.target > 0
        // Two different gaps, and confusing them is how a drive reads as
        // finished while nothing has arrived: what nobody has promised yet,
        // and what was promised and has not been paid.
        ? `target ${fmtM(d.target)}; pledged ${fmtM(d.pledged)} (${Math.round((d.pledged / d.target) * 100)}%); collected ${fmtM(d.collected)}; ${fmtM(Math.max(0, round1(d.pledged - d.collected)))} promised but not yet in hand; ${fmtM(remaining)} still to find from new donors.`
        : `no target set yet — say what it seeks with {"op":"create"} or state the figure; pledged ${fmtM(d.pledged)}; collected ${fmtM(d.collected)}.`}`
      + ` Last edition: +${fmtM(mv.pledged)} pledged, +${fmtM(mv.collected)} collected.`
      + (last ? ` Last movement ${last.date}: ${last.op} ${fmtM(last.amount)}${last.source ? ` from ${last.source}` : ""}.` : " No movement recorded yet."),
    );
  }
  const concentration = describeConcentration(list, { owner: player });
  if (concentration) lines.push(concentration);
  const outstanding = describeOutstanding(list, { asOf, player });
  if (outstanding) lines.push("", outstanding);
  lines.push("", DRIVES_RULES);
  return lines.join("\n");
};

import { EUR_USD_2024 } from "./money.js";