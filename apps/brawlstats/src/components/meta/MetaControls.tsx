import { Check, Download, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { gameModeImageUrl } from "@/lib/artwork";
import { useI18n } from "@/lib/i18n";
import type { TrophyBucket } from "@/lib/meta";
import type { ModeVolume } from "@/lib/meta-board";
import type { MetaTrendWindow } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { MetaLookups } from "./shared";

const TROPHY_OPTIONS: Array<[TrophyBucket, string | null]> = [["all", null], ["0-499", "0–499"], ["500-999", "500–999"], ["1000+", "1000+"]];
const WINDOW_OPTIONS: MetaTrendWindow[] = ["7", "30", "90", "all"];

export function MetaControls({
  trophy,
  window: trendWindow,
  mode,
  modes,
  lookups,
  updating,
  canExport,
  onChange,
  onExport,
}: {
  trophy: TrophyBucket;
  window: MetaTrendWindow;
  mode?: number;
  modes: ModeVolume[];
  lookups: MetaLookups;
  updating: boolean;
  canExport: boolean;
  onChange: (patch: { trophy?: TrophyBucket; window?: MetaTrendWindow; mode?: number | undefined }) => void;
  onExport: () => void;
}) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const modeIds = modes.map((item) => item.modeId);
  if (mode !== undefined && !modeIds.includes(mode)) modeIds.unshift(mode);

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div role="group" aria-label={t("meta.filters")} className="meta-controls z-30 -mx-4 border-y border-border/70 bg-background/92 px-4 py-2.5 backdrop-blur md:sticky md:mx-0 md:rounded-xl md:border md:px-3">
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:overflow-x-auto meta-scroll">
        <Segmented
          label={t("meta.trophyRange")}
          value={trophy}
          options={TROPHY_OPTIONS.map(([value, range]) => ({ value, label: range ?? t("meta.all") }))}
          onSelect={(value) => onChange({ trophy: value })}
        />
        <Segmented
          label={t("meta.window")}
          value={trendWindow}
          options={WINDOW_OPTIONS.map((value) => ({ value, label: value === "all" ? t("meta.all") : t("meta.windowDays", { count: value }) }))}
          onSelect={(value) => onChange({ window: value })}
        />
        <span aria-hidden className="mx-1 hidden h-6 w-px shrink-0 bg-border md:block" />
        <div role="group" aria-label={t("meta.gameMode")} className="meta-scroll flex shrink-0 items-center gap-1.5 max-md:order-last max-md:-mx-4 max-md:w-[calc(100%+2rem)] max-md:overflow-x-auto max-md:px-4">
          <ModeChip active={mode === undefined} onClick={() => onChange({ mode: undefined })}>{t("meta.allModes")}</ModeChip>
          {modeIds.map((id) => {
            const info = lookups.modes.get(id);
            return (
              <ModeChip key={id} active={mode === id} color={info?.color} onClick={() => onChange({ mode: id })}>
                <img src={info?.imageUrl || gameModeImageUrl(id)} alt="" className="size-5 object-contain" />
                {info?.name || id}
              </ModeChip>
            );
          })}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1 pl-2">
          {updating ? <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label={t("common.loading")} /> : null}
          <IconAction label={copied ? t("meta.copied") : t("meta.copyLink")} onClick={() => void copyLink()}>
            {copied ? <Check className="text-accent" /> : <Link2 />}
          </IconAction>
          <IconAction label={t("meta.exportCsv")} onClick={onExport} disabled={!canExport}>
            <Download />
          </IconAction>
        </div>
      </div>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onSelect }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onSelect: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} title={label} className="flex shrink-0 rounded-lg bg-secondary p-0.5 shadow-[inset_0_-2px_0_rgba(0,0,0,0.25)]">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onSelect(option.value)}
          className={cn(
            "h-8 rounded-md px-2.5 text-[0.8125rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
            option.value === value && "bg-primary text-primary-foreground shadow-[0_2px_0_rgba(0,0,0,0.3)] hover:text-primary-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ModeChip({ active, color, onClick, children }: { active: boolean; color?: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      style={active && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 22%, transparent)` } : undefined}
      className={cn(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-[0.8125rem] font-semibold whitespace-nowrap text-muted-foreground transition-colors outline-none hover:border-foreground/30 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
        active && "border-primary bg-primary/15 text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function IconAction({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-lg border border-border bg-card text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 [&_svg]:size-4"
    >
      {children}
    </button>
  );
}
