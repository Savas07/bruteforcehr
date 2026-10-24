import BFHRCore
import Foundation

/// The three first-run steps (onboarding-signin.md "Decision — iOS", BRIEF M6).
public enum OnboardingStep: Int, CaseIterable, Hashable, Sendable {
    case cv = 1
    case preferences
    case finish
}

/// Step 1: what happened to the CV.
public enum OnboardingCVState: Equatable, Sendable {
    case choosing
    /// Uploading and reading (`cvImport`). Continue already works; the preferences fill in when
    /// the reading finishes.
    case reading(fileName: String, kind: CVImportFileKind)
    /// Read and saved as a CV ("Found {roles} roles and {skills} skills").
    case found(fileName: String, kind: CVImportFileKind, roles: Int, skills: Int)
    /// Start from scratch: a blank CV for CV Studio.
    case scratch
    case failed(fileName: String, error: CVImportError)
}

/// The values on the Preferences step that came from the CV ("From CV" until edited).
public enum PreferenceField: Hashable, Sendable {
    case name
    case roles
    case locations
    case languages
}

/// First-run data access: `users/{uid}` and the first saved search on Firestore in the app, a
/// fake in tests and design mode.
public protocol OnboardingService: AnyObject {
    /// Writes in one batch: the profile (a create when `previous` is nil, else the changed
    /// fields) and, if given, a new saved search. The write applies locally at once (Firestore's
    /// offline queue keeps it); the call returns when the server has it.
    func save(profile: Profile, previous: Profile?, savedSearch: SavedSearch?) async throws
    /// `jobMatchesRefresh`: scores the newest jobs against the new profile and CV.
    func refreshMatches() async throws
}

/// Where the user left off, per account (UserDefaults in the app, memory in tests).
public protocol OnboardingProgressStore: AnyObject {
    func step(for uid: String) -> OnboardingStep?
    func setStep(_ step: OnboardingStep?, for uid: String)
}

public final class OnboardingDefaultsStore: OnboardingProgressStore {
    private let defaults: UserDefaults?
    private var memory: [String: OnboardingStep] = [:]

    /// `defaults` nil keeps progress in memory only (design mode, tests).
    public init(defaults: UserDefaults? = .standard) {
        self.defaults = defaults
    }

    private static func key(_ uid: String) -> String { "onboarding.step.\(uid)" }

    public func step(for uid: String) -> OnboardingStep? {
        guard let defaults else { return memory[uid] }
        return OnboardingStep(rawValue: defaults.integer(forKey: Self.key(uid)))
    }

    public func setStep(_ step: OnboardingStep?, for uid: String) {
        guard let defaults else {
            memory[uid] = step
            return
        }
        if let step { defaults.set(step.rawValue, forKey: Self.key(uid)) } else { defaults.removeObject(forKey: Self.key(uid)) }
    }
}

/// First run after sign-in (`onboardingCompletedAt == nil`): CV → Preferences → Finish. Every
/// step can be skipped; leaving the app resumes at the same step. Finish creates the first saved
/// search from the roles and places (`nextRunAt` = now), calls `jobMatchesRefresh`, then sets
/// `onboardingCompletedAt`; the app then shows Today.
@Observable
public final class OnboardingModel {
    public private(set) var step: OnboardingStep
    public var draft: JobPreferencesDraft {
        didSet { editedFields(from: oldValue) }
    }
    public internal(set) var cv: OnboardingCVState = .choosing
    public private(set) var hints: CVPreferenceHints?
    /// Values the CV filled in that the user hasn't changed.
    public private(set) var fromCV: Set<PreferenceField> = []
    public private(set) var profile: Profile?
    /// The account already has a saved search (Finish doesn't add a second one).
    public var hasSavedSearch = false
    public private(set) var isFinishing = false
    public private(set) var isCompleted = false
    /// A write the server refused (rules, quota): the step stays, with a calm retry note.
    public private(set) var saveFailed = false

