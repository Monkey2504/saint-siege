/*! Open Historia — the bulletin: the page the game opens on © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import dayjs from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
// Les dates dans la langue du journal. Sans cette locale, dayjs imprime
// « 14 March 2027 » sur une page par ailleurs entièrement française — et la
// traduction d'exécution ne rattrape pas un mois formaté par une bibliothèque.
import "dayjs/locale/fr";
import {
    readActionsState,
    readEventsState,
    readGameData,
    readWorldState,
} from "../../runtime/gameState.js";
import { economyIndicators } from "../../runtime/economy.js";
import { ActionsPanel } from "./actions.jsx";
import { writeWorldState } from "../../runtime/gameState.js";
import { inaugurate, isInaugurated } from "../../runtime/inauguration.js";
import { ensureRegisterBaseline, registerRows } from "../../runtime/register.js";
import { normalizeChurch, totalFaithful } from "../../runtime/churchFaithful.js";
import { frontRows } from "../../runtime/fronts.js";
import { CANDIDATES, SEATS, seatCabinet } from "../../runtime/advisors.js";
import { CONCENTRATION_CEILING, driveMovement, sourceShares } from "../../runtime/drives.js";
import { normalizeRecord } from "../../runtime/record.js";
import { normalizeTreasuries } from "../../runtime/treasuries.js";
import { normalizeGatherings } from "../../runtime/gatherings.js";
import { outageNotice } from "../../runtime/outageNotice.js";
import { ChampDeCle } from "../../runtime/FirstRunKey.jsx";
import { preferredLanguage } from "../../runtime/i18n.js";
import { nextEdition } from "../../runtime/nextEdition.js";
import { useSurface } from "../../runtime/useSurface.js";
import { simulateAutoJump, simulateTimelineJump } from "../AI/gameplay.js";
import { CONTENU_TOP } from "./chrome.js";
import { CahierVide, SectionHead, fmtCount, fmtDate, fmtEntier, fmtMoney, fmtSY, moneyOf } from "./journal.jsx";
import { ligneDeRegistre } from "../../runtime/registerWords.js";
import { ApercuDuCollege } from "./college.jsx";

// Written as a page, not as a panel dressed up as one. Nothing here inherits the
// floating-drawer chrome the rest of the interface was built from: no border, no
// radius, no shadow, no close button in a corner. It is a sheet of newsprint —
// a masthead, a dateline, stories in a column, and a rail carrying the orders
// standing in the player's name and the ledger they are spent against.

dayjs.locale("fr");
dayjs.extend(advancedFormat);

// fmtDate vient de journal.jsx : la date du journal s'écrit d'une seule façon,
// et les cahiers qui ne passent pas par cette page en ont besoin aussi.

// fmtSY vient de journal.jsx : l'unité du moteur s'écrit d'une seule façon.


// L'argent est ce qu'imprime une première page ; les années-subsistance sont
// l'unité du moteur et restent sur la ligne du dessous, pour que les deux ne
// puissent jamais se contredire en silence. Les deux fonctions vivaient ici en
// double de journal.jsx — deux écritures d'une même somme finissent par diverger
// — et n'y vivent plus.


const Dateline = ({ children, tone = "alert" }) => (
    <span
    style={{
        background: tone === "alert" ? "var(--oh-alert)" : "var(--oh-accent)",
        color: "var(--oh-on-accent)",
        display: "inline-block",
        fontFamily: "var(--oh-font-label)",
        fontSize: "var(--oh-t-2xs)",
        fontWeight: 700,
        letterSpacing: "var(--oh-label-track)",
        marginBottom: "0.5rem",
        padding: "0.18rem 0.45rem",
    }}
    >
    {children}
    </span>
);

// Une photographie par page, qui suit le lieu quand l'événement en nomme un.
// Les crédits sont dans public/CREDITS.md et repris sous l'image : la licence
// CC BY n'est tenue que si l'auteur est nommé là où l'image est vue.
const PHOTOGRAPHIES = [
    { motifs: /basilique|saint-pierre|st\.? peter|coupole|nef/i, src: "/basilica.jpg", credit: "Vyacheslav Argenberg, CC BY 4.0" },
    { motifs: /.*/,                                              src: "/vatican.jpg",  credit: "lafiguradelpadre Congreso, CC BY 2.0" },
];
const photographiePour = (texte) => PHOTOGRAPHIES.find((p) => p.motifs.test(String(texte || ""))) || PHOTOGRAPHIES[1];

const Photographie = ({ sujet }) => {
    const photo = photographiePour(sujet);
    return (
    <figure style={{ borderTop: "var(--oh-filet) solid var(--oh-line)", margin: "0 0 0.9rem", paddingTop: "0.6rem" }}>
    <img
    src={photo.src}
    alt=""
    loading="lazy"
    style={{ aspectRatio: "3 / 2", display: "block", objectFit: "cover", objectPosition: "center 45%", width: "100%" }}
    />
    <figcaption style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", paddingTop: "0.25rem", textAlign: "right" }}>
    {photo.credit}
    </figcaption>
    </figure>
    );
};

// L'article de tête, d'après le brief de la session de design. Ce qui le fait
// tenir n'est pas une couleur mais un écart : le titre fait quatre fois le
// corps. Une page de journal n'a qu'un premier plan, d'où le fait que ce
// composant ne serve qu'une fois par écran.
const ArticleDeUne = ({ dateline, tone = "alert", titre, chapo, sujet, encadre, children }) => (
    <article style={{ borderTop: "var(--oh-filet) solid var(--oh-line)", padding: "0.95rem 0 1.4rem" }}>
    {dateline && <Dateline tone={tone}>{dateline}</Dateline>}
    <h2
    style={{
        color: "var(--oh-text-strong)",
        fontFamily: "var(--oh-font-serif)",
        fontSize: "var(--oh-t-2xl)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.02,
        margin: "0 0 0.55rem",
        textWrap: "balance",
    }}
    >
    {titre}
    </h2>
    {chapo && (
        <p
        style={{
            color: "var(--oh-text-dim)",
            fontFamily: "var(--oh-font-serif)",
            fontSize: "var(--oh-t-md)",
            fontStyle: "italic",
            fontWeight: 400,
            lineHeight: 1.45,
            margin: "0 0 0.9rem",
            maxWidth: "52ch",
        }}
        >
        {chapo}
        </p>
    )}
    {sujet !== undefined && <Photographie sujet={sujet} />}
    {children && (
        <div className="oh-une-corps" style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-sm)", lineHeight: 1.5 }}>
        {children}
        </div>
    )}
    {encadre && (
        <aside style={{ borderTop: "var(--oh-filet-fort) solid var(--oh-accent)", marginTop: "1.1rem", paddingTop: "0.5rem" }}>
        <div className="oh-label" style={{ color: "var(--oh-accent)" }}>Ce que cela change</div>
        <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.4rem", maxWidth: "52ch" }}>
        {encadre}
        </div>
        </aside>
    )}
    </article>
);

const Story = ({ event, lead = false, tone }) =>
    lead ? (
    <ArticleDeUne
    dateline={event.date ? `${fmtDate(event.date)} · Rome`.toUpperCase() : null}
    tone={tone}
    titre={event.title}
    sujet={`${event.title || ""} ${event.location || ""}`}
    >
    {event.description && (
        <div className="timeline-markdown"><ReactMarkdown>{event.description}</ReactMarkdown></div>
    )}
    </ArticleDeUne>
    ) : (
    <article style={{ borderTop: "1px solid var(--oh-line)", padding: "0.95rem 0 1.15rem" }}>
    <Dateline tone={tone}>{fmtDate(event.date, "D MMM YYYY")}</Dateline>
    {/* Le titre est en romain, comme la maquette : c'est ce qui fait lire un
        article de journal plutôt qu'une carte d'application. */}
    <h3
    style={{
        color: "var(--oh-text-strong)",
        fontFamily: "var(--oh-font-serif)",
        fontSize: "var(--oh-t-md)",
        fontWeight: 700,
        letterSpacing: "-0.02em",
        lineHeight: 1.12,
        margin: "0 0 0.45rem",
        textWrap: "balance",
    }}
    >
    {event.title}
    </h3>
    {event.description && (
        <div
        className="timeline-markdown"
        style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-sm)", lineHeight: 1.5, maxWidth: "46ch" }}
        >
        <ReactMarkdown>{event.description}</ReactMarkdown>
        </div>
    )}
    </article>
    );

// Ce que la une porte tant qu'aucun événement n'est encore arrivé. Le brief de
// la session de design est net là-dessus : une colonne de tête sans titre n'est
// pas une une, c'est un paragraphe. Il y a de quoi en écrire un — le programme
// sur lequel le pape vient d'être élu, et la situation qu'il trouve — et rien
// ici n'est inventé : le titre porte le nom qu'il a pris, le chapô est sa
// profession de foi mot pour mot, l'encadré ne nomme que des chantiers que le
// monde tient déjà.
const str = (v) => String(v ?? "").trim();

