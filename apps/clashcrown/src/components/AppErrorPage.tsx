import type { ErrorComponentProps } from "@tanstack/react-router";
import { gameRouteBase } from "@statsconnect/site-nav";
import {
  formatTechnicalError,
  getErrorReference,
  type AppErrorFallbackProps,
} from "@statsconnect/site-errors";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useEffect, useRef } from "react";
import { Layout } from "@/components/portfolio/Layout";
import { useI18n } from "@/lib/i18n";

type ErrorCopy = {
  description: string;
  details: string;
  home: string;
  reference: string;
  retry: string;
  title: string;
};

type ErrorPanelProps = {
  copy: ErrorCopy;
  error: unknown;
  reference: string;
  retry: () => void;
};

const fallbackCopy: ErrorCopy = {
  description: "This page could not be displayed. Your saved profiles and settings are safe.",
  details: "Technical details",
  home: "Return to StatsConnect Clash Royale",
  reference: "Error reference: {reference}",
  retry: "Try again",
  title: "We hit a snag",
};

function ErrorPanel({ copy, error, reference, retry }: ErrorPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section className="data-state app-error-state" role="alert" aria-labelledby="app-error-title">
      <span className="app-error-icon" aria-hidden>
        <AlertTriangle />
      </span>
      <h1 ref={headingRef} id="app-error-title" tabIndex={-1}>
        {copy.title}
      </h1>
      <p>{copy.description}</p>
      <div className="app-error-actions">
        <button type="button" className="pink-button" onClick={retry}>
          <RefreshCw size={16} aria-hidden />
          {copy.retry}
        </button>
        <a href={gameRouteBase("clash-royale", import.meta.env.BASE_URL, window.location.hostname)} className="app-error-home">
          {copy.home}
        </a>
      </div>
      <small className="app-error-reference">
        {copy.reference.replace("{reference}", reference)}
      </small>
      {import.meta.env.DEV ? (
        <details className="app-error-details">
          <summary>{copy.details}</summary>
          <pre>{formatTechnicalError(error)}</pre>
        </details>
      ) : null}
    </section>
  );
}

export function ClashRoyaleRouteError({ error }: ErrorComponentProps) {
  const { t } = useI18n();
  const copy: ErrorCopy = {
    description: t("error.description"),
    details: t("error.details"),
    home: t("error.home"),
    reference: t("error.reference"),
    retry: t("error.retry"),
    title: t("error.title"),
  };

  return (
    <Layout>
      <ErrorPanel
        copy={copy}
        error={error}
        reference={getErrorReference(error)}
        retry={() => window.location.reload()}
      />
    </Layout>
  );
}

export function ClashRoyaleFatalError({ error, reference }: AppErrorFallbackProps) {
  return (
    <main className="app-error-fatal">
      <ErrorPanel
        copy={fallbackCopy}
        error={error}
        reference={reference}
        retry={() => window.location.reload()}
      />
    </main>
  );
}
