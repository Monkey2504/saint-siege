#!/usr/bin/env node
/*! Open Historia — turn a played game into a playable episode © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The problem this solves: a fresh scenario opens on turn one of a world where
// nothing has happened yet. Whoever you hand it to has to play for months of
// game time before the situation is worth anything. Meanwhile a game somebody
// has actually played is exactly that situation — the schemes are advanced, the
// treasury is stressed, the bodies have voted, the leaders are in place.
//
// This copies a save into a scenario, so months already played become someone
// else's opening position. The world, the economies, the organizations, the
// intents, the wars, the leaders and the events all carry over; what is personal
// to the player's own run — the queued orders and the chat threads — does not.
//
//   node scripts/make-episode.mjs <save-id> <episode-id> [--name "..."] \
//        [--subtitle "..."] [--description "..."] [--accent "#1f3f86"]
//
// Without --data it writes into the repo (so the episode ships with the app) and
// into the installed app's data directory when that exists (so it appears now).

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const REPO_DATA = path.resolve(process.cwd(), "server/data");
const APPDATA = process.env.APPDATA
  ? path.join(process.env.APPDATA, "open-historia/server/data")
  : null;

const args = process.argv.slice(2);
const positional = args.filter((a) => !a.startsWith("--"));
const flag = (name, fallback = "") => {
  const at = args.indexOf(`--${name}`);
  return at >= 0 && args[at + 1] ? args[at + 1] : fallback;
};

const [saveId, episodeId] = positional;
if (!saveId || !episodeId) {
  console.error("usage: node scripts/make-episode.mjs <save-id> <episode-id> [--name ...]");
  process.exit(1);
}

const readJson = async (file, fallback = null) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
};

// The save is read from wherever games actually live: the installed app's data
// directory first, the repo second.
const roots = [APPDATA, REPO_DATA].filter(Boolean);
let sourceRoot = null;
for (const root of roots) {
  try {
    await fs.access(path.join(root, "games", saveId, "world.json"));
    sourceRoot = root;
    break;
  } catch {
    // keep looking
  }
}
if (!sourceRoot) {
  console.error(`no save '${saveId}' under ${roots.join(" or ")}`);
  process.exit(1);
}

const saveDir = path.join(sourceRoot, "games", saveId);
const world = await readJson(path.join(saveDir, "world.json"), {});
const game = await readJson(path.join(saveDir, "game.json"), {});
const events = await readJson(path.join(saveDir, "events.json"), []);

// What carries over is the world. What does not: the orders the previous player
// had queued and the conversations they were having — those belong to their run,
// and a new player inherits a situation, not someone else's inbox.
const episodeWorld = { ...world };
delete episodeWorld.actions;
delete episodeWorld.chats;

const name = flag("name", game.country ? `${game.country} — ${String(game.gameDate).slice(0, 4)}` : episodeId);
const scenario = {
  accentColor: flag("accent", "#1f3f86"),
  countryNameOverrides: world.countryNameOverrides ?? {},
  createdAt: new Date().toISOString(),
  description: flag(
    "description",
    `Reprise d'une partie jouée : ${game.country} au ${game.gameDate}. Les manœuvres sont engagées, les comptes ont bougé, les corps ont voté. Vous héritez d'une situation, pas d'un monde vide.`,
  ),
  eyebrow: "Épisode",
  heroSubtitle: flag("subtitle", `${game.country} — ${game.gameDate}`),
  heroTitle: name,
  id: episodeId,
  name,
  subtitle: flag("subtitle", `${game.country} — ${game.gameDate}`),
  updatedAt: new Date().toISOString(),
};

const episodeGame = {
  country: game.country,
  startDate: game.gameDate || game.startDate,
  gameDate: game.gameDate || game.startDate,
  round: 1,
  difficulty: game.difficulty || "standard",
  language: game.language || "English",
};

const write = async (root) => {
  const dir = path.join(root, "scenarios", episodeId);
  await fs.mkdir(path.join(dir, "storage"), { recursive: true });
  await fs.writeFile(path.join(dir, "world.json"), `${JSON.stringify(episodeWorld, null, 2)}\n`);
  await fs.writeFile(path.join(dir, "game.json"), `${JSON.stringify(episodeGame, null, 2)}\n`);
  await fs.writeFile(path.join(dir, "scenario.json"), `${JSON.stringify(scenario, null, 2)}\n`);
  await fs.writeFile(path.join(dir, "events.json"), `${JSON.stringify(events, null, 2)}\n`);

  // Colours and the prompt pack come from the base scenario unless the save
  // carried its own: an episode changes the situation, never the rules.
  for (const file of ["colors.json", "prompts.json"]) {
    const fromSave = path.join(saveDir, file);
    const fromBase = path.join(root, "scenarios/default", file);
    const target = path.join(dir, file);
    try {
      await fs.copyFile(fromSave, target);
    } catch {
      try {
        await fs.copyFile(fromBase, target);
      } catch {
        // A root with no base scenario simply gets none; the app falls back.
      }
    }
  }

  const manifestPath = path.join(root, "scenario-manifest.json");
  const manifest = (await readJson(manifestPath, null)) ?? { order: [], version: 2 };
  const order = Array.isArray(manifest.order) ? manifest.order : [];
  if (!order.includes(episodeId)) {
    manifest.order = [episodeId, ...order];
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  return dir;
};

for (const root of roots) {
  try {
    console.log(`written: ${await write(root)}`);
  } catch (error) {
    console.log(`skipped ${root}: ${error.message}`);
  }
}

const counts = {
  events: Array.isArray(events) ? events.length : 0,
  organizations: (episodeWorld.organizations ?? []).length,
  intents: (episodeWorld.intents ?? []).length,
  economies: Object.keys(episodeWorld.economies ?? {}).length,
  wars: (episodeWorld.wars ?? []).length,
  leaders: Object.keys(episodeWorld.leaders ?? {}).length,
};
console.log(`\n${name}: ${episodeGame.country} at ${episodeGame.gameDate}`);
for (const [key, value] of Object.entries(counts)) console.log(`  ${key}: ${value}`);
