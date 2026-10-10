import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { brawlClub, clubMetadata, clubUrl } from "./club-preview.ts";

const shell = '<html><head><title>Hub</title><meta name="description" content="Hub" /></head><body><div id="root"></div></body></html>';

test("shared clans and clubs unfurl with their name, roster, and trophies but stay out of the index", () => {
  const html = clubMetadata(shell, { game: "cr", tag: "2PP" }, { name: "Mega Stars", members: 47, trophies: 61234, type: "inviteOnly" });
  assert.match(html, /<title>Mega Stars · Clash Royale clan · StatsConnect<\/title>/);
  assert.ok(html.includes('content="47/50 members · 61,234 trophies · Invite only. See every member&#39;s trophies and activity in Mega Stars on StatsConnect."'));
  assert.ok(html.includes('<link rel="canonical" href="https://cr.statsconnect.app/clans/2PP" />'));
  assert.ok(html.includes('<meta name="robots" content="noindex, follow" />'));
  assert.equal((html.match(/<title>/g) ?? []).length, 1);
  assert.equal((html.match(/<meta name="description"/g) ?? []).length, 1);
  const club = clubMetadata(shell, { game: "bs", tag: "QVLRCJQ0" }, brawlClub({ name: "Spike Squad", trophies: 900000, members: [{}, {}, {}], type: "open" }));
  assert.match(club, /<title>Spike Squad · Brawl Stars club · StatsConnect<\/title>/);
  assert.ok(club.includes("3/30 members · 900,000 trophies · Open to join."));
  assert.ok(clubMetadata(shell, { game: "cr", tag: "2PP" }, { name: "N", members: 1, type: "Invite Only" }).includes("1/50 members · Invite only."));
});

test("an unreachable club still unfurls generically", () => {
  const html = clubMetadata(shell, { game: "bs", tag: "QVLRCJQ0" });
  assert.match(html, /<title>Brawl Stars club #QVLRCJQ0 · StatsConnect<\/title>/);
  assert.equal(clubUrl({ game: "bs", tag: "QVLRCJQ0" }), "https://bs.statsconnect.app/clubs?tag=%23QVLRCJQ0");
  assert.throws(() => brawlClub({ members: [] }));
});

test("the clan rewrite only matches real tags, so /clans/search keeps its own page", async () => {
  const vercel = JSON.parse(await readFile("vercel.json", "utf8")) as { rewrites: Array<{ source: string; destination: string }> };
  const rewrite = vercel.rewrites.find((candidate) => candidate.destination.startsWith("/api/club-preview?game=cr"));
  const pattern = /^\/clans\/:tag\((.+)\)$/.exec(rewrite?.source ?? "")?.[1];
  assert.ok(pattern);
  const tag = new RegExp(`^${pattern}$`);
  assert.equal(tag.test("2PP"), true);
  assert.equal(tag.test("2pp0lq8y"), true);
  for (const reserved of ["search", "CCDEMO"]) assert.equal(tag.test(reserved), false, reserved);
});
