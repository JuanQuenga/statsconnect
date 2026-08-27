import "./index.css";
import { mountApplication } from "./application";
import { startApplicationShell } from "./application-shell";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("StatsConnect could not find its root element.");
}

if (import.meta.env.VITE_STATSCONNECT_MOBILE_DEV === "1") {
  mountApplication(rootElement);
} else {
  void startApplicationShell(rootElement);
}
