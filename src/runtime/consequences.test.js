import assert from "node:assert/strict";
import test from "node:test";

import {
  BEQUEST_BAND,
  BEQUEST_SHARE,
  DRIVE_STALL_DAYS,
  bequestEvent,
  bequestFor,
  consequencesOf,
} from "./consequences.js";

const TURN = { from: "2029-01-01", to: "2029-04-01", player: "Saint-Siège" };
const titles = (world, opts = {}) => consequencesOf(world, { country: "Saint-Siège", gameDate: TURN.to }, { ...TURN, ...opts }).map((e) => e.title);

test("a world where nothing has happened produces no news", () => {
  assert.deepEqual(consequencesOf({}, { country: "Saint-Siège", gameDate: TURN.to }, TURN), []);
});

test("a purse that cannot cover its promises is reported, with the shortfall", () => {
  const world = { treasuries: [{ body: "Curial purse", treasury: 1_000, assumedLiabilities: 3_000 }] };
  const [entry] = consequencesOf(world, { country: "Saint-Siège" }, TURN);
  assert.match(entry.title, /Curial purse cannot cover/);
  assert.match(entry.description, /2000 SY/);
  assert.equal(entry.importance, "major");
});

test("a purse that covers what it owes is not news", () => {
  const world = { treasuries: [{ body: "Curial purse", treasury: 5_000, assumedLiabilities: 3_000 }] };
  assert.deepEqual(titles(world), []);
});

test("a gathering whose day falls inside the turn is reported as held", () => {
  const world = { gatherings: [{ name: "Kinshasa 2029", host: "Fonds Sahel", status: "planned", date: "2029-02-14", continent: "africa" }] };
  const [entry] = consequencesOf(world, { country: "Saint-Siège" }, TURN);
  assert.match(entry.title, /Kinshasa 2029 is held/);
  assert.equal(entry.date, "2029-02-14");
});

test("a gathering still in the future is not reported", () => {
  const world = { gatherings: [{ name: "Later", status: "planned", date: "2031-02-14", continent: "africa" }] };
  assert.deepEqual(titles(world), []);
});

test("a gathering held before this turn is not reported again", () => {
  const world = { gatherings: [{ name: "Old news", status: "planned", date: "2028-06-01", continent: "africa" }] };
  assert.deepEqual(titles(world), []);
});

test("electors out of communion lead the edition", () => {
  const elector = (id, approval) => ({ id, approval, doctrine: "a", region: "europe", role: "curia", follows: "x" });
  const world = {
    assembly: {
      seats: 4,
      electors: [elector("1", 40), elector("2", 10), elector("3", -60), elector("4", -90)],
    },
  };
  const entry = consequencesOf(world, { country: "Saint-Siège" }, TURN).find((e) => /communion/.test(e.title));
  assert.ok(entry, "the schism is reported");
  assert.equal(entry.importance, "major");
  assert.match(entry.description, /A majority needs 3/);
});

test("a college that merely disagrees is not a fracture", () => {
  const elector = (id, approval) => ({ id, approval, doctrine: "a", region: "europe", role: "curia", follows: "x" });
  const world = { assembly: { seats: 3, electors: [elector("1", -10), elector("2", 5), elector("3", 0)] } };
  assert.deepEqual(titles(world), []);
});

test("pledges past the grace period are named", () => {
  const world = {
    drives: [{
      id: "d1", name: "Écoles du Sahel", owner: "Saint-Siège", target: 1_000, pledged: 600, collected: 100,
      status: "open", startedAt: "2026-01-01",
      log: [{ date: "2026-01-01", op: "pledge", amount: 600 }, { date: "2026-02-01", op: "collect", amount: 100 }],
    }],
  };
  const entry = consequencesOf(world, { country: "Saint-Siège" }, TURN).find((e) => /past due/.test(e.title));
  assert.ok(entry);
  assert.match(entry.description, /Écoles du Sahel/);
});

test("a campaign that took nothing this period says so, against its own figures", () => {
  const world = {
    drives: [{
      id: "d2", name: "Basilica roof", owner: "Saint-Siège", target: 900, pledged: 410, collected: 410,
      status: "open", startedAt: "2027-01-01",
      log: [{ date: "2027-06-01", op: "collect", amount: 410 }],
    }],
  };
  const entry = consequencesOf(world, { country: "Saint-Siège" }, TURN).find((e) => /taken nothing/.test(e.title));
  assert.ok(entry, "the stall is reported");
  assert.match(entry.description, /410 collected against a target of 900/);
});

