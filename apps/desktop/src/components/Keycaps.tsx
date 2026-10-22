import { chrome } from "../lib/desktop";
import { keycaps, spokenShortcut, type Shortcut } from "../lib/shortcuts";

/** Platform keycaps (`⌘ K` / `Ctrl K`) with a spoken label for screen readers. */
export function Keycaps({ shortcut }: { shortcut: Shortcut }) {
  const { platform } = chrome;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <span className="sr-only">{spokenShortcut(shortcut, platform)}</span>
      {keycaps(shortcut, platform).map((key) => (
        <kbd
          key={key}
          aria-hidden="true"
          className="bg-surface-sunken text-fg-secondary inline-flex h-5 min-w-5 items-center justify-center rounded-xs px-1 font-sans text-caption2 leading-none font-medium"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
