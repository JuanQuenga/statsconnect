import type { UseQueryResult } from "@tanstack/react-query";

export function queryListState<T>(query: Pick<UseQueryResult<T[]>, "data" | "isPending" | "isError">): "loading" | "error" | "empty" | "ready" {
  if (query.isError) return "error";
  if (query.isPending) return "loading";
  return query.data?.length ? "ready" : "empty";
}
