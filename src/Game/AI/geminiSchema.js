/*! Open Historia — the tool schema as Gemini will accept it © 2026 Nicholas Krol, MIT (see src/Editor/LICENSE). */

// The provider's function-declaration schema is a narrow subset of JSON Schema,
// and it is also finite: past a certain size the request comes back "Request
// contains an invalid argument" and EVERY turn silently falls back to the
// deterministic writer. A real campaign lost two turns that way — three
// generic events apiece — after two new lever arrays pushed the declaration
// over the edge, and nothing said so except a line in the fallback reason.
//
// So the conversion lives here, pure and importable by node --test, with a
// budget the test suite enforces. Adding a lever is fine; adding one that
// breaks every turn is not, and now it fails the build instead of the game.

// Keywords the provider's schema type does not carry. Dropping them is safe:
// they constrain values the engine re-validates anyway (gameplaySchemas'
// validateGameplayPayload) and re-normalises on the way in.
export const GEMINI_DROPPED_KEYWORDS = new Set([
  "additionalProperties", "$schema", "minimum", "maximum",
  "minItems", "maxItems", "minLength", "maxLength", "pattern", "default",
]);

// A description is guidance; the rules blocks in the system prompt carry the
// same meaning in prose. So descriptions are trimmed, and below the depth at
// which a lever's own fields sit (about ten) they are dropped entirely — that
// is where the stat sheets and economy sub-objects live, whose field names
// already say what they are.
export const GEMINI_DESCRIPTION_LIMIT = 110;
export const GEMINI_DESCRIPTION_MAX_DEPTH = 10;

// What the whole declaration may weigh, as JSON. Measured, not guessed: the
// declaration that failed was 38 KB, the one that worked before it about 37 KB.
// 32 KB keeps a real margin under the smaller of the two.
export const GEMINI_SCHEMA_BUDGET = 32_000;

const shortenForGemini = (value) => {
  if (typeof value !== "string" || value.length <= GEMINI_DESCRIPTION_LIMIT) return value;
  const cut = value.slice(0, GEMINI_DESCRIPTION_LIMIT);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("; "), cut.lastIndexOf(" — "));
  return (stop > 60 ? cut.slice(0, stop + 1) : `${cut.slice(0, cut.lastIndexOf(" ") + 1 || GEMINI_DESCRIPTION_LIMIT)}…`).trim();
};

// An object node the provider cannot express: no properties to describe, and no
// anyOf to stand in for them.
const isUnexpressibleObject = (node) =>
  node && typeof node === "object" && !Array.isArray(node)
  && node.type === "object" && !Array.isArray(node.anyOf)
  && Object.keys(node.properties ?? {}).length === 0;

export function toGeminiSchema(value, depth = 0) {
  if (Array.isArray(value)) return value.map((entry) => toGeminiSchema(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (GEMINI_DROPPED_KEYWORDS.has(key)) continue;
    if (key === "description") {
      if (depth <= GEMINI_DESCRIPTION_MAX_DEPTH) out.description = shortenForGemini(entry);
      continue;
    }
    if (key === "properties" && entry && typeof entry === "object") {
      const kept = Object.entries(entry).filter(([, child]) => !isUnexpressibleObject(child));
      out.properties = Object.fromEntries(kept.map(([name, child]) => [name, toGeminiSchema(child, depth + 2)]));
      continue;
    }
    out[key] = toGeminiSchema(entry, depth + 1);
  }
  // `required` must not name a property that was just dropped.
  if (Array.isArray(out.required) && out.properties) {
    const names = new Set(Object.keys(out.properties));
    out.required = out.required.filter((name) => names.has(name));
    if (out.required.length === 0) delete out.required;
  }
  return out;
}

/** The declaration's weight, as the provider will receive it. */
export const geminiSchemaSize = (schema) => JSON.stringify(toGeminiSchema(schema)).length;

/**
 * Everything the provider's schema type cannot express, found before it is
 * sent rather than after every turn has quietly degraded. Returns one line per
 * problem, empty when the declaration is clean.
 */
export const geminiSchemaProblems = (schema) => {
  const ALLOWED = new Set(["type", "description", "enum", "properties", "required", "items", "nullable", "anyOf", "format"]);
  const problems = [];
  const visit = (node, path) => {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) if (!ALLOWED.has(key)) problems.push(`unsupported key "${key}" at ${path}`);
    if (!node.type && !Array.isArray(node.anyOf)) problems.push(`no type at ${path}`);
    if (node.enum && node.type !== "string") problems.push(`enum on type=${node.type} at ${path}`);
    if (node.items && node.type !== "array") problems.push(`items on type=${node.type} at ${path}`);
    if (node.type === "array" && !node.items) problems.push(`array without items at ${path}`);
    if (node.type === "object" && !node.properties && !Array.isArray(node.anyOf)) problems.push(`object with no properties at ${path}`);
    if (Array.isArray(node.required) && node.properties) {
      for (const name of node.required) if (!(name in node.properties)) problems.push(`required "${name}" is not a property at ${path}`);
    }
    if (node.properties) for (const [name, child] of Object.entries(node.properties)) visit(child, `${path}.${name}`);
    if (node.items) visit(node.items, `${path}[]`);
    if (Array.isArray(node.anyOf)) node.anyOf.forEach((child, i) => visit(child, `${path}|${i}`));
  };
  visit(toGeminiSchema(schema), "$");
  return problems;
};
