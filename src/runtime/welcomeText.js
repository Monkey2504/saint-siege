/*! Open Historia — the words on the front door © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The welcome screen is shown BEFORE the API key is asked for, and the runtime
// translator needs a model to translate anything. So the one screen a new player
// sees first would be the one screen stuck in a language they may not read —
// the same trap the outage banner fell into (runtime/outageNotice.js), where a
// French player was told in English why the game had stopped thinking.
//
// So these words are written per language and never machine-translated. There
// are only four of them; every other string in the interface still goes through
// the translator, as it should.

const EN = {
  eyebrow: "Open Historia",
  title: "Become the new pope",
  lead: "No army. No territory to conquer. Half a square kilometre, a billion and a half baptised, a Curia that will outlive you, and accounts that do not lie.",
  begin: "Begin",
  resume: "Continue where you left off",
  credit: "Photograph",
};

const TEXT = Object.freeze({
  en: EN,
  fr: {
    eyebrow: "Open Historia",
    title: "Devenez le nouveau pape",
    lead: "Pas d'armée. Pas de territoire à conquérir. Un demi-kilomètre carré, un milliard et demi de baptisés, une Curie qui vous survivra, et des comptes qui ne mentent pas.",
    begin: "Commencer",
    resume: "Reprendre votre partie",
    credit: "Photographie",
  },
  es: {
    eyebrow: "Open Historia",
    title: "Conviértase en el nuevo papa",
    lead: "Sin ejército. Sin territorio que conquistar. Medio kilómetro cuadrado, mil quinientos millones de bautizados, una Curia que le sobrevivirá y unas cuentas que no mienten.",
    begin: "Comenzar",
    resume: "Continuar la partida",
    credit: "Fotografía",
  },
  it: {
    eyebrow: "Open Historia",
    title: "Diventa il nuovo papa",
    lead: "Nessun esercito. Nessun territorio da conquistare. Mezzo chilometro quadrato, un miliardo e mezzo di battezzati, una Curia che ti sopravvivrà e conti che non mentono.",
    begin: "Inizia",
    resume: "Riprendi la partita",
    credit: "Fotografia",
  },
  de: {
    eyebrow: "Open Historia",
    title: "Werden Sie der neue Papst",
    lead: "Keine Armee. Kein Gebiet zu erobern. Ein halber Quadratkilometer, anderthalb Milliarden Getaufte, eine Kurie, die Sie überleben wird, und Zahlen, die nicht lügen.",
    begin: "Beginnen",
    resume: "Partie fortsetzen",
    credit: "Fotografie",
  },
  pt: {
    eyebrow: "Open Historia",
    title: "Torne-se o novo papa",
    lead: "Sem exército. Sem território a conquistar. Meio quilómetro quadrado, mil e quinhentos milhões de baptizados, uma Cúria que lhe sobreviverá e contas que não mentem.",
    begin: "Começar",
    resume: "Continuar a partida",
    credit: "Fotografia",
  },
});

export const WELCOME_LANGUAGES = Object.keys(TEXT);

/** The front door's words, in the player's language, without touching a model. */
export const welcomeText = (language) => {
  const code = String(language ?? "").trim().toLowerCase().split(/[-_]/)[0];
  return TEXT[code] ?? EN;
};
