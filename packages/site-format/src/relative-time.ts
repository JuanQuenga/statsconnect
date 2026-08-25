export type RelativeTimeUnits = "justNow" | "minutes" | "hours" | "days";

export type RelativeTimeMessages = Partial<Record<RelativeTimeUnits, (value: number) => string>>;

const defaultEnglish: RelativeTimeMessages = {
  justNow: () => "just now",
  minutes: (value) => `${value}m ago`,
  hours: (value) => `${value}h ago`,
  days: (value) => `${value}d ago`,
};

/**
 * Elapsed-time label from a past epoch-ms timestamp. Callers can override the
 * unit renderers for localization without this package depending on any app's
 * i18n stack.
 */
export function timeAgo(
  timestamp: number,
  now: number = Date.now(),
  messages: RelativeTimeMessages = defaultEnglish,
): string {
  const minutes = Math.max(1, Math.round((now - timestamp) / 60_000));
  if (minutes < 60) return (messages.minutes ?? defaultEnglish.minutes!)(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return (messages.hours ?? defaultEnglish.hours!)(hours);
  return (messages.days ?? defaultEnglish.days!)(Math.round(hours / 24));
}
