import { clubMetadata, loadClub } from "../server/club-preview.ts";
import { profileCacheControl, profileIdentity } from "../server/profile-data.ts";
import { applicationShell } from "../server/profile-metadata.ts";

/** Keep the SPA shell, but send club or clan metadata so shared links unfurl. */
export async function GET(request: Request): Promise<Response> {
  const identity = profileIdentity(new URL(request.url));
  let shell: string;
  try { shell = await applicationShell(); } catch {
    return new Response("Club page is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  if (!identity) return new Response(shell, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
  const robots = { "X-Robots-Tag": "noindex, follow" };
  try {
    const club = await loadClub(identity);
    return new Response(clubMetadata(shell, identity, club), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": profileCacheControl, ...robots },
    });
  } catch {
    return new Response(clubMetadata(shell, identity), {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", ...robots },
    });
  }
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