/**
 * « Ce que cela change », d'après runtime/inauguration.js et rien d'autre.
 *
 * Deux versions de cet encadré ont menti au joueur, chacune à sa façon.
 *
 * La première annonçait que N chantiers « répondaient à ce qui a été déclaré »
 * et les donnait pour, alors que le moteur ne calculait rien de tel. La seconde
 * montrait honnêtement la position debout de chacun — « (contre) », « (pour) »
 * — et le joueur l'a refusée trois fois : « je veux que tu arrêtes avec l'idée
 * que certains sont d'accord et d'autres pas, cela dépend de ce que l'on dit ou
 * fait. »
 *
 * Il a raison, et c'est aussi la meilleure modélisation. Une puissance n'est pas
 * pour ou contre un pape : elle poursuit quelque chose, et elle juge chaque
 * phrase par ce que cette phrase fait à sa poursuite. L'encadré ne distribue
 * donc plus de camps. Il dit que tout le monde lit, il nomme les chantiers dont
 * le terrain est explicitement en jeu — ceux-là se mettent au travail, c'est le
 * seul effet mécanique —, et il renvoie le reste à l'édition, où le modèle lit
 * la déclaration mot pour mot et décide.
 */
// Les `hits` sont des radicaux — « rich », « financ », « transparen » — et les
// montrer tels quels donne « (« rich », contre) », qui ne ressemble à rien de ce
// que le joueur a écrit. On retrouve le mot entier dans sa déclaration.
const motEntier = (declaration, radical) => {
    const mots = String(declaration || "").split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    const trouve = mots.find((m) => m.toLowerCase().startsWith(String(radical).toLowerCase()));
    return trouve || radical;
};

const CeQueCelaChange = ({ reactions, declaration }) => {
    const nommes = reactions.filter((r) => Array.isArray(r.hits) && r.hits.length > 0);

    return (
    <>
    <p style={{ margin: "0 0 0.5rem" }}>
    Votre programme est versé à l&apos;édition. {reactions.length === 1 ? "La puissance" : `Les ${reactions.length} puissances`} qui
    {reactions.length === 1 ? " se tient" : " se tiennent"} dans ce monde {reactions.length === 1 ? "le lit" : "le lisent"} tel que vous
    l&apos;avez écrit, et {reactions.length === 1 ? "juge" : "jugent"} sur la phrase : aucune n&apos;est pour ou
    contre vous d&apos;avance. Ce qu&apos;elles en font paraît dans la prochaine édition — une déclaration,
    un geste, une fuite, un serrage de rangs, un silence.
    </p>
    {nommes.length > 0 ? (
        <p style={{ margin: "0 0 0.5rem" }}>
        {nommes.length === 1 ? "Un chantier en cours voit son terrain en jeu et se met au travail : " : `${nommes.length} chantiers en cours voient leur terrain en jeu et se mettent au travail : `}
        {nommes.map((r, i) => (
            <span key={`${r.owner}-${i}`}>
            {i > 0 ? ", " : ""}
            <b style={{ color: "var(--oh-text-strong)" }}>{r.owner}</b>
            {` (« ${[...new Set(r.hits.map((h) => motEntier(declaration, h)))].join(" », « ")} »)`}
            </span>
        ))}
        .
        </p>
    ) : (
        <p style={{ margin: "0 0 0.5rem" }}>
        Aucun chantier en cours ne voit son terrain nommé : rien ne se met en mouvement
        de soi-même, ce qui ne veut pas dire que personne ne répondra.
        </p>
    )}

    </>
    );
};

const Situation = ({ briefing, date, world, awaitingInauguration }) => {
    const inauguration = world?.inauguration;
    const nom = str(inauguration?.name);
    const declaration = str(inauguration?.declaration);
    const reactions = Array.isArray(inauguration?.reactions) ? inauguration.reactions.filter((r) => r && r.owner) : [];
    const elu = Boolean(!awaitingInauguration && nom && declaration);

    const jour = date ? fmtDate(date) : "";

    if (!elu && !briefing) {
        return (
        <>
        <SectionHead aside={jour}>La situation</SectionHead>
        <CahierVide quoiFaire="La première édition paraîtra dès que le pontificat sera signé ; d'ici là, le monde n'a rien dit.">
        Aucune situation d&apos;ouverture n&apos;a été écrite pour ce début.
        </CahierVide>
        </>
        );
    }

    const corpsRepeteLaDeclaration = Boolean(elu && declaration && briefing && briefing.includes(declaration));
    const texte = corpsRepeteLaDeclaration ? "" : (briefing || "");

    return (
    <>
    <SectionHead aside={jour}>{elu ? "La une" : "La situation"}</SectionHead>
    <ArticleDeUne
    dateline={jour ? `${jour} · Rome`.toUpperCase() : null}
    titre={elu ? `${nom} a été élu sur ce programme` : "Ce que le nouveau pape trouve en arrivant"}
    chapo={elu ? `«\u00a0${declaration}\u00a0»` : null}
    sujet={elu ? "basilique" : ""}
    encadre={elu ? <CeQueCelaChange reactions={reactions} declaration={declaration} /> : null}
    >
    {texte}
    </ArticleDeUne>
    </>
    );
};

// A pope's first act is not a jump. He takes a name and tells the Church what he
// was elected to change, in front of it — and both become state the whole engine
// reads (runtime/inauguration.js). Until this sheet is signed the first turn
// cannot be run; the tab at the foot of the page says so.
const Inauguration = ({ world, player, onDone }) => {
    const [name, setName] = useState("");
    const [declaration, setDeclaration] = useState("");
    const [seated, setSeated] = useState([]);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    // Three of twenty, each with a gift and a flaw the engine actually reads
    // (runtime/advisors.js). Asked here rather than in a settings panel because
    // this is the moment a pontificate is decided, and because the player's own
    // instruction was that a new player should meet the game itself first:
    // "qu'il choisisse 3 conseillers parmi une vingtaine qui ont des qualités et
    // défauts différents, et qu'il soit dans le jeu. Immersion dès le début."
    const toggle = (id) => setSeated((current) => {
        if (current.includes(id)) return current.filter((x) => x !== id);
        return current.length >= SEATS ? current : [...current, id];
    });

    const sign = async () => {
        if (busy) return;
        setError("");
        if (seated.length !== SEATS) {
            setError(`Choisissez ${SEATS} conseillers : ils décident de ce que vous pourrez faire.`);
            return;
        }
        setBusy(true);
        try {
            const next = seatCabinet(inaugurate(world, { name, declaration }), seated, { date: world?.asOf || "" });
            await writeWorldState(next);
            onDone(next);
        } catch (failure) {
            setError(failure?.message || "La déclaration n'a pas pu être enregistrée.");
        } finally {
            setBusy(false);
        }
    };

    const fieldStyle = {
        background: "var(--oh-plate-2)",
        border: "1px solid var(--oh-line)",
        color: "var(--oh-text-strong)",
        fontFamily: "var(--oh-font-body)",
        fontSize: "var(--oh-t-base)",
        padding: "0.65rem 0.8rem",
        width: "100%",
    };

    return (
        <div>
        <div style={{ maxWidth: "62ch" }}>
        <SectionHead aside={player}>Habemus papam</SectionHead>
        <p style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-md)", lineHeight: 1.55, margin: "1rem 0 1.4rem" }}>
        Vous avez été élu. Avant que le premier jour du pontificat se joue, l'Église doit savoir trois choses : le nom que vous prenez, ceux dont vous vous entourez, et ce que vous avez été élu pour changer. Ce que vous écrivez ici n'est pas une préface — cela devient votre programme, et les courants vous mesureront à lui.
        </p>
        <label className="oh-label" style={{ color: "var(--oh-text-strong)", display: "block", marginBottom: "0.4rem" }}>Le nom que vous prenez</label>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Léon XV, Jean XXIV, Pie XIII…" style={fieldStyle} autoFocus />
        </div>

        {/* The cabinet. Twenty candidates, three seats, and every gift paired
            with what it costs — the choice is the first real decision of the
            pontificate, so it is made before anything else. */}
        <div style={{ margin: "1.8rem 0 0" }}>
        <div style={{ alignItems: "baseline", borderBottom: "1px solid var(--oh-line)", display: "flex", gap: "1rem", justifyContent: "space-between", paddingBottom: "0.4rem" }}>
        <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>Votre cabinet</span>
        <span style={{ color: seated.length === SEATS ? "var(--oh-grant)" : "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", fontWeight: 700 }}>
        {seated.length} / {SEATS} choisis
        </span>
        </div>
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.5rem 0 0.9rem", maxWidth: "62ch" }}>
        Trois sièges pour vingt candidats. Chacun apporte quelque chose et coûte quelque chose : ce que vous ne prenez pas, vous ne l'aurez pas.
        </p>
        <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fill, minmax(19rem, 1fr))" }}>
        {CANDIDATES.map((who) => {
            const on = seated.includes(who.id);
            const full = seated.length >= SEATS && !on;
            return (
                <button
                key={who.id}
                type="button"
                onClick={() => toggle(who.id)}
                style={{
                    background: on ? "var(--oh-accent-soft)" : "transparent",
                    border: `1px solid ${on ? "var(--oh-accent)" : "var(--oh-line)"}`,
                    color: "var(--oh-text)",
                    cursor: full ? "default" : "pointer",
                    fontFamily: "var(--oh-font-body)",
                    opacity: full ? 0.45 : 1,
                    padding: "0.7rem 0.85rem",
                    textAlign: "left",
                }}
                >
                <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-sm)", fontWeight: 700 }}>{who.name}</div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginBottom: "0.4rem" }}>{who.charge}</div>
                <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-2xs)", fontStyle: "italic", lineHeight: 1.45, marginBottom: "0.45rem" }}>{who.line}</div>
                <div style={{ color: "var(--oh-grant)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.4 }}>+ {who.boonSays}</div>
                <div style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.4 }}>− {who.baneSays}</div>
                </button>
            );
        })}
        </div>
        </div>

        <div style={{ margin: "1.8rem 0 0", maxWidth: "62ch" }}>
        <label className="oh-label" style={{ color: "var(--oh-text-strong)", display: "block", marginBottom: "0.4rem" }}>Votre déclaration devant l'Église</label>
        <textarea
        value={declaration}
        onChange={(e) => setDeclaration(e.target.value)}
        placeholder="Ce que vous avez été élu pour changer. Toute l'Église le lira, et vous y tiendra."
        rows={5}
        style={{ ...fieldStyle, lineHeight: 1.5, resize: "vertical" }}
        />
        {error && <div style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-sm)", marginTop: "0.6rem" }}>{error}</div>}
        <button
        type="button"
        onClick={sign}
        disabled={busy}
        style={{
            background: "var(--oh-accent)",
            border: 0,
            color: "var(--oh-on-accent)",
            cursor: busy ? "wait" : "pointer",
            fontFamily: "var(--oh-font-label)",
            fontSize: "var(--oh-t-xs)",
            fontWeight: 700,
            letterSpacing: "var(--oh-label-track)",
            marginTop: "1.2rem",
            padding: "0.75rem 1.2rem",
            textTransform: "var(--oh-label-case)",
        }}
        >
        Signer et commencer le pontificat
        </button>
        </div>
        </div>
    );
};

