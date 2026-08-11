import Image from "@/components/Image";
import type { Card } from "@/lib/mock-data";

export function CardGrid({ cards }: { cards: Card[] }) {
  return (
    <div className="card-grid">
      {cards.map((card) => (
        <div key={card.name} className="compact-panel overflow-hidden p-2 text-center">
          <Image src={card.image} alt={card.name} width={92} height={112} className="mx-auto h-24 w-auto object-contain" />
          <div className="mt-1 truncate text-xs font-bold">{card.name}</div>
          <div className="text-xs muted">{card.elixir} elixir</div>
        </div>
      ))}
    </div>
  );
}
