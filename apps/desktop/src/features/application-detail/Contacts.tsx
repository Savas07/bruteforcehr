/**
 * Contacts (BRIEF §4.6): the people linked to this application (`applicationIds` ∋ id) with role,
 * email (copy) and links; add a new one (company prefilled), link one from the address book
 * (a searchable list), edit, or unlink (the contact stays in the address book; Undo relinks).
 */
import { Command } from "cmdk";
import { Copy, ExternalLink, Link2, Link2Off, Pencil, Search, UserPlus } from "lucide-react";
import { Popover } from "radix-ui";
import { useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { Button, IconButton } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { SyncGlyph } from "../../shared/ui/SyncGlyph";
import { Field, FormDialog, Section, TextArea, TextInput } from "./fields";
import { type AddressBookEntryVM, type ContactFields, contactProblem, type ContactVM } from "./model";
import type { DetailActions } from "./useDetailActions";

const messages = defineMessages({
  title: { id: "application-detail.contacts.title", defaultMessage: "Contacts" },
  add: { id: "application-detail.contacts.add", defaultMessage: "Add contact" },
  link: { id: "application-detail.contacts.link", defaultMessage: "Link existing" },
  empty: {
    id: "application-detail.contacts.empty",
    defaultMessage:
      "No contacts yet. Add the recruiter or interviewer you talk to, so their details are here.",
  },
  copyEmail: { id: "application-detail.contacts.copyEmail", defaultMessage: "Copy {email}" },
  edit: { id: "application-detail.contacts.edit", defaultMessage: "Edit {name}" },
  unlink: { id: "application-detail.contacts.unlink", defaultMessage: "Unlink {name}" },
  openLink: { id: "application-detail.contacts.openLink", defaultMessage: "{label} (opens in your browser)" },
  addTitle: { id: "application-detail.contacts.addTitle", defaultMessage: "Add contact" },
  editTitle: { id: "application-detail.contacts.editTitle", defaultMessage: "Edit contact" },
  addBody: {
    id: "application-detail.contacts.addBody",
    defaultMessage: "They're linked to this application and kept in your address book.",
  },
  name: { id: "application-detail.contacts.name", defaultMessage: "Name" },
  email: { id: "application-detail.contacts.email", defaultMessage: "Email" },
  role: { id: "application-detail.contacts.role", defaultMessage: "Role" },
  rolePlaceholder: {
    id: "application-detail.contacts.rolePlaceholder",
    defaultMessage: "Recruiter, Engineering Manager…",
  },
  company: { id: "application-detail.contacts.company", defaultMessage: "Company" },
  notes: { id: "application-detail.contacts.notes", defaultMessage: "Notes" },
  save: { id: "application-detail.contacts.save", defaultMessage: "Save contact" },
  nameMissing: { id: "application-detail.contacts.nameMissing", defaultMessage: "Add a name first." },
  emailInvalid: {
    id: "application-detail.contacts.emailInvalid",
    defaultMessage: "This doesn't look like an email address (name@example.com).",
  },
  pickerLabel: { id: "application-detail.contacts.pickerLabel", defaultMessage: "Search your contacts" },
  pickerPlaceholder: {
    id: "application-detail.contacts.pickerPlaceholder",
    defaultMessage: "Search by name or company",
  },
  pickerEmpty: { id: "application-detail.contacts.pickerEmpty", defaultMessage: "No matching contacts." },
  addressBookEmpty: {
    id: "application-detail.contacts.addressBookEmpty",
    defaultMessage: "Everyone in your address book is already linked.",
  },
});

export function ContactsSection({
  applicationId,
  contacts,
  addressBook,
  newContact,
  actions,
}: {
  applicationId: string;
  contacts: readonly ContactVM[];
  addressBook: readonly AddressBookEntryVM[];
  newContact: ContactFields;
  actions: DetailActions;
}) {
  const intl = useIntl();
  /** The dialog: null closed, "new", or the contact being edited. */
  const [editing, setEditing] = useState<"new" | ContactVM | null>(null);
  return (
    <Section
      title={intl.formatMessage(messages.title)}
      actions={
        <>
          <LinkContactPicker
            entries={addressBook}
            onLink={(contactId) => actions.linkContactById(contactId, applicationId, true)}
          />
          <Button size="sm" variant="plain" icon={UserPlus} onClick={() => setEditing("new")}>
            {intl.formatMessage(messages.add)}
          </Button>
        </>
      }
    >
      {contacts.length === 0 ? (
        <EmptyState kind="subArea" body={intl.formatMessage(messages.empty)} className="px-0 py-0" />
      ) : (
        <ul className="flex flex-col gap-2">
          {contacts.map((contact) => (
            <li
              key={contact.id}
              className="border-line-subtle flex items-start gap-2 rounded-lg border px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <p className="text-callout text-fg-primary flex flex-wrap items-center gap-x-2 font-medium">
                  {contact.name}
                  {contact.pendingSync && <SyncGlyph />}
                </p>
                {(contact.role ?? contact.company) !== null && (
                  <p className="text-footnote text-fg-secondary">
                    {[contact.role, contact.company].filter(Boolean).join(" · ")}
                  </p>
                )}
                {contact.email !== null && (
                  <p className="text-footnote text-fg-primary flex min-w-0 items-center gap-1">
                    <span className="truncate">{contact.email}</span>
                    <IconButton
                      icon={Copy}
                      size="sm"
                      label={intl.formatMessage(messages.copyEmail, { email: contact.email })}
                      onClick={() => actions.copyEmail(contact.email ?? "")}
                    />
                  </p>
                )}
                {contact.links.length > 0 && (
                  <p className="flex flex-wrap gap-x-3">
                    {contact.links.map((link) => (
                      <button
                        key={link.url}
                        type="button"
                        aria-label={intl.formatMessage(messages.openLink, { label: link.label })}
                        className="text-accent-text text-footnote inline-flex min-h-6 items-center gap-1 rounded-xs hover:underline"
                        onClick={() => actions.openLink(link.url)}
                      >
                        {link.label}
                        <ExternalLink aria-hidden="true" className="size-3" strokeWidth={1.75} />
                      </button>
                    ))}
                  </p>
                )}
                {contact.notes !== "" && (
                  <p className="text-footnote text-fg-secondary line-clamp-2 text-pretty">{contact.notes}</p>
                )}
              </div>
              <span className="flex shrink-0 gap-0.5">
                <IconButton
                  icon={Pencil}
                  size="sm"
                  label={intl.formatMessage(messages.edit, { name: contact.name })}
                  onClick={() => setEditing(contact)}
                />
                <IconButton
                  icon={Link2Off}
                  size="sm"
                  label={intl.formatMessage(messages.unlink, { name: contact.name })}
                  onClick={() => actions.linkContactById(contact.id, applicationId, false)}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
      {editing !== null && (
        <ContactDialog
          initial={editing === "new" ? newContact : editing.draft}
          isNew={editing === "new"}
          onClose={() => setEditing(null)}
          onSave={(fields) => {
            actions.saveContactFields(fields, applicationId, editing === "new" ? null : editing.id);
            setEditing(null);
          }}
        />
      )}
    </Section>
  );
}

function ContactDialog({
  initial,
  isNew,
  onClose,
  onSave,
}: {
  initial: ContactFields;
  isNew: boolean;
  onClose: () => void;
  onSave: (fields: ContactFields) => void;
}) {
  const intl = useIntl();
  const [fields, setFields] = useState(initial);
  const set = (key: keyof ContactFields) => (event: { target: { value: string } }) =>
    setFields((previous) => ({ ...previous, [key]: event.target.value }));
  const problem = contactProblem(fields);
  return (
    <FormDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={intl.formatMessage(isNew ? messages.addTitle : messages.editTitle)}
      {...(isNew && { description: intl.formatMessage(messages.addBody) })}
      submitLabel={intl.formatMessage(messages.save)}
      submitDisabledReason={
        problem === "name"
          ? intl.formatMessage(messages.nameMissing)
          : problem === "email"
            ? intl.formatMessage(messages.emailInvalid)
            : null
      }
      onSubmit={() => onSave(fields)}
    >
      <Field label={intl.formatMessage(messages.name)}>
        <TextInput value={fields.name} onChange={set("name")} autoComplete="off" required />
      </Field>
      <Field
        label={intl.formatMessage(messages.email)}
        optional
        problem={problem === "email" ? intl.formatMessage(messages.emailInvalid) : null}
      >
        <TextInput type="email" value={fields.email} onChange={set("email")} autoComplete="off" />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={intl.formatMessage(messages.role)} optional>
          <TextInput
            value={fields.role}
            onChange={set("role")}
            placeholder={intl.formatMessage(messages.rolePlaceholder)}
          />
        </Field>
        <Field label={intl.formatMessage(messages.company)} optional>
          <TextInput value={fields.company} onChange={set("company")} />
        </Field>
      </div>
      <Field label={intl.formatMessage(messages.notes)} optional>
        <TextArea rows={3} value={fields.notes} onChange={set("notes")} />
      </Field>
    </FormDialog>
  );
}

const itemClass =
  "text-callout text-fg-primary data-[selected=true]:bg-surface-hover flex min-h-8 cursor-default flex-col items-start justify-center rounded-sm px-2 py-1 outline-none";

/** "Link existing": a popover with a searchable list of the contacts not linked yet. */
function LinkContactPicker({
  entries,
  onLink,
}: {
  entries: readonly AddressBookEntryVM[];
  onLink: (contactId: string) => void;
}) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <Button size="sm" variant="plain" icon={Link2}>
          {intl.formatMessage(messages.link)}
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          className="bg-surface-elevated text-fg-primary border-line-subtle shadow-overlay z-(--bfhr-layer-popover) flex w-[min(320px,calc(100vw-32px))] flex-col overflow-hidden rounded-lg border"
        >
          {entries.length === 0 ? (
            <p className="text-fg-secondary text-callout px-3 py-4">
              {intl.formatMessage(messages.addressBookEmpty)}
            </p>
          ) : (
            <Command label={intl.formatMessage(messages.pickerLabel)} loop>
              <div className="border-line-subtle flex items-center gap-2 border-b px-3">
                <Search aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
                <Command.Input
                  autoFocus
                  aria-label={intl.formatMessage(messages.pickerLabel)}
                  placeholder={intl.formatMessage(messages.pickerPlaceholder)}
                  className="placeholder:text-fg-tertiary text-callout h-10 flex-1 bg-transparent outline-none"
                />
              </div>
              <Command.List className="max-h-64 overflow-y-auto p-1.5">
                <Command.Empty className="text-fg-secondary text-callout px-2 py-4 text-center">
                  {intl.formatMessage(messages.pickerEmpty)}
                </Command.Empty>
                {entries.map((entry) => (
                  <Command.Item
                    key={entry.id}
                    value={`${entry.label} ${entry.email ?? ""} ${entry.id}`}
                    onSelect={() => {
                      setOpen(false);
                      onLink(entry.id);
                    }}
                    className={itemClass}
                  >
                    <span>{entry.label}</span>
                    {entry.email !== null && (
                      <span className="text-fg-secondary text-footnote">{entry.email}</span>
                    )}
                  </Command.Item>
                ))}
              </Command.List>
            </Command>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
