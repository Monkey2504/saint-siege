import test from "node:test";
import assert from "node:assert/strict";
import { AGAINST_SHARE_CEILING, againstAllowance, describeEditionBalance, hostilePowers, measureEdition, movesAgainstPlayer } from "./editionBalance.js";
import { HOSTILE_ADVANCE_COOLDOWN_DAYS, applyIntentOps, normalizeIntent } from "./intents.js";
import { applyChurchPreset, HOLY_SEE } from "./churchPreset.js";

// The complaint this file exists for: every edition read as organisations
// plotting against the player rather than a head of state governing. Measured
// and capped, the same way money already is.

const story = (title, description, actor = "") => ({ title, description, actor, kind: "world" });

test("a story is counted against the player only when a power actually moves against them", () => {
  const hostiles = ["Vieille garde de la Secrétairerie d'État"];
  const opts = { player: HOLY_SEE, hostiles };
  assert.equal(movesAgainstPlayer(story("La Vieille garde bloque les nominations", "L'appareil obstrue la réforme du Saint-Siège.", "Vieille garde de la Secrétairerie d'État"), opts), true);
  // The player pushing back is governing, not being plotted against.
  assert.equal(movesAgainstPlayer(story("Le pape dénonce l'inertie curiale", "Le Saint-Siège condamne les blocages.", HOLY_SEE), opts), false);
  // Ordinary business is not a siege, whoever wrote it.
  assert.equal(movesAgainstPlayer(story("Ouverture du jubilé à Manille", "Deux millions de fidèles se rassemblent.", "Philippines"), opts), false);
  // Adversarial words about a third party are not against the player.
  assert.equal(movesAgainstPlayer(story("Berlin s'oppose à Varsovie", "Un veto allemand bloque le texte polonais.", "Germany"), { player: HOLY_SEE, hostiles: [] }), false);
});

test("the ceiling is a quarter of the edition and never less than one story", () => {
  assert.equal(AGAINST_SHARE_CEILING, 0.25);
  assert.equal(againstAllowance(8), 2);
  assert.equal(againstAllowance(3), 1, "a short edition still allows one");
  assert.equal(againstAllowance(0), 1);
});

test("measureEdition counts the siege beside the money, and the block tells the model the cap", () => {
  const world = applyChurchPreset({}, { date: "2026-09-01" });
  const events = [
    story("La Vieille garde fait fuiter le dossier", "Un document qui affaiblit le Saint-Siège fuite dans la presse italienne.", "Vieille garde de la Secrétairerie d'État"),
    story("Les dubia menacent d'une déclaration", "Cinq cardinaux menacent le Saint-Siège d'une contestation publique.", "Dubia des cardinaux conservateurs"),
    story("L'Appareil financier obstrue l'audit", "Les comptes exposés restent hors du périmètre, contre le Saint-Siège.", "Appareil financier du Vatican"),
    story("Ouverture du jubilé à Lagos", "Trois cent mille fidèles se rassemblent."),
  ];
  const m = measureEdition(events, { world, player: HOLY_SEE });
  assert.equal(m.total, 4);
  assert.equal(m.against, 3);
  assert.equal(m.againstAllowed, 1);
  const text = describeEditionBalance(events, { world, player: HOLY_SEE });
  assert.match(text, /3 of 4 events had a power moving against Saint-Siège/);
  assert.match(text, /AT MOST 1 may/);
  assert.match(text, /governs; they are not besieged/);
  // A calm edition is not lectured.
  const calm = describeEditionBalance([story("Ouverture du jubilé", "Des fidèles se rassemblent.")], { world, player: HOLY_SEE });
  assert.doesNotMatch(calm, /AT MOST/);
});

test("hostilePowers reads the declared schemes, so the count is state and not a guess", () => {
  const world = applyChurchPreset({}, { date: "2026-09-01" });
  const hostile = hostilePowers(world, HOLY_SEE);
  assert.ok(hostile.includes("Vieille garde de la Secrétairerie d'État"));
  assert.ok(!hostile.includes("Compagnie de Jésus"), "the faction carrying the programme is not a plotter");
});

test("a scheme with no declared stance pursues its own line, it does not plot", () => {
  assert.equal(normalizeIntent({ owner: "France", summary: "Rebuild the fleet" }).stance, "neutral");
  assert.equal(normalizeIntent({ owner: "France", summary: "Ruin the rival", stance: "hostile" }).stance, "hostile");
});

test("an unprovoked hostile scheme moves at most once per cool-down; the player's own order provokes it", () => {
  const base = [{
    id: "og-1", ownerType: "polity", owner: "Old Guard", target: HOLY_SEE, kind: "espionage",
    summary: "Slow the reform through appointments", stance: "hostile", secret: true, stage: 20,
    log: ["2026-09-01: leaked a memo"],
  }];
  const soon = applyIntentOps(base, [{ op: "advance", intent: "og-1", stageDelta: 15, note: "another leak" }], { date: "2026-09-20" });
  assert.equal(soon.intents[0].stage, 20, "inside the window and unprovoked, it does not move");
  assert.match(soon.refusals[0], /moves again only after 45 days/);

  const provoked = applyIntentOps(base, [{ op: "advance", intent: "og-1", stageDelta: 15, note: "the pope's audit hit it" }], { date: "2026-09-20", provoked: true });
  assert.equal(provoked.intents[0].stage, 35, "the player's own order provokes it inside the window");

  const later = applyIntentOps(base, [{ op: "advance", intent: "og-1", stageDelta: 15, note: "months later" }], { date: "2026-11-20" });
  assert.equal(later.intents[0].stage, 35, "past the cool-down it moves on its own");
  assert.equal(HOSTILE_ADVANCE_COOLDOWN_DAYS, 45);

  // A supportive or untargeted scheme is never held back — the apparatus that
  // carries the player's orders out must be free to move every edition.
  const ally = [{ id: "j-1", ownerType: "polity", owner: "Jesuits", target: HOLY_SEE, kind: "political", summary: "Carry the reform", stance: "supportive", stage: 30, log: ["2026-09-01: drafted the text"] }];
  assert.equal(applyIntentOps(ally, [{ op: "advance", intent: "j-1", stageDelta: 20 }], { date: "2026-09-10" }).intents[0].stage, 50);
});

test("the preset models the Church that carries a pontificate out, not only the powers that resist it", () => {
  const world = applyChurchPreset({}, { date: "2026-09-01" });
  const supportive = world.intents.filter((it) => it.stance === "supportive").map((it) => it.owner);
  assert.ok(supportive.includes("Catholic Church"), "the universal Church executes what Rome decides");
  assert.ok(supportive.includes("Curie romaine"), "the Curia's default is execution, inertia slowing it, never annulling it");
  const hostile = world.intents.filter((it) => it.stance === "hostile");
  assert.ok(supportive.length >= hostile.length - 2, `the world is not modelled as ${hostile.length} plots against ${supportive.length} allies`);
});
