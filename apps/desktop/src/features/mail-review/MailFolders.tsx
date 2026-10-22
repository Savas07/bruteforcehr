/**
 * Mail's nested sidebar navigation (IA.md § Desktop "Shell", components.md `MailSidebarSection`):
 * To review (n) · Updates · All job mail · Categories (collapsible) · Accounts with a health dot.
 * Portalled under the active Mail row; in the < 640 px icon rail the list header offers the
 * folders instead (`CompactFolders`).
 */
import type { MailCategory } from "@bfhr/core";
import { ChevronRight } from "lucide-react";
import { useId, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { Hint } from "../../shared/ui/Hint";
import { SegmentedControl } from "../../shared/ui/SegmentedControl";
import { SidebarChildItem, SidebarChildren } from "../../shared/ui/SidebarChildren";
import type { MailAccountVM, MailCategoryFolderVM, MailFolderId, MailFolderVM } from "./model";

const messages = defineMessages({
  folders: {
    id: "mail-review.folders.label",
    defaultMessage: "Mail folders",
    description: "Accessible name of Mail's nested sidebar list",
  },
  categories: {
    id: "mail-review.folders.categories",
    defaultMessage: "Categories",
    description: "Collapsible group of mail categories in the sidebar",
  },
  accounts: {
    id: "mail-review.folders.accounts",
    defaultMessage: "Inboxes",
    description: "Group of connected email addresses in the sidebar",
  },
});

/** Keys 1–3 switch folders (IA.md keyboard map). */
export const FOLDER_KEYS: Readonly<Record<MailFolderId, string>> = { review: "1", updates: "2", all: "3" };

const groupRowClass =
  "text-caption1 text-fg-tertiary flex h-7 w-full items-center gap-1 rounded-md pr-2 pl-8 text-left font-medium";

function HealthDot({ account }: { account: MailAccountVM }) {
  if (account.dot === "none") return null;
  return (
    <Hint label={account.healthLabel}>
      <span role="img" aria-label={account.healthLabel} className="inline-flex shrink-0 p-0.5">
        <span className="bg-warning-solid size-2 rounded-full" />
      </span>
    </Hint>
  );
}

export function MailFolders({
  folders,
  categories,
  accounts,
  onFolder,
  onCategory,
}: {
  folders: readonly MailFolderVM[];
  categories: readonly MailCategoryFolderVM[];
  accounts: readonly MailAccountVM[];
  onFolder: (folder: MailFolderId) => void;
  onCategory: (category: MailCategory) => void;
}) {
  const intl = useIntl();
  const categoryListId = useId();
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const categoriesShown = categoriesOpen || categories.some((category) => category.selected);
  return (
    <SidebarChildren destination="mail" label={intl.formatMessage(messages.folders)}>
      {folders.map((folder) => (
        <SidebarChildItem
          key={folder.id}
          current={folder.selected}
          onSelect={() => onFolder(folder.id)}
          {...(folder.id === "review" && folder.count > 0 && { count: folder.count })}
        >
          <Hint label={folder.label} keys={FOLDER_KEYS[folder.id]} side="right">
            <span>{folder.label}</span>
          </Hint>
        </SidebarChildItem>
      ))}
      <li>
        <button
          type="button"
          aria-expanded={categoriesShown}
          aria-controls={categoryListId}
          onClick={() => setCategoriesOpen(!categoriesShown)}
          className={cx(groupRowClass, "hover:bg-surface-hover mt-2 outline-offset-0")}
        >
          <span className="min-w-0 flex-1 truncate">{intl.formatMessage(messages.categories)}</span>
          <ChevronRight
            aria-hidden="true"
            strokeWidth={1.75}
            className={cx(
              "size-3.5 shrink-0 transition-transform duration-(--bfhr-duration-fast)",
              categoriesShown && "rotate-90",
            )}
          />
        </button>
        {categoriesShown && (
          <ul id={categoryListId} className="flex flex-col gap-0.5">
            {categories.map((category) => (
              <SidebarChildItem
                key={category.key}
                current={category.selected}
                onSelect={() => onCategory(category.key)}
              >
                {category.label}
              </SidebarChildItem>
            ))}
          </ul>
        )}
      </li>
      {accounts.length > 0 && (
        <li>
          <p className={cx(groupRowClass, "mt-2")}>{intl.formatMessage(messages.accounts)}</p>
          <ul className="flex flex-col gap-0.5">
            {accounts.map((account) => (
              <li
                key={account.id}
                className="text-callout text-fg-secondary flex min-h-7 items-center gap-2 pr-2 pl-8"
              >
                <Hint label={account.accessibleLabel} side="right">
                  <span className="min-w-0 flex-1 truncate">{account.address}</span>
                </Hint>
                <HealthDot account={account} />
              </li>
            ))}
          </ul>
        </li>
      )}
    </SidebarChildren>
  );
}

/** The three folders as a segmented control while the sidebar is the icon rail (< 640 px). */
export function CompactFolders({
  folders,
  value,
  onFolder,
}: {
  folders: readonly MailFolderVM[];
  value: MailFolderId;
  onFolder: (folder: MailFolderId) => void;
}) {
  const intl = useIntl();
  return (
    <SegmentedControl
      size="sm"
      label={intl.formatMessage(messages.folders)}
      options={folders.map((folder) => ({ value: folder.id, label: folder.label }))}
      value={value}
      onValueChange={onFolder}
    />
  );
}
