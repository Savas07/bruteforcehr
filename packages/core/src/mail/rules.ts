import type { ApplicationStatus, MailCategory } from "../enums";
import type { MailAddress, MailFolder } from "./schemas";
import {
  ASSESSMENT_SENDER_DOMAINS,
  ATS_SENDER_DOMAINS,
  JOB_BOARD_SENDER_DOMAINS,
  domainMatches,
  senderDomain,
} from "./senders";
import { foldText } from "../jobs/normalize";
import { companiesMatch, companyKey } from "./text";

/**
 * Mail pre-filter and rule classifier (BRIEF §4.7 steps 2–3, docs/adr/0012-mail-sync.md).
 * Pure functions over a parsed message and the user's tracker, shared by the sync pipeline and
 * the eval. Patterns are matched on folded text (`foldText`), so they're written in folded form.
 */

/** A parsed incoming message, the input of every mail-intelligence step. */
export interface MailInput {
  accountId: string;
  from: MailAddress;
  subject: string;
  /** Plain text (HTML converted), quoted history included. */
  bodyText: string;
  folder: MailFolder;
  providerThreadId: string | null;
  inReplyTo: string | null;
  /** Message-IDs from `References`, oldest first. */
  references: readonly string[];
  /** `List-Unsubscribe` header present. */
  listUnsubscribe: boolean;
  /** `Precedence: bulk|list|junk` or `Auto-Submitted` other than `no`. */
  bulk: boolean;
}

/** What the linker needs to know about an application. */
export interface TrackedApplication {
  id: string;
  company: string;
  companyDomain: string | null;
  role: string;
  status: ApplicationStatus;
  threadRefs: readonly { accountId: string; threadId: string; rfc822MessageId: string | null }[];
}

export interface MailSignals {
  senderDomain: string;
  ats: boolean;
  jobBoard: boolean;
  assessmentPlatform: boolean;
  /** Application whose sent message this one replies to, or whose provider thread it is in. */
  threadApplicationId: string | null;
  /** Applications whose company domain is the sender's domain (or a parent of it). */
  domainApplicationIds: string[];
  /** Applications whose company name appears in the sender name, subject or opening text. */
  namedApplicationIds: string[];
  /** Pattern hits per category (weights summed). */
  hits: Readonly<Record<RuleCategory, number>>;
  /** Strongest phrase per category, for the reason line. */
  phrases: Readonly<Partial<Record<RuleCategory, string>>>;
  /** Job-search vocabulary present (application, interview, Bewerbung, başvuru…). */
  jobVocabulary: boolean;
  /** No list or bulk headers (a person wrote it). */
  personal: boolean;
  /** Candidate-facing career content (fairs, "complete your profile"). */
  careerContent: boolean;
}

type RuleCategory = Exclude<MailCategory, "not_job" | "other_job">;

interface Pattern {
  re: RegExp;
  /** 2 = decisive phrase, 1 = supporting word. */
  weight: 1 | 2;
}

const p = (re: RegExp, weight: 1 | 2 = 2): Pattern => ({ re, weight });

