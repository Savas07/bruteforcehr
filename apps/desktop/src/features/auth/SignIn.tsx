/**
 * The signed-out window (onboarding-signin.md "Desktop", adapted from a code to a link): the
 * email step, "Check your email" while the link is on its way, "Signing you in…" when it comes
 * back through `bruteforcehr://auth/finish`, the confirm step for a link requested on another
 * device, and the link errors. A centred 400 px column on the canvas; no marketing, no fake data.
 */
import { ArrowLeft, CircleAlert, ExternalLink, LoaderCircle, MailCheck, WifiOff } from "lucide-react";
import { type FormEvent, type ReactNode, useEffect, useId, useRef, useState } from "react";
import { defineMessages, type IntlShape, type MessageDescriptor, useIntl } from "react-intl";
import appMark from "../../../src-tauri/icons/128x128@2x.png";
import { chrome, openExternal, openMailInbox } from "../../lib/desktop";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { type LinkError, resendWaitMs, type SendError } from "./emailLink";
import { webmailInboxFor } from "./mailProviders";
import { type SignInView, useAuth } from "./session";

const messages = defineMessages({
  documentTitle: { id: "auth.documentTitle", defaultMessage: "Sign in · BruteForceHR" },
  title: { id: "auth.email.title", defaultMessage: "Sign in to BruteForceHR" },
  body: {
    id: "auth.email.body",
    defaultMessage: "Enter your email and we’ll send you a link to sign in. No password needed.",
  },
  emailLabel: { id: "auth.email.label", defaultMessage: "Email" },
  send: { id: "auth.email.send", defaultMessage: "Send sign-in link" },
  sending: { id: "auth.email.sending", defaultMessage: "Sending…" },
  invalidEmail: {
    id: "auth.email.invalid",
    defaultMessage: "Enter an email address like name@example.com.",
  },
  legal: {
    id: "auth.email.legal",
    defaultMessage:
      "By continuing, you agree to the <terms>Terms</terms> and the <privacy>Privacy Policy</privacy>.",
    description: "Under the send button; <terms> and <privacy> open the website",
  },
  sendOffline: {
    id: "auth.send.offline",
    defaultMessage: "Couldn’t send the link. Check your internet connection and try again.",
  },
  sendLimited: {
    id: "auth.send.rateLimited",
    defaultMessage: "Too many links were requested for now. Wait a few minutes, then try again.",
  },
  sendUnavailable: {
    id: "auth.send.unavailable",
    defaultMessage: "Couldn’t send the link right now. Try again in a moment.",
  },
  checkTitle: { id: "auth.check.title", defaultMessage: "Check your email" },
  checkBody: {
    id: "auth.check.body",
    defaultMessage: "We sent a sign-in link to <b>{email}</b>. Open it on this computer to sign in.",
  },
  checkHelp: {
    id: "auth.check.help",
    defaultMessage: "It can take a minute to arrive. If you don’t see it, check your spam folder.",
  },
  openInbox: {
    id: "auth.check.openInbox",
    defaultMessage: "Open {provider}",
    description: "{provider} is a webmail product name: Gmail, Outlook, iCloud Mail…",
  },
  notArrived: { id: "auth.check.notArrived", defaultMessage: "Didn’t get it?" },
  resend: { id: "auth.check.resend", defaultMessage: "Send again" },
  resendIn: {
    id: "auth.check.resendIn",
    defaultMessage: "Send again in {time}",
    description: "{time} is a countdown like 0:42",
  },
  resendWait: {
    id: "auth.check.resendWait",
    defaultMessage: "You can send another link a minute after the last one.",
  },
  resendReady: { id: "auth.check.resendReady", defaultMessage: "You can send another link now." },
  resent: { id: "auth.check.resent", defaultMessage: "We sent a new link to {email}." },
  differentEmail: { id: "auth.differentEmail", defaultMessage: "Use a different email" },
  requestInstead: { id: "auth.confirm.requestInstead", defaultMessage: "Request a new link instead" },
  sendTo: {
    id: "auth.link.sendTo",
    defaultMessage: "We’ll send it to <b>{email}</b>.",
    description: "Under the error, before the Send a new link button",
  },
  completing: { id: "auth.completing", defaultMessage: "Signing you in…" },
  confirmTitle: { id: "auth.confirm.title", defaultMessage: "Confirm your email" },
  confirmBody: {
    id: "auth.confirm.body",
    defaultMessage:
      "This link was requested on another device, so this computer doesn’t know the address yet. Enter the email you asked for the link with.",
  },
  confirmSubmit: { id: "auth.confirm.submit", defaultMessage: "Sign in" },
  confirmSubmitting: { id: "auth.confirm.submitting", defaultMessage: "Signing in…" },
  wrongEmail: {
    id: "auth.confirm.wrongEmail",
    defaultMessage: "This link was sent to a different address. Enter the one you asked for the link with.",
  },
  sendNew: { id: "auth.sendNew", defaultMessage: "Send a new link" },
  tryAgain: { id: "auth.tryAgain", defaultMessage: "Try again" },
  invalidTitle: { id: "auth.link.invalid.title", defaultMessage: "This sign-in link doesn’t work" },
  invalidBody: {
    id: "auth.link.invalid.body",
    defaultMessage:
      "It may have been used already, or only part of it was copied. Send yourself a new link to sign in.",
  },
  expiredTitle: { id: "auth.link.expired.title", defaultMessage: "This sign-in link has expired" },
  expiredBody: {
    id: "auth.link.expired.body",
    defaultMessage: "Sign-in links work for a limited time. Send yourself a new one to sign in.",
  },
  disabledTitle: { id: "auth.link.disabled.title", defaultMessage: "Sign-in is turned off for this account" },
  disabledBody: {
    id: "auth.link.disabled.body",
    defaultMessage: "You can’t sign in with this address right now. Try a different email address.",
  },
  offlineTitle: { id: "auth.link.offline.title", defaultMessage: "You’re offline" },
  offlineBody: {
    id: "auth.link.offline.body",
    defaultMessage: "Connect to the internet, then try again. Your link still works.",
  },
  unavailableTitle: { id: "auth.link.unavailable.title", defaultMessage: "Couldn’t sign you in" },
  unavailableBody: {
    id: "auth.link.unavailable.body",
    defaultMessage: "Something went wrong on our side. Try again in a moment.",
  },
});

