import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "bevel bevel-sm inline-flex items-center justify-center gap-2 font-display font-semibold tracking-[-0.01em] transition-[background-color,color,transform] duration-150 active:translate-y-px focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-[var(--ambient)] disabled:pointer-events-none disabled:opacity-45",
  {
    variants: {
      variant: {
        default:
          "border border-foreground bg-foreground text-background hover:bg-foreground/88",
        secondary:
          "border border-border bg-white/[0.035] text-foreground hover:bg-white/[0.07]",
        outline:
          "border border-border bg-transparent text-foreground hover:border-foreground/35 hover:bg-white/[0.025]",
        ghost: "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
        destructive:
          "bg-destructive text-[#1a0409] hover:brightness-110",
      },
      size: {
        default: "h-11 px-5 text-sm",
        sm: "h-9 px-3.5 text-xs",
        lg: "h-14 px-8 text-[15px]",
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
