// Cinquième passe : l'onglet COMPTES, resté entièrement en anglais — le moteur
// et ses identités, le registre des fidèles, le programme et ses projets.
//
// Mêmes règles que les passes précédentes : traduction EN DUR, table explicite,
// fragments uniques, une paire sans correspondance est signalée et rien n'est
// deviné. Les invites du modèle et les clés d'état ne sont pas touchées.
//
// Le sigle : subsistence-years (SY) devient années-subsistance (AS). La phrase
// qui l'introduit le définit, comme l'originale définissait le sien.

import fs from "node:fs";
import path from "node:path";

const P = "src/Game/GameUI/economyPanel.jsx";
const S = "src/Game/GameUI/stats.jsx";

const EDITS = [
  // ── Le moteur, ligne à ligne ─────────────────────────────────────────────
  [P, "<div style={title}>⚙️ Engine — computed, not narrated</div>", "<div style={title}>⚙️ Le moteur — calculé, non raconté</div>"],
  [P, "All figures in subsistence-years (SY): one SY is what one person needs to live for a year. Read each line as the identity it is.",
      "Tous les chiffres en années-subsistance (AS) : une AS est ce qu'il faut à une personne pour vivre un an. Chaque ligne est une identité — lisez-la comme telle."],

  [P, '<Identity label="Output =">', '<Identity label="Production =">'],
  [P, "<span style={strong}>{fmt(output)} SY/yr</span> = {fmt(i.population)} people × <span style={strong}>{i.outputPerCapita} SY/head</span>",
      "<span style={strong}>{fmt(output)} AS/an</span> = {fmt(i.population)} personnes × <span style={strong}>{i.outputPerCapita} AS/tête</span>"],
  [P, "<span style={term}> (land, capital and know-how per head; trend growth {pct(i.trendGrowth)})</span>",
      "<span style={term}> (terre, capital et savoir-faire par tête ; croissance tendancielle {pct(i.trendGrowth)})</span>"],

  [P, '<Identity label="Assessed base =">', '<Identity label="Base imposable =">'],
  [P, "output × reach {Math.round(e.administrativeReach)}% × (in kind {Math.round(inKind * 100)}%) = <span style={strong}>{fmt(base)} SY</span>",
      "production × portée {Math.round(e.administrativeReach)}% × (en nature {Math.round(inKind * 100)}%) = <span style={strong}>{fmt(base)} AS</span>"],
  [P, "<span style={term}> — {pct(i.reachedShareOfOutput)} of output is within the state's hand at all</span>",
      "<span style={term}> — {pct(i.reachedShareOfOutput)} de la production est seulement à portée de l'État</span>"],

  [P, '<Identity label="Revenue =">', '<Identity label="Recettes =">'],
  [P, "base × rate {pct(e.taxRate)} = {fmt(i.taxRevenue)}", "base × taux {pct(e.taxRate)} = {fmt(i.taxRevenue)}"],
  [P, "<> + patrimony {fmt(e.endowment)} × {pct(e.endowmentYield)} = {fmt(i.endowmentIncome)}</>",
      "<> + patrimoine {fmt(e.endowment)} × {pct(e.endowmentYield)} = {fmt(i.endowmentIncome)}</>"],
  [P, "<> + transfers/donations {fmt(i.transfers)}</>", "<> + transferts et dons {fmt(i.transfers)}</>"],
  [P, '{" "}= <span style={strong}>{fmt(revenue)} SY/yr</span>', '{" "}= <span style={strong}>{fmt(revenue)} AS/an</span>'],
  [P, '<span style={term}> ({pct(i.taxTakeOfOutput)} of output{i.nonTaxShare > 0 ? `, ${pct(i.nonTaxShare)} of it not from taxing anyone` : ""}; this society bears up to {pct(effort)} of the base{e.atWar ? " at war" : ""})</span>',
      '<span style={term}> ({pct(i.taxTakeOfOutput)} de la production{i.nonTaxShare > 0 ? `, dont ${pct(i.nonTaxShare)} ne vient de l\'impôt de personne` : ""} ; cette société supporte jusqu\'à {pct(effort)} de la base{e.atWar ? " en guerre" : ""})</span>'],

  [P, '<Identity label="Patrimony =">', '<Identity label="Patrimoine =">'],
  [P, '<span style={term}> − unfunded promises {fmt(e.unfundedLiabilities)} SY{e.usdPerSY > 0 ? ` (≈ $${fmt(e.unfundedLiabilities * e.usdPerSY)})` : ""} = net <span style={i.netPatrimony < 0 ? bad : good}>{fmt(i.netPatrimony)}</span></span>',
      '<span style={term}> − promesses non financées {fmt(e.unfundedLiabilities)} AS{e.usdPerSY > 0 ? ` (≈ $${fmt(e.unfundedLiabilities * e.usdPerSY)})` : ""} = net <span style={i.netPatrimony < 0 ? bad : good}>{fmt(i.netPatrimony)}</span></span>'],
  [P, '<span style={warn}> · deficits are paid out of the patrimony{i.yearsOfPatrimonyLeft != null ? ` — gone in ~${i.yearsOfPatrimonyLeft} years at this deficit` : ""}</span>',
      '<span style={warn}> · les déficits sont payés sur le patrimoine{i.yearsOfPatrimonyLeft != null ? ` — épuisé dans ~${i.yearsOfPatrimonyLeft} ans à ce déficit` : ""}</span>'],
  [P, "<span style={strong}>{fmt(e.endowment)} SY</span>{e.usdPerSY > 0 ?", "<span style={strong}>{fmt(e.endowment)} AS</span>{e.usdPerSY > 0 ?"],

  [P, '<Identity label="Spending =">', '<Identity label="Dépenses =">'],
  [P, "army {fmt(e.militaryUpkeep)} + civil {fmt(e.civilSpending)} + administration + interest {pct(i.interestRate)} × debt {fmt(e.debt)} = <span style={strong}>{fmt(spending)} SY/yr</span>",
      "armée {fmt(e.militaryUpkeep)} + civil {fmt(e.civilSpending)} + administration + intérêts {pct(i.interestRate)} × dette {fmt(e.debt)} = <span style={strong}>{fmt(spending)} AS/an</span>"],
  [P, '<span style={upkeep.shortfall > 0 ? warn : term}> · forces in being require {fmt(upkeep.required)} SY/yr, funded at {pct(upkeep.fundedShare)}{upkeep.shortfall > 0 ? ` — the unfunded share loses ${pct(attritionOver(upkeep.shortfall, 1))} of its strength a year` : ""}</span>',
      '<span style={upkeep.shortfall > 0 ? warn : term}> · les forces en place exigent {fmt(upkeep.required)} AS/an, financées à {pct(upkeep.fundedShare)}{upkeep.shortfall > 0 ? ` — la part non financée perd ${pct(attritionOver(upkeep.shortfall, 1))} de sa force par an` : ""}</span>'],

  [P, '<Identity label="Balance =">', '<Identity label="Solde =">'],
  [P, '<span style={i.balance < 0 ? bad : good}>{i.balance < 0 ? "−" : "+"}{fmt(Math.abs(i.balance))} SY/yr</span>',
      '<span style={i.balance < 0 ? bad : good}>{i.balance < 0 ? "−" : "+"}{fmt(Math.abs(i.balance))} AS/an</span>'],
  [P, "<span style={bad}> · in arrears: {pct(i.arrearsShare)} of a year's revenue unpaid ({fmt(i.arrears)} SY) — legitimacy bleeding</span>",
      "<span style={bad}> · en arriérés : {pct(i.arrearsShare)} d'une année de recettes impayée ({fmt(i.arrears)} AS) — la légitimité saigne</span>"],
  [P, '<span style={term}> · debt {i.debtOfOutput}× output, ceiling {fmt(i.debtCeiling)}; r − g = {pct(i.rMinusG)} {i.rMinusG < 0 ? "(growth outruns interest: a stable debt share sustains itself)" : "(interest outruns growth: debt compounds unless the primary balance covers it)"}</span>',
      '<span style={term}> · dette {i.debtOfOutput}× la production, plafond {fmt(i.debtCeiling)} ; r − g = {pct(i.rMinusG)} {i.rMinusG < 0 ? "(la croissance dépasse les intérêts : une part de dette stable se soutient d\'elle-même)" : "(les intérêts dépassent la croissance : la dette s\'accumule tant que le solde primaire ne la couvre pas)"}</span>'],
  [P, ">Binding constraint: {verdict.constraints[0].factor}.</span>", ">Contrainte déterminante : {verdict.constraints[0].factor}.</span>"],

  // ── Prix, monnaie, commerce ──────────────────────────────────────────────
  [P, '<Identity label="Prices:">', '<Identity label="Prix :">'],
  [P, "M × V = P × Y → money {fmt(i.effectiveMoney)} × velocity {velocityOf(e).toFixed(2)} ÷ output ⇒ implied <span style={strong}>{i.impliedPriceLevel}</span>, walking from {i.priceLevel}",
      "M × V = P × Y → monnaie {fmt(i.effectiveMoney)} × vitesse {velocityOf(e).toFixed(2)} ÷ production ⇒ implicite <span style={strong}>{i.impliedPriceLevel}</span>, en marche depuis {i.priceLevel}"],
  [P, '<span style={term}> · expected inflation {pct(i.expectedInflation)}{i.policyRate != null ? `, policy rate ${pct(i.policyRate)}` : ""}</span>',
      '<span style={term}> · inflation attendue {pct(i.expectedInflation)}{i.policyRate != null ? `, taux directeur ${pct(i.policyRate)}` : ""}</span>'],

  [P, '<Identity label="Money:">', '<Identity label="Monnaie :">'],
  [P, '{sys.backing === "none" ? "unbacked" : sys.backing === "commodity" ? "commodity-backed" : "backed by claims on future revenue"}, issued by {sys.issuer}, rule {sys.rule}, {sys.convertibility > 0 ? `convertible ${Math.round(sys.convertibility * 100)}%` : "not convertible"}',
      '{sys.backing === "none" ? "sans contrepartie" : sys.backing === "commodity" ? "gagée sur une matière" : "gagée sur des créances à venir"}, émise par {sys.issuer}, règle {sys.rule}, {sys.convertibility > 0 ? `convertible à ${Math.round(sys.convertibility * 100)}%` : "non convertible"}'],
  [P, '<span style={term}> · reserve cover {pct(i.backingRatio)} ({fmt(e.reserves)} SY{e.usdPerSY > 0 ? ` ≈ $${fmt(e.reserves * e.usdPerSY)}` : ""} held)</span>',
      '<span style={term}> · couverture des réserves {pct(i.backingRatio)} ({fmt(e.reserves)} AS{e.usdPerSY > 0 ? ` ≈ $${fmt(e.reserves * e.usdPerSY)}` : ""} détenus)</span>'],
  [P, "<span style={term}> · claims {fmt(e.claimsOutstanding)} SY at {Math.round(i.claimsPrice * 100)}% of face against {fmt(pledgeableValue(e))} pledgeable</span>",
      "<span style={term}> · créances {fmt(e.claimsOutstanding)} AS à {Math.round(i.claimsPrice * 100)}% du nominal contre {fmt(pledgeableValue(e))} mobilisables</span>"],
  [P, ">Monetary verdict: {money.binding.factor}.</span>", ">Verdict monétaire : {money.binding.factor}.</span>"],
  [P, '<Identity label="Trade:">', '<Identity label="Commerce :">'],

  [P, '<Identity label="Last period:">', '<Identity label="Période précédente :">'],
  [P, "inflation {pct(flows.inflation)}", "inflation {pct(flows.inflation)}"],
  [P, "{flows.borrowed > 0 && `, borrowed ${fmt(flows.borrowed)}`}", "{flows.borrowed > 0 && `, emprunté ${fmt(flows.borrowed)}`}"],
  [P, "{flows.minted > 0 && `, created ${fmt(flows.minted)} of new money`}", "{flows.minted > 0 && `, créé ${fmt(flows.minted)} de monnaie nouvelle`}"],
  [P, "{flows.claimsIssued > 0 && `, issued ${fmt(flows.claimsIssued)} of claims`}", "{flows.claimsIssued > 0 && `, émis ${fmt(flows.claimsIssued)} de créances`}"],
  [P, "{flows.tradeLoss > 0 && `, lost ${pct(flows.tradeLoss)} of output to cut trade`}", "{flows.tradeLoss > 0 && `, perdu ${pct(flows.tradeLoss)} de production par rupture du commerce`}"],
  [P, '{Math.abs(flows.depreciation) > 0.02 && `, currency ${flows.depreciation > 0 ? "weakened" : "strengthened"} ${pct(Math.abs(flows.depreciation))}`}',
      '{Math.abs(flows.depreciation) > 0.02 && `, monnaie ${flows.depreciation > 0 ? "affaiblie de" : "renforcée de"} ${pct(Math.abs(flows.depreciation))}`}'],

  // ── Capacités ────────────────────────────────────────────────────────────
  [P, ">Capacities — what reforms move</div>", ">Capacités — ce que les réformes déplacent</div>"],
  [P, '<Capacity label="Technology" value={e.technology} />', '<Capacity label="Technologie" value={e.technology} />'],
  [P, '<Capacity label="Administrative reach" value={e.administrativeReach} />', '<Capacity label="Portée administrative" value={e.administrativeReach} />'],
  [P, '<Capacity label="Monetization" value={e.monetization} />', '<Capacity label="Monétisation" value={e.monetization} />'],
  [P, '<Capacity label="Market integration" value={e.marketIntegration} />', '<Capacity label="Intégration du marché" value={e.marketIntegration} />'],
  [P, '<Capacity label="Financial depth" value={e.financialDepth} />', '<Capacity label="Profondeur financière" value={e.financialDepth} />'],
  [P, '<Capacity label="Fiscal credibility" value={e.fiscalCredibility} />', '<Capacity label="Crédibilité fiscale" value={e.fiscalCredibility} />'],
  [P, '<Capacity label="Legitimacy" value={e.legitimacy} />', '<Capacity label="Légitimité" value={e.legitimacy} />'],
  [P, '<Capacity label="Openness" value={e.openness} />', '<Capacity label="Ouverture" value={e.openness} />'],
  [P, "<span style={term}>Innovations: </span>", "<span style={term}>Innovations : </span>"],
  [P, "{code}: the simulation narrates these figures and moves only the capacities and policy; output, prices and debt follow from them.",
      "{code} : la simulation raconte ces chiffres et ne déplace que les capacités et la politique ; production, prix et dette en découlent."],

  // ── Le registre des fidèles ──────────────────────────────────────────────
  [P, '<div style={title}>✝️ Faithful — living ledger</div>', '<div style={title}>✝️ Les fidèles — registre vivant</div>'],
  [P, 'const CONTINENT_LABEL = { africa: "Africa", americas: "Americas", asia: "Asia", europe: "Europe", oceania: "Oceania" };',
      'const CONTINENT_LABEL = { africa: "Afrique", americas: "Amériques", asia: "Asie", europe: "Europe", oceania: "Océanie" };'],
  [P, '<span style={term}> Catholics{c.asOf ? ` as of ${c.asOf}` : ""} — recomputed every turn by the engine (real demography × the Holy See\'s legitimacy)</span>',
      '<span style={term}> catholiques{c.asOf ? ` au ${c.asOf}` : ""} — recalculés à chaque tour par le moteur (démographie réelle × légitimité du Saint-Siège)</span>'],
  [P, "<span style={term}>Recorded movements: </span>", "<span style={term}>Mouvements enregistrés : </span>"],

  // ── Le programme et ses projets ──────────────────────────────────────────
  [P, 'proposed: "proposed", subscribing: "selling", building: "building", operating: "operating",\n  failed: "sale failed", cancelled: "cancelled",',
      'proposed: "proposé", subscribing: "en souscription", building: "en construction", operating: "en service",\n  failed: "souscription échouée", cancelled: "annulé",'],
  [P, "{p.sector} · {fmt(p.cost)} SY · promised {pct(p.expectedYield)}/yr, {p.buildYears} yr build",
      "{p.sector} · {fmt(p.cost)} AS · promis {pct(p.expectedYield)}/an, {p.buildYears} an(s) de construction"],
  [P, "<> · realised <span style={good}>{pct(p.realizedYield)}/yr</span></>", "<> · réalisé <span style={good}>{pct(p.realizedYield)}/an</span></>"],
  [P, '<> · <span style={warn}>{p.delayYears.toFixed(1)} yr late</span></>', '<> · <span style={warn}>{p.delayYears.toFixed(1)} an(s) de retard</span></>'],
  [P, '<Identity label="Token price =">', '<Identity label="Prix du jeton =">'],
  [P, "basket <span style={strong}>{fmt(value)} SY</span> (marked on cash actually earned) ÷ <span style={strong}>{fmt(prog.tokensOutstanding)} tokens</span> = <span style={strong}>{price.toFixed(3)}</span>",
      "panier <span style={strong}>{fmt(value)} AS</span> (valorisé sur l'encaisse réellement gagnée) ÷ <span style={strong}>{fmt(prog.tokensOutstanding)} jetons</span> = <span style={strong}>{price.toFixed(3)}</span>"],
  [P, '<Identity label="Record:">', '<Identity label="Bilan :">'],
  [P, "{Math.round(prog.score)}/100 · largest delivered {fmt(prog.largestCompleted)} SY · next project ceiling <span style={strong}>{fmt(cap)} SY</span>",
      "{Math.round(prog.score)}/100 · plus grand livré {fmt(prog.largestCompleted)} AS · plafond du prochain projet <span style={strong}>{fmt(cap)} AS</span>"],
  [P, '<Identity label="Governance:">', '<Identity label="Gouvernance :">'],
  [P, 'audit {prog.governance.independentAudit ? <span style={good}>independent</span> : <span style={bad}>political</span>},{" "}',
      'audit {prog.governance.independentAudit ? <span style={good}>indépendant</span> : <span style={bad}>politique</span>},{" "}'],
  [P, 'ledger {prog.governance.publicLedger ? <span style={good}>public</span> : <span style={bad}>private</span>},{" "}',
      'registre {prog.governance.publicLedger ? <span style={good}>public</span> : <span style={bad}>privé</span>},{" "}'],
  [P, 'disbursement {prog.governance.milestoneDisbursement ? <span style={good}>by milestone</span> : <span style={bad}>discretionary</span>}',
      'décaissement {prog.governance.milestoneDisbursement ? <span style={good}>par jalon</span> : <span style={bad}>discrétionnaire</span>}'],
  [P, '<Identity label="Currency B:">', '<Identity label="Monnaie B :">'],
  [P, '{prog.currencyBLabel || "indexed to the cost of living"} · A/B channel {prog.conversion.managed ? `managed at ${prog.conversion.officialRate}` : "free"}',
      '{prog.currencyBLabel || "indexée sur le coût de la vie"} · canal A/B {prog.conversion.managed ? `tenu à ${prog.conversion.officialRate}` : "libre"}'],
  [P, "<> · <span style={bad}>black-market premium {pct(prog.conversion.blackMarketPremium)}</span></>",
      "<> · <span style={bad}>prime au marché noir {pct(prog.conversion.blackMarketPremium)}</span></>"],
  [P, '<Identity label="Gold buyback:">', '<Identity label="Rachat d\'or :">'],
  [P, "above {pct(prog.goldBuyback.thresholdShareOfOutput)} of output · {fmt(prog.goldBuyback.boughtTotal)} SY bought",
      "au-delà de {pct(prog.goldBuyback.thresholdShareOfOutput)} de la production · {fmt(prog.goldBuyback.boughtTotal)} AS rachetés"],
  [P, "<> · <span style={warn}>{fmt(prog.goldBuyback.unfunded)} SY unfunded</span></>", "<> · <span style={warn}>{fmt(prog.goldBuyback.unfunded)} AS non financés</span></>"],
  [P, '<Identity label="Social coupling:">', '<Identity label="Charge sociale :">'],
  [P, "needs {fmt(burden)} SY/yr · realised productive cash {fmt(cover)} SY/yr {cover >= burden ? <span style={good}>covered</span> : <span style={bad}>NOT covered</span>}",
      "exige {fmt(burden)} AS/an · encaisse productive réalisée {fmt(cover)} AS/an {cover >= burden ? <span style={good}>couverte</span> : <span style={bad}>NON couverte</span>}"],
  [P, ">Projects</div>", ">Projets</div>"],
  [P, ">None proposed yet.</div>", ">Aucun projet proposé pour l'instant.</div>"],
  [P, "{code}: a token is a claim on this basket's cash, never on ownership or control of what it built.",
      "{code} : un jeton est une créance sur l'encaisse de ce panier, jamais sur la propriété ni le contrôle de ce qu'il a bâti."],

  // ── La feuille de statistiques ───────────────────────────────────────────
  [S, "                Your country", "                Votre pays"],
  [S, "Compiling the stat sheet…", "Compilation de la feuille de comptes…"],
  [S, "Click any country on the map to inspect it.", "Cliquez sur un pays de la carte pour l'examiner."],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres] of EDITS) {
  const chemin = path.resolve(fichier);
  if (!fs.existsSync(chemin)) { console.error(`MANQUE  ${fichier}`); echecs++; continue; }
  const source = fs.readFileSync(chemin, "utf8");
  const occurrences = source.split(avant).length - 1;
  if (occurrences === 0) { console.error(`ABSENT  ${fichier} :: ${avant.slice(0, 70)}`); echecs++; continue; }
  if (occurrences > 1) { console.error(`AMBIGU  ${fichier} (${occurrences}×) :: ${avant.slice(0, 70)}`); echecs++; continue; }
  fs.writeFileSync(chemin, source.replace(avant, apres));
  touches.add(fichier);
}

console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements appliqués dans ${touches.size} fichier(s).`);
if (echecs) { console.error(`${echecs} paire(s) sans correspondance — rien n'est deviné, corrigez la table.`); process.exit(1); }
