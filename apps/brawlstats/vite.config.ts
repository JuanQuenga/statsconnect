import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";
import {
  deliveryApp,
  viteBasePath,
  viteOutputDirectory,
} from "../../scripts/production-delivery";

const unifiedBuild = process.env.STATSCONNECT_UNIFIED_BUILD === "1";
const delivery = deliveryApp("brawlstats");

export default defineConfig({
  base: unifiedBuild ? viteBasePath(delivery.id) : "/",
  plugins: [
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  publicDir: "public",
  build: unifiedBuild
    ? {
        outDir: viteOutputDirectory(delivery.id),
        emptyOutDir: delivery.clearsUnifiedOutput,
        manifest: true,
      }
    : undefined,
});
