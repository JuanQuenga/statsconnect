import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "bevel bevel-sm animate-pulse bg-white/[0.05] motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}
