import { useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { hubRoutes, siteOrigin } from "../../../../shared/site-routes.ts";
import { isGameId } from "./contracts.ts";

/** Update the existing document tags, including those supplied by the site shell. */
export function HubDocumentMetadata() {
  const route = useRouterState({
    select: (state) => {
      const match = state.matches.at(-1);
      if (!match || match.status !== "success") return;
      // Static route segments match without regard to case; game IDs do not.
      const path = match.routeId === "/connect/$game" && isGameId(match.params.game)
        ? `/connect/${match.params.game}`
        : match.fullPath.replace(/\/$/, "") || "/";
      return hubRoutes.find((candidate) => candidate.path === path);
    },
  });

  useEffect(() => {
    if (!route) return;

    const existingCanonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    const canonical = existingCanonical ?? document.createElement("link");
    const previousCanonical = existingCanonical?.getAttribute("href") ?? null;
    canonical.rel = "canonical";
    canonical.href = `${siteOrigin("hub")}${route.path}`;
    if (!existingCanonical) document.head.append(canonical);

    const existingDescription = document.head.querySelector<HTMLMetaElement>('meta[name="description"]');
    const description = existingDescription ?? document.createElement("meta");
    const previousDescription = existingDescription?.getAttribute("content") ?? null;
    description.name = "description";
    description.content = route.description;
    if (!existingDescription) document.head.append(description);

    return () => {
      if (!existingCanonical) canonical.remove();
      else if (previousCanonical === null) canonical.removeAttribute("href");
      else canonical.setAttribute("href", previousCanonical);
      if (!existingDescription) description.remove();
      else if (previousDescription === null) description.removeAttribute("content");
      else description.setAttribute("content", previousDescription);
    };
  }, [route]);

  return null;
}
