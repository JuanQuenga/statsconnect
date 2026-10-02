export const profilePreviewConfigPath = "dist/profile-preview-config.json";
export type ProfilePreviewConfiguration = { convexUrl: string; convexSiteUrl: string };

/** Only public backend locations are copied from the frontend build environment. */
export function profilePreviewConfiguration(environment: Readonly<Record<string, string | undefined>>): ProfilePreviewConfiguration | null {
  const raw = environment.CONVEX_URL ?? environment.VITE_CONVEX_URL ?? environment.NEXT_PUBLIC_CONVEX_URL;
  if (!raw) return null;
  try {
    const convex = new URL(raw);
    const site = new URL(environment.CONVEX_SITE_URL ?? environment.VITE_CONVEX_SITE_URL ?? convex.origin.replace(/\.convex\.cloud$/, ".convex.site"));
    if ([convex, site].some((url) => url.protocol !== "https:" || url.username || url.password || url.search || url.hash)) return null;
    return { convexUrl: convex.origin, convexSiteUrl: site.origin };
  } catch { return null; }
}
