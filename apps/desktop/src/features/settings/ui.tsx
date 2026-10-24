/**
 * Building blocks of the Settings panes (settings-account.md "Decision — Desktop"): a section
 * with its `<h2>` and helper line, and a row with a title, helper text and a right-aligned
 * control. Panes render only their sections; the shell (`Screen.tsx`) renders the page `<h1>`.
 */
import { type ReactNode, useId } from "react";

export function SettingsSection({
  id,
  title,
  description,
  actions,
  children,
}: {
  /** Element id, e.g. to scroll a section into view. */
  readonly id?: string;
  readonly title: ReactNode;
  /** One or two lines under the heading. */
  readonly description?: ReactNode;
  /** Buttons at the heading's end ("Add email account"). */
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
}) {
  const headingId = useId();
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className="border-line-subtle flex flex-col gap-3 border-b py-6 first:pt-2 last:border-b-0"
    >
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-60 flex-1">
          <h2 id={headingId} className="text-headline text-fg-primary">
            {title}
          </h2>
          {description !== undefined && (
            <p className="text-callout text-fg-secondary mt-1 max-w-160">{description}</p>
          )}
        </div>
        {actions !== undefined && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/**
 * One setting: title + helper on the left, the control on the right (wraps under the text when
 * the pane is narrow). `labelFor` ties the title to a form control; switches name themselves.
 */
export function SettingsRow({
  title,
  helper,
  labelFor,
  control,
  children,
}: {
  readonly title: ReactNode;
  readonly helper?: ReactNode;
  /** Id of the control the title labels (`<label htmlFor>`). */
  readonly labelFor?: string;
  readonly control?: ReactNode;
  /** Extra content under the row (a status line, an expanded editor). */
  readonly children?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="min-w-60 flex-1">
          {labelFor === undefined ? (
            <p className="text-body text-fg-primary">{title}</p>
          ) : (
            <label htmlFor={labelFor} className="text-body text-fg-primary">
              {title}
            </label>
          )}
          {helper !== undefined && (
            <p className="text-footnote text-fg-secondary mt-0.5 max-w-140">{helper}</p>
          )}
        </div>
        {control !== undefined && <div className="flex shrink-0 items-center gap-2">{control}</div>}
      </div>
      {children}
    </div>
  );
}
