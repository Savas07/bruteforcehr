import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// "Moved to Interviewing — from an email by marcus@brightwave.io · Undo" (components.md
/// `AutoChangeRow`, Today and Mail › Updates). Always names the source; Undo while `canRevert`
/// allows it, otherwise the quiet "Can't undo" line.
public struct AutoChangeRow: View {
    private let item: AutoChangeItem
    private let onUndo: () -> Void

    public init(_ item: AutoChangeItem, onUndo: @escaping () -> Void) {
        self.item = item
        self.onUndo = onUndo
    }

    public var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(item.company, badge: "envelope")
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: "\(item.company.name) · \(item.role)")
                    .font(.bfhr(.headline))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(bfhrPlain: Strings.autoChange(to: item.to, sender: item.sender))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                HStack(spacing: BFHRSpace.s2) {
                    SourceTag(.automatic(item.actor))
                    RelativeTimeText(item.occurredAt, style: .day)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
                if !item.canUndo {
                    Text(Strings.cantUndo)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if item.canUndo {
                Button(action: onUndo) { Text(Strings.undo) }
                    .buttonStyle(.bfhrPlain)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityActions {
            if item.canUndo { Button(action: onUndo) { Text(Strings.undo) } }
        }
    }
}

/// A suggestion the user decides on (components.md `NudgeCard`): follow-up after 7 days, no
/// response after 21. Primary + a calm way out; never applied automatically, never red.
public struct NudgeCard: View {
    private let item: NudgeItem
    private let now: Date
    private let onPrimary: () -> Void
    private let onDismiss: () -> Void
    @Environment(\.calendar) private var calendar

    public init(_ item: NudgeItem, now: Date, onPrimary: @escaping () -> Void, onDismiss: @escaping () -> Void) {
        self.item = item
        self.now = now
        self.onPrimary = onPrimary
        self.onDismiss = onDismiss
    }

    public var body: some View {
        let days = item.days(at: now, calendar: calendar)
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            HStack(alignment: .top, spacing: BFHRSpace.s3) {
                CompanyMonogram(item.company)
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    Text(verbatim: "\(item.company.name) · \(item.role)")
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(bfhrPlain: prompt(days: days))
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            ButtonPair {
                Button(action: onPrimary) { Text(primaryTitle) }
            } secondary: {
                Button(action: onDismiss) { Text(dismissTitle) }
            }
        }
        .accessibilityElement(children: .contain)
    }

    private func prompt(days: Int) -> LocalizedStringResource {
        switch item.kind {
        case .followUp: Strings.followUpPrompt(days: days)
        case .noResponse(_, let silentDays): Strings.noResponsePrompt(days: silentDays)
        }
    }

    private var primaryTitle: LocalizedStringResource {
        if case .followUp = item.kind { Strings.draftFollowUp } else { Strings.markNoResponse }
    }

    private var dismissTitle: LocalizedStringResource {
        if case .followUp = item.kind { Strings.notNow } else { Strings.keepWaiting }
    }
}

/// Snooze presets (decisions.md D19): Later today · Tomorrow · Next week · Pick a date…
public enum SnoozePreset: CaseIterable, Sendable {
    case laterToday
    case tomorrow
    case nextWeek

    /// Later today = +3 h (at most 21:00, else tomorrow 09:00); Tomorrow 09:00; Next week =
    /// Monday 09:00 (TR / DE weeks start Monday).
    public func date(from now: Date, calendar: Calendar) -> Date {
        let nineTomorrow = calendar.date(bySettingHour: 9, minute: 0, second: 0, of: calendar.date(byAdding: .day, value: 1, to: now) ?? now) ?? now
        switch self {
        case .laterToday:
            let later = now.addingTimeInterval(3 * 3600)
            let cutoff = calendar.date(bySettingHour: 21, minute: 0, second: 0, of: now) ?? later
            return later <= cutoff ? later : nineTomorrow
        case .tomorrow:
            return nineTomorrow
        case .nextWeek:
            let monday = calendar.nextDate(after: now, matching: DateComponents(hour: 9, minute: 0, weekday: 2), matchingPolicy: .nextTime) ?? nineTomorrow
            return monday
        }
    }

    public var label: LocalizedStringResource {
        switch self {
        case .laterToday: Strings.snoozeLaterToday
        case .tomorrow: Strings.snoozeTomorrow
        case .nextWeek: Strings.snoozeNextWeek
        }
    }
}

/// The snooze `Menu` (components.md `SnoozeMenu`). "Pick a date…" calls `onPickDate`, which
/// presents a `DatePicker` sheet owned by the screen.
public struct SnoozeMenu<Label: View>: View {
    private let now: Date
    private let onSnooze: (Date) -> Void
    private let onPickDate: () -> Void
    private let label: Label
    @Environment(\.calendar) private var calendar

    public init(now: Date, onSnooze: @escaping (Date) -> Void, onPickDate: @escaping () -> Void, @ViewBuilder label: () -> Label) {
        self.now = now
        self.onSnooze = onSnooze
        self.onPickDate = onPickDate
        self.label = label()
    }

    public var body: some View {
        Menu {
            ForEach(SnoozePreset.allCases, id: \.self) { preset in
                Button { onSnooze(preset.date(from: now, calendar: calendar)) } label: { Text(preset.label) }
            }
            Button(action: onPickDate) { Text(Strings.snoozePickDate) }
        } label: {
            label
        }
    }
}

/// One timeline row (components.md `Timeline`): system rows are one line (icon + sentence +
/// actor + time); automatic rows add the reason, "View source" and Undo or the "Can't undo" line.
public struct TimelineRow: View {
    private let entry: TimelineEntry
    private let onUndo: (() -> Void)?
    private let onViewSource: (() -> Void)?

    public init(_ entry: TimelineEntry, onUndo: (() -> Void)? = nil, onViewSource: (() -> Void)? = nil) {
        self.entry = entry
        self.onUndo = onUndo
        self.onViewSource = onViewSource
    }

    public var body: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Image(systemName: glyph)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .frame(width: BFHRIconSize.lg)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(sentence)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(entry.isReverted ? BFHRColor.Fg.tertiary : BFHRColor.Fg.primary)
                    .strikethrough(entry.isReverted, color: BFHRColor.Fg.tertiary)
                if let text = entry.text, !text.isEmpty {
                    Text(verbatim: text)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                if entry.isAutomatic, let reason = entry.reason {
                    Text(verbatim: reason)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                HStack(spacing: BFHRSpace.s2) {
                    SourceTag(entry.isAutomatic ? .automatic(entry.actor) : .user)
                    RelativeTimeText(entry.occurredAt, style: .time)
                        .font(.bfhr(.caption1))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
                if entry.isAutomatic, case .denied(.superseded) = entry.undo {
                    Text(Strings.cantUndo)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.tertiary)
                }
                if entry.isAutomatic, entry.mailMessageId != nil || entry.undo == .allowed {
                    HStack(spacing: BFHRSpace.s2) {
                        if entry.mailMessageId != nil, let onViewSource {
                            Button(action: onViewSource) { Text(Strings.viewSource) }.buttonStyle(.bfhrPlain)
                        }
                        if entry.undo == .allowed, let onUndo {
                            Button(action: onUndo) { Text(Strings.undo) }.buttonStyle(.bfhrPlain)
                        }
                    }
                    .padding(.leading, -BFHRSpace.s2)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    private var glyph: String {
        switch entry.kind {
        case .created: "plus.circle"
        case .statusChanged: entry.isAutomatic ? "envelope.badge" : "arrow.right.circle"
        case .reverted: "arrow.uturn.backward.circle"
        case .note: "note.text"
        case .mailReceived: "envelope"
        case .mailSent: "paperplane"
        case .interviewScheduled: "calendar"
        }
    }

    private var sentence: LocalizedStringResource {
        switch entry.kind {
        case .created: Strings.timelineCreated
        case .statusChanged(_, let to): Strings.timelineMoved(to: to)
        case .reverted(let to): Strings.timelineReverted(to: to)
        case .note: Strings.timelineNote
        case .mailReceived: Strings.timelineMailReceived
        case .mailSent: Strings.timelineMailSent
        case .interviewScheduled: Strings.timelineInterviewScheduled
        }
    }
}

/// A day header for the timeline ("Today", "Yesterday", "Mon 20 Oct").
public struct TimelineDayHeader: View {
    private let day: Date
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    public init(_ day: Date) {
        self.day = day
    }

    public var body: some View {
        let offset = DateText.dayOffset(of: day, from: now, calendar: calendar)
        let text = abs(offset) <= 1
            ? DateText.relativeDay(day, now: now, locale: locale, calendar: calendar)
            : day.formatted(Date.FormatStyle(locale: locale, calendar: calendar).weekday(.abbreviated).day().month(.abbreviated))
        Text(verbatim: text)
            .font(.bfhr(.footnote, emphasized: true))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .accessibilityAddTraits(.isHeader)
    }
}
