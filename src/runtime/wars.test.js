/*! Open Historia — wars tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { applyWarOps, describeWars, filterUnitOpsByWars, isAtWar, normalizeWars, resolveAiClashes, warEconomyFlags, warsBetween, WARS_RULES } from "./wars.js";

const declare = (attacker, defender, extra = {}, date = "2026-03-01") =>
  applyWarOps([], [{ op: "declare", attacker, defender, casus: "border incident", ...extra }], { date });

test("declare / join / ceasefire / end: the full life of a war, logged with dates", () => {
  let { wars, refusals } = declare("Ruritania", "Borduria", { allies: ["Syldavia"] });
  assert.equal(refusals.length, 0);
  assert.equal(wars.length, 1);
  const id = wars[0].id;
  assert.match(id, /^war-ruritania-borduria-2026$/);
  assert.deepEqual(wars[0].sides, { a: ["Ruritania", "Syldavia"], b: ["Borduria"] });
  assert.equal(wars[0].status, "active");
  assert.equal(wars[0].since, "2026-03-01");
  assert.equal(wars[0].casus, "border incident");

  ({ wars, refusals } = applyWarOps(wars, [{ op: "join", war: id, polity: "Poldavia", side: "b" }], { date: "2026-04-01" }));
  assert.equal(refusals.length, 0);
  assert.deepEqual(wars[0].sides.b, ["Borduria", "Poldavia"]);

  ({ wars, refusals } = applyWarOps(wars, [{ op: "intensity", war: id, delta: 0.3 }, { op: "intensity", war: id, delta: 5 }], { date: "2026-05-01" }));
  assert.equal(refusals.length, 0);
  assert.equal(wars[0].intensity, 1, "clamped to 1");

  ({ wars, refusals } = applyWarOps(wars, [{ op: "ceasefire", war: id }], { date: "2026-06-01" }));
  assert.equal(refusals.length, 0);
  assert.equal(wars[0].status, "ceasefire");
  assert.equal(isAtWar(wars, "Ruritania"), false, "a ceasefire is not an active war");
  assert.equal(warsBetween(wars, "Ruritania", "Borduria").length, 0);

  // Re-declaring during a ceasefire RESUMES the same war rather than opening a second one.
  ({ wars, refusals } = applyWarOps(wars, [{ op: "declare", attacker: "Borduria", defender: "Syldavia", casus: "truce violated" }], { date: "2026-07-01" }));
  assert.equal(refusals.length, 0);
  assert.equal(wars.length, 1);
  assert.equal(wars[0].status, "active");
  assert.match(wars[0].log.at(-1), /ceasefire broken by Borduria/);

  ({ wars, refusals } = applyWarOps(wars, [{ op: "end", war: id, outcome: "a", terms: "Borduria cedes the marches" }], { date: "2026-09-01" }));
  assert.equal(refusals.length, 0);
  assert.equal(wars[0].status, "ended");
  assert.equal(wars[0].outcome, "a");
  assert.equal(wars[0].terms, "Borduria cedes the marches");
  assert.equal(wars[0].endedAt, "2026-09-01");
  assert.equal(isAtWar(wars, "Ruritania"), false);
  assert.match(wars[0].log.at(-1), /^2026-09-01: peace — side a \(Ruritania, Syldavia\) prevails; Borduria cedes/);
});

test("every refusal: duplicate declaration, self-war, joining a missing or ended war, joining twice, ending twice, bad outcome, bad intensity, ceasefire twice, unknown op", () => {
  const { wars } = declare("Ruritania", "Borduria");
  const id = wars[0].id;
  const r1 = applyWarOps(wars, [{ op: "declare", attacker: "Borduria", defender: "Ruritania" }], { date: "2026-04-01" });
  assert.equal(r1.wars.length, 1);
  assert.match(r1.refusals[0], /already at war/);
  assert.match(applyWarOps(wars, [{ op: "declare", attacker: "Ruritania", defender: "Ruritania" }]).refusals[0], /on itself/);
  assert.match(applyWarOps(wars, [{ op: "declare", attacker: "", defender: "X" }]).refusals[0], /are both required/);
  assert.match(applyWarOps(wars, [{ op: "join", war: "war-nope", polity: "Syldavia", side: "a" }]).refusals[0], /no open war matches/);
  assert.match(applyWarOps(wars, [{ op: "join", war: id, polity: "Ruritania", side: "b" }]).refusals[0], /already in .* on side a/);
  assert.match(applyWarOps(wars, [{ op: "join", war: id, polity: "Syldavia", side: "c" }]).refusals[0], /polity and side/);
  assert.match(applyWarOps(wars, [{ op: "end", war: id, outcome: "win" }]).refusals[0], /needs an outcome/);
  assert.match(applyWarOps(wars, [{ op: "intensity", war: id, delta: "lots" }]).refusals[0], /numeric delta/);
  assert.match(applyWarOps(wars, [{ op: "ceasefire", war: id }, { op: "ceasefire", war: id }]).refusals[0], /already under ceasefire/);
  assert.match(applyWarOps(wars, [{ op: "annex", war: id }]).refusals[0], /unknown op/);

  const ended = applyWarOps(wars, [{ op: "end", war: id, outcome: "stalemate" }], { date: "2026-05-01" }).wars;
  assert.match(applyWarOps(ended, [{ op: "end", war: id, outcome: "b" }]).refusals[0], /already ended \(stalemate\)/);
  assert.match(applyWarOps(ended, [{ op: "join", war: id, polity: "Syldavia", side: "a" }]).refusals[0], /already ended/);
  // After peace, a NEW war between the same two is a new record.
  const again = applyWarOps(ended, [{ op: "declare", attacker: "Ruritania", defender: "Borduria" }], { date: "2031-01-01" });
  assert.equal(again.refusals.length, 0);
  assert.equal(again.wars.length, 2);
  assert.notEqual(again.wars[1].id, id);

  // A war may be named by the pair or by "x vs y" when the id is not recalled.
  assert.equal(applyWarOps(wars, [{ op: "intensity", war: { between: ["Borduria", "Ruritania"] }, delta: 0.1 }]).refusals.length, 0);
  assert.equal(applyWarOps(wars, [{ op: "intensity", war: "Ruritania vs Borduria", delta: 0.1 }]).refusals.length, 0);
});

test("warsBetween sees coalitions: an ally of the attacker is at war with every member of the other side, never with its own side", () => {
  const { wars } = declare("Ruritania", "Borduria", { allies: ["Syldavia"] });
  const withJoin = applyWarOps(wars, [{ op: "join", war: wars[0].id, polity: "Poldavia", side: "b" }]).wars;
  assert.equal(warsBetween(withJoin, "Syldavia", "Poldavia").length, 1);
  assert.equal(warsBetween(withJoin, "Poldavia", "Syldavia").length, 1, "symmetric");
  assert.equal(warsBetween(withJoin, "Syldavia", "Ruritania").length, 0, "same side");
  assert.equal(warsBetween(withJoin, "Syldavia", "Switzerland").length, 0, "a neutral");
  assert.equal(warsBetween(withJoin, "syldavia", "BORDURIA").length, 1, "case-insensitive");
  assert.equal(isAtWar(withJoin, "Poldavia"), true);
  assert.equal(isAtWar(withJoin, "Switzerland"), false);
  assert.deepEqual(warEconomyFlags(withJoin), { Ruritania: { atWar: true }, Syldavia: { atWar: true }, Borduria: { atWar: true }, Poldavia: { atWar: true } });
  // An ally cannot be recruited against itself; a joiner cannot sit beside its own enemy.
  const tangled = applyWarOps(withJoin, [{ op: "declare", attacker: "Poldavia", defender: "Switzerland", allies: ["Ruritania"] }], { date: "2026-05-01" });
  assert.match(tangled.refusals[0], /Ruritania is itself at war with Poldavia/);
  assert.deepEqual(tangled.wars[1].sides.a, ["Poldavia"]);
  // Ruritania is at war with Poldavia (war 1), so it cannot stand BESIDE Poldavia on side a of war 2 —
  // but it may join side b, against it.
  const cross = applyWarOps(tangled.wars, [{ op: "join", war: tangled.wars[1].id, polity: "Ruritania", side: "a" }]);
  assert.match(cross.refusals[0], /Ruritania is at war with Poldavia, who is on side a/);
  assert.equal(applyWarOps(tangled.wars, [{ op: "join", war: tangled.wars[1].id, polity: "Ruritania", side: "b" }]).refusals.length, 0);
});

test("normalizeWars: malformed entries drop, duplicate ids collapse, a polity cannot sit on both sides", () => {
  const list = normalizeWars([
    { id: "w1", sides: { a: ["A", "C"], b: ["B", "C"] }, since: "1914-08-01", status: "ACTIVE", intensity: 2 },
    { id: "w1", sides: { a: ["X"], b: ["Y"] } },
    { sides: { a: [], b: ["B"] } },
    "nope",
    { attacker: "Athens", defender: "Sparta", since: "-0431", status: "ended", outcome: "b" },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list[0].sides, { a: ["A", "C"], b: ["B"] });
  assert.equal(list[0].intensity, 1);
  assert.equal(list[0].status, "active");
  assert.equal(list[1].id, "war-athens-sparta--0431");
  assert.equal(list[1].outcome, "b");
});

const unit = (id, ownerCode, lng, lat, extra = {}) => ({ id, name: id, ownerCode, type: "infantry", strength: 100, lng, lat, status: "idle", ...extra });

test("resolveAiClashes: a pair in range fights once, deterministically; out-of-range and non-belligerent pairs are untouched", () => {
  const { wars } = declare("Ruritania", "Borduria");
  const units = [
    unit("rur-1", "Ruritania", 20.0, 45.0),
    unit("bor-1", "Borduria", 20.5, 45.0), // ~39 km: inside an infantry's 115 km (2026)
    unit("bor-2", "Borduria", 30.0, 45.0), // ~780 km: out of reach
    unit("swi-1", "Switzerland", 20.2, 45.0), // a neutral next to the fight
    unit("rur-2", "Ruritania", 20.1, 45.0, { status: "pending" }), // awaiting resolution: not fightable
  ];
  const out = resolveAiClashes(units, wars, { round: 3, date: "2026-03-01" });
  assert.equal(out.battles.length, 1, "exactly one pair fought");
  const b = out.battles[0];
  assert.equal(b.warId, wars[0].id);
  assert.deepEqual([b.attackerId, b.defenderId], ["rur-1", "bor-1"], "the declaring side attacks when both reach");
  assert.ok(b.attackerLoss > 0 && b.defenderLoss > 0);
  const by = Object.fromEntries(out.units.map((u) => [u.id, u]));
  assert.equal(by["rur-1"].strength, 100 - b.attackerLoss);
  assert.equal(by["bor-1"].strength, 100 - b.defenderLoss);
  assert.equal(by["rur-1"].status, "engaged");
  assert.equal(by["bor-2"].strength, 100, "out of range: untouched");
  assert.equal(by["swi-1"].strength, 100, "not a belligerent: untouched");
  assert.equal(by["rur-2"].strength, 100, "pending: untouched");
  assert.equal(out.events.length, 1);
  assert.equal(out.events[0].kind, "war");
  assert.match(out.events[0].title, /Ruritania's rur-1 engages Borduria's bor-1/);
  assert.deepEqual(out.events[0].participants, ["Ruritania", "Borduria"]);
  assert.match(out.wars[0].log.at(-1), /rur-1 vs bor-1/);
  assert.equal(units[0].strength, 100, "input is not mutated");

  // Same inputs, same round → identical outcome; another round → a different roll.
  const again = resolveAiClashes(units, wars, { round: 3, date: "2026-03-01" });
  assert.deepEqual(again.battles, out.battles);
  const later = resolveAiClashes(units, wars, { round: 4, date: "2026-03-01" });
  assert.notDeepEqual(later.battles[0], out.battles[0]);

  // Under a ceasefire nothing happens; at intensity 0 losses shrink to the skirmish floor.
  const truce = applyWarOps(wars, [{ op: "ceasefire", war: wars[0].id }]).wars;
  assert.equal(resolveAiClashes(units, truce, { round: 3, date: "2026-03-01" }).battles.length, 0);
  const phoney = applyWarOps(wars, [{ op: "intensity", war: wars[0].id, delta: -0.5 }]).wars;
  const skirmish = resolveAiClashes(units, phoney, { round: 3, date: "2026-03-01" }).battles[0];
  assert.ok(skirmish.attackerLoss + skirmish.defenderLoss < b.attackerLoss + b.defenderLoss);
  // A unit worn to nothing is marked defeated, and the event says so.
  const weak = [unit("rur-1", "Ruritania", 20.0, 45.0, { strength: 300, type: "armor" }), unit("bor-1", "Borduria", 20.1, 45.0, { strength: 1 })];
  const rout = resolveAiClashes(weak, applyWarOps(wars, [{ op: "intensity", war: wars[0].id, delta: 0.5 }]).wars, { round: 1, date: "2026-03-01" });
  assert.equal(rout.units.find((u) => u.id === "bor-1").status, "defeated");
  assert.equal(rout.battles[0].routed, "bor-1");
  assert.equal(rout.events[0].importance, "major");
});

test("resolveAiClashes: only the unit whose reach covers the distance attacks; era scaling applies", () => {
  const { wars } = declare("Ruritania", "Borduria");
  // 150 km apart: an artillery piece (230 km in 2026) reaches infantry (115 km) but not the reverse.
  const units = [unit("rur-inf", "Ruritania", 20.0, 45.0), unit("bor-art", "Borduria", 21.9, 45.0, { type: "artillery" })];
  const out = resolveAiClashes(units, wars, { round: 1, date: "2026-03-01" });
  assert.equal(out.battles.length, 1);
  assert.equal(out.battles[0].attackerId, "bor-art", "the defender-side artillery is the only one in reach, so it attacks");
  // In 1200 BC the same guns reach half as far: no engagement.
  assert.equal(resolveAiClashes(units, wars, { round: 1, date: "-1200-01-01" }).battles.length, 0);
});

test("filterUnitOpsByWars strips hand-written casualties outside a war, keeps them inside it, keeps reinforcements and other ops", () => {
  const { wars } = declare("Ruritania", "Borduria");
  const units = [unit("rur-1", "Ruritania", 20, 45), unit("swi-1", "Switzerland", 8, 47)];
  const ops = [
    { op: "strength", unitId: "swi-1", strength: 40, note: "losses in the Alps" },
    { op: "strength", unitId: "swi-1", strength: 140, note: "mobilisation" },
    { op: "strength", unitId: "rur-1", strength: 60 },
    { op: "move", unitId: "swi-1", toLng: 9, toLat: 47 },
    { op: "strength", unitId: "ghost", strength: 1 },
  ];
  const out = filterUnitOpsByWars(ops, units, wars);
  assert.equal(out.dropped.length, 1);
  assert.match(out.dropped[0], /swi-1 \(Switzerland\): Switzerland is in no active war/);
  assert.deepEqual(out.kept.map((o) => `${o.op}:${o.unitId}:${o.strength ?? ""}`), ["strength:swi-1:140", "strength:rur-1:60", "move:swi-1:", "strength:ghost:1"]);
  assert.equal(filterUnitOpsByWars(ops, units, []).dropped.length, 2, "with no war at all, both casualty lines go");
});

test("describeWars and the rules: one line per open war, the player's side marked, ended wars omitted", () => {
  const { wars } = declare("Ruritania", "Borduria", { allies: ["Syldavia"] });
  const text = describeWars(wars, { playerPolity: "Borduria" });
  assert.match(text, /^war-ruritania-borduria-2026: Ruritania \+ Syldavia \(a\) vs Borduria \(b\) — active since 2026-03-01, intensity 0\.50, casus: border incident \[Borduria on side b\]; last: 2026-03-01: Ruritania declares war/);
  const ended = applyWarOps(wars, [{ op: "end", war: wars[0].id, outcome: "b" }]).wars;
  assert.equal(describeWars(ended), "");
  assert.match(WARS_RULES, /No battle, casualty, occupation/);
  assert.match(WARS_RULES, /warOps/);
});