    public let uid: String
    public let email: String
    @ObservationIgnored public var service: (any OnboardingService)?
    /// Reads the CV (`cvImport`); nil hides Upload.
    @ObservationIgnored public var importer: (any CVImporter)?
    /// Saves the imported or blank CV (CV Studio's model on Firestore in the app).
    @ObservationIgnored public var cvEditor: CVEditorModel?
    /// The app shows Today.
    @ObservationIgnored public var onComplete: (() -> Void)?
    @ObservationIgnored private let progress: any OnboardingProgressStore
    @ObservationIgnored private let clock: () -> Date
    @ObservationIgnored private let timezone: String
    @ObservationIgnored private let uiLanguage: UiLanguage
    @ObservationIgnored private var reading: Task<Void, Never>?
    @ObservationIgnored private var applyingHints = false
    /// How long Finish waits for the server before it moves on (the writes still sync later).
    @ObservationIgnored var serverWait: Duration = .seconds(15)

    public init(
        uid: String, email: String, profile: Profile?, progress: any OnboardingProgressStore,
        timezone: String = TimeZone.current.identifier, uiLanguage: UiLanguage = OnboardingModel.deviceLanguage,
        region: String? = Locale.current.region?.identifier, clock: @escaping () -> Date = { .now }
    ) {
        self.uid = uid
        self.email = email
        self.profile = profile
        self.progress = progress
        self.timezone = timezone
        self.uiLanguage = uiLanguage
        self.clock = clock
        step = progress.step(for: uid) ?? .cv
        if let profile {
            draft = JobPreferencesDraft(profile: profile, region: region)
            if profile.fullName == Self.placeholderName(email: email) { draft.fullName = "" }
        } else {
            draft = JobPreferencesDraft(salaryCurrency: JobPreferencesDraft.defaultCurrency(region: region))
        }
    }

    /// "en", "tr" or "de" from the device's languages, else English.
    public static var deviceLanguage: UiLanguage {
        for identifier in Locale.preferredLanguages {
            if let code = Locale(identifier: identifier).language.languageCode?.identifier, let language = UiLanguage(rawValue: code) {
                return language
            }
        }
        return .en
    }

    /// Until the user gives one: the email's local part (`fullName` can't be empty).
    static func placeholderName(email: String) -> String {
        let local = email.split(separator: "@").first.map(String.init) ?? ""
        return local.isEmpty ? "—" : String(local.prefix(200))
    }

    // MARK: Profile

    /// Creates `users/{uid}` when it's missing (nothing else does), so every later write is an
    /// update. Call when the gate decides onboarding runs.
    public func start() {
        guard profile == nil else { return }
        let now = clock()
        let created = Profile(
            id: uid, fullName: Self.placeholderName(email: email), email: email, phone: nil, headline: nil, links: [],
            targetRoles: [], seniority: nil, locations: [], remotePreferences: [], salaryFloor: nil, workAuthorization: [],
            languages: [], timezone: timezone, uiLanguage: uiLanguage, hiddenCompanies: [], skills: [], defaultCvId: nil,
            onboardingCompletedAt: nil, aiEnabled: true, settings: Self.defaultSettings, createdAt: now, updatedAt: now
        )
        profile = created
        write(created, previous: nil)
    }

    /// `DEFAULT_PROFILE_SETTINGS` of @bfhr/core.
    static let defaultSettings = ProfileSettings(
        ghostedAfterDays: 21, followUpAfterDays: 7, mailBodyRetentionDays: 180, autoApplyConfidence: 0.9,
        aiMailTextAllowed: false, dailySendCap: 20, quietHours: nil, notifyRejections: true, notifications: nil
    )

    /// The stored profile changed (snapshot): later writes diff against it.
    public func update(profile: Profile) {
        self.profile = profile
    }

    /// Changes the profile at once (local first) without waiting for the server.
    private func change(_ body: (inout Profile) -> Void) {
        guard let before = profile else { return }
        var after = before
        body(&after)
        guard after != before else { return }
        after.updatedAt = clock()
        profile = after
        write(after, previous: before)
    }

    private func write(_ profile: Profile, previous: Profile?) {
        guard let service else { return }
        Task { [weak self] in
            do {
                try await service.save(profile: profile, previous: previous, savedSearch: nil)
            } catch {
                self?.saveFailed = true
            }
        }
    }

