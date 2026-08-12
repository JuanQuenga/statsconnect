import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  formatTechnicalError,
  getErrorReference,
  type AppErrorFallbackProps,
} from "@statsconnect/site-errors";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";

type ErrorPageProps = {
  error: unknown;
  reference: string;
  retry: () => void;
};

function ErrorPage({ error, reference, retry }: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="content-column flex min-h-svh items-center justify-center py-12">
      <section
        role="alert"
        aria-labelledby="app-error-title"
        className="panel w-full max-w-2xl px-6 py-12 text-center sm:px-10"
      >
        <div
          className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive"
          aria-hidden
        >
          <AlertTriangle className="size-6" />
        </div>
        <p className="eyebrow">StatsConnect recovery</p>
        <h1
          ref={headingRef}
          id="app-error-title"
          tabIndex={-1}
          className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
        >
          We hit a snag
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-relaxed text-muted-foreground">
          This page could not be displayed. Your saved profiles and settings are safe.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className={buttonVariants({ size: "lg" })} onClick={retry}>
            <RefreshCw className="size-4" aria-hidden />
            Try again
          </button>
          <a href={import.meta.env.BASE_URL} className={buttonVariants({ size: "lg", variant: "outline" })}>
            Return to the lobby
          </a>
        </div>
        <p className="mt-7 text-xs text-muted-foreground">Error reference: {reference}</p>
        {import.meta.env.DEV ? (
          <details className="mt-5 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer text-center">Technical details</summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-4">
              {formatTechnicalError(error)}
            </pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}

export function StatsConnectRouteError({ error }: ErrorComponentProps) {
  return (
    <ErrorPage
      error={error}
      reference={getErrorReference(error)}
      retry={() => window.location.reload()}
    />
  );
}

export function StatsConnectFatalError({ error, reference }: AppErrorFallbackProps) {
  return (
    <ErrorPage
      error={error}
      reference={reference}
      retry={() => window.location.reload()}
    />
  );
}
