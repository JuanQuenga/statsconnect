import { useRouter as useTanStackRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

type QueryValue = string | string[] | undefined;
type LegacyUrl = string | {
  pathname: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

const parameterRoutes = [
  { pattern: /^\/players\/([^/]+)\/upgrades\/?$/, key: "tag" },
  { pattern: /^\/players\/([^/]+)\/?$/, key: "tag" },
  { pattern: /^\/clans\/([^/]+)\/war\/?$/, key: "tag" },
  { pattern: /^\/clans\/([^/]+)\/?$/, key: "tag" },
  { pattern: /^\/cards\/([^/]+)\/?$/, key: "slug" },
] as const;

function routeQuery(href: string): Record<string, QueryValue> {
  const url = new URL(href, window.location.origin);
  const query: Record<string, QueryValue> = {};

  for (const [key, value] of url.searchParams) query[key] = value;
  for (const route of parameterRoutes) {
    const match = url.pathname.match(route.pattern);
    if (match?.[1]) query[route.key] = decodeURIComponent(match[1]);
  }

  return query;
}

function toHref(target: LegacyUrl): string {
  if (typeof target === "string") return target;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(target.query ?? {})) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const suffix = search.size ? `?${search.toString()}` : "";
  return `${target.pathname}${suffix}`;
}

export function useRouter() {
  const router = useTanStackRouter();
  const href = useRouterState({ select: (state) => state.location.href });
  const query = useMemo(() => routeQuery(href), [href]);

  const navigate = useCallback(
    (target: LegacyUrl, replace = false) => router.navigate({ to: toHref(target) as never, replace }),
    [router],
  );

  return {
    isReady: true,
    query,
    push: (target: LegacyUrl) => navigate(target),
    replace: (target: LegacyUrl, _as?: string, _options?: { shallow?: boolean }) => navigate(target, true),
  };
}
