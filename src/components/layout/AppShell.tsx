import { Outlet } from "@tanstack/react-router";
import { FooterNotice } from "./FooterNotice";
import { SiteNav } from "./SiteNav";

export function AppShell() {
  return (
    <div className="relative flex min-h-screen flex-col">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-primary-foreground">Skip to content</a>
      <SiteNav />
      <main id="main-content" tabIndex={-1} className="content-column flex-1 py-8 outline-none sm:py-10 md:py-12"><Outlet /></main>
      <FooterNotice />
    </div>
  );
}
