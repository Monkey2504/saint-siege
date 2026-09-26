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

const FICHIER_PARTIE = 'design/fixtures/partie-jouee.json';
const partieJouee = fs.existsSync(FICHIER_PARTIE)
  ? JSON.parse(fs.readFileSync(FICHIER_PARTIE, 'utf8'))
  : null;

const bouton = (page, nom) => page.getByRole('button', { name: nom }).first();

/** Clique si le bouton est là, ne dit rien s'il n'y est pas. */
const siPresent = async (page, nom, repos = 2500) => {
  const b = bouton(page, nom);
  if (!(await b.count()) || !(await b.isVisible().catch(() => false))) return false;
  await cliquer(page, nom, repos);
  return true;
};

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

// Le portail s'appelait « ⚔ Enter Open Historia » et gardait son bouton inerte
// treize secondes et demie, le temps de choisir un nœud de carte : le parcours
// s'y était cassé les dents une première fois, en cliquant sur un bouton mort.
// Il s'appelle « Entrer », il est actif dès qu'il paraît, et la fenêtre de démo
// qui suivait n'existe plus (runtime/web/homePage.js).
const franchirLePortail = async (page, { obligatoire = true } = {}) => {
  try {
    await page.waitForFunction(() => {
      const b = document.querySelector('#oh-home-root .oh-porte-entrer');
      return b && !b.disabled;
    }, { timeout: obligatoire ? 90000 : 8000 });
  } catch (e) {
    if (obligatoire) throw e;
    return; // la porte a déjà été franchie : il n'y a rien à franchir.
  }
  await page.click('#oh-home-root .oh-porte-entrer');
  await page.waitForTimeout(1500);
};

/**
 * Charge la partie de démonstration dans le magasin du navigateur.
 *
 * Sans elle, le parcours capture un tour 1 : aucune caisse ouverte, aucune
 * lettre reçue, aucun ordre jugé, aucune ligne au registre. Ce sont des états
 * réels, mais ils ne montrent AUCUN des composants qui portent le contenu — et
 * deux audits de design ont ainsi validé des pages qui ne montraient rien.
 *
 * En mode web, `window.fetch` est détourné et l'état vient d'IndexedDB : écrire
 * la partie, c'est donc faire dans la page les mêmes PUT que le jeu ferait.
 * Rien n'est contourné, on emprunte le chemin de sauvegarde du jeu lui-même.
 *
 * La partie est produite par scripts/partie-de-demonstration.mjs, qui la fait
 * écrire au moteur plutôt qu'à la main.
 */
