import Image from "@/components/Image";
import type { Card } from "@/lib/mock-data";
import { Card as CardSurface, CardContent } from "@/components/ui/card";

export function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="card-grid">
      {cards.map((card) => (
        <CardSurface key={card.name} size="sm" className="compact-panel text-center">
          <CardContent className="px-2">
            <Image src={card.image} alt={card.name} width={92} height={112} className="mx-auto h-24 w-auto object-contain" />
            <div className="mt-1 truncate font-display text-xs">{card.name}</div>
            <div className="text-xs text-muted-foreground">{card.elixir} elixir</div>
          </CardContent>
        </CardSurface>
      ))}
    </div>
  );
}
