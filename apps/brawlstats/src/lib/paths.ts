import { gameRoutePath } from "@statsconnect/site-nav/location";

/** Public assets retain their build namespace on every hostname. */
export function appPath(path: string): string {
  if (!path.startsWith("/")) return path;
  const baseUrl = import.meta.env?.BASE_URL ?? "/";
  return `${baseUrl}${path.replace(/^\/+/, "")}`;
}

export function routePath(path: string): string {
  return gameRoutePath("brawl-stars", import.meta.env?.BASE_URL ?? "/", typeof window === "undefined" ? "" : window.location.hostname, path);
}
