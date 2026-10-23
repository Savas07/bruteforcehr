import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Log an application (flows.md §2 "Tracker · Log an application", IA.md Tracker sheets): an
/// application sent outside BruteForceHR, added by hand. A native grouped form in a sheet (Fi
/// "Edit Details", Flighty "Add Missing Flight"): company and role first (required), then where it
/// stands and since when, how it was sent, and notes. Add is enabled once company and role are
/// filled; the footer says so, so the disabled button never needs explaining.
public struct ApplicationAddSheet: View {
    @State private var draft: ApplicationDraft
    private let now: Date
    private let onAdd: (ApplicationDraft) -> Void
    private let onCancel: () -> Void
    @State private var confirmsDiscard = false

    public init(draft: ApplicationDraft, now: Date, onAdd: @escaping (ApplicationDraft) -> Void, onCancel: @escaping () -> Void) {
        _draft = State(initialValue: draft)
        self.now = now
        self.onAdd = onAdd
        self.onCancel = onCancel
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TrackerFormField(ApplicationAddStrings.company, text: $draft.company, kind: .organization)
                        .accessibilityIdentifier("add.company")
                    TrackerFormField(ApplicationAddStrings.role, text: $draft.role, kind: .jobTitle)
                        .accessibilityIdentifier("add.role")
                    TrackerFormField(ApplicationAddStrings.location, text: $draft.location, prompt: ApplicationAddStrings.locationPrompt, kind: .city)
                        .accessibilityIdentifier("add.location")
                } footer: {
                    Text(ApplicationAddStrings.requiredFooter)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    Picker(selection: $draft.status) {
                        ForEach(ApplicationDraft.statuses, id: \.self) { status in
                            Text(status.label).tag(status)
                        }
                    } label: {
                        Text(ApplicationAddStrings.stage)
                    }
                    .accessibilityIdentifier("add.status")
                    DatePicker(selection: $draft.date, in: ...now, displayedComponents: .date) {
                        Text(draft.hasApplied ? ApplicationAddStrings.appliedOn : ApplicationAddStrings.addedOn)
                    }
                    .accessibilityIdentifier("add.date")
                    Picker(selection: $draft.channel) {
                        Text(ApplicationAddStrings.channelNone).tag(Channel?.none)
                        ForEach(Channel.allCases, id: \.self) { channel in
                            Text(channel.label).tag(Channel?.some(channel))
                        }
                    } label: {
                        Text(Strings.fieldChannel)
                    }
                    .accessibilityIdentifier("add.channel")
                } footer: {
                    Text(ApplicationAddStrings.stageFooter)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                Section {
                    TrackerFormField(ApplicationAddStrings.notes, text: $draft.notes, prompt: ApplicationAddStrings.notesPlaceholder, multiline: true)
                        .accessibilityIdentifier("add.notes")
                }
            }
            .navigationTitle(Text(ApplicationAddStrings.title))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { cancel() } label: { Text(ApplicationAddStrings.cancel) }
                        .accessibilityIdentifier("add.cancel")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { onAdd(draft) } label: { Text(ApplicationAddStrings.add) }
                        .disabled(!draft.isValid)
                        .accessibilityIdentifier("add.save")
                }
            }
            .confirmationDialog(Text(ApplicationAddStrings.discardTitle), isPresented: $confirmsDiscard, titleVisibility: .visible) {
                Button(role: .destructive, action: onCancel) { Text(ApplicationAddStrings.discard) }
                Button(role: .cancel) {} label: { Text(ApplicationAddStrings.keepEditing) }
            }
        }
        .interactiveDismissDisabled(isDirty)
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private var isDirty: Bool {
        !draft.company.isEmpty || !draft.role.isEmpty || !draft.location.isEmpty || !draft.notes.isEmpty
    }

    private func cancel() {
        if isDirty { confirmsDiscard = true } else { onCancel() }
    }
}
