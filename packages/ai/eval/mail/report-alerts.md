# Job-alert and interview-time eval

- Date: 2026-10-23. Deterministic (no model): `parseJobAlert` and `interviewSuggestionFromMail` in `@bfhr/core` (ADR 0012). CI: `pnpm --filter @bfhr/ai test` (`alerts-gate.test.ts`); report: `pnpm --filter @bfhr/ai eval:mail-alerts`.
- Alerts: 16 emails (EN 6, TR 4, DE 6; linkedin, indeed, stepstone, kariyer, xing, glassdoor, generic), 37 labelled postings. Invites: 10 (EN 4, TR 3, DE 3), calendar parts and explicit times. Development set: written alongside the parsers.

## Postings

| Metric                                           | Value           | Gate             |
| ------------------------------------------------ | --------------- | ---------------- |
| Recall (URL, title, company, location all right) | 100.0 % (37/37) | ≥ 90.0 % ✅ pass |
| Precision                                        | 100.0 % (37/37) | ≥ 95.0 % ✅ pass |
| Salary and posting date right (correct postings) | 100.0 %         | —                |

No posting errors.

## Interview times

| Metric                                                                  | Value                                    | Gate             |
| ----------------------------------------------------------------------- | ---------------------------------------- | ---------------- |
| Start (± 1 min)                                                         | 100.0 %                                  | ≥ 90.0 % ✅ pass |
| Organizer zone                                                          | 100.0 %                                  | —                |
| Duration                                                                | 100.0 %                                  | —                |
| Meeting link                                                            | 100.0 %                                  | —                |
| All fields                                                              | 100.0 %                                  | —                |
| Held out: classification-set invites with one labelled time (text only) | 21/23 right; wrong: de-024; none: tr-022 | reported         |

No interview-time errors.
