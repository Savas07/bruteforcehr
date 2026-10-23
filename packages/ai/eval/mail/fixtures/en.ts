import type { MailEvalApplication, MailEvalCase, MailEvalMessage } from "../types";

/**
 * English-language mail for the persona (software/product roles, based in Istanbul) applying to
 * UK, US-remote and Netherlands/EU companies. All people and companies are fictional.
 */
export const APPLICATIONS_EN: MailEvalApplication[] = [
  {
    id: "en-app-northwind-backend",
    company: "Northwind Ledger",
    companyDomain: "northwind-ledger.example",
    role: "Senior Backend Engineer",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-21T10:15:00+03:00",
  },
  {
    id: "en-app-harbor-pm",
    company: "Harbor Analytics",
    companyDomain: "harbor-analytics.example",
    role: "Product Manager",
    status: "acknowledged",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-24T09:02:00+03:00",
  },
  {
    id: "en-app-harbor-data",
    company: "Harbor Analytics",
    companyDomain: "harbor-analytics.example",
    role: "Data Engineer",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-03T21:40:00+03:00",
  },
  {
    id: "en-app-lumen-frontend",
    company: "Lumen Health",
    companyDomain: "lumenhealth.example",
    role: "Frontend Engineer",
    status: "screening",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-28T14:20:00+03:00",
  },
  {
    id: "en-app-quillstack-sre",
    company: "Quillstack",
    companyDomain: "quillstack.example",
    role: "Site Reliability Engineer",
    status: "interviewing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-22T11:00:00+03:00",
  },
  {
    id: "en-app-tidal-fullstack",
    company: "Tidal Freight",
    companyDomain: "tidal-freight.example",
    role: "Full-Stack Engineer",
    status: "interviewing",
    threadIds: ["thr-en-tidal-01"],
    sentMessageIds: ["<CAH8p2Tidal0001@mail.gmail.com>"],
    appliedAt: "2026-07-25T08:30:00+03:00",
  },
  {
    id: "en-app-pebble-backend",
    company: "Pebble & Finch Studio",
    companyDomain: null,
    role: "Backend Developer",
    status: "applied",
    threadIds: ["thr-en-pebble-01"],
    sentMessageIds: ["<CAF3k9Pebble0001@mail.gmail.com>"],
    appliedAt: "2026-08-11T19:05:00+03:00",
  },
  {
    id: "en-app-canalworks-staff",
    company: "Canalworks",
    companyDomain: "canalworks.example",
    role: "Staff Software Engineer",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-14T12:45:00+03:00",
  },
  {
    id: "en-app-orbit-pm",
    company: "Orbit Mobility",
    companyDomain: "orbit-mobility.example",
    role: "Senior Product Manager",
    status: "rejected",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-20T16:10:00+03:00",
  },
  {
    id: "en-app-fernway-platform",
    company: "Fernway",
    companyDomain: "fernway.example",
    role: "Platform Engineer",
    status: "withdrawn",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-01T10:00:00+03:00",
  },
  {
    id: "en-app-saltmarsh-go",
    company: "Saltmarsh Labs",
    companyDomain: "saltmarsh-labs.example",
    role: "Go Engineer",
    status: "saved",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: null,
  },
  {
    id: "en-app-kestrel-ts",
    company: "Kestrel Pay",
    companyDomain: "kestrelpay.example",
    role: "TypeScript Engineer",
    status: "preparing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: null,
  },
  {
    id: "en-app-juniper-tooling",
    company: "Juniper Robotics",
    companyDomain: "juniper-robotics.example",
    role: "Software Engineer, Developer Tooling",
    status: "applied",
    threadIds: ["thr-en-juniper-01"],
    sentMessageIds: ["<CAF7x2Juniper0001@mail.gmail.com>"],
    appliedAt: "2026-08-19T09:50:00+03:00",
  },
  {
    id: "en-app-meridian-fullstack",
    company: "Meridian Atlas",
    companyDomain: null,
    role: "Full-Stack Developer",
    status: "acknowledged",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-06T13:30:00+03:00",
  },
];

function msg(
  name: string | null,
  address: string,
  subject: string,
  receivedAt: string,
  bodyText: string,
  extra: Partial<Omit<MailEvalMessage, "from" | "subject" | "receivedAt" | "bodyText">> = {},
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
    bulk: false,
    ...extra,
  };
}

const ATS = { listUnsubscribe: false, bulk: true } as const;
const NEWS = { listUnsubscribe: true, bulk: true } as const;

