import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "bevel bevel-sm inline-flex items-center gap-1.5 px-2.5 py-1 font-display text-[10px] font-semibold uppercase tracking-[0.18em] transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[var(--game-accent)]/18 text-[var(--game-accent)]",
        secondary: "border border-border/70 bg-white/[0.05] text-muted-foreground",
        outline: "border border-border text-foreground",
        success: "bg-emerald-400/15 text-emerald-300",
        destructive: "bg-destructive/18 text-destructive",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { badgeVariants };
