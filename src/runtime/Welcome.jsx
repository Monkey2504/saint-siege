/*! Open Historia — the front door © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useState } from "react";
import { welcomeText } from "./welcomeText.js";
import { preferredLanguage } from "./i18n.js";

// What a new player met before this screen existed: a library of saved games,
// tabs reading Games / Scenarios / Community, a scenario called "Modern Day"
// described as an "editable server-backed scenario template", buttons offering
// Edit and Clone Scenario beside New Game — and a thumbnail of a burning city
// with tanks, gunships and a hammer and sickle.
//
// Nothing anywhere said you were the pope. A friend who had never played a game
// of this kind was being asked to pick a scenario template before being told
// what the game was. So the door is a photograph and a sentence.
//
// The image is expected at public/vatican.jpg. If it is absent the screen still
// works and falls back to a plain ground rather than a broken frame, because a
// missing asset must never be the reason somebody cannot start.

// Wikimedia Commons, CC BY 2.0. The licence is satisfied by naming the author,
// which is why the credit is rendered on the screen and not only in
// public/CREDITS.md — an attribution nobody can see is not an attribution.
const PHOTO = "/vatican.jpg";
const CREDIT = "lafiguradelpadre Congreso, CC BY 2.0";

const Welcome = ({ onBegin, hasSave = false }) => {
    const t = welcomeText(preferredLanguage());
    const [loaded, setLoaded] = useState(false);

    return (
        <div
        style={{
            alignItems: "flex-end", background: "var(--oh-plate)", display: "flex",
            inset: 0, overflow: "hidden", position: "fixed", zIndex: 20001,
        }}
        >
        {/* Hidden loader: the photograph only paints once it is actually there,
            so a missing file leaves a clean ground instead of a torn frame. */}
        <img src={PHOTO} alt="" onLoad={() => setLoaded(true)} style={{ display: "none" }} />
        <div
        aria-hidden
        style={{
            backgroundImage: loaded ? `url(${PHOTO})` : "none",
            backgroundPosition: "center 30%",
            backgroundSize: "cover",
            inset: 0,
            position: "absolute",
        }}
        />
        {/* The type has to stay readable over any photograph, so the ground it
            sits on is painted rather than hoped for. */}
        <div
        aria-hidden
        style={{
            background: "linear-gradient(to top, var(--oh-plate) 0%, var(--oh-plate) 22%, transparent 70%)",
            inset: 0,
            position: "absolute",
        }}
        />

        <div style={{ margin: "0 auto", maxWidth: "60rem", padding: "0 1.5rem 3.5rem", position: "relative", width: "100%" }}>
        <span
        className="oh-label"
        style={{ color: "var(--oh-text-dim)", display: "block", fontSize: "var(--oh-t-2xs)", marginBottom: "0.5rem" }}
        >
        {t.eyebrow}
        </span>
        <h1
        style={{
            color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)",
            fontSize: "var(--oh-t-3xl)", fontWeight: 800, letterSpacing: "-0.035em",
            lineHeight: 0.98, margin: "0 0 0.8rem", textWrap: "balance",
        }}
        >
        {t.title}
        </h1>
        <p style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-md)", lineHeight: 1.55, margin: "0 0 1.8rem", maxWidth: "54ch" }}>
        {t.lead}
        </p>

        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "1.2rem" }}>
        <button
        type="button"
        onClick={() => onBegin(false)}
        style={{
            background: "var(--oh-accent)", border: 0, color: "var(--oh-on-accent)",
            cursor: "pointer", fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-xs)",
            fontWeight: 700, letterSpacing: "var(--oh-label-track)", padding: "1rem 2.2rem",
            textTransform: "uppercase",
        }}
        >
        {t.begin}
        </button>
        {hasSave && (
            <button
            type="button"
            onClick={() => onBegin(true)}
            style={{
                background: "transparent", border: 0, color: "var(--oh-text)",
                cursor: "pointer", fontSize: "var(--oh-t-sm)", textDecoration: "underline",
            }}
            >
            {t.resume}
            </button>
        )}
        </div>

        {loaded && CREDIT && (
            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", margin: "1.6rem 0 0" }}>
            {t.credit}: {CREDIT}
            </p>
        )}
        </div>
        </div>
    );
};

export default Welcome;
