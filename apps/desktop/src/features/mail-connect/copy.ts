/**
 * The connect dialog's copy (connect-email.md "Copy notes" and "M5 desktop supplement"): calm and
 * specific, what we read and skip, what happened + how to fix for every error.
 */
import { defineMessages, type MessageDescriptor } from "react-intl";
import type { MailCallFailure } from "../../data/mail/errors";
import type { ImapChoice } from "./model";

export const messages = defineMessages({
  title: { id: "mail-connect.title", defaultMessage: "Connect your email" },
  titleReconnect: { id: "mail-connect.titleReconnect", defaultMessage: "Reconnect {address}" },
  intro: {
    id: "mail-connect.intro",
    defaultMessage:
      "We look for application confirmations, interview invites and replies from employers, then suggest updates you confirm.",
  },
  close: { id: "mail-connect.close", defaultMessage: "Close" },
  cancel: { id: "mail-connect.cancel", defaultMessage: "Cancel" },
  back: { id: "mail-connect.back", defaultMessage: "Back" },
  continue: { id: "mail-connect.continue", defaultMessage: "Continue" },
  done: { id: "mail-connect.done", defaultMessage: "Done" },
  // Picker
  addressLabel: {
    id: "mail-connect.picker.address",
    defaultMessage: "Email address <optional>(optional)</optional>",
  },
  addressHint: {
    id: "mail-connect.picker.addressHint",
    defaultMessage: "We pick your provider from it.",
  },
  providerGroup: { id: "mail-connect.picker.providers", defaultMessage: "Email provider" },
  lookbackLabel: { id: "mail-connect.picker.lookback", defaultMessage: "Look back" },
  lookbackOption: {
    id: "mail-connect.picker.lookbackOption",
    defaultMessage: "{days} days (since {date})",
    description: "{date} is a short date, e.g. 24 Jul 2026",
  },
  offline: {
    id: "mail-connect.offline",
    defaultMessage: "Connecting needs an internet connection. Try again when you're back online.",
  },
  // Promises (side column)
  promisesTitle: { id: "mail-connect.promises.title", defaultMessage: "What we read" },
  promiseFind: {
    id: "mail-connect.promises.find",
    defaultMessage:
      "<b>Finds job emails.</b> We look for messages from employers and job sites. Other emails are skipped, and we never store their content.",
  },
  promiseLookback: {
    id: "mail-connect.promises.lookback",
    defaultMessage: "<b>Looks back {days} days</b> (since {date}), then checks new mail every few minutes.",
  },
  promiseSort: {
    id: "mail-connect.promises.sort",
    defaultMessage:
      "<b>Suggests, you decide.</b> Nothing in your Tracker changes without a reason you can see and undo.",
  },
  promiseDisconnect: {
    id: "mail-connect.promises.disconnect",
    defaultMessage: "<b>Disconnect anytime.</b> We remove our access and delete this account's mail data.",
  },
  // OAuth
  oauthTitle: { id: "mail-connect.oauth.title", defaultMessage: "Connect {product}" },
  oauthExpect: {
    id: "mail-connect.oauth.expect",
    defaultMessage:
      "{company} will ask what BruteForceHR can access. Allow reading your email, or we can't find your applications.",
  },
  oauthUnverified: {
    id: "mail-connect.oauth.unverified",
    defaultMessage:
      "Google may say it hasn't verified this app. That's expected for this personal build: choose Advanced, then continue to BruteForceHR.",
  },
  oauthKeepAccess: {
    id: "mail-connect.oauth.keepAccess",
    defaultMessage:
      "Microsoft will also ask to keep access, so we can check for new messages every few minutes.",
  },
  oauthContinue: { id: "mail-connect.oauth.continue", defaultMessage: "Continue to {company}" },
  oauthStarting: { id: "mail-connect.oauth.starting", defaultMessage: "Opening {company}…" },
  waitTitle: { id: "mail-connect.wait.title", defaultMessage: "Finish in your browser" },
  waitBody: {
    id: "mail-connect.wait.body",
    defaultMessage: "We opened {company} in your browser. Sign in and allow access, then come back here.",
  },
  waitStatus: { id: "mail-connect.wait.status", defaultMessage: "Waiting for {company}…" },
  waitStill: {
    id: "mail-connect.wait.still",
    defaultMessage: "Still waiting? If you closed the browser tab, open it again.",
  },
  openAgain: { id: "mail-connect.wait.openAgain", defaultMessage: "Open browser again" },
  openFailed: {
    id: "mail-connect.wait.openFailed",
    defaultMessage: "We couldn't open your browser. Try Open browser again.",
  },
  tryAgain: { id: "mail-connect.tryAgain", defaultMessage: "Try again" },
  unavailableTitle: {
    id: "mail-connect.unavailable.title",
    defaultMessage: "{product} sign-in is coming in an update",
  },
  unavailableGmail: {
    id: "mail-connect.unavailable.gmail",
    defaultMessage:
      "Connecting with your Google sign-in isn't switched on yet. You can connect Gmail now with an app password: turn on 2-Step Verification in your Google Account, then create an app password for BruteForceHR.",
  },
  unavailableOutlook: {
    id: "mail-connect.unavailable.outlook",
    defaultMessage:
      "Connecting with your Microsoft sign-in isn't switched on yet. Microsoft no longer accepts app passwords for Outlook.com, so Outlook will be ready after that update.",
  },
  unavailableReconnect: {
    id: "mail-connect.unavailable.reconnect",
    defaultMessage: "Until then we keep the emails we already found, and nothing else changes.",
  },
  useAppPassword: {
    id: "mail-connect.unavailable.useAppPassword",
    defaultMessage: "Use an app password instead",
  },
  chooseAnother: { id: "mail-connect.unavailable.chooseAnother", defaultMessage: "Choose another account" },
  // IMAP form
  imapTitle: { id: "mail-connect.imap.title", defaultMessage: "Connect {provider}" },
  helpTitle: { id: "mail-connect.imap.helpTitle", defaultMessage: "Create an app password" },
  helpLink: { id: "mail-connect.imap.helpLink", defaultMessage: "Open {provider} account settings" },
  helpOther: {
    id: "mail-connect.imap.helpOther",
    defaultMessage:
      "Ask your provider for the IMAP and SMTP server names and, if they offer one, an app password.",
  },
  address: { id: "mail-connect.imap.address", defaultMessage: "Email address" },
  password: { id: "mail-connect.imap.password", defaultMessage: "App password" },
  passwordHint: {
    id: "mail-connect.imap.passwordHint",
    defaultMessage: "Not your regular password: the one you created for BruteForceHR.",
  },
  passwordHintOther: {
    id: "mail-connect.imap.passwordHintOther",
    defaultMessage: "An app password if your provider offers them, else your mail password.",
  },
  passwordReconnect: {
    id: "mail-connect.imap.passwordReconnect",
    defaultMessage: "Enter a new app password. The old one isn't shown or kept here.",
  },
  showPassword: { id: "mail-connect.imap.showPassword", defaultMessage: "Show password" },
  hidePassword: { id: "mail-connect.imap.hidePassword", defaultMessage: "Hide password" },
  serverDetails: { id: "mail-connect.imap.serverDetails", defaultMessage: "Server settings" },
  username: {
    id: "mail-connect.imap.username",
    defaultMessage: "User name <optional>(if not your address)</optional>",
  },
  imapServer: { id: "mail-connect.imap.imapServer", defaultMessage: "Incoming (IMAP)" },
  smtpServer: { id: "mail-connect.imap.smtpServer", defaultMessage: "Outgoing (SMTP)" },
  smtpOptional: {
    id: "mail-connect.imap.smtpOptional",
    defaultMessage: "Leave empty to connect for reading only.",
  },
  host: { id: "mail-connect.imap.host", defaultMessage: "Server" },
  port: { id: "mail-connect.imap.port", defaultMessage: "Port" },
  security: { id: "mail-connect.imap.security", defaultMessage: "Security" },
  securityTls: { id: "mail-connect.imap.securityTls", defaultMessage: "SSL/TLS" },
  securityStarttls: { id: "mail-connect.imap.securityStarttls", defaultMessage: "STARTTLS" },
  trust: {
    id: "mail-connect.imap.trust",
    defaultMessage:
      "Sent once over an encrypted connection, tested, then stored encrypted. We never show it again.",
  },
  submit: { id: "mail-connect.imap.submit", defaultMessage: "Test and connect" },
  testing: { id: "mail-connect.imap.testing", defaultMessage: "Testing connection…" },
  errorSummary: {
    id: "mail-connect.imap.errorSummary",
    defaultMessage: "{count, plural, one {One field needs a look} other {# fields need a look}}",
  },
  missing: { id: "mail-connect.imap.missing", defaultMessage: "Enter this to connect." },
  invalidAddress: {
    id: "mail-connect.imap.invalidAddress",
    defaultMessage: "Enter a full email address, like name@example.com.",
  },
  invalidHost: {
    id: "mail-connect.imap.invalidHost",
    defaultMessage: "Enter a server name, like imap.example.com.",
  },
  invalidPort: { id: "mail-connect.imap.invalidPort", defaultMessage: "Enter a port between 1 and 65535." },
  // Scanning
  connectedTitle: { id: "mail-connect.scan.connected", defaultMessage: "Connected to {address}" },
  readingOnly: {
    id: "mail-connect.scan.readingOnly",
    defaultMessage:
      "Connected for reading. Sending applications from this account needs working SMTP settings; you can fix them later with Reconnect.",
  },
  scanStarting: { id: "mail-connect.scan.starting", defaultMessage: "Starting the scan…" },
});

