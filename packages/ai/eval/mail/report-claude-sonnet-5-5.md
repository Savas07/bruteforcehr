# Mail classification eval

- Date: 2026-10-23; model `claude-sonnet-5-5`; prompt `mail-classify@2`; auto-apply threshold 0.9 with a strong link (thread or company + role).
- Fixtures: 206 messages (EN 68, TR 68, DE 70), 132 hard cases; every category covered. Synthetic and template-shaped mail with fictional parties (`eval/mail/fixtures/`).
- CI (`pnpm --filter @bfhr/ai test`) replays the recorded model replies through the current pipeline and fails below the gates; a changed prompt invalidates the recording. Live run: `pnpm --filter @bfhr/ai eval:mail`.

### AI on (model + rules cross-check)

| Metric | Value | Gate |
| --- | --- | --- |
| Macro-F1 (10 categories) | 0.995 | ≥ 0.9 ✅ pass |
| Precision of automatic changes | 100.0 % (50/50) | ≥ 97.0 % ✅ pass |
| Automatic coverage (labelled changes applied automatically) | 87.7 % | — |
| Category accuracy | 99.5 % | — |
| Application link accuracy | 100.0 % | — |
| Suggested status accuracy | 100.0 % | — |
| Company / role extraction | 92.6 % / 95.8 % | — |
| Date recall (± 1 min) | 71.2 % | — |
| Dropped by the pre-filter: job mail / not job | 0 / 17 | — |
| Model cost | $0.8556 | — |

| Category | Support | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| application_received | 26 | 1.00 | 1.00 | 1.00 |
| rejection | 27 | 1.00 | 1.00 | 1.00 |
| interview_invite | 27 | 1.00 | 1.00 | 1.00 |
| assessment | 16 | 1.00 | 1.00 | 1.00 |
| offer | 12 | 1.00 | 1.00 | 1.00 |
| recruiter_outreach | 16 | 1.00 | 1.00 | 1.00 |
| info_request | 14 | 1.00 | 1.00 | 1.00 |
| job_alert | 21 | 1.00 | 1.00 | 1.00 |
| other_job | 15 | 1.00 | 0.93 | 0.97 |
| not_job | 32 | 0.97 | 1.00 | 0.98 |

### AI off (rules only; the default until the user allows AI for mail)

| Metric | Value | Gate |
| --- | --- | --- |
| Macro-F1 (10 categories) | 0.682 | reported |
| Precision of automatic changes | 100.0 % (21/21) | ≥ 97.0 % ✅ pass |
| Automatic coverage (labelled changes applied automatically) | 36.8 % | — |
| Category accuracy | 66.5 % | — |
| Application link accuracy | 90.8 % | — |
| Suggested status accuracy | 82.5 % | — |
| Company / role extraction | 76.4 % / 51.0 % | — |
| Date recall (± 1 min) | 0.0 % | — |
| Dropped by the pre-filter: job mail / not job | 0 / 17 | — |
| Model cost | $0.0000 | — |

| Category | Support | Precision | Recall | F1 |
| --- | --- | --- | --- | --- |
| application_received | 26 | 0.72 | 0.69 | 0.71 |
| rejection | 27 | 0.88 | 0.52 | 0.65 |
| interview_invite | 27 | 0.90 | 0.70 | 0.79 |
| assessment | 16 | 1.00 | 0.94 | 0.97 |
| offer | 12 | 0.83 | 0.83 | 0.83 |
| recruiter_outreach | 16 | 0.86 | 0.38 | 0.52 |
| info_request | 14 | 1.00 | 0.36 | 0.53 |
| job_alert | 21 | 0.71 | 0.95 | 0.82 |
| other_job | 15 | 0.21 | 0.73 | 0.32 |
| not_job | 32 | 0.79 | 0.59 | 0.68 |

## Errors with AI on

| Case | Expected (category · application · status) | Got | Auto | Hard case |
| --- | --- | --- | --- | --- |
| en-054 | other_job · — · — | not_job (0.60) · — [none] · — |  | Marketing newsletter from an ATS sender domain (Greenhouse) about its candidate app; job-search related but no application event. |

## Errors with rules only

