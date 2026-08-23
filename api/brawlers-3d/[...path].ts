/**
 * Same-origin streaming proxy for the immutable Brawl Stars 3D asset package.
 *
 * This must remain an Edge handler. Vercel Functions buffer response bodies
 * at a size below some legitimate GLB files; forwarding `upstream.body`
 * preserves streaming, Range requests, and partial (206) responses.
 */

import { brawlerAssetCacheControl, isMutableBrawlerAssetPath } from "../../apps/brawlstats/brawler-asset-cache.ts";

declare const process: { readonly env: Readonly<Record<string, string | undefined>> };

type StorageHeader = "accept-ranges" | "cache-control" | "content-length" | "content-range" | "content-type" | "etag" | "expires" | "last-modified" | "vary";

const storageOriginVariable = "BRAWL_3D_ASSET_STORAGE_ORIGIN";
const functionPath = "/api/brawlers-3d/";
const assetPathPattern = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:bin|glb|json|png|webp)$/;
const requestHeaders = ["if-modified-since", "if-none-match", "if-range", "range"] as const;
const responseHeaders: readonly StorageHeader[] = ["accept-ranges", "cache-control", "content-length", "content-range", "content-type", "etag", "expires", "last-modified", "vary"];

function fail(status: number, message: string): Response {
  return new Response(message, {
    status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

function configuredStorageOrigin(): URL | undefined {
  const raw = process.env[storageOriginVariable]?.trim();
  if (!raw) return undefined;

  try {
    const origin = new URL(raw);
    if (origin.protocol !== "https:") return undefined;
    if (origin.username || origin.password || origin.search || origin.hash) return undefined;
    if (origin.pathname !== "/" && !origin.pathname.endsWith("/")) return undefined;
    return origin;
  } catch {
    return undefined;
  }
}

function requestedAssetPath(request: Request): string | undefined {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(functionPath)) return undefined;
  const encodedPath = pathname.slice(functionPath.length);
  const segments = encodedPath.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return "";
    }
  });
  if (segments.some((segment) => segment === "" || segment === "." || segment === ".." || segment.includes("\\") || segment.includes("\0"))) return undefined;
  const path = segments.join("/");
  return assetPathPattern.test(path) ? path : undefined;
}

function upstreamUrl(origin: URL, assetPath: string): URL {
  const base = new URL(origin.toString());
  const prefix = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  base.pathname = `${prefix}${assetPath.split("/").map((segment) => encodeURIComponent(segment)).join("/")}`;
  return base;
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers();
  for (const name of requestHeaders) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  return headers;
}

function responseHeadersFrom(upstream: Response, assetPath: string): Headers {
  const headers = new Headers();
  for (const name of responseHeaders) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (isMutableBrawlerAssetPath(assetPath)) headers.set("Cache-Control", brawlerAssetCacheControl(assetPath));
  else if (!headers.has("cache-control")) headers.set("Cache-Control", upstream.ok ? brawlerAssetCacheControl(assetPath) : "no-store");
  return headers;
}

export const config = { runtime: "edge" };

export default async function handler(request: Request): Promise<Response> {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  }

  const origin = configuredStorageOrigin();
  if (!origin) return fail(503, `${storageOriginVariable} is not configured`);

  const assetPath = requestedAssetPath(request);
  if (!assetPath) return fail(400, "Invalid brawler asset path");

  try {
    const upstream = await fetch(upstreamUrl(origin, assetPath), {
      method: request.method,
      headers: forwardedHeaders(request),
      redirect: "error",
    });
    return new Response(request.method === "HEAD" ? null : upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeadersFrom(upstream, assetPath),
    });
  } catch {
    return fail(502, "Brawler asset storage request failed");
  }
}
