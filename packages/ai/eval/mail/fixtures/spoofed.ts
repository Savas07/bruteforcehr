import type { MailEvalCase, MailEvalMessage } from "../types";

/**
 * Mail that must never change the tracker by itself (docs/adr/0012-mail-sync.md "Linking" and
 * "Decision"): a forged `From` that claims an ATS or the company's own domain (the provider's
 * DMARC/DKIM check failed, `authenticated: false`), and genuine-looking mail that landed in the
 * spam folder. Each names the right company and role, so the classification and the link are
 * right; only the decision differs: it goes to review. Same fictional parties and applications
 * as the main set; not part of the recorded classification set (`auth-gate.test.ts` checks them
 * with the rules and with a model that is fully convinced by them).
 */
function msg(
  name: string,
  address: string,
  subject: string,
  receivedAt: string,
  bodyText: string,
  extra: Partial<MailEvalMessage> = {},
): MailEvalMessage {
  return {
    from: { name, address },
    subject,
    bodyText,
    receivedAt,
    folder: "inbox",
    threadId: null,
    inReplyTo: null,
    listUnsubscribe: false,
    bulk: true,
    ...extra,
  };
}

export const SPOOFED_CASES: MailEvalCase[] = [
  {
    id: "en-spoof-01",
    language: "en",
    origin: "template",
    hard: "Greenhouse rejection wording and sender, but the From domain failed DMARC.",
    message: msg(
      "Northwind Ledger Hiring Team",
      "no-reply@us.greenhouse-mail.io",
      "Your application to Northwind Ledger",
      "2026-09-02T10:05:00-04:00",
      `Hi Deniz,

Thank you for applying for the Senior Backend Engineer position at Northwind Ledger. Unfortunately, we have decided to move forward with other candidates whose experience more closely matches our needs.

We wish you the best in your search.

The Northwind Ledger Talent Team`,
      { authenticated: false },
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-northwind-backend",
      suggestedStatus: "rejected",
      company: "Northwind Ledger",
      role: "Senior Backend Engineer",
    },
  },
  {
    id: "en-spoof-02",
    language: "en",
    origin: "synthetic",
    hard: "Claims the company's own domain for an interview invite; no aligned DKIM, DMARC fail.",
    message: msg(
      "Harbor Analytics Recruiting",
      "careers@harbor-analytics.example",
      "Interview invitation: Data Engineer",
      "2026-09-03T15:40:00+01:00",
      `Hi Deniz,

Thanks for applying for the Data Engineer role at Harbor Analytics. We'd like to invite you to a technical interview with the data platform team. Please reply with a few times that work for you next week.

Best,
Harbor Analytics Recruiting`,
      { authenticated: false, bulk: false },
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-harbor-data",
      suggestedStatus: "interviewing",
      company: "Harbor Analytics",
      role: "Data Engineer",
    },
  },
  {
    id: "en-spoof-03",
    language: "en",
    origin: "template",
    hard: "Authenticated Lever rejection, but it was filed in the spam folder.",
    message: msg(
      "Canalworks",
      "no-reply@hire.lever.co",
      "Update on your Canalworks application",
      "2026-09-05T09:12:00+02:00",
      `Hi Deniz,

Thank you for applying for the Staff Software Engineer role at Canalworks. Unfortunately, we won't be moving forward with your application at this time.

Canalworks Recruiting

Sent with Lever`,
      { folder: "spam" },
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-canalworks-staff",
      suggestedStatus: "rejected",
      company: "Canalworks",
      role: "Staff Software Engineer",
    },
  },
  {
    id: "tr-spoof-01",
    language: "tr",
    origin: "synthetic",
    hard: "Kariyer.net-style rejection from the company's domain; DMARC failed.",
    message: msg(
      "Kervan Teknoloji İK",
      "ik@kervan-tech.example",
      "Backend Geliştirici başvurunuz hakkında",
      "2026-09-04T11:20:00+03:00",
      `Merhaba Deniz,

Kervan Teknoloji'deki Backend Geliştirici pozisyonuna gösterdiğiniz ilgi için teşekkür ederiz. Maalesef bu aşamada başvurunuzla ilerleyemeyeceğimizi bildirmek isteriz.

Kariyerinizde başarılar dileriz.
Kervan Teknoloji İnsan Kaynakları`,
      { authenticated: false, bulk: false },
    ),
    expected: {
      category: "rejection",
      applicationId: "tr-app-kervan",
      suggestedStatus: "rejected",
      company: "Kervan Teknoloji",
      role: "Backend Geliştirici",
    },
  },
  {
    id: "tr-spoof-02",
    language: "tr",
    origin: "synthetic",
    hard: "Genuine-looking interview invite from the company's domain, filed in spam.",
    message: msg(
      "Ege Veri Analitik",
      "kariyer@egeveri.example",
      "Veri Mühendisi mülakat daveti",
      "2026-09-06T14:00:00+03:00",
      `Merhaba Deniz,

Ege Veri Analitik'teki Veri Mühendisi pozisyonu için sizi teknik mülakata davet etmek istiyoruz. Uygun olduğunuz zamanları bu e-postaya yanıt olarak iletebilir misiniz?

Saygılarımızla,
Ege Veri Analitik İK`,
      { folder: "spam", bulk: false },
    ),
    expected: {
      category: "interview_invite",
      applicationId: "tr-app-egeveri",
      suggestedStatus: "interviewing",
      company: "Ege Veri Analitik",
      role: "Veri Mühendisi",
    },
  },
  {
    id: "de-spoof-01",
    language: "de",
    origin: "template",
    hard: "Personio-style rejection; the claimed sender domain failed DMARC.",
    message: msg(
      "Nordlicht Logistik GmbH",
      "no-reply@nordlicht-logistik.jobs.personio.de",
      "Deine Bewerbung bei Nordlicht Logistik GmbH",
      "2026-09-08T08:45:00+02:00",
      `Hallo Deniz,

vielen Dank für deine Bewerbung als Senior Backend Engineer bei der Nordlicht Logistik GmbH. Leider müssen wir dir mitteilen, dass wir uns für andere Kandidat:innen entschieden haben.

Wir wünschen dir alles Gute.
Dein Recruiting-Team der Nordlicht Logistik GmbH`,
      { authenticated: false },
    ),
    expected: {
      category: "rejection",
      applicationId: "de-app-nordlicht",
      suggestedStatus: "rejected",
      company: "Nordlicht Logistik GmbH",
      role: "Senior Backend Engineer",
    },
  },
  {
    id: "de-spoof-02",
    language: "de",
    origin: "synthetic",
    hard: "Forged offer claiming the company's domain, also in the spam folder.",
    message: msg(
      "Alpbau Digital AG",
      "jobs@alpbau.example",
      "Dein Angebot als Full-Stack Entwickler",
      "2026-09-09T17:30:00+02:00",
      `Hallo Deniz,

wir freuen uns, dir die Stelle als Full-Stack Entwickler bei der Alpbau Digital AG anzubieten. Den Vertrag findest du im Anhang.

Viele Grüße
Alpbau Digital AG`,
      { authenticated: false, folder: "spam", bulk: false },
    ),
    expected: {
      category: "offer",
      applicationId: "de-app-alpbau",
      suggestedStatus: "offer",
      company: "Alpbau Digital AG",
      role: "Full-Stack Entwickler",
    },
  },
];
