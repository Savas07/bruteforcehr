import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Application detail, pushed from a Pipeline row (tracker.md "Detail (push from row)"): header
/// with the status pill (tap = Move to…) and the one next step, the stage progress strip, a
/// no-response suggestion when due, interviews, the day-grouped timeline (automatic changes name
/// their source and reason, with Undo while it's still the latest move), details and contacts.
struct TrackerApplicationDetailScreen: View {
    let model: TrackerBoardModel
    let applicationId: String
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var sheet: TrackerSheet?
    @State private var errorCount = 0

    var body: some View {
        let detail = model.detail(for: applicationId)
        Group {
            if let detail {
                content(detail)
            } else {
                PaneError(LoadFailure(.notFound), title: TrackerBoardStrings.notFoundTitle, goBack: { dismiss() })
            }
        }
        .navigationTitle(Text(verbatim: detail?.header.company.name ?? ""))
        .bfhrInlineTitle()
        .toolbar {
            if let detail {
                ToolbarItem(placement: .bfhrTrailing) { actionsMenu(detail) }
            }
        }
        .sheet(item: $sheet) { sheet in
            TrackerMoveSheet(sheet: sheet, model: model) { status in
                self.sheet = nil
                run { try model.move(sheet.applicationId, to: status) }
            } onCancel: {
                self.sheet = nil
            }
        }
        .bfhrHaptic(.error, trigger: errorCount)
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
    }

    private func content(_ detail: ApplicationDetail) -> some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                DetailHeader(detail: detail, now: model.now) { sheet = .move(detail.id) }
            }
            Section {
                StageProgressStrip(steps: detail.progress)
            } header: {
                DetailSectionTitle(TrackerBoardStrings.progress)
            }
            // Follow-ups live on Today with their draft; the Tracker asks only about no response.
            let noResponse = detail.nudges.filter { if case .noResponse = $0.kind { true } else { false } }
            if !noResponse.isEmpty {
                Section {
                    ForEach(noResponse) { nudge in
                        NudgeCard(nudge, now: model.now) {
                            run { try model.markNoResponse(nudge) }
                        } onDismiss: {
                            toasts?.show(model.dismissNudge(nudge))
                        }
                    }
                } header: {
                    DetailSectionTitle(TrackerBoardStrings.suggestion)
                }
            }
            if !detail.interviews.isEmpty {
                Section {
                    ForEach(detail.interviews) { interview in
                        InterviewRow(interview: interview)
                    }
                } header: {
                    DetailSectionTitle(TrackerBoardStrings.interviews)
                }
            }
            ForEach(Array(detail.timeline.enumerated()), id: \.element.id) { index, day in
                Section {
                    ForEach(day.entries) { entry in
                        TimelineRow(
                            entry,
                            onUndo: entry.undo == .allowed ? { run { try model.undo(eventId: entry.id) } } : nil,
                            onViewSource: entry.mailMessageId.map { messageId in
                                { if let url = URL(string: "bruteforcehr://mail/review/\(messageId)") { openURL(url) } }
                            }
                        )
                    }
                } header: {
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        if index == 0 {
                            DetailSectionTitle(TrackerBoardStrings.activity)
                        }
                        TimelineDayHeader(day.day)
                    }
                }
            }
            DetailFacts(detail: detail)
            if !detail.contacts.isEmpty {
                Section {
                    ForEach(detail.contacts) { contact in
                        ContactRow(contact: contact)
                    }
                } header: {
                    DetailSectionTitle(TrackerBoardStrings.contacts)
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private func actionsMenu(_ detail: ApplicationDetail) -> some View {
        Menu {
            if let next = model.advanceTarget(for: detail.id) {
                Button { run { try model.move(detail.id, to: next) } } label: {
                    Label { Text(TrackerBoardStrings.moveTo(next)) } icon: { Image(systemName: "arrow.right") }
                }
            }
            Button { sheet = .move(detail.id) } label: {
                Label { Text(Strings.moveTo) } icon: { Image(systemName: "arrow.left.arrow.right") }
            }
            if detail.header.status.isActive {
                Button { sheet = .close(detail.id) } label: {
                    Label { Text(TrackerBoardStrings.closeApplication) } icon: { Image(systemName: "archivebox") }
                }
            }
        } label: {
            Label { Text(TrackerBoardStrings.actions) } icon: { Image(systemName: "ellipsis") }
        }
    }

    private func run(_ action: () throws -> ToastItem?) {
        do {
            if let item = try action() { toasts?.show(item) }
        } catch {
            errorCount += 1
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: TrackerBoardStrings.moveError(error)))
        }
    }
}