    // MARK: Navigation

    /// "Your name" shows unless the imported CV named the user.
    public var showsNameField: Bool {
        if case .found = cv, hints?.name != nil { return false }
        return true
    }

    /// Continue / Skip for now on a step. Preferences are saved on Continue only.
    public func advance(saving: Bool = true) {
        switch step {
        case .cv:
            move(to: .preferences)
        case .preferences:
            if saving { savePreferences() }
            move(to: .finish)
        case .finish:
            Task { await finish(createSearch: saving) }
        }
    }

    public func back() {
        guard let previous = OnboardingStep(rawValue: step.rawValue - 1) else { return }
        move(to: previous)
    }

    private func move(to next: OnboardingStep) {
        step = next
        progress.setStep(next, for: uid)
    }

    public func savePreferences() {
        let draft = draft
        change { draft.apply(to: &$0) }
    }

    // MARK: Step 1: CV

    /// Upload a file: reads it in the background; Continue works at once.
    public func importCV(data: Data, fileName: String, kind: CVImportFileKind) {
        guard let importer else { return }
        reading?.cancel()
        cv = .reading(fileName: fileName, kind: kind)
        let flow = CVImportFlow(fileName: fileName, importer: importer, timezone: timezone, uiLanguage: uiLanguage.rawValue)
        let now = clock()
        reading = Task { [weak self] in
            await flow.run(data: data, kind: kind, renderEngine: nil, now: now)
            guard let self, !Task.isCancelled else { return }
            switch flow.step {
            case .review:
                guard let content = flow.review?.document?.content else {
                    cv = .failed(fileName: fileName, error: .unreadable)
                    return
                }
                let cvId = cvEditor.flatMap { flow.create(in: $0) }
                cvRead(content, cvId: cvId, fileName: fileName, kind: kind)
            case .failed(let error):
                cv = .failed(fileName: fileName, error: error)
            case .reading:
                break
            }
        }
    }

    /// A picked file that can't be read before upload (wrong type, no access).
    public func importFailed(fileName: String, error: CVImportError) {
        reading?.cancel()
        cv = .failed(fileName: fileName, error: error)
    }

    /// Cancel while reading, Remove after an error: back to the three options.
    public func resetCV() {
        reading?.cancel()
        reading = nil
        cv = .choosing
    }

    /// Start from scratch: a blank CV in CV Studio, then Preferences.
    public func startFromScratch() {
        reading?.cancel()
        cv = .scratch
        if let cvEditor {
            let cvId = cvEditor.startFromScratch()
            change { if $0.defaultCvId == nil { $0.defaultCvId = cvId } }
        }
        move(to: .preferences)
    }

    /// The CV was read: pre-fill what's still empty, save the name, skills and default CV.
    func cvRead(_ content: CvContent, cvId: String?, fileName: String, kind: CVImportFileKind) {
        let hints = CVPreferenceHints(content: content)
        self.hints = hints
        cv = .found(fileName: fileName, kind: kind, roles: hints.roles.count, skills: hints.skills.count)
        applyingHints = true
        var filled: Set<PreferenceField> = []
        var next = draft
        if next.fullName.isEmpty, let name = hints.name {
            next.fullName = name
            filled.insert(.name)
        }
        if next.roles.isEmpty, !hints.roles.isEmpty {
            next.roles = Array(hints.roles.prefix(2))
            filled.insert(.roles)
        }
        if next.locations.isEmpty, !next.remoteWorldwide, let code = hints.countryCode {
            next.locations = [TargetLocation(label: Locale.current.localizedString(forRegionCode: code) ?? code, city: nil, countryCode: code, relocation: false)]
            filled.insert(.locations)
        }
        if next.languages.isEmpty, !hints.languages.isEmpty {
            next.languages = hints.languages
            filled.insert(.languages)
        }
        draft = next
        fromCV = filled
        applyingHints = false
        change { profile in
            if let cvId, profile.defaultCvId == nil { profile.defaultCvId = cvId }
            if profile.skills.isEmpty { profile.skills = hints.skills }
            if let name = hints.name, profile.fullName == Self.placeholderName(email: email) { profile.fullName = String(name.prefix(200)) }
        }
    }

