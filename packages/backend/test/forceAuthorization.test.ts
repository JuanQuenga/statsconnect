import assert from "node:assert/strict";
import test from "node:test";
import { requireForceAuthorization } from "../convex/clash/forceAuthorization.ts";

test("normal cached requests do not require the admin key", () => {
  const previous = process.env.BETA_ADMIN_KEY;
  delete process.env.BETA_ADMIN_KEY;
  try {
    assert.doesNotThrow(() => requireForceAuthorization({}));
    assert.doesNotThrow(() => requireForceAuthorization({ force: false }));
  } finally {
    if (previous === undefined) delete process.env.BETA_ADMIN_KEY;
    else process.env.BETA_ADMIN_KEY = previous;
  }
});

test("forced requests reject missing or incorrect keys", () => {
  const previous = process.env.BETA_ADMIN_KEY;
  process.env.BETA_ADMIN_KEY = "";
  try {
    assert.throws(() => requireForceAuthorization({ force: true }), /Force refresh requires the admin key/);
    process.env.BETA_ADMIN_KEY = "correct-key";
    assert.throws(() => requireForceAuthorization({ force: true, adminKey: "wrong-key" }), /Force refresh requires the admin key/);
  } finally {
    if (previous === undefined) delete process.env.BETA_ADMIN_KEY;
    else process.env.BETA_ADMIN_KEY = previous;
  }
});

test("forced requests accept the configured key", () => {
  const previous = process.env.BETA_ADMIN_KEY;
  process.env.BETA_ADMIN_KEY = "correct-key";
  try {
    assert.doesNotThrow(() => requireForceAuthorization({ force: true, adminKey: "correct-key" }));
  } finally {
    if (previous === undefined) delete process.env.BETA_ADMIN_KEY;
    else process.env.BETA_ADMIN_KEY = previous;
  }
});
