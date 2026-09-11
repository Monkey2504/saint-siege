// Applique design/tokens.json à src/theme.css (bloc :root), en préservant commentaires et ordre.
// Usage : node scripts/tokens-sync.mjs [--check]
import fs from 'node:fs';
const check = process.argv.includes('--check');
const tokens = Object.assign({}, ...Object.values(JSON.parse(fs.readFileSync('design/tokens.json','utf8'))));
const chemin = 'src/theme.css';
let css = fs.readFileSync(chemin,'utf8');
const bloc = css.match(/:root\s*\{[\s\S]*?\n\}/);
if(!bloc) { console.error('bloc :root introuvable dans', chemin); process.exit(2); }
let ecarts = [], sortie = bloc[0];
for (const [nom, valeur] of Object.entries(tokens)) {
  const rx = new RegExp(`(^\\s*${nom}\\s*:\\s*)([^;]+)(;)`, 'm');
  const trouve = sortie.match(rx);
  if (!trouve) { ecarts.push(`${nom} : absent de theme.css`); continue; }
  if (trouve[2].trim() !== valeur) {
    ecarts.push(`${nom} : ${trouve[2].trim()} → ${valeur}`);
    sortie = sortie.replace(rx, `$1${valeur}$3`);
  }
}
if (check) {
  if (ecarts.length) { console.log('ÉCARTS entre design/tokens.json et src/theme.css :'); ecarts.forEach(e=>console.log('  -',e)); process.exit(1); }
  console.log('theme.css est conforme à design/tokens.json'); process.exit(0);
}
if (!ecarts.length) { console.log('rien à changer'); process.exit(0); }
fs.writeFileSync(chemin, css.replace(bloc[0], sortie));
console.log('theme.css mis à jour :'); ecarts.forEach(e=>console.log('  -',e));
