import BFHRCore
import BFHRDesignTokens
import Observation
import SwiftUI

// Add a job from a link (BRIEF §4.3 "Save from anywhere"; `jobImportUrl`, ADR 0005 "URL import"):
// the server reads the shared page and returns a draft; the user checks the fields and saves it.
// Shared by the Jobs tab's paste-a-link sheet and the Share Extension (pure SwiftUI, no
// Firebase): the host supplies a `JobLinkImporter` and what Save does.

/// What `jobImportUrl` returned, as the review screen needs it.
public struct JobImportDraft: Hashable, Sendable {
    /// The job document to write (its `id` is the existing job's, or empty for a new one).
    public var job: Job
    /// Set when the posting is already in the user's jobs (the server merged the listing in).
    public var existingJobId: String?
    /// 0…1 per field the import filled (`title`, `company`, `locations`, …).
    public var confidence: [String: Double]
    public var warnings: [String]
    public var finalURL: URL?

    public init(job: Job, existingJobId: String?, confidence: [String: Double], warnings: [String], finalURL: URL?) {
        self.job = job
        self.existingJobId = existingJobId
        self.confidence = confidence
        self.warnings = warnings
        self.finalURL = finalURL
    }

    /// Fields read with less than 0.6 confidence get "Check this".
    public func needsCheck(_ field: String) -> Bool { (confidence[field] ?? 1) < 0.6 }
}

/// `details.reason` of a failed import (`JOB_IMPORT_ERROR_REASONS`), plus the connection.
public enum JobImportError: Error, Hashable, Sendable {
    case offline
    case invalidURL
    /// The page is gone (404/410).
    case notFound
    /// Login wall, bot check, or no posting found on the page: add it by hand instead.
    case unreadable
    /// Daily limits (`daily_cap`, `rate_limited`).
    case limit
    case failed(String)
}

public protocol JobLinkImporter: AnyObject {
    func lookUp(_ url: String) async throws(JobImportError) -> JobImportDraft
}

/// The sheet's state: the link field, the lookup, then the fields to check.
@Observable
public final class JobImportModel {
    public enum Step: Hashable, Sendable {
        case enterLink
        case lookingUp
        case review
        case failed(JobImportError)
    }

    public var link: String
    public private(set) var step: Step = .enterLink
    public private(set) var draft: JobImportDraft?
    // Editable fields.
    public var title = ""
    public var company = ""
    public var location = ""
    public var remoteType: RemoteType?

    private weak var importer: (any JobLinkImporter)?

    public init(link: String = "", importer: (any JobLinkImporter)?) {
        self.link = link
        self.importer = importer
    }

    /// A link that looks like a web address.
    public var hasLink: Bool {
        let text = link.trimmingCharacters(in: .whitespacesAndNewlines)
        return URL(string: text).map { $0.scheme?.hasPrefix("http") == true && $0.host() != nil } ?? false
    }

    public var canSave: Bool {
        step == .review && !title.trimmingCharacters(in: .whitespaces).isEmpty && !company.trimmingCharacters(in: .whitespaces).isEmpty
    }

    public func lookUp() async {
        guard let importer, hasLink else { return }
        step = .lookingUp
        do {
            let draft = try await importer.lookUp(link.trimmingCharacters(in: .whitespacesAndNewlines))
            show(draft)
        } catch {
            step = .failed(error)
        }
    }

    /// Shows a draft for review (also design mode and tests).
    public func show(_ draft: JobImportDraft) {
        self.draft = draft
        title = draft.job.title
        company = draft.job.company
        location = draft.job.locations.first?.label ?? ""
        remoteType = draft.job.remoteType
        step = .review
    }

    /// The job to write, with the user's corrections.
    public func reviewedJob(newId: String, at date: Date) -> Job? {
        guard var job = draft?.job else { return nil }
        job.id = draft?.existingJobId ?? newId
        job.title = title.trimmingCharacters(in: .whitespacesAndNewlines)
        job.company = company.trimmingCharacters(in: .whitespacesAndNewlines)
        let place = location.trimmingCharacters(in: .whitespacesAndNewlines)
        if place != (job.locations.first?.label ?? "") {
            job.locations = place.isEmpty ? [] : [JobLocation(label: place, city: nil, countryCode: nil)] + job.locations.dropFirst()
        }
        job.remoteType = remoteType
        job.updatedAt = date
        return job
    }

    public func startOver() {
        step = .enterLink
        draft = nil
    }
}

/// The review screen: the link, then the fields to check, "Already in your jobs" when it's a
/// duplicate, and Save / Save to Saved.
public struct JobImportReviewView: View {
    @Bindable private var model: JobImportModel
    private let onSave: (_ job: Job, _ isNew: Bool, _ alsoSave: Bool) -> Void
    private let onAddByHand: (() -> Void)?
    @Environment(\.dismiss) private var dismiss
    @Environment(\.bfhrNow) private var now

    public init(model: JobImportModel, onAddByHand: (() -> Void)? = nil, onSave: @escaping (_ job: Job, _ isNew: Bool, _ alsoSave: Bool) -> Void) {
        self.model = model
        self.onAddByHand = onAddByHand
        self.onSave = onSave
    }

