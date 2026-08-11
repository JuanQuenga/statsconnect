import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * StatsConnect mark: a beveled console keycap with three ascending signal
 * bars. The bars pick up the live ambient accent so the logo shifts colour
 * with the stage.
 */
export function Mark({ className }: { className?: string }) {
  const gradientId = useId();
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label="StatsConnect"
      className={cn("size-8", className)}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--ambient-2)" />
          <stop offset="100%" stopColor="var(--ambient)" />
        </linearGradient>
      </defs>
      <path
        d="M8 1h23v23l-7 7H1V8Z"
        fill="var(--card)"
        stroke="currentColor"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />
      <g fill={`url(#${gradientId})`}>
        <rect x="8" y="18" width="4" height="7" rx="1" />
        <rect x="14" y="13" width="4" height="12" rx="1" />
        <rect x="20" y="7" width="4" height="18" rx="1" />
      </g>
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[15px] font-bold uppercase leading-none tracking-[0.24em] text-foreground",
        className,
      )}
    >
      Stats<span className="text-[var(--ambient)]">Connect</span>
    </span>
  );
}
