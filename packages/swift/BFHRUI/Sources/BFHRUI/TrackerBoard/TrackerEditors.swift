import BFHRCore
import BFHRDesignTokens
import SwiftUI

// The Application detail's editors: reminder, interview round, contact and notes, plus the
// notification permission explainer. Native grouped forms in sheets with Cancel / Save (Fi
// "Edit Details", Flighty "Add Missing Flight"); labels stay visible above the values
// (`TrackerFormField`); Save is enabled once the required field is filled and invalid input says
// why under the field.

// MARK: - Reminder

struct ReminderEditorSheet: View {
    let draft: ReminderDraft
    let authorization: ReminderAuthorization
    /// The app schedules notifications (false in design mode and tests).
    let usesNotifications: Bool
    let onSave: (String, Date) -> Void
    let onRemove: () -> Void
    let onCancel: () -> Void
    @State private var text: String
    @State private var dueAt: Date
    @Environment(\.openURL) private var openURL
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(
        draft: ReminderDraft,
        authorization: ReminderAuthorization,
        usesNotifications: Bool,
        onSave: @escaping (String, Date) -> Void,
        onRemove: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.draft = draft
        self.authorization = authorization
        self.usesNotifications = usesNotifications
        self.onSave = onSave
        self.onRemove = onRemove
        self.onCancel = onCancel
        _text = State(initialValue: draft.text)
        _dueAt = State(initialValue: draft.dueAt)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TrackerFormField(TrackerBoardStrings.reminderWhat, text: $text)
                        .accessibilityIdentifier("reminder.text")
                    DatePicker(selection: $dueAt) { Text(TrackerBoardStrings.reminderWhen) }
                        .accessibilityIdentifier("reminder.date")
                } footer: {
                    if authorization == .denied {
                        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                            Text(TrackerBoardStrings.notificationsOff)
                            #if os(iOS)
                            Button { if let url = URL(string: UIApplication.openSettingsURLString) { openURL(url) } } label: {
                                Text(TrackerBoardStrings.openSettings)
                            }
                            .buttonStyle(.bfhrPlain)
                            .padding(.leading, -BFHRSpace.s2)
                            #endif
                        }
                        .foregroundStyle(BFHRColor.Fg.secondary)
                    } else if usesNotifications {
                        Text(TrackerBoardStrings.reminderNotify)
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                if draft.exists {
                    Section {
                        TrackerDestructiveRow(TrackerBoardStrings.removeReminder, action: onRemove)
                    }
                }
            }
            .navigationTitle(Text(TrackerBoardStrings.reminderTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) { Text(TrackerBoardStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { onSave(text, dueAt) } label: { Text(TrackerBoardStrings.save) }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        .accessibilityIdentifier("reminder.save")
                }
            }
        }
        .presentationDetents(dynamicTypeSize.isAccessibilitySize ? [.large] : [.medium, .large])
        .presentationBackground(BFHRColor.groupedBackground)
    }
}

// MARK: - Interview

struct InterviewEditorSheet: View {
    let isNew: Bool
    let company: String
    let onSave: (Interview, InterviewPrepLead?) -> Void
    let onRemove: () -> Void
    let onCancel: () -> Void
    @State private var interview: Interview
    @State private var prep: InterviewPrepLead?
    @State private var meetingURL: String
    @State private var location: String
    @State private var showsErrors = false

    /// Lengths offered in the picker (minutes).
    private static let durations = [15, 30, 45, 60, 90, 120, 180, 240]

