import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Legibility as a measurement, not a screenshot. Every inline style object in
// the player-facing interface that paints both a text colour and a ground has
// its two tokens resolved to the palette's real values and its WCAG contrast
// ratio computed; anything under 4.5:1 fails. Two further rules catch the pairs
// a ratio cannot see because the ground is inherited: a solid accent or alert
// ground must carry the on-accent colour (ink on blue is the exact failure the
// player kept photographing), and a paper token is never a text colour.

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");
const ROOTS = ["Game/GameUI", "Game/Selection", "runtime"];
const SKIP = [/\/Editor\//, /\/web\//, /\.test\.js$/, /basemapLibrary\.js$/, /Preset\.js$/, /CountryPickerMap\.jsx$/];

// ---- the palette, read from the sheet so the audit can never drift from it ----
const theme = fs.readFileSync(path.join(SRC, "theme.css"), "utf8");
const block = (selector) => {
  const open = theme.indexOf(`${selector} {`);
  return open === -1 ? "" : theme.slice(open, theme.indexOf("\n}", open));
};
const tokensIn = (text) => {
  const out = {};
  for (const m of text.matchAll(/--oh-([a-z0-9-]+):\s*([^;]+);/g)) out[`--oh-${m[1]}`] = m[2].trim();
  return out;
};

const ROOT = tokensIn(block(":root"));

// Every room in the house, not just the ground floor. The palette used to be
// read from :root alone, so when the sections grew their own paper the audit
// went on measuring a palette two of them no longer used — ink from one room on
// another room's ground would have shipped unmeasured, which is the whole
// failure this file exists to prevent. A room inherits what it does not
// redefine, exactly as the cascade does, and is measured on the result.
const SURFACES = [...theme.matchAll(/\[data-surface="([a-z]+)"\]\s*\{/g)].map((m) => m[1]);
const PALETTES = [
  { room: ":root", tokens: ROOT },
  ...SURFACES.map((room) => ({ room, tokens: { ...ROOT, ...tokensIn(block(`[data-surface="${room}"]`)) } })),
];

// The palette in force while a pair is being measured. Set per room below.
let TOKENS = ROOT;

const hexToRgb = (hex) => {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
};
const parse = (value) => {
  const v = String(value).trim();
  const tok = v.match(/^var\((--oh-[a-z0-9-]+)\)$/);
  if (tok) return TOKENS[tok[1]] ? parse(TOKENS[tok[1]]) : null;
  if (/^#[0-9a-f]{3,6}$/i.test(v)) return { rgb: hexToRgb(v), a: 1 };
  const rgba = v.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/);
  if (rgba) return { rgb: [+rgba[1], +rgba[2], +rgba[3]], a: rgba[4] === undefined ? 1 : +rgba[4] };
  return null;
};
const luminance = ([r, g, b]) => {
  const f = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
// A translucent ground is composited over the paper of the room being measured.
const over = ({ rgb, a }) => {
  const paper = parse(TOKENS["--oh-plate"]).rgb;
  return rgb.map((c, i) => Math.round(c * a + paper[i] * (1 - a)));
};
const contrast = (fg, bg) => {
  const l1 = luminance(over(fg));
  const l2 = luminance(over(bg));
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
};

// ---- style objects, found by brace matching ------------------------------------
const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.jsx$/.test(name)) out.push(full);
  }
  return out;
};
const files = ROOTS.flatMap((r) => walk(path.join(SRC, r))).filter((f) => !SKIP.some((re) => re.test(f.replace(/\\/g, "/"))));
const rel = (f) => path.relative(SRC, f).replace(/\\/g, "/");

