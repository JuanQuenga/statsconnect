import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import { defineConfig } from "vite";

const unifiedBuild = process.env.STATSCONNECT_UNIFIED_BUILD === "1";

export default defineConfig({
  base: unifiedBuild ? "/clashroyale/" : "/",
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
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
      "@": path.resolve(__dirname, "./src"),
    },
  },
  publicDir: "public",
  build: unifiedBuild
    ? {
        outDir: "../../dist/clashroyale",
        emptyOutDir: false,
      }
    : undefined,
});
