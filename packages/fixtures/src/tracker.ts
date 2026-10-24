import {
  type Application,
  type ApplicationEvent,
  type ApplicationPriority,
  type ApplicationStatus,
  type Channel,
  type Contact,
  type EventActor,
  type Interview,
  revert,
  type ThreadRef,
  transition,
} from "@bfhr/core";
import { daysAgo, wallClock } from "./time";

/* ------------------------------------------------------------------------------------------------
 * Applications are replayed through the real state machine (`transition` / `revert`) so every
 * fixture history is a legal sequence of moves and the events match the application documents.
 * ---------------------------------------------------------------------------------------------- */

interface Step {
  readonly to: ApplicationStatus;
  readonly at: Date;
  readonly actor?: EventActor;
  readonly confidence?: number;
  readonly mailMessageId?: string;
  readonly reason?: string;
  readonly text?: string;
  readonly id?: string;
}

interface Revert {
  readonly revert: string;
  readonly at: Date;
}

interface Extra {
  readonly type: "note" | "mail_received" | "mail_sent" | "interview_scheduled";
  readonly at: Date;
  readonly text: string;
  readonly mailMessageId?: string;
  readonly reason?: string;
}

type CvPin = "en-1" | "en-2" | "en-3" | "de-1" | "de-2";

interface ApplicationSpec {
  readonly id: string;
  readonly jobId: string | null;
  readonly company: string;
  readonly domain: string | null;
  readonly role: string;
  readonly location: string | null;
  readonly channel: Channel | null;
  readonly source: string | null;
  readonly created: Date;
  readonly initial?: ApplicationStatus;
  readonly steps?: readonly (Step | Revert)[];
  readonly extras?: readonly Extra[];
  readonly cv?: CvPin;
  readonly coverLetterId?: string;
  readonly coverLetterFileId?: string;
  readonly fromAccountId?: string;
  readonly threadRefs?: readonly ThreadRef[];
  readonly nextAction?: string;
  readonly nextActionAt?: Date;
  readonly priority?: ApplicationPriority;
  readonly notes?: string;
}

const CV_PINS: Record<CvPin, { cvId: string; cvRevisionId: string; cvFileId: string | null }> = {
  "en-1": { cvId: "cv-en", cvRevisionId: "rev-en-1", cvFileId: null },
  "en-2": { cvId: "cv-en", cvRevisionId: "rev-en-2", cvFileId: "file-cv-en-2" },
  "en-3": { cvId: "cv-en", cvRevisionId: "rev-en-3", cvFileId: "file-cv-en-3" },
  "de-1": { cvId: "cv-de", cvRevisionId: "rev-de-1", cvFileId: "file-cv-de-1" },
  "de-2": { cvId: "cv-de", cvRevisionId: "rev-de-2", cvFileId: "file-cv-de-2" },
};