/** The three app-password steps per provider (Gmail as the alternative to Google sign-in). */
export const HELP_STEPS: Readonly<Record<Exclude<ImapChoice, "other">, readonly MessageDescriptor[]>> = {
  gmail: Object.values(
    defineMessages({
      one: {
        id: "mail-connect.help.gmail.1",
        defaultMessage: "Turn on 2-Step Verification in your Google Account.",
      },
      two: {
        id: "mail-connect.help.gmail.2",
        defaultMessage: "Open App passwords and create one named BruteForceHR.",
      },
      three: { id: "mail-connect.help.gmail.3", defaultMessage: "Paste the 16-letter password below." },
    }),
  ),
  icloud: Object.values(
    defineMessages({
      one: {
        id: "mail-connect.help.icloud.1",
        defaultMessage: "Sign in at account.apple.com and open Sign-In and Security.",
      },
      two: {
        id: "mail-connect.help.icloud.2",
        defaultMessage: "Choose App-Specific Passwords and create one named BruteForceHR.",
      },
      three: {
        id: "mail-connect.help.icloud.3",
        defaultMessage: "Paste it below. It looks like xxxx-xxxx-xxxx-xxxx.",
      },
    }),
  ),
  yahoo: Object.values(
    defineMessages({
      one: {
        id: "mail-connect.help.yahoo.1",
        defaultMessage: "Open Account security in your Yahoo account.",
      },
      two: {
        id: "mail-connect.help.yahoo.2",
        defaultMessage: "Choose Generate app password and name it BruteForceHR.",
      },
      three: { id: "mail-connect.help.yahoo.3", defaultMessage: "Paste the password below." },
    }),
  ),
  yandex: Object.values(
    defineMessages({
      one: {
        id: "mail-connect.help.yandex.1",
        defaultMessage: "In Yandex Mail settings, allow access from mail clients (IMAP).",
      },
      two: {
        id: "mail-connect.help.yandex.2",
        defaultMessage: "In Yandex ID › Security, create an app password for Mail.",
      },
      three: { id: "mail-connect.help.yandex.3", defaultMessage: "Paste the password below." },
    }),
  ),
  gmx: Object.values(
    defineMessages({
      one: {
        id: "mail-connect.help.gmx.1",
        defaultMessage: "In GMX settings, open POP3 & IMAP and turn on access for other programs.",
      },
      two: {
        id: "mail-connect.help.gmx.2",
        defaultMessage: "If you use two-factor sign-in, create an app password under Security.",
      },
      three: { id: "mail-connect.help.gmx.3", defaultMessage: "Enter that password below." },
    }),
  ),
  webde: Object.values(
    defineMessages({
      one: {
        id: "mail-connect.help.webde.1",
        defaultMessage: "In WEB.DE settings, open POP3 & IMAP and turn on access for other programs.",
      },
      two: {
        id: "mail-connect.help.webde.2",
        defaultMessage: "If you use two-factor sign-in, create an app password under Security.",
      },
      three: { id: "mail-connect.help.webde.3", defaultMessage: "Enter that password below." },
    }),
  ),
};

