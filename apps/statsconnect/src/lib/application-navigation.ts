import { handleApplicationNavigation } from "@statsconnect/site-nav";
import type { MouseEvent } from "react";

/**
 * Navigates to a canonical Game Destination on this origin. Inside the shared
 * application shell the mounted application swaps in place; standalone, it
 * falls back to a full document navigation.
 */
export function navigateToApplication(href: string): void {
  if (window.__statsConnectNavigate) {
    window.__statsConnectNavigate(href);
    return;
  }
  window.location.assign(href);
}

/**
 * Wraps a raw anchor's click so plain left-clicks inside the shell route
 * through the application shell while modified clicks (new tab/window) keep
 * native behavior. The href stays untouched for middle-click and SEO.
 */
export function handleGameDestinationClick(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  handleApplicationNavigation(event, href);
}
