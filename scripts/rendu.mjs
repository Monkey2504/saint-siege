/**
 * Capture le rendu réel du jeu, écran par écran, dans design/rendu/.
 * C'est le canal Code → Design : ce dossier est committé, donc lisible
 * par une session Claude Design qui n'a pas de navigateur.
 *
 * Usage :
 *   node scripts/rendu.mjs                         # vise http://localhost:4173
 *   node scripts/rendu.mjs --url https://…         # vise un déploiement
 *   node scripts/rendu.mjs --largeur 390 --hauteur 844   # gabarit mobile
 *
 * Le binaire du navigateur peut être imposé par CHROMIUM_PATH quand l'image
 * hôte fournit déjà un Chromium que Playwright n'a pas installé lui-même.
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
// Ces images sont committées : au-delà, une capture pèse plus que ce qu'elle
// apprend. Le seuil décide seul du format, il n'y a pas de liste à tenir.
const POIDS_MAX = 500 * 1024;

/* ------------------------------------------------------------------ gestes */

const bouton = (page, nom) => page.getByRole('button', { name: nom }).first();

/**
 * Clique un bouton, puis laisse l'écran suivant se poser.
 * Tous les écrans du jeu restent montés dans le DOM en même temps : viser par
 * rôle et libellé exact évite d'attraper l'homonyme d'un écran masqué, et le
 * clic de Playwright attend de lui-même que la cible soit activée et dégagée.
 */
const cliquer = async (page, nom, repos = 2500) => {
  await bouton(page, nom).click({ timeout: 20000 });
  await page.waitForTimeout(repos);
  // Chaque cahier est un panneau qui défile pour son compte, et il garde la
  // position du précédent : sans cela on capture le milieu d'une page.
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.querySelectorAll("*").forEach((n) => { if (n.scrollTop) n.scrollTop = 0; });
  });
  await page.waitForTimeout(400);
};

/**
 * Le parcours du joueur tel qu'il est aujourd'hui, et non tel qu'il était.
 *
 * Trois étapes ont disparu depuis la dernière version de ce fichier, et leurs
 * sélecteurs faisaient échouer tout le reste :
 *
 * - « Enter Open Historia » appartient au site (runtime/web/homePage.js), pas
 *   au jeu. Servie par `vite preview`, l'application s'ouvre directement sur
 *   l'écran de la clé.
 * - « Reprendre votre partie » n'existe que s'il y a une partie à reprendre.
 *   Un navigateur neuf n'en a aucune : l'accueil ne montre que « Commencer ».
 * - HABEMUS PAPAM n'est plus sur ce chemin. La feuille d'investiture ne paraît
 *   que pour une partie d'Église, et la partie créée ici n'en est pas une :
 *   `/api/runtime/json/game` répond 500 sous `vite preview`, le scénario n'est
 *   jamais chargé et le monde reste sans pays. Cette capture montre donc les
 *   cahiers vides — ce qui est précisément ce que la session de design a
 *   demandé à voir — mais pas une partie en cours.
 */

/* ---------------------------------------------------------------- parcours */

/**
 * Le parcours joueur, dans l'ordre. `fichier` déclenche une capture ; une étape
 * sans `fichier` n'est qu'une manœuvre. Ajouter un écran ici est le seul moyen
 * de le rendre visible à une session qui n'a pas de navigateur.
 */
const PARCOURS = [
  { fichier: '01-portail' },
  { fichier: '02-accueil',         faire: p => cliquer(p, /Passer — regarder autour/i, 3000) },
  { fichier: '03-edition-du-tour', faire: p => cliquer(p, /^Commencer$/i, 12000) },
  { fichier: '04-ordres',          faire: p => cliquer(p, /^Ordres$/i) },
  { fichier: '05-registre',        faire: p => cliquer(p, /^Registre$/i) },
  { fichier: '06-college',         faire: p => cliquer(p, /^Collège$/i) },
  { fichier: '07-caisses',         faire: p => cliquer(p, /^Caisses$/i) },
  { fichier: '08-correspondance',  faire: p => cliquer(p, /^Correspondance$/i) },
];

/* ---------------------------------------------------------------- capture  */

/**
 * PNG par défaut : les écrans du jeu sont des aplats et du texte, que le PNG
 * rend sans artefact autour des glyphes — et c'est la typographie qu'une
 * session de design vient juger. Les rares écrans mangés par une photographie
 * dépassent le budget en PNG ; ceux-là seulement repassent en JPEG.
 */
const capturer = async (page, nom) => {
  const png = path.join(DOSSIER, nom + '.png');
  await page.screenshot({ path: png });
  let fichier = nom + '.png', octets = fs.statSync(png).size;
  if (octets > POIDS_MAX) {
    const jpg = path.join(DOSSIER, nom + '.jpg');
    await page.screenshot({ path: jpg, type: 'jpeg', quality: 85 });
    fs.unlinkSync(png);
    fichier = nom + '.jpg';
    octets = fs.statSync(jpg).size;
  }
  return { fichier, octets };
};

const ko = (o) => `${Math.round(o / 1024)} Ko`;

