import { loadProfile, profileCacheControl, profileIdentity } from "../server/profile-data.ts";
import { renderProfileImage } from "../server/profile-image.ts";

/** Crawler-readable PNG from the same drawing code as the download buttons. */
export async function GET(request: Request): Promise<Response> {
  const identity = profileIdentity(new URL(request.url));
  if (!identity) return new Response("Invalid player tag", { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    const profile = await loadProfile(identity);
    const image = await renderProfileImage(profile);
    return new Response(image, { headers: { "Content-Type": "image/png", "Cache-Control": profileCacheControl } });
  } catch {
    return new Response("Player image is temporarily unavailable", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function HEAD(request: Request): Promise<Response> {
  const response = await GET(request);
  return new Response(null, { status: response.status, headers: response.headers });
}
