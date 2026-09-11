// Extrait le bloc :root de src/theme.css vers design/tokens.json
import fs from 'node:fs';
const css = fs.readFileSync('src/theme.css','utf8');
const m = css.match(/:root\s*\{([\s\S]*?)\n\}/);
if(!m) throw new Error(':root introuvable');
const groupes = { couleur:{}, typographie:{}, echelle:{}, filet:{}, rayon:{}, ombre:{}, autre:{} };
const classe = n => /font|label-(case|track|weight)|^--oh-t-/.test(n) ? (/^--oh-t-/.test(n)?'echelle':'typographie')
  : /^--oh-filet/.test(n) ? 'filet'
  : /^--oh-r-|radius/.test(n) ? 'rayon' : /shadow/.test(n) ? 'ombre'
  : /ground|plate|line|text|accent|grant|caution|alert|sea|border|on-accent|sepia|parch|red/.test(n) ? 'couleur' : 'autre';
for (const ligne of m[1].split('\n')) {
  const d = ligne.match(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/i);
  if (d) groupes[classe(d[1])][d[1]] = d[2].trim();
}
fs.writeFileSync('design/tokens.json', JSON.stringify(groupes,null,2)+'\n');
console.log('tokens écrits :', Object.entries(groupes).map(([k,v])=>`${k}=${Object.keys(v).length}`).join(' '));

// Génère aussi design/TOKENS.md : la fiche lisible par une session de design.
const titres = { couleur:'Couleurs', typographie:'Typographie', echelle:'Échelle typographique', filet:'Filets', rayon:'Rayons', ombre:'Ombres', autre:'Autres' };
const lignes = ['# Tokens de Saint-Siège','',
 'Source de vérité : `design/tokens.json`. `src/theme.css` en découle (`npm run tokens:sync`).','',
 'Toute maquette doit être dessinée avec ces valeurs, et aucune autre. Une couleur qui',
 "n'est pas dans cette liste est une couleur qui n'existe pas dans le jeu.",''];
for (const [cle, valeurs] of Object.entries(groupes)) {
  if (!Object.keys(valeurs).length) continue;
  lignes.push(`## ${titres[cle]}`, '', '| Token | Valeur |', '|---|---|');
  for (const [n,v] of Object.entries(valeurs)) lignes.push(`| \`${n}\` | \`${v}\` |`);
  lignes.push('');
}
fs.writeFileSync('design/TOKENS.md', lignes.join('\n'));
console.log('design/TOKENS.md écrit');
