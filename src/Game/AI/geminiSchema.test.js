/*! Open Historia — the tool declaration must stay inside what the provider accepts. */
import test from "node:test";
import assert from "node:assert/strict";
import { GEMINI_SCHEMA_BUDGET, geminiSchemaProblems, geminiSchemaSize, toGeminiSchema } from "./geminiSchema.js";
import { GAMEPLAY_TOOLS } from "./gameplaySchemas.js";

// The failure this guards: two new lever arrays pushed the jump declaration
// over what the provider accepts, every turn came back "Request contains an
// invalid argument", and the deterministic fallback wrote three generic events
// a turn until someone read the fallback reason.
test("every tool declaration stays inside the provider's budget", () => {
  const over = Object.entries(GAMEPLAY_TOOLS)
    .map(([key, tool]) => [key, geminiSchemaSize(tool.schema)])
    .filter(([, size]) => size > GEMINI_SCHEMA_BUDGET)
    .map(([key, size]) => `${key}: ${size} chars, over the ${GEMINI_SCHEMA_BUDGET} budget`);
  assert.deepEqual(over, [], `a tool declaration grew past what the provider takes:\n${over.join("\n")}\nTrim descriptions or a lever's fields — do not raise the budget without measuring against a real call.`);
});

test("no tool declaration uses anything the provider's schema type cannot express", () => {
  const problems = Object.entries(GAMEPLAY_TOOLS)
    .flatMap(([key, tool]) => geminiSchemaProblems(tool.schema).map((p) => `${key}: ${p}`));
  assert.deepEqual(problems, []);
});

test("the conversion drops what it must and keeps the levers legible", () => {
  const converted = toGeminiSchema({
    type: "object",
    description: "x".repeat(400),
    additionalProperties: false,
    properties: {
      amount: { type: "number", minimum: 0, maximum: 1, description: "how much" },
      empty: { type: "object", properties: {} },
      name: { type: "string", minLength: 1 },
    },
    required: ["amount", "empty"],
  });
  assert.equal(converted.additionalProperties, undefined);
  assert.equal(converted.properties.amount.minimum, undefined);
  assert.equal(converted.properties.amount.description, "how much", "a lever's own field keeps its guidance");
  assert.equal(converted.properties.empty, undefined, "an object the provider cannot express is dropped");
  assert.deepEqual(converted.required, ["amount"], "required never names a dropped property");
  assert.ok(converted.description.length <= 111);
});

test("a lever's field descriptions survive the depth cut, deep stat sheets do not", () => {
  const jump = toGeminiSchema(GAMEPLAY_TOOLS.jumpForward.schema);
  const ops = jump.properties.events.items.properties.impacts.properties;
  assert.ok(ops.treasuryOps.items.properties.margin.description, "the model still learns what a margin is");
  assert.ok(ops.driveOps.items.properties.amount.description);
  assert.ok(ops.treasuryOps.description);
});
