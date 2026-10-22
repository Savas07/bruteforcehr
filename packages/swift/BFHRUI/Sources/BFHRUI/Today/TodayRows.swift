import BFHRCore
import BFHRDesignTokens
import SwiftUI

// Today's rows (today-home.md `AttentionRow` kinds). Each row is one accessibility element with
// the row's actions in the rotor (`bfhrRowActions` at the call site); text wraps at every size
// and nothing is colored by urgency.

/// "To review · 3": the count is plain text, never a badge (decisions.md D01).
struct TodaySectionHeader: View {
    let section: TodayModel.Section
    let count: Int?

    var body: some View {
        Group {
            if let count {
                Text(TodayStrings.toReviewTitle(count: count))
            } else {
                Text(TodayStrings.sectionTitle(section))
            }
        }
        .font(.bfhr(.subheadline, emphasized: true))
        .foregroundStyle(BFHRColor.Fg.secondary)
        .textCase(nil)
        .accessibilityAddTraits(.isHeader)
    }
}

/// The meta line under a row (source, relative time, waiting-to-sync); wraps at large sizes.
private struct MetaLine<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        ChipFlow(spacing: BFHRSpace.s2) { content }
            .font(.bfhr(.caption1))
            .foregroundStyle(BFHRColor.Fg.tertiary)
    }
}

/// An icon + text line inside a row: a small secondary glyph, not the list's wide icon column.
struct InlineLabel<Content: View>: View {
    let systemImage: String
    @ViewBuilder let content: Content

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
            Image(systemName: systemImage)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            content
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// MARK: Next up

/// The next interview within 48 h (Tana "Next Up" + Fireflies prep): what, who, when (with the
/// interviewer's time when their zone differs), where, and Join from 10 minutes before.
struct NextUpCard: View {
    let next: TodayModel.NextUp
    let isPendingSync: Bool
    let open: (URL) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            HStack(alignment: .top, spacing: BFHRSpace.s3) {
                CompanyMonogram(next.company, badge: "calendar")
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    Text(TodayStrings.interviewKind(next.kind, round: next.round))
                        .font(.bfhr(.footnote, emphasized: true))
                        .foregroundStyle(BFHRColor.Accent.text)
                    Text(verbatim: next.title)
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(verbatim: "\(next.company.name) · \(next.role)")
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if isPendingSync { SyncGlyph() }
            }
            .accessibilityElement(children: .combine)
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                NextUpTimes(next: next)
                if let location = next.location, !location.isEmpty {
                    InlineLabel(systemImage: "mappin") { Text(verbatim: location) }
                } else if next.meetingURL != nil {
                    InlineLabel(systemImage: "video") { Text(TodayStrings.videoCall) }
                }
            }
            .font(.bfhr(.subheadline))
            .foregroundStyle(BFHRColor.Fg.primary)
            if let url = next.meetingURL {
                if next.isJoinable {
                    Button { open(url) } label: {
                        Label { Text(TodayStrings.join) } icon: { Image(systemName: "video.fill") }
                    }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                } else {
                    Text(TodayStrings.joinLater)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        }
        .padding(.vertical, BFHRSpace.s2)
        .accessibilityElement(children: .contain)
    }
}

/// "Today, 15:00–16:30" and, when the interviewer's zone differs, "12:00–13:30 for the
/// interviewer (Greenwich Mean Time)".
private struct NextUpTimes: View {
    let next: TodayModel.NextUp
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @Environment(\.timeZone) private var timeZone

    var body: some View {
        var local = calendar
        local.timeZone = timeZone
        let start = DateText.dayAndTime(next.startsAt, now: now, locale: locale, calendar: local)
        let end = DateText.time(next.endsAt, locale: locale, calendar: local)
        return VStack(alignment: .leading, spacing: 2) {
            Label { Text(verbatim: "\(start)–\(end)").monospacedDigit() } icon: { Image(systemName: "clock") }
                .accessibilityLabel(Text(verbatim: "\(DateText.full(next.startsAt, locale: locale, calendar: local))–\(end)"))
            if let theirs = next.timeZone, theirs.secondsFromGMT(for: next.startsAt) != timeZone.secondsFromGMT(for: next.startsAt) {
                let their = { () -> Calendar in var c = calendar; c.timeZone = theirs; return c }()
                let range = "\(DateText.time(next.startsAt, locale: locale, calendar: their))–\(DateText.time(next.endsAt, locale: locale, calendar: their))"
                let zone = theirs.localizedName(for: .generic, locale: locale) ?? theirs.identifier
                Text(TodayStrings.interviewerTime(range, zone: zone))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .monospacedDigit()
                    .padding(.leading, BFHRSpace.s5)
            }
        }
    }
}

