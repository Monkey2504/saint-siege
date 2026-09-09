// Kick the tyres on the economy engine without launching the game:
//   node tools/economy-demo.mjs
import {
  annualSpending, claimsPrice, economyIndicators, evaluateMonetarySystem, explainShortfall,
  maxTaxEffort, normalizeEconomy, pledgeableValue, realOutput, stepEconomy, taxableBase,
} from "../src/runtime/economy.js";

const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pct = (n) => `${(n * 100).toFixed(1)}%`;
const head = (t) => console.log(`\n=== ${t} ===`);

const show = (label, economy) => {
  const i = economyIndicators(economy);
  const s = i.monetarySystem;
  head(label);
  console.log(`  money: ${s.backing}-backed, issued by ${s.issuer}, rule ${s.rule}, convertibility ${s.convertibility}`);
  console.log(`  population ${fmt(i.population)}   output/head ${i.outputPerCapita} SY   output ${fmt(i.output)} SY/yr   trend growth ${pct(i.trendGrowth)}`);
  console.log(`  state reaches ${pct(i.reachedShareOfOutput)} of output; take ${pct(i.taxTakeOfOutput)} = ${fmt(i.revenue)}; spending ${fmt(i.spending)}; balance ${fmt(i.balance)}`);
  console.log(`  debt ${fmt(i.debt)} (${i.debtOfOutput}x output, ceiling ${fmt(i.debtCeiling)}) at ${pct(i.interestRate)}; r-g ${pct(i.rMinusG)}${i.policyRate != null ? `; policy rate ${pct(i.policyRate)}` : ""}`);
  console.log(`  prices ${i.priceLevel}, velocity ${i.velocity}, expected inflation ${pct(i.expectedInflation)}, legitimacy ${i.legitimacy}, credibility ${i.fiscalCredibility}`);
};
const years = (label, state, n, options, line) => {
  head(label);
  for (let y = 1; y <= n; y += 1) {
    const { economy, flows } = stepEconomy(state, { days: 365, ...options });
    console.log(`  yr ${String(y).padStart(2)}: ${line(flows, economy)}${flows.events.length ? `   [${flows.events.join(", ")}]` : ""}`);
    state = economy;
  }
  return state;
};

// --- The low end of the range: a coin economy at its high-water mark -------------
const rome = normalizeEconomy({
  population: 60_000_000, effectiveLand: 45_000_000, capital: 70_000_000,
  technology: 14, administrativeReach: 48, monetization: 35, marketIntegration: 45,
  financialDepth: 8, fiscalCredibility: 55, openness: 8,
  taxRate: 0.16, militaryUpkeep: 1_400_000, civilSpending: 1_900_000,
  monetarySystem: { label: "silver denarius", backing: "commodity", issuer: "mint", rule: "discretionary", convertibility: 1 },
  reserves: 12_000_000,
});
show("Rome, 117 — the low end of the range", rome);

// --- A modern state on bank money with an inflation-targeting central bank ------
const modernTemplate = {
  population: 66_000_000, effectiveLand: 18_000_000, capital: 7_000_000_000,
  technology: 85, administrativeReach: 97, monetization: 98, marketIntegration: 95,
  financialDepth: 90, fiscalCredibility: 85, openness: 30, investmentShare: 0.22,
  taxRate: 0.45, militaryUpkeep: 60_000_000, civilSpending: 850_000_000,
  monetarySystem: { label: "euro", backing: "none", issuer: "banks", rule: "taylor", convertibility: 0 },
};
const france = normalizeEconomy(modernTemplate);
show("France, 2016 — fiat, banks, Taylor rule", france);

