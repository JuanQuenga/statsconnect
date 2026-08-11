import { FooterNotice } from "@/components/layout/FooterNotice";
import { SiteNav } from "@/components/layout/SiteNav";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-0 flex min-h-svh flex-col">
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
