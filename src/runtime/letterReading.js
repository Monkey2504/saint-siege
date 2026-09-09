/*! Open Historia — reading a letter before answering it © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import { normalizeIntents } from "./intents.js";

// A correspondent answering a letter used to be handed the letter and a sketch
// of its own character, and it answered the character: a faction set against
// reform said no to everything, a greeting included, and answered figures with
// adjectives. Two mechanisms fix that, both computed from state and reinforced
// at call time rather than left to the model's mood:
//
//   readLetter / describeLetter  — what the letter actually contains (figures,
//     conditions, what is asked, an explicit "you misunderstood me"), turned
//     into obligations the answer is held to.
//   describeStanding            — who the answering polity is by the engine's
//     own record (leader, character, the ground its intents fight on, its
//     stance toward the sender), with the rule that opposition has a
//     perimeter: outside it a faction is indifferent or open, inside it it
//     names what it can live with and at what price.

const str = (v) => String(v ?? "").trim();

// The rule for every letter any power writes, on every path that writes one
// (a reply in a thread, a note between rounds, a chat opened by a jump): the
// same for a state, a faction, a body of the era, and the same whoever the
// player is. Appended by promptAssembly.js and gameplay.js; the per-letter
// obligations (describeLetter) and the per-polity standing (describeStanding)
// are computed on top of it.
export const CORRESPONDENCE_RULES = [
  "[Correspondence — the same rules for everyone]",
  "Every polity that writes — a state, a faction, an international body — writes from its own record: its declared aims, its secret ones, its character tags, its history, its economy. Never from a caricature of its label.",
  "Opposition has a perimeter. A power fights what touches the ground its own standing intents name and is indifferent, or open to a bargain, everywhere else. Inside its perimeter, opposing means naming what it can live with, what it cannot, and the price of the rest; a flat no to everything is not a character, it is the absence of one.",
  "A letter is answered as written. Figures get figures or reasons, never adjectives; a condition the sender sets is acknowledged as a condition; what is refused is refused as it was said, never a harsher version of it; a courtesy is answered as a courtesy; a sender who says they were misunderstood is restated before being answered.",
  "This holds for the player's correspondents and for the player's own polity when the world writes about it, in every era and every scenario.",
].join("\n");

const SENTENCE_SPLIT = /(?<=[.!?…])\s+|\n+/;

// A number that means something in a letter: a currency, a percentage, an
// order of magnitude, a span of time, or a year. A bare "2" does not count.
const FIGURE = /[+\-±]?\s?(?:[€$£]\s?\d[\d.,]*|\d[\d.,]*\s?(?:%|€|\$|£|millions?|milliards?|billions?|thousand|mille|bn|M€|M\$|k€|ans?\b|years?\b|mois\b|months?\b|semaines?\b|weeks?\b|jours?\b|days?\b)|\b(?:1[5-9]|20)\d{2}\b)/gi;

const CONDITION = /\b(sans\b|without\b|une fois\b|once\b|si\b|if\b|à condition|a condition|provided\b|unless\b|à moins|a moins|tant que\b|as long as\b|puis\b|then\b|ensuite\b|après\b|apres\b|after\b|avant\b|before\b|dès que|des que|en échange|en echange|in exchange|contre\b|in return)/i;

const ASK = /\b(demand\w*|propos\w*|offr\w*|offer\w*|exig\w*|requir\w*|ask\w*|request\w*|invit\w*|joign\w*|uniss\w*|travaill\w*|let us\b|nous allons\b|we will\b|we shall\b|je veux\b|I want\b|nous voulons\b|acceptez\w*|accept\b|refus\w*|signez\w*|sign\b|reconnaiss\w*|recogni[sz]e\w*|garantiss\w*|guarantee\w*|examinez\w*|consider\w*)/i;

const CLARIFY = /(ne m['’]avez pas compris|m['’]avez mal compris|mal compris|misunderstood|misread|je vais [êe]tre clair|to be clear|let me be clear|soyons clairs|pour [êe]tre clair|je r[ée]p[èe]te|I repeat|encore une fois|once again|again:)/i;

const GREETING = /^(bonjour|bonsoir|salut|hello|hi|good (morning|evening|day)|greetings|salutations|dear|cher|chère|ch[èe]res?|vénérables?|venerables?|éminence|eminence|excellence|sainteté|holiness|merci|thank you|thanks)\b/i;

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const uniq = (list) => [...new Set(list)];

// What the letter contains, mechanically.
export const readLetter = (text) => {
  const body = str(text);
  const sentences = body.split(SENTENCE_SPLIT).map((s) => s.trim()).filter(Boolean);
  const figures = uniq((body.match(FIGURE) ?? []).map((f) => f.replace(/\s+/g, " ").trim()).filter((f) => /\d/.test(f)));
  const conditions = uniq(sentences.filter((s) => CONDITION.test(s)));
  const asks = uniq(sentences.filter((s) => /\?\s*$/.test(s) || ASK.test(s)));
  const clarifies = CLARIFY.test(body);
  const words = body.split(/\s+/).filter(Boolean).length;
  const greetingOnly = words <= 12 && figures.length === 0 && conditions.length === 0 && asks.length === 0 && (GREETING.test(body) || !/[?!]/.test(body));
  return { figures, conditions, asks, clarifies, greetingOnly, words, sentences };
};

// The obligations the answer is held to, from what was read.
export const describeLetter = (reading, { sender = "the sender" } = {}) => {
  const r = reading && typeof reading === "object" ? reading : readLetter("");
  const lines = ["[The Letter — what it actually says]"];
  if (r.greetingOnly) {
    lines.push(`This letter carries no proposal: a greeting or a courtesy from ${sender}. Answer it in kind and briefly. A courtesy is not an attack, whatever you think of ${sender}'s policy; you do not open a quarrel that the letter did not open.`);
    return lines.join("\n");
  }
  if (r.figures.length) lines.push(`Figures stated by ${sender}: ${r.figures.slice(0, 8).join("; ")}.`);
  if (r.conditions.length) lines.push(`Conditions and sequences ${sender} sets:\n${r.conditions.slice(0, 4).map((s) => `- "${clip(s, 220)}"`).join("\n")}`);
  if (r.asks.length) lines.push(`What is asked, proposed or announced:\n${r.asks.slice(0, 5).map((s) => `- "${clip(s, 220)}"`).join("\n")}`);
  if (r.clarifies) lines.push(`${sender} says they were misunderstood. Before anything else, restate in ONE sentence, in your own words, what ${sender} now says they mean — then answer THAT. Do not answer the earlier version again.`);
  lines.push(
    "Rules of the answer: answer this letter, not the one you expected. Every figure above gets a figure or a reason in return, never an adjective. Every condition is acknowledged as a condition — you may doubt it, price it, or hold the sender to it, but not pass over it. What you refuse, refuse as written, never a harsher version of it; what you can live with, say so plainly, and name the price of the rest. Where the letter promises to spare something you care about, take note of it out loud.",
  );
  return lines.join("\n");
};

// Who the answering polity is, by the engine's record — the same facts the
// letterhead shows the reader, so the model and the player argue from one
// sheet. `world` may be raw or normalised.
export const describeStanding = (world, name, { player = "" } = {}) => {
  const self = str(name);
  if (!self) return "";
  const w = world && typeof world === "object" ? world : {};
  const stats = w.countryStats?.[self] ?? {};
  const override = w.polityOverrides?.[self] ?? {};
  const active = normalizeIntents(w.intents).filter((it) => it.status === "active" && it.owner === self);
  const tags = (w.countryTags?.[self] ?? []).filter((t) => t && t !== "church-faction");
  const ground = uniq(active.flatMap((it) => it.scope ?? [])).map((s) => s.trim()).filter(Boolean).slice(0, 14);
  const declared = active.filter((it) => !it.secret).map((it) => it.summary).filter(Boolean);
  const toward = player ? active.filter((it) => !it.target || it.target === player) : [];
  const hostile = toward.some((it) => it.stance === "hostile");
  const supportive = !hostile && toward.some((it) => it.stance === "supportive");

  const lines = [`[Who You Are — engine state]`, `You are ${self}.`];
  const leader = str(override.leader) || str(stats.leader);
  if (leader || str(stats.government)) lines.push(`Led by: ${[leader, str(stats.government)].filter(Boolean).join(" — ")}.`);
  if (str(override.note)) lines.push(str(override.note));
  if (tags.length) lines.push(`Character: ${tags.join(", ")}.`);
  if (declared.length) lines.push(`What you have declared:\n${declared.map((d) => `- ${d}`).join("\n")}`);
  if (ground.length) lines.push(`The ground your aims fight on: ${ground.join(", ")}.`);

  const who = player || "the sender";
  if (hostile) {
    lines.push(`Your quarrel with ${who} has a perimeter: the ground above. Outside it you are indifferent, or open to a bargain. Inside it, opposition means naming what you can live with, what you cannot, and at what price — a flat no to everything is not your character, it is a caricature of it, and the bodies that vote read a faction that only says no as one with nothing to offer. A greeting is answered as a greeting.`);
  } else if (supportive) {
    lines.push(`You carry ${who}'s programme. Carrying it means saying where it is weak, what it needs and what you can supply — not applauding it.`);
  } else {
    lines.push(`You have no standing quarrel with ${who}. Judge each proposal by what it gives or costs you, and say which.`);
  }
  return lines.join("\n");
};
