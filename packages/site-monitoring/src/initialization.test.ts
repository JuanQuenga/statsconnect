import assert from "node:assert/strict";
import test from "node:test";
import { reportClientError, setClientErrorReporter, type ClientErrorReport } from "../../site-errors/src/index.ts";
import { initializeMonitoring } from "./index.ts";

test("disabled or credential-free initialization leaves the browser unmodified", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  const browser = {};
  Object.defineProperty(globalThis, "window", { configurable: true, value: browser });
  try {
    await initializeMonitoring({ enabled: false, environment: "test", posthogKey: "unused" });
    await initializeMonitoring({ enabled: true, environment: "test" });
    assert.deepEqual(browser, {});
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

test("independently loaded error modules use the document's shared reporter", async () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try {
    const reports: ClientErrorReport[] = [];
    setClientErrorReporter((report) => reports.push(report));
    const secondCopy: typeof import("../../site-errors/src/index.ts") = await import(new URL("../../site-errors/src/index.ts?separate-game-bundle", import.meta.url).href);
    const error = new Error("A test failure");
    const reference = secondCopy.reportClientError({ app: "brawlstats", error, source: "render" });
    assert.equal(reports.length, 1);
    assert.equal(reports[0]?.reference, reference);
    assert.equal(reports[0]?.error, error);
    reportClientError({ app: "statsconnect", error: new Error("Another test failure"), source: "route" });
    assert.equal(reports.length, 2);
  } finally {
    if (previous) Object.defineProperty(globalThis, "window", previous);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