/* ------------------------------------------------------------------- rendu */

fs.rmSync(DOSSIER, { recursive: true, force: true });
fs.mkdirSync(DOSSIER, { recursive: true });

const nav = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] }
  : {});
// deviceScaleFactor 1 : doubler la densité quadruple le poids d'un fichier
// committé sans rien apprendre sur la composition, la hiérarchie ou la couleur.
const ctx = await nav.newContext({ viewport: { width: LARGEUR, height: HAUTEUR }, deviceScaleFactor: 1, locale: 'fr-BE' });
const page = await ctx.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push('page : ' + String(e).slice(0, 200)));
page.on('requestfailed', r => {
  const h = (() => { try { return new URL(r.url()).host; } catch { return r.url(); } })();
  if (!erreurs.includes('réseau : ' + h)) erreurs.push('réseau : ' + h);
});

await page.goto(URL_CIBLE, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(2500);

const faits = [];
for (const etape of PARCOURS) {
  if (etape.faire) {
    try { await etape.faire(page); }
    catch (e) {
      // Une manœuvre ratée fait tomber la suite du parcours ; on le dit au lieu
      // de capturer un écran qui n'est pas celui qu'on croit.
      const raison = String(e.message || e).split('\n')[0].slice(0, 120);
      if (etape.fichier) faits.push({ fichier: etape.fichier, etat: `non atteint — ${raison}` });
      else erreurs.push(`manœuvre : ${raison}`);
      continue;
    }
  }
  if (!etape.fichier) continue;
  const { fichier, octets } = await capturer(page, etape.fichier);
  faits.push({ fichier, etat: `capturé, ${ko(octets)}` });
}
/**
 * Une image ne dit pas quelle police a été substituée : un titre rendu en
 * Archivo parce que Bricolage Grotesque manquait ressemble à un choix.
 * On le mesure plutôt qu'on ne le demande — document.fonts.check répond vrai
 * pour une famille qui n'existe pas, donc il ne prouve rien. Une famille
 * absente rend exactement comme le repli témoin ; une famille dessinée non.
 */
const polices = await page.evaluate(async () => {
  const largeur = (famille) => {
    const s = document.createElement('span');
    s.textContent = 'Habemus Papam 0123456789';
    s.style.cssText = `position:absolute;left:-9999px;font-size:64px;white-space:nowrap;font-family:${famille}`;
    document.body.appendChild(s);
    const l = s.getBoundingClientRect().width;
    s.remove();
    return l;
  };
  const racine = getComputedStyle(document.documentElement);
  const repli = largeur('monospace');
  const vues = [];
  for (const token of ['--oh-font-display', '--oh-font-body', '--oh-font-label', '--oh-font-data', '--oh-font-serif']) {
    const premiere = (racine.getPropertyValue(token).split(',')[0] || '').trim().replace(/^["']|["']$/g, '');
    if (!premiere) continue;
    try { await document.fonts.load(`64px "${premiere}"`); } catch { /* famille inconnue */ }
    vues.push({ token, premiere, dessinee: Math.abs(largeur(`"${premiere}", monospace`) - repli) > 0.5 });
  }
  return vues;
});

await nav.close();

const substituees = polices.filter(p => !p.dessinee);

const total = fs.readdirSync(DOSSIER)
  .filter(f => /\.(png|jpg)$/.test(f))
  .reduce((s, f) => s + fs.statSync(path.join(DOSSIER, f)).size, 0);
const commit = (() => { try { return execSync('git rev-parse --short HEAD').toString().trim(); } catch { return 'inconnu'; } })();
const index = [
  `# Rendu réel — ${GABARIT} (${LARGEUR}×${HAUTEUR})`, '',
  `Capturé le ${new Date().toISOString().slice(0,16).replace('T',' ')} · commit ${commit} · source ${URL_CIBLE}`, '',
  'Ces images sont le rendu réel du jeu dans un navigateur, pas une maquette.',
  'Une session sans navigateur (Claude Design) doit les lire avant de juger le graphisme.', '',
  '## Écrans', '',
  ...faits.map(f => `- \`${f.fichier}\` — ${f.etat}`), '',
  `Total du lot : ${ko(total)}.`, '',
  '## Polices', '',
  ...polices.map(p => `- \`${p.token}\` → ${p.premiere} — ${p.dessinee ? 'réellement dessinée' : 'ABSENTE, le rendu montre la police de repli'}`),
  '',
  substituees.length
    ? `Sur ces images, ${substituees.map(p => p.premiere).join(' et ')} ${substituees.length > 1 ? 'ne sont pas dessinées' : "n'est pas dessinée"} : ce que\nvous voyez est la police de repli. Ne jugez pas ces dessins de lettres.`
    : "Toutes les polices annoncées par les tokens sont réellement dessinées ici.",
  '',
  erreurs.length ? '## Anomalies relevées pendant la capture\n\n' + erreurs.slice(0,12).map(e => '- ' + e).join('\n') + '\n' : '',
].join('\n');
fs.writeFileSync(path.join(DOSSIER, 'INDEX.md'), index + '\n');
console.log(index);
