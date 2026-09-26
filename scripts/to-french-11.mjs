// Onzième passe : les messages des fournisseurs, ceux que le bandeau recopie.
//
// « Raison rapportée: Gemini returned 429. The free-tier quota for this model is
// used up. » — au milieu d'un journal en français, sur sa une, dans un encadré
// rouge. Le bandeau de panne était déjà traduit à la main (runtime/outageNotice)
// pour la raison exacte qu'il doit se lire sans modèle ; mais la RAISON qu'il
// recopie sort de main.jsx, et elle, personne ne l'avait traduite.
//
// Ce que cette passe traite : toute phrase de main.jsx qu'un joueur peut lire —
// la clé qui manque, le modèle introuvable, l'endpoint absent, le fournisseur
// occupé, la réponse vide. Elles finissent toutes en `fallbackReason`, donc sur
// la une.
//
// Ce qu'elle NE traite pas : le diagnostic de quota, qui est un ajout et non une
// traduction (Game/AI/rateLimit.js, même commit).

import fs from "node:fs";
import path from "node:path";

const M = "src/Game/AI/main.jsx";

const EDITS = [
  // ── La clé et le modèle ──────────────────────────────────────────────────
  // « **settings** » est rendu en gras par l'affichage ; on garde le balisage.
  [M, 'throw new Error(`Go to **settings** and enter a model for ${providerLabel}.`);',
      'throw new Error(`Ouvrez les **réglages** et indiquez un modèle pour ${providerLabel}.`);'],
  [M, 'throw new Error(`Go to **settings** and enter an endpoint for ${providerLabel}.`);',
      'throw new Error(`Ouvrez les **réglages** et indiquez une adresse pour ${providerLabel}.`);'],
  [M, 'throw new Error(extractErrorMessage(payload, `Could not load models from ${providerLabel}.`));',
      'throw new Error(extractErrorMessage(payload, `Impossible de lire la liste des modèles de ${providerLabel}.`));'],
  [M, 'throw new Error(`No models were returned by ${providerLabel}.`);',
      'throw new Error(`${providerLabel} n\'a renvoyé aucun modèle.`);'],
  [M, 'throw new Error(`Could not auto-detect a model for ${providerLabel}. Enter a model manually in **settings**.`);',
      'throw new Error(`Aucun modèle n\'a pu être détecté pour ${providerLabel}. Indiquez-en un à la main dans les **réglages**.`);'],
  [M, 'throw new Error("Go to **settings** and paste your Gemini API key - you can get it at https://aistudio.google.com/app/apikey");',
      'throw new Error("Ouvrez les **réglages** et collez votre clé Gemini — elle s\'obtient sur https://aistudio.google.com/app/apikey");'],
  [M, 'throw new Error("Go to **settings** and paste your OpenAI API key.");',
      'throw new Error("Ouvrez les **réglages** et collez votre clé OpenAI.");'],
  [M, 'throw new Error("Go to **settings** and paste your Anthropic API key.");',
      'throw new Error("Ouvrez les **réglages** et collez votre clé Anthropic.");'],
  [M, 'throw new Error("Go to **settings**, select OpenAI Compatible, and enter your endpoint (for example http://localhost:11434/v1).");',
      'throw new Error("Ouvrez les **réglages**, choisissez « OpenAI Compatible », et indiquez votre adresse (par exemple http://localhost:11434/v1).");'],
  [M, 'throw new Error("Go to **settings**, select Anthropic Compatible, and enter your endpoint (a self-hosted Anthropic Messages API proxy).");',
      'throw new Error("Ouvrez les **réglages**, choisissez « Anthropic Compatible », et indiquez votre adresse (un relais Anthropic Messages hébergé par vous).");'],

  // ── La requête refusée, la réponse vide ──────────────────────────────────
  [M, 'throw new Error(extractErrorMessage(payload, `Gemini API request failed (${response.status})`));\n        }\n        const streamed = await streamTextSSE(response, geminiStreamDelta, onChunk);\n        if (!streamed) throw new Error("Gemini response did not contain text.");',
      'throw new Error(extractErrorMessage(payload, `Gemini a refusé la requête (${response.status}).`));\n        }\n        const streamed = await streamTextSSE(response, geminiStreamDelta, onChunk);\n        if (!streamed) throw new Error("La réponse de Gemini ne contenait aucun texte.");'],
  [M, 'throw new Error(extractErrorMessage(payload, `Gemini API request failed (${response.status})`));',
      'throw new Error(extractErrorMessage(payload, `Gemini a refusé la requête (${response.status}).`));'],
  [M, '            throw new Error("Gemini response did not contain text.");',
      '            throw new Error("La réponse de Gemini ne contenait aucun texte.");'],
  [M, 'throw new Error(`Gemini is temporarily unavailable after ${retries} attempts. Try again in a minute.`);',
      'throw new Error(`Gemini reste indisponible après ${retries} tentatives. Réessayez dans une minute.`);'],
  [M, 'throw new Error(extractErrorMessage(payload, `${providerLabel} is busy right now. Try again in a moment.`));',
      'throw new Error(extractErrorMessage(payload, `${providerLabel} est occupé pour l\'instant. Réessayez dans un moment.`));'],
  [M, 'throw new Error(extractErrorMessage(payload, `${providerLabel} request failed (${response.status})`));',
      'throw new Error(extractErrorMessage(payload, `${providerLabel} a refusé la requête (${response.status}).`));'],
  [M, 'if (!streamed) throw new Error(`${providerLabel} response did not contain text.`);',
      'if (!streamed) throw new Error(`La réponse de ${providerLabel} ne contenait aucun texte.`);'],
  [M, '            throw new Error(`${providerLabel} response did not contain text.`);',
      '            throw new Error(`La réponse de ${providerLabel} ne contenait aucun texte.`);'],
  [M, 'throw new Error(extractErrorMessage(payload, "Anthropic is busy right now. Try again in a moment."));',
      'throw new Error(extractErrorMessage(payload, "Anthropic est occupé pour l\'instant. Réessayez dans un moment."));'],
  [M, 'if (!streamed) throw new Error("Anthropic response did not contain text.");',
      'if (!streamed) throw new Error("La réponse d\'Anthropic ne contenait aucun texte.");'],
  [M, '            throw new Error("Anthropic response did not contain text.");',
      '            throw new Error("La réponse d\'Anthropic ne contenait aucun texte.");'],
  [M, 'throw new Error(extractErrorMessage(payload, "The Anthropic-compatible endpoint is busy right now. Try again in a moment."));',
      'throw new Error(extractErrorMessage(payload, "L\'adresse compatible Anthropic est occupée pour l\'instant. Réessayez dans un moment."));'],
  [M, 'if (!streamed) throw new Error("Anthropic-compatible response did not contain text.");',
      'if (!streamed) throw new Error("La réponse de l\'adresse compatible Anthropic ne contenait aucun texte.");'],
  [M, '            throw new Error("Anthropic-compatible response did not contain text.");',
      '            throw new Error("La réponse de l\'adresse compatible Anthropic ne contenait aucun texte.");'],
  [M, 'if (!parsed.reply.trim()) throw new Error(`${speakingAs} sent no reply this time.`);',
      'if (!parsed.reply.trim()) throw new Error(`${speakingAs} n\'a rien répondu cette fois-ci.`);'],

  // ── Le serveur local qui refuse le navigateur ────────────────────────────
  [M, '                `${origin} refused the browser\'s request. A local AI server has to allow this site\'s ` +\n                `origin before ${site} can use it: restart Ollama with OLLAMA_ORIGINS=${site} ` +\n                `(LM Studio: turn on CORS in its server settings), then try again. ` +\n                `The desktop app needs no such setup.`,',
      '                `${origin} a refusé la requête du navigateur. Un serveur d\'IA local doit autoriser ` +\n                `l\'origine de ce site avant que ${site} puisse s\'en servir : relancez Ollama avec ` +\n                `OLLAMA_ORIGINS=${site} (LM Studio : activez CORS dans les réglages de son serveur), ` +\n                `puis réessayez. L\'application de bureau n\'a besoin de rien de tel.`,'],
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
