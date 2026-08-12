import { FooterNotice } from "@/components/layout/FooterNotice";
import { SiteNav } from "@/components/layout/SiteNav";
import type { CSSProperties, ReactNode } from "react";

type BrawlShellStyle = CSSProperties & {
  "--brawl-arena-image": string;
};

const shellStyle: BrawlShellStyle = {
  "--brawl-arena-image": `url("${import.meta.env.BASE_URL}assets/generated/brawlstats-arena.webp")`,
};

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="brawl-site-frame relative z-0 flex min-h-svh flex-col" style={shellStyle}>
      <a
        href="#maincontent"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground"
      >
        Skip to main content
      </a>
      <SiteNav />
      <main id="maincontent" className="flex-1" tabIndex={-1}>
        {children}
      </main>
      <FooterNotice />
    </div>
  );
}
