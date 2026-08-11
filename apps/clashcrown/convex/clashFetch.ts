/**
 * One place that knows how to talk to the Clash Royale API. Deliberately free of
 * Convex context so it can be used from both runtimes: `clashApi.ts` runs in
 * Node, the crawler runs in the default V8 runtime where `fetch` is available.
 */

export type ClashResponse<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

type ApiErrorBody = { message?: string; reason?: string };

export function apiErrorMessage(status: number, body: ApiErrorBody = {}) {
  if (status === 400) return "That tag is not valid.";
  if (status === 403) return "The Clash Royale API rejected this server. Check the API token and its allowed IP address.";
  if (status === 404) return "No Clash Royale profile was found for that tag.";
  if (status === 429) return "The Clash Royale API rate limit was reached. Try again shortly.";
  if (status >= 500) return "The Clash Royale API is temporarily unavailable.";
  return body.message ?? body.reason ?? "The Clash Royale API request failed.";
}

export async function clashRequest<T>(endpoint: string): Promise<ClashResponse<T>> {
  const token = process.env.CLASH_ROYALE_API_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 0,
      code: "MISSING_API_TOKEN",
      message: "Add CLASH_ROYALE_API_TOKEN to the Convex deployment environment."
    };
  }

  const baseUrl = (process.env.CLASH_ROYALE_API_BASE_URL ?? "https://api.clashroyale.com/v1").replace(/\/$/, "");

  let response: Response;
  try {
    response = await fetch(`${baseUrl}${endpoint}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" }
    });
  } catch {
    return {
      ok: false,
      status: 0,
      code: "CLASH_API_NETWORK",
      message: "The Clash Royale API could not be reached from the backend."
    };
  }

  if (!response.ok) {
    let body: ApiErrorBody = {};
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = {};
    }
    return {
      ok: false,
      status: response.status,
      code: `CLASH_API_${response.status}`,
      message: apiErrorMessage(response.status, body)
    };
  }

  return { ok: true, status: response.status, data: (await response.json()) as T };
}
