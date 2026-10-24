/**
 * `conformance/mail.json`: the mail contracts the iOS connect flow and review queue re-implement
 * in BFHRCore (`Mail.swift`): the IMAP app-password presets, preset detection by address, and the
 * status a category moves an application to (`categoryTargetStatus`, used by the review trigger
 * and the automatic decision).
 */
import {
  categoryTargetStatus,
  IMAP_PRESETS,
  imapPresetFor,
  MAIL_ENDPOINT_PORTS,
  MailCategorySchema,
} from "../src/index";

const ADDRESSES = [
  "deniz@gmail.com",
  "Deniz@GoogleMail.com",
  "deniz@icloud.com",
  "deniz@me.com",
  "deniz@hotmail.de",
  "deniz@outlook.com.tr",
  "deniz@yahoo.co.uk",
  "deniz@yandex.com.tr",
  "deniz@gmx.net",
  "deniz@web.de",
  "deniz@example.com",
  "deniz@sub.gmail.com",
];

export function buildMailVectors() {
  return {
    presets: IMAP_PRESETS.map((preset) => ({
      id: preset.id,
      label: preset.label,
      domains: [...preset.domains],
      imap: preset.imap,
      smtp: preset.smtp,
      oauthOnly: preset.oauthOnly,
      appPasswordUrl: preset.appPasswordUrl,
    })),
    presetFor: ADDRESSES.map((address) => ({ address, preset: imapPresetFor(address)?.id ?? null })),
    endpointPorts: MAIL_ENDPOINT_PORTS,
    categoryTargets: MailCategorySchema.options.flatMap((category) =>
      [false, true].map((screening) => ({
        category,
        screening,
        target: categoryTargetStatus(category, screening),
      })),
    ),
  };
}
