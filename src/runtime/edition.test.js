/*! Open Historia — edition switch tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { HAS_MAP, HOME_SECTION } from "./edition.js";

// The main process cannot import an ES module, so the map switch exists twice:
// here for the renderer, and as EDITION_HAS_MAP in electron/main.cjs, where it
// decides whether 289 MB of tiles are downloaded on first run. A repeated
// constant nobody checks is exactly how a game ends up fetching cartography it
// no longer draws — or worse, drawing a map whose tiles were never fetched.
test("the main process and the renderer agree about whether this edition has a map", () => {
  const main = fs.readFileSync(path.join(process.cwd(), "electron", "main.cjs"), "utf8");
  const declared = main.match(/^const EDITION_HAS_MAP = (true|false);/m);
  assert.ok(declared, "electron/main.cjs must declare EDITION_HAS_MAP at the top level");
  assert.equal(declared[1] === "true", HAS_MAP,
    `electron/main.cjs says ${declared[1]} and src/runtime/edition.js says ${HAS_MAP}`);
});

test("with no map the game opens on the paper, and with one it opens on the atlas", () => {
  assert.equal(HOME_SECTION, HAS_MAP ? "map" : "bulletin");
  // Whichever edition this is, the front door must be a page the navigation
  // actually offers, or the app opens on a tab that does not exist.
  const nav = fs.readFileSync(path.join(process.cwd(), "src", "Game", "GameUI", "main.jsx"), "utf8");
  assert.match(nav, new RegExp(`\\["${HOME_SECTION}"`), "the home section must be a real tab");
});
