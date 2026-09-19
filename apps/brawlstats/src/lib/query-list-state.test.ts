import assert from "node:assert/strict";
import { test } from "node:test";
import { queryListState } from "./query-list-state.ts";

test("pending and failed requests are not empty lists", () => {
  assert.equal(queryListState({ data: undefined, isPending: true, isError: false }), "loading");
  assert.equal(queryListState({ data: undefined, isPending: false, isError: true }), "error");
});

test("only a successful empty response renders an empty state", () => {
  assert.equal(queryListState({ data: [], isPending: false, isError: false }), "empty");
  assert.equal(queryListState({ data: [1], isPending: false, isError: false }), "ready");
});

test("a failed refresh is disclosed even when cached data exists", () => {
  assert.equal(queryListState({ data: [1], isPending: false, isError: true }), "error");
});