const TERMS_URL = "https://bruteforcehr.web.app/terms";
const PRIVACY_URL = "https://bruteforcehr.web.app/privacy";

const sendErrorMessage = (intl: IntlShape, error: SendError): string =>
  intl.formatMessage(
    error === "offline"
      ? messages.sendOffline
      : error === "rate-limited"
        ? messages.sendLimited
        : messages.sendUnavailable,
  );

const linkErrorCopy: Readonly<
  Record<
    Exclude<LinkError, "wrong-email">,
    { readonly title: MessageDescriptor; readonly body: MessageDescriptor }
  >
> = {
  invalid: { title: messages.invalidTitle, body: messages.invalidBody },
  expired: { title: messages.expiredTitle, body: messages.expiredBody },
  disabled: { title: messages.disabledTitle, body: messages.disabledBody },
  offline: { title: messages.offlineTitle, body: messages.offlineBody },
  unavailable: { title: messages.unavailableTitle, body: messages.unavailableBody },
};

/** `m:ss`, rounded up so the countdown never shows 0:00 while still disabled. */
function countdown(ms: number): string {
  const seconds = Math.ceil(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * The step's title. Steps without a field to fill (`focus`) move focus here when they open, so
 * screen readers announce the new step; steps with a field focus the field instead.
 */
function Heading({ children, focus = false }: { children: ReactNode; focus?: boolean }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus({ preventScroll: true });
  }, [focus]);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-display text-title1 tracking-tight outline-none">
      {children}
    </h1>
  );
}

