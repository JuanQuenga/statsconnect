import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-lg bg-muted/80 motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
