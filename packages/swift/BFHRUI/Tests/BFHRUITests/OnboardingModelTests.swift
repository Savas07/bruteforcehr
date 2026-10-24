import BFHRCore
import Foundation
import Testing
@testable import BFHRUI
import BFHRUIFixtures

/// Records what onboarding writes, in order; `hangs` never answers (offline), `fails` refuses.
final class OnboardingRecorder: OnboardingService {
    enum Call: Equatable {
        case save(created: Bool, search: SavedSearch?)
        case refresh
    }

    var calls: [Call] = []
    var profiles: [Profile] = []
    var fails = false
    var hangs = false

    func save(profile: Profile, previous: Profile?, savedSearch: SavedSearch?) async throws {
        calls.append(.save(created: previous == nil, search: savedSearch))
        profiles.append(profile)
        if hangs { try await Task.sleep(for: .seconds(60)) }
        if fails { throw URLError(.cannotLoadFromNetwork) }
    }

    func refreshMatches() async throws {
        calls.append(.refresh)
    }

    var lastProfile: Profile? { profiles.last }
}

@Suite("Onboarding")
struct OnboardingModelTests {
    static let now = Date(timeIntervalSince1970: 1_792_654_200)

    private func model(profile: Profile? = nil, store: OnboardingDefaultsStore = OnboardingDefaultsStore(defaults: nil),
                       region: String = "DE") -> (OnboardingModel, OnboardingRecorder) {
        let model = OnboardingModel(uid: "u1", email: "deniz.aksoy@example.com", profile: profile, progress: store,
                                    timezone: "Europe/Berlin", uiLanguage: .en, region: region) { Self.now }
        let recorder = OnboardingRecorder()
        model.service = recorder
        return (model, recorder)
    }

    /// Lets the fire-and-forget writes run.
    private func settle() async {
        for _ in 0..<5 { await Task.yield() }
    }

    private static var cv: CvContent {
        var content = CvContent(
            basics: ResumeBasics(name: "Deniz Aksoy", label: "Senior Product Designer"),
            meta: CvMeta(template: "classic", theme: CvTheme(accentColor: "#0F766E", fontPair: "inter", density: .comfortable, paperSize: .a4),
                         sectionOrder: ["basics"], customSections: [])
        )
        content.basics?.location = ResumeLocation(city: "Berlin", countryCode: "de")
        content.work = [ResumeWork(position: "Product Designer"), ResumeWork(position: "senior product designer"), ResumeWork(position: "UX Designer")]
        content.skills = [ResumeSkill(name: "Figma", keywords: ["Prototyping", "figma"])]
        content.languages = [ResumeLanguage(language: "Türkçe", fluency: "Ana dil"), ResumeLanguage(language: "English", fluency: "C1"),
                             ResumeLanguage(language: "Deutsch", fluency: "Grundkenntnisse")]
        return content
    }

    @Test("Start creates users/{uid} with the defaults when it's missing")
    func createsProfile() async throws {
        let (model, recorder) = model()
        model.start()
        await settle()
        let profile = try #require(recorder.lastProfile)
        #expect(recorder.calls == [.save(created: true, search: nil)])
        #expect(profile.id == "u1")
        #expect(profile.fullName == "deniz.aksoy")
        #expect(profile.email == "deniz.aksoy@example.com")
        #expect(profile.timezone == "Europe/Berlin")
        #expect(profile.uiLanguage == .en)
        #expect(profile.aiEnabled)
        #expect(profile.onboardingCompletedAt == nil)
        #expect(profile.settings == OnboardingModel.defaultSettings)
        #expect(profile.settings.ghostedAfterDays == 21 && profile.settings.dailySendCap == 20 && !profile.settings.aiMailTextAllowed)
        // The name field starts empty instead of showing the placeholder.
        #expect(model.draft.fullName.isEmpty)
        model.start()
        #expect(recorder.calls.count == 1, "start runs once")
    }

