import path from "node:path";
import { copyFile } from "node:fs/promises";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { defineConfig, type Plugin } from "vite";

const unifiedBuild = process.env.STATSCONNECT_UNIFIED_BUILD === "1";

function spa404(): Plugin {
  let outputDirectory = "";
  return {
    name: "spa-404",
    apply: "build",
    configResolved: (config) => {
      outputDirectory = path.resolve(config.root, config.build.outDir);
    },
    closeBundle: () => copyFile(
      path.join(outputDirectory, "index.html"),
      path.join(outputDirectory, "404.html"),
    ),
  };
}

export default defineConfig({
  base: unifiedBuild ? "/brawlstars/" : "/",
  plugins: [
    TanStackRouterVite({
      target: "react",
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
    spa404(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  publicDir: "public",
  build: unifiedBuild
    ? {
        outDir: "../../dist/brawlstars",
        emptyOutDir: false,
      }
    : undefined,
});
