// Entry of the `auth` functions codebase (email one-time-code sign-in). A separate codebase so the
// API can deploy without the auth secrets and auth deploys stay isolated; see docs/adr/0003.
import "./options";

export { authRequestCode, authVerifyCode } from "./otp/functions";