    @Test("Preferences map to the agreed Profile values")
    func mapping() throws {
        var draft = JobPreferencesDraft(salaryCurrency: "EUR")
        let added = draft.addRole("  Product Designer ")
        #expect(added)
        let duplicate = draft.addRole("product designer")
        #expect(!duplicate, "duplicates in any case are ignored")
        for role in ["A", "B", "C", "D"] { draft.addRole(role) }
        let sixth = draft.addRole("F")
        #expect(!sixth, "five roles at most")
        draft.toggleSeniority(.senior)
        draft.toggleSeniority(.senior)
        #expect(draft.seniority == nil, "a second tap clears")
        draft.toggleSeniority(.lead)
        draft.toggle(PreferenceMarket(countryCode: "DE"), label: "Germany")
        draft.toggle(PreferenceMarket(countryCode: "NL"), label: "Netherlands")
        draft.toggle(PreferenceMarket(countryCode: "GB"), label: "United Kingdom")
        let city = draft.addLocation("Berlin", locale: Locale(identifier: "en"))
        let country = draft.addLocation("Türkei", locale: Locale(identifier: "de"))
        #expect(city && country)
        #expect(draft.authorizationRegions == ["EU", "GB", "TR"], "EU picks share one question")
        draft.setAnswer(.yes, for: "EU")
        draft.setAnswer(.no, for: "GB")
        draft.setAnswer(.notSure, for: "TR")
        draft.toggle(PreferenceMarket(countryCode: nil), label: "Remote worldwide")
        draft.openToRelocation = true
        draft.salaryAmount = 70_000
        draft.setLanguage("de", level: .b2)

        var profile = try FixtureStore.document(.populated).profile
        profile.workAuthorization = [WorkAuthorization(region: "EU", status: .citizen)]
        draft.storedAuthorization = ["EU": .citizen]
        draft.apply(to: &profile)
        #expect(profile.targetRoles == ["Product Designer", "A", "B", "C", "D"])
        #expect(profile.seniority == .lead)
        #expect(profile.locations.map(\.countryCode) == ["DE", "NL", "GB", nil, "TR"])
        #expect(profile.locations[3].city == "Berlin")
        let relocating = profile.locations.filter(\.relocation).count
        #expect(relocating == profile.locations.count)
        #expect(profile.remotePreferences == [.remote], "Remote worldwide adds remote, no location")
        #expect(profile.workAuthorization == [WorkAuthorization(region: "EU", status: .citizen), WorkAuthorization(region: "GB", status: .needsSponsorship)],
                "Yes keeps the stored status; Not sure stores nothing")
        #expect(profile.salaryFloor == SalaryFloor(amount: 70_000, currency: "EUR", period: .year))
        #expect(profile.languages == [SpokenLanguage(language: "de", level: .b2)])