function StepIcon({ icon: Icon, tone }: { icon: typeof MailCheck; tone: "accent" | "neutral" }) {
  return (
    <span
      className={cx(
        "flex size-12 items-center justify-center rounded-full",
        tone === "accent" ? "bg-accent-subtle" : "bg-surface-sunken",
      )}
    >
      <Icon
        aria-hidden="true"
        className={cx("size-6", tone === "accent" ? "text-accent-text" : "text-fg-secondary")}
        strokeWidth={1.75}
      />
    </span>
  );
}

function EmailField({
  value,
  onChange,
  error,
  readOnly,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  readOnly: boolean;
  autoFocus: boolean;
}) {
  const intl = useIntl();
  const id = useId();
  const errorId = `${id}-error`;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-callout font-medium">
        {intl.formatMessage(messages.emailLabel)}
      </label>
      <input
        ref={ref}
        id={id}
        type="email"
        name="email"
        autoComplete="email"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        inputMode="email"
        value={value}
        readOnly={readOnly}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => onChange(event.target.value)}
        className={cx(
          "bg-surface-base text-fg-primary placeholder:text-fg-secondary h-10 rounded-md border px-3 text-body outline-none",
          error
            ? "border-danger-solid focus-visible:outline-danger-solid"
            : "border-line-control focus-visible:border-line-focus focus-visible:outline-line-focus",
          "focus-visible:outline-2 focus-visible:outline-offset-0",
          readOnly && "text-fg-secondary",
        )}
      />
      {error && (
        <p id={errorId} className="text-danger-text flex items-start gap-1.5 text-callout">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" strokeWidth={1.75} />
          {error}
        </p>
      )}
    </div>
  );
}

function EmailStep({ view }: { view: Extract<SignInView, { step: "email" }> }) {
  const intl = useIntl();
  const { sendLink } = useAuth();
  const [email, setEmail] = useState(view.email);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    sendLink(email);
  };
  const link = (url: string) =>
    function LegalLink(chunks: ReactNode[]) {
      return (
        <button
          type="button"
          className="text-accent-text rounded-xs underline underline-offset-2"
          onClick={() => void openExternal(url)}
        >
          {chunks}
        </button>
      );
    };
  return (
    <>
      <img src={appMark} alt="" width={56} height={56} className="size-14" />
      <div className="flex flex-col gap-2">
        <Heading>{intl.formatMessage(messages.title)}</Heading>
        <p className="text-fg-secondary text-body">{intl.formatMessage(messages.body)}</p>
      </div>
      <form noValidate onSubmit={submit} className="flex flex-col gap-4">
        <EmailField
          value={email}
          onChange={setEmail}
          readOnly={view.sending}
          autoFocus
          error={view.error === "invalid-email" ? intl.formatMessage(messages.invalidEmail) : null}
        />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={view.sending}
          loadingLabel={intl.formatMessage(messages.sending)}
        >
          {intl.formatMessage(messages.send)}
        </Button>
        {view.error && view.error !== "invalid-email" && (
          <InlineAlert tone="error" fromAction title={sendErrorMessage(intl, view.error)} />
        )}
      </form>
      <p className="text-fg-secondary text-footnote">
        {intl.formatMessage(messages.legal, { terms: link(TERMS_URL), privacy: link(PRIVACY_URL) })}
      </p>
    </>
  );
}

/** Re-renders every second while `active`. */
function useTicker(active: boolean): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
}

