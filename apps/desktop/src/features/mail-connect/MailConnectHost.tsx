/**
 * Mounted once in the signed-in shell, inside the mail providers: opens "Connect your email" on
 * `openMailConnect()` (and `openMailConnectAt` for the design build's states). Closing unmounts
 * the dialog, so every connect starts fresh and no password stays in memory.
 */
import { useEffect, useRef, useState } from "react";
import { MailConnectDialog } from "./MailConnectDialog";
import { type MailConnectRequest, onMailConnectRequest } from "./request";

export function MailConnectHost() {
  const [request, setRequest] = useState<MailConnectRequest | null>(null);
  // The dialog has no trigger (Settings, Mail, Today, the reauth callout open it): focus goes
  // back to whatever had it.
  const opener = useRef<HTMLElement | null>(null);
  useEffect(
    () =>
      onMailConnectRequest((next) => {
        opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setRequest((current) => current ?? next);
      }),
    [],
  );
  if (request === null) return null;
  return (
    <MailConnectDialog
      request={request}
      onClose={() => setRequest(null)}
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (opener.current?.isConnected) opener.current.focus();
      }}
    />
  );
}
