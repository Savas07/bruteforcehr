/**
 * Sender domains the mail pre-filter keys on (BRIEF §4.7 step 2: "kept as data, not code").
 * A sender matches when its domain equals an entry or is a subdomain of it
 * (`us.greenhouse-mail.io` matches `greenhouse-mail.io`).
 */

/** Applicant tracking systems that send candidate mail on behalf of employers. */
export const ATS_SENDER_DOMAINS = [
  "greenhouse.io",
  "greenhouse-mail.io",
  "lever.co",
  "ashbyhq.com",
  "myworkday.com",
  "myworkdayjobs.com",
  "workday.com",
  "smartrecruiters.com",
  "smartrecruiters-mail.com",
  "icims.com",
  "workable.com",
  "workablemail.com",
  "teamtailor.com",
  "teamtailor-mail.com",
  "recruitee.com",
  "jobvite.com",
  "successfactors.com",
  "successfactors.eu",
  "sapsf.com",
  "sapsf.eu",
  "taleo.net",
  "oraclecloud.com",
  "bamboohr.com",
  "personio.com",
  "personio.de",
  "softgarden.io",
  "softgarden.de",
  "join.com",
  "breezy.hr",
  "jazzhr.com",
  "applytojob.com",
  "pinpointhq.com",
  "rippling.com",
  "dover.com",
  "homerun.co",
  "comeet.co",
  "recruiterbox.com",
  "zohorecruit.com",
  "zohorecruit.eu",
  "hrmos.co",
  "cvwizard.com",
  "kariyer.net",
  "hirehive.com",
  "manatal.com",
  "jobylon.com",
  "onlyfy.io",
  "dvinci.de",
  "dvinci-easy.com",
  "concludis.de",
  "rexx-systems.com",
  "umantis.com",
  "beesite.de",
] as const;

/** Job boards and networks: alerts, saved-search digests, recruiter InMail notifications. */
export const JOB_BOARD_SENDER_DOMAINS = [
  "linkedin.com",
  "indeed.com",
  "indeedemail.com",
  "glassdoor.com",
  "stepstone.de",
  "stepstone.com",
  "xing.com",
  "monster.com",
  "monster.de",
  "kariyer.net",
  "secretcv.com",
  "yenibiris.com",
  "eleman.net",
  "totaljobs.com",
  "reed.co.uk",
  "cv-library.co.uk",
  "otta.com",
  "welcometothejungle.com",
  "wellfound.com",
  "angel.co",
  "remotive.com",
  "weworkremotely.com",
  "arbeitnow.com",
  "arbeitsagentur.de",
  "jobs.ch",
  "karriere.at",
  "builtin.com",
  "ziprecruiter.com",
  "dice.com",
  "honeypotmail.io",
  "honeypot.io",
  "talent.io",
  "hired.com",
] as const;

/** Online assessment platforms (coding tests, psychometrics, video interviews). */
export const ASSESSMENT_SENDER_DOMAINS = [
  "codility.com",
  "hackerrank.com",
  "hackerrankforwork.com",
  "testgorilla.com",
  "coderbyte.com",
  "codesignal.com",
  "codingame.com",
  "hirevue.com",
  "shl.com",
  "talentlens.com",
  "pymetrics.ai",
  "criteriacorp.com",
  "vervoe.com",
  "devskiller.com",
  "qualified.io",
  "karat.com",
  "willo.video",
  "spark-hire.com",
] as const;

/** Lowercase domain of an address (`Jobs@Mail.Acme.example` → `mail.acme.example`). */
export function senderDomain(address: string): string {
  return address.slice(address.lastIndexOf("@") + 1).toLowerCase();
}

/** `domain` equals one of `domains` or is a subdomain of one of them. */
export function domainMatches(domain: string, domains: readonly string[]): boolean {
  return domains.some((entry) => domain === entry || domain.endsWith(`.${entry}`));
}
