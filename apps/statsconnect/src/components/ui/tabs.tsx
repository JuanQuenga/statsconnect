import { cn } from "@/lib/utils";
import type { KeyboardEvent } from "react";

type TabsProps<T extends string> = {
  items: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
};

export function Tabs<T extends string>({
  items,
  value,
  onValueChange,
  className,
}: TabsProps<T>) {
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const lastIndex = items.length - 1;
    const nextIndex =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? (index + 1) % items.length
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? (index - 1 + items.length) % items.length
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? lastIndex
              : null;
    if (nextIndex === null) return;

    event.preventDefault();
    const next = items[nextIndex];
    if (!next) return;
    onValueChange(next.value);
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("[role='tab']")
      .item(nextIndex)
      .focus();
  }

  return (
    <div
      role="tablist"
      aria-label="Dashboard sections"
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item, index) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "bevel bevel-sm relative shrink-0 border px-5 py-3 font-display text-xs font-semibold uppercase tracking-[0.18em] transition-colors",
              selected
                ? "border-[var(--game-accent)]/60 bg-[var(--game-accent)]/14 text-foreground"
                : "border-border/60 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