    public var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField(text: $model.link) { Text(JobsStrings.importLinkPlaceholder) }
                        .bfhrURLField()
                        .disabled(model.step == .lookingUp)
                        .onSubmit { Task { await model.lookUp() } }
                        .accessibilityIdentifier("import.link")
                    if model.step == .enterLink || model.step == .lookingUp {
                        Button { Task { await model.lookUp() } } label: { Text(JobsStrings.importLookUp) }
                            .disabled(!model.hasLink || model.step == .lookingUp)
                            .accessibilityIdentifier("import.lookUp")
                    }
                } footer: {
                    Text(JobsStrings.importFooter).foregroundStyle(BFHRColor.Fg.secondary)
                }
                switch model.step {
                case .enterLink:
                    EmptyView()
                case .lookingUp:
                    Section { ProgressNote(JobsStrings.importReading) }
                case .failed(let error):
                    Section {
                        InlineAlert(.warning, title: JobsStrings.importFailedTitle(error), message: JobsStrings.importFailedBody(error))
                        if error == .unreadable, let onAddByHand {
                            Button { dismiss(); onAddByHand() } label: { Text(JobsStrings.importAddByHand) }
                        }
                    }
                case .review:
                    reviewSections
                }
            }
            .bfhrInsetGroupedList()
            .navigationTitle(Text(JobsStrings.addFromLink))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(JobsStrings.cancel) }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button { save(alsoSave: false) } label: { Text(JobsStrings.importSave) }
                        .disabled(!model.canSave)
                        .accessibilityIdentifier("import.save")
                }
            }
        }
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("import.sheet")
    }

    @ViewBuilder private var reviewSections: some View {
        if let draft = model.draft {
            if draft.existingJobId != nil {
                Section {
                    InlineAlert(.info, title: JobsStrings.importDuplicateTitle, message: JobsStrings.importDuplicateBody)
                }
            }
            Section {
                field(JobsStrings.importTitle, text: $model.title, check: draft.needsCheck("title"), id: "import.title")
                field(JobsStrings.importCompany, text: $model.company, check: draft.needsCheck("company"), id: "import.company")
                field(JobsStrings.importLocation, text: $model.location, check: draft.needsCheck("locations"), id: "import.location")
                Picker(selection: $model.remoteType) {
                    Text(JobsStrings.importNotStated).tag(RemoteType?.none)
                    ForEach(RemoteType.allCases, id: \.self) { type in
                        Text(JobDetailViewStrings.workMode(type)).tag(RemoteType?.some(type))
                    }
                } label: { Text(JobsStrings.facet(.remote)) }
            } header: {
                Text(JobsStrings.importCheckHeader).foregroundStyle(BFHRColor.Fg.secondary)
            } footer: {
                if let host = draft.finalURL?.host() {
                    Text(bfhrPlain: JobsStrings.importFrom(host)).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            Section {
                Button { save(alsoSave: true) } label: {
                    Label { Text(JobsStrings.importSaveToSaved) } icon: { Image(systemName: "bookmark") }
                }
                .disabled(!model.canSave)
                .accessibilityIdentifier("import.saveToSaved")
            } footer: {
                Text(JobsStrings.importSaveToSavedFooter).foregroundStyle(BFHRColor.Fg.secondary)
            }
        }
    }

    private func field(_ title: LocalizedStringResource, text: Binding<String>, check: Bool, id: String) -> some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
            HStack {
                Text(title).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                if check { ConfidenceTag() }
            }
            TextField(text: text) { Text(title) }
                .accessibilityIdentifier(id)
        }
    }

    private func save(alsoSave: Bool) {
        guard let job = model.reviewedJob(newId: UserData.makeID(), at: now) else { return }
        onSave(job, model.draft?.existingJobId == nil, alsoSave)
        dismiss()
    }
}

extension View {
    /// A URL keyboard without autocorrection on iOS.
    func bfhrURLField() -> some View {
        #if os(iOS)
        keyboardType(.URL)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
        #else
        self
        #endif
    }
}

extension JobsFeedModel {
    /// Saves a reviewed import: creates the job (or updates the existing one the server merged
    /// the listing into) and, with `alsoSave`, puts it in Saved (D02). The server's match trigger
    /// scores a new job. Returns "{company} · added · Open".
    @discardableResult
    public func importJob(_ job: Job, isNew: Bool, alsoSave: Bool, onOpen: @escaping @MainActor (String) -> Void) -> ToastItem {
        mutate { data in
            if let index = data.jobs.firstIndex(where: { $0.id == job.id }) {
                data.jobs[index] = job
            } else {
                var created = job
                if isNew { created.createdAt = writeTime }
                data.jobs.append(created)
            }
            if alsoSave { data.saveJob(job.id, at: writeTime) }
        }
        return ToastItem(
            glyph: ToastGlyph.confirmed,
            message: JobsStrings.importedToast(job.company),
            action: ToastAction(label: Strings.open) { onOpen(job.id) }
        )
    }
}
