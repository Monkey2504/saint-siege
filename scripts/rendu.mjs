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
};

/**
 * Le portail web garde « Enter Open Historia » désactivé tant que la connexion
 * n'est pas résolue — une quinzaine de secondes quand le registre communautaire
 * est injoignable et qu'il faut attendre le repli sur l'origine. On attend donc
 * l'activation du bouton, jamais un délai fixe. La modale de démo suit.
 */
const franchirLePortail = async (page) => {
  await page.waitForFunction(() => {
    const b = [...document.querySelectorAll('button')].find(x => /Enter Open Historia/i.test(x.textContent || ''));
    return b && !b.disabled;
  }, { timeout: 90000 });
  await cliquer(page, /Enter Open Historia/i, 1500);
  const demo = bouton(page, /Play the demo anyway/i);
  if (await demo.count() && await demo.isVisible()) await cliquer(page, /Play the demo anyway/i, 2000);
};

/** Depuis la bibliothèque, rouvrir la partie courante : elle mène à HABEMUS PAPAM. */
const rouvrirLaPartie = async (page) => {
  await cliquer(page, /^Parties$/i, 1500);
  await cliquer(page, /^Current$/i, 5000);
};

/**
 * HABEMUS PAPAM demande un nom, trois sièges de cabinet et un programme.
 * Aucune clé d'API n'est saisie nulle part : l'écran qui la réclame est franchi
 * par son lien « Passer », et le monde tourne alors avec la doublure hors ligne.
 */
const signerLePontificat = async (page) => {
  await page.locator('input[placeholder*="Léon XV"]').fill('Léon XV');
  const candidats = page.locator('button').filter({ hasText: /Card\.|Mgr |Sr |Mère |P\. |M\. / });
  for (let i = 0; i < 3; i++) { await candidats.nth(i).click({ timeout: 20000 }); await page.waitForTimeout(400); }
  await page.locator('textarea[placeholder*="élu pour changer"]')
    .fill("Remettre les comptes au clair et rouvrir la porte aux périphéries.");
  await cliquer(page, /Signer et commencer le pontificat/i, 6000);
};

/* ---------------------------------------------------------------- parcours */

/**
 * Le parcours joueur, dans l'ordre. `fichier` déclenche une capture ; une étape
 * sans `fichier` n'est qu'une manœuvre. Ajouter un écran ici est le seul moyen
 * de le rendre visible à une session qui n'a pas de navigateur.
 */
const PARCOURS = [
  { fichier: '01-portail' },
  { fichier: '02-cle-api',                faire: franchirLePortail },
  { fichier: '03-accueil',                faire: p => cliquer(p, /Passer — regarder autour/i, 3000) },
  { fichier: '04-bibliotheque-parties',   faire: p => cliquer(p, /Reprendre votre partie/i) },
  { fichier: '05-bibliotheque-scenarios', faire: p => cliquer(p, /^Scénarios$/i, 2000) },
  { fichier: '06-habemus-papam',          faire: rouvrirLaPartie },
  {                                       faire: signerLePontificat },
  { fichier: '07-courrier',               faire: p => cliquer(p, /^Courrier$/i) },
  { fichier: '08-bulletin',               faire: p => cliquer(p, /^Bulletin$/i) },
  { fichier: '09-college',                faire: p => cliquer(p, /^Collège$/i) },
  { fichier: '10-conseiller',             faire: p => cliquer(p, /^Conseiller$/i) },
  { fichier: '11-comptes',                faire: p => cliquer(p, /^Comptes$/i) },
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
