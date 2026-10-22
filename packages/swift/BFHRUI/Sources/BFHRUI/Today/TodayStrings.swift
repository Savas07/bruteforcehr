import BFHRCore
import Foundation

/// Today's strings (table "Today"; en, tr siz, de du in `Today.xcstrings`).
enum TodayStrings {
    static let loading = LocalizedStringResource.bfhr("today.loading", default: "Loading today's updates", table: "Today")
    static let errorTitle = LocalizedStringResource.bfhr("today.error.title", default: "We couldn't load today's updates", table: "Today")
    static let errorBody = LocalizedStringResource.bfhr("today.error.body", default: "Our server didn't respond. Your applications and emails are safe. Try again in a moment.", table: "Today")
    static let caughtUpTitle = LocalizedStringResource.bfhr("today.caughtUp.title", default: "You're all caught up", table: "Today")
    static let caughtUpBody = LocalizedStringResource.bfhr("today.caughtUp.body", default: "New updates will show up here.", table: "Today")
    static let firstRunTitle = LocalizedStringResource.bfhr("today.firstRun.title", default: "Nothing needs you yet", table: "Today")
    static let firstRunBody = LocalizedStringResource.bfhr("today.firstRun.body", default: "Interviews, replies to review, follow-ups and new matches will show up here.", table: "Today")
    static let findJobs = LocalizedStringResource.bfhr("today.firstRun.findJobs", default: "Find jobs", table: "Today")
    static let connectTitle = LocalizedStringResource.bfhr("today.connect.title", default: "Connect your email", table: "Today")
    static let connectBody = LocalizedStringResource.bfhr("today.connect.body", default: "See interview invites and replies here. About 2 minutes.", table: "Today")
    static let connectAction = LocalizedStringResource.bfhr("today.connect.action", default: "Connect email", table: "Today")
    static let looksRight = LocalizedStringResource.bfhr("today.action.looksRight", default: "Looks right", table: "Today")
    static let done = LocalizedStringResource.bfhr("today.action.done", default: "Done", table: "Today")
    static let save = LocalizedStringResource.bfhr("today.action.save", default: "Save", table: "Today")
    static let review = LocalizedStringResource.bfhr("today.action.review", default: "Review…", table: "Today")
    static let join = LocalizedStringResource.bfhr("today.action.join", default: "Join", table: "Today", comment: "Joins the video interview.")
    static let followUpShort = LocalizedStringResource.bfhr("today.action.followUp", default: "Follow up", table: "Today", comment: "Short swipe label for Draft follow-up.")
    static let openApplication = LocalizedStringResource.bfhr("today.action.openApplication", default: "Open application", table: "Today")
    static let openJob = LocalizedStringResource.bfhr("today.action.openJob", default: "Open job", table: "Today")
    static let snoozeAll = LocalizedStringResource.bfhr("today.action.snoozeAll", default: "Snooze all…", table: "Today")
    static let cancel = LocalizedStringResource.bfhr("today.action.cancel", default: "Cancel", table: "Today")
    static let snoozeUntil = LocalizedStringResource.bfhr("today.snooze.until", default: "Snooze until", table: "Today")
    static let reviewHint = LocalizedStringResource.bfhr("today.review.hint", default: "Shows the email and what we'd change", table: "Today")
    static let openJobHint = LocalizedStringResource.bfhr("today.match.hint", default: "Opens the job", table: "Today")
    static let seeAllInJobs = LocalizedStringResource.bfhr("today.matches.seeAll", default: "See all in Jobs", table: "Today")
    static let prep = LocalizedStringResource.bfhr("today.nextUp.prep", default: "Prep", table: "Today", comment: "Disclosure with interviewers, notes and the application.")
    static let yourNotes = LocalizedStringResource.bfhr("today.nextUp.notes", default: "Your notes", table: "Today")
    static let videoCall = LocalizedStringResource.bfhr("today.nextUp.videoCall", default: "Video call", table: "Today")
    static let joinLater = LocalizedStringResource.bfhr("today.nextUp.joinLater", default: "Join appears here 10 minutes before the start.", table: "Today")
    static let couldntSave = LocalizedStringResource.bfhr("today.toast.couldntSave", default: "That change didn't go through. Try again.", table: "Today")

    static let updatedAutomatically = LocalizedStringResource.bfhr("today.toReview.automatic", default: "Updated automatically", table: "Today", comment: "Caption above automatic changes in To review.")

    static func movedTo(_ status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("today.autoChange.movedTo", default: "Moved to \(status.label)", table: "Today")
    }

