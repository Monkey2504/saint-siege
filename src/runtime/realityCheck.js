/*! Open Historia — the reality check: every player order is tested against the world's real numbers before the story is written © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
// The complaint this answers: "any idea I have, the AI waves through and I
// feel like a genius" — and its mirror, an AI that blocks everything. Neither
// is a world. This computes, from state the engine already holds, what stands
// between an order and its execution: the budget, how far the state actually
// reaches, whether it is obeyed, whether it is believed, which bodies must
// vote and who inside them is scheming against the player, how long such a
// thing takes, whether there are forces at all. The verdict caps what the
// model may narrate — a "constrained" order can at best partly succeed, a
// "blocked" one does not happen as given — and the model must name the
// friction. It never invents hostility: every constraint below is a number
// with its source. Difficulty changes how well rivals exploit the friction,
// not whether it exists. Pure: no store reads, no React, no randomness.

import { normalizeEconomy, annualRevenue, fiscalBalance, debtCeiling, interestRate } from "./economy.js";
import { normalizeIntents } from "./intents.js";
import { normalizeOrganizations, isMember } from "./organizations.js";

const str = (v) => String(v ?? "").trim();
const lower = (v) => str(v).toLowerCase();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const finite = (v, d = 0) => { const n = Number(v); return Number.isFinite(n) ? n : d; };
const fmt = (n) => Math.round(finite(n)).toLocaleString("en-US");
const pct = (n) => `${(finite(n) * 100).toFixed(1)}%`;

// ---- what kind of order this is -----------------------------------------------------------
// Keyword classes, multilingual where the game is played in more than one
// tongue. An order may belong to several; each class pulls in the constraints
// that bind it. Unclassified orders get the general ones (capacity, opposition).

export const ACTION_DOMAINS = Object.freeze({
  spending: /\b(build|construct|fund|financ|invest|subsid|salar|wage|pension|budget|programme|program|infrastructure|hospital|school|road|rail|port|dam|plant|stadium|construire|financer|investir|subvention|salaire|chantier|usine|autoroute|hôpital|école|barrage|centrale|acheter|purchase|buy|procure|equip)/i,
  tax: /\b(tax|impôt|impot|taxe|levy|tariff|douane|fiscal|prélèvement|contribution obligatoire)/i,
  reform: /\b(reform|réform|decree|décret|law\b|loi\b|constitution|abolish|abolir|restructur|merge|fusion|dissol|create a (ministry|department|agency)|créer (un|une) (ministère|agence|dicastère|conseil|commission)|statute|statut|synod|synode|curia|curie|motu proprio|encyclical|encyclique|nationali|privati|centrali|decentrali)/i,
  personnel: /\b(appoint|nominate|nommer|nomination|dismiss|limoger|révoquer|remove .* from office|démission|resign|replace|remplacer|promote|promouvoir|cardinal|bishop|évêque|minister\b|ministre|governor|gouverneur|general\b|général\b|chief of staff)/i,
  diplomatic: /\b(treaty|traité|alliance|negotiat|négoci|summit|sommet|sanction|embargo|recogni|reconna|ambassad|delegation|délégation|accord|agreement|mediat|médiat|concordat|join the|adhér|withdraw from|quitter l)/i,
  // "deploy" and "mobilise" are deliberately absent: on their own they are as
  // often about a platform or a network as about soldiers. classifyAction adds
  // the military domain back whenever ARMED_FORCE matches, which is where those
  // two verbs are read together with what they act on.
  military: /\b(troop|army|armies|attack|invade|invasion|fleet|navy|naval|air ?force|bomb|siege|offensive|battalion|regiment|garrison|blockade|armée|troupe|attaquer|envahir|flotte|guerre|war\b|strike)/i,
  monetary: /\b(currency|monnaie|central bank|banque centrale|devalu|dévalu|peg|interest rate|taux directeur|print money|planche à billets|bond|obligation|emprunt|debt|dette|default|loan|prêt|token|crypto)/i,
  coercion: /\b(arrest|arrêter|imprison|emprisonn|ban\b|interdire|censor|censur|crack ?down|répri|repress|police|surveill|purge|exile|exil|excommuni|suspend|dissolve|dissoudre|martial law|état d'urgence|curfew)/i,
  social: /\b(campaign|campagne|propaganda|propagande|education|éducation|welfare|aide sociale|housing|logement|health|santé|literacy|alphabét|reconcil|réconcil|amnesty|amnistie|referendum|élection|election|consult|synodal|listening|écoute)/i,
});

// Committing armed force, unambiguously — the only thing the "no forces" wall
// may fire on. Kept apart from the military DOMAIN, which is deliberately broad
// (it also decides how fast such an order shows results and which schemes
// oppose it) and therefore catches verbs that are not about troops at all.

// Naming any of these is committing force whatever the sentence around it does.
const FORCE_NAMED = /\b(troop|army|armies|invade|invasion|fleet|navy|naval|air ?force|bomb|siege|offensive|battalion|regiment|garrison|blockade|armée|troupe|envahir|débarque|flotte|artiller|infanter|blindé|militairement)/i;

// "Mobilise" and "deploy" are not. A state mobilises its diplomatic network, its
// donors, its faithful; a company deploys a platform. They commit force only when
// what they take as their object is itself armed, so they are matched together
// with that object instead of on their own. Field report: a Vatican fundraising
// plan opening "Mobilisation immédiate de notre réseau diplomatique" was stopped
// dead for having no army on the map.
const FORCE_OBJECT = "(?:\\w+[\\s'’-]+){0,4}(?:troops?|soldiers?|army|armies|forces|reserves?|divisions?|regiments?|battalions?|garrisons?|fleet|navy|militia|armée|troupes?|soldats?|réserves?|régiments?|garnisons?|flotte|milice|blindés?)";
const FORCE_VERB = "(?:mobiliz\\w*|mobilis\\w*|deploy\\w*|déploy\\w*|déploie\\w*)";

export const ARMED_FORCE = new RegExp(
  `${FORCE_NAMED.source}|\\b${FORCE_VERB}\\s+${FORCE_OBJECT}`,
  "i",
);

// "Attaquer en justice" is a lawsuit; a strike can be a labour strike; a war on
// poverty is a slogan. Field report: a papal order to sue Germany's bishops
// before the European courts was assessed BLOCKED — "no forces exist on the map
// under this polity's command" — because "attaquer" alone read as an assault.
// An ambiguous verb only means force when nothing around it says otherwise.
const NON_MILITARY_SENSE = /\b(en justice|judiciaire|justice|tribunal|tribunaux|cour(?:s)? (?:européenne|internationale|de justice)|contentieux|litige|plainte|avocat|lawsuit|litigation|sue |court of|legal action|grève|hunger strike|labour strike|war on (?:poverty|drugs|terror)|guerre contre (?:la pauvreté|la drogue))\b/i;

// A force word carrying a figure is an accounting label, not an order. Players
// paste the engine's own budget readout into their orders — that is the point of
// showing it to them — and that readout contains the line "Dépenses = army 0 +
// civil 320k + adm…". Field report: a papal pension reform was assessed BLOCKED,
// "no forces exist on the map under this polity's command", because the summary
// pasted with it says the army costs zero. The check has to read what the player
// ORDERED, so a named force immediately followed by a sum is struck out before
// anything is classified. It cannot hide a real order: "mobiliser 20 000
// soldats" keeps its verb and its object, and only the bare label goes.
const LEDGER_LABEL = /\b(?:army|armies|military|troops?|navy|fleet|armée|militaire|troupes?|flotte)\b\s*[:=]?\s*[-+]?\d[\d.,\s]*\s*(?:[kKmMbB]|SY|€|\$|%)?/g;
const withoutLedgerLabels = (t) => t.replace(LEDGER_LABEL, " ");

export const classifyAction = (text) => {
  const t = withoutLedgerLabels(str(text));
  const domains = Object.entries(ACTION_DOMAINS).filter(([, re]) => re.test(t)).map(([k]) => k);
  // "Deploy the reserves" names no word in the military table, so put the domain
  // back whenever an armed verb and its armed object appear together.
  if (!domains.includes("military") && ARMED_FORCE.test(t)) domains.push("military");
  // Drop a military reading that rests only on an ambiguous verb used in a
  // plainly non-military sense; keep it the moment real force is named.
  const figurative = domains.includes("military") && !ARMED_FORCE.test(t) && NON_MILITARY_SENSE.test(t);
  const kept = figurative ? domains.filter((d) => d !== "military") : domains;
  return kept.length ? kept : ["general"];
};

// How long such a thing takes to show results, in years — the lower bound of
// what history shows, not the average. An order that needs longer than the
// jump is "begun", not done.
const IMPLEMENTATION_LAG_YEARS = Object.freeze({
  spending: 2, tax: 1, reform: 2, personnel: 0.1, diplomatic: 0.75, military: 0.25, monetary: 1, coercion: 0.25, social: 1.5, general: 0.5,
});

// Which intent kinds threaten which orders.
const INTENT_KIND_DOMAINS = Object.freeze({
  political: ["reform", "personnel", "social", "coercion", "tax", "general"],
  economic: ["spending", "tax", "monetary", "reform"],
  military: ["military", "diplomatic"],
  diplomatic: ["diplomatic", "reform", "general"],
  espionage: ["reform", "personnel", "military", "diplomatic", "spending", "monetary", "coercion", "social", "tax", "general"],
});

const VERDICT_BLOCKED = 0.9;
const VERDICT_CONSTRAINED = 0.4;

const verdictOf = (constraints) => {
  const worst = constraints.reduce((m, c) => Math.max(m, c.severity), 0);
  return worst >= VERDICT_BLOCKED ? "blocked" : worst >= VERDICT_CONSTRAINED ? "constrained" : "feasible";
};

// ---- one order against the world ---------------------------------------------------------
//
// ctx: { playerPolity, economy (the player's, or null), world (normalized-ish:
//        organizations, intents, units), jumpDays }

export const assessAction = (action, ctx = {}) => {
  const text = `${str(action?.title)} ${str(action?.text)} ${str(action?.rawInput)}`;
  const domains = classifyAction(text);
  const has = (d) => domains.includes(d);
  const player = str(ctx.playerPolity);
  const years = Math.max(0, finite(ctx.jumpDays, 0)) / 365.25;
  const constraints = [];
  const push = (factor, severity, detail, remedy = "") => constraints.push({ factor, severity: Number(clamp(severity, 0, 1).toFixed(2)), detail, remedy });

  const e = ctx.economy ? normalizeEconomy(ctx.economy) : null;
  if (e) {
    const revenue = annualRevenue(e);
    const balance = fiscalBalance(e);
    // --- money: anything that costs competes with what is already unpaid ---
    // Monetary orders belong here too. Restructuring a debt, funding a pension
    // liability or issuing a bond is a claim on the same budget as a hospital,
    // and leaving it out meant a debt reform never met the deficit it was meant
    // to cure. Tax stays out on purpose: an order whose whole point is to change
    // revenue should not be told that revenue is short.
    if ((has("spending") || has("military") || has("social") || has("monetary")) && revenue > 0) {
      const deficitShare = balance < 0 ? -balance / revenue : 0;
      const room = e.financing === "drawdown" ? e.endowment + Math.max(0, e.treasury)
        : e.financing === "print" ? Infinity
        : e.financing === "austerity" ? Math.max(0, e.treasury)
        : Math.max(0, e.treasury) + Math.max(0, debtCeiling(e) - e.debt);
      if (balance < 0) {
        const how = e.financing === "drawdown" ? `payée en entamant le patrimoine (${fmt(e.endowment)} AS restants)`
          : e.financing === "borrow" ? `empruntée à ${pct(interestRate(e))}, avec ${fmt(Math.max(0, debtCeiling(e) - e.debt))} AS de marge`
          : e.financing === "print" ? "imprimée, avec l'inflation qui suit"
          : `impayée — austérité, ${fmt(Math.max(0, e.treasury))} AS en main`;
        push("budget", 0.35 + 0.45 * clamp(deficitShare * 4, 0, 1),
          `le budget manque déjà de ${fmt(-balance)} AS/an (${pct(deficitShare)} des recettes) ; toute dépense nouvelle est ${how}`,
          "couper une ligne de dépense, lever des recettes, ou dire ce qu'on abandonne pour la payer");
      }
      if (room !== Infinity && room <= 0) {
        push("budget", 0.92, "il n'y a rien pour payer : pas de trésorerie, pas de marge d'emprunt, plus rien à vendre", "trouver l'argent d'abord — un prêt, un donateur, une cession");
      }
      if (e.fiscalCredibility < 35 && e.financing === "borrow") {
        push("credibility", 0.5, `les prêteurs ne croient pas aux promesses de cet État (crédibilité ${Math.round(e.fiscalCredibility)}/100) : emprunter coûte cher, ou est refusé`, "un budget crédible, un excédent, un garant");
      }
    }
    // --- reach: the state cannot implement where it is not present ---
    if ((has("reform") || has("spending") || has("tax") || has("social") || has("coercion")) && e.administrativeReach < 70) {
      push("reach", clamp((70 - e.administrativeReach) / 70, 0, 1) * 0.9,
        `l'État atteint ${Math.round(e.administrativeReach)} % de son territoire ; au-delà, l'ordre est un texte que personne n'applique`,
        "la capacité administrative d'abord (recensement, tribunaux, fonctionnaires payés) — des années, pas un décret");
    }
    // --- legitimacy: an order obeyed only where the state is accepted ---
    if ((has("reform") || has("tax") || has("coercion") || has("personnel")) && e.legitimacy < 55) {
      push("legitimacy", clamp((55 - e.legitimacy) / 55, 0, 1) * 0.85,
        `légitimité ${Math.round(e.legitimacy)}/100 : une autorité contestée est combattue, contournée, ou attendue`,
        "remporter un succès visible, ou un consentement (vote, consultation), avant la prochaine imposition");
    }
    // --- credibility: partners and markets price the past ---
    if ((has("diplomatic") || has("monetary")) && e.fiscalCredibility < 45) {
      push("credibility", clamp((45 - e.fiscalCredibility) / 45, 0, 1) * 0.7,
        `crédibilité ${Math.round(e.fiscalCredibility)}/100 : les partenaires escomptent la parole de cet État et exigent des garanties d'avance`,
        "tenir d'abord une promesse déjà faite");
    }
  }

  // --- bodies that must vote, and who inside them is against you ---
  const orgs = normalizeOrganizations(ctx.world?.organizations);
  const intents = normalizeIntents(ctx.world?.intents).filter((it) => it.status === "active" && it.owner !== player);
  // Schemes aimed at the player. L'opposition reste SPÉCIFIQUE — un chantier ne
  // compte que contre un ordre qui tombe dans sa portée — mais deux erreurs la
  // rendaient muette, et onze chantiers sur onze ne se déclenchaient jamais.
  //
  // La première : un chantier NEUTRE était invisible. Le filtre ne lisait que
  // « hostile » et « supportive », si bien que la Commission pour la protection
  // des mineurs et le Dicastère pour le Clergé — neutres à dessein, parce qu'un
  // corps poursuit une chose au lieu d'être pour ou contre le pape — étaient
  // narrativement présents et mécaniquement morts. Un corps neutre qui voit le
  // pape bouger sur son terrain réagit ; c'est ce que le pape dit ou fait qui
  // décide dans quel sens, et c'est précisément la règle qu'il fallait tenir.
  const targeting = intents.filter((it) => !it.target || it.target === player);
  const inScope = (it) => !it.scope.length || it.scope.some((k) => lower(text).includes(k));
  // Deux listes, et pas une : un corps neutre RÉAGIT à ce qui touche son
  // terrain, mais il ne vote pas contre vous pour autant. Les confondre
  // ferait d'une commission qui poursuit sa mission une voix hostile au
  // consistoire, ce qu'elle n'est pas.
  const hostile = targeting.filter((it) => it.stance === "hostile" && inScope(it));
  const concernes = targeting.filter((it) => it.stance !== "supportive" && inScope(it));
  const supportive = targeting.filter((it) => it.stance === "supportive");
  const named = orgs.filter((o) => lower(text).includes(lower(o.name)) && isMember(o, player));
  for (const o of named) {
    if (o.votingRule === "hegemon" && o.leader === player) continue; // the player decrees here
    const voters = o.members.filter((m) => m !== player);
    const against = voters.filter((m) => hostile.some((it) => it.owner === m));
    const forIt = voters.filter((m) => !against.includes(m) && supportive.some((it) => it.owner === m));
    const share = voters.length ? against.length / voters.length : 0;
    const need = o.votingRule === "unanimity" ? 1 : o.votingRule === "hegemon" ? 0.35 : 0.5;
    push("vote", clamp(0.2 + share * 0.6 - 0.05 * forIt.length + (o.votingRule === "unanimity" ? 0.2 : 0), 0.1, 0.88),
      `${o.name} décide au vote ${o.votingRule} de ${voters.length} autres membres ; contre vous là-dessus : ${against.length} (${against.join(", ") || "aucun"}) ; avec vous : ${forIt.length} (${forIt.join(", ") || "aucun"}) ; les autres ne se sont pas déclarés${share >= need ? " — en l'état, le vote est perdu" : ""}`,
      "traiter, diviser ou déborder le bloc : une concession à un membre, un consistoire, une règle mise au vote du corps");
  }
  // --- standing opposition: schemes already in motion against THIS kind of order ---
  // La seconde erreur : une portée qui correspond ne suffisait pas. Il fallait
  // EN PLUS que le genre du chantier (political, economic…) recouvre le domaine
  // que le classifieur détecte dans l'ordre — deux vocabulaires sans rapport,
  // et ils se contredisaient. Mesuré : « supprimer le célibat » ne réveillait
  // les cardinaux des dubia que si on leur donnait le genre ECONOMIC, et
  // « ouvrir un audit » ne réveillait le gardien du coffre que sous le genre
  // POLITICAL. Ils étaient inversés, parce que le classifieur vient du jeu de
  // guerre d'origine et ne connaît ni « célibat », ni « audit », ni « abus ».
  //
  // La portée EST le test de sujet : elle est écrite à la main, corps par
  // corps, dans les mots de ce corps. Le genre ne sert plus qu'aux chantiers
  // qui n'ont pas de portée, où il n'y a pas d'autre signal.
  const relevant = concernes.filter((it) => it.scope.length || (INTENT_KIND_DOMAINS[it.kind] ?? []).some((d) => has(d)));
  if (relevant.length) {
    const strongest = relevant.reduce((m, it) => Math.max(m, it.stage), 0);
    // One early scheme is a warning, not a wall; several far along are a wall.
    push("opposition", clamp(0.15 + 0.08 * relevant.length + 0.25 * (strongest / 100) - 0.05 * Math.min(3, supportive.length), 0.05, 0.7),
      `${relevant.length} puissance${relevant.length > 1 ? "s ont" : " a"} un chantier sur ce terrain : ${relevant.map((it) => `${it.owner} (${it.secret ? "en secret, " : ""}${it.stance === "hostile" ? "contre vous" : "sur sa propre ligne"}, ${it.stage}% du chemin)`).join("; ")}${supportive.length ? ` ; travaillent pour vous : ${supportive.map((it) => it.owner).join(", ")}` : ""}`,
      "agir sur elles avant qu'elles n'agissent sur vous — les exposer, les acheter, les diviser ; s'appuyer sur celles qui vous suivent");
  }
  // --- time ---
  const lag = Math.max(...domains.map((d) => IMPLEMENTATION_LAG_YEARS[d] ?? 0.5));
  if (years > 0 && years < lag) {
    push("time", clamp(0.35 * (1 - years / lag) + 0.15, 0, 0.5),
      `ce genre d'ordre met environ ${lag} an${lag === 1 ? "" : "s"} à porter ; ce saut en couvre ${years.toFixed(2)}`,
      "il est commencé ce tour-ci, jugé à un tour ultérieur");
  }
  // --- forces ---
  // Only an order that actually commits armed force can be stopped for having
  // none. Policing, prosecuting, sanctioning and threatening are all things a
  // state does without an army, and a wall in front of them reads as the engine
  // not understanding the order rather than the world resisting it.
  if (has("military") && ARMED_FORCE.test(withoutLedgerLabels(text))) {
    const units = (Array.isArray(ctx.world?.units) ? ctx.world.units : []).filter((u) => lower(u?.owner ?? u?.ownerCode ?? u?.country) === lower(player));
    if (!units.length) push("forces", 0.95, "aucune force n'existe sur la carte sous le commandement de cette puissance", "lever ou déployer des unités d'abord");
  }

  constraints.sort((a, b) => b.severity - a.severity);
  return { id: str(action?.id), title: str(action?.title) || str(action?.text).slice(0, 60), domains, verdict: verdictOf(constraints), constraints, lagYears: lag };
};

export const assessPlannedActions = (actions, ctx = {}) =>
  (Array.isArray(actions) ? actions : [])
    .filter((a) => a && (a.status ?? "planned") === "planned" && a.kind !== "chat")
    .map((a) => assessAction(a, ctx));

// ---- what the model reads ------------------------------------------------------------------

export const describeRealityCheck = (assessments) => {
  const list = Array.isArray(assessments) ? assessments : [];
  if (!list.length) return "";
  return list.map((a) => {
    const head = `- "${a.title}" → ${a.verdict.toUpperCase()}${a.constraints.length ? "" : " (no binding constraint found; second-order costs still apply)"}`;
    const body = a.constraints.map((c) => `    · ${c.factor} [${c.severity}]: ${c.detail}${c.remedy ? ` — what would change it: ${c.remedy}` : ""}`).join("\n");
    return body ? `${head}\n${body}` : head;
  }).join("\n");
};

export const REALITY_RULES = `[Reality Check — computed, binding]
Each planned order above was tested against the world's real numbers before you write. The verdict is physics, not mood, and it applies at EVERY difficulty — difficulty changes how well rivals exploit the friction, never whether it exists.
- FEASIBLE: it happens — and it still costs something real (money spent, a rival alarmed, a promise now owed). Name the second-order cost.
- CONSTRAINED: it happens PARTLY, and the named constraint is visible in the event: the reform reaches where the state reaches, the vote passes narrowed or fails on the named bloc, the money runs to the named limit, the scheme against it fires. Never narrate a clean success for a constrained order.
- BLOCKED: it does NOT happen as ordered. The event says so, says why (the named constraint), and says what it would take — so the player can act next turn. Never fail an order for a reason not listed above: the world is real, not hostile.
Record every planned order's fate in impacts.actionOutcomes [{"actionId":"<id>","outcome":"success|partial|failure","reason":"<the named constraint or cost, one line>"}] — an outcome better than the verdict allows is downgraded by the engine. Diplomatic outreach (chats) is not judged here.`;

// ---- applying the model's outcomes, capped by the verdict ---------------------------------

const OUTCOME_RANK = { failure: 0, partial: 1, success: 2 };
const CAP_BY_VERDICT = { blocked: "failure", constrained: "partial", feasible: "success" };
const STATUS_BY_OUTCOME = { failure: "failed", partial: "partial", success: "succeeded" };

export const normalizeActionOutcome = (entry) => {
  if (!entry || typeof entry !== "object") return null;
  const actionId = str(entry.actionId ?? entry.id);
  const outcome = lower(entry.outcome);
  if (!actionId || !(outcome in OUTCOME_RANK)) return null;
  return { actionId, outcome, reason: str(entry.reason) };
};

// Returns the action list with each planned, non-chat order's status set from
// the model's outcome — capped by its verdict — and the reason kept on the
// entry, so the history the model reads next turn says "[failed]: the College
// blocked it", not merely "[resolved]". Orders the model forgot fall back to
// the caller's default status.
export const applyActionOutcomes = (actions, outcomes, assessments, { defaultStatus = "resolved" } = {}) => {
  const byId = new Map((Array.isArray(outcomes) ? outcomes : []).map(normalizeActionOutcome).filter(Boolean).map((o) => [o.actionId, o]));
  const verdictById = new Map((Array.isArray(assessments) ? assessments : []).map((a) => [a.id, a]));
  return (Array.isArray(actions) ? actions : []).map((action) => {
    if (!action || action.status !== "planned") return action;
    const o = byId.get(action.id);
    if (!o) return { ...action, status: defaultStatus };
    const a = verdictById.get(action.id);
    const cap = a ? CAP_BY_VERDICT[a.verdict] : "success";
    const capped = OUTCOME_RANK[o.outcome] > OUTCOME_RANK[cap] ? cap : o.outcome;
    const reason = capped !== o.outcome && a?.constraints[0]
      ? `${a.constraints[0].detail}${o.reason ? ` (narrated: ${o.reason})` : ""}`
      : o.reason;
    return { ...action, status: STATUS_BY_OUTCOME[capped], outcome: capped, outcomeNote: reason, verdict: a?.verdict ?? "" };
  });
};

// ---- which events are an order's ------------------------------------------------------------
//
// The verdict above caps the order's STATUS, but the same event's map changes
// (regionTransfers, unitOps) used to apply regardless — a "blocked" invasion
// still moved the border. To bind them, the engine must know which events are
// the player's order being executed. An event belongs to an order when:
//   1. impacts.actionIds names the order's id, or
//   2. any impacts.actionOutcomes[].actionId names it, or
//   3. the event is the player's own doing (playerRelated && kind "player") and
//      its title or description contains the order's title, case-insensitively.
//      A generated title that was cut to 64 chars with "..." is matched on the
//      part before the ellipsis; titles shorter than 4 characters never match
//      by text (too many false positives for "War" or "Tax").
// Events with no linkage at all are the world's own moves, not the player's.

const orderTitleNeedle = (order) => {
  const title = lower(order?.title).replace(/\.\.\.$/, "").replace(/…$/, "").trim();
  return title.length >= 4 ? title : "";
};

export const eventsForOrder = (events, order) => {
  const id = str(order?.id);
  const needle = orderTitleNeedle(order);
  if (!id && !needle) return [];
  return (Array.isArray(events) ? events : []).filter((event) => {
    if (!event || typeof event !== "object") return false;
    const impacts = event.impacts && typeof event.impacts === "object" ? event.impacts : {};
    if (id) {
      const ids = Array.isArray(impacts.actionIds) ? impacts.actionIds : [];
      if (ids.some((v) => str(v) === id)) return true;
      const outcomes = Array.isArray(impacts.actionOutcomes) ? impacts.actionOutcomes : [];
      if (outcomes.some((o) => str(o?.actionId ?? o?.id) === id)) return true;
    }
    if (needle && event.playerRelated && lower(event.kind) === "player") {
      return `${lower(event.title)} ${lower(event.description)}`.includes(needle);
    }
    return false;
  });
};

// ---- the verdict binds the impacts -----------------------------------------------------------
//
// Returns the events with the map changes of every event that executes a
// BLOCKED order stripped (regionTransfers and unitOps — the narration and any
// chats it opened stay: the player must still read that it did not happen and
// why), and a CONSTRAINED order's event cut to at most ONE region transfer.
// Heuristic for the one kept: the FIRST transfer the model listed. The model
// writes its transfers in narrative order, so the first is the region the
// event is actually about; a partial success reaches one region, not a front.
// An event tied to both a blocked and a constrained order is treated as
// blocked. Unrelated events are returned untouched, same object.
// `rejections` lists every strip in one line each, for the visible record.

const transferLabel = (t) => `'${str(t?.regionName) || str(t?.regionId)}' to ${str(t?.toCode)}`;
const unitOpLabel = (op) => `${str(op?.op)}${op?.unitId ? ` for id ${str(op.unitId)}` : op?.unit?.id ? ` of ${str(op.unit.id)}` : ""}`;

export const bindImpactsToVerdicts = (events, orders, assessments) => {
  const list = Array.isArray(events) ? events : [];
  const byId = new Map((Array.isArray(orders) ? orders : []).filter(Boolean).map((o) => [str(o.id), o]));
  const verdictByEvent = new Map(); // event -> { verdict, order, assessment }
  for (const a of Array.isArray(assessments) ? assessments : []) {
    if (!a || (a.verdict !== "blocked" && a.verdict !== "constrained")) continue;
    const order = byId.get(str(a.id)) ?? { id: a.id, title: a.title };
    for (const event of eventsForOrder(list, order)) {
      const prior = verdictByEvent.get(event);
      if (!prior || (prior.verdict === "constrained" && a.verdict === "blocked")) verdictByEvent.set(event, { verdict: a.verdict, order, assessment: a });
    }
  }
  const rejections = [];
  const bound = list.map((event) => {
    const hit = verdictByEvent.get(event);
    if (!hit) return event;
    const transfers = Array.isArray(event.impacts?.regionTransfers) ? event.impacts.regionTransfers : [];
    const unitOps = Array.isArray(event.impacts?.unitOps) ? event.impacts.unitOps : [];
    const title = str(hit.order.title) || str(hit.assessment.title) || str(hit.order.id);
    const why = hit.assessment.constraints?.[0]?.detail || "";
    if (hit.verdict === "blocked") {
      if (!transfers.length && !unitOps.length) return event;
      for (const t of transfers) rejections.push({ text: `Order '${title}' blocked${why ? ` (${why})` : ""}: region transfer of ${transferLabel(t)} in '${str(event.title)}' not executed`, playerRelated: true });
      for (const op of unitOps) rejections.push({ text: `Order '${title}' blocked${why ? ` (${why})` : ""}: unit op ${unitOpLabel(op)} in '${str(event.title)}' not executed`, playerRelated: true });
      return { ...event, impacts: { ...event.impacts, regionTransfers: [], unitOps: [] } };
    }
    if (transfers.length <= 1) return event;
    for (const t of transfers.slice(1)) rejections.push({ text: `Order '${title}' constrained${why ? ` (${why})` : ""}: region transfer of ${transferLabel(t)} in '${str(event.title)}' dropped — a partial success keeps only the first, ${transferLabel(transfers[0])}`, playerRelated: true });
    return { ...event, impacts: { ...event.impacts, regionTransfers: [transfers[0]] } };
  });
  return { events: bound, rejections };
};

// ---- a region transfer needs a reason to exist -----------------------------------------------
//
// A border moves only when something in the world can move it. A transfer of
// region R from L to P is allowed when at least one holds:
//   (a) P has forces. Stock regions carry no coordinates in the catalog (only
//       id, name, country), so distance cannot be measured. The strong form
//       used here is a unit of P whose regionId is R or any region L still
//       holds; failing that, the WEAK form — P has any unit on the map at all,
//       or spawns one in this same payload — is accepted, and said so.
//   (b) an ACTIVE intent owned by P, or a PASSED resolution proposed or voted
//       for by P, names R or L (an intent's target, a resolution's sanctions
//       target, or the text).
//   (c) L is the player and one of the player's PLANNED orders names R or P:
//       consent, a cession, a sale.
//   (d) the transfer is part of a wholeCountry conquest and P has units.
// Otherwise it is refused, with what would make it valid.
//
// ctx: { units, spawnedOwners (Set of polity names spawned this payload),
//        intents, organizations, playerPolity, plannedActions,
//        losingRegionIds (ids L currently holds) }

const mentions = (text, ...needles) => needles.some((n) => lower(n).length >= 3 && lower(text).includes(lower(n)));

export const assessRegionTransfer = (transfer, ctx = {}) => {
  const to = str(transfer?.toPolity ?? transfer?.toCode);
  const region = { id: str(transfer?.regionId), name: str(transfer?.regionName) || str(transfer?.regionId) };
  const losing = str(transfer?.losingPolity ?? transfer?.fromCode);
  const label = `'${region.name}' to ${to || "(nobody)"}`;
  if (!to) return { allowed: false, basis: "", reason: `region transfer of ${label} refused: no receiving polity`, remedy: "name the polity that takes it in toCode" };

  const units = (Array.isArray(ctx.units) ? ctx.units : []).filter((u) => lower(u?.ownerCode ?? u?.owner ?? u?.country) === lower(to));
  const losingIds = new Set((Array.isArray(ctx.losingRegionIds) ? ctx.losingRegionIds : []).map(str));
  const near = units.find((u) => str(u?.regionId) && (str(u.regionId) === region.id || losingIds.has(str(u.regionId))));
  const spawned = ctx.spawnedOwners instanceof Set && [...ctx.spawnedOwners].some((o) => lower(o) === lower(to));
  const hasForces = units.length > 0 || spawned;

  if (transfer?.wholeCountry && hasForces) return { allowed: true, basis: `whole-country conquest by ${to}, which has forces on the map`, reason: "", remedy: "" };
  if (near) return { allowed: true, basis: `${to} has a unit (${str(near.name) || str(near.id)}) in ${str(near.regionId) === region.id ? "the region" : `${losing || "the losing side"}'s territory`}`, reason: "", remedy: "" };
  if (hasForces) return { allowed: true, basis: `${to} has forces on the map (weak form: their position is not known to the region)`, reason: "", remedy: "" };

  const intents = normalizeIntents(ctx.intents).filter((it) => it.status === "active" && lower(it.owner) === lower(to));
  const intent = intents.find((it) => (losing && lower(it.target) === lower(losing)) || mentions(`${it.summary} ${it.target}`, region.name, losing));
  if (intent) return { allowed: true, basis: `${to}'s active intent "${intent.summary}" names ${lower(intent.target) === lower(losing) && losing ? losing : region.name}`, reason: "", remedy: "" };

  for (const o of normalizeOrganizations(ctx.organizations)) {
    const res = o.resolutions.find((r) => r.passed
      && (lower(r.proposedBy) === lower(to) || r.votesFor.some((v) => lower(v) === lower(to)))
      && ((losing && lower(r.sanctions?.target) === lower(losing)) || mentions(`${r.title} ${r.text}`, region.name, losing)));
    if (res) return { allowed: true, basis: `${o.name} passed "${res.title}" with ${to} behind it, naming ${region.name}`, reason: "", remedy: "" };
  }

  const player = str(ctx.playerPolity);
  if (player && losing && lower(losing) === lower(player)) {
    const consent = (Array.isArray(ctx.plannedActions) ? ctx.plannedActions : [])
      .filter((a) => a && (a.status ?? "planned") === "planned" && a.kind !== "chat")
      .find((a) => mentions(`${str(a.title)} ${str(a.text)} ${str(a.rawInput)}`, region.name, to));
    if (consent) return { allowed: true, basis: `${player}'s own order "${str(consent.title)}" names it — consent`, reason: "", remedy: "" };
  }

  const remedy = `${to} would need a unit on the map${losing ? ` (in ${losing}'s territory)` : ""}, an active intent or a passed resolution naming ${region.name}${losing ? ` or ${losing}` : ""}${player && lower(losing) === lower(player) ? `, or a planned order of ${player} ceding it` : ""}`;
  return { allowed: false, basis: "", reason: `region transfer of ${label} refused: ${to} has no forces, no intent and no resolution that reaches ${region.name}`, remedy };
};
