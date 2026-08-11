export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

/**
 * Typed fetch helper. The response body is parsed as `unknown` and must pass
 * `isExpected` before it is handed back, so no unchecked assertion is made
 * about an untrusted payload.
 */
export async function apiFetch<T>(
  input: RequestInfo | URL,
  isExpected: (value: unknown) => value is T,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const message = await response.text();
    throw new ApiError(message || "StatsConnect could not complete the request.", response.status);
  }
  let payload: unknown;
  try {
    payload = await response.json() as unknown;
  } catch {
    throw new ApiError("StatsConnect received an unreadable response.", response.status);
  }
  if (!isExpected(payload)) {
    throw new ApiError("StatsConnect received an unexpected response shape.", response.status);
  }
  return payload;
}
