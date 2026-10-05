/**
 * One-off ops tool: imports the Better Auth user export into Clerk and emits
 * the old-id → Clerk-id map that `hub/internal/authMigration:importMapping`
 * consumes right after the cutover deploy.
 *
 * Safe to re-run at any time (idempotent):
 *  - users already imported (matched by `externalId`) are skipped;
 *  - a Clerk user that appeared on its own (signed in before the import) is
 *    adopted: its `externalId` is set to the Better Auth id so auto-link and
 *    the Convex rekey both resolve to the same Clerk user;
 *  - conflicts (email owned by a different Clerk user) are reported, never
 *    overwritten.
 *
 * Usage (from the repository root):
 *   CLERK_SECRET_KEY=sk_live_... node scripts/migrate-auth-to-clerk.ts \
 *     --users backup/betterAuth/user/documents.jsonl \
 *     --out auth-mapping.json \
 *     [--dry-run]
 */
import { createClerkClient, type ClerkClient } from "@clerk/backend";
import type { User } from "@clerk/backend";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type MigrationEntry = Readonly<{
  oldId: string;
  clerkId: string;
  email: string;
}>;

type ExportedUser = Readonly<{
  _id?: unknown;
  email?: unknown;
  name?: unknown;
  isAnonymous?: unknown;
}>;

type Outcome =
  | "imported"
  | "adopted"
  | "already-imported"
  | "skipped"
  | "conflict"
  | "failed";

type ImportResult = Readonly<{
  outcome: Outcome;
  oldId?: string;
  clerkId?: string;
  email?: string;
  detail?: string;
}>;

export function parseArgs(argv: readonly string[]): {
  usersPath: string;
  outPath: string;
  dryRun: boolean;
} | null {
  let usersPath: string | undefined;
  let outPath: string | undefined;
  let dryRun = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--dry-run") {
      dryRun = true;
    } else if (argument === "--users") {
      usersPath = argv[index + 1];
      index += 1;
    } else if (argument === "--out") {
      outPath = argv[index + 1];
      index += 1;
    } else {
      return null;
    }
  }
  if (!usersPath) return null;
  return { usersPath, outPath: outPath ?? "auth-mapping.json", dryRun };
}

export function parseExportedUsers(jsonl: string): {
  users: ReadonlyArray<{ oldId: string; email: string; name: string }>;
  skipped: number;
} {
  const users: Array<{ oldId: string; email: string; name: string }> = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const line of jsonl.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let record: ExportedUser;
    try {
      record = JSON.parse(trimmed) as ExportedUser;
    } catch {
      skipped += 1;
      continue;
    }
    const oldId = typeof record._id === "string" ? record._id : "";
    const email = typeof record.email === "string" ? record.email.trim().toLowerCase() : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    // Anonymous records have no real identity to carry into Clerk, and records
    // without an email cannot be auto-linked on first sign-in.
    if (!oldId || !email || record.isAnonymous === true || seen.has(oldId)) {
      skipped += 1;
      continue;
    }
    seen.add(oldId);
    users.push({ oldId, email, name });
  }
  return { users, skipped };
}

function splitName(name: string): { firstName?: string; lastName?: string } {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function exactEmailMatch(users: readonly User[], email: string): User | undefined {
  return users.find((user) =>
    user.emailAddresses.some((address) => address.emailAddress.toLowerCase() === email),
  );
}

function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "status" in error &&
    (error as { status?: unknown }).status === 429
  );
}

async function withRateLimitRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error: unknown) {
      if (attempt >= 4 || !isRateLimitError(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
    }
  }
}

export async function importUser(
  clerk: Pick<ClerkClient, "users">,
  user: { oldId: string; email: string; name: string },
): Promise<ImportResult> {
  const { oldId, email } = user;

  const byExternalId = await withRateLimitRetry(() =>
    clerk.users.getUserList({ externalId: [oldId], limit: 2 }),
  );
  const existing = exactEmailMatch(byExternalId.data, email);
  if (existing) {
    return {
      outcome: "already-imported",
      oldId,
      clerkId: existing.id,
      email,
    };
  }

  const byEmail = await withRateLimitRetry(() =>
    clerk.users.getUserList({ emailAddress: [email], limit: 5 }),
  );
  const emailOwner = exactEmailMatch(byEmail.data, email);
  if (emailOwner) {
    if (emailOwner.externalId && emailOwner.externalId !== oldId) {
      return {
        outcome: "conflict",
        oldId,
        clerkId: emailOwner.id,
        email,
        detail: `Clerk user already carries externalId ${emailOwner.externalId}`,
      };
    }
    await withRateLimitRetry(() =>
      clerk.users.updateUser(emailOwner.id, { externalId: oldId }),
    );
    return { outcome: "adopted", oldId, clerkId: emailOwner.id, email };
  }

  const created = await withRateLimitRetry(() =>
    clerk.users.createUser({
      externalId: oldId,
      emailAddress: [email],
      // Imported users have no password; their first Google sign-in is linked
      // to this user by verified email (auto-link must be enabled in Clerk).
      skipPasswordRequirement: true,
      skipLegalChecks: true,
      ...splitName(user.name),
    }),
  );
  return { outcome: "imported", oldId, clerkId: created.id, email };
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (!parsed) {
    console.error(
      "Usage: node scripts/migrate-auth-to-clerk.ts --users <export.jsonl> [--out auth-mapping.json] [--dry-run]",
    );
    process.exitCode = 1;
    return;
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!parsed.dryRun && !secretKey) {
    console.error("Set CLERK_SECRET_KEY (sk_live_... for production) or pass --dry-run.");
    process.exitCode = 1;
    return;
  }

  const { users, skipped } = parseExportedUsers(
    readFileSync(path.resolve(parsed.usersPath), "utf8"),
  );
  console.log(
    `Read ${users.length} importable user(s) from ${parsed.usersPath} (${skipped} skipped: anonymous, missing email, or malformed).`,
  );

  if (parsed.dryRun) {
    for (const user of users.slice(0, 10)) {
      console.log(`  would import ${user.email} (oldId ${user.oldId})`);
    }
    if (users.length > 10) console.log(`  … and ${users.length - 10} more`);
    return;
  }

  const clerk = createClerkClient({ secretKey: secretKey! });
  const results: ImportResult[] = [];
  for (const user of users) {
    try {
      const result = await importUser(clerk, user);
      results.push(result);
      console.log(`  ${result.outcome}: ${result.email} → ${result.clerkId}`);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      results.push({ outcome: "failed", oldId: user.oldId, email: user.email, detail });
      console.error(`  failed: ${user.email} — ${detail}`);
    }
  }

  const mapping: MigrationEntry[] = results
    .filter((result): result is ImportResult & { oldId: string; clerkId: string; email: string } =>
      Boolean(result.oldId && result.clerkId && result.email))
    .map(({ oldId, clerkId, email }) => ({ oldId, clerkId, email }));
  writeFileSync(path.resolve(parsed.outPath), `${JSON.stringify(mapping, null, 2)}\n`);

  const counts = results.reduce<Record<string, number>>((tally, result) => {
    tally[result.outcome] = (tally[result.outcome] ?? 0) + 1;
    return tally;
  }, {});
  console.log(
    `Done. ${Object.entries(counts).map(([outcome, count]) => `${count} ${outcome}`).join(", ")}.`,
  );
  console.log(`Mapping written to ${path.resolve(parsed.outPath)}.`);
  if (results.some((result) => result.outcome === "failed" || result.outcome === "conflict")) {
    console.error("Resolve the failures above and re-run before the cutover.");
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (invokedPath && path.resolve(invokedPath) === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
