import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

export type PipelineStatus = {
  now: number;
  counters: Array<{ name: string; value: number; updatedAt: number }>;
  targets: { total: number; due: number; capped: boolean };
  battlesLast24Hours: { count: number; capped: boolean };
  apiCallsLastHour: { total: number; failures: number; capped: boolean };
  recentRuns: Array<{
    id: string;
    job: string;
    startedAt: number;
    finishedAt?: number;
    ok: boolean;
    note?: string;
    discovered?: number;
    fetched?: number;
    battles?: number;
    failures?: number;
  }>;
};

const pipelineStatusQuery = makeFunctionReference<
  "query",
  Record<string, never>,
  PipelineStatus
>("brawl/pipeline:pipelineStatus");

export async function fetchPipelineStatus(): Promise<PipelineStatus> {
  const configured = import.meta.env.VITE_CONVEX_URL || import.meta.env.VITE_CONVEX_SITE_URL || "";
  const deploymentUrl = configured.replace(".convex.site", ".convex.cloud").replace(/\/$/, "");
  if (!deploymentUrl) {
    throw new Error("Set VITE_CONVEX_URL to view crawler health.");
  }

  return await new ConvexHttpClient(deploymentUrl).query(pipelineStatusQuery, {});
}