        // Read back: the same draft.
        let reread = JobPreferencesDraft(profile: profile, region: "DE")
        #expect(reread.roles == draft.roles)
        #expect(reread.answer(for: "EU") == .yes && reread.answer(for: "GB") == .no && reread.answer(for: "TR") == .notSure)
        #expect(!reread.remoteWorldwide, "with places picked, remote is a workplace")
    }

    @Test("Salary: TRY is monthly by default, other currencies yearly; no amount clears it")
    func salary() {
        var draft = JobPreferencesDraft(salaryCurrency: JobPreferencesDraft.defaultCurrency(region: "TR"))
        #expect(draft.salaryCurrency == "TRY" && draft.salaryPeriod == .month)
        draft.setCurrency("GBP")
        #expect(draft.salaryPeriod == .year)
        #expect(draft.salaryFloor == nil)
        draft.salaryAmount = 0
        #expect(draft.salaryFloor == nil)
        #expect(JobPreferencesDraft.defaultCurrency(region: "FR") == "EUR")
        #expect(JobPreferencesDraft.defaultCurrency(region: "US") == "USD")
    }

    @Test("Remote worldwide alone: no location, remote accepted, nothing to ask about")
    func remoteWorldwide() throws {
        var draft = JobPreferencesDraft()
        draft.toggle(PreferenceMarket(countryCode: nil), label: "Remote worldwide")
        #expect(draft.authorizationRegions.isEmpty)
        var profile = try FixtureStore.document(.populated).profile
        draft.apply(to: &profile)
        #expect(profile.locations.isEmpty)
        #expect(profile.remotePreferences == [.remote])
        #expect(JobPreferencesDraft(profile: profile).remoteWorldwide)
        draft.toggleWorkplace(.remote)
        #expect(!draft.remoteWorldwide, "turning remote off turns Remote worldwide off")
    }

    @Test("A read CV pre-fills empty preferences and saves the name, skills and default CV")
    func cvPrefill() async throws {
        let (model, recorder) = model()
        model.start()
        model.cvRead(Self.cv, cvId: "cv-1", fileName: "cv.pdf", kind: .pdf)
        await settle()
        #expect(model.cv == .found(fileName: "cv.pdf", kind: .pdf, roles: 3, skills: 2))
        #expect(model.draft.fullName == "Deniz Aksoy")
        #expect(model.draft.roles == ["Senior Product Designer", "Product Designer"])
        #expect(model.roleSuggestions == ["UX Designer"])
        #expect(model.draft.locations.map(\.countryCode) == ["DE"])
        #expect(model.draft.languages == [SpokenLanguage(language: "tr", level: .native), SpokenLanguage(language: "en", level: .c1),
                                          SpokenLanguage(language: "de", level: .a2)])
        #expect(model.fromCV == [.name, .roles, .locations, .languages])
        #expect(!model.showsNameField, "the CV named the user")
        let profile = try #require(recorder.lastProfile)
        #expect(profile.defaultCvId == "cv-1")
        #expect(profile.skills == ["figma", "prototyping"])
        #expect(profile.fullName == "Deniz Aksoy")
        // Editing a pre-filled value drops its tag only.
        model.draft.removeRole("Product Designer")
        #expect(model.fromCV == [.name, .locations, .languages])
    }

    @Test("Values already set are kept when the CV arrives")
    func cvKeepsChoices() throws {
        var profile = try FixtureStore.document(.populated).profile
        profile.targetRoles = ["Engineering Manager"]
        profile.defaultCvId = "cv-old"
        let (model, recorder) = model(profile: profile)
        model.cvRead(Self.cv, cvId: "cv-new", fileName: "cv.pdf", kind: .pdf)
        #expect(model.draft.roles == ["Engineering Manager"])
        #expect(!model.fromCV.contains(.roles))
        #expect(recorder.lastProfile.map { $0.defaultCvId == "cv-old" } ?? true)
    }

    @Test("Finish: preferences, the first saved search, refresh, then onboarding done")
    func finish() async throws {
        let (model, recorder) = model()
        var completed = false
        model.onComplete = { completed = true }
        model.start()
        model.advance()
        #expect(model.step == .preferences)
        model.draft.addRole("Product Designer")
        model.draft.addRole("UX Lead")
        model.draft.toggle(PreferenceMarket(countryCode: "DE"), label: "Germany")
        model.draft.toggle(PreferenceMarket(countryCode: "DE"), label: "Germany")
        model.draft.toggle(PreferenceMarket(countryCode: "NL"), label: "Netherlands")
        _ = model.draft.addLocation("Berlin", locale: Locale(identifier: "en"))
        model.draft.toggleWorkplace(.hybrid)
        model.advance()
        #expect(model.step == .finish)
        await settle()
        #expect(recorder.lastProfile?.targetRoles == ["Product Designer", "UX Lead"])

        recorder.calls = []
        await model.finish(createSearch: true)
        await settle()
        #expect(completed && model.isCompleted)
        #expect(recorder.calls.count == 3)
        guard case .save(false, let search?) = recorder.calls.first else {
            Issue.record("the saved search is written first: \(recorder.calls)")
            return
        }
        #expect(recorder.calls[1] == .refresh)
        #expect(search.name == "Product Designer")
        #expect(search.query == "Product Designer", "one role: connectors match every word of the query")
        #expect(search.filters.countryCodes == ["NL"])
        #expect(search.filters.remoteTypes == [.hybrid])
        #expect(search.filters.seniority.isEmpty)
        #expect(search.schedule == .daily && search.alertThreshold == 65 && search.enabled && !search.dailyDigest)
        #expect(search.nextRunAt == Self.now && search.lastRunAt == nil)
        guard case .save(false, nil) = recorder.calls[2] else {
            Issue.record("onboardingCompletedAt is written last")
            return
        }
        #expect(recorder.lastProfile?.onboardingCompletedAt == Self.now)
    }

    @Test("Skip for now on Finish: no saved search, onboarding done")
    func skipFinish() async throws {
        let (model, recorder) = model()
        model.start()
        model.advance(saving: false)
        model.advance(saving: false)
        #expect(model.step == .finish)
        await model.finish(createSearch: false)
        await settle()
        #expect(model.isCompleted)
        #expect(!recorder.calls.contains { if case .save(_, _?) = $0 { true } else { false } })
        #expect(recorder.lastProfile?.onboardingCompletedAt == Self.now)
        #expect(recorder.lastProfile?.targetRoles.isEmpty == true, "Skip on Preferences saves nothing")
    }

    @Test("An existing saved search isn't duplicated; with no roles the name is generic")
    func existingSearch() async throws {
        let (model, recorder) = model()
        model.start()
        #expect(model.firstSearch(at: Self.now).query.isEmpty)
        #expect(model.firstSearch(at: Self.now).name == String(localized: OnboardingStrings.defaultSearchName))
        model.hasSavedSearch = true
        await model.finish(createSearch: true)
        await settle()
        #expect(!recorder.calls.contains { if case .save(_, _?) = $0 { true } else { false } })
        #expect(model.isCompleted)
    }

    @Test("D40: no role and no place means no saved search; a place alone is enough")
    func nothingToSearch() async throws {
        let (model, recorder) = model()
        model.start()
        #expect(!model.canSearch)
        await model.finish(createSearch: true)
        await settle()
        #expect(model.isCompleted)
        #expect(!recorder.calls.contains { if case .save(_, _?) = $0 { true } else { false } })

        let (placeOnly, placeRecorder) = self.model()
        placeOnly.start()
        placeOnly.draft.toggle(PreferenceMarket(countryCode: nil), label: "Remote worldwide")
        #expect(placeOnly.canSearch)
        await placeOnly.finish(createSearch: true)
        await settle()
        guard case .save(false, let search?) = placeRecorder.calls.first(where: { if case .save(_, _?) = $0 { true } else { false } }) else {
            Issue.record("a place alone creates the search")
            return
        }
        #expect(search.query.isEmpty && search.filters.remoteTypes == [.remote])
        #expect(search.name == String(localized: OnboardingStrings.defaultSearchName))
    }

    @Test("A refused write keeps the step and says so")
    func refused() async {
        let (model, recorder) = model()
        model.start()
        await settle()
        recorder.fails = true
        await model.finish(createSearch: true)
        #expect(!model.isCompleted)
        #expect(model.saveFailed)
        #expect(!model.isFinishing)
        #expect(!recorder.calls.contains(.refresh))
    }

    @Test("Offline: Finish moves on after the wait; the writes sync later")
    func offline() async {
        let (model, recorder) = model()
        model.start()
        await settle()
        recorder.hangs = true
        model.serverWait = .milliseconds(50)
        await model.finish(createSearch: true)
        await settle()
        #expect(model.isCompleted)
        #expect(!recorder.calls.contains(.refresh), "no refresh before the server has the search")
        #expect(recorder.lastProfile?.onboardingCompletedAt == Self.now)
    }

    @Test("Leaving resumes at the same step; finishing clears it")
    func resume() async {
        let store = OnboardingDefaultsStore(defaults: nil)
        let (first, _) = model(store: store)
        first.start()
        first.advance(saving: false)
        #expect(model(store: store).0.step == .preferences)
        first.back()
        #expect(model(store: store).0.step == .cv)
        first.advance(saving: false)
        first.advance(saving: false)
        await first.finish(createSearch: false)
        #expect(model(store: store).0.step == .cv)
    }

    @Test("Start from scratch moves to Preferences")
    func scratch() {
        let (model, _) = model()
        model.start()
        model.startFromScratch()
        #expect(model.cv == .scratch)
        #expect(model.step == .preferences)
        #expect(model.showsNameField)
    }

    @Test("CV languages and levels in English, German and Turkish")
    func cvLanguages() {
        #expect(CVPreferenceHints.languageCode("Deutsch") == "de")
        #expect(CVPreferenceHints.languageCode("Türkçe") == "tr")
        #expect(CVPreferenceHints.languageCode("English") == "en")
        #expect(CVPreferenceHints.languageCode("en-GB") == "en")
        #expect(CVPreferenceHints.languageCode("Klingon") == nil)
        #expect(CVPreferenceHints.level("Native speaker") == .native)
        #expect(CVPreferenceHints.level("Muttersprache") == .native)
        #expect(CVPreferenceHints.level("C1") == .c1)
        #expect(CVPreferenceHints.level("Fluent") == .c2)
        #expect(CVPreferenceHints.level("Professional working proficiency") == .c2)
        #expect(CVPreferenceHints.level("İleri") == .c1)
        #expect(CVPreferenceHints.level(nil) == .b2)
        #expect(JobPreferencesDraft.countryCode(named: "Deutschland", locale: Locale(identifier: "de")) == "DE")
        #expect(JobPreferencesDraft.countryCode(named: "germany", locale: Locale(identifier: "tr")) == "DE")
        #expect(JobPreferencesDraft.countryCode(named: "Berlin", locale: Locale(identifier: "en")) == nil)
    }

    @Test("Settings › Job preferences saves the changed profile fields")
    func settingsSave() async throws {
        let document = try FixtureStore.document(.populated)
        let model = SettingsModel(now: document.now)
        model.load(UserData(document))
        let writer = SettingsWriter()
        model.writer = writer
        var draft = try #require(model.jobPreferences)
        draft.toggleSeniority(.principal)
        model.saveJobPreferences(draft)
        #expect(model.data.profile?.seniority == .principal)
        model.saveJobPreferences(draft)
        await settle()
        #expect(writer.batches.count == 1, "an unchanged draft writes nothing")
        guard case .updated(let before, let after)? = writer.batches.first?.profile else {
            Issue.record("a profile update")
            return
        }
        #expect(before.seniority != .principal && after.seniority == .principal)
        #expect(after.updatedAt == document.now)
    }

    @Test("bruteforcehr://settings/job-preferences links")
    func links() throws {
        #expect(SettingsRoute.path(for: try #require(URL(string: "bruteforcehr://settings/job-preferences"))) == [.jobPreferences])
        #expect(SettingsRoute.path(for: try #require(URL(string: "bruteforcehr://settings/job-preferences/salary")))
            == [.jobPreferences, .jobPreference(.salary)])
        #expect(SettingsRoute.path(for: try #require(URL(string: "bruteforcehr://settings/job-preferences/nope"))) == [.jobPreferences])
    }
}