| Case | Expected (category · application · status) | Got | Auto | Hard case |
| --- | --- | --- | --- | --- |
| en-005 | application_received · en-app-pebble-backend · acknowledged | other_job (0.50) · en-app-pebble-backend [thread] · — |  | Mailbox auto-reply in the thread of an application sent by email (In-Reply-To the sent message, no company domain in tracker); still an acknowledgement. |
| en-006 | application_received · en-app-harbor-data · acknowledged | application_received (0.93) · — [none] · acknowledged |  | Two applications at Harbor Analytics; the role (Data Engineer) decides the link. |
| en-007 | application_received · en-app-meridian-fullstack · — | other_job (0.50) · en-app-meridian-fullstack [company_domain] · — |  | Second confirmation for an application already at 'acknowledged': linked, but no forward move, so suggestedStatus is null. |
| en-009 | rejection · en-app-juniper-tooling · rejected | rejection (0.93) · — [none] · rejected |  | 'Thank you for applying… unfortunately': starts like an acknowledgement but is a rejection. |
| en-010 | rejection · en-app-quillstack-sre · rejected | other_job (0.50) · en-app-quillstack-sre [ats_company_role] · — |  | Rejection after the final round wrapped in warm words ('we were impressed', 'keep your CV on file'). |
| en-017 | rejection · en-app-canalworks-staff · rejected | other_job (0.50) · en-app-canalworks-staff [ats_company_role] · — |  | Mixed language: Dutch rejection from an Amsterdam company in an otherwise English application. |
| en-018 | interview_invite · en-app-lumen-frontend · interviewing | other_job (0.50) · en-app-lumen-frontend [ats_company_role] · — |  |  |
| en-020 | interview_invite · en-app-northwind-backend · interviewing | other_job (0.50) · en-app-northwind-backend [company_domain] · — |  | Calendar-invite-only body (Google Calendar text), no prose from a recruiter. |
| en-021 | interview_invite · en-app-harbor-pm · screening | interview_invite (0.80) · — [none] · screening |  | First recruiter phone screen → screening (not interviewing); Harbor has two applications, role names the PM one. |
| en-023 | interview_invite · en-app-pebble-backend · interviewing | other_job (0.50) · en-app-pebble-backend [thread] · — |  | Reply in the email thread of an application with no known company domain. |
| en-024 | interview_invite · en-app-meridian-fullstack · interviewing | other_job (0.50) · en-app-meridian-fullstack [company_domain] · — |  |  |
| en-026 | interview_invite · en-app-tidal-fullstack · — | other_job (0.50) · en-app-tidal-fullstack [thread] · — |  | Final-round invite for an application already at 'interviewing': no forward move, suggestedStatus null; New York times. |
| en-030 | assessment · en-app-harbor-data · screening | assessment (0.90) · — [none] · screening |  | Two Harbor applications; the assessment title names the Data Engineer role. |
| en-035 | offer · en-app-fernway-platform · — | other_job (0.50) · en-app-fernway-platform [ats_company_role] · — |  | Offer arriving for an application the user already withdrew (closed): linked, suggestedStatus null. |
| en-038 | recruiter_outreach · en-app-kestrel-ts · — | other_job (0.50) · en-app-kestrel-ts [ats_company_role] · — |  | In-house recruiter reaching out about a role the user is still preparing: links to the tracker entry, no status change. |
| en-039 | recruiter_outreach · — · — | not_job (0.60) · — [none] · — |  | Agency mail uses 'exclusive offer' wording but is cold outreach, not an offer. |
| en-041 | recruiter_outreach · en-app-saltmarsh-go · — | other_job (0.50) · en-app-saltmarsh-go [ats_company_role] · — |  | Outreach from a company whose role is only 'saved' in the tracker: link it, but outreach never moves status. |
| en-043 | info_request · en-app-tidal-fullstack · — | other_job (0.50) · en-app-tidal-fullstack [thread] · — |  | References request after interviews reads like a near-offer but is only an information request. |
| en-044 | info_request · en-app-harbor-pm · — | other_job (0.50) · — [none] · — |  |  |
| en-046 | info_request · en-app-meridian-fullstack · — | interview_invite (0.75) · — [none] · interviewing |  |  |
| en-056 | other_job · — · — | job_alert (0.70) · — [none] · — |  |  |
| en-058 | other_job · en-app-fernway-platform · — | other_job (0.50) · — [none] · — |  | Confirmation of the user's own withdrawal: linked to the closed application, not a rejection. |
| en-059 | not_job · — · — | application_received (0.80) · — [none] · acknowledged |  | Credit card 'application received' wording. |
| en-061 | not_job · — · — | application_received (0.80) · — [none] · acknowledged |  | Apartment rental 'application' with references request, mimics info_request. |
| en-062 | not_job · — · — | application_received (0.80) · — [none] · acknowledged |  | University 'application received' for a part-time MSc. |
| tr-002 | application_received · tr-app-lale-pm · acknowledged | application_received (0.93) · — [none] · acknowledged |  | Two Lale Bank applications in the tracker; the role in the subject (Dijital Ürün Yöneticisi) selects the PM one. |
| tr-003 | application_received · — · acknowledged | job_alert (0.70) · — [none] · — |  |  |
| tr-004 | application_received · tr-app-egeveri · acknowledged | other_job (0.50) · tr-app-egeveri [thread] · — |  | ATS auto-reply to an emailed application; linked only through thread / In-Reply-To. |
| tr-007 | application_received · tr-app-baskent · acknowledged | other_job (0.50) · tr-app-baskent [thread] · — |  | Company domain unknown in the tracker; personal-sounding reply in the thread of the emailed application. |
| tr-010 | rejection · tr-app-pazarix · rejected | other_job (0.50) · tr-app-pazarix [ats_company_role] · — |  | Opens with "Başvurunuz için teşekkür ederiz" like a receipt, then "maalesef". |
| tr-011 | rejection · tr-app-lale-swe · rejected | rejection (0.93) · — [none] · rejected |  | Rejection after final interviews wrapped in warm words ("çok etkilendik", "özgeçmişinizi havuzumuzda tutacağız"). |
| tr-012 | rejection · tr-app-anadolu · rejected | other_job (0.50) · tr-app-anadolu [ats_company_role] · — |  | Position filled internally — rejection without the word "olumsuz". |
| tr-013 | rejection · — · rejected | other_job (0.50) · — [none] · — |  | Position put on hold — counts as rejection; company not in tracker. |
| tr-014 | rejection · tr-app-kapadokya · — | other_job (0.50) · — [none] · — |  | Application already rejected (closed); a second rejection proposes nothing. |
| tr-015 | rejection · tr-app-cinar · — | other_job (0.50) · tr-app-cinar [company_domain] · — |  | Withdrawn (closed) application with unknown domain, matched by company name and role; no status move. |
| tr-017 | rejection · tr-app-kervan · rejected | other_job (0.50) · tr-app-kervan [ats_company_role] · — |  |  |
| tr-022 | interview_invite · tr-app-lale-swe · — | other_job (0.50) · — [none] · — |  | Reschedule of an existing interview (new time), still interview_invite; application already interviewing. |
| tr-024 | interview_invite · — · interviewing | interview_invite (0.75) · — [none] · screening |  |  |
| tr-036 | offer · tr-app-lale-swe · offer | offer (0.85) · — [none] · offer |  | Verbal/informal offer announcement with a call proposal; role names the SWE application. |
| tr-037 | recruiter_outreach · — · — | job_alert (0.70) · — [none] · — |  | Recruiter outreach that mentions an interview ("kısa bir ön görüşme") but no application exists. |
| tr-038 | recruiter_outreach · — · — | not_job (0.60) · — [none] · — |  |  |
| tr-039 | recruiter_outreach · — · — | not_job (0.60) · — [none] · — |  |  |
| tr-040 | recruiter_outreach · — · — | job_alert (0.70) · — [none] · — |  | Job-board notification that an employer messaged the candidate — outreach, not an alert. |
| tr-042 | info_request · tr-app-lale-swe · — | other_job (0.50) · — [none] · — |  | Requests documents and references; must not be read as an offer. |
| tr-044 | info_request · tr-app-egeveri · — | other_job (0.50) · tr-app-egeveri [thread] · — |  | Availability request in the email-application thread — looks like scheduling but has no invite yet. |
| tr-045 | info_request · tr-app-galata · — | offer (0.85) · tr-app-galata [ats_company_role] · — |  | Pre-employment document request after the offer; offer words nearby but category is info_request. |
| tr-054 | other_job · — · — | job_alert (0.70) · — [none] · — |  |  |
| tr-056 | other_job · — · — | job_alert (0.90) · — [none] · — |  |  |
| tr-058 | not_job · — · — | application_received (0.93) · — [none] · acknowledged |  | Credit-card "başvurunuz alınmıştır" from Lale Bank, a tracked employer. |
| tr-061 | not_job · — · — | application_received (0.80) · — [none] · acknowledged |  | University master's application received — academic, not job. |
| tr-062 | not_job · — · — | offer (0.85) · tr-app-pazarix [ats_company_role] · offer |  | "Size özel teklif" discount from Pazarix, a tracked employer (e-commerce marketing). |
| tr-064 | not_job · — · — | rejection (0.80) · — [none] · rejected |  | Bank "başvurunuz olumsuz sonuçlanmıştır" for a consumer loan — reads like a rejection. |
| tr-065 | not_job · — · — | other_job (0.50) · — [none] · — |  | ATS-domain marketing newsletter aimed at HR buyers (Personio product news) — not job-search. |
| de-003 | application_received · de-app-wolkenwerk-be · acknowledged | other_job (0.50) · — [none] · — |  | Two tracker applications at Wolkenwerk; the message names the Go backend role, so it links to that one. |
| de-005 | application_received · de-app-fichte · acknowledged | other_job (0.50) · de-app-fichte [thread] · — |  | Mail-server auto-reply in the application thread; company domain unknown in the tracker, matched via thread. |
| de-009 | application_received · de-app-isarwerk · — | other_job (0.50) · de-app-isarwerk [ats_company_role] · — |  | Second confirmation for an application already marked acknowledged: no forward move, so no status. |
| de-011 | rejection · de-app-kranich · rejected | other_job (0.50) · de-app-kranich [ats_company_role] · — |  | Rejection after final interviews wrapped in warm words ("beeindruckt", Talentpool) — no explicit "Absage". |
| de-012 | rejection · de-app-elbtal · rejected | other_job (0.50) · de-app-elbtal [ats_company_role] · — |  | Position put on hold (Einstellungsstopp) — counts as rejection although no candidate decision is stated. |
| de-013 | rejection · — · rejected | other_job (0.50) · — [none] · — |  | Position already filled — rejection phrased as an information update. |
| de-015 | rejection · de-app-brezel · — | other_job (0.50) · de-app-brezel [ats_company_role] · — |  | Application is already closed (rejected), so a further rejection proposes no status. |
| de-018 | rejection · — · rejected | other_job (0.50) · — [none] · — |  | Wolkenwerk rejection without any role name while two Wolkenwerk applications are tracked — cannot be linked safely. |
| de-020 | interview_invite · de-app-elbtal · interviewing | interview_invite (0.90) · de-app-elbtal [ats_company_role] · — |  |  |
| de-022 | interview_invite · de-app-rheinblick · — | other_job (0.50) · de-app-rheinblick [thread] · — |  | Interview reschedule (Terminverschiebung) — still an interview invite with a new time; application already interviewing. |
| de-023 | interview_invite · de-app-isarwerk · interviewing | interview_invite (0.75) · — [none] · interviewing |  | Calendar-invite-only text (Google Calendar notification), no prose from a recruiter. |
| de-026 | interview_invite · de-app-wolkenwerk-be · interviewing | other_job (0.50) · — [none] · — |  | Technical interview with a self-scheduling link only; role named so it links to the Go application, not the Product Owner one. |
| de-029 | assessment · de-app-wolkenwerk-be · screening | assessment (0.90) · — [none] · screening |  | Assessment reminder that landed in the spam folder. |
| de-031 | assessment · de-app-kranich · — | other_job (0.50) · de-app-kranich [ats_company_role] · — |  | Take-home task for an application already in interviewing: assessment would move backwards, so no status. |
| de-037 | offer · — · offer | other_job (0.50) · — [none] · — |  |  |
| de-038 | recruiter_outreach · — · — | not_job (0.60) · — [none] · — |  |  |
| de-040 | recruiter_outreach · — · — | job_alert (0.70) · — [none] · — |  |  |
| de-041 | recruiter_outreach · — · — | not_job (0.60) · — [none] · — |  |  |
| de-045 | info_request · de-app-alpbau · — | other_job (0.50) · de-app-alpbau [thread] · — |  |  |
| de-046 | info_request · — · — | application_received (0.80) · — [none] · acknowledged |  | ATS template asking for a missing document — reads like a confirmation but requests action. |
| de-047 | info_request · de-app-seeblick · — | other_job (0.50) · de-app-seeblick [ats_company_role] · — |  |  |
| de-050 | job_alert · — · — | recruiter_outreach (0.75) · — [none] · — |  | Job alert titled like an invitation ("Sie sind eingeladen, sich zu bewerben"). |
| de-057 | other_job · — · — | job_alert (0.70) · — [none] · — |  | "Vervollständigen Sie Ihr Profil" nudge from a job board. |
| de-061 | not_job · — · — | rejection (0.80) · — [none] · rejected |  | Bank "Ihr Antrag wurde abgelehnt" — rejection wording, not job-related. |
| de-063 | not_job · — · — | other_job (0.50) · de-app-hafenkontor [company_domain] · — |  | Podcast newsletter with "Interview" in the subject. |
| de-064 | not_job · — · — | application_received (0.80) · — [none] · acknowledged |  | Apartment application (Wohnungsbewerbung) confirmation and viewing "Termin". |
| de-067 | not_job · — · — | other_job (0.50) · — [none] · — |  | Marketing newsletter from an ATS vendor domain aimed at HR buyers, not at candidates. |
| de-069 | not_job · — · — | interview_invite (0.75) · — [none] · interviewing |  | Personal mail that mentions the user's interviews in passing. |
