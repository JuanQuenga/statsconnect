import Link from "@/components/Link";
import { useRouter } from "@/lib/router";
import { Clock, Search, X } from "lucide-react";
import { FormEvent, KeyboardEvent, useEffect, useId, useMemo, useRef, useState } from "react";
import { useQuery } from "convex/react";
import type { SiteSearchProps } from "@statsconnect/site-nav";
import styles from "./ProfileSearch.module.css";
import { normalizeTag } from "@/lib/clash/tag";
import type { RecentProfile } from "@/lib/recentProfiles";
import { useI18n } from "@/lib/i18n";
import { isConvexConfigured, searchPlayersQuery } from "@/lib/convex";
import type { DirectoryHit } from "@/lib/clash/types";
import { usePersonalization } from "@/components/personalization/PersonalizationProvider";
import { Button } from "@/components/ui/button";
import { profileSearchDestination } from "@/lib/profileSearchRouting";

/**
 * Profile lookup by name or by tag.
 *
 * The Clash Royale API only resolves exact tags, so names are answered from the
 * directory the pipeline assembles (see `convex/players.ts`). A name that is
 * not in the directory yet still fails, which is why the tag lane never goes
 * away — it is the fallback that always works, and using it once is what puts
 * the player in the directory and in this browser's recents.
 */

type SearchKind = "players" | "clans";

function SearchControl({ compact, value, onValueChange, onSubmit, label, placeholder, submitLabel, submitIcon, contextLabel, contextOptions = [], contextValue, onContextChange, inputProps }: SiteSearchProps<SearchKind>) {
  return (
    <form className={`${styles.control} ${compact ? styles.compact : ""}`} onSubmit={onSubmit} role="search">
      <select aria-label={contextLabel} value={contextValue} onChange={(event) => {
        const option = contextOptions.find(({ value: optionValue }) => optionValue === event.target.value);
        if (option) onContextChange?.(option.value);
      }}>
        {contextOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <input {...inputProps} type="search" aria-label={label} value={value} placeholder={placeholder} onChange={(event) => onValueChange(event.target.value)} />
      <button type="submit" aria-label={submitLabel}><span aria-hidden="true">{submitIcon}</span></button>
    </form>
  );
}

/** Long enough that a stray keystroke does not fire a query, short enough to feel live. */
const DEBOUNCE_MS = 180;
const MIN_QUERY_LENGTH = 2;

export function ProfileSearch({ compact = false, onNavigate }: { compact?: boolean; onNavigate?: () => void }) {
  // The suggestion list needs Convex, which is only mounted when it is
  // configured. Splitting here keeps the hook order stable in both branches.
  return isConvexConfigured
    ? <DirectorySearch compact={compact} onNavigate={onNavigate} />
    : <TagOnlySearch compact={compact} onNavigate={onNavigate} />;
}

function useDebounced(value: string, delay: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

// --- Rows -----------------------------------------------------------------

type Row =
  | { key: string; href: string; label: string; sub: string; hint: string; icon?: "recent" }
  | { key: string; href: string; label: string; sub: string; hint: string; icon?: undefined };

function playerRow(hit: DirectoryHit, formatNumber: (value: number) => string): Row {
  const parts = [`#${hit.tag}`];
  if (hit.clanName) parts.push(hit.clanName);
  return {
    key: `player:${hit.tag}`,
    href: `/players/${hit.tag}`,
    label: hit.name,
    sub: parts.join(" · "),
    hint: hit.trophies ? `${formatNumber(hit.trophies)} 🏆` : ""
  };
}

function recentRow(recent: RecentProfile): Row {
  return {
    key: `recent:${recent.kind}:${recent.tag}`,
    href: `/${recent.kind}/${recent.tag}`,
    label: recent.name,
    sub: `#${recent.tag}`,
    hint: recent.kind === "clans" ? "Clan" : "Player",
    icon: "recent"
  };
}

// --- Full search ----------------------------------------------------------

function DirectorySearch({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { formatNumber, t } = useI18n();
  const id = useId();
  const suggestionsId = `${id}-suggestions`;
  const router = useRouter();
  const [kind, setKind] = useState<SearchKind>("players");
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const personalization = usePersonalization();
  const recents = personalization.recents;
  const wrapRef = useRef<HTMLDivElement>(null);

  const trimmed = term.trim();
  const debounced = useDebounced(trimmed, DEBOUNCE_MS);

  // Clan names are searchable through the official API, so those queries go to
  // the clan search page rather than through the local directory.
  const results = useQuery(
    searchPlayersQuery,
    kind === "players" && debounced.length >= MIN_QUERY_LENGTH ? { query: debounced, limit: 8 } : "skip"
  );

  const rows = useMemo<Row[]>(() => {
    if (!trimmed) return recents.map(recentRow);
    if (kind === "clans") {
      return [
        { key: "clan-search", href: `/clans/search?name=${encodeURIComponent(trimmed)}`, label: `${t("search.clans")}: “${trimmed}”`, sub: t("search.officialClan"), hint: "" }
      ];
    }

    const list: Row[] = [];
    // A tag is unambiguous, so when the input could be one it leads — even if
    // the directory also has name matches for the same string.
    if (results?.tag) {
      list.push({ key: `tag:${results.tag}`, href: `/players/${results.tag}`, label: `#${results.tag}`, sub: t("search.openPlayerTag"), hint: t("search.tag") });
    }
    for (const hit of results?.players ?? []) {
      if (results?.tag === hit.tag) continue;
      list.push(playerRow(hit, formatNumber));
    }
    return list;
  }, [trimmed, kind, recents, results, formatNumber, t]);

  useEffect(() => setHighlight(-1), [rows.length, trimmed]);

  // A click anywhere else should dismiss the list without stealing the input.
  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (event.target instanceof Node && !wrapRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function go(href: string) {
    setOpen(false);
    onNavigate?.();
    void router.push(href);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmed) return;

    go(profileSearchDestination({ term: trimmed, kind, open, highlight, rows, results }));
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      setOpen(false);
      setHighlight(-1);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!rows.length) return;
      event.preventDefault();
      setOpen(true);
      setHighlight((current) => {
        const next = event.key === "ArrowDown" ? current + 1 : current - 1;
        if (next < 0) return rows.length - 1;
        if (next >= rows.length) return 0;
        return next;
      });
    }
  }

  const searching = kind === "players" && trimmed.length >= MIN_QUERY_LENGTH && results === undefined;
  const noMatches = kind === "players" && Boolean(trimmed) && !searching && !rows.length;
  const contextOptions = [
    { value: "players", label: t("search.players") },
    { value: "clans", label: t("search.clans") },
  ] as const;

  return (
    <div className={compact ? "search-wrap search-wrap-compact" : "search-wrap"} ref={wrapRef}>
      <SearchControl
        compact={compact}
        value={term}
        onValueChange={(value) => {
          setTerm(value);
          setOpen(true);
        }}
        onSubmit={submit}
        label={kind === "players" ? "Player name or tag" : "Clan name or tag"}
        placeholder={kind === "players" ? t("search.playerPlaceholder") : t("search.clanPlaceholder")}
        submitLabel={`Search ${kind}`}
        submitIcon={<Search size={compact ? 20 : 22} />}
        contextLabel={t("search.profileType")}
        contextOptions={contextOptions}
        contextValue={kind}
        onContextChange={(value) => {
          setKind(value);
          setHighlight(-1);
        }}
        inputProps={{
          autoComplete: "off",
          role: "combobox",
          "aria-expanded": open && rows.length > 0,
          "aria-controls": suggestionsId,
          "aria-autocomplete": "list",
          "aria-activedescendant": open && highlight >= 0 && rows[highlight] ? `${suggestionsId}-${highlight}` : undefined,
          onFocus: () => setOpen(true),
          onKeyDown,
        }}
      />

      {open && (rows.length > 0 || searching || noMatches) ? (
        <div className="search-suggestions" id={suggestionsId} role="listbox">
          {!trimmed && recents.length ? (
            <div className="search-suggestions-head">
              <span>{t("search.recent")}</span>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => {
                  personalization.clearRecents();
                }}
              >
                <X size={13} />
                {t("search.clear")}
              </Button>
            </div>
          ) : null}

          {rows.map((row, index) => (
            <Link
              key={row.key}
              id={`${suggestionsId}-${index}`}
              href={row.href}
              role="option"
              aria-selected={index === highlight}
              className={index === highlight ? "search-option search-option-on" : "search-option"}
              onMouseEnter={() => setHighlight(index)}
              onClick={() => {
                setOpen(false);
                onNavigate?.();
              }}
            >
              {row.icon === "recent" ? <Clock size={14} /> : null}
              <span>
                <strong>{row.label}</strong>
                <small>{row.sub}</small>
              </span>
              {row.hint ? <i>{row.hint}</i> : null}
            </Link>
          ))}

          {searching ? <p className="search-note" role="status">{t("search.searching")}</p> : null}
          {noMatches ? (
            <p className="search-note">
              {t("search.noPlayer")}
            </p>
          ) : null}
        </div>
      ) : null}

    </div>
  );
}

