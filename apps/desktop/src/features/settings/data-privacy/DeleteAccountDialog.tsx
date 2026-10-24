/**
 * "Delete your account?" (settings-account.md: Lovable itemized list, Fireflies safe-first buttons,
 * Render disabled-until-valid). "Keep my account" has the initial focus; Esc and Enter never delete
 * (Enter in the field does nothing). "Delete everything" needs the typed word and a sign-in less
 * than 5 minutes old; otherwise the dialog sends a fresh sign-in link first (DeleteFlow).
 */
import { Check } from "lucide-react";
import { Dialog } from "radix-ui";
import { useEffect, useId, useMemo, useRef, useSyncExternalStore } from "react";
import { useIntl } from "react-intl";
import { Button } from "../../../shared/ui/Button";
import { InlineAlert } from "../../../shared/ui/InlineAlert";
import { ProgressNote } from "../../../shared/ui/ProgressNote";
import { linkErrorCopy, sendErrorMessage, signInMessages } from "../../auth/SignIn";
import { useAuth } from "../../auth/session";
import type { AccountDataBackend } from "./backend";
import { matchesConfirmWord } from "./confirmWord";
import {
  type DeleteBlocker,
  deleteBlockerOf,
  DeleteFlow,
  type DeleteView,
  reauthPanelOf,
} from "./deleteFlow";
import { commonMessages, deleteMessages } from "./messages";

function ReauthPanel({ flow }: { flow: DeleteFlow }) {
  const intl = useIntl();
  const auth = useAuth();
  const view = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const panel = reauthPanelOf(view, auth.reauth);
  if (panel === null) return null;
  const email = auth.state.status === "signed-in" ? (auth.state.email ?? "") : "";

  switch (panel.step) {
    case "done":
      return (
        <p role="status" className="text-callout text-fg-primary flex items-start gap-2">
          <Check aria-hidden="true" strokeWidth={2} className="text-success-text mt-0.5 size-4 shrink-0" />
          {intl.formatMessage(deleteMessages.reauthDone)}
        </p>
      );
    case "completing":
      return <ProgressNote label={intl.formatMessage(signInMessages.completing)} />;
    case "send-error":
      return (
        <InlineAlert
          tone="error"
          fromAction
          title={sendErrorMessage(intl, panel.error)}
          action={{ label: intl.formatMessage(commonMessages.retry), onClick: auth.sendReauthLink }}
        />
      );
    case "link-error": {
      const copy = linkErrorCopy[panel.error === "wrong-email" ? "invalid" : panel.error];
      return (
        <InlineAlert
          tone="error"
          fromAction
          title={intl.formatMessage(copy.title)}
          action={{ label: intl.formatMessage(deleteMessages.reauthSend), onClick: auth.sendReauthLink }}
        >
          {intl.formatMessage(copy.body)}
        </InlineAlert>
      );
    }
    case "needed":
    case "sending":
    case "sent":
      return (
        <div className="border-line-subtle flex flex-col items-start gap-2 rounded-md border p-3">
          <p className="text-callout text-fg-primary font-semibold">
            {intl.formatMessage(deleteMessages.reauthTitle)}
          </p>
          <p role={panel.step === "sent" ? "status" : undefined} className="text-callout text-fg-secondary">
            {panel.step === "sent"
              ? intl.formatMessage(deleteMessages.reauthSent, { email: panel.email })
              : intl.formatMessage(deleteMessages.reauthBody, { email })}
          </p>
          <Button
            size="md"
            variant={panel.step === "sent" ? "plain" : "secondary"}
            className={panel.step === "sent" ? "-ml-3" : ""}
            loading={panel.step === "sending"}
            onClick={auth.sendReauthLink}
          >
            {intl.formatMessage(deleteMessages.reauthSend)}
          </Button>
        </div>
      );
  }
}