export const CASES_EN: MailEvalCase[] = [
  // ───────────── application_received ─────────────
  {
    id: "en-001",
    language: "en",
    origin: "template",
    hard: "Opens with 'Thank you for applying' like many rejections; it is a plain acknowledgement ('we will review').",
    message: msg(
      "Northwind Ledger Hiring Team",
      "no-reply@us.greenhouse-mail.io",
      "Thank you for applying to Northwind Ledger",
      "2026-07-21T08:17:00-04:00",
      `Hi Deniz,

Thank you for applying for the Senior Backend Engineer position at Northwind Ledger. We're excited that you're interested in joining our team.

Our hiring team will review your application and, if your experience is a good match for the role, someone will be in touch with next steps. Due to the volume of applications we receive, this may take up to two weeks.

In the meantime, feel free to learn more about our engineering culture on our blog.

Best,
The Northwind Ledger Talent Team

**Please note: this email was sent from a notification-only address that cannot accept incoming email. Please do not reply to this message.**`,
      ATS,
    ),
    expected: {
      category: "application_received",
      applicationId: "en-app-northwind-backend",
      suggestedStatus: "acknowledged",
      company: "Northwind Ledger",
      role: "Senior Backend Engineer",
    },
  },
  {
    id: "en-002",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Canalworks",
      "no-reply@hire.lever.co",
      "Thanks for applying to Canalworks",
      "2026-08-14T11:46:00+02:00",
      `Hi Deniz,

Thanks for your interest in Canalworks! We've received your application for Staff Software Engineer (Amsterdam / Remote EU) and our team will be reviewing it shortly.

If your background looks like a fit, a member of our recruiting team will reach out to discuss next steps.

Cheers,
Canalworks Recruiting

Sent with Lever`,
      ATS,
    ),
    expected: {
      category: "application_received",
      applicationId: "en-app-canalworks-staff",
      suggestedStatus: "acknowledged",
      company: "Canalworks",
      role: "Staff Software Engineer",
    },
  },
  {
    id: "en-003",
    language: "en",
    origin: "template",
    hard: "Company not in the tracker: must stay unlinked but still propose acknowledged.",
    message: msg(
      "Copperleaf",
      "no-reply@ashbyhq.com",
      "Your application to Copperleaf",
      "2026-08-02T15:03:00-04:00",
      `Hi Deniz,

Thanks for applying to the Senior Software Engineer, Payments role at Copperleaf. We have received your application and will be in touch if your qualifications match our needs.

You can check the status of your application at any time from the link below.

Best,
Copperleaf Recruiting

Powered by Ashby`,
      ATS,
    ),
    expected: {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Copperleaf",
      role: "Senior Software Engineer, Payments",
    },
  },
  {
    id: "en-004",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Graystone Insurance",
      "graystone@myworkday.com",
      "Graystone Insurance: Application Received - Software Engineer II (R-104882)",
      "2026-08-09T10:22:00+01:00",
      `Dear Deniz Arslan,

Thank you for your interest in Graystone Insurance. We have received your application for the Software Engineer II (R-104882) position in London, UK (Hybrid).

What happens next?
Our Talent Acquisition team will review your application against the requirements of the role. If you are shortlisted, we will contact you to discuss the next steps.

You can review the status of your application at any time by signing in to your candidate home account.

Kind regards,
Talent Acquisition
Graystone Insurance plc

This email was automatically generated. Please do not reply.`,
      ATS,
    ),
    expected: {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Graystone Insurance",
      role: "Software Engineer II",
    },
  },
  {
    id: "en-005",
    language: "en",
    origin: "synthetic",
    hard: "Mailbox auto-reply in the thread of an application sent by email (In-Reply-To the sent message, no company domain in tracker); still an acknowledgement.",
    message: msg(
      "Pebble & Finch Jobs",
      "jobs@pebblefinch.example",
      "Re: Application – Backend Developer – Deniz Arslan",
      "2026-08-11T17:05:00+01:00",
      `This is an automatic reply.

Thanks for getting in touch with Pebble & Finch Studio. We've received your email and your application for the Backend Developer role. We're a small team, so please allow up to 10 working days for someone to get back to you.

Pebble & Finch Studio · 14 Arches Lane, Bristol

> On Tue, 11 Aug 2026 at 19:05, Deniz Arslan wrote:
> Dear Pebble & Finch team,
> Please find attached my CV for the Backend Developer position advertised on your website...`,
      {
        threadId: "thr-en-pebble-01",
        inReplyTo: "<CAF3k9Pebble0001@mail.gmail.com>",
        bulk: true,
      },
    ),
    expected: {
      category: "application_received",
      applicationId: "en-app-pebble-backend",
      suggestedStatus: "acknowledged",
      company: "Pebble & Finch Studio",
      role: "Backend Developer",
    },
  },
  {
    id: "en-006",
    language: "en",
    origin: "template",
    hard: "Two applications at Harbor Analytics; the role (Data Engineer) decides the link.",
    message: msg(
      "Harbor Analytics",
      "no-reply@smartrecruiters.com",
      "Harbor Analytics - Thank you for your application",
      "2026-08-04T09:12:00+02:00",
      `Dear Deniz,

Thank you for your application for the position of Data Engineer at Harbor Analytics (Rotterdam, Netherlands).

We confirm that we have received your application and it is currently being reviewed. We will contact you as soon as possible.

Best regards,
Harbor Analytics Talent Team

This message was sent via SmartRecruiters on behalf of Harbor Analytics. Privacy Policy`,
      ATS,
    ),
    expected: {
      category: "application_received",
      applicationId: "en-app-harbor-data",
      suggestedStatus: "acknowledged",
      company: "Harbor Analytics",
      role: "Data Engineer",
    },
  },
  {
    id: "en-007",
    language: "en",
    origin: "synthetic",
    hard: "Second confirmation for an application already at 'acknowledged': linked, but no forward move, so suggestedStatus is null.",
    message: msg(
      "Meridian Atlas Careers",
      "careers@meridian-atlas.example",
      "We have your application – Full-Stack Developer",
      "2026-08-20T12:40:00+01:00",
      `Hi Deniz,

Just a quick note to say your application for Full-Stack Developer is safely with us after our move to a new careers portal. You don't need to re-apply or do anything else.

We'll be in touch about next steps soon.

Thanks,
People Team, Meridian Atlas`,
    ),
    expected: {
      category: "application_received",
      applicationId: "en-app-meridian-fullstack",
      suggestedStatus: null,
      company: "Meridian Atlas",
      role: "Full-Stack Developer",
    },
  },
  {
    id: "en-008",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Fjordline Games",
      "noreply@workablemail.com",
      "Thanks for applying to Fjordline Games",
      "2026-08-27T14:31:00+02:00",
      `Hi Deniz,

Thank you for applying to the Backend Engineer (Live Services) position at Fjordline Games.

We'll review your application and get back to you soon.

Best regards,
Fjordline Games hiring team

--
Sent via Workable. Not interested in hearing from Fjordline Games? Unsubscribe.`,
      NEWS,
    ),
    expected: {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Fjordline Games",
      role: "Backend Engineer (Live Services)",
    },
  },

  // ───────────── rejection ─────────────
  {
    id: "en-009",
    language: "en",
    origin: "template",
    hard: "'Thank you for applying… unfortunately': starts like an acknowledgement but is a rejection.",
    message: msg(
      "Juniper Robotics",
      "no-reply@us.greenhouse-mail.io",
      "Your application to Juniper Robotics",
      "2026-09-02T13:10:00-04:00",
      `Hi Deniz,

Thank you for applying for the Software Engineer, Developer Tooling role at Juniper Robotics and for the time you put into your application.

Unfortunately, after careful review we have decided not to move forward with your candidacy at this time. We received many strong applications and this was not an easy decision.

We encourage you to keep an eye on our careers page for future openings.

Best of luck in your search,
Juniper Robotics Recruiting`,
      ATS,
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-juniper-tooling",
      suggestedStatus: "rejected",
      company: "Juniper Robotics",
      role: "Software Engineer, Developer Tooling",
    },
  },
  {
    id: "en-010",
    language: "en",
    origin: "synthetic",
    hard: "Rejection after the final round wrapped in warm words ('we were impressed', 'keep your CV on file').",
    message: msg(
      "Hannah Price",
      "hannah.price@quillstack.example",
      "Your Site Reliability Engineer interviews",
      "2026-09-18T16:48:00+01:00",
      `Hi Deniz,

Thank you so much for spending so much time with us over the last few weeks. The whole panel enjoyed meeting you, and we were genuinely impressed by your incident-management walkthrough.

It was a really close call, but we've decided to offer the Site Reliability Engineer role to another candidate whose on-call experience with our stack is slightly deeper.

With your permission, we'd love to keep your CV on file and reach out when our platform team opens new roles early next year. If you'd like feedback, I'm happy to set up a short call.

Warm regards,
Hannah
Hannah Price | Talent Partner | Quillstack`,
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-quillstack-sre",
      suggestedStatus: "rejected",
      company: "Quillstack",
      role: "Site Reliability Engineer",
    },
  },
  {
    id: "en-011",
    language: "en",
    origin: "synthetic",
    hard: "Position put on hold / filled internally, phrased as an update rather than a rejection.",
    message: msg(
      "Wexford Systems Recruitment",
      "recruitment@wexford-systems.example",
      "Update on the Senior Platform Engineer vacancy",
      "2026-09-07T09:30:00+01:00",
      `Dear Deniz,

I'm writing with an update on the Senior Platform Engineer vacancy you applied for.

Following a review of our 2027 budget, the position has been put on hold and we have filled the immediate need internally. As a result we are closing all open applications for this vacancy, including yours.

We are sorry to bring this news and thank you for your interest in Wexford Systems.

Kind regards,
Recruitment Team
Wexford Systems Ltd, Manchester`,
    ),
    expected: {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Wexford Systems",
      role: "Senior Platform Engineer",
    },
  },
  {
    id: "en-012",
    language: "en",
    origin: "template",
    hard: "Late duplicate rejection for an application already closed as rejected: linked, suggestedStatus null.",
    message: msg(
      "Orbit Mobility Careers",
      "orbitmobility@myworkday.com",
      "Regarding your application for Senior Product Manager",
      "2026-08-25T18:02:00+02:00",
      `Dear Deniz,

Thank you for your interest in the Senior Product Manager role at Orbit Mobility.

We have reviewed your application and regret to inform you that we will not be progressing with your application on this occasion.

We will retain your details in our talent community and may contact you about relevant opportunities in the future.

Kind regards,
Orbit Mobility Talent Acquisition`,
      ATS,
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-orbit-pm",
      suggestedStatus: null,
      company: "Orbit Mobility",
      role: "Senior Product Manager",
    },
  },
  {
    id: "en-013",
    language: "en",
    origin: "template",
    hard: "Two applications at Harbor Analytics and the mail names no role: cannot be linked safely, so applicationId is null.",
    message: msg(
      "Harbor Analytics",
      "no-reply@smartrecruiters.com",
      "Harbor Analytics - Update on your application",
      "2026-09-11T10:05:00+02:00",
      `Dear Deniz,

Thank you for your interest in Harbor Analytics and for taking the time to apply.

After careful consideration, we regret to inform you that we have decided to proceed with other candidates whose profiles more closely match our current requirements.

We wish you every success in your job search.

Best regards,
Harbor Analytics Talent Team`,
      ATS,
    ),
    expected: {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Harbor Analytics",
      role: null,
    },
  },
  {
    id: "en-014",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Brightloop",
      "no-reply@hire.lever.co",
      "Brightloop | iOS Engineer",
      "2026-08-30T22:14:00-04:00",
      `Hi Deniz,

Thank you for your interest in the iOS Engineer position at Brightloop. We appreciate you taking the time to apply.

After reviewing your experience, we've decided to move forward with other candidates whose experience more closely aligns with our needs for this role.

We'll keep your information on file and may reach out if a suitable opening comes up.

All the best,
Brightloop Talent`,
      ATS,
    ),
    expected: {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Brightloop",
      role: "iOS Engineer",
    },
  },
  {
    id: "en-015",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Graystone Insurance",
      "graystone@myworkday.com",
      "Graystone Insurance: Update on Software Engineer II (R-104882)",
      "2026-09-14T08:40:00+01:00",
      `Dear Deniz Arslan,

Thank you for your recent application for the Software Engineer II (R-104882) position.

We have carefully reviewed your application and unfortunately you have not been selected to progress to the next stage of the process.

Thank you again for your interest in Graystone Insurance.

Kind regards,
Talent Acquisition`,
      ATS,
    ),
    expected: {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Graystone Insurance",
      role: "Software Engineer II",
    },
  },
  {
    id: "en-016",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Priya Natarajan",
      "priya.natarajan@lumenhealth.example",
      "Lumen Health – Frontend Engineer",
      "2026-10-06T15:20:00-04:00",
      `Hi Deniz,

Thanks again for completing the take-home exercise for the Frontend Engineer role. The team reviewed your submission carefully.

We've decided not to move forward to the interview stage. Your accessibility work was solid, but we're looking for deeper experience with large-scale state management for this particular role.

Thanks for your time and interest in Lumen Health.

Best,
Priya Natarajan
Technical Recruiter, Lumen Health`,
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-lumen-frontend",
      suggestedStatus: "rejected",
      company: "Lumen Health",
      role: "Frontend Engineer",
    },
  },
  {
    id: "en-017",
    language: "en",
    origin: "synthetic",
    hard: "Mixed language: Dutch rejection from an Amsterdam company in an otherwise English application.",
    message: msg(
      "Sanne de Vries",
      "sanne.devries@canalworks.example",
      "Je sollicitatie bij Canalworks",
      "2026-09-22T11:15:00+02:00",
      `Beste Deniz,

Hartelijk dank voor je sollicitatie op de functie Staff Software Engineer bij Canalworks en je interesse in ons bedrijf.

Helaas moeten we je laten weten dat we besloten hebben om niet verder te gaan met je sollicitatie. We hebben gekozen voor kandidaten wiens ervaring beter aansluit bij het profiel.

We wensen je veel succes met je verdere zoektocht.

Met vriendelijke groet,
Sanne de Vries
Talent Acquisition | Canalworks`,
    ),
    expected: {
      category: "rejection",
      applicationId: "en-app-canalworks-staff",
      suggestedStatus: "rejected",
      company: "Canalworks",
      role: "Staff Software Engineer",
    },
  },

  // ───────────── interview_invite ─────────────
  {
    id: "en-018",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Priya Natarajan",
      "priya.natarajan@lumenhealth.example",
      "Technical interview – Frontend Engineer – Lumen Health",
      "2026-08-18T10:02:00-04:00",
      `Hi Deniz,

Great news – the team would like to invite you to a 60-minute technical interview for the Frontend Engineer role. You'll pair with two of our engineers on a small React problem.

When: Tuesday, 25 August 2026, 10:00 AM ET (17:00 Istanbul time)
Where: https://zoom.us/j/84213397021

Please reply to confirm, or let me know if this time doesn't work.

Best,
Priya`,
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-lumen-frontend",
      suggestedStatus: "interviewing",
      company: "Lumen Health",
      role: "Frontend Engineer",
      dates: [{ kind: "interview", at: "2026-08-25T10:00:00-04:00" }],
      meetingUrls: ["https://zoom.us/j/84213397021"],
    },
  },
  {
    id: "en-019",
    language: "en",
    origin: "synthetic",
    hard: "Reschedule of an existing interview for an application already at 'interviewing': new date must be extracted, status stays (null).",
    message: msg(
      "Hannah Price",
      "hannah.price@quillstack.example",
      "Rescheduling: Quillstack system design interview",
      "2026-09-03T12:25:00+01:00",
      `Hi Deniz,

Apologies for the late change – Tom, who was due to run your system design interview tomorrow, is out sick.

Could we move it to Monday 7 September at 14:00 UK time (16:00 for you)? Same link as before: https://meet.google.com/qsk-wdpr-tmn

Let me know if that works and I'll update the calendar invite.

Thanks for your flexibility,
Hannah`,
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-quillstack-sre",
      suggestedStatus: null,
      company: "Quillstack",
      role: null,
      dates: [{ kind: "interview", at: "2026-09-07T14:00:00+01:00" }],
      meetingUrls: ["https://meet.google.com/qsk-wdpr-tmn"],
    },
  },
  {
    id: "en-020",
    language: "en",
    origin: "template",
    hard: "Calendar-invite-only body (Google Calendar text), no prose from a recruiter.",
    message: msg(
      "Marcus Bell",
      "calendar-notification@google.com",
      "Invitation: Northwind Ledger – Senior Backend Engineer – Interview with Marcus Bell @ Thu 10 Sep 2026 3pm - 4pm (BST)",
      "2026-09-04T09:51:00+01:00",
      `Northwind Ledger – Senior Backend Engineer – Interview with Marcus Bell

When
Thursday 10 Sep 2026 ⋅ 3pm – 4pm (British Summer Time - London)

Join with Google Meet
https://meet.google.com/nwl-bkxe-qra

Organizer
marcus.bell@northwind-ledger.example

Guests
Marcus Bell - organizer
deniz.arslan@example.com

View all guest info

Reply for deniz.arslan@example.com
Yes / No / Maybe / More options

Invitation from Google Calendar
You are receiving this email because you are an attendee on the event.`,
      { bulk: true },
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-northwind-backend",
      suggestedStatus: "interviewing",
      company: "Northwind Ledger",
      role: "Senior Backend Engineer",
      dates: [{ kind: "interview", at: "2026-09-10T15:00:00+01:00" }],
      meetingUrls: ["https://meet.google.com/nwl-bkxe-qra"],
    },
  },
  {
    id: "en-021",
    language: "en",
    origin: "synthetic",
    hard: "First recruiter phone screen → screening (not interviewing); Harbor has two applications, role names the PM one.",
    message: msg(
      "Ellie Watson",
      "ellie.watson@harbor-analytics.example",
      "Intro call – Product Manager role",
      "2026-08-12T14:07:00+02:00",
      `Hi Deniz,

Thanks for your application for the Product Manager role. I'm the recruiter supporting the team and I'd love to have a 30-minute intro call to tell you more about Harbor and hear about what you're looking for.

Would Friday 14 August at 11:00 CEST work? I'll call you via Teams:
https://teams.microsoft.com/l/meetup-join/19%3ameeting_HbrPm7c2NjYtZTQ1Mi00@thread.v2/0

Speak soon,
Ellie Watson
Talent Acquisition, Harbor Analytics`,
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-harbor-pm",
      suggestedStatus: "screening",
      company: "Harbor Analytics",
      role: "Product Manager",
      dates: [{ kind: "interview", at: "2026-08-14T11:00:00+02:00" }],
      meetingUrls: [
        "https://teams.microsoft.com/l/meetup-join/19%3ameeting_HbrPm7c2NjYtZTQ1Mi00@thread.v2/0",
      ],
    },
  },
  {
    id: "en-022",
    language: "en",
    origin: "template",
    hard: "Only a 'pick a slot' self-scheduling link: no date and no meeting URL to extract.",
    message: msg(
      "Copperleaf Recruiting",
      "no-reply@ashbyhq.com",
      "Schedule your recruiter screen with Copperleaf",
      "2026-08-10T13:44:00-04:00",
      `Hi Deniz,

Thanks for your interest in the Senior Software Engineer, Payments role at Copperleaf! We'd like to schedule a 30-minute recruiter screen with Jordan from our team.

Please pick a time that works for you using the link below:
Select a time → https://app.ashbyhq.com/scheduling/copperleaf/5c1e9a7b

If none of the available times work, just reply to this email.

Best,
Copperleaf Recruiting`,
      ATS,
    ),
    expected: {
      category: "interview_invite",
      applicationId: null,
      suggestedStatus: "screening",
      company: "Copperleaf",
      role: "Senior Software Engineer, Payments",
    },
  },
  {
    id: "en-023",
    language: "en",
    origin: "synthetic",
    hard: "Reply in the email thread of an application with no known company domain.",
    message: msg(
      "Olly Finch",
      "olly@pebblefinch.example",
      "Re: Application – Backend Developer – Deniz Arslan",
      "2026-08-24T16:30:00+01:00",
      `Hi Deniz,

Sorry for the slow reply – it's been a busy month. We really liked your CV and would love to have a chat with you and our lead dev, Ama.

How about Wednesday 2 September at 11:00 UK time? Here's the Teams link:
https://teams.microsoft.com/l/meetup-join/19%3ameeting_PfS2bQx9ZmItODk3@thread.v2/0

Should take about 45 minutes. Shout if the time doesn't suit.

Cheers,
Olly
Co-founder, Pebble & Finch Studio`,
      { threadId: "thr-en-pebble-01", inReplyTo: "<CAF3k9Pebble0001@mail.gmail.com>" },
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-pebble-backend",
      suggestedStatus: "interviewing",
      company: "Pebble & Finch Studio",
      role: "Backend Developer",
      dates: [{ kind: "interview", at: "2026-09-02T11:00:00+01:00" }],
      meetingUrls: ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_PfS2bQx9ZmItODk3@thread.v2/0"],
    },
  },
  {
    id: "en-024",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Rosa Lindqvist",
      "rosa@meridian-atlas.example",
      "Interview with our Engineering Manager – Full-Stack Developer",
      "2026-08-27T10:12:00+01:00",
      `Hi Deniz,

Thanks for your patience. Our Engineering Manager, Callum Reid, would like to meet you for a 45-minute interview for the Full-Stack Developer position.

Date: Thursday 3 September 2026
Time: 13:30 BST (15:30 Istanbul)
Link: https://meet.google.com/mrd-atlf-xse

We'll talk through your recent projects and a bit of architecture. No preparation needed.

Best wishes,
Rosa Lindqvist
People Partner, Meridian Atlas`,
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-meridian-fullstack",
      suggestedStatus: "interviewing",
      company: "Meridian Atlas",
      role: "Full-Stack Developer",
      dates: [{ kind: "interview", at: "2026-09-03T13:30:00+01:00" }],
      meetingUrls: ["https://meet.google.com/mrd-atlf-xse"],
    },
  },
  {
    id: "en-025",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Fjordline Games",
      "noreply@workablemail.com",
      "Interview invitation: Backend Engineer (Live Services) at Fjordline Games",
      "2026-09-08T09:05:00+02:00",
      `Hi Deniz,

You have been invited to an interview for the Backend Engineer (Live Services) position at Fjordline Games.

Interview details
Type: Video call
Date: Tuesday, September 15, 2026
Time: 14:00 - 15:00 (Europe/Oslo, GMT+2)
Join: https://teams.microsoft.com/l/meetup-join/19%3ameeting_FjLs4YzEtNWQ3Ny00@thread.v2/0
Interviewers: Kari Holm, Engineering Lead

Please confirm your attendance using the buttons below.
Accept · Decline · Propose new time

Sent via Workable`,
      ATS,
    ),
    expected: {
      category: "interview_invite",
      applicationId: null,
      suggestedStatus: "interviewing",
      company: "Fjordline Games",
      role: "Backend Engineer (Live Services)",
      dates: [{ kind: "interview", at: "2026-09-15T14:00:00+02:00" }],
      meetingUrls: ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_FjLs4YzEtNWQ3Ny00@thread.v2/0"],
    },
  },
  {
    id: "en-026",
    language: "en",
    origin: "synthetic",
    hard: "Final-round invite for an application already at 'interviewing': no forward move, suggestedStatus null; New York times.",
    message: msg(
      "Jamal Ortiz",
      "jamal.ortiz@tidal-freight.example",
      "Re: Full-Stack Engineer application – final round",
      "2026-09-09T17:20:00-04:00",
      `Hi Deniz,

Great chatting last week. The team would like to bring you into the final round for the Full-Stack Engineer role: three back-to-back sessions (product deep-dive, system design, values).

We have you down for Monday, September 21, 9:00 AM – 12:00 PM ET (16:00–19:00 Istanbul). Zoom: https://zoom.us/j/93017745520

Let me know if you need any accommodations.

Jamal Ortiz
Recruiting Lead, Tidal Freight (remote, US)`,
      { threadId: "thr-en-tidal-01", inReplyTo: "<CAH8p2Tidal0001@mail.gmail.com>" },
    ),
    expected: {
      category: "interview_invite",
      applicationId: "en-app-tidal-fullstack",
      suggestedStatus: null,
      company: "Tidal Freight",
      role: "Full-Stack Engineer",
      dates: [{ kind: "interview", at: "2026-09-21T09:00:00-04:00" }],
      meetingUrls: ["https://zoom.us/j/93017745520"],
    },
  },

  // ───────────── assessment ─────────────
  {
    id: "en-027",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Codility",
      "no-reply@codility.com",
      "Northwind Ledger has invited you to take a test",
      "2026-07-29T11:03:00+01:00",
      `Hello Deniz,

Northwind Ledger has invited you to complete a programming test as part of the recruitment process for Senior Backend Engineer.

The test consists of 3 tasks and lasts 120 minutes. You can take it any time before the deadline:
Deadline: 5 August 2026, 23:59 (UTC+01:00)

Start the test: https://app.codility.com/test/NWL8F2-QX9/

Good luck!
The Codility Team`,
      ATS,
    ),
    expected: {
      category: "assessment",
      applicationId: "en-app-northwind-backend",
      suggestedStatus: "screening",
      company: "Northwind Ledger",
      role: "Senior Backend Engineer",
      dates: [{ kind: "assessment_deadline", at: "2026-08-05T23:59:00+01:00" }],
    },
  },
  {
    id: "en-028",
    language: "en",
    origin: "template",
    hard: "Assessment reminder that landed in the spam folder.",
    message: msg(
      "HackerRank",
      "support@hackerrank.com",
      "Reminder: Your Canalworks test expires in 24 hours",
      "2026-08-25T23:59:00+02:00",
      `Hi Deniz,

This is a reminder that your Canalworks Staff Engineer Assessment invitation expires on 26 Aug 2026, 11:59 PM CEST.

Duration: 90 minutes
Questions: 2 coding, 1 system design (written)

Start your test: https://www.hackerrank.com/tests/cwks91a/login

If you have already taken the test, please ignore this email.

Thanks,
HackerRank on behalf of Canalworks
Unsubscribe from reminders`,
      { folder: "spam", ...NEWS },
    ),
    expected: {
      category: "assessment",
      applicationId: "en-app-canalworks-staff",
      suggestedStatus: "screening",
      company: "Canalworks",
      role: "Staff Engineer",
      dates: [{ kind: "assessment_deadline", at: "2026-08-26T23:59:00+02:00" }],
    },
  },
  {
    id: "en-029",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "TestGorilla",
      "no-reply@testgorilla.com",
      "Ostrava Digital invites you to an assessment",
      "2026-09-16T08:15:00+02:00",
      `Hi Deniz,

Ostrava Digital has invited you to complete the assessment "Senior Product Engineer – EU Remote" as part of their selection process.

The assessment takes about 45 minutes and includes tests on JavaScript, problem solving and English.

Please complete it within 5 days of receiving this invitation.

Start assessment

Good luck!
TestGorilla`,
      NEWS,
    ),
    expected: {
      category: "assessment",
      applicationId: null,
      suggestedStatus: "screening",
      company: "Ostrava Digital",
      role: "Senior Product Engineer",
    },
  },
  {
    id: "en-030",
    language: "en",
    origin: "template",
    hard: "Two Harbor applications; the assessment title names the Data Engineer role.",
    message: msg(
      "Coderbyte",
      "noreply@coderbyte.com",
      "Harbor Analytics: Data Engineer take-home assessment",
      "2026-08-19T10:40:00+02:00",
      `Hi Deniz,

Harbor Analytics has invited you to complete a take-home assessment for the Data Engineer position.

It contains an SQL challenge and a small Python pipeline task. Please submit before Wednesday, 26 August 2026 at 18:00 CEST.

Begin assessment: https://coderbyte.com/sl-candidate?promo=harboranalytics-de7k2

Best,
The Coderbyte Team`,
      ATS,
    ),
    expected: {
      category: "assessment",
      applicationId: "en-app-harbor-data",
      suggestedStatus: "screening",
      company: "Harbor Analytics",
      role: "Data Engineer",
      dates: [{ kind: "assessment_deadline", at: "2026-08-26T18:00:00+02:00" }],
    },
  },
  {
    id: "en-031",
    language: "en",
    origin: "synthetic",
    hard: "Take-home for an application already at 'screening': linked, suggestedStatus null.",
    message: msg(
      "Priya Natarajan",
      "priya.natarajan@lumenhealth.example",
      "Lumen Health take-home exercise",
      "2026-09-24T09:00:00-04:00",
      `Hi Deniz,

As discussed, the next step for the Frontend Engineer role is a short take-home exercise. You'll build a small appointment-booking widget; the brief and repo are linked below.

Repo: https://github.com/lumenhealth-example/fe-take-home
Please send us your submission by Thursday, 1 October at 5:00 PM ET. We expect it to take 3–4 hours; please don't spend more.

Any questions, just reply here.

Best,
Priya`,
    ),
    expected: {
      category: "assessment",
      applicationId: "en-app-lumen-frontend",
      suggestedStatus: null,
      company: "Lumen Health",
      role: "Frontend Engineer",
      dates: [{ kind: "assessment_deadline", at: "2026-10-01T17:00:00-04:00" }],
    },
  },

  // ───────────── offer ─────────────
  {
    id: "en-032",
    language: "en",
    origin: "synthetic",
    hard: "Offer with salary, start date and reply deadline to extract.",
    message: msg(
      "Jamal Ortiz",
      "jamal.ortiz@tidal-freight.example",
      "Your offer from Tidal Freight 🎉",
      "2026-09-29T12:05:00-04:00",
      `Hi Deniz,

On behalf of the whole team, I'm delighted to offer you the position of Full-Stack Engineer at Tidal Freight!

Highlights:
• Base salary: USD 128,000 per year (contractor via our EOR partner in Türkiye)
• Equity: 6,000 stock options, 4-year vesting
• Fully remote, 25 days PTO
• Start date: Monday, November 2, 2026

The formal offer letter is attached and will also arrive via DocuSign. Please let us know your decision by Tuesday, October 6 at 5:00 PM ET.

Congratulations again – we can't wait to work with you.

Jamal`,
      { threadId: "thr-en-tidal-01", inReplyTo: "<CAH8p2Tidal0001@mail.gmail.com>" },
    ),
    expected: {
      category: "offer",
      applicationId: "en-app-tidal-fullstack",
      suggestedStatus: "offer",
      company: "Tidal Freight",
      role: "Full-Stack Engineer",
      dates: [
        { kind: "start_date", at: "2026-11-02T09:00:00-05:00" },
        { kind: "reply_deadline", at: "2026-10-06T17:00:00-04:00" },
      ],
    },
  },
  {
    id: "en-033",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Rosa Lindqvist",
      "rosa@meridian-atlas.example",
      "Offer of employment – Full-Stack Developer",
      "2026-10-08T15:45:00+01:00",
      `Dear Deniz,

Following your interviews, I am pleased to offer you the role of Full-Stack Developer at Meridian Atlas Ltd.

Salary: £72,000 per annum, paid monthly
Location: Remote (UK hours overlap), quarterly visits to London
Start date: 4 January 2027

Please find the full contract attached. Kindly confirm your acceptance by 16 October 2026.

Best wishes,
Rosa Lindqvist
People Partner`,
    ),
    expected: {
      category: "offer",
      applicationId: "en-app-meridian-fullstack",
      suggestedStatus: "offer",
      company: "Meridian Atlas",
      role: "Full-Stack Developer",
      dates: [
        { kind: "start_date", at: "2027-01-04T09:00:00+00:00" },
        { kind: "reply_deadline", at: "2026-10-16T17:00:00+01:00" },
      ],
    },
  },
  {
    id: "en-034",
    language: "en",
    origin: "template",
    hard: "Offer for an application not in the tracker (applied through an agency).",
    message: msg(
      "Halden Bio via DocuSign",
      "dse@docusign.net",
      "Please DocuSign: Halden Bio – Offer Letter – Deniz Arslan",
      "2026-10-14T10:30:00+02:00",
      `Halden Bio sent you a document to review and sign.

Hello Deniz,

Further to our conversation, please find attached your formal offer letter for the position of Senior Software Engineer, Lab Automation at Halden Bio B.V. (Leiden).

Gross annual salary: EUR 88,000 plus 8% holiday allowance. Proposed start date: 1 December 2026.

Please review and sign by 21 October 2026.

Kind regards,
Mila Jansen, HR Manager

REVIEW DOCUMENT

Do Not Share This Email: this email contains a secure link to DocuSign.`,
      { bulk: true },
    ),
    expected: {
      category: "offer",
      applicationId: null,
      suggestedStatus: "offer",
      company: "Halden Bio",
      role: "Senior Software Engineer, Lab Automation",
      dates: [{ kind: "start_date", at: "2026-12-01T09:00:00+01:00" }],
    },
  },
  {
    id: "en-035",
    language: "en",
    origin: "synthetic",
    hard: "Offer arriving for an application the user already withdrew (closed): linked, suggestedStatus null.",
    message: msg(
      "Leo Brandt",
      "leo.brandt@fernway.example",
      "Offer – Platform Engineer",
      "2026-09-01T13:00:00+02:00",
      `Hi Deniz,

I know you mentioned you were close to accepting another offer, but the team was so keen that we wanted to put something concrete in front of you anyway.

We'd like to offer you the Platform Engineer position at €85,000 gross per year plus a €5,000 signing bonus, fully remote within the EU, starting 1 October 2026.

If this changes your mind, let me know by Friday.

Best,
Leo Brandt
Head of Engineering, Fernway`,
    ),
    expected: {
      category: "offer",
      applicationId: "en-app-fernway-platform",
      suggestedStatus: null,
      company: "Fernway",
      role: "Platform Engineer",
      dates: [{ kind: "start_date", at: "2026-10-01T09:00:00+02:00" }],
    },
  },

  // ───────────── recruiter_outreach ─────────────
  {
    id: "en-036",
    language: "en",
    origin: "template",
    hard: "Recruiter outreach that talks about 'an interview' though nothing is scheduled and no application exists.",
    message: msg(
      "Chloe Hartley via LinkedIn",
      "inmail-hit-reply@linkedin.com",
      "Chloe Hartley sent you a message: Staff Engineer – fintech scale-up (remote UK/EU)",
      "2026-09-10T11:22:00+01:00",
      `Hi Deniz,

I came across your profile and your Go/Kubernetes experience stood out. I'm partnering with Sterling Vault, a Series C fintech, on a Staff Engineer hire (fully remote, £110–125k).

The hiring manager has already seen a few profiles and would be happy to fast-track you straight to a first interview if you're open to it.

Would you have 15 minutes this week for a quick chat?

Best,
Chloe Hartley
Principal Consultant, Brookfield Talent

Reply · View profile
You are receiving InMail notification emails. Unsubscribe`,
      NEWS,
    ),
    expected: {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Sterling Vault",
      role: "Staff Engineer",
    },
  },
  {
    id: "en-037",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Tom Okafor",
      "tom.okafor@ridgeway-recruitment.example",
      "Senior Backend role – Amsterdam (relocation supported)",
      "2026-08-06T09:48:00+01:00",
      `Hello Deniz,

Hope you're well. I'm Tom from Ridgeway Recruitment; we specialise in engineering hires across the Benelux.

One of my clients, a logistics platform in Amsterdam, is looking for a Senior Backend Engineer (Kotlin/Java). They offer €80–95k, full relocation support and the 30% ruling.

I think your background could be a great match. Would you be open to a call? Feel free to send a time that suits, or your updated CV.

Kind regards,
Tom Okafor
Ridgeway Recruitment | +44 7700 900555`,
    ),
    expected: {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Senior Backend Engineer",
    },
  },
  {
    id: "en-038",
    language: "en",
    origin: "synthetic",
    hard: "In-house recruiter reaching out about a role the user is still preparing: links to the tracker entry, no status change.",
    message: msg(
      "Ava Clarke",
      "ava.clarke@kestrelpay.example",
      "Saw you were looking at our TypeScript Engineer role",
      "2026-08-21T14:10:00+01:00",
      `Hi Deniz,

I'm a recruiter at Kestrel Pay. I noticed you've been following our company page and wanted to reach out directly about our TypeScript Engineer opening on the Merchant Dashboard team.

It's remote-friendly (UK/EU/TR time zones), and the team works with Node, React and Postgres. If it sounds interesting, I'd be glad to tell you more before you apply.

Best,
Ava Clarke
Talent Acquisition, Kestrel Pay`,
    ),
    expected: {
      category: "recruiter_outreach",
      applicationId: "en-app-kestrel-ts",
      suggestedStatus: null,
      company: "Kestrel Pay",
      role: "TypeScript Engineer",
    },
  },
  {
    id: "en-039",
    language: "en",
    origin: "synthetic",
    hard: "Agency mail uses 'exclusive offer' wording but is cold outreach, not an offer.",
    message: msg(
      "Nina Shah",
      "nina@talentforge.example",
      "Exclusive offer: Lead Product Manager, US remote ($170k)",
      "2026-09-25T10:55:00-04:00",
      `Hi Deniz,

I have an exclusive opportunity I think you'll like: a Lead Product Manager role at a well-funded climate-tech start-up, 100% remote for candidates in EMEA, $150–170k plus equity.

This search isn't advertised anywhere yet. If you're curious, reply with a good time to talk and I'll share the company name and the job description.

Best,
Nina Shah
TalentForge Search · New York`,
    ),
    expected: {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Lead Product Manager",
    },
  },
  {
    id: "en-040",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Ben Harper via LinkedIn",
      "inmail-hit-reply@linkedin.com",
      "Ben Harper sent you a message: Engineering Manager opportunity at Vellum Cloud",
      "2026-10-02T16:40:00+01:00",
      `Hi Deniz,

I lead technical hiring at Vellum Cloud in London. We're growing our data platform group and I think you'd be a strong fit for an Engineering Manager, Data Platform role.

Would you be open to a 20-minute conversation next week?

Thanks,
Ben

Reply · View profile
This email was intended for Deniz Arslan. Unsubscribe`,
      NEWS,
    ),
    expected: {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Vellum Cloud",
      role: "Engineering Manager, Data Platform",
    },
  },
  {
    id: "en-041",
    language: "en",
    origin: "synthetic",
    hard: "Outreach from a company whose role is only 'saved' in the tracker: link it, but outreach never moves status.",
    message: msg(
      "Gus Moreno",
      "gus@saltmarsh-labs.example",
      "Go Engineer at Saltmarsh Labs",
      "2026-07-30T18:20:00+01:00",
      `Hey Deniz,

I'm the CTO at Saltmarsh Labs. A mutual connection, Efe, mentioned you might be looking. We're hiring a Go Engineer to work on our geospatial ingestion pipeline – small team, interesting problems, remote across Europe.

No formal process needed to start – happy to just have a coffee chat over video. Let me know!

Gus`,
    ),
    expected: {
      category: "recruiter_outreach",
      applicationId: "en-app-saltmarsh-go",
      suggestedStatus: null,
      company: "Saltmarsh Labs",
      role: "Go Engineer",
    },
  },

  // ───────────── info_request ─────────────
  {
    id: "en-042",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Marcus Bell",
      "marcus.bell@northwind-ledger.example",
      "Quick questions before we continue",
      "2026-08-07T10:30:00+01:00",
      `Hi Deniz,

Thanks for completing the Codility test – nice work. Before I put you forward to the hiring manager for the Senior Backend Engineer role, could you let me know:

1. Your salary expectations (gross, GBP or EUR)
2. Your notice period / earliest availability
3. Whether you'd need visa sponsorship for the UK or would work remotely from Türkiye

Thanks,
Marcus Bell
Talent Partner, Northwind Ledger`,
    ),
    expected: {
      category: "info_request",
      applicationId: "en-app-northwind-backend",
      suggestedStatus: null,
      company: "Northwind Ledger",
      role: "Senior Backend Engineer",
    },
  },
  {
    id: "en-043",
    language: "en",
    origin: "synthetic",
    hard: "References request after interviews reads like a near-offer but is only an information request.",
    message: msg(
      "Jamal Ortiz",
      "jamal.ortiz@tidal-freight.example",
      "Re: Full-Stack Engineer application – references",
      "2026-09-23T13:12:00-04:00",
      `Hi Deniz,

Thanks for a great final round! We're in the last step of the process and would like to speak with two professional references, ideally one former manager.

Could you send their names, email addresses and how you worked together by Friday? We'll only contact them after letting you know.

Thanks,
Jamal`,
      { threadId: "thr-en-tidal-01", inReplyTo: "<CAH8p2Tidal0001@mail.gmail.com>" },
    ),
    expected: {
      category: "info_request",
      applicationId: "en-app-tidal-fullstack",
      suggestedStatus: null,
      company: "Tidal Freight",
      role: "Full-Stack Engineer",
    },
  },
  {
    id: "en-044",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Ellie Watson",
      "ellie.watson@harbor-analytics.example",
      "Documents needed – Product Manager",
      "2026-08-17T09:25:00+02:00",
      `Hi Deniz,

Thanks for the lovely chat on Friday. To move your Product Manager application forward, could you please send:

- An updated CV in English (PDF)
- A copy of your passport (for the right-to-work check in the Netherlands)
- Your availability over the next two weeks

You can upload them via the secure link I'll send separately.

Best,
Ellie`,
    ),
    expected: {
      category: "info_request",
      applicationId: "en-app-harbor-pm",
      suggestedStatus: null,
      company: "Harbor Analytics",
      role: "Product Manager",
    },
  },
  {
    id: "en-045",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Fjordline Games",
      "noreply@workablemail.com",
      "Fjordline Games has a question for you",
      "2026-08-31T12:00:00+02:00",
      `Hi Deniz,

The hiring team for Backend Engineer (Live Services) at Fjordline Games would like some more information:

"What is your notice period, and would you be open to relocating to Oslo after a 6-month remote period?"

Answer here: Reply to question

Sent via Workable`,
      ATS,
    ),
    expected: {
      category: "info_request",
      applicationId: null,
      suggestedStatus: null,
      company: "Fjordline Games",
      role: "Backend Engineer (Live Services)",
    },
  },
  {
    id: "en-046",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Rosa Lindqvist",
      "rosa@meridian-atlas.example",
      "Portfolio and code samples",
      "2026-08-17T11:02:00+01:00",
      `Hi Deniz,

Before we schedule interviews for the Full-Stack Developer position, Callum asked whether you could share a portfolio link or a couple of public repositories you're proud of, plus your expected day rate if you'd prefer to work as a contractor.

Many thanks,
Rosa`,
    ),
    expected: {
      category: "info_request",
      applicationId: "en-app-meridian-fullstack",
      suggestedStatus: null,
      company: "Meridian Atlas",
      role: "Full-Stack Developer",
    },
  },

  // ───────────── job_alert ─────────────
  {
    id: "en-047",
    language: "en",
    origin: "template",
    hard: "Job alert worded like an invitation ('You're invited to apply').",
    message: msg(
      "LinkedIn Job Alerts",
      "jobalerts-noreply@linkedin.com",
      "Deniz, you're invited to apply: Senior Software Engineer at Larkspur Health",
      "2026-09-05T07:30:00+01:00",
      `You're invited to apply

Larkspur Health is looking for candidates like you.
Senior Software Engineer
Larkspur Health · London, England, United Kingdom (Hybrid)
Promoted · Easy Apply
Your profile matches this job

Apply now

See more jobs like this

You are receiving Job Alert emails. Unsubscribe
© 2026 LinkedIn Corporation, 1000 West Maude Avenue, Sunnyvale, CA 94085.`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: "Larkspur Health",
      role: "Senior Software Engineer",
    },
  },
  {
    id: "en-048",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Indeed",
      "alert@indeed.com",
      "18 new backend engineer jobs in Remote",
      "2026-08-13T06:02:00-04:00",
      `Backend Engineer jobs in Remote

Backend Engineer (Go) – Quarry Systems – Remote – $140,000 - $165,000 a year – Easily apply
Senior Backend Engineer – Northwind Ledger – Remote – Responsive employer
Platform Engineer – Fernway – Remote
Backend Developer – Tilecraft – Remote – New

See all jobs

You're receiving this email because you created a job alert on Indeed. Unsubscribe · Manage alerts`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-049",
    language: "en",
    origin: "template",
    hard: "Alert lists companies already in the tracker; it must not be linked to them.",
    message: msg(
      "Glassdoor Jobs",
      "noreply@glassdoor.com",
      "Product Manager jobs in Amsterdam: Harbor Analytics, Orbit Mobility and more",
      "2026-08-22T08:10:00+02:00",
      `New jobs for you

Product Manager – Harbor Analytics – Amsterdam – 4.2 ★
Senior Product Manager – Orbit Mobility – Amsterdam – 3.9 ★
Product Owner – Dunewalk – Utrecht – 4.0 ★

View all 24 jobs

You received this email because you subscribed to Glassdoor job alerts. Unsubscribe`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-050",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "LinkedIn",
      "jobs-listings@linkedin.com",
      "Jobs similar to Staff Software Engineer at Canalworks",
      "2026-08-28T19:15:00+02:00",
      `Jobs similar to Staff Software Engineer at Canalworks

Staff Engineer – Polder Cloud – Amsterdam (Hybrid)
Principal Backend Engineer – Lumen Health – Remote
Staff Software Engineer, Infra – Bramble – Netherlands (Remote)

See all jobs

Unsubscribe · Help
© 2026 LinkedIn Ireland Unlimited Company, Wilton Plaza, Dublin 2.`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-051",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "Indeed",
      "alert@indeed.com",
      "Frontend Engineer at Lattice Grove and 9 more jobs for you",
      "2026-09-19T06:05:00-04:00",
      `Frontend Engineer – Lattice Grove – Remote (US) – $120,000 - $150,000 a year
Hiring multiple candidates · Urgently hiring

React Developer – Pinecrest Media – Remote
UI Engineer – Driftwood – Remote

See more jobs

Unsubscribe · Edit this alert`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: "Lattice Grove",
      role: "Frontend Engineer",
    },
  },
  {
    id: "en-052",
    language: "en",
    origin: "template",
    hard: "Alert subject sounds like an interview ('Interview-ready jobs') though it is a list of postings.",
    message: msg(
      "Glassdoor",
      "noreply@glassdoor.com",
      "Deniz, these companies are hiring now – interview-ready jobs",
      "2026-10-05T08:00:00+01:00",
      `Jobs with fast interview processes, picked for you

Software Engineer II – Brightloop – London – Interviews within 1 week
Backend Engineer – Saltmarsh Labs – Remote
Site Reliability Engineer – Coldharbour – Leeds

See jobs

Unsubscribe from these emails`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-053",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "LinkedIn Job Alerts",
      "jobalerts-noreply@linkedin.com",
      '"product manager": Dunewalk - Product Manager and more',
      "2026-10-12T07:45:00+02:00",
      `Your job alert for product manager in Netherlands
23 new jobs match your preferences.

Product Manager – Dunewalk – Utrecht (Hybrid) – 3 connections work here
Senior Product Manager, Growth – Polder Cloud – Amsterdam
Product Manager, Payments – Kestrel Pay – Remote

See all jobs

Job alert settings · Unsubscribe`,
      NEWS,
    ),
    expected: {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: "Dunewalk",
      role: "Product Manager",
    },
  },

  // ───────────── other_job ─────────────
  {
    id: "en-054",
    language: "en",
    origin: "template",
    hard: "Marketing newsletter from an ATS sender domain (Greenhouse) about its candidate app; job-search related but no application event.",
    message: msg(
      "MyGreenhouse",
      "mygreenhouse@us.greenhouse-mail.io",
      "Track every application in one place with MyGreenhouse",
      "2026-09-12T12:00:00-04:00",
      `Your job search, organized.

With MyGreenhouse you can see the status of all your applications to companies hiring with Greenhouse, update your profile once, and get tips for your next interview.

New this month: interview prep checklists and salary insights.

Get started

You're receiving this email because you applied to a job through Greenhouse. Unsubscribe
Greenhouse Software, Inc., New York, NY`,
      NEWS,
    ),
    expected: {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-055",
    language: "en",
    origin: "template",
    hard: "Candidate portal password reset from an ATS domain mentioning the employer: other_job, not an application event.",
    message: msg(
      "Graystone Insurance",
      "graystone@myworkday.com",
      "Password reset request",
      "2026-09-01T20:14:00+01:00",
      `Dear Deniz Arslan,

We received a request to reset the password for your Graystone Insurance Careers account.

Your verification code is: 482913

If you did not request this, you can ignore this email.

Graystone Insurance Talent Acquisition
This is a system generated email. Please do not reply.`,
      ATS,
    ),
    expected: {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: "Graystone Insurance",
      role: null,
    },
  },
  {
    id: "en-056",
    language: "en",
    origin: "template",
    hard: null,
    message: msg(
      "LinkedIn",
      "messages-noreply@linkedin.com",
      "Deniz, complete your profile to stand out to recruiters",
      "2026-08-08T09:00:00+01:00",
      `Profiles with Open to Work preferences and 5+ skills get up to 2x more recruiter messages.

✓ Add your job preferences
✓ Add your top skills
✓ Upload a resume for Easy Apply

Complete profile

Unsubscribe · Help`,
      NEWS,
    ),
    expected: {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-057",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "EuroTech Careers Fair",
      "hello@eurotechcareers.example",
      "Virtual Tech Careers Fair – 40+ EU employers, 15 October",
      "2026-09-28T10:00:00+02:00",
      `Hi Deniz,

Our autumn virtual careers fair is back! Meet hiring managers from 40+ tech companies across the EU and UK, join CV clinics and attend talks on relocating to the Netherlands and Germany.

When: 15 October 2026, 10:00–17:00 CEST
Free registration for candidates.

Register now

You're receiving this because you attended a previous EuroTech Careers event. Unsubscribe`,
      NEWS,
    ),
    expected: {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-058",
    language: "en",
    origin: "template",
    hard: "Confirmation of the user's own withdrawal: linked to the closed application, not a rejection.",
    message: msg(
      "Fernway",
      "no-reply@ashbyhq.com",
      "Your application to Fernway has been withdrawn",
      "2026-08-29T17:35:00+02:00",
      `Hi Deniz,

This is a confirmation that you have withdrawn your application for Platform Engineer at Fernway.

If this was a mistake, or you change your mind, please reach out to the recruiting team.

Best,
Fernway Recruiting

Powered by Ashby`,
      ATS,
    ),
    expected: {
      category: "other_job",
      applicationId: "en-app-fernway-platform",
      suggestedStatus: null,
      company: "Fernway",
      role: "Platform Engineer",
    },
  },

  // ───────────── not_job ─────────────
  {
    id: "en-059",
    language: "en",
    origin: "synthetic",
    hard: "Credit card 'application received' wording.",
    message: msg(
      "Corvid Bank",
      "noreply@corvidbank.example",
      "We've received your application",
      "2026-07-23T13:00:00+01:00",
      `Dear Deniz,

Thank you for applying for the Corvid Travel Rewards Credit Card. We have received your application and will review it within 3 working days.

We may contact you if we need further documents. You can track your application in the Corvid app.

Corvid Bank plc. Authorised by the Prudential Regulation Authority.`,
      NEWS,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-060",
    language: "en",
    origin: "synthetic",
    hard: "Visa application decision, with 'application' and 'decision' vocabulary.",
    message: msg(
      "Schengen Visa Centre",
      "noreply@visacentre-istanbul.example",
      "Update on your visa application IST-2026-448812",
      "2026-08-05T11:20:00+03:00",
      `Dear applicant,

The decision on your visa application (reference IST-2026-448812) has been made and your passport is ready for collection at our Istanbul centre.

Collection hours: Monday–Friday, 09:00–16:00.

Please bring your receipt and ID.

This is an automated message.`,
      { bulk: true },
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-061",
    language: "en",
    origin: "synthetic",
    hard: "Apartment rental 'application' with references request, mimics info_request.",
    message: msg(
      "Canal House Lettings",
      "lettings@canalhouse-lettings.example",
      "Your rental application – 2-bed, Oud-West",
      "2026-09-17T15:05:00+02:00",
      `Dear Deniz,

Thank you for your application for the apartment at Jan Pieter Heijestraat. The landlord would like to proceed to the next step.

Please send us an employer's statement, your last three payslips and a reference from your previous landlord by Monday.

Kind regards,
Canal House Lettings`,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-062",
    language: "en",
    origin: "synthetic",
    hard: "University 'application received' for a part-time MSc.",
    message: msg(
      "Admissions, Thamesgate University",
      "admissions@thamesgate.example",
      "Application received: MSc Software Engineering (part-time, online)",
      "2026-10-01T09:30:00+01:00",
      `Dear Deniz,

Thank you for submitting your application for MSc Software Engineering (part-time, online) starting January 2027. Your applicant ID is TGU-77120.

We aim to make a decision within four weeks. You may be invited to an interview with the programme director.

Admissions Office, Thamesgate University`,
      { bulk: true },
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-063",
    language: "en",
    origin: "synthetic",
    hard: "'Special offer' marketing discount, not a job offer.",
    message: msg(
      "Nimbus Notes",
      "news@nimbusnotes.example",
      "Special offer for you, Deniz: 40% off Pro",
      "2026-08-15T18:00:00+01:00",
      `Your exclusive offer is here 🎁

Upgrade to Nimbus Notes Pro and get 40% off your first year. Offer ends Sunday.

Claim offer

Unsubscribe · Privacy`,
      NEWS,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-064",
    language: "en",
    origin: "synthetic",
    hard: "Podcast newsletter with 'interview' and hiring vocabulary.",
    message: msg(
      "The Shipping Code Podcast",
      "hello@shippingcode.example",
      "New episode: our interview with the CTO of Quarry Systems on hiring engineers",
      "2026-09-21T07:00:00-04:00",
      `This week's episode

We sat down for an in-depth interview with Lena Park, CTO at Quarry Systems, about how they hire senior engineers, why they killed whiteboard interviews, and what makes a great take-home.

Listen now (54 min)

You're receiving this because you subscribed to The Shipping Code. Unsubscribe`,
      NEWS,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-065",
    language: "en",
    origin: "synthetic",
    hard: "Bank 'your application was rejected' (loan), mimics a rejection.",
    message: msg(
      "Corvid Bank",
      "noreply@corvidbank.example",
      "Your loan application",
      "2026-08-12T10:10:00+01:00",
      `Dear Deniz,

Thank you for your recent personal loan application. Unfortunately, we are unable to approve your application at this time.

This decision was based on information from credit reference agencies. You have the right to request details of the agency used.

Corvid Bank plc`,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-066",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "GitHub",
      "notifications@github.com",
      "[deniz-a/tracker-cli] Pull request #42 merged",
      "2026-09-26T21:33:00+03:00",
      `Merged #42 into main.

feat: export applications as CSV

— You are receiving this because you authored the thread.
Reply to this email directly, view it on GitHub, or unsubscribe.`,
      NEWS,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-067",
    language: "en",
    origin: "synthetic",
    hard: null,
    message: msg(
      "Parcelwise",
      "orders@parcelwise.example",
      "Your order #PW-55120 has shipped",
      "2026-10-19T14:12:00+03:00",
      `Good news, Deniz! Your order is on its way.

1 × Ergonomic keyboard (split)
Estimated delivery: 22 October

Track parcel

Parcelwise Customer Care`,
      { bulk: true },
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
  {
    id: "en-068",
    language: "en",
    origin: "synthetic",
    hard: "Conference talk proposal 'accepted' with a scheduled 'session' and video link; career-adjacent but not job search.",
    message: msg(
      "DevHarbour Conf Programme Committee",
      "cfp@devharbour.example",
      "Your proposal has been accepted – DevHarbour 2026",
      "2026-10-23T10:00:00+01:00",
      `Hi Deniz,

Congratulations! Your talk "Event sourcing without tears" has been accepted for DevHarbour 2026 in London.

Please join a 15-minute speaker onboarding call on 29 October at 16:00 GMT: https://meet.google.com/dvh-spkr-onb

Speaker travel support details will follow.

The Programme Committee`,
    ),
    expected: {
      category: "not_job",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: null,
    },
  },
];
