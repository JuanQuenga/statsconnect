import path from "node:path";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import type { BuildOptions, PluginOption } from "vite";

type SentryViteIntegration = Readonly<{
  build: Pick<BuildOptions, "sourcemap">;
  plugin: PluginOption | null;
}>;

function configuredValue(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

export function sentryViteIntegration(outputDirectory: string): SentryViteIntegration {
  const authToken = configuredValue("SENTRY_AUTH_TOKEN");
  const org = configuredValue("SENTRY_ORG");
  const project = configuredValue("SENTRY_PROJECT");

  if (!authToken || !org || !project) {
    return { build: {}, plugin: null };
  }

  const outputPath = path.resolve(outputDirectory);
  const assetGlob = path.join(outputPath, "**/*.{js,js.map,css,css.map}");
  const sourceMapGlob = path.join(outputPath, "**/*.map");

  return {
    build: { sourcemap: "hidden" },
    plugin: sentryVitePlugin({
      authToken,
      org,
      project,
      sourcemaps: {
        assets: [assetGlob],
        filesToDeleteAfterUpload: [sourceMapGlob],
      },
    }),
  };
}