    static func fromEmailBy(_ sender: String) -> LocalizedStringResource {
        .bfhr("today.autoChange.fromEmail", default: "From an email by \(sender)", table: "Today")
    }

    static func doneToday(_ count: Int) -> LocalizedStringResource {
        .bfhr("today.doneToday", default: "Done today (\(count))", table: "Today")
    }

    static func olderFollowUps(_ count: Int) -> LocalizedStringResource {
        .bfhr("today.followUps.older", default: "Older suggestions (\(count))", table: "Today")
    }

    static func interviewerTime(_ range: String, zone: String) -> LocalizedStringResource {
        .bfhr("today.nextUp.interviewerTime", default: "\(range) for the interviewer (\(zone))", table: "Today", comment: "%1$@ = time range, %2$@ = time zone name.")
    }

    static func sectionTitle(_ section: TodayModel.Section) -> LocalizedStringResource {
        switch section {
        case .nextUp: .bfhr("today.section.nextUp", default: "Next up", table: "Today")
        case .toReview: .bfhr("today.section.toReview", default: "To review", table: "Today")
        case .followUps: .bfhr("today.section.followUps", default: "Follow-ups", table: "Today")
        case .deadlines: .bfhr("today.section.deadlines", default: "Deadlines", table: "Today")
        case .newMatches: .bfhr("today.section.newMatches", default: "New matches", table: "Today")
        }
    }

    /// "To review · 3" (plain text; the badge lives on the Mail tab).
    static func toReviewTitle(count: Int) -> LocalizedStringResource {
        .bfhr("today.section.toReviewCount", default: "To review · \(count)", table: "Today")
    }

    static func interviewKind(_ kind: InterviewKind, round: Int) -> LocalizedStringResource {
        switch kind {
        case .recruiterCall: .bfhr("today.interview.recruiterCall", default: "Recruiter call · round \(round)", table: "Today")
        case .hiringManager: .bfhr("today.interview.hiringManager", default: "Hiring manager · round \(round)", table: "Today")
        case .technical: .bfhr("today.interview.technical", default: "Technical interview · round \(round)", table: "Today")
        case .systemDesign: .bfhr("today.interview.systemDesign", default: "System design · round \(round)", table: "Today")
        case .takeHomeReview: .bfhr("today.interview.takeHomeReview", default: "Take-home review · round \(round)", table: "Today")
        case .behavioral: .bfhr("today.interview.behavioral", default: "Behavioral interview · round \(round)", table: "Today")
        case .onsite: .bfhr("today.interview.onsite", default: "On-site · round \(round)", table: "Today")
        case .final: .bfhr("today.interview.final", default: "Final interview · round \(round)", table: "Today")
        case .other: .bfhr("today.interview.other", default: "Interview · round \(round)", table: "Today")
        }
    }

    static func deadlineTitle(_ deadline: TodayModel.Deadline) -> String {
        if case .nextAction(let action) = deadline.kind { action } else { deadline.title }
    }

    static func deadlineContext(_ deadline: TodayModel.Deadline) -> LocalizedStringResource {
        let company = deadline.company.name
        return switch deadline.kind {
        case .assessment: .bfhr("today.deadline.assessment", default: "Assessment · \(company)", table: "Today")
        case .replyBy: .bfhr("today.deadline.replyBy", default: "Reply requested · \(company)", table: "Today")
        case .nextAction: .bfhr("today.deadline.nextAction", default: "Next step · \(company)", table: "Today")
        case .jobCloses: .bfhr("today.deadline.jobCloses", default: "Posting closes · \(company)", table: "Today")
        }
    }

    static func deadlineGlyph(_ kind: TodayModel.Deadline.Kind) -> String {
        switch kind {
        case .assessment: "checklist"
        case .replyBy: "arrowshape.turn.up.left"
        case .nextAction: "arrow.right.circle"
        case .jobCloses: "bookmark"
        }
    }
}

/// Where Today's rows lead (IA.md "Deep links"). Links only navigate; the app's root routes them.
enum TodayLink {
    static let jobs = URL(string: "bruteforcehr://jobs")!
    static let mail = URL(string: "bruteforcehr://mail")!
    static let settings = URL(string: "bruteforcehr://settings")!

    static func application(_ id: String) -> URL { link("applications/\(id)") }
    static func job(_ id: String) -> URL { link("jobs/\(id)") }
    static func apply(jobId: String) -> URL { link("jobs/\(jobId)/apply") }
    static func mailReview(_ messageId: String) -> URL { link("mail/review/\(messageId)") }

    private static func link(_ path: String) -> URL {
        let encoded = path.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? path
        return URL(string: "bruteforcehr://\(encoded)") ?? jobs
    }
}
