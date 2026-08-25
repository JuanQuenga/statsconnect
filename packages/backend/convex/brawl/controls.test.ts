import type * as Controls from "./controls";

const { envSeconds } = (await import(new URL("./controls.ts", import.meta.url).href)) as typeof Controls;

function equal(actual: number, expected: number, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, received ${actual}`);
  }
}

equal(
  envSeconds(
    {
      BRAWL_PLAYER_PROFILE_CACHE_SECONDS: "900",
      BRAWL_PROFILE_CACHE_TTL_SECONDS: "300",
    },
    ["BRAWL_PLAYER_PROFILE_CACHE_SECONDS", "BRAWL_PROFILE_CACHE_TTL_SECONDS"],
    60,
  ),
  900,
  "the documented cache variable takes precedence",
);
equal(
  envSeconds(
    { BRAWL_PROFILE_CACHE_TTL_SECONDS: "300" },
    ["BRAWL_PLAYER_PROFILE_CACHE_SECONDS", "BRAWL_PROFILE_CACHE_TTL_SECONDS"],
    60,
  ),
  300,
  "the legacy profile variable remains compatible",
);
equal(
  envSeconds(
    { BRAWL_PLAYER_BATTLE_CACHE_SECONDS: "not-a-number" },
    ["BRAWL_PLAYER_BATTLE_CACHE_SECONDS", "BRAWL_BATTLE_LOG_CACHE_TTL_SECONDS"],
    120,
  ),
  120,
  "invalid values use the intentional default",
);

console.log("ok - cache environment aliases");
