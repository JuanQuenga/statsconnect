/**
 * Function modules for convex-test. Listed explicitly instead of through
 * import.meta.glob so the Convex typecheck needs no Vite client types. The
 * multi-dot file name keeps the Convex bundler from deploying it.
 */
export const modules = {
  "./_generated/api.js": () => import("./_generated/api.js"),
  "./_generated/server.js": () => import("./_generated/server.js"),
  "./brawl/players.ts": () => import("./brawl/players"),
  "./clash/meta.ts": () => import("./clash/meta"),
  "./clash/summaries.ts": () => import("./clash/summaries"),
};
