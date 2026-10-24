/**
 * Mounted once in the signed-in shell, inside the mail providers: opens "Connect your email" on
 * `openMailConnect()` (and `openMailConnectAt` for the design build's states). Closing unmounts
 * the dialog, so every connect starts fresh and no password stays in memory.
 */
import { useEffect, useState } from "react";
import { MailConnectDialog } from "./MailConnectDialog";
import { type MailConnectRequest, onMailConnectRequest } from "./request";

export function MailConnectHost() {
  const [request, setRequest] = useState<MailConnectRequest | null>(null);
  useEffect(() => onMailConnectRequest((next) => setRequest((current) => current ?? next)), []);
  if (request === null) return null;
  return <MailConnectDialog request={request} onClose={() => setRequest(null)} />;
}
