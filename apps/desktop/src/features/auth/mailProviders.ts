/**
 * Which webmail inbox "Open …" opens on the "Check your email" screen, by the address's domain.
 * Other domains (work addresses, desktop mail apps) get no button: there's no reliable way to open
 * the default mail app's inbox without starting a new message (onboarding-signin.md, OQ 3).
 */
import type { MailProvider } from "../../lib/desktop";

export interface WebmailInbox {
  readonly provider: MailProvider;
  /** Product name on the button ("Open Gmail"); not translated. */
  readonly name: string;
}

const providers: readonly (WebmailInbox & { readonly domains: readonly string[] })[] = [
  { provider: "gmail", name: "Gmail", domains: ["gmail.com", "googlemail.com"] },
  {
    provider: "outlook",
    name: "Outlook",
    domains: [
      "outlook.com",
      "outlook.de",
      "outlook.com.tr",
      "hotmail.com",
      "hotmail.de",
      "hotmail.co.uk",
      "live.com",
      "live.de",
      "live.co.uk",
      "msn.com",
    ],
  },
  { provider: "icloud", name: "iCloud Mail", domains: ["icloud.com", "me.com", "mac.com"] },
  {
    provider: "yahoo",
    name: "Yahoo Mail",
    domains: ["yahoo.com", "yahoo.de", "yahoo.co.uk", "yahoo.com.tr", "ymail.com"],
  },
  { provider: "proton", name: "Proton Mail", domains: ["proton.me", "protonmail.com", "pm.me"] },
  { provider: "gmx", name: "GMX", domains: ["gmx.de", "gmx.net", "gmx.com", "gmx.at", "gmx.ch"] },
  { provider: "web-de", name: "WEB.DE", domains: ["web.de"] },
  { provider: "yandex", name: "Yandex Mail", domains: ["yandex.com", "yandex.com.tr", "yandex.ru"] },
];

/** The inbox for `email`'s domain, or null for any other address. */
export function webmailInboxFor(email: string): WebmailInbox | null {
  const domain = email.slice(email.lastIndexOf("@") + 1).toLowerCase();
  const match = providers.find((candidate) => candidate.domains.includes(domain));
  return match ? { provider: match.provider, name: match.name } : null;
}
