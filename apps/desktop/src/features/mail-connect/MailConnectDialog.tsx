/**
 * "Connect your email" (connect-email.md "Decision — Desktop" + "M5 desktop supplement"): one
 * dialog with a main column and a side column. Picker → Gmail / Outlook sign-in in the system
 * browser (or the calm "coming in an update" state while the server answers
 * `provider_not_configured`) or the app-password form → the lookback scan.
 */
import {
  MAIL_OAUTH_RETURN_REASONS,
  type MailAccount,
  type MailOAuthReturnReason,
  type OAuthMailProvider,
} from "@bfhr/core";
import {
  ArrowLeft,
  CalendarRange,
  ChevronDown,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  LoaderCircle,
  Lock,
  Search,
  Sparkles,
  Unplug,
  X,
} from "lucide-react";
import { Dialog } from "radix-ui";
import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useEffect,
  useEffectEvent,
  useId,
  useRef,
  useState,
} from "react";
import { useIntl } from "react-intl";
import { classifyMailError, type MailCallFailure } from "../../data/mail/errors";
import { useMailData } from "../../data/mail/live";
import { type MailRepository, useMailRepository } from "../../data/mail/repository";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { onMailConnect, openExternal, takeMailConnect } from "../../lib/desktop";
import { useConnectivity } from "../../shared/connectivity";
import { cx } from "../../shared/cx";
import { shortDate } from "../../shared/model/format";
import { Button, IconButton } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { failureMessage, HELP_STEPS, messages, RETURN_MESSAGES } from "./copy";
import {
  choiceForAddress,
  type ConnectView,
  type DraftField,
  draftProblems,
  type ImapChoice,
  type ImapDraft,
  imapRequest,
  initialDraft,
  type LookbackDays,
  lookbackOf,
  OAUTH_PROVIDER,
  type OAuthPhase,
  presetOf,
  PROVIDER_CHOICES,
  type ProviderChoice,
  sinceDate,
} from "./model";
import { CHOICE_CAPTIONS, choiceName, OAUTH_COMPANY, OAUTH_PRODUCT } from "./providers";
import type { MailConnectRequest } from "./request";
import { ScanProgress } from "./ScanProgress";

const LOOKBACKS: readonly LookbackDays[] = [30, 90, 180];
/** "Still waiting?" after this long in the browser. */
const STILL_WAITING_MS = 10 * 60_000;

const controlClass =
  "bg-surface-base border-line-control text-callout text-fg-primary placeholder:text-fg-tertiary w-full min-w-0 rounded-md border px-2 aria-invalid:border-danger-solid disabled:opacity-60";
const fieldClass = `${controlClass} h-8`;
const bold = {
  b: (chunks: ReactNode[]) => <strong className="text-fg-primary font-medium">{chunks}</strong>,
};
const optionalTag = {
  optional: (chunks: ReactNode[]) => <span className="text-fg-tertiary font-normal">{chunks}</span>,
};

