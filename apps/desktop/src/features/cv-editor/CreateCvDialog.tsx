/**
 * New CV (blank or from the profile) and new variant (role or language) dialogs. Both end in one
 * `onCreate` with a title and a CV language; what the content is comes from the caller.
 */
import { Dialog } from "radix-ui";
import { type ReactNode, useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button } from "../../shared/ui/Button";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";

/** CV languages (kickoff: English, Turkish, German). */
export const CV_LANGUAGES = ["en", "tr", "de"] as const;
export type CvLanguage = (typeof CV_LANGUAGES)[number];

const messages = defineMessages({
  newTitle: { id: "cv-editor.create.title", defaultMessage: "New CV" },
  newBody: {
    id: "cv-editor.create.body",
    defaultMessage: "Start with an empty page, or with what your profile already has: name, contact details, languages and skills.",
  },
  blank: { id: "cv-editor.create.blank", defaultMessage: "Empty page" },
  fromProfile: { id: "cv-editor.create.fromProfile", defaultMessage: "From your profile" },
  noProfile: {
    id: "cv-editor.create.noProfile",
    defaultMessage: "Your profile is empty for now, so this CV starts as an empty page.",
  },
  start: { id: "cv-editor.create.start", defaultMessage: "Start with" },
  name: { id: "cv-editor.create.name", defaultMessage: "CV name" },
  language: { id: "cv-editor.create.language", defaultMessage: "CV language" },
  languageHint: {
    id: "cv-editor.create.languageHint",
    defaultMessage: "Headings, dates and spell-check follow this language.",
  },
  create: { id: "cv-editor.create.submit", defaultMessage: "Create CV" },
  cancel: { id: "cv-editor.create.cancel", defaultMessage: "Cancel" },
  variantTitle: { id: "cv-editor.variant.title", defaultMessage: "New variant of {title}" },
  variantBody: {
    id: "cv-editor.variant.body",
    defaultMessage: "A variant starts as a copy and stays linked to its base CV, so you can see when the base changes.",
  },
  kind: { id: "cv-editor.variant.kind", defaultMessage: "Variant for" },
  role: { id: "cv-editor.variant.role", defaultMessage: "Another role" },
  languageKind: { id: "cv-editor.variant.language", defaultMessage: "Another language" },
  variantCreate: { id: "cv-editor.variant.submit", defaultMessage: "Create variant" },
  languageVariantNote: {
    id: "cv-editor.variant.languageNote",
    defaultMessage: "The text is copied as it is. Translate it in the editor (Suggestions can help).",
  },
  defaultNewName: { id: "cv-editor.create.defaultName", defaultMessage: "My CV" },
  defaultVariantName: {
    id: "cv-editor.variant.defaultName",
    defaultMessage: "{title} — {label}",
    description: "Default name of a variant: base CV title and the variant's language or 'role variant'",
  },
  roleLabel: { id: "cv-editor.variant.roleLabel", defaultMessage: "role variant" },
});

function languageLabel(tag: string): string {
  const name = new Intl.DisplayNames([tag], { type: "language" }).of(tag) ?? tag;
  return name.charAt(0).toLocaleUpperCase(tag) + name.slice(1);
}

const field = "bg-surface-base border-line-control text-callout text-fg-primary h-8 rounded-md border px-2";

function Frame({
  open,
  onOpenChange,
  title,
  body,
  children,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: string;
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
}) {
  const intl = useIntl();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-surface-scrim fixed inset-0 z-(--bfhr-layer-modal)" />
        <Dialog.Content className="bg-surface-elevated shadow-modal fixed top-1/2 left-1/2 z-(--bfhr-layer-modal) flex w-[min(460px,calc(100vw-32px))] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 rounded-lg p-5">
          <div>
            <Dialog.Title className="font-display text-title3">{title}</Dialog.Title>
            <Dialog.Description className="text-fg-secondary mt-1 text-callout">{body}</Dialog.Description>
          </div>
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            {children}
            <div className="flex justify-end gap-2">
              <Dialog.Close asChild>
                <Button variant="secondary">{intl.formatMessage(messages.cancel)}</Button>
              </Dialog.Close>
              <Button variant="primary" type="submit">
                {submitLabel}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NameField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const intl = useIntl();
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-footnote text-fg-secondary">
        {intl.formatMessage(messages.name)}
      </label>
      <input id={id} required maxLength={120} value={value} onChange={(event) => onChange(event.target.value)} className={field} />
    </div>
  );
}

