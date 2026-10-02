import assert from "node:assert/strict";
import test from "node:test";
import { COMMUNITY_COOLDOWN, emptyCommunityState, feedbackHref, nextCommunityRequest, parseCommunityState, publicSupportUrl } from "./community-policy.ts";

const now = 10 * COMMUNITY_COOLDOWN;
const returning = { ...emptyCommunityState, successfulSessions: 2, firstSuccessAt: now - COMMUNITY_COOLDOWN };
const input = { state: returning, now, succeededThisSession: false, requestedThisSession: false, supportAvailable: true };

test("first-time visitors and repeated clicks in one session receive no request", () => {
  const first = nextCommunityRequest({ ...input, state: emptyCommunityState });
  assert.equal(first.request, null);
  assert.equal(first.state.successfulSessions, 1);
  const repeat = nextCommunityRequest({ ...input, state: first.state, succeededThisSession: true });
  assert.equal(repeat.request, null);
  assert.equal(repeat.state.successfulSessions, 1);
});

test("three sessions still cannot trigger a request within the first day", () => {
  assert.equal(nextCommunityRequest({ ...input, state: { ...returning, firstSuccessAt: now - 1_000 } }).request, null);
});

test("first eligible success asks for feedback and stores the cooldown before display", () => {
  const result = nextCommunityRequest(input);
  assert.equal(result.request, "feedback");
  assert.equal(result.state.lastRequestAt, now);
  assert.equal(nextCommunityRequest({ ...input, state: result.state, now: now + 1 }).request, null);
  assert.equal(nextCommunityRequest({ ...input, requestedThisSession: true }).request, null);
});

test("a configured checkout can be requested only after the feedback cooldown", () => {
  const state = { ...returning, lastRequestAt: now, lastRequestKind: "feedback" as const };
  assert.equal(nextCommunityRequest({ ...input, state, now: now + COMMUNITY_COOLDOWN - 1 }).request, null);
  assert.equal(nextCommunityRequest({ ...input, state, now: now + COMMUNITY_COOLDOWN }).request, "support");
  assert.equal(nextCommunityRequest({ ...input, state, now: now + COMMUNITY_COOLDOWN, supportAvailable: false }).request, "feedback");
});

test("permanent opt-out suppresses both kinds of request", () => {
  assert.equal(nextCommunityRequest({ ...input, state: { ...returning, disabled: true } }).request, null);
});

test("malformed browser state and future timestamps cannot bypass eligibility", () => {
  for (const value of [null, {}, { ...returning, successfulSessions: NaN }, { ...returning, disabled: "no" }, { ...returning, lastRequestKind: "upgrade" }]) {
    assert.deepEqual(parseCommunityState(value), emptyCommunityState);
  }
  assert.deepEqual(parseCommunityState(returning), returning);
  assert.equal(nextCommunityRequest({ ...input, state: { ...returning, lastRequestAt: now + COMMUNITY_COOLDOWN } }).request, null);
});

test("checkout links reject test mode, credentials, trackers, lookalike hosts and unsafe protocols", () => {
  for (const value of [undefined, "", "javascript:alert(1)", "http://buy.stripe.com/abcdefghijk", "https://buy.stripe.com/test_abcdefghijk", "https://buy.stripe.com.evil.example/abcdefghijk", "https://user:secret@buy.stripe.com/abcdefghijk", "https://buy.stripe.com/abcdefghijk?client_reference_id=player", "https://buy.stripe.com/abcdefghijk#secret", "https://buy.stripe.com/"]) {
    assert.equal(publicSupportUrl(value), null);
  }
  assert.equal(publicSupportUrl(" https://buy.stripe.com/abcdefghijk "), "https://buy.stripe.com/abcdefghijk");
});

test("feedback uses the existing public contact and contains no browsing or profile context", () => {
  const destination = new URL(feedbackHref);
  assert.equal(destination.pathname, "harmiox@gmail.com");
  assert.equal(destination.searchParams.get("subject"), "StatsConnect feedback");
  assert.equal(destination.searchParams.has("cc"), false);
  assert.equal(destination.searchParams.has("bcc"), false);
  assert.match(destination.searchParams.get("body") ?? "", /leave out passwords/);
});
