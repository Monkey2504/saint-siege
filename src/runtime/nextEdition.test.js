import assert from "node:assert/strict";
import test from "node:test";

import { SPANS, nextEdition } from "./nextEdition.js";

const TODAY = "2029-03-01";
const order = (text, over = {}) => ({ id: "a1", kind: "action", status: "planned", title: text.slice(0, 40), text, ...over });

test("an empty desk carries the world at its own pace", () => {
  const out = nextEdition({}, [], { today: TODAY });
  assert.equal(out.days, SPANS.idle);
  assert.equal(out.date, "2029-03-31");
  assert.match(out.reason, /nothing at the desk/);
});

test("a letter is answered within the week", () => {
  const out = nextEdition({}, [order("Write to the President of France about the pension reform.")], { today: TODAY });
  assert.equal(out.days, 7);
  assert.equal(out.date, "2029-03-08");
  assert.equal(out.reason, "a letter to answer");
});

test("a body that must sit needs a month, even when it is convoked by letter", () => {
  const out = nextEdition({}, [order("Write to the cardinals to convoke a consistory on the pension question.")], { today: TODAY });
  assert.equal(out.days, 30);
  assert.equal(out.reason, "a body that must sit");
});

test("a campaign runs to its season", () => {
  const out = nextEdition({}, [order("Open a fundraising drive across the Americas.")], { today: TODAY });
  assert.equal(out.days, 90);
});

test("the slowest order sets the pace, so nothing prints before it can report", () => {
  const out = nextEdition({}, [
    order("Write to Berlin."),
    order("Open a collecte across Africa."),
  ], { today: TODAY });
  assert.equal(out.days, 90);
  assert.match(out.reason, /campaign/);
});

test("a dated gathering pulls the edition forward — print when there is news", () => {
  const world = { gatherings: [{ name: "Pax Europa 2029", status: "planned", date: "2029-03-20" }] };
  const out = nextEdition(world, [order("Open a fundraising drive across Asia.")], { today: TODAY });
  assert.equal(out.date, "2029-03-20");
  assert.equal(out.days, 19);
  assert.equal(out.reason, "the Pax Europa 2029");
});

test("a gathering later than the desk's own pace does not delay the edition", () => {
  const world = { gatherings: [{ name: "World Youth Day", status: "planned", date: "2031-08-01" }] };
  const out = nextEdition(world, [order("Write to Warsaw.")], { today: TODAY });
  assert.equal(out.days, 7);
});

test("a gathering already held is not waited for", () => {
  const world = { gatherings: [{ name: "Held", status: "held", date: "2029-03-05" }] };
  const out = nextEdition(world, [], { today: TODAY });
  assert.equal(out.days, SPANS.idle);
});

test("chats and settled orders do not set the pace", () => {
  const out = nextEdition({}, [
    order("Talk to Germany", { kind: "chat" }),
    order("Write to Berlin.", { status: "resolved" }),
  ], { today: TODAY });
  assert.match(out.reason, /nothing at the desk/);
});

test("the order that set the pace is named, so the date can be explained", () => {
  const out = nextEdition({}, [order("Convoke a synod on clerical pay.")], { today: TODAY });
  assert.equal(out.from, "Convoke a synod on clerical pay.");
});

test("without a date on the game there is still a span to run", () => {
  const out = nextEdition({}, [order("Write to Berlin.")], { today: "" });
  assert.equal(out.days, SPANS.idle);
  assert.equal(out.date, "");
});
