import { FormEvent, useState } from "react";
import { Check, Clipboard, ExternalLink, Link2, Search, Tag } from "lucide-react";
import Head from "@/components/Head";
import Link from "@/components/Link";
import { ArenaRouteHero } from "@/components/portfolio/ArenaRouteHero";
import { Layout } from "@/components/portfolio/Layout";
import { normalizeTag } from "@/lib/clash/tag";
import { useI18n } from "@/lib/i18n";

type ParsedDeckLink = { url: string; cardIds: number[] };

function parseDeckLink(input: string): ParsedDeckLink | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "link.clashroyale.com") return null;

  const match = trimmed.match(/[?&]deck=([0-9;]+)/i);
  if (!match?.[1]) return null;
  const cardIds = match[1].split(";").map(Number);
  if (cardIds.length !== 8 || cardIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) return null;
  return { url: trimmed, cardIds };
}

export default function ToolsPage() {
  const { locale, t } = useI18n();
  return (
    <Layout>
      <Head>
        <title>{t("tools.title")} | StatsConnect · Clash Royale statistics</title>
        <meta name="description" content={t("tools.description")} />
        <meta property="og:title" content={`${t("tools.title")} | StatsConnect · Clash Royale statistics`} />
        <meta property="og:description" content={t("tools.description")} />
        <link rel="canonical" href="/tools" />
      </Head>
      <div className="editorial-page tools-page">
        <ArenaRouteHero title={t("tools.title")} summary={t("tools.description")} />

        <section className="tool-grid">
          <TagCleaner />
          <DeckLinkParser />
        </section>

        <section className="tool-explainer">
          <div>
            <span className="tool-icon"><Clipboard size={21} /></span>
            <h2>{t("tools.chests")}</h2>
            <p>{t("tools.chestCopy")}</p>
          </div>
          <ol>
            <li><strong>1</strong><span>{locale === "es" ? "Busca un jugador por etiqueta; los nombres por sí solos no identifican un perfil oficial." : "Look up a player by tag; names alone do not identify an official profile."}</span></li>
            <li><strong>2</strong><span>{locale === "es" ? "La posición +0 es el próximo cofre. +N cuenta cuántos cofres se abren antes." : "Position +0 is the next chest. +N counts how many chests are opened before it."}</span></li>
            <li><strong>3</strong><span>{locale === "es" ? "La lista es una instantánea de la API. Actualiza el perfil después de abrir cofres para mover la cola." : "The list is an API snapshot. Refresh the profile after opening chests to move the queue."}</span></li>
          </ol>
          <Link href="/players" className="pink-button"><Search size={15} /> {t("tools.openPlayer")}</Link>
        </section>

        <section className="utility-links">
          <Link href="/decks"><span>8</span><strong>{t("nav.decks")}</strong><small>{locale === "es" ? "Coste medio, ciclo de cuatro cartas y enlace oficial." : "Average cost, four-card cycle, and official deck link."}</small></Link>
          <Link href="/players/compare"><span>↔</span><strong>{locale === "es" ? "Comparar jugadores" : "Compare players"}</strong><small>{locale === "es" ? "Compara dos perfiles oficiales lado a lado." : "Compare two official profiles side by side."}</small></Link>
          <Link href="/players"><span>↑</span><strong>{t("player.upgradePlanner")}</strong><small>{locale === "es" ? "Abre un jugador y planifica mejoras con su colección real." : "Open a player and plan upgrades from the real collection."}</small></Link>
        </section>
      </div>
    </Layout>
  );
}

function TagCleaner() {
  const { locale, t } = useI18n();
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const cleaned = normalizeTag(input.toUpperCase().replaceAll("O", "0"));
      setResult(cleaned);
      setError("");
      setCopied(false);
    } catch (caught) {
      setResult("");
      setError(caught instanceof Error ? caught.message : "Invalid tag");
    }
  }

  return (
    <section className="tool-card">
      <span className="tool-icon"><Tag size={21} /></span>
      <h2>{t("tools.tagCleaner")}</h2>
      <p>{t("tools.tagCopy")}</p>
      <form onSubmit={submit}>
        <label htmlFor="tag-cleaner">{locale === "es" ? "Etiqueta de Clash Royale" : "Clash Royale tag"}</label>
        <div><input id="tag-cleaner" value={input} onChange={(event) => setInput(event.target.value)} placeholder="#P0LYQ" autoComplete="off" /><button type="submit">{t("tools.clean")}</button></div>
      </form>
      {error ? <p className="tool-error" role="alert">{error}</p> : null}
      {result ? (
        <div className="tool-result" role="status">
          <code>#{result}</code>
          <button type="button" onClick={async () => {
            try {
              await navigator.clipboard.writeText(`#${result}`);
              setCopied(true);
            } catch {
              setCopied(false);
              setError(locale === "es" ? "El navegador bloqueó el portapapeles." : "The browser blocked clipboard access.");
            }
          }} aria-label={t("tools.copy")}>
            {copied ? <Check size={16} /> : <Clipboard size={16} />}
          </button>
          <Link href={`/players/${result}`}>{t("tools.openPlayer")}</Link>
          <Link href={`/clans/${result}`}>{t("tools.openClan")}</Link>
        </div>
      ) : null}
    </section>
  );
}

function DeckLinkParser() {
  const { locale, t } = useI18n();
  const [input, setInput] = useState("");
  const [result, setResult] = useState<ParsedDeckLink | null>(null);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = parseDeckLink(input);
    setResult(parsed);
    setError(parsed ? "" : t("tools.invalidLink"));
  }

  return (
    <section className="tool-card">
      <span className="tool-icon"><Link2 size={21} /></span>
      <h2>{t("tools.linkParser")}</h2>
      <p>{t("tools.linkCopy")}</p>
      <form onSubmit={submit}>
        <label htmlFor="deck-link">{locale === "es" ? "Enlace oficial del mazo" : "Official deck link"}</label>
        <div><input id="deck-link" type="url" value={input} onChange={(event) => setInput(event.target.value)} placeholder="https://link.clashroyale.com/…" /><button type="submit">{t("tools.parse")}</button></div>
      </form>
      {error ? <p className="tool-error" role="alert">{error}</p> : null}
      {result ? (
        <div className="parsed-deck" role="status">
          <p><Check size={16} /> {locale === "es" ? "Dominio oficial y ocho identificadores de carta válidos." : "Official domain and eight valid card identifiers."}</p>
          <ol>{result.cardIds.map((id, index) => <li key={`${id}-${index}`}><span>{index + 1}</span><code>{id}</code></li>)}</ol>
          <a className="pink-button" href={result.url} target="_blank" rel="noopener noreferrer">{t("common.open")} <ExternalLink size={14} /></a>
        </div>
      ) : null}
    </section>
  );
}
