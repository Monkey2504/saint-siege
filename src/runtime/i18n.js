/*! Open Historia — language setting & top-50 language catalog © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// UI language: chosen in Settings, stored on the SERVER (shared by every
// device that plays through it — desktop browser and the Android app see the
// same choice) and mirrored in localStorage so boot doesn't wait on a fetch.
// La langue par défaut est celle dans laquelle le jeu est ÉCRIT : aucune
// traduction n'a lieu quand le joueur la lit.
const STORAGE_KEY = "ui_language";

/**
 * Le français, et c'est le cœur d'un défaut qui a duré une journée entière.
 *
 * Cette constante disait « en ». Elle ne dit pas quelle langue on préfère :
 * elle dit dans quelle langue le jeu est écrit — et cette édition est écrite en
 * français, en dur, depuis que `runtime/designTokens.test.js` l'exige (« les
 * chaînes d'interface sont FRANÇAISES dans la source ; cette règle demandait
 * l'inverse, et elle avait tort »).
 *
 * Ce que « en » produisait : un joueur qui n'a jamais ouvert les Réglages n'a
 * rien de stocké, `getStoredLanguage()` rendait donc « en », et
 * `chatLanguageDirective()` — qui force la consigne, même pour l'anglais —
 * collait À LA FIN de chaque invite de chat, la position la plus forte :
 *
 *     « LANGUAGE: The player reads English (en). Write ALL natural-language
 *       text in English… Reply in English regardless of the language of
 *       earlier messages. »
 *
 * Le jeu demandait donc explicitement l'anglais au modèle, par-dessus le bloc
 * [Langue] français posé ailleurs. Un cardinal répondait « Most Holy Father,
 * while material provisions are governed by the Providence that feeds the
 * birds… » à un pape qui écrivait en français, dans une interface entièrement
 * française. Quatre passes de francisation n'y pouvaient rien : elles
 * traduisaient l'écran, pendant qu'une ligne disait au modèle le contraire.
 *
 * En français, `languageDirective("fr")` rend maintenant une chaîne vide pour
 * les tâches ordinaires — rien à demander, le jeu est déjà dans cette langue —
 * et le chat, qui force, épingle le français au lieu de l'anglais. Un joueur
 * qui choisit l'anglais dans les Réglages passe alors par le traducteur : c'est
 * l'autre langue qui se dégrade, et non la sienne.
 */
export const DEFAULT_LANGUAGE = "fr";

// What the advisor and diplomatic chats reply in, so the interface can be read
// in one language and the chats held in another. Defaults to the UI language —
// an unset value follows it — and a player can pick a different chat language.
// Device-local: it only steers prompts.
const CHAT_STORAGE_KEY = "ai_chat_language";

// The 50 most spoken languages, hand-curated: recognizable English name
// first, endonym after. A full ISO dump read like random letters here.
export const LANGUAGES = [
  { code: "en", name: "English", native: "English" },
  { code: "zh", name: "Chinese (Mandarin)", native: "中文" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "ar", name: "Arabic", native: "العربية" },
  { code: "bn", name: "Bengali", native: "বাংলা" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "ur", name: "Urdu", native: "اردو" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "sw", name: "Swahili", native: "Kiswahili" },
  { code: "mr", name: "Marathi", native: "मराठी" },
  { code: "te", name: "Telugu", native: "తెలుగు" },
  { code: "tr", name: "Turkish", native: "Türkçe" },
  { code: "ta", name: "Tamil", native: "தமிழ்" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt" },
  { code: "ko", name: "Korean", native: "한국어" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "th", name: "Thai", native: "ไทย" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ" },
  { code: "fa", name: "Persian", native: "فارسی" },
  { code: "pl", name: "Polish", native: "Polski" },
  { code: "uk", name: "Ukrainian", native: "Українська" },
  { code: "ml", name: "Malayalam", native: "മലയാളം" },
  { code: "my", name: "Burmese", native: "မြန်မာ" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ" },
  { code: "ro", name: "Romanian", native: "Română" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
  { code: "el", name: "Greek", native: "Ελληνικά" },
  { code: "cs", name: "Czech", native: "Čeština" },
  { code: "hu", name: "Hungarian", native: "Magyar" },
  { code: "sv", name: "Swedish", native: "Svenska" },
  { code: "he", name: "Hebrew", native: "עברית" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu" },
  { code: "fil", name: "Filipino", native: "Filipino" },
  { code: "am", name: "Amharic", native: "አማርኛ" },
  { code: "ne", name: "Nepali", native: "नेपाली" },
  { code: "si", name: "Sinhala", native: "සිංහල" },
  { code: "km", name: "Khmer", native: "ខ្មែរ" },
  { code: "so", name: "Somali", native: "Soomaali" },
  { code: "az", name: "Azerbaijani", native: "Azərbaycanca" },
  { code: "uz", name: "Uzbek", native: "Oʻzbekcha" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "fi", name: "Finnish", native: "Suomi" },
  { code: "da", name: "Danish", native: "Dansk" },
];

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur"]);

export const getLanguageOptions = () => LANGUAGES;

export const languageDisplayName = (code) =>
  LANGUAGES.find((entry) => entry.code === code)?.name || code;

export const getStoredLanguage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && stored.trim() ? stored.trim() : DEFAULT_LANGUAGE;
  } catch {
    return DEFAULT_LANGUAGE;
  }
};

/**
 * La langue à parler à quelqu'un qui n'en a jamais choisi : celle du jeu.
 *
 * Elle décide des trois écrans qui paraissent AVANT tout choix — la porte
 * d'entrée, l'écran des clés, le bandeau de panne. Aucun des trois ne peut
 * passer par le traducteur (il n'y a pas encore de clé, ou le modèle est
 * précisément ce qui est injoignable), d'où leurs tables écrites à la main.
 *
 * Cette fonction lisait la langue du NAVIGATEUR à défaut de choix. C'était juste
 * du temps où l'interface était écrite en anglais : le navigateur était alors le
 * seul indice qu'un joueur français existait. Depuis que tout le jeu est écrit
 * en français, l'indice s'est retourné contre lui — sur un navigateur réglé en
 * anglais, et c'est le cas de la plupart, le tout premier écran du jeu
 * s'affichait en anglais devant une interface entièrement française. Mesuré :
 * l'écran des clés rendait « One thing before you begin » là où tout le reste
 * de la page disait « N° 1 · AN 1 DU PONTIFICAT ».
 *
 * Le choix du joueur l'emporte toujours ; à défaut, c'est la langue du jeu. Le
 * navigateur ne décide plus de rien : il ne sait pas dans quelle langue ce jeu
 * est écrit, et les tables par langue servent celui qui a CHOISI la sienne.
 */
export const preferredLanguage = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && stored.trim()) return stored.trim();
  } catch {
    // Pas de stockage : la langue du jeu, comme pour un joueur qui n'a rien choisi.
  }
  return DEFAULT_LANGUAGE;
};

