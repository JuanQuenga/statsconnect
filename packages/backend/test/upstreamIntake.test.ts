import assert from "node:assert/strict";
import test from "node:test";

import {
  brawlTagKey,
  createBrawlUpstreamIntake,
  normalizeBrawlTag,
  type BrawlUpstreamTelemetryEvent,
} from "../convex/brawl/upstreamIntake.ts";

test("tag handling produces one canonical official tag and durable key", () => {
  assert.equal(normalizeBrawlTag("  #2ygy  "), "#2YGY");
  assert.equal(brawlTagKey("2ygy"), "2YGY");
  assert.equal(normalizeBrawlTag("ABC123"), null);
  assert.equal(normalizeBrawlTag(null), null);
});

test("official player intake owns auth, endpoint encoding, and normalization", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const intake = createBrawlUpstreamIntake({
    environment: {
      BRAWL_STARS_API_TOKEN: " secret ",
      BRAWL_STARS_API_BASE_URL: "https://official.example/v1/",
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({ url: String(input), authorization: headers.get("Authorization") });
      return Response.json({
        tag: "#2ygy",
        name: " Player ",
        trophies: 1234,
        highestTrophies: 1400,
        expLevel: 20,
        "3vs3Victories": 50,
        soloVictories: 6,
        duoVictories: 7,
        club: { tag: "#8py", name: "Club" },
        icon: { id: 42 },
        ranked: { currentRank: 9, bestRankName: "Legendary" },
        brawlers: [{
          id: 16000000,
          name: "SHELLY",
          power: 11,
          rank: 30,
          trophies: 900,
          highestTrophies: 950,
          gadgets: [{ id: 1, name: "Gadget" }],
          starPowers: [],
          gears: [],
          hypercharges: [{ id: 2, name: "Hyper" }],
        }],
      });
    },
  });

  const result = await intake.official.player("2ygy");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(requests, [{
    url: "https://official.example/v1/players/%232YGY",
    authorization: "Bearer secret",
  }]);
  assert.equal(result.value.tag, "#2YGY");
  assert.equal(result.value.name, "Player");
  assert.equal(result.value.clubTag, "#8PY");
  assert.equal(result.value.brawlerCount, 1);
  assert.equal(result.value.power11Count, 1);
  assert.deepEqual(result.value.brawlers[0]?.hypercharges, [{ id: 2, name: "Hyper" }]);
});

test("invalid normalized payload emits one failed intake event", async () => {
  const rawBody = JSON.stringify({ tag: "#2YGY", trophies: 100 });
  const events: BrawlUpstreamTelemetryEvent[] = [];
  const intake = createBrawlUpstreamIntake({
    environment: { BRAWL_STARS_API_TOKEN: "token" },
    now: () => 200,
    fetch: async () => new Response(rawBody, { status: 200 }),
    telemetry: (event) => {
      events.push(event);
    },
  });

  const result = await intake.official.player("#2YGY");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "invalid_response");
  assert.equal(result.rawBody, rawBody);
  assert.deepEqual(result.rawPayload, { tag: "#2YGY", trophies: 100 });
  assert.deepEqual(events, [{
    source: "official",
    endpoint: "players/detail",
    status: 502,
    ok: false,
    durationMs: 0,
    errorCode: "invalid_response",
  }]);
});

test("battle logs normalize items and latest battle identity", async () => {
  const intake = createBrawlUpstreamIntake({
    environment: { BRAWL_STARS_API_TOKEN: "token" },
    fetch: async () => Response.json({ items: [
      { battleTime: "20260815T120000.000Z" },
      { battleTime: "20260816T120000.000Z" },
      { malformed: true },
    ] }),
  });

  const result = await intake.official.battleLog("#2YGY");

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.items.length, 3);
  assert.equal(result.value.latestBattleTime, "20260816T120000.000Z");
});

test("public metadata stays keyless and separate from official configuration", async () => {
  const requests: Array<{ url: string; authorization: string | null; accept: string | null }> = [];
  const intake = createBrawlUpstreamIntake({
    environment: { BRAWL_PUBLIC_METADATA_BASE_URL: "https://metadata.example/v1/" },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      requests.push({
        url: String(input),
        authorization: headers.get("Authorization"),
        accept: headers.get("Accept"),
      });
      return Response.json({ list: [{ id: 7, name: "Map" }] });
    },
  });

  const result = await intake.publicMetadata.maps();

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.items, [{ id: 7, name: "Map" }]);
  assert.deepEqual(requests, [{
    url: "https://metadata.example/v1/maps",
    authorization: null,
    accept: "application/json",
  }]);
});

test("configuration errors do not fetch and await telemetry", async () => {
  let fetched = false;
  let telemetryFinished = false;
  const events: BrawlUpstreamTelemetryEvent[] = [];
  const intake = createBrawlUpstreamIntake({
    environment: {},
    now: () => 100,
    fetch: async () => {
      fetched = true;
      return Response.json({});
    },
    telemetry: async (event) => {
      await Promise.resolve();
      events.push(event);
      telemetryFinished = true;
    },
  });

  const result = await intake.official.club("#2YGY");

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "not_configured");
  assert.equal(result.error.retryable, false);
  assert.equal(fetched, false);
  assert.equal(telemetryFinished, true);
  assert.deepEqual(events, [{
    source: "official",
    endpoint: "clubs/detail",
    status: 0,
    ok: false,
    durationMs: 0,
    errorCode: "not_configured",
  }]);
});

test("upstream and transport errors have deterministic retry classification", async () => {
  const rejected = createBrawlUpstreamIntake({
    environment: { BRAWL_STARS_API_TOKEN: "token" },
    fetch: async () => Response.json({ message: "slow down" }, { status: 429 }),
  });
  const unavailable = createBrawlUpstreamIntake({
    environment: { BRAWL_STARS_API_TOKEN: "token" },
    fetch: async () => {
      throw new Error("socket closed");
    },
  });

  const rateLimited = await rejected.official.eventRotation();
  const networkFailure = await unavailable.official.eventRotation();

  assert.equal(rateLimited.ok, false);
  if (!rateLimited.ok) {
    assert.equal(rateLimited.status, 429);
    assert.equal(rateLimited.error.code, "rate_limited");
    assert.equal(rateLimited.error.retryable, true);
    assert.deepEqual(rateLimited.rawPayload, { message: "slow down" });
  }
  assert.equal(networkFailure.ok, false);
  if (!networkFailure.ok) {
    assert.equal(networkFailure.status, 502);
    assert.equal(networkFailure.error.code, "unavailable");
    assert.equal(networkFailure.error.retryable, true);
  }
});

test("rankings expose canonical tags and sightings for crawler reuse", async () => {
  const intake = createBrawlUpstreamIntake({
    environment: { BRAWL_STARS_API_TOKEN: "token" },
    fetch: async () => Response.json({ items: [
      { tag: "#2ygy", name: "One", trophies: 100, icon: { id: 1 } },
      { tag: "2YGY", name: "Duplicate" },
      { tag: "#8PY", name: "Two" },
      { tag: "bad", name: "Ignored" },
    ] }),
  });

  const result = await intake.official.rankings({ country: "global", kind: "players", limit: 50 });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.tags, ["#2YGY", "#8PY"]);
  assert.equal(result.value.sightings.length, 3);
  assert.equal(result.value.sightings[0]?.iconId, 1);
});
