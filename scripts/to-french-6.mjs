// Sixième passe : ce que la capture de l'onglet COMPTES montrait encore en
// anglais après la cinquième — la barre de session, les onglets du panneau
// latéral, et les verdicts que le moteur rédige pour le joueur.
//
// Une réserve, à connaître avant de relire ceci : les `detail` de
// runtime/economy.js ne sont pas seulement affichés. Ils sont aussi recopiés
// dans les invites du modèle (economyBridge.js, realityCheck.js). Les traduire
// francise donc une partie de ce que le modèle lit. Le choix ici est de les
// traduire quand même — ce sont des phrases écrites pour le joueur, elles
// s'affichent telles quelles dans les comptes, et le modèle lit le français
// aussi bien que l'anglais. Si cela devait gêner le moteur, c'est ce fichier
// qu'il faut défaire, pas les autres.
//
// Le `factor` d'une contrainte n'est pas traduit : il sert de clé React et
// circule dans les invites. Une table d'affichage le rend lisible à l'écran
// sans toucher à la clé.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── La barre de session et les onglets du panneau ────────────────────────
  ["src/Game/GameUI/libraryBar.jsx", "            ⌂ Exit Game", "            ⌂ Quitter la partie"],
  ["src/Game/GameUI/advisor.jsx", '<TabButton icon="🧭" label="Advisor" active={activeTab === "advisor"}', '<TabButton icon="🧭" label="Conseiller" active={activeTab === "advisor"}'],
  ["src/Game/GameUI/advisor.jsx", '<TabButton icon="📊" label="Stats" active={activeTab === "stats"}', '<TabButton icon="📊" label="Comptes" active={activeTab === "stats"}'],

  // ── Les verdicts du moteur, écrits pour le joueur ────────────────────────
  ["src/runtime/economy.js",
    "detail: `Only ${Math.round(reach * 100)}% of the country is close enough to the state to be assessed at all; the rest pays nothing whatever the rate says.`,",
    "detail: `Seuls ${Math.round(reach * 100)} % du pays sont assez proches de l'État pour être imposés ; le reste ne paie rien, quel que soit le taux.`,"],
  ["src/runtime/economy.js",
    "detail: `Most of what the state reaches is consumed where it is grown, not sold; only a share can be taken as anything but grain and labour.`,",
    "detail: `L'essentiel de ce que l'État atteint est consommé là où il pousse, non vendu ; une part seulement peut être prise autrement qu'en grain et en travail.`,"],
  ["src/runtime/economy.js",
    '? `The rate could rise to about ${Math.round(effort * 100)}% of the assessed base${e.atWar ? " under wartime mobilisation" : ""} before collection turns coercive and legitimacy bleeds.`\n      : `The rate already stands at what this society will bear${e.atWar ? ", even at war" : ""}; pushing it costs legitimacy directly.`,',
    '? `Le taux pourrait monter à environ ${Math.round(effort * 100)} % de la base imposable${e.atWar ? " sous mobilisation de guerre" : ""} avant que la collecte ne devienne coercitive et que la légitimité ne saigne.`\n      : `Le taux est déjà à ce que cette société supporte${e.atWar ? ", même en guerre" : ""} ; le pousser coûte directement de la légitimité.`,'],
  ["src/runtime/economy.js",
    '? `No lender will advance more: the debt already stands at what this base can service.`\n      : `Lenders would advance about ${Math.round(room)} SY at ${(interestRate(e) * 100).toFixed(1)}% — once. `\n        + (g > rReal ? `The economy outgrows its interest (r < g), so a stable debt share is sustainable.`\n          : `Interest outruns growth (r > g): every SY borrowed compounds unless the primary balance covers it.`),',
    '? `Aucun prêteur n\'avancera davantage : la dette est déjà à ce que cette base peut servir.`\n      : `Les prêteurs avanceraient environ ${Math.round(room)} AS à ${(interestRate(e) * 100).toFixed(1)} % — une seule fois. `\n        + (g > rReal ? `L\'économie croît plus vite que ses intérêts (r < g) : une part de dette stable est soutenable.`\n          : `Les intérêts dépassent la croissance (r > g) : chaque AS empruntée s\'accumule tant que le solde primaire ne la couvre pas.`),'],
  ["src/runtime/economy.js",
    "? `Future revenue is already pledged to the hilt: any further claim would trade below par from the day it is issued.`\n      : `About ${Math.round(pledge)} SY of the next ${e.monetarySystem.claimsHorizon} years' collectable revenue could still be pledged at par; `\n        + `with financial depth at ${Math.round(e.financialDepth)}, such paper circulates at ${Math.round(claimMoneyness(e) * 100)}% of face.`,",
    "? `Les recettes à venir sont déjà gagées jusqu'à la garde : toute créance de plus s'échangerait sous le pair dès son émission.`\n      : `Environ ${Math.round(pledge)} AS des recettes encaissables des ${e.monetarySystem.claimsHorizon} prochaines années pourraient encore être gagées au pair ; `\n        + `avec une profondeur financière de ${Math.round(e.financialDepth)}, un tel papier circule à ${Math.round(claimMoneyness(e) * 100)} % du nominal.`,"],
  ["src/runtime/economy.js",
    'detail: `The issuer could simply create the shortfall; at ${Math.round(100 * gap / output)}% of output a year that is `\n      + `${gap / output > 0.1 ? "the road to hyperinflation" : gap / output > 0.03 ? "several points of inflation" : "tolerable for a while"}`\n      + (e.monetarySystem.rule === "fixed" || e.monetarySystem.rule === "peg" ? `, and it breaks the ${e.monetarySystem.rule === "peg" ? "peg" : "issuance rule"}.` : "."),',
    'detail: `L\'émetteur pourrait simplement créer le manque ; à ${Math.round(100 * gap / output)} % de la production par an, c\'est `\n      + `${gap / output > 0.1 ? "la route de l\'hyperinflation" : gap / output > 0.03 ? "plusieurs points d\'inflation" : "tolérable un temps"}`\n      + (e.monetarySystem.rule === "fixed" || e.monetarySystem.rule === "peg" ? `, et cela rompt ${e.monetarySystem.rule === "peg" ? "l\'ancrage" : "la règle d\'émission"}.` : "."),'],

  // ── Le facteur d'une contrainte : lisible à l'écran, clé inchangée ───────
  ["src/Game/GameUI/economyPanel.jsx",
    "const CONTINENT_LABEL = {",
    "// Le `factor` d'une contrainte est une clé (React, et les invites du moteur) :\n// on le rend lisible à l'affichage sans jamais la changer.\nexport const FACTEUR_LABEL = {\n  reach: \"la portée de l'État\", monetization: \"la monétisation\", taxRate: \"le taux d'imposition\",\n  credit: \"le crédit\", futureClaims: \"les créances à venir\", issuance: \"l'émission\",\n};\n\nconst CONTINENT_LABEL = {"],
  ["src/Game/GameUI/economyPanel.jsx",
    "<span style={{ fontWeight: 700 }}>Contrainte déterminante : {verdict.constraints[0].factor}.</span>",
    "<span style={{ fontWeight: 700 }}>Contrainte déterminante : {FACTEUR_LABEL[verdict.constraints[0].factor] || verdict.constraints[0].factor}.</span>"],
  ["src/Game/GameUI/economyPanel.jsx",
    "<span style={{ fontWeight: 700 }}>Verdict monétaire : {money.binding.factor}.</span>",
    "<span style={{ fontWeight: 700 }}>Verdict monétaire : {FACTEUR_LABEL[money.binding.factor] || money.binding.factor}.</span>"],
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
