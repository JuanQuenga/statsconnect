import { reportClientError, setClientErrorReporter, type ClientErrorReport } from "@statsconnect/site-errors";
import { safeAnalyticsProperties, safePathname } from "./privacy.ts";
import { sanitizeSentryEvent } from "./sentry-privacy.ts";

export type MonitoringConfig = {
  enabled: boolean;
  environment: string;
  release?: string;
  posthogKey?: string;
  posthogHost?: string;
  sentryDsn?: string;
};

export type SiteEventName =
  | "player_lookup_submitted" | "player_lookup_succeeded" | "player_lookup_failed"
  | "profile_save_submitted" | "profile_save_succeeded" | "profile_save_failed";

export type SiteEventProperties = {
  game?: "brawl-stars" | "clash-royale";
  stage?: "preview" | "save";
  reason?: "invalid-tag" | "not-found" | "network" | "unknown";
};

type AnalyticsCapture = (name: string, properties: Record<string, unknown>) => void;
type MonitoringState = {
  ready: Promise<void>;
  capture?: AnalyticsCapture;
  acceptsEvents: boolean;
  pending: Array<{ name: SiteEventName; properties: SiteEventProperties }>;
};

declare global {
  interface Window {
    __statsconnectMonitoring?: MonitoringState;
  }
}

function doNotTrack(): boolean {
  return navigator.doNotTrack === "1" || navigator.doNotTrack === "yes";
}

function trackPageviews(capture: AnalyticsCapture): void {
  let lastPathname: string | undefined;
  const capturePageview = () => {
    if (lastPathname === window.location.pathname || doNotTrack()) return;
    lastPathname = window.location.pathname;
    const pathname = safePathname(lastPathname);
    capture("$pageview", {
      $current_url: `${window.location.origin}${pathname}`,
      $pathname: pathname,
      $referrer: document.referrer,
    });
  };
  const originalPush = history.pushState;
  const originalReplace = history.replaceState;
  history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
    originalPush.apply(this, args);
    capturePageview();
  };
  history.replaceState = function (this: History, ...args: Parameters<History["replaceState"]>) {
    originalReplace.apply(this, args);
    capturePageview();
  };
  window.addEventListener("popstate", capturePageview);
  capturePageview();
}

async function initializeAnalytics(config: MonitoringConfig, state: MonitoringState): Promise<void> {
  if (!config.posthogKey?.trim() || doNotTrack()) return;
  const { default: posthog } = await import("posthog-js");
  posthog.init(config.posthogKey, {
    api_host: config.posthogHost || "https://us.i.posthog.com",
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    capture_exceptions: false,
    disable_session_recording: true,
    enable_heatmaps: false,
    disable_surveys: true,
    advanced_disable_feature_flags: true,
    advanced_disable_decide: true,
    person_profiles: "never",
    respect_dnt: true,
    ip: false,
    persistence: "localStorage",
    cross_subdomain_cookie: false,
    before_send: (event) => {
      if (!event || doNotTrack()) return null;
      event.properties = safeAnalyticsProperties(event.properties);
      return event;
    },
  });
  state.capture = (name, properties) => {
    if (!doNotTrack()) posthog.capture(name, safeAnalyticsProperties({ ...properties, environment: config.environment }));
  };
  trackPageviews(state.capture);
  for (const event of state.pending) state.capture(event.name, event.properties);
  state.pending.length = 0;
}

async function initializeErrors(config: MonitoringConfig): Promise<void> {
  if (!config.sentryDsn?.trim() || doNotTrack()) return;
  const reported = new WeakSet<Error>();
  const pending: ClientErrorReport[] = [];
  let send: ((report: ClientErrorReport) => void) | undefined;
  // Install synchronously: startup/root errors can occur while the SDK loads.
  setClientErrorReporter((report) => {
    if (doNotTrack()) return;
    if (reported.has(report.error)) return;
    reported.add(report.error);
    if (send) send(report);
    else if (pending.length < 100) pending.push(report);
  });
  try {
    const sentry = await import("@sentry/react");
    sentry.init({
      dsn: config.sentryDsn,
      environment: config.environment,
      release: config.release,
      dataCollection: {
        userInfo: false, cookies: false, httpHeaders: false, httpBodies: [],
        urlQueryParams: false, stackFrameVariables: false, frameContextLines: 0,
      },
      sampleRate: 1,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      maxBreadcrumbs: 20,
      // Existing application hooks already handle root, route, and global errors.
      integrations: (defaults) => defaults.filter((integration) => !["GlobalHandlers", "Breadcrumbs", "BrowserSession", "HttpContext"].includes(integration.name)),
      beforeSend: (event) => doNotTrack() ? null : sanitizeSentryEvent(event),
    });
    send = (report) => {
      if (doNotTrack()) return;
      sentry.captureException(report.error, {
        tags: { app: report.app, source: report.source, error_reference: report.reference },
      });
    };
    for (const report of pending) send(report);
    pending.length = 0;
  } catch {
    // Blocked SDK loading must preserve the application's existing console reporter.
    setClientErrorReporter(undefined);
    for (const report of pending) reportClientError(report);
    pending.length = 0;
  }
}

/** The document owns initialization, including when another independently built game loads. */
export function initializeMonitoring(config: MonitoringConfig): Promise<void> {
  if (typeof window === "undefined" || !config.enabled) return Promise.resolve();
  const existing = window.__statsconnectMonitoring;
  if (existing) return existing.ready;
  if (!config.posthogKey?.trim() && !config.sentryDsn?.trim()) return Promise.resolve();
  const state: MonitoringState = { ready: Promise.resolve(), pending: [], acceptsEvents: Boolean(config.posthogKey?.trim()) && !doNotTrack() };
  window.__statsconnectMonitoring = state;
  state.ready = Promise.allSettled([
    initializeAnalytics(config, state),
    initializeErrors(config),
  ]).then(() => {
    state.pending.length = 0;
    state.acceptsEvents = Boolean(state.capture);
  });
  return state.ready;
}

export function captureSiteEvent(name: SiteEventName, properties: SiteEventProperties = {}): void {
  if (typeof window === "undefined") return;
  const state = window.__statsconnectMonitoring;
  if (!state || !state.acceptsEvents || doNotTrack()) return;
  if (state.capture) state.capture(name, properties);
  else if (state.pending.length < 100) state.pending.push({ name, properties });
}
