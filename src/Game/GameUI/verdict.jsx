/*! Open Historia — the verdict, wherever it is shown © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React from "react";

// The reality check's answer to one order, drawn the same way on the order slip
// and on the bulletin page. It used to live inside actions.jsx; the bulletin
// needs the identical thing, and two drawings of one verdict would drift.

// The keys stay English — they are the engine's, and realityCheck.js writes
// them. Only what the player reads is French, in the words the implementation
// brief fixes (CONSIGNE-CLAUDE-CODE.md §1).
export const VERDICT_RESULT = {
    feasible: "Exécuté en entier",
    constrained: "Accordé en partie",
    blocked: "Refusé",
};

// One word set for every visual direction. It reads as a map legend under Atlas
// and as a count of votes under College. Written in French in the source rather
// than left to the runtime translator: the translator needs a model, and the
// player who has no key is exactly the player reading this sheet.
const VOTE_WORDS = { grant: "accordé", caution: "réservé", alert: "refusé" };

// Le nom de la réserve, tel que la maquette l'écrit : « Budget », « Collège »,
// « Légitimité ». La clé reste celle du moteur (realityCheck.js l'écrit, et les
// invites la relaient) ; seul l'affichage est traduit, comme partout ailleurs.
// Une clé inconnue s'affiche telle quelle plutôt que de disparaître.
const FACTEUR = {
    budget: "Budget",
    credibility: "Crédibilité",
    reach: "Portée de l'appareil",
    legitimacy: "Légitimité",
    vote: "Collège",
    opposition: "Opposition",
    time: "Délai",
    forces: "Forces",
};

// The same two thresholds the verdict itself uses (runtime/realityCheck.js):
// under 0.4 a constraint is noted but does not bind, under 0.9 it binds, at or
// above it stops the order outright. Deriving the row from severity rather than
// inventing a second scale keeps the sheet honest — what the player reads is
// what the engine computed.
const voteFor = (severity) => {
    if (severity >= 0.9) return "alert";
    if (severity >= 0.4) return "caution";
    return "grant";
};

export const RealityTally = ({ assessment }) => {
    if (!assessment) return null;
    const { constraints = [], verdict } = assessment;

    return (
        <div className={`oh-tally oh-tally-${verdict || "feasible"}`}>
        {constraints.length === 0 ? (
            <div className="oh-vote">
            <span className="oh-vote-name">Rien ne s'y oppose</span>
            <span>
            <span className="oh-key oh-key-grant" />
            <span className="oh-vote-verdict oh-vote-grant"> {VOTE_WORDS.grant}</span>
            </span>
            <span>ni le budget, ni la portée, ni la légitimité, ni une opposition déclarée ne bride cet ordre</span>
            </div>
        ) : (
            constraints.map((constraint) => {
                const tone = voteFor(constraint.severity);
                return (
                    <div className="oh-vote" key={`${constraint.factor}-${constraint.severity}`}>
                    <span className="oh-vote-name">{FACTEUR[constraint.factor] || constraint.factor}</span>
                    <span>
                    <span className={`oh-key oh-key-${tone}`} />
                    <span className={`oh-vote-verdict oh-vote-${tone}`}> {VOTE_WORDS[tone]}</span>
                    </span>
                    <span>
                    {constraint.detail}
                    {constraint.remedy && (
                        <em className="oh-vote-remedy"> — {constraint.remedy}</em>
                    )}
                    </span>
                    </div>
                );
            })
        )}
        <div className="oh-result">{VERDICT_RESULT[verdict] ?? verdict}</div>
        </div>
    );
};

export default RealityTally;
