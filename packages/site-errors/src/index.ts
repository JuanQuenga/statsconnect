import { Component, type ErrorInfo, type ReactNode } from "react";

export type ClientErrorSource =
  | "render"
  | "route"
  | "uncaught"
  | "unhandled-promise"
  | "recoverable";

export type ClientErrorReport = {
  app: string;
  error: Error;
  reference: string;
  source: ClientErrorSource;
  timestamp: string;
  componentStack?: string;
};

export type ClientErrorReporter = (report: ClientErrorReport) => void;

export type AppErrorFallbackProps = {
  error: unknown;
  reference: string;
  reset: () => void;
};

type AppErrorBoundaryProps = {
  app: string;
  children: ReactNode;
  fallback: (props: AppErrorFallbackProps) => ReactNode;
  reporter?: ClientErrorReporter;
};

type AppErrorBoundaryState = {
  error: unknown;
  reference?: string;
};

const errorReferences = new WeakMap<object, string>();

function newErrorReference(): string {
  const time = Date.now().toString(36).slice(-6);
  const random = Math.random().toString(36).slice(2, 8);
  return `${time}-${random}`.toUpperCase();
}

export function getErrorReference(error: unknown): string {
  if ((typeof error === "object" && error !== null) || typeof error === "function") {
    const existing = errorReferences.get(error);
    if (existing) return existing;
    const reference = newErrorReference();
    errorReferences.set(error, reference);
    return reference;
  }
  return newErrorReference();
}

export function normalizeError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  return new Error("An unknown client error occurred.", { cause: error });
}

export function formatTechnicalError(error: unknown): string {
  const normalized = normalizeError(error);
  return normalized.stack || normalized.message;
}

function defaultReporter(report: ClientErrorReport): void {
  console.error(
    `[${report.app}] ${report.source} error (${report.reference})`,
    report.error,
    report.componentStack ? { componentStack: report.componentStack } : undefined,
  );
}

export function reportClientError({
  app,
  error,
  reference,
  source,
  componentStack,
  reporter = defaultReporter,
}: {
  app: string;
  error: unknown;
  reference?: string;
  source: ClientErrorSource;
  componentStack?: string;
  reporter?: ClientErrorReporter;
}): string {
  const normalized = normalizeError(error);
  const resolvedReference = reference ?? getErrorReference(normalized);
  const report: ClientErrorReport = {
    app,
    error: normalized,
    reference: resolvedReference,
    source,
    timestamp: new Date().toISOString(),
    ...(componentStack ? { componentStack } : {}),
  };

  try {
    reporter(report);
  } catch (reportingError) {
    defaultReporter(report);
    console.error(`[${app}] Error reporter failed`, reportingError);
  }

  return resolvedReference;
}

export function installGlobalErrorHandlers(
  app: string,
  reporter?: ClientErrorReporter,
): () => void {
  const handleError = (event: ErrorEvent) => {
    reportClientError({
      app,
      error: event.error ?? event.message,
      source: "uncaught",
      reporter,
    });
  };
  const handleRejection = (event: PromiseRejectionEvent) => {
    reportClientError({
      app,
      error: event.reason,
      source: "unhandled-promise",
      reporter,
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
  };
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { error, reference: getErrorReference(error) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportClientError({
      app: this.props.app,
      error,
      reference: this.state.reference,
      source: "render",
      componentStack: info.componentStack ?? undefined,
      reporter: this.props.reporter,
    });
  }

  private reset = () => {
    this.setState({ error: null, reference: undefined });
  };

  render(): ReactNode {
    const { error, reference } = this.state;
    if (reference) return this.props.fallback({ error, reference, reset: this.reset });
    return this.props.children;
  }
}
