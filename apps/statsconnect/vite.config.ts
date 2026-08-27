import { readFileSync } from "node:fs";
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
const mobileDev = process.env.STATSCONNECT_MOBILE_DEV === "1";
const delivery = deliveryApp("statsconnect");

function requiredMobileDevValue(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required when STATSCONNECT_MOBILE_DEV=1.`);
  return value;
}

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
  server: mobileDev
    ? {
        https: {
          cert: readFileSync(requiredMobileDevValue("STATSCONNECT_MOBILE_CERT")),
          key: readFileSync(requiredMobileDevValue("STATSCONNECT_MOBILE_KEY")),
        },
        proxy: {
          "/bs": {
            changeOrigin: true,
            target: requiredMobileDevValue("STATSCONNECT_BRAWL_DEV_ORIGIN"),
            ws: true,
          },
          "/cr": {
            changeOrigin: true,
            target: requiredMobileDevValue("STATSCONNECT_CLASH_DEV_ORIGIN"),
            ws: true,
          },
        },
      }
    : undefined,
  build: unifiedBuild
    ? {
        outDir: viteOutputDirectory(delivery.id),
        emptyOutDir: delivery.clearsUnifiedOutput,
      }
    : undefined,
});
