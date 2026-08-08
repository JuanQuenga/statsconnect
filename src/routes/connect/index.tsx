import { Link, createFileRoute } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { games } from "@/lib/contracts";

export const Route = createFileRoute("/connect/")({ component: ConnectPage, head: () => ({ meta: [{ title: "Connect a game · StatsConnect" }] }) });

function ConnectPage() {
  return <section className="slide-up mx-auto max-w-3xl"><p className="eyebrow">Connect</p><h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Choose a game</h1><p className="mt-3 text-muted-foreground">Add one player profile per game. You can replace or remove it later.</p><div className="mt-8 grid gap-3 sm:grid-cols-2">{games.map((game) => <Link key={game.id} to="/connect/$game" params={{ game: game.id }} className="group surface-card flex items-center gap-4 p-5 no-underline hover:bg-card/65"><div className="min-w-0 flex-1"><h2 className="font-display text-xl font-semibold">{game.name}</h2><p className="mt-1 text-sm leading-relaxed text-muted-foreground">{game.description}</p></div><ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" /></Link>)}</div></section>;
}
