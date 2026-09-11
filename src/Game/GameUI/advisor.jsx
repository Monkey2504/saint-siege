/*! Open Historia — portions (drawer close/slide + mobile layout) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import React, { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { Chart, registerables } from "chart.js";
import { sendMessage, startChat, loadHistory } from "../AI/main.jsx";
import { JSON_URLS, readJson, writeJson } from "../../runtime/assets.js";
import { chatLanguageDiffersFromUi, isRtlLanguage, resolveChatLanguage } from "../../runtime/i18n.js";
import StatsPane from "./stats.jsx";
import { useSurface } from "../../runtime/useSurface.js";

Chart.register(...registerables);

const ADVISOR_PANEL_WIDTH = "min(20rem, calc(100vw - 1rem))";

const baseStyle = {
    position: "fixed",
    // A React inline style, so the custom property resolves in the DOM.
    // Calling paint() here would run at module scope, before paint is declared.
    backgroundColor: "var(--oh-plate)",
   
    zIndex: 9999,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--oh-text)",
    fontFamily: "inherit",
    borderRadius: "12px",
    border: "1px solid var(--oh-line)",
    boxShadow: "0 4px 6px -1px rgba(0,0,0,0.2)",
};

const ThinkingDots = () => {
    const [dots, setDots] = React.useState(0);
    useEffect(() => {
        const interval = setInterval(() => setDots(d => (d + 1) % 4), 500);
        return () => clearInterval(interval);
    }, []);
    return <span style={{ opacity: 0.6 }}>Thinking{".".repeat(dots)}&nbsp;</span>;
};

const parseMessage = (rawText) => {
    const chartRegex = /```chart\s*([\s\S]*?)```/;
    const match = rawText.match(chartRegex);
    if (!match) return { text: rawText, chartConfig: null };
    let chartConfig = null;
    try { chartConfig = JSON.parse(match[1].trim()); } catch { chartConfig = null; }
    return { text: rawText.replace(chartRegex, "").trim(), chartConfig };
};

// Chart.js paints on a canvas, which cannot resolve a CSS custom property: the
// string "var(--oh-line)" reaches the 2D context as an invalid colour and the
// axis silently disappears. So the direction's tokens are read off the document
// and passed as real values, re-read on every render so a change of direction
// repaints the charts with it.
const paint = (token, fallback) => {
    if (typeof document === "undefined") return fallback;
    const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
    return value || fallback;
};

// Series keep distinct hues — a chart's colours encode which line is which, they
// are not interface chrome — but the two that carry meaning follow the direction.
const chartColors = () => [
    paint("--oh-accent", "#1f3f86"),
    paint("--oh-grant", "#1f7a4d"),
    "#b0568f",
    paint("--oh-caution", "#a35c07"),
    "#4a7fa5",
    paint("--oh-alert", "#d9382b"),
    "#6b5aa8",
];

const AdvisorChart = ({ config }) => {
    const canvasRef = useRef(null);
    const chartRef  = useRef(null);
    const isCartesian     = config.type !== "pie" && config.type !== "doughnut";
    const isPieOrDoughnut = config.type === "pie"  || config.type === "doughnut";
    const isPercent       = config.options?.unit === "percent";

    const coloredConfig = {
        ...config,
        data: {
            ...config.data,
            datasets: config.data.datasets.map((ds, i) => {
                const palette   = chartColors();
                const color     = palette[i % palette.length];
                const pieColors = (config.data.labels || []).map((_, j) => palette[j % palette.length]);
                return {
                    borderColor:      isPieOrDoughnut ? undefined : color,
                    backgroundColor:  isPieOrDoughnut ? pieColors : config.type === "line" ? `${color}26` : color,
                    borderWidth: 2,
                    pointRadius:      config.type === "line" ? 3 : undefined,
                    pointHoverRadius: config.type === "line" ? 5 : undefined,
                    tension:          config.type === "line" ? 0.4 : undefined,
                    ...ds,
                };
            }),
        },
    };

    const legendItems = (() => {
        if (!coloredConfig?.data?.datasets) return [];
        if (isPieOrDoughnut) {
            const labels = coloredConfig.data.labels || [];
            const colors = coloredConfig.data.datasets[0]?.backgroundColor || [];
            const palette = chartColors();
            return labels.map((label, i) => ({ label, color: Array.isArray(colors) ? colors[i] : palette[i % palette.length] }));
        }
        return coloredConfig.data.datasets.map((ds, i) => ({
            label: ds.label || "",
            color: Array.isArray(ds.borderColor) ? ds.borderColor[0] : ds.borderColor || chartColors()[i % 7],
        }));
    })();

    useEffect(() => {
        if (!canvasRef.current) return;
        if (chartRef.current) chartRef.current.destroy();
        const ctx = canvasRef.current.getContext("2d");
        chartRef.current = new Chart(ctx, {
            ...coloredConfig,
            options: {
                ...coloredConfig.options,
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 4, bottom: 4 } },
                plugins: {
                    ...coloredConfig.options?.plugins,
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: paint("--oh-plate", "#f4f0e6"),
                                     borderColor: paint("--oh-line", "#14161a"), borderWidth: 1,
                                     titleColor: paint("--oh-text-strong", "#14161a"), bodyColor: paint("--oh-text", "#2a2d33"),
                                     padding: 10, cornerRadius: 8,
                                     ...coloredConfig.options?.plugins?.tooltip,
                                     callbacks: {
                                         label: (ctx) => ` ${ctx.parsed.y ?? ctx.parsed}${isPercent ? "%" : ""}`,
                                     ...coloredConfig.options?.plugins?.tooltip?.callbacks,
                                     },
                    },
                },
                scales: isCartesian ? {
                    x: { ticks: { color: paint("--oh-text-dim", "#5c6068"), font: { size: 10, family: "sans-serif" } }, grid: { color: paint("--oh-line", "#cbc7bd") }, border: { color: paint("--oh-line", "#14161a") }, ...coloredConfig.options?.scales?.x },
                                     y: { ticks: { color: paint("--oh-text-dim", "#5c6068"), font: { size: 10, family: "sans-serif" }, callback: val => `${val}${isPercent ? "%" : ""}` }, grid: { color: paint("--oh-line", "#cbc7bd") }, border: { color: paint("--oh-line", "#14161a") }, ...coloredConfig.options?.scales?.y },
                } : undefined,
            },
        });
        return () => { if (chartRef.current) chartRef.current.destroy(); };
    }, [config]);

    return (
        <div style={{ marginTop: "0.75rem", width: "100%", boxSizing: "border-box" }}>
        {legendItems.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem 0.85rem", marginBottom: "0.5rem" }}>
            {legendItems.map((item, i) => (
                <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "var(--oh-t-xs)", color: "var(--oh-text-dim)" }}>
                <span style={{ width: "8px", height: "8px", borderRadius: "2px", backgroundColor: item.color || "var(--oh-accent)", flexShrink: 0 }} />
                {item.label}
                </span>
            ))}
            </div>
        )}
        <div style={{ position: "relative", width: "100%", height: "175px" }}>
        <canvas ref={canvasRef} />
        </div>
        </div>
    );
};

const AdvisorButton = ({ isAdvisorOpen, rightShift, onToggle }) => (
    <button onClick={onToggle} style={{
        ...baseStyle,
        bottom: "0.5rem", right: rightShift,
        height: "4rem", width: "4rem",
        cursor: "pointer", fontSize: "var(--oh-t-lg)",
        transition: "right 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
    }}>🧭</button>
);

const saveMessages = async (messages) => {
    try {
        await writeJson(JSON_URLS.advisor, messages);
    } catch (err) { console.error("Failed to save messages:", err); }
};

const loadMessages = async () => {
    try {
        return await readJson(JSON_URLS.advisor, { defaultValue: [] });
    } catch { return []; }
};

const TabButton = ({ icon, label, active, onClick }) => (
    <button
    onClick={onClick}
    style={{
        alignItems: "center",
        background: "none",
        border: "none",
        borderBottom: active ? "2px solid var(--oh-accent)" : "2px solid transparent",
        color: active ? "var(--oh-text-strong)" : "var(--oh-text-dim)",
        cursor: "pointer",
        display: "flex",
        fontFamily: "inherit",
        fontSize: "var(--oh-t-sm)",
        fontWeight: active ? 700 : 500,
        gap: "0.4rem",
        padding: "0.9rem 0.85rem",
    }}
    >
    <span style={{ fontSize: "var(--oh-t-base)" }}>{icon}</span> {label}
    </button>
);

const AdvisorPanel = ({ isAdvisorOpen, onClose, width, onResize, fullPage = false, section = null, onSection = null }) => {
    const [messages, setMessages]   = useState([]);
    const [input, setInput]         = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef            = useRef(null);
    const [hasOpened, setHasOpened] = useState(isAdvisorOpen);
    const [hasBootstrapped, setHasBootstrapped] = useState(false);
    const [localTab, setLocalTab] = useState("advisor");
    // As a section of the paper the bar owns which one is showing; as a drawer
    // the panel keeps its own tabs.
    const activeTab = section ?? localTab;
    const setActiveTab = (tab) => (typeof onSection === "function" ? onSection(tab) : setLocalTab(tab));
    // One window, two rooms. The books are the books — ruled paper, tabular
    // figures, the accountant's green and red — and the adviser is one person
    // talking, on plain office paper (theme.css). As a drawer over the map the
    // panel claims no room: the map is not a room of the house.
    useSurface(!fullPage ? "" : activeTab === "stats" ? "ledger" : "cabinet");
    const inputRef = useRef(null);
    const [isResizing, setIsResizing] = useState(false);
    const [handleHover, setHandleHover] = useState(false);

    // Drag the drawer's left edge to resize it. The panel is docked right, so the
    // new width is simply (viewport width − pointer x); the parent (main.jsx) clamps
    // and persists it. Pointer capture keeps the drag alive if the cursor leaves the
    // 10px handle. Works for mouse, touch and pen.
    const handleResizeStart = React.useCallback((e) => {
        if (typeof onResize !== "function") return;
        e.preventDefault();
        const target = e.currentTarget;
        try { target.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
        setIsResizing(true);
        const onMove = (ev) => onResize(window.innerWidth - ev.clientX);
        const onUp = () => {
            setIsResizing(false);
            target.removeEventListener("pointermove", onMove);
            target.removeEventListener("pointerup", onUp);
            target.removeEventListener("pointercancel", onUp);
        };
        target.addEventListener("pointermove", onMove);
        target.addEventListener("pointerup", onUp);
        target.addEventListener("pointercancel", onUp);
    }, [onResize]);
    // A reply already in the chat language must skip the UI translator, which
    // would render it back into the interface language.
    const chatDiffers = chatLanguageDiffersFromUi();
    const chatDir = chatDiffers && isRtlLanguage(resolveChatLanguage()) ? "rtl" : undefined;

    useEffect(() => {
        if (isAdvisorOpen) setHasOpened(true);
    }, [isAdvisorOpen]);

    useEffect(() => {
        if (!isAdvisorOpen || hasBootstrapped) return;
        let cancelled = false;
        loadMessages().then((saved) => {
            if (cancelled) return;
            if (saved.length > 0) {
                setMessages(saved);
                loadHistory(saved);   // restore advisor history — no prompt arg = advisor mode
            } else {
                startChat();          // fresh start — no prompt arg = advisor mode
            }
            setHasBootstrapped(true);
        });
        return () => { cancelled = true; };
    }, [hasBootstrapped, isAdvisorOpen]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    const resizeTextarea = React.useCallback(() => {
        const el = inputRef.current;
        if (!el) {
            return;
        }

        el.style.height = "0";
        el.style.height = `${Math.min(el.scrollHeight, 300)}px`;
    }, []);

    React.useEffect(() => {
        resizeTextarea();
    }, [input, resizeTextarea]);

    const handleSend = async () => {
        const text = input.trim();
        if (!text || isLoading) return;

        const { gameDate } = await readJson(JSON_URLS.game, {
            defaultValue: { gameDate: null },
            force: true,
        }).catch(() => ({ gameDate: null }));

        const userMessage = { role: "user", text, time: gameDate };
        setInput("");
        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);

        // Streaming: the ThinkingDots show until the first token, then a live
        // advisor bubble fills as tokens arrive. It carries a `streaming` flag so
        // it can be found and finalised; intermediate text is NOT persisted.
        const showStreaming = (fullText) => setMessages(prev => {
            const next = prev.slice();
            const last = next[next.length - 1];
            if (last && last.role === "advisor" && last.streaming) {
                next[next.length - 1] = { ...last, text: fullText };
            } else {
                next.push({ role: "advisor", text: fullText, time: gameDate, streaming: true });
            }
            return next;
        });

        try {
            const reply = await sendMessage(text, { onChunk: (_delta, full) => showStreaming(full) });
            setMessages(prev => {
                const next = prev.slice();
                const last = next[next.length - 1];
                // Finalise the streaming bubble, or append the full reply if the
                // provider never streamed a chunk.
                if (last && last.role === "advisor" && last.streaming) {
                    next[next.length - 1] = { role: "advisor", text: reply, time: gameDate };
                } else {
                    next.push({ role: "advisor", text: reply, time: gameDate });
                }
                saveMessages(next);
                return next;
            });
        } catch (err) {
            setMessages(prev => {
                const last = prev[prev.length - 1];
                const base = last && last.role === "advisor" && last.streaming ? prev.slice(0, -1) : prev.slice();
                const updated = [...base, { role: "error", text: err.message, time: gameDate }];
                saveMessages(updated);
                return updated;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return "";
        return new Date(dateStr).toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" });
    };

    if (!hasOpened) return null;

    return (
        <>
        <MarkdownStyleInjector />
        <div style={{
            position: "fixed",
            // As a section of the paper it takes the page, clearing the top bar
            // and the standing tab bar; as the old drawer it slides in from the
            // right. Same component, same content, two placements.
            ...(fullPage
                ? {
                    bottom: "2.6rem", left: 0, right: 0, top: "3.9rem",
                    width: "auto", height: "auto",
                    transform: isAdvisorOpen ? "translateY(0)" : "translateY(100vh)",
                    borderLeft: 0, boxShadow: "none",
                }
                : {
                    bottom: 0, right: 0,
                    // Slide via transform: the old right: calc(-min(...) - 1rem)
                    // was INVALID CSS (a min() can't be negated like that), so the
                    // closed position was silently dropped and the drawer never
                    // slid away.
                    transform: isAdvisorOpen ? "translateX(0)" : "translateX(calc(100% + 2rem))",
                    width: typeof width === "number" ? `${width}px` : ADVISOR_PANEL_WIDTH,
                    height: "100vh",
                    borderLeft: "1px solid var(--oh-line)",
                    boxShadow: "-4px 0 24px rgba(0,0,0,0.4)",
                }),
            backgroundColor: paint("--oh-plate", "#f4f0e6"),
            // Above every HUD button/panel (toolbar 9999, forces 10000,
            // library panels 10031) so nothing covers the open drawer on
            // phones; below the editor (10050) and server-down (10060) overlays.
            zIndex: 10040,
            transition: "transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)",
            display: "flex", flexDirection: "column",
            color: "var(--oh-text)", fontFamily: "inherit", overflow: "hidden",
        }}>
        {/* Drag the left edge to resize the drawer (main.jsx clamps + persists). */}
        {!fullPage && typeof onResize === "function" && (
            <div
                onPointerDown={handleResizeStart}
                onPointerEnter={() => setHandleHover(true)}
                onPointerLeave={() => setHandleHover(false)}
                title="Drag to resize"
                style={{
                    position: "absolute", left: 0, top: 0, bottom: 0, width: "10px",
                    cursor: "ew-resize", zIndex: 30, touchAction: "none",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                <div style={{
                    width: "3px", height: "42px", borderRadius: "2px",
                    backgroundColor: isResizing
                        ? "var(--oh-accent)"
                        : handleHover ? "var(--oh-plate)" : "var(--oh-plate-2)",
                    transition: "background-color 0.15s",
                }} />
            </div>
        )}
        {/* Header: tabs to flip between the advisor chat and national stats. */}
        <div style={{ alignItems: "center", borderBottom: "1px solid var(--oh-line)", display: "flex", padding: "0 0.75rem 0 0.35rem" }}>
        <TabButton icon="🧭" label="Conseiller" active={activeTab === "advisor"} onClick={() => setActiveTab("advisor")} />
        <TabButton icon="📊" label="Comptes" active={activeTab === "stats"} onClick={() => setActiveTab("stats")} />
        <div style={{ flex: 1 }} />
        {activeTab === "advisor" && (
            <button
            onClick={async () => { setMessages([]); startChat(); await saveMessages([]); }}
            title="Clear chat"
            style={{ background: "none", border: "none", color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-lg)", lineHeight: 1, padding: 0, display: "flex", alignItems: "center" }}
            >🗑</button>
        )}
        {/* On phones the panel slides over the 🧭 launcher, making it
            untappable — this ✕ is the way out. */}
        {onClose && (
            <button
            onClick={onClose}
            title="Close advisor"
            style={{ background: "none", border: "none", color: "var(--oh-text-dim)", cursor: "pointer", fontSize: "var(--oh-t-lg)", lineHeight: 1, padding: "0 0 0 0.5rem", display: "flex", alignItems: "center" }}
            >✕</button>
        )}
        </div>

        {/* National stats pane — kept mounted so flipping tabs is instant. */}
        <div style={{ display: activeTab === "stats" ? "flex" : "none", flex: 1, flexDirection: "column", minHeight: 0 }}>
        <StatsPane active={isAdvisorOpen && activeTab === "stats"} />
        </div>

        <div style={{ display: activeTab === "advisor" ? "flex" : "none", flex: 1, flexDirection: "column", minHeight: 0 }}>
        {/* Messages */}
        <div style={{ padding: fullPage ? "1.2rem 1.5rem" : "0.75rem", flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem", scrollbarWidth: "none", margin: fullPage ? "0 auto" : undefined, maxWidth: fullPage ? "62rem" : undefined, width: "100%" }}>
        {messages.length === 0 && (
            <p style={{ fontSize: "var(--oh-t-xs)", color: "var(--oh-text-dim)", marginTop: 0 }}>
            Aucun message pour l'instant. Posez une question à votre conseiller.
            </p>
        )}

        {messages.map((msg, i) => {
            const { text, chartConfig } = msg.role === "advisor"
            ? parseMessage(msg.text)
            : { text: msg.text, chartConfig: null };
            const asWritten = msg.role === "advisor" && chatDiffers;
            return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: msg.role === "user" ? "flex-end" : "flex-start" }}>
                {msg.role !== "user" && (
                    <span style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text-dim)", marginBottom: "0.25rem" }}>
                    {msg.role === "error" ? "⚠️ Error" : "🧭 Advisor"}
                    </span>
                )}
                {/* Player-typed text stays verbatim under UI translation. */}
                <div data-no-translate={msg.role === "user" || asWritten ? "" : undefined} dir={asWritten ? chatDir : undefined} style={{
                    maxWidth: "90%", width: chartConfig ? "90%" : undefined,
                    padding: "0.6rem 0.85rem",
                    borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                    backgroundColor: msg.role === "user" ? "var(--oh-accent)" : msg.role === "error" ? "var(--oh-alert-soft)" : "var(--oh-plate-2)",
                    // The player's words sit on the accent: paper text there, ink
                    // everywhere else. Left unset, the bubble inherited ink on blue.
                    color: msg.role === "user" ? "var(--oh-on-accent)" : "var(--oh-text)",
                    fontSize: msg.role === "user" ? "var(--oh-t-sm)" : "var(--oh-t-xs)", lineHeight: "1.5", whiteSpace: "pre-wrap", wordBreak: "break-word",
                    border: msg.role === "error" ? "1px solid var(--oh-alert-soft)" : "none",
                    boxSizing: "border-box",
                }}>
                {msg.role === "user" ? text : (
                    <div className="advisor-markdown"><ReactMarkdown>{text}</ReactMarkdown></div>
                )}
                {chartConfig && <AdvisorChart config={chartConfig} />}
                </div>
                {msg.time && msg.role !== "user" && (
                    <span style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text-dim)", marginTop: "0.25rem" }}>
                    {formatDate(msg.time)}
                    </span>
                )}
                </div>
            );
        })}

        {isLoading && !(messages[messages.length - 1]?.role === "advisor" && messages[messages.length - 1]?.streaming) && (
            <div style={{ display: "flex", alignItems: "flex-start", flexDirection: "column", gap: "0.25rem" }}>
            <span style={{ fontSize: "var(--oh-t-2xs)", color: "var(--oh-text-dim)" }}>🧭 Advisor</span>
            <div style={{ padding: "0.6rem 0.85rem", borderRadius: "12px 12px 12px 4px", backgroundColor: "var(--oh-plate-2)", fontSize: "var(--oh-t-xs)" }}>
            <ThinkingDots />
            </div>
            </div>
        )}
        <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: fullPage ? "1rem 1.5rem 1.4rem" : "1rem", borderTop: "1px solid var(--oh-line)", display: "flex", alignItems: "center", gap: "0.5rem", margin: fullPage ? "0 auto" : undefined, maxWidth: fullPage ? "62rem" : undefined, width: "100%" }}>
        <textarea
        ref={inputRef}
        placeholder="Ask your advisor…  (Shift+Enter for a new line)"
        rows={1} value={input}
        onChange={e => {
            setInput(e.target.value);
            resizeTextarea();
        }}
        onKeyDown={handleKeyDown}
        style={{ flex: 1, backgroundColor: "var(--oh-plate-2)", border: "1px solid var(--oh-line)", borderRadius: "10px", color: "var(--oh-text)", fontSize: "var(--oh-t-sm)", padding: "0.6rem 0.75rem", resize: "none", outline: "none", fontFamily: "inherit", lineHeight: "1.5", overflowY: "auto", scrollbarWidth: "none", transition: "border-color 0.2s" }}
        onFocus={e => e.target.style.borderColor = "var(--oh-accent-soft)"}
        onBlur={e => e.target.style.borderColor = "var(--oh-line)"}
        />
        <button
        onClick={handleSend} disabled={isLoading || !input.trim()}
        style={{ backgroundColor: isLoading || !input.trim() ? "var(--oh-accent-soft)" : "var(--oh-accent)", border: "none", borderRadius: "10px", width: "2.5rem", height: "2.5rem", display: "flex", alignItems: "center", justifyContent: "center", cursor: isLoading || !input.trim() ? "not-allowed" : "pointer", flexShrink: 0, fontSize: "var(--oh-t-base)", transition: "background-color 0.2s" }}
        onMouseEnter={e => { if (!isLoading && input.trim()) e.currentTarget.style.backgroundColor = "var(--oh-accent)"; }}
        onMouseLeave={e => { if (!isLoading && input.trim()) e.currentTarget.style.backgroundColor = "var(--oh-accent)"; }}
        >🚀</button>
        </div>
        </div>
        </div>
        </>
    );
};

