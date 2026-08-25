import {
  useParams,
  useRouterState,
  useSearch,
  useRouter as useTanStackRouter,
} from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

type QueryValue = string | string[] | undefined;
type LegacyUrl = string | {
  pathname: string;
  query?: Record<string, string | number | boolean | null | undefined>;
};

function toHref(target: LegacyUrl): string {
  if (typeof target === "string") return target;
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(target.query ?? {})) {
    if (value !== null && value !== undefined) search.set(key, String(value));
  }
  const suffix = search.size ? `?${search.toString()}` : "";
  return `${target.pathname}${suffix}`;
}

function navigationPath(href: string): string {
  return href.split(/[?#]/, 1)[0] || "/";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Next-style facade over TanStack Router. Path parameters come from the active
 * route match (`useParams`) rather than re-parsing the URL with regexes, so
 * they cannot drift from the route definitions; search parameters come from
 * `useSearch`. Path parameters win on key collision, matching the old parser.
 */
export function useRouter() {
  const router = useTanStackRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const params = useParams({ strict: false });
  // The generated route tree only knows params/search for routes registered in
  // it; pages consume arbitrary keys, so widen to the legacy record shape.
  const search = useSearch({ strict: false }) as unknown as Record<string, QueryValue>;
  const query = useMemo(() => ({ ...search, ...params }), [search, params]) as Record<string, QueryValue>;

  const navigate = useCallback(
    (target: LegacyUrl, replace = false) => {
      const href = toHref(target);
      return router.navigate({
        href,
        replace,
        // Legacy query-driven controls (for example leaderboard tabs) should
        // keep their in-place update instead of animating the shared hero.
        viewTransition: !prefersReducedMotion() && navigationPath(href) !== pathname,
      });
    },
    [pathname, router],
  );

  return {
    isReady: true,
    query,
    push: (target: LegacyUrl) => navigate(target),
    replace: (target: LegacyUrl, _as?: string, _options?: { shallow?: boolean }) => navigate(target, true),
  };
}
