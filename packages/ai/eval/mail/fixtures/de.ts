import type { MailEvalApplication, MailEvalCase, MailEvalExpected, MailEvalMessage } from "../types";

/**
 * German-language labeled mail (persona: software/product job seeker in Istanbul applying to
 * German, Austrian and Swiss employers). All parties are fictional.
 */
export const APPLICATIONS_DE: MailEvalApplication[] = [
  {
    id: "de-app-nordlicht",
    company: "Nordlicht Logistik GmbH",
    companyDomain: "nordlicht-logistik.example",
    role: "Senior Backend Engineer",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-03T10:15:00+03:00",
  },
  {
    id: "de-app-isarwerk",
    company: "Isarwerk Software GmbH",
    companyDomain: "isarwerk.example",
    role: "Product Manager Payments",
    status: "acknowledged",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-28T09:40:00+03:00",
  },
  {
    id: "de-app-elbtal",
    company: "Elbtal Mobility GmbH",
    companyDomain: "elbtal-mobility.example",
    role: "Senior Frontend Engineer (React)",
    status: "screening",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-10T14:05:00+03:00",
  },
  {
    id: "de-app-kranich",
    company: "Kranich Health GmbH",
    companyDomain: "kranich-health.example",
    role: "Staff Engineer Platform",
    status: "interviewing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-22T11:00:00+03:00",
  },
  {
    id: "de-app-alpbau",
    company: "Alpbau Digital AG",
    companyDomain: "alpbau.example",
    role: "Full-Stack Entwickler",
    status: "applied",
    threadIds: ["thr-de-alpbau-1"],
    sentMessageIds: ["<CAK1alpbau.bewerbung@mail.example>"],
    appliedAt: "2026-08-18T08:30:00+03:00",
  },
  {
    id: "de-app-wolkenwerk-be",
    company: "Wolkenwerk GmbH",
    companyDomain: "wolkenwerk.example",
    role: "Backend Engineer (Go)",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-25T16:20:00+03:00",
  },
  {
    id: "de-app-wolkenwerk-po",
    company: "Wolkenwerk GmbH",
    companyDomain: "wolkenwerk.example",
    role: "Product Owner Data Platform",
    status: "acknowledged",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-26T09:10:00+03:00",
  },
  {
    id: "de-app-seeblick",
    company: "Seeblick Versicherungen AG",
    companyDomain: "seeblick.example",
    role: "Software Engineer Mobile",
    status: "saved",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: null,
  },
  {
    id: "de-app-fichte",
    company: "Fichte & Partner GmbH",
    companyDomain: null,
    role: "Softwareentwickler Java",
    status: "applied",
    threadIds: ["thr-de-fichte-1"],
    sentMessageIds: ["<fichte-bewerbung-01@mail.example>"],
    appliedAt: "2026-09-01T10:00:00+03:00",
  },
  {
    id: "de-app-hafenkontor",
    company: "Hafenkontor Analytics GmbH",
    companyDomain: "hafenkontor.example",
    role: "Data Engineer",
    status: "offer",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-20T13:30:00+03:00",
  },
  {
    id: "de-app-brezel",
    company: "Brezel Labs GmbH",
    companyDomain: "brezel-labs.example",
    role: "Engineering Manager",
    status: "rejected",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-24T12:00:00+03:00",
  },
  {
    id: "de-app-spreewerk",
    company: "Spreewerk Energie GmbH",
    companyDomain: "spreewerk.example",
    role: "Platform Engineer",
    status: "withdrawn",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-05T15:45:00+03:00",
  },
  {
    id: "de-app-taunus",
    company: "Taunus Bank Digital",
    companyDomain: null,
    role: "Senior Product Manager",
    status: "preparing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: null,
  },
  {
    id: "de-app-rheinblick",
    company: "Rheinblick Media GmbH",
    companyDomain: "rheinblick-media.example",
    role: "Senior Software Engineer",
    status: "interviewing",
    threadIds: ["thr-de-rheinblick-1"],
    sentMessageIds: ["<rheinblick-bewerbung-01@mail.example>"],
    appliedAt: "2026-07-30T09:00:00+03:00",
  },
];

interface MsgExtra {
  folder?: "inbox" | "spam";
  threadId?: string;
  inReplyTo?: string;
  list?: boolean;
  bulk?: boolean;
}

function msg(
  name: string | null,
  address: string,
  subject: string,
  receivedAt: string,
  bodyText: string,
  extra: MsgExtra = {},
): MailEvalMessage {
  return {
    from: { name, address },
    subject,
    bodyText,
    receivedAt,
    folder: extra.folder ?? "inbox",
    threadId: extra.threadId ?? null,
    inReplyTo: extra.inReplyTo ?? null,
    listUnsubscribe: extra.list ?? false,
    bulk: extra.bulk ?? false,
  };
}

function c(
  n: number,
  origin: "synthetic" | "template",
  hard: string | null,
  message: MailEvalMessage,
  expected: MailEvalExpected,
): MailEvalCase {
  return { id: `de-${String(n).padStart(3, "0")}`, language: "de", origin, hard, message, expected };
}

const ATS = { list: true, bulk: true } as const;

