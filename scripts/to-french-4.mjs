// Quatrième passe de francisation : ce que les captures de design/rendu/ ont
// montré encore en anglais une fois le jeu ouvert — la bibliothèque, le choix
// de difficulté, l'en-tête du courrier, le collège, le conseiller, l'horloge.
//
// Même règle que les passes précédentes : traduire EN DUR, jamais via le
// traducteur d'exécution — il lui faut un modèle, et le joueur sans clé est
// justement celui qui lit l'écran.
//
// TABLE explicite, pas d'expression régulière : chaque paire est un fragment
// de ligne complet et unique ; une paire qui ne trouve rien est signalée.
//
// Ce qu'on ne traduit PAS : les `directive` de runtime/difficulty.js et les
// autres invites, qui sont l'entrée du modèle et non l'écran ; les `id` et
// clés, dont dépendent les parties déjà enregistrées.

import fs from "node:fs";
import path from "node:path";

const EDITS = [
  // ── Les niveaux de difficulté (l'écran qui suit « Nouvelle partie ») ──────
  ["src/runtime/difficulty.js", 'label: "Very Easy",', 'label: "Très facile",'],
  ["src/runtime/difficulty.js", 'blurb: "The world bends your way",', 'blurb: "Le monde plie dans votre sens",'],
  ["src/runtime/difficulty.js", 'label: "Easy",', 'label: "Facile",'],
  ["src/runtime/difficulty.js", 'blurb: "A forgiving world",', 'blurb: "Un monde indulgent",'],
  ["src/runtime/difficulty.js", 'label: "Medium",', 'label: "Moyen",'],
  ["src/runtime/difficulty.js", 'blurb: "Realistic and balanced",', 'blurb: "Réaliste et équilibré",'],
  ["src/runtime/difficulty.js", 'label: "Hard",', 'label: "Difficile",'],
  ["src/runtime/difficulty.js", 'blurb: "Rivals play to win",', 'blurb: "Les rivaux jouent pour gagner",'],
  ["src/runtime/difficulty.js", 'label: "Very Hard",', 'label: "Très difficile",'],
  ["src/runtime/difficulty.js", 'blurb: "A hostile world",', 'blurb: "Un monde hostile",'],
  ["src/runtime/difficulty.js", 'label: "Impossible",', 'label: "Impossible",'],
  ["src/runtime/difficulty.js", 'blurb: "Everything conspires against you",', 'blurb: "Tout conspire contre vous",'],

  // ── La bibliothèque ──────────────────────────────────────────────────────
  ["src/Game/GameUI/libraryBar.jsx", ">Choose your difficulty</div>", ">Choisissez la difficulté</div>"],
  ["src/Game/GameUI/libraryBar.jsx", "How hard should the world fight back?", "Avec quelle force le monde doit-il résister ?"],
  ["src/Game/GameUI/libraryBar.jsx", '{updateAvailable ? "⬆ Update" : "New Game"}', '{updateAvailable ? "⬆ Mettre à jour" : "Nouvelle partie"}'],
  ["src/Game/GameUI/libraryBar.jsx", '{active ? "Current Game" : game.eyebrow || "Game"}', '{active ? "Partie en cours" : game.eyebrow || "Partie"}'],
  ["src/Game/GameUI/libraryBar.jsx", '{active ? "Current" : "Play"}', '{active ? "En cours" : "Jouer"}'],
  ["src/Game/GameUI/libraryBar.jsx", '{game.archived ? "Unarchive" : "Archive"}', '{game.archived ? "Désarchiver" : "Archiver"}'],
  ["src/Game/GameUI/libraryBar.jsx", '{isMobile ? "⟳" : "Refresh"}', '{isMobile ? "⟳" : "Rafraîchir"}'],
  ["src/Game/GameUI/libraryBar.jsx", '{isMobile ? "⬆" : "Import JSON"}', '{isMobile ? "⬆" : "Importer du JSON"}'],
  ["src/Game/GameUI/libraryBar.jsx", '<MenuRow title="🕐 Last Played">', '<MenuRow title="🕐 Dernière jouée">'],
  ["src/Game/GameUI/libraryBar.jsx", '<MenuRow title="🔥 Most Played">', '<MenuRow title="🔥 Les plus jouées">'],
  ["src/Game/GameUI/libraryBar.jsx", '<MenuRow title="🔥 Most Played" emptyText="No scenarios yet.">', '<MenuRow title="🔥 Les plus joués" emptyText="Aucun scénario pour l\'instant.">'],
  ["src/Game/GameUI/libraryBar.jsx", '<MenuRow title="🕐 Last Updated" emptyText="No scenarios yet.">', '<MenuRow title="🕐 Mis à jour en dernier" emptyText="Aucun scénario pour l\'instant.">'],
  ["src/Game/GameUI/libraryBar.jsx", "                  Built-In", "                  Intégré"],
  ["src/Game/GameUI/libraryBar.jsx", "{scenario.gameCount} game{scenario.gameCount === 1 ? \"\" : \"s\"}", "{scenario.gameCount} partie{scenario.gameCount === 1 ? \"\" : \"s\"}"],
  ["src/Game/GameUI/libraryBar.jsx", '{game.country || "No player country"} / {game.currentDate || "No date"} / Round {game.round || 1}', '{game.country || "Aucun pays joueur"} / {game.currentDate || "Sans date"} / Tour {game.round || 1}'],
  ["src/Game/GameUI/libraryBar.jsx", "{game.pendingActions} pending action{game.pendingActions === 1 ? \"\" : \"s\"} / {game.eventCount} event{game.eventCount === 1 ? \"\" : \"s\"}", "{game.pendingActions} ordre{game.pendingActions === 1 ? \"\" : \"s\"} en attente / {game.eventCount} événement{game.eventCount === 1 ? \"\" : \"s\"}"],
  ["src/Game/GameUI/libraryBar.jsx", '"A newer version of this scenario is on the community hub. Updating replaces this copy (existing games keep working)."', '"Une version plus récente de ce scénario est sur le pôle communautaire. La mise à jour remplace cette copie (les parties existantes continuent de fonctionner)."'],

  // ── L'en-tête du courrier ────────────────────────────────────────────────
  ["src/Game/GameUI/actions.jsx",
    "<>Orders in the name of {countryDisplayName}, to take effect from {gameDate}. Each one is held to the budget, the reach of the apparatus, the schemes already running and the bodies that must vote, before the world answers it.</>",
    "<>Des ordres au nom du {countryDisplayName}, prenant effet au {gameDate}. Chacun est tenu au budget, à la portée de l'appareil, aux chantiers déjà lancés et aux corps qui doivent voter, avant que le monde y réponde.</>"],
  ["src/Game/GameUI/actions.jsx",
    "<>Submit actions for {countryDisplayName} for {gameDate}. Your actions will affect how the game world responds.</>",
    "<>Soumettez des ordres pour {countryDisplayName} au {gameDate}. Vos ordres décideront de la réponse du monde.</>"],

  // ── Le collège ───────────────────────────────────────────────────────────
  ["src/Game/GameUI/college.jsx", "think well of you ·{\" \"}", "vous sont acquis ·{\" \"}"],
  ["src/Game/GameUI/college.jsx", "<b style={{ color: \"var(--oh-text-dim)\" }}>{room.undecided}</b> undecided ·{\" \"}", "<b style={{ color: \"var(--oh-text-dim)\" }}>{room.undecided}</b> indécis ·{\" \"}"],
  ["src/Game/GameUI/college.jsx", "<b style={{ color: \"var(--oh-caution)\" }}>{room.against}</b> against", "<b style={{ color: \"var(--oh-caution)\" }}>{room.against}</b> contre"],
  ["src/Game/GameUI/college.jsx",
    "One mark, one elector. Nobody belongs to a party: the same hundred and sixty people regroup by doctrine, by region or by role, which is why a reform popular on one axis can fail on another.",
    "Une marque, un électeur. Personne n'appartient à un parti : les mêmes cent soixante personnes se regroupent par doctrine, par région ou par charge, et c'est pourquoi une réforme populaire sur un axe échoue sur un autre."],
  ["src/Game/GameUI/college.jsx",
    "Nobody in this room begins against you. Every opinion here was earned by what you actually did, and the figures behind it are the engine&apos;s own. A speech is worth what your standing is worth and reaches only those still listening; claims the ledger contradicts lose ground rather than winning it. The room is carried by governing well, and only steadied by speaking.",
    "Personne ici ne commence contre vous. Chaque opinion a été gagnée par ce que vous avez fait, et les chiffres qui la portent sont ceux du moteur. Un discours vaut ce que vaut votre crédit et n'atteint que ceux qui écoutent encore ; une affirmation que les comptes démentent fait perdre du terrain au lieu d'en gagner. La salle se gagne en gouvernant bien, et le discours ne fait que l'affermir."],
  ["src/Game/GameUI/college.jsx", "fontSize: \"var(--oh-t-xs)\", marginLeft: \"auto\" }}>Refresh</button>", "fontSize: \"var(--oh-t-xs)\", marginLeft: \"auto\" }}>Rafraîchir</button>"],

  // ── Le conseiller ────────────────────────────────────────────────────────
  ["src/Game/GameUI/advisor.jsx", "No messages yet. Ask your advisor something!", "Aucun message pour l'instant. Posez une question à votre conseiller."],

  // ── L'horloge et les ordres en attente ───────────────────────────────────
  ["src/Game/GameUI/time.jsx", '{orders.length === 0 ? "none queued"', '{orders.length === 0 ? "aucun en attente"'],
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