const failureMessages = defineMessages({
  auth_failed: {
    id: "mail-connect.error.authFailed",
    defaultMessage:
      "We couldn't sign in with this password. Check it was copied in full. Your regular password usually won't work here.",
  },
  imap_disabled: {
    id: "mail-connect.error.imapDisabled",
    defaultMessage:
      "IMAP access is turned off for this account. Turn it on in your provider's settings, then try again.",
  },
  host_unreachable: {
    id: "mail-connect.error.hostUnreachable",
    defaultMessage: "We can't reach this server. Check the server name and port.",
  },
  tls_failed: {
    id: "mail-connect.error.tlsFailed",
    defaultMessage:
      "The server's security certificate couldn't be verified. Check the security setting or ask your provider.",
  },
  email_unverified: {
    id: "mail-connect.error.emailUnverified",
    defaultMessage: "Confirm your BruteForceHR email address first, then connect your inbox.",
  },
  provider_unavailable: {
    id: "mail-connect.error.providerUnavailable",
    defaultMessage: "Your provider didn't respond. Nothing was saved. Try again in a moment.",
  },
  connect_expired: {
    id: "mail-connect.error.connectExpired",
    defaultMessage: "That sign-in took too long, so nothing was connected. Start again; it only takes a moment.",
  },
  connect_wrong_user: {
    id: "mail-connect.error.connectWrongUser",
    defaultMessage:
      "This sign-in was started from another BruteForceHR account, so nothing was connected. Start again from this account.",
  },
  account_not_found: {
    id: "mail-connect.error.accountNotFound",
    defaultMessage: "This account was disconnected in the meantime. Connect it again as a new account.",
  },
  offline: {
    id: "mail-connect.error.offline",
    defaultMessage:
      "Connecting needs an internet connection. Nothing was saved. Try again when you're back online.",
  },
  failed: {
    id: "mail-connect.error.failed",
    defaultMessage: "We couldn't finish connecting. Nothing was saved. Try again in a moment.",
  },
});

