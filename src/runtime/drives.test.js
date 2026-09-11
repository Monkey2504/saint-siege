import test from "node:test";
import assert from "node:assert/strict";
import { applyDriveOps, bookDriveGains, describeDrives, driveFromOrder, driveMovement, driveNeedsFigure, ensureDrivesFromOrders, parseAmountMillions, reconcileNarration, sourceShares, syFromMillions, usdFromMillions, describeConcentration, CONCENTRATION_CEILING, claimedReceipt, overduePledges, describeOutstanding, pruneDormantDrives } from "./drives.js";

test("parseAmountMillions reads targets as people write them, in French and English", () => {
  assert.deepEqual(parseAmountMillions("lever 500 millions d'euros"), { millions: 500, currency: "EUR" });
  assert.deepEqual(parseAmountMillions("raise $2bn from the diaspora"), { millions: 2000, currency: "USD" });
  assert.deepEqual(parseAmountMillions("une souscription de 1,5 milliard"), { millions: 1500, currency: "USD" });
  assert.deepEqual(parseAmountMillions("300 million dollars"), { millions: 300, currency: "USD" });
  assert.deepEqual(parseAmountMillions("un road show à 500 M€"), { millions: 500, currency: "EUR" });
  assert.equal(parseAmountMillions("meet 500 donors"), null, "a bare count is not a target");
});

test("driveFromOrder turns a fundraising order with a target into a drive, and nothing else", () => {
  const order = { id: "a1", title: "Road show mondial", text: "Lancer un road show international pour lever 500 millions d'euros auprès des grands donateurs." };
  const drive = driveFromOrder(order, { owner: "Saint-Siège", date: "2026-10-01" });
  assert.equal(drive.target, 500);
  assert.equal(drive.currency, "EUR");
  assert.equal(drive.owner, "Saint-Siège");
  assert.equal(drive.pledged, 0);
  assert.equal(drive.actionId, "a1");
  assert.equal(driveFromOrder({ id: "a2", title: "Audit", text: "Publier les comptes de l'APSA." }), null);
  assert.equal(driveFromOrder({ id: "a3", title: "Budget", text: "Réduire les dépenses de 30 millions d'euros." }), null, "a cut is not a drive");
});

test("ensureDrivesFromOrders seeds once and is idempotent", () => {
  const actions = [{ id: "a1", status: "planned", title: "Road show", text: "raise 500 million euros from donors" }];
  const w1 = ensureDrivesFromOrders({ drives: [] }, actions, { player: "Saint-Siège", date: "2026-10-01" });
  assert.equal(w1.drives.length, 1);
  const w2 = ensureDrivesFromOrders(w1, actions, { player: "Saint-Siège", date: "2026-11-01" });
  assert.equal(w2, w1, "the same order does not seed a second drive");
});

test("applyDriveOps moves the figure only through ops, caps what cannot be, and refuses in words", () => {
  const start = [{ id: "d1", name: "Road show", owner: "Saint-Siège", currency: "EUR", target: 500 }];
  const a = applyDriveOps(start, [
    { op: "pledge", drive: "Road show", amount: 60, source: "Lagos donors" },
    { op: "pledge", drive: "road show", amount: 900 },
    { op: "collect", drive: "Road show", amount: 100 },
    { op: "collect", drive: "Road show", amount: 20, source: "first transfers" },
    { op: "pledge", drive: "Nothing", amount: 5 },
    { op: "collect", drive: "Road show", amount: 0 },
  ], { date: "2026-11-03", player: "Saint-Siège" });
  const d = a.drives[0];
  assert.equal(d.pledged, 560, "the second pledge was capped at the whole target (500), not 900");
  assert.equal(d.collected, 120, "only what was pledged can be collected: 100 (capped from 100 ≤ 560) then 20");
  assert.equal(a.gains["Saint-Siège"].length, 2);
  assert.ok(a.refusals.some((r) => /capped at 500/.test(r)));
  assert.ok(a.refusals.some((r) => /no drive named "Nothing"/.test(r)));
  assert.ok(a.refusals.some((r) => /amount must be above zero|nothing pledged remains/.test(r)));
  assert.equal(driveMovement(d, "2026-11-01").collected, 120);
  assert.equal(driveMovement(d, "2026-12-01").collected, 0, "nothing after a later date");
});