function LanguageField({ value, onChange, exclude }: { value: CvLanguage; onChange: (value: CvLanguage) => void; exclude?: string }) {
  const intl = useIntl();
  const id = useId();
  const hint = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-footnote text-fg-secondary">
        {intl.formatMessage(messages.language)}
      </label>
      <select id={id} aria-describedby={hint} value={value} onChange={(event) => onChange(event.target.value as CvLanguage)} className={field}>
        {CV_LANGUAGES.filter((tag) => tag !== exclude).map((tag) => (
          <option key={tag} value={tag}>
            {languageLabel(tag)}
          </option>
        ))}
      </select>
      <p id={hint} className="text-fg-tertiary text-footnote">
        {intl.formatMessage(messages.languageHint)}
      </p>
    </div>
  );
}

export function NewCvDialog({
  open,
  onOpenChange,
  hasProfile,
  defaultLanguage,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasProfile: boolean;
  defaultLanguage: CvLanguage;
  onCreate: (input: { title: string; language: CvLanguage; fromProfile: boolean }) => void;
}) {
  const intl = useIntl();
  const [start, setStart] = useState<"blank" | "profile">(hasProfile ? "profile" : "blank");
  const [title, setTitle] = useState(() => intl.formatMessage(messages.defaultNewName));
  const [language, setLanguage] = useState<CvLanguage>(defaultLanguage);
  return (
    <Frame
      open={open}
      onOpenChange={onOpenChange}
      title={intl.formatMessage(messages.newTitle)}
      body={intl.formatMessage(messages.newBody)}
      submitLabel={intl.formatMessage(messages.create)}
      onSubmit={() => onCreate({ title: title.trim(), language, fromProfile: hasProfile && start === "profile" })}
    >
      <div className="flex flex-col gap-1">
        <SegmentedControl
          size="sm"
          label={intl.formatMessage(messages.start)}
          value={hasProfile ? start : "blank"}
          onValueChange={setStart}
          options={[
            {
              value: "profile",
              label: intl.formatMessage(messages.fromProfile),
              disabledReason: hasProfile ? null : intl.formatMessage(messages.noProfile),
            },
            { value: "blank", label: intl.formatMessage(messages.blank) },
          ]}
        />
        {!hasProfile && <p className="text-fg-tertiary text-footnote">{intl.formatMessage(messages.noProfile)}</p>}
      </div>
      <NameField value={title} onChange={setTitle} />
      <LanguageField value={language} onChange={setLanguage} />
    </Frame>
  );
}

export function NewVariantDialog({
  open,
  onOpenChange,
  baseTitle,
  baseLanguage,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  baseTitle: string;
  baseLanguage: string;
  onCreate: (input: { title: string; language: string }) => void;
}) {
  const intl = useIntl();
  const others = CV_LANGUAGES.filter((tag) => tag !== baseLanguage);
  const [kind, setKind] = useState<"role" | "language">("role");
  const [language, setLanguage] = useState<CvLanguage>(others[0] ?? "en");
  const label = kind === "role" ? intl.formatMessage(messages.roleLabel) : languageLabel(language);
  const [title, setTitle] = useState<string | null>(null);
  const shownTitle = title ?? intl.formatMessage(messages.defaultVariantName, { title: baseTitle, label });
  return (
    <Frame
      open={open}
      onOpenChange={onOpenChange}
      title={intl.formatMessage(messages.variantTitle, { title: baseTitle })}
      body={intl.formatMessage(messages.variantBody)}
      submitLabel={intl.formatMessage(messages.variantCreate)}
      onSubmit={() => onCreate({ title: shownTitle.trim(), language: kind === "role" ? baseLanguage : language })}
    >
      <SegmentedControl
        size="sm"
        label={intl.formatMessage(messages.kind)}
        value={kind}
        onValueChange={setKind}
        options={[
          { value: "role", label: intl.formatMessage(messages.role) },
          { value: "language", label: intl.formatMessage(messages.languageKind) },
        ]}
      />
      {kind === "language" && (
        <>
          <LanguageField value={language} onChange={setLanguage} exclude={baseLanguage} />
          <p className="text-fg-secondary text-footnote">{intl.formatMessage(messages.languageVariantNote)}</p>
        </>
      )}
      <NameField value={shownTitle} onChange={setTitle} />
    </Frame>
  );
}
