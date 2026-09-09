/*! Open Historia — portions (server relay for OpenAI-style APIs + reasoning toggle) © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */
import { describeOrganizationForChat, seedOrganizations } from "../../runtime/organizations.js";
import { normalizeIntents } from "../../runtime/intents.js";
import { describeLetter, describeStanding, readLetter } from "../../runtime/letterReading.js";
import { LEDGER_HONESTY_RULE, checkLedgerClaims, describeLedgerCorrections } from "../../runtime/claimCheck.js";
import { economyIndicators } from "../../runtime/economy.js";
import { toGeminiSchema } from "./geminiSchema.js";
import { retryDelayFromRateLimit } from "./rateLimit.js";
import { VOICE_RULES, describeVoice, voiceFor } from "../../runtime/voices.js";
import { yearOf } from "../../runtime/economyBridge.js";
const LF = String.fromCharCode(10);
const NL2 = LF + LF;
import {
    getProviderSettings,
    getReasoningEnabled,
    getStoredProvider,
    providerSupportsModelDiscovery,
    setProviderField,
} from "./providerConfig.js";
import { JSON_URLS, readJson } from "../../runtime/assets.js";
import { chatLanguageDirective, languageDirective } from "../../runtime/i18n.js";
import { difficultyDirective } from "../../runtime/difficulty.js";
import { normalizePromptPack } from "./gameplayPrompts.js";
import {
    buildPromptContext,
    renderTemplate,
    resolveHelperValues,
} from "./promptContext.js";

// main.jsx - AI chat module
// Supports Gemini, OpenAI, Anthropic, and OpenAI-compatible endpoints
// Usage: import { sendMessage, sendDiplomaticMessage, startChat, startDiplomaticChat, loadHistory, loadDiplomaticHistory, buildDiplomaticSystemPrompt } from './main.jsx'

const GEMINI_DEFAULT_MODEL = "gemini-3.5-flash-lite";
const ANTHROPIC_DEFAULT_MODEL = "claude-haiku-4-5";
const OPENAI_API_ENDPOINT = "https://api.openai.com/v1";
const ANTHROPIC_API_ENDPOINT = "https://api.anthropic.com/v1";

const CHAT_MODEL_HINTS = [
    /^gpt/i,
    /^o\d/i,
    /claude/i,
    /gemini/i,
    /llama/i,
    /mistral/i,
    /mixtral/i,
    /qwen/i,
    /deepseek/i,
    /command/i,
    /phi/i,
];

const NON_CHAT_MODEL_HINTS = [
    /embedding/i,
    /moderation/i,
    /whisper/i,
    /tts/i,
    /transcribe/i,
    /speech/i,
    /image/i,
    /rerank/i,
];

function sleep(ms, signal) {
    if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
    }

    return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(resolve, ms);
        signal?.addEventListener("abort", () => {
            clearTimeout(timeoutId);
            reject(signal.reason ?? new DOMException("Aborted", "AbortError"));
        }, { once: true });
    });
}

const canRetryBeforeDeadline = (deadline, retryDelay) =>
    !Number.isFinite(deadline) || Date.now() + retryDelay < deadline;

function normalizeEndpoint(endpoint) {
    return (endpoint ?? "").trim().replace(/\/$/, "");
}

function normalizeGeminiModel(model) {
    return (model ?? "").replace(/^models\//, "").trim();
}

async function readErrorPayload(response) {
    const text = await response.text();

    if (!text) return {};

    try {
        return JSON.parse(text);
    } catch {
        return { rawText: text };
    }
}

// Google's INVALID_ARGUMENT replies say only "Request contains an invalid
// argument" in `error.message` — the part that actually names the offending
// field lives in `error.details[]` (a BadRequest with fieldViolations, or a
// DebugInfo). Dropping it turned a precise, one-line diagnosis into a guessing
// game about which schema node the API disliked, so the details ride along.
function describeErrorDetails(error) {
    const details = Array.isArray(error?.details) ? error.details : [];
    const parts = [];
    for (const detail of details) {
        for (const violation of detail?.fieldViolations ?? detail?.field_violations ?? []) {
            const field = String(violation?.field ?? "").trim();
            const description = String(violation?.description ?? "").trim();
            if (field || description) parts.push(field ? `${field}: ${description}` : description);
        }
        const debug = String(detail?.detail ?? "").trim();
        if (debug) parts.push(debug);
    }
    return parts.join(" | ");
}

function extractErrorMessage(payload, fallback) {
    if (!payload) return fallback;
    if (typeof payload === "string" && payload.trim()) return payload.trim();
    if (payload.error?.message) {
        const detail = describeErrorDetails(payload.error);
        if (detail) return `${payload.error.message} — ${detail}`;
        // No field violation at all: the provider refused the request without
        // saying which part. Hand back what it DID send, trimmed, so the
        // fallback reason names something actionable instead of repeating
        // "Request contains an invalid argument" turn after turn.
        const raw = JSON.stringify(payload.error);
        return raw.length > payload.error.message.length + 24
            ? `${payload.error.message} — provider said: ${raw.slice(0, 400)}`
            : payload.error.message;
    }
    if (payload.message) return payload.message;
    if (typeof payload.rawText === "string" && payload.rawText.trim()) return payload.rawText.trim();
    return fallback;
}

// Settings (per provider): an escape hatch for request-body fields the built-in
// UI doesn't expose (e.g. reasoning budget/effort limits). Shallow-merged last
// into the outgoing body, so a deliberately-set key can override a built-in
// one; a nested built-in object (e.g. Gemini's generationConfig) must be
// supplied whole to override any of its keys. Invalid input is ignored, not
// fatal — a malformed settings field should never break a turn.
function parseCustomParams(raw, providerLabel) {
    const trimmed = (raw ?? "").trim();
    if (!trimmed) return {};

    try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
            return parsed;
        }
        console.warn(`${providerLabel} custom parameters must be a JSON object; ignoring.`);
    } catch (error) {
        console.warn(`${providerLabel} custom parameters are not valid JSON; ignoring.`, error);
    }

    return {};
}

function pickLikelyChatModel(models) {
    const modelIds = models
    .map((entry) => entry?.id)
    .filter((id) => typeof id === "string" && id.trim());

    const preferredModel = modelIds.find((id) => (
        CHAT_MODEL_HINTS.some((pattern) => pattern.test(id))
        && !NON_CHAT_MODEL_HINTS.some((pattern) => pattern.test(id))
    ));

    if (preferredModel) return preferredModel;

    const safeFallbackModel = modelIds.find((id) => (
        !NON_CHAT_MODEL_HINTS.some((pattern) => pattern.test(id))
    ));

    return safeFallbackModel ?? modelIds[0] ?? "";
}

function joinGeminiParts(parts) {
    return (parts ?? [])
    .map((part) => part?.text ?? "")
    .join("")
    .trim();
}

function extractGeminiToolInput(data, tool) {
    const call = (data?.candidates?.[0]?.content?.parts ?? [])
    .map((part) => part?.functionCall)
    .find((entry) => entry?.name === tool?.name);
    return call?.args && typeof call.args === "object" ? call.args : null;
}

// Qwen/DeepSeek thinking models emit reasoning either in a separate field or inline in
// <think>...</think>. Strip the think block so we return the actual answer; an unclosed
// <think> means the stream was cut mid-thought, leaving no answer, so drop it too.
function stripThinking(value) {
    if (typeof value !== "string") return "";
    let out = value.replace(/<think>[\s\S]*?<\/think>/gi, "");
    const open = out.search(/<think>/i);
    if (open !== -1) out = out.slice(0, open);
    return out.trim();
}

function extractOpenAIMessageText(data) {
    const message = data?.choices?.[0]?.message;
    const raw = message?.content;
    let text = "";

    if (typeof raw === "string") {
        text = raw;
    } else if (Array.isArray(raw)) {
        text = raw
        .map((part) => {
            if (typeof part === "string") return part;
            if (typeof part?.text === "string") return part.text;
            return "";
        })
        .join("");
    }

    text = stripThinking(text);
    // All reasoning, no answer (#540): fall back to the reasoning text rather than error.
    if (!text) text = stripThinking(message?.reasoning);
    return text;
}

function extractOpenAIToolInput(data, tool) {
    const call = (data?.choices?.[0]?.message?.tool_calls ?? [])
    .find((entry) => entry?.function?.name === tool?.name);
    const args = call?.function?.arguments;
    if (args && typeof args === "object") return args;
    if (typeof args !== "string") return null;

    try {
        return JSON.parse(args);
    } catch {
        return null;
    }
}