/** Folded-text patterns (EN / TR / DE) per category. */
const PATTERNS: Readonly<Record<RuleCategory, readonly Pattern[]>> = {
  rejection: [
    p(/regret to inform/),
    p(/(?:not|won'?t|will not) (?:be )?(?:moving|move|progress(?:ing)?|proceed(?:ing)?) (?:forward )?with your (?:application|candidacy)/),
    p(/(?:decided|chosen|decision) (?:not )?to (?:move forward|proceed|continue|go ahead) with (?:other|another|a different) (?:candidate|applicant)/),
    p(/(?:pursue|pursuing|proceed with|progress with|move forward with) (?:other|another) (?:candidates?|applicants?|profiles?)/),
    p(/(?:decided|decision) not to (?:move forward|proceed|progress|continue)/),
    p(/not (?:to )?(?:move|moving) forward with your/),
    p(/(?:position|role|vacancy) (?:has been|was|is now) (?:filled|closed|put on hold|cancelled)/),
    p(/(?:application|candidacy) (?:was|has been|is) (?:not successful|unsuccessful)/),
    p(/(?:have|has|were) not been (?:successful|selected|shortlisted)/),
    p(/no longer (?:being )?considering your/),
    p(/we will not be (?:proceeding|progressing|moving)/),
    p(/(?:keep|retain) your (?:cv|resume|details|profile|information) (?:on file|in our)/, 1),
    p(/unfortunately/, 1),
    p(/maalesef/, 1),
    p(/olumsuz (?:sonuc|donus|degerlendir)/),
    p(/(?:baska|diger) (?:bir )?(?:aday|adaylar)(?:la|imiz| ile)/),
    p(/(?:surece|surecinize|degerlendirme surecine) devam (?:edemeyecegimizi|edilmeyecek|etmeme)/),
    p(/\b(?:uygun|uyumlu) (?:bulunmadi\w*|bulunmamistir|gorulmedi\w*)\b/),
    p(/ilerleyemeyecegimizi|ilerlemeyecegimizi|ilerletemeyecegimizi|degerlendiremeyecegimizi|degerlendirmeye alamayacagimizi/),
    p(/pozisyon(?:umuz)? (?:doldu|dolduruldu|kapatildi|kapanmistir|askiya)/),
    p(/leider/, 1),
    p(/absage/),
    p(/nicht (?:weiter )?(?:berucksichtigen|beruecksichtigen|in betracht)/),
    p(/(?:fur|zugunsten) (?:eine[nr]? )?(?:andere[nr]?|weitere[nr]?) (?:kandidat|bewerber)/),
    p(/gegen (?:ihre|deine) (?:bewerbung|kandidatur) entschieden/),
    p(/(?:keine|nicht die) (?:positive|erfreuliche) (?:nachricht|ruckmeldung)/),
    p(/(?:stelle|position) (?:ist |wurde )?(?:bereits |inzwischen )?(?:anderweitig )?besetzt/),
    p(/nicht in die (?:engere|nachste) (?:auswahl|runde)/),
    p(/nicht weiter(?:verfolgen| verfolgen| fortsetzen)/),
  ],
  application_received: [
    p(/(?:we(?:'ve| have)?|has been|was|been) (?:successfully )?received?(?:d)? (?:your|the) application/),
    p(/(?:your )?application (?:has been|was|is) (?:successfully )?(?:received|submitted)/),
    p(/(?:thank you|thanks) (?:so much )?for (?:applying|your application|submitting your application)/),
    p(/(?:confirm|confirming|acknowledge) (?:the )?receipt of your application/),
    p(/we (?:will|'ll) (?:carefully )?review your (?:application|profile|cv|resume)/),
    p(/(?:thank you|thanks) for your interest in/, 1),
    p(/basvurunuz (?:bize )?(?:alinmistir|alindi|ulasti|ulasmistir|basariyla)/),
    p(/basvurunuzu (?:aldik|almis bulunmaktayiz)/),
    p(/basvurunuz(?: icin)? (?:tesekkur|tesekkurler)/),
    p(/basvurunuz (?:incelen|degerlendir)(?:ecektir|ilecektir|me surecine)/),
    p(/eingangsbestatigung/),
    p(/(?:vielen )?dank fur (?:ihre|deine) bewerbung/),
    p(/bewerbung (?:ist )?(?:bei uns )?(?:gut |erfolgreich )?(?:eingegangen|erhalten)/),
    p(/(?:wir )?(?:prufen|sichten) (?:ihre|deine) (?:unterlagen|bewerbung)/),
  ],
  interview_invite: [
    p(/invit(?:e|ing|ation) (?:you )?(?:to|for) (?:an? |the )?(?:first |second |final |technical |video |phone |onsite |on-site )?(?:interview|call|conversation|chat|meeting)/),
    p(/(?:schedule|book|arrange|set up) (?:an? |the |your )?(?:first |second |final |technical |video |phone )?(?:interview|call|phone screen|screening call|chat)/),
    p(/interview (?:invitation|invite|request|confirmation|details|scheduled)/),
    p(/(?:phone|video|recruiter|intro(?:ductory)?) (?:screen|call|interview)/),
    p(/(?:calendly\.com|cal\.com|goodtime\.io|meet\.google\.com|zoom\.us\/j|teams\.microsoft\.com\/l\/meetup)/, 1),
    p(/(?:your )?availability (?:for|to)/, 1),
    p(/reschedul/, 1),
    p(/mulakat(?:a|imiz|iniz)? (?:davet|daveti|tarihi|planla|icin)/),
    p(/(?:gorusme|gorusmeye|mulakata|mulakat) (?:davet|daveti|davet etmek|planla)/),
    p(/(?:teknik|online|yuz yuze|video|telefon) (?:gorusme|mulakat)/),
    p(/(?:sizinle|seninle) (?:bir )?(?:gorusme|tanisma)/),
    p(/vorstellungsgesprach/),
    p(/(?:einladung|einladen|laden (?:sie|dich) .{0,40}ein).{0,60}(?:gesprach|interview|kennenlernen)/),
    p(/(?:kennenlern|telefon|video|zweit|erst)(?:gesprach|interview)/),
    p(/terminvorschlag|terminvorschlage|terminfindung|terminvereinbarung|telefonisch\w* kennenlernen/),
  ],
  assessment: [
    p(/(?:online |technical |coding |skills? |cognitive |psychometric )(?:assessment|test|challenge|exercise)/),
    p(/(?:take-home|take home|home) (?:assignment|task|exercise|challenge|test)/),
    p(/(?:complete|start|finish) (?:the |your )?(?:assessment|test|challenge|case study)/),
    p(/case study/, 1),
    p(/(?:hackerrank|codility|testgorilla|coderbyte|codesignal|hirevue|devskiller)/, 1),
    p(/(?:degerlendirme|yetenek|online|teknik|kisilik) (?:testi|sinavi|envanteri)/),
    p(/(?:vaka calismasi|teknik odev|ev odevi|case calismasi)/),
    p(/(?:online-?test|eignungstest|einstufungstest|fallstudie|programmieraufgabe|coding-?(?:aufgabe|challenge)|probeaufgabe)/),
  ],
  offer: [
    p(/(?:pleased|delighted|happy|excited) to (?:extend|make|offer) (?:you )?(?:an? |the |our )?(?:formal |written )?(?:job |employment )?offer/),
    p(/(?:job|employment|formal|written) offer/),
    p(/offer letter/),
    p(/offer of employment/),
    p(/(?:is teklifi|teklif mektubu|size (?:bir )?teklif|teklifimizi)/),
    p(/(?:vertragsangebot|arbeitsvertrag|ein angebot (?:unterbreiten|machen)|(?:ihnen|dir) die stelle anbieten|zusage fur die)/),
  ],
  job_alert: [
    p(/(?:new )?jobs? (?:for you|alert|recommendations?|matching|that match)/),
    p(/(?:recommended|suggested|new|matching|similar) (?:jobs|roles|positions|opportunities)/),
    p(/(?:\d+\+? )?new jobs? (?:in|for|near)/),
    p(/is hiring|are hiring|actively recruiting/, 1),
    p(/(?:yeni )?(?:is )?ilanlari|size (?:uygun|ozel) (?:ilan|is)|is alarmi|ilan alarmi/),
    p(/(?:neue|passende|empfohlene) (?:jobs|stellen|stellenangebote)|jobempfehlung|job-?agent|suchauftrag/),
  ],
  recruiter_outreach: [
    p(/came across your (?:profile|background|cv|resume)/),
    p(/(?:would|are) you (?:be )?(?:open|interested) (?:to|in) (?:a |an |new |exploring)/),
    p(/(?:reaching|reach) out (?:to you )?(?:about|regarding|because)/, 1),
    p(/your (?:background|experience|profile) (?:caught|stood|seems|looks|is a)/),
    p(/(?:profilinizi|ozgecmisinizi) (?:inceledim|gordum|gorduk|inceledik)/),
    p(/(?:ilginizi cekebilir|yeni bir (?:firsat|kariyer firsati))/),
    p(/(?:ihr|dein) (?:profil|werdegang) (?:ist mir|hat mich|passt)/),
    p(/(?:offen|interesse) fur (?:eine )?(?:neue|spannende)/),
  ],
  info_request: [
    p(/(?:could|can|would) you (?:please )?(?:send|share|provide|confirm|let us know)/, 1),
    p(/(?:salary|compensation) expectations?/),
    p(/notice period/),
    p(/(?:references?|referees) (?:contact|details)|contact details (?:of|for) (?:your )?references/),
    p(/(?:missing|additional|following) (?:documents|information|details)/),
    p(/maas beklenti|ucret beklenti|ihbar sure|referans (?:bilgi|iletisim)|eksik (?:belge|evrak)|(?:belge|evrak)lar(?:inizi|i) (?:iletmenizi|gondermenizi)/),
    p(/gehaltsvorstellung|kundigungsfrist|fruhestmoglich|eintrittstermin|unterlagen (?:nachreichen|zusenden|vervollstandigen)|zeugnisse/),
  ],
};

/** Job-search vocabulary: a message without any of it (and without a sender signal) is skipped. */
const JOB_VOCABULARY =
  /\b(?:application|applied|applying|candidate|candidacy|interview|recruit\w*|hiring|vacanc\w*|job|jobs|position|role|offer letter|resume|cv|talent acquisition|assessment|careers?|basvuru\w*|mulakat\w*|gorusme\w*|aday\w*|ise alim|insan kaynaklari|pozisyon\w*|is ilan\w*|ozgecmis\w*|kariyer\w*|bewerbung\w*|bewerber\w*|vorstellungsgesprach\w*|stelle\w*|stellenangebot\w*|kandidat\w*|vakanz\w*|lebenslauf|personalabteilung|personalberat\w*|recruiting)\b/;

/** Candidate-facing career content that arrives as bulk mail (other_job): fairs, profile nudges. */
const CAREER_CONTENT =
  /career(?:s)? fair|job fair|careers? event|complete your (?:profile|cv|resume)|kariyer fuar\w*|(?:ozgecmis|profil)\w* tamamla\w*|karrieremesse|jobmesse|recruiting-?(?:messe|event)|profil vervollstandig\w*|vervollstandig\w* (?:ihr|dein) profil/;

/** How much of the body the rules read (quoted history further down adds noise). */
const RULE_BODY_CHARS = 4_000;

function scoreCategories(text: string): {
  hits: Record<RuleCategory, number>;
  phrases: Partial<Record<RuleCategory, string>>;
} {
  const hits = {} as Record<RuleCategory, number>;
  const phrases: Partial<Record<RuleCategory, string>> = {};
  for (const [category, patterns] of Object.entries(PATTERNS) as [RuleCategory, readonly Pattern[]][]) {
    hits[category] = 0;
    for (const pattern of patterns) {
      const match = pattern.re.exec(text);
      if (match === null) continue;
      hits[category] += pattern.weight;
      if (pattern.weight === 2 || phrases[category] === undefined) phrases[category] ??= match[0];
    }
  }
  return { hits, phrases };
}

/** Strips quoted replies ("> …", "On … wrote:", "Am … schrieb", "… tarihinde … yazdı") from the rule text. */
function withoutQuotedHistory(body: string): string {
  const lines = body.split(/\r?\n/u);
  const kept: string[] = [];
  for (const line of lines) {
    const folded = foldText(line.trim());
    if (/^(?:on .+ wrote:|am .+ schrieb .+:|.+ tarihinde .+ yazdi:|-{2,} ?original message|-{2,} ?ursprungliche nachricht|from: .+@)/u.test(folded))
      break;
    if (!line.trimStart().startsWith(">")) kept.push(line);
  }
  return kept.join("\n");
}

/** Pre-filter signals for one message against the tracker. */
export function mailSignals(mail: MailInput, applications: readonly TrackedApplication[]): MailSignals {
  const domain = senderDomain(mail.from.address);
  const ats = domainMatches(domain, ATS_SENDER_DOMAINS);
  const jobBoard = domainMatches(domain, JOB_BOARD_SENDER_DOMAINS);
  const assessmentPlatform = domainMatches(domain, ASSESSMENT_SENDER_DOMAINS);

  const replyIds = [mail.inReplyTo, ...mail.references].filter((id): id is string => id !== null);
  const threadApplication = applications.find((application) =>
    application.threadRefs.some(
      (ref) =>
        (mail.providerThreadId !== null && ref.accountId === mail.accountId && ref.threadId === mail.providerThreadId) ||
        (ref.rfc822MessageId !== null && replyIds.includes(ref.rfc822MessageId)),
    ),
  );

  const domainApplicationIds = applications
    .filter(
      (application) =>
        application.companyDomain !== null && !ats && !jobBoard && domainMatches(domain, [application.companyDomain]),
    )
    .map((application) => application.id);

  const opening = `${mail.from.name ?? ""}\n${mail.subject}\n${mail.bodyText.slice(0, 1_500)}`;
  const openingKey = ` ${companyKey(opening)} `;
  const namedApplicationIds = applications
    .filter((application) => {
      const key = companyKey(application.company);
      return key.length >= 3 && openingKey.includes(` ${key} `);
    })
    .map((application) => application.id);

  const text = foldText(`${mail.subject}\n${withoutQuotedHistory(mail.bodyText).slice(0, RULE_BODY_CHARS)}`);
  const { hits, phrases } = scoreCategories(text);
  return {
    senderDomain: domain,
    ats,
    jobBoard,
    assessmentPlatform,
    threadApplicationId: threadApplication?.id ?? null,
    domainApplicationIds,
    namedApplicationIds,
    hits,
    phrases,
    jobVocabulary: JOB_VOCABULARY.test(text),
    personal: !mail.bulk && !mail.listUnsubscribe,
    careerContent: CAREER_CONTENT.test(text),
  };
}

/**
 * Whether the message may be job mail (BRIEF §4.7 step 2). Non-candidates are dropped before any
 * model call; only a hash of their id is kept. Tuned for recall: the classifier sorts out the rest.
 * Personal mail (no list or bulk headers) with job vocabulary is a candidate (recruiters write
 * from anywhere); bulk mail needs a category phrase, a tracked company or candidate-facing career
 * content (fairs, profile nudges).
 */
export function isJobCandidate(signals: MailSignals): boolean {
  if (signals.threadApplicationId !== null || signals.ats || signals.assessmentPlatform) return true;
  if (signals.domainApplicationIds.length > 0) return true;
  if (signals.jobBoard) return true;
  if (!signals.jobVocabulary) return false;
  return (
    signals.personal ||
    signals.careerContent ||
    signals.namedApplicationIds.length > 0 ||
    Object.values(signals.hits).some((weight) => weight > 0)
  );
}

export interface RuleClassification {
  category: MailCategory;
  confidence: number;
  /** Interview stage hint for `interview_invite` (first recruiter / phone screen → screening). */
  screening: boolean;
  /** The phrase or signal that decided it (reason line; folded text, no body beyond the phrase). */
  evidence: string | null;
}

const SCREENING_HINT =
  /\b(?:(?:phone|recruiter|intro(?:ductory)?|initial|first|screening) (?:screen|call|chat|conversation|interview)|(?:telefon|on|ilk|tanisma|ik|insan kaynaklari) gorusme\w*|(?:telefon|kennenlern|erst)(?:gesprach|interview)\w*|telefoninterview|telefonisch\w* kennenlernen)/;

type StatusCategory = "application_received" | "rejection" | "interview_invite" | "assessment" | "offer";
const STATUS_CATEGORIES: readonly StatusCategory[] = [
  "application_received",
  "rejection",
  "interview_invite",
  "assessment",
  "offer",
];
/** Rules confidence when phrases of two status categories appear (below the 0.9 auto-apply default). */
const AMBIGUOUS_CAP = 0.8;

/**
 * Rules-only classification (used as is when "Allow sending email text to AI" is off, and as a
 * cross-check of the model otherwise). Confidence reaches the auto-apply range (≥ 0.9) only with
 * a decisive phrase *and* a sender or thread signal tying the message to a real application.
 */
export function classifyByRules(mail: MailInput, signals: MailSignals): RuleClassification {
  const text = foldText(`${mail.subject}\n${withoutQuotedHistory(mail.bodyText).slice(0, RULE_BODY_CHARS)}`);
  const anchored =
    signals.threadApplicationId !== null ||
    signals.ats ||
    signals.assessmentPlatform ||
    signals.domainApplicationIds.length > 0;
  const { hits, phrases } = signals;
  const result = (category: MailCategory, confidence: number, evidence: string | null): RuleClassification => {
    // Phrases of another status category make the rules unsure: such mail never changes the
    // tracker by rules alone. A receipt phrase next to a rejection is the usual "thank you for
    // applying … unfortunately" and doesn't count.
    const competing = STATUS_CATEGORIES.some(
      (other) =>
        other !== category &&
        hits[other] > 0 &&
        !(category === "rejection" && other === "application_received"),
    );
    const capped = STATUS_CATEGORIES.includes(category as StatusCategory) && competing ? Math.min(confidence, AMBIGUOUS_CAP) : confidence;
    return {
      category,
      confidence: Math.round(capped * 100) / 100,
      screening: category === "interview_invite" && SCREENING_HINT.test(text),
      evidence,
    };
  };

  if (!isJobCandidate(signals)) return result("not_job", 0.9, null);

  // Alerts: a job board (or bulk mail) listing jobs, with nothing addressed to an application.
  if ((signals.jobBoard || mail.listUnsubscribe || mail.bulk) && hits.job_alert >= 2 && !anchored)
    return result("job_alert", signals.jobBoard ? 0.9 : 0.75, phrases.job_alert ?? signals.senderDomain);

  // Decisions first: "Thank you for applying … unfortunately" is a rejection, not a receipt.
  if (hits.offer >= 2 && hits.rejection < 2) return result("offer", anchored ? 0.85 : 0.7, phrases.offer ?? null);
  if (hits.rejection >= 3 || (hits.rejection >= 2 && (anchored || hits.application_received > 0)))
    return result("rejection", anchored ? 0.93 : 0.8, phrases.rejection ?? null);
  if (hits.interview_invite >= 2 && !(mail.listUnsubscribe && signals.jobBoard))
    return result("interview_invite", anchored ? 0.9 : 0.75, phrases.interview_invite ?? null);
  if (hits.assessment >= 2 || (signals.assessmentPlatform && hits.assessment >= 1))
    return result("assessment", anchored ? 0.9 : 0.75, phrases.assessment ?? signals.senderDomain);
  if (hits.info_request >= 2 && (anchored || signals.namedApplicationIds.length > 0))
    return result("info_request", 0.75, phrases.info_request ?? null);
  if (hits.application_received >= 2 && hits.rejection < 2)
    return result("application_received", anchored ? 0.93 : 0.8, phrases.application_received ?? null);
  if (hits.recruiter_outreach >= 2 && !anchored)
    return result("recruiter_outreach", 0.75, phrases.recruiter_outreach ?? null);
  if (signals.jobBoard && (mail.listUnsubscribe || mail.bulk))
    return result("job_alert", 0.7, signals.senderDomain);
  if (hits.rejection >= 2) return result("rejection", 0.7, phrases.rejection ?? null);
  if (signals.careerContent) return result("other_job", 0.6, null);
  // A candidate with job words but no phrase and no tie to an application: most likely not job mail.
  if (!anchored && signals.namedApplicationIds.length === 0 && !signals.jobBoard) return result("not_job", 0.6, null);
  return result("other_job", 0.5, null);
}

/**
 * Best-effort company and role from the message without a model: the linked application's
 * company, otherwise the sender's display name without ATS suffixes; the role from common
 * subject lines ("Your application for X", "Ihre Bewerbung als X", "X pozisyonu").
 */
export function extractByRules(
  mail: MailInput,
  signals: MailSignals,
  applications: readonly TrackedApplication[],
): { company: string | null; role: string | null } {
  const byId = (id: string | null | undefined) => applications.find((application) => application.id === id);
  const known =
    byId(signals.threadApplicationId) ??
    (signals.domainApplicationIds.length === 1 ? byId(signals.domainApplicationIds[0]) : undefined) ??
    (signals.namedApplicationIds.length === 1 ? byId(signals.namedApplicationIds[0]) : undefined);
  let company = known?.company ?? null;
  if (company === null && !signals.jobBoard && mail.from.name !== null) {
    const name = mail.from.name
      .replace(/\s*(?:\(via [^)]+\)|via \S+|@ ?\S+)\s*$/iu, "")
      .replace(/\b(?:careers?|recruiting|recruitment|talent(?: acquisition)?|hiring team|hr|people|jobs|kariyer|insan kaynaklar[ıi]|ik|personal(?:abteilung)?|karriere|bewerbermanagement)\b/giu, "")
      .replace(/[|·,–-]+\s*$/u, "")
      .trim();
    if (name.length >= 2 && name.split(/\s+/u).length <= 4) company = name;
  }
  const role = roleFromSubject(mail.subject);
  return { company, role: role ?? known?.role ?? null };
}

const SUBJECT_ROLE_PATTERNS: readonly RegExp[] = [
  /application (?:for|to) (?:the )?(?:position of |role of )?(.+?)(?: position| role)?(?: at | with | - | – | \| |$)/iu,
  /(?:interview|assessment|offer)(?: invitation)? (?:for|-|–) (?:the )?(.+?)(?: position| role)?(?: at | with | \| |$)/iu,
  /bewerbung (?:als|für|fur|auf die stelle(?: als)?) (.+?)(?: bei | - | – | \| |$)/iu,
  /(.+?) pozisyonu(?:na|nuz| için| icin|$)/iu,
  /(.+?) başvurunuz/iu,
];

function roleFromSubject(subject: string): string | null {
  for (const pattern of SUBJECT_ROLE_PATTERNS) {
    const match = pattern.exec(subject);
    const role = match?.[1]?.replace(/^(?:re|aw|fwd?|wg):\s*/iu, "").replace(/["“”„]/gu, "").trim();
    if (role !== undefined && role.length >= 3 && role.length <= 120) return role;
  }
  return null;
}

/** Applications a message plausibly concerns (company named or domain), for the model's shortlist. */
export function candidateApplications(
  signals: MailSignals,
  applications: readonly TrackedApplication[],
  extractedCompany: string | null,
): TrackedApplication[] {
  const ids = new Set([
    ...(signals.threadApplicationId === null ? [] : [signals.threadApplicationId]),
    ...signals.domainApplicationIds,
    ...signals.namedApplicationIds,
  ]);
  return applications.filter(
    (application) =>
      ids.has(application.id) || (extractedCompany !== null && companiesMatch(application.company, extractedCompany)),
  );
}
