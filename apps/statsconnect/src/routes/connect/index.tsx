import { createFileRoute } from "@tanstack/react-router";
import { GameChannelTile } from "@/components/lobby/GameChannelTile";
import { TileNav } from "@/components/lobby/TileNav";
import { games } from "@/lib/contracts";

export const Route = createFileRoute("/connect/")({
  component: ConnectPage,
  head: () => ({ meta: [{ title: "Connect a game · StatsConnect" }] }),
});

function ConnectPage() {
  return (
    <section className="boot-in mx-auto max-w-4xl">
      <p className="eyebrow text-[var(--ambient)]">Connect</p>
      <h1 className="mt-4 font-display text-4xl font-semibold tracking-tight sm:text-5xl">
        Choose a game
      </h1>
      <p className="mt-4 max-w-xl text-muted-foreground">
        Add one player profile per game. You can replace or remove it later.
      </p>
      <TileNav className="stagger mt-10 grid gap-5 md:grid-cols-2">
        {games.map((game) => (
          <GameChannelTile
            key={game.id}
            id={game.id}
            name={game.name}
            description={game.description}
          />
        ))}
      </TileNav>
    </section>
  );
}
