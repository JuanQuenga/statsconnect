import { Bell, BellOff } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ClanManagementEvent } from "@/lib/clanManagement";

type PermissionState = NotificationPermission | "unsupported";

function preferenceKey(tag: string): string {
  return `clashcrown:clan-alerts:${tag}`;
}

function cursorKey(tag: string): string {
  return `clashcrown:clan-alert-cursor:${tag}`;
}

function initialPermission(): PermissionState {
  return typeof window === "undefined" || !("Notification" in window) ? "unsupported" : Notification.permission;
}

export function ClanNotifications({ tag, name, events }: { tag: string; name: string; events: ClanManagementEvent[] }) {
  const [permission, setPermission] = useState<PermissionState>(initialPermission);
  const [enabled, setEnabled] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(preferenceKey(tag)) === "on";
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const initialized = useRef(false);
  const latestEvent = events[0] ?? null;

  useEffect(() => {
    if (!latestEvent) return;
    const key = cursorKey(tag);
    const saved = window.localStorage.getItem(key);
    if (!initialized.current) {
      initialized.current = true;
      window.localStorage.setItem(key, latestEvent.id);
      return;
    }
    if (!enabled || permission !== "granted" || saved === latestEvent.id) return;

    const unseen: ClanManagementEvent[] = [];
    for (const event of events) {
      if (event.id === saved) break;
      unseen.push(event);
    }
    window.localStorage.setItem(key, latestEvent.id);
    if (!unseen.length) return;

    const body = unseen.length === 1
      ? unseen[0].summary
      : `${unseen.length} roster events since the last observation, including: ${unseen[0].summary}`;
    const notification = new Notification(`${name} roster update`, { body, tag: `clan-${tag}` });
    notification.onclick = () => window.focus();
  }, [enabled, events, latestEvent, name, permission, tag]);

  const status = useMemo(() => {
    if (permission === "unsupported") return "This browser does not support page notifications.";
    if (permission === "denied") return "Notifications are blocked in your browser settings.";
    if (enabled && permission === "granted") return "On while Royale Stats is open in this browser.";
    return "Off. Nothing is sent until you opt in.";
  }, [enabled, permission]);

  async function enable(): Promise<void> {
    if (permission === "unsupported") return;
    const nextPermission = permission === "granted" ? permission : await Notification.requestPermission();
    setPermission(nextPermission);
    if (nextPermission !== "granted") {
      setEnabled(false);
      setFeedback(nextPermission === "denied" ? "Permission was denied. Change it in browser settings to opt in." : "Permission was not granted.");
      return;
    }
    setEnabled(true);
    window.localStorage.setItem(preferenceKey(tag), "on");
    if (latestEvent) window.localStorage.setItem(cursorKey(tag), latestEvent.id);
    setFeedback("Alerts enabled. Future observed roster events will be grouped into one notification.");
  }

  function disable(): void {
    setEnabled(false);
    window.localStorage.removeItem(preferenceKey(tag));
    setFeedback("Alerts disabled for this clan in this browser.");
  }

  return (
    <section className="clan-alerts" aria-labelledby="clan-alerts-title">
      <div>
        <h2 id="clan-alerts-title">Actionable roster updates</h2>
        <p>{status} Alerts are local to this browser and only work while the site is open; there is no background push service.</p>
        {feedback ? <p className="management-feedback" role="status">{feedback}</p> : null}
      </div>
      {enabled && permission === "granted" ? (
        <button type="button" className="management-button management-button-muted" onClick={disable}>
          <BellOff size={17} aria-hidden="true" /> Turn off
        </button>
      ) : (
        <button type="button" className="management-button" onClick={enable} disabled={permission === "unsupported" || permission === "denied"}>
          <Bell size={17} aria-hidden="true" /> Enable alerts
        </button>
      )}
    </section>
  );
}
