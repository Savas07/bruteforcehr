import BFHRCore
import CryptoKit
import Foundation
import Observation

/// The Apply sheet for one job (docs/design/research/apply.md "Decision — iOS"): a checklist
/// prefilled with the best defaults (the CV the match is based on, no cover letter, the route the
/// posting prefers), then either
/// - the company site: the application moves to Preparing, the page opens in Safari, and on the
///   way back "Did you apply?" marks it Applied with the CV revision (and its PDF, when one was
///   made) pinned; or
/// - email: the CV PDF and the cover letter are made on the device and sent through a connected
///   account (`mailSend`, 10-second undo, the server marks it Applied) or from Mail (the app
///   marks it Applied when Mail reports it sent).
@Observable
public final class ApplyModel: ScreenModel {
    public var phase: LoadPhase = .loading
    public var connection: ConnectionState = .online
    public var pendingSyncIDs: Set<String> = []

    public let jobId: String
    public var now: Date
    public private(set) var data = UserData.empty

    public weak var writer: (any UserDataWriter)?
    public weak var services: (any ApplyServices)?
    public var renderer: (any ApplyRenderer)?
    public var usesSystemClock = false
    public private(set) var writeFailures = 0
    var writeTime: Date { usesSystemClock ? .now : now }

    // MARK: Choices

    public var selectedCvId: String?
    public var coverLetter: CoverLetterChoice = .none
    /// The letter typed in the sheet.
    public var letterText = ""
    public var channel: ApplyChannel?
    public var step: ApplyStep = .checklist
    public var email = ApplyEmailDraft()

    // MARK: Derived

    public private(set) var company = ""
    public private(set) var role = ""
    public private(set) var cvOptions: [ApplyCVOption] = []
    /// The user's letters for this job first, then templates.
    public private(set) var letterOptions: [CoverLetter] = []
    public private(set) var channelOptions: [ApplyChannel] = []
    /// Connected accounts that may send (`canSend` and connected or syncing).
    public private(set) var sendingAccounts: [MailAccount] = []
    /// The job's application, once Apply started (or it was saved).
    public private(set) var applicationId: String?
    public private(set) var applicationStatus: ApplicationStatus?
    public internal(set) var files: ApplyFilesState = .idle
    /// "Did you apply?" waits for an answer (back from the company site or Mail).
    public private(set) var asksIfSubmitted = false
    /// "Not yet": the card collapses to "In progress · Open company site again".
    public private(set) var deferredAnswer = false
    public private(set) var isSending = false
    public private(set) var sendError: ApplySendError?

    public init(jobId: String, now: Date = .now) {
        self.jobId = jobId
        self.now = now
    }

    public func load(_ data: UserData) {
        let first = self.data.jobs.isEmpty
        self.data = data
        guard let job = data.job(id: jobId) else {
            phase = .failed(LoadFailure(.notFound, details: "jobs/\(jobId)"))
            return
        }
        company = job.company
        role = job.title
        let match = data.match(forJob: jobId)
        cvOptions = data.cvs
            .filter { $0.archivedAt == nil }
            .sorted { ($0.isDefault ? 0 : 1, $0.title) < ($1.isDefault ? 0 : 1, $1.title) }
            .map { cv in
                ApplyCVOption(
                    id: cv.id, title: cv.title, language: cv.language,
                    score: match?.basedOnCvId == cv.id ? match?.score : nil,
                    isDefault: cv.isDefault, revisionId: cv.currentRevisionId
                )
            }
        letterOptions = data.coverLetters
            .filter { $0.jobId == jobId || $0.isTemplate }
            .sorted { ($0.jobId == jobId ? 0 : 1, $1.updatedAt) < ($1.jobId == jobId ? 0 : 1, $0.updatedAt) }
        channelOptions = Self.channels(for: job)
        sendingAccounts = data.mailAccounts.filter { $0.canSend && ($0.status == .connected || $0.status == .syncing) }
        let application = data.application(forJob: jobId)
        applicationId = application?.id
        applicationStatus = application?.status
        if first {
            // Defaults (apply.md): the CV the match is based on, else the default; the posting's route.
            selectedCvId = match?.basedOnCvId.flatMap { id in cvOptions.contains { $0.id == id } ? id : nil }
                ?? cvOptions.first?.id
            channel = channelOptions.first
            if let letterId = application?.coverLetterId { coverLetter = .existing(letterId) }
            email.accountId = sendingAccounts.first?.id
        }
        if selectedCvId.map({ id in !cvOptions.contains { $0.id == id } }) ?? false { selectedCvId = cvOptions.first?.id }
        phase = .loaded
    }