    init(
        interview: Interview,
        isNew: Bool,
        prep: InterviewPrepLead?,
        company: String,
        onSave: @escaping (Interview, InterviewPrepLead?) -> Void,
        onRemove: @escaping () -> Void,
        onCancel: @escaping () -> Void
    ) {
        self.isNew = isNew
        self.company = company
        self.onSave = onSave
        self.onRemove = onRemove
        self.onCancel = onCancel
        _interview = State(initialValue: interview)
        _prep = State(initialValue: prep)
        _meetingURL = State(initialValue: interview.meetingUrl ?? "")
        _location = State(initialValue: interview.location ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TrackerFormField(TrackerBoardStrings.fieldTitle, text: $interview.title, prompt: TrackerBoardStrings.fieldTitlePlaceholder)
                        .accessibilityIdentifier("interview.title")
                    if showsErrors && titleMissing {
                        TrackerFieldError(TrackerBoardStrings.titleRequired)
                    }
                    TrackerPickerRow(TrackerBoardStrings.fieldKind, selection: $interview.kind, options: InterviewKind.allCases) { Text($0.label) }
                    Stepper(value: $interview.round, in: 1...20) {
                        Text("\(Text(TrackerBoardStrings.fieldRound)): \(interview.round)")
                    }
                }
                Section {
                    DatePicker(selection: $interview.startsAt) { Text(TrackerBoardStrings.fieldStarts) }
                        .accessibilityIdentifier("interview.starts")
                    TrackerPickerRow(TrackerBoardStrings.fieldDuration, selection: $interview.durationMinutes, options: durations) { Text(TrackerBoardStrings.minutes($0)) }
                    TrackerPickerRow(TrackerBoardStrings.fieldTimeZone, selection: $interview.timezone, options: timeZones) { Text(verbatim: zoneLabel($0)) }
                    TrackerFormField(TrackerBoardStrings.fieldLocation, text: $location)
                    TrackerFormField(TrackerBoardStrings.fieldMeeting, text: $meetingURL, kind: .url)
                        .accessibilityIdentifier("interview.meeting")
                    if showsErrors && meetingInvalid {
                        TrackerFieldError(TrackerBoardStrings.invalidURL)
                    }
                }
                Section {
                    ForEach($interview.people.indices, id: \.self) { index in
                        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                            TrackerFormField(TrackerBoardStrings.fieldPersonName, text: $interview.people[index].name, kind: .name)
                            TrackerFormField(TrackerBoardStrings.fieldPersonTitle, text: Binding(
                                get: { interview.people[index].title ?? "" },
                                set: { interview.people[index].title = $0.isEmpty ? nil : $0 }
                            ))
                        }
                    }
                    .onDelete { interview.people.remove(atOffsets: $0) }
                    GhostRow(TrackerBoardStrings.addPerson) {
                        interview.people.append(InterviewPerson(name: "", title: nil, email: nil, contactId: nil))
                    }
                } header: {
                    Text(TrackerBoardStrings.fieldPeople)
                }
                Section {
                    TrackerFormField(TrackerBoardStrings.fieldPrep, text: $interview.prepNotes, multiline: true)
                    TrackerPickerRow(TrackerBoardStrings.remindMe, selection: $prep, options: [nil] + InterviewPrepLead.allCases.map(Optional.some)) { Text($0?.label ?? TrackerBoardStrings.noPrepReminder) }
                    .accessibilityIdentifier("interview.prep")
                }
                if !isNew {
                    Section {
                        TrackerDestructiveRow(TrackerBoardStrings.removeInterview, action: onRemove)
                    }
                }
            }
            .navigationTitle(Text(isNew ? TrackerBoardStrings.interviewNew : TrackerBoardStrings.interviewEdit))
            .modifier(SheetSubtitle(company))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) { Text(TrackerBoardStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: save) { Text(TrackerBoardStrings.save) }
                        .accessibilityIdentifier("interview.save")
                }
            }
        }
        .interactiveDismissDisabled()
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private var durations: [Int] {
        Self.durations.contains(interview.durationMinutes) ? Self.durations : (Self.durations + [interview.durationMinutes]).sorted()
    }

    /// The user's zone first, then the interview's (if different), then common ones.
    private var timeZones: [String] {
        var zones = [TimeZone.current.identifier, interview.timezone]
        zones += ["Europe/Istanbul", "Europe/Berlin", "Europe/Amsterdam", "Europe/London", "America/New_York", "America/Los_Angeles", "UTC"]
        var seen = Set<String>()
        return zones.filter { seen.insert($0).inserted }
    }

    private func zoneLabel(_ identifier: String) -> String {
        guard let zone = TimeZone(identifier: identifier) else { return identifier }
        let city = identifier.split(separator: "/").last.map { $0.replacingOccurrences(of: "_", with: " ") } ?? identifier
        return "\(city) (\(zone.abbreviation(for: interview.startsAt) ?? identifier))"
    }

    private var titleMissing: Bool { interview.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }

    private var trimmedURL: String { meetingURL.trimmingCharacters(in: .whitespacesAndNewlines) }

    private var meetingInvalid: Bool {
        guard !trimmedURL.isEmpty else { return false }
        guard let url = URL(string: trimmedURL), let scheme = url.scheme?.lowercased() else { return true }
        return !(scheme == "https" || scheme == "http") || url.host() == nil
    }

    private func save() {
        guard !titleMissing, !meetingInvalid else {
            showsErrors = true
            return
        }
        var saved = interview
        saved.title = saved.title.trimmingCharacters(in: .whitespacesAndNewlines)
        saved.meetingUrl = trimmedURL.isEmpty ? nil : trimmedURL
        let place = location.trimmingCharacters(in: .whitespacesAndNewlines)
        saved.location = place.isEmpty ? nil : place
        saved.people = saved.people
            .map { InterviewPerson(name: $0.name.trimmingCharacters(in: .whitespacesAndNewlines), title: $0.title, email: $0.email, contactId: $0.contactId) }
            .filter { !$0.name.isEmpty }
        saved.prepNotes = saved.prepNotes.trimmingCharacters(in: .whitespacesAndNewlines)
        onSave(saved, prep)
    }
}

