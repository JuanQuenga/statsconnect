import { useRef, type KeyboardEvent } from "react";
import { META_MODES } from "@/lib/clash/battles";
import { META_VIEWS, META_WINDOWS, type MetaState } from "@/lib/metaReport";
import { useMetaCopy } from "./metaCopy";
import { cx } from "./shared";
import styles from "./meta.module.css";

export const META_CONTENT_ID = "meta-report-content";

/**
 * Sticky bar: view tabs, battle mode, and time window. On narrow screens the
 * whole bar scrolls sideways instead of wrapping into three rows.
 */
export function MetaControlBar({ state, onChange }: { state: MetaState; onChange: (patch: Partial<MetaState>, options?: { toContent?: boolean }) => void }) {
  const { copy } = useMetaCopy();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const keys: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
    let next: number | undefined;
    if (event.key in keys) next = (index + keys[event.key] + META_VIEWS.length) % META_VIEWS.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = META_VIEWS.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    tabRefs.current[next]?.focus();
    onChange({ view: META_VIEWS[next] }, { toContent: true });
  }

  return (
    <div className={styles.controlBar} role="region" aria-label={copy.controlsLabel}>
      <div className={styles.controlScroller}>
        <div className={cx(styles.viewTabs, "cr-tabs")} role="tablist" aria-label={copy.viewGroup}>
          {META_VIEWS.map((view, index) => {
            const selected = state.view === view;
            return (
              <button
                key={view}
                ref={(element) => { tabRefs.current[index] = element; }}
                type="button"
                role="tab"
                id={`meta-tab-${view}`}
                aria-selected={selected}
                aria-controls={META_CONTENT_ID}
                tabIndex={selected ? 0 : -1}
                className={cx(styles.viewTab, selected && styles.viewTabOn)}
                onClick={() => onChange({ view }, { toContent: true })}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                {copy.views[view]}
              </button>
            );
          })}
        </div>

        <span className={styles.controlDivider} aria-hidden="true" />

        <div className={cx(styles.segment, "cr-tabs")} role="group" aria-label={copy.modeGroup}>
          {META_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={state.mode === mode}
              className={cx(styles.segmentButton, state.mode === mode && styles.segmentOn)}
              onClick={() => onChange({ mode })}
            >
              {copy.modes[mode]}
            </button>
          ))}
        </div>

        <div className={cx(styles.segment, styles.windowSegment, "cr-tabs")} role="group" aria-label={copy.windowGroup}>
          {META_WINDOWS.map((windowDays) => (
            <button
              key={windowDays}
              type="button"
              aria-pressed={state.windowDays === windowDays}
              className={cx(styles.segmentButton, state.windowDays === windowDays && styles.segmentOn)}
              onClick={() => onChange({ windowDays })}
            >
              {copy.windowShort(windowDays)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
