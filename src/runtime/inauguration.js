/*! Open Historia — the inauguration: a pope names himself and declares his programme © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The first thing a pope does is not advance time. He takes a name, and he tells
// the Church what he was elected to change. Both are state, not ceremony: the
// name is who the world addresses, and the declaration becomes the pope's own
// standing intent — the thing the reality check, the factions' schemes, the
// opening edition and the world's own reach all read. A game in church mode
// cannot run its first jump until this has happened.

import { HOLY_SEE } from "./churchPreset.js";
import { ensureRegisterBaseline } from "./register.js";

const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

export const INAUGURATION_INTENT_ID = "pope-reform";

/** Church mode: the world carries the faithful ledger the preset seeds. */
export const isChurchGame = (world) => Boolean(world && typeof world === "object" && world.church);

/** A church game whose pope has declared. Other games need no inauguration. */
export const isInaugurated = (world) => {
  if (!isChurchGame(world)) return true;
  const intents = Array.isArray(world.intents) ? world.intents : [];
  return intents.some((it) => str(it?.id) === INAUGURATION_INTENT_ID && str(it?.summary));
};

/**
 * Apply the inauguration to a world: the name on the polity and its stat sheet,
 * the declaration as a standing, public, supportive intent of the Holy See, and
 * the declaration printed into the opening text. Pure: returns a new world.
 */
export const inaugurate = (world, { name, declaration }) => {
  const papalName = str(name);
  const programme = str(declaration);
  if (!papalName) throw new Error("A pope takes a name before anything else.");
  if (!programme) throw new Error("A pope tells the Church what he was elected to change.");

  const w = { ...(world && typeof world === "object" ? world : {}) };

  w.polityOverrides = { ...(w.polityOverrides ?? {}), [HOLY_SEE]: { ...(w.polityOverrides?.[HOLY_SEE] ?? {}), leader: papalName } };
  if (w.countryStats?.[HOLY_SEE]) w.countryStats = { ...w.countryStats, [HOLY_SEE]: { ...w.countryStats[HOLY_SEE], leader: papalName } };

  const others = (Array.isArray(w.intents) ? w.intents : []).filter((it) => str(it?.id) !== INAUGURATION_INTENT_ID);
  w.intents = [
    ...others,
    { id: INAUGURATION_INTENT_ID, ownerType: "polity", owner: HOLY_SEE, target: "", kind: "political", summary: programme, stage: 5, secret: false, stance: "supportive", scope: [], status: "active" },
  ];

  const line = `${papalName} a été élu sur ce programme : ${programme}`;
  const opening = str(w.startingTimelineText);
  w.startingTimelineText = opening.includes(line) ? opening : `${opening} ${line}`.trim();

  // A declaration is a bomb only if the world moves on it. Every hostile scheme
  // whose declared field the programme touches advances — its owners were
  // waiting for exactly this — and the world records that answers are due, so
  // the next edition is held to them (describeDeclarationReactions).
  const devant = reactionsToDeclaration({ ...w, intents: others }, programme);
  // Se met en mouvement le chantier dont le sujet déclaré est nommé : son
  // terrain est en jeu, et ses porteurs se mettent au travail. Pas parce qu'il
  // serait « hostile » — ce que la déclaration lui fait se juge sur la phrase,
  // et cela se joue dans l'édition, sous la plume du modèle, pas dans un
  // compteur. Les autres sont devant la déclaration sans bouger encore.
  const movers = new Set(devant.filter((r) => r.nomme).map((r) => r.id));
  w.intents = w.intents.map((it) => (movers.has(str(it?.id)) ? { ...it, stage: Math.min(100, Math.round(Number(it.stage) || 0) + REACTION_STAGE_BUMP) } : it));
  w.inauguration = {
    name: papalName, declaration: programme, answered: false,
    reactions: devant.map((r) => ({ owner: r.owner, stance: r.stance, hits: r.hits, nomme: r.nomme, poursuit: r.poursuit })),
  };

  // Day one of the pontificate is the day every later figure is measured from.
  return ensureRegisterBaseline(w, HOLY_SEE, { date: str(w.startDate || w.gameDate || "") });
};

