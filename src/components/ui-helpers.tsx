import { AlertCircle, CheckCircle2, Inbox, Info, LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

type Tone = "loading" | "error" | "success" | "info";

const toneStyles: Record<Tone, string> = {
  loading: "border-border bg-muted/50 text-muted-foreground",
  error: "border-destructive/45 bg-destructive/10 text-destructive",
  success: "border-emerald-400/35 bg-emerald-400/10 text-emerald-200",
  info: "border-border bg-muted/50 text-muted-foreground",
};

export function PageStatus({
  tone,
  children,
  className,
}: {
  tone: Tone;
  children: ReactNode;
  className?: string;
}) {
  const Icon =
    tone === "loading"
      ? LoaderCircle
      : tone === "error"
        ? AlertCircle
        : tone === "success"
          ? CheckCircle2
          : Info;

  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "loading" ? "polite" : undefined}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-sm leading-relaxed",
        toneStyles[tone],
        className,
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 size-4 shrink-0",
          tone === "loading" && "animate-spin",
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  action,
  className,
}: {
  title: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center rounded-2xl border border-dashed border-border/70 bg-card/35 px-6 py-10 text-center sm:px-8 sm:py-12",
        className,
      )}
    >
      <div
        className="mb-4 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <Inbox className="size-5" />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
        {title}
      </h2>
      {detail ? (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {detail}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}

export function LoadingState({
  label = "Loading",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      className={cn("space-y-6", className)}
    >
      <span className="sr-only">{label}</span>
      <div className="space-y-3">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-9 w-2/3 max-w-md" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-24 rounded-2xl" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  detail,
  action,
  className,
}: {
  title?: string;
  detail?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center rounded-2xl border border-destructive/35 bg-destructive/5 px-6 py-10 text-center sm:px-8",
        className,
      )}
    >
      <div
        className="mb-4 flex size-11 items-center justify-center rounded-full bg-destructive/15 text-destructive"
        aria-hidden
      >
        <AlertCircle className="size-5" />
      </div>
      <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
        {title}
      </h2>
      {detail ? (
        <p className="mx-auto mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
          {detail}
        </p>
      ) : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
