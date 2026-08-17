import assert from "node:assert/strict";
import test from "node:test";
import { QueryClient } from "@tanstack/react-query";
import { BrawlDataError, createBrawlDataModule } from "#game-data";

test("owns endpoint construction, response normalization, freshness, and cache identity", async () => {
  const requested: string[] = [];
  const data = createBrawlDataModule({
    siteUrl: "https://example.convex.cloud/",
    fetch: async (input) => {
      requested.push(input);
      return Response.json({
        items: [{
          id: 16000000,
          name: "<c1>Shelly</c>",
          rarity: { name: "Starting Brawler", color: "not-a-color" },
          class: { name: "Damage Dealer" },
          gadgets: [{ id: 23000255, name: "Fast Forward", description: "Dash <!distance>." }],
          starPowers: [],
        }],
      });
    },
  });
  const client = new QueryClient();
  const firstOptions = data.brawlers();
  const secondOptions = data.brawlers();

  const first = await client.fetchQuery(firstOptions);
  const second = await client.fetchQuery(secondOptions);

  assert.equal(requested[0], "https://example.convex.site/api/brawlers");
  assert.equal(requested.length, 1);
  assert.deepEqual(firstOptions.queryKey, secondOptions.queryKey);
  assert.equal(firstOptions.staleTime, 24 * 60 * 60_000);
  assert.deepEqual(first, second);
  assert.deepEqual(first[0], {
    id: 16000000,
    name: "Shelly",
    hash: "Shelly",
    version: 0,
    rarity: "Starting Brawler",
    color: "#f5c85b",
    role: "Damage Dealer",
    description: "Brawler profile from the live game catalog.",
    gadget: "Fast Forward",
    starPower: "No Star Power listed",
    gadgets: [{
      id: 23000255,
      name: "Fast Forward",
      description: "Dash a scaling amount.",
      imageUrl: undefined,
      released: true,
    }],
    starPowers: [],
    imageUrl: undefined,
    imageUrl2: undefined,
    imageUrl3: undefined,
    released: true,
  });
});

test("owns ranking parameters and keeps distinct requests in distinct cache entries", async () => {
  const requested: string[] = [];
  const data = createBrawlDataModule({
    siteUrl: "https://example.convex.site",
    fetch: async (input) => {
      requested.push(input);
      return Response.json({ list: [] });
    },
  });
  const client = new QueryClient();

  await client.fetchQuery(data.rankingPlayers("US", 50));
  await client.fetchQuery(data.rankingPlayers("global", 6));

  assert.equal(
    requested[0],
    "https://example.convex.site/api/rankings?kind=players&country=US&limit=50",
  );
  assert.equal(
    requested[1],
    "https://example.convex.site/api/rankings?kind=players&country=global&limit=6",
  );
  assert.notDeepEqual(
    data.rankingPlayers("US", 50).queryKey,
    data.rankingPlayers("global", 6).queryKey,
  );
});

test("classifies missing configuration without calling fetch", async () => {
  let attempts = 0;
  const data = createBrawlDataModule({
    fetch: async () => {
      attempts += 1;
      return Response.json([]);
    },
  });
  const client = new QueryClient();

  await assert.rejects(
    client.fetchQuery(data.events()),
    (error: unknown) => error instanceof BrawlDataError
      && error.kind === "configuration"
      && error.code === "NOT_CONFIGURED"
      && error.status === 503,
  );
  assert.equal(attempts, 0);
});

test("classifies malformed configuration without calling fetch", async () => {
  let attempts = 0;
  const data = createBrawlDataModule({
    siteUrl: "not a URL",
    fetch: async () => {
      attempts += 1;
      return Response.json([]);
    },
  });
  const client = new QueryClient();

  await assert.rejects(
    client.fetchQuery(data.maps()),
    (error: unknown) => error instanceof BrawlDataError
      && error.kind === "configuration"
      && error.code === "INVALID_CONFIGURATION",
  );
  assert.equal(attempts, 0);
});

test("keeps the server message and error code after stripping color tags", async () => {
  const data = createBrawlDataModule({
    siteUrl: "https://example.convex.site",
    fetch: async () => Response.json(
      { message: "<c2>Player not found</c>", error: "NOT_FOUND" },
      { status: 404 },
    ),
  });
  const client = new QueryClient();

  await assert.rejects(
    client.fetchQuery(data.player("#MISSING")),
    (error: unknown) => error instanceof BrawlDataError
      && error.kind === "response"
      && error.message === "Player not found"
      && error.code === "NOT_FOUND"
      && error.status === 404,
  );
});