/// The Prep disclosure: who you'll meet, your notes, and the way to the application.
struct NextUpPrep: View {
    let next: TodayModel.NextUp
    let openApplication: () -> Void

    var body: some View {
        ForEach(next.people, id: \.self) { person in
            Label {
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: person.name)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    if let title = person.title, !title.isEmpty {
                        Text(verbatim: title)
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
            } icon: {
                Image(systemName: "person")
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .accessibilityElement(children: .combine)
        }
        if !next.prepNotes.isEmpty {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(TodayStrings.yourNotes)
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Text(verbatim: next.prepNotes)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
            }
            .accessibilityElement(children: .combine)
        }
        Button(action: openApplication) {
            Label { Text(TodayStrings.openApplication) } icon: { Image(systemName: "rectangle.split.3x1") }
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Accent.text)
                .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: To review

/// A low-confidence email waiting for the user: hedged classification, the application, the
/// source and when it arrived. Tapping opens the ReviewSheet.
struct ReviewRow: View {
    let proposal: ReviewProposal
    let isPendingSync: Bool

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(proposal.company ?? CompanyIdentity(name: proposal.sender.name ?? proposal.sender.address), badge: proposal.category.glyph)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(Strings.classification(proposal.category, hedged: proposal.isHedged))
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(verbatim: [proposal.company?.name ?? proposal.sender.name ?? proposal.sender.address, proposal.role].compactMap { $0 }.joined(separator: " · "))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                MetaLine {
                    SourceTag(.email)
                    RelativeTimeText(proposal.receivedAt, style: .day)
                    if isPendingSync { SyncGlyph() }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, BFHRSpace.s1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// An automatic change, led by what changed ("Moved to Offer"), then the application, the
/// evidence (source + reason) and Undo; "Can't undo" once a later move superseded it.
struct AutoChangeTodayRow: View {
    let item: AutoChangeItem
    let isPendingSync: Bool
    let onUndo: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(item.company, badge: "envelope.badge")
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(TodayStrings.movedTo(item.to))
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(verbatim: "\(item.company.name) · \(item.role)")
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if let reason = item.reason, !reason.isEmpty {
                    InlineLabel(systemImage: "text.quote") {
                        Text(verbatim: reason)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                } else if let sender = item.sender {
                    InlineLabel(systemImage: "envelope") {
                        Text(TodayStrings.fromEmailBy(sender))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                MetaLine {
                    SourceTag(.automatic(item.actor))
                    RelativeTimeText(item.occurredAt, style: .day)
                    if isPendingSync { SyncGlyph() }
                }
                if !item.canUndo {
                    Text(Strings.cantUndo)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .combine)
            if item.canUndo {
                Button(action: onUndo) { Text(Strings.undo) }
                    .buttonStyle(.bfhrPlain)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }
}

/// The quiet caption between the decisions and the automatic changes in To review.
struct AutoChangeCaption: View {
    var body: some View {
        Text(TodayStrings.updatedAutomatically)
            .font(.bfhr(.footnote, emphasized: true))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .accessibilityAddTraits(.isHeader)
    }
}

// MARK: Follow-ups

/// "Brightwave · Frontend Engineer — Applied 8 days ago · no reply yet", with Draft follow-up.
struct FollowUpRow: View {
    let nudge: NudgeItem
    let now: Date
    let isPendingSync: Bool
    let onDraft: () -> Void
    @Environment(\.calendar) private var calendar

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(nudge.company)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: "\(nudge.company.name) · \(nudge.role)")
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(Strings.followUpPrompt(days: nudge.days(at: now, calendar: calendar)))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Button(action: onDraft) {
                    Label { Text(Strings.draftFollowUp) } icon: { Image(systemName: "square.and.pencil") }
                }
                .buttonStyle(.bfhrPlain)
                .padding(.leading, -BFHRSpace.s2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if isPendingSync { SyncGlyph() }
        }
        .padding(.top, BFHRSpace.s1)
        .accessibilityElement(children: .contain)
    }
}

// MARK: Deadlines

/// An assessment, reply-by date, next step or a saved job's closing date. The date is plain
/// neutral text (never red), on its own line so it never truncates.
struct DeadlineRow: View {
    let deadline: TodayModel.Deadline
    let isPendingSync: Bool

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(deadline.company, badge: TodayStrings.deadlineGlyph(deadline.kind))
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: TodayStrings.deadlineTitle(deadline))
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(TodayStrings.deadlineContext(deadline))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                InlineLabel(systemImage: "clock") { RelativeTimeText(deadline.dueAt, style: .dayAndTime) }
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.primary)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if isPendingSync { SyncGlyph() }
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .combine)
    }
}

// MARK: New matches

/// A top new match with its band and first reason (LinkedIn), and compact Save / Not for me
/// (Nike ✕ / ✓). The text opens the job.
struct MatchRow: View {
    let match: TodayModel.NewMatch
    let isPendingSync: Bool
    let onOpen: () -> Void
    let onSave: () -> Void
    let onNotForMe: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Button(action: onOpen) {
                HStack(alignment: .top, spacing: BFHRSpace.s3) {
                    CompanyMonogram(match.company)
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(verbatim: match.title)
                            .font(.bfhr(.headline))
                            .foregroundStyle(BFHRColor.Fg.primary)
                        Text(verbatim: match.company.name)
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                        MatchBandPill(score: match.score)
                        if let reason = match.reason {
                            Text(verbatim: reason)
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                        if isPendingSync { SyncGlyph() }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint(Text(TodayStrings.openJobHint))
            if !dynamicTypeSize.isAccessibilitySize {
                VStack(spacing: 0) {
                    IconButton(TodayStrings.save, systemImage: "bookmark", action: onSave)
                    IconButton(Strings.notForMe, systemImage: "xmark", action: onNotForMe)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }
}

// MARK: Done today

struct DoneRow: View {
    let item: TodayModel.DoneItem

    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: item.company.name)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                if !item.summary.isEmpty {
                    Text(verbatim: item.summary)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
            }
        } icon: {
            Image(systemName: "checkmark.circle")
                .foregroundStyle(BFHRColor.Fg.tertiary)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: Snooze date

/// "Pick a date…" for Snooze: a graphical date-and-time picker from now on.
struct SnoozeDateSheet: View {
    let now: Date
    let calendar: Calendar
    let onSnooze: (Date) -> Void
    let onCancel: () -> Void
    @State private var date: Date

    init(now: Date, calendar: Calendar, onSnooze: @escaping (Date) -> Void, onCancel: @escaping () -> Void) {
        self.now = now
        self.calendar = calendar
        self.onSnooze = onSnooze
        self.onCancel = onCancel
        _date = State(initialValue: SnoozePreset.tomorrow.date(from: now, calendar: calendar))
    }

    var body: some View {
        NavigationStack {
            Form {
                DatePicker(selection: $date, in: now..., displayedComponents: [.date, .hourAndMinute]) {
                    Text(TodayStrings.snoozeUntil)
                }
                .datePickerStyle(.graphical)
            }
            .navigationTitle(Text(TodayStrings.snoozeUntil))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) { Text(TodayStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { onSnooze(date) } label: { Text(Strings.snooze) }
                }
            }
        }
    }
}

// MARK: Skeleton

/// The real section and row shapes with placeholder text (states.md: three section skeletons of
/// AttentionRow shapes).
struct TodaySkeleton: View {
    var body: some View {
        List {
            ForEach([TodayModel.Section.nextUp, .toReview, .followUps], id: \.self) { section in
                Section {
                    ForEach(0..<(section == .nextUp ? 1 : 2), id: \.self) { _ in
                        HStack(alignment: .top, spacing: BFHRSpace.s3) {
                            CompanyMonogram(CompanyIdentity(name: "Company"))
                            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                                Text(verbatim: "Looks like an interview invite").font(.bfhr(.headline))
                                Text(verbatim: "Company name · Frontend Engineer").font(.bfhr(.subheadline))
                                Text(verbatim: "From email · Today").font(.bfhr(.caption1))
                            }
                        }
                        .padding(.vertical, BFHRSpace.s1)
                    }
                } header: {
                    TodaySectionHeader(section: section, count: nil)
                }
            }
        }
        .bfhrInsetGroupedList()
    }
}