const chargerLaPartie = async (page, partie) => {
  const ecrit = await page.evaluate(async (p) => {
    const put = async (nom, valeur) => {
      const r = await fetch(`/api/runtime/json/${nom}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valeur),
      });
      return `${nom}:${r.status}`;
    };
    return [
      await put('world', p.world),
      await put('game', p.game),
      await put('actions', p.actions),
      await put('chat', p.chat),
      await put('events', p.events),
    ];
  }, partie);
  const refuses = ecrit.filter((e) => !/:2\d\d$/.test(e));
  if (refuses.length) throw new Error(`la partie n'a pas pu être écrite : ${refuses.join(', ')}`);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
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

/**
 * Charge la partie jouée, puis refait le chemin de la porte jusqu'à l'édition.
 *
 * Sans partie de démonstration dans le dépôt, on ne charge rien et le parcours
 * continue sur le monde neuf : la capture montre alors les états vides, ce qui
 * est un rendu honnête de ce cas — mais l'INDEX doit le dire, et il le dit.
 */
const reprendreSurLaPartieJouee = async (page) => {
  if (!partieJouee) throw new Error(`aucune partie de démonstration (${FICHIER_PARTIE}) — lancez d'abord node scripts/partie-de-demonstration.mjs`);
  await chargerLaPartie(page, partieJouee);

  // Le rechargement ne repasse pas forcément par la porte du site : elle n'est
  // montrée qu'une fois. Chaque écran de ce chemin est donc franchi s'il est
  // là, et sauté s'il ne l'est pas — un parcours qui EXIGE un écran facultatif
  // échoue sur l'écran, pas sur le jeu.
  await franchirLePortail(page, { obligatoire: false });
  await siPresent(page, /Passer — regarder autour/i, 3000);
  await siPresent(page, /Reprendre votre partie/i, 5000);
};

/** Ouvre la première lettre du Courrier : le fil ne se voit pas depuis la liste. */
const ouvrirLaPremiereLettre = async (page) => {
  const premiere = page.locator('[data-surface] button, [data-surface] [role="button"]')
    .filter({ hasText: /Chemin synodal|Bloc des cardinaux|Compagnie de Jésus|Curie|Opus Dei|Vieille garde/ })
    .first();
  await premiere.click({ timeout: 20000 });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { document.querySelectorAll('*').forEach((n) => { if (n.scrollTop) n.scrollTop = 0; }); });
  await page.waitForTimeout(300);
};

/* ---------------------------------------------------------------- parcours */

/**
 * Le parcours joueur, dans l'ordre. `fichier` déclenche une capture ; une étape
 * sans `fichier` n'est qu'une manœuvre. Ajouter un écran ici est le seul moyen
 * de le rendre visible à une session qui n'a pas de navigateur.
 */
const PARCOURS = [
  // D'abord la porte et la première page de jeu, sur un monde neuf : HABEMUS
  // PAPAM ne paraît QUE tant que le pontificat n'est pas signé, et la partie de
  // démonstration l'est. Il faut donc le prendre avant de la charger.
  { fichier: '01-portail' },
  { fichier: '02-cle-api',           faire: franchirLePortail },
  { fichier: '03-accueil',           faire: p => cliquer(p, /Passer — regarder autour/i, 3000) },
  { fichier: '04-habemus-papam',     faire: p => cliquer(p, /Reprendre votre partie/i, 4000) },

  // Puis la partie jouée, et le même chemin une seconde fois : l'écriture
  // recharge la page, donc il faut repasser la porte.
  {                                  faire: reprendreSurLaPartieJouee },

  { fichier: '05-edition-du-tour' },
  { fichier: '06-ordres',            faire: p => cliquer(p, /^Ordres$/i) },
  { fichier: '07-registre',          faire: p => cliquer(p, /^Registre$/i) },
  { fichier: '08-college',           faire: p => cliquer(p, /^Collège$/i) },
  { fichier: '09-caisses',           faire: p => cliquer(p, /^Caisses$/i) },
  { fichier: '10-correspondance',    faire: p => cliquer(p, /^Correspondance$/i) },

  // Et la lettre OUVERTE. Le brief de la session de design est net : « le
  // Courrier rempli est l'ancien chat repeint », et cela ne se voit QUE lettre
  // ouverte. Une liste de correspondants ne montre pas le fil.
  { fichier: '11-courrier-ouvert',   faire: ouvrirLaPremiereLettre },
];

/* ---------------------------------------------------------------- capture  */

/**
 * PNG par défaut : les écrans du jeu sont des aplats et du texte, que le PNG
 * rend sans artefact autour des glyphes — et c'est la typographie qu'une
 * session de design vient juger. Les rares écrans mangés par une photographie
 * dépassent le budget en PNG ; ceux-là seulement repassent en JPEG.
 */
/**
 * Ce qui dépasse de l'écran, par la droite.
 *
 * Une capture ne le dit pas : elle rend 390 pixels de large quoi qu'il arrive,
 * et un chapô coupé en plein mot ressemble à un chapô court. Mesuré sur le
 * gabarit mobile, la ligne des cahiers poussait la page entière au-delà de
 * l'écran — la une s'y faisait couper par la droite, photographie comprise — et
 * onze captures d'affilée ne l'avaient pas dit.
 *
 * Le rail des cahiers est exclu : il défile à dessein, et son débordement est
 * ce qui rend les six cahiers atteignables à l'étroit.
 */
const deborde = (page) => page.evaluate(() => {
  const coupables = [];
  for (const e of document.querySelectorAll('*')) {
    if (e.classList.contains('oh-cahiers-rail')) continue;
    if (e.closest('.oh-cahiers-rail')) continue;
    const trop = e.scrollWidth - e.clientWidth;
    const cs = getComputedStyle(e);
    // Ce qui clippe À DESSEIN n'est pas un débordement : un rail qui défile,
    // une ligne coupée par des points de suspension. Ce qu'on cherche, c'est
    // ce qui sort de l'écran sans que personne l'ait voulu.
    const voulu = cs.overflowX === 'auto' || cs.overflowX === 'scroll'
      || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis';
    if (trop > 2 && e.clientWidth > 0 && !voulu) {
      // Le conteneur qui CLIPPE n'est pas le coupable : c'est un de ses
      // descendants qui est trop large. On nomme le plus large, sinon on
      // envoie le lecteur corriger la mauvaise boîte.
      let large = null;
      for (const d of e.querySelectorAll('*')) {
        const w = d.getBoundingClientRect().width;
        if (w > e.clientWidth + 2 && (!large || w > large.getBoundingClientRect().width)) large = d;
      }
      const nom = (x) => `${x.tagName.toLowerCase()}${x.className && typeof x.className === 'string' ? '.' + x.className.split(' ')[0] : ''}${x.className ? '' : ' « ' + (x.textContent || '').trim().slice(0, 34) + ' »'}`;
      coupables.push(`${nom(e)} dépasse de ${trop} px${large ? ` — ${nom(large)} y fait ${Math.round(large.getBoundingClientRect().width)} px` : ''}`);
    }
  }
  // Et la page elle-même, qui est le cas que le joueur voit en premier.
  const doc = document.documentElement;
  if (doc.scrollWidth > doc.clientWidth + 2) coupables.unshift(`la page dépasse de ${doc.scrollWidth - doc.clientWidth} px`);
  return [...new Set(coupables)].slice(0, 3);
});

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
// Trois hôtes échouent TOUJOURS ici, et ce n'est pas un défaut de la page : la
// capture tourne sans accès internet. Les relever comme des anomalies envoyait
// un lecteur futur chasser un problème qui n'existe pas — pire, le tentait de
// « corriger » une mesure d'audience volontaire. Ils sont nommés à part.
const HORS_LIGNE = new Map([
  ['www.googletagmanager.com', "la mesure d'audience du jeu (index.html)"],
  ['open-historia-registry.nichojkrol.workers.dev', 'le registre des nœuds de carte, sollicité à la première tuile'],
  ['api.github.com', 'le hub communautaire, qui liste des scénarios'],
]);
const attendus = [];
page.on('requestfailed', r => {
  const h = (() => { try { return new URL(r.url()).host; } catch { return r.url(); } })();
  if (HORS_LIGNE.has(h)) {
    const ligne = `${h} — ${HORS_LIGNE.get(h)}`;
    if (!attendus.includes(ligne)) attendus.push(ligne);
    return;
  }
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
  const trop = await deborde(page);
  for (const c of trop) {
    const ligne = `débordement · ${etape.fichier} : ${c}`;
    if (!erreurs.includes(ligne)) erreurs.push(ligne);
  }
  faits.push({ fichier, etat: `capturé, ${ko(octets)}${trop.length ? ` — ${trop.length} débordement${trop.length > 1 ? 's' : ''}` : ''}` });
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
  attendus.length
    ? '## Appels sortants, sans effet ici\n\nCette capture tourne sans accès internet : ces requêtes échouent toujours, et\nce n\'est pas un défaut de la page.\n\n' + attendus.map(e => '- ' + e).join('\n') + '\n'
    : '',
].join('\n');
fs.writeFileSync(path.join(DOSSIER, 'INDEX.md'), index + '\n');
console.log(index);
