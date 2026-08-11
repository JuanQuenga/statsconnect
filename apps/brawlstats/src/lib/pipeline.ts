import { ConvexHttpClient } from "convex/browser";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../convex/_generated/api";

export type PipelineStatus = FunctionReturnType<typeof api.pipeline.pipelineStatus>;

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  const configured = import.meta.env.VITE_CONVEX_URL || import.meta.env.VITE_CONVEX_SITE_URL || "";
  const deploymentUrl = configured.replace(".convex.site", ".convex.cloud").replace(/\/$/, "");
  if (!deploymentUrl) {
    throw new Error("Set VITE_CONVEX_URL to view crawler health.");
  }

  return await new ConvexHttpClient(deploymentUrl).query(api.pipeline.pipelineStatus, {});
}
