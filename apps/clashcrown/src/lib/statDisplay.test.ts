import assert from "node:assert/strict";
import test from "node:test";
import { statDisplay } from "./statDisplay.ts";

test("missing trophies render as unavailable, not zero", () => {
  assert.equal(statDisplay(undefined), "—");
});

test("observed zero trophies and numeric trophies remain formatted", () => {
  assert.equal(statDisplay(0), "0");
  assert.equal(statDisplay(12345), (12345).toLocaleString());
});