// Beside a figure: which way it has gone since the baseline, and whether that is
// the right way for this figure. A flat figure prints nothing — silence is the
// honest mark when nothing moved.
const Movement = ({ row, format }) => {
    if (!row || row.direction === "flat" || row.delta == null) return null;
    const colour = row.good == null ? "var(--oh-text-dim)" : row.good ? "var(--oh-grant)" : "var(--oh-alert)";
    const glyph = row.direction === "up" ? "▲" : "▼";
    return (
        <span style={{ color: colour, fontSize: "var(--oh-t-2xs)", fontWeight: 700, marginLeft: "0.45rem", whiteSpace: "nowrap" }} title={`depuis ${row.from == null ? "le début" : format(row.from)}`}>
        {glyph} {format(Math.abs(row.delta))}
        </span>
    );
};

// fmtCount vient de journal.jsx : un dénombrement s'écrit d'une seule façon.

// ── The six fronts ───────────────────────────────────────────────────────────
//
// Field report, in the player's words: "c'est trop finance parce que moi je
// suis financier. Il y a des gens qui ne vont jamais faire un seul truc de
// finances, et tout leur retour ne sera que finance."
//
// He was right, and the count proved it: of the twelve figures the register
// prints, ten were money. A pope who spent his pontificate on vocations, on the
// abuse files, on holding the college together or on making peace read a page
// that never once mentioned any of it, concluded the game had not registered
// what he did, and went to ask someone. The engine now holds all six
// (runtime/fronts.js); this is where they are read.
//
// A front with no figure prints as absent rather than as zero: a scenario with
// no college has no unity to lose, and a bar at nothing would say the opposite.
const FRONT_FORMAT = {
    share: (v) => `${Math.round(v)}\u202f%`,
    count: fmtCount,
    money: (v) => `${fmtEntier(v)}\u202fAS`,
};

const Front = ({ row }) => {
    const format = FRONT_FORMAT[row.unit] ?? fmtCount;
    const held = row.value != null;
    return (
        <div style={{ borderTop: "1px solid var(--oh-line)", padding: "0.55rem 0 0.6rem" }}>
        <div style={{ alignItems: "baseline", display: "flex", gap: "0.5rem", justifyContent: "space-between" }}>
        <span style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)" }}>{row.label}</span>
        <span style={{ alignItems: "baseline", display: "flex", flexShrink: 0 }}>
        <b style={{ color: held ? "var(--oh-text-strong)" : "var(--oh-text-dim)", fontFamily: "var(--oh-font-data)", fontSize: "var(--oh-t-sm)", fontVariantNumeric: "tabular-nums" }}>
        {held ? format(row.value) : "non mesuré"}
        </b>
        <Movement row={row} format={format} />
        </span>
        </div>
        </div>
    );
};

const Fronts = ({ rows }) => (
    <section style={{ borderBottom: "1px solid var(--oh-line)", padding: "0.9rem 0 1rem" }}>
    <SectionHead aside="depuis le début du pontificat">Les six fronts</SectionHead>
    <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, margin: "0.5rem 0 0.7rem", maxWidth: "54ch" }}>
    Un pontificat se juge sur les six à la fois. L&apos;argent est l&apos;un d&apos;eux.
    <br />
    Unités : part en pourcentage, effectifs en nombre de personnes, argent en années-subsistance (AS).
    </p>
    {rows.map((row) => <Front key={row.key} row={row} />)}
    </section>
);

// ── The press ────────────────────────────────────────────────────────────────
// The next turn is the next edition. The reader does NOT choose how far the
// presses run: the engine reads what is at the desk and fixes the date itself
// (runtime/nextEdition.js), and the button says that date before it is pressed.
//
// Field report: the page opened on five span buttons and a default of one
// month, and the reader — who had never once set a date on purpose — was being
// asked, every single turn, a question only the engine could answer. A letter
// written and then jumped a year lands eleven months after it mattered. The
// automatic jump existed in the engine all along (AI/gameplay.js
// simulateAutoJump, its own task and its own schema); when the turn moved onto
// this page only the manual jump came with it.
//
// So the automatic jump is the button, and setting a date by hand is the
// exception it always was — folded away behind "set the date myself".
const SPANS = [
    { label: "1 week", days: 7 },
    { label: "1 month", days: 30 },
    { label: "3 months", days: 90 },
    { label: "6 months", days: 180 },
    { label: "1 year", days: 365 },
];

// Les montants à la française : virgule décimale, « Md » pour le milliard, et
// le vrai signe moins « − » plutôt que le trait d'union.
const fmtMillions = (value, currency = "") => {
    const n = Number(value);
    if (!Number.isFinite(n)) return "—";
    const decimal = (v, digits) => v.toFixed(digits).replace(".", ",").replace("-", "−");
    const unit = Math.abs(n) >= 1000 ? `${decimal(n / 1000, 1)} Md` : `${decimal(Math.round(n * 10) / 10, 1)} M`;
    return currency ? `${unit} ${currency}` : unit;
};