// How far a scheme whose field the declaration touches moves on hearing it.
export const REACTION_STAGE_BUMP = 15;

const lower = (v) => str(v).toLowerCase();

/**
 * Which standing schemes the programme touches, and how they stand. A scheme
 * with declared scope keywords is touched when the programme names one of them;
 * a scheme with no scope opposes or supports everything and is always touched.
 * Read from the intents the world holds — the same data the reality check uses
 * to price opposition — never from prose.
 */
/**
 * Un mot de portée est cherché en DÉBUT de mot, jamais n'importe où dedans.
 *
 * `text.includes(k)` accrochait au milieu des mots : « Autriche » contient
 * « riche », « tricher » contient « rich ». Un pape qui parlait de l'Autriche
 * déclenchait l'appareil financier. La frontière de gauche seule est gardée —
 * les mots de portée sont des radicaux (« financ », « transparen »,
 * « investisse ») et doivent continuer d'attraper leurs déclinaisons.
 */
const DEBUT_DE_MOT = /[a-zà-öø-ÿ0-9]/i;
const nommeLeMot = (texte, mot) => {
  let i = texte.indexOf(mot);
  while (i !== -1) {
    if (i === 0 || !DEBUT_DE_MOT.test(texte[i - 1])) return true;
    i = texte.indexOf(mot, i + 1);
  }
  return false;
};

/**
 * Tout ce qui se tient debout dans ce monde, devant une déclaration.
 *
 * Ceci ne filtre plus. La version d'avant ne rendait qu'un chantier dont un mot
 * de portée était nommé — ou qui n'en déclarait aucun. Or les trois corps sans
 * portée du préréglage sont les trois corps d'exécution, et ils sont tous les
 * trois `supportive` : un pape qui déclarait « une Église pour les riches »
 * n'accrochait aucun mot, n'obtenait que ces trois-là, et lisait que tout le
 * monde était d'accord avec lui. Le joueur l'a écrit lui-même : « il faut que
 * l'IA lise ce qui a été écrit, sinon on tombe sur le truc où je dis que je
 * veux une Église des riches et tout le monde est d'accord. »
 *
 * Une liste de mots-clés ne lit pas une phrase. Le modèle, lui, la lit — et il
 * reçoit déjà la déclaration mot pour mot. On lui donne donc TOUTES les
 * puissances, avec ce que chacune surveille et la position qu'elle tenait
 * avant, et c'est lui qui décide qui parle et dans quel sens.
 *
 * `nomme` reste, et ne sert plus qu'à une chose : un chantier dont le sujet
 * déclaré est nommé se met en mouvement mécaniquement (inaugurate). Ce
 * changement d'état-là appartient au moteur, pas au récit.
 */
export const reactionsToDeclaration = (world, declaration) => {
  const text = lower(declaration);
  const intents = Array.isArray(world?.intents) ? world.intents : [];
  return intents
    .filter((it) => it && lower(it.status || "active") === "active" && str(it.id) !== INAUGURATION_INTENT_ID && lower(it.owner) !== lower(HOLY_SEE))
    .map((it) => {
      const scope = (Array.isArray(it.scope) ? it.scope : []).map(lower).filter(Boolean);
      const hits = scope.filter((k) => nommeLeMot(text, k));
      return {
        id: str(it.id),
        owner: str(it.owner),
        stance: lower(it.stance) || "hostile",
        hits,
        nomme: hits.length > 0,
        veilleSur: scope,
        poursuit: str(it.summary),
      };
    });
};

/**
 * The block the model reads while answers are still due: who was touched by the
 * declaration and how they stand, with the demand that each answers in this
 * edition. Empty once the world has answered, or when nothing was declared.
 */
