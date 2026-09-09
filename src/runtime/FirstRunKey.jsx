/*! Open Historia — the one thing a new player must do before the world can think © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useState } from "react";
import { getProviderSettings, setProviderField } from "../Game/AI/providerConfig.js";

// A new player installs the game, waits for the map, starts a pontificate, gives
// an order, advances the turn — and reads an edition written by the offline stub,
// because the world thinks with a model and no model was configured. Nothing on
// screen had ever said so. The first-run window exists only to download the map;
// the field where a key goes is behind a settings menu nobody opens first.
//
// Field report from this campaign: eight editions in a row were written by the
// stub before anybody worked out why. That was a quota, but a player with no key
// at all gets the same silence from the first turn, forever, and concludes the
// game is broken rather than unconfigured.
//
// So this asks once, at the front door, and gets out of the way for good. It is
// not a settings panel: it is the single fact a player cannot start without.

const KEY_URL = "https://aistudio.google.com/apikey";

export const hasProviderKey = () => {
    try {
        return Boolean(getProviderSettings(localStorage.getItem("api_provider") || "gemini").apiKey.trim());
    } catch {
        // No storage (a private window, a locked-down browser) is not a reason to
        // block the door: let the player through and let the outage banner speak.
        return true;
    }
};

const FirstRunKey = ({ onDone }) => {
    const [key, setKey] = useState("");
    const [busy, setBusy] = useState(false);

    const save = () => {
        const trimmed = key.trim();
        if (!trimmed || busy) return;
        setBusy(true);
        try {
            localStorage.setItem("api_provider", "gemini");
            setProviderField("gemini", "apiKey", trimmed);
        } catch {
            // Nothing to do: the same absent storage the guard above allows for.
        }
        onDone();
    };

    return (
        <div
        style={{
            alignItems: "center", background: "var(--oh-plate)", color: "var(--oh-text)",
            display: "flex", inset: 0, justifyContent: "center", position: "fixed", zIndex: 20000,
        }}
        >
        <div style={{ maxWidth: "44rem", padding: "2rem 1.5rem", width: "100%" }}>

        <h1
        style={{
            color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)",
            fontSize: "clamp(1.8rem, 4vw, 2.8rem)", fontWeight: 800, letterSpacing: "-0.03em",
            lineHeight: 1.05, margin: "0 0 0.4rem",
        }}
        >
        One thing before you begin
        </h1>
        <div style={{ borderBottom: "4px solid var(--oh-text-strong)", marginBottom: "1.2rem" }} />

        <p style={{ fontSize: "var(--oh-t-md)", lineHeight: 1.6, margin: "0 0 1rem", maxWidth: "62ch" }}>
        This world is written by a language model as you play: the editions, the
        letters your rivals send, the way they answer you. It needs a key of your
        own to reach one. Without it the game still runs, but every edition is
        written by a stand-in that judges no order and moves no money.
        </p>
        <p style={{ fontSize: "var(--oh-t-base)", lineHeight: 1.6, margin: "0 0 1.4rem", maxWidth: "62ch" }}>
        Google gives one away free. Open{" "}
        <a href={KEY_URL} target="_blank" rel="noreferrer" style={{ color: "var(--oh-accent)" }}>{KEY_URL}</a>,
        sign in, click Create API key, and paste it here. It stays on this machine
        and is sent to nobody but Google.
        </p>

        <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder="Paste your key here"
        spellCheck={false}
        autoFocus
        style={{
            background: "var(--oh-plate-2)", border: "1px solid var(--oh-line)", color: "var(--oh-text-strong)",
            fontFamily: "var(--oh-font-body)", fontSize: "var(--oh-t-base)", padding: "0.75rem 0.9rem", width: "100%",
        }}
        />

        <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "1rem", marginTop: "0.9rem" }}>
        <button
        type="button"
        onClick={save}
        disabled={!key.trim()}
        style={{
            background: key.trim() ? "var(--oh-accent)" : "var(--oh-plate-2)", border: 0,
            color: key.trim() ? "var(--oh-on-accent)" : "var(--oh-text-dim)",
            cursor: key.trim() ? "pointer" : "default", fontFamily: "var(--oh-font-label)",
            fontSize: "var(--oh-t-2xs)", fontWeight: 700, letterSpacing: "var(--oh-label-track)",
            padding: "0.7rem 1.4rem", textTransform: "uppercase",
        }}
        >
        Begin
        </button>
        {/* Skipping is allowed and honest about what it costs, because a player
            who wants to look around first should not be held at the door. */}
        <button
        type="button"
        onClick={onDone}
        style={{
            background: "transparent", border: 0, color: "var(--oh-text-dim)",
            cursor: "pointer", fontSize: "var(--oh-t-xs)", textDecoration: "underline",
        }}
        >
        Skip — look around with the world asleep
        </button>
        </div>

        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.55, margin: "1.4rem 0 0", maxWidth: "62ch" }}>
        You can change this later under Settings. If a turn ever comes back written
        by the stand-in, the bulletin says so at the top of the page and tells you
        the reason the model gave.
        </p>

        </div>
        </div>
    );
};

export default FirstRunKey;
