import { realpath, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { brawlerAssetCacheControl } from "./brawler-asset-cache.ts";

type NextFunction = (error?: unknown) => void;

const prefixes = ["/assets/brawlers/3d", "/bs/assets/brawlers/3d"] as const;
const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const allowedPath = /^(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.(?:bin|glb|json|png|webp)$/;
const contentTypes: Readonly<Record<string, string>> = {
  ".bin": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
};

function fail(response: ServerResponse, status: number, message: string): void {
  response.statusCode = status;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.end(message);
}

function relativeRequestPath(request: IncomingMessage): string | null | undefined {
  try {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    for (const prefix of prefixes) {
      if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
        return pathname.slice(prefix.length).replace(/^\/+/, "");
      }
    }
    return undefined;
  } catch {
    return null;
  }
}

function localTarget(root: string, relativePath: string): string | undefined {
  if (!allowedPath.test(relativePath) || relativePath.includes("\\") || relativePath.includes("\0")) return undefined;
  const target = path.resolve(root, relativePath);
  const relative = path.relative(root, target);
  return relative === "" || relative.startsWith("..") || path.isAbsolute(relative) ? undefined : target;
}

function assetMiddleware(rootDirectory: string | undefined) {
  return async (request: IncomingMessage, response: ServerResponse, next: NextFunction): Promise<void> => {
    const relativePath = relativeRequestPath(request);
    if (relativePath === undefined) {
      next();
      return;
    }
    if (relativePath === null) {
      fail(response, 400, "Invalid brawler asset URL");
      return;
    }
    if (!rootDirectory) {
      fail(response, 503, "BRAWL_3D_ASSET_DIR is not configured");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      fail(response, 405, "Method Not Allowed");
      return;
    }

    const target = localTarget(rootDirectory, relativePath);
    if (!target) {
      fail(response, 400, "Invalid brawler asset path");
      return;
    }

    try {
      const root = await realpath(rootDirectory);
      const resolvedTarget = await realpath(target);
      const relative = path.relative(root, resolvedTarget);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        fail(response, 403, "Brawler asset path is outside the configured directory");
        return;
      }
      const metadata = await stat(resolvedTarget);
      if (!metadata.isFile()) {
        fail(response, 404, "Brawler asset not found");
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", contentTypes[path.extname(resolvedTarget).toLowerCase()] ?? "application/octet-stream");
      response.setHeader("Content-Length", String(metadata.size));
      response.setHeader("Cache-Control", brawlerAssetCacheControl(relativePath));
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      response.end(await readFile(resolvedTarget));
    } catch {
      fail(response, 404, "Brawler asset not found");
    }
  };
}

export function resolveLocalBrawlerAssetDirectory(directory: string | undefined, repositoryRoot = path.resolve(import.meta.dirname, "../..")): string {
  const configured = directory?.trim();
  return configured ? path.resolve(configured) : path.join(repositoryRoot, ".generated", "brawl-3d");
}

export function brawler3dAssetsPlugin(directory: string | undefined): Plugin {
  const rootDirectory = resolveLocalBrawlerAssetDirectory(directory, repositoryRoot);
  const middleware = assetMiddleware(rootDirectory);
  return {
    name: "brawlstats-local-3d-assets",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
