/*! Open Historia — the economy engine's identities, shown as they are computed © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The stat sheet shows the AI's prose figures. This shows the ENGINE's — and,
// because the point of the engine is that a player can learn why a policy
// worked or failed, it shows the arithmetic too: each line is an identity
// with its terms filled in, so "the state takes 4.4% of output" reads as
// reach × monetization × rate, and a shortfall reads as the constraint that
// bound. Numbers are in subsistence-years (SY): what one person needs to
// live for a year, the era-neutral unit the engine runs on.
import React from "react";
import {
  annualRevenue, annualSpending, evaluateMonetarySystem, explainShortfall, economyIndicators,
  maxTaxEffort, normalizeEconomy, pledgeableValue, realOutput, taxableBase, velocityOf,
} from "../../runtime/economy.js";
import { attritionOver, describeCurrencyPosition, upkeepFunding } from "../../runtime/economyBridge.js";
import { basketValue, normalizeProgram, productiveCoverage, projectCap, socialBurden, tokenPrice } from "../../runtime/projectFinance.js";
import { CONTINENTS, FAITHFUL_GROWTH, normalizeChurch, totalFaithful } from "../../runtime/churchFaithful.js";

const fmt = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  const abs = Math.abs(v);
  const [d, s] = abs >= 1e12 ? [1e12, "T"] : abs >= 1e9 ? [1e9, "B"] : abs >= 1e6 ? [1e6, "M"] : abs >= 1e3 ? [1e3, "k"] : [1, ""];
  return `${(v / d).toFixed(abs / d >= 100 || d === 1 ? 0 : 1)}${s}`;
};
const pct = (n) => (Number.isFinite(Number(n)) ? `${(Number(n) * 100).toFixed(1)}%` : "—");

// The ledger: the engine's identities written as accounts — labels in the
// chancellery's small capitals, figures in a face where digits line up.
const box = { backgroundColor: "var(--oh-plate-2)", border: "1px solid var(--oh-accent-soft)", borderRadius: "2px", padding: "0.75rem 0.85rem" };
const title = { color: "var(--oh-accent)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-2xs)", fontWeight: 500, letterSpacing: "var(--oh-label-track)", marginTop: "0.95rem", textTransform: "var(--oh-label-case)" };
const line = { color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5 };
const term = { color: "var(--oh-text-dim)" };
const strong = { color: "var(--oh-text)", fontWeight: 600, fontFamily: "var(--oh-font-data)", fontSize: "var(--oh-t-xs)" };
const warn = { color: "var(--oh-caution)" };
const bad = { color: "var(--oh-alert)" };
const good = { color: "var(--oh-grant)" };

const Identity = ({ label, children }) => (
  <div style={{ ...line, marginTop: "0.4rem", borderBottom: "1px dotted var(--oh-line)", paddingBottom: "0.3rem" }}>
    <span style={{ ...term, fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-2xs)", letterSpacing: "0.1em", textTransform: "var(--oh-label-case)" }}>{label} </span>
    <span data-no-translate>{children}</span>
  </div>
);

const Capacity = ({ label, value }) => (
  <div style={{ alignItems: "center", display: "grid", gap: "0.5rem", gridTemplateColumns: "9.5rem 1fr 2.2rem", marginTop: "0.3rem" }}>
    <span style={{ ...line, color: "var(--oh-text)" }}>{label}</span>
    <div style={{ backgroundColor: "var(--oh-plate-2)", borderRadius: "999px", height: "5px", overflow: "hidden" }}>
      <div style={{ backgroundColor: value < 35 ? "var(--oh-caution)" : "var(--oh-accent)", height: "100%", width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
    <span data-no-translate style={{ ...line, textAlign: "right" }}>{Math.round(value)}</span>
  </div>
);

// `units` is this polity's OWN unit list (already filtered to its owner);
// without it the line falls back to what the last step recorded in flows.
const EconomyPanel = ({ code, economy, flows, allEconomies, units = null }) => {
  if (!economy) return null;
  const e = normalizeEconomy(economy);
  const i = economyIndicators(e);
  const output = realOutput(e);
  const base = taxableBase(e);
  const revenue = annualRevenue(e);
  const spending = annualSpending(e);
  const verdict = explainShortfall(e, spending);
  const money = evaluateMonetarySystem(e);
  const sys = e.monetarySystem;
  const effort = maxTaxEffort(e);
  const inKind = 0.35 + 0.65 * (e.monetization / 100);
  const currencyPosition = describeCurrencyPosition(e, allEconomies);
  const recordedUpkeep = Number(flows?.requiredUpkeep);
  const upkeep = Array.isArray(units)
    ? upkeepFunding(units, e)
    : Number.isFinite(recordedUpkeep) && recordedUpkeep > 0
      ? { required: recordedUpkeep, fundedShare: Math.min(1, e.militaryUpkeep / recordedUpkeep), shortfall: 1 - Math.min(1, e.militaryUpkeep / recordedUpkeep) }
      : null;

  return (
    <>
      <div style={title}>⚙️ Engine — computed, not narrated</div>
      <div style={box}>
        <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>
          All figures in subsistence-years (SY): one SY is what one person needs to live for a year. Read each line as the identity it is.
        </div>

        <Identity label="Output =">
          <span style={strong}>{fmt(output)} SY/yr</span> = {fmt(i.population)} people × <span style={strong}>{i.outputPerCapita} SY/head</span>
          <span style={term}> (land, capital and know-how per head; trend growth {pct(i.trendGrowth)})</span>
        </Identity>

        <Identity label="Assessed base =">
          output × reach {Math.round(e.administrativeReach)}% × (in kind {Math.round(inKind * 100)}%) = <span style={strong}>{fmt(base)} SY</span>
          <span style={term}> — {pct(i.reachedShareOfOutput)} of output is within the state's hand at all</span>
        </Identity>

        <Identity label="Revenue =">
          base × rate {pct(e.taxRate)} = {fmt(i.taxRevenue)}
          {i.endowmentIncome > 0 && <> + patrimony {fmt(e.endowment)} × {pct(e.endowmentYield)} = {fmt(i.endowmentIncome)}</>}
          {i.transfers > 0 && <> + transfers/donations {fmt(i.transfers)}</>}
          {" "}= <span style={strong}>{fmt(revenue)} SY/yr</span>
          <span style={term}> ({pct(i.taxTakeOfOutput)} of output{i.nonTaxShare > 0 ? `, ${pct(i.nonTaxShare)} of it not from taxing anyone` : ""}; this society bears up to {pct(effort)} of the base{e.atWar ? " at war" : ""})</span>
        </Identity>

        {(e.endowment > 0 || e.unfundedLiabilities > 0) && (
          <Identity label="Patrimony =">
            <span style={strong}>{fmt(e.endowment)} SY</span>{e.usdPerSY > 0 ? ` ≈ $${fmt(e.endowment * e.usdPerSY)}` : ""}
            {e.unfundedLiabilities > 0 && <span style={term}> − unfunded promises {fmt(e.unfundedLiabilities)} SY{e.usdPerSY > 0 ? ` (≈ $${fmt(e.unfundedLiabilities * e.usdPerSY)})` : ""} = net <span style={i.netPatrimony < 0 ? bad : good}>{fmt(i.netPatrimony)}</span></span>}
            {e.financing === "drawdown" && <span style={warn}> · deficits are paid out of the patrimony{i.yearsOfPatrimonyLeft != null ? ` — gone in ~${i.yearsOfPatrimonyLeft} years at this deficit` : ""}</span>}
          </Identity>
        )}

        <Identity label="Spending =">
          army {fmt(e.militaryUpkeep)} + civil {fmt(e.civilSpending)} + administration + interest {pct(i.interestRate)} × debt {fmt(e.debt)} = <span style={strong}>{fmt(spending)} SY/yr</span>
          {upkeep && upkeep.required > 0 && (
            <span style={upkeep.shortfall > 0 ? warn : term}> · forces in being require {fmt(upkeep.required)} SY/yr, funded at {pct(upkeep.fundedShare)}{upkeep.shortfall > 0 ? ` — the unfunded share loses ${pct(attritionOver(upkeep.shortfall, 1))} of its strength a year` : ""}</span>
          )}
        </Identity>

        <Identity label="Balance =">
          <span style={i.balance < 0 ? bad : good}>{i.balance < 0 ? "−" : "+"}{fmt(Math.abs(i.balance))} SY/yr</span>
          {i.arrearsShare > 0 && <span style={bad}> · in arrears: {pct(i.arrearsShare)} of a year's revenue unpaid ({fmt(i.arrears)} SY) — legitimacy bleeding</span>}
          {e.debt > 0 && <span style={term}> · debt {i.debtOfOutput}× output, ceiling {fmt(i.debtCeiling)}; r − g = {pct(i.rMinusG)} {i.rMinusG < 0 ? "(growth outruns interest: a stable debt share sustains itself)" : "(interest outruns growth: debt compounds unless the primary balance covers it)"}</span>}
        </Identity>

        {!verdict.affordable && verdict.constraints[0] && (
          <div style={{ ...line, ...warn, marginTop: "0.5rem" }}>
            <span style={{ fontWeight: 700 }}>Binding constraint: {verdict.constraints[0].factor}.</span> {verdict.constraints[0].detail}
          </div>
        )}

        <Identity label="Prices:">
          M × V = P × Y → money {fmt(i.effectiveMoney)} × velocity {velocityOf(e).toFixed(2)} ÷ output ⇒ implied <span style={strong}>{i.impliedPriceLevel}</span>, walking from {i.priceLevel}
          <span style={term}> · expected inflation {pct(i.expectedInflation)}{i.policyRate != null ? `, policy rate ${pct(i.policyRate)}` : ""}</span>
        </Identity>

        <Identity label="Money:">
          {sys.label ? `"${sys.label}" — ` : ""}{sys.backing === "none" ? "unbacked" : sys.backing === "commodity" ? "commodity-backed" : "backed by claims on future revenue"}, issued by {sys.issuer}, rule {sys.rule}, {sys.convertibility > 0 ? `convertible ${Math.round(sys.convertibility * 100)}%` : "not convertible"}
          {i.backingRatio != null && <span style={term}> · reserve cover {pct(i.backingRatio)} ({fmt(e.reserves)} SY{e.usdPerSY > 0 ? ` ≈ $${fmt(e.reserves * e.usdPerSY)}` : ""} held)</span>}
          {e.claimsOutstanding > 0 && <span style={term}> · claims {fmt(e.claimsOutstanding)} SY at {Math.round(i.claimsPrice * 100)}% of face against {fmt(pledgeableValue(e))} pledgeable</span>}
        </Identity>
        {money.binding && money.binding.severity > 0.3 && (
          <div style={{ ...line, ...(money.binding.severity > 0.7 ? bad : warn), marginTop: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Monetary verdict: {money.binding.factor}.</span> {money.binding.detail}
          </div>
        )}
        {currencyPosition && (
          <Identity label="Trade:">
            {currencyPosition}
          </Identity>
        )}

        {flows && flows.years > 0 && (
          <Identity label="Last period:">
            inflation {pct(flows.inflation)}
            {flows.borrowed > 0 && `, borrowed ${fmt(flows.borrowed)}`}
            {flows.minted > 0 && `, created ${fmt(flows.minted)} of new money`}
            {flows.claimsIssued > 0 && `, issued ${fmt(flows.claimsIssued)} of claims`}
            {flows.tradeLoss > 0 && `, lost ${pct(flows.tradeLoss)} of output to cut trade`}
            {Math.abs(flows.depreciation) > 0.02 && `, currency ${flows.depreciation > 0 ? "weakened" : "strengthened"} ${pct(Math.abs(flows.depreciation))}`}
            {Array.isArray(flows.events) && flows.events.length > 0 && ` · ${flows.events.join(", ").replace(/-/g, " ")}`}
          </Identity>
        )}

        <div style={{ ...title, marginTop: "0.7rem" }}>Capacities — what reforms move</div>
        <Capacity label="Technology" value={e.technology} />
        <Capacity label="Administrative reach" value={e.administrativeReach} />
        <Capacity label="Monetization" value={e.monetization} />
        <Capacity label="Market integration" value={e.marketIntegration} />
        <Capacity label="Financial depth" value={e.financialDepth} />
        <Capacity label="Fiscal credibility" value={e.fiscalCredibility} />
        <Capacity label="Legitimacy" value={e.legitimacy} />
        <Capacity label="Openness" value={e.openness} />
        {e.innovations.length > 0 && (
          <div style={{ ...line, marginTop: "0.5rem" }}>
            <span style={term}>Innovations: </span>
            {e.innovations.map((n) => `${n.name} (${Math.round(n.adoption * 100)}%)`).join(", ")}
          </div>
        )}
        <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.6rem" }}>
          {code}: the simulation narrates these figures and moves only the capacities and policy; output, prices and debt follow from them.
        </div>
      </div>
    </>
  );
};

// The reforming-pope mode's live count of Catholics, per continent — the
// engine's ledger (see runtime/churchFaithful.js), not the model's prose.
const CONTINENT_LABEL = { africa: "Africa", americas: "Americas", asia: "Asia", europe: "Europe", oceania: "Oceania" };
export const FaithfulPanel = ({ church }) => {
  const c = normalizeChurch(church);
  if (!c) return null;
  const total = totalFaithful(c.faithful);
  return (
    <>
      <div style={title}>✝️ Faithful — living ledger</div>
      <div style={box}>
        <div style={line}>
          <span style={strong} data-no-translate>{(total / 1e9).toFixed(3)} milliard</span>
          <span style={term}> Catholics{c.asOf ? ` as of ${c.asOf}` : ""} — recomputed every turn by the engine (real demography × the Holy See's legitimacy)</span>
        </div>
        {CONTINENTS.map((k) => (
          <div key={k} style={{ alignItems: "center", display: "grid", gap: "0.5rem", gridTemplateColumns: "6rem 1fr 7rem", marginTop: "0.3rem" }}>
            <span style={{ ...line, color: "var(--oh-text)" }}>{CONTINENT_LABEL[k]}</span>
            <div style={{ backgroundColor: "var(--oh-plate-2)", borderRadius: "999px", height: "5px", overflow: "hidden" }}>
              <div style={{ backgroundColor: "var(--oh-caution)", height: "100%", width: `${Math.max(0, Math.min(100, (100 * c.faithful[k]) / Math.max(1, total)))}%` }} />
            </div>
            <span data-no-translate style={{ ...line, textAlign: "right" }}>{fmt(c.faithful[k])} <span style={term}>({pct(FAITHFUL_GROWTH[k])}/an)</span></span>
          </div>
        ))}
        {c.log.length > 0 && (
          <div style={{ ...line, marginTop: "0.5rem" }}>
            <span style={term}>Recorded movements: </span>
            {c.log.slice(-3).map((s, idx) => <div key={idx} data-no-translate style={{ ...line, color: "var(--oh-text)" }}>{s}</div>)}
          </div>
        )}
      </div>
    </>
  );
};

const STATUS_LABEL = {
  proposed: "proposed", subscribing: "selling", building: "building", operating: "operating",
  failed: "sale failed", cancelled: "cancelled",
};
const STATUS_COLOR = {
  proposed: "var(--oh-text-dim)", subscribing: "var(--oh-accent)", building: "var(--oh-caution)",
  operating: "var(--oh-grant)", failed: "var(--oh-alert)", cancelled: "var(--oh-text-dim)",
};

const ProjectRow = ({ p }) => {
  const share = p.status === "subscribing" ? p.funded / p.cost : p.status === "building" ? p.progress : p.status === "operating" ? 1 : 0;
  return (
    <div style={{ marginTop: "0.55rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ ...line, ...strong, fontSize: "var(--oh-t-xs)" }}>{p.name}</span>
        <span style={{ ...line, color: STATUS_COLOR[p.status] || term.color, fontWeight: 700, fontSize: "var(--oh-t-2xs)" }}>{STATUS_LABEL[p.status] || p.status}</span>
      </div>
      <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>
        {p.sector} · {fmt(p.cost)} SY · promised {pct(p.expectedYield)}/yr, {p.buildYears} yr build
        {p.status === "operating" && <> · realised <span style={good}>{pct(p.realizedYield)}/yr</span></>}
        {p.status === "building" && p.delayYears > 0 && <> · <span style={warn}>{p.delayYears.toFixed(1)} yr late</span></>}
      </div>
      {(p.status === "subscribing" || p.status === "building") && (
        <div style={{ backgroundColor: "var(--oh-plate-2)", borderRadius: "999px", height: "5px", marginTop: "0.25rem", overflow: "hidden" }}>
          <div style={{ backgroundColor: STATUS_COLOR[p.status], height: "100%", width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` }} />
        </div>
      )}
    </div>
  );
};

// The programme's own state, shown as identities too: what a token is worth
// (basket value on cash, over tokens outstanding — never a plain sum of
// promises), the ceiling on the next project, governance flags, and each
// project's real progress. This is the only place world.programs is visible
// to a player at all; otherwise it exists only in the save file.
export const ProgramPanel = ({ code, program, economy }) => {
  if (!program || !economy) return null;
  const prog = normalizeProgram(program);
  const e = normalizeEconomy(economy);
  const value = basketValue(prog, e);
  const price = tokenPrice(prog, e);
  const cap = projectCap(prog, e);
  const burden = socialBurden(prog);
  const cover = productiveCoverage(prog);
  const visible = prog.projects.filter((p) => p.status !== "cancelled");

  return (
    <>
      <div style={title}>📜 Programme — {prog.name}</div>
      <div style={box}>
        <Identity label="Token price =">
          basket <span style={strong}>{fmt(value)} SY</span> (marked on cash actually earned) ÷ <span style={strong}>{fmt(prog.tokensOutstanding)} tokens</span> = <span style={strong}>{price.toFixed(3)}</span>
        </Identity>
        <Identity label="Record:">
          {Math.round(prog.score)}/100 · largest delivered {fmt(prog.largestCompleted)} SY · next project ceiling <span style={strong}>{fmt(cap)} SY</span>
        </Identity>
        <Identity label="Governance:">
          audit {prog.governance.independentAudit ? <span style={good}>independent</span> : <span style={bad}>political</span>},{" "}
          ledger {prog.governance.publicLedger ? <span style={good}>public</span> : <span style={bad}>private</span>},{" "}
          disbursement {prog.governance.milestoneDisbursement ? <span style={good}>by milestone</span> : <span style={bad}>discretionary</span>}
        </Identity>
        {prog.currencyB && (
          <Identity label="Currency B:">
            {prog.currencyBLabel || "indexed to the cost of living"} · A/B channel {prog.conversion.managed ? `managed at ${prog.conversion.officialRate}` : "free"}
            {prog.conversion.blackMarketPremium > 0.05 && <> · <span style={bad}>black-market premium {pct(prog.conversion.blackMarketPremium)}</span></>}
          </Identity>
        )}
        {prog.goldBuyback.enabled && (
          <Identity label="Gold buyback:">
            above {pct(prog.goldBuyback.thresholdShareOfOutput)} of output · {fmt(prog.goldBuyback.boughtTotal)} SY bought
            {prog.goldBuyback.unfunded > 0 && <> · <span style={warn}>{fmt(prog.goldBuyback.unfunded)} SY unfunded</span></>}
          </Identity>
        )}
        {burden > 0 && (
          <Identity label="Social coupling:">
            needs {fmt(burden)} SY/yr · realised productive cash {fmt(cover)} SY/yr {cover >= burden ? <span style={good}>covered</span> : <span style={bad}>NOT covered</span>}
          </Identity>
        )}
        <div style={{ ...title, marginTop: "0.7rem" }}>Projects</div>
        {visible.length === 0 && <div style={{ ...line, color: "var(--oh-text-dim)", marginTop: "0.3rem" }}>None proposed yet.</div>}
        {visible.map((p) => <ProjectRow key={p.id} p={p} />)}
        <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.6rem" }}>
          {code}: a token is a claim on this basket's cash, never on ownership or control of what it built.
        </div>
      </div>
    </>
  );
};

export default EconomyPanel;