// MARK: - Contact

struct ContactEditorSheet: View {
    let isNew: Bool
    let onSave: (Contact) -> Void
    let onRemove: () -> Void
    let onCancel: () -> Void
    @State private var contact: Contact
    @State private var role: String
    @State private var email: String
    @State private var showsErrors = false

    init(contact: Contact, isNew: Bool, onSave: @escaping (Contact) -> Void, onRemove: @escaping () -> Void, onCancel: @escaping () -> Void) {
        self.isNew = isNew
        self.onSave = onSave
        self.onRemove = onRemove
        self.onCancel = onCancel
        _contact = State(initialValue: contact)
        _role = State(initialValue: contact.role ?? "")
        _email = State(initialValue: contact.email ?? "")
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TrackerFormField(TrackerBoardStrings.fieldName, text: $contact.name, kind: .name)
                        .accessibilityIdentifier("contact.name")
                    if showsErrors && nameMissing {
                        TrackerFieldError(TrackerBoardStrings.nameRequired)
                    }
                    TrackerFormField(TrackerBoardStrings.fieldRole, text: $role, kind: .jobTitle)
                    TrackerFormField(TrackerBoardStrings.fieldEmail, text: $email, kind: .email)
                        .accessibilityIdentifier("contact.email")
                    if showsErrors && emailInvalid {
                        TrackerFieldError(TrackerBoardStrings.invalidEmail)
                    }
                }
                Section {
                    TrackerFormField(TrackerBoardStrings.fieldContactNotes, text: $contact.notes, multiline: true)
                }
                if !isNew {
                    Section {
                        TrackerDestructiveRow(TrackerBoardStrings.removeContact, action: onRemove)
                    }
                }
            }
            .navigationTitle(Text(isNew ? TrackerBoardStrings.contactNew : TrackerBoardStrings.contactEdit))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) { Text(TrackerBoardStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(action: save) { Text(TrackerBoardStrings.save) }
                        .accessibilityIdentifier("contact.save")
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private var nameMissing: Bool { contact.name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
    private var trimmedEmail: String { email.trimmingCharacters(in: .whitespacesAndNewlines) }
    private var emailInvalid: Bool { !trimmedEmail.isEmpty && EmailAddress.normalized(trimmedEmail) == nil }

    private func save() {
        guard !nameMissing, !emailInvalid else {
            showsErrors = true
            return
        }
        var saved = contact
        saved.name = saved.name.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedRole = role.trimmingCharacters(in: .whitespacesAndNewlines)
        saved.role = trimmedRole.isEmpty ? nil : trimmedRole
        saved.email = trimmedEmail.isEmpty ? nil : trimmedEmail
        saved.notes = saved.notes.trimmingCharacters(in: .whitespacesAndNewlines)
        onSave(saved)
    }
}

// MARK: - Notes

struct NotesEditorSheet: View {
    let company: String
    let onSave: (String) -> Void
    let onCancel: () -> Void
    @State private var notes: String

    init(notes: String, company: String, onSave: @escaping (String) -> Void, onCancel: @escaping () -> Void) {
        self.company = company
        self.onSave = onSave
        self.onCancel = onCancel
        _notes = State(initialValue: notes)
    }

    var body: some View {
        NavigationStack {
            Form {
                TextField(text: $notes, prompt: Text(TrackerBoardStrings.notesPlaceholder), axis: .vertical) {
                    Text(TrackerBoardStrings.notesLabel)
                }
                .font(.bfhr(.body))
                .lineLimit(6...30)
                .accessibilityIdentifier("notes.field")
            }
            .navigationTitle(Text(TrackerBoardStrings.notes))
            .modifier(SheetSubtitle(company))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onCancel) { Text(TrackerBoardStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { onSave(notes) } label: { Text(TrackerBoardStrings.save) }
                        .accessibilityIdentifier("notes.save")
                }
            }
        }
        .presentationDetents([.large])
        .presentationBackground(BFHRColor.groupedBackground)
    }
}

// MARK: - Notification explainer

/// Asked once, the first time a reminder is set, before the system prompt (Tempo, Atoms,
/// Babbel): what the notifications are (the one just set, previewed as it will look), that there
/// is nothing else, and a calm way out.
struct NotificationExplainerSheet: View {
    let preview: LocalReminderPreview
    let onAllow: () -> Void
    let onNotNow: () -> Void
    @Environment(\.locale) private var locale
    @Environment(\.calendar) private var calendar
    @Environment(\.bfhrNow) private var now
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: BFHRSpace.s4) {
                Image(systemName: "bell.badge")
                    .font(.system(size: 40))
                    .foregroundStyle(BFHRColor.Accent.text)
                    .accessibilityHidden(true)
                Text(TrackerBoardStrings.explainerTitle)
                    .font(.bfhr(dynamicTypeSize.isAccessibilitySize ? .title3 : .title2, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .accessibilityAddTraits(.isHeader)
                    .fixedSize(horizontal: false, vertical: true)
                Text(TrackerBoardStrings.explainerBody)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                notificationPreview
                ButtonPair {
                    Button(action: onAllow) { Text(TrackerBoardStrings.explainerAllow) }
                        .accessibilityIdentifier("notifications.allow")
                } secondary: {
                    Button(action: onNotNow) { Text(TrackerBoardStrings.explainerNotNow) }
                        .accessibilityIdentifier("notifications.notNow")
                }
                Text(TrackerBoardStrings.explainerLater)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(BFHRSpace.s5)
        }
        .presentationDetents(dynamicTypeSize.isAccessibilitySize ? [.large] : [.medium, .large])
        .presentationBackground(BFHRColor.groupedBackground)
        .accessibilityIdentifier("notifications.explainer")
    }

    /// The reminder as a notification banner (decorative sample; the text is read as part of it).
    private var notificationPreview: some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Image(systemName: "bell")
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: preview.title)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                if let subtitle = preview.subtitle, !subtitle.isEmpty {
                    Text(verbatim: subtitle)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                if let at = preview.at {
                    Text(verbatim: DateText.dayAndTime(at, now: now, locale: locale, calendar: calendar))
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(BFHRSpace.s3)
        .background(BFHRColor.secondaryGroupedBackground, in: RoundedRectangle(cornerRadius: BFHRRadius.lg))
        .accessibilityElement(children: .combine)
    }
}
