// Dixième passe : le Courrier, et le bandeau de mise à jour.
//
// Le brief du 11 septembre, bloquant 1 : « Le Courrier rempli est l'ancien chat
// repeint ». Une capture avec une lettre OUVERTE l'a montré — les rendus
// n'avaient jamais montré que des états vides, et un état vide cache tout.
//
// Ce que cette passe traite : les étiquettes anglaises du fil de lettres, le
// placeholder du champ, et le bandeau de mise à jour, qui parlait anglais et
// nommait l'amont au milieu du journal.
//
// Ce qu'elle NE traite pas, parce que ce n'est pas de la langue : la ligne de
// mots-clés bruts, la fiche du correspondant, la mesure du panneau et le bouton
// d'envoi. Ils sont dans le même commit, hors de ce script.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Le fil de lettres ────────────────────────────────────────────────────
  ["src/Game/GameUI/chat.jsx",
    '<span className="oh-label" style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-2xs)" }}>What it says it wants</span>',
    '<span className="oh-label" style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-2xs)" }}>Ce qu&apos;il dit vouloir</span>'],
  ["src/Game/GameUI/chat.jsx",
    '<div style={{ color: "var(--oh-text-dim)", marginTop: "0.15rem" }}>Nothing declared. What it really wants, you will have to make it say — or infer from what it fights.</div>',
    '<div style={{ color: "var(--oh-text-dim)", marginTop: "0.15rem" }}>Rien de déclaré. Ce qu&apos;il veut vraiment, il faudra le lui faire dire — ou le déduire de ce qu&apos;il combat.</div>'],
  ["src/Game/GameUI/chat.jsx",
    'placeholder={page ? `Write to ${addressee}… (Shift+Enter for a new line)` : "Send a diplomatic message…"}',
    'placeholder={page ? `Répondre à ${addressee}… (Maj+Entrée pour une nouvelle ligne)` : "Écrire une lettre…"}'],
  ["src/Game/GameUI/chat.jsx", 'placeholder="Search countries..."', 'placeholder="Chercher…"'],
  ["src/Game/GameUI/correspondence.jsx",
    '<div>{chatMessageCount(activeChat)} exchanged · {fmtDate(gameDate)}</div>',
    '<div>{chatMessageCount(activeChat)} {chatMessageCount(activeChat) === 1 ? "lettre échangée" : "lettres échangées"} · {fmtDate(gameDate)}</div>'],

  // ── Le bandeau de mise à jour ────────────────────────────────────────────
  // Il nommait l'amont — « Open Historia » — en travers du journal, et parlait
  // anglais. Et son bouton était le seul arrondi bleu de tout l'écran.
  ["src/runtime/AppUpdateBanner.jsx", "        A new version of Open Historia is ready.", "        Une nouvelle version du jeu est prête."],
  ["src/runtime/AppUpdateBanner.jsx", '? (updating ? "Reloading…" : "Reload to get the latest fixes. Your games are saved.")', '? (updating ? "Rechargement…" : "Rechargez pour obtenir les dernières corrections. Vos parties sont gardées.")'],
  ["src/runtime/AppUpdateBanner.jsx", '            : updating\n              ? "Downloading… open the finished download to install and reopen."\n              : latest.notes || `Build ${latest.build} · tap Update to download and install.`}', '            : updating\n              ? "Téléchargement… ouvrez le fichier une fois fini pour installer et rouvrir."\n              : latest.notes || `Version ${latest.build} · touchez « Mettre à jour » pour télécharger et installer.`}'],
  ["src/runtime/AppUpdateBanner.jsx", "          Restart now\n", "          Redémarrer maintenant\n"],
  ["src/runtime/AppUpdateBanner.jsx", '              ? (isWeb ? "Reloading…" : desktop ? "Opening…" : "Downloading…")\n              : "Update now"}', '              ? (isWeb ? "Rechargement…" : desktop ? "Ouverture…" : "Téléchargement…")\n              : "Mettre à jour"}'],
  ["src/runtime/AppUpdateBanner.jsx", 'aria-label="Dismiss update notice"', 'aria-label="Masquer l\'avis de mise à jour"'],
  ["src/runtime/AppUpdateBanner.jsx", 'return updating ? "Opening the download…" : "Download the new version and run it — your games are kept.";', 'return updating ? "Ouverture du téléchargement…" : "Téléchargez la nouvelle version et lancez-la — vos parties sont gardées.";'],
  ["src/runtime/AppUpdateBanner.jsx", 'if (progress?.state === "ready") return "Downloaded. Restart to finish — your games are kept.";', 'if (progress?.state === "ready") return "Téléchargée. Redémarrez pour finir — vos parties sont gardées.";'],
  ["src/runtime/AppUpdateBanner.jsx", 'if (progress?.state === "downloading") return `Downloading the update… ${progress.percent || 0}%`;', 'if (progress?.state === "downloading") return `Téléchargement de la mise à jour… ${progress.percent || 0} %`;'],
  ["src/runtime/AppUpdateBanner.jsx", 'if (progress?.state === "checking") return "Fetching the update…";', 'if (progress?.state === "checking") return "Recherche de la mise à jour…";'],
  ["src/runtime/AppUpdateBanner.jsx", 'return "Installs itself in the background — your games are kept.";', 'return "S\'installe toute seule en arrière-plan — vos parties sont gardées.";'],

  // ── Et son bouton redevient plat, comme tous les autres du journal ────────
  ["src/runtime/AppUpdateBanner.jsx",
    '  background: "var(--oh-accent)",\n  border: "0",\n  borderRadius: "9px",\n  color: "var(--oh-on-accent)",\n  cursor: "pointer",\n  font: "700 0.82rem system-ui, sans-serif",',
    '  background: "var(--oh-text-strong)",\n  border: "0",\n  borderRadius: "var(--oh-r-flat)",\n  color: "var(--oh-on-accent)",\n  cursor: "pointer",\n  font: "700 0.82rem var(--oh-font-label), system-ui, sans-serif",\n  letterSpacing: "var(--oh-label-track)",\n  textTransform: "uppercase",'],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres] of EDITS) {
  const chemin = path.resolve(fichier);
  const source = fs.readFileSync(chemin, "utf8");
  const n = source.split(avant).length - 1;
  if (n !== 1) { console.error(`${n === 0 ? "ABSENT" : "AMBIGU"}  ${fichier} (${n}) :: ${avant.slice(0, 70)}`); echecs++; continue; }
  fs.writeFileSync(chemin, source.replace(avant, apres));
  touches.add(fichier);
}
console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements dans ${touches.size} fichier(s).`);
if (echecs) process.exit(1);
