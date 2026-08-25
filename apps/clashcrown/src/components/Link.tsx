import { useRouter, useRouterState } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function navigationPath(href: string): string {
  return href.split(/[?#]/, 1)[0] || "/";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function Link({ href, onClick, target, ...props }: LinkProps) {
  const router = useRouter();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const renderedHref = href.startsWith("/")
    ? `${import.meta.env.BASE_URL}${href.replace(/^\/+/, "")}`
    : href;

  return (
    <a
      {...props}
      href={renderedHref}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          isModifiedClick(event) ||
          target === "_blank" ||
          !href.startsWith("/")
        ) {
          return;
        }

        event.preventDefault();
        void router.navigate({
          href,
          // The hero is unchanged for tab/search/hash state changes. Passing
          // false is important because it overrides the router default.
          viewTransition: !prefersReducedMotion() && navigationPath(href) !== pathname,
        });
      }}
    />
  );
}
