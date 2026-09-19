import { handleApplicationNavigation } from "@statsconnect/site-nav";
import type { MouseEvent } from "react";

/**
 * Canonical subdomain destinations use document navigation. The application
 * shell retains in-place switching for same-origin preview destinations.
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
