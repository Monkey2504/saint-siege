/*! Open Historia — projectFinance tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { realOutput } from "./economy.js";
import { seedEconomy } from "./economyBridge.js";
import {
  applyProgramDelta, applyProgramOps, basketValue, checkEligibility, createProgram, describeProgram, normalizeProgram,
  describesTokenizedFinancing, projectCap, stepProgram, tokenPrice, uptakeRate,
} from "./projectFinance.js";

// A Congo-sized modern economy: thin markets, middling credibility.
const congo = () => seedEconomy({ year: 2016, regionShare: 0.02, population: 80e6 });
const withDepth = (e, financialDepth, fiscalCredibility) => ({ ...e, financialDepth, fiscalCredibility });
const port = (e, extra = {}) => ({ name: "Port of Banana", kind: "productive", sector: "port", cost: realOutput(e) * 0.008, expectedYield: 0.12, buildYears: 3, ...extra });

test("createProgram starts on the state's credibility, with the strict governance on by default", () => {
  const e = congo();
  const prog = createProgram(e, { name: "Congo Infrastructure Tokens", currencyB: true, goldBuyback: { enabled: true, thresholdShareOfOutput: 0.02 } });
  assert.equal(prog.score, e.fiscalCredibility);
  assert.equal(prog.governance.independentAudit, true);
  assert.equal(prog.governance.milestoneDisbursement, true);
  assert.equal(prog.currencyB, true);
  assert.equal(prog.goldBuyback.enabled, true);
  assert.equal(tokenPrice(prog, e), 1, "no tokens yet: par");
  assert.equal(normalizeProgram(null), null);
});

test("rule 3: brownfield is refused as debt in disguise; rule 8: too large for the record is refused; the ceiling grows with delivery", () => {
  const e = congo();
  const prog = createProgram(e);
  const mine = checkEligibility(prog, e, { name: "Kamoto copper", kind: "productive", cost: 1000, expectedYield: 0.2, existing: true });
  assert.equal(mine.eligible, false);
  assert.match(mine.reasons[0], /brownfield.*debt in disguise/);
  const huge = checkEligibility(prog, e, port(e, { cost: realOutput(e) * 0.2 }));
  assert.equal(huge.eligible, false);
  assert.match(huge.reasons[0], /too large for the programme's record/);
  const ok = checkEligibility(prog, e, port(e));
  assert.equal(ok.eligible, true, ok.reasons.join("; "));
  const delivered = normalizeProgram({ ...prog, largestCompleted: realOutput(e) * 0.01, score: 70 });
  assert.ok(projectCap(delivered, e) > projectCap(prog, e), "a delivery raises the ceiling");
  const burned = normalizeProgram({ ...delivered, score: 25 });
  assert.ok(projectCap(burned, e) < projectCap(delivered, e) * 0.5, "a lost record cuts it harder than it rose");
});

test("a six-order-of-magnitude cost typo (\"215\" meant as \"215,000,000\") is refused, not silently accepted", () => {
  const e = congo();
  const prog = createProgram(e);
  const intended = port(e, { name: "Giga-Factory Cluster 2" }); // realOutput(e) * 0.008, within a fresh programme's ceiling
  const typoed = checkEligibility(prog, e, { ...intended, cost: intended.cost / 1_000_000 });
  assert.equal(typoed.eligible, false);
  assert.match(typoed.reasons[0], /implausibly small.*magnitude error/);
  assert.equal(checkEligibility(prog, e, intended).eligible, true, "the same project at its real cost is fine");
  // A genuinely tiny but real pilot project, still well above the floor, is not caught by it.
  const tinyButReal = checkEligibility(prog, e, port(e, { cost: Math.max(2000, realOutput(e) * 0.0001) }));
  assert.equal(tinyButReal.eligible, true, tinyButReal.reasons.join("; "));

  // Regression: a cost of exactly 0 (a dropped field, not a small typo) once
  // slipped through live, because the floor check only fired for a small
  // POSITIVE cost and 0 fails "> 0" — the exact same failure this rule exists
  // to catch, just at the other edge of it.
  const zeroed = checkEligibility(prog, e, { ...intended, cost: 0 });
  assert.equal(zeroed.eligible, false);
  assert.match(zeroed.reasons[0], /implausibly small.*magnitude error/);
});

test("rule 7: a social project needs realised productive cash, and the shortfall is stated in productive capital", () => {
  const e = congo();
  const prog = createProgram(e);
  const school = { name: "Rural schools", kind: "social", sector: "education", cost: realOutput(e) * 0.004, expectedYield: 0.1 };
  const refused = checkEligibility(prog, e, school);
  assert.equal(refused.eligible, false);
  assert.match(refused.reasons[0], /social project needs productive cash.*productive capital at 10%/);
  const earning = normalizeProgram({ ...prog, projects: [{ ...port(e, { cost: realOutput(e) * 0.01 }), status: "operating", realizedYield: 0.12, progress: 1 }] });
  assert.equal(checkEligibility(earning, e, school).eligible, true);
});

test("rule 4, honestly: uptake depends on the yield against the rate, the record, governance and the market's depth", () => {
  const e = congo();
  const thin = withDepth(e, 20, 40);
  const deep = withDepth(e, 85, 80);
  const prog = createProgram(e);
  const p = port(e);
  assert.ok(uptakeRate(prog, deep, p).total > uptakeRate(prog, thin, p).total, "deeper markets buy more");
  const generous = port(e, { expectedYield: 0.25 });
  const stingy = port(e, { expectedYield: 0.03 });
  assert.ok(uptakeRate(prog, thin, generous).total > uptakeRate(prog, thin, stingy).total, "a yield below the rate sells nothing much");
  const sloppy = normalizeProgram({ ...prog, governance: { independentAudit: false, publicLedger: false, milestoneDisbursement: false } });
  assert.ok(uptakeRate(sloppy, thin, p).total < uptakeRate(prog, thin, p).total, "governance is priced");
  const open = { ...thin, openness: 60 };
  assert.ok(uptakeRate(prog, open, p).foreign > uptakeRate(prog, { ...thin, openness: 5 }, p).foreign);
});

test("inconvertibility costs foreign uptake, not domestic: a wall that keeps capital in also keeps a wary foreign investor out", () => {
  const e = congo();
  const prog = createProgram(e);
  const p = port(e);
  const inconvertible = { ...e, monetarySystem: { ...e.monetarySystem, convertibility: 0 } };
  const fullyConvertible = { ...e, monetarySystem: { ...e.monetarySystem, convertibility: 1 } };
  const shut = uptakeRate(prog, inconvertible, p);
  const open = uptakeRate(prog, fullyConvertible, p);
  assert.ok(shut.foreign < open.foreign, "0% convertible sells less to foreigners than 100%");
  assert.equal(shut.domestic, open.domestic, "domestic appetite does not care whether foreigners can repatriate anything");
  assert.ok(shut.foreign / open.foreign < 0.35, "the penalty is real, not token — roughly the 70% cut the rule promises");
});

test("capacity congestion: several megaprojects under construction at once cost real execution quality, forgiven as administrative reach approaches 100", () => {
  const e = congo();
  const lowReach = { ...e, administrativeReach: 40 };
  const highReach = { ...e, administrativeReach: 99 };
  const output = realOutput(e);
  const governance = { independentAudit: true, publicLedger: true, milestoneDisbursement: true, revaluationOnCashOnly: true };

  const finishing = () => ({
    id: "flagship", name: "Flagship", kind: "productive", sector: "energy", existing: false,
    cost: output * 0.1, expectedYield: 0.12, buildYears: 2, status: "building",
    funded: output * 0.1 * 1.05, disbursed: output * 0.1 * 0.98, progress: 0.999, realizedYield: 0,
    subscribingYears: 1, delayYears: 0, startedAt: "2020-01-01", completedAt: "", note: "", coupledTo: [],
  });
  const rival = (id) => ({
    id, name: id, kind: "productive", sector: "industry", existing: false,
    cost: output * 0.4, expectedYield: 0.1, buildYears: 3, status: "building",
    funded: output * 0.2, disbursed: output * 0.1, progress: 0.3, realizedYield: 0,
    subscribingYears: 1, delayYears: 0, startedAt: "2020-01-01", completedAt: "", note: "", coupledTo: [],
  });

  const progHeavy = normalizeProgram({ proceedsHeld: output, governance, projects: [finishing(), rival("b"), rival("c")] });
  const progLight = normalizeProgram({ proceedsHeld: output, governance, projects: [finishing()] });

  const heavy = stepProgram(progHeavy, lowReach, { years: 1, date: "2022-01-01" }).program.projects.find((p) => p.id === "flagship");
  const light = stepProgram(progLight, lowReach, { years: 1, date: "2022-01-01" }).program.projects.find((p) => p.id === "flagship");
  assert.equal(heavy.status, "operating");
  assert.equal(light.status, "operating");
  assert.ok(heavy.realizedYield < light.realizedYield, "the SAME project completes worse when others are competing for capacity at once");

  const heavyButCapable = stepProgram(progHeavy, highReach, { years: 1, date: "2022-01-01" }).program.projects.find((p) => p.id === "flagship");
  assert.ok(heavyButCapable.realizedYield > heavy.realizedYield, "a state that actually runs its whole territory absorbs the same simultaneous load far better");
});

test("a port from proposal to cash: partial subscription, milestone disbursement, completion into the capital stock, cash marks the basket", () => {
  const e = withDepth(congo(), 45, 60);
  let { program, notes } = applyProgramOps(null, e, [
    { op: "create", program: { name: "CIT" } },
    { op: "propose", project: port(e) },
    { op: "propose", project: { ...port(e), name: "Inga III", existing: true } },
  ]);
  assert.match(notes[1], /eligible.*sale opened/);
  assert.match(notes[2], /REFUSED — brownfield/);
  assert.equal(program.projects.length, 1);
  assert.equal(program.projects[0].status, "subscribing");

  let economy = e;
  let capitalBefore = economy.capital;
  const seen = [];
  for (let year = 1; year <= 8; year += 1) {
    const step = stepProgram(program, economy, { years: 1, date: `${2016 + year}-01-01` });
    program = step.program;
    economy = applyProgramDelta(economy, step.economyDelta);
    seen.push(program.projects[0].status);
  }
  assert.ok(seen.includes("building") && seen.includes("operating"), `lifecycle ${seen.join(" > ")}`);
  const p = program.projects[0];
  assert.ok(p.funded > 0 && p.funded <= p.cost * 1.04, `funded ${p.funded} vs cost ${p.cost} (gross-up covers the 3% structuring fee)`);
  assert.ok(economy.capital > capitalBefore, "the built port entered the capital stock");
  assert.ok(economy.marketIntegration > e.marketIntegration, "a port integrates markets");
  assert.ok(p.realizedYield > 0 && p.realizedYield <= p.expectedYield * 1.05, `earns ${p.realizedYield} against ${p.expectedYield} promised`);
  assert.ok(program.cashPaidToHolders > 0, "holders were paid from cash");
  assert.ok(program.largestCompleted === p.cost);
  assert.ok(program.score >= 60, "delivery earns record");
  assert.ok(basketValue(program, economy) > 0);
  const price = tokenPrice(program, economy);
  assert.ok(price > 0.3 && price < 3, `token price ${price}`);
  // Rule 5: adding a proposal does not lift the price.
  const { program: more } = applyProgramOps(program, economy, [{ op: "propose", project: port(economy, { name: "Matadi rail", sector: "rail", cost: p.cost * 1.5 }) }]);
  assert.ok(Math.abs(tokenPrice(more, economy) - price) < 1e-9, "a new project in the basket is not a price rise");
});

test("sovereign structuring fee: 3% of capital actually raised lands in the state's ordinary treasury, token holders still get full face value, and the project still fully completes", () => {
  const e = withDepth(congo(), 45, 60);
  let { program } = applyProgramOps(null, e, [{ op: "create", program: { name: "CIT" } }, { op: "propose", project: port(e) }]);
  let economy = e;
  let feeCollected = 0;
  let iterations = 0;
  while (program.projects[0].status !== "operating" && iterations < 12) {
    const step = stepProgram(program, economy, { years: 1, date: `${2017 + iterations}-01-01` });
    feeCollected += step.economyDelta.treasury;
    program = step.program;
    economy = applyProgramDelta(economy, step.economyDelta);
    iterations += 1;
  }
  const p1 = program.projects[0];
  assert.equal(p1.status, "operating", "the fee does not prevent the project from ever finishing");
  assert.ok(Math.abs(p1.progress - 1) < 1e-6, "fully built, not stuck below 100% by the fee");
  assert.ok(feeCollected > 0);
  assert.ok(Math.abs(feeCollected - p1.funded * 0.03) / (p1.funded * 0.03) < 0.05, `fee ${feeCollected} vs 3% of raised ${p1.funded * 0.03}`);
  assert.ok(p1.funded > p1.cost, "the raise is grossed up so NET proceeds still cover the full construction cost");
  assert.ok(p1.funded / p1.cost < 1.05, "grossed up by roughly the fee rate, not more");
});

test("a sale nobody wants fails after two years and costs the record; sloppy governance leaks money", () => {
  const e = withDepth(congo(), 8, 25);
  // Small enough for a poor record's ceiling; a yield below what money costs.
  let { program, notes } = applyProgramOps(null, e, [{ op: "create", program: { name: "CIT" } }, { op: "propose", project: port(e, { cost: realOutput(e) * 0.002, expectedYield: 0.02 }) }]);
  assert.match(notes[1], /eligible/, notes[1]);
  for (let y = 0; y < 3; y += 1) program = stepProgram(program, e, { years: 1, date: `${2017 + y}-01-01` }).program;
  assert.equal(program.projects[0].status, "failed");
  assert.ok(program.score < e.fiscalCredibility);
  assert.equal(program.tokensOutstanding, 0, "tokens refunded");

  const strict = createProgram(withDepth(congo(), 60, 70));
  const sloppy = normalizeProgram({ ...strict, governance: { independentAudit: false, publicLedger: false, milestoneDisbursement: false } });
  // The programme holds more cash than this one project needs (other sales), so
  // an undisciplined treasurer CAN overpay it.
  const seed = (prog) => normalizeProgram({ ...prog, tokensOutstanding: 1500, proceedsHeld: 1500, projects: [{ name: "X", kind: "productive", cost: 1000, expectedYield: 0.1, buildYears: 2, status: "building", funded: 1000 }] });
  const a = stepProgram(seed(strict), withDepth(congo(), 60, 70), { years: 2 }).program.projects[0];
  const b = stepProgram(seed(sloppy), withDepth(congo(), 60, 70), { years: 2 }).program.projects[0];
  assert.ok(b.disbursed > a.disbursed, "undisciplined disbursement pays out more for the same work");
  assert.equal(a.status, "operating");
  assert.equal(b.status, "operating");
  assert.ok(b.realizedYield < a.realizedYield, "and the leakier build is the worse asset");
});

test("rule 6: a managed A/B rate that ignores the market breeds a black market; rule 10: a buyback withdraws only what real money can pay", () => {
  const e = withDepth(congo(), 50, 60);
  // A project big enough that its disbursement crosses the buyback threshold
  // (0.1% of output), with only 100 SY of foreign money to pay for gold.
  const big = realOutput(e) * 0.004;
  let program = normalizeProgram({ ...createProgram(e, { currencyB: true, conversion: { officialRate: 1, managed: true }, goldBuyback: { enabled: true, thresholdShareOfOutput: 0.001 } }),
    tokensOutstanding: big, proceedsHeld: big, foreignProceedsHeld: 100,
    projects: [{ name: "Y", kind: "productive", cost: big, expectedYield: 0.02, buildYears: 1, status: "building", funded: big * 1.05 }] }); // above the grossed-up target, so it does not re-enter the sale branch
  const step = stepProgram(program, { ...e, treasury: 0 }, { years: 1, date: "2018-01-01" });
  assert.ok(step.program.goldBuyback.boughtTotal > 0 && step.program.goldBuyback.boughtTotal <= 100 + 1e-9, "paid out of foreign proceeds only");
  assert.ok(step.program.goldBuyback.unfunded > 0, "the rest could not be paid for");
  assert.ok(step.notes.some((n) => /printed, which adds money/.test(n)));
  assert.equal(step.economyDelta.reserves, step.program.goldBuyback.boughtTotal);
  // Now the project earns 2% against a rate far above it: the basket is worth much less than face,
  // the official rate of 1 is far off the market, and the channel goes black.
  let after = { ...step.program, goldBuyback: { ...step.program.goldBuyback, enabled: false } };
  for (let y = 0; y < 2; y += 1) after = stepProgram(after, e, { years: 1, date: `${2019 + y}-01-01` }).program;
  assert.ok(tokenPrice(after, e) < 0.8, `token price ${tokenPrice(after, e)}`);
  assert.ok(after.conversion.blackMarketPremium > 0.15);
  assert.ok(after.events.some((n) => /black market forms/.test(n)));
});

test("describeProgram states the record, the ceiling, governance, each project and the coupling", () => {
  const e = withDepth(congo(), 45, 60);
  const { program } = applyProgramOps(null, e, [{ op: "create", program: { name: "CIT", currencyB: true, currencyBLabel: "franc-panier" } }, { op: "propose", project: port(e) }]);
  const text = describeProgram(program, e);
  assert.match(text, /^Programme "CIT": 0 investment tokens outstanding/);
  assert.match(text, /record \d+\/100/);
  assert.match(text, /ceiling for the next project/);
  assert.match(text, /audit independent, ledger public, disbursement by verified milestone/);
  assert.match(text, /Currency B \(franc-panier\) indexed/);
  assert.match(text, /- Port of Banana \[productive, port\].*subscribing/);
  assert.equal(describeProgram(null, e), "");
});

test("describesTokenizedFinancing: a mechanical, non-LLM detector for a queued action that actually asks for it", () => {
  assert.equal(describesTokenizedFinancing("Lancer l’emission de tokens greenfield pour le port, sans dette et decaissement par jalon."), true);
  assert.equal(describesTokenizedFinancing("Emit tokenised, revenue-linked notes for the dam, no fixed obligation on the state."), true);
  assert.equal(describesTokenizedFinancing("Financement conditionnel via jetons d’investissement pour l’usine."), true);
  assert.equal(describesTokenizedFinancing("Declare war on the neighbouring polity and mobilise the army."), false);
  assert.equal(describesTokenizedFinancing("Raise taxes and build a normal road with a regular loan."), false);
  assert.equal(describesTokenizedFinancing(""), false);
  assert.equal(describesTokenizedFinancing(null), false);
  assert.equal(describesTokenizedFinancing(undefined), false);
  // Field evidence: the vocabulary an actual playthrough actually used for
  // follow-up decrees, once the mechanism itself was already established.
  assert.equal(describesTokenizedFinancing("Lancement du Palier 3 : megaprojets intangibles finances par nos RWA."), true);
  assert.equal(describesTokenizedFinancing("Ces actifs réels alimentent notre Monnaie A face aux investisseurs de Singapour."), true);
  assert.equal(describesTokenizedFinancing("Programme de titrisation des redevances portuaires."), true);
  // Straight and curly apostrophes both match the same term.
  assert.equal(describesTokenizedFinancing("financement d'un jeton d'investissement pour le barrage"), true);
});