export const describeDeclarationReactions = (world) => {
  // A game that declared before the inauguration sheet existed carries the
  // programme as an intent but no record of answers owed. The intent is the
  // declaration; the answers are still due until one edition has given them.
  let record = world?.inauguration;
  if (!record) {
    const intent = (Array.isArray(world?.intents) ? world.intents : []).find((it) => str(it?.id) === INAUGURATION_INTENT_ID && str(it?.summary));
    if (intent) {
      const name = str(world?.polityOverrides?.[HOLY_SEE]?.leader) || "The pope";
      record = { name, declaration: str(intent.summary), answered: false, reactions: reactionsToDeclaration(world, intent.summary).map((r) => ({ owner: r.owner, stance: r.stance, hits: r.hits, nomme: r.nomme, poursuit: r.poursuit })) };
    }
  }
  if (!record || record.answered || !str(record.declaration)) return "";

  // Ce que chaque puissance POURSUIT, et non ce qu'elle « est ». La version
  // d'avant écrivait « hostile », « supportive », et le modèle s'en servait
  // comme d'un verdict tout prêt : les acquis approuvaient, les hostiles
  // s'opposaient, quoi que le pape ait dit. Le joueur l'a signalé trois fois —
  // « cela dépend de ce que l'on dit ou fait ». Une puissance à qui l'on donne
  // son objectif juge la phrase ; une puissance à qui l'on colle une étiquette
  // répète l'étiquette.
  const lines = (Array.isArray(record.reactions) ? record.reactions : []).map((r) =>
    [
      `- ${r.owner}`,
      r.poursuit ? `\n    pursuing: ${r.poursuit}` : "",
      r.hits?.length ? `\n    its own declared field is named in this declaration: ${r.hits.join(", ")}` : "",
    ].join(""),
  );
  return [
    "[Declaration — answers due this edition]",
    `${str(record.name)} declared before the Church: "${str(record.declaration)}"`,
    lines.length
      ? `READ THE DECLARATION ITSELF and decide, from what it actually says, who answers and how. These are the powers standing in this world:\n${lines.join("\n")}`
      : "No power stands in this world yet; the Church at large still answers a new pope's first word.",
    // The rule this block exists for. Without it the edition printed three
    // supportive bodies agreeing with a pope who had just declared the Church
    // was for the rich — because the list was keyword-filtered and the only
    // bodies left were the ones whose default is to obey.
    "No power here is for or against the pope as a standing fact. Each is pursuing something, and it judges this declaration by what the declaration does to that pursuit — nothing else. The body that has served every pope loyally can break with this one over a single sentence; the body that has fought him can be handed exactly what it wanted. Work it out from the words that were actually said, one power at a time.",
    "Not everyone speaks. Those the declaration does not concern stay silent this edition, and that silence is itself information. But at least one power must answer, and if the declaration is an outrage the answer must be an outraged one: a declaration nobody contradicts is a modelling error unless it is genuinely uncontroversial.",
    "Answer in character and in fact — a statement, a move, a leak, a closing of ranks, a resignation.",
    "If you are writing the pre-game history: its LAST event is dated the start date and is the election itself — the name taken, the declaration as it was made, and the first answers of the powers above, that same day. Everything before it is what led here.",
  ].join("\n");
};

/** After a jump has been narrated, the answers are no longer due. */
export const markDeclarationAnswered = (world) => {
  if (world?.inauguration?.answered) return world;
  if (world?.inauguration) return { ...world, inauguration: { ...world.inauguration, answered: true } };
  // Declared by the old path (intent only): record that the edition has answered,
  // or the fallback in describeDeclarationReactions would demand it every turn.
  const declared = (Array.isArray(world?.intents) ? world.intents : []).some((it) => str(it?.id) === INAUGURATION_INTENT_ID);
  return declared ? { ...world, inauguration: { answered: true } } : world;
};
