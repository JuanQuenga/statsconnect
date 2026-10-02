const DAY = 24 * 60 * 60 * 1_000;
export const COMMUNITY_COOLDOWN = 30 * DAY;

export type RequestKind = "feedback" | "support";
export type CommunityState = Readonly<{
  successfulSessions: number;
  firstSuccessAt: number | null;
  lastRequestAt: number | null;
  lastRequestKind: RequestKind | null;
  disabled: boolean;
}>;

export const emptyCommunityState: CommunityState = {
  successfulSessions: 0,
  firstSuccessAt: null,
  lastRequestAt: null,
  lastRequestKind: null,
  disabled: false,
};

function timestamp(value: unknown): value is number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value) && value >= 0);
}

export function parseCommunityState(value: unknown): CommunityState {
  if (
    typeof value !== "object" || value === null ||
    !("successfulSessions" in value) || typeof value.successfulSessions !== "number" ||
    !Number.isSafeInteger(value.successfulSessions) || value.successfulSessions < 0 ||
    !("firstSuccessAt" in value) || !timestamp(value.firstSuccessAt) ||
    !("lastRequestAt" in value) || !timestamp(value.lastRequestAt) ||
    !("lastRequestKind" in value) ||
    (value.lastRequestKind !== null && value.lastRequestKind !== "feedback" && value.lastRequestKind !== "support") ||
    !("disabled" in value) || typeof value.disabled !== "boolean"
  ) return emptyCommunityState;
  return {
    successfulSessions: value.successfulSessions,
    firstSuccessAt: value.firstSuccessAt,
    lastRequestAt: value.lastRequestAt,
    lastRequestKind: value.lastRequestKind,
    disabled: value.disabled,
  };
}

export function nextCommunityRequest({
  state, now, succeededThisSession, requestedThisSession, supportAvailable,
}: {
  state: CommunityState;
  now: number;
  succeededThisSession: boolean;
  requestedThisSession: boolean;
  supportAvailable: boolean;
}): { state: CommunityState; request: RequestKind | null } {
  if (state.disabled) return { state, request: null };
  const next = {
    ...state,
    successfulSessions: state.successfulSessions + (succeededThisSession ? 0 : 1),
    firstSuccessAt: state.firstSuccessAt ?? now,
  };
  if (
    next.successfulSessions < 3 || now - next.firstSuccessAt < DAY || requestedThisSession ||
    (next.lastRequestAt !== null && now - next.lastRequestAt < COMMUNITY_COOLDOWN)
  ) return { state: next, request: null };
  const request = state.lastRequestKind === "feedback" && supportAvailable ? "support" : "feedback";
  return { state: { ...next, lastRequestAt: now, lastRequestKind: request }, request };
}

/** Only reviewed public hosted checkout URLs. Test checkouts and embedded credentials stay hidden. */
export function publicSupportUrl(value: string | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash) return null;
    if (url.hostname === "buy.stripe.com" && /^\/[A-Za-z0-9]{10,}$/.test(url.pathname)) return url.href;
    if (url.hostname === "ko-fi.com" && /^\/[A-Za-z0-9_]{3,}$/.test(url.pathname)) return url.href;
  } catch { /* Unconfigured or invalid links never appear to visitors. */ }
  return null;
}

export type SupportUrls = Readonly<{
  supportUrl?: string;
  monthlySupportUrl?: string;
  supportPortalUrl?: string;
}>;

/** Monthly checkout is available only with a reviewed public cancellation route. */
export function resolveSupportLinks({ supportUrl, monthlySupportUrl, supportPortalUrl }: SupportUrls) {
  const oneTime = publicSupportUrl(supportUrl);
  let portal: string | null = null;
  try {
    const url = new URL(supportPortalUrl?.trim() ?? "");
    if (
      url.protocol === "https:" && url.hostname === "billing.stripe.com" &&
      !url.username && !url.password && !url.port && !url.search && !url.hash &&
      /^\/p\/login\/[A-Za-z0-9]{10,}$/.test(url.pathname)
    ) portal = url.href;
  } catch { /* Invalid portal URLs never appear to visitors. */ }
  const checkout = publicSupportUrl(monthlySupportUrl);
  const monthly = portal && checkout?.startsWith("https://buy.stripe.com/") && checkout !== oneTime ? checkout : null;
  return { oneTime, monthly, portal };
}

export const feedbackHref = "mailto:harmiox@gmail.com?subject=StatsConnect%20feedback&body=What%20were%20you%20trying%20to%20do%3F%0A%0AWhat%20worked%20or%20should%20change%3F%0A%0APlease%20leave%20out%20passwords%2C%20account%20details%2C%20and%20payment%20information.";
