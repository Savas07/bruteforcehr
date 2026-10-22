// Brevo transactional email API: https://developers.brevo.com/reference/send-transac-email
import { z } from "zod";

const BREVO_SEND_URL = "https://api.brevo.com/v3/smtp/email";
const SEND_TIMEOUT_MS = 10_000;

export interface BrevoConfig {
  apiKey: string;
  senderEmail: string;
  senderName: string;
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
  tags: string[];
}

const brevoErrorSchema = z.object({ code: z.string() });

/** Carries only Brevo's status and error code: response messages can echo recipient addresses. */
export class BrevoSendError extends Error {
  constructor(
    readonly status: number,
    readonly brevoCode: string | undefined,
  ) {
    super(`Brevo send failed: HTTP ${status}${brevoCode ? ` (${brevoCode})` : ""}`);
    this.name = "BrevoSendError";
  }
}

export async function sendWithBrevo(
  config: BrevoConfig,
  email: OutgoingEmail,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const response = await fetchImpl(BREVO_SEND_URL, {
    method: "POST",
    headers: {
      "api-key": config.apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { email: config.senderEmail, name: config.senderName },
      to: [{ email: email.to }],
      subject: email.subject,
      textContent: email.text,
      htmlContent: email.html,
      tags: email.tags,
    }),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => undefined);
    throw new BrevoSendError(response.status, brevoErrorSchema.safeParse(body).data?.code);
  }
}
