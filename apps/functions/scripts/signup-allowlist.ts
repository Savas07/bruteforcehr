// Invite-only sign-up allowlist in `serverOnly/signup` (docs/runbooks/accounts.md). Only new accounts
// are checked; existing users always sign in again.
//
//   gcloud auth application-default login   # once; the owner account
//   pnpm --filter @bfhr/functions signup:allow list
//   pnpm --filter @bfhr/functions signup:allow add someone@example.com
//   pnpm --filter @bfhr/functions signup:allow remove someone@example.com
//   pnpm --filter @bfhr/functions signup:allow add-domain example.com
//   pnpm --filter @bfhr/functions signup:allow remove-domain example.com
import { serverOnlyPaths } from "@bfhr/api";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

initializeApp({ projectId: "bruteforcehr" });
const ref = getFirestore().doc(serverOnlyPaths.signupConfig());
const [command = "list", value = ""] = process.argv.slice(2);
const entry = value.trim().toLowerCase().replace(/^@/u, "");

switch (command) {
  case "list":
    // Creates the document with empty lists when it's missing (the gate refuses everyone either way).
    if (!(await ref.get()).exists) await ref.create({ allowedEmails: [], allowedDomains: [] });
    break;
  case "add":
  case "remove":
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(entry)) throw new Error(`not an email address: ${value}`);
    await ref.set(
      { allowedEmails: command === "add" ? FieldValue.arrayUnion(entry) : FieldValue.arrayRemove(entry) },
      { merge: true },
    );
    break;
  case "add-domain":
  case "remove-domain":
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/u.test(entry)) throw new Error(`not a domain: ${value}`);
    await ref.set(
      {
        allowedDomains:
          command === "add-domain" ? FieldValue.arrayUnion(entry) : FieldValue.arrayRemove(entry),
      },
      { merge: true },
    );
    break;
  default:
    throw new Error(
      "usage: signup:allow list | add <email> | remove <email> | add-domain <d> | remove-domain <d>",
    );
}
const snapshot = await ref.get();
console.log(
  JSON.stringify({
    allowedEmails: snapshot.get("allowedEmails"),
    allowedDomains: snapshot.get("allowedDomains"),
  }),
);
