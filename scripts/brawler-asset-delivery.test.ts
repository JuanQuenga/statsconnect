import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import handler from "../api/brawlers-3d/[...path].ts";
import { brawlerAssetCacheControl, isMutableBrawlerAssetPath } from "../apps/brawlstats/brawler-asset-cache.ts";
import { resolveLocalBrawlerAssetDirectory } from "../apps/brawlstats/brawl-3d-assets-plugin.ts";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(repositoryRoot, relativePath), "utf8")) as T;
}

test("brawler 3D requests redirect to owned static hosting before SPA rewrites", async () => {
  const vercel = await readJson<{
    redirects: Array<{ source: string; destination: string; permanent: boolean }>;
    rewrites: Array<{ source: string; destination: string }>;
  }>("vercel.json");
  for (const prefix of ["/bs/assets/brawlers/3d", "/assets/brawlers/3d", "/api/brawlers-3d"]) {
    assert.deepEqual(vercel.redirects.find((route) => route.source === `${prefix}/:path*`), {
      source: `${prefix}/:path*`,
      destination: "https://statsconnect-brawl-assets.juanquenga.workers.dev/:path*",
      permanent: false,
    });
  }
  assert.equal(vercel.rewrites.at(-1)?.destination, "/index.html");
});

test("storage configuration is server-only and local assets are opt-in", async () => {
  const example = await readFile(path.join(repositoryRoot, "apps/brawlstats/.env.example"), "utf8");
  const proxy = await readFile(path.join(repositoryRoot, "api/brawlers-3d/[...path].ts"), "utf8");
  assert.match(example, /^BRAWL_3D_ASSET_DIR=/m);
  assert.match(example, /^BRAWL_3D_ASSET_STORAGE_ORIGIN=https:\/\//m);
  assert.doesNotMatch(example, /^VITE_BRAWL_3D_ASSET_STORAGE_ORIGIN=/m);
  assert.match(proxy, /BRAWL_3D_ASSET_STORAGE_ORIGIN/);
  assert.match(proxy, /runtime: "edge"/);
  assert.match(proxy, /upstream\.body/);
  assert.doesNotMatch(proxy, /arrayBuffer\(\)|maxAssetBytes/);
  assert.doesNotMatch(proxy, /mv\.brawlstars\.top|https?:\/\/[^'"`]*cdn/i);
});

test("local dev gives explicit asset directories precedence over the ignored repository fallback", async () => {
  const gitignore = await readFile(path.join(repositoryRoot, ".gitignore"), "utf8");
  const exampleRoot = "/tmp/statsconnect-fixture";
  assert.equal(resolveLocalBrawlerAssetDirectory(undefined, exampleRoot), `${exampleRoot}/.generated/brawl-3d`);
  assert.equal(resolveLocalBrawlerAssetDirectory("./converted", exampleRoot), path.resolve("converted"));
  assert.match(gitignore, /^\.generated\/brawl-3d\/$/m);
});

test("catalog metadata is revalidated while content-addressed assets stay immutable", () => {
  assert.equal(isMutableBrawlerAssetPath("catalog.json"), true);
  assert.equal(isMutableBrawlerAssetPath("catalog/16000012.json"), true);
  assert.equal(isMutableBrawlerAssetPath("models/16000012-a1b2.glb"), false);
  assert.equal(brawlerAssetCacheControl("catalog.json"), "no-cache, must-revalidate");
  assert.equal(brawlerAssetCacheControl("catalog/16000012.json"), "no-cache, must-revalidate");
  assert.equal(brawlerAssetCacheControl("faces/16000012-a1b2/atlas.png"), "public, max-age=31536000, immutable");
});

test("the Edge proxy streams a synthetic asset larger than Vercel's buffered limit and forwards Range", async () => {
  const previousOrigin = process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
  const previousFetch = globalThis.fetch;
  const chunk = new Uint8Array(4.5 * 1024 * 1024 + 1);
  const upstreamBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(chunk);
      controller.close();
    },
  });
  let capturedUrl = "";
  let capturedRange = "";
  process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN = "https://assets.example/project/";
  globalThis.fetch = async (input, init) => {
    capturedUrl = String(input);
    capturedRange = new Headers(init?.headers).get("range") ?? "";
    return new Response(upstreamBody, {
      status: 206,
      headers: {
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunk.byteLength),
        "Content-Range": `bytes 0-${chunk.byteLength - 1}/*`,
        "Content-Type": "model/gltf-binary",
      },
    });
  };

  try {
    const response = await handler(new Request("https://stats.example/api/brawlers-3d/models/large.glb", { headers: { Range: "bytes=0-" } }));
    assert.equal(response.status, 206);
    assert.equal(response.headers.get("Content-Range"), `bytes 0-${chunk.byteLength - 1}/*`);
    assert.equal(capturedUrl, "https://assets.example/project/models/large.glb");
    assert.equal(capturedRange, "bytes=0-");
    assert.equal((await response.arrayBuffer()).byteLength, chunk.byteLength);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOrigin === undefined) delete process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
    else process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN = previousOrigin;
  }
});

test("the Edge proxy fails closed when production storage is not configured", async () => {
  const previousOrigin = process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
  delete process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
  try {
    const response = await handler(new Request("https://stats.example/api/brawlers-3d/catalog.json"));
    assert.equal(response.status, 503);
    assert.match(await response.text(), /BRAWL_3D_ASSET_STORAGE_ORIGIN is not configured/);
  } finally {
    if (previousOrigin === undefined) delete process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
    else process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN = previousOrigin;
  }
});

test("the Edge proxy never makes mutable catalog metadata immutable", async () => {
  const previousOrigin = process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
  const previousFetch = globalThis.fetch;
  process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN = "https://assets.example/project/";
  globalThis.fetch = async () => new Response("catalog", {
    status: 200,
    headers: { "Cache-Control": "public, max-age=31536000, immutable", "Content-Type": "application/json" },
  });

  try {
    const response = await handler(new Request("https://stats.example/api/brawlers-3d/catalog.json"));
    assert.equal(response.headers.get("Cache-Control"), "no-cache, must-revalidate");
  } finally {
    globalThis.fetch = previousFetch;
    if (previousOrigin === undefined) delete process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN;
    else process.env.BRAWL_3D_ASSET_STORAGE_ORIGIN = previousOrigin;
  }
});

test("the project delivery boundary documents fail-closed provisioning", async () => {
  const documentation = await readFile(path.join(repositoryRoot, "docs/BRAWL_3D_ASSET_DELIVERY.md"), "utf8");
  assert.match(documentation, /BRAWL_3D_ASSET_DIR/);
  assert.match(documentation, /BRAWL_3D_ASSET_STORAGE_ORIGIN/);
  assert.match(documentation, /503/);
  assert.match(documentation, /tracked legacy GLBs or official PNG fallback/);
  assert.match(documentation, /2\.6 GiB/);
});
