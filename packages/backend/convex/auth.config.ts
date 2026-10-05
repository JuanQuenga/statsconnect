import type { AuthConfig } from "convex/server";

declare const process: { env: Record<string, string | undefined> };

// Clerk issues the JWTs Convex verifies. The "convex" applicationID selects the
// JWT template provisioned by the Clerk↔Convex integration; the domain is the
// Clerk Frontend API URL and equals the token's `iss` claim.
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
