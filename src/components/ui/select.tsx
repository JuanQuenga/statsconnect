import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "bevel bevel-sm h-11 w-full border border-input bg-background px-3 text-sm text-foreground transition-colors hover:border-[var(--ambient)]/50 focus-visible:border-[var(--ambient)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ambient)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
