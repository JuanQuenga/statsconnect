import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({
  className,
  type = "text",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        "bevel bevel-sm h-14 w-full border border-input bg-black/40 px-4 font-numeric text-2xl uppercase tracking-[0.12em] text-foreground transition-colors placeholder:text-muted-foreground/60 hover:border-[var(--ambient)]/50 focus-visible:border-[var(--ambient)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ambient)] disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
