// In-process IMAP (imapkit, implicit TLS) and SMTP (smtp-server, STARTTLS) for tests; no Docker,
// no network. SMTP deliveries land in the IMAP INBOX, so a send can be read back.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import imapkit from "imapkit";
import { SMTPServer } from "smtp-server";
import type { ImapCredentials, ImapTestOptions } from "./imap";

export const TEST_USER = "deniz@mail.example";
export const TEST_PASSWORD = "abcd-efgh-ijkl-mnop";

const require = createRequire(import.meta.url);
const certDir = path.join(path.dirname(require.resolve("imapkit/package.json")), "cert");
const credentials = {
  key: readFileSync(path.join(certDir, "server.key")),
  cert: readFileSync(path.join(certDir, "server.crt")),
};

export interface TestMailServers {
  imap: ReturnType<typeof imapkit>;
  imapPort: number;
  smtpPort: number;
  credentials: ImapCredentials;
  test: ImapTestOptions;
  /** Raw messages accepted by SMTP. */
  smtpReceived: { from: string; to: string[]; raw: Buffer }[];
  stop(): Promise<void>;
}

export function rfc822(input: {
  from: string;
  subject: string;
  body: string;
  date?: Date;
  messageId?: string;
  headers?: Record<string, string>;
}): string {
  const lines = [
    `From: ${input.from}`,
    `To: ${TEST_USER}`,
    `Subject: ${input.subject}`,
    `Date: ${(input.date ?? new Date()).toUTCString()}`,
    `Message-ID: ${input.messageId ?? `<${Math.random().toString(36).slice(2)}@sender.example>`}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    ...Object.entries(input.headers ?? {}).map(([name, value]) => `${name}: ${value}`),
    "",
    input.body,
    "",
  ];
  return lines.join("\r\n");
}

export async function startTestMailServers(): Promise<TestMailServers> {
  const imap = imapkit({
    plugins: ["ENABLE", "CONDSTORE", "SPECIAL-USE", "UIDPLUS", "ID"],
    users: { [TEST_USER]: { password: TEST_PASSWORD } },
    storage: {
      INBOX: {},
      "": {
        separator: "/",
        folders: {
          Junk: { "special-use": "\\Junk" },
          Sent: { "special-use": "\\Sent" },
          Drafts: { "special-use": "\\Drafts" },
        },
      },
    },
    credentials,
    tls: { port: 0, host: "127.0.0.1" },
  });
  await imap.start(0, "127.0.0.1");
  const address = imap.tlsServer?.address();
  if (address === undefined || address === null || typeof address === "string") throw new Error("no TLS listener");
  const imapPort = address.port;

  const smtpReceived: TestMailServers["smtpReceived"] = [];
  const smtp = new SMTPServer({
    ...credentials,
    secure: false,
    authMethods: ["PLAIN", "LOGIN"],
    onAuth(auth, _session, callback) {
      if (auth.username === TEST_USER && auth.password === TEST_PASSWORD) callback(null, { user: auth.username });
      else callback(new Error("535 5.7.8 Authentication credentials invalid"));
    },
    onData(stream, session, callback) {
      const chunks: Buffer[] = [];
      stream.on("data", (chunk: Buffer) => chunks.push(chunk));
      stream.on("end", () => {
        const raw = Buffer.concat(chunks);
        smtpReceived.push({
          from: session.envelope.mailFrom === false ? "" : session.envelope.mailFrom.address,
          to: session.envelope.rcptTo.map((rcpt) => rcpt.address),
          raw,
        });
        if (session.envelope.rcptTo.some((rcpt) => rcpt.address === TEST_USER)) imap.control.addMessage("INBOX", { raw });
        callback();
      });
    },
    logger: false,
  });
  const smtpPort = await new Promise<number>((resolve) => {
    smtp.listen(0, "127.0.0.1", () => {
      const smtpAddress = smtp.server.address();
      resolve(typeof smtpAddress === "object" && smtpAddress !== null ? smtpAddress.port : 0);
    });
  });

  return {
    imap,
    imapPort,
    smtpPort,
    credentials: {
      username: TEST_USER,
      password: TEST_PASSWORD,
      imap: { host: "127.0.0.1", port: imapPort, security: "tls" },
      smtp: { host: "127.0.0.1", port: smtpPort, security: "starttls" },
      smtpSavesSent: false,
    },
    test: { allowPrivateHosts: true, tls: { rejectUnauthorized: false } },
    smtpReceived,
    async stop() {
      await new Promise<void>((resolve) => smtp.close(() => resolve()));
      await imap.stop();
    },
  };
}