test("a campaign that collected during the turn is not stalled", () => {
  const world = {
    drives: [{
      id: "d3", name: "Moving", owner: "Saint-Siège", target: 900, pledged: 500, collected: 500,
      status: "open", startedAt: "2027-01-01",
      log: [{ date: "2029-02-01", op: "collect", amount: 500 }],
    }],
  };
  assert.equal(titles(world).filter((t) => /taken nothing/.test(t)).length, 0);
});

test("a young campaign is given its time before being called stalled", () => {
  const world = {
    drives: [{
      id: "d4", name: "Just opened", owner: "Saint-Siège", target: 900, pledged: 0, collected: 0,
      status: "open", startedAt: "2029-03-20", log: [],
    }],
  };
  assert.equal(titles(world).filter((t) => /taken nothing/.test(t)).length, 0, `under ${DRIVE_STALL_DAYS} days is not a stall`);
});

test("the edition is capped, and the heaviest news comes first", () => {
  const elector = (id, approval) => ({ id, approval, doctrine: "a", region: "europe", role: "curia", follows: "x" });
  const world = {
    treasuries: [{ body: "Curial purse", treasury: 0, assumedLiabilities: 9_000 }],
    gatherings: [{ name: "Kinshasa", status: "planned", date: "2029-02-14", continent: "africa" }],
    assembly: { seats: 4, electors: [elector("1", 40), elector("2", 10), elector("3", -60), elector("4", -90)] },
    drives: [{ id: "d5", name: "Stalled", owner: "Saint-Siège", target: 1_000, pledged: 900, collected: 0, status: "open", startedAt: "2026-01-01", log: [{ date: "2026-01-01", op: "pledge", amount: 900 }] }],
  };
  const rows = consequencesOf(world, { country: "Saint-Siège" }, { ...TURN, limit: 3 });
  assert.equal(rows.length, 3);
  assert.match(rows[0].title, /cannot cover/);
});

test("a rule that throws never takes the turn down with it", () => {
  // The whole point of this file is to be what still works when nothing else
  // does, so a malformed world must produce fewer entries, never an exception.
  const world = { treasuries: "not a list", drives: 42, assembly: { electors: "no" }, gatherings: null };
  assert.doesNotThrow(() => consequencesOf(world, { country: "x" }, TURN));
});

test("nothing here mutates the world it reads", () => {
  const world = { treasuries: [{ body: "P", treasury: 1, assumedLiabilities: 9 }] };
  const before = JSON.stringify(world);
  consequencesOf(world, { country: "x" }, TURN);
  assert.equal(JSON.stringify(world), before);
});

// ── Legacies ────────────────────────────────────────────────────────────────

test("legacies follow the standing donation flow, not an invented sum", () => {
  const economy = { transfers: 1_000, legitimacy: 50 };
  assert.equal(bequestFor(economy, { years: 1 }), 1_000 * BEQUEST_SHARE);
});

test("a trusted pontificate is left more; a distrusted one dries up", () => {
  const flow = { transfers: 1_000 };
  const trusted = bequestFor({ ...flow, legitimacy: 90 }, { years: 1 });
  const distrusted = bequestFor({ ...flow, legitimacy: 10 }, { years: 1 });
  assert.ok(trusted > distrusted, "standing decides");
  assert.ok(distrusted > 0, "it never reaches zero — some wills are already signed");
});

test("however extreme the standing, legacies stay inside the band", () => {
  const flow = { transfers: 1_000 };
  const most = bequestFor({ ...flow, legitimacy: 100_000 }, { years: 1 });
  const least = bequestFor({ ...flow, legitimacy: 0 }, { years: 1 });
  assert.equal(most, 1_000 * BEQUEST_SHARE * BEQUEST_BAND.max);
  assert.equal(least, 1_000 * BEQUEST_SHARE * BEQUEST_BAND.min);
});

test("a polity nobody donates to is left nothing, and no line is printed", () => {
  assert.equal(bequestFor({ transfers: 0, legitimacy: 90 }, { years: 1 }), 0);
  assert.equal(bequestEvent({ amount: 0, player: "x", date: TURN.to, economy: {} }), null);
});

test("money that arrives is money the player is told about", () => {
  const entry = bequestEvent({ amount: 80, player: "Saint-Siège", date: TURN.to, economy: { legitimacy: 62 } });
  assert.match(entry.title, /Legacies/);
  assert.match(entry.description, /80 SY reaches Saint-Siège/);
  assert.match(entry.description, /62\/100/);
});
