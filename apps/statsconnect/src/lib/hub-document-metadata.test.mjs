import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Window } from "happy-dom";
import { hubRoutes, siteOrigin } from "../../../../shared/site-routes.ts";
import { sitePageParts } from "../../../../server/site-pages.ts";
import { isGameId } from "./contracts.ts";

const window = new Window({ url: "https://statsconnect.app/" });
Object.assign(globalThis, {
  window,
  document: window.document,
  self: window,
  HTMLElement: window.HTMLElement,
  scrollTo: window.scrollTo.bind(window),
  IS_REACT_ACT_ENVIRONMENT: true,
});

const { act, createElement, Fragment, StrictMode } = await import("react");
const { createRoot } = await import("react-dom/client");
const { createMemoryHistory, createRootRoute, createRoute, createRouter, HeadContent, notFound, Outlet, RouterProvider } = await import("@tanstack/react-router");
const { HubDocumentMetadata } = await import("./hub-document-metadata.ts");
const index = await readFile(new URL("../../index.html", import.meta.url), "utf8");

test("Hub metadata follows navigation and history without duplicating the initial document tags", async (t) => {
  for (const initialPath of ["/", "/privacy"]) {
    await t.test(`initial document ${initialPath}`, async () => {
      document.head.innerHTML = initialPath === "/"
        ? index.match(/<head>([\s\S]*?)<\/head>/)[1]
        : sitePageParts("hub", initialPath).tags.join("\n");
      const originalHead = document.head.innerHTML;
      const container = document.createElement("div");
      document.body.append(container);
      const rootRoute = createRootRoute({
        notFoundComponent: () => createElement("h1", null, "Not found"),
        component: () => createElement(Fragment, null,
          createElement(HeadContent), createElement(HubDocumentMetadata), createElement(Outlet)),
      });
      const routes = ["/", "/privacy", "/connect/", "/connect/$game"].map((path) => createRoute({
        getParentRoute: () => rootRoute,
        path,
        beforeLoad: ({ params }) => {
          if (path === "/connect/$game" && !isGameId(params.game)) throw notFound();
        },
        head: () => ({ meta: [{ title: path }] }),
        component: () => createElement("h1", null, path),
      }));
      const history = createMemoryHistory({ initialEntries: [initialPath] });
      const router = createRouter({ routeTree: rootRoute.addChildren(routes), history });
      const root = createRoot(container);
      try {
        await act(async () => {
          await router.load();
          root.render(createElement(StrictMode, null, createElement(RouterProvider, { router })));
        });

        const check = (path, canonicalPath = path) => {
          assert.equal(router.state.location.pathname, path);
          const route = hubRoutes.find((route) => route.path === canonicalPath);
          const canonicals = document.head.querySelectorAll('link[rel="canonical"]');
          const descriptions = document.head.querySelectorAll('meta[name="description"]');
          assert.equal(canonicals.length, 1, `${path} canonical count`);
          assert.equal(descriptions.length, 1, `${path} description count`);
          assert.equal(canonicals[0].href, `${siteOrigin("hub")}${canonicalPath}`, `${path} canonical`);
          assert.equal(descriptions[0].content, route.description, `${path} description`);
        };
        check(initialPath);
        for (const path of ["/", "/privacy", "/connect", "/"]) {
          await act(async () => { await router.navigate({ to: path }); });
          check(path);
        }
        for (const [direction, path] of [["back", "/connect"], ["back", "/privacy"], ["forward", "/connect"]]) {
          await act(async () => { history[direction](); await router.load(); });
          check(path);
        }
        for (const game of ["clash-royale", "brawl-stars"]) {
          await act(async () => { await router.navigate({ to: `/connect/${game}?source=test#tag` }); });
          check(`/connect/${game}`);
        }
        for (const [path, canonicalPath] of [
          ["/Privacy", "/privacy"],
          ["/Connect", "/connect"],
          ["/Connect/clash-royale", "/connect/clash-royale"],
          ["/Connect/brawl-stars", "/connect/brawl-stars"],
        ]) {
          await act(async () => { await router.navigate({ to: path }); });
          check(path, canonicalPath);
        }
        for (const game of ["Clash-Royale", "Brawl-Stars"]) {
          await act(async () => { await router.navigate({ to: `/connect/${game}` }); });
          assert.equal(container.querySelector("h1").textContent, "Not found");
          check(`/connect/${game}`, initialPath);
        }
      } finally {
        await act(async () => { root.unmount(); });
        container.remove();
      }
      assert.equal(document.head.innerHTML, originalHead, "unmount restores the original document head");
    });
  }
  await window.happyDOM.close();
});
