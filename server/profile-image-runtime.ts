import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import type { ProfileImageRuntime } from "../shared/profile-image-runtime.ts";

type Game = "cr" | "bs";
const remoteArtworkHosts = new Set(["api-assets.clashroyale.com", "cdn.brawlify.com", "brawlstars.inbox.supercell.com"]);
const fontLoads = new Map<string, Promise<void>>();
const maximumArtworkBytes = 8 * 1024 * 1024;

function publicFile(game: Game, source: string): string | undefined {
  if (!source.startsWith("/") || source.startsWith("//") || source.includes("\\")) return undefined;
  const root = path.resolve(process.cwd(), `apps/${game === "cr" ? "clashcrown" : "brawlstats"}/public`);
  const filename = path.resolve(root, source.replace(/^\/(?:cr|bs)\//, "/").slice(1));
  return filename.startsWith(`${root}${path.sep}`) ? filename : undefined;
}

async function artworkBytes(game: Game, source: string): Promise<Buffer | undefined> {
  const filename = publicFile(game, source);
  if (filename) return readFile(filename);
  let url: URL;
  try { url = new URL(source); } catch { return undefined; }
  if (url.protocol !== "https:" || url.port || url.username || url.password || !remoteArtworkHosts.has(url.hostname)) return undefined;
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(6000) });
  if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) return undefined;
  if (Number(response.headers.get("content-length")) > maximumArtworkBytes) return undefined;
  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length <= maximumArtworkBytes ? bytes : undefined;
}

/**
 * Skia implements the drawing operations used by both browser renderers,
 * including naturalWidth/naturalHeight and PNG toBlob. The casts are limited
 * to this native binding boundary; no DOM objects are installed on globalThis.
 */
export function nativeProfileImageRuntime(game: Game): ProfileImageRuntime {
  return {
    assetUrl: (source) => source,
    async loadImage(source) {
      try {
        const bytes = await artworkBytes(game, source);
        if (!bytes) return undefined;
        const image = await loadImage(bytes);
        return image as unknown as HTMLImageElement;
      } catch { return undefined; }
    },
    async loadFont(source, family) {
      const key = `${game}:${family}`;
      let loading = fontLoads.get(key);
      if (!loading) {
        loading = (async () => {
          const filename = publicFile(game, source);
          if (!filename || !GlobalFonts.register(await readFile(filename), family)) throw new Error("Profile font is unavailable");
        })();
        fontLoads.set(key, loading);
        loading.catch(() => fontLoads.delete(key));
      }
      await loading;
    },
    createCanvas(width, height) {
      const canvas = createCanvas(width, height);
      return canvas as unknown as HTMLCanvasElement;
    },
  };
}