    @discardableResult
    func mutate<Result>(_ body: (inout UserData) throws -> Result) rethrows -> Result {
        let before = data
        let result = try body(&data)
        let changes = UserDataChanges(from: before, to: data)
        if !changes.isEmpty, let writer {
            Task { [weak self] in
                do { try await writer.commit(changes) } catch { self?.writeFailures += 1 }
            }
        }
        for id in changes.touchedIDs { recordWrite(id) }
        load(data)
        return result
    }

    // MARK: Derived helpers

    public var selectedCV: ApplyCVOption? { cvOptions.first { $0.id == selectedCvId } }

    /// The letter text that goes out: the typed one or the chosen saved letter.
    public var letterBody: String? {
        switch coverLetter {
        case .none: nil
        case .existing(let id): data.coverLetters.first { $0.id == id }?.body
        case .written: letterText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : letterText
        }
    }

    public var canSendFromAccount: Bool { !sendingAccounts.isEmpty }

    /// "Open company site" / "Review email" needs a CV and a route; an email needs an address.
    public var canContinue: Bool {
        guard selectedCV != nil, let channel else { return false }
        if case .written = coverLetter, letterBody == nil { return false }
        if case .email(let address, _) = channel { return !address.isEmpty }
        return true
    }

    /// Why the bottom button is disabled, in the order the user can fix it.
    public var blocker: ApplyBlocker? {
        if cvOptions.isEmpty { return .noCV }
        if selectedCV == nil { return .pickCV }
        if channel == nil { return .noRoute }
        if case .written = coverLetter, letterBody == nil { return .emptyLetter }
        return nil
    }

    /// Adds the recruiter address the user typed as the email route (D23: it makes Email the
    /// choice).
    public func useEmail(_ address: String) {
        let trimmed = address.trimmingCharacters(in: .whitespacesAndNewlines)
        guard ApplyEmailDraft(to: trimmed).hasValidRecipient else { return }
        let typed = ApplyChannel.email(address: trimmed, fromPosting: false)
        if !channelOptions.contains(typed) { channelOptions.append(typed) }
        channel = typed
    }

    // MARK: Company site

    /// "Open company site": Preparing, the cover letter saved, the URL to open.
    public func beginSiteApplication() throws -> URL? {
        guard case .site(let url, _) = channel else { return nil }
        try startApplying()
        step = .kit
        deferredAnswer = false
        return url
    }

    /// Safari closed: ask "Did you apply?".
    public func returnedFromSite() {
        asksIfSubmitted = true
        deferredAnswer = false
    }

    /// "Yes, I applied": Applied with the channel and pins (CV revision, letter and the files
    /// made for this application). Returns "Marked as Applied · Undo".
    @discardableResult
    public func confirmApplied() throws -> ToastItem? {
        guard let applicationId, let cv = selectedCV, let channel else { return nil }
        let cvFile = files.files.first { if case .cv = $0.kind { true } else { false } }
        let letterFile = files.files.first { if case .coverLetter = $0.kind { true } else { false } }
        let event = try mutate {
            try $0.markApplied(
                applicationId,
                channel: channel.trackerChannel,
                pins: ApplicationPins(cvId: cv.id, cvRevisionId: cv.revisionId, coverLetterId: letterId),
                at: writeTime
            )
        }
        asksIfSubmitted = false
        storeFiles([cvFile, letterFile].compactMap { $0 }, applicationId: applicationId)
        guard let event else { return nil }
        return ToastItem(
            glyph: ToastGlyph.moved,
            message: ApplyStrings.markedApplied(company),
            action: .undo { [weak self] in
                guard let self else { return }
                try? mutate { _ = try $0.revertEvent(event.id, at: self.writeTime) }
            }
        )
    }

    /// "Not yet": stays Preparing; the card collapses.
    public func notYet() {
        asksIfSubmitted = false
        deferredAnswer = true
    }

    /// "I'm not applying": back to Saved. Returns "Back in Saved".
    @discardableResult
    public func notApplying() throws -> ToastItem? {
        guard let applicationId else { return nil }
        asksIfSubmitted = false
        guard try mutate({ try $0.stopApplying(applicationId, at: writeTime) }) != nil else { return nil }
        return ToastItem(glyph: ToastGlyph.moved, message: ApplyStrings.backToSaved(company))
    }

    // MARK: Email