const Press = ({ game, world, actions, focus, onPrinted }) => {
    const [running, setRunning] = useState(false);
    const [error, setError] = useState("");
    const [stopped, setStopped] = useState(false);
    // The exception, not the rule: a reader who wants a particular date opens
    // this and picks a span. Closed, the engine decides.
    const [byHand, setByHand] = useState(false);
    const [chosen, setChosen] = useState(30);
    const abortRef = useRef(null);
    const ref = useRef(null);

    // The "Next edition" tab lands the reader here.
    useEffect(() => {
        if (focus && ref.current) ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }, [focus]);

    const inaugurated = Boolean(world && isInaugurated(world));
    const from = game?.gameDate ? dayjs(game.gameDate) : null;
    // The engine's own reading of the desk, re-derived whenever an order is
    // added or an edition prints.
    const auto = useMemo(
        () => nextEdition(world, actions, { today: game?.gameDate || "" }),
        [world, actions, game?.gameDate],
    );
    const days = byHand ? chosen : auto.days;
    const to = from && from.isValid() ? from.add(days, "day") : null;

    const print = async () => {
        if (running || !inaugurated || !game) return;
        setRunning(true);
        setError("");
        setStopped(false);
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            // The automatic jump is a different task from the manual one: it
            // reads the desk and carries the world of its own accord, which is
            // exactly what a reader who never sets a date is asking for.
            await (byHand
                ? simulateTimelineJump({ days, signal: controller.signal })
                : simulateAutoJump({ days, signal: controller.signal }));
            onPrinted();
        } catch (err) {
            // Field report: Stop left the page on the pre-press sheet and said
            // nothing, while the engine had already convoked the gatherings,
            // moved the treasuries and written the record rows — all of it
            // saved. The reader saw the old figures, concluded the order had
            // never gone out, and issued it again, paying twice for one
            // convocation. An abort is not a rollback: re-read the state, and
            // say on the page that what was committed stands.
            if (controller.signal.aborted || err?.name === "AbortError") {
                setStopped(true);
                onPrinted();
            } else {
                setError(err?.message || "L'édition n'a pas pu être imprimée.");
            }
        } finally {
            abortRef.current = null;
            setRunning(false);
        }
    };
    const stop = () => abortRef.current?.abort(new DOMException("Edition cancelled.", "AbortError"));

    return (
        <section ref={ref} style={{ borderBottom: "var(--oh-filet) solid var(--oh-line)", borderTop: "var(--oh-filet-fort) solid var(--oh-text-strong)", padding: "0.6rem 0 1rem" }}>
        <div style={{ alignItems: "baseline", display: "flex", gap: "1rem", justifyContent: "space-between" }}>
        <span className="oh-label" style={{ color: "var(--oh-text-strong)" }}>Prochaine édition</span>
        <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{from ? `depuis le ${fmtDate(from)}` : ""}</span>
        </div>
        <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-xl)", fontWeight: 800, letterSpacing: "-0.03em", lineHeight: 1.05, margin: "0.5rem 0 0.2rem" }}>
        {to ? fmtDate(to) : "—"}
        </div>
        <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginBottom: "0.7rem" }}>
        {byHand ? "la date que portera la prochaine feuille" : `fixée par ${auto.reason}${auto.from ? ` — ${auto.from}` : ""}`}
        </div>
        <div style={{ marginBottom: "0.8rem" }}>
        <button
        type="button"
        disabled={running}
        onClick={() => setByHand((open) => !open)}
        style={{
            background: "none",
            border: 0,
            color: "var(--oh-text-dim)",
            cursor: running ? "default" : "pointer",
            fontFamily: "var(--oh-font-label)",
            fontSize: "var(--oh-t-2xs)",
            letterSpacing: "var(--oh-label-track)",
            padding: 0,
            textDecoration: "underline",
            textTransform: "var(--oh-label-case)",
        }}
        >
        {byHand ? "laisser le dossier fixer la date" : "régler la date moi-même"}
        </button>
        </div>
        {byHand && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginBottom: "0.8rem" }}>
        {SPANS.map((span) => {
            const active = span.days === days;
            return (
                <button
                key={span.days}
                type="button"
                disabled={running}
                onClick={() => setChosen(span.days)}
                style={{
                    background: active ? "var(--oh-accent)" : "transparent",
                    border: `1px solid ${active ? "var(--oh-accent)" : "var(--oh-line)"}`,
                    color: active ? "var(--oh-on-accent)" : "var(--oh-text)",
                    cursor: running ? "default" : "pointer",
                    fontFamily: "var(--oh-font-label)",
                    fontSize: "var(--oh-t-2xs)",
                    fontWeight: 700,
                    letterSpacing: "var(--oh-label-track)",
                    padding: "0.4rem 0.7rem",
                    textTransform: "var(--oh-label-case)",
                }}
                >
                {span.label}
                </button>
            );
        })}
        </div>
        )}
        {!inaugurated ? (
            <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", lineHeight: 1.5, margin: 0, maxWidth: "40ch" }}>
            Les presses attendent : le pape prend un nom et déclare son programme avant que la première édition sorte.
            </p>
        ) : running ? (
            <div style={{ alignItems: "center", display: "flex", gap: "0.8rem" }}>
            <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-md)", fontWeight: 700 }}>Sous presse…</span>
            <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)" }}>le monde répond à vos ordres</span>
            <button type="button" onClick={stop} style={{ background: "none", border: "1px solid var(--oh-alert)", color: "var(--oh-alert)", cursor: "pointer", fontFamily: "var(--oh-font-label)", fontSize: "var(--oh-t-2xs)", fontWeight: 700, letterSpacing: "var(--oh-label-track)", marginLeft: "auto", padding: "0.4rem 0.7rem", textTransform: "var(--oh-label-case)" }}>Arrêter</button>
            </div>
        ) : (
            <button
            type="button"
            onClick={print}
            style={{
                background: "var(--oh-line-strong)",
                border: 0,
                color: "var(--oh-on-accent)",
                cursor: "pointer",
                fontFamily: "var(--oh-font-label)",
                fontSize: "var(--oh-t-sm)",
                fontWeight: 700,
                letterSpacing: "var(--oh-label-track)",
                padding: "0.85rem 1.2rem",
                textTransform: "var(--oh-label-case)",
                width: "100%",
            }}
            >
            Mettre sous presse
            </button>
        )}
        {error && (
            <p style={{ color: "var(--oh-alert)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.6rem 0 0" }}>{error}</p>
        )}
        {stopped && (
            <p style={{ color: "var(--oh-caution)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, margin: "0.6rem 0 0", maxWidth: "44ch" }}>
            L'édition a été interrompue. Les ordres que le moteur avait déjà exécutés tiennent — rassemblements convoqués, argent déplacé, promesses engagées — et cette feuille a été relue pour les montrer. Lisez le registre avant d'ordonner deux fois la même chose.
            </p>
        )}
        </section>
    );
};

// ── Drives ───────────────────────────────────────────────────────────────────
// Money being raised, as the engine holds it (runtime/drives.js): the target,
// what was pledged, what actually came in, and what moved since the last
// edition. A drive the stories call a success and this shows at zero is the
// point of the block.
const Drives = ({ drives, sinceDate, player }) => {
    // What is worth a reader's eye: the campaigns still running, and the ones
    // that actually brought something in. A closed drive that never received a
    // penny is not history, it is clutter — five of them once filled the rail,
    // each announcing that nothing had moved.
    const list = useMemo(
        () => (Array.isArray(drives) ? drives : []).filter((d) => d.status !== "closed" || d.collected > 0),
        [drives],
    );
    // Who is actually paying. An undertaking meant to be worldwide and carried
    // by one donor reads as such here, in a figure rather than in a story.
    const shares = useMemo(() => sourceShares(list, { owner: player }), [list, player]);
    const top = shares[0];
    if (!list.length) return null;
    return (
        <section>
        <SectionHead aside={`${list.length} ${list.length === 1 ? "campaign" : "campaigns"}`}>Campagnes</SectionHead>
        {top && top.pledged > 0 && (
            <div style={{ borderBottom: "1px dotted var(--oh-line)", padding: "0.6rem 0" }}>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>
            who is paying · {shares.length} {shares.length === 1 ? "contributor" : "contributors"}
            </div>
            <div style={{ alignItems: "baseline", display: "flex", gap: "0.5rem", marginTop: "0.15rem" }}>
            <span style={{ color: top.shareOfPledged > CONCENTRATION_CEILING ? "var(--oh-caution)" : "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
            {Math.round(top.shareOfPledged * 100)}%
            </span>
            <span style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-sm)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{top.source}</span>
            </div>
            {top.shareOfPledged > CONCENTRATION_CEILING && (
                <div style={{ color: "var(--oh-caution)", fontSize: "var(--oh-t-xs)", lineHeight: 1.45, marginTop: "0.3rem", maxWidth: "42ch" }}>
                Un seul contributeur la porte. C'est une dépendance à une seule bourse, pas une créance sur ce que vous possédez — elle cesse le jour où d'autres promettent vraiment.
                </div>
            )}
            </div>
        )}
        {list.map((drive) => {
            const pledgedShare = drive.target > 0 ? Math.min(1, drive.pledged / drive.target) : 0;
            const collectedShare = drive.target > 0 ? Math.min(1, drive.collected / drive.target) : 0;
            const moved = driveMovement(drive, sinceDate);
            const remaining = Math.max(0, drive.target - drive.pledged);
            return (
                <div key={drive.id} style={{ borderBottom: "1px dotted var(--oh-line)", padding: "0.8rem 0" }}>
                <div style={{ alignItems: "baseline", display: "flex", gap: "0.8rem", justifyContent: "space-between" }}>
                <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-md)", fontWeight: 700, letterSpacing: "-0.01em" }}>{drive.name}</span>
                <span className="oh-label" style={{ color: drive.status === "closed" ? "var(--oh-text-dim)" : "var(--oh-accent)", fontSize: "var(--oh-t-2xs)" }}>{drive.status === "closed" ? "closed" : "open"}</span>
                </div>
                <div style={{ background: "var(--oh-plate-2)", height: "0.55rem", margin: "0.5rem 0 0.4rem", position: "relative" }}>
                <div style={{ background: "var(--oh-accent-soft)", height: "100%", left: 0, position: "absolute", top: 0, width: `${pledgedShare * 100}%` }} />
                <div style={{ background: "var(--oh-grant)", height: "100%", left: 0, position: "absolute", top: 0, width: `${collectedShare * 100}%` }} />
                </div>
                <div style={{ display: "grid", gap: "0.3rem 1rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
                <div>
                <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmtMillions(drive.collected)}</div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>collected</div>
                </div>
                <div>
                <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmtMillions(drive.pledged)}</div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>pledged</div>
                </div>
                <div>
                <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmtMillions(drive.target, drive.currency)}</div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>
                target{drive.pledged > drive.collected ? ` · ${fmtMillions(drive.pledged - drive.collected)} promised, not in hand` : ""}{remaining > 0 ? ` · ${fmtMillions(remaining)} still to find` : ""}
                </div>
                </div>
                </div>
                {/* Said only of a campaign still running: a closed drive is
                    finished, and reproaching it for standing still is noise. */}
                {drive.status !== "closed" && (
                    <div style={{ color: moved.pledged > 0 || moved.collected > 0 ? "var(--oh-grant)" : "var(--oh-alert)", fontSize: "var(--oh-t-xs)", fontWeight: 600, marginTop: "0.5rem" }}>
                    {moved.pledged > 0 || moved.collected > 0
                        ? `Since the last edition: +${fmtMillions(moved.pledged)} pledged, +${fmtMillions(moved.collected)} collected.`
                        : "Rien n'a bougé depuis la dernière édition, quoi qu'en disent les récits."}
                    </div>
                )}
                </div>
            );
        })}
        </section>
    );
};

