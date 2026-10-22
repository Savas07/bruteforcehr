// Sign-in code email copy (EN/TR/DE). Tone: calm and plain; the code is the only thing that matters.
// The code stays out of the subject so it doesn't show on lock-screen notification previews.
// German uses "du", Turkish the polite "siz" form, matching the app UI.

export const OTP_LOCALES = ["en", "tr", "de"] as const;
export type OtpLocale = (typeof OTP_LOCALES)[number];

interface CodeEmailCopy {
  subject: string;
  intro: string;
  validity: (minutes: number) => string;
  ignore: string;
  neverShare: string;
}

const COPY: Record<OtpLocale, CodeEmailCopy> = {
  en: {
    subject: "Your BruteForceHR sign-in code",
    intro: "Here’s your code to sign in to BruteForceHR:",
    validity: (minutes) => `It works once and expires in ${minutes} minutes.`,
    ignore: "Didn’t ask for a code? You can ignore this email. No one can sign in without it.",
    neverShare: "Keep this code to yourself. We’ll never ask you for it.",
  },
  tr: {
    subject: "BruteForceHR giriş kodunuz",
    intro: "BruteForceHR’a giriş yapmak için kodunuz:",
    validity: (minutes) => `Kod yalnızca bir kez kullanılabilir ve ${minutes} dakika geçerlidir.`,
    ignore: "Kod istemediyseniz bu e-postayı görmezden gelebilirsiniz. Bu kod olmadan kimse giriş yapamaz.",
    neverShare: "Bu kodu kimseyle paylaşmayın. Sizden bu kodu asla istemeyiz.",
  },
  de: {
    subject: "Dein Anmeldecode für BruteForceHR",
    intro: "Hier ist dein Code für die Anmeldung bei BruteForceHR:",
    validity: (minutes) => `Er gilt einmalig und läuft in ${minutes} Minuten ab.`,
    ignore:
      "Du hast keinen Code angefordert? Dann kannst du diese E-Mail ignorieren. Ohne den Code kann sich niemand anmelden.",
    neverShare: "Gib diesen Code nicht weiter. Wir fragen dich nie danach.",
  },
};

/** Maps a BCP 47 tag ("de-AT", "tr", "en-GB") to a supported locale; anything else gets English. */
export function resolveLocale(tag: string | undefined): OtpLocale {
  const language = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return OTP_LOCALES.find((locale) => locale === language) ?? "en";
}

export interface CodeEmail {
  subject: string;
  text: string;
  html: string;
}

/** `code` must be the generated digits only; it is interpolated into HTML unescaped. */
export function renderCodeEmail(locale: OtpLocale, code: string, validMinutes: number): CodeEmail {
  const copy = COPY[locale];
  const validity = copy.validity(validMinutes);
  const text = [
    copy.intro,
    "",
    code,
    "",
    validity,
    "",
    copy.ignore,
    copy.neverShare,
    "",
    "BruteForceHR",
  ].join("\n");
  const paragraph = (content: string) => `<p style="margin:0 0 16px">${content}</p>`;
  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${copy.subject}</title></head>
<body style="margin:0;padding:24px;background:#ffffff;color:#1f2328;font:16px/1.5 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<div style="max-width:480px;margin:0 auto">
${paragraph(copy.intro)}
<p style="margin:0 0 16px;font:600 32px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:6px">${code}</p>
${paragraph(validity)}
${paragraph(`${copy.ignore}<br>${copy.neverShare}`)}
<p style="margin:24px 0 0;color:#59636e">BruteForceHR</p>
</div>
</body>
</html>
`;
  return { subject: copy.subject, text, html };
}
