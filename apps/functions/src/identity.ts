// Entry of the `identity` functions codebase: Identity Platform blocking functions. A separate
// codebase because deploying a blocking function reads and writes the project's Identity Platform
// config, which the release CI service account may not do; the owner deploys it by hand
// (docs/runbooks/release.md, docs/adr/0008-auth-email-link.md).
import "./options";

export { blockPasswordSignUp } from "./block-password-sign-up";
