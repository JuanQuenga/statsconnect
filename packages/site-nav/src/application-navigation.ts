import type { MouseEvent } from "react";

export type MountedStatsConnectApplication = {
  navigate: (href: string) => void;
  unmount: () => void;
};

export type MountStatsConnectApplication = (
  rootElement: HTMLElement,
) => MountedStatsConnectApplication;

declare global {
  interface Window {
    __statsConnectApplicationShell?: true;
    __statsConnectMounts?: Record<string, MountStatsConnectApplication>;
    __statsConnectNavigate?: (href: string) => void;
  }
}

export function handleApplicationNavigation(
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget.target === "_blank" ||
    !window.__statsConnectNavigate
  ) {
    return;
  }

  const destination = new URL(href, window.location.href);
  if (destination.origin !== window.location.origin) return;

  event.preventDefault();
  window.__statsConnectNavigate(destination.href);
}
