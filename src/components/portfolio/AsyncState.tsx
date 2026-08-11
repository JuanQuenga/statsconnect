import Link from "@/components/Link";
import { AlertTriangle, Database, LoaderCircle } from "lucide-react";

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="data-state" role="status">
      <LoaderCircle className="state-spinner" size={34} />
      <h1>Loading {label}</h1>
      <p>Checking the live Clash Royale API and the Convex cache.</p>
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="data-state" role="alert">
      <AlertTriangle size={38} />
      <h1>We couldn’t load that profile</h1>
      <p>{message}</p>
      <Link className="pink-button" href="/#lookup">Try another tag</Link>
    </div>
  );
}

export function SetupState({ feature }: { feature: string }) {
  return (
    <div className="data-state">
      <Database size={38} />
      <h1>Connect Convex to use live {feature}</h1>
      <p>The website is ready for live data. Add the Convex URL locally, set the Clash Royale token in Convex, then search again.</p>
      <Link className="pink-button" href="/">View the demo</Link>
    </div>
  );
}
