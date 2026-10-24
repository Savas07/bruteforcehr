/**
 * Settings › Mail accounts (settings-account.md "Decision — Desktop", connect-email.md "Settings ›
 * Mail accounts (desktop)"): one card per connected address with its health (icon + text, amber,
 * never red), the running scan, sending ability and IMAP server details; Reconnect when needed,
 * Check now, Scan again and Disconnect… (AlertDialog, Keep connected focused) in the overflow.
 */
import type { MailAccount } from "@bfhr/core";
import { CircleAlert, CircleCheck, Info, LoaderCircle, Mail, MoreHorizontal, Plus, RefreshCw, ScanSearch, Unplug } from "lucide-react";
import { AlertDialog, DropdownMenu } from "radix-ui";
import { useContext, useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useMailData } from "../../data/mail/live";
import { useMailRepository } from "../../data/mail/repository";
import { ModelEnvironmentContext } from "../../data/tracker/model";
import { useConnectivity } from "../../shared/connectivity";
import { relativeTime } from "../../shared/model/format";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { MenuContent, MenuItem, MenuSeparator, MenuSub } from "../../shared/ui/Menu";
import { PaneError } from "../../shared/ui/PaneError";
import { SkeletonBlock, SkeletonRegion } from "../../shared/ui/Skeleton";
import { useToast } from "../../shared/ui/Toast";
import { mailProviderName, openMailConnect, ScanProgress } from "../mail-connect";
import { SettingsSection } from "./ui";

const messages = defineMessages({
  title: { id: "settings.mail.title", defaultMessage: "Connected inboxes" },
  description: {
    id: "settings.mail.description",
    defaultMessage: "We only keep emails about your job search. Everything else is skipped and never stored.",
  },
  add: { id: "settings.mail.add", defaultMessage: "Add email account" },
  emptyTitle: { id: "settings.mail.emptyTitle", defaultMessage: "No inbox connected" },
  emptyBody: {
    id: "settings.mail.emptyBody",
    defaultMessage: "Connect your email and we'll find replies about your applications, then ask before changing anything.",
  },
  loading: { id: "settings.mail.loading", defaultMessage: "Loading your inboxes" },
  errorTitle: { id: "settings.mail.errorTitle", defaultMessage: "We couldn't load your inboxes" },
  errorBody: { id: "settings.mail.errorBody", defaultMessage: "Your connections are fine. Try again in a moment." },
  statusOk: { id: "settings.mail.status.ok", defaultMessage: "Up to date · checked {time}" },
  statusNeverChecked: { id: "settings.mail.status.neverChecked", defaultMessage: "Connected · first check soon" },
  statusSyncing: { id: "settings.mail.status.syncing", defaultMessage: "Checking for new mail…" },
  statusReauth: { id: "settings.mail.status.reauth", defaultMessage: "Needs reconnecting" },
  statusError: { id: "settings.mail.status.error", defaultMessage: "Can't connect right now" },
  reauthBody: {
    id: "settings.mail.reauthBody",
    defaultMessage: "We paused checking this inbox. Reconnect to pick up where we left off.",
  },
  errorBodyAccount: {
    id: "settings.mail.errorBodyAccount",
    defaultMessage: "We'll keep trying every few minutes. If it continues, reconnect with a new app password.",
  },
  canSend: { id: "settings.mail.canSend", defaultMessage: "Can send applications" },
  readingOnly: { id: "settings.mail.readingOnly", defaultMessage: "Reading only" },
  serverDetails: { id: "settings.mail.serverDetails", defaultMessage: "Server details" },
  serverImap: { id: "settings.mail.serverImap", defaultMessage: "Incoming: {host}:{port} ({security})" },
  serverSmtp: { id: "settings.mail.serverSmtp", defaultMessage: "Outgoing: {host}:{port} ({security})" },
  serverNoSmtp: { id: "settings.mail.serverNoSmtp", defaultMessage: "Outgoing: not set up" },
  serverUser: { id: "settings.mail.serverUser", defaultMessage: "User name: {username}" },
  spamIncluded: {
    id: "settings.mail.spamIncluded",
    defaultMessage: "We also check Spam/Junk: employers' emails often land there.",
  },
  reconnect: { id: "settings.mail.reconnect", defaultMessage: "Reconnect" },
  more: { id: "settings.mail.more", defaultMessage: "More actions for {address}" },
  checkNow: { id: "settings.mail.checkNow", defaultMessage: "Check now" },
  checking: { id: "settings.mail.checking", defaultMessage: "Checking {address} now" },
  scanAgain: { id: "settings.mail.scanAgain", defaultMessage: "Scan again" },
  scanDays: { id: "settings.mail.scanDays", defaultMessage: "The last {days} days" },
  scanStarted: { id: "settings.mail.scanStarted", defaultMessage: "Scanning the last {days} days of {address}" },
  actionFailed: {
    id: "settings.mail.actionFailed",
    defaultMessage: "That didn't go through. Check your connection and try again.",
  },
  disconnect: { id: "settings.mail.disconnect", defaultMessage: "Disconnect…" },
  disconnectTitle: { id: "settings.mail.disconnectTitle", defaultMessage: "Disconnect {address}?" },
  disconnectBody: {
    id: "settings.mail.disconnectBody",
    defaultMessage:
      "We'll stop checking this inbox, remove our access at {provider}, and delete {count, plural, =0 {the job emails we stored from it} one {the # job email we stored from it} other {the # job emails we stored from it}}. Your applications and their history stay.",
  },
  keepConnected: { id: "settings.mail.keepConnected", defaultMessage: "Keep connected" },
  disconnectConfirm: { id: "settings.mail.disconnectConfirm", defaultMessage: "Disconnect and delete email data" },
  disconnecting: { id: "settings.mail.disconnecting", defaultMessage: "Disconnecting…" },
  disconnected: {
    id: "settings.mail.disconnected",
    defaultMessage: "{address} disconnected. {count, plural, =0 {No emails were stored.} one {# email deleted.} other {# emails deleted.}}",
  },
  needsConnection: { id: "settings.mail.needsConnection", defaultMessage: "Needs an internet connection" },
});

