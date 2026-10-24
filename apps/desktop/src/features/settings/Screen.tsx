/**
 * Settings (`/settings/$pane`; settings-account.md "Decision — Desktop"): a settings nav (220 px,
 * ↑/↓ moves and opens, Tab leaves it) and the pane in a column of at most 720 px with the pane's
 * name as the page heading. Esc (when nothing else uses it) and "Back" return to where the user
 * was. Changes autosave; each pane shows "Saved" next to what changed.
 */
import { useNavigate, useRouter } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { type KeyboardEvent, useEffect, useRef } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { ScreenTitle } from "../../shared/ui/ScreenTitle";
import { settingsPanes } from "./panes";

const messages = defineMessages({
  title: { id: "settings.title", defaultMessage: "Settings" },
  nav: { id: "settings.nav", defaultMessage: "Settings sections" },
  back: { id: "settings.back", defaultMessage: "Back" },
  leave: { id: "settings.leave", defaultMessage: "Leave Settings" },
});

/**
 * The pane whose nav link takes focus once it is current (arrow keys in the nav). Module state:
 * the route may remount the screen when its `$pane` param changes.
 */
let pendingNavFocus: string | null = null;

function focusNavLinkLater(paneId: string): void {
  pendingNavFocus = paneId;
}

/** Whether `paneId`'s nav link should take focus now (once). */
function takeNavFocus(paneId: string | undefined): boolean {
  if (paneId === undefined || pendingNavFocus !== paneId) return false;
  pendingNavFocus = null;
  return true;
}

export default function SettingsScreen({ pane }: { readonly pane: string }) {
  const intl = useIntl();
  const navigate = useNavigate();
  const router = useRouter();
  const nav = useRef<HTMLUListElement>(null);
  const active = settingsPanes.find((entry) => entry.id === pane) ?? settingsPanes[0];

  const go = (id: string) => void navigate({ to: "/settings/$pane", params: { pane: id }, replace: true });
  const leave = () => {
    if (window.history.length > 1) router.history.back();
    else void navigate({ to: "/today" });
  };

  useKeyBindings([
    {
      id: "settings.leave",
      keys: "Escape",
      label: intl.formatMessage(messages.leave),
      group: intl.formatMessage(messages.title),
      run: leave,
    },
  ]);

  const activeId = active?.id;
  useEffect(() => {
    if (!takeNavFocus(activeId)) return;
    nav.current?.querySelector<HTMLElement>(`[data-pane="${activeId}"]`)?.focus();
  }, [activeId]);

  if (active === undefined) return null;
  const { Pane } = active;
  const title = intl.formatMessage(active.label);

  const onNavKey = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const step = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = settingsPanes[(index + step + settingsPanes.length) % settingsPanes.length];
    if (!next) return;
    focusNavLinkLater(next.id);
    go(next.id);
  };

  return (
    <div className="flex min-h-0 flex-1">
      <nav
        aria-label={intl.formatMessage(messages.nav)}
        className="border-line-subtle flex w-55 shrink-0 flex-col gap-3 border-r px-3 pt-5"
      >
        <Button size="sm" variant="plain" icon={ArrowLeft} className="self-start" onClick={leave}>
          {intl.formatMessage(messages.back)}
        </Button>
        <p className="text-footnote text-fg-secondary px-2 font-medium">
          {intl.formatMessage(messages.title)}
        </p>
        <ul ref={nav} className="flex flex-col gap-0.5">
          {settingsPanes.map((entry, index) => {
            const Icon = entry.icon;
            const current = entry.id === active.id;
            return (
              <li key={entry.id}>
                <a
                  href={`#/settings/${entry.id}`}
                  data-pane={entry.id}
                  aria-current={current ? "page" : undefined}
                  tabIndex={current ? 0 : -1}
                  onClick={(event) => {
                    event.preventDefault();
                    go(entry.id);
                  }}
                  onKeyDown={(event) => onNavKey(event, index)}
                  className={cx(
                    "text-callout text-fg-primary flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1",
                    current ? "bg-surface-selected font-medium" : "hover:bg-surface-hover",
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" strokeWidth={1.75} />
                  {intl.formatMessage(entry.label)}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-180 flex-col px-8 pt-5 pb-12">
          <ScreenTitle title={title} documentTitle={`${title} · ${intl.formatMessage(messages.title)}`} />
          <Pane key={active.id} />
        </div>
      </div>
    </div>
  );
}
