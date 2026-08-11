import { Outlet } from "@tanstack/react-router";
import { AmbientProvider, useAmbient } from "@/components/lobby/ambient";
import { FooterNotice } from "./FooterNotice";
import { SiteNav } from "./SiteNav";

export function AppShell() {
  return (
    <AmbientProvider>
      <Stage />
    </AmbientProvider>
  );
}

function Stage() {
  const { ambient } = useAmbient();
  return (
    <div
      data-ambient={ambient ?? undefined}
      className="relative flex min-h-screen flex-col"
    >
      <StageLight />
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
      <FooterNotice />
    </div>
  );
}

/**
 * The console backdrop. Two soft colour pools sit behind everything and
 * cross-fade to the accent of whichever game currently owns the stage.
 */
function StageLight() {
  return (
    <>
      <div className="stage-light" aria-hidden>
        <i
          className="-left-[18%] -top-[22%] size-[62vw] opacity-[0.28]"
          style={{ backgroundColor: "var(--ambient)" }}
        />
        <i
          className="-right-[16%] top-[8%] size-[52vw] opacity-[0.22]"
          style={{ backgroundColor: "var(--ambient-2)" }}
        />
        <i
          className="bottom-[-30%] left-[28%] size-[58vw] opacity-[0.12]"
          style={{ backgroundColor: "var(--ambient)" }}
        />
      </div>
      <div
        className="plated pointer-events-none fixed inset-0 z-0 opacity-70"
        aria-hidden
      />
      <div className="stage-horizon" aria-hidden />
    </>
  );
}
