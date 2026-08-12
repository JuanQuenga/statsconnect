import Link from "@/components/Link";
import { AlertTriangle, Database, LoaderCircle } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LoadingState({ label }: { label: string }) {
  const { t } = useI18n();
  return (
    <div className="data-state" role="status">
      <LoaderCircle className="state-spinner" size={34} />
      <h1>{t("common.loading")} {label}</h1>
      <p>{t("state.loadingCopy")}</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  const { t } = useI18n();
  return (
    <div className="data-state" role="alert">
      <AlertTriangle size={38} />
      <h1>{t("state.errorTitle")}</h1>
      <p>{message}</p>
      <Link className="pink-button" href="/#lookup">{t("state.tryAnother")}</Link>
    </div>
  );
}

export function SetupState({ feature }: { feature: string }) {
  const { t } = useI18n();
  return (
    <div className="data-state">
      <Database size={38} />
      <h1>{t("state.setupTitle")}: {feature}</h1>
      <p>{t("state.setupCopy")}</p>
      <Link className="pink-button" href="/">{t("state.viewHome")}</Link>
    </div>
  );
}
