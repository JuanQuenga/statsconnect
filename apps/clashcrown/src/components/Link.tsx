import { useRouter } from "@tanstack/react-router";
import type { AnchorHTMLAttributes, MouseEvent } from "react";

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

function isModifiedClick(event: MouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function Link({ href, onClick, target, ...props }: LinkProps) {
  const router = useRouter();
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
        void router.navigate({ href });
      }}
    />
  );
}
