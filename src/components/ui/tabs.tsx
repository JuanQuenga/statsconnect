import { cn } from "@/lib/utils";

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
  return (
    <div
      role="tablist"
      className={cn(
        "flex gap-1 overflow-x-auto border-b border-border/70 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(item.value)}
            className={cn(
              "relative shrink-0 rounded-t-md px-4 py-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              selected &&
                "text-foreground after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[var(--game-accent,var(--primary))]",
            )}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
