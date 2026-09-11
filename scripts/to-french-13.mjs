// Treizième passe : les Réglages, de bout en bout.
//
// « J'ai dû répondre des milliards de fois, je veux TOUT en français. » Il a
// raison, et j'avais encore mis cinq écrans de côté en lui reposant la question.
//
// Les Réglages sont l'écran qu'il ouvre le plus : c'est là que se colle la clé.
// Tout y passe — étiquettes, indications, espaces réservés, infobulles, titres
// de sections et les deux longues explications.
//
// Ce qui NE bouge pas : les identifiants de modèles (gemini-3.5-flash-lite,
// claude-haiku-4-5), les noms de protocoles et de produits (OpenAI, Ollama,
// vLLM, Azure), les adresses d'exemple, et « JSON » — ce sont des clés que le
// joueur doit recopier telles quelles, pas de la langue.

import fs from "node:fs";
import path from "node:path";

const S = "src/Game/GameUI/settings.jsx";

const EDITS = [
  // ── Les langues ──────────────────────────────────────────────────────────
  [S, 'placeholder="Search languages..."', 'placeholder="Chercher une langue…"'],
  [S, '<LanguagePicker label="UI language" current={current} onSelect={applyLanguage} saving={saving} />',
      '<LanguagePicker label="Langue de l\'interface" current={current} onSelect={applyLanguage} saving={saving} />'],
  [S, 'label="AI chat language"', 'label="Langue des réponses du modèle"'],
  [S, 'helperText="What the advisor and diplomatic chats reply in. Defaults to your interface language."',
      'helperText="La langue dans laquelle répondent le conseiller et vos correspondants. Par défaut, celle de l\'interface."'],

  // ── Le fournisseur ───────────────────────────────────────────────────────
  [S, "        AI Provider\n", "        Fournisseur du modèle\n"],
  [S, "        Searchable catalog instead of a wall of provider buttons.",
      "        Un catalogue qui se cherche, plutôt qu'un mur de boutons."],
  [S, 'placeholder="Search provider, protocol or gateway..."', 'placeholder="Chercher un fournisseur, un protocole, une passerelle…"'],
  [S, "                Nothing matched the search.", "                Rien ne correspond à cette recherche."],

  // ── Les clés, les modèles, les paramètres ────────────────────────────────
  [S, 'label="Gemini API Key"', 'label="Clé Gemini"'],
  [S, 'placeholder="Paste Gemini API key"', 'placeholder="Collez votre clé Gemini"'],
  [S, 'label="OpenAI API Key"', 'label="Clé OpenAI"'],
  [S, 'placeholder="Paste OpenAI API key"', 'placeholder="Collez votre clé OpenAI"'],
  [S, 'label="Anthropic API Key"', 'label="Clé Anthropic"'],
  [S, 'placeholder="Paste Anthropic API key"', 'placeholder="Collez votre clé Anthropic"'],
  [S, 'helperText="Stored only in this browser."', 'helperText="Gardée sur cet appareil seulement."'],
  [S, 'label="Model"', 'label="Modèle"'],
  [S, 'helperText="Leave blank to use the built-in Gemini default."', 'helperText="Laissez vide pour le modèle Gemini par défaut."'],
  [S, 'helperText="Claude model ids are manual here. Leave blank to use the built-in default."',
      'helperText="Les identifiants de modèles Claude se saisissent à la main. Laissez vide pour celui par défaut."'],
  [S, 'helperText="Leave blank to auto-pick a model from /models."', 'helperText="Laissez vide pour qu\'un modèle soit choisi dans /models."'],
  [S, 'helperText="The model id your proxy expects. Leave blank to use the built-in default."',
      'helperText="L\'identifiant de modèle qu\'attend votre relais. Laissez vide pour celui par défaut."'],
  [S, 'label="Custom parameters (JSON)"', 'label="Paramètres personnalisés (JSON)"'],
  [S, 'helperText="Optional. Merged into the request body — e.g. to limit reasoning budget/effort. Invalid JSON is ignored."',
      'helperText="Facultatif. Fondu dans le corps de la requête — par exemple pour borner le budget de réflexion. Un JSON invalide est ignoré."'],

  // ── Les adresses ─────────────────────────────────────────────────────────
  [S, 'label="API Endpoint"', 'label="Adresse de l\'API"'],
  [S, 'label="API Key (optional)"', 'label="Clé (facultative)"'],
  [S, 'placeholder="Leave empty for local Ollama"', 'placeholder="Laissez vide pour un Ollama local"'],
  [S, 'helperText="Use a bearer token if your gateway requires authentication."',
      'helperText="Mettez un jeton si votre passerelle demande une authentification."'],
  [S, 'placeholder="Sent as x-api-key if set"', 'placeholder="Envoyée comme x-api-key si renseignée"'],
  [S, 'helperText="Leave empty if your proxy doesn\'t require a key."', 'helperText="Laissez vide si votre relais n\'en demande pas."'],
  [S, 'helperText="Base URL of a self-hosted proxy that speaks the Anthropic Messages API (POST /messages). Routed through the game server to avoid CORS."',
      'helperText="L\'adresse de base d\'un relais que vous hébergez et qui parle l\'API Anthropic Messages (POST /messages). Passe par le serveur du jeu, pour éviter CORS."'],

  // ── Le schéma strict, la réflexion ───────────────────────────────────────
  [S, 'label="Strict tool schema"', 'label="Schéma d\'outil strict"'],
  [S, "            Sends strict:true with the tool call so a self-hosted backend constrains\n            generation to the schema (SGLang/xgrammar, vLLM). Stops malformed or\n            mistyped tool arguments. Leave off for OpenAI and Azure: they reject a\n            schema that does not list every property as required.",
      "            Envoie strict:true avec l'appel d'outil, pour qu'un serveur que vous hébergez\n            contraigne la génération au schéma (SGLang/xgrammar, vLLM). Supprime les\n            arguments mal formés. Laissez éteint pour OpenAI et Azure : ils refusent un\n            schéma qui ne déclare pas toutes ses propriétés comme obligatoires."],
  [S, 'label="Model reasoning"', 'label="Réflexion du modèle"'],
  [S, "        Lets thinking-capable models reason before answering (Gemini thinking, OpenAI\n        reasoning effort, Claude extended thinking). Slower and costs more tokens;\n        needs a model that supports it.",
      "        Laisse réfléchir les modèles qui en sont capables avant qu'ils répondent (Gemini\n        thinking, OpenAI reasoning effort, Claude extended thinking). Plus lent et plus\n        coûteux en jetons ; demande un modèle qui le gère."],

  // ── Les réglages de partie ───────────────────────────────────────────────
  [S, "        Game Settings\n", "        Réglages de la partie\n"],
  [S, "        Very Experimental\n", "        Très expérimental\n"],
  [S, '<Toggle label="Fullscreen" enabled={isFullscreenEnabled} onToggle={onToggleFullscreen} />',
      '<Toggle label="Plein écran" enabled={isFullscreenEnabled} onToggle={onToggleFullscreen} />'],
  [S, 'label="Hide country labels"', 'label="Masquer les noms de pays"'],
  [S, 'label="Reduce motion"', 'label="Réduire les animations"'],
  [S, 'label="Disable idle globe rotation"', 'label="Arrêter la rotation du globe au repos"'],
  [S, 'label="Disable camera movement during events"', 'label="Figer la caméra pendant les événements"'],
  [S, 'label="Limit AI generation"', 'label="Borner le temps de génération"'],
  [S, "        On: time skips give the model 5 minutes, then fall back to canned events. Off (default): generation waits as long as the model needs. Cancel works either way.",
      "        Activé : un saut de temps laisse cinq minutes au modèle, puis retombe sur des événements tout faits. Éteint (par défaut) : la génération attend le temps qu'il faut. Annuler fonctionne dans les deux cas."],

  // ── Les liens, et le banc d'essai ────────────────────────────────────────
  [S, 'title="Join our Discord"', 'title="Rejoindre le Discord"'],
  [S, 'title="Join the subreddit"', 'title="Rejoindre le subreddit"'],
  [S, 'title="View on GitHub"', 'title="Voir sur GitHub"'],
  [S, "            🧪 Cheats\n", "            🧪 Banc d'essai\n"],
];

let echecs = 0;
const touches = new Set();
for (const [fichier, avant, apres] of EDITS) {
  const chemin = path.resolve(fichier);
  const source = fs.readFileSync(chemin, "utf8");
  const n = source.split(avant).length - 1;
  if (n === 0) { console.error(`ABSENT  ${fichier} :: ${avant.slice(0, 70)}`); echecs++; continue; }
  // Une étiquette comme « Model » ou « Stored only in this browser. » revient
  // pour chaque fournisseur : on remplace TOUTES ses occurrences, à dessein.
  fs.writeFileSync(chemin, source.split(avant).join(apres));
  touches.add(fichier);
}
console.log(`${EDITS.length - echecs}/${EDITS.length} remplacements dans ${touches.size} fichier(s).`);
if (echecs) process.exit(1);
