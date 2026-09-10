import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The design system as a rule, not a hope. Every colour and every size in the
// player-facing interface goes through the role tokens in theme.css; a literal
// is a surface that stays behind when the direction changes, and a French string
// in a component is a string the runtime translator cannot turn into the
// player's language. Both were reintroduced, by hand, more than once. This test
// makes reintroducing them a failure instead of a screenshot.

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");

// Player-facing code. The map editor is its own tool; the web home page is a
// site, not the game; tests and data modules are content, not chrome.
const ROOTS = ["Game/GameUI", "Game/Selection", "runtime"];
const SKIP = [/\/Editor\//, /\/web\//, /\.test\.js$/, /basemapLibrary\.js$/, /Preset\.js$/, /Faithful\.js$/, /worldReach\.js$/, /organizations\.js$/, /intents\.js$/, /migration\.js$/, /wars\.js$/, /succession\.js$/, /realityCheck\.js$/, /economy\.js$/, /economyBridge\.js$/, /gameState\.js$/, /rejections\.js$/, /churchPreset/];

// What is allowed to stay literal, and why. Keep this list short and justified.
const ALLOWED = [
  // A modal scrim must stay dark whatever the paper does.
  { file: "GameUI/main.jsx", pattern: /rgba\(0, 0, 0, 0\.7\)/ },
  { file: "GameUI/libraryBar.jsx", pattern: /rgba\(0,0,0,0\.55\)/ },
  // Map canvases and their overlays: the globe is not the interface.
  { file: "GameUI/CountryPickerMap.jsx", pattern: /#0a0c15|#[0-9a-f]{6}/ },
  // A chart's series encode which line is which: distinct hues, not chrome.
  { file: "GameUI/advisor.jsx", pattern: /#b0568f|#4a7fa5|#6b5aa8|#1f3f86|#1f7a4d|#a35c07|#d9382b|#f4f0e6|#14161a|#2a2d33|#5c6068|#cbc7bd/ },
  { file: "GameUI/stats.jsx", pattern: /color: "#[0-9a-f]{6}"/ },
  { file: "GameUI/chat.jsx", pattern: /#ef4444|#f97316|#eab308|#14b8a6|#ec4899|boxShadow/ },
  // Shadows are depth, not colour: a black at low alpha under a plate is fine.
  { file: "*", pattern: /rgba\(0, ?0, ?0, ?0\.[0-9]+\)/ },
  // The startup screen's grain mask and gradient stops on the paper's own channels.
  { file: "runtime/StartupScreen.jsx", pattern: /rgba\(var\(--oh-plate-rgb\)|data:image\/svg\+xml/ },
  { file: "runtime/StartupScreen.jsx", pattern: /rgba\(0, ?0, ?0, ?0\)/ },
  { file: "styles.css", pattern: /rgba\(0, 0, 0, 0\.8\)/ },
  // Brand colours of third parties are theirs, not the direction's.
  { file: "GameUI/settings.jsx", pattern: /rgba\(88, 101, 242|rgba\(255, 69, 0/ },
  // The default value of a colour input is data the player edits, not chrome.
  { file: "GameUI/libraryBar.jsx", pattern: /labelTextColor|labelHaloColor/ },
  { file: "GameUI/scenarios.jsx", pattern: /labelTextColor|labelHaloColor/ },
  // Map overlays paint on a canvas that cannot read a custom property.
  { file: "GameUI/CountryPickerMap.jsx", pattern: /rgba\(/ },
];

const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|css)$/.test(name)) out.push(full);
  }
  return out;
};

const files = ROOTS.flatMap((root) => walk(path.join(SRC, root)))
  .filter((file) => !SKIP.some((re) => re.test(file.replace(/\\/g, "/"))));

const rel = (file) => path.relative(SRC, file).replace(/\\/g, "/");
const allowed = (file, line) => ALLOWED.some((a) => (a.file === "*" || rel(file).endsWith(a.file)) && a.pattern.test(line));

test("no colour is written as a literal in the player-facing interface", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/#[0-9a-fA-F]{6}\b|rgba?\([0-9]/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment may name a colour
      if (allowed(file, line)) return;
      offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `colour literals:\n${offenders.join("\n")}`);
});

test("no font size is written outside the scale in the player-facing interface", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/fontSize: "[0-9.]+(rem|px)"|font-size: [0-9.]+(rem|px)/.test(line) && !/clamp\(/.test(line)) {
        offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `off-scale sizes:\n${offenders.join("\n")}`);
});

// Interface strings are FRENCH in the source. This test used to require the
// opposite, and it was wrong.
//
// The reasoning behind the old rule was that English sources let the runtime
// translator reach every player. In practice the translator needs the model, and
// its offline safety net — the packs in public/lang — is generated by hand and
// goes stale: on the day this changed, fr.json was six days old and held not one
// string the game actually showed, not even "Next edition". So the player put
// the game on Vercel, opened it, and read a half-English interface. His verdict:
// "quand le jeu commence il commence en français, je veux que tu code tout en
// français, j'ai toujours été clair là-dessus." He had been.
//
// French in the source needs no model, no key, no quota and no regenerated pack:
// it is simply what the page says. Other languages still work — the translator
// reads French as happily as English — but they are now the case that degrades,
// instead of the player's own language being the case that degrades.
//
// This test does not force French (a proper noun or a code name may be anything);
// it forbids reintroducing the old rule by catching the English boilerplate that
// used to be everywhere in these files.
const ENGLISH_UI_TELLS = /(?:>|")\s*(?:Cancel|Close|Save|Delete|Send|Search|Loading|Settings|Back|Next|Confirm|Continue)\s*(?:<|")/;

test("interface strings are in the player's own language, not waiting on a translator", () => {
  const offenders = [];
  for (const file of files) {
    if (!file.endsWith(".jsx")) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (ENGLISH_UI_TELLS.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `English interface strings:\n${offenders.join("\n")}`);
});

// Components whose whole surface is the accent by construction: a dateline
// chip, a primary button, the banner's action, the error screen's action.
const ON_ACCENT_ALLOWED = [
  { file: "GameUI/bulletin.jsx", pattern: /Dateline|Advance time|Sign and begin|background: tone === "alert"/ },
  { file: "GameUI/bulletin.jsx", pattern: /color: "var\(--oh-on-accent\)"/ },
  { file: "runtime/AppUpdateBanner.jsx", pattern: /./ },
  { file: "runtime/ErrorBoundary.jsx", pattern: /./ },
  { file: "GameUI/main.jsx", pattern: /./ },
  { file: "styles.css", pattern: /./ },
  { file: "GameUI/verdict.jsx", pattern: /./ },
  { file: "theme.css", pattern: /./ },
];

test("on-accent sits only on an accent or alert ground", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/oh-on-accent/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // The ground may sit a few lines above the colour in a multi-line object.
      const window = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
      if (/(background|backgroundColor|background-color)[^;]*var\(--oh-(accent|alert)\)/.test(window)) return;
      if (ON_ACCENT_ALLOWED.some((a) => rel(file).endsWith(a.file) && a.pattern.test(line))) return;
      offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `on-accent off the accent:\n${offenders.join("\n")}`);
});
