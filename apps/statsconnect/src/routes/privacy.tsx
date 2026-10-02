import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/privacy")({
  component: PrivacyPage,
  head: () => ({ meta: [{ title: "Privacy · StatsConnect" }] }),
});

function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl space-y-9 text-sm leading-7 text-muted-foreground sm:text-base">
      <header className="space-y-3 border-b border-border pb-8">
        <p className="eyebrow text-[var(--ambient)]">StatsConnect</p>
        <h1 className="font-display text-4xl font-semibold text-foreground sm:text-5xl">Privacy</h1>
        <p>Last updated October 1, 2026.</p>
      </header>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Game statistics</h2>
        <p>StatsConnect retrieves publicly available Brawl Stars and Clash Royale player, club, clan, ranking, and battle information. Searches, profile visits, rankings, and saved profiles may cause us to collect and refresh that information. Public game statistics and history may be shown to other visitors, including people who do not sign in.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Accounts and site use</h2>
        <p>When you sign in with Google, our authentication provider may receive your name, email address, and profile image. We store the game tags you connect to your account and the information needed to refresh them. The site uses browser storage for preferences, recent profiles, and notification settings. Authentication uses cookies or similar session storage.</p>
        <p>We use this information to provide statistics, remember your settings, refresh connected profiles, prevent misuse, and diagnose errors. Vercel Analytics may collect limited usage information so we can understand site performance.</p>
        <p>To limit occasional feedback and support requests, we keep a count of useful sessions, request timestamps, and your dismissal preference in browser storage. These values stay in your browser and are not sent to a server. Each site has its own storage. You can choose "Don't ask again" on a request; clearing site storage resets that choice.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Analytics and error monitoring</h2>
        <p>When configured, PostHog measures page visits and player-connection steps using an anonymous browser identifier. Sentry receives technical error reports to help us fix failures. We do not intentionally send account emails, player names, player tags, or URL query parameters to these services. Automatic form capture and session recordings are disabled.</p>
        <p>PostHog uses browser storage to recognize repeat visits. These integrations respect your browser’s Do Not Track preference. Their services may receive your IP address and browser information when a report is sent.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Ads and outside services</h2>
        <p>If advertising is enabled, Google AdSense may use cookies, device information, and other data to serve and measure ads. Google explains its practices and ad choices in its <a className="text-foreground underline" href="https://policies.google.com/technologies/ads" target="_blank" rel="noreferrer noopener">advertising information</a>. Where an ad consent message is shown, you can use it to manage the choices it offers.</p>
        <p>StatsConnect uses Convex and Vercel to run and host the service. Game artwork and metadata may load from Supercell, BrawlAPI, or Brawlify, and fonts may load from Google. Requests to those services can disclose your IP address and browser information to them under their own policies.</p>
        <p>Feedback links open your email app with a draft you can review and send. We do not automatically include account details, game tags, browsing history, or technical logs. If you choose an optional support link, it opens the configured payment provider's hosted checkout, where that provider handles payment information under its own policies. Contributions do not change your access to StatsConnect.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-foreground">Retention and your choices</h2>
        <p>Game history is retained under game-specific limits and may continue to exist after you disconnect a tag because public statistics are collected separately from your account. You can remove a connected profile in account settings. To ask about your account data or request deletion, contact us at <a className="text-foreground underline" href="mailto:harmiox@gmail.com">harmiox@gmail.com</a>. Removing data from StatsConnect does not remove it from a game or another data provider.</p>
      </section>
    </article>
  );
}