function buildApplication(spec: ApplicationSpec): { application: Application; events: ApplicationEvent[] } {
  const initial = spec.initial ?? "saved";
  const events: ApplicationEvent[] = [
    {
      id: `${spec.id}-created`,
      applicationId: spec.id,
      type: "created",
      fromStatus: null,
      toStatus: initial,
      actor: "user",
      confidence: null,
      evidence: null,
      text: null,
      revertsEventId: null,
      occurredAt: spec.created,
      createdAt: spec.created,
    },
  ];
  let state = {
    id: spec.id,
    status: initial,
    statusChangedAt: spec.created,
    appliedAt: initial === "applied" ? spec.created : (null as Date | null),
  };

  (spec.steps ?? []).forEach((step, index) => {
    if ("revert" in step) {
      const target = events.find((event) => event.id === step.revert);
      if (target === undefined) throw new Error(`${spec.id}: unknown event ${step.revert}`);
      const result = revert({ application: state, event: target, events, at: step.at });
      events.push({ id: `${spec.id}-undo-${index}`, ...result.event });
      state = { ...state, ...result.applicationPatch };
      return;
    }
    const actor = step.actor ?? "user";
    const evidence =
      step.reason === undefined
        ? undefined
        : { mailMessageId: step.mailMessageId ?? null, reason: step.reason };
    const result = transition({
      application: state,
      to: step.to,
      actor,
      at: step.at,
      ...(step.confidence === undefined ? {} : { confidence: step.confidence }),
      ...(evidence === undefined ? {} : { evidence }),
      ...(step.text === undefined ? {} : { text: step.text }),
    });
    events.push({ id: step.id ?? `${spec.id}-e${index + 1}`, ...result.event });
    state = { ...state, ...result.applicationPatch };
  });

  (spec.extras ?? []).forEach((extra, index) => {
    events.push({
      id: `${spec.id}-x${index + 1}`,
      applicationId: spec.id,
      type: extra.type,
      fromStatus: null,
      toStatus: null,
      actor: "user",
      confidence: null,
      evidence:
        extra.mailMessageId === undefined && extra.reason === undefined
          ? null
          : { mailMessageId: extra.mailMessageId ?? null, reason: extra.reason ?? "Linked email" },
      text: extra.text,
      revertsEventId: null,
      occurredAt: extra.at,
      createdAt: extra.at,
    });
  });
  events.sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  const pin = spec.cv === undefined ? null : CV_PINS[spec.cv];
  const applied = state.appliedAt !== null;
  const lastEvent = events.at(-1)?.occurredAt ?? spec.created;
  return {
    application: {
      id: spec.id,
      jobId: spec.jobId,
      company: spec.company,
      companyDomain: spec.domain,
      role: spec.role,
      location: spec.location,
      status: state.status,
      statusChangedAt: state.statusChangedAt,
      channel: spec.channel,
      source: spec.source,
      appliedAt: state.appliedAt,
      cvId: pin?.cvId ?? null,
      cvRevisionId: applied ? (pin?.cvRevisionId ?? null) : null,
      cvFileId: applied ? (pin?.cvFileId ?? null) : null,
      coverLetterId: spec.coverLetterId ?? null,
      coverLetterFileId: applied ? (spec.coverLetterFileId ?? null) : null,
      fromAccountId: spec.fromAccountId ?? null,
      threadRefs: [...(spec.threadRefs ?? [])],
      nextAction: spec.nextAction ?? null,
      nextActionAt: spec.nextActionAt ?? null,
      priority: spec.priority ?? "normal",
      notes: spec.notes ?? "",
      followUpSnoozedUntil: null,
      followUpDismissedAt: null,
      ghostedSnoozedUntil: null,
      ghostedDismissedAt: null,
      emailSend: null,
      createdAt: spec.created,
      updatedAt: lastEvent,
    },
    events,
  };
}

/** Rule: confirmation emails from ATS senders. */
const ack = (at: Date, mailMessageId?: string, id?: string): Step => ({
  to: "acknowledged",
  at,
  actor: "rule",
  confidence: 0.99,
  reason: "Application confirmation from the job's applicant tracking system",
  ...(mailMessageId === undefined ? {} : { mailMessageId }),
  ...(id === undefined ? {} : { id }),
});

