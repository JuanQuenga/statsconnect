/**
 * Locale-aware number formatting shared across the hub and game sites.
 * `Intl.NumberFormat` instances are cached because construction dominates
 * the cost of formatting in list-heavy views.
 */
const formatters = new Map<string, Intl.NumberFormat>();

function formatter(locale: string, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options ?? null)}`;
  let instance = formatters.get(key);
  if (!instance) {
    instance = new Intl.NumberFormat(locale, options);
    formatters.set(key, instance);
  }
  return instance;
}

export function formatNumber(
  value: number,
  locale = "en-US",
  options?: Intl.NumberFormatOptions,
): string {
  return formatter(locale, options).format(value);
}

export function formatCompact(value: number, locale = "en-US"): string {
  return formatter(locale, { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatPercent(fraction: number, locale = "en-US", digits = 1): string {
  return formatter(locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits })
    .format(fraction);
}
