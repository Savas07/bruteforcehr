import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// "Save to BruteForceHR" from the iOS share sheet (BRIEF §4.3 "Save from anywhere";
/// research/job-import-share.md). One compact form: where the job was read from and how (trust),
/// role / company / location to check, then Save or Save and log as applied pinned at the bottom.
/// Walls, offline and empty pages end in calm copy with "Add it by hand", never a dead end.
public struct JobImportShareSheet: View {
    @Bindable private var model: JobImportShareModel
    private let onClose: () -> Void
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    public init(model: JobImportShareModel, onClose: @escaping () -> Void) {
        self.model = model
        self.onClose = onClose
    }

    public var body: some View {
        NavigationStack {
            content
                .navigationTitle(Text(model.phase == .manual ? JobImportStrings.manualTitle : JobImportStrings.title))
                .bfhrInlineTitle()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        if !isFinished {
                            Button(action: onClose) { Text(JobImportStrings.cancel) }
                                .accessibilityIdentifier("share.cancel")
                                .disabled(isSaving)
                        }
                    }
                }
                .background(BFHRColor.groupedBackground)
        }
        .accessibilityIdentifier("share.sheet")
        .bfhrHaptic(.confirm, trigger: isFinished)
    }

    private var isSaving: Bool {
        if case .saving = model.phase { return true }
        return false
    }

    private var isFinished: Bool {
        if case .saved = model.phase { return true }
        return false
    }

    @ViewBuilder
    private var content: some View {
        switch model.phase {
        case .reading:
            VStack(spacing: BFHRSpace.s3) {
                ProgressView()
                Text(JobImportStrings.reading)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(verbatim: model.sourceHost)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            .multilineTextAlignment(.center)
            .padding(BFHRSpace.s5)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("share.reading")
        case .ready, .saving:
            form(manual: false)
        case .manual:
            form(manual: true)
        case .saved(let logged, let addedApplication):
            message(
                glyph: "checkmark.circle.fill",
                tone: BFHRTone.success.text,
                title: logged ? JobImportStrings.loggedTitle : JobImportStrings.savedTitle,
                message: addedApplication ? (logged ? JobImportStrings.loggedMessage : JobImportStrings.savedMessage) : JobImportStrings.alreadyTracked,
                identifier: "share.saved"
            ) {
                Button(action: onClose) { Text(JobImportStrings.done) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .accessibilityIdentifier("share.done")
            }
        case .signedOut:
            message(
                glyph: "person.crop.circle.badge.questionmark",
                tone: BFHRColor.Fg.secondary,
                title: JobImportStrings.signedOutTitle,
                message: JobImportStrings.signedOutMessage,
                identifier: "share.signedOut"
            ) {
                Button(action: onClose) { Text(JobImportStrings.close) }
                    .buttonStyle(.bfhr(.secondary, fullWidth: true))
            }
        case .failed(let failure):
            let copy = JobImportStrings.failure(failure)
            message(
                glyph: failure == .offline ? "wifi.slash" : "doc.text.magnifyingglass",
                tone: BFHRColor.Fg.secondary,
                title: copy.title,
                message: copy.message,
                identifier: "share.failed"
            ) {
                VStack(spacing: BFHRSpace.s2) {
                    Button { model.enterManually() } label: { Text(JobImportStrings.addByHand) }
                        .buttonStyle(.bfhr(.primary, fullWidth: true))
                        .accessibilityIdentifier("share.addByHand")
                    if failure.isRetryable {
                        Button { Task { await model.start() } } label: { Text(JobImportStrings.tryAgain) }
                            .buttonStyle(.bfhr(.secondary, fullWidth: true))
                            .accessibilityIdentifier("share.retry")
                    }
                }
            }
        }
    }

    private func form(manual: Bool) -> some View {
        Form {
            if !manual {
                Section {
                    sourceRow
                }
            }
            if model.isExisting {
                Section {
                    InlineAlert(.info, title: JobImportStrings.existingTitle, message: JobImportStrings.existingMessage)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                }
            }
            Section {
                if model.isExisting {
                    readOnlyRow(JobImportStrings.role, model.title)
                    readOnlyRow(JobImportStrings.company, model.company)
                    if !model.location.isEmpty {
                        readOnlyRow(JobImportStrings.location, model.location)
                    }
                } else {
                    TrackerFormField(JobImportStrings.role, text: $model.title, kind: .jobTitle)
                        .accessibilityIdentifier("share.role")
                    TrackerFormField(JobImportStrings.company, text: $model.company, kind: .organization)
                        .accessibilityIdentifier("share.company")
                    TrackerFormField(
                        JobImportStrings.location,
                        text: $model.location,
                        prompt: manual ? JobImportStrings.optional : JobImportStrings.locationPrompt,
                        kind: .city
                    )
                        .accessibilityIdentifier("share.location")
                }
            } footer: {
                Text(model.canSave ? (manual ? JobImportStrings.manualFooter : JobImportStrings.footer) : JobImportStrings.requiredFooter)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            // At accessibility sizes the two buttons would cover most of the sheet: they scroll
            // with the fields as the last section instead of staying pinned.
            if dynamicTypeSize.isAccessibilitySize {
                Section { actions }
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
            }
        }
        .scrollDismissesKeyboard(.interactively)
        .safeAreaInset(edge: .bottom) {
            if !dynamicTypeSize.isAccessibilitySize { actions }
        }
    }

    /// A saved job's value: label above, value in the primary color (the system's trailing grey
    /// value only nearly passes contrast), wrapping at large sizes like the editable fields.
    private func readOnlyRow(_ label: LocalizedStringResource, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
            Text(verbatim: value)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .accessibilityElement(children: .combine)
    }

    private var sourceRow: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
            Label { Text(bfhrPlain: JobImportStrings.source(model.sourceHost)).fixedSize(horizontal: false, vertical: true) } icon: { Image(systemName: "link") }
                .labelStyle(.bfhrCompact)
                .font(.bfhr(.subheadline, emphasized: true))
                .foregroundStyle(BFHRColor.Fg.primary)
            if model.readByAI {
                AiBadge()
                Text(JobImportStrings.readByAI)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(JobImportStrings.structured)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("share.source")
    }

    private var actions: some View {
        VStack(spacing: BFHRSpace.s2) {
            if model.saveFailed {
                Text(JobImportStrings.saveFailed)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRTone.warning.text)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("share.saveFailed")
            }
            Button { Task { await model.save(logApplication: false) } } label: {
                if case .saving(false) = model.phase { ProgressView().accessibilityLabel(Text(JobImportStrings.saving)) } else { Text(JobImportStrings.save) }
            }
            .buttonStyle(.bfhr(.primary, fullWidth: true))
            .disabled(!model.canSave || isSaving)
            .accessibilityIdentifier("share.save")
            Button { Task { await model.save(logApplication: true) } } label: {
                if case .saving(true) = model.phase { ProgressView().accessibilityLabel(Text(JobImportStrings.saving)) } else { Text(JobImportStrings.saveAndLog) }
            }
            .buttonStyle(.bfhr(.secondary, fullWidth: true))
            .disabled(!model.canSave || isSaving)
            .accessibilityIdentifier("share.saveAndLog")
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.top, BFHRSpace.s3)
        .padding(.bottom, BFHRSpace.s2)
        .background(BFHRColor.groupedBackground)
    }

    private func message(
        glyph: String,
        tone: Color,
        title: LocalizedStringResource,
        message: LocalizedStringResource,
        identifier: String,
        @ViewBuilder actions: () -> some View
    ) -> some View {
        ScrollView {
            VStack(spacing: BFHRSpace.s3) {
                Image(systemName: glyph)
                    .font(.system(size: 44))
                    .foregroundStyle(tone)
                    .accessibilityHidden(true)
                Text(title)
                    .font(.bfhr(.title3, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .accessibilityAddTraits(.isHeader)
                Text(message)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                actions()
                    .padding(.top, BFHRSpace.s3)
            }
            .multilineTextAlignment(.center)
            .padding(BFHRSpace.s5)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier(identifier)
    }
}

extension JobImportShareFailure {
    /// Failures worth a second try (network, busy service); the others won't change on retry.
    var isRetryable: Bool {
        switch self {
        case .offline, .unexpected: true
        case .reason(let reason): [.fetchFailed, .aiUnavailable, .rateLimited].contains(reason)
        }
    }
}
