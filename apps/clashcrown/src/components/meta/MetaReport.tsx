import { useCallback, useEffect, useMemo, useState } from "react";
import { AdSenseUnit } from "@statsconnect/monetization";
import { useQuery } from "convex/react";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import { cardReportQuery } from "@/lib/analytics";
import { discoverDecksQuery } from "@/lib/deckDiscovery";
import { useI18n } from "@/lib/i18n";
import { nextMetaState, parseMetaQuery, relativeAge, serializeMetaQuery, type MetaState } from "@/lib/metaReport";
import { useRouter } from "@/lib/router";
import { useCardLibrary } from "@/lib/useCardCatalog";
import { META_CONTENT_ID, MetaControlBar } from "./MetaControlBar";
import { MetaArchetypesView } from "./MetaArchetypesView";
import { MetaCardsView } from "./MetaCardsView";
import { MetaDecksView } from "./MetaDecksView";
import { MetaOverview } from "./MetaOverview";
import { useMetaCopy } from "./metaCopy";
import styles from "./meta.module.css";

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * The meta report: one URL-driven page with four views. The deck board and
 * the card report are read here because the hero's sample line and several
 * views share them; view-specific reads live in each view.
 */
export function MetaReport() {
  const { t } = useI18n();
  const { copy, locale, count, modeName } = useMetaCopy();
  const router = useRouter();
  const state = useMemo(() => parseMetaQuery(router.query), [router.query]);
  const library = useCardLibrary();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const cardReport = useQuery(cardReportQuery, { mode: state.mode, windowDays: state.windowDays });
  const board = useQuery(discoverDecksQuery, { mode: state.mode, windowDays: state.windowDays, sort: "rating", limit: 100 });

  const change = useCallback((patch: Partial<MetaState>, options?: { toContent?: boolean }) => {
    const next = nextMetaState(state, patch);
    void router.replace({ pathname: "/meta", query: serializeMetaQuery(next) }, undefined, { scroll: false });
    if (!options?.toContent) return;
    // Only scroll when the reader is already below the top of the report, so
    // a view switch lands on the new content instead of mid-page.
    const content = document.getElementById(META_CONTENT_ID);
    if (content && content.getBoundingClientRect().top < 0) {
      content.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  }, [router, state]);

  const decksObserved = cardReport?.recentDecks;
  const age = board?.computedAt ? relativeAge(board.computedAt, now) : null;
  const ageText = age ? new Intl.RelativeTimeFormat(locale, { numeric: "auto" }).format(age.value, age.unit) : null;
  const byId = library.byId;
  const catalogReady = !library.isLoading;

  return (
    <>
      <ArenaRouteHero
        title={t("meta.title")}
        summary={copy.heroDek}
        actions={
          <ul className={styles.freshness} aria-live="polite">
            <li><strong>{decksObserved === undefined ? copy.heroSampleLoading : copy.decksObserved(count(decksObserved))}</strong></li>
            <li>{modeName(state.mode)}</li>
            <li>{copy.windowLabel(state.windowDays)}</li>
            {ageText ? <li>{copy.updated(ageText)}</li> : null}
          </ul>
        }
      />
      <div className={styles.page}>
        <MetaControlBar state={state} onChange={change} />
        <div id={META_CONTENT_ID} role="tabpanel" aria-labelledby={`meta-tab-${state.view}`} className={styles.content} tabIndex={-1}>
          {state.view === "overview" ? (
            <MetaOverview
              state={state}
              onChange={change}
              byId={byId}
              board={catalogReady ? board : undefined}
              cardReport={cardReport}
              decksObserved={decksObserved}
            />
          ) : null}
          {state.view === "decks" ? (
            <MetaDecksView state={state} onChange={change} byId={byId} cards={library.cards} cardReport={cardReport} />
          ) : null}
          {state.view === "cards" ? <MetaCardsView state={state} byId={byId} cardReport={cardReport} /> : null}
          {state.view === "archetypes" ? <MetaArchetypesView state={state} onChange={change} byId={byId} /> : null}
        </div>
        {/* Outside the view switch so every view shows it and tab changes do not re-request it. */}
        <AdSenseUnit
          clientId={import.meta.env.VITE_ADSENSE_CLIENT_ID}
          slotId={import.meta.env.VITE_ADSENSE_CLASH_HOME_SLOT}
          serveAds={import.meta.env.PROD}
          className="home-ad-unit"
        />
      </div>
    </>
  );
}
