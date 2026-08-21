import { Bell, Check, Cloud, Copy, Download, Link2, LogIn, ShieldCheck, Star, Trash2, UserRoundPlus, UsersRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import Link from "@/components/Link";
import { usePersonalization, type ProfileInput } from "./PersonalizationProvider";
import styles from "./Personalization.module.css";
import { useStatsConnectAuth, useStatsConnectProfileTracking } from "@statsconnect/auth";

export function PersonalDashboard() {
  const personalization = usePersonalization();
  const [pairCode, setPairCode] = useState("");
  const [pairExpiresAt, setPairExpiresAt] = useState<number | null>(null);
  const [pairInput, setPairInput] = useState("");
  const [pairMessage, setPairMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const defaultProfile = personalization.profiles.find((profile) => profile.kind === "players" && profile.isDefault);
  const players = personalization.profiles.filter((profile) => profile.kind === "players");
  const clans = personalization.profiles.filter((profile) => profile.kind === "clans");
  const alertsEnabled = Object.values(personalization.preferences).some(Boolean);

  async function createPairCode() {
    setBusy(true);
    setPairMessage("");
    try {
      const result = await personalization.createPairCode();
      setPairCode(result.code);
      setPairExpiresAt(result.expiresAt);
    } catch (error) {
      setPairMessage(error instanceof Error ? error.message : "Could not create a pairing code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitPair(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setPairMessage("");
    try {
      await personalization.pairWithCode(pairInput);
      setPairInput("");
      setPairMessage("Paired. Dashboard profiles from both browsers are being merged.");
    } catch (error) {
      setPairMessage(error instanceof Error ? error.message : "Could not pair this browser.");
    } finally {
      setBusy(false);
    }
  }

  async function setPreference(key: keyof typeof personalization.preferences, checked: boolean) {
    await personalization.updatePreferences({ ...personalization.preferences, [key]: checked }).catch(() => undefined);
  }

  async function clearEverything() {
    if (!window.confirm("Delete all dashboard profiles, recents, preferences, observations, and paired browser access? This cannot be undone.")) return;
    setBusy(true);
    await personalization.clearAll().catch(() => undefined);
    setBusy(false);
  }

  return (
    <section className={`page-band ${styles.dashboard}`} aria-labelledby="personal-dashboard-title">
      <header className={styles.dashboardHeader}>
        <div>
          <h2 id="personal-dashboard-title">Dashboard players and clans</h2>
          <p>Players, clans, alerts, and recent lookups saved to this browser—even when dashboard sync is offline.</p>
        </div>
        <SyncBadge status={personalization.status} />
      </header>

      {personalization.error ? <p className={styles.error} role="status">{personalization.error}</p> : null}

      {defaultProfile ? (
        <div className={styles.defaultCard}>
          <div className={styles.defaultIcon}><Star size={22} fill="currentColor" /></div>
          <div>
            <span>Default player</span>
            <strong>{defaultProfile.name}</strong>
            <small>#{defaultProfile.tag}{defaultProfile.clan ? ` · ${defaultProfile.clan}` : ""}</small>
          </div>
          <Link href={`/players/${defaultProfile.tag}`} className="pink-button">Open profile</Link>
        </div>
      ) : null}

      {!personalization.profiles.length ? (
        <div className={styles.empty}>
          <UserRoundPlus size={28} />
          <div>
            <strong>No dashboard profiles yet</strong>
            <p>Open a player or clan and choose “Save to dashboard.” Profiles will appear here; no live stats are shown until you open and refresh them.</p>
          </div>
          <Link href="/players" className="pink-button">Find a player</Link>
        </div>
      ) : (
        <div className={styles.profileColumns}>
          <SavedList title="Players" icon={<UserRoundPlus size={18} />} profiles={players} />
          <SavedList title="Clans" icon={<UsersRound size={18} />} profiles={clans} />
        </div>
      )}

      <details className={styles.settings}>
        <summary><ShieldCheck size={19} /> Personalization, alerts &amp; privacy</summary>
        <div className={styles.settingsGrid}>
          <section className={styles.settingCard}>
            <h3><Bell size={18} /> Browser alerts</h3>
            <p>Opt in by signal. Alerts are checked only when a dashboard profile is opened or refreshed while StatsConnect Clash Royale is running; there is no background observation.</p>
            <Preference checked={personalization.preferences.chestAlerts} label="Next chest changes" onChange={(checked) => setPreference("chestAlerts", checked)} />
            <Preference checked={personalization.preferences.progressionAlerts} label="Player trophy gains" onChange={(checked) => setPreference("progressionAlerts", checked)} />
            <Preference checked={personalization.preferences.warAlerts} label="Clan war trophy gains" onChange={(checked) => setPreference("warAlerts", checked)} />
            {alertsEnabled && personalization.notificationPermission !== "granted" ? (
              <button type="button" className={styles.secondaryButton} onClick={() => void personalization.requestNotifications()}>
                Enable browser delivery
              </button>
            ) : null}
            <small>
              Browser permission: {personalization.notificationPermission}. If delivery is blocked or unsupported, preferences still sync but no system notification is shown.
            </small>
          </section>

          <section className={styles.settingCard}>
            <h3><Link2 size={18} /> Pair another browser</h3>
            {personalization.status === "local" ? (
              <p>Local fallback is active because Convex is not configured. Dashboard saves and privacy controls still work on this browser, but pairing is unavailable.</p>
            ) : (
              <>
                <p>Create a one-time code here, then enter it on the other browser. Codes expire after 10 minutes and are consumed once.</p>
                <button type="button" className={styles.secondaryButton} disabled={busy} onClick={() => void createPairCode()}>
                  Create pairing code
                </button>
                {pairCode ? (
                  <div className={styles.pairCode}>
                    <code>{pairCode}</code>
                    <button type="button" aria-label="Copy pairing code" onClick={() => void navigator.clipboard.writeText(pairCode)}><Copy size={16} /></button>
                    <small>Expires {pairExpiresAt ? new Date(pairExpiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "soon"}</small>
                  </div>
                ) : null}
                <form className={styles.pairForm} onSubmit={submitPair}>
                  <label htmlFor="pair-code">Code from another browser</label>
                  <div><input id="pair-code" value={pairInput} onChange={(event) => setPairInput(event.target.value)} autoComplete="off" spellCheck={false} placeholder="XXXXXX-XXXXXX-…" /><button type="submit" disabled={busy || !pairInput.trim()}>Pair</button></div>
                </form>
                {pairMessage ? <p className={styles.pairMessage} role="status">{pairMessage}</p> : null}
                {personalization.devices.length ? <small>{personalization.devices.length} paired browser{personalization.devices.length === 1 ? "" : "s"} currently have access.</small> : null}
              </>
            )}
          </section>

          <section className={styles.settingCard}>
            <h3><ShieldCheck size={18} /> Your data</h3>
            <p>Export the readable personalization record or permanently clear the synced account and revoke every paired browser.</p>
            <div className={styles.privacyActions}>
              <button type="button" className={styles.secondaryButton} onClick={personalization.exportData}><Download size={16} /> Export JSON</button>
              <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void clearEverything()}><Trash2 size={16} /> Clear all data</button>
            </div>
            <small>Export excludes private device capabilities and pairing codes.</small>
          </section>
        </div>
      </details>
    </section>
  );
}

function SavedList({ title, icon, profiles }: { title: string; icon: ReactNode; profiles: ReturnType<typeof usePersonalization>["profiles"] }) {
  const personalization = usePersonalization();
  return (
    <section className={styles.savedList}>
      <h3>{icon}{title}<span>{profiles.length}</span></h3>
      {profiles.length ? profiles.map((profile) => (
        <article key={`${profile.kind}:${profile.tag}`}>
          <Link href={`/${profile.kind}/${profile.tag}`}><strong>{profile.name}</strong><small>#{profile.tag}{profile.clan ? ` · ${profile.clan}` : ""}</small></Link>
          <div>
            {profile.kind === "players" ? (
              <button type="button" className={profile.isDefault ? styles.selectedIconButton : styles.iconButton} aria-label={`${profile.isDefault ? "Remove" : "Make"} ${profile.name} ${profile.isDefault ? "as" : "the"} default player`} aria-pressed={profile.isDefault} onClick={() => void personalization.setDefault(profile.isDefault ? null : profile.tag)}>
                {profile.isDefault ? <Check size={15} /> : <Star size={15} />}
              </button>
            ) : null}
            <button type="button" className={styles.iconButton} aria-label={`Remove ${profile.name} from dashboard`} onClick={() => void personalization.untrack(profile.kind, profile.tag)}><Trash2 size={15} /></button>
          </div>
        </article>
      )) : <p className={styles.listEmpty}>No dashboard {title.toLowerCase()} yet.</p>}
    </section>
  );
}

function Preference({ checked, label, onChange }: { checked: boolean; label: string; onChange: (checked: boolean) => Promise<void> }) {
  return <label className={styles.preference}><input type="checkbox" checked={checked} onChange={(event) => void onChange(event.target.checked)} /><span>{label}</span></label>;
}

function SyncBadge({ status }: { status: ReturnType<typeof usePersonalization>["status"] }) {
  const labels = { local: "Local fallback", connecting: "Connecting sync…", synced: "Synced", error: "Local changes saved" } as const;
  return <span className={`${styles.syncBadge} ${styles[status]}`}><Cloud size={15} />{labels[status]}</span>;
}

export function DashboardSaveControls({ profile }: { profile: ProfileInput }) {
  const personalization = usePersonalization();
  const tracked = personalization.profiles.find((candidate) => key(candidate) === key(profile));
  return (
    <div className={styles.trackingControls} aria-label="Dashboard save controls">
      <button type="button" aria-pressed={Boolean(tracked)} onClick={() => void (tracked ? personalization.untrack(profile.kind, profile.tag) : personalization.track(profile))}>
        {tracked ? <Check size={16} /> : <UserRoundPlus size={16} />}{tracked ? "Saved to dashboard" : "Save to dashboard"}
      </button>
      {profile.kind === "players" && tracked ? (
        <button type="button" aria-pressed={tracked.isDefault} onClick={() => void personalization.setDefault(tracked.isDefault ? null : tracked.tag)}>
          <Star size={16} fill={tracked.isDefault ? "currentColor" : "none"} />{tracked.isDefault ? "Default player" : "Make default"}
        </button>
      ) : null}
      <span>{personalization.status === "synced" ? "Dashboard synced" : "On this device"}</span>
    </div>
  );
}

export function TrackingControls({ profile }: { profile: Pick<ProfileInput, "tag" | "name"> }) {
  const auth = useStatsConnectAuth();
  const tracking = useStatsConnectProfileTracking();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const tracked = tracking.isTracked("clash-royale", profile.tag);
  const loading = tracking.status === "loading";
  const authenticated = tracking.authenticated && Boolean(auth.account);

  async function toggleTracking() {
    setActionError(null);
    if (!authenticated) {
      try {
        await auth.signInWithGoogle();
      } catch (error) {
        setActionError(error instanceof Error ? error.message : "Sign-in could not be started.");
      }
      return;
    }

    setPending(true);
    try {
      if (tracked) {
        await tracking.untrackProfile("clash-royale", profile.tag);
      } else {
        await tracking.trackProfile({ game: "clash-royale", tag: profile.tag, name: profile.name });
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "The tracked profile could not be updated.");
    } finally {
      setPending(false);
    }
  }

  const statusMessage = actionError
    ? actionError
    : tracking.status === "error"
      ? tracking.error ?? "Tracked profiles could not be loaded."
      : loading
        ? "Checking your tracked profiles…"
        : pending
          ? tracked ? "Removing tracked profile…" : "Adding tracked profile…"
          : authenticated
            ? tracked ? "Tracked across StatsConnect" : "Track this profile across StatsConnect"
            : "Sign in to track profiles across StatsConnect";

  return (
    <div className={styles.trackingControls} aria-label="StatsConnect profile tracking controls">
      <button
        type="button"
        aria-pressed={tracked}
        aria-busy={pending || loading}
        disabled={pending || loading}
        onClick={() => void toggleTracking()}
      >
        {authenticated ? (tracked ? <Check size={16} /> : <UserRoundPlus size={16} />) : <LogIn size={16} />}
        {loading ? "Checking…" : pending ? (tracked ? "Removing…" : "Tracking…") : tracked ? "Tracked" : authenticated ? "Track profile" : "Sign in to track"}
      </button>
      <span role={actionError || tracking.status === "error" ? "alert" : "status"} aria-live="polite">{statusMessage}</span>
    </div>
  );
}

function key(profile: Pick<ProfileInput, "kind" | "tag">) {
  return `${profile.kind}:${profile.tag.replace(/^#/, "").toUpperCase()}`;
}
