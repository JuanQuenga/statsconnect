import type {
  MountedStatsConnectApplication,
  MountStatsConnectApplication,
} from "@statsconnect/site-nav";
import { mountApplication as mountHubApplication } from "./application";
import { applicationForLocation } from "@statsconnect/site-nav";

type ApplicationId = "statsconnect" | "brawl-stars" | "clash-royale";

type ApplicationAssetManifest = {
  entry: string;
  styles: readonly string[];
  themeColor: string;
  title: string;
};

type ApplicationShellManifest = {
  applications: Record<Exclude<ApplicationId, "statsconnect">, ApplicationAssetManifest>;
  version: 1;
};

const manifestUrl = "/application-shell-manifest.json";
const hubMetadata = {
  themeColor: document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.content ?? "#08070d",
  title: document.title,
};

function applicationId(pathname: string): ApplicationId {
  return applicationForLocation(window.location.hostname, pathname);
}

function isApplicationAssetManifest(value: unknown): value is ApplicationAssetManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.entry === "string" &&
    Array.isArray(candidate.styles) &&
    candidate.styles.every((style) => typeof style === "string") &&
    typeof candidate.themeColor === "string" &&
    typeof candidate.title === "string"
  );
}

function isApplicationShellManifest(value: unknown): value is ApplicationShellManifest {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.version !== 1 || !candidate.applications || typeof candidate.applications !== "object") return false;
  const applications = candidate.applications as Record<string, unknown>;
  return (
    isApplicationAssetManifest(applications["brawl-stars"]) &&
    isApplicationAssetManifest(applications["clash-royale"])
  );
}

function localStylesheets(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')).filter((link) => {
    const url = new URL(link.href, window.location.href);
    return url.origin === window.location.origin;
  });
}

function showShellError(rootElement: HTMLElement, error: unknown): void {
  const section = document.createElement("section");
  const title = document.createElement("h1");
  const detail = document.createElement("p");
  const retry = document.createElement("button");

  section.className = "shell-error";
  title.textContent = "StatsConnect could not open that game";
  detail.textContent = error instanceof Error ? error.message : "The application bundle could not be loaded.";
  retry.type = "button";
  retry.textContent = "Try again";
  retry.addEventListener("click", () => window.location.reload());
  section.append(title, detail, retry);
  rootElement.replaceChildren(section);
  rootElement.removeAttribute("aria-busy");
}

export async function startApplicationShell(rootElement: HTMLElement): Promise<void> {
  window.__statsConnectApplicationShell = true;

  const hubStyles = localStylesheets();
  const styleLinks = new Map<ApplicationId, HTMLLinkElement[]>([["statsconnect", hubStyles]]);
  const modulePromises = new Map<Exclude<ApplicationId, "statsconnect">, Promise<MountStatsConnectApplication>>();
  let manifestPromise: Promise<ApplicationShellManifest> | null = null;
  let current: { id: ApplicationId; application: MountedStatsConnectApplication } | null = null;
  let transition = 0;

  function loadManifest(): Promise<ApplicationShellManifest> {
    manifestPromise ??= fetch(manifestUrl, { credentials: "same-origin" }).then(async (response) => {
      if (!response.ok) throw new Error(`Application manifest returned ${response.status}.`);
      const value: unknown = await response.json();
      if (!isApplicationShellManifest(value)) throw new Error("Application manifest is invalid.");
      return value;
    });
    return manifestPromise;
  }

  async function ensureStyles(id: Exclude<ApplicationId, "statsconnect">, urls: readonly string[]): Promise<void> {
    if (styleLinks.has(id)) return;
    const links = await Promise.all(urls.map((href) => new Promise<HTMLLinkElement>((resolve, reject) => {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.media = "not all";
      link.href = href;
      link.dataset.statsConnectApplication = id;
      link.addEventListener("load", () => resolve(link), { once: true });
      link.addEventListener("error", () => reject(new Error(`Could not load ${href}.`)), { once: true });
      document.head.append(link);
    })));
    styleLinks.set(id, links);
  }

  function activateStyles(id: ApplicationId): void {
    for (const [styleId, links] of styleLinks) {
      for (const link of links) link.media = styleId === id ? "" : "not all";
    }
  }

  function applyMetadata(id: ApplicationId, assets?: ApplicationAssetManifest): void {
    document.title = assets?.title ?? hubMetadata.title;
    const theme = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (theme) theme.content = assets?.themeColor ?? hubMetadata.themeColor;
    document.documentElement.dataset.statsConnectApplication = id;
  }

  async function loadApplicationModule(
    id: Exclude<ApplicationId, "statsconnect">,
    assets: ApplicationAssetManifest,
  ): Promise<MountStatsConnectApplication> {
    const existing = modulePromises.get(id);
    if (existing) return existing;

    const loading = (async () => {
      await import(/* @vite-ignore */ assets.entry);
      const mount = window.__statsConnectMounts?.[id];
      if (!mount) throw new Error(`${id} did not register a mountable application.`);
      return mount;
    })();
    modulePromises.set(id, loading);
    return loading;
  }

  async function switchApplication(id: ApplicationId, destinationHref?: string): Promise<void> {
    const request = ++transition;
    if (current?.id === id) {
      current.application.navigate(window.location.href);
      return;
    }

    rootElement.setAttribute("aria-busy", "true");
    const previous = current;

    try {
      let mount: MountStatsConnectApplication;
      let assets: ApplicationAssetManifest | undefined;

      if (id === "statsconnect") {
        mount = mountHubApplication;
      } else {
        const manifest = await loadManifest();
        assets = manifest.applications[id];
        await ensureStyles(id, assets.styles);
        mount = await loadApplicationModule(id, assets);
      }

      if (request !== transition) return;
      previous?.application.unmount();
      if (destinationHref) window.history.pushState(null, "", destinationHref);
      rootElement.replaceChildren();
      activateStyles(id);
      applyMetadata(id, assets);
      current = { id, application: mount(rootElement) };
      rootElement.removeAttribute("aria-busy");
    } catch (error) {
      if (request !== transition) return;
      previous?.application.unmount();
      current = null;
      showShellError(rootElement, error);
    }
  }

  window.__statsConnectNavigate = (href) => {
    const destination = new URL(href, window.location.href);
    if (destination.origin !== window.location.origin) {
      window.location.assign(destination.href);
      return;
    }
    const id = applicationId(destination.pathname);

    if (current?.id === id) {
      current.application.navigate(destination.href);
      return;
    }

    void switchApplication(id, destination.href).then(() => window.scrollTo({ top: 0 }));
  };

  window.addEventListener("popstate", () => {
    const id = applicationId(window.location.pathname);
    if (current?.id !== id) void switchApplication(id);
  });

  await switchApplication(applicationId(window.location.pathname));
}
