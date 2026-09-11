/*! Open Historia — how long a rate-limited provider asked us to wait © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// A 429 is not only an empty wallet. Providers return it for a per-minute limit
// too, and when they do they say how long to wait: "Please retry in 47.58s".
// callAI threw on every 429 instantly, so each turn that touched a rate limit
// was handed to the offline writer — a campaign read six canned editions in a
// row for a limit that cleared in under a minute.
//
// 0 means the provider named nothing worth waiting out, which is what a daily
// cap looks like: there is no point sleeping on a quota that resets tomorrow.

// No turn should hang for minutes on a limit that will still be there after.
export const RATE_LIMIT_MAX_WAIT_MS = 90_000;

// Google gives the delay in whatever unit suits it, and both turn up in the same
// campaign: "Please retry in 47.580052679s" one turn, "Please retry in
// 134.713145ms" the next. Reading only seconds threw the millisecond one away
// and lost a turn to the offline writer over a tenth of a second.
const UNITS = Object.freeze({ ms: 1, s: 1000, sec: 1000, secs: 1000, seconds: 1000, second: 1000, m: 60_000, min: 60_000, mins: 60_000, minutes: 60_000 });

export const retryDelayFromRateLimit = (details) => {
  const asked = /retry in\s+([\d.]+)\s*(ms|secs?|seconds?|s|mins?|minutes?|m)\b/i.exec(String(details ?? ""));
  if (!asked) return 0;
  const amount = Number(asked[1]);
  const unit = UNITS[asked[2].toLowerCase()];
  if (!Number.isFinite(amount) || amount <= 0 || !unit) return 0;
  // A second of slack, so we come back after the window rather than on its edge.
  return Math.min(RATE_LIMIT_MAX_WAIT_MS, Math.ceil(amount * unit) + 1_000);
};

// ── Quelle limite a sauté ────────────────────────────────────────────────────
//
// « Comment je peux parler et dire des bêtises si je n'ai plus d'API ? Je pense
// que le problème n'est pas là. » Il avait raison : le bandeau annonçait un
// quota gratuit épuisé pendant que les cardinaux répondaient encore. Les deux
// sont vrais en même temps, parce que Google ne compte pas une requête, il
// compte trois choses séparément — les requêtes par minute, les jetons par
// minute, les requêtes par jour — et une édition ne pèse pas une lettre. Une
// édition envoie le monde entier plus un schéma ; une lettre envoie un
// paragraphe. La minute peut refuser la première et accepter la seconde.
//
// Google nomme lui-même celle qui a sauté, dans `error.details[].violations[]`,
// sous une clé du genre « GenerateRequestsPerDayPerProjectPerModel-FreeTier ».
// Le message que le joueur lisait jetait cette clé et ne gardait que la phrase
// de facturation, qui accuse le portefeuille pour les trois cas.
const DIMENSIONS = Object.freeze([
  [/PerDay/i, "par jour", "Elle se rouvre à la remise à zéro quotidienne de Google (minuit, heure du Pacifique)."],
  [/InputToken|Token/i, "de jetons par minute", "Une édition envoie le monde entier : elle pèse à elle seule plusieurs fois une lettre. C'est pourquoi le courrier passe encore."],
  [/PerMinute/i, "par minute", "Elle se rouvre dans la minute qui suit."],
]);

/**
 * Ce que le fournisseur a refusé, en français, d'après sa propre comptabilité.
 * Rend une chaîne vide quand la charge utile ne nomme aucun quota : mieux vaut
 * ne rien affirmer que d'inventer laquelle des trois limites a sauté.
 */
export const diagnosticDeQuota = (payload) => {
  const details = Array.isArray(payload?.error?.details) ? payload.error.details : [];
  const violations = details.flatMap((d) => (Array.isArray(d?.violations) ? d.violations : []));
  const cle = violations.map((v) => String(v?.quotaId ?? v?.quota_id ?? "")).find(Boolean);
  if (!cle) return "";
  const gratuit = /free[_-]?tier/i.test(cle);
  const trouve = DIMENSIONS.find(([motif]) => motif.test(cle));
  if (!trouve) return "";
  const [, quoi, quand] = trouve;
  const plafond = violations.map((v) => String(v?.quotaValue ?? v?.quota_value ?? "")).find(Boolean);
  return [
    `La limite ${quoi}${gratuit ? " du palier gratuit" : ""} de ce modèle est atteinte${plafond ? ` (${plafond})` : ""}.`,
    "Votre clé fonctionne : c'est le compteur qui est plein, pas la clé.",
    quand,
  ].join(" ");
};
