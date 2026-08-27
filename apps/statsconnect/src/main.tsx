import "./index.css";
import { startApplicationShell } from "./application-shell";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("StatsConnect could not find its root element.");
}

void startApplicationShell(rootElement);