export const CASES_DE: MailEvalCase[] = [
  // ───────────── application_received ─────────────
  c(
    1,
    "template",
    null,
    msg(
      "Nordlicht Logistik GmbH",
      "noreply@personio.de",
      "Ihre Bewerbung als Senior Backend Engineer",
      "2026-08-03T10:16:00+02:00",
      `Hallo Deniz,

vielen Dank für Ihre Bewerbung als Senior Backend Engineer bei der Nordlicht Logistik GmbH und Ihr Interesse an unserem Unternehmen.

Wir haben Ihre Unterlagen erhalten und werden diese nun sorgfältig prüfen. Sobald wir Ihre Bewerbung gesichtet haben, melden wir uns bei Ihnen. Bitte haben Sie Verständnis dafür, dass dies einige Tage in Anspruch nehmen kann.

Mit freundlichen Grüßen
Ihr Recruiting-Team der Nordlicht Logistik GmbH

Diese E-Mail wurde automatisch versendet. Bitte antworten Sie nicht auf diese Nachricht.
Datenschutzhinweise: https://nordlicht-logistik.jobs.personio.de/privacy`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: "de-app-nordlicht",
      suggestedStatus: "acknowledged",
      company: "Nordlicht Logistik GmbH",
      role: "Senior Backend Engineer",
    },
  ),
  c(
    2,
    "synthetic",
    "Plain e-mail reply in the thread of the user's own application mail; no ATS markers.",
    msg(
      "Magdalena Gruber",
      "m.gruber@alpbau.example",
      "AW: Bewerbung als Full-Stack Entwickler – Deniz Aydın",
      "2026-08-19T09:05:00+02:00",
      `Sehr geehrter Herr Aydın,

herzlichen Dank für Ihre Bewerbung als Full-Stack Entwickler bei der Alpbau Digital AG. Hiermit bestätige ich den Eingang Ihrer Unterlagen.

Wir sichten derzeit alle Bewerbungen und werden uns voraussichtlich bis Mitte September bei Ihnen melden.

Freundliche Grüße aus Wien
Magdalena Gruber
Human Resources | Alpbau Digital AG
Mariahilfer Straße 1, 1060 Wien

-----Ursprüngliche Nachricht-----
Von: Deniz Aydın
Betreff: Bewerbung als Full-Stack Entwickler – Deniz Aydın
Sehr geehrte Damen und Herren, anbei sende ich Ihnen meine Bewerbungsunterlagen …`,
      { threadId: "thr-de-alpbau-1", inReplyTo: "<CAK1alpbau.bewerbung@mail.example>" },
    ),
    {
      category: "application_received",
      applicationId: "de-app-alpbau",
      suggestedStatus: "acknowledged",
      company: "Alpbau Digital AG",
      role: "Full-Stack Entwickler",
    },
  ),
  c(
    3,
    "template",
    "Two tracker applications at Wolkenwerk; the message names the Go backend role, so it links to that one.",
    msg(
      "Wolkenwerk Recruiting",
      "wolkenwerk@recruitee.com",
      "Danke für deine Bewerbung bei Wolkenwerk",
      "2026-08-25T16:25:00+02:00",
      `Hi Deniz,

danke, dass du dich als Backend Engineer (Go) bei Wolkenwerk beworben hast! Deine Bewerbung ist gut bei uns angekommen.

Unser Team schaut sich deine Unterlagen in den nächsten Tagen an. Wir melden uns, sobald es Neuigkeiten gibt – spätestens in zwei Wochen.

Viele Grüße
Lena von Wolkenwerk

Du erhältst diese E-Mail, weil du dich über unsere Karriereseite beworben hast.`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: "de-app-wolkenwerk-be",
      suggestedStatus: "acknowledged",
      company: "Wolkenwerk",
      role: "Backend Engineer (Go)",
    },
  ),
  c(
    4,
    "template",
    null,
    msg(
      "Sonnenhof Commerce GmbH",
      "noreply@softgarden.io",
      "Eingangsbestätigung Ihrer Bewerbung – Senior Software Engineer (m/w/d)",
      "2026-08-14T11:32:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank für Ihr Interesse an der Sonnenhof Commerce GmbH und Ihre Bewerbung auf die Position Senior Software Engineer (m/w/d) in Hamburg.

Hiermit bestätigen wir den Eingang Ihrer Bewerbungsunterlagen. Unser Recruiting-Team prüft Ihre Unterlagen und meldet sich schnellstmöglich bei Ihnen.

Den aktuellen Stand Ihrer Bewerbung können Sie jederzeit in Ihrem Bewerberkonto einsehen.

Mit freundlichen Grüßen
Ihr Sonnenhof Commerce Recruiting-Team`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Sonnenhof Commerce GmbH",
      role: "Senior Software Engineer (m/w/d)",
    },
  ),
  c(
    5,
    "synthetic",
    "Mail-server auto-reply in the application thread; company domain unknown in the tracker, matched via thread.",
    msg(
      "Fichte & Partner Bewerbungen",
      "bewerbung@fichte-partner.example",
      "Automatische Antwort: Bewerbung Softwareentwickler Java",
      "2026-09-01T09:01:00+02:00",
      `Dies ist eine automatisch generierte Nachricht.

Vielen Dank für Ihre E-Mail. Ihre Bewerbungsunterlagen sind bei uns eingegangen und wurden an die zuständige Fachabteilung weitergeleitet. Wir bitten um etwas Geduld – Sie erhalten innerhalb von drei Wochen eine Rückmeldung.

Bitte senden Sie Ihre Unterlagen nicht erneut.

Fichte & Partner GmbH
Personalabteilung
Königstraße 10, 70173 Stuttgart`,
      { threadId: "thr-de-fichte-1", inReplyTo: "<fichte-bewerbung-01@mail.example>", bulk: true },
    ),
    {
      category: "application_received",
      applicationId: "de-app-fichte",
      suggestedStatus: "acknowledged",
      company: "Fichte & Partner GmbH",
      role: "Softwareentwickler Java",
    },
  ),
  c(
    6,
    "template",
    '"Vielen Dank für Ihre Bewerbung … wir werden prüfen" — same opening as a rejection; tracker status is still preparing.',
    msg(
      "Taunus Bank Digital",
      "taunusbank@myworkday.com",
      "Vielen Dank für Ihre Bewerbung – Senior Product Manager (R-20417)",
      "2026-09-08T14:12:00+02:00",
      `Guten Tag Deniz Aydın,

vielen Dank für Ihre Bewerbung als Senior Product Manager (R-20417) bei Taunus Bank Digital.

Wir freuen uns über Ihr Interesse. Ihre Unterlagen werden nun von unserem Talent-Acquisition-Team geprüft. Wenn Ihr Profil zu unseren Anforderungen passt, kontaktieren wir Sie zur Abstimmung der nächsten Schritte.

Den Status Ihrer Bewerbung können Sie jederzeit in unserem Kandidatenportal verfolgen.

Freundliche Grüße
Talent Acquisition | Taunus Bank Digital
Frankfurt am Main`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: "de-app-taunus",
      suggestedStatus: "acknowledged",
      company: "Taunus Bank Digital",
      role: "Senior Product Manager",
    },
  ),
  c(
    7,
    "template",
    "English Greenhouse confirmation from a Berlin company in the German set (mixed language).",
    msg(
      "Kiezkraft",
      "no-reply@us.greenhouse-mail.io",
      "Thank you for applying to Kiezkraft",
      "2026-09-11T18:44:00+02:00",
      `Hi Deniz,

Thanks for applying to Kiezkraft! Your application for the Senior Product Engineer role in Berlin has been received and our team will review it soon.

If your background is a good match, a member of our People team will reach out to discuss next steps.

Best,
The Kiezkraft Talent Team

Kiezkraft GmbH · Oranienstraße 1 · 10997 Berlin`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Kiezkraft",
      role: "Senior Product Engineer",
    },
  ),
  c(
    8,
    "template",
    null,
    msg(
      "Brandauer Automotive AG",
      "noreply@successfactors.eu",
      "Ihre Bewerbung für die Position Cloud Architect (Req-ID 48213)",
      "2026-09-15T07:58:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank für Ihre Bewerbung für die Position Cloud Architect (Req-ID 48213) am Standort München.

Wir bestätigen hiermit den Eingang Ihrer Online-Bewerbung. Ihre Unterlagen werden nun von der Personalabteilung und dem Fachbereich geprüft. Bitte beachten Sie, dass der Auswahlprozess aufgrund der hohen Anzahl an Bewerbungen einige Wochen dauern kann.

Mit freundlichen Grüßen
Brandauer Automotive AG
Personalmarketing & Recruiting

Dies ist eine automatisch generierte E-Mail. Antworten an diese Adresse können nicht bearbeitet werden.
Brandauer Automotive AG · Sitz der Gesellschaft: München · Registergericht München HRB 000000 · Vorsitzender des Aufsichtsrats: Dr. Hubert Lenz`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Brandauer Automotive AG",
      role: "Cloud Architect",
    },
  ),
  c(
    9,
    "template",
    "Second confirmation for an application already marked acknowledged: no forward move, so no status.",
    msg(
      "Isarwerk Software GmbH",
      "noreply@personio.de",
      "Bestätigung: Bewerbung Product Manager Payments",
      "2026-08-01T12:02:00+02:00",
      `Hallo Deniz,

wir möchten dir noch einmal bestätigen, dass deine Bewerbung als Product Manager Payments bei Isarwerk vollständig vorliegt. Die nachgereichten Dokumente haben wir deiner Bewerbung hinzugefügt.

Wir melden uns, sobald das Fachteam deine Unterlagen gesichtet hat.

Viele Grüße
People & Culture | Isarwerk Software GmbH`,
      ATS,
    ),
    {
      category: "application_received",
      applicationId: "de-app-isarwerk",
      suggestedStatus: null,
      company: "Isarwerk Software GmbH",
      role: "Product Manager Payments",
    },
  ),

  // ───────────── rejection ─────────────
  c(
    10,
    "template",
    '"Vielen Dank für Ihre Bewerbung … leider" — opens like a confirmation, turns into a rejection.',
    msg(
      "Lindwurm Games GmbH",
      "noreply@personio.de",
      "Ihre Bewerbung bei Lindwurm Games",
      "2026-08-21T15:30:00+02:00",
      `Hallo Deniz,

vielen Dank für Ihre Bewerbung als Senior Unity Developer und das Interesse an Lindwurm Games.

Leider müssen wir Ihnen mitteilen, dass wir Ihre Bewerbung nach sorgfältiger Prüfung nicht weiter berücksichtigen können. Diese Entscheidung ist keine Bewertung Ihrer Qualifikation; wir haben uns für Profile entschieden, die noch besser zu den aktuellen Anforderungen passen.

Wir wünschen Ihnen für Ihre weitere berufliche Zukunft alles Gute und viel Erfolg.

Beste Grüße
Ihr Lindwurm Games Recruiting-Team`,
      ATS,
    ),
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Lindwurm Games",
      role: "Senior Unity Developer",
    },
  ),
  c(
    11,
    "synthetic",
    'Rejection after final interviews wrapped in warm words ("beeindruckt", Talentpool) — no explicit "Absage".',
    msg(
      "Sophie Brandt",
      "sophie.brandt@kranich-health.example",
      "Rückmeldung zu Ihren Gesprächen – Staff Engineer Platform",
      "2026-10-06T17:10:00+02:00",
      `Lieber Herr Aydın,

nochmals herzlichen Dank für die Zeit, die Sie sich für die Gespräche mit unserem Team genommen haben. Wir waren von Ihrer Erfahrung im Aufbau von Plattform-Teams wirklich beeindruckt, und die Diskussion zur Systemarchitektur war für uns alle sehr bereichernd.

Nach intensiver Abwägung haben wir uns dennoch entschieden, die Position Staff Engineer Platform mit einer Kandidatin zu besetzen, deren Erfahrung im regulierten Medizinprodukte-Umfeld noch etwas besser zu unseren aktuellen Prioritäten passt.

Gerne würden wir Ihren Lebenslauf in unserem Talentpool behalten und auf Sie zukommen, sobald sich eine passende Position ergibt.

Alles Gute und herzliche Grüße
Sophie Brandt
Senior Talent Partner | Kranich Health GmbH`,
    ),
    {
      category: "rejection",
      applicationId: "de-app-kranich",
      suggestedStatus: "rejected",
      company: "Kranich Health GmbH",
      role: "Staff Engineer Platform",
    },
  ),
  c(
    12,
    "synthetic",
    "Position put on hold (Einstellungsstopp) — counts as rejection although no candidate decision is stated.",
    msg(
      "Jonas Petersen",
      "jonas.petersen@elbtal-mobility.example",
      "Update zur Position Senior Frontend Engineer (React)",
      "2026-09-24T11:48:00+02:00",
      `Hallo Deniz,

ich melde mich mit keinen guten Nachrichten: Aufgrund einer Neuausrichtung unserer Produkt-Roadmap haben wir entschieden, die Position Senior Frontend Engineer (React) vorerst nicht zu besetzen. Es gilt bis auf Weiteres ein Einstellungsstopp für das Frontend-Team.

Deshalb müssen wir den Bewerbungsprozess an dieser Stelle leider beenden. Das hat ausdrücklich nichts mit deinem Profil zu tun – das Gespräch mit dir war sehr angenehm.

Sollte die Stelle im nächsten Jahr wieder ausgeschrieben werden, melde ich mich gerne bei dir.

Viele Grüße aus Hamburg
Jonas Petersen
Talent Acquisition | Elbtal Mobility GmbH`,
    ),
    {
      category: "rejection",
      applicationId: "de-app-elbtal",
      suggestedStatus: "rejected",
      company: "Elbtal Mobility GmbH",
      role: "Senior Frontend Engineer (React)",
    },
  ),
  c(
    13,
    "template",
    "Position already filled — rejection phrased as an information update.",
    msg(
      "Möwe Reisen GmbH",
      "noreply@join.com",
      "Information zu Ihrer Bewerbung: iOS Developer",
      "2026-09-02T10:05:00+02:00",
      `Sehr geehrter Herr Aydın,

wir bedanken uns für Ihre Bewerbung als iOS Developer bei Möwe Reisen.

Wir möchten Sie darüber informieren, dass die Stelle zwischenzeitlich bereits besetzt wurde. Ihre Bewerbung kann daher nicht mehr berücksichtigt werden.

Ihre Unterlagen werden gemäß unserer Datenschutzbestimmungen nach sechs Monaten gelöscht.

Freundliche Grüße
Personalabteilung Möwe Reisen GmbH`,
      ATS,
    ),
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Möwe Reisen GmbH",
      role: "iOS Developer",
    },
  ),
  c(
    14,
    "template",
    "Two applications at Wolkenwerk; this rejection names the Product Owner role.",
    msg(
      "Wolkenwerk Recruiting",
      "wolkenwerk@recruitee.com",
      "Deine Bewerbung als Product Owner Data Platform",
      "2026-09-17T13:20:00+02:00",
      `Hi Deniz,

vielen Dank für dein Interesse an Wolkenwerk und die Zeit, die du in deine Bewerbung als Product Owner Data Platform gesteckt hast.

Nach sorgfältiger Prüfung haben wir uns leider für andere Kandidat:innen entschieden, deren Profil noch besser zu den Anforderungen der Rolle passt.

Wir wünschen dir alles Gute für deine weitere Suche!

Viele Grüße
Lena von Wolkenwerk`,
      ATS,
    ),
    {
      category: "rejection",
      applicationId: "de-app-wolkenwerk-po",
      suggestedStatus: "rejected",
      company: "Wolkenwerk",
      role: "Product Owner Data Platform",
    },
  ),
  c(
    15,
    "synthetic",
    "Application is already closed (rejected), so a further rejection proposes no status.",
    msg(
      "Brezel Labs Hiring",
      "jobs@brezel-labs.example",
      "Abschließende Rückmeldung – Engineering Manager",
      "2026-08-30T09:15:00+02:00",
      `Hallo Deniz,

wie bereits telefonisch besprochen, bestätigen wir dir hiermit noch einmal schriftlich, dass wir den Prozess für die Position Engineering Manager mit dir nicht fortsetzen werden.

Deine Daten löschen wir gemäß DSGVO nach Ablauf von sechs Monaten, sofern du nicht in die Aufnahme in unseren Talentpool einwilligst.

Beste Grüße
Brezel Labs GmbH`,
    ),
    {
      category: "rejection",
      applicationId: "de-app-brezel",
      suggestedStatus: null,
      company: "Brezel Labs GmbH",
      role: "Engineering Manager",
    },
  ),
  c(
    16,
    "template",
    null,
    msg(
      "Nordstern Versicherung AG",
      "nordstern@myworkday.com",
      "Ihre Bewerbung als Lead Developer Kundenportal (R-11873)",
      "2026-09-29T08:40:00+02:00",
      `Sehr geehrter Herr Aydın,

nochmals vielen Dank für Ihr Interesse an der Nordstern Versicherung AG und Ihre Bewerbung als Lead Developer Kundenportal.

Wir haben uns die Entscheidung nicht leicht gemacht, uns nach eingehender Prüfung aller Unterlagen jedoch für andere Kandidat:innen entschieden. Wir bedauern, Ihnen keine positivere Nachricht übermitteln zu können.

Wir wünschen Ihnen für Ihren weiteren Berufsweg alles Gute.

Mit freundlichen Grüßen
Talent Acquisition
Nordstern Versicherung AG`,
      ATS,
    ),
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Nordstern Versicherung AG",
      role: "Lead Developer Kundenportal",
    },
  ),
  c(
    17,
    "synthetic",
    'Austrian phrasing ("Absage", "nicht in die engere Auswahl") in the e-mail thread of the application.',
    msg(
      "Magdalena Gruber",
      "m.gruber@alpbau.example",
      "AW: Bewerbung als Full-Stack Entwickler – Deniz Aydın",
      "2026-09-12T10:30:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank nochmals für Ihre Bewerbung und Ihre Geduld. Leider müssen wir Ihnen eine Absage erteilen: Ihr Profil hat es diesmal nicht in die engere Auswahl geschafft, da wir für diese Rolle Kandidaten mit Wohnsitz in Österreich und Erfahrung mit unserer Bau-ERP-Landschaft bevorzugen.

Wir bedanken uns für Ihr Interesse und wünschen Ihnen viel Erfolg.

Freundliche Grüße
Magdalena Gruber
Human Resources | Alpbau Digital AG`,
      { threadId: "thr-de-alpbau-1", inReplyTo: "<CAK1alpbau.bewerbung@mail.example>" },
    ),
    {
      category: "rejection",
      applicationId: "de-app-alpbau",
      suggestedStatus: "rejected",
      company: "Alpbau Digital AG",
      role: "Full-Stack Entwickler",
    },
  ),
  c(
    18,
    "synthetic",
    "Wolkenwerk rejection without any role name while two Wolkenwerk applications are tracked — cannot be linked safely.",
    msg(
      "Felix Hartmann",
      "felix.hartmann@wolkenwerk.example",
      "Rückmeldung zu deiner Bewerbung",
      "2026-09-18T16:05:00+02:00",
      `Hallo Deniz,

danke für deine Geduld! Wir haben deine Bewerbung im Team besprochen und uns leider entschieden, nicht mit dir weiterzumachen. Aktuell suchen wir jemanden mit mehr Erfahrung in unserem konkreten Tech-Stack.

Ich wünsche dir trotzdem viel Erfolg und hoffe, wir laufen uns irgendwann wieder über den Weg.

Viele Grüße
Felix
Wolkenwerk GmbH`,
    ),
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Wolkenwerk GmbH",
      role: null,
    },
  ),

  // ───────────── interview_invite ─────────────
  c(
    19,
    "synthetic",
    "Next interview round for an application already in interviewing: no forward move.",
    msg(
      "Sophie Brandt",
      "sophie.brandt@kranich-health.example",
      "Einladung zur zweiten Gesprächsrunde – Staff Engineer Platform",
      "2026-09-08T10:22:00+02:00",
      `Lieber Herr Aydın,

vielen Dank für das angenehme erste Gespräch! Wir freuen uns, Sie zur zweiten Runde einzuladen: einem System-Design-Interview mit Dr. Lukas Weber (CTO) und Mira Schulz (Principal Engineer).

Termin: Dienstag, 15. September 2026, 14:00–15:30 Uhr (MESZ)
Ort: Microsoft Teams – https://teams.microsoft.com/l/meetup-join/19%3ameeting_KRN8842ab%40thread.v2/0

Bitte geben Sie uns kurz Bescheid, ob der Termin für Sie passt.

Herzliche Grüße
Sophie Brandt
Senior Talent Partner | Kranich Health GmbH`,
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-kranich",
      suggestedStatus: null,
      company: "Kranich Health GmbH",
      role: "Staff Engineer Platform",
      dates: [{ kind: "interview", at: "2026-09-15T14:00:00+02:00" }],
      meetingUrls: ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_KRN8842ab%40thread.v2/0"],
    },
  ),
  c(
    20,
    "synthetic",
    null,
    msg(
      "Jonas Petersen",
      "jonas.petersen@elbtal-mobility.example",
      "Einladung zum Fachinterview – Senior Frontend Engineer (React)",
      "2026-09-03T09:12:00+02:00",
      `Hallo Deniz,

danke für das nette Kennenlerngespräch letzte Woche! Wir würden dich gerne zum technischen Interview mit zwei Engineers aus unserem Frontend-Team einladen.

Wann: Donnerstag, 10. September 2026, 11:00 Uhr deutscher Zeit (12:00 Uhr Istanbul)
Dauer: ca. 75 Minuten
Link: https://meet.google.com/elb-qwrt-zux

Wir sprechen über ein Pairing-Beispiel in React/TypeScript – eine spezielle Vorbereitung ist nicht nötig.

Viele Grüße
Jonas Petersen
Talent Acquisition | Elbtal Mobility GmbH`,
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-elbtal",
      suggestedStatus: "interviewing",
      company: "Elbtal Mobility GmbH",
      role: "Senior Frontend Engineer (React)",
      dates: [{ kind: "interview", at: "2026-09-10T11:00:00+02:00" }],
      meetingUrls: ["https://meet.google.com/elb-qwrt-zux"],
    },
  ),
  c(
    21,
    "template",
    "First HR phone screen with only a slot-picking link (no date, no meeting link) → screening.",
    msg(
      "Nordlicht Logistik GmbH",
      "noreply@personio.de",
      "Terminvereinbarung: Telefonisches Kennenlernen",
      "2026-08-12T14:30:00+02:00",
      `Hallo Deniz,

vielen Dank für Ihre Bewerbung als Senior Backend Engineer. Ihr Profil hat uns überzeugt und wir möchten Sie gerne in einem ersten telefonischen Kennenlernen (ca. 30 Minuten) mit unserer Recruiterin Anna Feld näher kennenlernen.

Bitte wählen Sie über den folgenden Link einen passenden Termin aus:
https://nordlicht-logistik.jobs.personio.de/scheduling/7f3a9c

Wir freuen uns auf das Gespräch!

Mit freundlichen Grüßen
Ihr Recruiting-Team der Nordlicht Logistik GmbH`,
      ATS,
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-nordlicht",
      suggestedStatus: "screening",
      company: "Nordlicht Logistik GmbH",
      role: "Senior Backend Engineer",
    },
  ),
  c(
    22,
    "synthetic",
    "Interview reschedule (Terminverschiebung) — still an interview invite with a new time; application already interviewing.",
    msg(
      "Carla Neumann",
      "c.neumann@rheinblick-media.example",
      "AW: Bewerbung Senior Software Engineer – Terminverschiebung",
      "2026-09-21T08:55:00+02:00",
      `Hallo Herr Aydın,

leider muss unser Head of Engineering das für Mittwoch geplante Gespräch kurzfristig verschieben – ich bitte um Entschuldigung.

Neuer Termin: Freitag, 25. September 2026, 15:00 Uhr (MESZ)
Zoom: https://zoom.us/j/84712096631

Der Ablauf bleibt unverändert. Sollte der neue Termin nicht passen, schlagen Sie mir gerne zwei Alternativen vor.

Viele Grüße
Carla Neumann
People Operations | Rheinblick Media GmbH, Köln`,
      { threadId: "thr-de-rheinblick-1", inReplyTo: "<rheinblick-bewerbung-01@mail.example>" },
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-rheinblick",
      suggestedStatus: null,
      company: "Rheinblick Media GmbH",
      role: "Senior Software Engineer",
      dates: [{ kind: "interview", at: "2026-09-25T15:00:00+02:00" }],
      meetingUrls: ["https://zoom.us/j/84712096631"],
    },
  ),
  c(
    23,
    "template",
    "Calendar-invite-only text (Google Calendar notification), no prose from a recruiter.",
    msg(
      "Theresa Kolb",
      "calendar-notification@google.com",
      "Einladung: Interview Product Manager Payments – Isarwerk @ Do., 1. Okt. 2026 10:00–11:00 (MESZ)",
      "2026-09-24T12:40:00+02:00",
      `Theresa Kolb hat Sie zu folgendem Termin eingeladen.

Interview Product Manager Payments – Isarwerk
Wann: Donnerstag, 1. Oktober 2026 · 10:00–11:00 (Mitteleuropäische Sommerzeit – Berlin)
Teilnahme mit Google Meet: https://meet.google.com/isa-pmpy-kfd
Teilnehmer: theresa.kolb@isarwerk.example, max.huber@isarwerk.example, deniz.aydin@mail.example

Ja · Vielleicht · Nein · Weitere Optionen

Einladung von Google Kalender
Sie erhalten diese E-Mail, weil Sie Gast dieses Termins sind.`,
      { bulk: true },
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-isarwerk",
      suggestedStatus: "interviewing",
      company: "Isarwerk",
      role: "Product Manager Payments",
      dates: [{ kind: "interview", at: "2026-10-01T10:00:00+02:00" }],
      meetingUrls: ["https://meet.google.com/isa-pmpy-kfd"],
    },
  ),
  c(
    24,
    "synthetic",
    null,
    msg(
      "Robert Haller",
      "r.haller@zugspitz-robotics.example",
      "Einladung zum Vorstellungsgespräch – Embedded Software Engineer",
      "2026-10-02T13:15:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank für Ihre Bewerbung als Embedded Software Engineer. Wir freuen uns, Sie zu einem persönlichen Vorstellungsgespräch an unserem Standort in München einladen zu dürfen.

Datum: Mittwoch, 14. Oktober 2026
Uhrzeit: 10:30 Uhr
Ort: Zugspitz Robotics GmbH, Landsberger Straße 5, 80339 München
Gesprächspartner: Robert Haller (HR), Dr. Ingrid Maier (Teamleitung Firmware)

Reisekosten erstatten wir Ihnen gemäß unserer Reisekostenrichtlinie. Bitte bestätigen Sie den Termin kurz per E-Mail.

Mit freundlichen Grüßen
Robert Haller
Personalreferent | Zugspitz Robotics GmbH`,
    ),
    {
      category: "interview_invite",
      applicationId: null,
      suggestedStatus: "interviewing",
      company: "Zugspitz Robotics GmbH",
      role: "Embedded Software Engineer",
      dates: [{ kind: "interview", at: "2026-10-14T10:30:00+02:00" }],
    },
  ),
  c(
    25,
    "synthetic",
    "First HR conversation (Erstgespräch) with time and Teams link → screening, not interviewing.",
    msg(
      "Magdalena Gruber",
      "m.gruber@alpbau.example",
      "AW: Bewerbung als Full-Stack Entwickler – Einladung zum Erstgespräch",
      "2026-08-27T11:20:00+02:00",
      `Sehr geehrter Herr Aydın,

wir haben Ihre Unterlagen gesichtet und würden Sie gerne zu einem ersten Kennenlerngespräch per Video einladen. Das Gespräch führe ich gemeinsam mit unserer Teamleiterin; es dauert etwa 45 Minuten.

Termin: Mittwoch, 2. September 2026, 9:00 Uhr (Wiener Zeit)
Microsoft Teams: https://teams.microsoft.com/l/meetup-join/19%3ameeting_ALP55c1d%40thread.v2/0

Freundliche Grüße
Magdalena Gruber
Human Resources | Alpbau Digital AG`,
      { threadId: "thr-de-alpbau-1", inReplyTo: "<CAK1alpbau.bewerbung@mail.example>" },
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-alpbau",
      suggestedStatus: "screening",
      company: "Alpbau Digital AG",
      role: "Full-Stack Entwickler",
      dates: [{ kind: "interview", at: "2026-09-02T09:00:00+02:00" }],
      meetingUrls: ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_ALP55c1d%40thread.v2/0"],
    },
  ),
  c(
    26,
    "template",
    "Technical interview with a self-scheduling link only; role named so it links to the Go application, not the Product Owner one.",
    msg(
      "Wolkenwerk Recruiting",
      "wolkenwerk@recruitee.com",
      "Nächster Schritt: Technisches Interview bei Wolkenwerk",
      "2026-09-04T10:00:00+02:00",
      `Hi Deniz,

gute Neuigkeiten: Wir möchten dich für die Rolle Backend Engineer (Go) zu einem technischen Interview mit unserem Platform-Team einladen (60 Minuten, remote).

Such dir bitte über diesen Link einen passenden Slot aus – der Video-Link kommt dann automatisch mit der Kalendereinladung:
https://wolkenwerk.recruitee.com/scheduler/b81c2e

Viele Grüße
Lena von Wolkenwerk`,
      ATS,
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-wolkenwerk-be",
      suggestedStatus: "interviewing",
      company: "Wolkenwerk",
      role: "Backend Engineer (Go)",
    },
  ),
  c(
    27,
    "synthetic",
    "English mail from a Zurich insurer (mixed language); the tracked application is only `saved`, yet the invite is a forward move.",
    msg(
      "Nina Keller",
      "nina.keller@seeblick.example",
      "Interview invitation – Software Engineer Mobile",
      "2026-10-07T16:45:00+02:00",
      `Dear Deniz,

Thank you for your interest in the Software Engineer Mobile position at Seeblick Versicherungen. Our engineering lead came across your profile and we would like to invite you to a technical interview.

Date: Tuesday, 13 October 2026
Time: 14:00 CEST (Zurich)
Zoom: https://zoom.us/j/93018475520

The conversation will focus on your experience with Swift and Kotlin Multiplatform.

Kind regards,
Nina Keller
Talent Acquisition | Seeblick Versicherungen AG, Zürich`,
    ),
    {
      category: "interview_invite",
      applicationId: "de-app-seeblick",
      suggestedStatus: "interviewing",
      company: "Seeblick Versicherungen",
      role: "Software Engineer Mobile",
      dates: [{ kind: "interview", at: "2026-10-13T14:00:00+02:00" }],
      meetingUrls: ["https://zoom.us/j/93018475520"],
    },
  ),

  // ───────────── assessment ─────────────
  c(
    28,
    "template",
    null,
    msg(
      "Codility",
      "no-reply@codility.com",
      "Nordlicht Logistik GmbH lädt Sie zu einem Coding-Test ein",
      "2026-08-20T09:30:00+02:00",
      `Hallo Deniz Aydın,

Nordlicht Logistik GmbH hat Sie eingeladen, im Rahmen Ihrer Bewerbung als Senior Backend Engineer einen Online-Test auf Codility zu absolvieren.

Dauer: 90 Minuten
Der Test muss bis 27. August 2026, 23:59 Uhr (MESZ) abgeschlossen sein.

Test starten: https://app.codility.com/test/NLL-7Q2K9-XP4/

Viel Erfolg!
Das Codility-Team im Auftrag von Nordlicht Logistik GmbH`,
      ATS,
    ),
    {
      category: "assessment",
      applicationId: "de-app-nordlicht",
      suggestedStatus: "screening",
      company: "Nordlicht Logistik GmbH",
      role: "Senior Backend Engineer",
      dates: [{ kind: "assessment_deadline", at: "2026-08-27T23:59:00+02:00" }],
    },
  ),
  c(
    29,
    "template",
    "Assessment reminder that landed in the spam folder.",
    msg(
      "HackerRank",
      "support@hackerrank.com",
      "Erinnerung: Ihr Test für Wolkenwerk läuft bald ab",
      "2026-09-09T07:00:00+02:00",
      `Hallo Deniz,

dies ist eine freundliche Erinnerung: Sie haben den Test „Backend Engineer (Go) – Wolkenwerk“ noch nicht abgeschlossen.

Der Link ist noch bis 11. September 2026, 18:00 Uhr MESZ gültig.
Test fortsetzen: https://www.hackerrank.com/tests/wlkw-go-2026/login

Bei technischen Problemen wenden Sie sich bitte an support@hackerrank.com.

HackerRank
Abmelden von Erinnerungen`,
      { folder: "spam", list: true, bulk: true },
    ),
    {
      category: "assessment",
      applicationId: "de-app-wolkenwerk-be",
      suggestedStatus: "screening",
      company: "Wolkenwerk",
      role: "Backend Engineer (Go)",
      dates: [{ kind: "assessment_deadline", at: "2026-09-11T18:00:00+02:00" }],
    },
  ),
  c(
    30,
    "template",
    null,
    msg(
      "TestGorilla",
      "no-reply@testgorilla.com",
      "Fjordlicht Energy hat Sie zu einem Assessment eingeladen",
      "2026-09-14T12:00:00+02:00",
      `Hallo Deniz,

vielen Dank für Ihre Bewerbung als Product Analyst bei Fjordlicht Energy. Als nächsten Schritt bitten wir Sie, ein kurzes Online-Assessment zu absolvieren (ca. 40 Minuten, Tests: Datenanalyse, SQL, kritisches Denken).

Bitte schließen Sie das Assessment innerhalb von 5 Tagen ab.

Assessment starten: https://app.testgorilla.com/s/fjl8x2c

Viel Erfolg!
Das Team von Fjordlicht Energy`,
      ATS,
    ),
    {
      category: "assessment",
      applicationId: null,
      suggestedStatus: "screening",
      company: "Fjordlicht Energy",
      role: "Product Analyst",
    },
  ),
  c(
    31,
    "synthetic",
    "Take-home task for an application already in interviewing: assessment would move backwards, so no status.",
    msg(
      "Mira Schulz",
      "mira.schulz@kranich-health.example",
      "Case Study für die nächste Runde",
      "2026-09-18T15:40:00+02:00",
      `Hallo Deniz,

wie im Gespräch angekündigt, schicke ich dir anbei die Case Study für die letzte Runde (Staff Engineer Platform). Es geht um die Migration unserer Datenpipeline auf eine Multi-Tenant-Architektur.

Bitte schick uns deine Lösung (Architekturskizze + max. 5 Folien) bis Montag, 28. September 2026, 12:00 Uhr. Wir besprechen sie dann gemeinsam im Panel.

Bei Fragen melde dich jederzeit.

Viele Grüße
Mira`,
    ),
    {
      category: "assessment",
      applicationId: "de-app-kranich",
      suggestedStatus: null,
      company: "Kranich Health",
      role: "Staff Engineer Platform",
      dates: [{ kind: "assessment_deadline", at: "2026-09-28T12:00:00+02:00" }],
    },
  ),
  c(
    32,
    "synthetic",
    "Tracker company has no domain; matched by company + role name.",
    msg(
      "Katrin Vogel",
      "katrin.vogel@taunusbank-digital.example",
      "Fallstudie – Senior Product Manager",
      "2026-09-22T10:10:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank für Ihre Bewerbung als Senior Product Manager. Bevor wir Sie zu Gesprächen einladen, bitten wir Sie, eine kurze Fallstudie zu bearbeiten: Skizzieren Sie bitte eine Produktstrategie für eine Sparfunktion in unserer Banking-App.

Abgabe: bis Freitag, 2. Oktober 2026, 17:00 Uhr, per Antwort auf diese E-Mail.

Mit freundlichen Grüßen
Katrin Vogel
Talent Acquisition | Taunus Bank Digital`,
    ),
    {
      category: "assessment",
      applicationId: "de-app-taunus",
      suggestedStatus: "screening",
      company: "Taunus Bank Digital",
      role: "Senior Product Manager",
      dates: [{ kind: "assessment_deadline", at: "2026-10-02T17:00:00+02:00" }],
    },
  ),
  c(
    33,
    "template",
    null,
    msg(
      "Coderbyte",
      "noreply@coderbyte.com",
      "Erinnerung: Coding Challenge von Quellwerk Systems",
      "2026-10-12T08:00:00+02:00",
      `Hallo Deniz,

Quellwerk Systems wartet noch auf deine Coding Challenge für die Position Software Engineer Backend.

Deadline: 15. Oktober 2026, 23:59 Uhr (MESZ)
Challenge öffnen: https://coderbyte.com/sl-candidate?promo=quellwerk-8c1

Viel Erfolg,
Coderbyte im Auftrag von Quellwerk Systems

Keine Erinnerungen mehr erhalten? Abmelden`,
      ATS,
    ),
    {
      category: "assessment",
      applicationId: null,
      suggestedStatus: "screening",
      company: "Quellwerk Systems",
      role: "Software Engineer Backend",
      dates: [{ kind: "assessment_deadline", at: "2026-10-15T23:59:00+02:00" }],
    },
  ),

  // ───────────── offer ─────────────
  c(
    34,
    "synthetic",
    "Offer with salary and start date (Vertragsangebot).",
    msg(
      "Sophie Brandt",
      "sophie.brandt@kranich-health.example",
      "Vertragsangebot – Staff Engineer Platform",
      "2026-10-09T14:00:00+02:00",
      `Lieber Herr Aydın,

wir freuen uns sehr, Ihnen nach den Gesprächen ein Angebot für die Position Staff Engineer Platform unterbreiten zu können!

Eckdaten:
– Jahresbruttogehalt: 98.000 € zzgl. 10 % variabler Anteil
– Arbeitsort: Berlin, hybrid (2 Tage/Woche im Büro), Relocation-Paket 8.000 €
– 30 Urlaubstage, unbefristeter Vertrag
– Gewünschter Eintrittstermin: 1. Dezember 2026

Den Arbeitsvertrag finden Sie im Anhang. Bitte geben Sie uns bis zum 16. Oktober 2026 Bescheid, ob Sie das Angebot annehmen möchten.

Herzliche Grüße
Sophie Brandt
Senior Talent Partner | Kranich Health GmbH`,
    ),
    {
      category: "offer",
      applicationId: "de-app-kranich",
      suggestedStatus: "offer",
      company: "Kranich Health GmbH",
      role: "Staff Engineer Platform",
      dates: [{ kind: "start_date", at: "2026-12-01T00:00:00+01:00" }],
    },
  ),
  c(
    35,
    "synthetic",
    "Written contract after a verbal offer; application already at offer, so no status change.",
    msg(
      "Henrik Lange",
      "henrik.lange@hafenkontor.example",
      "Ihr Arbeitsvertrag – Data Engineer",
      "2026-09-02T11:30:00+02:00",
      `Hallo Herr Aydın,

wie telefonisch besprochen, erhalten Sie anbei Ihren Arbeitsvertrag als Data Engineer bei der Hafenkontor Analytics GmbH zur Unterschrift.

Jahresgehalt: 78.000 € brutto
Eintritt: 1. November 2026
Probezeit: 6 Monate

Bitte senden Sie uns den unterschriebenen Vertrag bis spätestens 9. September 2026 zurück. Sollten Sie noch Fragen zur Kündigungsfrist bei Ihrem aktuellen Arbeitgeber haben, sprechen Sie mich gerne an.

Beste Grüße aus Hamburg
Henrik Lange
Head of People | Hafenkontor Analytics GmbH`,
    ),
    {
      category: "offer",
      applicationId: "de-app-hafenkontor",
      suggestedStatus: null,
      company: "Hafenkontor Analytics GmbH",
      role: "Data Engineer",
      dates: [{ kind: "start_date", at: "2026-11-01T00:00:00+01:00" }],
    },
  ),
  c(
    36,
    "synthetic",
    null,
    msg(
      "Carla Neumann",
      "c.neumann@rheinblick-media.example",
      "AW: Bewerbung Senior Software Engineer – Zusage",
      "2026-10-20T10:05:00+02:00",
      `Hallo Herr Aydın,

wir freuen uns, Ihnen mitteilen zu dürfen, dass wir Ihnen die Position Senior Software Engineer bei Rheinblick Media anbieten möchten!

Wir bieten Ihnen ein Jahresbruttogehalt von 84.000 € sowie einen Eintritt zum 1. Januar 2027. Das vollständige Vertragsangebot schicken wir Ihnen in den nächsten Tagen per DocuSign.

Herzlichen Glückwunsch und viele Grüße aus Köln
Carla Neumann
People Operations | Rheinblick Media GmbH`,
      { threadId: "thr-de-rheinblick-1", inReplyTo: "<rheinblick-bewerbung-01@mail.example>" },
    ),
    {
      category: "offer",
      applicationId: "de-app-rheinblick",
      suggestedStatus: "offer",
      company: "Rheinblick Media",
      role: "Senior Software Engineer",
      dates: [{ kind: "start_date", at: "2027-01-01T00:00:00+01:00" }],
    },
  ),
  c(
    37,
    "template",
    null,
    msg(
      "Bergquell Software GmbH",
      "noreply@personio.de",
      "Ihr Angebot von Bergquell Software",
      "2026-10-15T16:20:00+02:00",
      `Hallo Deniz,

wir freuen uns, Ihnen ein Angebot als Senior iOS Engineer bei der Bergquell Software GmbH machen zu können.

Zusammenfassung:
Gehalt: 82.000 € brutto/Jahr
Startdatum: 1. Februar 2027
Arbeitsmodell: Remote innerhalb der EU

Das Angebot ist bis 23. Oktober 2026 gültig. Sie können es direkt in Ihrem Bewerberportal annehmen oder ablehnen.

Mit freundlichen Grüßen
Ihr Bergquell Software Recruiting-Team`,
      ATS,
    ),
    {
      category: "offer",
      applicationId: null,
      suggestedStatus: "offer",
      company: "Bergquell Software GmbH",
      role: "Senior iOS Engineer",
      dates: [{ kind: "start_date", at: "2027-02-01T00:00:00+01:00" }],
    },
  ),

  // ───────────── recruiter_outreach ─────────────
  c(
    38,
    "synthetic",
    null,
    msg(
      "Tobias Rehm",
      "t.rehm@talentbruecke.example",
      "Spannende Position als Head of Engineering in Berlin",
      "2026-08-07T10:40:00+02:00",
      `Hallo Deniz,

ich bin auf dein Profil gestoßen und denke, dass eine aktuelle Vakanz meines Kunden sehr gut zu dir passen könnte: Ein schnell wachsendes Berliner Fintech (Series B, ca. 120 Mitarbeitende) sucht eine:n Head of Engineering.

Gehaltsrahmen 120–140 k € + VSOP, hybrides Arbeiten, Relocation-Unterstützung.

Hättest du Lust auf ein kurzes, unverbindliches Telefonat diese oder nächste Woche?

Beste Grüße
Tobias Rehm
Senior Consultant | Talentbrücke Personalberatung GmbH
+49 151 55501234`,
    ),
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Head of Engineering",
    },
  ),
  c(
    39,
    "synthetic",
    "Recruiter outreach that talks about an interview with the client — not an interview invite.",
    msg(
      "Sabine Kurz",
      "sabine.kurz@hirewerk.example",
      "Vorschlag für ein Interview bei meinem Kunden",
      "2026-09-10T09:25:00+02:00",
      `Hallo Herr Aydın,

ich betreue als Personalberaterin einen Münchner Mittelständler aus dem Maschinenbau, der gerade eine Softwareabteilung aufbaut und einen Lead Backend Engineer (Kotlin) sucht.

Ihr Profil passt hervorragend. Wenn Sie einverstanden sind, würde ich Sie gerne meinem Kunden vorstellen und ein erstes Interview mit dem CTO arrangieren. Vorher würde ich mich gerne 20 Minuten mit Ihnen austauschen – passt Ihnen Donnerstag oder Freitag?

Viele Grüße
Sabine Kurz
Hirewerk Executive Search
+49 151 55507788`,
    ),
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Lead Backend Engineer (Kotlin)",
    },
  ),
  c(
    40,
    "template",
    null,
    msg(
      "XING",
      "mailrobot@mail.xing.com",
      "Markus Engel hat Ihnen eine Nachricht geschickt",
      "2026-09-16T19:02:00+02:00",
      `Hallo Deniz Aydın,

Markus Engel (Talent Acquisition Partner bei Donaublick IT Services GmbH) hat Ihnen eine Nachricht geschickt:

„Guten Tag Herr Aydın, wir suchen für unseren Standort Regensburg eine:n Senior DevOps Engineer und ich finde Ihr Profil sehr spannend. Wären Sie offen für einen Austausch?“

Nachricht lesen und antworten: https://www.xing.com/chats/

Ihr XING-Team
Benachrichtigungen verwalten | Abmelden`,
      ATS,
    ),
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Donaublick IT Services GmbH",
      role: "Senior DevOps Engineer",
    },
  ),
  c(
    41,
    "synthetic",
    null,
    msg(
      "Laura Winter",
      "laura.winter@bavaria-cloud.example",
      "Deine Erfahrung mit Payments – Staff Product Manager bei Bavaria Cloud?",
      "2026-10-05T11:11:00+02:00",
      `Hi Deniz,

ich bin Laura, Inhouse-Recruiterin bei Bavaria Cloud in München. Wir bauen gerade unser Billing-Produkt neu auf und suchen eine:n Staff Product Manager. Deine Erfahrung mit Payments-Produkten ist genau das, was wir brauchen.

Remote innerhalb Deutschlands möglich, Visa-Sponsoring bieten wir an.

Hast du nächste Woche 20 Minuten für einen ersten Austausch?

Viele Grüße
Laura Winter
Bavaria Cloud GmbH`,
    ),
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Bavaria Cloud",
      role: "Staff Product Manager",
    },
  ),
  c(
    42,
    "template",
    "LinkedIn InMail notification from a recruiter; LinkedIn sender like the job alerts.",
    msg(
      "Jan Fischer über LinkedIn",
      "inmail-hit-reply@linkedin.com",
      "Jan Fischer: Senior Backend Engineer – remote (DACH)",
      "2026-10-19T08:30:00+02:00",
      `Hallo Deniz,

ich unterstütze die Halmbruch Technologies GmbH bei der Suche nach einem Senior Backend Engineer (Node.js/TypeScript), komplett remote innerhalb der DACH-Region, 85–95 k €.

Dein Profil passt richtig gut – wollen wir kurz telefonieren?

Beste Grüße
Jan

Antworten · Nicht interessiert

Diese E-Mail ist für Deniz Aydın bestimmt. Abmelden
© 2026 LinkedIn Corporation`,
      ATS,
    ),
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Halmbruch Technologies GmbH",
      role: "Senior Backend Engineer (Node.js/TypeScript)",
    },
  ),

  // ───────────── info_request ─────────────
  c(
    43,
    "synthetic",
    "Asks for salary expectations and notice period (Gehaltsvorstellung, Kündigungsfrist).",
    msg(
      "Jonas Petersen",
      "jonas.petersen@elbtal-mobility.example",
      "Kurze Rückfrage zu Gehaltsvorstellung und Kündigungsfrist",
      "2026-08-28T15:50:00+02:00",
      `Hallo Deniz,

bevor wir den nächsten Schritt planen, hätte ich zwei kurze Fragen:

1. Wie sieht deine Gehaltsvorstellung (Jahresbrutto) für die Rolle Senior Frontend Engineer (React) aus?
2. Welche Kündigungsfrist hast du bei deinem aktuellen Arbeitgeber bzw. ab wann wärst du frühestens verfügbar?

Eine kurze Antwort per Mail reicht völlig.

Viele Grüße
Jonas Petersen
Elbtal Mobility GmbH`,
    ),
    {
      category: "info_request",
      applicationId: "de-app-elbtal",
      suggestedStatus: null,
      company: "Elbtal Mobility GmbH",
      role: "Senior Frontend Engineer (React)",
    },
  ),
  c(
    44,
    "synthetic",
    "Request for Arbeitszeugnisse and references late in the process.",
    msg(
      "Sophie Brandt",
      "sophie.brandt@kranich-health.example",
      "Bitte um Arbeitszeugnisse und Referenzen",
      "2026-09-30T09:45:00+02:00",
      `Lieber Herr Aydın,

wir befinden uns in der finalen Phase für die Position Staff Engineer Platform. Damit wir den Prozess abschließen können, bitten wir Sie um:

– Ihre Arbeitszeugnisse der letzten beiden Arbeitgeber
– Kontaktdaten von zwei Referenzgebern (idealerweise eine ehemalige Führungskraft)

Gerne bis Ende dieser Woche per E-Mail.

Herzliche Grüße
Sophie Brandt
Kranich Health GmbH`,
    ),
    {
      category: "info_request",
      applicationId: "de-app-kranich",
      suggestedStatus: null,
      company: "Kranich Health GmbH",
      role: "Staff Engineer Platform",
    },
  ),
  c(
    45,
    "synthetic",
    null,
    msg(
      "Magdalena Gruber",
      "m.gruber@alpbau.example",
      "AW: Bewerbung als Full-Stack Entwickler – Rückfrage",
      "2026-08-24T13:00:00+02:00",
      `Sehr geehrter Herr Aydın,

eine kurze Rückfrage zu Ihrer Bewerbung: Wäre ein Umzug nach Wien für Sie grundsätzlich vorstellbar, und benötigen Sie eine Rot-Weiß-Rot-Karte? Außerdem würde uns interessieren, ab wann Sie frühestens verfügbar wären.

Vielen Dank vorab und freundliche Grüße
Magdalena Gruber
Alpbau Digital AG`,
      { threadId: "thr-de-alpbau-1", inReplyTo: "<CAK1alpbau.bewerbung@mail.example>" },
    ),
    {
      category: "info_request",
      applicationId: "de-app-alpbau",
      suggestedStatus: null,
      company: "Alpbau Digital AG",
      role: "Full-Stack Entwickler",
    },
  ),
  c(
    46,
    "template",
    "ATS template asking for a missing document — reads like a confirmation but requests action.",
    msg(
      "Weißdorn Pharma GmbH",
      "noreply@personio.de",
      "Fehlende Unterlagen zu Ihrer Bewerbung",
      "2026-09-05T10:00:00+02:00",
      `Hallo Deniz,

vielen Dank für Ihre Bewerbung als Software Engineer Laborsysteme. Leider fehlt in Ihren Unterlagen noch Ihr Lebenslauf (die hochgeladene Datei ist leer).

Bitte laden Sie Ihren Lebenslauf über den folgenden Link erneut hoch, damit wir Ihre Bewerbung vollständig prüfen können:
https://weissdorn-pharma.jobs.personio.de/upload/3c9f1

Mit freundlichen Grüßen
Ihr Recruiting-Team der Weißdorn Pharma GmbH`,
      ATS,
    ),
    {
      category: "info_request",
      applicationId: null,
      suggestedStatus: null,
      company: "Weißdorn Pharma GmbH",
      role: "Software Engineer Laborsysteme",
    },
  ),
  c(
    47,
    "synthetic",
    null,
    msg(
      "Nina Keller",
      "nina.keller@seeblick.example",
      "Rückfrage Arbeitsbewilligung",
      "2026-10-08T09:10:00+02:00",
      `Guten Tag Herr Aydın,

im Hinblick auf Ihr Interview für die Stelle Software Engineer Mobile möchten wir vorab klären: Verfügen Sie bereits über eine Arbeitsbewilligung für die Schweiz oder einen EU/EFTA-Pass? Und wie hoch wäre Ihre Lohnvorstellung in CHF?

Besten Dank und freundliche Grüsse
Nina Keller
Seeblick Versicherungen AG, Zürich`,
    ),
    {
      category: "info_request",
      applicationId: "de-app-seeblick",
      suggestedStatus: null,
      company: "Seeblick Versicherungen AG",
      role: "Software Engineer Mobile",
    },
  ),

  // ───────────── job_alert ─────────────
  c(
    48,
    "template",
    null,
    msg(
      "StepStone Job-Agent",
      "jobagent@stepstone.de",
      "12 neue Jobs für „Senior Backend Developer“ in Berlin",
      "2026-08-11T06:30:00+02:00",
      `Ihr Job-Agent hat neue Stellenangebote gefunden:

Senior Backend Developer (m/w/d) – Kaiserkron Logistics GmbH – Berlin
Backend Engineer Java/Kotlin (m/w/d) – Spreeufer Digital – Berlin, Homeoffice möglich
Senior Software Engineer Python (all genders) – Mauerpark Data GmbH – Berlin

Alle 12 Jobs ansehen: https://www.stepstone.de/jobagent

Job-Agent bearbeiten · Abmelden
StepStone Deutschland GmbH, Düsseldorf`,
      ATS,
    ),
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    49,
    "template",
    null,
    msg(
      "XING Stellenmarkt",
      "jobs@mail.xing.com",
      "Diese Jobs passen zu Ihnen",
      "2026-08-29T07:15:00+02:00",
      `Hallo Deniz Aydın,

wir haben neue Jobs gefunden, die zu Ihrem Profil passen:

• Product Manager (m/w/d) – Lindenhof Software AG – München
• Senior Product Owner E-Commerce – Alsterblick Retail – Hamburg
• Product Lead Payments – Kupferkessel Fintech – Frankfurt

Weitere Jobs entdecken: https://www.xing.com/jobs

Sie erhalten diese E-Mail, weil Sie Job-Empfehlungen abonniert haben. Abmelden`,
      ATS,
    ),
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    50,
    "template",
    'Job alert titled like an invitation ("Sie sind eingeladen, sich zu bewerben").',
    msg(
      "LinkedIn Jobs",
      "jobs-noreply@linkedin.com",
      "Deniz, Sie sind eingeladen, sich bei Wolkenwerk zu bewerben",
      "2026-09-03T18:20:00+02:00",
      `Wolkenwerk GmbH sucht Kandidat:innen wie Sie

Senior Site Reliability Engineer
Wolkenwerk GmbH · Berlin (Hybrid)
Ihr Profil passt zu 8 von 10 Anforderungen.

Jetzt bewerben: https://www.linkedin.com/jobs/view/

Ähnliche Jobs: Platform Engineer – Spreewerk Energie GmbH · SRE – Kiezkraft

Sie erhalten diese E-Mail, weil Sie Job-Empfehlungen aktiviert haben. Abmelden
© 2026 LinkedIn Ireland Unlimited Company`,
      ATS,
    ),
    {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: "Wolkenwerk GmbH",
      role: "Senior Site Reliability Engineer",
    },
  ),
  c(
    51,
    "template",
    null,
    msg(
      "Indeed",
      "alert@indeed.com",
      "Neue Jobs: Frontend Entwickler React in Hamburg",
      "2026-09-19T06:05:00+02:00",
      `Frontend Entwickler React – 7 neue Jobs

Frontend Developer React (m/w/d)
Hanseklang Media GmbH – Hamburg
55.000 € – 70.000 € pro Jahr
Einfach bewerben

Senior Frontend Engineer
Kranhaus Commerce – Hamburg, Hybrid

Alle Ergebnisse anzeigen

Diesen Job-Alert verwalten · Abmelden
Indeed Ireland Operations Ltd.`,
      ATS,
    ),
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    52,
    "template",
    null,
    msg(
      "Glassdoor Jobs",
      "noreply@glassdoor.com",
      "Product Manager-Jobs in München – 9 neue Stellen",
      "2026-10-01T07:40:00+02:00",
      `Neue Jobs für Ihre Suche „Product Manager“ in München:

Product Manager Mobile – Isarwerk Software GmbH – 4,2 ★
Senior Product Manager Plattform – Würmtal Systems – 3,9 ★
Technical Product Manager – Brandauer Automotive AG – 4,0 ★

Alle Jobs ansehen

Glassdoor-E-Mail-Einstellungen · Abmelden`,
      ATS,
    ),
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    53,
    "template",
    "Alert lists a tracked company (Isarwerk) with a different role; must not link or move the application.",
    msg(
      "LinkedIn Job Alerts",
      "jobalerts-noreply@linkedin.com",
      "„Product Manager Payments“: Isarwerk Software GmbH und weitere",
      "2026-10-14T19:00:00+02:00",
      `Ihre Job-Benachrichtigung für Product Manager Payments in Deutschland

Isarwerk Software GmbH – Senior Product Manager Checkout · München
Kupferkessel Fintech – Product Manager Payments · Frankfurt am Main
Taunus Bank Digital – Product Owner Zahlungsverkehr · Frankfurt am Main

Alle Jobs ansehen

Job-Benachrichtigung bearbeiten · Abmelden
© 2026 LinkedIn`,
      ATS,
    ),
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    54,
    "template",
    null,
    msg(
      "StepStone",
      "jobagent@stepstone.de",
      "Top-Jobs der Woche: Software Engineer (Remote)",
      "2026-10-21T06:30:00+02:00",
      `Hallo Deniz,

die Top-Jobs der Woche für „Software Engineer“ (Remote):

Software Engineer Backend (m/w/d) – Quellwerk Systems – Remote
Fullstack Engineer TypeScript – Halmbruch Technologies GmbH – Remote
Software Engineer Mobile (Flutter) – Gipfelpunkt Apps – Remote/Innsbruck

Jetzt ansehen

Job-Agent abbestellen
StepStone Deutschland GmbH`,
      ATS,
    ),
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),

  // ───────────── other_job ─────────────
  c(
    55,
    "template",
    "Application-portal password reset from an ATS domain.",
    msg(
      "Brandauer Automotive AG Karriere",
      "noreply@successfactors.eu",
      "Zurücksetzen Ihres Passworts",
      "2026-09-15T08:10:00+02:00",
      `Sehr geehrter Herr Aydın,

Sie haben das Zurücksetzen Ihres Passworts für das Karriereportal der Brandauer Automotive AG angefordert.

Klicken Sie auf den folgenden Link, um ein neues Passwort festzulegen (gültig für 24 Stunden):
https://career.successfactors.eu/reset

Falls Sie diese Anfrage nicht gestellt haben, ignorieren Sie diese E-Mail bitte.

Brandauer Automotive AG`,
      { bulk: true },
    ),
    {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: "Brandauer Automotive AG",
      role: null,
    },
  ),
  c(
    56,
    "template",
    "Career-fair newsletter from an ATS mail domain (job-search related, but no specific class).",
    msg(
      "Kiezkraft Karriere",
      "kiezkraft@teamtailor-mail.com",
      "Triff uns auf der Berliner Tech-Karrieremesse am 17. Oktober",
      "2026-10-06T12:00:00+02:00",
      `Hey Deniz,

du bist Teil unserer Talent Community – deshalb laden wir dich herzlich zu unserem Stand auf der Tech-Karrieremesse in der Station Berlin ein (17. Oktober 2026, 10–17 Uhr).

Unsere Engineers stellen offene Rollen vor, beantworten Fragen und geben CV-Feedback.

Kostenloses Ticket sichern: https://kiezkraft.teamtailor.com/events

Bis bald!
Dein Kiezkraft People Team

Du möchtest keine Updates mehr? Abmelden`,
      ATS,
    ),
    { category: "other_job", applicationId: null, suggestedStatus: null, company: "Kiezkraft", role: null },
  ),
  c(
    57,
    "template",
    '"Vervollständigen Sie Ihr Profil" nudge from a job board.',
    msg(
      "StepStone",
      "service@stepstone.de",
      "Ihr Profil ist zu 60 % vollständig",
      "2026-08-16T10:00:00+02:00",
      `Hallo Deniz,

Arbeitgeber finden Sie leichter, wenn Ihr Profil vollständig ist. Es fehlen noch:

– Gehaltsvorstellung
– Berufserfahrung bei Ihrem aktuellen Arbeitgeber
– Sprachkenntnisse

Jetzt Profil vervollständigen: https://www.stepstone.de/profil

Ihr StepStone-Team
Newsletter abbestellen`,
      ATS,
    ),
    { category: "other_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    58,
    "template",
    null,
    msg(
      "Nordstern Versicherung AG",
      "nordstern@myworkday.com",
      "Ihr Kandidatenkonto wurde erstellt",
      "2026-09-20T21:14:00+02:00",
      `Guten Tag Deniz Aydın,

Ihr Kandidatenkonto für das Karriereportal der Nordstern Versicherung AG wurde erfolgreich erstellt.

Benutzername: deniz.aydin@mail.example

Über Ihr Konto können Sie Bewerbungen einreichen, Ihren Status verfolgen und Job-Benachrichtigungen einrichten.

Mit freundlichen Grüßen
Nordstern Versicherung AG – Talent Acquisition`,
      { bulk: true },
    ),
    {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: "Nordstern Versicherung AG",
      role: null,
    },
  ),
  c(
    59,
    "template",
    "Confirmation that the user withdrew the application — not a rejection; application already withdrawn.",
    msg(
      "Spreewerk Energie GmbH",
      "noreply@smartrecruiters.com",
      "Ihre Bewerbung wurde zurückgezogen",
      "2026-08-22T17:35:00+02:00",
      `Hallo Deniz,

hiermit bestätigen wir, dass Sie Ihre Bewerbung für die Position Platform Engineer bei der Spreewerk Energie GmbH zurückgezogen haben.

Wir bedauern Ihre Entscheidung, respektieren sie aber natürlich. Sie können sich jederzeit erneut auf offene Stellen bewerben.

Viele Grüße
Spreewerk Energie GmbH – Recruiting`,
      ATS,
    ),
    {
      category: "other_job",
      applicationId: "de-app-spreewerk",
      suggestedStatus: null,
      company: "Spreewerk Energie GmbH",
      role: "Platform Engineer",
    },
  ),

  // ───────────── not_job ─────────────
  c(
    60,
    "synthetic",
    'Credit-card "Antrag eingegangen" reads like an application confirmation.',
    msg(
      "Lindenbank Kreditkarten",
      "service@lindenbank.example",
      "Ihr Antrag ist bei uns eingegangen",
      "2026-07-24T13:00:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank für Ihren Antrag auf die Lindenbank Gold Kreditkarte. Wir haben Ihre Unterlagen erhalten und prüfen diese nun. In der Regel erhalten Sie innerhalb von 5 Werktagen eine Entscheidung.

Ihre Antragsnummer: KK-2026-448812

Mit freundlichen Grüßen
Ihre Lindenbank`,
      { bulk: true },
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    61,
    "synthetic",
    'Bank "Ihr Antrag wurde abgelehnt" — rejection wording, not job-related.',
    msg(
      "Lindenbank Kreditservice",
      "kredit@lindenbank.example",
      "Entscheidung zu Ihrem Kreditantrag",
      "2026-08-04T10:30:00+02:00",
      `Sehr geehrter Herr Aydın,

wir bedauern, Ihnen mitteilen zu müssen, dass wir Ihren Antrag auf einen Ratenkredit über 15.000 € derzeit leider nicht berücksichtigen können. Grund ist die fehlende Dauer Ihres Wohnsitzes in Deutschland.

Gerne können Sie in sechs Monaten einen neuen Antrag stellen.

Mit freundlichen Grüßen
Ihre Lindenbank`,
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    62,
    "synthetic",
    'Retail "Sonderangebot nur für Sie" — offer wording, not a job offer.',
    msg(
      "Kleiderkammer Online",
      "newsletter@kleiderkammer.example",
      "Ihr exklusives Angebot: 30 % auf alles!",
      "2026-09-25T08:00:00+02:00",
      `Hallo Deniz,

nur für kurze Zeit: Ihr persönliches Sonderangebot! Mit dem Code HERBST30 erhalten Sie 30 % Rabatt auf die gesamte Herbstkollektion.

Angebot gültig bis 30. September 2026.

Jetzt shoppen

Sie erhalten diesen Newsletter, weil Sie sich angemeldet haben. Abmelden
Kleiderkammer Online GmbH, Leipzig`,
      ATS,
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    63,
    "synthetic",
    'Podcast newsletter with "Interview" in the subject.',
    msg(
      "Code & Kaffee Podcast",
      "hallo@codeundkaffee.example",
      "Neue Folge: Interview mit der CTO von Hafenkontor",
      "2026-10-10T09:00:00+02:00",
      `Moin!

In Folge 87 sprechen wir im Interview mit Dr. Frauke Ahlers, CTO der Hafenkontor Analytics GmbH, über Datenplattformen im Mittelstand, Teamstrukturen und warum sie keine Coding-Interviews mehr macht.

Jetzt reinhören auf allen gängigen Plattformen.

Viel Spaß beim Hören
Euer Code & Kaffee Team

Newsletter abbestellen`,
      ATS,
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    64,
    "synthetic",
    'Apartment application (Wohnungsbewerbung) confirmation and viewing "Termin".',
    msg(
      "Hausverwaltung Prenzlberg",
      "vermietung@hv-prenzlberg.example",
      "Eingangsbestätigung Ihrer Bewerbung – Wohnung Kastanienallee 12",
      "2026-09-07T14:20:00+02:00",
      `Sehr geehrter Herr Aydın,

vielen Dank für Ihre Bewerbung auf die 2-Zimmer-Wohnung in der Kastanienallee 12. Wir haben Ihre Mieterselbstauskunft und die Gehaltsnachweise erhalten.

Gerne laden wir Sie zur Besichtigung am 12. September 2026 um 17:30 Uhr ein.

Mit freundlichen Grüßen
Hausverwaltung Prenzlberg GmbH`,
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    65,
    "synthetic",
    'University admission "Bewerbung eingegangen".',
    msg(
      "Studierendenservice Universität Elbstadt",
      "bewerbung@uni-elbstadt.example",
      "Ihre Bewerbung für den Masterstudiengang Informatik",
      "2026-07-21T11:00:00+02:00",
      `Sehr geehrter Herr Aydın,

Ihre Bewerbung für den Masterstudiengang Informatik (Wintersemester 2026/27) ist im Bewerbungsportal eingegangen. Bitte reichen Sie die beglaubigten Zeugniskopien bis zum 15. August 2026 nach.

Mit freundlichen Grüßen
Studierendenservice – Universität Elbstadt`,
      { bulk: true },
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    66,
    "synthetic",
    "Visa appointment confirmation — job-adjacent wording (Blaue Karte) but not a hiring mail.",
    msg(
      "Visa-Terminservice",
      "termin@visa-service.example",
      "Terminbestätigung: Antrag Blaue Karte EU",
      "2026-10-16T09:30:00+02:00",
      `Sehr geehrter Herr Aydın,

hiermit bestätigen wir Ihren Termin zur Antragstellung für ein nationales Visum (Blaue Karte EU) am 4. November 2026 um 09:15 Uhr.

Bitte bringen Sie Ihren Reisepass, den unterschriebenen Arbeitsvertrag und zwei biometrische Passfotos mit.

Ihr Visa-Terminservice`,
      { bulk: true },
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    67,
    "template",
    "Marketing newsletter from an ATS vendor domain aimed at HR buyers, not at candidates.",
    msg(
      "Personio",
      "newsletter@personio.de",
      "Webinar: HR-Trends 2027 – so gewinnen Sie Talente",
      "2026-10-13T10:00:00+02:00",
      `Hallo Deniz,

die Arbeitswelt verändert sich – ist Ihre HR-Abteilung bereit? In unserem kostenlosen Webinar am 29. Oktober zeigen wir, wie Sie Recruiting-Prozesse automatisieren und die Candidate Experience verbessern.

Jetzt kostenlos anmelden

Personio SE & Co. KG · Seidlstraße 3 · 80335 München
Sie erhalten diese E-Mail aufgrund Ihrer Anmeldung zu unserem Newsletter. Abmelden`,
      ATS,
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    68,
    "synthetic",
    null,
    msg(
      "Paketdienst Blitz",
      "info@paketblitz.example",
      "Ihre Sendung wird heute zugestellt",
      "2026-09-26T07:45:00+02:00",
      `Hallo Deniz Aydın,

Ihre Sendung 00340 4412 7781 wird heute zwischen 10:00 und 14:00 Uhr zugestellt. Sollten Sie nicht zu Hause sein, wird das Paket in der nächsten Filiale hinterlegt.

Sendung verfolgen

Ihr Paketdienst Blitz`,
      { bulk: true },
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    69,
    "synthetic",
    "Personal mail that mentions the user's interviews in passing.",
    msg(
      "Elif Schneider",
      "elif.schneider@mail.example",
      "Abendessen am Samstag?",
      "2026-10-03T20:15:00+02:00",
      `Hey Deniz,

wie lief eigentlich dein Vorstellungsgespräch letzte Woche? Erzähl mal! Wenn du am Samstag in Berlin bist, lass uns doch zusammen essen gehen – ich kenne ein tolles anatolisches Restaurant in Kreuzberg.

Sag einfach Bescheid, ob 19 Uhr passt.

Liebe Grüße
Elif`,
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    70,
    "synthetic",
    null,
    msg(
      "Funkwerk Mobilfunk",
      "rechnung@funkwerk-mobil.example",
      "Ihre Rechnung für September 2026",
      "2026-10-02T05:00:00+02:00",
      `Guten Tag Herr Aydın,

Ihre Rechnung für September 2026 steht im Kundenportal bereit. Rechnungsbetrag: 29,99 €. Der Betrag wird am 8. Oktober 2026 von Ihrem Konto abgebucht.

Freundliche Grüße
Ihr Funkwerk Kundenservice`,
      { bulk: true },
    ),
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
];