type Health = "ok" | "syncing" | "reauth" | "error";

function healthOf(account: MailAccount): Health {
  if (account.status === "needs_reauth") return "reauth";
  if (account.status === "error") return "error";
  if (account.status === "syncing") return "syncing";
  return "ok";
}

function AccountCard({ account, stored }: { account: MailAccount; stored: number }) {
  const intl = useIntl();
  const toast = useToast();
  const repository = useMailRepository();
  const environment = useContext(ModelEnvironmentContext);
  const { status: connection } = useConnectivity();
  const offline = connection === "offline";
  const offlineReason = offline ? intl.formatMessage(messages.needsConnection) : null;
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = useId();
  const provider = mailProviderName(account, intl);
  const health = healthOf(account);
  const now = environment.now();
  const ctx = {
    intl,
    locale: intl.locale,
    now,
    timeZone: environment.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  };

  const run = (action: () => Promise<void>, success: string) => {
    action().then(
      () => toast.show({ variant: "info", message: success }),
      () => toast.show({ variant: "info", message: intl.formatMessage(messages.actionFailed) }),
    );
  };

  const disconnect = async () => {
    setDisconnecting(true);
    try {
      const { deletedMessages } = await repository.disconnect(account.id);
      setConfirming(false);
      toast.show({
        variant: "info",
        message: intl.formatMessage(messages.disconnected, { address: account.address, count: deletedMessages }),
      });
    } catch {
      toast.show({ variant: "info", message: intl.formatMessage(messages.actionFailed) });
    } finally {
      setDisconnecting(false);
    }
  };

  let statusIcon;
  let statusText: string;
  if (health === "reauth") {
    statusIcon = <CircleAlert aria-hidden="true" className="text-warning-text size-4 shrink-0" strokeWidth={1.75} />;
    statusText = intl.formatMessage(messages.statusReauth);
  } else if (health === "error") {
    statusIcon = <CircleAlert aria-hidden="true" className="text-warning-text size-4 shrink-0" strokeWidth={1.75} />;
    statusText = intl.formatMessage(messages.statusError);
  } else if (health === "syncing") {
    statusIcon = (
      <LoaderCircle aria-hidden="true" className="text-fg-secondary size-4 shrink-0 animate-spin motion-reduce:animate-none" />
    );
    statusText = intl.formatMessage(messages.statusSyncing);
  } else {
    statusIcon = <CircleCheck aria-hidden="true" className="text-success-text size-4 shrink-0" strokeWidth={1.75} />;
    statusText = account.lastSyncedAt
      ? intl.formatMessage(messages.statusOk, { time: relativeTime(account.lastSyncedAt, ctx).label })
      : intl.formatMessage(messages.statusNeverChecked);
  }
  const needsAction = health === "reauth" || health === "error";
  const security = (value: "tls" | "starttls") => (value === "tls" ? "SSL/TLS" : "STARTTLS");

  return (
    <li className="border-line-subtle flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-start gap-3">
        <Mail aria-hidden="true" className="text-fg-secondary mt-0.5 size-5 shrink-0" strokeWidth={1.75} />
        <div className="flex min-w-60 flex-1 flex-col gap-0.5">
          <p className="text-body text-fg-primary break-all">{account.address}</p>
          <p className="text-footnote text-fg-secondary">
            {provider} · {intl.formatMessage(account.canSend ? messages.canSend : messages.readingOnly)}
          </p>
          <p className="text-footnote text-fg-primary mt-1 flex items-center gap-1.5">
            {statusIcon}
            {statusText}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {needsAction && (
            <Button size="sm" variant="primary" disabledReason={offlineReason} onClick={() => openMailConnect({ accountId: account.id })}>
              {intl.formatMessage(messages.reconnect)}
            </Button>
          )}
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <IconButton icon={MoreHorizontal} label={intl.formatMessage(messages.more, { address: account.address })} />
            </DropdownMenu.Trigger>
            <MenuContent align="end" aria-label={intl.formatMessage(messages.more, { address: account.address })}>
              <MenuItem
                icon={RefreshCw}
                disabledReason={offlineReason}
                onSelect={() =>
                  run(() => repository.syncNow(account.id), intl.formatMessage(messages.checking, { address: account.address }))
                }
              >
                {intl.formatMessage(messages.checkNow)}
              </MenuItem>
              <MenuSub label={intl.formatMessage(messages.scanAgain)}>
                {([30, 90, 180] as const).map((days) => (
                  <MenuItem
                    key={days}
                    icon={ScanSearch}
                    disabledReason={offlineReason}
                    onSelect={() =>
                      run(
                        () => repository.backfillStart(account.id, days),
                        intl.formatMessage(messages.scanStarted, { days, address: account.address }),
                      )
                    }
                  >
                    {intl.formatMessage(messages.scanDays, { days })}
                  </MenuItem>
                ))}
              </MenuSub>
              {!needsAction && (
                <MenuItem icon={RefreshCw} disabledReason={offlineReason} onSelect={() => openMailConnect({ accountId: account.id })}>
                  {intl.formatMessage(messages.reconnect)}
                </MenuItem>
              )}
              <MenuSeparator />
              <MenuItem icon={Unplug} destructive disabledReason={offlineReason} onSelect={() => setConfirming(true)}>
                {intl.formatMessage(messages.disconnect)}
              </MenuItem>
            </MenuContent>
          </DropdownMenu.Root>
        </div>
      </div>
      {health === "reauth" && <InlineAlert tone="warning" title={intl.formatMessage(messages.reauthBody)} />}
      {health === "error" && (
        <InlineAlert tone="warning" title={intl.formatMessage(messages.errorBodyAccount)}>
          {account.lastError?.message}
        </InlineAlert>
      )}
      {account.backfill && (account.backfill.state === "queued" || account.backfill.state === "running" || account.backfill.state === "failed") && (
        <ScanProgress account={account} variant="compact" />
      )}
      <p className="text-footnote text-fg-secondary flex gap-1.5">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.75} />
        {intl.formatMessage(messages.spamIncluded)}
      </p>
      {account.server && (
        <div>
          <Button size="sm" variant="plain" aria-expanded={detailsOpen} aria-controls={detailsId} onClick={() => setDetailsOpen((open) => !open)}>
            {intl.formatMessage(messages.serverDetails)}
          </Button>
          {detailsOpen && (
            <ul id={detailsId} className="text-footnote text-fg-secondary mt-1 flex flex-col gap-0.5 ps-3">
              <li>{intl.formatMessage(messages.serverUser, { username: account.server.username })}</li>
              <li>
                {intl.formatMessage(messages.serverImap, {
                  host: account.server.imap.host,
                  port: account.server.imap.port,
                  security: security(account.server.imap.security),
                })}
              </li>
              <li>
                {account.server.smtp
                  ? intl.formatMessage(messages.serverSmtp, {
                      host: account.server.smtp.host,
                      port: account.server.smtp.port,
                      security: security(account.server.smtp.security),
                    })
                  : intl.formatMessage(messages.serverNoSmtp)}
              </li>
            </ul>
          )}
        </div>
      )}
      <AlertDialog.Root open={confirming} onOpenChange={(open) => !disconnecting && setConfirming(open)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
          <AlertDialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-lg px-6 py-5">
            <AlertDialog.Title className="font-display text-title3 text-fg-primary break-all">
              {intl.formatMessage(messages.disconnectTitle, { address: account.address })}
            </AlertDialog.Title>
            <AlertDialog.Description className="text-fg-secondary text-callout">
              {intl.formatMessage(messages.disconnectBody, { provider, count: stored })}
            </AlertDialog.Description>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <AlertDialog.Cancel asChild>
                <Button disabledReason={disconnecting ? intl.formatMessage(messages.disconnecting) : null}>
                  {intl.formatMessage(messages.keepConnected)}
                </Button>
              </AlertDialog.Cancel>
              <Button
                variant="destructive"
                loading={disconnecting}
                loadingLabel={intl.formatMessage(messages.disconnecting)}
                onClick={() => void disconnect()}
              >
                {intl.formatMessage(messages.disconnectConfirm)}
              </Button>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </li>
  );
}

