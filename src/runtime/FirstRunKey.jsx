/*! Open Historia — the one thing a new player must do before the world can think © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useState } from "react";
import { getProviderSettings, setProviderField } from "../Game/AI/providerConfig.js";
import { preferredLanguage } from "./i18n.js";

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

// Written per language, like the welcome screen (runtime/welcomeText.js) and
// the outage banner (runtime/outageNotice.js), and for the same reason: this
// screen is shown BEFORE there is a key, and the runtime translator needs a
// model to translate anything. Machine translation cannot reach the one screen
// that exists because there is no model yet. Published to Vercel, that left the
// very first thing a French player saw written in English.
const TEXT = Object.freeze({
    fr: {
        title: "Une chose avant de commencer",
        lead: "Ce monde est écrit par un modèle de langue pendant que vous jouez : les éditions, les lettres que vos rivaux envoient, la façon dont ils vous répondent. Il lui faut une clé à vous pour en atteindre un. Sans elle le jeu tourne quand même, mais chaque édition est écrite par une doublure qui ne juge aucun ordre et ne déplace aucun argent.",
        how: (link) => (<>Google en donne une gratuitement. Ouvrez {link}, connectez-vous, cliquez sur « Create API key » et collez-la ici. Elle reste sur cette machine et n'est envoyée à personne d'autre que Google.</>),
        placeholder: "Collez votre clé ici",
        begin: "Commencer",
        skip: "Passer — regarder autour avec le monde endormi",
        later: "Vous pourrez changer cela plus tard dans les Réglages. Si un tour revient un jour écrit par la doublure, le bulletin le dit en haut de la page et vous donne la raison que le modèle a fournie.",
    },
    en: {
        title: "One thing before you begin",
        lead: "This world is written by a language model as you play: the editions, the letters your rivals send, the way they answer you. It needs a key of your own to reach one. Without it the game still runs, but every edition is written by a stand-in that judges no order and moves no money.",
        how: (link) => (<>Google gives one away free. Open {link}, sign in, click Create API key, and paste it here. It stays on this machine and is sent to nobody but Google.</>),
        placeholder: "Paste your key here",
        begin: "Begin",
        skip: "Skip — look around with the world asleep",
        later: "You can change this later under Settings. If a turn ever comes back written by the stand-in, the bulletin says so at the top of the page and tells you the reason the model gave.",
    },
    es: {
        title: "Una cosa antes de empezar",
        lead: "Este mundo lo escribe un modelo de lenguaje mientras juegas: las ediciones, las cartas que envían tus rivales, cómo te responden. Necesita una clave tuya para alcanzarlo. Sin ella el juego sigue funcionando, pero cada edición la escribe un suplente que no juzga ninguna orden ni mueve ningún dinero.",
        how: (link) => (<>Google regala una. Abre {link}, inicia sesión, pulsa «Create API key» y pégala aquí. Se queda en esta máquina y no se envía a nadie salvo a Google.</>),
        placeholder: "Pega aquí tu clave",
        begin: "Empezar",
        skip: "Omitir — mirar con el mundo dormido",
        later: "Puedes cambiarlo más tarde en Ajustes. Si alguna vez un turno vuelve escrito por el suplente, el boletín lo dice arriba de la página y da la razón que el modelo indicó.",
    },
    de: {
        title: "Eines noch, bevor Sie beginnen",
        lead: "Diese Welt wird von einem Sprachmodell geschrieben, während Sie spielen: die Ausgaben, die Briefe Ihrer Rivalen, ihre Antworten. Dafür braucht es einen eigenen Schlüssel. Ohne ihn läuft das Spiel weiter, aber jede Ausgabe schreibt ein Platzhalter, der keine Anordnung beurteilt und kein Geld bewegt.",
        how: (link) => (<>Google gibt einen kostenlos aus. Öffnen Sie {link}, melden Sie sich an, klicken Sie auf „Create API key" und fügen Sie ihn hier ein. Er bleibt auf diesem Rechner und geht an niemanden außer Google.</>),
        placeholder: "Schlüssel hier einfügen",
        begin: "Beginnen",
        skip: "Überspringen — sich umsehen, die Welt schläft",
        later: "Sie können das später in den Einstellungen ändern. Kommt eine Runde je vom Platzhalter geschrieben zurück, sagt das Bulletin es oben auf der Seite und nennt den Grund des Modells.",
    },
    it: {
        title: "Una cosa prima di cominciare",
        lead: "Questo mondo è scritto da un modello linguistico mentre giochi: le edizioni, le lettere che mandano i tuoi rivali, il modo in cui ti rispondono. Gli serve una chiave tua per raggiungerne uno. Senza, il gioco funziona lo stesso, ma ogni edizione la scrive un sostituto che non giudica nessun ordine e non muove nessun denaro.",
        how: (link) => (<>Google ne regala una. Apri {link}, accedi, clicca su «Create API key» e incollala qui. Resta su questa macchina e non viene inviata a nessuno tranne Google.</>),
        placeholder: "Incolla qui la tua chiave",
        begin: "Cominciare",
        skip: "Salta — dai un'occhiata con il mondo addormentato",
        later: "Potrai cambiarlo più tardi nelle Impostazioni. Se un turno tornasse scritto dal sostituto, il bollettino lo dice in cima alla pagina e riporta la ragione data dal modello.",
    },
    pt: {
        title: "Uma coisa antes de começar",
        lead: "Este mundo é escrito por um modelo de linguagem enquanto você joga: as edições, as cartas que os seus rivais enviam, a forma como respondem. Precisa de uma chave sua para alcançar um. Sem ela o jogo continua a funcionar, mas cada edição é escrita por um substituto que não julga nenhuma ordem nem move nenhum dinheiro.",
        how: (link) => (<>A Google oferece uma. Abra {link}, inicie sessão, clique em «Create API key» e cole-a aqui. Fica nesta máquina e não é enviada a mais ninguém além da Google.</>),
        placeholder: "Cole aqui a sua chave",
        begin: "Começar",
        skip: "Ignorar — ver com o mundo adormecido",
        later: "Pode mudar isto mais tarde nas Definições. Se alguma vez um turno voltar escrito pelo substituto, o boletim di-lo no topo da página e dá a razão que o modelo apresentou.",
    },
});

const wordsFor = (code) => TEXT[code] ?? TEXT.en;

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
    // Read once, at first render: the player's stored choice, else the browser's.
    const [words] = useState(() => wordsFor(preferredLanguage()));

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
            fontSize: "var(--oh-t-3xl)", fontWeight: 800, letterSpacing: "-0.03em",
            lineHeight: 1.05, margin: "0 0 0.4rem",
        }}
        >
        {words.title}
        </h1>
        <div style={{ borderBottom: "4px solid var(--oh-text-strong)", marginBottom: "1.2rem" }} />

        <p style={{ fontSize: "var(--oh-t-md)", lineHeight: 1.6, margin: "0 0 1rem", maxWidth: "62ch" }}>
        {words.lead}
        </p>
        <p style={{ fontSize: "var(--oh-t-base)", lineHeight: 1.6, margin: "0 0 1.4rem", maxWidth: "62ch" }}>
        {words.how(<a href={KEY_URL} target="_blank" rel="noreferrer" style={{ color: "var(--oh-accent)" }}>{KEY_URL}</a>)}
        </p>

        <input
        value={key}
        onChange={(e) => setKey(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") save(); }}
        placeholder={words.placeholder}
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
        {words.begin}
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
        {words.skip}
        </button>
        </div>

        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.55, margin: "1.4rem 0 0", maxWidth: "62ch" }}>
        {words.later}
        </p>

        </div>
        </div>
    );
};

export default FirstRunKey;
