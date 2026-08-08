import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "bevel bevel-sm inline-flex items-center justify-center gap-2 font-display font-semibold uppercase tracking-[0.14em] transition-[background-color,color,transform] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--ambient)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--ambient)] text-[#04121b] hover:brightness-110 shadow-[0_0_28px_-8px_var(--ambient)]",
        secondary:
          "border border-border/70 bg-white/[0.05] text-foreground hover:bg-white/[0.1]",
        outline:
          "border border-[var(--ambient)]/45 bg-transparent text-foreground hover:bg-[var(--ambient)]/12 hover:border-[var(--ambient)]",
        ghost: "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        destructive:
          "bg-destructive text-[#1a0409] hover:brightness-110",
      },
      size: {
        default: "h-11 px-5 text-xs",
        sm: "h-9 px-3.5 text-[11px]",
        lg: "h-14 px-8 text-sm",
        icon: "size-11 px-0 tracking-normal",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  size,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}

export { buttonVariants };
