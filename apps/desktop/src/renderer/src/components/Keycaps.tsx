import { keycaps, spokenShortcut, type Shortcut } from "../../../shared/shortcuts";

/** Platform keycaps (`⌘ K` / `Ctrl K`) with a spoken label for screen readers. */
export function Keycaps({ shortcut }: { shortcut: Shortcut }) {
  const { platform } = window.bfhr;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      <span className="sr-only">{spokenShortcut(shortcut, platform)}</span>
      {keycaps(shortcut, platform).map((key) => (
        <kbd
          key={key}
          aria-hidden="true"
          className="bg-keycap text-muted inline-flex h-5 min-w-5 items-center justify-center rounded px-1 font-sans text-[11px] leading-none font-medium"
        >
          {key}
        </kbd>
      ))}
    </span>
  );
}
