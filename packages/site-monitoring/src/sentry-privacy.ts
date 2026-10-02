import type { Event } from "@sentry/react";
import { safeSourceUrl, safeUrl } from "./privacy.ts";

export function sanitizeSentryEvent<T extends Event>(event: T): T {
  delete event.user;
  delete event.extra;
  delete event.contexts;
  delete event.message;
  delete event.logentry;
  delete event.transaction;
  delete event.server_name;
  delete event.fingerprint;
  // Explicit tags from the site error reporter contain no account/profile values.
  const tags: NonNullable<Event["tags"]> = {};
  for (const key of ["app", "source", "error_reference"]) {
    const value = event.tags?.[key];
    if (typeof value === "string" && (/^[a-zA-Z0-9_-]{1,80}$/.test(value) || (key === "app" && ["StatsConnect", "StatsConnect Brawl Stars", "StatsConnect Clash Royale"].includes(value)))) tags[key] = value;
  }
  event.tags = tags;
  if (event.request) {
    event.request = {
      ...(event.request.url ? { url: safeUrl(event.request.url) } : {}),
      ...(event.request.method && /^(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)$/.test(event.request.method) ? { method: event.request.method } : {}),
    };
  }
  event.breadcrumbs = event.breadcrumbs?.filter((breadcrumb) => breadcrumb.category === "navigation").map((breadcrumb) => ({
    category: "navigation",
    type: breadcrumb.type,
    level: breadcrumb.level,
    timestamp: breadcrumb.timestamp,
    data: {
      ...(typeof breadcrumb.data?.from === "string" ? { from: safeUrl(breadcrumb.data.from) } : {}),
      ...(typeof breadcrumb.data?.to === "string" ? { to: safeUrl(breadcrumb.data.to) } : {}),
    },
  }));
  // Sentry copies original frame URLs here before beforeSend; keep source-map linkage private too.
  for (const image of event.debug_meta?.images ?? []) {
    if (image.code_file) image.code_file = safeSourceUrl(image.code_file);
    if ("debug_file" in image && image.debug_file) image.debug_file = safeSourceUrl(image.debug_file);
  }
  for (const exception of event.exception?.values ?? []) {
    // Arbitrary API errors may embed player tags, tokens, email, or submitted input.
    // The exception type, source positions, and source maps remain useful for diagnosis.
    exception.value = "Client error (message omitted for privacy)";
    delete exception.mechanism?.data;
    for (const frame of exception.stacktrace?.frames ?? []) {
      if (frame.filename) frame.filename = safeSourceUrl(frame.filename);
      if (frame.abs_path) frame.abs_path = safeSourceUrl(frame.abs_path);
      delete frame.vars;
      delete frame.pre_context;
      delete frame.post_context;
      delete frame.context_line;
    }
  }
  return event;
}
