import type { ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useConnectivity } from "../connectivity";

const messages = defineMessages({
  needsConnection: {
    id: "shared.ui.needsConnection.reason",
    defaultMessage: "Needs a connection",
    description: "Tooltip on a server-only action disabled while offline",
  },
});

/**
 * Disables a server-only action in place while offline (states.md rule 6): never hidden, always
 * with a reason. Pass the reason to the action's `disabledReason`, which shows it as the tooltip
 * and accessible description:
 *
 * ```tsx
 * <NeedsConnection explanation="Tailoring runs on our server, so it needs a connection. Your CV is saved on this device.">
 *   {(reason) => <Button disabledReason={reason} onClick={tailor}>Tailor CV</Button>}
 * </NeedsConnection>
 * ```
 */
export function NeedsConnection({
  explanation,
  children,
}: {
  /**
   * Full-sentence reason for this action, replacing the short "Needs a connection" (string table
   * `needsConnection.tailor`). It should still say that it needs a connection.
   */
  explanation?: string;
  /** Renders the action; `reason` is null online and the disabled reason offline. */
  children: (reason: string | null) => ReactNode;
}) {
  const intl = useIntl();
  const { status } = useConnectivity();
  return children(
    status === "offline" ? (explanation ?? intl.formatMessage(messages.needsConnection)) : null,
  );
}
