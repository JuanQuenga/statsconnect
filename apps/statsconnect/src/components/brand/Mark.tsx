import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <img
      src="/brand/statsconnect-mark.png?v=2"
      alt=""
      aria-hidden
      className={cn(
        "size-8 object-contain drop-shadow-[0_0_14px_rgba(38,153,255,0.2)]",
        className,
      )}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-display text-[17px] font-semibold leading-none tracking-[-0.035em] text-foreground",
        className,
      )}
    >
      Stats<span className="brand-wordmark-accent">Connect</span>
    </span>
  );
}
