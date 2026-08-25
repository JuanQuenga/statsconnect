import assert from "node:assert/strict";
import { test } from "node:test";
import { formatNumber, formatCompact, formatPercent } from "./number.ts";
import { timeAgo } from "./relative-time.ts";

test("formatNumber groups thousands", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
});

test("formatCompact collapses large values", () => {
  assert.equal(formatCompact(5200), "5.2K");
});

test("formatPercent renders a percent style", () => {
  assert.equal(formatPercent(0.5123), "51.2%");
});

test("timeAgo picks units from elapsed minutes", () => {
  const now = 1_000_000_000;
  assert.equal(timeAgo(now - 30_000, now), "1m ago");
  assert.equal(timeAgo(now - 5 * 60_000, now), "5m ago");
  assert.equal(timeAgo(now - 3 * 3_600_000, now), "3h ago");
  assert.equal(timeAgo(now - 2 * 86_400_000, now), "2d ago");
});

test("timeAgo accepts custom unit renderers", () => {
  const spanish = { minutes: (value: number) => `hace ${value} min` };
  assert.equal(timeAgo(1_000_000_000 - 8 * 60_000, 1_000_000_000, spanish), "hace 8 min");
});
