// Douzième passe : ce que la règle de test ne voyait pas.
//
// Le test des chaînes anglaises attrape une liste de mots-boutons — Cancel,
// Close, Save, Settings. Il ne voit pas une PHRASE anglaise. Un balayage des
// nœuds de texte JSX, cherchant trois mots-outils anglais distincts dans une
// même phrase, en a trouvé — dont plusieurs sur la une elle-même, à l'endroit
// où le joueur regarde en premier.
//
// Ce que cette passe traite : les phrases du cahier des Caisses de la une, le
// bloc des rassemblements, l'avis d'édition interrompue, l'écran de plantage,
// la fondation d'un organisme.
//
// Ce qu'elle NE traite pas : le panneau des Réglages, qui est un écran entier
// et mérite sa propre passe ; les tables `en` de FirstRunKey et welcomeText,
// qui sont l'anglais légitime d'une table par langue.

import fs from "node:fs";
import path from "node:path";

const B = "src/Game/GameUI/bulletin.jsx";
const O = "src/Game/GameUI/organizationsView.jsx";
const E = "src/runtime/ErrorBoundary.jsx";
const C = "src/Game/Selection/CountryPanel.jsx";

const EDITS = [
  // ── La une : l'édition interrompue ───────────────────────────────────────
  [B,
    "            The edition was stopped. Orders the engine had already carried out stand — gatherings convoked, money moved, promises taken on — and this sheet has been re-read to show them. Read the record before ordering the same thing a second time.",
    "            L'édition a été interrompue. Les ordres que le moteur avait déjà exécutés tiennent — rassemblements convoqués, argent déplacé, promesses engagées — et cette feuille a été relue pour les montrer. Lisez le registre avant d'ordonner deux fois la même chose."],

  // ── La une : le cahier des caisses ───────────────────────────────────────
  [B,
    "                One contributor is carrying it. That is a dependence on a single purse, not a claim on what you own — it ends when others actually pledge.",
    "                Un seul contributeur la porte. C'est une dépendance à une seule bourse, pas une créance sur ce que vous possédez — elle cesse le jour où d'autres promettent vraiment."],
  [B,
    "                This money is cash, not capital: it earns nothing until it is placed or spent.",
    "                Cet argent est de la trésorerie, pas du capital : il ne rapporte rien tant qu'il n'est ni placé ni dépensé."],
  [B,
    "                This capital is placed nowhere and earns nothing.",
    "                Ce capital n'est placé nulle part et ne rapporte rien."],

  // ── La une : les rassemblements ──────────────────────────────────────────
  [B,
    '{g.status === "held" ? "held" : "planned"}</span>',
    '{g.status === "held" ? "tenu" : "prévu"}</span>'],
  [B,
    '<div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>came</div>',
    '<div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>venus</div>'],
  [B,
    '<div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>taken · {money(g.cost)} cost</div>',
    '<div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>recettes · {money(g.cost)} de frais</div>'],
  [B,
    '<div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{g.surplus < 0 ? "lost" : "left"} to {g.host}</div>',
    '<div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{g.surplus < 0 ? "perdus par" : "restés à"} {g.host}</div>'],
  [B,
    '                budgeted {money(g.cost)}{g.expected > 0 ? `, hoping for ${fmtCount(g.expected)}` : ", and the engine will say how many come"}. It earns nothing until the day arrives.',
    '                {money(g.cost)} budgétés{g.expected > 0 ? `, en espérant ${fmtCount(g.expected)} personnes` : ", et le moteur dira combien viennent"}. Rien n\'est encaissé tant que le jour n\'est pas venu.'],

  // ── L'écran de plantage ──────────────────────────────────────────────────
  // Il se lit sans modèle, sans clé et sans traducteur : c'est précisément
  // l'écran qui paraît quand plus rien ne marche.
  [E, "          <div style={styles.title}>Something went wrong</div>", "          <div style={styles.title}>Quelque chose s'est mal passé</div>"],
  [E,
    "            The world view hit an unexpected error and had to stop. Your saved games\n            are safe — reloading usually recovers.",
    "            L'affichage du monde a rencontré une erreur imprévue et a dû s'arrêter. Vos\n            parties sont saines et sauves — recharger suffit presque toujours."],
  [E, "            Reload\n", "            Recharger\n"],

  // ── Fonder un organisme ──────────────────────────────────────────────────
  [O,
    'placeholder="Name it, say what it is for (alliance, trade bloc, monetary union, council...), whom you invite, where it sits and how it votes."',
    'placeholder="Nommez-le, dites à quoi il sert (alliance, union, conseil, commission…), qui vous y invitez, où il siège et comment il vote."'],
  [O,
    '`${playerCountry} convenes the founding of a new international body and invites the named polities to sign its charter: ${draft.trim()}`)}>Convene</button>',
    '`${playerCountry} convoque la fondation d\'un nouvel organisme et invite les puissances nommées à en signer la charte : ${draft.trim()}`)}>Convoquer</button>'],
  [O,
    'act("Found an international organization",',
    'act("Fonder un organisme international",'],
  [O,
    "        Each move is queued as an action for your next turn; the other members answer in character — admission can be refused and a resolution voted down.",
    "        Chaque geste est versé au dossier comme un ordre pour le tour suivant ; les autres membres répondent dans leur propre voix — une admission peut être refusée, une résolution rejetée."],

  // ── Les organismes : le reste des gestes ─────────────────────────────────
  [O, '<button style={button(true)} onClick={() => onTalk(o.name)}>💬 Talk to {o.name}</button>',
      '<button style={button(true)} onClick={() => onTalk(o.name)}>💬 Écrire à {o.name}</button>'],
  [O, '<button style={button(false)} onClick={() => setComposer({ orgName: o.name, mode: "propose" })}>Propose a resolution</button>',
      '<button style={button(false)} onClick={() => setComposer({ orgName: o.name, mode: "propose" })}>Proposer une résolution</button>'],
  [O, '`${playerCountry} formally withdraws from ${o.name}, notifying its members and the seat at ${o.seat || "its headquarters"}.`)}>Leave</button>',
      '`${playerCountry} se retire formellement de ${o.name}, en avisant ses membres et le siège de ${o.seat || "son secrétariat"}.`)}>Se retirer</button>'],
  [O, 'act(`Leave ${o.name}`,', 'act(`Se retirer de ${o.name}`,'],
  [O, '`${playerCountry} formally applies for membership of ${o.name}, accepting its charter${o.charter ? ` (${o.charter})` : ""}; the members are to vote on admission under the body\'s ${o.votingRule} rule.`)}>Apply to join</button>',
      '`${playerCountry} demande formellement son admission à ${o.name} et en accepte la charte${o.charter ? ` (${o.charter})` : ""} ; les membres votent l\'admission selon la règle « ${o.votingRule} » de l\'organisme.`)}>Demander l\'admission</button>'],
  [O, 'act(`Apply to join ${o.name}`,', 'act(`Demander l\'admission à ${o.name}`,'],
  [O, 'placeholder="What the resolution says, and what you want the members to vote on."',
      'placeholder="Ce que dit la résolution, et ce sur quoi vous voulez faire voter les membres."'],
  [O, '`${playerCountry} tables the following resolution at ${o.name} and calls a vote under its ${o.votingRule} rule: ${draft.trim()}`)}>Table it</button>',
      '`${playerCountry} dépose la résolution suivante devant ${o.name} et en appelle au vote selon sa règle « ${o.votingRule} » : ${draft.trim()}`)}>Déposer</button>'],
  [O, 'act(`Resolution at ${o.name}`,', 'act(`Résolution devant ${o.name}`,'],

  // ── L'écran sans WebGL ───────────────────────────────────────────────────
  // Il paraît AVANT tout le reste, quand la carte ne peut pas s'afficher : ni
  // modèle, ni traducteur, ni rien. Comme l'écran de plantage.
  ["src/Game/GameUI/main.jsx", "        WebGL Not Available", "        WebGL indisponible"],
  ["src/Game/GameUI/main.jsx",
   "        This application requires <strong style={{ color: \"var(--oh-text)\" }}>WebGL</strong> to render\n        the map, but it doesn't appear to be supported or enabled in your browser.",
   "        Ce jeu a besoin de <strong style={{ color: \"var(--oh-text)\" }}>WebGL</strong> pour dessiner la\n        carte, et votre navigateur ne semble ni le gérer ni l'avoir activé."],
  ["src/Game/GameUI/main.jsx",
   "        Try enabling hardware acceleration in your browser settings, updating your graphics\n        drivers, or switching to a WebGL-supported browser such as Chrome or Firefox.",
   "        Essayez d'activer l'accélération matérielle dans les réglages du navigateur, de mettre à\n        jour vos pilotes graphiques, ou de passer à un navigateur qui gère WebGL (Chrome, Firefox)."],

  // ── L'infobulle d'un pays ────────────────────────────────────────────────
  [C,
    'title="What this country is — the map-maker set this, and the AI reads it as context"',
    'title="Ce qu\'est ce pays — posé par l\'auteur de la carte, et lu par le modèle comme contexte"'],
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