test("what is collected enters the owner's patrimony in the engine's unit", () => {
  const economy = { usdPerSY: 1600, endowment: 1000 };
  const sy = syFromMillions(100, "EUR", economy);
  assert.ok(Math.abs(sy - (100e6 * 1.0824) / 1600) < 1e-6);
  const out = bookDriveGains({ "Saint-Siège": economy }, { "Saint-Siège": [{ millions: 100, currency: "EUR" }] });
  assert.ok(Math.abs(out["Saint-Siège"].endowment - (1000 + sy)) < 1e-6);
  assert.equal(syFromMillions(100, "EUR", { usdPerSY: 0 }), 0, "an un-anchored economy books nothing");
});

test("describeDrives prints the figures and the rule that words move nothing", () => {
  const drives = [{ id: "d1", name: "Road show", owner: "Saint-Siège", currency: "EUR", target: 500, pledged: 60, collected: 0, log: [{ date: "2026-11-03", op: "pledge", amount: 60, source: "Lagos" }] }];
  const text = describeDrives(drives, { player: "Saint-Siège", sinceDate: "2026-10-01" });
  // Two gaps, never confused: what was promised and not paid, and what nobody
  // has promised yet. A drive fully pledged and never collected must not read
  // as finished.
  assert.match(text, /Road show \(Saint-Siège, the player; open; EUR\): target 500 M; pledged 60 M \(12%\); collected 0 M; 60 M promised but not yet in hand; 440 M still to find from new donors/);
  assert.match(text, /Last edition: \+60 M pledged/);
  assert.match(text, /register prints the zero/);
  assert.equal(describeDrives([]), "");
});

// The failure that started this: eleven rounds of editions announcing a raise,
// the patrimony unchanged to the euro. A story may not credit money the engine
// never moved.
test("reconcileNarration catches a sum narrated as received with no op behind it", () => {
  const drives = [{ id: "d1", name: "Road show", owner: "Saint-Siège", currency: "EUR", target: 500 }];
  const claimed = {
    title: "Le Conseil pour l'Économie entérine la dotation",
    description: "Entérinant l'enregistrement des 500 millions d'euros de dotation initiale sur les comptes de l'IOR.",
    impacts: {},
  };
  const lines = reconcileNarration([claimed], { drives, player: "Saint-Siège" });
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /500 M EUR reached Saint-Siège, with no driveOps/);
  assert.match(lines[0].text, /nothing was credited/);

  // The same story WITH the op that moves it is not flagged.
  const honest = { ...claimed, impacts: { driveOps: [{ op: "collect", drive: "Road show", amount: 500 }] } };
  assert.deepEqual(reconcileNarration([honest], { drives, player: "Saint-Siège" }), []);

  // A promise is a promise: no claim of arrival, nothing to flag.
  const promise = { title: "Des mécènes s'engagent", description: "Un consortium promet 200 millions d'euros.", impacts: {} };
  assert.deepEqual(reconcileNarration([promise], { drives, player: "Saint-Siège" }), []);

  // A story with no sum at all is left alone.
  assert.deepEqual(reconcileNarration([{ title: "Jubilé", description: "Des fidèles ont reçu la bénédiction.", impacts: {} }], { drives }), []);
});

// Reading every order ever given kept rediscovering months-old ones and
// opening empty duplicates beside their closed originals. Only what is queued.
test("only a queued order opens a drive; a resolved one has had its turn", () => {
  const resolved = [{ id: "a1", status: "resolved", title: "Road show", text: "Lancer un road show pour lever 500 millions d'euros." }];
  assert.deepEqual(ensureDrivesFromOrders({ drives: [] }, resolved, { player: "Saint-Siège", date: "2026-10-01" }).drives ?? [], []);

  const queued = [{ ...resolved[0], status: "planned" }];
  const w = ensureDrivesFromOrders({ drives: [] }, queued, { player: "Saint-Siège", date: "2026-10-01" });
  assert.equal(w.drives.length, 1);
  assert.equal(w.drives[0].target, 500);
  assert.equal(w.drives[0].collected, 0);
});

// The road show that ran eleven rounds with its target only in the player's
// letters: an order that raises money must name a figure, and an untargeted
// drive cannot receive a pledge.
test("a fundraising order with no figure is flagged, one with a figure is not", () => {
  assert.equal(driveNeedsFigure("Lancer un road show international pour mobiliser des donateurs fortunés."), true);
  assert.equal(driveNeedsFigure("Lancer un road show pour lever 500 millions d'euros."), false);
  assert.equal(driveNeedsFigure("Publier les comptes de l'APSA."), false, "an order that raises nothing is not flagged");
  assert.equal(driveNeedsFigure(""), false);
});

