import { HeadContent, Outlet } from "@tanstack/react-router";
import { AmbientProvider, useAmbient } from "@/components/lobby/ambient";
import { FooterNotice } from "./FooterNotice";
import { SiteNav } from "./SiteNav";
import { CommunityRequest } from "@statsconnect/monetization";

export function AppShell() {
  return (
    <>
      <HeadContent />
      <AmbientProvider>
        <Stage />
      </AmbientProvider>
    </>
  );
}

function Stage() {
  const { ambient } = useAmbient();
  return (
    <div
      data-ambient={ambient ?? undefined}
      className="relative flex min-h-screen flex-col"
    >
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-6 focus:top-6 focus:z-[70] focus:bg-[var(--ambient)] focus:px-5 focus:py-3 focus:font-display focus:text-sm focus:font-bold focus:uppercase focus:tracking-widest focus:text-[#04121b]"
      >
        Skip to content
      </a>
      <SiteNav />
      <main
        id="main-content"
        tabIndex={-1}
        className="content-column relative z-10 flex-1 py-10 outline-none md:py-14"
      >
        <Outlet />
      </main>
      <CommunityRequest supportUrl={import.meta.env.VITE_STATSCONNECT_SUPPORT_URL} />
      <FooterNotice />
    </div>
  );
}
