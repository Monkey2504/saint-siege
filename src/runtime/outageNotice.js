/*! Open Historia — the one notice that must read without the AI © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */


// Every other interface string is authored in English and turned into the
// player's language by the runtime translator, which calls the model. That is
// the right trade everywhere except here.
//
// This notice exists to say the model could not be reached. Sending it through
// the translator makes the one message that reports the outage depend on the
// thing that is out: a French player read eight canned editions, then read an
// English banner explaining why, because the quota that killed the turns also
// killed its translation. So this text alone is hand-written per language, and
// falls back to English for a language nobody has written yet — still the
// behaviour of today, never worse.

const EN = {
  label: "Not a real edition",
  one: "This edition was written by the offline stub, not by the world.",
  many: (run, since) => `The last ${run} editions were written by the offline stub, not by the world${since ? `, starting ${since}` : ""}.`,
  consequence: (one) => `No order was judged, no money moved and no rival advanced in ${one ? "it" : "them"}. The engine's own steps still ran, so gatherings, budgets and returns below are real.`,
  reason: "Reported reason",
};

const NOTICES = Object.freeze({
  en: EN,
  fr: {
    label: "Ce n'est pas une vraie édition",
    one: "Cette édition a été écrite par le simulateur hors-ligne, pas par le monde.",
    many: (run, since) => `Les ${run} dernières éditions ont été écrites par le simulateur hors-ligne, pas par le monde${since ? `, depuis le ${since}` : ""}.`,
    consequence: () => "Aucun ordre n'y a été jugé, aucun argent n'a bougé, aucun rival n'y a avancé. Les pas du moteur, eux, ont bien tourné : les rassemblements, les budgets et les rendements ci-dessous sont réels.",
    reason: "Raison rapportée",
  },
  es: {
    label: "No es una edición real",
    one: "Esta edición la escribió el simulador sin conexión, no el mundo.",
    many: (run, since) => `Las últimas ${run} ediciones las escribió el simulador sin conexión, no el mundo${since ? `, desde el ${since}` : ""}.`,
    consequence: () => "No se juzgó ninguna orden, no se movió dinero y ningún rival avanzó. Los pasos del motor sí se ejecutaron: las concentraciones, los presupuestos y los rendimientos de abajo son reales.",
    reason: "Motivo informado",
  },
  de: {
    label: "Keine echte Ausgabe",
    one: "Diese Ausgabe schrieb der Offline-Ersatz, nicht die Welt.",
    many: (run, since) => `Die letzten ${run} Ausgaben schrieb der Offline-Ersatz, nicht die Welt${since ? `, seit dem ${since}` : ""}.`,
    consequence: () => "Kein Befehl wurde beurteilt, kein Geld bewegt, kein Rivale kam voran. Die Schritte der Engine liefen jedoch: Versammlungen, Budgets und Erträge unten sind echt.",
    reason: "Gemeldeter Grund",
  },
  it: {
    label: "Non è un'edizione vera",
    one: "Questa edizione l'ha scritta il simulatore offline, non il mondo.",
    many: (run, since) => `Le ultime ${run} edizioni le ha scritte il simulatore offline, non il mondo${since ? `, dal ${since}` : ""}.`,
    consequence: () => "Nessun ordine è stato giudicato, nessun denaro si è mosso, nessun rivale è avanzato. I passi del motore però sono stati eseguiti: raduni, bilanci e rendimenti qui sotto sono reali.",
    reason: "Motivo riportato",
  },
  pt: {
    label: "Não é uma edição real",
    one: "Esta edição foi escrita pelo simulador offline, não pelo mundo.",
    many: (run, since) => `As últimas ${run} edições foram escritas pelo simulador offline, não pelo mundo${since ? `, desde ${since}` : ""}.`,
    consequence: () => "Nenhuma ordem foi julgada, nenhum dinheiro se moveu e nenhum rival avançou. Os passos do motor correram: os ajuntamentos, os orçamentos e os rendimentos abaixo são reais.",
    reason: "Motivo relatado",
  },
});

export const OUTAGE_LANGUAGES = Object.keys(NOTICES);

/**
 * The banner's words in the player's language, without touching the network.
 * `run` is how many editions in a row came from the stub, `since` the already
 * formatted date the run began.
 */
export const outageNotice = (language, { run = 1, since = "" } = {}) => {
  // "fr-CA" and "FR" both mean the French table.
  const code = String(language ?? "").trim().toLowerCase().split(/[-_]/)[0];
  const words = NOTICES[code] ?? EN;
  const count = Math.max(1, Math.floor(Number(run) || 1));
  return {
    label: words.label,
    body: `${count === 1 ? words.one : words.many(count, String(since || ""))} ${words.consequence(count === 1)}`,
    reasonLabel: words.reason,
  };
};
