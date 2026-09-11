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
      <div style={title}>⚙️ Le moteur — calculé, non raconté</div>
      <div style={box}>
        <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>
          Tous les chiffres en années-subsistance (AS) : une AS est ce qu'il faut à une personne pour vivre un an. Chaque ligne est une identité — lisez-la comme telle.
        </div>

        <Identity label="Production =">
          <span style={strong}>{fmt(output)} AS/an</span> = {fmt(i.population)} personnes × <span style={strong}>{i.outputPerCapita} AS/tête</span>
          <span style={term}> (terre, capital et savoir-faire par tête ; croissance tendancielle {pct(i.trendGrowth)})</span>
        </Identity>

        <Identity label="Base imposable =">
          production × portée {Math.round(e.administrativeReach)}% × (en nature {Math.round(inKind * 100)}%) = <span style={strong}>{fmt(base)} AS</span>
          <span style={term}> — {pct(i.reachedShareOfOutput)} de la production est seulement à portée de l'État</span>
        </Identity>

        <Identity label="Recettes =">
          base × taux {pct(e.taxRate)} = {fmt(i.taxRevenue)}
          {i.endowmentIncome > 0 && <> + patrimoine {fmt(e.endowment)} × {pct(e.endowmentYield)} = {fmt(i.endowmentIncome)}</>}
          {i.transfers > 0 && <> + transferts et dons {fmt(i.transfers)}</>}
          {" "}= <span style={strong}>{fmt(revenue)} AS/an</span>
          <span style={term}> ({pct(i.taxTakeOfOutput)} de la production{i.nonTaxShare > 0 ? `, dont ${pct(i.nonTaxShare)} ne vient de l'impôt de personne` : ""} ; cette société supporte jusqu'à {pct(effort)} de la base{e.atWar ? " en guerre" : ""})</span>
        </Identity>

        {(e.endowment > 0 || e.unfundedLiabilities > 0) && (
          <Identity label="Patrimoine =">
            <span style={strong}>{fmt(e.endowment)} AS</span>{e.usdPerSY > 0 ? ` ≈ $${fmt(e.endowment * e.usdPerSY)}` : ""}
            {e.unfundedLiabilities > 0 && <span style={term}> − promesses non financées {fmt(e.unfundedLiabilities)} AS{e.usdPerSY > 0 ? ` (≈ ${fmt(e.unfundedLiabilities * e.usdPerSY)})` : ""} = net <span style={i.netPatrimony < 0 ? bad : good}>{fmt(i.netPatrimony)}</span></span>}
            {e.financing === "drawdown" && <span style={warn}> · les déficits sont payés sur le patrimoine{i.yearsOfPatrimonyLeft != null ? ` — épuisé dans ~${i.yearsOfPatrimonyLeft} ans à ce déficit` : ""}</span>}
          </Identity>
        )}

        <Identity label="Dépenses =">
          armée {fmt(e.militaryUpkeep)} + civil {fmt(e.civilSpending)} + administration + intérêts {pct(i.interestRate)} × dette {fmt(e.debt)} = <span style={strong}>{fmt(spending)} AS/an</span>
          {upkeep && upkeep.required > 0 && (
            <span style={upkeep.shortfall > 0 ? warn : term}> · les forces en place exigent {fmt(upkeep.required)} AS/an, financées à {pct(upkeep.fundedShare)}{upkeep.shortfall > 0 ? ` — la part non financée perd ${pct(attritionOver(upkeep.shortfall, 1))} de sa force par an` : ""}</span>
          )}
        </Identity>

        <Identity label="Solde =">
          <span style={i.balance < 0 ? bad : good}>{i.balance < 0 ? "−" : "+"}{fmt(Math.abs(i.balance))} AS/an</span>
          {i.arrearsShare > 0 && <span style={bad}> · en arriérés : {pct(i.arrearsShare)} d'une année de recettes impayée ({fmt(i.arrears)} AS) — la légitimité saigne</span>}
          {e.debt > 0 && <span style={term}> · dette {i.debtOfOutput}× la production, plafond {fmt(i.debtCeiling)} ; r − g = {pct(i.rMinusG)} {i.rMinusG < 0 ? "(la croissance dépasse les intérêts : une part de dette stable se soutient d'elle-même)" : "(les intérêts dépassent la croissance : la dette s'accumule tant que le solde primaire ne la couvre pas)"}</span>}
        </Identity>

        {!verdict.affordable && verdict.constraints[0] && (
          <div style={{ ...line, ...warn, marginTop: "0.5rem" }}>
            <span style={{ fontWeight: 700 }}>Contrainte déterminante : {FACTEUR_LABEL[verdict.constraints[0].factor] || verdict.constraints[0].factor}.</span> {verdict.constraints[0].detail}
          </div>
        )}

        <Identity label="Prix :">
          M × V = P × Y → monnaie {fmt(i.effectiveMoney)} × vitesse {velocityOf(e).toFixed(2)} ÷ production ⇒ implicite <span style={strong}>{i.impliedPriceLevel}</span>, en marche depuis {i.priceLevel}
          <span style={term}> · inflation attendue {pct(i.expectedInflation)}{i.policyRate != null ? `, taux directeur ${pct(i.policyRate)}` : ""}</span>
        </Identity>

        <Identity label="Monnaie :">
          {sys.label ? `"${sys.label}" — ` : ""}{sys.backing === "none" ? "sans contrepartie" : sys.backing === "commodity" ? "gagée sur une matière" : "gagée sur des créances à venir"}, émise par {EMETTEUR_LABEL[sys.issuer] || sys.issuer}, règle {REGLE_LABEL[sys.rule] || sys.rule}, {sys.convertibility > 0 ? `convertible à ${Math.round(sys.convertibility * 100)}%` : "non convertible"}
          {i.backingRatio != null && <span style={term}> · couverture des réserves {pct(i.backingRatio)} ({fmt(e.reserves)} AS{e.usdPerSY > 0 ? ` ≈ ${fmt(e.reserves * e.usdPerSY)}` : ""} détenus)</span>}
          {e.claimsOutstanding > 0 && <span style={term}> · créances {fmt(e.claimsOutstanding)} AS à {Math.round(i.claimsPrice * 100)}% du nominal contre {fmt(pledgeableValue(e))} mobilisables</span>}
        </Identity>
        {money.binding && money.binding.severity > 0.3 && (
          <div style={{ ...line, ...(money.binding.severity > 0.7 ? bad : warn), marginTop: "0.35rem" }}>
            <span style={{ fontWeight: 700 }}>Verdict monétaire : {FACTEUR_LABEL[money.binding.factor] || money.binding.factor}.</span> {money.binding.detail}
          </div>
        )}
        {currencyPosition && (
          <Identity label="Commerce :">
            {currencyPosition}
          </Identity>
        )}

        {flows && flows.years > 0 && (
          <Identity label="Période précédente :">
            inflation {pct(flows.inflation)}
            {flows.borrowed > 0 && `, emprunté ${fmt(flows.borrowed)}`}
            {flows.minted > 0 && `, créé ${fmt(flows.minted)} de monnaie nouvelle`}
            {flows.claimsIssued > 0 && `, émis ${fmt(flows.claimsIssued)} de créances`}
            {flows.tradeLoss > 0 && `, perdu ${pct(flows.tradeLoss)} de production par rupture du commerce`}
            {Math.abs(flows.depreciation) > 0.02 && `, monnaie ${flows.depreciation > 0 ? "affaiblie de" : "renforcée de"} ${pct(Math.abs(flows.depreciation))}`}
            {Array.isArray(flows.events) && flows.events.length > 0 && ` · ${flows.events.join(", ").replace(/-/g, " ")}`}
          </Identity>
        )}

        <div style={{ ...title, marginTop: "0.7rem" }}>Capacités — ce que les réformes déplacent</div>
        <Capacity label="Technologie" value={e.technology} />
        <Capacity label="Portée administrative" value={e.administrativeReach} />
        <Capacity label="Monétisation" value={e.monetization} />
        <Capacity label="Intégration du marché" value={e.marketIntegration} />
        <Capacity label="Profondeur financière" value={e.financialDepth} />
        <Capacity label="Crédibilité fiscale" value={e.fiscalCredibility} />
        <Capacity label="Légitimité" value={e.legitimacy} />
        <Capacity label="Ouverture" value={e.openness} />
        {e.innovations.length > 0 && (
          <div style={{ ...line, marginTop: "0.5rem" }}>
            <span style={term}>Innovations : </span>
            {e.innovations.map((n) => `${n.name} (${Math.round(n.adoption * 100)}%)`).join(", ")}
          </div>
        )}
        <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.6rem" }}>
          {code} : la simulation raconte ces chiffres et ne déplace que les capacités et la politique ; production, prix et dette en découlent.
        </div>
      </div>
    </>
  );
};

