import { useMemo, useState } from "react";
import { CartesianGrid, ReferenceArea, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, type ScatterShapeProps } from "recharts";
import Link from "@/components/Link";
import { GameCardArt } from "@/components/portfolio/GameCardArt";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import type { TierRow } from "@/lib/analytics";
import { vendoredCardImage } from "@/lib/clash/assets";
import { buildMetaMap, QUADRANTS, type Quadrant } from "@/lib/metaReport";
import { useRouter } from "@/lib/router";
import { useMetaCopy } from "./metaCopy";
import { cardFor, cardHref, cx, rateTone, type CardIndex } from "./shared";
import styles from "./meta.module.css";

const chartConfig = { usage: { label: "Usage", color: "#07569f" } } satisfies ChartConfig;
const QUADRANT_FILL: Record<Quadrant, string> = {
  staple: "rgba(20, 122, 70, .07)",
  gem: "rgba(7, 86, 159, .06)",
  overplayed: "rgba(217, 130, 43, .08)",
  struggling: "rgba(176, 58, 74, .06)"
};

function assetUrl(path: string) {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}

/**
 * Usage (x) against win rate (y) for every tier-eligible card. Points are the
 * vendored card portraits (or dots); the four quadrant lists underneath are
 * the keyboard and screen-reader route to the same information.
 */
export function MetaMap({ tiers, byId }: { tiers: readonly TierRow[]; byId: CardIndex }) {
  const { copy, pct, count } = useMetaCopy();
  const router = useRouter();
  const [style, setStyle] = useState<"art" | "dots">("art");
  const map = useMemo(() => buildMetaMap(tiers.map((row) => ({ ...row, name: cardFor(row.cardId, byId).name }))), [tiers, byId]);
  const [xMax, [yMin, yMax]] = [map.usageMax, map.winDomain];
  const threshold = map.usageThreshold;

  function renderPoint(props: ScatterShapeProps) {
    const point = map.points[props.index];
    if (!point || props.cx === undefined || props.cy === undefined) return <g />;
    const onClick = () => void router.push(cardHref(point.cardId, byId));
    if (style === "dots") {
      return <circle cx={props.cx} cy={props.cy} r={5.5} className={styles.mapDot} onClick={onClick} />;
    }
    const width = 26;
    const height = 31;
    return (
      <g className={styles.mapArt} onClick={onClick}>
        <circle cx={props.cx} cy={props.cy} r={4} className={styles.mapDot} />
        <image href={assetUrl(vendoredCardImage(point.name))} x={props.cx - width / 2} y={props.cy - height / 2} width={width} height={height} />
      </g>
    );
  }

  const areas: Array<{ quadrant: Quadrant; x1: number; x2: number; y1: number; y2: number; position: "insideTopRight" | "insideTopLeft" | "insideBottomRight" | "insideBottomLeft" }> = [
    { quadrant: "staple", x1: threshold, x2: xMax, y1: 0.5, y2: yMax, position: "insideTopRight" },
    { quadrant: "gem", x1: 0, x2: threshold, y1: 0.5, y2: yMax, position: "insideTopLeft" },
    { quadrant: "overplayed", x1: threshold, x2: xMax, y1: yMin, y2: 0.5, position: "insideBottomRight" },
    { quadrant: "struggling", x1: 0, x2: threshold, y1: yMin, y2: 0.5, position: "insideBottomLeft" }
  ];

  return (
    <div className={styles.metaMap}>
      <div className={styles.mapToolbar}>
        <p className={styles.sheetDek}>{copy.mapDek} {copy.mapHint}</p>
        <div className={styles.segment} role="group" aria-label={copy.mapDisplay}>
          {(["art", "dots"] as const).map((item) => (
            <button key={item} type="button" aria-pressed={style === item} className={cx(styles.segmentButton, style === item && styles.segmentOn)} onClick={() => setStyle(item)}>
              {item === "art" ? copy.mapArt : copy.mapDots}
            </button>
          ))}
        </div>
      </div>

      <ChartContainer config={chartConfig} className={styles.mapCanvas} aria-label={`${copy.mapTitle}: ${copy.mapX} / ${copy.mapY}`}>
        <ScatterChart margin={{ top: 16, right: 18, bottom: 26, left: 6 }}>
          {areas.map((area) => (
            <ReferenceArea
              key={area.quadrant}
              x1={area.x1}
              x2={area.x2}
              y1={area.y1}
              y2={area.y2}
              fill={QUADRANT_FILL[area.quadrant]}
              stroke="none"
              ifOverflow="hidden"
              label={{ value: copy.quadrants[area.quadrant], position: area.position, className: styles.quadrantLabel }}
            />
          ))}
          <CartesianGrid strokeDasharray="3 7" />
          <XAxis
            type="number"
            dataKey="usageRate"
            domain={[0, xMax]}
            tickFormatter={(value: number) => pct(value, 0)}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            label={{ value: copy.mapX, position: "insideBottom", offset: -16, className: styles.axisLabel }}
          />
          <YAxis
            type="number"
            dataKey="winRate"
            domain={[yMin, yMax]}
            tickFormatter={(value: number) => pct(value, 0)}
            tickLine={false}
            axisLine={false}
            width={48}
            label={{ value: copy.mapY, angle: -90, position: "insideLeft", offset: 10, className: styles.axisLabel }}
          />
          <ReferenceLine y={0.5} stroke="#17324f" strokeOpacity={0.45} strokeDasharray="5 5" />
          <ReferenceLine x={threshold} stroke="#17324f" strokeOpacity={0.3} strokeDasharray="2 6" />
          <Tooltip
            cursor={false}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const datum = payload?.[0]?.payload as (typeof map.points)[number] | undefined;
              if (!active || !datum) return null;
              return (
                <div className={styles.mapTooltip}>
                  <GameCardArt card={cardFor(datum.cardId, byId)} size="mini" showLevel={false} />
                  <span>
                    <strong>{datum.name}</strong>
                    <small>{copy.quadrants[datum.quadrant]} · {datum.tier}</small>
                    <span className={styles.mapTooltipStats}>
                      <b className={rateTone(datum.winRate)}>{pct(datum.winRate)}</b> {copy.winRate.toLowerCase()}
                      <br />
                      <b>{pct(datum.usageRate)}</b> {copy.usage.toLowerCase()} · {copy.cardTooltipGames(count(datum.uses))}
                    </span>
                  </span>
                </div>
              );
            }}
          />
          <Scatter data={map.points} shape={renderPoint} isAnimationActive={false} />
        </ScatterChart>
      </ChartContainer>
      <p className={styles.mutedLine}>{copy.mapNote(pct(threshold, 1))}</p>

      <div className={styles.quadrantLists}>
        {QUADRANTS.map((quadrant) => {
          const rows = map.groups[quadrant];
          return (
            <section key={quadrant} className={styles.quadrantList} data-quadrant={quadrant} aria-label={copy.quadrants[quadrant]}>
              <h3>{copy.quadrants[quadrant]} <span>{rows.length}</span></h3>
              <p>{copy.quadrantHelp[quadrant]}</p>
              {rows.length ? (
                <ul>
                  {rows.slice(0, 6).map((row) => (
                    <li key={row.cardId}>
                      <Link href={cardHref(row.cardId, byId)}>
                        {row.name}
                        <small>{pct(row.winRate)} · {pct(row.usageRate)}</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className={styles.mutedLine}>{copy.quadrantEmpty}</p>}
            </section>
          );
        })}
      </div>
    </div>
  );
}