test("nothing can be pledged to a drive that has not said what it seeks", () => {
  const untargeted = [{ id: "d0", name: "Road show", owner: "Saint-Siège", currency: "EUR", target: 0 }];
  const r = applyDriveOps(untargeted, [{ op: "pledge", drive: "Road show", amount: 60 }], { date: "2026-11-01" });
  assert.equal(r.drives[0].pledged, 0);
  assert.match(r.refusals[0], /no target yet/);
  // Given a target, the same pledge lands.
  const created = applyDriveOps(untargeted, [
    { op: "create", name: "Road show II", owner: "Saint-Siège", currency: "EUR", target: 500 },
    { op: "pledge", drive: "Road show II", amount: 60 },
  ], { date: "2026-11-01" });
  assert.equal(created.drives.find((d) => d.name === "Road show II").pledged, 60);
});

// "Ce n'est pas à l'Allemagne seule de payer" — a purpose that is checkable.
test("sourceShares adds up who actually paid, and names the one carrying it", () => {
  const drives = [{
    id: "d1", name: "Holding", owner: "Saint-Siège", currency: "EUR", target: 1000, pledged: 800, collected: 300,
    log: [
      { date: "2026-11-21", op: "pledge", amount: 500, source: "Chemin synodal allemand" },
      { date: "2027-06-01", op: "collect", amount: 250, source: "Chemin synodal allemand" },
      { date: "2027-07-01", op: "pledge", amount: 200, source: "Mécènes d'Amérique latine" },
      { date: "2027-08-01", op: "pledge", amount: 100, source: "Diaspora philippine" },
      { date: "2027-08-15", op: "collect", amount: 50, source: "Diaspora philippine" },
    ],
  }];
  const shares = sourceShares(drives, { owner: "Saint-Siège" });
  assert.equal(shares.length, 3);
  assert.equal(shares[0].source, "Chemin synodal allemand");
  assert.equal(shares[0].pledged, 500);
  assert.equal(shares[0].shareOfPledged, 0.625);
  assert.equal(shares[0].shareOfCollected, 250 / 300 === 0.8333333333333334 ? 0.833 : shares[0].shareOfCollected);

  const text = describeConcentration(drives, { owner: "Saint-Siège" });
  assert.match(text, /3 named contributors/);
  assert.match(text, /Chemin synodal allemand, provides 63%/);
  assert.match(text, /One contributor is carrying it/i);
  assert.match(text, /not a claim on the undertaking/);
  assert.match(text, /Broadening it means new contributors actually pledging/);
});

test("a broadly funded drive is not lectured, and an empty one says nothing", () => {
  const spread = [{
    id: "d2", name: "Holding", owner: "Rome", currency: "EUR", target: 900, pledged: 900, collected: 0,
    log: [
      { date: "2027-01-01", op: "pledge", amount: 300, source: "Africa" },
      { date: "2027-02-01", op: "pledge", amount: 300, source: "Asia" },
      { date: "2027-03-01", op: "pledge", amount: 300, source: "Americas" },
    ],
  }];
  assert.match(describeConcentration(spread, { owner: "Rome" }), /No single contributor carries it/);
  assert.ok(CONCENTRATION_CEILING > 0.33, "three equal sources must not read as concentrated");
  assert.equal(describeConcentration([], { owner: "Rome" }), "");
});