function Field({
  id,
  label,
  error,
  hint,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  error?: string | null | undefined;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="text-footnote text-fg-secondary font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-message`} className="text-danger-text text-footnote">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-message`} className="text-fg-tertiary text-footnote">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function useSinceLabel(days: number): string {
  const intl = useIntl();
  const now = useContext(ModelEnvironmentContext).now();
  return shortDate(sinceDate(now, days), {
    intl,
    locale: intl.locale,
    now,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
}

/** The four promises (side column on the picker and sign-in steps). */
function Promises({ days }: { days: LookbackDays }) {
  const intl = useIntl();
  const since = useSinceLabel(days);
  const items: readonly [typeof Search, ReactNode][] = [
    [Search, intl.formatMessage(messages.promiseFind, bold)],
    [CalendarRange, intl.formatMessage(messages.promiseLookback, { ...bold, days, date: since })],
    [Sparkles, intl.formatMessage(messages.promiseSort, bold)],
    [Unplug, intl.formatMessage(messages.promiseDisconnect, bold)],
  ];
  return (
    <section
      className="bg-surface-sunken flex flex-col gap-3 rounded-lg p-4"
      aria-labelledby="mail-connect-promises"
    >
      <h3 id="mail-connect-promises" className="text-footnote text-fg-secondary font-medium">
        {intl.formatMessage(messages.promisesTitle)}
      </h3>
      <ul className="flex flex-col gap-3">
        {items.map(([Icon, text], index) => (
          <li key={index} className="text-footnote text-fg-secondary flex gap-2">
            <Icon
              aria-hidden="true"
              className="text-fg-secondary mt-0.5 size-4 shrink-0"
              strokeWidth={1.75}
            />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The provider's app-password steps (side column of the form). */
function HelpCard({ choice }: { choice: ImapChoice }) {
  const intl = useIntl();
  const url = presetOf(choice)?.appPasswordUrl ?? null;
  const [openFailed, setOpenFailed] = useState(false);
  return (
    <section
      className="bg-surface-sunken flex flex-col gap-3 rounded-lg p-4"
      aria-labelledby="mail-connect-help"
    >
      <h3 id="mail-connect-help" className="text-footnote text-fg-secondary font-medium">
        {intl.formatMessage(messages.helpTitle)}
      </h3>
      {choice === "other" ? (
        <p className="text-footnote text-fg-secondary">{intl.formatMessage(messages.helpOther)}</p>
      ) : (
        <ol className="text-footnote text-fg-primary flex list-decimal flex-col gap-2 ps-4">
          {HELP_STEPS[choice].map((step) => (
            <li key={step.id}>{intl.formatMessage(step)}</li>
          ))}
        </ol>
      )}
      {url && (
        <Button
          size="sm"
          icon={ExternalLink}
          onClick={() => {
            setOpenFailed(false);
            openExternal(url).catch(() => setOpenFailed(true));
          }}
        >
          {intl.formatMessage(messages.helpLink, { provider: choiceName(choice, intl) })}
        </Button>
      )}
      {openFailed && (
        <p role="alert" className="text-footnote text-fg-secondary break-all">
          {url}
        </p>
      )}
    </section>
  );
}

function Picker({
  address,
  onAddress,
  choice,
  onChoice,
  onContinue,
  lookback,
  onLookback,
  offline,
}: {
  address: string;
  onAddress: (value: string) => void;
  choice: ProviderChoice;
  onChoice: (choice: ProviderChoice) => void;
  onContinue: () => void;
  lookback: LookbackDays;
  onLookback: (days: LookbackDays) => void;
  offline: boolean;
}) {
  const intl = useIntl();
  const id = useId();
  const groupLabelId = `${id}-group`;
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const since: Readonly<Record<LookbackDays, string>> = {
    30: useSinceLabel(30),
    90: useSinceLabel(90),
    180: useSinceLabel(180),
  };

  const onTileKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const columns = 2;
    const moves: Readonly<Record<string, number>> = {
      ArrowRight: 1,
      ArrowDown: columns,
      ArrowLeft: -1,
      ArrowUp: -columns,
    };
    const move = moves[event.key];
    if (move !== undefined) {
      event.preventDefault();
      const next = (index + move + PROVIDER_CHOICES.length) % PROVIDER_CHOICES.length;
      const target = PROVIDER_CHOICES[next];
      if (target) onChoice(target);
      tiles.current[next]?.focus();
    } else if (event.key === "Enter") {
      event.preventDefault();
      onContinue();
    }
  };

  return (
    <>
      <Field
        id={`${id}-address`}
        label={intl.formatMessage(messages.addressLabel, optionalTag)}
        hint={intl.formatMessage(messages.addressHint)}
      >
        <input
          id={`${id}-address`}
          type="email"
          autoComplete="email"
          spellCheck={false}
          value={address}
          onChange={(event) => onAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onContinue();
            }
          }}
          aria-describedby={`${id}-address-message`}
          className={fieldClass}
        />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id={groupLabelId} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.providerGroup)}
        </span>
        <div role="radiogroup" aria-labelledby={groupLabelId} className="grid grid-cols-2 gap-2">
          {PROVIDER_CHOICES.map((candidate, index) => {
            const selected = candidate === choice;
            return (
              <button
                key={candidate}
                ref={(element) => {
                  tiles.current[index] = element;
                }}
                type="button"
                role="radio"
                aria-checked={selected}
                tabIndex={selected ? 0 : -1}
                onClick={() => onChoice(candidate)}
                onDoubleClick={onContinue}
                onKeyDown={(event) => onTileKey(event, index)}
                className={cx(
                  "flex min-h-14 flex-col items-start justify-center gap-0.5 rounded-md border px-3 py-2 text-left",
                  selected
                    ? "border-accent-solid bg-surface-selected ring-accent-solid ring-1"
                    : "border-line-subtle hover:bg-surface-hover",
                )}
              >
                <span className="text-callout text-fg-primary font-medium">
                  {choiceName(candidate, intl)}
                </span>
                <span className="text-footnote text-fg-secondary">
                  {intl.formatMessage(CHOICE_CAPTIONS[candidate])}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <Field id={`${id}-lookback`} label={intl.formatMessage(messages.lookbackLabel)} className="max-w-72">
        <select
          id={`${id}-lookback`}
          value={lookback}
          onChange={(event) => onLookback(Number(event.target.value) as LookbackDays)}
          className={fieldClass}
        >
          {LOOKBACKS.map((days) => (
            <option key={days} value={days}>
              {intl.formatMessage(messages.lookbackOption, { days, date: since[days] })}
            </option>
          ))}
        </select>
      </Field>
      {offline && <InlineAlert tone="info" title={intl.formatMessage(messages.offline)} />}
    </>
  );
}

function OAuthStep({
  provider,
  phase,
  reconnect,
  lookback,
  address,
  offline,
  repository,
  onPhase,
  onConnected,
  onUseAppPassword,
  onChooseAnother,
}: {
  provider: OAuthMailProvider;
  phase: OAuthPhase;
  reconnect: boolean;
  lookback: LookbackDays;
  address: string | null;
  offline: boolean;
  repository: MailRepository;
  onPhase: (phase: OAuthPhase) => void;
  onConnected: (accountId: string) => void;
  onUseAppPassword: () => void;
  onChooseAnother: (() => void) | null;
}) {
  const intl = useIntl();
  const company = OAUTH_COMPANY[provider];
  const product = OAUTH_PRODUCT[provider];
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<MailCallFailure | null>(null);
  const [openFailed, setOpenFailed] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // The parent passes fresh callbacks every render; the effects below only follow `phase`.
  const phaseChanged = useEffectEvent(onPhase);
  const finish = useEffectEvent(async (nonce: string, handoff: string) => {
    try {
      const finished = await repository.connectFinish({ nonce, handoff });
      onConnected(finished.accountId);
    } catch (error) {
      setFailure(classifyMailError(error, { online: !offline }));
      onPhase({ step: "intro" });
    }
  });

  const start = async () => {
    setFailure(null);
    setOpenFailed(false);
    if (offline) {
      setFailure({ kind: "offline", field: null });
      return;
    }
    setBusy(true);
    try {
      const response = await repository.connectStart({ provider, lookbackDays: lookback, address });
      onPhase({
        step: "waiting",
        url: response.url,
        nonce: response.nonce,
        expiresAt: Date.parse(response.expiresAt),
        startedAt: Date.now(),
      });
      openExternal(response.url).catch(() => setOpenFailed(true));
    } catch (error) {
      const classified = classifyMailError(error, { online: !offline });
      if (classified.kind === "provider_not_configured") onPhase({ step: "unavailable" });
      else setFailure(classified);
    } finally {
      setBusy(false);
    }
  };

  // Waiting: the return link (matching nonce) hands over to `mailConnectFinish`, which saves the
  // account only for this signed-in user and names the mailbox that was connected.
  const waiting = phase.step === "waiting" ? phase : null;
  useEffect(() => {
    if (waiting === null) return;
    let active = true;
    const take = async () => {
      const result = await takeMailConnect();
      if (!active || result === null || result.nonce !== waiting.nonce) return;
      if (!result.ok || result.handoff === null) {
        const reason = MAIL_OAUTH_RETURN_REASONS.find((known) => known === result.reason) ?? "failed";
        phaseChanged(
          reason === "provider_not_configured" ? { step: "unavailable" } : { step: "error", reason },
        );
        return;
      }
      await finish(result.nonce, result.handoff);
    };
    void take();
    const stop = onMailConnect(() => void take());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      active = false;
      stop();
      window.clearInterval(timer);
    };
  }, [waiting]);

  const intro = (
    <div className="flex flex-col gap-3">
      <p className="text-callout text-fg-primary">{intl.formatMessage(messages.oauthExpect, { company })}</p>
      {provider === "google" && (
        <p className="text-callout text-fg-secondary">{intl.formatMessage(messages.oauthUnverified)}</p>
      )}
      {provider === "microsoft" && (
        <p className="text-callout text-fg-secondary">{intl.formatMessage(messages.oauthKeepAccess)}</p>
      )}
    </div>
  );

  let content: ReactNode;
  let actions: ReactNode;
  if (phase.step === "unavailable") {
    content = (
      <div role="status" className="flex gap-3">
        <Clock aria-hidden="true" className="text-fg-secondary mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
        <div className="flex flex-col gap-2">
          <p className="text-headline text-fg-primary">
            {intl.formatMessage(messages.unavailableTitle, { product })}
          </p>
          <p className="text-callout text-fg-secondary">
            {intl.formatMessage(
              provider === "google" ? messages.unavailableGmail : messages.unavailableOutlook,
            )}
          </p>
          {reconnect && (
            <p className="text-callout text-fg-secondary">
              {intl.formatMessage(messages.unavailableReconnect)}
            </p>
          )}
        </div>
      </div>
    );
    actions = (
      <>
        {provider === "google" && !reconnect && (
          <Button variant="primary" onClick={onUseAppPassword}>
            {intl.formatMessage(messages.useAppPassword)}
          </Button>
        )}
        {onChooseAnother && (
          <Button variant={provider === "google" ? "secondary" : "primary"} onClick={onChooseAnother}>
            {intl.formatMessage(messages.chooseAnother)}
          </Button>
        )}
      </>
    );
  } else if (waiting) {
    const still = now - waiting.startedAt >= STILL_WAITING_MS;
    content = (
      <div className="flex flex-col gap-3">
        <p className="text-headline text-fg-primary">{intl.formatMessage(messages.waitTitle)}</p>
        <p className="text-callout text-fg-secondary">{intl.formatMessage(messages.waitBody, { company })}</p>
        <p role="status" className="text-callout text-fg-primary flex items-center gap-2">
          <LoaderCircle
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin motion-reduce:animate-none"
          />
          {intl.formatMessage(messages.waitStatus, { company })}
        </p>
        {still && <InlineAlert tone="info" title={intl.formatMessage(messages.waitStill)} />}
        {openFailed && <InlineAlert tone="warning" title={intl.formatMessage(messages.openFailed)} />}
      </div>
    );
    actions = (
      <>
        <Button
          onClick={() => {
            // An expired nonce is refused: start over instead of reopening a dead link.
            if (Date.now() >= waiting.expiresAt) void start();
            else openExternal(waiting.url).catch(() => setOpenFailed(true));
          }}
        >
          {intl.formatMessage(messages.openAgain)}
        </Button>
      </>
    );
  } else {
    const returnReason: MailOAuthReturnReason | null = phase.step === "error" ? phase.reason : null;
    content = (
      <>
        {returnReason !== null && returnReason !== "cancelled" && (
          <InlineAlert
            tone="error"
            fromAction
            title={intl.formatMessage(
              returnReason === "scope_missing" ||
                returnReason === "admin_consent_required" ||
                returnReason === "nonce_invalid"
                ? RETURN_MESSAGES[returnReason]
                : RETURN_MESSAGES.failed,
              { company },
            )}
          />
        )}
        {returnReason === "cancelled" && (
          <InlineAlert tone="info" title={intl.formatMessage(RETURN_MESSAGES.cancelled)} />
        )}
        {failure && (
          <InlineAlert tone="error" fromAction title={intl.formatMessage(failureMessage(failure))} />
        )}
        {intro}
      </>
    );
    actions = (
      <Button
        variant="primary"
        icon={ExternalLink}
        loading={busy}
        loadingLabel={intl.formatMessage(messages.oauthStarting, { company })}
        onClick={() => void start()}
      >
        {intl.formatMessage(
          returnReason === null && failure === null ? messages.oauthContinue : messages.tryAgain,
          { company },
        )}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {content}
      <div className="flex flex-wrap gap-2">{actions}</div>
    </div>
  );
}

const FIELD_ORDER: readonly DraftField[] = [
  "address",
  "password",
  "imapHost",
  "imapPort",
  "smtpHost",
  "smtpPort",
];

function ImapForm({
  choice,
  draft,
  onDraft,
  problems,
  failure,
  busy,
  reconnect,
  onSubmit,
}: {
  choice: ImapChoice;
  draft: ImapDraft;
  onDraft: (patch: Partial<ImapDraft>) => void;
  problems: Partial<Record<DraftField, "missing" | "invalid">>;
  failure: MailCallFailure | null;
  busy: boolean;
  reconnect: boolean;
  onSubmit: () => void;
}) {
  const intl = useIntl();
  const id = useId();
  const fieldId = (field: string) => `${id}-${field}`;
  const [showPassword, setShowPassword] = useState(false);
  const serverProblem = (["imapHost", "imapPort", "smtpHost", "smtpPort"] as const).some(
    (field) => problems[field] !== undefined,
  );
  const [serversOpen, setServersOpen] = useState(choice === "other");
  const serversShown =
    serversOpen || serverProblem || failure?.field === "imapHost" || failure?.field === "smtpHost";
  const refs = useRef<Partial<Record<DraftField, HTMLInputElement | null>>>({});

  const serverFailure =
    failure !== null && failure.field !== "password" ? intl.formatMessage(failureMessage(failure)) : null;
  const errorOf = (field: DraftField): string | null => {
    const problem = problems[field];
    if (problem === "missing") return intl.formatMessage(messages.missing);
    if (problem === "invalid") {
      if (field === "address") return intl.formatMessage(messages.invalidAddress);
      if (field === "imapPort" || field === "smtpPort") return intl.formatMessage(messages.invalidPort);
      return intl.formatMessage(messages.invalidHost);
    }
    if (failure?.field === field) return intl.formatMessage(failureMessage(failure));
    return null;
  };
  const invalid = FIELD_ORDER.filter((field) => errorOf(field) !== null);

  // After a failed attempt, focus the first field to fix.
  const problemKey = JSON.stringify([problems, failure]);
  useEffect(() => {
    const first = invalid[0];
    if (first) refs.current[first]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [problemKey]);

  const input = (
    field: DraftField,
    props: { type?: string; autoComplete?: string; inputMode?: "numeric"; className?: string } = {},
  ) => {
    const error = errorOf(field);
    return (
      <input
        id={fieldId(field)}
        ref={(element) => {
          refs.current[field] = element;
        }}
        type={props.type ?? "text"}
        autoComplete={props.autoComplete ?? "off"}
        spellCheck={false}
        inputMode={props.inputMode}
        disabled={busy}
        value={draft[field]}
        onChange={(event) => onDraft({ [field]: event.target.value })}
        aria-invalid={error !== null || undefined}
        aria-describedby={`${fieldId(field)}-message`}
        className={cx(fieldClass, props.className)}
      />
    );
  };

  const securitySelect = (key: "imapSecurity" | "smtpSecurity") => (
    <select
      id={fieldId(key)}
      disabled={busy}
      value={draft[key]}
      onChange={(event) => onDraft({ [key]: event.target.value === "starttls" ? "starttls" : "tls" })}
      className={fieldClass}
    >
      <option value="tls">{intl.formatMessage(messages.securityTls)}</option>
      <option value="starttls">{intl.formatMessage(messages.securityStarttls)}</option>
    </select>
  );

  const server = (kind: "imap" | "smtp") => {
    const hostField = kind === "imap" ? "imapHost" : "smtpHost";
    const portField = kind === "imap" ? "imapPort" : "smtpPort";
    const headingId = fieldId(`${kind}-heading`);
    return (
      <fieldset className="flex min-w-0 flex-col gap-2" disabled={busy}>
        <legend id={headingId} className="text-footnote text-fg-primary mb-1 font-medium">
          {intl.formatMessage(kind === "imap" ? messages.imapServer : messages.smtpServer)}
        </legend>
        <Field
          id={fieldId(hostField)}
          label={intl.formatMessage(messages.host)}
          error={errorOf(hostField)}
          hint={kind === "smtp" && choice === "other" ? intl.formatMessage(messages.smtpOptional) : undefined}
        >
          {input(hostField)}
        </Field>
        <div className="grid grid-cols-[88px_1fr] gap-2">
          <Field id={fieldId(portField)} label={intl.formatMessage(messages.port)} error={errorOf(portField)}>
            {input(portField, { inputMode: "numeric" })}
          </Field>
          <Field id={fieldId(`${kind}Security`)} label={intl.formatMessage(messages.security)}>
            {securitySelect(kind === "imap" ? "imapSecurity" : "smtpSecurity")}
          </Field>
        </div>
      </fieldset>
    );
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit();
  };

  return (
    <form id="mail-connect-imap" noValidate onSubmit={submit} className="flex flex-col gap-4">
      {invalid.length > 1 && (
        <p role="alert" className="text-danger-text text-footnote flex items-center gap-1.5">
          {intl.formatMessage(messages.errorSummary, { count: invalid.length })}
        </p>
      )}
      {failure && failure.field === null && (
        <InlineAlert tone="error" fromAction title={intl.formatMessage(failureMessage(failure))} />
      )}
      {serverFailure && failure?.field !== null && failure?.field !== undefined && (
        <p role="alert" className="sr-only">
          {serverFailure}
        </p>
      )}
      <Field id={fieldId("address")} label={intl.formatMessage(messages.address)} error={errorOf("address")}>
        {input("address", { type: "email", autoComplete: "email" })}
      </Field>
      <Field
        id={fieldId("password")}
        label={intl.formatMessage(messages.password)}
        error={errorOf("password")}
        hint={intl.formatMessage(
          reconnect
            ? messages.passwordReconnect
            : choice === "other"
              ? messages.passwordHintOther
              : messages.passwordHint,
        )}
      >
        <div className="flex gap-2">
          {input("password", { type: showPassword ? "text" : "password", autoComplete: "new-password" })}
          <IconButton
            icon={showPassword ? EyeOff : Eye}
            label={intl.formatMessage(showPassword ? messages.hidePassword : messages.showPassword)}
            pressed={showPassword}
            onClick={() => setShowPassword((current) => !current)}
          />
        </div>
      </Field>
      <p className="text-footnote text-fg-secondary flex gap-1.5">
        <Lock aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        {intl.formatMessage(messages.trust)}
      </p>
      <div className="border-line-subtle flex flex-col gap-3 rounded-md border">
        <button
          type="button"
          aria-expanded={serversShown}
          aria-controls={fieldId("servers")}
          onClick={() => setServersOpen((current) => !current)}
          className="text-callout text-fg-primary hover:bg-surface-hover flex min-h-9 items-center gap-2 rounded-md px-3 text-left"
        >
          <ChevronDown
            aria-hidden="true"
            className={cx(
              "size-4 shrink-0 transition-transform motion-reduce:transition-none",
              !serversShown && "-rotate-90",
            )}
            strokeWidth={1.75}
          />
          {intl.formatMessage(messages.serverDetails)}
        </button>
        {serversShown && (
          <div id={fieldId("servers")} className="flex flex-col gap-4 px-3 pb-3">
            <Field id={fieldId("username")} label={intl.formatMessage(messages.username, optionalTag)}>
              <input
                id={fieldId("username")}
                type="text"
                autoComplete="username"
                spellCheck={false}
                disabled={busy}
                value={draft.username}
                placeholder={draft.address}
                onChange={(event) => onDraft({ username: event.target.value })}
                className={fieldClass}
              />
            </Field>
            <div className="grid grid-cols-1 gap-4 min-[640px]:grid-cols-2">
              {server("imap")}
              {server("smtp")}
            </div>
          </div>
        )}
      </div>
    </form>
  );
}

export function MailConnectDialog({
  request,
  onClose,
  onCloseAutoFocus,
}: {
  request: MailConnectRequest;
  onClose: () => void;
  /** Where focus goes after the dialog closes (the host returns it to the opener). */
  onCloseAutoFocus?: (event: Event) => void;
}) {
  const intl = useIntl();
  const repository = useMailRepository();
  const mail = useMailData();
  const { status: connection } = useConnectivity();
  const offline = connection === "offline";
  const accounts: readonly MailAccount[] = mail.status === "ready" ? mail.data.mailAccounts : [];
  // Fixed at open: the account being reconnected (it may change status while the dialog is up).
  const [reconnecting] = useState<MailAccount | null>(
    () => accounts.find((account) => account.id === request.accountId) ?? null,
  );

  const [view, setView] = useState<ConnectView>(() => {
    if (request.initial) return request.initial.view;
    if (reconnecting === null) return { kind: "picker" };
    if (reconnecting.provider === "gmail")
      return { kind: "oauth", provider: "google", phase: { step: "intro" } };
    if (reconnecting.provider === "microsoft")
      return { kind: "oauth", provider: "microsoft", phase: { step: "intro" } };
    const preset = reconnecting.server?.preset ?? "other";
    return {
      kind: "imap",
      choice:
        preset !== "outlook" && (PROVIDER_CHOICES as readonly string[]).includes(preset)
          ? (preset as ImapChoice)
          : "other",
    };
  });
  const [address, setAddress] = useState(request.initial?.draft?.address ?? reconnecting?.address ?? "");
  const [choice, setChoice] = useState<ProviderChoice>(() => choiceForAddress(address) ?? "gmail");
  const [lookback, setLookback] = useState<LookbackDays>(lookbackOf(reconnecting));
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(request.initial?.failure !== undefined);
  const [failure, setFailure] = useState<MailCallFailure | null>(request.initial?.failure ?? null);
  const [draft, setDraft] = useState<ImapDraft>(() => ({
    ...initialDraft(view.kind === "imap" ? view.choice : "other", address, reconnecting),
    ...request.initial?.draft,
  }));

  const toImap = (next: ImapChoice) => {
    setFailure(null);
    setAttempted(false);
    setDraft(initialDraft(next, address, reconnecting));
    setView({ kind: "imap", choice: next });
  };
  const continueFromPicker = () => {
    const oauth = OAUTH_PROVIDER[choice];
    setFailure(null);
    if (oauth) setView({ kind: "oauth", provider: oauth, phase: { step: "intro" } });
    else toImap(choice as ImapChoice);
  };

  const submitImap = async () => {
    if (view.kind !== "imap") return;
    setFailure(null);
    setAttempted(true);
    if (Object.keys(draftProblems(draft, view.choice)).length > 0) return;
    if (offline) {
      setFailure({ kind: "offline", field: null });
      return;
    }
    setBusy(true);
    try {
      const response = await repository.connectImap(
        imapRequest(draft, view.choice, lookback, reconnecting?.id ?? null),
      );
      setDraft((current) => ({ ...current, password: "" }));
      setView({
        kind: "scanning",
        accountId: response.accountId,
        smtpWarning: response.smtpWarning !== null,
      });
    } catch (error) {
      const classified = classifyMailError(error, { online: !offline });
      if (classified.kind === "oauth_required")
        setView({ kind: "oauth", provider: "microsoft", phase: { step: "unavailable" } });
      else setFailure(classified);
    } finally {
      setBusy(false);
    }
  };

  // Design states and tests can open the form already submitting.
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (request.initial?.submit && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void submitImap();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Each step starts at its first empty field (or its first control): never on Close.
  const contentRef = useRef<HTMLDivElement>(null);
  const focusStep = () => {
    const content = contentRef.current;
    if (!content) return;
    const fields = [...content.querySelectorAll<HTMLInputElement>("[data-step] input:not([disabled])")];
    const target =
      fields.find((input) => input.value === "") ??
      fields[0] ??
      content.querySelector<HTMLElement>('[data-step] [role="radio"][aria-checked="true"]') ??
      content.querySelector<HTMLElement>("[data-step] button, [data-footer] button");
    target?.focus();
  };
  const stepKey = view.kind === "oauth" ? `oauth:${view.phase.step}` : view.kind;
  const firstStep = useRef(true);
  useEffect(() => {
    if (firstStep.current) {
      firstStep.current = false;
      return;
    }
    focusStep();
  }, [stepKey]);

  // One heading per step: the dialog's title names what this step connects.
  const scanned =
    view.kind === "scanning" ? (accounts.find((candidate) => candidate.id === view.accountId) ?? null) : null;
  let title: string;
  if (reconnecting) title = intl.formatMessage(messages.titleReconnect, { address: reconnecting.address });
  else if (view.kind === "oauth")
    title = intl.formatMessage(messages.oauthTitle, { product: OAUTH_PRODUCT[view.provider] });
  else if (view.kind === "imap")
    title = intl.formatMessage(messages.imapTitle, { provider: choiceName(view.choice, intl) });
  else if (scanned) title = intl.formatMessage(messages.connectedTitle, { address: scanned.address });
  else title = intl.formatMessage(messages.title);

  let body: ReactNode;
  let side: ReactNode = <Promises days={lookback} />;
  let footer: ReactNode;
  if (view.kind === "picker") {
    body = (
      <Picker
        address={address}
        onAddress={(value) => {
          setAddress(value);
          const detected = choiceForAddress(value);
          if (detected) setChoice(detected);
        }}
        choice={choice}
        onChoice={setChoice}
        onContinue={continueFromPicker}
        lookback={lookback}
        onLookback={setLookback}
        offline={offline}
      />
    );
    footer = (
      <>
        <Button variant="plain" onClick={onClose}>
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button variant="primary" onClick={continueFromPicker}>
          {intl.formatMessage(messages.continue)}
        </Button>
      </>
    );
  } else if (view.kind === "oauth") {
    body = (
      <OAuthStep
        provider={view.provider}
        phase={view.phase}
        reconnect={reconnecting !== null}
        lookback={lookback}
        address={reconnecting?.address ?? (address.trim() || null)}
        offline={offline}
        repository={repository}
        onPhase={(phase) => setView({ kind: "oauth", provider: view.provider, phase })}
        onConnected={(accountId) => setView({ kind: "scanning", accountId, smtpWarning: false })}
        onUseAppPassword={() => toImap("gmail")}
        onChooseAnother={reconnecting ? null : () => setView({ kind: "picker" })}
      />
    );
    footer = (
      <>
        {!reconnecting && view.phase.step !== "unavailable" && (
          <Button variant="plain" icon={ArrowLeft} onClick={() => setView({ kind: "picker" })}>
            {intl.formatMessage(messages.back)}
          </Button>
        )}
        <span className="flex-1" />
        <Button variant="plain" onClick={onClose}>
          {intl.formatMessage(view.phase.step === "unavailable" ? messages.close : messages.cancel)}
        </Button>
      </>
    );
  } else if (view.kind === "imap") {
    side = <HelpCard choice={view.choice} />;
    body = (
      <ImapForm
        choice={view.choice}
        draft={draft}
        onDraft={(patch) => setDraft((current) => ({ ...current, ...patch }))}
        problems={attempted ? draftProblems(draft, view.choice) : {}}
        failure={failure}
        busy={busy}
        reconnect={reconnecting !== null}
        onSubmit={() => void submitImap()}
      />
    );
    footer = (
      <>
        {!reconnecting && (
          <Button
            variant="plain"
            icon={ArrowLeft}
            disabledReason={busy ? intl.formatMessage(messages.testing) : null}
            onClick={() => setView({ kind: "picker" })}
          >
            {intl.formatMessage(messages.back)}
          </Button>
        )}
        <span className="flex-1" />
        <Button
          variant="plain"
          disabledReason={busy ? intl.formatMessage(messages.testing) : null}
          onClick={onClose}
        >
          {intl.formatMessage(messages.cancel)}
        </Button>
        <Button
          type="submit"
          form="mail-connect-imap"
          variant="primary"
          loading={busy}
          loadingLabel={intl.formatMessage(messages.testing)}
        >
          {intl.formatMessage(messages.submit)}
        </Button>
      </>
    );
  } else {
    const account = accounts.find((candidate) => candidate.id === view.accountId) ?? null;
    side = null;
    const starting = (
      <p role="status" className="text-callout text-fg-secondary flex items-center gap-2">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        {intl.formatMessage(messages.scanStarting)}
      </p>
    );
    body = account ? (
      <div className="flex flex-col gap-4">
        {view.smtpWarning && <InlineAlert tone="warning" title={intl.formatMessage(messages.readingOnly)} />}
        {account.backfill ? <ScanProgress account={account} variant="full" onReview={onClose} /> : starting}
      </div>
    ) : (
      starting
    );
    // "Review in Mail" is the step's one filled button once the scan found emails to review.
    const reviewOffered = account?.backfill?.state === "done" && account.backfill.pendingReview > 0;
    footer = (
      <Button variant={reviewOffered ? "secondary" : "primary"} onClick={onClose}>
        {intl.formatMessage(messages.done)}
      </Button>
    );
  }

  return (
    <Dialog.Root
      open
      onOpenChange={(next) => {
        if (!next && !busy) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          ref={contentRef}
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            focusStep();
          }}
          {...(onCloseAutoFocus && { onCloseAutoFocus })}
          className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] w-[min(760px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col rounded-lg outline-none"
        >
          <div className="flex items-start gap-3 px-5 pt-5 pb-3">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="font-display text-title3 text-fg-primary">{title}</Dialog.Title>
              {view.kind === "picker" && (
                <p className="text-fg-secondary text-callout mt-1">{intl.formatMessage(messages.intro)}</p>
              )}
            </div>
            {!busy && (
              <Dialog.Close asChild>
                <IconButton icon={X} label={intl.formatMessage(messages.close)} />
              </Dialog.Close>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <div className="flex flex-col gap-5 min-[720px]:flex-row">
              <div data-step="" className="flex min-w-0 flex-1 flex-col gap-4">
                {body}
              </div>
              {side && <aside className="flex w-full shrink-0 flex-col gap-3 min-[720px]:w-62">{side}</aside>}
            </div>
          </div>
          {footer && (
            <div
              data-footer=""
              className="border-line-subtle flex flex-wrap items-center justify-end gap-2 border-t px-5 py-3"
            >
              {footer}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
