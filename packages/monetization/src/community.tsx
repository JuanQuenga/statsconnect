import { useEffect, useState } from "react";
import { emptyCommunityState, feedbackHref, nextCommunityRequest, parseCommunityState, resolveSupportLinks, type RequestKind, type SupportUrls } from "./community-policy";
import "./community.css";

const STORAGE_KEY = "statsconnect.community.v1";
const SESSION_SUCCESS = "statsconnect.community.success.v1";
const SESSION_REQUEST = "statsconnect.community.request.v1";
const SUCCESS_EVENT = "statsconnect:community-success";

const messages = {
  en: {
    feedback: "Send feedback", support: "Support the developer", email: "Opens your email app",
    once: "Support once", monthly: "Support monthly · $5/month", manage: "Manage or cancel monthly support",
    monthlyTerms: "Monthly support charges $5 USD each month until canceled. You can cancel future monthly charges at any time through Stripe.",
    notice: "Contributions are optional and support the developer’s work on StatsConnect and other projects. They do not unlock features or benefits.",
    feedbackTitle: "How is StatsConnect working for you?",
    feedbackDetail: "Tell us what helped or what could be better. Your email app will open so you can write your message.",
    supportTitle: "Finding StatsConnect useful?",
    supportDetail: "You can support the developer’s work on StatsConnect and other projects with an optional contribution. Contributing does not unlock features or benefits.",
    dismiss: "Not now", disable: "Don't ask again", settingsTitle: "Help shape StatsConnect",
    settingsDetail: "Have an idea or spotted a problem? We'd like to hear about it.",
  },
  es: {
    feedback: "Enviar comentarios", support: "Apoyar al desarrollador", email: "Abre tu aplicación de correo",
    once: "Apoyar una vez", monthly: "Apoyar cada mes · 5 USD/mes", manage: "Gestionar o cancelar el apoyo mensual",
    monthlyTerms: "El apoyo mensual cobra 5 USD cada mes hasta que lo canceles. Puedes cancelar los próximos cobros en cualquier momento a través de Stripe.",
    notice: "Las contribuciones son opcionales y apoyan el trabajo del desarrollador en StatsConnect y otros proyectos. No desbloquean funciones ni beneficios.",
    feedbackTitle: "¿Cómo te está funcionando StatsConnect?",
    feedbackDetail: "Cuéntanos qué te ayudó o qué podríamos mejorar. Se abrirá tu aplicación de correo para escribir el mensaje.",
    supportTitle: "¿Te resulta útil StatsConnect?",
    supportDetail: "Puedes apoyar el trabajo del desarrollador en StatsConnect y otros proyectos con una contribución opcional. No desbloquea funciones ni beneficios.",
    dismiss: "Ahora no", disable: "No volver a preguntar", settingsTitle: "Ayuda a mejorar StatsConnect",
    settingsDetail: "¿Tienes una idea o encontraste un problema? Nos gustaría saberlo.",
  },
};

type CommunityProps = SupportUrls & { locale?: string };
function copy(locale: string | undefined) { return locale === "es" ? messages.es : messages.en; }

function SupportActions({ links, text }: { links: ReturnType<typeof resolveSupportLinks>; text: ReturnType<typeof copy> }) {
  return <>
    {links.oneTime ? <a href={links.oneTime} target="_blank" rel="noopener noreferrer">{links.monthly ? text.once : text.support}</a> : null}
    {links.monthly ? <a href={links.monthly} target="_blank" rel="noopener noreferrer">{text.monthly}</a> : null}
  </>;
}

function SupportManagement({ links, text }: { links: ReturnType<typeof resolveSupportLinks>; text: ReturnType<typeof copy> }) {
  return <>
    {links.monthly ? <p className="community-notice">{text.monthlyTerms}</p> : null}
    {links.portal ? <a className="community-manage" href={links.portal} target="_blank" rel="noopener noreferrer">{text.manage}</a> : null}
  </>;
}

/** Called only after a completed lookup, save, download, or share, never on page load. */
export function recordCommunitySuccess() {
  window.dispatchEvent(new Event(SUCCESS_EVENT));
}

export function CommunityLinks(props: CommunityProps) {
  const text = copy(props.locale);
  const links = resolveSupportLinks(props);
  return (
    <div className="statsconnect-community statsconnect-community-links">
      <div className="community-actions">
        <a href={feedbackHref} data-community-feedback title={text.email}>{text.feedback}</a>
        <SupportActions links={links} text={text} />
      </div>
      {links.oneTime || links.monthly ? <p className="community-notice">{text.notice}</p> : null}
      <SupportManagement links={links} text={text} />
    </div>
  );
}

export function CommunityPanel(props: CommunityProps) {
  const text = copy(props.locale);
  return (
    <section className="statsconnect-community community-panel">
      <h2>{text.settingsTitle}</h2>
      <p>{text.settingsDetail}</p>
      <CommunityLinks {...props} />
    </section>
  );
}

/** Inline below content. Storage failures suppress requests, while permanent links still work. */
export function CommunityRequest(props: CommunityProps) {
  const [request, setRequest] = useState<RequestKind | null>(null);
  const links = resolveSupportLinks(props);
  const supportAvailable = links.oneTime !== null || links.monthly !== null;
  const text = copy(props.locale);

  useEffect(() => {
    function completed() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const state = raw ? parseCommunityState(JSON.parse(raw)) : emptyCommunityState;
        const next = nextCommunityRequest({
          state, now: Date.now(),
          succeededThisSession: sessionStorage.getItem(SESSION_SUCCESS) === "1",
          requestedThisSession: sessionStorage.getItem(SESSION_REQUEST) === "1",
          supportAvailable,
        });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next.state));
        sessionStorage.setItem(SESSION_SUCCESS, "1");
        if (next.request) {
          sessionStorage.setItem(SESSION_REQUEST, "1");
          setRequest(next.request);
        }
      } catch { /* Do not nag when the visitor blocks persistence. */ }
    }
    window.addEventListener(SUCCESS_EVENT, completed);
    return () => window.removeEventListener(SUCCESS_EVENT, completed);
  }, [supportAvailable]);

  function dismiss(permanent: boolean) {
    if (permanent) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        const state = raw ? parseCommunityState(JSON.parse(raw)) : emptyCommunityState;
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, disabled: true }));
      } catch { /* Dismissal still works in this page if storage becomes unavailable. */ }
    }
    setRequest(null);
    document.querySelector<HTMLAnchorElement>("footer [data-community-feedback]")?.focus({ preventScroll: true });
  }

  if (!request || (request === "support" && !supportAvailable)) return null;
  const isFeedback = request === "feedback";
  return (
    <aside className="statsconnect-community community-request" aria-label={isFeedback ? text.feedbackTitle : text.supportTitle}>
      <p className="community-request-title" role="status">{isFeedback ? text.feedbackTitle : text.supportTitle}</p>
      <p>{isFeedback ? text.feedbackDetail : text.supportDetail}</p>
      <div className="community-actions">
        {isFeedback
          ? <a href={feedbackHref} title={text.email}>{text.feedback}</a>
          : <SupportActions links={links} text={text} />}
        <button type="button" onClick={() => dismiss(false)}>{text.dismiss}</button>
        <button type="button" onClick={() => dismiss(true)}>{text.disable}</button>
      </div>
      {!isFeedback ? <SupportManagement links={links} text={text} /> : null}
    </aside>
  );
}