// The campaign that launched with a 500 M target and opened nothing.
test("a campaign launched with a figure must open a drive", () => {
  const event = {
    title: "Lancement du road-show multilatéral « Pax Mundo 2028 »",
    description: "Le Saint-Siège a lancé le road-show multilatéral de la holding, fixant une cible globale de 500 millions d'euros pour financer les grands rassemblements.",
    impacts: {},
  };
  const lines = reconcileNarration([event], { drives: [], player: "Saint-Siège" });
  assert.equal(lines.length, 1);
  assert.match(lines[0].text, /launches a campaign for 500 M EUR and opens no drive/);
  assert.match(lines[0].text, /driveOps \{"op":"create"/);

  // Opened in the same edition: nothing to say.
  const opened = { ...event, impacts: { driveOps: [{ op: "create", name: "Pax Mundo 2028", target: 500, currency: "EUR" }] } };
  assert.deepEqual(reconcileNarration([opened], { drives: [] }), []);

  // A drive the world already holds under that name is not re-demanded.
  const held = [{ id: "d9", name: "Pax Mundo 2028", owner: "Saint-Siège", currency: "EUR", target: 500 }];
  assert.deepEqual(reconcileNarration([event], { drives: held }), []);
});

// A payment schedule is not a payment: the engine must not call it a false
// claim of receipt. Field report: "Transmission de l'échéancier pour le solde
// de la dotation allemande" was refused as if it had credited 250 M.
test("a schedule, a plan of instalments, and the word dotation are not claims of receipt", () => {
  const drives = [{ id: "d1", name: "Dotation de l'Église d'Allemagne", owner: "Saint-Siège", currency: "EUR", target: 500, pledged: 500, collected: 250 }];
  const schedule = {
    title: "Transmission de l'échéancier pour le solde de la dotation allemande",
    description: "La Conférence épiscopale allemande a transmis l'échéancier de versement du solde de 250 millions d'euros de sa dotation vers les comptes de la holding.",
    impacts: {},
  };
  assert.deepEqual(reconcileNarration([schedule], { drives, player: "Saint-Siège" }), [], "a calendar moves nothing and claims nothing");

  // The word "dotation" alone never means the money landed.
  const naming = { title: "Point sur la dotation", description: "La dotation de 500 millions d'euros structure notre plan.", impacts: {} };
  assert.deepEqual(reconcileNarration([naming], { drives, player: "Saint-Siège" }), []);

  // But a genuine claim of arrival is still caught.
  const arrived = { title: "Versement effectué", description: "Les 250 millions d'euros ont été encaissés sur les comptes de la holding.", impacts: {} };
  assert.equal(reconcileNarration([arrived], { drives, player: "Saint-Siège" }).length, 1);
});

// The third false alarm, and the reason the check now reads sentence by
// sentence: a demand for money, with the sum in one sentence and a verb of
// payment in another, is not a claim that the money arrived.
test("a demand, an obligation and a condition are not receipts", () => {
  const drives = [{ id: "d1", name: "Dotation de l'Église d'Allemagne", owner: "Saint-Siège", currency: "EUR", target: 500, pledged: 500, collected: 250 }];
  const demand = {
    title: "Exigence du solde de la dotation allemande par le Saint-Siège",
    description: "Le Secrétariat d'État a transmis une note ferme, exigeant le versement immédiat des 250 millions d'euros restant dus sur la dotation initiale de 500 millions. Cette somme doit être versée directement sur les comptes de la holding. La publication des décrets demeurera bloquée tant que les fonds n'auront pas été intégralement crédités.",
    impacts: {},
  };
  assert.deepEqual(reconcileNarration([demand], { drives, player: "Saint-Siège" }), []);
  assert.equal(claimedReceipt(demand.description), null);

  // Past tense, no condition, the sum in the same sentence: that is a receipt.
  assert.deepEqual(claimedReceipt("Les 250 millions d'euros ont été encaissés sur les comptes de la holding."), { millions: 250, currency: "EUR" });
  assert.equal(reconcileNarration([{ title: "Versement", description: "Les 250 millions d'euros ont été encaissés.", impacts: {} }], { drives }).length, 1);

  // The sum in one sentence, the payment verb in another: not a claim.
  assert.equal(claimedReceipt("Le solde s'élève à 250 millions d'euros. Il sera versé plus tard."), null);
});

// 250 M pledged, promised twice in correspondence, never paid across fourteen
// editions and four months — because nothing obliged an edition to settle it.
test("a pledge left unpaid past the grace period becomes an obligation on the edition", () => {
  const drives = [{
    id: "d1", name: "Dotation de l'Église d'Allemagne", owner: "Saint-Siège", currency: "EUR",
    target: 500, pledged: 500, collected: 250,
    log: [{ date: "2026-11-21", op: "pledge", amount: 500 }, { date: "2027-06-01", op: "collect", amount: 250 }],
  }];
  const late = overduePledges(drives, { asOf: "2028-04-03" });
  assert.equal(late.length, 1);
  assert.equal(late[0].owed, 250);
  assert.equal(late[0].since, "2027-06-01");
  assert.ok(late[0].days > 300);

  const text = describeOutstanding(drives, { asOf: "2028-04-03", player: "Saint-Siège" });
  assert.match(text, /250 M EUR pledged to "Dotation de l'Église d'Allemagne" has been owed since 2027-06-01/);
  assert.match(text, /THIS edition settles each of them/);
  assert.match(text, /"op":"collect"/);
  assert.match(text, /"op":"withdraw"/);
  assert.match(text, /An impediment with no name is not an impediment/);
  assert.match(text, /a third time is not diplomacy/);
});

test("a fresh pledge, a paid drive and a closed one are left alone", () => {
  const fresh = [{ id: "d2", name: "New", owner: "X", currency: "EUR", target: 100, pledged: 100, collected: 0, log: [{ date: "2028-03-20", op: "pledge", amount: 100 }] }];
  assert.deepEqual(overduePledges(fresh, { asOf: "2028-04-03" }), []);
  assert.equal(describeOutstanding(fresh, { asOf: "2028-04-03" }), "");

  const paid = [{ id: "d3", name: "Paid", owner: "X", currency: "EUR", target: 100, pledged: 100, collected: 100, log: [{ date: "2026-01-01", op: "collect", amount: 100 }] }];
  assert.deepEqual(overduePledges(paid, { asOf: "2028-04-03" }), []);

  const closed = [{ id: "d4", name: "Closed", owner: "X", status: "closed", currency: "EUR", target: 100, pledged: 100, collected: 0, log: [{ date: "2026-01-01", op: "pledge", amount: 100 }] }];
  assert.deepEqual(overduePledges(closed, { asOf: "2028-04-03" }), []);

  // Without a date to measure against, nothing is overdue.
  assert.deepEqual(overduePledges(fresh, {}), []);
});

// Five drives opened by old orders, never fed, each printing "nothing moved"
// beside the others until the ledger taught the reader to stop reading it.
test("a drive nobody ever feeds closes itself", () => {
  const drives = [
    { id: "a", name: "Road show", owner: "X", currency: "EUR", target: 0, startedAt: "2026-10-01", log: [] },
    { id: "b", name: "Souscription", owner: "X", currency: "EUR", target: 500, startedAt: "2026-10-01", log: [] },
    { id: "c", name: "Vivante", owner: "X", currency: "EUR", target: 500, pledged: 60, startedAt: "2026-10-01", log: [{ date: "2028-03-01", op: "pledge", amount: 60 }] },
  ];
  const { drives: next, closed } = pruneDormantDrives(drives, { asOf: "2028-04-06" });
  assert.equal(closed.length, 2);
  assert.match(closed[0], /"Road show" was opened on 2026-10-01 and never received anything/);
  assert.equal(next.find((d) => d.id === "a").status, "closed");
  assert.equal(next.find((d) => d.id === "b").status, "closed");
  assert.equal(next.find((d) => d.id === "c").status, "open", "a drive with a pledge is left alone");

  // Too young to close, and nothing to do without a date to measure from.
  const young = [{ id: "d", name: "Neuve", owner: "X", currency: "EUR", target: 100, startedAt: "2028-03-01", log: [] }];
  assert.deepEqual(pruneDormantDrives(young, { asOf: "2028-04-06" }).closed, []);
  assert.deepEqual(pruneDormantDrives(young, {}).closed, []);
});

// « 96 millions d'euros promis » s'imprimait « 143 k€ » sur le cahier des
// comptes. Deux unités portaient le même nom : les chiffres d'une campagne sont
// des millions dans SA monnaie, jamais des années-subsistance, et le cahier les
// passait par la conversion des AS.
test("une somme de campagne se convertit par sa monnaie, pas par le taux des années-subsistance", () => {
  assert.equal(usdFromMillions(96, "EUR"), 96e6 * 1.0824);
  assert.equal(usdFromMillions(96, "USD"), 96e6);
  assert.equal(usdFromMillions(0, "EUR"), 0);
  // Monnaie inconnue : le dollar, comme partout ailleurs dans ce fichier.
  assert.equal(usdFromMillions(5, "XXX"), 5e6);

  // Et syFromMillions passe bien par la même conversion, pour que la caisse et
  // l'affichage ne puissent plus diverger.
  const eco = { usdPerSY: 1000 };
  assert.equal(syFromMillions(96, "EUR", eco), usdFromMillions(96, "EUR") / 1000);
});