/** What happened + how to fix, for a failed `mailConnectImap` / `mailConnectStart` / `mailConnectFinish`. */
export function failureMessage(failure: MailCallFailure): MessageDescriptor {
  switch (failure.kind) {
    case "auth_failed":
    case "imap_disabled":
    case "host_unreachable":
    case "tls_failed":
    case "email_unverified":
    case "provider_unavailable":
    case "account_not_found":
    case "connect_expired":
    case "connect_wrong_user":
    case "offline":
      return failureMessages[failure.kind];
    default:
      return failureMessages.failed;
  }
}

/** Reasons of the `bruteforcehr://connected` return link. */
export const RETURN_MESSAGES = defineMessages({
  scope_missing: {
    id: "mail-connect.return.scopeMissing",
    defaultMessage:
      "BruteForceHR didn't get permission to read your email. Try again and allow reading your email when {company} asks.",
  },
  admin_consent_required: {
    id: "mail-connect.return.adminConsent",
    defaultMessage:
      "Your organization needs to approve BruteForceHR before it can read this mailbox. Ask your IT admin, or connect a personal account instead.",
  },
  nonce_invalid: {
    id: "mail-connect.return.nonceInvalid",
    defaultMessage: "That sign-in link expired. Start again; it only takes a moment.",
  },
  cancelled: {
    id: "mail-connect.return.cancelled",
    defaultMessage: "You cancelled in the browser. Nothing was connected.",
  },
  failed: {
    id: "mail-connect.return.failed",
    defaultMessage: "We couldn't finish connecting. Nothing was saved. Try again in a moment.",
  },
});