    /// "Review email": Preparing, the draft filled in, the PDFs made.
    public func beginEmailApplication(locale: Locale = .current) async throws {
        guard case .email(let address, _) = channel else { return }
        try startApplying()
        let name = data.profile?.fullName.trimmingCharacters(in: .whitespaces) ?? ""
        email.to = address
        if email.subject.isEmpty { email.subject = String(localized: ApplyStrings.emailSubject(role: role)) }
        // An untouched default follows the cover letter choice (Back, change it, Review email again).
        let defaults = [true, false].map { String(localized: ApplyStrings.emailBody(role: role, company: company, name: name, withLetter: $0)) }
        if email.body.isEmpty || defaults.contains(email.body) {
            email.body = defaults[letterBody != nil ? 0 : 1]
        }
        step = .email
        await prepareFiles()
    }

    /// Makes the CV PDF (and the cover letter PDF) on the device.
    public func prepareFiles() async {
        guard let cv = selectedCV, let renderer else {
            files = .failed(String(localized: ApplyStrings.filesUnavailable))
            return
        }
        files = .preparing
        do {
            guard let services else { throw ApplyFilesError.noServices }
            let revision = try await services.revision(cvId: cv.id, revisionId: cv.revisionId)
            let made = try await renderer.cvPDF(revision, language: cv.language)
            var result = [ApplyFile(id: UserData.makeID(), kind: .cv(cvId: cv.id, revisionId: cv.revisionId), fileName: made.fileName, data: made.data)]
            if let body = letterBody, let letterId = letterId {
                let title = String(localized: ApplyStrings.letterTitle(company))
                let pdf = try await renderer.letterPDF(title: title, body: body, language: cv.language)
                let fileName = made.fileName.replacingOccurrences(of: "-CV", with: "-Cover-Letter")
                result.append(ApplyFile(
                    id: UserData.makeID(), kind: .coverLetter(coverLetterId: letterId),
                    fileName: fileName == made.fileName ? "Cover-Letter.pdf" : fileName, data: pdf
                ))
            }
            files = .ready(result)
        } catch {
            files = .failed(String(describing: error))
        }
    }

    /// Send through the connected account (`mailSend`). Returns "Sending to … in 10 s · Undo";
    /// throws `ApplySendError` (shown in the review screen).
    public func sendFromAccount() async throws(ApplySendError) -> ToastItem {
        guard let services, let accountId = email.accountId, let cv = selectedCV else { throw .accountUnavailable }
        guard !connection.isOffline else { throw .offline }
        isSending = true
        sendError = nil
        defer { isSending = false }
        do {
            let stored = try await storeFilesNow(files.files)
            let (sentApplicationId, sendAt) = try await services.sendEmail(ApplyMailRequest(
                accountId: accountId,
                applicationId: applicationId,
                jobId: jobId,
                to: email.to,
                subject: email.subject,
                bodyText: email.body,
                renderedFileIds: stored.map(\.id),
                pins: ApplicationPins(
                    cvId: cv.id, cvRevisionId: cv.revisionId,
                    cvFileId: stored.first { $0.cvRevisionId != nil }?.id,
                    coverLetterId: letterId,
                    coverLetterFileId: stored.first { $0.coverLetterId != nil }?.id
                )
            ))
            let seconds = max(1, Int(sendAt.timeIntervalSinceNow.rounded()))
            return ToastItem(
                glyph: ToastGlyph.sending,
                message: ApplyStrings.sending(to: email.to, seconds: seconds),
                action: .undo { [weak services] in
                    Task { try? await services?.cancelEmail(applicationId: sentApplicationId) }
                }
            )
        } catch let error as ApplySendError {
            sendError = error
            throw error
        } catch {
            sendError = .failed(String(describing: error))
            throw .failed(String(describing: error))
        }
    }

    /// Mail reported the message sent: Applied with the pins, the files stored.
    @discardableResult
    public func sentFromMail() throws -> ToastItem? {
        try confirmApplied()
    }

    /// Mail couldn't open (no account on the device): "Did you send it?" after the mailto link.
    public func openedMailLink() {
        asksIfSubmitted = true
    }

    // MARK: Private

    /// The written letter's id once saved (created on first use).
    private var writtenLetterId: String?

    private var letterId: String? {
        switch coverLetter {
        case .none: nil
        case .existing(let id): id
        case .written: writtenLetterId
        }
    }

