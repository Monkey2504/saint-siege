/*! Open Historia — the verdict, wherever it is shown © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React from "react";

// The reality check's answer to one order, drawn the same way on the order slip
// and on the bulletin page. It used to live inside actions.jsx; the bulletin
// needs the identical thing, and two drawings of one verdict would drift.

export const VERDICT_RESULT = {
    feasible: "Carried in full",
    constrained: "Carried in part",
    blocked: "Refused",
};

// One word set for every visual direction. It reads as a map legend under Atlas
// and as a count of votes under College, and unlike Latin it survives the runtime
// translator that rewrites the interface into the player's language.
const VOTE_WORDS = { grant: "granted", caution: "reserved", alert: "refused" };

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
            <span className="oh-vote-name">Nothing stands in the way</span>
            <span>
            <span className="oh-key oh-key-grant" />
            <span className="oh-vote-verdict oh-vote-grant"> {VOTE_WORDS.grant}</span>
            </span>
            <span>no budget, reach, legitimacy or standing objection binds this order</span>
            </div>
        ) : (
            constraints.map((constraint) => {
                const tone = voteFor(constraint.severity);
                return (
                    <div className="oh-vote" key={`${constraint.factor}-${constraint.severity}`}>
                    <span className="oh-vote-name">{constraint.factor}</span>
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
