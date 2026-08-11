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
        "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm",
        tone === "error" && "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "loading" && "border-border/60 bg-card/50 text-muted-foreground",
        tone === "success" && "border-accent/40 bg-accent/10 text-accent",
        tone === "info" && "border-border/60 bg-card/40 text-muted-foreground",
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
    <div className="rounded-2xl border border-dashed border-border/70 bg-card/30 px-6 py-10 text-center">
      <p className="font-display text-xl text-foreground">{title}</p>
      {detail ? <p className="mt-2 text-sm text-muted-foreground">{detail}</p> : null}
    </div>
  );
}