// MARK: - Parts

/// `RecordHeader`: monogram, role, company · location, the status pill (tap = Move to…) with
/// when it last moved, and the one next step.
private struct DetailHeader: View {
    let detail: ApplicationDetail
    let now: Date
    let onStatusTap: () -> Void
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let header = detail.header
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            HStack(alignment: .top, spacing: BFHRSpace.s3) {
                // Decorative: at accessibility sizes it would squeeze the role into syllables.
                if !dynamicTypeSize.isAccessibilitySize {
                    CompanyMonogram(header.company)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(verbatim: header.role)
                        .font(.bfhr(.title3, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .accessibilityAddTraits(.isHeader)
                    Text(verbatim: [header.company.name, header.location].compactMap { $0 }.joined(separator: " · "))
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                ViewThatFits(in: .horizontal) {
                    HStack(spacing: BFHRSpace.s2) { pill; lastMoved }
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) { pill; lastMoved }
                }
                if header.lastMoveAutomatic {
                    // The source of an automatic move, up front (trust principle); the timeline
                    // below has the reason and Undo.
                    Label { Text(TrackerBoardStrings.autoMoved) } icon: { Image(systemName: "envelope") }
                        .labelStyle(.bfhrCompact)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            if detail.nextStep != .none {
                VStack(alignment: .leading, spacing: 2) {
                    Text(TrackerBoardStrings.nextStep)
                        .font(.bfhr(.footnote, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                    NextStepLine(step: detail.nextStep)
                        .font(.bfhr(.subheadline))
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    private var pill: some View {
        StatusPill(detail.header.status, isPendingSync: detail.header.pendingSync, onTap: onStatusTap)
    }

    private var lastMoved: some View {
        Text(TrackerBoardStrings.lastMoved(DateText.relativeDay(detail.header.statusChangedAt, now: now, locale: locale, calendar: calendar)))
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
    }
}

/// `StageProgressStrip`: past ✓ / current ◉ / future ○ as a dotted rail, with the current stage
/// and the next one in words. Closed applications end with their outcome in its grey tone.
private struct StageProgressStrip: View {
    let steps: [ApplicationDetail.StageStep]
    @ScaledMetric(relativeTo: .footnote) private var dot: CGFloat = 10
    @ScaledMetric(relativeTo: .footnote) private var currentDot: CGFloat = 16

    var body: some View {
        let currentIndex = steps.firstIndex { $0.state == .current } ?? 0
        let current = steps.indices.contains(currentIndex) ? steps[currentIndex] : nil
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            HStack(spacing: 0) {
                ForEach(Array(steps.enumerated()), id: \.element.id) { index, step in
                    marker(step)
                    if index < steps.count - 1 {
                        Rectangle()
                            .fill(steps[index + 1].state == .upcoming ? BFHRColor.Line.subtle : step.status.tone.solid)
                            .frame(height: BFHRBorderWidth.thick)
                            .frame(maxWidth: .infinity)
                    }
                }
            }
            .frame(minHeight: currentDot)
            .accessibilityHidden(true)
            if let current {
                VStack(alignment: .leading, spacing: 2) {
                    Group {
                        if current.isOutcome {
                            Text(current.status.label)
                        } else {
                            Text(TrackerBoardStrings.progressStep(current.status, step: currentIndex + 1, of: steps.count))
                        }
                    }
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(current.status.tone.text)
                    if let next = steps.first(where: { $0.state == .upcoming }) {
                        Text(TrackerBoardStrings.nextStage(next.status))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    @ViewBuilder
    private func marker(_ step: ApplicationDetail.StageStep) -> some View {
        switch step.state {
        case .done:
            Circle().fill(step.status.tone.solid).frame(width: dot, height: dot)
        case .current:
            Circle()
                .fill(step.status.tone.subtle)
                .overlay(Circle().strokeBorder(step.status.tone.solid, lineWidth: BFHRBorderWidth.thick))
                .frame(width: currentDot, height: currentDot)
        case .upcoming:
            Circle().strokeBorder(BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin).frame(width: dot, height: dot)
        }
    }
}

private struct InterviewRow: View {
    let interview: Interview

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: interview.title)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
            HStack(spacing: BFHRSpace.s1) {
                Text(TrackerBoardStrings.round(interview.round))
                Text(verbatim: "·").accessibilityHidden(true)
                RelativeTimeText(interview.startsAt, style: .dayAndTime)
            }
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
    }
}

/// Applied via, Applied, CV, Cover letter, Found on: only the facts that exist. Label and value
/// sit side by side and stack when they don't fit (German, AX sizes).
private struct DetailFacts: View {
    let detail: ApplicationDetail
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        let header = detail.header
        if header.channel != nil || header.appliedAt != nil || detail.cv != nil || detail.coverLetter != nil || header.source != nil {
            Section {
                if let channel = header.channel {
                    FactRow(Strings.fieldChannel, value: Text(channel.label))
                }
                if let appliedAt = header.appliedAt {
                    FactRow(Strings.fieldApplied, value: Text(verbatim: DateText.relativeDay(appliedAt, now: now, locale: locale, calendar: calendar)))
                }
                if let cv = detail.cv {
                    FactRow(Strings.fieldCV, value: Text(verbatim: cv.title))
                }
                if let coverLetter = detail.coverLetter {
                    FactRow(Strings.fieldCoverLetter, value: Text(verbatim: coverLetter.title))
                }
                if let source = header.source {
                    FactRow(TrackerBoardStrings.foundOn, value: Text(verbatim: source.capitalized))
                }
            } header: {
                DetailSectionTitle(TrackerBoardStrings.details)
            }
        }
    }
}

private struct FactRow: View {
    let label: LocalizedStringResource
    let value: Text

    init(_ label: LocalizedStringResource, value: Text) {
        self.label = label
        self.value = value
    }

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
                title
                Spacer(minLength: BFHRSpace.s2)
                value.foregroundStyle(BFHRColor.Fg.secondary).multilineTextAlignment(.trailing)
            }
            VStack(alignment: .leading, spacing: 2) {
                title
                value.foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
        .font(.bfhr(.body))
        .frame(minHeight: BFHRHitTarget.minimum)
        .accessibilityElement(children: .combine)
    }

    private var title: some View {
        Text(label).foregroundStyle(BFHRColor.Fg.primary)
    }
}

/// A detail section title: the same weight and color as the timeline's day headers, so the
/// grouped list reads as one hierarchy (the system header grey is lighter than our secondary).
private struct DetailSectionTitle: View {
    let title: LocalizedStringResource

    init(_ title: LocalizedStringResource) {
        self.title = title
    }

    var body: some View {
        Text(title)
            .font(.bfhr(.subheadline, emphasized: true))
            .foregroundStyle(BFHRColor.Fg.secondary)
            .textCase(nil)
            .accessibilityAddTraits(.isHeader)
    }
}

private struct ContactRow: View {
    let contact: Contact

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: contact.name)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                if let role = contact.role {
                    Text(verbatim: role)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            if let email = contact.email, let url = URL(string: "mailto:\(email)") {
                Link(destination: url) {
                    Label { Text(verbatim: email) } icon: { Image(systemName: "envelope") }
                        .labelStyle(.bfhrCompact)
                        .font(.bfhr(.subheadline))
                        .frame(minHeight: BFHRHitTarget.minimum, alignment: .leading)
                        .contentShape(Rectangle())
                }
                .foregroundStyle(BFHRColor.Fg.link)
                .accessibilityLabel(Text(TrackerBoardStrings.emailContact(contact.name)))
                .accessibilityHint(Text(verbatim: email))
            }
        }
        .padding(.top, BFHRSpace.s1)
    }
}