const specs: ApplicationSpec[] = [
  // Offer
  {
    id: "app-lumenpay",
    jobId: "job-lumenpay-frontend",
    company: "Lumenpay",
    domain: "lumenpay.com.tr",
    role: "Frontend Engineer, Merchant Dashboard",
    location: "Istanbul (hybrid)",
    channel: "external_link",
    source: "greenhouse",
    created: daysAgo(44),
    steps: [
      { to: "applied", at: daysAgo(42) },
      ack(daysAgo(42, 0.1)),
      { to: "screening", at: daysAgo(35), text: "Recruiter call with Elif — salary band and team setup" },
      { to: "interviewing", at: daysAgo(28), text: "Technical round booked" },
      {
        to: "offer",
        at: daysAgo(1, 0.05),
        actor: "ai",
        confidence: 0.96,
        mailMessageId: "mail-lumenpay-offer",
        reason: "Email from elif.demir@lumenpay.com.tr: “Teklif Mektubu – Frontend Engineer”",
        id: "evt-lumenpay-offer",
      },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(1),
        text: "Teklif Mektubu – Frontend Engineer",
        mailMessageId: "mail-lumenpay-offer",
      },
      {
        type: "note",
        at: daysAgo(0.5),
        text: "Ask about the remote-work policy and equipment budget before replying.",
      },
    ],
    cv: "en-2",
    nextAction: "Reply to the offer",
    nextActionAt: wallClock(7, "18:00", 3),
    priority: "high",
    notes: "Team of 6 frontend engineers; hybrid 2 days in Maslak.",
  },
  // Interviewing
  {
    id: "app-kervan",
    jobId: "job-kervan-product",
    company: "Kervan Teknoloji",
    domain: "kervan.tech",
    role: "Product Engineer (Frontend)",
    location: "Istanbul (hybrid)",
    channel: "recruiter",
    source: "workable",
    created: daysAgo(26),
    initial: "applied",
    steps: [
      { to: "screening", at: daysAgo(22), text: "Intro call with Emre" },
      { to: "interviewing", at: daysAgo(12), text: "Round 1 (technical) went well" },
    ],
    extras: [{ type: "interview_scheduled", at: daysAgo(5), text: "Round 2 · on-site in Kadıköy" }],
    cv: "en-2",
    nextAction: "On-site interview",
    nextActionAt: wallClock(0, "15:00", 3),
    priority: "high",
  },
  {
    id: "app-thames",
    jobId: "job-thames-frontend",
    company: "Thames Ledger",
    domain: "thamesledger.co.uk",
    role: "Frontend Engineer, Invoicing",
    location: "London (hybrid)",
    channel: "external_link",
    source: "lever",
    created: daysAgo(20),
    steps: [
      { to: "preparing", at: daysAgo(19) },
      { to: "applied", at: daysAgo(18) },
      ack(daysAgo(18, 0.05)),
      { to: "screening", at: daysAgo(12), text: "Recruiter call with Priya" },
      { to: "interviewing", at: daysAgo(6), text: "Invited to the technical interview" },
    ],
    extras: [{ type: "interview_scheduled", at: daysAgo(6, 0.1), text: "Round 2 · technical, video" }],
    cv: "en-2",
    coverLetterId: "cl-thames",
    coverLetterFileId: "file-cl-thames",
    nextAction: "Prepare the pairing exercise",
    nextActionAt: daysAgo(-4),
    priority: "high",
  },
  {
    id: "app-brightwave",
    jobId: "job-brightwave-frontend",
    company: "Brightwave",
    domain: "brightwave.io",
    role: "Frontend Engineer, Editor",
    location: "Remote",
    channel: "external_link",
    source: "ashby",
    created: daysAgo(19),
    steps: [
      { to: "applied", at: daysAgo(17) },
      { to: "screening", at: daysAgo(10), text: "Screening call with the recruiter" },
      {
        to: "interviewing",
        at: daysAgo(2, 0.05),
        actor: "ai",
        confidence: 0.93,
        mailMessageId: "mail-brightwave-invite",
        reason: "Email from marcus@brightwave.io: “Brightwave — next step with the Editor team”",
        id: "evt-brightwave-interviewing",
      },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(2),
        text: "Brightwave — next step with the Editor team",
        mailMessageId: "mail-brightwave-invite",
      },
      { type: "interview_scheduled", at: daysAgo(2, 0.06), text: "Hiring manager interview · Google Meet" },
    ],
    cv: "en-2",
    nextAction: "Hiring manager interview",
    nextActionAt: wallClock(6, "10:00", -4),
  },
  // Screening
  {
    id: "app-grachten",
    jobId: "job-grachten-frontend",
    company: "Grachten Commerce",
    domain: "grachten.nl",
    role: "Frontend Developer, Checkout",
    location: "Amsterdam (hybrid)",
    channel: "external_link",
    source: "recruitee",
    created: daysAgo(16),
    steps: [
      { to: "applied", at: daysAgo(15) },
      ack(daysAgo(15, 0.1)),
      {
        to: "screening",
        at: daysAgo(3, 0.05),
        actor: "ai",
        confidence: 0.91,
        mailMessageId: "mail-grachten-assessment",
        reason: "Email from noreply@recruitee.com: “Next step: take-home assignment”",
        id: "evt-grachten-screening",
      },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(3),
        text: "Next step: take-home assignment for Frontend Developer, Checkout",
        mailMessageId: "mail-grachten-assessment",
      },
    ],
    cv: "en-2",
    nextAction: "Submit the take-home",
    nextActionAt: wallClock(4, "23:59", 2),
    priority: "high",
  },
  {
    id: "app-kiez",
    jobId: "job-kiez-frontend",
    company: "Kiez Health",
    domain: "kiezhealth.de",
    role: "Frontend Engineer (React)",
    location: "Berlin (hybrid)",
    channel: "external_link",
    source: "ashby",
    created: daysAgo(50),
    steps: [
      { to: "applied", at: daysAgo(48) },
      ack(daysAgo(47.9)),
      { to: "screening", at: daysAgo(27), text: "Jana invited me to a recruiter call" },
    ],
    extras: [
      { type: "mail_received", at: daysAgo(27, -0.1), text: "Intro call for the Frontend Engineer role" },
      { type: "interview_scheduled", at: daysAgo(27, 0.1), text: "Recruiter call · 30 min" },
      {
        type: "note",
        at: daysAgo(24, 1),
        text: "Call went fine; they're hiring for two teams and will decide after the Q4 planning.",
      },
    ],
    cv: "en-2",
  },
  // Acknowledged
  {
    id: "app-brisk",
    jobId: "job-brisk-frontend",
    company: "Brisk Payments",
    domain: "briskpayments.eu",
    role: "Frontend Engineer",
    location: "Remote (Europe)",
    channel: "external_link",
    source: "greenhouse",
    created: daysAgo(12),
    steps: [
      { to: "applied", at: daysAgo(11) },
      ack(daysAgo(11, 0.3), "mail-brisk-received", "evt-brisk-ack"),
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(11, 0.25),
        text: "Thank you for applying to Brisk Payments",
        mailMessageId: "mail-brisk-received",
      },
    ],
    cv: "en-3",
  },
  {
    id: "app-ada",
    jobId: "job-ada-frontend",
    company: "Ada Sigorta Teknoloji",
    domain: "adasigorta.com.tr",
    role: "Frontend Geliştirici",
    location: "İstanbul (hibrit)",
    channel: "external_link",
    source: "web",
    created: daysAgo(9),
    steps: [
      { to: "applied", at: daysAgo(8) },
      {
        to: "acknowledged",
        at: daysAgo(7),
        mailMessageId: "mail-ada-received",
        reason: "Confirmed from the review queue",
      },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(7.5),
        text: "Başvurunuz bize ulaştı – Frontend Geliştirici",
        mailMessageId: "mail-ada-received",
      },
    ],
    cv: "en-3",
    priority: "low",
  },
  {
    id: "app-nordlicht",
    jobId: "job-nordlicht-frontend",
    company: "Nordlicht Mobility",
    domain: "nordlicht-mobility.de",
    role: "Frontend Engineer, Rider App (Web)",
    location: "Berlin (hybrid)",
    channel: "external_link",
    source: "smartrecruiters",
    created: daysAgo(14),
    steps: [{ to: "applied", at: daysAgo(13) }, ack(daysAgo(13, 0.1))],
    cv: "en-2",
  },
  // Applied
  {
    id: "app-kumsal",
    jobId: "job-kumsal-frontend",
    company: "Kumsal Games",
    domain: "kumsalgames.com",
    role: "Frontend Engineer, Web Platform",
    location: "Istanbul (on-site)",
    channel: "external_link",
    source: "lever",
    created: daysAgo(9),
    steps: [
      { to: "applied", at: daysAgo(8) },
      {
        to: "rejected",
        at: daysAgo(1.5, 0.05),
        actor: "ai",
        confidence: 0.91,
        mailMessageId: "mail-kumsal-update",
        reason: "Email from people@kumsalgames.com: “Başvurunuz hakkında” reads like a rejection",
        id: "evt-kumsal-auto-reject",
      },
      { revert: "evt-kumsal-auto-reject", at: daysAgo(1.2) },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(1.5),
        text: "Başvurunuz hakkında",
        mailMessageId: "mail-kumsal-update",
      },
    ],
    cv: "en-3",
  },
  {
    id: "app-tannenbaum",
    jobId: "job-tannenbaum-frontend",
    company: "Tannenbaum Software",
    domain: "tannenbaum-software.de",
    role: "Frontend-Entwickler:in (React)",
    location: "München (hybrid)",
    channel: "external_link",
    source: "web",
    created: daysAgo(10),
    steps: [
      { to: "preparing", at: daysAgo(9) },
      { to: "applied", at: daysAgo(6) },
    ],
    cv: "de-2",
    coverLetterId: "cl-tannenbaum",
    coverLetterFileId: "file-cl-tannenbaum",
  },
  {
    id: "app-quill",
    jobId: "job-quill-frontend",
    company: "Quill Docs",
    domain: "quilldocs.com",
    role: "Frontend Engineer",
    location: "Remote",
    channel: "external_link",
    source: "greenhouse",
    created: daysAgo(11),
    steps: [{ to: "applied", at: daysAgo(9) }],
    cv: "en-3",
  },
  {
    id: "app-halden",
    jobId: "job-halden-product",
    company: "Halden Freight",
    domain: "haldenfreight.co.uk",
    role: "Product Engineer",
    location: "Manchester (hybrid)",
    channel: "email",
    source: "web",
    created: daysAgo(3),
    steps: [{ to: "applied", at: daysAgo(2) }],
    extras: [{ type: "mail_sent", at: daysAgo(2), text: "Application: Product Engineer — Deniz Aksoy" }],
    cv: "en-3",
    coverLetterId: "cl-halden",
    coverLetterFileId: "file-cl-halden",
    fromAccountId: "acc-gmail",
    threadRefs: [
      {
        accountId: "acc-gmail",
        provider: "gmail",
        threadId: "18f6a1b2c3d4e5f6",
        rfc822MessageId: "<CAH4k2s9xQ1d7Lw-halden-apply@mail.gmail.com>",
      },
    ],
  },
  // Preparing
  {
    id: "app-northstar",
    jobId: "job-northstar-frontend",
    company: "Northstar Maps",
    domain: "northstarmaps.nl",
    role: "Frontend Engineer, Map Platform",
    location: "Amsterdam (hybrid)",
    channel: null,
    source: "recruitee",
    created: daysAgo(4),
    steps: [{ to: "preparing", at: daysAgo(3) }],
    cv: "en-3",
    nextAction: "Tailor CV for the map platform role",
    nextActionAt: daysAgo(-1),
  },
  {
    id: "app-polder",
    jobId: "job-polder-frontend",
    company: "Polder Energy",
    domain: "polderenergy.nl",
    role: "Frontend Developer",
    location: "Rotterdam (hybrid)",
    channel: null,
    source: "workable",
    created: daysAgo(3),
    steps: [{ to: "preparing", at: daysAgo(1) }],
    cv: "en-3",
    nextAction: "Write cover letter",
    nextActionAt: daysAgo(-2),
  },
  // Saved
  {
    id: "app-sail",
    jobId: "job-sail-product",
    company: "Sail Analytics",
    domain: "sailanalytics.com",
    role: "Product Engineer, Growth",
    location: "Remote",
    channel: null,
    source: "ashby",
    created: daysAgo(2),
  },
  {
    id: "app-bosphorus",
    jobId: "job-bosphorus-frontend",
    company: "Bosphorus Bank Digital",
    domain: "bosphorusbank.com.tr",
    role: "Senior Frontend Engineer, Mobile Web",
    location: "Istanbul (hybrid)",
    channel: null,
    source: "web",
    created: daysAgo(1),
    priority: "low",
  },
  {
    id: "app-aire",
    jobId: "job-aire-frontend",
    company: "Aire Digital Health",
    domain: "airedigitalhealth.co.uk",
    role: "Frontend Engineer",
    location: "Leeds (hybrid)",
    channel: null,
    source: "reed",
    created: daysAgo(0.5),
  },
  // Rejected
  {
    id: "app-fjordline",
    jobId: "job-fjordline-frontend",
    company: "Fjordline Health",
    domain: "fjordline-health.de",
    role: "Frontend Engineer (m/w/d)",
    location: "Hamburg (hybrid)",
    channel: "external_link",
    source: "web",
    created: daysAgo(38),
    steps: [
      { to: "applied", at: daysAgo(37) },
      ack(daysAgo(36)),
      { to: "screening", at: daysAgo(30), text: "Call with Katrin from recruiting" },
      {
        to: "rejected",
        at: daysAgo(16, 0.05),
        actor: "ai",
        confidence: 0.95,
        mailMessageId: "mail-fjordline-rejection",
        reason: "Email from recruiting@fjordline-health.de: “Ihre Bewerbung als Frontend Engineer (m/w/d)”",
        id: "evt-fjordline-reject",
      },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(16),
        text: "Ihre Bewerbung als Frontend Engineer (m/w/d)",
        mailMessageId: "mail-fjordline-rejection",
      },
    ],
    cv: "de-1",
  },
  {
    id: "app-cadence",
    jobId: "job-cadence-frontend",
    company: "Cadence Analytics",
    domain: "cadenceanalytics.io",
    role: "Frontend Engineer, Dashboards",
    location: "Dublin or remote (EU)",
    channel: "external_link",
    source: "lever",
    created: daysAgo(33),
    steps: [
      { to: "applied", at: daysAgo(32) },
      ack(daysAgo(32, 0.05)),
      {
        to: "rejected",
        at: daysAgo(10, 0.05),
        actor: "rule",
        confidence: 0.97,
        mailMessageId: "mail-cadence-rejection",
        reason:
          "Reply in the application thread from no-reply@hire.lever.co: “We've decided not to move forward”",
        id: "evt-cadence-reject",
      },
    ],
    extras: [
      {
        type: "mail_received",
        at: daysAgo(10),
        text: "Re: Your application to Cadence Analytics",
        mailMessageId: "mail-cadence-rejection",
      },
    ],
    cv: "en-2",
  },
  {
    id: "app-helio",
    jobId: "job-helio-frontend",
    company: "Helio Energy",
    domain: "helio-energy.de",
    role: "Frontend Engineer, Customer Portal",
    location: "Berlin (hybrid)",
    channel: "external_link",
    source: "greenhouse",
    created: daysAgo(62),
    steps: [
      { to: "applied", at: daysAgo(60) },
      { to: "screening", at: daysAgo(50) },
      { to: "interviewing", at: daysAgo(45) },
      {
        to: "rejected",
        at: daysAgo(35),
        text: "Told by phone after the final round: they chose someone with energy-sector experience.",
      },
    ],
    cv: "en-1",
  },
  // Withdrawn
  {
    id: "app-otterly",
    jobId: "job-otterly-frontend",
    company: "Otterly",
    domain: "otterly.app",
    role: "Frontend Engineer",
    location: "London (on-site)",
    channel: "external_link",
    source: "ashby",
    created: daysAgo(31),
    steps: [
      { to: "applied", at: daysAgo(30) },
      { to: "screening", at: daysAgo(25) },
      {
        to: "withdrawn",
        at: daysAgo(20),
        text: "Four days on-site without relocation help doesn't work for me right now.",
      },
    ],
    cv: "en-2",
  },
  // Ghosted
  {
    id: "app-vela",
    jobId: "job-vela-frontend",
    company: "Vela Travel",
    domain: "velatravel.es",
    role: "Frontend Engineer",
    location: "Barcelona (hybrid)",
    channel: "external_link",
    source: "workable",
    created: daysAgo(57),
    steps: [{ to: "applied", at: daysAgo(55) }, ack(daysAgo(55, 0.1)), { to: "ghosted", at: daysAgo(30) }],
    cv: "en-1",
  },
  // Declined
  {
    id: "app-atlas",
    jobId: "job-atlas-frontend",
    company: "Atlas Mobility",
    domain: "atlasmobility.com.tr",
    role: "Frontend Engineer",
    location: "Istanbul (on-site)",
    channel: "external_link",
    source: "web",
    created: daysAgo(60),
    steps: [
      { to: "applied", at: daysAgo(58) },
      { to: "screening", at: daysAgo(52) },
      { to: "interviewing", at: daysAgo(45) },
      { to: "offer", at: daysAgo(30) },
      { to: "declined", at: daysAgo(27), text: "Offer was below my floor and fully on-site." },
    ],
    cv: "en-1",
  },
  // Accepted
  {
    id: "app-mosaic",
    jobId: null,
    company: "Mosaic Learning",
    domain: "mosaiclearning.com",
    role: "Frontend Contractor (part-time, 3 months)",
    location: "Remote",
    channel: "referral",
    source: null,
    created: daysAgo(26),
    initial: "applied",
    steps: [
      { to: "interviewing", at: daysAgo(20) },
      { to: "offer", at: daysAgo(14) },
      {
        to: "accepted",
        at: daysAgo(13),
        text: "Part-time contract alongside the search: 2 days a week until January.",
      },
    ],
    cv: "en-2",
    notes: "Referred by Burak (ex-Kuzey Labs).",
  },
];