const writeLocalLanguage = (code) => {
  try {
    if (!code || code === DEFAULT_LANGUAGE) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, code);
    }
  } catch {
    // Private-mode storage failures just leave the game in English.
  }
};

// Persist locally AND on the server, so the choice follows the player to
// every device connected to this server (the Android app included).
export const setStoredLanguage = async (code) => {
  writeLocalLanguage(code);
  try {
    await fetch("/api/ui-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language: code || DEFAULT_LANGUAGE }),
    });
  } catch {
    // Offline/hub-hosted: the local copy still applies on this device.
  }
};

// Boot-time reconcile: the server's choice wins. Returns true when the local
// value changed (caller reloads so the translator restarts cleanly).
export const syncLanguageFromServer = async () => {
  try {
    const response = await fetch("/api/ui-settings");
    if (!response.ok) {
      return false;
    }

    const settings = await response.json();
    const serverLanguage = typeof settings?.language === "string" && settings.language.trim()
      ? settings.language.trim()
      : DEFAULT_LANGUAGE;

    if (serverLanguage !== getStoredLanguage()) {
      writeLocalLanguage(serverLanguage);
      return true;
    }
  } catch {
    // Server unreachable: keep the local value.
  }

  return false;
};

export const getStoredChatLanguage = () => {
  try {
    const stored = localStorage.getItem(CHAT_STORAGE_KEY);
    // No explicit choice ⇒ follow the UI language.
    return stored && stored.trim() ? stored.trim() : getStoredLanguage();
  } catch {
    return getStoredLanguage();
  }
};

export const setStoredChatLanguage = (code) => {
  try {
    if (!code) {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } else {
      localStorage.setItem(CHAT_STORAGE_KEY, code);
    }
  } catch {
    // Private-mode storage failures just leave the chats on the UI language.
  }
};

// getStoredChatLanguage already falls back to the UI language when unset, so
// this is just the stored (or inherited) code — no "auto" sentinel any more.
export const resolveChatLanguage = () => getStoredChatLanguage();

export const chatLanguageDiffersFromUi = () => resolveChatLanguage() !== getStoredLanguage();

export const isRtlLanguage = (code) => RTL_LANGUAGES.has(code);

// Appended to every AI system prompt (see callAI) so replies arrive in the
// player's language natively instead of being machine-translated after.
export const languageDirective = (code = getStoredLanguage(), { force = false } = {}) => {
  if (code === DEFAULT_LANGUAGE && !force) {
    return "";
  }

  const name = languageDisplayName(code);
  return (
    `LANGUAGE: The player reads ${name} (${code}). ` +
    `Write ALL natural-language text in ${name} — prose replies, titles, descriptions, summaries, and suggestions. ` +
    `If the response must be JSON, keep the JSON structure, keys, ISO codes, and date formats exactly as specified, ` +
    `but write every human-readable string value in ${name}.`
  );
};

// A chat ALWAYS pins its language — force: true, even for English. English is
// unstated elsewhere (it is the authored default), but a chat is different: the
// player is conversing with a specific counterpart, and when that counterpart is
// e.g. China — or the scenario is thick with non-English context — the model
// drifts into that language with nothing to pull it back, so an English player
// gets Chinese replies. Forcing the directive (plus the "regardless of earlier
// messages" clause, which also stops a conversation drifting once one reply
// slips) makes the chat-language setting actually hold, English included.
export const chatLanguageDirective = () => {
  const code = resolveChatLanguage();
  const directive = languageDirective(code, { force: true });
  if (!directive) {
    return "";
  }

  return `${directive} Reply in ${languageDisplayName(code)} regardless of the language of earlier messages.`;
};
