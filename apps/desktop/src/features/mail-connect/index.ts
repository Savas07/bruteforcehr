/**
 * Connect an email account (connect-email.md): `openMailConnect()` from anywhere; `MailConnectHost`,
 * mounted once in the app's hosts, shows the dialog. `ScanProgress` is the lookback scan's
 * checklist for the dialog, Settings › Mail accounts and Today.
 */
export { MailConnectHost } from "./MailConnectHost";
export { mailProviderName } from "./providers";
export { type MailConnectOptions, openMailConnect } from "./request";
export { ScanProgress } from "./ScanProgress";
