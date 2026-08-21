import assert from "node:assert/strict";
import test from "node:test";
import {
  createProfileTrackingState,
  ProfileTrackingAuthRequiredError,
  profileTrackingKey,
  requireProfileTrackingAuth,
  StatsConnectAuthConfigurationError,
} from "./profile-tracking.ts";

test("profile tracking keys normalize tags and preserve game isolation", () => {
  assert.equal(profileTrackingKey("brawl-stars", "#abc"), "brawl-stars:ABC");
  assert.notEqual(
    profileTrackingKey("brawl-stars", "ABC"),
    profileTrackingKey("clash-royale", "ABC"),
  );
});

test("headless state exposes tracked and error states without browser identity", () => {
  const state = createProfileTrackingState({
    status: "error",
    authenticated: true,
    profiles: [{ game: "brawl-stars", tag: "ABC", name: "Nova" }],
    error: "tracking failed",
  });

  assert.equal(state.status, "error");
  assert.equal(state.authenticated, true);
  assert.equal(state.error, "tracking failed");
  assert.equal(state.isTracked("brawl-stars", "#abc"), true);
  assert.equal(state.isTracked("clash-royale", "#abc"), false);
});

test("unauthenticated tracking is an explicit typed failure", () => {
  assert.throws(
    () => requireProfileTrackingAuth(false),
    (error: unknown) => error instanceof ProfileTrackingAuthRequiredError
      && error.code === "AUTH_REQUIRED",
  );
  assert.doesNotThrow(() => requireProfileTrackingAuth(true));
});

test("missing auth configuration is an explicit typed failure", () => {
  const error = new StatsConnectAuthConfigurationError();
  assert.equal(error.code, "AUTH_NOT_CONFIGURED");
  assert.match(error.message, /not configured/i);
});

test("an empty account snapshot cannot claim a browser-local profile is tracked", () => {
  const state = createProfileTrackingState({
    status: "unauthenticated",
    authenticated: false,
    profiles: [],
    error: null,
  });
  assert.equal(state.isTracked("brawl-stars", "LOCAL"), false);
});
