import { initializeMonitoring } from "@statsconnect/site-monitoring";

initializeMonitoring({
  enabled: import.meta.env.PROD || import.meta.env.VITE_MONITORING_ENABLED === "1",
  environment: import.meta.env.VITE_MONITORING_ENVIRONMENT || import.meta.env.MODE,
  posthogKey: import.meta.env.VITE_POSTHOG_KEY,
  posthogHost: import.meta.env.VITE_POSTHOG_HOST,
  sentryDsn: import.meta.env.VITE_SENTRY_DSN,
  release: import.meta.env.VITE_SENTRY_RELEASE,
});