// ── The record ───────────────────────────────────────────────────────────────
// The non-narrative floor under the paper: one dated line per stock the engine
// actually moved. Stories never write here, so a page that stays empty while
// the editions announce fortunes is itself the answer.
// Les lignes du registre qui regardent ce joueur.
//
// Field report: rows were kept only when r.polity was the player, so a
// federation that earned on its capital, was paid its running costs and
// distributed to its members all turn had every one of those rows thrown
// away — and the panel then printed "Nothing has moved" over the busiest
// turn in the game. A body's purse is the player's money; it is only held
// one level down, so its rows belong on the same paper, named.
//
// Exportée parce que le bandeau de l'édition les compte : deux sélections
// séparées finiraient par annoncer un nombre que la table ne montre pas.
export const lignesDuRegistre = (record, treasuries, player) => {
    const bodies = new Map(normalizeTreasuries(treasuries).map((t) => [t.body.toLowerCase(), t.body]));
    return normalizeRecord(record)
        .filter((r) => !player || !r.polity || r.polity === player || bodies.has(r.polity.toLowerCase()))
        .slice(-12).reverse();
};

const Record = ({ record, treasuries, player, usdPerSY }) => {
    const bodies = useMemo(
        () => new Map(normalizeTreasuries(treasuries).map((t) => [t.body.toLowerCase(), t.body])),
        [treasuries],
    );
    const rows = useMemo(
        () => lignesDuRegistre(record, treasuries, player),
        [record, treasuries, player],
    );
    const money = (sy) => moneyOf(sy, usdPerSY);
    // Field report: every row went through money() whatever it measured, so
    // "faith renewed" at 223,803 people printed as a multi-billion-dollar
    // credit and a legitimacy point printed as dollars — on the one page the
    // player is told to trust over the narration. The row names its own unit
    // (runtime/record.js); print the amount in that unit and nothing else.
    const amountOf = (row) => {
        const size = Math.abs(row.amount);
        if (row.unit === "SY") return money(size);
        if (row.unit === "people") return `${fmtCount(size)} people`;
        return `${Math.round(size).toLocaleString("en-US")} ${row.unit}`;
    };
    return (
        <section>
        <SectionHead aside={rows.length ? `${rows.length} lignes` : "rien n'a bougé"}>Le registre</SectionHead>
        <p style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", fontStyle: "italic", lineHeight: 1.5, margin: "0.6rem 0 0.2rem", maxWidth: "44ch" }}>
        Écrit par le moteur, jamais par les récits : une ligne ne paraît ici que si un stock a réellement bougé.
        </p>
        {rows.length === 0 ? (
            <CahierVide ton="alert" quoiFaire="Il n'y a rien à faire ici : le registre se remplit de lui-même, une ligne tombant chaque fois qu'un ordre déplace réellement un stock.">
            Rien n&apos;a bougé. Quoi que les éditions aient dit d&apos;argent qui arrive, les stocks sont là où ils étaient.
            </CahierVide>
        ) : (
            <table className="oh-ledger">
            <tbody>
            {rows.map((row, i) => (
                <tr key={`${row.date}-${i}`}>
                <td>
                <span style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", display: "block" }}>
                {fmtDate(row.date, "D MMM YYYY")}
                {row.polity && row.polity !== player ? ` · ${bodies.get(row.polity.toLowerCase()) || ligneDeRegistre(row.polity)}` : ""}
                </span>
                {ligneDeRegistre(row.what)}
                </td>
                <td style={{ color: row.amount < 0 ? "var(--oh-alert)" : "var(--oh-grant)", fontWeight: 700, whiteSpace: "nowrap" }}>
                {row.amount < 0 ? "−" : "+"}{amountOf(row)}
                </td>
                </tr>
            ))}
            </tbody>
            </table>
        )}
        </section>
    );
};

