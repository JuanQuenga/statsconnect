import type {
  DetailsHTMLAttributes,
  HTMLAttributes,
  ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export function DropdownMenu({
  className,
  ...props
}: DetailsHTMLAttributes<HTMLDetailsElement>) {
  return <details className={cn("group relative", className)} {...props} />;
}

export function DropdownMenuTrigger({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { children: ReactNode }) {
  return (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background [&::-webkit-details-marker]:hidden",
        className,
      )}
      {...props}
    >
      {children}
    </summary>
  );
}

export function DropdownMenuContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "absolute left-0 top-full z-50 mt-2 min-w-64 max-w-[min(100vw-2rem,20rem)] rounded-xl border border-border/60 bg-popover p-1.5 shadow-2xl sm:min-w-72",
        className,
      )}
      {...props}
    />
  );
}

export function DropdownMenuItem({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      role="menuitem"
      tabIndex={0}
      className={cn(
        "cursor-pointer rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
