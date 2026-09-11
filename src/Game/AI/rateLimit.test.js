/*! Open Historia — rate-limit backoff tests © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import assert from "node:assert/strict";
import test from "node:test";

import { RATE_LIMIT_MAX_WAIT_MS, diagnosticDeQuota, retryDelayFromRateLimit } from "./rateLimit.js";

// Field report: a campaign read six canned editions in a row. Every one of them
// was a 429 that the code threw on instantly, while the provider's own message
// said how long to wait:
//
//   Quota exceeded for metric: generativelanguage.googleapis.com/
//   generate_content_free_tier_requests, limit: 500, model: gemini-3.5-flash-lite
//   Please retry in 47.580052679s.
test("a provider that names a wait is waited out, with a second of slack", () => {
  const google = "Quota exceeded for metric: generate_content_free_tier_requests, limit: 500."
    + " Please retry in 47.580052679s.";
  assert.equal(retryDelayFromRateLimit(google), 48_581, "wait what it asked for, plus a second");

  assert.equal(retryDelayFromRateLimit("please Retry In 2s"), 3_000, "case and spacing do not matter");

  // The same campaign, the very next turn: Google switched unit. Reading only
  // seconds threw this away and lost the turn over a tenth of a second.
  const milliseconds = "Quota exceeded for metric: generate_content_free_tier_requests, limit: 500,"
    + " model: gemini-3.5-flash-lite Please retry in 134.713145ms.";
  assert.equal(retryDelayFromRateLimit(milliseconds), 1_135, "milliseconds are a unit too");
  assert.equal(retryDelayFromRateLimit("Please retry in 2m"), 90_000, "minutes are read, then capped");
});

test("a limit that names no wait is not waited out, and no wait runs away", () => {
  assert.equal(retryDelayFromRateLimit("You exceeded your current quota."), 0, "a daily cap is not worth sleeping on");
  assert.equal(retryDelayFromRateLimit(""), 0);
  assert.equal(retryDelayFromRateLimit(null), 0);
  assert.equal(retryDelayFromRateLimit("Please retry in 0s"), 0, "a zero wait is no wait");
  assert.equal(retryDelayFromRateLimit("Please retry in 86400s"), RATE_LIMIT_MAX_WAIT_MS, "a day is capped, not slept");
});

// « Comment je peux parler et dire des bêtises si je n'ai plus API, je pense que
// le problème n'est pas là. » Le bandeau annonçait un quota gratuit épuisé
// pendant que les cardinaux répondaient. Les deux étaient vrais : ce n'est pas
// la même limite qui saute pour une édition et pour une lettre.
test("la limite qui a sauté est nommée, et une lettre qui passe n'est plus une contradiction", () => {
  const parJour = { error: { details: [{ violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier", quotaValue: "250" }] }] } };
  const jour = diagnosticDeQuota(parJour);
  assert.match(jour, /par jour/, "la dimension qui a sauté est nommée");
  assert.match(jour, /250/, "le plafond atteint est donné");
  assert.match(jour, /Votre clé fonctionne/, "on ne fait plus porter le chapeau à la clé");

  const parMinute = { error: { details: [{ violations: [{ quotaId: "GenerateContentInputTokensPerModelPerMinute-FreeTier" }] }] } };
  const minute = diagnosticDeQuota(parMinute);
  assert.match(minute, /jetons par minute/, "les jetons par minute ne sont pas lus comme un plafond journalier");
  assert.match(minute, /courrier/, "et le joueur apprend pourquoi ses lettres passent encore");

  // Sans comptabilité nommée, on n'invente rien : l'appelant garde ses propres mots.
  assert.equal(diagnosticDeQuota({ error: { message: "You exceeded your current quota." } }), "");
  assert.equal(diagnosticDeQuota(null), "");
});
