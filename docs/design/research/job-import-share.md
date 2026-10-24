# Save a job from the iOS share sheet (Share Extension)

Date: 2026-10-24. Scope: the iOS Share Extension "Save to BruteForceHR" (BRIEF §4.3 "Save from anywhere"): someone reads a posting in Safari or the LinkedIn app, taps Share, picks BruteForceHR, checks the fields and saves. Server side: `jobImportUrl` (ADR 0005 "URL import"). The in-app paste-a-link review is a separate, fuller screen (IosJobs, `BFHRUI/Jobs/JobImportReview.swift`); the desktop paste dialog is DesktopJobs'.

## References (Mobbin, iOS)

| App | Screen | Link | What it shows | Take-away |
|---|---|---|---|---|
| Fabric | Save a link | https://mobbin.com/screens/dfbd43eb-2e0d-482c-8924-72e57d939a9f | A compact sheet: the link with a loading spinner while it resolves, an optional note, the destination ("Spaces / Inbox") and one Save button. | One sheet does read → check → save. Show progress inline while the link is read; the destination is named next to Save. |
| Places | Saved place | https://mobbin.com/screens/abfba9ae-07c2-41e7-984e-2da7f62b78b1 | "Saved · Koi Palace" header, then a two-way choice ("Want to go" / "Been here"), then Done. | Two outcomes from one save mirror Save vs Save and log as applied: same object, different state. |
| Etsy | Saved to favorites | https://mobbin.com/screens/6434fd1f-36c4-4330-98a1-973f5c2d5073 | Confirmation header naming where it went ("Saved to favorites · Private"), then collections, then Done. | The saved state names the place to find it ("Find it in Jobs › Saved"). |
| Pocket | Add a URL | https://mobbin.com/screens/348c8864-cb50-4945-b93f-08d7e2978e75 | Title, URL field, full-width primary "Save to Pocket" and secondary "Cancel" stacked at the bottom. | Full-width stacked buttons fit long German labels and are easy to hit with a thumb. |
| Starling | Review payee | https://mobbin.com/screens/241a9904-e430-406c-b842-37b8e16d1187 | "We've matched the name below…" trust line with a glyph above editable fields and a Save button. | Say how the fields were found before asking to confirm them (trust: source + method). |
| Vestiaire Collective | Review before listing | https://mobbin.com/screens/87e172a6-ea15-4dd8-80bd-cbcdaf551833 | Key/value review with an amber "Double check everything" note. | A soft check-this note for the AI-read case, never alarming. |

Rejected: Bump, Universe, Google Maps, Apple News (system share sheets, not app-owned save UI); Hypelist, yope (social sharing); Whering, Grailed, GoFundMe, Origin, Cash App, GoPay (long multi-section reviews: too heavy for an extension).

## Decisions

- **One compact sheet**, inline title "Save job", Cancel at the top left. States: reading (spinner + host), ready (form), saving (button spinner), saved, failed, signed out, add by hand.
- **Trust line first**: "From jobs.ashbyhq.com" and how it was read: "Read from the page's job details" (JSON-LD, microdata, site adapter) or the AI badge + "Read by AI from the page text. Check the details." Never hide the source (ADR 0005).
- **Fields**: Role, Company, Location only (the posting's other fields are saved as read; the full review is in the app). Editable for a new job; for a job already saved the fields are read-only and an info alert says "Already in your jobs — this link is added to the job you saved before" (merge, no duplicate).
- **Two actions pinned at the bottom**, full width, stacked: **Save** (primary; Jobs › Saved + Tracker Saved, D02) and **Save and log as applied** (secondary; Tracker Applied today). The footer explains both and that both can be changed later.
- **Saved**: a checkmark, "Saved to BruteForceHR" / "Saved and logged", where to find it, Done. A confirm haptic.
- **Walls and failures** (login wall, CAPTCHA, gone page, offline, AI off, daily cap): calm copy that says what happened in plain words and offers **Add it by hand** (company, role, location; the link kept in the notes). Try again only where retrying can help. No red, no blame.
- **Signed out**: "Sign in to BruteForceHR first" + Close; the link is kept in the App Group so the app can offer it after sign-in.
- Copy EN / TR (siz) / DE (du); Dynamic Type through AX sizes; VoiceOver: the source line reads as one element, progress has a label.