// ── Bodies with a purse ──────────────────────────────────────────────────────
// A federation and the bodies inside it, each with its own money: what it
// holds, what its operations earn, and what it hands its members. The levels
// are shown by indentation, because a federation is the point.
const Purses = ({ treasuries, usdPerSY }) => {
    const list = useMemo(() => normalizeTreasuries(treasuries).filter((t) => t.status === "active"), [treasuries]);
    if (!list.length) return null;
    const money = (sy) => moneyOf(sy, usdPerSY);
    const roots = list.filter((t) => !t.parent || !list.some((p) => p.body === t.parent));
    const ordered = roots.flatMap((r) => [{ t: r, depth: 0 }, ...list.filter((c) => c.parent === r.body).map((c) => ({ t: c, depth: 1 }))]);
    // The rate a body actually earns: its own once it has shown one, and its
    // federation's until then. The same rule the engine's step uses, so the
    // page and the purse can never disagree about what a body is earning.
    const rateOf = (t) => (t.margin > 0 ? t.margin : (list.find((p) => p.body === t.parent)?.margin ?? 0));
    return (
        <section>
        <SectionHead aside={`${list.length} ${list.length === 1 ? "body" : "bodies"}`}>Caisses</SectionHead>
        {ordered.map(({ t, depth }) => (
            <div key={t.body} style={{ borderBottom: "1px dotted var(--oh-line)", padding: "0.7rem 0 0.7rem", paddingLeft: depth ? "1.2rem" : 0 }}>
            <div style={{ alignItems: "baseline", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
            <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: depth ? "var(--oh-t-sm)" : "var(--oh-t-md)", fontWeight: 700, letterSpacing: "-0.01em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {depth ? "└ " : ""}{t.body}
            </span>
            <span className="oh-label" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", flexShrink: 0 }}>{t.key}</span>
            </div>
            {/* The income in money, not only as a percentage: a rate applied to
                a figure the reader has to go and find is not a figure. */}
            <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.25rem" }}>
            {/* No rate on an empty purse: "capital $0 at 5.1%" states a return
                on nothing, and reads as a figure rather than as the absence of
                one. A body with no capital simply has no capital. */}
            {t.capital > 0
                ? <>capital {money(t.capital)} à {Math.round(rateOf(t) * 1000) / 10}%{rateOf(t) > 0 ? `, soit ${money(t.capital * rateOf(t))} par an` : ""}</>
                : <>sans capital</>} · {money(t.treasury)} in hand · keeps {Math.round(t.retain * 100)}%
            </div>
            {t.earnedMargin > 0 && t.capital > 0 && (
                <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.15rem" }}>
                Ses foules ont rapporté {money(t.capital * t.earnedMargin)} de plus par an, encaissés le jour même de chaque rassemblement.
                </div>
            )}
            {/* Where the rest goes. Saying only what a body keeps left the
                reader to guess at the other four fifths — and the beneficiary
                is the whole reason the body exists. */}
            {t.beneficiary && t.beneficiaryShare > 0 && (
                <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.15rem" }}>
                {Math.round(t.beneficiaryShare * 100)}% of the rest to {t.beneficiary}, which it exists to finance; the remainder shared by {t.key === "need" ? "need" : t.key}.
                </div>
            )}
            {/* The standing budget: the most consequential thing about a
                chapter, and it was nowhere on this page. */}
            {t.operatingBudget > 0 && (
                <div style={{ color: "var(--oh-text-strong)", fontSize: "var(--oh-t-xs)", lineHeight: 1.5, marginTop: "0.15rem" }}>
                Budget de fonctionnement {money(t.operatingBudget)} par an{t.fundedUntil ? `, financé jusqu'au ${fmtDate(t.fundedUntil, "D MMM YYYY")}` : ", pas encore financé"}. Ses rassemblements nationaux en sont payés.
                </div>
            )}
            {t.capital === 0 && t.treasury > 0 && (
                <div style={{ color: "var(--oh-caution)", fontSize: "var(--oh-t-xs)", lineHeight: 1.45, marginTop: "0.2rem" }}>
                Cet argent est de la trésorerie, pas du capital : il ne rapporte rien tant qu'il n'est ni placé ni dépensé.
                </div>
            )}
            {rateOf(t) === 0 && t.capital > 0 && (
                <div style={{ color: "var(--oh-caution)", fontSize: "var(--oh-t-xs)", marginTop: "0.2rem" }}>
                Ce capital n'est placé nulle part et ne rapporte rien.
                </div>
            )}
            </div>
        ))}
        </section>
    );
};

// ── Gatherings ───────────────────────────────────────────────────────────────
// The crowds themselves: what each one cost, how many came, what it left. The
// attendance is the engine's, not the story's, which is why it can be read as
// a result rather than as a claim.
const Gatherings = ({ gatherings, usdPerSY }) => {
    const list = useMemo(() => normalizeGatherings(gatherings).filter((g) => g.status !== "cancelled").slice(-6).reverse(), [gatherings]);
    if (!list.length) return null;
    const money = (sy) => moneyOf(sy, usdPerSY);
    return (
        <section>
        <SectionHead aside={`${list.length} ${list.length === 1 ? "gathering" : "gatherings"}`}>Rassemblements</SectionHead>
        {list.map((g) => (
            <div key={g.id} style={{ borderBottom: "1px dotted var(--oh-line)", padding: "0.7rem 0" }}>
            <div style={{ alignItems: "baseline", display: "flex", gap: "0.6rem", justifyContent: "space-between" }}>
            <span style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-md)", fontWeight: 700, letterSpacing: "-0.01em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
            <span className="oh-label" style={{ color: g.status === "held" ? "var(--oh-grant)" : "var(--oh-text-dim)", flexShrink: 0, fontSize: "var(--oh-t-2xs)" }}>{g.status === "held" ? "tenu" : "prévu"}</span>
            </div>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.1rem" }}>
            {[g.place, fmtDate(g.heldAt || g.date, "D MMM YYYY")].filter(Boolean).join(" · ")}
            </div>
            {g.status === "held" ? (
                <div style={{ display: "grid", gap: "0.3rem 1rem", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", marginTop: "0.45rem" }}>
                <div>
                <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{fmtCount(g.attendance)}</div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>venus</div>
                </div>
                <div>
                <div style={{ color: "var(--oh-text-strong)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>{money(g.revenue)}</div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>recettes · {money(g.cost)} de frais</div>
                </div>
                <div>
                <div style={{ color: g.surplus < 0 ? "var(--oh-alert)" : "var(--oh-grant)", fontFamily: "var(--oh-font-display)", fontSize: "var(--oh-t-lg)", fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1 }}>
                {g.surplus < 0 ? "−" : "+"}{money(Math.abs(g.surplus)).replace(/^[−+]/, "")}
                </div>
                <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)" }}>{g.surplus < 0 ? "perdus par" : "restés à"} {g.host}</div>
                </div>
                </div>
            ) : (
                <div style={{ color: "var(--oh-text)", fontSize: "var(--oh-t-xs)", lineHeight: 1.45, marginTop: "0.3rem" }}>
                {money(g.cost)} budgétés{g.expected > 0 ? `, en espérant ${fmtCount(g.expected)} personnes` : ", et le moteur dira combien viennent"}. Rien n'est encaissé tant que le jour n'est pas venu.
                </div>
            )}
            </div>
        ))}
        </section>
    );
};

const Bulletin = ({ onOpenAdvisor, pressFocus = 0, nav = null }) => {
    useSurface("press");
    const [game, setGame] = useState(null);
    const [world, setWorld] = useState(null);
    const [events, setEvents] = useState([]);
    // The desk: what is queued but not yet carried out. The press reads it to
    // fix the date of the next edition.
    const [actions, setActions] = useState([]);
    // Bumped when the presses have run: the sheet re-reads the new state.
    const [printed, setPrinted] = useState(0);
    const reload = useCallback(() => setPrinted((tick) => tick + 1), []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            const [nextGame, nextWorld, nextEvents, nextActions] = await Promise.all([
                readGameData().catch(() => null),
                readWorldState({ force: true }).catch(() => null),
                readEventsState().catch(() => []),
                readActionsState({ force: true }).catch(() => []),
            ]);
            if (!active) return;
            setGame(nextGame);
            setActions(Array.isArray(nextActions) ? nextActions : []);
            // A game from before the register gets its baseline now, once.
            const based = nextWorld ? ensureRegisterBaseline(nextWorld, nextGame?.country || "", { date: nextGame?.gameDate || "" }) : nextWorld;
            if (based && based !== nextWorld) writeWorldState(based).catch(() => {});
            setWorld(based);
            setEvents(Array.isArray(nextEvents) ? nextEvents : []);
        };
        load();
        // The page is the app's front door: it re-reads whenever it is mounted,
        // which is every time the reader comes back to this section, and again
        // after every edition printed from it.
        return () => { active = false; };
    }, [printed]);

    const player = game?.country || "";

    // L'état civil du bandeau. Tout est déjà dans la partie : le pape est le
    // chef de la polity depuis son inauguration, l'an et le jour se comptent
    // depuis la date de départ, les baptisés sont le registre des fidèles.
    const pape = world?.polityOverrides?.[player]?.leader || world?.countryStats?.[player]?.leader || "";
    const depuis = game?.startDate ? dayjs(game.startDate) : null;
    const aujourdhui = game?.gameDate ? dayjs(game.gameDate) : null;
    const jourDuPontificat = depuis && aujourdhui && depuis.isValid() && aujourdhui.isValid()
        ? aujourdhui.diff(depuis, "day") + 1
        : 0;
    const anDuPontificat = jourDuPontificat > 0 ? Math.floor((jourDuPontificat - 1) / 365) + 1 : 1;
    // Les ordres que le moteur a jugés portent un verdict ; les autres attendent.
    const ordresJuges = useMemo(
        () => (Array.isArray(actions) ? actions.filter((a) => a && a.verdict).length : 0),
        [actions],
    );
    const lignesRegistre = useMemo(
        () => lignesDuRegistre(world?.record, world?.treasuries, player).length,
        [world?.record, world?.treasuries, player],
    );
    const baptises = useMemo(() => {
        const c = normalizeChurch(world?.church);
        const total = c ? totalFaithful(c.faithful) : 0;
        return total > 0 ? `${(total / 1e9).toFixed(2).replace(".", ",")} Md` : "";
    }, [world?.church]);

    // The edition: what THIS turn printed, and the archive beneath it.
    //
    // Field report: the page sorted every event the game had ever produced and
    // took the newest eight, so a story from four turns ago reappeared under
    // "This turn's edition" as breaking news, and the "N events" count beside
    // the heading described the archive rather than the round. The engine
    // already knows what the round produced: simulationHistory[0] carries the
    // ids of the events it wrote, and the dates it ran between when it does
    // not (AI/gameplay.js). Anything older is history and prints as history.
    const { edition, earlier } = useMemo(() => {
        const dated = events.filter((event) => event && event.title);
        dated.sort((a, b) => String(b.date).localeCompare(String(a.date)));
        const round = Array.isArray(world?.simulationHistory) ? world.simulationHistory[0] : null;
        const ids = new Set((round?.eventIds ?? []).filter(Boolean));
        const from = String(round?.fromDate || "").slice(0, 10);
        const to = String(round?.toDate || round?.date || "").slice(0, 10);
        // The boundary date belongs to the turn that ended on it, so a story
        // dated on the previous sheet is not reprinted as news here.
        const thisTurn = (event) => {
            if (ids.size) return Boolean(event.id) && ids.has(event.id);
            if (!to) return false;
            const on = String(event.date || "").slice(0, 10);
            return Boolean(on) && on <= to && (!from || on > from);
        };
        // Before the first jump nothing has been printed at all: the whole list
        // is archive, and the left column prints the opening situation instead.
        return {
            edition: round ? dated.filter(thisTurn) : [],
            earlier: (round ? dated.filter((event) => !thisTurn(event)) : dated).slice(0, 8),
        };
    }, [events, world]);

    const indicators = useMemo(() => {
        const economy = player ? world?.economies?.[player] : null;
        return economy ? economyIndicators(economy) : null;
    }, [player, world]);
    const usdPerSY = Number(player ? world?.economies?.[player]?.usdPerSY : 0) || 0;
    // One unit for every sum the ledger prints: money while the page has a rate
    // to convert with, SY only when it has none at all (moneyOf, top of file).
    const money = (sy) => moneyOf(sy, usdPerSY);
    const rows = useMemo(() => Object.fromEntries(registerRows(world, player).map((r) => [r.key, r])), [world, player]);
    // The six fronts, each with its movement since the pontificate began. A
    // front the scenario does not hold still gets a row, saying so — a game with
    // no college has no unity to lose, and hiding the line would let a player
    // believe the front was being watched when nothing was watching it.
    const fronts = useMemo(() => (world ? frontRows(world, player) : []), [world, player]);



    const briefing = world?.startingTimelineText || "";
    const awaitingInauguration = Boolean(world) && !isInaugurated(world);

    // La page n'a rien à mettre en tête : ni événement du tour, ni récit
    // d'archive, ni feuille d'investiture à signer, ni programme d'élection à
    // imprimer. C'est le seul cas où la grille se recompose — et il fallait
    // bien y compter la une : sans cela l'article du programme passait pleine
    // largeur et sa photographie devenait une affiche, là où la maquette la
    // veut à la largeur d'une colonne.
    const creuse = !awaitingInauguration
        && edition.length === 0
        && earlier.length === 0
        && !briefing
        && !(world?.inauguration?.name && world?.inauguration?.declaration);

    // A turn that could not reach the model is written by a deterministic stub
    // that carries NO levers: no money moves, no order is judged, no scheme
    // advances. The engine has always recorded why, and the page has never said
    // so, so six turns in a row read as ordinary editions while a quota error
    // was throwing every one of them away. The reader has to be told on the
    // front page, where they are, and told how many in a row.
    const outage = useMemo(() => {
        const history = Array.isArray(world?.simulationHistory) ? world.simulationHistory : [];
        if (history[0]?.source !== "fallback") return null;
        let run = 0;
        while (history[run]?.source === "fallback") run += 1;
        const reason = String(history[0].fallbackReason || "").trim();
        const since = String(history[run - 1]?.date || history[run - 1]?.toDate || "").slice(0, 10);
        // Hand-written per language rather than sent through the translator:
        // the translator calls the model, and this notice exists precisely for
        // when the model cannot be reached (runtime/outageNotice.js).
        const words = outageNotice(preferredLanguage(), { run, since: since ? fmtDate(since, "D MMM YYYY") : "" });
        return {
            ...words,
            // The provider's own words, trimmed of the documentation URL that
            // makes the line unreadable in a column.
            reason: (reason.split(/\s*(?:For more information|Pour plus d)/)[0] || reason).trim(),
        };
    }, [world]);

    // The paper's own room: rag stock, printer's ink, hard rules, a condensed
    // masthead (theme.css, [data-surface="press"]).
    return (
        <div
        data-surface="press"
        style={{
            background: "var(--oh-plate)",
            bottom: 0,
            color: "var(--oh-text)",
            left: 0,
            overflowY: "auto",
            position: "fixed",
            right: 0,
            top: CONTENU_TOP,
            zIndex: 10002,
        }}
        >
        <div style={{ margin: "0 auto", maxWidth: "74rem", padding: "1.6rem 1.5rem 3rem" }}>

        {/* Le bandeau, d'après la maquette de la session de design : le nom du
            journal au centre, son état civil à gauche, celui du pontificat à
            droite. Un journal se reconnaît à son bandeau avant qu'on l'ait lu ;
            l'ancien n'avait qu'un titre et n'en était pas un. */}
        <header style={{ borderBottom: "var(--oh-filet-manchette) solid var(--oh-text-strong)", paddingBottom: "0.55rem" }}>
        <div className="oh-masthead" style={{ alignItems: "end", display: "grid", gap: "1rem", gridTemplateColumns: "1fr auto 1fr" }}>
        <div className="oh-masthead-flank" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5 }}>
        <div className="oh-label" style={{ color: "var(--oh-text-strong)" }}>
        N° {game?.round || 1} · An {anDuPontificat} du pontificat
        </div>
        <div>Mensuel des affaires de l&apos;Église</div>
        <div>Édition imprimée par le moteur</div>
        </div>

        <h1
        style={{
            color: "var(--oh-text-strong)",
            fontFamily: "var(--oh-font-serif)",
            fontSize: "var(--oh-t-3xl)",
            fontWeight: 700,
            letterSpacing: "-0.025em",
            lineHeight: 0.92,
            margin: 0,
            textAlign: "center",
            whiteSpace: "nowrap",
        }}
        >
        {player || "Bulletin"}
        </h1>

        <div className="oh-masthead-flank" style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", lineHeight: 1.5, textAlign: "right" }}>
        <div className="oh-label" style={{ color: "var(--oh-text-strong)" }}>
        {game?.gameDate ? `Rome, ${fmtDate(game.gameDate)}` : "Rome"}
        </div>
        {pape && <div>{pape}{jourDuPontificat ? ` · ${jourDuPontificat}ᵉ jour` : ""}</div>}
        {baptises && <div>{baptises} de baptisés</div>}
        </div>
        </div>

        {/* La devise : ce que le journal promet, sous son nom. */}
        <div style={{ color: "var(--oh-text-dim)", fontFamily: "var(--oh-font-serif)", fontSize: "var(--oh-t-sm)", fontStyle: "italic", marginTop: "0.35rem", textAlign: "center" }}>
        « Vous êtes le pape. Les comptes ne mentent pas. »
        </div>
        </header>

        {/* Printed above everything, because nothing below it is real. */}
        {outage && (
            <div
            role="alert"
            style={{
                background: "var(--oh-plate)",
                border: "var(--oh-filet-fort) solid var(--oh-alert)",
                color: "var(--oh-text-strong)",
                fontSize: "var(--oh-t-sm)",
                lineHeight: 1.55,
                marginTop: "1rem",
                padding: "0.8rem 1rem",
            }}
            >
            <span className="oh-label" data-no-translate style={{ color: "var(--oh-alert)", display: "block", fontSize: "var(--oh-t-2xs)", marginBottom: "0.3rem" }}>
            {outage.label}
            </span>
            <span data-no-translate>{outage.body}</span>
            {outage.reason && (
                <div data-no-translate style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginTop: "0.4rem" }}>
                {outage.reasonLabel}: {outage.reason}
                </div>
            )}
            {/* Un quota épuisé se répare avec une autre clé, et ce bandeau était
                le seul endroit où le joueur apprenait le problème sans pouvoir
                rien y faire — le champ vivait derrière le menu des réglages. Il
                est ici, sous la raison qui le rend nécessaire.

                Mais le champ tout seul disait : votre clé est morte. « Comment
                je peux parler et dire des bêtises si je n'ai plus API ? » Le
                bandeau lit `simulationHistory[0]` — la DERNIÈRE édition
                imprimée, pas l'état du moment. Un compteur par minute se
                rouvre tout seul, les lettres continuent de partir pendant ce
                temps, et le bandeau reste affiché jusqu'au prochain tour
                réussi. Il faut le dire, sinon le joueur change une clé qui
                n'avait rien. */}
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-xs)", marginTop: "0.4rem" }}>
            Ceci rapporte la dernière édition imprimée, pas l&apos;état de cette minute : une limite
            atteinte se rouvre d&apos;elle-même, et le bandeau ne disparaîtra qu&apos;au prochain tour
            réussi. Changez de clé seulement si la raison ci-dessus met la clé en cause.
            </div>
            <ChampDeCle />
            </div>
        )}
        {/* Les cahiers, et ce que cette feuille contient : la maquette met les
            deux sur la même ligne, sous le bandeau. La date n'y est pas répétée,
            le bandeau la donne deux lignes plus haut. */}
        {nav && nav([
            `${edition.length} ${edition.length === 1 ? "événement" : "événements"}`,
            `${ordresJuges} ${ordresJuges === 1 ? "ordre jugé" : "ordres jugés"}`,
            `${lignesRegistre} ${lignesRegistre === 1 ? "ligne au registre" : "lignes au registre"}`,
        ].join(" · "))}

        {/* Une une sans matière laisse un trou de six cents pixels à côté de
            deux colonnes pleines. Un journal ne fait pas ça : il recompose. La
            note passe au-dessus, sur une colonne de lecture, et la grille
            repasse à deux colonnes de contenu réel. */}
        {creuse && (
            <div style={{ marginBottom: "1.6rem" }}>
            <Situation briefing={briefing} date={game?.startDate || game?.gameDate} world={world} />
            </div>
        )}

        <div className={creuse ? "oh-bulletin-grid oh-bulletin-grid-creuse" : "oh-bulletin-grid"}>

        {/* Left: what the world did — and, on the first turn, the situation the
            new pope has to read before he can sign anything. */}
        {!creuse && (
        <div>
        {awaitingInauguration ? (
            // Field report: the inauguration sheet was rendered INSTEAD of the
            // briefing, so the player took a name and wrote the standing
            // programme the whole engine reads afterwards — factions, reality
            // check — without having been told one thing about the state of the
            // Church. The first irreversible decision in the game was made
            // blind. The situation prints above the form, never in place of it.
            <>
            <Situation briefing={briefing} date={game?.startDate || game?.gameDate} world={world} awaitingInauguration />
            <Inauguration world={world} player={player} onDone={setWorld} />
            </>
        ) : edition.length === 0 ? (
            // L'épisode s'ouvre avant que rien ne soit arrivé. Plutôt qu'une
            // tête de section suivie de rien, la une porte le programme sur
            // lequel le pape vient d'être élu — et, à défaut, la situation dont
            // part le scénario.
            <Situation briefing={briefing} date={game?.startDate || game?.gameDate} world={world} />
        ) : (
            <>
            <SectionHead aside={`${edition.length} ${edition.length === 1 ? "événement" : "événements"}`}>
            Ce qui est arrivé
            </SectionHead>
            {edition.map((event, index) => (
                <Story
                key={event.id || `${event.date}-${index}`}
                event={event}
                lead={index === 0}
                tone={index % 2 === 0 ? "alert" : "accent"}
                />
            ))}
            </>
        )}
        {/* The archive, under its own rule and never as a lead: a story the
            reader has already been sold is not news a second time. It is kept
            off the inauguration sheet, where the only thing to do is decide. */}
        {!awaitingInauguration && earlier.length > 0 && (
            <div style={{ marginTop: "1.8rem" }}>
            <SectionHead aside={`${earlier.length} ${earlier.length === 1 ? "récit" : "récits"}`}>
            Précédemment
            </SectionHead>
            {earlier.map((event, index) => (
                <Story
                key={event.id || `earlier-${event.date}-${index}`}
                event={event}
                tone={index % 2 === 0 ? "accent" : "alert"}
                />
            ))}
            </div>
        )}
        </div>
        )}

        {/* Centre : ce qui est ordonné, et ce que le moteur en a jugé. La
            maquette journal lui donne sa propre colonne, entre les nouvelles et
            les comptes — c'est la colonne où le joueur agit. */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.6rem" }}>
        {/* The orders desk itself: compose, take a suggestion, read each
            verdict. One component, the same the map's floating panel shows.
            Field report: it used to sit BELOW the presses, so the largest
            control on the page — the one that ends the turn and cannot be
            undone — was the first thing under the reader's hand, and a turn was
            regularly spent before a single order had been written. Orders are
            written first; the presses are what you reach when you are done. */}
        <section>
        <ActionsPanel embedded isOpen onClose={() => {}} onOpenAdvisor={onOpenAdvisor} />
        </section>
        </div>

        {/* Droite : la date d'arrivée, le registre, et ce que le monde a bougé.
            Ce que la maquette met sous « Prochaine édition », « Le registre »
            et « Le collège ». */}
        <div style={{ display: "flex", flexDirection: "column", gap: "1.6rem" }}>
        {/* The presses: how far the next edition runs, and the order to print. */}
        <Press game={game} world={world} actions={actions} focus={pressFocus} onPrinted={reload} />

        {/* What the pontificate has moved, on all six fronts — above the money,
            because it was the money being the only answer that made a player
            who never touches finance read a page about nothing he did. */}
        {fronts.length > 0 && <Fronts rows={fronts} />}

        <Drives drives={world?.drives} sinceDate={world?.simulationHistory?.[0]?.fromDate || ""} player={player} />

        <Gatherings gatherings={world?.gatherings} usdPerSY={usdPerSY} />

        <Purses treasuries={world?.treasuries} usdPerSY={usdPerSY} />

        <Record record={world?.record} treasuries={world?.treasuries} player={player} usdPerSY={usdPerSY} />

        {/* La salle qui décide, en bas de colonne droite : la maquette la met
            là, sous le registre. C'est le même hémicycle que le cahier. */}
        <ApercuDuCollege assembly={world?.assembly} />

        {indicators && (
            <section>
            <SectionHead aside="cette année">Comptes — {player}</SectionHead>
            <div style={{ display: "grid", gap: "1rem", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", padding: "0.9rem 0 1rem" }}>
            <div>
            <div
            style={{
                color: indicators.balance < 0 ? "var(--oh-alert)" : "var(--oh-grant)",
                fontFamily: "var(--oh-font-display)",
                fontSize: "var(--oh-t-xl)",
                fontWeight: 800,
                letterSpacing: "-0.035em",
                lineHeight: 1,
                whiteSpace: "nowrap",
            }}
            >
            {(usdPerSY > 0 && fmtMoney(indicators.balance * usdPerSY))
                || `${indicators.balance < 0 ? "−" : "+"}${fmtSY(Math.abs(indicators.balance))}`}
            </div>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.35rem" }}>
            solde de l'année{usdPerSY > 0 ? ` · ${fmtSY(indicators.balance)} AS` : ""}
            <Movement row={rows.balance} format={(v) => (usdPerSY > 0 ? fmtMoney(v * usdPerSY) : `${fmtSY(v)} AS`)} />
            </div>
            </div>
            <div>
            <div
            style={{
                color: "var(--oh-text-strong)",
                fontFamily: "var(--oh-font-display)",
                fontSize: "var(--oh-t-xl)",
                fontWeight: 800,
                letterSpacing: "-0.035em",
                lineHeight: 1,
                whiteSpace: "nowrap",
            }}
            >
            {indicators.yearsOfPatrimonyLeft == null ? "—" : `${indicators.yearsOfPatrimonyLeft} ans`}
            </div>
            <div style={{ color: "var(--oh-text-dim)", fontSize: "var(--oh-t-2xs)", marginTop: "0.35rem" }}>
            de patrimoine restant
            <Movement row={rows.yearsOfPatrimonyLeft} format={(v) => `${Math.round(v)} ans`} />
            </div>
            </div>
            </div>
            <table className="oh-ledger">
            <tbody>
            {/* In hand, first line: the answer to "do I have the money".
                Field report: this line printed dollars while every line under
                it printed subsistence-years — "$11M in hand" directly above
                "Patrimony placed 9.4k SY" — in the one table that exists so the
                purse and the patrimony can be compared. The reader could not
                tell which was the larger. Every sum here goes through moneyOf,
                which falls back to SY only when the page has no rate at all. */}
            <tr><td>En main</td><td>{money(indicators.treasury)}<Movement row={rows.treasury} format={money} /></td></tr>
            {rows.faithful?.value != null && (
                <tr><td>Fidèles</td><td>{fmtCount(rows.faithful.value)}<Movement row={rows.faithful} format={fmtCount} /></td></tr>
            )}
            <tr><td>Patrimoine placé</td><td>{money(indicators.endowment)}<Movement row={rows.endowment} format={money} /></td></tr>
            {/* The rate AND what it actually throws off: a percentage of a stock
                the reader has to go and find is not an income. */}
            <tr><td>Rendement du patrimoine</td><td>{`${(indicators.endowmentYield * 100).toFixed(2).replace(".", ",")}\u202f%`} · {money(indicators.endowmentIncome)} par an<Movement row={rows.endowmentYield} format={(v) => `${(v * 100).toFixed(2).replace(".", ",")} pt`} /></td></tr>
            <tr><td>Dons reçus</td><td>{money(indicators.transfers)}<Movement row={rows.transfers} format={money} /></td></tr>
            {/* The federation's remittance, on its own line. It used to land in
                the treasury and nowhere else, so the balance never felt it. */}
            {rows.bodyTransfers?.value > 0 && (
                <tr><td>Versé par ses propres organismes</td><td>{money(rows.bodyTransfers.value)} par an<Movement row={rows.bodyTransfers} format={money} /></td></tr>
            )}
            <tr><td>Recettes fiscales</td><td>{indicators.taxRevenue > 0 ? money(indicators.taxRevenue) : "aucune"}<Movement row={rows.taxRevenue} format={money} /></td></tr>
            <tr><td>Promesses non financées</td><td>{money(indicators.unfundedLiabilities)}<Movement row={rows.unfundedLiabilities} format={money} /></td></tr>
            {rows.legitimacy?.value != null && (
                <tr><td>Légitimité</td><td>{Math.round(rows.legitimacy.value)}/100<Movement row={rows.legitimacy} format={(v) => `${Math.round(v)} pt`} /></td></tr>
            )}
            </tbody>
            </table>
            </section>
        )}
        </div>
        </div>
        </div>
        </div>
    );
};

export { Bulletin, Record };
export default Bulletin;
