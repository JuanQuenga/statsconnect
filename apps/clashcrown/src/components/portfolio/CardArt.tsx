import Image from "@/components/Image";
import { useEffect, useState } from "react";
import { UNKNOWN_CARD_IMAGE } from "@/lib/clash/assets";

/**
 * Card art that degrades to a placeholder.
 *
 * Icon URLs come from Supercell's own CDN, which occasionally 404s for a newly
 * released card — Ronin, at the time of writing, resolves to a dead URL and has
 * no vendored copy either. Without a fallback the browser renders the alt text,
 * so a card name appeared as loose words floating in the middle of the grid.
 */
export function CardArt({
  src,
  alt,
  width,
  height,
  priority = false,
  fallback = UNKNOWN_CARD_IMAGE
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  /** Clan badges and player icons have their own placeholder. */
  fallback?: string | readonly string[];
}) {
  const [source, setSource] = useState(src);
  const fallbackSources = typeof fallback === "string" ? [fallback] : fallback;
  const sources = [src, ...fallbackSources].filter(
    (candidate, index, candidates) => candidates.indexOf(candidate) === index
  );

  // The same tile is reused as the grid re-sorts, so a new src has to reset a
  // fallback left over from the previous card.
  useEffect(() => setSource(src), [src]);

  return (
    <Image
      src={source}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      data-fallback={source === src ? undefined : "true"}
      onError={() => {
        const next = sources[sources.indexOf(source) + 1];
        if (next) setSource(next);
      }}
    />
  );
}