// The reforming-pope mode's live count of Catholics, per continent — the
// engine's ledger (see runtime/churchFaithful.js), not the model's prose.
// Émetteur et règle monétaire sont eux aussi des clés (economy.js les valide
// contre ISSUERS et RULES) : mêmes tables d'affichage, mêmes clés intactes.
const EMETTEUR_LABEL = { mint: "l'hôtel des monnaies", banks: "les banques", treasury: "le trésor", market: "le marché" };
const REGLE_LABEL = {
  discretionary: "discrétionnaire", taylor: "règle de Taylor", fixed: "croissance fixe",
  peg: "ancrage de change", growthLinked: "indexée sur la croissance",
};

// Le `factor` d'une contrainte est une clé (React, et les invites du moteur) :
// on le rend lisible à l'affichage sans jamais la changer.
export const FACTEUR_LABEL = {
  reach: "la portée de l'État", monetization: "la monétisation", taxRate: "le taux d'imposition",
  credit: "le crédit", futureClaims: "les créances à venir", issuance: "l'émission",
};

const CONTINENT_LABEL = { africa: "Afrique", americas: "Amériques", asia: "Asie", europe: "Europe", oceania: "Océanie" };
export const FaithfulPanel = ({ church }) => {
  const c = normalizeChurch(church);
  if (!c) return null;
  const total = totalFaithful(c.faithful);
  return (
    <>
      <div style={title}>✝️ Les fidèles — registre vivant</div>
      <div style={box}>
        <div style={line}>
          <span style={strong} data-no-translate>{(total / 1e9).toFixed(3)} milliard</span>
          <span style={term}> catholiques{c.asOf ? ` au ${c.asOf}` : ""} — recalculés à chaque tour par le moteur (démographie réelle × légitimité du Saint-Siège)</span>
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
            <span style={term}>Mouvements enregistrés : </span>
            {c.log.slice(-3).map((s, idx) => <div key={idx} data-no-translate style={{ ...line, color: "var(--oh-text)" }}>{s}</div>)}
          </div>
        )}
      </div>
    </>
  );
};

