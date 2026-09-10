/**
 * Capture le rendu réel du jeu, écran par écran, dans design/rendu/.
 * C'est le canal Code → Design : ce dossier est committé, donc lisible
 * par une session Claude Design qui n'a pas de navigateur.
 *
 * Usage :
 *   node scripts/rendu.mjs                         # vise http://localhost:4173
 *   node scripts/rendu.mjs --url https://…         # vise un déploiement
 *   node scripts/rendu.mjs --largeur 390           # gabarit mobile
 */
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

let chromium;
try { ({ chromium } = await import('playwright')); }
catch { console.error("playwright manquant. Installer avec : npm i -D playwright && npx playwright install chromium"); process.exit(2); }

const arg = (n, d) => { const i = process.argv.indexOf('--'+n); return i > -1 ? process.argv[i+1] : d; };
const URL_CIBLE = arg('url', 'http://localhost:4173');
const LARGEUR = Number(arg('largeur', 1440));
const HAUTEUR = Number(arg('hauteur', 900));
const GABARIT = LARGEUR <= 500 ? 'mobile' : 'bureau';
const DOSSIER = path.join('design', 'rendu', GABARIT);
fs.mkdirSync(DOSSIER, { recursive: true });

/** Étapes du parcours joueur. `attendre` : libellé à cliquer avant de capturer. */
const PARCOURS = [
  { fichier: '01-accueil',            clic: null },
  { fichier: '02-bibliotheque',       clic: /^COMMENCER$/ },
  { fichier: '03-choix-scenario',     clic: /Nouveau jeu/i },
  { fichier: '04-habemus-papam',      clic: /Scénario par défaut|Choisissez un pays/i },
];
// Sas éventuels du build web hors site (portail Open Historia).
const SAS = [/ENTER OPEN HISTORIA/i, /PLAY THE DEMO ANYWAY/i, /Passer — regarder autour/i];

const nav = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] } : {});
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: 2, locale: 'fr-BE' });
const page = await ctx.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(String(e).slice(0, 200)));
page.on('requestfailed', r => { const h = (()=>{try{return new URL(r.url()).host}catch{return r.url()}})(); if (!erreurs.includes('réseau: '+h)) erreurs.push('réseau: '+h); });

await page.goto(URL_CIBLE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);
for (const sas of SAS) {
  const l = page.getByText(sas).first();
  if (await l.count()) { await l.click({ timeout: 5000 }).catch(() => {}); await page.waitForTimeout(3000); }
}

const faits = [];
for (const etape of PARCOURS) {
  if (etape.clic) {
    const cible = page.getByRole('button', { name: etape.clic }).first();
    const ok = await cible.click({ timeout: 8000 }).then(() => true).catch(() => false);
    if (!ok) { faits.push({ ...etape, etat: 'non atteint' }); continue; }
    await page.waitForTimeout(3500);
  }
  await page.screenshot({ path: path.join(DOSSIER, etape.fichier + '.png') });
  await page.screenshot({ path: path.join(DOSSIER, etape.fichier + '-pleine-page.png'), fullPage: true });
  faits.push({ ...etape, etat: 'capturé' });
}
await nav.close();

const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'inconnu'; } })();
const index = [
  `# Rendu réel — ${GABARIT} (${LARGEUR}×${HAUTEUR})`, '',
  `Capturé le ${new Date().toISOString().slice(0,16).replace('T',' ')} · commit ${commit} · source ${URL_CIBLE}`, '',
  'Ces images sont le rendu réel du jeu dans un navigateur, pas une maquette.',
  'Une session sans navigateur (Claude Design) doit les lire avant de juger le graphisme.', '',
  ...faits.map(f => `- \`${f.fichier}.png\` — ${f.etat}`), '',
  erreurs.length ? '## Anomalies relevées pendant la capture\n\n' + erreurs.slice(0,12).map(e=>'- '+e).join('\n') : '',
].join('\n');
fs.writeFileSync(path.join(DOSSIER, 'INDEX.md'), index + '\n');
console.log(index);