// --- Fallback -------------------------------------------------------------

/** No Convex, no directory — the tag lane still works entirely client-side. */
function TagOnlySearch({ compact, onNavigate }: { compact: boolean; onNavigate?: () => void }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [kind, setKind] = useState<SearchKind>("players");
  const [tag, setTag] = useState("");
  const [error, setError] = useState("");
  const errorId = useId();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const normalized = normalizeTag(tag);
      setError("");
      onNavigate?.();
      void router.push(`/${kind}/${normalized}`);
    } catch (caught) {
      setError(locale === "es" ? "Introduce una etiqueta válida de Clash Royale, por ejemplo #2PP o #P0LYQ." : (caught instanceof Error ? caught.message : "Enter a valid Clash Royale tag."));
    }
  }

  return (
    <div className={compact ? "search-wrap search-wrap-compact" : "search-wrap"}>
      <SearchControl
        compact={compact}
        value={tag}
        onValueChange={setTag}
        onSubmit={submit}
        label={`${kind === "players" ? "Player" : "Clan"} tag`}
        placeholder="#PLAYER_TAG"
        submitLabel={`Search ${kind}`}
        submitIcon={<Search size={compact ? 20 : 22} />}
        contextLabel={t("search.profileType")}
        contextOptions={[
          { value: "players", label: t("search.players") },
          { value: "clans", label: t("search.clans") },
        ]}
        contextValue={kind}
        onContextChange={setKind}
        inputProps={{ "aria-invalid": Boolean(error), "aria-describedby": error ? errorId : undefined }}
      />
      {error ? (
        <p id={errorId} className="search-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
