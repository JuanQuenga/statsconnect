import assert from "node:assert/strict";
import { test } from "node:test";
import { searchKeyAction } from "./search-keyboard.ts";

test("Escape then Enter cannot choose a hidden cached suggestion", () => {
  const highlighted = searchKeyAction({ key: "ArrowDown", count: 3, activeIndex: -1, open: true });
  assert.deepEqual(highlighted, { kind: "highlight", index: 0 });
  assert.deepEqual(searchKeyAction({ key: "Escape", count: 3, activeIndex: 0, open: true }), { kind: "dismiss" });
  assert.deepEqual(searchKeyAction({ key: "Enter", count: 3, activeIndex: 0, open: false }), { kind: "none" });
});

test("a loading popup can be dismissed before choices arrive", () => {
  assert.deepEqual(searchKeyAction({ key: "Escape", count: 0, activeIndex: -1, open: true }), { kind: "dismiss" });
});

test("visible choices wrap and reject a removed selected index", () => {
  assert.deepEqual(searchKeyAction({ key: "ArrowUp", count: 3, activeIndex: -1, open: true }), { kind: "highlight", index: 2 });
  assert.deepEqual(searchKeyAction({ key: "ArrowDown", count: 3, activeIndex: 2, open: true }), { kind: "highlight", index: 0 });
  assert.deepEqual(searchKeyAction({ key: "Enter", count: 3, activeIndex: 1, open: true }), { kind: "choose", index: 1 });
  assert.deepEqual(searchKeyAction({ key: "Enter", count: 1, activeIndex: 2, open: true }), { kind: "none" });
});
