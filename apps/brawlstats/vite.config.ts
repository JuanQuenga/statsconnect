import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { defineConfig, loadEnv } from "vite";
import { brawler3dAssetsPlugin } from "./brawl-3d-assets-plugin";
import {
  deliveryApp,
  viteBasePath,
  viteOutputDirectory,
} from "../../scripts/production-delivery";

const unifiedBuild = process.env.STATSCONNECT_UNIFIED_BUILD === "1";
const delivery = deliveryApp("brawlstats");

export default defineConfig(({ mode }) => {
  const environment = loadEnv(mode, process.cwd(), "");
  const localAssetDirectory = process.env.BRAWL_3D_ASSET_DIR ?? environment.BRAWL_3D_ASSET_DIR;

  return {
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
      brawler3dAssetsPlugin(localAssetDirectory),
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
  };
});