const markdownStyles = `
/* An answer is read, not skimmed: reading size, not panel size. */
.advisor-markdown { font-size: var(--oh-t-base); line-height: 1.55; }
.advisor-markdown p { margin: 0 0 0.5rem 0; }
.advisor-markdown p:last-child { margin-bottom: 0; }
.advisor-markdown ul, .advisor-markdown ol { margin: 0.25rem 0 0.5rem 1.25rem; padding: 0; }
.advisor-markdown li { margin-bottom: 0.2rem; }
.advisor-markdown strong { color: var(--oh-text-strong); }
.advisor-markdown em { color: var(--oh-text-dim); }
.advisor-markdown code { background: var(--oh-plate-2); padding: 0.1rem 0.35rem; border-radius: 0; font-size: var(--oh-t-xs); }
.advisor-markdown pre { background: var(--oh-plate-2); padding: 0.75rem; border-radius: 8px; overflow-x: auto; margin: 0.5rem 0; }
.advisor-markdown h1, .advisor-markdown h2, .advisor-markdown h3 { margin: 0.75rem 0 0.25rem; font-size: var(--oh-t-md); color: var(--oh-text-strong); font-family: var(--oh-font-display); }
.advisor-markdown blockquote { border-left: 2px solid var(--oh-accent-soft); margin: 0.5rem 0; padding-left: 0.75rem; color: var(--oh-text-dim); }
`;

const MarkdownStyleInjector = () => {
    useEffect(() => {
        if (!document.getElementById("advisor-md-styles")) {
            const style = document.createElement("style");
            style.id = "advisor-md-styles";
            style.textContent = markdownStyles;
            document.head.appendChild(style);
        }
    }, []);
    return null;
};

export { ADVISOR_PANEL_WIDTH, AdvisorButton, AdvisorPanel };
