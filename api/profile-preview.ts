import { loadProfile, profileCacheControl, profileIdentity } from "../server/profile-data.ts";
import { applicationShell, profileMetadata } from "../server/profile-metadata.ts";

/** Keep the SPA shell, but send profile metadata before any JavaScript runs. */
export async function GET(request: Request): Promise<Response> {
  const identity = profileIdentity(new URL(request.url));
  if (!identity) return new Response("Invalid player tag", { status: 400, headers: { "Cache-Control": "no-store" } });
  let shell: string;
  try { shell = await applicationShell(); } catch {
    return new Response("Player page is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const robots = { "X-Robots-Tag": "noindex, follow" };
  try {
    const profile = await loadProfile(identity);
    return new Response(profileMetadata(shell, identity, profile), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": profileCacheControl, ...robots },
    });
  } catch {
    return new Response(profileMetadata(shell, identity), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...robots },
    });
  }
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
