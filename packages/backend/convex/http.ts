import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";
import { registerBrawlHttpRoutes } from "./brawl/http";

const http = httpRouter();

authComponent.registerRoutes(http, createAuth, { cors: true });
registerBrawlHttpRoutes(http);

export default http;
