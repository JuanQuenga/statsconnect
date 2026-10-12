import assert from "node:assert/strict";
import test from "node:test";
import middleware, { config } from "../middleware.ts";

test("root middleware only runs on the bare root path", () => {
  assert.equal(config.matcher, "/");
});

test("compatibility hosts redirect their root permanently to the apex, keeping the query", () => {
  for (const host of ["www.statsconnect.app", "stats.juanquenga.com"]) {
    const response = middleware(new Request(`https://${host}/?ref=mail`));
    assert.equal(response.status, 308, host);
    assert.equal(response.headers.get("location"), "https://statsconnect.app/?ref=mail", host);
  }
  assert.equal(middleware(new Request("https://www.statsconnect.app/")).headers.get("location"), "https://statsconnect.app/");
});

test("game site homes render their own site-shell document", () => {
  for (const game of ["cr", "bs"]) {
    const response = middleware(new Request(`https://${game}.statsconnect.app/`));
    assert.equal(response.headers.get("x-middleware-rewrite"), `https://${game}.statsconnect.app/api/site-shell?game=${game}&route=%2F`);
  }
});

test("the apex and preview hosts continue to the static Hub shell", () => {
  for (const url of ["https://statsconnect.app/", "https://statsconnect-git-main.vercel.app/"]) {
    const response = middleware(new Request(url));
    assert.equal(response.headers.get("x-middleware-next"), "1", url);
    assert.equal(response.headers.get("x-middleware-rewrite"), null, url);
  }
});
