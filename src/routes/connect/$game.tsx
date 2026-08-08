import { Link, createFileRoute } from "@tanstack/react-router";
import { ConnectTagForm } from "@/components/connect-tag-form";
import { gameName, isGameId } from "@/lib/contracts";

export const Route = createFileRoute("/connect/$game")({ component: ConnectGamePage, head: ({ params }) => ({ meta: [{ title: `${isGameId(params.game) ? gameName(params.game) : "Connect"} · StatsConnect` }] }) });

function ConnectGamePage() {
  const { game } = Route.useParams();
  if (!isGameId(game)) return <section><p className="eyebrow">Unknown game</p><h1 className="mt-3 font-display text-3xl font-semibold">This game is not available</h1><Link to="/connect" className="mt-6 inline-block text-primary">Choose a supported game</Link></section>;
  return <section className="slide-up mx-auto max-w-xl"><p className="eyebrow">Connect {gameName(game)}</p><h1 className="mt-3 font-display text-3xl font-semibold sm:text-4xl">Find your profile</h1><p className="mt-3 text-muted-foreground">We’ll verify the tag first, then let you confirm the profile before saving it.</p><div className="mt-8"><ConnectTagForm key={game} game={game} /></div></section>;
}