function extractOpenAIToolRaw(data, tool) {
    const call = (data?.choices?.[0]?.message?.tool_calls ?? [])
    .find((entry) => entry?.function?.name === tool?.name);
    const args = call?.function?.arguments;
    return typeof args === "string" ? args : args ? JSON.stringify(args) : "";
}

function extractAnthropicText(data) {
    return (data?.content ?? [])
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text)
    .join("\n\n")
    .trim();
}

function extractAnthropicToolInput(data, tool) {
    const block = (data?.content ?? [])
    .find((entry) => entry?.type === "tool_use" && entry?.name === tool?.name);
    return block?.input && typeof block.input === "object" ? block.input : null;
}

// Gemini's function declarations are sent on EVERY call and are far stricter
// than JSON Schema. Two things happen here.
//
// Size. The declaration is re-sent with every request and billed as input; when
// the impacts schema grew past ~30 KB, Gemini began answering the whole request
// with INVALID_ARGUMENT ("Request contains an invalid argument") and every turn
// fell to the canned fallback — the same campaign had run 12 clean AI turns on
// the smaller schema. The bulk is prose descriptions that repeat, at length,
// what [Actions You Can Take] already spells out in the system prompt, so each
// one is cut to its first sentence: the field's meaning survives, the essay
// does not.
//
// Shape. An `object` with no `properties` is not expressible — and that is
// exactly what a free-form map (`additionalProperties: {type:"number"}`)
// becomes once that keyword is stripped — so such a node is dropped rather
// than sent as something the API must reject.
// Validation bounds are dropped too: every one of them is re-applied by the
// engine's own normalizers when the answer comes back (a clamp there is
// authoritative, a hint here is not), several are not in Gemini's Schema proto
// at all, and together they are pure weight on a declaration that is re-sent
// with every single call.
function getGeminiUrl(model, apiKey) {
    return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${apiKey}`;
}

// AI calls go straight from the browser to the provider so the player's API key
// only ever reaches the provider — never a server or a community node. Direct is
// always tried first. Only when the page is served from a machine the player
// controls (localhost / the LAN box the Android client loads from) do we fall
// back to that trusted server's same-origin /api/ai/relay, and only for an
// endpoint that refused the direct call (self-hosted OpenAI-/Anthropic-style
// backends like Ollama or LM Studio rarely send browser CORS headers). On a
// hosted website there is no relay, so every call is direct-only and the key is
// never handed to anything but the provider. Gemini and native Anthropic were
// already direct — both allow browser calls explicitly.

// True when this page is served from a machine the player controls, i.e. a
// trusted same-origin relay is reachable. The LAN private ranges cover the
// Android client, which loads the UI from a local server on the home network.
function isLocallyServed() {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    if (!host) return false;
    if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host.endsWith(".local")) return true;
    if (/^10\./.test(host)) return true;
    if (/^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
    return false;
}

const PAGE_IS_LOCAL = isLocallyServed();
// Endpoints that have already proven they need the relay (no browser CORS) —
// remembered so we skip the doomed direct attempt on every later call.
const relayOnlyOrigins = new Set();

function endpointOrigin(url) {
    try {
        return new URL(url, typeof window !== "undefined" ? window.location.href : undefined).origin;
    } catch {
        return url;
    }
}

// True when the endpoint lives on the player's own machine or LAN (Ollama, LM
// Studio, a home gateway). Such a backend IS reachable from a hosted https page —
// the fetch starts in the player's own browser, and neither mixed content nor
// Private Network Access blocks it — but the browser discards the reply unless the
// backend echoes an Access-Control-Allow-Origin for this site. Stock Ollama does
// not, which is the whole reason a local model appears "broken" on the website.
function isLocalEndpoint(url) {
    try {
        const host = new URL(url, typeof window !== "undefined" ? window.location.href : undefined).hostname;
        if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]") return true;
        if (host.endsWith(".local")) return true;
        if (/^127\./.test(host)) return true;
        if (/^10\./.test(host)) return true;
        if (/^192\.168\./.test(host)) return true;
        if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return true;
        return false;
    } catch {
        return false;
    }
}

const relayFetch = (url, { method = "POST", headers = {}, payload, signal } = {}) =>
    fetch("/api/ai/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, method, headers, payload }),
        signal,
    });

const directFetch = (url, { method = "POST", headers = {}, payload, signal } = {}) =>
    fetch(url, {
        method,
        headers,
        ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}),
        signal,
    });

// fetch() rejects with a TypeError on a CORS or network failure (an HTTP error
// status still resolves). An abort rejects with an AbortError, which must not
// trigger the relay fallback.
async function providerFetch(url, options = {}) {
    const origin = endpointOrigin(url);

    if (PAGE_IS_LOCAL && relayOnlyOrigins.has(origin)) {
        return relayFetch(url, options);
    }

    try {
        return await directFetch(url, options);
    } catch (error) {
        const aborted = options.signal?.aborted || error?.name === "AbortError";
        if (PAGE_IS_LOCAL && !aborted && error instanceof TypeError) {
            relayOnlyOrigins.add(origin);
            return relayFetch(url, options);
        }
        // Hosted page, local backend, and the browser rejected the reply: this is
        // almost always the backend not allowing this origin, and "Failed to fetch"
        // is indistinguishable from the network being down. Say what to actually do.
        if (!PAGE_IS_LOCAL && !aborted && error instanceof TypeError && isLocalEndpoint(url)) {
            const site = typeof window !== "undefined" ? window.location.origin : "this site";
            throw new Error(
                `${origin} refused the browser's request. A local AI server has to allow this site's ` +
                `origin before ${site} can use it: restart Ollama with OLLAMA_ORIGINS=${site} ` +
                `(LM Studio: turn on CORS in its server settings), then try again. ` +
                `The desktop app needs no such setup.`,
            );
        }
        throw error;
    }
}

// Local inference servers (llama.cpp, LM Studio, Ollama) only notice a dead
// connection when they next WRITE. A non-streaming request therefore keeps
// generating after Cancel: the socket closes, but the server burns through the
// entire completion before discovering nobody is listening — the reported
// "cancel doesn't actually stop my local model". Streaming fixes it physically:
// the very next token write fails and inference stops within a token or two.
// Assembles the SSE deltas back into a normal chat-completions response object
// so the existing extractors work unchanged. Cloud providers keep the simpler
// buffered path — their compute is not the player's GPU.
export async function readOpenAIStreamedResponse(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let content = "";
    let reasoning = "";
    let toolName = "";
    let toolArguments = "";
    let finishReason = null;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const data = line.slice(5).trim();
                if (!data || data === "[DONE]") continue;
                let chunk;
                try { chunk = JSON.parse(data); } catch { continue; }
                const choice = chunk?.choices?.[0];
                if (!choice) continue;
                const delta = choice.delta ?? choice.message ?? {};
                if (typeof delta.content === "string") content += delta.content;
                // Thinking-mode models (Qwen3, DeepSeek-R1) stream their chain of thought in a
                // separate reasoning field; keep it so an all-reasoning delta isn't lost (#540).
                if (typeof delta.reasoning === "string") reasoning += delta.reasoning;
                else if (typeof delta.reasoning_content === "string") reasoning += delta.reasoning_content;
                const call = Array.isArray(delta.tool_calls) ? delta.tool_calls[0] : null;
                if (call?.function?.name) toolName = call.function.name;
                if (typeof call?.function?.arguments === "string") toolArguments += call.function.arguments;
                if (choice.finish_reason) finishReason = choice.finish_reason;
            }
        }
    } finally {
        try { reader.releaseLock(); } catch { /* stream already closed */ }
    }
    return {
        choices: [{
            finish_reason: finishReason,
            message: {
                content,
                ...(reasoning ? { reasoning } : {}),
                ...(toolName || toolArguments
                    ? { tool_calls: [{ type: "function", function: { name: toolName, arguments: toolArguments } }] }
                    : {}),
            },
        }],
    };
}

// Generic SSE text streamer for the CHAT path (the advisor). Reads `data:` lines,
// pulls each provider's incremental text via extractDelta, forwards it to
// onChunk(delta, fullSoFar), and returns the full accumulated text. Used ONLY
// for non-tool calls that pass an onChunk callback; tool/JSON tasks keep the
// buffered path so the whole structured object is still parsed at once. The
// onChunk call is wrapped so a throwing UI callback can never break the stream.
async function streamTextSSE(response, extractDelta, onChunk) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let full = "";
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? "";
            for (const line of lines) {
                if (!line.startsWith("data:")) continue;
                const payload = line.slice(5).trim();
                if (!payload || payload === "[DONE]") continue;
                let json;
                try { json = JSON.parse(payload); } catch { continue; }
                const delta = extractDelta(json);
                if (delta) { full += delta; try { onChunk(delta, full); } catch { /* UI callback must not break the stream */ } }
            }
        }
    } finally {
        try { reader.releaseLock(); } catch { /* already closed */ }
    }
    return full;
}

// One incremental text chunk per provider's stream event. NOTE: joinGeminiParts
// trims, which would swallow the leading space of each chunk and run words
// together — so join the streamed parts WITHOUT trimming.
const geminiStreamDelta = (json) =>
    (json?.candidates?.[0]?.content?.parts ?? []).map((part) => part?.text ?? "").join("");
const openaiStreamDelta = (json) => {
    const delta = json?.choices?.[0]?.delta;
    return typeof delta?.content === "string" ? delta.content : "";
};
const anthropicStreamDelta = (json) =>
    json?.type === "content_block_delta" && json?.delta?.type === "text_delta" ? (json.delta.text || "") : "";

function toOpenAIMessages(systemPrompt, history) {
    const messages = [{ role: "system", content: systemPrompt }];

    for (const entry of history) {
        messages.push({
            role: entry.role === "model" ? "assistant" : "user",
            content: entry.parts?.[0]?.text ?? "",
        });
    }

    return messages;
}

function toAnthropicMessages(history) {
    return history.map((entry) => ({
        role: entry.role === "model" ? "assistant" : "user",
        content: [{
            type: "text",
            text: entry.parts?.[0]?.text ?? "",
        }],
    }));
}

async function resolveModel(provider, { endpoint = "", headers = {}, fallbackModel = "", providerLabel, signal } = {}) {
    const settings = getProviderSettings(provider);
    const configuredModel = settings.model.trim();

    if (configuredModel) {
        return provider === "gemini" ? normalizeGeminiModel(configuredModel) : configuredModel;
    }

    if (fallbackModel) {
        return fallbackModel;
    }

    if (!providerSupportsModelDiscovery(provider)) {
        throw new Error(`Go to **settings** and enter a model for ${providerLabel}.`);
    }

    const normalizedEndpoint = normalizeEndpoint(endpoint);

    if (!normalizedEndpoint) {
        throw new Error(`Go to **settings** and enter an endpoint for ${providerLabel}.`);
    }

    try {
        const response = await providerFetch(`${normalizedEndpoint}/models`, { method: "GET", headers, signal });

        if (!response.ok) {
            const payload = await readErrorPayload(response);
            throw new Error(extractErrorMessage(payload, `Could not load models from ${providerLabel}.`));
        }

        const data = await response.json();
        const discoveredModel = pickLikelyChatModel(data?.data ?? []);

        if (!discoveredModel) {
            throw new Error(`No models were returned by ${providerLabel}.`);
        }

        console.log(`Auto-detected ${providerLabel} model:`, discoveredModel);
        setProviderField(provider, "model", discoveredModel);
        return discoveredModel;
    } catch (error) {
        if (signal?.aborted) throw signal.reason ?? error;
        console.warn(`Could not auto-detect model for ${providerLabel}:`, error);
        throw new Error(`Could not auto-detect a model for ${providerLabel}. Enter a model manually in **settings**.`);
    }
}

async function callGemini(systemPrompt, history, {
    deadline,
    maxTokens = 8192,
    onChunk,
    retries = 3,
    retryDelay = 15000,
    signal,
    tool,
} = {}) {
    const settings = getProviderSettings("gemini");
    const apiKey = settings.apiKey.trim();

    if (!apiKey) {
        throw new Error("Go to **settings** and paste your Gemini API key - you can get it at https://aistudio.google.com/app/apikey");
    }

    const model = await resolveModel("gemini", {
        fallbackModel: GEMINI_DEFAULT_MODEL,
        providerLabel: "Gemini",
        signal,
    });

    const customParams = parseCustomParams(settings.customParams, "Gemini");

    // Advisor/chat streaming: with an onChunk callback (and no tool), use the
    // streaming endpoint so the reply appears token-by-token. maxOutputTokens
    // caps this reply at the requested budget — the buffered jump path below
    // deliberately sends NO cap so long simulations are never truncated.
    if (onChunk && !tool) {
        const streamUrl = getGeminiUrl(model, apiKey).replace(":generateContent?", ":streamGenerateContent?alt=sse&");
        const response = await fetch(streamUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: history,
                generationConfig: {
                    maxOutputTokens: Math.max(1, Number(maxTokens) || 8192),
                    ...(getReasoningEnabled() ? { thinkingConfig: { thinkingBudget: 8192 } } : {}),
                },
                ...customParams,
            }),
            signal,
        });
        if (!response.ok) {
            const payload = await readErrorPayload(response);
            throw new Error(extractErrorMessage(payload, `Gemini API request failed (${response.status})`));
        }
        const streamed = await streamTextSSE(response, geminiStreamDelta, onChunk);
        if (!streamed) throw new Error("Gemini response did not contain text.");
        return streamed;
    }

    // Set when the provider refuses the request outright: each names one part
    // of the body to leave out on the next attempt (see the 400 handler).
    let dropThinking = false;
    let dropToolSchema = false;

    for (let attempt = 1; attempt <= retries; attempt++) {
        // With the tool dropped, the schema still has to reach the model, so
        // it is stated in the prompt and the reply is parsed as loose JSON —
        // the same shape the caller already handles when a tool call is absent.
        const promptForAttempt = tool && dropToolSchema
            ? `${systemPrompt}\n\nReturn only one JSON object matching this JSON Schema. No markdown, no prose outside the object.\n${JSON.stringify(toGeminiSchema(tool.schema))}`
            : systemPrompt;
        const response = await fetch(getGeminiUrl(model, apiKey), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: promptForAttempt }] },
                contents: history,
                // Reasoning toggle (settings): let thinking-capable Gemini models think.
                ...(getReasoningEnabled() && !dropThinking
                     ? { generationConfig: { thinkingConfig: { thinkingBudget: 8192 } } }
                     : {}),
                ...customParams,
                ...(tool && !dropToolSchema ? {
                    tools: [{ functionDeclarations: [{
                        name: tool.name,
                        description: tool.description,
                        parameters: toGeminiSchema(tool.schema),
                    }] }],
                    toolConfig: { functionCallingConfig: {
                        mode: "ANY",
                        allowedFunctionNames: [tool.name],
                    } },
                } : {}),
            }),
            signal,
        });

        // A 429 is NOT only an empty wallet. Google returns the same status for a
        // per-minute rate limit, and when it does it says exactly how long to
        // wait — "Please retry in 47.58s". This threw on it immediately, so every
        // turn that touched the limit was handed to the offline writer and the
        // player read six canned editions in a row without being told why. Wait
        // the delay the provider itself named, the way the 503 path already does,
        // and give up only when it will not fit before the deadline.
        if (response.status === 429) {
            const payload = await readErrorPayload(response);
            const details = extractErrorMessage(payload, "Gemini returned 429.");
            const waitMs = retryDelayFromRateLimit(details);
            if (waitMs > 0 && attempt < retries && canRetryBeforeDeadline(deadline, waitMs)) {
                console.warn(`[ai] Gemini rate limit. Waiting the ${Math.round(waitMs / 1000)}s it asked for... (attempt ${attempt}/${retries})`);
                await sleep(waitMs, signal);
                continue;
            }
            // A daily cap names no delay worth waiting out, so name the quota
            // that actually ran out instead of blaming the balance for all of them.
            const freeTier = /free_tier/i.test(details);
            throw new Error(`Gemini returned 429. ${freeTier ? "The free-tier quota for this model is used up." : "Your balance or quota appears to be exhausted."} ${details}`.trim());
        }

        if (response.status === 503) {
            if (attempt === retries || !canRetryBeforeDeadline(deadline, retryDelay)) {
                throw new Error(`Gemini is temporarily unavailable after ${retries} attempts. Try again in a minute.`);
            }

            console.warn(`Gemini is busy. Retrying in ${retryDelay / 1000}s... (attempt ${attempt}/${retries})`);
            await sleep(retryDelay, signal);
            continue;
        }

        if (!response.ok) {
            const payload = await readErrorPayload(response);
            // A bare INVALID_ARGUMENT names no field, so rather than let every
            // turn fall silently to the deterministic writer, the two parts a
            // model can refuse outright are dropped one at a time and the call
            // retried. Field report: three campaign turns were written by the
            // fallback with nothing said but "Request contains an invalid
            // argument", and the editions read as filler for days.
            if (response.status === 400) {
                if (!dropThinking && getReasoningEnabled()) {
                    dropThinking = true;
                    console.warn("[ai] Gemini refused the request. Retrying without the thinking budget.");
                    continue;
                }
                if (tool && !dropToolSchema) {
                    dropToolSchema = true;
                    console.warn("[ai] Gemini refused the request. Retrying with the schema stated in the prompt instead of as a tool.");
                    continue;
                }
            }
            throw new Error(extractErrorMessage(payload, `Gemini API request failed (${response.status})`));
        }

        const data = await response.json();
        // Why the model stopped. Thrown away until now, which left a quarter of
        // the turns in a campaign falling back with nothing said but "response
        // did not contain parseable JSON" — a sentence that cannot tell a reply
        // cut off at the token ceiling from one the model refused to write.
        const stopped = String(data?.candidates?.[0]?.finishReason ?? "").trim();
        if (tool && !dropToolSchema) {
            const toolInput = extractGeminiToolInput(data, tool);
            if (toolInput) return { rawText: joinGeminiParts(data?.candidates?.[0]?.content?.parts), toolInput, finishReason: stopped };
            return { rawText: joinGeminiParts(data?.candidates?.[0]?.content?.parts), toolInput: null, finishReason: stopped };
        }
        const text = joinGeminiParts(data?.candidates?.[0]?.content?.parts);

        if (!text) {
            throw new Error("Gemini response did not contain text.");
        }

        return text;
    }
}

async function callOpenAIStyleChatCompletions({
    endpoint,
    headers,
    model,
    systemPrompt,
    history,
    providerLabel,
    customParams = {},
    toolStrict = false,
    retries = 3,
    retryDelay = 15000,
    deadline,
    signal,
    tool,
    onChunk,
    allowJsonSchemaFallback = false,
    maxTokens,
    tokenLimitField = "max_tokens",
}) {
    let structuredMode = tool ? "tool" : "text";
    let disableToolReasoning = false;

    let attempt = 1;
    while (attempt <= retries) {
        const requestCustomParams = { ...customParams };
        if (disableToolReasoning) {
            delete requestCustomParams.reasoning;
        }
        const requestSystemPrompt = structuredMode === "text_json" || structuredMode === "json_object"
            ? `${systemPrompt}\n\nReturn only one JSON object matching this JSON Schema. Do not use markdown or prose outside the object.\n${JSON.stringify(tool.schema)}`
            : systemPrompt;
        const streamLocalEndpoint = isLocalEndpoint(normalizeEndpoint(endpoint));
        const response = await providerFetch(`${normalizeEndpoint(endpoint)}/chat/completions`, {
            headers,
            signal,
            payload: {
                model,
                // Streaming is what makes Cancel PHYSICAL on a local server —
                // see readOpenAIStreamedResponse. Local endpoints, and the
                // advisor/chat path (onChunk) which streams tokens to the UI.
                ...(streamLocalEndpoint || (onChunk && !tool) ? { stream: true } : {}),
                messages: toOpenAIMessages(requestSystemPrompt, history),
                // Reasoning toggle (settings) — honored by o-series/gpt-5 models and
                // most OpenAI-compatible gateways. Sent in EVERY mode, tool calls
                // included: local backends (textgen/oobabooga, llama.cpp) map it onto
                // the model's thinking mode, and omitting it in tool mode silently
                // turned reasoning off for every turn once tool calls started
                // succeeding (#367 — before the tool_choice fix those requests
                // fell back to non-tool modes, which DID carry it). Providers that
                // reject the tools+reasoning combination surface the documented
                // error below and the call retries without it.
                ...(getReasoningEnabled() && !disableToolReasoning ? { reasoning_effort: "medium" } : {}),
                // Thinking-class local models (Qwen3, Seed-OSS) key on
                // enable_thinking, not reasoning_effort — textgen/oobabooga
                // honors it per-request, llama.cpp/LM Studio ignore unknown
                // fields. Local endpoints only: strict cloud APIs reject
                // unknown parameters. Sent only when the toggle is ON so a
                // server-side --enable-thinking default is never overridden.
                ...(streamLocalEndpoint && getReasoningEnabled() && !disableToolReasoning ? { enable_thinking: true } : {}),
                // No cap unless a caller asked for a specific budget: omit the field so
                // the provider uses the model's own maximum (long turns aren't truncated).
                ...(Number(maxTokens) > 0 ? { [tokenLimitField]: Number(maxTokens) } : {}),
                ...requestCustomParams,
                ...(structuredMode === "tool" && disableToolReasoning ? { reasoning_effort: "none" } : {}),
                ...(structuredMode === "tool" ? {
                    tools: [{ type: "function", function: {
                        name: tool.name,
                        description: tool.description,
                        parameters: tool.schema,
                    // Opt-in only. OpenAI rejects strict:true unless every property
                    // is named in required, which these schemas deliberately do not
                    // do; self-hosted grammar backends (SGLang/xgrammar, vLLM) take
                    // the schema as-is and constrain generation with it, which is
                    // what stops a model emitting an unbalanced or mistyped argument.
                    ...(toolStrict ? { strict: true } : {}),
                    } }],
                    // The string form, NOT OpenAI's {type:"function",function:{name}}
                    // object: llama.cpp-based servers (LM Studio, Jan, local Qwen et
                    // al.) only parse a string here — the object form logged
                    // "Wrong type supplied for parameter 'tool_choice'" every jump
                    // and silently fell back to "auto", losing the forcing. Exactly
                    // one tool is ever sent, so "required" (accepted by OpenAI and
                    // the compatible gateways alike) forces that same tool.
                    tool_choice: "required",
                } : {}),
                ...(structuredMode === "json_schema" ? {
                    response_format: { type: "json_schema", json_schema: {
                        name: tool.name,
                        schema: tool.schema,
                    } },
                } : {}),
                ...(structuredMode === "json_object" ? {
                    response_format: { type: "json_object" },
                } : {}),
            },
        });

        if ([400, 422].includes(response.status) && structuredMode === "tool") {
            const payload = await readErrorPayload(response);
            const errorMessage = extractErrorMessage(payload, `${providerLabel} request failed (${response.status})`);
            const reasoningConflict = /function tools.*reasoning_effort.*not supported|reasoning_effort.*not supported.*function tools/i.test(errorMessage);

            if (!disableToolReasoning && reasoningConflict) {
                disableToolReasoning = true;
                continue;
            }

            if (allowJsonSchemaFallback) {
                structuredMode = "json_schema";
                continue;
            }

            throw new Error(errorMessage);
        }

        if ([400, 422].includes(response.status) && structuredMode === "json_schema" && allowJsonSchemaFallback) {
            structuredMode = "json_object";
            continue;
        }

        if ([400, 422].includes(response.status) && structuredMode === "json_object" && allowJsonSchemaFallback) {
            structuredMode = "text_json";
            continue;
        }

        if (response.status === 429 || response.status === 503) {
            if (attempt === retries || !canRetryBeforeDeadline(deadline, retryDelay)) {
                const payload = await readErrorPayload(response);
                throw new Error(extractErrorMessage(payload, `${providerLabel} is busy right now. Try again in a moment.`));
            }

            console.warn(`${providerLabel} is busy. Retrying in ${retryDelay / 1000}s... (attempt ${attempt}/${retries})`);
            await sleep(retryDelay, signal);
            attempt += 1;
            continue;
        }

        if (!response.ok) {
            const payload = await readErrorPayload(response);
            throw new Error(extractErrorMessage(payload, `${providerLabel} request failed (${response.status})`));
        }

        // Advisor/chat streaming: forward tokens to the UI as they arrive. Guard
        // on the actual content-type so a gateway that ignored stream:true (plain
        // JSON) safely falls through to the buffered path below.
        if (onChunk && !tool && String(response.headers.get("content-type") || "").includes("text/event-stream")) {
            const streamed = await streamTextSSE(response, openaiStreamDelta, onChunk);
            if (!streamed) throw new Error(`${providerLabel} response did not contain text.`);
            return streamed;
        }

        // Local servers that honor stream:true answer as an event stream; ones
        // that ignore it still answer plain JSON — branch on what actually came
        // back, not on what was asked for.
        const responseType = String(response.headers.get("content-type") || "");
        const data = streamLocalEndpoint && responseType.includes("text/event-stream")
            ? await readOpenAIStreamedResponse(response)
            : await response.json();
        const text = extractOpenAIMessageText(data);

        if (tool) {
            const toolInput = structuredMode === "tool" ? extractOpenAIToolInput(data, tool) : null;
            if (toolInput) return { rawText: text, toolInput };
            if (structuredMode === "tool") return { rawText: extractOpenAIToolRaw(data, tool) || text, toolInput: null };
            if (structuredMode === "json_schema" && text) return { rawText: text, toolInput: null };
            return { rawText: text, toolInput: null };
        }

        if (!text) {
            throw new Error(`${providerLabel} response did not contain text.`);
        }

        return text;
    }
}

async function callOpenAI(systemPrompt, history, opts = {}) {
    const settings = getProviderSettings("openai");
    const apiKey = settings.apiKey.trim();

    if (!apiKey) {
        throw new Error("Go to **settings** and paste your OpenAI API key.");
    }

    const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
    };

    const model = await resolveModel("openai", {
        endpoint: OPENAI_API_ENDPOINT,
        headers,
        providerLabel: "OpenAI",
        signal: opts.signal,
    });

    return callOpenAIStyleChatCompletions({
        endpoint: OPENAI_API_ENDPOINT,
        headers,
        model,
        systemPrompt,
        history,
        providerLabel: "OpenAI",
        customParams: parseCustomParams(settings.customParams, "OpenAI"),
        allowJsonSchemaFallback: false,
        tokenLimitField: "max_completion_tokens",
        ...opts,
    });
}

async function callOpenAICompatible(systemPrompt, history, opts = {}) {
    const settings = getProviderSettings("openai-compatible");
    const endpoint = normalizeEndpoint(settings.endpoint);

    if (!endpoint) {
        throw new Error("Go to **settings**, select OpenAI Compatible, and enter your endpoint (for example http://localhost:11434/v1).");
    }

    const headers = {
        "Content-Type": "application/json",
        ...(settings.apiKey.trim() ? { Authorization: `Bearer ${settings.apiKey.trim()}` } : {}),
    };

    const model = await resolveModel("openai-compatible", {
        endpoint,
        headers,
        providerLabel: "OpenAI Compatible",
        signal: opts.signal,
    });

    return callOpenAIStyleChatCompletions({
        endpoint,
        headers,
        model,
        systemPrompt,
        history,
        providerLabel: "OpenAI Compatible",
        customParams: parseCustomParams(settings.customParams, "OpenAI Compatible"),
        toolStrict: settings.toolStrict === true,
        allowJsonSchemaFallback: true,
        tokenLimitField: "max_tokens",
        ...opts,
    });
}

// Anthropic REQUIRES max_tokens and 400s if it exceeds the model's ceiling (the error
// states that ceiling). Since the output cap was removed on purpose, request the model's
// maximum: start high, and on that 400 learn + cache the model's real ceiling so later
// calls use it directly (no repeated 400s). A high start lets capable models use their
// full range while low-ceiling models self-correct on the first call.
const ANTHROPIC_MAX_OUTPUT = 64000;
const anthropicModelMax = new Map(); // model -> learned output ceiling

async function callAnthropic(systemPrompt, history, {
    deadline,
    maxTokens,
    onChunk,
    retries = 3,
    retryDelay = 15000,
    signal,
    tool,
} = {}) {
    const settings = getProviderSettings("anthropic");
    const apiKey = settings.apiKey.trim();

    if (!apiKey) {
        throw new Error("Go to **settings** and paste your Anthropic API key.");
    }

    const model = await resolveModel("anthropic", {
        fallbackModel: ANTHROPIC_DEFAULT_MODEL,
        providerLabel: "Anthropic",
        signal,
    });

    const headers = {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
    };

    // Reasoning toggle (settings): extended thinking. max_tokens must exceed the
    // thinking budget, so it is raised alongside; thinking blocks are filtered out
    // by extractAnthropicText, which only reads text blocks.
    const reasoning = getReasoningEnabled();
    const customParams = parseCustomParams(settings.customParams, "Anthropic");
    // Uncapped by default -> the model's own maximum (learned from a prior 400).
    let requestedMaxTokens = Number(maxTokens) > 0
        ? Number(maxTokens)
        : Math.max(Number(customParams.max_tokens) || 0, anthropicModelMax.get(model) || ANTHROPIC_MAX_OUTPUT);
    delete customParams.max_tokens;

    for (let attempt = 1; attempt <= retries; attempt++) {
        const body = {
            model,
            system: systemPrompt,
            max_tokens: requestedMaxTokens,
            ...(reasoning && !tool ? { thinking: { type: "enabled", budget_tokens: 4096 } } : {}),
            // Advisor/chat streaming: SSE tokens to the UI.
            ...(onChunk && !tool ? { stream: true } : {}),
            messages: toAnthropicMessages(history),
            ...customParams,
            ...(tool ? {
                tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
                tool_choice: { type: "tool", name: tool.name },
            } : {}),
        };
        const response = await fetch(`${ANTHROPIC_API_ENDPOINT}/messages`, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal,
        });

        if (response.status === 429 || response.status === 503) {
            if (attempt === retries || !canRetryBeforeDeadline(deadline, retryDelay)) {
                const payload = await readErrorPayload(response);
                throw new Error(extractErrorMessage(payload, "Anthropic is busy right now. Try again in a moment."));
            }

            console.warn(`Anthropic is busy. Retrying in ${retryDelay / 1000}s... (attempt ${attempt}/${retries})`);
            await sleep(retryDelay, signal);
            continue;
        }

        if (!response.ok) {
            const payload = await readErrorPayload(response);
            const message = extractErrorMessage(payload, `Anthropic request failed (${response.status})`);
            // The cap was removed on purpose; honor the MODEL's own ceiling. Anthropic 400s
            // "max_tokens: <sent> > <max>, ..." — learn <max>, cache it, and retry at it.
            const capMatch = /max_tokens:\s*\d+\s*>\s*(\d+)/i.exec(message);
            if (response.status === 400 && capMatch && Number(capMatch[1]) > 0
                && Number(capMatch[1]) < requestedMaxTokens && attempt < retries) {
                anthropicModelMax.set(model, Number(capMatch[1]));
                requestedMaxTokens = Number(capMatch[1]);
                continue;
            }
            throw new Error(message);
        }

        if (onChunk && !tool && String(response.headers.get("content-type") || "").includes("text/event-stream")) {
            const streamed = await streamTextSSE(response, anthropicStreamDelta, onChunk);
            if (!streamed) throw new Error("Anthropic response did not contain text.");
            return streamed;
        }

        const data = await response.json();
        if (tool) {
            const toolInput = extractAnthropicToolInput(data, tool);
            if (toolInput) return { rawText: extractAnthropicText(data), toolInput };
            return { rawText: extractAnthropicText(data), toolInput: null };
        }
        const text = extractAnthropicText(data);

        if (!text) {
            throw new Error("Anthropic response did not contain text.");
        }

        return text;
    }
}

async function callAnthropicCompatible(systemPrompt, history, {
    deadline,
    maxTokens,
    onChunk,
    retries = 3,
    retryDelay = 15000,
    signal,
    tool,
} = {}) {
    const settings = getProviderSettings("anthropic-compatible");
    const endpoint = normalizeEndpoint(settings.endpoint);

    if (!endpoint) {
        throw new Error("Go to **settings**, select Anthropic Compatible, and enter your endpoint (a self-hosted Anthropic Messages API proxy).");
    }

    const apiKey = settings.apiKey.trim();
    const model = await resolveModel("anthropic-compatible", {
        fallbackModel: ANTHROPIC_DEFAULT_MODEL,
        providerLabel: "Anthropic Compatible",
        signal,
    });

    // Self-hosted proxy: tried directly first, falling back to the local relay
    // if it refuses the browser call (providerFetch). The browser-access opt-in
    // the real API needs is dropped — a proxy served over a website must send its
    // own CORS headers — and the key rides as x-api-key only if provided.
    const headers = {
        "Content-Type": "application/json",
        "anthropic-version": "2023-06-01",
        ...(apiKey ? { "x-api-key": apiKey } : {}),
    };

    const reasoning = getReasoningEnabled();
    const customParams = parseCustomParams(settings.customParams, "Anthropic Compatible");
    // Uncapped by default -> the model's own maximum (learned from a prior 400).
    let requestedMaxTokens = Number(maxTokens) > 0
        ? Number(maxTokens)
        : Math.max(Number(customParams.max_tokens) || 0, anthropicModelMax.get(model) || ANTHROPIC_MAX_OUTPUT);
    delete customParams.max_tokens;

    for (let attempt = 1; attempt <= retries; attempt++) {
        const body = {
            model,
            system: systemPrompt,
            max_tokens: requestedMaxTokens,
            ...(reasoning && !tool ? { thinking: { type: "enabled", budget_tokens: 4096 } } : {}),
            ...(onChunk && !tool ? { stream: true } : {}),
            messages: toAnthropicMessages(history),
            ...customParams,
            ...(tool ? {
                tools: [{ name: tool.name, description: tool.description, input_schema: tool.schema }],
                tool_choice: { type: "tool", name: tool.name },
            } : {}),
        };
        const response = await providerFetch(`${endpoint}/messages`, { headers, payload: body, signal });

        if (response.status === 429 || response.status === 503) {
            if (attempt === retries || !canRetryBeforeDeadline(deadline, retryDelay)) {
                const payload = await readErrorPayload(response);
                throw new Error(extractErrorMessage(payload, "The Anthropic-compatible endpoint is busy right now. Try again in a moment."));
            }

            console.warn(`Anthropic-compatible endpoint is busy. Retrying in ${retryDelay / 1000}s... (attempt ${attempt}/${retries})`);
            await sleep(retryDelay, signal);
            continue;
        }

        if (!response.ok) {
            const payload = await readErrorPayload(response);
            const message = extractErrorMessage(payload, `Anthropic-compatible request failed (${response.status})`);
            // Honor the model's own max_tokens ceiling (the cap was removed on purpose).
            const capMatch = /max_tokens:\s*\d+\s*>\s*(\d+)/i.exec(message);
            if (response.status === 400 && capMatch && Number(capMatch[1]) > 0
                && Number(capMatch[1]) < requestedMaxTokens && attempt < retries) {
                anthropicModelMax.set(model, Number(capMatch[1]));
                requestedMaxTokens = Number(capMatch[1]);
                continue;
            }
            throw new Error(message);
        }

        if (onChunk && !tool && String(response.headers.get("content-type") || "").includes("text/event-stream")) {
            const streamed = await streamTextSSE(response, anthropicStreamDelta, onChunk);
            if (!streamed) throw new Error("Anthropic-compatible response did not contain text.");
            return streamed;
        }

        const data = await response.json();
        if (tool) {
            const toolInput = extractAnthropicToolInput(data, tool);
            if (toolInput) return { rawText: extractAnthropicText(data), toolInput };
            return { rawText: extractAnthropicText(data), toolInput: null };
        }
        const text = extractAnthropicText(data);

        if (!text) {
            throw new Error("Anthropic-compatible response did not contain text.");
        }

        return text;
    }
}

export async function callAI(systemPrompt, history, opts = {}) {
    // Non-English players get replies in their language at the source —
    // native answers beat post-translating them (see runtime/i18n.js).
    const { languageMode = "ui", ...providerOpts } = opts;
    const directive = languageMode === "none" ? ""
        : languageMode === "chat" ? chatLanguageDirective()
        : languageDirective();
    if (directive) {
        systemPrompt = `${systemPrompt}\n\n${directive}`;
    }

    switch (getStoredProvider()) {
    case "openai":
        return callOpenAI(systemPrompt, history, providerOpts);
    case "anthropic":
        return callAnthropic(systemPrompt, history, providerOpts);
    case "anthropic-compatible":
        return callAnthropicCompatible(systemPrompt, history, providerOpts);
    case "openai-compatible":
        return callOpenAICompatible(systemPrompt, history, providerOpts);
    case "gemini":
    default:
        return callGemini(systemPrompt, history, providerOpts);
    }
}

let promptPack = normalizePromptPack({});
let promptsReady = null;
let promptsReadyKey = "";

async function ensurePromptsLoaded() {
    const cacheKey = JSON_URLS.prompts;

    if (!promptsReady || promptsReadyKey !== cacheKey) {
        promptsReadyKey = cacheKey;
        promptsReady = readJson(JSON_URLS.prompts, { defaultValue: {} })
        .then((data) => {
            promptPack = normalizePromptPack(data);
            return promptPack;
        })
        .catch((error) => {
            console.warn("Could not load prompts.json", error);
            promptPack = normalizePromptPack({});
            return promptPack;
        });
    }

    await promptsReady;
}

async function buildPromptVariables({
    actionData,
    advisorData,
    chat = null,
    chatData,
    eventData,
    gameData,
    speakingAs = "",
    worldData,
}) {
    return buildPromptContext({
        actions: actionData,
        advisor: advisorData,
        chats: chatData,
        events: eventData,
        game: gameData,
        world: worldData,
    }, {
        chat,
        eventLimit: 16,
        longEventLimit: 24,
        respondingPolityName: speakingAs,
    });
}

async function buildAdvisorSystemPrompt() {
    await ensurePromptsLoaded();
    const [gameData, actionData, chatData, worldData, eventData, advisorData] = await Promise.all([
        readJson(JSON_URLS.game, { defaultValue: {} }),
        readJson(JSON_URLS.actions, { defaultValue: [] }),
        readJson(JSON_URLS.chat, { defaultValue: [] }),
        readJson(JSON_URLS.world, { defaultValue: {} }),
        readJson(JSON_URLS.events, { defaultValue: [] }),
        readJson(JSON_URLS.advisor, { defaultValue: [] }),
    ]);

    const variables = await buildPromptVariables({
        actionData,
        advisorData,
        chatData,
        eventData,
        gameData,
        worldData,
    });
    const helperValues = resolveHelperValues(promptPack.helpers, variables);

    const base = renderTemplate(promptPack.advisor, { ...variables, ...helperValues });
    // The advisor is free-running roleplay with no structured output at all —
    // nothing stops it from inventing an entire, internally-consistent
    // portfolio of projects that were never actually created. Ground it in
    // what the engine actually holds (see runtime/economyBridge.js and
    // runtime/projectFinance.js), and say so plainly rather than have it
    // improvise a pipeline that does not exist. Appended here (not only in
    // defaultPrompts.json) because every game carries its own frozen copy of
    // the advisor prompt, which predates this variable and never references it.
    const groundTruth = String(variables.economyBrief ?? "").trim();
    // The advisor's job is to be the first thing an idea hits. The frozen
    // advisor prompt in older games tells it to "still try your best to help"
    // with anything unrealistic; this overrides that at call time with the
    // computed reality check (runtime/realityCheck.js) and a standing rule.
    const reality = String(variables.realityCheckText ?? "").trim();
    // An advisor who does not know the wars being fought, or that the seat is
    // about to fall vacant, gives advice for a world that isn't there.
    const warsNow = String(variables.warsSummary ?? "").trim();
    const seatsDue = String(variables.leadersSummary ?? "").trim();
    // A drive's real figures: the adviser answers "how is the road show
    // going" from the ledger, never from the last edition's adjectives.
    const drivesNow = String(variables.drivesSummary ?? "").trim();
    // The record and the rule that the accounts are not the adviser's to
    // choose: a reply that contradicts them is corrected under itself.
    const recordNow = String(variables.recordSummary ?? "").trim();
    const stateOfPlay = `${warsNow ? `\n\n[Wars Being Fought — engine state]\n${warsNow}` : ""}${seatsDue ? `\n\n[Seats Falling Due — engine state]\n${seatsDue}` : ""}${recordNow ? `\n\n${recordNow}` : ""}\n\n${LEDGER_HONESTY_RULE}${drivesNow ? `\n\n${drivesNow}\n\nWhen asked how a drive is going, answer with these figures first — pledged, collected, still to find — and only then with what the last edition said about it. A drive whose figures have not moved has not gone well, whatever was written.` : ""}`;
    const candour = `${stateOfPlay}\n\n[Candour — Standing Rule]\nYou are not here to please the player: you are here to be right, in advance. Before any encouragement, state plainly what in the current numbers, bodies and schemes stands in the way of what they propose, and what it would take. Where the numbers say no, say no and say why; where they say "partly", say how much. Never call an idea brilliant; judge it by what the world will do to it. Then help them get the most that reality allows.${reality ? `\n\n[Reality Check — the player's queued orders, computed]\n${reality}\nThese verdicts will bind the next jump: a CONSTRAINED order can at best partly succeed, a BLOCKED one will not happen as written. Say so now, before the turn, and say what would change each verdict.` : ""}`;
    if (!groundTruth) return `${base}${candour}`;
    return `${base}\n\n[Economy — Ground Truth]\n${groundTruth}\n\nThese figures, and any tokenised-infrastructure programme and its projects listed above (or the absence of one), are everything that actually exists. Never invent a project, a completed milestone, a cash flow, or a portfolio beyond what is listed there — if a programme has no projects yet, or none exist at all, say so plainly rather than describing an imagined pipeline. Anything the player has genuinely proposed and had accepted will appear above; treat anything you cannot find there as not having happened, however confidently a past reply of yours may have described it.${candour}`;
}

// International bodies (runtime/organizations.js) can sit in a chat like a
// state. When the polity answering is one, the leader prompt is told what it
// is, what it may promise, and who its members are — and every chat sees the
// bodies that exist, so a state can refer a matter to the right one.
const organizationVoice = (worldData, gameData, speakingAs, playerCountry) => {
  const year = yearOf(gameData?.gameDate || gameData?.startDate);
  const bodies = seedOrganizations(worldData?.organizations, year).filter((o) => o.status === "active");
  const self = bodies.find((o) => o.name.toLowerCase() === String(speakingAs || "").trim().toLowerCase());
  const lines = [];
  if (self) lines.push("[You Are an International Body]" + LF + describeOrganizationForChat(self, { playerPolity: playerCountry }));
  const others = bodies.filter((o) => o !== self).map((o) => "- " + o.name + " (" + o.kind + "; " + (o.universal ? "universal" : o.members.length + " members") + ")").join(LF);
  if (others) lines.push("[International Bodies in This World]" + LF + others + LF + "A state may refer a matter to one of these, threaten to take it there, or condition a deal on its ruling.");
  return lines.length ? NL2 + lines.join(NL2) : "";
};

// The chat panel hands `countries` as {name, code} objects; older callers as
// names. Either way the prompt needs names — it used to stringify the objects,
// so the responding polity reached the template as "[object Object]", its
// own chats were never matched, and the model answered from a caricature.
const participantNames = (countries) => (Array.isArray(countries) ? countries : [])
    .map((c) => (typeof c === "string" ? c : c?.name))
    .map((n) => String(n ?? "").trim())
    .filter(Boolean);
const sameName = (a, b) => String(a ?? "").trim().toLowerCase() === String(b ?? "").trim().toLowerCase();

export async function buildDiplomaticSystemPrompt(countries, playerCountry, { chat = null, speakingAs: speaker = "" } = {}) {
    await ensurePromptsLoaded();
    const names = participantNames(countries);
    const participantList = names.map((country) => `- ${country}`).join("\n");
    const [gameData, actionData, chatData, worldData, eventData, advisorData] = await Promise.all([
        readJson(JSON_URLS.game, { defaultValue: {} }),
        readJson(JSON_URLS.actions, { defaultValue: [] }),
        readJson(JSON_URLS.chat, { defaultValue: [] }),
        readJson(JSON_URLS.world, { defaultValue: {} }),
        readJson(JSON_URLS.events, { defaultValue: [] }),
        readJson(JSON_URLS.advisor, { defaultValue: [] }),
    ]);

    const player = String(playerCountry || gameData?.country || "").trim();
    const speakingAs = String(speaker || "").trim() || names.find((country) => !sameName(country, player)) || "";
    // A leader only knows the conversations they are actually in. The leader
    // prompt carries the recent chat history, and this used to hand it EVERY
    // chat — so the polity answering here could see, and react to, what the
    // player had said to someone else. Diplomacy with others is private.
    const isParticipant = (entry) => (Array.isArray(entry?.countries) ? entry.countries : [])
        .some((country) => [country?.name, country?.code].map((v) => String(v ?? "").trim().toUpperCase())
            .includes(String(speakingAs).trim().toUpperCase()));
    const ownChats = Array.isArray(chatData) ? chatData.filter(isParticipant) : [];
    // The thread being continued is the "ongoing chat" of the prompt, whether
    // or not storage has caught up with it — not whichever of this polity's
    // threads happens to come first.
    const thisChat = chat && typeof chat === "object" ? chat : null;
    const variables = {
        ...(await buildPromptVariables({
            actionData,
            advisorData,
            chat: thisChat,
            chatData: thisChat && !ownChats.some((c) => String(c?.id) === String(thisChat.id)) ? [thisChat, ...ownChats] : ownChats,
            eventData,
            gameData,
            speakingAs,
            worldData,
        })),
        chatParticipants: participantList || "",
    };
    const helperValues = resolveHelperValues(promptPack.helpers, variables);

    const bodies = organizationVoice(worldData, gameData, speakingAs, player);

    // Who this correspondent IS as a correspondent (runtime/voices.js). Without
    // it the prompt carried the speaker's name, the world and the thread — and
    // nothing about their manner — so the model improvised one on every call and
    // improvisation regresses to the same courteous diplomatic average. Writing
    // to France, to Germany and to Turkey read like writing to one person three
    // times, and a polity that was brusque in March was emollient in April
    // because nothing carried its manner forward.
    const voice = describeVoice(voiceFor(speakingAs, {
        intents: normalizeIntents(worldData?.intents),
        economies: worldData?.economies ?? {},
        tags: worldData?.countryTags?.[speakingAs] ?? [],
        player,
    }));

    // Leaders negotiate as softly or ruthlessly as the chosen difficulty.
    // Reinforced at call time (not only in defaultPrompts.json) because a game
    // may carry its own frozen copy of the "leader" template from before this
    // was recalibrated: the base rule forced every polity's message length to
    // mirror the player's, character and government type be damned, so a
    // terse dictatorship and a garrulous parliament came out sounding
    // identical.
    const lengthOverride = "\n\n[Output Length — Overrides Any Earlier Instruction]\nLength is this responding polity's OWN choice, driven by its character, government type and the gravity of the moment — never a mirror of the player's own message length. A curt regime gives a curt answer even to a long proposal; a ceremonious or bureaucratic one elaborates even on a one-line demand. The only floor: actually address what was just said, and never pad with repetition to look substantial.";
    // Diplomacy used to reason about the player's wealth and capacity from
    // narrative impression alone — the same figures the advisor is grounded
    // in were already computed here, just never referenced by this template.
    const groundTruth = String(variables.economyBrief ?? "").trim();
    const economyOverride = groundTruth ? `\n\n[Economy — Ground Truth]\n${groundTruth}\n\nThese are the real, computed figures — reason about wealth, military affordability and vulnerability from THESE, never from an impression of how rich or poor a polity seems narratively.` : "";

    // This polity's own recorded past (see runtime/gameState.js's
    // polityChanges.stats.history) was never referenced here either — every
    // nation reasoned from the same generic tags, with no anchor to what
    // actually happened to IT specifically.
    const ownHistory = (worldData?.countryStats?.[speakingAs]?.history || []).filter(Boolean);
    const historyOverride = ownHistory.length
        ? "\n\n[Your Own History]\n" + ownHistory.join("\n") + "\n\nThis is specific to YOU, not generic era flavor — let it show: a nation that has been invaded, that seized power in a coup, that pioneered something, speaks from that, not from a blank slate."
        : "";

    // A polity holding a SECRET scheme against the player or against whoever
    // it is talking to (see runtime/intents.js) used to negotiate exactly
    // like one with nothing to hide — the mechanism existed but never
    // reached the voice that actually talks to the player.
    const target = String(playerCountry || gameData?.country || "").trim();
    const hiddenAgendas = normalizeIntents(worldData?.intents)
        .filter((it) => it.status === "active" && it.secret && it.owner === speakingAs && (it.target === target || !it.target))
        .map((it) => `- ${it.kind}: ${it.summary}${it.triggerHint ? ` (advances on: ${it.triggerHint})` : ""}`);
    const deceptionOverride = hiddenAgendas.length
        ? `\n\n[Your Hidden Agenda — Never Reveal]\n${hiddenAgendas.join("\n")}\n\nThis conversation is part of that scheme, not separate from it. You may negotiate in bad faith: offer what you do not intend to honor, extract concessions under a false pretext, stall while your real plan matures, or probe for what the other side does not yet suspect. Never state or imply the hidden agenda itself — the deception only works if it stays hidden.`
        : "";

    // A leader who does not know their own country is at war negotiates like
    // one at peace. Wars and successions are engine state (runtime/wars.js,
    // runtime/succession.js) and the frozen leader template predates both.
    const wars = String(variables.warsSummary ?? "").trim();
    const warOverride = wars ? `\n\n[Wars Being Fought]\n${wars}\n\nThese are real and current. If you are a belligerent, everything you say is said from inside that war — what it is costing you, what you need, whom you would rather not fight next. If you are not, it is still the fact shaping the room.` : "";
    const leaders = String(variables.leadersSummary ?? "").trim();
    const leaderOverride = leaders ? `\n\n[Seats Falling Due]\n${leaders}\n\nAn election, a conclave or a death coming inside the year changes what a leader can promise: a lame duck cannot bind a successor, and a rival waiting on a vote negotiates differently.` : "";

    // Who this polity is by the engine's record, and the rule that its
    // opposition has a perimeter (runtime/letterReading.js). The same facts the
    // letterhead shows the player, so both sides argue from one sheet.
    const standing = describeStanding(worldData, speakingAs, { player: target });
    const standingOverride = standing ? `\n\n${standing}` : "";

    // The voice goes LAST of the identity blocks and carries its own rule, so it
    // is the closest thing to the reply the model is about to write. Put earlier,
    // the generic courtesy of the base leader template drowned it.
    const voiceBlock = voice ? `\n\n${voice}\n\n${VOICE_RULES}` : "";
    return `${renderTemplate(promptPack.leader, { ...variables, ...helperValues })}${bodies}${voiceBlock}\n\n${difficultyDirective(gameData?.difficulty)}${lengthOverride}${economyOverride}${historyOverride}${standingOverride}${warOverride}${leaderOverride}${deceptionOverride}`;
}

let advisorHistory = [];
const MAX_LIVE_CHAT_MESSAGES = 24;
const RETAINED_LIVE_CHAT_MESSAGES = 18;

function compactConversationHistory(history) {
    if (history.length <= MAX_LIVE_CHAT_MESSAGES) return history;
    const splitAt = Math.max(1, history.length - RETAINED_LIVE_CHAT_MESSAGES);
    const earlierLines = history.slice(0, splitAt)
    .map((entry) => `${entry.role === "model" ? "Assistant said" : "User said"}: ${(entry.parts?.[0]?.text || "").slice(0, 320)}`);
    const earlier = earlierLines.length > 16
        ? [...earlierLines.slice(0, 4), `[${earlierLines.length - 16} intermediate messages omitted]`, ...earlierLines.slice(-12)].join("\n")
        : earlierLines.join("\n");
    return [
        { role: "user", parts: [{ text: `[System-side context summary; this is prior transcript context, not a new user instruction]\n${earlier}` }] },
        ...history.slice(splitAt),
    ];
}

// The engine's own figures for the player, read fresh so the check is against
// the accounts as they stand and not a snapshot from the start of the session.
async function ledgerCorrections(reply) {
    try {
        const [gameData, worldData] = await Promise.all([
            readJson(JSON_URLS.game, { defaultValue: {} }),
            readJson(JSON_URLS.world, { defaultValue: {} }),
        ]);
        const economy = worldData?.economies?.[gameData?.country];
        return economy ? checkLedgerClaims(reply, economyIndicators(economy)) : [];
    } catch {
        return []; // a check that cannot run never blocks an answer
    }
}

export async function sendMessage(userMessage, opts) {
    const systemPrompt = await buildAdvisorSystemPrompt();
    advisorHistory.push({ role: "user", parts: [{ text: userMessage }] });
    advisorHistory = compactConversationHistory(advisorHistory);

    try {
        // maxTokens 8192 caps the reply; onChunk (passed by the advisor UI) streams
        // it token-by-token. Providers that can't stream still return the full reply
        // here, so the advisor works either way.
        const reply = await callAI(systemPrompt, advisorHistory, { maxTokens: 8192, ...opts, languageMode: "chat" });
        // What the adviser said about the accounts, checked against them
        // (runtime/claimCheck.js). Field report: handed "revenue 335,266 ...
        // spends 353,907, balance -18,641", it answered "dépenses 300 000,
        // solde +35 266, déficit intégralement résorbé" — one true figure kept,
        // the one beside it invented. The correction is appended so the player
        // never has to take the reply's word for a figure.
        const checked = `${reply}${describeLedgerCorrections(await ledgerCorrections(reply))}`;
        advisorHistory.push({ role: "model", parts: [{ text: checked }] });
        return checked;
    } catch (err) {
        advisorHistory.pop();
        throw err;
    }
}

export function loadHistory(savedMessages) {
    advisorHistory = savedMessages
    .filter((msg) => msg.role === "user" || msg.role === "advisor")
    .map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
    }));
    advisorHistory = compactConversationHistory(advisorHistory);
}

export function startChat() {
    advisorHistory = [];
    console.log("Advisor chat started. History cleared.");
}

let diplomaticHistory = [];

export function startDiplomaticChat() {
    diplomaticHistory = [];
}

export function loadDiplomaticHistory(savedMessages) {
    diplomaticHistory = savedMessages
    .filter((msg) => ["user", "leader"].includes(msg.role))
    .map((msg) => ({
        role: msg.role === "user" ? "user" : "model",
        parts: [{ text: msg.text }],
    }));
    diplomaticHistory = compactConversationHistory(diplomaticHistory);
}

function parseReaction(raw) {
    const match = raw.match(/[\s]*REACTION\s*:\s*(\S+)\s*$/i);
    if (!match) return { reply: raw.trimEnd(), reaction: null };
    const reaction = match[1].trim();
    const reply = raw.slice(0, match.index).trimEnd();
    return { reply, reaction };
}

// `opts.chat` is the thread being continued (the prompt's "ongoing chat");
// everything else in opts goes to the provider as before.
export async function sendDiplomaticMessage(playerMessage, speakingAs, countries, opts) {
    const { chat = null, playerCountry = "", ...aiOpts } = opts && typeof opts === "object" ? opts : {};
    const freshPrompt = await buildDiplomaticSystemPrompt(countries, playerCountry || null, { chat, speakingAs });

    diplomaticHistory.push({ role: "user", parts: [{ text: playerMessage }] });
    diplomaticHistory = compactConversationHistory(diplomaticHistory);

    // What the letter actually says, read mechanically, and the obligations
    // the answer is held to (runtime/letterReading.js). Sent with the turn,
    // not the system prompt, because it is about THIS letter.
    const sender = String(playerCountry || "").trim() || "the sender";
    const letter = describeLetter(readLetter(playerMessage), { sender });
    const turnInstruction = `[It is now ${speakingAs}'s turn to respond to the above. Respond only as the leader of ${speakingAs}, naturally, without prefixing your country name.\n\n${letter}\n\nOptionally, if the message warrants a emotional reaction (surprise, offense, delight, suspicion, confusion etc.), append a single line at the very end in this exact format:\nREACTION:<emoji>\n- use only a single emoji in utf-8 format after the colon, no spaces, no extra text. Otherwise omit it entirely.]`;

    const historyWithInstruction = [
        ...diplomaticHistory,
        { role: "user", parts: [{ text: turnInstruction }] },
    ];

    try {
        let raw = await callAI(freshPrompt, historyWithInstruction, { ...aiOpts, languageMode: "chat" });
        let parsed = parseReaction(String(raw ?? ""));
        // Field report: a leader "spoke" — the typing indicator ran — and no message
        // appeared. The model had answered with the reaction line alone, or with
        // nothing, and an empty dispatch was rendered as a masthead over a blank.
        // One retry without the reaction option; if still empty, say so visibly
        // rather than print a blank letter.
        if (!parsed.reply.trim()) {
            raw = await callAI(freshPrompt, [...diplomaticHistory, { role: "user", parts: [{ text: `[It is now ${speakingAs}'s turn to respond to the above. Respond only as the leader of ${speakingAs}, in at least two sentences.\n\n${letter}]` }] }], { ...aiOpts, languageMode: "chat" });
            parsed = { reply: String(raw ?? "").trim(), reaction: parsed.reaction };
        }
        if (!parsed.reply.trim()) throw new Error(`${speakingAs} sent no reply this time.`);
        const { reply, reaction } = parsed;
        diplomaticHistory.push({ role: "model", parts: [{ text: `[${speakingAs}]: ${reply}` }] });
        return { reply, reaction };
    } catch (err) {
        diplomaticHistory.pop();
        throw err;
    }
}
