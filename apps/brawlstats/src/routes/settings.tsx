import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, BellOff, Download, Languages, MonitorDown, Save, Share2, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { localeLabels, useI18n } from "@/lib/i18n";
import {
  exportPreferences,
  importPreferences,
  removeSavedProfile,
  saveProfile,
  setAlertsEnabled,
  setLocale,
  supportedLocales,
  usePreferences,
  type Locale,
} from "@/lib/preferences";
import { useInstallPrompt } from "@/lib/pwa";
import { downloadText, shareContent } from "@/lib/share";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Companion Settings · BrawlStats.io" }] }),
});

function SettingsPage() {
  const preferences = usePreferences();
  const { locale, t } = useI18n();
  const installPrompt = useInstallPrompt();
  const importRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("");

  async function toggleAlerts() {
    if (!preferences.alertsEnabled) {
      if (!("Notification" in window)) {
        setStatus(t("settings.notificationsUnsupported"));
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(t("settings.notificationsDenied"));
        return;
      }
    }
    setAlertsEnabled(!preferences.alertsEnabled);
    setStatus(preferences.alertsEnabled ? t("settings.alertsDisabled") : t("settings.alertsEnabled"));
  }

  async function importFile(file?: File) {
    if (!file) return;
    const ok = importPreferences(await file.text());
    setStatus(ok ? t("settings.imported") : t("settings.invalidFile"));
  }

  return (
    <div className="page-shell">
      <div>
        <p className="eyebrow">{t("settings.eyebrow")}</p>
        <h1 className="font-display text-4xl">{t("nav.settings")}</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {t("settings.deviceDetail")}
        </p>
      </div>

      {status ? <p role="status" className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-3 text-sm text-accent">{status}</p> : null}

      <section className="grid gap-5 lg:grid-cols-3">
        <Card className="p-5 py-5">
          <Languages className="size-6 text-primary" />
          <h2 className="font-display text-2xl">{t("common.language")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.languageDetail")}</p>
          <Select value={locale} onValueChange={(value) => value && setLocale(value as Locale)}>
            <SelectTrigger className="w-full"><SelectValue>{localeLabels[locale]}</SelectValue></SelectTrigger>
            <SelectContent>
              {supportedLocales.map((item) => <SelectItem key={item} value={item}>{localeLabels[item]}</SelectItem>)}
            </SelectContent>
          </Select>
        </Card>

        <Card className="p-5 py-5">
          {preferences.alertsEnabled ? <Bell className="size-6 text-accent" /> : <BellOff className="size-6 text-muted-foreground" />}
          <h2 className="font-display text-2xl">{t("common.alerts")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.alertDetail")}</p>
          <Button onClick={toggleAlerts} variant={preferences.alertsEnabled ? "secondary" : "default"}>
            {preferences.alertsEnabled ? t("settings.disableAlerts") : t("settings.enableAlerts")}
          </Button>
        </Card>

        <Card className="p-5 py-5">
          <MonitorDown className="size-6 text-primary" />
          <h2 className="font-display text-2xl">{t("common.install")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.installDetail")}</p>
          <Button onClick={() => installPrompt.install()} disabled={!installPrompt.available}>
            {installPrompt.available ? t("settings.installApp") : t("settings.installed")}
          </Button>
        </Card>
      </section>

      <section>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">{t("settings.profileSwitcher")}</p>
            <h2 className="font-display text-3xl">{t("nav.savedProfiles")}</h2>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => downloadText("brawlstats-preferences.json", exportPreferences(), "application/json")}>
              <Download /> {t("settings.export")}
            </Button>
            <input ref={importRef} type="file" accept="application/json" className="hidden" onChange={(event) => importFile(event.target.files?.[0])} />
            <Button variant="outline" onClick={() => importRef.current?.click()}><Upload /> {t("settings.import")}</Button>
          </div>
        </div>

        {preferences.savedProfiles.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {preferences.savedProfiles.map((profile) => (
              <Card key={profile.tag} className="flex-row items-center gap-3 p-4 py-4">
                <div className="min-w-0 flex-1">
                  <Link to="/players" search={{ tag: `#${profile.tag}` }} className="block truncate font-medium hover:text-primary">
                    {profile.name || `#${profile.tag}`}
                  </Link>
                  <p className="text-xs text-muted-foreground">#{profile.tag}{profile.trophies ? ` · ${new Intl.NumberFormat(locale).format(profile.trophies)} ${t("common.trophies").toLocaleLowerCase()}` : ""}</p>
                </div>
                <Button size="icon-sm" variant="ghost" aria-label={t("settings.removeProfile", { name: profile.name || profile.tag })} onClick={() => removeSavedProfile(profile.tag)}><Trash2 /></Button>
              </Card>
            ))}
          </div>
        ) : <p className="data-surface p-6 text-muted-foreground">{t("nav.noSavedProfiles")}</p>}

        {preferences.recentProfiles.length ? (
          <div className="mt-6">
            <h3 className="mb-3 font-display text-xl">{t("settings.recent")}</h3>
            <div className="flex flex-wrap gap-2">
              {preferences.recentProfiles.map((profile) => (
                <Button key={profile.tag} size="sm" variant="outline" onClick={() => saveProfile(profile)}>
                  <Save /> {profile.name || `#${profile.tag}`}
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <Card className="flex-row flex-wrap items-center justify-between gap-4 p-5 py-5">
        <div>
          <h2 className="font-display text-2xl">{t("settings.shareTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("settings.shareDetail")}</p>
        </div>
        <Button variant="outline" onClick={() => shareContent({ title: "BrawlStats.io", text: t("settings.shareText"), url: window.location.origin })}>
          <Share2 /> {t("common.share")}
        </Button>
      </Card>
    </div>
  );
}