// --- Total war: how much of output can a democracy take, and for how long? -------
const britain = normalizeEconomy({
  ...modernTemplate, population: 48_000_000, capital: 2_400_000_000, technology: 70, financialDepth: 75, openness: 35,
  atWar: true, civilSpending: 150_000_000,
  monetarySystem: { label: "sterling (off gold)", backing: "none", issuer: "banks", rule: "discretionary" },
});
const warEffort = maxTaxEffort(britain);
const mobilised = normalizeEconomy({ ...britain, baseMoney: 0, creditMoney: 0, taxRate: warEffort, militaryUpkeep: realOutput(britain) * 0.45 });
head("Britain, 1940 — mobilising 45% of output");
console.log(`  wartime effort ceiling: ${pct(warEffort)} of the assessed base = ${pct(taxableBase(mobilised) * warEffort / realOutput(mobilised))} of output`);
const v = explainShortfall(mobilised, annualSpending(mobilised));
console.log(`  gap ${fmt(v.gap)} SY/yr; tightest constraints:`);
for (const c of v.constraints.slice(0, 3)) console.log(`   - ${c.factor.padEnd(18)} headroom ${fmt(c.headroom).padStart(14)}  ${c.detail}`);
years("  ...six years, borrowing first, printing the rest", mobilised, 6, { financing: "borrow" },
  (f, e) => `borrowed ${fmt(f.borrowed).padStart(12)}  printed ${fmt(f.minted).padStart(11)}  debt ${e.debt > 0 ? (e.debt / f.output).toFixed(2) : "0"}x output  inflation ${pct(f.inflation)}  legitimacy ${Math.round(e.legitimacy)}`);

// --- Weimar: a deficit the size of the economy, financed at the printing press ---
const weimarBase = normalizeEconomy({ ...modernTemplate, population: 62_000_000, capital: 1_800_000_000, technology: 65, financialDepth: 60,
  fiscalCredibility: 30, openness: 20, taxRate: 0.20, civilSpending: 0 });
const weimar = normalizeEconomy({
  ...weimarBase, baseMoney: 0, creditMoney: 0, civilSpending: realOutput(weimarBase) * 0.30,
  monetarySystem: { label: "papiermark", backing: "none", issuer: "banks", rule: "discretionary" },
});
years("Germany, 1921 — printing a deficit of ~30% of output (Cagan)", weimar, 6, { financing: "print" },
  (f, e) => `printed ${pct(f.minted / f.output).padStart(6)} of output  inflation ${pct(f.inflation).padStart(9)}  velocity ${economyIndicators(e).velocity.toString().padStart(6)}  prices ${fmt(f.priceLevel)}`);

// --- Sanctions: an open economy cut off from its markets ------------------------
const russia = normalizeEconomy({
  ...modernTemplate, population: 145_000_000, capital: 6_000_000_000, technology: 78, financialDepth: 55,
  fiscalCredibility: 55, openness: 25, taxRate: 0.36, civilSpending: 600_000_000, militaryUpkeep: 120_000_000,
  monetarySystem: { label: "rouble", backing: "none", issuer: "banks", rule: "taylor" },
});
years("Russia, 2022 — 60% of trade access cut", russia, 3, { sanctions: 0.6 },
  (f, e) => `output hit ${pct(f.tradeLoss)}  currency ${fmt(f.exchangeRate)} (weaker)  inflation ${pct(f.inflation)}  policy rate ${pct(f.policyRate ?? 0)}`);

// --- An invented money: claims on the next ten years of tax revenue ---------------
head("An invented system — money made of securitised future revenue");
const sys = { label: "revenue notes", backing: "futureClaims", issuer: "treasury", rule: "growthLinked", claimsHorizon: 10 };
const notes = normalizeEconomy({ ...modernTemplate, monetarySystem: { ...sys, claimsIssuanceShare: 0.05 } });
const pv = pledgeableValue(notes);
console.log(`  pledgeable value of the next 10 years' collectable revenue: ${fmt(pv)} SY = ${(pv / taxableBase(notes)).toFixed(1)} years of today's base`);
console.log(`  (it is the TAXABLE base that can be pledged — ${pct(taxableBase(notes) / realOutput(notes))} of output — not the output itself)`);
for (const share of [0.05, 0.5, 2]) {
  let s = normalizeEconomy({ ...modernTemplate, monetarySystem: { ...sys, claimsIssuanceShare: share } });
  let line = "";
  for (let y = 1; y <= 6; y += 1) { s = stepEconomy(s, { days: 365 }).economy; line += ` ${Math.round(claimsPrice(s) * 100)}%`; }
  const verdict = evaluateMonetarySystem(s);
  console.log(`  issuing ${pct(share)} of the base a year -> claims price by year:${line}   credibility ${Math.round(s.fiscalCredibility)}`);
  console.log(`     binding: ${verdict.binding.factor} — ${verdict.binding.detail}`);
}
const thin = normalizeEconomy({ ...rome, baseMoney: 0, creditMoney: 0, monetarySystem: { ...sys, claimsIssuanceShare: 0.05 } });
const tv = evaluateMonetarySystem(thin);
console.log(`  the same notes in Rome: binding ${tv.binding.factor} — ${tv.binding.detail}`);
