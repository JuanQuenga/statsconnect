import type { ErrorComponentProps } from "@tanstack/react-router";
import {
  formatTechnicalError,
  getErrorReference,
  type AppErrorFallbackProps,
} from "@statsconnect/site-errors";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { buttonVariants } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type ErrorCopy = {
  description: string;
  details: string;
  eyebrow: string;
  home: string;
  reference: string;
  retry: string;
  title: string;
};

type ErrorPageProps = {
  copy: ErrorCopy;
  error: unknown;
  reference: string;
  retry: () => void;
};

const fallbackCopy: ErrorCopy = {
  description: "This page could not be displayed. Your saved profiles and settings are safe.",
  details: "Technical details",
  eyebrow: "BrawlStats recovery",
  home: "Return to BrawlStats",
  reference: "Error reference: {reference}",
  retry: "Try again",
  title: "We hit a snag",
};

function ErrorPage({ copy, error, reference, retry }: ErrorPageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main className="page-shell flex min-h-svh items-center justify-center">
      <section
        role="alert"
        aria-labelledby="app-error-title"
        className="data-surface w-full max-w-2xl px-6 py-12 text-center md:px-10"
      >
        <div
          className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-destructive/15 text-destructive"
          aria-hidden
        >
          <AlertTriangle className="size-6" />
        </div>
        <p className="eyebrow">{copy.eyebrow}</p>
        <h1
          ref={headingRef}
          id="app-error-title"
          tabIndex={-1}
          className="mt-3 font-display text-3xl font-bold md:text-4xl"
        >
          {copy.title}
        </h1>
        <p className="mx-auto mt-4 max-w-lg leading-relaxed text-muted-foreground">
          {copy.description}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button type="button" className={buttonVariants({ size: "lg" })} onClick={retry}>
            <RefreshCw className="size-4" aria-hidden />
            {copy.retry}
          </button>
          <a href={import.meta.env.BASE_URL} className={buttonVariants({ size: "lg", variant: "outline" })}>
            {copy.home}
          </a>
        </div>
        <p className="mt-7 text-xs text-muted-foreground">
          {copy.reference.replace("{reference}", reference)}
        </p>
        {import.meta.env.DEV ? (
          <details className="mt-5 text-left text-xs text-muted-foreground">
            <summary className="cursor-pointer text-center">{copy.details}</summary>
            <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-4">
              {formatTechnicalError(error)}
            </pre>
          </details>
        ) : null}
      </section>
    </main>
  );
}

export function BrawlStatsRouteError({ error }: ErrorComponentProps) {
  const { t } = useI18n();
  const copy: ErrorCopy = {
    description: t("error.description"),
    details: t("error.details"),
    eyebrow: t("error.eyebrow"),
    home: t("error.home"),
    reference: t("error.reference", { reference: getErrorReference(error) }),
    retry: t("error.retry"),
    title: t("error.title"),
  };

  return (
    <ErrorPage
      copy={copy}
      error={error}
      reference={getErrorReference(error)}
      retry={() => window.location.reload()}
    />
  );
}

export function BrawlStatsFatalError({ error, reference }: AppErrorFallbackProps) {
  return (
    <ErrorPage
      copy={fallbackCopy}
      error={error}
      reference={reference}
      retry={() => window.location.reload()}
    />
  );
}
