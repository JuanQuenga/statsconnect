import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Direction = "up" | "down" | "left" | "right";

const directions: Readonly<Record<string, Direction>> = {
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

type Point = { x: number; y: number };

function centerOf(element: HTMLElement): Point {
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

/**
 * Cheap spatial scoring: the candidate must sit in the pressed direction, and
 * we prefer the closest one, penalising cross-axis drift so a D-pad press
 * stays in its row or column.
 */
function score(from: Point, to: Point, direction: Direction): number | null {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const along =
    direction === "right" ? dx : direction === "left" ? -dx : direction === "down" ? dy : -dy;
  if (along < 6) return null;
  const across = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
  return along + across * 2.5;
}

/**
 * Wraps a lobby row or grid so arrow keys move between tiles the way a
 * console D-pad would, instead of following tab order.
 */
export function TileNav({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const direction = directions[event.key];
    if (!direction || event.altKey || event.ctrlKey || event.metaKey) return;
    const container = ref.current;
    const active = document.activeElement;
    if (!container || !(active instanceof HTMLElement)) return;

    const tiles = Array.from(container.querySelectorAll<HTMLElement>("[data-tile]"));
    const current = tiles.find((tile) => tile === active || tile.contains(active));
    if (!current) return;

    const origin = centerOf(current);
    let best: { tile: HTMLElement; value: number } | null = null;
    for (const tile of tiles) {
      if (tile === current) continue;
      const value = score(origin, centerOf(tile), direction);
      if (value === null) continue;
      if (!best || value < best.value) best = { tile, value };
    }
    if (!best) return;

    event.preventDefault();
    best.tile.focus();
    best.tile.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return (
    <div ref={ref} onKeyDown={handleKeyDown} className={cn(className)}>
      {children}
    </div>
  );
}