const built = specs.map(buildApplication);

export const applications: Application[] = built.map(({ application }) => application);
export const applicationEvents: ApplicationEvent[] = built.flatMap(({ events }) => events);

/** Four interviews across Istanbul, Berlin, London and New York time. */
export const interviews: Interview[] = [
  {
    id: "int-kiez-1",
    applicationId: "app-kiez",
    round: 1,
    kind: "recruiter_call",
    title: "Recruiter call",
    startsAt: wallClock(-24, "15:00", 2),
    durationMinutes: 30,
    timezone: "Europe/Berlin",
    location: null,
    meetingUrl: "https://meet.google.com/kzh-wpqa-tlm",
    people: [
      {
        name: "Jana Hoffmann",
        title: "Talent Acquisition",
        email: "jana.hoffmann@kiezhealth.de",
        contactId: "contact-jana",
      },
    ],
    prepNotes:
      "Questions: team split between patient app and practice dashboard? Relocation package details.",
    sourceMailMessageId: null,
    createdAt: daysAgo(27, 0.1),
    updatedAt: daysAgo(24),
  },
  {
    id: "int-kervan-2",
    applicationId: "app-kervan",
    round: 2,
    kind: "onsite",
    title: "On-site: system design + product",
    startsAt: wallClock(0, "15:00", 3),
    durationMinutes: 120,
    timezone: "Europe/Istanbul",
    location: "Kervan Teknoloji, Caferağa Mah. Moda Cad. 112, Kadıköy, İstanbul",
    meetingUrl: null,
    people: [
      {
        name: "Emre Kaya",
        title: "Engineering Manager",
        email: "emre.kaya@kervan.tech",
        contactId: "contact-emre",
      },
      { name: "Selin Arslan", title: "Product Designer", email: null, contactId: null },
    ],
    prepNotes:
      "Bring the Pazarbox checkout performance story. Review their shipper dashboard and think about the load-matching flow.",
    sourceMailMessageId: null,
    createdAt: daysAgo(5),
    updatedAt: daysAgo(1),
  },
  {
    id: "int-thames-2",
    applicationId: "app-thames",
    round: 2,
    kind: "technical",
    title: "Technical interview (pairing)",
    startsAt: wallClock(5, "11:00", 0),
    durationMinutes: 90,
    timezone: "Europe/London",
    location: null,
    meetingUrl: "https://thamesledger.zoom.us/j/84512399871",
    people: [
      {
        name: "Priya Natarajan",
        title: "Engineering Manager",
        email: "priya.natarajan@thamesledger.co.uk",
        contactId: "contact-priya",
      },
      { name: "Tom Adeyemi", title: "Senior Frontend Engineer", email: null, contactId: null },
    ],
    prepNotes: "Pairing on a React form with validation. Practise talking through accessibility decisions.",
    sourceMailMessageId: null,
    createdAt: daysAgo(6, 0.1),
    updatedAt: daysAgo(6, 0.1),
  },
  {
    id: "int-brightwave-1",
    applicationId: "app-brightwave",
    round: 1,
    kind: "hiring_manager",
    title: "Hiring manager interview",
    startsAt: wallClock(6, "10:00", -4),
    durationMinutes: 45,
    timezone: "America/New_York",
    location: null,
    meetingUrl: "https://meet.google.com/bwq-ztkx-rmh",
    people: [
      {
        name: "Marcus Reid",
        title: "Head of Frontend",
        email: "marcus@brightwave.io",
        contactId: "contact-marcus",
      },
    ],
    prepNotes: "",
    sourceMailMessageId: "mail-brightwave-invite",
    createdAt: daysAgo(2, 0.06),
    updatedAt: daysAgo(2, 0.06),
  },
];