    /// Preparing (created when the job wasn't saved), with the written letter saved, in one batch.
    private func startApplying() throws {
        let channelKind = channel?.trackerChannel
        try mutate { data in
            let id = try data.startApplying(toJob: jobId, channel: channelKind, at: writeTime)
            if case .written = coverLetter, let body = letterBody {
                let letter = CoverLetter(
                    id: writtenLetterId ?? UserData.makeID(),
                    applicationId: id,
                    jobId: jobId,
                    title: String(localized: ApplyStrings.letterTitle(company)),
                    language: selectedCV?.language ?? "en",
                    body: body,
                    author: .user,
                    isTemplate: false,
                    createdAt: writeTime,
                    updatedAt: writeTime
                )
                if let index = data.coverLetters.firstIndex(where: { $0.id == letter.id }) {
                    if data.coverLetters[index].body != body {
                        data.coverLetters[index].body = body
                        data.coverLetters[index].updatedAt = writeTime
                    }
                } else {
                    data.coverLetters.append(letter)
                }
                writtenLetterId = letter.id
            }
        }
    }

    /// Uploads files and records them as `renderedFiles` (immutable), then pins them.
    private func storeFiles(_ files: [ApplyFile], applicationId: String) {
        guard !files.isEmpty, services != nil else { return }
        Task { [weak self] in
            guard let self, let stored = try? await storeFilesNow(files) else { return }
            mutate {
                $0.pinFiles(
                    applicationId,
                    cvFileId: stored.first { $0.cvRevisionId != nil }?.id,
                    coverLetterFileId: stored.first { $0.coverLetterId != nil }?.id,
                    at: self.writeTime
                )
            }
        }
    }

    private var storedFiles: [String: RenderedFile] = [:]

    private func storeFilesNow(_ files: [ApplyFile]) async throws -> [RenderedFile] {
        guard let services else { throw ApplyFilesError.noServices }
        var stored: [RenderedFile] = []
        for file in files {
            if let existing = storedFiles[file.id] {
                stored.append(existing)
                continue
            }
            let path = try await services.upload(file)
            let (cvId, revisionId, letterId): (String?, String?, String?) = switch file.kind {
            case .cv(let cvId, let revisionId): (cvId, revisionId, nil)
            case .coverLetter(let letterId): (nil, nil, letterId)
            }
            let record = RenderedFile(
                id: file.id, kind: .pdf, cvId: cvId, cvRevisionId: revisionId, coverLetterId: letterId,
                storagePath: path, fileName: file.fileName, sizeBytes: file.sizeBytes,
                sha256: SHA256.hash(data: file.data).map { String(format: "%02x", $0) }.joined(),
                createdAt: writeTime
            )
            storedFiles[file.id] = record
            stored.append(record)
        }
        let records = stored
        mutate { data in
            for record in records where !data.renderedFiles.contains(where: { $0.id == record.id }) {
                data.renderedFiles.append(record)
            }
        }
        return stored
    }

    /// The routes a job offers, D23 order: direct (ATS / company site) → apply email → board.
    static func channels(for job: Job) -> [ApplyChannel] {
        var direct: [ApplyChannel] = []
        var boards: [ApplyChannel] = []
        var seen = Set<String>()
        func add(_ urlString: String?, board: String?) {
            guard let urlString, let url = URL(string: urlString), url.scheme?.hasPrefix("http") == true,
                  seen.insert(url.absoluteString).inserted else { return }
            if let board { boards.append(.site(url: url, board: board)) } else { direct.append(.site(url: url, board: nil)) }
        }
        if let applyUrl = job.applyUrl {
            let source = job.sources.first { $0.url == applyUrl || $0.applyUrl == applyUrl }
            add(applyUrl, board: source.flatMap { $0.isDirectFromEmployer ? nil : $0.source })
        }
        for source in job.sources where source.isDirectFromEmployer {
            add(source.applyUrl ?? source.url, board: nil)
        }
        var emails: [ApplyChannel] = []
        for address in [job.applyEmail] + job.sources.map(\.applyEmail) {
            guard let address, !address.isEmpty,
                  !emails.contains(.email(address: address, fromPosting: true)) else { continue }
            emails.append(.email(address: address, fromPosting: true))
        }
        for source in job.sources where !source.isDirectFromEmployer {
            add(source.applyUrl ?? source.url, board: source.source)
        }
        return direct + emails + boards
    }
}

/// Why the checklist's button is disabled.
public enum ApplyBlocker: Hashable, Sendable {
    case noCV
    case pickCV
    case noRoute
    case emptyLetter
}

enum ApplyFilesError: Error {
    case noServices
}