export function DeleteAccountDialog({
  open,
  backend,
  initial,
  online,
  onClose,
  onExportFirst,
  onCloseAutoFocus,
}: {
  open: boolean;
  backend: AccountDataBackend;
  /** Design build: the state to open in. */
  initial?: DeleteView | undefined;
  online: boolean;
  onClose: () => void;
  onExportFirst: () => void;
  onCloseAutoFocus: () => void;
}) {
  const intl = useIntl();
  const auth = useAuth();
  const fieldId = useId();
  const listId = useId();
  const keepButton = useRef<HTMLButtonElement | null>(null);
  const { signOutAfterDeletion, endReauth } = auth;
  const flow = useMemo(
    () => new DeleteFlow(backend, { onDeleted: signOutAfterDeletion, onSignInTooOld: endReauth }, initial),
    // One flow per opening (the pane remounts the dialog with a new key).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const view = useSyncExternalStore(flow.subscribe, flow.getSnapshot);
  const word = intl.formatMessage(deleteMessages.confirmWord);
  const wordMatches = matchesConfirmWord(view.typed, word, intl.locale);
  const blocker = deleteBlockerOf(view, auth.reauth, { online, wordMatches });
  const deleting = view.phase === "deleting";

  useEffect(() => {
    if (open && initial === undefined) void flow.checkSignIn();
  }, [open, flow, initial]);

  const blockerText: Readonly<Record<DeleteBlocker, string>> = {
    offline: intl.formatMessage(commonMessages.offline),
    "type-word": intl.formatMessage(deleteMessages.confirmLabel, { word }),
    reauth: intl.formatMessage(deleteMessages.reauthTitle),
  };

  const close = () => {
    if (deleting) return;
    endReauth();
    onClose();
  };

  const items = [
    deleteMessages.item1,
    deleteMessages.item2,
    deleteMessages.item3,
    deleteMessages.item4,
    deleteMessages.item5,
    deleteMessages.item6,
  ];

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && close()}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            keepButton.current?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            onCloseAutoFocus();
          }}
          aria-describedby={listId}
          className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex max-h-[calc(100vh-48px)] w-[min(520px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto rounded-lg p-5"
        >
          <Dialog.Title className="font-display text-title3">
            {intl.formatMessage(deleteMessages.dialogTitle)}
          </Dialog.Title>
          <div
            id={listId}
            className="bg-surface-sunken border-line-subtle flex flex-col gap-2 rounded-md border p-3"
          >
            <p className="text-callout text-fg-primary font-semibold">
              {intl.formatMessage(deleteMessages.dialogLead)}
            </p>
            <ul className="text-callout text-fg-primary flex list-disc flex-col gap-1 pl-5">
              {items.map((item) => (
                <li key={item.id}>{intl.formatMessage(item)}</li>
              ))}
            </ul>
            <p className="text-callout text-fg-primary font-semibold">
              {intl.formatMessage(deleteMessages.irreversible)}
            </p>
          </div>
          {!deleting && (
            <div>
              <Button variant="plain" size="sm" className="-ml-2" onClick={onExportFirst}>
                {intl.formatMessage(deleteMessages.exportFirst)}
              </Button>
            </div>
          )}
          <div className="flex flex-col gap-1">
            <label htmlFor={fieldId} className="text-callout text-fg-primary">
              {intl.formatMessage(deleteMessages.confirmLabel, {
                word: <strong className="font-mono font-semibold">{word}</strong>,
              })}
            </label>
            <input
              id={fieldId}
              type="text"
              value={view.typed}
              readOnly={deleting}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              onChange={(event) => flow.type(event.target.value)}
              // Enter never deletes: the destructive action is a deliberate click or Space.
              onKeyDown={(event) => event.key === "Enter" && event.preventDefault()}
              className="bg-surface-base border-line-control text-body text-fg-primary h-9 rounded-md border px-2 font-mono"
            />
          </div>
          <ReauthPanel flow={flow} />
          {deleting && <ProgressNote label={intl.formatMessage(deleteMessages.progress)} />}
          {view.phase === "failed" && (
            <InlineAlert tone="error" fromAction title={intl.formatMessage(deleteMessages.errorGeneric)} />
          )}
          <div className="flex flex-wrap justify-end gap-2">
            {/* While deleting, closing is ignored (`close`) rather than disabled, so focus can stay here. */}
            <Button ref={keepButton} onClick={close}>
              {intl.formatMessage(deleteMessages.keep)}
            </Button>
            <Button
              variant="destructive"
              loading={deleting}
              disabledReason={blocker === null ? null : blockerText[blocker]}
              onClick={() => void flow.submit()}
            >
              {intl.formatMessage(view.phase === "failed" ? commonMessages.retry : deleteMessages.submit)}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