// Comments are blanked (newlines kept, so line numbers hold) before any brace
// is matched: an apostrophe in a comment — "the player's words", "can't" —
// used to open a string that never closed, and every style object after it in
// the file went unaudited. That is how ink on the accent shipped in the
// adviser's own bubble. Strings are still honoured while blanking, so a "//"
// inside a URL is not a comment.
const stripComments = (text) => {
  let out = ""; let quote = null; let i = 0;
  while (i < text.length) {
    const ch = text[i]; const next = text[i + 1];
    if (quote) {
      out += ch;
      if (ch === "\\") { out += next ?? ""; i += 2; continue; }
      if (ch === quote || (ch === "\n" && quote !== "`")) quote = null;
      i += 1; continue;
    }
    // A ' right after a letter is an apostrophe in JSX text ("the state's
    // hand"), never a string opener; a string opener follows punctuation.
    if (ch === '"' || (ch === "'" && !/[\p{L}\p{N}]/u.test(text[i - 1] ?? "")) || ch === "`") { quote = ch; out += ch; i += 1; continue; }
    if (ch === "/" && next === "/") { while (i < text.length && text[i] !== "\n") { out += " "; i += 1; } continue; }
    if (ch === "/" && next === "*") { const end = text.indexOf("*/", i + 2); const stop = end === -1 ? text.length : end + 2; for (; i < stop; i += 1) out += text[i] === "\n" ? "\n" : " "; continue; }
    out += ch; i += 1;
  }
  return out;
};

const matchBrace = (text, open) => {
  let depth = 0; let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    // A single- or double-quoted string cannot cross a line: one that seems
    // to is an apostrophe in JSX text ("don't"), not a string.
    if (quote) { if (ch === "\\") { i += 1; continue; } if (ch === quote || (ch === "\n" && quote !== "`")) quote = null; continue; }
    if (ch === '"' || (ch === "'" && !/[\p{L}\p{N}]/u.test(text[i - 1] ?? "")) || ch === "`") { quote = ch; continue; }
    if (ch === "{") depth += 1;
    else if (ch === "}") { depth -= 1; if (depth === 0) return i + 1; }
  }
  return -1;
};

// Every literal object that looks like a style: it names a CSS-ish property.
const unbalanced = [];
const styleObjects = (raw, file = "") => {
  const text = stripComments(raw);
  const out = [];
  let i = 0;
  while ((i = text.indexOf("{", i)) !== -1) {
    const end = matchBrace(text, i);
    if (end === -1) { unbalanced.push(`${file}:${text.slice(0, i).split("\n").length}`); break; }
    const body = text.slice(i, end);
    // Innermost objects only: a region that holds another brace is a component
    // or a block, and pairing a colour from one child with a ground from another
    // would measure a pair nobody painted.
    if (!body.slice(1).includes("{") && /\b(color|background|backgroundColor)\s*:/.test(body)) {
      out.push({ body, line: text.slice(0, i).split("\n").length });
    }
    i += 1;
  }
  return out;
};

// A property's value when it is a plain string; a ternary yields its branches
// with the condition they hang on, so two ternaries on the same condition are
// paired branch by branch — hovered text goes with the hovered ground, not with
// the resting one.
const values = (body, prop) => {
  const m = body.match(new RegExp(`\\b${prop}\\s*:\\s*([^,}\\n]+)`));
  if (!m) return [];
  const expr = m[1].trim();
  const cond = expr.includes("?") ? expr.slice(0, expr.indexOf("?")).trim() : "";
  return [...expr.matchAll(/"([^"]*)"/g)].map((x, index) => ({ value: x[1], cond, index }));
};
const pairs = (fgs, bgs) => {
  const out = [];
  for (const fg of fgs) for (const bg of bgs) {
    if (fg.cond && bg.cond && fg.cond === bg.cond && fg.index !== bg.index) continue;
    out.push([fg.value, bg.value]);
  }
  return out;
};

const isSolidAccent = (v) => /^var\(--oh-(accent|alert|grant|caution)\)$/.test(v);
const isPaper = (v) => /^var\(--oh-(plate|plate-2|ground)\)$/.test(v);

