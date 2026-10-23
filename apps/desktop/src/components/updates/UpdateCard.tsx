/**
 * The update card in the sidebar footer (docs/design/research/desktop-chrome.md, "Update-available
 * banner"): appears once an update has downloaded and stays until acted on. "Later" collapses it
 * to one line; the narrow rail shows an icon with a dot. It also reports an install that failed.
 */
import { ChevronUp, CircleArrowUp, CircleAlert } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { Hint } from "../../shared/ui/Hint";
import { updateMessages } from "./parts";
import type { UpdateController } from "./useUpdateController";

const messages = defineMessages({
  title: { id: "updates.card.title", defaultMessage: "Update ready" },
  body: {
    id: "updates.card.body",
    defaultMessage:
      "Version {version} is downloaded. Restart when it suits you, or it installs when you quit.",
  },
  later: {
    id: "updates.card.later",
    defaultMessage: "Later",
    description: "Collapses the update card to one line; the update stays ready",
  },
  expand: {
    id: "updates.card.expand",
    defaultMessage: "Update ready: version {version}",
    description: "The collapsed update card (one line) and the rail icon; opens the details",
  },
  failedTitle: { id: "updates.card.failedTitle", defaultMessage: "Couldn’t install the update" },
  failedBody: {
    id: "updates.card.failedBody",
    defaultMessage: "Your current version still works. Try again to download the update once more.",
  },
});

const rowClass =
  "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-callout text-fg-primary hover:bg-surface-hover";

export function UpdateCard({ controller }: { controller: UpdateController }) {
  const intl = useIntl();
  const titleId = useId();
  const { updates, cardCollapsed, setCardCollapsed, requestRestart, openDialog, restarting } = controller;
  const { status } = updates.snapshot;
  // "Later" and the collapsed line replace each other: keep keyboard focus on the replacement.
  const toggled = useRef(false);
  const collapsedRow = useRef<HTMLButtonElement>(null);
  const laterButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!toggled.current) return;
    toggled.current = false;
    (cardCollapsed ? collapsedRow : laterButton).current?.focus();
  }, [cardCollapsed]);
  const toggle = (collapsed: boolean) => {
    toggled.current = true;
    setCardCollapsed(collapsed);
  };

  if (status.state === "failed" && status.step === "install") {
    return (
      <section
        aria-labelledby={titleId}
        className="border-line-subtle bg-surface-base mb-2 flex flex-col gap-2 rounded-md border p-3 narrow:hidden"
      >
        <h2 id={titleId} className="flex items-center gap-2 text-callout font-semibold">
          <CircleAlert aria-hidden="true" className="text-warning-text size-4 shrink-0" strokeWidth={1.75} />
          {intl.formatMessage(messages.failedTitle)}
        </h2>
        <p className="text-fg-secondary text-footnote">{intl.formatMessage(messages.failedBody)}</p>
        <Button size="sm" className="self-start" onClick={updates.check}>
          {intl.formatMessage(updateMessages.tryAgain)}
        </Button>
      </section>
    );
  }
  if (status.state !== "ready") return null;

  const expandLabel = intl.formatMessage(messages.expand, { version: status.version });
  // Visible in the narrow rail only: the icon with a dot opens the details dialog.
  const railButton = (
    <Hint label={expandLabel} side="right">
      <button
        type="button"
        aria-label={expandLabel}
        className="hover:bg-surface-hover relative mb-1 hidden h-8 w-full items-center justify-center rounded-md narrow:flex"
        onClick={() => openDialog("check")}
      >
        <span className="relative flex">
          <CircleArrowUp aria-hidden="true" className="text-accent-text size-4" strokeWidth={1.75} />
          <span
            aria-hidden="true"
            className="bg-accent-solid ring-(--chrome) absolute -top-0.5 -right-1 size-2 rounded-full ring-2"
          />
        </span>
      </button>
    </Hint>
  );

  if (cardCollapsed) {
    return (
      <>
        {railButton}
        <button
          ref={collapsedRow}
          type="button"
          aria-expanded={false}
          aria-label={expandLabel}
          className={`${rowClass} mb-1 narrow:hidden`}
          onClick={() => toggle(false)}
        >
          <CircleArrowUp aria-hidden="true" className="text-accent-text size-4 shrink-0" strokeWidth={1.75} />
          {/* The version would truncate the title in Turkish and German; the name still has it. */}
          <span className="flex-1 truncate text-left">{intl.formatMessage(messages.title)}</span>
          <ChevronUp aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
        </button>
      </>
    );
  }

  return (
    <>
      {railButton}
      <section
        aria-labelledby={titleId}
        className="border-line-subtle bg-surface-base mb-2 flex flex-col gap-2 rounded-md border p-3 narrow:hidden"
      >
        <div className="flex items-center gap-2">
          <CircleArrowUp aria-hidden="true" className="text-accent-text size-4 shrink-0" strokeWidth={1.75} />
          <h2 id={titleId} className="flex-1 text-callout font-semibold">
            {intl.formatMessage(messages.title)}
          </h2>
          <Button
            ref={laterButton}
            variant="plain"
            size="sm"
            className="-my-1 -mr-1.5"
            aria-expanded={true}
            onClick={() => toggle(true)}
          >
            {intl.formatMessage(messages.later)}
          </Button>
        </div>
        <p className="text-fg-secondary text-footnote">
          {intl.formatMessage(messages.body, { version: status.version })}
        </p>
        <Button
          variant="primary"
          size="sm"
          className="w-full"
          loading={restarting}
          loadingLabel={intl.formatMessage(updateMessages.restarting)}
          onClick={requestRestart}
        >
          {intl.formatMessage(updateMessages.restart)}
        </Button>
        <Button variant="plain" size="sm" className="w-full" onClick={() => openDialog("notes")}>
          {intl.formatMessage(updateMessages.whatsNew)}
        </Button>
      </section>
    </>
  );
}