function CheckEmailStep({ view }: { view: Extract<SignInView, { step: "check-email" }> }) {
  const intl = useIntl();
  const { sendLink, changeEmail, now } = useAuth();
  const wait = resendWaitMs(view.sentAt, now());
  useTicker(wait > 0);
  // Announce once when "Send again" becomes available (the countdown itself isn't announced).
  const [waitedAtOpen] = useState(wait > 0);
  const ready = waitedAtOpen && wait === 0;
  const inbox = webmailInboxFor(view.email);

  return (
    <>
      <StepIcon icon={MailCheck} tone="accent" />
      <div className="flex flex-col gap-2">
        <Heading focus>{intl.formatMessage(messages.checkTitle)}</Heading>
        <p className="text-body">
          {intl.formatMessage(messages.checkBody, {
            email: view.email,
            b: (chunks) => <strong className="font-semibold break-all">{chunks}</strong>,
          })}
        </p>
        <p className="text-fg-secondary text-callout">{intl.formatMessage(messages.checkHelp)}</p>
      </div>
      {inbox && (
        <Button
          variant="primary"
          size="lg"
          icon={ExternalLink}
          onClick={() => void openMailInbox(inbox.provider, view.email)}
          className="self-start"
        >
          {intl.formatMessage(messages.openInbox, { provider: inbox.name })}
        </Button>
      )}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-fg-secondary text-callout">{intl.formatMessage(messages.notArrived)}</span>
          <Button
            variant={inbox ? "secondary" : "primary"}
            loading={view.resending}
            loadingLabel={intl.formatMessage(messages.sending)}
            disabledReason={wait > 0 ? intl.formatMessage(messages.resendWait) : null}
            onClick={() => sendLink(view.email)}
          >
            {wait > 0
              ? intl.formatMessage(messages.resendIn, { time: countdown(wait) })
              : intl.formatMessage(messages.resend)}
          </Button>
        </div>
        <div role="status" className="text-callout empty:hidden">
          {view.resent && !view.error && (
            <span className="text-fg-secondary">
              {intl.formatMessage(messages.resent, { email: view.email })}
            </span>
          )}
          {ready && !view.resent && (
            <span className="sr-only">{intl.formatMessage(messages.resendReady)}</span>
          )}
        </div>
        {view.error && <InlineAlert tone="error" fromAction title={sendErrorMessage(intl, view.error)} />}
      </div>
      <BackButton onClick={changeEmail} />
    </>
  );
}

/** Back to the email step ("Use a different email" by default); Esc does the same. */
function BackButton({ onClick, label }: { onClick: () => void; label?: string }) {
  const intl = useIntl();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) onClick();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClick]);
  return (
    <Button variant="plain" icon={ArrowLeft} onClick={onClick} shortcut="Escape" className="-ml-3 self-start">
      {label ?? intl.formatMessage(messages.differentEmail)}
    </Button>
  );
}

function CompletingStep() {
  const intl = useIntl();
  return (
    <div role="status" className="flex items-center gap-3">
      <LoaderCircle aria-hidden="true" className="text-fg-secondary size-5 animate-spin" strokeWidth={1.75} />
      <h1 className="font-display text-title2">{intl.formatMessage(messages.completing)}</h1>
    </div>
  );
}

function ConfirmEmailStep({ view }: { view: Extract<SignInView, { step: "confirm-email" }> }) {
  const intl = useIntl();
  const { confirmEmail, changeEmail } = useAuth();
  const [email, setEmail] = useState(view.email);
  const error =
    view.error === "invalid-email"
      ? intl.formatMessage(messages.invalidEmail)
      : view.error === "wrong-email"
        ? intl.formatMessage(messages.wrongEmail)
        : null;
  return (
    <>
      <StepIcon icon={MailCheck} tone="accent" />
      <div className="flex flex-col gap-2">
        <Heading>{intl.formatMessage(messages.confirmTitle)}</Heading>
        <p className="text-fg-secondary text-body">{intl.formatMessage(messages.confirmBody)}</p>
      </div>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          confirmEmail(email);
        }}
        className="flex flex-col gap-4"
      >
        <EmailField value={email} onChange={setEmail} readOnly={view.completing} autoFocus error={error} />
        <Button
          type="submit"
          variant="primary"
          size="lg"
          loading={view.completing}
          loadingLabel={intl.formatMessage(messages.confirmSubmitting)}
        >
          {intl.formatMessage(messages.confirmSubmit)}
        </Button>
      </form>
      <BackButton onClick={changeEmail} label={intl.formatMessage(messages.requestInstead)} />
    </>
  );
}