export function MailAccountsPane() {
  const intl = useIntl();
  const mail = useMailData();
  const add = (
    <Button icon={Plus} onClick={() => openMailConnect()}>
      {intl.formatMessage(messages.add)}
    </Button>
  );
  let body;
  if (mail.status === "loading") {
    body = (
      <SkeletonRegion
        loading
        label={intl.formatMessage(messages.loading)}
        skeleton={<SkeletonBlock className="h-28 w-full rounded-lg" />}
      >
        {null}
      </SkeletonRegion>
    );
  } else if (mail.status === "error") {
    body = (
      <PaneError
        title={intl.formatMessage(messages.errorTitle)}
        body={intl.formatMessage(messages.errorBody)}
        onRetry={mail.retry}
      />
    );
  } else {
    const accounts = mail.data.mailAccounts.filter((account) => account.status !== "disconnected");
    body =
      accounts.length === 0 ? (
        <EmptyState
          kind="firstUse"
          glyph={Mail}
          title={intl.formatMessage(messages.emptyTitle)}
          body={intl.formatMessage(messages.emptyBody)}
          primary={{ label: intl.formatMessage(messages.add), onClick: () => openMailConnect() }}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {accounts.map((account) => (
            <AccountCard
              key={account.id}
              account={account}
              stored={mail.data.mailMessages.filter((message) => message.accountId === account.id).length}
            />
          ))}
        </ul>
      );
  }
  return (
    <SettingsSection
      title={intl.formatMessage(messages.title)}
      description={intl.formatMessage(messages.description)}
      {...(mail.status === "ready" &&
        mail.data.mailAccounts.some((account) => account.status !== "disconnected") && { actions: add })}
    >
      {body}
    </SettingsSection>
  );
}
