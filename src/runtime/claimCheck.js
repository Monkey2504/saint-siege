/*! Open Historia — checking what is said about the accounts against what the engine holds © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The failure this exists for, from a real campaign. The adviser was handed the
// engine's own line — "revenue 335,266 ... spends 353,907, balance -18,641 ...
// gone in about 36 years at this deficit" — and answered with "dépenses 300 000
// SY/an, solde +35 266 SY/an, le déficit initial est intégralement résorbé".
// It kept the one figure it was given and invented the one that made the story
// work. Grounding a model is not enough; what it says about the accounts has to
// be checked against them, mechanically, and corrected in front of the player.
//
// Same for every polity and every era: the check reads the engine's own
// indicators, so it holds for a Renaissance treasury as for a modern budget.

const str = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

// A figure as people write it: "353 907", "335,266", "1,74 million", "30 M€".
const FIGURE = /(\d{1,3}(?:[ ., ]\d{3})+|\d+(?:[.,]\d+)?)\s*(millions?|milliards?|billions?|bn|M€|M\$|k)?/gi;

const readFigure = (raw, unit) => {
  const cleaned = /^\d{1,3}([ ., ]\d{3})+$/.test(raw)
    ? raw.replace(/[ ., ]/g, "")
    : raw.replace(/\s/g, "").replace(",", ".");
  let n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  const u = str(unit).toLowerCase();
  if (/^(milliard|billion|bn)/.test(u)) n *= 1e9;
  else if (/^(million|m€|m\$)/.test(u)) n *= 1e6;
  else if (u === "k") n *= 1e3;
  return n;
};

/** Every number a text states, with the words immediately before it. */
const claimsIn = (text) => {
  const out = [];
  const s = str(text);
  for (const m of s.matchAll(FIGURE)) {
    const value = readFigure(m[1], m[2]);
    if (value == null) continue;
    // Both sides: French puts the label before the figure ("dépenses :
    // 300 000") and after it just as often ("80 000 SY en caisse").
    const at = m.index ?? 0;
    out.push({
      value,
      at,
      before: s.slice(Math.max(0, at - 70), at).toLowerCase(),
      after: s.slice(at + m[0].length, at + m[0].length + 40).toLowerCase(),
    });
  }
  return out;
};

// The aggregates worth checking, each with the words that name it. Ordered:
// the first label that matches the run-up to a figure claims it.
const AGGREGATES = [
  { key: "spending", label: "annual spending", re: /\b(d[ée]penses?|spending|spends|charges|co[ûu]ts? annuels?)\b/ },
  { key: "revenue", label: "annual revenue", re: /\b(revenus?|recettes?|revenue|produits?)\b/ },
  { key: "balance", label: "the yearly balance", re: /\b(solde|balance|d[ée]ficit|exc[ée]dent|surplus)\b/ },
  { key: "treasury", label: "cash in hand", re: /\b(tr[ée]sorerie|en caisse|caisse|treasury|liquidit[ée]s|cash)\b/ },
  { key: "endowment", label: "the patrimony", re: /\b(patrimoine|endowment|dotation|actifs?)\b/ },
  { key: "unfundedLiabilities", label: "the unfunded promises", re: /\b(retraites?|pensions?|unfunded|engagements? non financ)/ },
];

// A claim inside this band of the engine's figure is a rounding, not a lie.
const TOLERANCE = 0.08;

