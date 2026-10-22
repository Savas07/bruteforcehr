import { describe, expect, it } from "vitest";
import { BrevoSendError, sendWithBrevo, type OutgoingEmail } from "../src/otp/brevo";

const config = { apiKey: "key-123", senderEmail: "signin@example.com", senderName: "BruteForceHR" };
const email: OutgoingEmail = {
  to: "ada@example.com",
  subject: "Your BruteForceHR sign-in code",
  text: "042917",
  html: "<p>042917</p>",
  tags: ["auth-code"],
};

function recordingFetch(response: Response) {
  const requests: { url: string; init: RequestInit | undefined }[] = [];
  const fetchImpl: typeof fetch = async (url, init) => {
    requests.push({ url: String(url), init });
    return response;
  };
  return { fetchImpl, requests };
}

describe("sendWithBrevo", () => {
  it("posts a transactional email with the API key header", async () => {
    const { fetchImpl, requests } = recordingFetch(
      Response.json({ messageId: "<1@relay>" }, { status: 201 }),
    );
    await sendWithBrevo(config, email, fetchImpl);

    expect(requests).toHaveLength(1);
    const [request] = requests;
    expect(request?.url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request?.init?.method).toBe("POST");
    expect(request?.init?.headers).toMatchObject({ "api-key": "key-123" });
    expect(JSON.parse(String(request?.init?.body))).toEqual({
      sender: { email: "signin@example.com", name: "BruteForceHR" },
      to: [{ email: "ada@example.com" }],
      subject: "Your BruteForceHR sign-in code",
      textContent: "042917",
      htmlContent: "<p>042917</p>",
      tags: ["auth-code"],
    });
  });

  it("throws status and Brevo code only, without the response message", async () => {
    const { fetchImpl } = recordingFetch(
      Response.json({ code: "invalid_parameter", message: "ada@example.com is not valid" }, { status: 400 }),
    );
    const error = await sendWithBrevo(config, email, fetchImpl).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(BrevoSendError);
    expect(error).toMatchObject({ status: 400, brevoCode: "invalid_parameter" });
    expect(String(error)).not.toContain("ada@example.com");
  });
});
