/*! Open Historia — the faithful: a live, per-continent count of Catholics, stepped by real demography and by the Church's standing © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// "1.406 billion Catholics" is a real figure — and a dead one if it never
// moves. This keeps it alive the way the economy is kept alive: a ledger in
// world state, stepped deterministically every jump from REAL continental
// growth rates, bent by the Holy See's standing (its legitimacy in the
// engine), and moved by events through a typed op — never a number the
// model narrates and then forgets.
//
// Baseline and rates: Annuario Pontificio 2025 (data for end-2023). Shares:
// Americas 47.8%, Europe 20.4%, Africa 20.0% (281 M), Asia 11.0%, Oceania
// 0.9% (~11 M) of 1.406 billion. Annual growth 2022→2023: Africa +3.31%,
// Oceania +1.9%, Asia +0.6%, Europe +0.2%, world +1.15%; the Americas' rate
// is not published in that release and is derived here from the world total
// (≈ +0.76%). Pure: no store reads, no React, no randomness.

export const CONTINENTS = ["africa", "americas", "asia", "europe", "oceania"];

// People, end of 2023.
export const FAITHFUL_2023 = Object.freeze({
  africa: 281_000_000,
  americas: 672_000_000,
  asia: 155_000_000,
  europe: 287_000_000,
  oceania: 11_000_000,
});

// Annual demographic drift (births, deaths, baptisms, migration) — the part
// that happens whatever the pope does.
export const FAITHFUL_GROWTH = Object.freeze({
  africa: 0.0331,
  americas: 0.0076,
  asia: 0.0060,
  europe: 0.0020,
  oceania: 0.0190,
});

// Where people LEAVE the Church as an act — a measured, annual phenomenon in
// Europe (Germany alone loses hundreds of thousands a year), the Americas and
// Oceania — the Church's standing moves retention. Where growth is by birth
// (Africa, Asia), standing matters half as much. Per point of legitimacy
// above or below the baseline, per year.
const STANDING_BASELINE = 70;
const STANDING_ELASTICITY = { africa: 0.00025, americas: 0.0005, asia: 0.00025, europe: 0.0005, oceania: 0.0005 };

const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const normalizeFaithful = (entry) => {
  const src = entry && typeof entry === "object" ? entry : {};
  const out = {};
  for (const c of CONTINENTS) out[c] = Math.max(0, Math.round(finite(src[c], FAITHFUL_2023[c])));
  return out;
};

export const normalizeChurch = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  return {
    faithful: normalizeFaithful(entry.faithful),
    asOf: String(entry.asOf ?? "").trim(),
    log: (Array.isArray(entry.log) ? entry.log : []).map((s) => String(s ?? "").trim()).filter(Boolean).slice(-12),
  };
};

export const totalFaithful = (faithful) => CONTINENTS.reduce((s, c) => s + finite(normalizeFaithful(faithful)[c]), 0);

// One jump of `years`. Standing is the Holy See's legitimacy (0-100).
export const stepFaithful = (church, { years = 0, legitimacy = STANDING_BASELINE, date = "" } = {}) => {
  const c = normalizeChurch(church);
  if (!c || !(years > 0)) return c;
  const standing = clamp(finite(legitimacy, STANDING_BASELINE), 0, 100) - STANDING_BASELINE;
  const faithful = {};
  for (const k of CONTINENTS) {
    const rate = FAITHFUL_GROWTH[k] + standing * STANDING_ELASTICITY[k];
    faithful[k] = Math.max(0, Math.round(c.faithful[k] * (1 + rate) ** years));
  }
  return { ...c, faithful, asOf: date || c.asOf };
};

// ---- the lever ---------------------------------------------------------------------------
//
//   {op:"shift", continent:"africa|americas|asia|europe|oceania", delta:<people, signed>, note:""}
//   {op:"shift", continent, share:<fraction of that continent's faithful, signed>, note:""}
//
// A schism, a mass conversion, an exodus after a scandal: real people moving,
// stated as a number, logged with why. Never more than a fifth of a continent
// in one op — nothing in the Church's history moved more at once.

export const applyFaithfulOps = (church, ops, { date = "" } = {}) => {
  const c = normalizeChurch(church);
  if (!c) return c;
  let faithful = { ...c.faithful };
  const log = [...c.log];
  for (const raw of Array.isArray(ops) ? ops : []) {
    if (!raw || typeof raw !== "object") continue;
    const continent = String(raw.continent ?? "").trim().toLowerCase();
    if (!CONTINENTS.includes(continent)) continue;
    const before = faithful[continent];
    const cap = before * 0.2;
    let delta = raw.share !== undefined ? before * finite(raw.share, 0) : finite(raw.delta, 0);
    delta = clamp(delta, -cap, cap);
    if (delta === 0) continue;
    faithful[continent] = Math.max(0, Math.round(before + delta));
    const note = String(raw.note ?? "").trim();
    log.push(`${date || "undated"}: ${continent} ${delta > 0 ? "+" : ""}${Math.round(delta).toLocaleString("en-US")}${note ? ` — ${note}` : ""}`);
  }
  return { ...c, faithful, log: log.slice(-12) };
};

// ---- what the model and the player read ----------------------------------------------------

const M = (n) => `${(n / 1e6).toFixed(1)} M`;

export const describeFaithful = (church) => {
  const c = normalizeChurch(church);
  if (!c) return "";
  const total = totalFaithful(c.faithful);
  const parts = CONTINENTS.map((k) => `${k} ${M(c.faithful[k])} (${(100 * c.faithful[k] / Math.max(1, total)).toFixed(1)}%)`).join(", ");
  const last = c.log.at(-1);
  return `${(total / 1e9).toFixed(3)} milliard de fidèles${c.asOf ? ` au ${c.asOf}` : ""} — ${parts}.${last ? ` Dernier mouvement: ${last}.` : ""}`;
};

export const FAITHFUL_RULES = `[Fidèles — registre vivant]
Le nombre de catholiques ci-dessus est un ÉTAT du jeu, pas une estimation : il est recalculé à chaque tour par le moteur à partir des vraies croissances continentales (Afrique +3,31 %/an, Océanie +1,9 %, Amériques ~+0,76 %, Asie +0,6 %, Europe +0,2 %) et de la légitimité du Saint-Siège — un pape dont le standing s'effondre voit les fidèles quitter l'Église là où c'est un acte (Europe, Amériques, Océanie), un pape respecté les retient. Narrez CES chiffres. Quand un événement déplace réellement des fidèles — un schisme qui emporte une communauté, une conversion de masse, un exode après un scandale — enregistrez-le avec impacts.faithfulOps [{"op":"shift","continent":"africa|americas|asia|europe|oceania","delta":<personnes, signé>,"note":"<pourquoi>"}] (ou "share" pour une fraction du continent). Jamais plus d'un cinquième d'un continent en une fois. Une perte narrée sans faithfulOps n'a pas eu lieu.
[Église — the six fronts]
A pope faces six fronts at once, and every edition of the bulletin must show more than one of them. They are, in the order the press itself lists them for a new pontificate: the unity of the Church (progressive and conservative currents, the German synodal path, the dubia); the fight against sexual abuse (zero tolerance, sanctions on bishops who covered up); synodality and governance (a less clerical Church, lay people and women in decision-making); the crisis of vocations (fewer priests and religious, above all in Europe and the West); diplomacy and peace (a moral voice in conflicts, persecuted Christians); and the finances (the structural deficit, the patrimony, the pensions).
Money is a hard, permanent constraint and the ledger must feel it — but it is ONE front of six. Across a jump, at most a third of the events may be about money; the rest must come from the other five, drawn from the faithful ledger above, the factions' declared aims, and what the Church actually does: liturgy, doctrine, appointments of bishops, canonisations, pilgrimages, synods, dioceses, missions, schools and hospitals, encyclicals. A turn that is nothing but banks and lawsuits is a modelling error.`;