test("every text/ground pair painted together reads at 4.5:1 or better, in every room", () => {
  const offenders = [];
  for (const palette of PALETTES) {
    TOKENS = palette.tokens;
    for (const file of files) {
      const text = fs.readFileSync(file, "utf8");
      for (const obj of styleObjects(text, rel(file))) {
        const fgs = values(obj.body, "color");
        const bgs = [...values(obj.body, "backgroundColor"), ...values(obj.body, "background")];
        if (!fgs.length || !bgs.length) continue;
        for (const [fg, bg] of pairs(fgs, bgs)) {
          const f = parse(fg); const b = parse(bg);
          if (!f || !b || b.a < 0.05) continue; // "none", gradients, images: not measurable here
          const ratio = contrast(f, b);
          if (ratio < 4.5) offenders.push(`[${palette.room}] ${rel(file)}:${obj.line}: ${fg} on ${bg} = ${ratio.toFixed(2)}:1`);
        }
      }
    }
  }
  TOKENS = ROOT;
  assert.deepEqual(offenders, [], `low contrast:\n${offenders.join("\n")}`);
});

// One paper and one ink for the whole house.
//
// The first attempt at giving the sections their own character gave each of
// them its own paper and its own ink as well — five beiges and greys, none of
// them committed — and the player's verdict was immediate: less good, not more
// coherent, and the bulletin dragged off a direction nobody had complained
// about. Every pair still measured above 4.5:1 throughout, which is exactly why
// this rule exists as well: a ratio measures legibility and says nothing about
// whether a page holds together.
//
// So a room may change how it sets type and which single accent marks it. The
// paper, the ink and the rules belong to the house.
const HOUSE_TOKENS = [
  "--oh-ground", "--oh-plate", "--oh-plate-rgb", "--oh-plate-2",
  "--oh-line", "--oh-line-strong",
  "--oh-text", "--oh-text-strong", "--oh-text-dim", "--oh-on-accent",
];

test("no room repaints the house: one paper, one ink, whatever the section", () => {
  const offenders = [];
  for (const room of SURFACES) {
    const own = tokensIn(block(`[data-surface="${room}"]`));
    const taken = HOUSE_TOKENS.filter((token) => token in own);
    if (taken.length) offenders.push(`${room}: ${taken.join(", ")}`);
  }
  assert.deepEqual(offenders, [], `rooms repainting the house:\n${offenders.join("\n")}`);
});

test("a solid accent, alert, grant or caution ground carries the on-accent colour, never ink", () => {
  const offenders = [];
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    for (const obj of styleObjects(text, rel(file))) {
      const bgVals = [...values(obj.body, "backgroundColor"), ...values(obj.body, "background")];
      const bgs = bgVals.map((v) => v.value);
      if (!bgs.some(isSolidAccent)) continue;
      // A thin thing with no text of its own (a dot, a bar, a swatch) is exempt.
      if (/\b(height|width)\s*:\s*"?(\d|0\.)/.test(obj.body) && !/\bcolor\s*:/.test(obj.body)) continue;
      const fgVals = values(obj.body, "color");
      // Branch by branch: an armed button is on-accent when its ground is the
      // accent and ink when its ground is the tint — both halves are right.
      const bad = pairs(fgVals, bgVals).filter(([fg, bg]) => isSolidAccent(bg) && /^var\(--oh-text/.test(fg)).map(([fg, bg]) => `${fg} on ${bg}`);
      if (bad.length) offenders.push(`${rel(file)}:${obj.line}: ${bad.join(", ")}`);
      if (!fgVals.length && /\b(padding|fontSize|fontWeight)\b/.test(obj.body)) offenders.push(`${rel(file)}:${obj.line}: text on ${bgs.filter(isSolidAccent).join("/")} inherits ink (no color set)`);
    }
  }
  assert.deepEqual(offenders, [], `ink on a solid ground:\n${offenders.join("\n")}`);
});

test("a paper token is never a text colour", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/\bcolor\s*:\s*"var\(--oh-(plate|plate-2|ground)\)"/.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `paper as text:\n${offenders.join("\n")}`);
});

// Runs last: the audits above have parsed every file by now. A file whose
// braces stopped matching was audited only up to that point, and everything
// after it — the adviser's bubbles, say — was never measured.
test("every audited file parses to its end, so nothing after a stray quote goes unmeasured", () => {
  assert.deepEqual(unbalanced, [], `parse stopped early in:\n${unbalanced.join("\n")}`);
});
