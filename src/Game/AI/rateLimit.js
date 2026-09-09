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