const STATUS_LABEL = {
  proposed: "proposé", subscribing: "en souscription", building: "en construction", operating: "en service",
  failed: "souscription échouée", cancelled: "annulé",
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
        {p.sector} · {fmt(p.cost)} AS · promis {pct(p.expectedYield)}/an, {p.buildYears} an(s) de construction
        {p.status === "operating" && <> · réalisé <span style={good}>{pct(p.realizedYield)}/an</span></>}
        {p.status === "building" && p.delayYears > 0 && <> · <span style={warn}>{p.delayYears.toFixed(1)} an(s) de retard</span></>}
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
        <Identity label="Prix du jeton =">
          panier <span style={strong}>{fmt(value)} AS</span> (valorisé sur l'encaisse réellement gagnée) ÷ <span style={strong}>{fmt(prog.tokensOutstanding)} jetons</span> = <span style={strong}>{price.toFixed(3)}</span>
        </Identity>
        <Identity label="Bilan :">
          {Math.round(prog.score)}/100 · plus grand livré {fmt(prog.largestCompleted)} AS · plafond du prochain projet <span style={strong}>{fmt(cap)} AS</span>
        </Identity>
        <Identity label="Gouvernance :">
          audit {prog.governance.independentAudit ? <span style={good}>indépendant</span> : <span style={bad}>politique</span>},{" "}
          registre {prog.governance.publicLedger ? <span style={good}>public</span> : <span style={bad}>privé</span>},{" "}
          décaissement {prog.governance.milestoneDisbursement ? <span style={good}>par jalon</span> : <span style={bad}>discrétionnaire</span>}
        </Identity>
        {prog.currencyB && (
          <Identity label="Monnaie B :">
            {prog.currencyBLabel || "indexée sur le coût de la vie"} · canal A/B {prog.conversion.managed ? `tenu à ${prog.conversion.officialRate}` : "libre"}
            {prog.conversion.blackMarketPremium > 0.05 && <> · <span style={bad}>prime au marché noir {pct(prog.conversion.blackMarketPremium)}</span></>}
          </Identity>
        )}
        {prog.goldBuyback.enabled && (
          <Identity label="Rachat d'or :">
            au-delà de {pct(prog.goldBuyback.thresholdShareOfOutput)} de la production · {fmt(prog.goldBuyback.boughtTotal)} AS rachetés
            {prog.goldBuyback.unfunded > 0 && <> · <span style={warn}>{fmt(prog.goldBuyback.unfunded)} AS non financés</span></>}
          </Identity>
        )}
        {burden > 0 && (
          <Identity label="Charge sociale :">
            exige {fmt(burden)} AS/an · encaisse productive réalisée {fmt(cover)} AS/an {cover >= burden ? <span style={good}>couverte</span> : <span style={bad}>NON couverte</span>}
          </Identity>
        )}
        <div style={{ ...title, marginTop: "0.7rem" }}>Projets</div>
        {visible.length === 0 && <div style={{ ...line, color: "var(--oh-text-dim)", marginTop: "0.3rem" }}>Aucun projet proposé pour l'instant.</div>}
        {visible.map((p) => <ProjectRow key={p.id} p={p} />)}
        <div style={{ ...line, color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.6rem" }}>
          {code} : un jeton est une créance sur l'encaisse de ce panier, jamais sur la propriété ni le contrôle de ce qu'il a bâti.
        </div>
      </div>
    </>
  );
};

export default EconomyPanel;
