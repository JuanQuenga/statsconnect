import { useEffect, useRef } from "react";

declare global {
  interface Window {
    adsbygoogle?: Array<Record<string, never>>;
  }
}

export type AdSenseUnitProps = Readonly<{
  clientId?: string;
  slotId?: string;
  className?: string;
  serveAds: boolean;
}>;

/** One manually placed production unit. Missing configuration leaves no empty space. */
export function AdSenseUnit({ clientId, slotId, className, serveAds }: AdSenseUnitProps) {
  const requested = useRef(false);
  const configured = /^ca-pub-\d{16}$/.test(clientId ?? "") && /^\d+$/.test(slotId ?? "");

  useEffect(() => {
    if (!configured || !serveAds || requested.current) return;
    requested.current = true;
    try {
      (window.adsbygoogle ??= []).push({});
    } catch {
      // A blocked ad request must not interrupt the page.
    }
  }, [configured, serveAds]);

  if (!configured || !serveAds) return null;

  return (
    <aside aria-label="Advertisement" className={`statsconnect-ad ${className ?? ""}`}>
      <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-[0.18em] opacity-60">Advertisement</p>
      <ins
        className="adsbygoogle"
        style={{ display: "block", minHeight: 90, width: "100%" }}
        data-ad-client={clientId}
        data-ad-slot={slotId}
        data-ad-format="horizontal"
        data-full-width-responsive="true"
      />
    </aside>
  );
}
