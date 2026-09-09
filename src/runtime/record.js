/*! Open Historia — the record: what the engine actually moved, turn by turn © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// "Il faudrait un papier qui actualise tour par tour toute info dès qu'il s'agit
// d'argent … pour avoir un fond non narratif."
//
// This is that paper. Every row is written by the ENGINE when a stock actually
// moved — money collected on a drive, a loan disbursed, sabotage that cost real
// capital, the year's balance drawn on the patrimony. Nothing writes a row by
// saying so: a story that claims a sum arrived leaves this page unchanged,
// which is precisely how the player can tell the two apart.
//
// It is therefore a trace, not a claim, and the same for every polity and era:
// a Renaissance treasury's drawdown and a modern budget's deficit are one row
// each, in the engine's own unit, with the date and what caused them.

const str = (v) => String(v ?? "").trim();
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// What a row can be about. Money first, because that is what the player could
// never verify; the same shape carries people and standing so the paper is one
// paper and not three.
export const RECORD_KINDS = ["money", "patrimony", "people", "standing"];

export const RECORD_CAP = 200;

export const normalizeRecordRow = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const what = str(entry.what);
  if (!what) return null;
  return {
    date: str(entry.date),
    polity: str(entry.polity),
    kind: RECORD_KINDS.includes(str(entry.kind)) ? str(entry.kind) : "money",
    what,
    // Signed, in the unit named. Money and patrimony are in SY, the engine's
    // own unit, so a row can never mean two different things.
    amount: num(entry.amount),
    unit: str(entry.unit) || "SY",
    // Where it came from, in the engine's terms: "drive:Road show",
    // "loan:Germany", "step:deficit". Never a sentence.
    source: str(entry.source),
    note: str(entry.note),
  };
};

export const normalizeRecord = (list) => (Array.isArray(list) ? list : [])
  .map(normalizeRecordRow).filter(Boolean).slice(-RECORD_CAP);

/** Appends rows, newest last, capped. Returns the same array when nothing was added. */
export const appendRecord = (record, rows) => {
  const add = (Array.isArray(rows) ? rows : []).map(normalizeRecordRow).filter(Boolean);
  if (!add.length) return normalizeRecord(record);
  return [...normalizeRecord(record), ...add].slice(-RECORD_CAP);
};

/** Rows written on this date. */
export const recordOn = (record, date) => normalizeRecord(record).filter((r) => r.date === str(date));

/** What the record says a polity's money did over the rows it holds. */
export const recordTotals = (record, polity = "") => {
  const rows = normalizeRecord(record).filter((r) => !polity || r.polity === polity);
  const by = {};
  for (const r of rows) by[r.kind] = (by[r.kind] ?? 0) + r.amount;
  return by;
};

const fmt = (n) => `${n >= 0 ? "+" : "−"}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

/**
 * The paper as the model reads it: the last rows, dated, with what moved and
 * what caused it — then the rule that says why it is empty when it is empty.
 */
export const describeRecord = (record, { player = "", limit = 24 } = {}) => {
  const rows = normalizeRecord(record).slice(-limit);
  const head = "[The Record — what the engine actually moved]";
  if (!rows.length) {
    return `${head}\nNothing has moved yet. No sum has entered or left ${player || "the treasury"} since this record began: whatever past editions said about money arriving, the stocks are where they started.\n\n${RECORD_RULES}`;
  }
  const lines = rows.map((r) => `- ${r.date || "undated"} ${r.polity ? `${r.polity}: ` : ""}${r.what} ${fmt(r.amount)} ${r.unit}${r.source ? ` (${r.source})` : ""}${r.note ? ` — ${r.note}` : ""}`);
  return `${head}\n${lines.join("\n")}\n\n${RECORD_RULES}`;
};

export const RECORD_RULES = [
  "This page is written by the engine, never by narration. A row appears when a stock actually moved — a drive collected, a loan disbursed, a deficit drawn on the patrimony. An event that says money arrived and carries no lever writes nothing here, and the player reads the difference.",
  "So: before writing that a sum was received, registered, credited or paid, carry the lever that moves it (driveOps, an intent resolve with a loan payload, an economy op). If you cannot, write instead what actually happened — a promise made, a condition still unmet, a transfer still to come — and say what would bring it in.",
  "When the player believes they hold money this page does not show, the page is right.",
].join("\n");
