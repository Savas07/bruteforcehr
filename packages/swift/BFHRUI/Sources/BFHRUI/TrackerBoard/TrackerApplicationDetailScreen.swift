import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Application detail, pushed from a Pipeline row, a Calendar row or a link (tracker.md "Detail
/// (push from row)"): the header with the status pill (tap = Move to…) and the one next step, the
/// reminder, the stage progress strip, a suggestion when due, interview rounds (editor, prep
/// reminder, Add to Calendar), the day-grouped timeline (automatic changes name their source and
/// reason, with Undo while it's still the latest move), notes, contacts, documents and details.
struct TrackerApplicationDetailScreen: View {
    let model: TrackerBoardModel
    let applicationId: String
    /// Scrolls to this round on appear (`bruteforcehr://interviews/{id}`, a prep notification).
    var focusInterviewId: String?
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var sheet: TrackerSheet?
    @State private var editor: DetailEditor?
    @State private var explainer: LocalReminderPreview?
    @State private var sharing: InterviewCalendarFile?
    @State private var confirmsDelete = false
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
        .sheet(item: $editor) { editor in
            editorSheet(editor)
        }
        .sheet(item: $explainer) { preview in
            NotificationExplainerSheet(preview: preview) {
                explainer = nil
                Task { await model.requestNotifications() }
            } onNotNow: {
                explainer = nil
            }
        }
        .sheet(item: $sharing) { file in
            InterviewShareSheet(file: file)
        }
        .confirmationDialog(Text(TrackerBoardStrings.deleteApplication), isPresented: $confirmsDelete, titleVisibility: .visible) {
            Button(role: .destructive) {
                run { try model.deleteApplication(applicationId) }
                dismiss()
            } label: {
                Text(TrackerBoardStrings.deleteApplication)
            }
        } message: {
            Text(TrackerBoardStrings.deleteMessage)
        }
        .bfhrHaptic(.error, trigger: errorCount)
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
    }

    // MARK: Content

    private func content(_ detail: ApplicationDetail) -> some View {
        ScrollViewReader { proxy in
            List {
                ConnectionBannerSection(model.connection)
                Section {
                    DetailHeader(detail: detail, now: model.now) { sheet = .move(detail.id) }
                }
                reminderSection(detail)
                Section {
                    StageProgressStrip(steps: detail.progress)
                } header: {
                    DetailSectionTitle(TrackerBoardStrings.progress)
                }
                suggestionSection(detail)
                interviewSection(detail)
                timelineSections(detail)
                notesSection(detail)
                contactSection(detail)
                documentSection(detail)
                DetailFacts(detail: detail)
                Section {
                    Button(role: .destructive) { confirmsDelete = true } label: {
                        Text(TrackerBoardStrings.deleteApplication)
                            .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                    }
                    .accessibilityIdentifier("detail.delete")
                }
            }
            .bfhrInsetGroupedList()
            .onAppear {
                #if DEBUG
                openDesignPane(detail)
                #endif
                guard let focusInterviewId else { return }
                Task {
                    try? await Task.sleep(for: .milliseconds(350))
                    withAnimation { proxy.scrollTo(focusInterviewId, anchor: .top) }
                }
            }
        }
    }

    // MARK: Reminder

    @ViewBuilder
    private func reminderSection(_ detail: ApplicationDetail) -> some View {
        Section {
            if let reminder = detail.reminder {
                Button { editReminder(detail) } label: {
                    ReminderRow(reminder: reminder, pendingSync: detail.header.pendingSync)
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text(TrackerBoardStrings.editReminder))
                .bfhrRowActions([
                    RowAction(TrackerBoardStrings.reminderDone, systemImage: "checkmark", edge: .leading, haptic: .confirm) {
                        run { try model.clearReminder(detail.id) }
                    },
                    RowAction(TrackerBoardStrings.editReminder, systemImage: "pencil", edge: .menuOnly) { editReminder(detail) },
                ])
                .accessibilityIdentifier("detail.reminder")
            } else if detail.header.status.isActive {
                GhostRow(TrackerBoardStrings.setReminder) { editReminder(detail) }
                    .accessibilityIdentifier("detail.setReminder")
            }
        } header: {
            if detail.reminder != nil || detail.header.status.isActive {
                DetailSectionTitle(TrackerBoardStrings.reminder)
            }
        }
    }

    private func editReminder(_ detail: ApplicationDetail, followUp: Bool = false) {
        let draft = model.reminderDraft(for: detail.id, followUp: followUp)
        editor = .reminder(ReminderDraft(
            applicationId: detail.id,
            text: draft.text,
            dueAt: draft.dueAt,
            exists: detail.reminder != nil && !followUp
        ))
    }

    // MARK: Suggestion

    @ViewBuilder
    private func suggestionSection(_ detail: ApplicationDetail) -> some View {
        if !detail.nudges.isEmpty {
            Section {
                ForEach(detail.nudges) { nudge in
                    switch nudge.kind {
                    case .followUp:
                        // Compose arrives with mail sending (M5); until then the follow-up becomes
                        // a reminder the user sets.
                        NudgeCard(nudge, now: model.now, primaryTitle: TrackerBoardStrings.setFollowUpReminder) {
                            editReminder(detail, followUp: true)
                        } onDismiss: {
                            toasts?.show(model.dismissNudge(nudge))
                        }
                    case .noResponse:
                        NudgeCard(nudge, now: model.now) {
                            run { try model.markNoResponse(nudge) }
                        } onDismiss: {
                            toasts?.show(model.dismissNudge(nudge))
                        }
                    }
                }
            } header: {
                DetailSectionTitle(TrackerBoardStrings.suggestion)
            }
        }
    }

    // MARK: Interviews

    @ViewBuilder
    private func interviewSection(_ detail: ApplicationDetail) -> some View {
        Section {
            ForEach(detail.interviews) { item in
                Button { editor = .interview(item.interview) } label: {
                    InterviewRow(item: item)
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text(TrackerBoardStrings.edit))
                .bfhrRowActions(interviewActions(item))
                .id(item.id)
            }
            if detail.header.status.isActive {
                GhostRow(TrackerBoardStrings.addInterview) { editor = .interview(model.newInterview(for: detail.id)) }
                    .accessibilityIdentifier("detail.addInterview")
            }
        } header: {
            if !detail.interviews.isEmpty || detail.header.status.isActive {
                DetailSectionTitle(TrackerBoardStrings.interviews)
            }
        }
    }

    private func interviewActions(_ item: ApplicationDetail.InterviewItem) -> [RowAction] {
        let interview = item.interview
        var actions = [
            RowAction(TrackerBoardStrings.addToCalendar, systemImage: "calendar.badge.plus", edge: .leading, id: "ics") {
                sharing = model.calendarFile(for: interview)
            },
            RowAction(TrackerBoardStrings.edit, systemImage: "pencil", edge: .menuOnly) { editor = .interview(interview) },
            RowAction(TrackerBoardStrings.remove, systemImage: "trash", edge: .trailing, role: .destructive) {
                run { try model.deleteInterview(interview.id) }
            },
        ]
        if !item.isPast, let link = interview.meetingUrl.flatMap(URL.init(string:)) {
            actions.insert(RowAction(TrackerBoardStrings.joinCall, systemImage: "video", edge: .menuOnly) { openURL(link) }, at: 1)
        }
        return actions
    }

    // MARK: Timeline

    @ViewBuilder
    private func timelineSections(_ detail: ApplicationDetail) -> some View {
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
    }

    // MARK: Notes, contacts, documents

    private func notesSection(_ detail: ApplicationDetail) -> some View {
        Section {
            Button { editor = .notes(detail.notes) } label: {
                Group {
                    if detail.notes.isEmpty {
                        Text(TrackerBoardStrings.notesPlaceholder)
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    } else {
                        Text(verbatim: detail.notes)
                            .foregroundStyle(BFHRColor.Fg.primary)
                    }
                }
                .font(.bfhr(.body))
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(TrackerBoardStrings.notesLabel))
            .accessibilityValue(Text(verbatim: detail.notes))
            .accessibilityHint(Text(TrackerBoardStrings.edit))
            .accessibilityIdentifier("detail.notes")
        } header: {
            DetailSectionTitle(TrackerBoardStrings.notes)
        }
    }

    private func contactSection(_ detail: ApplicationDetail) -> some View {
        Section {
            ForEach(detail.contacts) { contact in
                ContactRow(contact: contact)
                    .bfhrRowActions([
                        RowAction(TrackerBoardStrings.edit, systemImage: "pencil", edge: .menuOnly) { editor = .contact(contact) },
                        RowAction(TrackerBoardStrings.removeContact, systemImage: "person.badge.minus", edge: .trailing) {
                            run { try model.removeContact(contact.id, from: detail.id) }
                        },
                    ])
                    .onTapGesture { editor = .contact(contact) }
            }
            GhostRow(TrackerBoardStrings.addContact) { editor = .contact(model.newContact(for: detail.id)) }
                .accessibilityIdentifier("detail.addContact")
        } header: {
            DetailSectionTitle(TrackerBoardStrings.contacts)
        }
    }

    private func documentSection(_ detail: ApplicationDetail) -> some View {
        Section {
            if detail.cv == nil && detail.coverLetter == nil {
                Text(TrackerBoardStrings.noDocuments)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let cv = detail.cv {
                Button {
                    if let url = URL(string: "bruteforcehr://cvs/\(cv.id)") { openURL(url) }
                } label: {
                    FactRow(Strings.fieldCV, value: Text(verbatim: cv.title))
                }
                .buttonStyle(.plain)
                .accessibilityHint(Text(TrackerBoardStrings.openCV))
            }
            if let coverLetter = detail.coverLetter {
                FactRow(Strings.fieldCoverLetter, value: Text(verbatim: coverLetter.title))
            }
        } header: {
            DetailSectionTitle(TrackerBoardStrings.documents)
        }
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
            Divider()
            Button(role: .destructive) { confirmsDelete = true } label: {
                Label { Text(TrackerBoardStrings.deleteApplication) } icon: { Image(systemName: "trash") }
            }
        } label: {
            Label { Text(TrackerBoardStrings.actions) } icon: { Image(systemName: "ellipsis") }
        }
    }

    // MARK: Editors

    @ViewBuilder
    private func editorSheet(_ editor: DetailEditor) -> some View {
        switch editor {
        case .reminder(let draft):
            ReminderEditorSheet(draft: draft, authorization: model.notificationAuthorization, usesNotifications: model.reminderScheduler != nil) { text, date in
                self.editor = nil
                run { try model.setReminder(draft.applicationId, text: text, at: date) }
                offerNotifications(title: text, at: date, company: detail?.header.company.name)
            } onRemove: {
                self.editor = nil
                run { try model.clearReminder(draft.applicationId) }
            } onCancel: {
                self.editor = nil
            }
        case .interview(let interview):
            InterviewEditorSheet(
                interview: interview,
                isNew: model.isNewInterview(interview.id),
                prep: model.interviewPrep[interview.id],
                company: detail?.header.company.name ?? ""
            ) { saved, prep in
                self.editor = nil
                toasts?.show(model.saveInterview(saved))
                if prep != model.interviewPrep[saved.id] {
                    model.setPrep(prep, for: saved.id)
                    if let prep {
                        offerNotifications(
                            title: String(localized: TrackerBoardStrings.prepNotificationTitle(detail?.header.company.name ?? "")),
                            at: saved.startsAt.addingTimeInterval(-prep.interval),
                            company: saved.title
                        )
                    }
                }
            } onRemove: {
                self.editor = nil
                run { try model.deleteInterview(interview.id) }
            } onCancel: {
                self.editor = nil
            }
        case .contact(let contact):
            ContactEditorSheet(contact: contact, isNew: model.isNewContact(contact.id)) { saved in
                self.editor = nil
                toasts?.show(model.saveContact(saved))
            } onRemove: {
                self.editor = nil
                run { try model.removeContact(contact.id, from: applicationId) }
            } onCancel: {
                self.editor = nil
            }
        case .notes(let notes):
            NotesEditorSheet(notes: notes, company: detail?.header.company.name ?? "") { text in
                self.editor = nil
                run { try model.setNotes(applicationId, notes: text); return nil }
            } onCancel: {
                self.editor = nil
            }
        }
    }

    private var detail: ApplicationDetail? { model.detail(for: applicationId) }

    #if DEBUG
    /// `-BFHRTrackerPane reminder|interview|contact|notes|explainer|share` (design mode).
    private func openDesignPane(_ detail: ApplicationDetail) {
        guard let pane = TrackerDesignPane.takeDetailPane() else { return }
        switch pane {
        case .reminder: editReminder(detail)
        case .interview: editor = .interview(detail.interviews.first?.interview ?? model.newInterview(for: detail.id))
        case .contact: editor = .contact(detail.contacts.first ?? model.newContact(for: detail.id))
        case .notes: editor = .notes(detail.notes)
        case .explainer:
            explainer = LocalReminderPreview(
                title: detail.reminder?.text ?? String(localized: TrackerBoardStrings.followUpReminderText(detail.header.company.name)),
                subtitle: "\(detail.header.company.name) · \(detail.header.role)",
                at: detail.reminder?.dueAt
            )
        case .share:
            if let interview = detail.interviews.first?.interview { sharing = model.calendarFile(for: interview) }
        case .detail, .calendar, .calendarPast, .add: break
        }
    }
    #endif

    /// The permission explainer the first time a reminder is set (decisions.md D36).
    private func offerNotifications(title: String, at date: Date?, company: String?) {
        guard model.takeNotificationExplainer() else { return }
        Task {
            // After the editor's dismissal, so the two sheets don't collide.
            try? await Task.sleep(for: .milliseconds(450))
            explainer = LocalReminderPreview(title: title, subtitle: company, at: date)
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

/// The editor sheet open over the detail.
enum DetailEditor: Identifiable {
    case reminder(ReminderDraft)
    case interview(Interview)
    case contact(Contact)
    case notes(String)

    var id: String {
        switch self {
        case .reminder(let draft): "reminder.\(draft.applicationId)"
        case .interview(let interview): "interview.\(interview.id)"
        case .contact(let contact): "contact.\(contact.id)"
        case .notes: "notes"
        }
    }
}

/// The reminder editor's input.
struct ReminderDraft: Hashable {
    var applicationId: String
    var text: String
    var dueAt: Date
    /// Editing an existing reminder (offers Remove).
    var exists: Bool
}

/// The reminder just set, previewed in the permission explainer as the notification it becomes.
struct LocalReminderPreview: Identifiable, Hashable {
    var title: String
    var subtitle: String?
    var at: Date?
    var id: String { title + (at?.description ?? "") }
}

// MARK: - Rows

/// The reminder: bell, what to do, when; "Overdue" in the amber tone once its time has passed
/// (never red).
private struct ReminderRow: View {
    let reminder: ApplicationDetail.Reminder
    let pendingSync: Bool
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @ScaledMetric(relativeTo: .body) private var glyphColumn = BFHRIconSize.lg

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
            Image(systemName: "bell")
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .frame(width: glyphColumn)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: reminder.text)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                HStack(spacing: BFHRSpace.s2) {
                    if let dueAt = reminder.dueAt {
                        Text(verbatim: DateText.dayAndTime(dueAt, now: now, locale: locale, calendar: calendar))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    if reminder.isOverdue {
                        Text(TrackerBoardStrings.overdue)
                            .font(.bfhr(.footnote, emphasized: true))
                            .foregroundStyle(BFHRTone.warning.text)
                    }
                    if pendingSync { SyncGlyph() }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(.vertical, BFHRSpace.s1)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// One interview round: title, type · round, when, interviewers, the prep reminder; "Done" once
/// it has ended.
private struct InterviewRow: View {
    let item: ApplicationDetail.InterviewItem
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        let interview = item.interview
        VStack(alignment: .leading, spacing: 2) {
            Text(verbatim: interview.title.isEmpty ? String(localized: interview.kind.label) : interview.title)
                .font(.bfhr(.body))
                .foregroundStyle(item.isPast ? BFHRColor.Fg.secondary : BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
            // One Text, so it wraps as a sentence and the "·" isn't a lone glyph.
            Text("\(Text(interview.kind.label)) · \(Text(TrackerBoardStrings.round(interview.round))) · \(DateText.dayAndTime(interview.startsAt, now: now, locale: locale, calendar: calendar))")
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .fixedSize(horizontal: false, vertical: true)
            if !interview.people.isEmpty {
                Text(verbatim: interview.people.map(\.name).joined(separator: ", "))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            HStack(spacing: BFHRSpace.s2) {
                if item.isPast {
                    Label { Text(TrackerBoardStrings.pastRound) } icon: { Image(systemName: "checkmark") }
                        .labelStyle(.bfhrCompact)
                } else if let prep = item.prep {
                    Label { Text(TrackerBoardStrings.prepAt(prep)) } icon: { Image(systemName: "bell") }
                        .labelStyle(.bfhrCompact)
                }
                if item.pendingSync { SyncGlyph() }
            }
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRColor.Fg.secondary)
        }
        .padding(.vertical, 2)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }
}

/// Applied via, Applied, Found on: only the facts that exist. Label and value sit side by side
/// and stack at accessibility sizes.
private struct DetailFacts: View {
    let detail: ApplicationDetail
    @Environment(\.bfhrNow) private var now
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar

    var body: some View {
        let header = detail.header
        if header.channel != nil || header.appliedAt != nil || header.source != nil {
            Section {
                if let channel = header.channel {
                    FactRow(Strings.fieldChannel, value: Text(channel.label))
                }
                if let appliedAt = header.appliedAt {
                    FactRow(Strings.fieldApplied, value: Text(verbatim: DateText.relativeDay(appliedAt, now: now, locale: locale, calendar: calendar)))
                }
                if let source = header.source {
                    FactRow(TrackerBoardStrings.foundOn, value: source == "manual" ? Text(TrackerBoardStrings.sourceManual) : Text(verbatim: source.capitalized))
                }
            } header: {
                DetailSectionTitle(TrackerBoardStrings.details)
            }
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
                // Stacked at accessibility sizes (by text size, not ViewThatFits; see FactRow).
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) { pill; lastMoved }
                } else {
                    HStack(spacing: BFHRSpace.s2) { pill; lastMoved }
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

private struct FactRow: View {
    let label: LocalizedStringResource
    let value: Text
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(_ label: LocalizedStringResource, value: Text) {
        self.label = label
        self.value = value
    }

    /// Side by side up to the largest standard size (a long value wraps under itself), stacked at
    /// accessibility sizes. Chosen by text size, not by `ViewThatFits`, which the accessibility
    /// audit reports as Dynamic Type unsupported.
    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 2) {
                    title
                    value.foregroundStyle(BFHRColor.Fg.secondary)
                }
            } else {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s3) {
                    title
                    Spacer(minLength: BFHRSpace.s2)
                    value.foregroundStyle(BFHRColor.Fg.secondary).multilineTextAlignment(.trailing)
                }
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

    // Texts take their full height (`fixedSize` vertical), so the row grows with Dynamic Type
    // instead of clipping; the audit flagged the last list row as clippable.
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: contact.name)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let role = contact.role {
                    Text(verbatim: role)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .accessibilityElement(children: .combine)
            if let email = contact.email, let url = URL(string: "mailto:\(email)") {
                Link(destination: url) {
                    Label {
                        Text(verbatim: email).fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: "envelope")
                    }
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
        .padding(.vertical, BFHRSpace.s1)
    }
}