const fmt = (n) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(2)} million` : Math.round(n).toLocaleString("en-US"));

/**
 * What a reply gets wrong about the accounts. `indicators` is economyIndicators'
 * output. Returns one line per contradicted aggregate, plus the sign check that
 * catches "the deficit is fully absorbed" when the engine still shows one.
 */
export const checkLedgerClaims = (text, indicators) => {
  const body = str(text);
  const i = indicators && typeof indicators === "object" ? indicators : null;
  if (!body || !i) return [];
  const out = [];
  const said = new Set();

  // A stated surplus while the engine shows a deficit — the exact failure that
  // prompted this file. Checked on words, because the claim is often made
  // without restating the figure.
  const balance = num(i.balance);
  // The claim is usually made in words, and the words are rarely adjacent:
  // "le déficit initial de -18 641 SY/an est intégralement résorbé".
  if (balance != null && balance < 0 && /\b(exc[ée]dent|surplus|solde (?:budg[ée]taire )?(?:net )?positif|repass[ée]e? en (?:solde )?positif|back in surplus)\b/i.test(body)) {
    out.push(`It says the deficit is closed. The engine shows a deficit of ${fmt(Math.abs(balance))} SY a year, still eating the patrimony.`);
    said.add("balance");
  }
  // The same claim made as a verb about the deficit, with anything in between.
  if (balance != null && balance < 0 && !said.has("balance")
    && /\bd[ée]ficit\b[^.!?]{0,60}\b(r[ée]sorb\w*|combl\w*|effac\w*|[ée]limin\w*|annul\w*)\b/i.test(body)) {
    out.push(`It says the deficit is closed. The engine shows a deficit of ${fmt(Math.abs(balance))} SY a year, still eating the patrimony.`);
    said.add("balance");
  }
  if (balance != null && balance < 0 && !said.has("balance")
    && /\bdeficit\b[^.!?]{0,60}\b(closed|absorbed|resolved|erased|eliminated|wiped)\b/i.test(body)) {
    out.push(`It says the deficit is closed. The engine shows a deficit of ${fmt(Math.abs(balance))} SY a year, still eating the patrimony.`);
    said.add("balance");
  }

  for (const claim of claimsIn(body)) {
    // The label nearest the figure names it. A sentence often carries several
    // ("353 907 SY de dépenses contre 335 266 de recettes : le déficit reste
    // de 18 641"), and the first in list order is usually the wrong one.
    let hit = null;
    let best = -1;
    for (const a of AGGREGATES) {
      const m = [...claim.before.matchAll(new RegExp(a.re.source, "gi"))].pop();
      if (m && (m.index ?? -1) > best) { best = m.index ?? -1; hit = a; }
    }
    if (!hit) hit = AGGREGATES.find((a) => a.re.test(claim.after)) ?? null;
    if (!hit || said.has(hit.key)) continue;
    const actual = num(i[hit.key]);
    if (actual == null) continue;
    const scale = Math.max(Math.abs(actual), 1);
    if (Math.abs(claim.value - Math.abs(actual)) / scale <= TOLERANCE) continue;
    // Only flag a figure of comparable magnitude: a sentence about 30 million
    // euros of yield is not a wrong claim about 353,907 SY of spending.
    const ratio = claim.value / scale;
    if (ratio < 0.05 || ratio > 20) continue;
    out.push(`It gives ${hit.label} as ${fmt(claim.value)}. The engine holds ${fmt(actual)} SY.`);
    said.add(hit.key);
  }
  return out;
};

/** The correction shown under a reply that contradicted the accounts. */
export const describeLedgerCorrections = (lines) => (Array.isArray(lines) && lines.length
  ? `\n\n**Checked against the ledger**\n${lines.map((l) => `- ${l}`).join("\n")}\n\nThese are the engine's own figures. Where the reply above disagrees with them, the figures are right.`
  : "");

export const LEDGER_HONESTY_RULE = [
  "[The Accounts — figures are not yours to choose]",
  "Every figure you state about revenue, spending, the balance, cash in hand, the patrimony or the unfunded promises must be the one in the ground-truth block above, or derived from it by arithmetic you show. Never restate one true figure and invent the one beside it to make a result come out.",
  "A deficit is closed only when the ground truth says the balance is positive. Money exists only where the engine holds it: a sum promised in a letter, registered in a story or announced by a body is not in the treasury until the ledger says it is. If the player believes they hold money the ledger does not show, say so plainly and say what would actually bring it in.",
  "The engine checks what you say against the accounts and prints the correction under your answer, so a flattering figure is not a kindness — it is a contradiction the player will read a line later.",
].join("\n");