    /// Editing a pre-filled value drops its "From CV" tag.
    private func editedFields(from old: JobPreferencesDraft) {
        guard !applyingHints, !fromCV.isEmpty else { return }
        if old.fullName != draft.fullName { fromCV.remove(.name) }
        if old.roles != draft.roles { fromCV.remove(.roles) }
        if old.locations != draft.locations { fromCV.remove(.locations) }
        if old.languages != draft.languages { fromCV.remove(.languages) }
    }

    /// Role suggestions: the CV's titles not picked yet.
    public var roleSuggestions: [String] {
        (hints?.roles ?? []).filter { role in !draft.roles.contains { $0.caseInsensitiveCompare(role) == .orderedSame } }
    }

    // MARK: Step 3: Finish

    /// The first saved search: the first role (connectors match every word of the query, so roles
    /// aren't joined), the picked countries and workplaces, daily, alerts from Good (65).
    public func firstSearch(at now: Date) -> SavedSearch {
        let role = draft.roles.first
        var countries: [String] = []
        for code in draft.locations.compactMap(\.countryCode) where !countries.contains(code) { countries.append(code) }
        var remote = draft.workplaces
        if draft.remoteWorldwide, !remote.contains(.remote) { remote.append(.remote) }
        return SavedSearch(
            id: UserData.makeID(),
            name: String((role ?? String(localized: OnboardingStrings.defaultSearchName)).prefix(120)),
            query: role ?? "",
            filters: SavedSearchFilters(countryCodes: countries, remoteTypes: Array(remote.prefix(3)), seniority: [], salaryMin: nil,
                                        sources: [], postedWithinDays: nil, visaSponsorship: nil),
            schedule: .daily, alertThreshold: 65, dailyDigest: false, enabled: true,
            lastRunAt: nil, nextRunAt: now, createdAt: now, updatedAt: now
        )
    }

    /// Start my search (`createSearch`) or Skip for now: the search and the preferences reach the
    /// server, matches are refreshed, then onboarding is marked done. Offline or slow, it moves on
    /// after `serverWait`: the writes sync later and the saved search runs on schedule.
    public func finish(createSearch: Bool) async {
        guard !isFinishing, !isCompleted, let before = profile else { return }
        isFinishing = true
        saveFailed = false
        let now = clock()
        let search = createSearch && !hasSavedSearch ? firstSearch(at: now) : nil
        if let service {
            let saved = await within(serverWait) {
                try await service.save(profile: before, previous: before, savedSearch: search)
            }
            if saved == .failed {
                isFinishing = false
                saveFailed = true
                return
            }
            if saved == .done {
                _ = await within(serverWait) { try await service.refreshMatches() }
            }
        }
        if search != nil { hasSavedSearch = true }
        change { $0.onboardingCompletedAt = now }
        progress.setStep(nil, for: uid)
        isFinishing = false
        isCompleted = true
        onComplete?()
    }

    enum Outcome: Equatable {
        case done
        case failed
        case timedOut
    }

    /// Runs `operation`, giving up waiting after `limit` (the operation isn't cancelled).
    func within(_ limit: Duration, _ operation: @escaping () async throws -> Void) async -> Outcome {
        await withCheckedContinuation { continuation in
            let gate = OnceGate(continuation)
            Task {
                do {
                    try await operation()
                    gate.resume(.done)
                } catch {
                    gate.resume(.failed)
                }
            }
            Task {
                try? await Task.sleep(for: limit)
                gate.resume(.timedOut)
            }
        }
    }

    private final class OnceGate {
        private var continuation: CheckedContinuation<Outcome, Never>?
        init(_ continuation: CheckedContinuation<Outcome, Never>) { self.continuation = continuation }
        func resume(_ outcome: Outcome) {
            continuation?.resume(returning: outcome)
            continuation = nil
        }
    }
}
