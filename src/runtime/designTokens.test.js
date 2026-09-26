import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The design system as a rule, not a hope. Every colour and every size in the
// player-facing interface goes through the role tokens in theme.css; a literal
// is a surface that stays behind when the direction changes, and a French string
// in a component is a string the runtime translator cannot turn into the
// player's language. Both were reintroduced, by hand, more than once. This test
// makes reintroducing them a failure instead of a screenshot.

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, "..");

// Player-facing code. The map editor is its own tool; the web home page is a
// site, not the game; tests and data modules are content, not chrome.
const ROOTS = ["Game/GameUI", "Game/Selection", "runtime"];
const SKIP = [/\/Editor\//, /\/web\//, /\.test\.js$/, /basemapLibrary\.js$/, /Preset\.js$/, /Faithful\.js$/, /worldReach\.js$/, /organizations\.js$/, /intents\.js$/, /migration\.js$/, /wars\.js$/, /succession\.js$/, /realityCheck\.js$/, /economy\.js$/, /economyBridge\.js$/, /gameState\.js$/, /rejections\.js$/, /churchPreset/];

// What is allowed to stay literal, and why. Keep this list short and justified.
const ALLOWED = [
  // A modal scrim must stay dark whatever the paper does.
  { file: "GameUI/main.jsx", pattern: /rgba\(0, 0, 0, 0\.7\)/ },
  { file: "GameUI/libraryBar.jsx", pattern: /rgba\(0,0,0,0\.55\)/ },
  // Map canvases and their overlays: the globe is not the interface.
  { file: "GameUI/CountryPickerMap.jsx", pattern: /#0a0c15|#[0-9a-f]{6}/ },
  // A chart's series encode which line is which: distinct hues, not chrome.
  { file: "GameUI/advisor.jsx", pattern: /#b0568f|#4a7fa5|#6b5aa8|#1f3f86|#1f7a4d|#a35c07|#d9382b|#f4f0e6|#14161a|#2a2d33|#5c6068|#cbc7bd/ },
  { file: "GameUI/stats.jsx", pattern: /color: "#[0-9a-f]{6}"/ },
  { file: "GameUI/chat.jsx", pattern: /#ef4444|#f97316|#eab308|#14b8a6|#ec4899|boxShadow/ },
  // Shadows are depth, not colour: a black at low alpha under a plate is fine.
  { file: "*", pattern: /rgba\(0, ?0, ?0, ?0\.[0-9]+\)/ },
  // The startup screen's grain mask and gradient stops on the paper's own channels.
  { file: "runtime/StartupScreen.jsx", pattern: /rgba\(var\(--oh-plate-rgb\)|data:image\/svg\+xml/ },
  { file: "runtime/StartupScreen.jsx", pattern: /rgba\(0, ?0, ?0, ?0\)/ },
  { file: "styles.css", pattern: /rgba\(0, 0, 0, 0\.8\)/ },
  // Brand colours of third parties are theirs, not the direction's.
  { file: "GameUI/settings.jsx", pattern: /rgba\(88, 101, 242|rgba\(255, 69, 0/ },
  // The default value of a colour input is data the player edits, not chrome.
  { file: "GameUI/libraryBar.jsx", pattern: /labelTextColor|labelHaloColor/ },
  { file: "GameUI/scenarios.jsx", pattern: /labelTextColor|labelHaloColor/ },
  // Map overlays paint on a canvas that cannot read a custom property.
  { file: "GameUI/CountryPickerMap.jsx", pattern: /rgba\(/ },
];

const walk = (dir, out = []) => {
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else if (/\.(jsx?|css)$/.test(name)) out.push(full);
  }
  return out;
};

const files = ROOTS.flatMap((root) => walk(path.join(SRC, root)))
  .filter((file) => !SKIP.some((re) => re.test(file.replace(/\\/g, "/"))));

const rel = (file) => path.relative(SRC, file).replace(/\\/g, "/");
const allowed = (file, line) => ALLOWED.some((a) => (a.file === "*" || rel(file).endsWith(a.file)) && a.pattern.test(line));

test("no colour is written as a literal in the player-facing interface", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/#[0-9a-fA-F]{6}\b|rgba?\([0-9]/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment may name a colour
      if (allowed(file, line)) return;
      offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `colour literals:\n${offenders.join("\n")}`);
});

test("no font size is written outside the scale in the player-facing interface", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      // Un clamp() écrit dans un composant EST un corps inventé — c'est même la
      // forme qu'ils prenaient tous : sept valeurs d'affichage sans rapport
      // entre elles, chacune posée à son point d'usage. Les deux marches
      // d'affichage de l'échelle portent leur clamp dans theme.css, une fois.
      if (/fontSize: "[0-9.]+(rem|px)"|font-size: [0-9.]+(rem|px)|fontSize: "clamp\(/.test(line)) {
        offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `off-scale sizes:\n${offenders.join("\n")}`);
});

// Interface strings are FRENCH in the source. This test used to require the
// opposite, and it was wrong.
//
// The reasoning behind the old rule was that English sources let the runtime
// translator reach every player. In practice the translator needs the model, and
// its offline safety net — the packs in public/lang — is generated by hand and
// goes stale: on the day this changed, fr.json was six days old and held not one
// string the game actually showed, not even "Next edition". So the player put
// the game on Vercel, opened it, and read a half-English interface. His verdict:
// "quand le jeu commence il commence en français, je veux que tu code tout en
// français, j'ai toujours été clair là-dessus." He had been.
//
// French in the source needs no model, no key, no quota and no regenerated pack:
// it is simply what the page says. Other languages still work — the translator
// reads French as happily as English — but they are now the case that degrades,
// instead of the player's own language being the case that degrades.
//
// This test does not force French (a proper noun or a code name may be anything);
// it forbids reintroducing the old rule by catching the English boilerplate that
// used to be everywhere in these files.
// La liste s'allonge d'un mot chaque fois qu'un mot anglais se fait prendre sur
// une capture. Ceux-ci viennent du 11 septembre : « ORDER · PLANNED » au-dessus
// d'un ordre écrit en français, et « Fallback » en marge d'un événement.
const ENGLISH_UI_TELLS = /(?:>|")\s*(?:Cancel|Close|Save|Delete|Send|Search|Loading|Settings|Back|Next|Confirm|Continue|Order|Outreach|Fallback|Update|Reload|Restart|Dismiss|Retry|Done)\s*(?:<|")/;

// La liste de mots ci-dessus attrape un BOUTON anglais. Elle n'attrape pas une
// PHRASE anglaise, et il en restait sur la une elle-même — « This money is cash,
// not capital », « One contributor is carrying it », « The edition was stopped »
// — au premier endroit où le lecteur regarde, pendant que le joueur redemandait
// pour la dixième fois que le jeu soit en français.
//
// Une phrase est jugée anglaise quand elle porte TROIS mots-outils anglais
// distincts. Deux suffiraient à condamner « Le rapport de la commission » ou un
// nom propre ; trois ne se produisent pas par accident en français.
const MOTS_OUTILS_ANGLAIS = /\b(the|and|your|you|with|from|this|that|which|what|when|where|will|would|should|could|must|have|has|been|were|are|is|not|all|any|each|every|there|they|their|its|for|but|about|into|than|then|only|also|more|most|other|such|some|because|before|after|while|during|between|through|under|over|again|never|always|already|still|yet|just|even|very|much|many|few|first|last|next|back|out|off|down|does|did|can|may|might|shall)\b/gi;

// Ce qui est légitimement anglais : les tables par langue, qui portent l'anglais
// comme contenu. Elles sont écrites à la main précisément parce que ces écrans
// paraissent quand le traducteur ne peut pas tourner.
const ANGLAIS_LEGITIME = [/FirstRunKey\.jsx$/, /welcomeText\.js$/, /outageNotice\.js$/];

// J'avais mis cinq écrans de côté — les Réglages, le banc d'essai, la
// bibliothèque, le créateur de puissance, le hub communautaire — en reposant à
// François une question à laquelle il avait déjà répondu. Sa réponse : « j'ai dû
// répondre des milliards de fois, je veux TOUT en français ». Il avait raison.
// La liste est vide et le reste : ce tableau n'existe plus que pour dire
// pourquoi il ne faut pas le recréer.
const EN_ATTENTE_DE_DECISION = [];

// Une ligne de CODE n'est pas une phrase à l'écran. Ni une trace de console,
// qui va au journal du navigateur et jamais sous les yeux du joueur.
const estDuCode = (t) => /^(import|export|const|let|var|function|return|if|for|while|\}|\{|\)|<\/|\/\/|\*|\/\*)/.test(t)
  || /console\.(log|warn|error|info|debug)\(/.test(t);

test("aucune phrase anglaise n'atteint l'écran du joueur", () => {
  const offenders = [];
  for (const file of files) {
    if (!file.endsWith(".jsx")) continue;
    if (ANGLAIS_LEGITIME.some((re) => re.test(file))) continue;
    if (EN_ATTENTE_DE_DECISION.some((re) => re.test(file))) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    let dansUnCommentaire = false;
    lines.forEach((line, i) => {
      const t = line.trim();
      // Les commentaires de bloc décrivent le pourquoi d'un correctif : ils sont
      // en anglais dans tout ce dépôt et ne paraissent nulle part. En JSX ils
      // s'ouvrent par « {/* » autant que par « /* », et courent sur plusieurs
      // lignes dont aucune ne se reconnaît isolément.
      if (/(^|\{)\/\*/.test(t) && !/\*\//.test(t)) dansUnCommentaire = true;
      const finDeBloc = dansUnCommentaire && /\*\//.test(t);
      const ignorer = dansUnCommentaire || estDuCode(t) || /(^|\{)\/\*/.test(t);
      if (finDeBloc) dansUnCommentaire = false;
      if (ignorer || !t) return;

      // Le texte nu entre les balises, plus ce qu'un attribut affiche. Un
      // commentaire posé EN FIN de ligne de code — « } catch { /* … */ } » — est
      // retiré d'abord : il explique le code, il ne paraît nulle part.
      const sansCommentaire = line.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/.*$/, " ");
      const textes = [sansCommentaire.replace(/<[^>]*>/g, " ")];
      for (const m of sansCommentaire.matchAll(/(?:placeholder|title|aria-label|alt)=["']([^"']{15,})["']/g)) textes.push(m[1]);
      for (const texte of textes) {
        const phrase = texte.trim();
        if (phrase.length < 25) continue;
        const distincts = new Set([...phrase.matchAll(MOTS_OUTILS_ANGLAIS)].map((m) => m[0].toLowerCase()));
        if (distincts.size >= 3) offenders.push(`${rel(file)}:${i + 1}: ${phrase.slice(0, 90)}`);
      }
    });
  }
  assert.deepEqual(offenders, [], `phrases anglaises à l'écran :\n${offenders.join("\n")}`);
});

test("interface strings are in the player's own language, not waiting on a translator", () => {
  const offenders = [];
  for (const file of files) {
    if (!file.endsWith(".jsx")) continue;
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (ENGLISH_UI_TELLS.test(line)) offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `English interface strings:\n${offenders.join("\n")}`);
});

// Components whose whole surface is the accent by construction: a dateline
// chip, a primary button, the banner's action, the error screen's action.
const ON_ACCENT_ALLOWED = [
  { file: "GameUI/bulletin.jsx", pattern: /Dateline|Advance time|Sign and begin|background: tone === "alert"/ },
  { file: "GameUI/bulletin.jsx", pattern: /color: "var\(--oh-on-accent\)"/ },
  { file: "runtime/AppUpdateBanner.jsx", pattern: /./ },
  { file: "runtime/ErrorBoundary.jsx", pattern: /./ },
  { file: "GameUI/main.jsx", pattern: /./ },
  { file: "styles.css", pattern: /./ },
  { file: "GameUI/verdict.jsx", pattern: /./ },
  // Le bandeau de cotations du cahier des comptes est un aplat noir, comme dans
  // la maquette : du blanc y est la seule encre lisible, et le système n'a pas
  // d'autre token pour « encre sur fond sombre ». Même cas que le bouton de
  // presse du bulletin, déjà admis plus haut.
  { file: "GameUI/caisses.jsx", pattern: /color: "var\(--oh-on-accent\)"/ },
  // Le bouton d'envoi d'une lettre : un aplat noir, comme METTRE SOUS PRESSE
  // dont il partage le rôle — l'action principale de la page. Il était arrondi
  // et bleu, ce qui en faisait le seul bouton de ce genre du journal. Du blanc
  // y est la seule encre lisible, et le système n'a pas de token pour « encre
  // sur fond sombre ».
  { file: "GameUI/chat.jsx", pattern: /playerInput\.trim\(\) \? "var\(--oh-on-accent\)"/ },
  // « Nouvelle lettre », dans la colonne des correspondants : même rôle que le
  // bouton d'envoi ci-dessus, donc même aplat noir. Il était le seul aplat bleu
  // d'un journal qui n'imprime qu'à l'encre.
  { file: "GameUI/correspondence.jsx", pattern: /background: "var\(--oh-text-strong\)"/ },
  { file: "theme.css", pattern: /./ },
];

test("on-accent sits only on an accent or alert ground", () => {
  const offenders = [];
  for (const file of files) {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (!/oh-on-accent/.test(line)) return;
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // The ground may sit a few lines above the colour in a multi-line object.
      const window = lines.slice(Math.max(0, i - 6), i + 1).join("\n");
      if (/(background|backgroundColor|background-color)[^;]*var\(--oh-(accent|alert)\)/.test(window)) return;
      if (ON_ACCENT_ALLOWED.some((a) => rel(file).endsWith(a.file) && a.pattern.test(line))) return;
      offenders.push(`${rel(file)}:${i + 1}: ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `on-accent off the accent:\n${offenders.join("\n")}`);
});

// La fuite d'audience, et la carte de partage de quelqu'un d'autre.
//
// index.html chargeait G-H9EQ4JFZXZ : la propriété Google Analytics DE L'AMONT,
// héritée du fork. Chaque visiteur de ce jeu était compté dans le compte d'un
// tiers, que personne ici ne peut ni lire ni effacer. Et la carte de partage —
// ce qu'on voit quand on colle le lien — annonçait « Open Historia · An open
// source alternative to Pax Historia », avec une image tirée du dépôt de
// l'amont. Ce test garde les deux, hors commentaires : un bloc commenté qui
// explique comment remettre SON propre identifiant reste permis.
test("aucun tiers ne mesure ce jeu, et la carte de partage est la sienne", () => {
  const brut = fs.readFileSync(path.resolve(SRC, "..", "index.html"), "utf8");
  const actif = brut.replace(/<!--[\s\S]*?-->/g, "");

  // La règle n'est pas « aucune mesure » : c'est « aucun TIERS ». Ce jeu porte
  // maintenant la propriété de son auteur, et c'est celle de l'amont qui ne doit
  // jamais revenir — ni elle, ni aucune autre qu'on n'aurait pas choisie.
  const identifiants = [...actif.matchAll(/G-[A-Z0-9]{6,}/g)].map((m) => m[0]);
  assert.deepEqual([...new Set(identifiants)], ["G-V2BR97YN1Z"], "une seule propriété mesure ce jeu, celle de son auteur");
  assert.ok(!actif.includes("G-H9EQ4JFZXZ"), "celle de l'amont ne revient pas");
  for (const amont of ["Pax Historia", "Open-Historia", "Open Historia"]) {
    assert.ok(!actif.includes(amont), `la carte de partage ne nomme plus l'amont (${amont})`);
  }
  assert.match(actif, /og:title" content="Saint-Siège"/, "elle porte le nom de ce jeu");
});