export const contacts: Contact[] = [
  {
    id: "contact-elif",
    name: "Elif Demir",
    email: "elif.demir@lumenpay.com.tr",
    company: "Lumenpay",
    role: "Talent Acquisition Partner",
    links: [{ label: "LinkedIn", url: "https://www.linkedin.com/in/elif-demir-example" }],
    applicationIds: ["app-lumenpay"],
    notes: "",
    createdAt: daysAgo(35),
    updatedAt: daysAgo(1),
  },
  {
    id: "contact-emre",
    name: "Emre Kaya",
    email: "emre.kaya@kervan.tech",
    company: "Kervan Teknoloji",
    role: "Engineering Manager",
    links: [],
    applicationIds: ["app-kervan"],
    notes: "Reached out first on LinkedIn.",
    createdAt: daysAgo(26),
    updatedAt: daysAgo(5),
  },
  {
    id: "contact-priya",
    name: "Priya Natarajan",
    email: "priya.natarajan@thamesledger.co.uk",
    company: "Thames Ledger",
    role: "Engineering Manager",
    links: [],
    applicationIds: ["app-thames"],
    notes: "",
    createdAt: daysAgo(12),
    updatedAt: daysAgo(6),
  },
  {
    id: "contact-marcus",
    name: "Marcus Reid",
    email: "marcus@brightwave.io",
    company: "Brightwave",
    role: "Head of Frontend",
    links: [{ label: "Blog", url: "https://brightwave.io/blog/authors/marcus" }],
    applicationIds: ["app-brightwave"],
    notes: "",
    createdAt: daysAgo(2),
    updatedAt: daysAgo(2),
  },
  {
    id: "contact-jana",
    name: "Jana Hoffmann",
    email: "jana.hoffmann@kiezhealth.de",
    company: "Kiez Health",
    role: "Talent Acquisition",
    links: [],
    applicationIds: ["app-kiez"],
    notes: "Said they'd decide after Q4 planning.",
    createdAt: daysAgo(27),
    updatedAt: daysAgo(24),
  },
  {
    id: "contact-sophie",
    name: "Sophie Krüger",
    email: "s.krueger@tannenbaum-software.de",
    company: "Tannenbaum Software",
    role: "Personal",
    links: [],
    applicationIds: ["app-tannenbaum"],
    notes: "",
    createdAt: daysAgo(8),
    updatedAt: daysAgo(0.3),
  },
];
