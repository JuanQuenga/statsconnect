import { AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageStatus({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "loading" | "error" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-sm font-medium",
        tone === "error" && "border-destructive/70 bg-[#3a1033] text-[#ffc2cd]",
        tone === "loading" && "border-[var(--ink)] bg-muted text-muted-foreground",
        tone === "success" && "border-accent/60 bg-accent/10 text-accent",
        tone === "info" && "border-[var(--ink)] bg-muted text-muted-foreground",
        className,
      )}
    >
      {tone === "loading" ? <Loader2 className="size-4 animate-spin" /> : null}
      {tone === "error" ? <AlertCircle className="size-4" /> : null}
      <span>{children}</span>
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="rounded-[var(--radius-xl)] border-2 border-dashed border-border bg-muted/70 px-6 py-10 text-center">
      <p className="font-display text-2xl text-foreground">{title}</p>
      {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
