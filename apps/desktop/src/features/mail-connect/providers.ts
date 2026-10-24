/**
 * Provider names (brand names stay untranslated) and the picker's one-line captions: how each
 * provider connects.
 */
import { imapPresetById, type MailAccount, type OAuthMailProvider } from "@bfhr/core";
import { defineMessages, type IntlShape, type MessageDescriptor } from "react-intl";
import type { ProviderChoice } from "./model";

const messages = defineMessages({
  other: {
    id: "mail-connect.provider.other",
    defaultMessage: "Other (IMAP)",
    description: "Provider tile for any IMAP mail server",
  },
  generic: {
    id: "mail-connect.provider.generic",
    defaultMessage: "Email (IMAP)",
    description: "Name of a connected account whose provider isn't one we know",
  },
});

const BRAND_NAMES: Readonly<Record<Exclude<ProviderChoice, "other">, string>> = {
  gmail: "Gmail",
  outlook: "Outlook",
  icloud: "iCloud Mail",
  yahoo: "Yahoo Mail",
  yandex: "Yandex Mail",
  gmx: "GMX",
  webde: "WEB.DE",
};

/** The tile's name. */
export function choiceName(choice: ProviderChoice, intl: IntlShape): string {
  return choice === "other" ? intl.formatMessage(messages.other) : BRAND_NAMES[choice];
}

/** The sign-in provider's company, as in "Continue to Google". */
export const OAUTH_COMPANY: Readonly<Record<OAuthMailProvider, string>> = {
  google: "Google",
  microsoft: "Microsoft",
};

/** The provider's mail product, as in "Connect Gmail". */
export const OAUTH_PRODUCT: Readonly<Record<OAuthMailProvider, string>> = {
  google: "Gmail",
  microsoft: "Outlook",
};

export const CHOICE_CAPTIONS: Readonly<Record<ProviderChoice, MessageDescriptor>> = defineMessages({
  gmail: {
    id: "mail-connect.caption.gmail",
    defaultMessage: "Sign in with Google",
    description: "How the Gmail tile connects",
  },
  outlook: {
    id: "mail-connect.caption.outlook",
    defaultMessage: "Sign in with Microsoft",
    description: "How the Outlook tile connects (Outlook.com, Hotmail, Microsoft 365)",
  },
  icloud: {
    id: "mail-connect.caption.icloud",
    defaultMessage: "App-specific password",
    description: "How the iCloud Mail tile connects (Apple's term)",
  },
  yahoo: {
    id: "mail-connect.caption.yahoo",
    defaultMessage: "App password",
    description: "How the tile connects",
  },
  yandex: {
    id: "mail-connect.caption.yandex",
    defaultMessage: "App password",
    description: "How the tile connects",
  },
  gmx: {
    id: "mail-connect.caption.gmx",
    defaultMessage: "App password",
    description: "How the tile connects",
  },
  webde: {
    id: "mail-connect.caption.webde",
    defaultMessage: "App password",
    description: "How the tile connects",
  },
  other: {
    id: "mail-connect.caption.other",
    defaultMessage: "Server settings and a password",
    description: "How the Other (IMAP) tile connects",
  },
});

/** "Gmail", "Outlook", "iCloud Mail", a preset's label, or "Email (IMAP)". */
export function mailProviderName(account: MailAccount, intl: IntlShape): string {
  if (account.provider === "gmail") return BRAND_NAMES.gmail;
  if (account.provider === "microsoft") return BRAND_NAMES.outlook;
  const presetId = account.server?.preset;
  if (presetId !== undefined && presetId in BRAND_NAMES)
    return BRAND_NAMES[presetId as keyof typeof BRAND_NAMES];
  const preset = presetId === undefined ? undefined : imapPresetById(presetId);
  return preset?.label ?? intl.formatMessage(messages.generic);
}