function LinkErrorStep({ view }: { view: Extract<SignInView, { step: "link-error" }> }) {
  const intl = useIntl();
  const { sendLink, changeEmail, retry } = useAuth();
  const reason = view.error === "wrong-email" ? "invalid" : view.error;
  const copy = linkErrorCopy[reason];
  const canRetry = view.link !== null && (reason === "offline" || reason === "unavailable");
  const email = view.email;

  let primary: ReactNode = null;
  if (canRetry)
    primary = (
      <Button variant="primary" size="lg" onClick={retry}>
        {intl.formatMessage(messages.tryAgain)}
      </Button>
    );
  else if (reason !== "disabled")
    primary = (
      <Button
        variant="primary"
        size="lg"
        loading={view.sending}
        loadingLabel={intl.formatMessage(messages.sending)}
        onClick={() => (email === null ? changeEmail() : sendLink(email))}
      >
        {intl.formatMessage(messages.sendNew)}
      </Button>
    );

  return (
    <>
      <StepIcon icon={reason === "offline" ? WifiOff : CircleAlert} tone="neutral" />
      <div className="flex flex-col gap-2">
        <Heading focus>{intl.formatMessage(copy.title)}</Heading>
        <p className="text-fg-secondary text-body">{intl.formatMessage(copy.body)}</p>
        {email !== null && (reason === "invalid" || reason === "expired") && (
          <p className="text-body">
            {intl.formatMessage(messages.sendTo, {
              email,
              b: (chunks) => <strong className="font-semibold break-all">{chunks}</strong>,
            })}
          </p>
        )}
      </div>
      {primary && <div className="flex">{primary}</div>}
      {view.sendError && (
        <InlineAlert tone="error" fromAction title={sendErrorMessage(intl, view.sendError)} />
      )}
      {/* Offline or a server problem: the address isn't the issue, so no way back to it. */}
      {!canRetry && (email !== null || reason === "disabled") && <BackButton onClick={changeEmail} />}
    </>
  );
}

function Step({ view }: { view: SignInView }) {
  switch (view.step) {
    case "email":
      return <EmailStep view={view} />;
    case "check-email":
      return <CheckEmailStep view={view} />;
    case "completing":
      return <CompletingStep />;
    case "confirm-email":
      return <ConfirmEmailStep view={view} />;
    case "link-error":
      return <LinkErrorStep view={view} />;
  }
}

/** The whole window while signed out. */
export function SignIn({ view }: { view: SignInView }) {
  const intl = useIntl();
  const title = intl.formatMessage(messages.documentTitle);
  useEffect(() => {
    document.title = title;
  }, [title]);
  return (
    <div className="bg-surface-canvas text-fg-primary flex h-full flex-col">
      {/* macOS: the hidden title bar still moves the window. */}
      {chrome.platform === "macos" && <div data-tauri-drag-region className="h-(--chrome-height) shrink-0" />}
      <main className="flex min-h-0 flex-1 overflow-y-auto px-8 py-10">
        <div className="m-auto flex w-full max-w-100 flex-col items-stretch gap-6">
          {/* A new step (or a different link error) starts fresh: focus, field contents. */}
          <Step key={view.step === "link-error" ? `${view.step}-${view.error}` : view.step} view={view} />
        </div>
      </main>
    </div>
  );
}

/** While the saved session is restored (a moment, from IndexedDB): the canvas, nothing else. */
export function AuthRestoring() {
  return (
    <div className="bg-surface-canvas flex h-full flex-col">
      {chrome.platform === "macos" && <div data-tauri-drag-region className="h-(--chrome-height) shrink-0" />}
    </div>
  );
}
