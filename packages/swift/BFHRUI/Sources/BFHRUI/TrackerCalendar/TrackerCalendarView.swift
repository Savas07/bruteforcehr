import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Tracker › Calendar on iPhone (decisions.md D09, D37): a dated agenda, not a grid (Joi's day
/// agenda, Posh's date headers, Luma's Upcoming / Past). Interviews with their time, the user's
/// reminders, suggested follow-ups and email deadlines, each with an icon and a label (never color
/// alone). Rows push the Application detail; interviews offer Add to Calendar (.ics).
struct TrackerCalendarView: View {
    @Bindable var model: TrackerBoardModel
    @Binding var scope: AgendaScope
    /// Pushes the Application detail.
    let onOpen: (String) -> Void
    /// Add to Calendar (.ics) for a round.
    let onShare: (Interview) -> Void

    var body: some View {
        let days = model.agenda(scope)
        List {
            ConnectionBannerSection(model.connection)
            Section {
                Picker(selection: $scope) {
                    ForEach(AgendaScope.allCases) { scope in Text(scope.label).tag(scope) }
                } label: {
                    Text(TrackerCalendarStrings.scopeLabel)
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .accessibilityLabel(Text(TrackerCalendarStrings.scopeLabel))
                .accessibilityIdentifier("calendar.scope")
                .listRowSeparator(.hidden)
            }
            if days.isEmpty {
                Section {
                    EmptyState(
                        .subArea,
                        glyph: "calendar",
                        title: scope == .upcoming ? TrackerCalendarStrings.emptyUpcoming : TrackerCalendarStrings.emptyPast
                    )
                    .listRowSeparator(.hidden)
                }
            }
            ForEach(days) { day in
                Section {
                    ForEach(day.items) { item in
                        Button { onOpen(item.applicationId) } label: {
                            AgendaRow(item: item)
                        }
                        .buttonStyle(.plain)
                        .accessibilityHint(Text(TrackerCalendarStrings.openHint))
                        .bfhrRowActions(actions(for: item))
                    }
                } header: {
                    TimelineDayHeader(day.day)
                        .textCase(nil)
                }
            }
        }
        .listStyle(.plain)
        .accessibilityIdentifier("tracker.calendar")
    }

    private func actions(for item: AgendaItem) -> [RowAction] {
        var actions = [
            RowAction(TrackerCalendarStrings.openApplication, systemImage: "rectangle.split.3x1", edge: .menuOnly) {
                onOpen(item.applicationId)
            },
        ]
        if case .interview(let interview, _) = item.kind {
            actions.insert(RowAction(TrackerBoardStrings.addToCalendar, systemImage: "calendar.badge.plus", edge: .leading, id: "ics") {
                onShare(interview)
            }, at: 0)
        }
        return actions
    }
}

/// One agenda row: icon by type, what it is, the application, and the time (none for all-day).
private struct AgendaRow: View {
    let item: AgendaItem
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ScaledMetric(relativeTo: .body) private var glyphColumn = BFHRIconSize.lg

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            Image(systemName: glyph)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .frame(width: glyphColumn)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(kindLabel)
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Text(verbatim: title)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(verbatim: "\(item.company.name) · \(item.role)")
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                if dynamicTypeSize.isAccessibilitySize { meta }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            if !dynamicTypeSize.isAccessibilitySize { meta }
        }
        .padding(.vertical, BFHRSpace.s1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder private var meta: some View {
        HStack(spacing: BFHRSpace.s1) {
            if item.pendingSync { SyncGlyph() }
            if case .reminder(_, true) = item.kind {
                Text(TrackerBoardStrings.overdue)
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRTone.warning.text)
            } else if !item.isAllDay {
                Text(verbatim: DateText.time(item.at, locale: locale, calendar: calendar))
                    .font(.bfhr(.subheadline))
                    .monospacedDigit()
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
    }

    private var glyph: String {
        switch item.kind {
        case .interview: "person.2"
        case .reminder: "bell"
        case .followUp: "envelope.arrow.triangle.branch"
        case .deadline: "hourglass"
        }
    }

    private var kindLabel: LocalizedStringResource {
        switch item.kind {
        case .interview(let interview, _): TrackerCalendarStrings.interviewKind(interview.kind, round: interview.round)
        case .reminder: TrackerCalendarStrings.reminder
        case .followUp: TrackerCalendarStrings.followUp
        case .deadline(let kind, _): kind == .assessmentDeadline ? TrackerCalendarStrings.assessmentDue : TrackerCalendarStrings.replyBy
        }
    }

    private var title: String {
        switch item.kind {
        case .interview(let interview, _): interview.title.isEmpty ? item.role : interview.title
        case .reminder(let text, _): text
        case .followUp: String(localized: TrackerCalendarStrings.followUpTitle(item.company.name))
        case .deadline(_, let label): label
        }
    }
}

extension AgendaScope {
    var label: LocalizedStringResource {
        switch self {
        case .upcoming: TrackerCalendarStrings.upcoming
        case .past: TrackerCalendarStrings.past
        }
    }
}
