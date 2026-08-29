import assert from "node:assert/strict";
import test from "node:test";
import { deploymentUrlFromOutput } from "./phone-preview.ts";

test("deploymentUrlFromOutput returns the last Vercel deployment URL", () => {
  assert.equal(
    deploymentUrlFromOutput([
      "Inspect: https://vercel.com/team/project/abc",
      "Production: https://statsconnect-old.vercel.app",
      "https://statsconnect-current.vercel.app",
    ].join("\n")),
    "https://statsconnect-current.vercel.app",
  );
});

test("deploymentUrlFromOutput rejects output without a deployment URL", () => {
  assert.throws(
    () => deploymentUrlFromOutput("Vercel build completed without a URL"),
    /without printing a deployment URL/,
  );
});
