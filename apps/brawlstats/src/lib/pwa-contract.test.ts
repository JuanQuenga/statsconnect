import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const worker = readFileSync(new URL("../../public/service-worker.js", import.meta.url), "utf8");

function workerShell(hostname: string, scope: string): string[] {
  const value: unknown = runInNewContext(`${worker}\nAPP_SHELL`, {
    URL,
    self: { location: { hostname }, registration: { scope }, addEventListener: () => undefined },
  });
  if (!Array.isArray(value) || !value.every((entry): entry is string => typeof entry === "string")) {
    throw new Error("Worker must expose a string-only precache list");
  }
  return Array.from(value);
}

test("subdomain worker precaches root shell and namespaced game assets", () => {
  const paths = workerShell("bs.statsconnect.app", "https://bs.statsconnect.app/").map((url) => new URL(url).pathname);
  assert.equal(paths[0], "/");
  assert.equal(paths[1], "/manifest.webmanifest");
  assert.ok(paths.slice(2).every((path) => path.startsWith("/bs/")));
});

test("legacy worker retains its prefixed shell and assets", () => {
  const paths = workerShell("preview.vercel.app", "https://preview.vercel.app/bs/").map((url) => new URL(url).pathname);
  assert.equal(paths[0], "/bs/");
  assert.ok(paths.every((path) => path.startsWith("/bs/")));
});

test("root install manifest uses root routes and namespaced icons", () => {
  const manifest: unknown = JSON.parse(readFileSync(new URL("../../public/subdomain.webmanifest", import.meta.url), "utf8"));
  assert.ok(manifest && typeof manifest === "object" && "start_url" in manifest && "scope" in manifest && "icons" in manifest);
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.ok(Array.isArray(manifest.icons));
  for (const icon of manifest.icons) {
    assert.ok(icon && typeof icon === "object" && "src" in icon && typeof icon.src === "string");
    assert.ok(icon.src.startsWith("/bs/"));
  }
});
