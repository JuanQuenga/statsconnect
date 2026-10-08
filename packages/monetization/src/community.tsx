import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useConvex } from "convex/react";
import { makeFunctionReference } from "convex/server";
import { emptyCommunityState, feedbackSite, nextCommunityRequest, parseCommunityState, resolveSupportLinks, type RequestKind, type SupportUrls } from "./community-policy";
import "./community.css";

const STORAGE_KEY = "statsconnect.community.v1";
const SESSION_SUCCESS = "statsconnect.community.success.v1";
const SESSION_REQUEST = "statsconnect.community.request.v1";
const SUCCESS_EVENT = "statsconnect:community-success";
const CLIENT_KEY = "statsconnect.feedback.client.v1";

type FeedbackArgs = { site: ReturnType<typeof feedbackSite>; message: string; email?: string; page?: string; clientId: string };
const submitFeedback = makeFunctionReference<"mutation", FeedbackArgs, null>("hub/feedback:submit");

const messages = {
  en: {
    feedback: "Send feedback", support: "Support the developer",
    once: "Support once", monthly: "Support monthly · $5/month", manage: "Manage or cancel monthly support",
    monthlyTerms: "Monthly support charges $5 USD each month until canceled. You can cancel future monthly charges at any time through Stripe.",
    notice: "Contributions are optional and support the developer’s work on StatsConnect and other projects. They do not unlock features or benefits.",
    feedbackTitle: "How is StatsConnect working for you?",
    feedbackDetail: "Tell us what helped or what could be better.",
    formTitle: "Send feedback", formMessage: "What's working, what's broken, or what would you like to see?",
    formEmail: "Email (optional, only if you'd like a reply)", formPrivacy: "Please leave out passwords and payment details.",
    formSend: "Send", formSending: "Sending…", formCancel: "Cancel", formClose: "Close",
    formThanks: "Thanks! Your feedback was sent.", formError: "Couldn't send your feedback. Please try again.",
    supportTitle: "Finding StatsConnect useful?",
    supportDetail: "You can support the developer’s work on StatsConnect and other projects with an optional contribution. Contributing does not unlock features or benefits.",
    dismiss: "Not now", disable: "Don't ask again", settingsTitle: "Help shape StatsConnect",
    settingsDetail: "Have an idea or spotted a problem? We'd like to hear about it.",
  },
  es: {
    feedback: "Enviar comentarios", support: "Apoyar al desarrollador",
    once: "Apoyar una vez", monthly: "Apoyar cada mes · 5 USD/mes", manage: "Gestionar o cancelar el apoyo mensual",
    monthlyTerms: "El apoyo mensual cobra 5 USD cada mes hasta que lo canceles. Puedes cancelar los próximos cobros en cualquier momento a través de Stripe.",
    notice: "Las contribuciones son opcionales y apoyan el trabajo del desarrollador en StatsConnect y otros proyectos. No desbloquean funciones ni beneficios.",
    feedbackTitle: "¿Cómo te está funcionando StatsConnect?",
    feedbackDetail: "Cuéntanos qué te ayudó o qué podríamos mejorar.",
    formTitle: "Enviar comentarios", formMessage: "¿Qué funciona, qué falla o qué te gustaría ver?",
    formEmail: "Correo (opcional, solo si quieres respuesta)", formPrivacy: "No incluyas contraseñas ni datos de pago.",
    formSend: "Enviar", formSending: "Enviando…", formCancel: "Cancelar", formClose: "Cerrar",
    formThanks: "¡Gracias! Tus comentarios se enviaron.", formError: "No se pudieron enviar tus comentarios. Inténtalo de nuevo.",
    supportTitle: "¿Te resulta útil StatsConnect?",
    supportDetail: "Puedes apoyar el trabajo del desarrollador en StatsConnect y otros proyectos con una contribución opcional. No desbloquea funciones ni beneficios.",
    dismiss: "Ahora no", disable: "No volver a preguntar", settingsTitle: "Ayuda a mejorar StatsConnect",
    settingsDetail: "¿Tienes una idea o encontraste un problema? Nos gustaría saberlo.",
  },
};

type CommunityProps = SupportUrls & { locale?: string };
function copy(locale: string | undefined) { return locale === "es" ? messages.es : messages.en; }

function clientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const created = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, created);
    return created;
  } catch {
    return "anonymous";
  }
}

function errorMessage(error: unknown, fallback: string): string {
  const data = (error as { data?: unknown } | null)?.data;
  return data && typeof data === "object" && "message" in data && typeof data.message === "string" ? data.message : fallback;
}

/** "Send feedback" opens a small form whose messages land in the Convex `feedback` table. */
function FeedbackButton({ text, className, marker = false }: { text: ReturnType<typeof copy>; className?: string; marker?: boolean }) {
  const convex = useConvex();
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");
  if (!convex) return null;

  function open() {
    setState("idle");
    setError("");
    dialog.current?.showModal();
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!convex || state === "sending") return;
    setState("sending");
    setError("");
    try {
      await convex.mutation(submitFeedback, {
        site: feedbackSite(window.location),
        message,
        email: email.trim() || undefined,
        page: window.location.pathname,
        clientId: clientId(),
      });
      setMessage("");
      setEmail("");
      setState("sent");
    } catch (caught) {
      setState("idle");
      setError(errorMessage(caught, text.formError));
    }
  }

  return <>
    <button type="button" className={className} onClick={open} {...(marker ? { "data-community-feedback": "" } : {})}>{text.feedback}</button>
    <dialog ref={dialog} className="community-feedback" aria-labelledby={`${id}-title`} onClick={(event) => { if (event.target === dialog.current) dialog.current?.close(); }}>
      {state === "sent" ? (
        <div className="community-feedback-body">
          <p id={`${id}-title`} className="community-feedback-title" role="status">{text.formThanks}</p>
          <div className="community-feedback-actions">
            <button type="button" className="is-primary" onClick={() => dialog.current?.close()}>{text.formClose}</button>
          </div>
        </div>
      ) : (
        <form className="community-feedback-body" onSubmit={send}>
          <p id={`${id}-title`} className="community-feedback-title">{text.formTitle}</p>
          <label htmlFor={`${id}-message`}>{text.formMessage}</label>
          <textarea id={`${id}-message`} required minLength={3} maxLength={2000} rows={5} value={message} onChange={(event) => setMessage(event.target.value)} />
          <label htmlFor={`${id}-email`}>{text.formEmail}</label>
          <input id={`${id}-email`} type="email" autoComplete="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
          <p className="community-feedback-note">{text.formPrivacy}</p>
          {error ? <p className="community-feedback-error" role="alert">{error}</p> : null}
          <div className="community-feedback-actions">
            <button type="button" onClick={() => dialog.current?.close()}>{text.formCancel}</button>
            <button type="submit" className="is-primary" disabled={state === "sending"}>{state === "sending" ? text.formSending : text.formSend}</button>
          </div>
        </form>
      )}
    </dialog>
  </>;
}

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
        <FeedbackButton text={text} marker />
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
          ? <FeedbackButton text={text} />
          : <SupportActions links={links} text={text} />}
        <button type="button" onClick={() => dismiss(false)}>{text.dismiss}</button>
        <button type="button" onClick={() => dismiss(true)}>{text.disable}</button>
      </div>
      {!isFeedback ? <SupportManagement links={links} text={text} /> : null}
    </aside>
  );
}
