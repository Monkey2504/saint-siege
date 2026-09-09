/*! Open Historia — succession tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { annualMortality, applyLeaderOps, describeLeaders, inferLeaderMode, LEADERS_RULES, normalizeLeaders, seedLeaderFromStats, stepLeaders } from "./succession.js";

test("seedLeaderFromStats infers the mode from government text and tags — a prior the model refines", () => {
  const us = seedLeaderFromStats("United States", { leader: "J. Doe", government: "Federal presidential constitutional republic" }, ["democracy"], "2026-01-20");
  assert.equal(us.mode, "election");
  assert.equal(us.termYears, 4);
  assert.equal(us.nextDue, "2030-01-20");
  assert.equal(us.dueKind, "election");
  assert.equal(us.name, "J. Doe");
  assert.match(us.log[0], /a prior, refine with leaderOps/);

  assert.equal(seedLeaderFromStats("France", { government: "Semi-presidential republic" }, [], "2026-01-01").termYears, 5);
  assert.equal(seedLeaderFromStats("Germany", { government: "Federal parliamentary republic" }, [], "2026-01-01").termYears, 4);
  assert.equal(seedLeaderFromStats("United Kingdom", { government: "Parliamentary constitutional monarchy" }, [], "2026-01-01").mode, "hereditary", "the sheet's leader is the sovereign");
  assert.equal(seedLeaderFromStats("Ruritania", { government: "Parliamentary democracy" }, [], "2026-01-01").termYears, 5, "default term");

  const saud = seedLeaderFromStats("Saudi Arabia", { leader: "the King", government: "Absolute monarchy" }, [], "2026-01-01");
  assert.equal(saud.mode, "hereditary");
  assert.equal(saud.termYears, 0);
  assert.equal(saud.nextDue, "");

  const pope = seedLeaderFromStats("Saint-Siège", { leader: "Léon XIV", government: "Monarchie élective absolue (pontificat)" }, ["theocratic", "city-state"], "2026-01-01");
  assert.equal(pope.mode, "conclave");
  assert.equal(seedLeaderFromStats("Holy See", { government: "Elective theocracy" }, ["theocratic"], "2026-01-01").mode, "conclave");
  assert.equal(seedLeaderFromStats("Iran", { government: "Islamic republic under a Supreme Leader" }, ["theocratic"], "2026-01-01").mode, "life");

  assert.equal(seedLeaderFromStats("China", { government: "One-party socialist republic" }, ["communist"], "2026-01-01").mode, "appointment");
  assert.equal(seedLeaderFromStats("North Korea", { government: "Totalitarian dictatorship" }, [], "2026-01-01").mode, "life");
  assert.equal(seedLeaderFromStats("Myanmar", { government: "Military junta" }, [], "2026-01-01").mode, "life");
  assert.equal(inferLeaderMode("Sparta", "", ["authoritarian"]).mode, "life");
  assert.equal(inferLeaderMode("Sparta", "Diarchy", ["monarchy"]).mode, "hereditary");
  assert.equal(inferLeaderMode("Athens", "Direct democracy", []).mode, "election");
  assert.equal(inferLeaderMode("Unknown tribe", "", []).mode, "life", "no information: rules until dead");
  assert.equal(seedLeaderFromStats("", {}), null);
});

test("stepLeaders: a term whose due date falls inside the jump is DUE, and the seat is vacated at that date — never past it", () => {
  const leaders = normalizeLeaders({
    "United States": { name: "J. Doe", mode: "election", termYears: 4, since: "2025-01-20", nextDue: "2029-01-20", born: 1970 },
    "France": { name: "M. Dupont", mode: "election", termYears: 5, since: "2027-05-14", nextDue: "2032-05-14" },
  });
  const inside = stepLeaders(leaders, { date: "2028-12-01", days: 120 });
  assert.equal(inside.due.length, 1);
  assert.equal(inside.due[0].polity, "United States");
  assert.equal(inside.due[0].kind, "election");
  assert.equal(inside.due[0].date, "2029-01-20");
  assert.equal(inside.leaders["United States"].vacantSince, "2029-01-20");
  assert.equal(inside.leaders["United States"].name, "J. Doe", "the name stays on record until an install replaces or confirms it");
  assert.equal(inside.leaders.France.vacantSince, "");
  const before = stepLeaders(leaders, { date: "2028-06-01", days: 30 });
  assert.equal(before.due.length, 0, "not yet due");
  // Re-election is an install of the same name; the next term is dated from it.
  const again = applyLeaderOps(inside.leaders, [{ op: "install", polity: "United States", name: "J. Doe" }], { date: "2029-01-20" });
  assert.equal(again.refusals.length, 0);
  assert.equal(again.leaders["United States"].vacantSince, "");
  assert.equal(again.leaders["United States"].nextDue, "2033-01-20");
  assert.equal(again.leaders["United States"].born, 1970, "same person keeps the birth year");
  assert.equal(again.leaders["United States"].termYears, 4);
  assert.match(again.leaders["United States"].log.at(-1), /J\. Doe confirmed \(election, 4-year term to 2033-01-20\)/);
  // A term-based non-election mode is due as "term-end".
  const congress = stepLeaders(normalizeLeaders({ X: { name: "Sec.", mode: "appointment", termYears: 5, nextDue: "2027-10-01" } }), { date: "2027-09-01", days: 60 });
  assert.equal(congress.due[0].kind, "term-end");
});

test("the mortality curve is the documented one: 2% at 70, 6% at 80, 16% at 90, capped, zero for no age", () => {
  assert.ok(Math.abs(annualMortality(70) - 0.02) < 1e-9);
  assert.ok(Math.abs(annualMortality(80) - 0.06) < 1e-9);
  assert.ok(Math.abs(annualMortality(90) - 0.18) < 0.03);
  assert.ok(annualMortality(60) < 0.01 && annualMortality(60) > 0.005);
  assert.equal(annualMortality(200), 0.5);
  assert.equal(annualMortality(NaN), 0);
  assert.equal(annualMortality(-3), 0);
});

test("death roll is deterministic: same inputs give the same result; a 95-year-old over ten years dies in this seed, and the date is inside the jump", () => {
  const old = normalizeLeaders({ Ruritania: { name: "King Rudolf", mode: "hereditary", born: 1931 } });
  const a = stepLeaders(old, { date: "2026-01-01", days: 3653 });
  const b = stepLeaders(old, { date: "2026-01-01", days: 3653 });
  assert.deepEqual(a, b, "same polity, same date, same span → same roll");
  const death = a.due.find((d) => d.kind === "death-risk");
  assert.ok(death, "a 95-year-old does not survive a decade of the curve in this seed");
  assert.equal(death.polity, "Ruritania");
  assert.ok(death.date >= "2026-01-01" && death.date <= "2036-01-01", `died ${death.date}`);
  assert.equal(a.leaders.Ruritania.vacantSince, death.date);
  assert.deepEqual(a.leaders.Ruritania.died, { name: "King Rudolf", date: death.date });
  assert.equal(a.leaders.Ruritania.dueKind, "term-end");
  assert.match(a.leaders.Ruritania.log.at(-1), /King Rudolf dies aged about 9\d/);
  // A different start date is a different stream; a leader with no birth year never rolls.
  assert.equal(stepLeaders(normalizeLeaders({ Ruritania: { name: "Chief", mode: "life" } }), { date: "2026-01-01", days: 36525 }).due.length, 0);
  // A dead leader does not keep rolling, and cannot govern: the next step reports nothing new.
  const next = stepLeaders(a.leaders, { date: "2036-01-01", days: 365 });
  assert.equal(next.due.length, 0);
  assert.equal(next.leaders.Ruritania.vacantSince, death.date);
  // A 40-year-old over one month lives in every seed the curve allows (hazard ≈ 0.07%/yr × 1/12).
  const young = normalizeLeaders({ X: { name: "Y", mode: "election", termYears: 4, born: 1986, nextDue: "2030-01-01" } });
  assert.equal(stepLeaders(young, { date: "2026-01-01", days: 30 }).due.length, 0);
});

test("conclave chain: the pope's death vacates the see AND queues a conclave; an install with mode conclave fills it", () => {
  const church = normalizeLeaders({ "Saint-Siège": { name: "Léon XIV", mode: "conclave", born: 1930 } });
  const out = stepLeaders(church, { date: "2026-01-01", days: 3653 });
  const kinds = out.due.map((d) => d.kind);
  assert.deepEqual(kinds, ["death-risk", "conclave"]);
  assert.equal(out.due[1].polity, "Saint-Siège");
  assert.match(out.due[1].reason, /conclave must elect a successor/);
  assert.equal(out.leaders["Saint-Siège"].dueKind, "conclave");
  const text = describeLeaders(out.leaders, { date: out.due[0].date });
  assert.match(text, /^Saint-Siège — VACANT since \d{4}-\d{2}-\d{2} \(Léon XIV died\) — DUE: conclave this jump \(leaderOps install\)$/);
  const elected = applyLeaderOps(out.leaders, [{ op: "install", polity: "Saint-Siège", name: "Jean XXIV", mode: "conclave", born: 1965 }], { date: "2030-03-15" });
  assert.equal(elected.refusals.length, 0);
  assert.equal(elected.leaders["Saint-Siège"].name, "Jean XXIV");
  assert.equal(elected.leaders["Saint-Siège"].vacantSince, "");
  assert.equal(elected.leaders["Saint-Siège"].nextDue, "");
  assert.equal(elected.leaders["Saint-Siège"].since, "2030-03-15");
});

test("leaderOps: install / remove / schedule, and every refusal", () => {
  const base = normalizeLeaders({ France: { name: "M. Dupont", mode: "election", termYears: 5, since: "2027-05-14", nextDue: "2032-05-14" } });
  const r = (ops, leaders = base, date = "2028-01-01") => applyLeaderOps(leaders, ops, { date });
  assert.match(r([{ op: "install", name: "X" }]).refusals[0], /polity is required/);
  assert.match(r([{ op: "install", polity: "France", name: "" }]).refusals[0], /needs a name/);
  assert.match(r([{ op: "install", polity: "France", name: "X", mode: "tyranny" }]).refusals[0], /mode "tyranny" is not one of/);
  assert.match(r([{ op: "install", polity: "France", name: "X", born: 2020 }]).refusals[0], /would be 8 in 2028/);
  assert.match(r([{ op: "remove", polity: "Nowhere", reason: "coup" }]).refusals[0], /no leader on record/);
  assert.match(r([{ op: "schedule", polity: "Nowhere", nextDue: "2029-01-01", kind: "election" }]).refusals[0], /no leader on record/);
  assert.match(r([{ op: "schedule", polity: "France", nextDue: "soon", kind: "election" }]).refusals[0], /is not a date/);
  assert.match(r([{ op: "schedule", polity: "France", nextDue: "2027-01-01", kind: "election" }]).refusals[0], /is before 2028-01-01/);
  assert.match(r([{ op: "schedule", polity: "France", nextDue: "2029-01-01", kind: "death-risk" }]).refusals[0], /kind must be election, conclave or term-end/);
  assert.match(r([{ op: "crown", polity: "France" }]).refusals[0], /unknown op/);

  const removed = r([{ op: "remove", polity: "France", reason: "resigned after the referendum" }]);
  assert.equal(removed.refusals.length, 0);
  assert.equal(removed.leaders.France.vacantSince, "2028-01-01");
  assert.deepEqual(removed.leaders.France.removed, { name: "M. Dupont", date: "2028-01-01", reason: "resigned after the referendum" });
  assert.match(r([{ op: "remove", polity: "France" }], removed.leaders).refusals[0], /already vacant since 2028-01-01/);
  assert.equal(stepLeaders(removed.leaders, { date: "2032-01-01", days: 365 }).due.length, 0, "a vacant seat is not due again on top of being vacant");

  const installed = r([{ op: "install", polity: "France", name: "A. Martin", born: 1975, reason: "snap election" }], removed.leaders, "2028-03-01");
  assert.equal(installed.refusals.length, 0);
  const fr = installed.leaders.France;
  assert.equal(fr.mode, "election", "mode inherited from the seat");
  assert.equal(fr.termYears, 5);
  assert.equal(fr.nextDue, "2033-03-01");
  assert.equal(fr.born, 1975);
  assert.equal(fr.vacantSince, "");
  assert.equal(fr.removed, undefined, "a filled seat forgets its last removal");
  // A brand-new polity with no seat on record: install creates it; an election mode gets the table's term.
  const fresh = r([{ op: "install", polity: "United States", name: "P. Smith", mode: "election" }], {}, "2029-01-20").leaders["United States"];
  assert.equal(fresh.termYears, 4);
  assert.equal(fresh.nextDue, "2033-01-20");
  // A regime change to a life tenure clears the term.
  const coup = r([{ op: "install", polity: "France", name: "Gen. Leclerc", mode: "life" }], installed.leaders, "2030-01-01").leaders.France;
  assert.equal(coup.termYears, 0);
  assert.equal(coup.nextDue, "");
  // The real calendar overrides the seeded prior.
  const sched = r([{ op: "schedule", polity: "France", nextDue: "2032-04-23", kind: "election" }], installed.leaders, "2028-06-01");
  assert.equal(sched.refusals.length, 0);
  assert.equal(sched.leaders.France.nextDue, "2032-04-23");
  assert.equal(sched.leaders.France.dueKind, "election");
});

test("describeLeaders: only what matters now — the player's seat, vacancies, and anything due within a year", () => {
  const leaders = normalizeLeaders({
    "United States": { name: "J. Doe", mode: "election", termYears: 4, since: "2025-01-20", nextDue: "2029-01-20", born: 1970 },
    "France": { name: "M. Dupont", mode: "election", termYears: 5, since: "2027-05-14", nextDue: "2032-05-14" },
    "Saudi Arabia": { name: "the King", mode: "hereditary", born: 1935 },
    "Ruritania": { name: "King Rudolf", mode: "hereditary", vacantSince: "2028-02-02", dueKind: "term-end", died: { name: "King Rudolf", date: "2028-02-02" } },
  });
  const text = describeLeaders(leaders, { date: "2028-06-01", playerPolity: "Saudi Arabia" });
  const lines = text.split("\n");
  assert.equal(lines.length, 3, "France (due 2032) is left out");
  assert.equal(lines[0], "Ruritania — VACANT since 2028-02-02 (King Rudolf died) — DUE: term-end this jump (leaderOps install)");
  assert.equal(lines[1], "Saudi Arabia — the King (hereditary, aged 93; for life) [player]");
  assert.equal(lines[2], "United States — J. Doe (election, since 2025-01-20, aged 58; 4-year term, next due 2029-01-20) — DUE: election by 2029-01-20");
  assert.equal(describeLeaders({}, { date: "2028-06-01" }), "");
  assert.match(LEADERS_RULES, /MUST be resolved this jump/);
  assert.match(LEADERS_RULES, /leaderOps/);
});
