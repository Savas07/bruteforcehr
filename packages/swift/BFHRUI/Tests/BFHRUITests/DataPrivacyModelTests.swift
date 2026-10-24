import Foundation
import Testing
@testable import BFHRUI

private nonisolated let actionLink = "https://bruteforcehr.firebaseapp.com/__/auth/action?apiKey=KEY&mode=signIn&oobCode=CODE&continueUrl=https://bruteforcehr.web.app/auth/finish&lang=en"
private nonisolated let now = Date(timeIntervalSince1970: 1_792_654_200)

/// Records calls and answers with what each test sets.
private final class FakeAccountDataService: AccountDataService {
    var exportResult: Result<AccountExport, AccountDataError> = .success(FakeAccountDataService.export)
    var downloadResult: Result<URL, AccountDataError> = .success(URL(fileURLWithPath: "/tmp/export.zip"))
    var lastSignIn: Date? = now.addingTimeInterval(-60)
    var sendError: SignInError?
    var reauthError: SignInError?
    var deleteResults: [AccountDataError?] = [nil]
    var calls: [String] = []

    static let export = AccountExport(
        exportId: "e1", storagePath: "users/u/exports/e1.zip", fileName: "bruteforcehr-export.zip",
        sizeBytes: 14_200_000, documentCount: 412, fileCount: 9,
        createdAt: now, expiresAt: now.addingTimeInterval(7 * 86_400)
    )

    func createExport() async throws -> AccountExport {
        calls.append("createExport")
        return try exportResult.get()
    }

    func download(_ export: AccountExport) async throws -> URL {
        calls.append("download")
        return try downloadResult.get()
    }

    func lastSignInDate() async throws -> Date {
        guard let lastSignIn else { throw AccountDataError.offline }
        return lastSignIn
    }

    func sendReauthLink(to email: String) async throws {
        calls.append("send \(email)")
        if let sendError { throw sendError }
    }

    func reauthenticate(email: String, actionLink: String) async throws {
        calls.append("reauth \(email)")
        if let reauthError { throw reauthError }
        lastSignIn = now
    }

    func deleteAccount() async throws {
        calls.append("delete")
        if let error = deleteResults.isEmpty ? nil : deleteResults.removeFirst() { throw error }
    }

    func finishDeletion() {
        calls.append("finish")
    }
}

private func makeModel(_ service: FakeAccountDataService, language: String = "en", clock: @escaping () -> Date = { now }) -> DataPrivacyModel {
    DataPrivacyModel(service: service, email: "deniz@example.com", languageCode: language, now: clock)
}

@Suite("Delete confirmation word")
struct DeleteConfirmationTests {
    private let tr = Locale(identifier: "tr")
    private let de = Locale(identifier: "de")
    private let en = Locale(identifier: "en")

    @Test("Turkish SİL accepts SIL, sil, SİL, sıl and spaces around", arguments: ["SİL", "SIL", "sil", "Sil", "sıl", "  SİL ", "si̇l"])
    func turkish(input: String) {
        #expect(DeleteConfirmation.matches(input, word: "SİL", locale: tr))
    }

    @Test("Any case of DELETE and LÖSCHEN", arguments: [("delete", "DELETE"), ("Delete", "DELETE"), ("löschen", "LÖSCHEN"), ("LÖSCHEN\n", "LÖSCHEN")])
    func caseInsensitive(input: String, word: String) {
        #expect(DeleteConfirmation.matches(input, word: word, locale: word == "DELETE" ? en : de))
    }

    @Test("Other text doesn't match", arguments: [("", "DELETE"), ("DELET", "DELETE"), ("DELETE NOW", "DELETE"), ("LOSCHEN", "LÖSCHEN"), ("SL", "SİL"), ("D E L E T E", "DELETE")])
    func mismatches(input: String, word: String) {
        #expect(!DeleteConfirmation.matches(input, word: word, locale: tr))
    }

    @Test("An empty word never matches")
    func emptyWord() {
        #expect(!DeleteConfirmation.matches("", word: "", locale: en))
    }

    /// The catalog's word in each language, typed in lower case on that language's keyboard,
    /// confirms. (`swift test` copies string catalogs uncompiled, so the lookup itself is covered
    /// by the app's UI tests in Turkish and German.)
    @Test("Each language's catalog word confirms in any case", arguments: [("en", "DELETE"), ("tr", "SİL"), ("de", "LÖSCHEN")])
    func catalogWord(language: String, word: String) throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Sources/BFHRUI/Settings/DataPrivacy/DataPrivacy.xcstrings")
        let json = try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any]
        let entry = (json?["strings"] as? [String: Any])?["dataPrivacy.delete.confirm.word"] as? [String: Any]
        let unit = ((entry?["localizations"] as? [String: Any])?[language] as? [String: Any])?["stringUnit"] as? [String: Any]
        let value = try #require(unit?["value"] as? String)
        #expect(value == word)
        let locale = Locale(identifier: language)
        #expect(DeleteConfirmation.matches(value.lowercased(with: locale), word: value, locale: locale))
        #expect(DeleteConfirmation.matches(value.lowercased(), word: value, locale: locale))
    }
}

@Suite("Data & privacy copy")
struct DataPrivacyCopyTests {
    @Test("Export reasons map to their copy; anything else is generic")
    func exportReasons() {
        #expect(ExportFailure(AccountDataError.exportTooSoon) == .tooSoon)
        #expect(ExportFailure(AccountDataError.exportDailyLimit) == .dailyLimit)
        #expect(ExportFailure(AccountDataError.exportTooLarge) == .tooLarge)
        #expect(ExportFailure(AccountDataError.emailUnverified) == .generic)
        #expect(ExportFailure(AccountDataError.offline) == .generic)
        #expect(ExportFailure(URLError(.timedOut)) == .generic)
        #expect(ExportFailureAlert.text(.tooSoon).key == "dataPrivacy.export.error.tooSoon")
        #expect(ExportFailureAlert.text(.dailyLimit).key == "dataPrivacy.export.error.dailyLimit")
        #expect(ExportFailureAlert.text(.tooLarge).key == "dataPrivacy.export.error.tooLarge")
        #expect(ExportFailureAlert.text(.generic).key == "dataPrivacy.export.error.generic")
        #expect(ExportFailure.generic.isRetryable && !ExportFailure.tooSoon.isRetryable)
    }

    @Test("Re-authentication problems reuse the sign-in copy")
    func reauthProblems() {
        #expect(ReauthProblemAlert.title(.sendOffline).key == "signIn.sendError.offline.title")
        #expect(ReauthProblemAlert.title(.sendTooManyRequests).key == "signIn.sendError.tooMany.title")
        #expect(ReauthProblemAlert.title(.linkExpired).key == "signIn.link.expired.title")
        #expect(ReauthProblemAlert.title(.linkUnusable).key == "signIn.link.unusable.title")
        #expect(ReauthProblemAlert.title(.linkOffline).key == "signIn.link.retry.title")
    }
}

@Suite("Data & privacy model")
struct DataPrivacyModelTests {
    // MARK: Export

    @Test("Create export prepares, then downloads the ZIP")
    func exportFlow() async {
        let service = FakeAccountDataService()
        let model = makeModel(service)
        #expect(model.canCreateExport)
        await model.createExport()
        #expect(model.export == .ready(FakeAccountDataService.export, .downloaded(URL(fileURLWithPath: "/tmp/export.zip"))))
        #expect(service.calls == ["createExport", "download"])
        model.exportSaved(to: URL(fileURLWithPath: "/Users/me/Files/bruteforcehr-export.zip"))
        #expect(model.savedFileName == "bruteforcehr-export.zip")
    }

    @Test("A refused export shows its reason and nothing is downloaded")
    func exportRefused() async {
        let service = FakeAccountDataService()
        service.exportResult = .failure(.exportDailyLimit)
        let model = makeModel(service)
        await model.createExport()
        #expect(model.export == .failed(.dailyLimit))
        #expect(service.calls == ["createExport"])
    }

    @Test("A failed download keeps the export and tries again")
    func downloadRetry() async {
        let service = FakeAccountDataService()
        service.downloadResult = .failure(.offline)
        let model = makeModel(service)
        await model.createExport()
        #expect(model.export == .ready(FakeAccountDataService.export, .failed))
        service.downloadResult = .success(URL(fileURLWithPath: "/tmp/again.zip"))
        await model.retryDownload()
        #expect(model.export == .ready(FakeAccountDataService.export, .downloaded(URL(fileURLWithPath: "/tmp/again.zip"))))
        #expect(service.calls == ["createExport", "download", "download"])
    }

    @Test("Offline, Create export does nothing")
    func exportOffline() async {
        let service = FakeAccountDataService()
        let model = makeModel(service)
        model.isOnline = false
        #expect(!model.canCreateExport)
        await model.createExport()
        #expect(model.export == .idle)
        #expect(service.calls.isEmpty)
    }

    @Test("The ready card goes once the file expires")
    func expiry() async {
        var clock = now
        let service = FakeAccountDataService()
        let model = makeModel(service) { clock }
        await model.createExport()
        model.expireExportIfNeeded()
        #expect(model.export != .idle)
        clock = FakeAccountDataService.export.expiresAt
        model.expireExportIfNeeded()
        #expect(model.export == .idle)
        #expect(model.savedFileName == nil)
    }

    // MARK: Delete

    @Test("Recent sign-in window: five minutes back, a minute of skew ahead")
    func recentSignIn() {
        #expect(DataPrivacyModel.isRecentSignIn(now.addingTimeInterval(-300), at: now))
        #expect(!DataPrivacyModel.isRecentSignIn(now.addingTimeInterval(-301), at: now))
        #expect(DataPrivacyModel.isRecentSignIn(now.addingTimeInterval(60), at: now))
        #expect(!DataPrivacyModel.isRecentSignIn(now.addingTimeInterval(61), at: now))
    }

    @Test("A recent sign-in deletes once the word matches, then signs out")
    func deleteRecent() async {
        let service = FakeAccountDataService()
        let model = makeModel(service)
        await model.beginDelete()
        #expect(model.isDeletePresented)
        #expect(model.reauth == .notNeeded)
        #expect(!model.canDelete)
        model.confirmationText = "delete"
        #expect(model.canDelete)
        await model.delete()
        #expect(model.deletion == .deleted)
        #expect(service.calls == ["delete", "finish"])
    }

    @Test("An old sign-in needs the link first; the typed word is kept")
    func deleteNeedsReauth() async throws {
        let service = FakeAccountDataService()
        service.lastSignIn = now.addingTimeInterval(-86_400)
        let model = makeModel(service)
        await model.beginDelete()
        #expect(model.reauth == .needed)
        model.confirmationText = "DELETE"
        #expect(!model.canDelete)
        #expect(!model.acceptsReauthLink || model.reauth == .needed)

        await model.sendReauthLink()
        #expect(model.reauth == .sent)
        #expect(service.calls == ["send deniz@example.com"])

        var components = URLComponents(string: "bruteforcehr://auth/finish")!
        components.queryItems = [URLQueryItem(name: "link", value: actionLink)]
        let handled = await model.openReauthLink(try #require(components.url))
        #expect(handled)
        #expect(model.reauth == .done)
        #expect(model.confirmationText == "DELETE")
        #expect(model.canDelete)
        await model.delete()
        #expect(model.deletion == .deleted)
        #expect(service.calls.suffix(3) == ["reauth deniz@example.com", "delete", "finish"])
    }

    @Test("The server's recent_sign_in_required brings back the step without deleting")
    func serverRequiresReauth() async {
        let service = FakeAccountDataService()
        service.deleteResults = [.recentSignInRequired]
        let model = makeModel(service)
        await model.beginDelete()
        model.confirmationText = "DELETE"
        await model.delete()
        #expect(model.reauth == .needed)
        #expect(model.deletion == .editing)
        #expect(!service.calls.contains("finish"))
    }

    @Test("A sign-in that aged while typing asks again before calling the server")
    func agedWhileTyping() async {
        var clock = now
        let service = FakeAccountDataService()
        let model = makeModel(service) { clock }
        await model.beginDelete()
        #expect(model.reauth == .notNeeded)
        model.confirmationText = "DELETE"
        clock = now.addingTimeInterval(400)
        await model.delete()
        #expect(model.reauth == .needed)
        #expect(service.calls.isEmpty)
    }

    @Test("A failed deletion can be tried again")
    func deleteRetry() async {
        let service = FakeAccountDataService()
        service.deleteResults = [.other("internal"), nil]
        let model = makeModel(service)
        await model.beginDelete()
        model.confirmationText = "DELETE"
        await model.delete()
        #expect(model.deletion == .failed)
        #expect(model.canDelete)
        await model.delete()
        #expect(model.deletion == .deleted)
        #expect(service.calls == ["delete", "delete", "finish"])
    }

    @Test("Offline, Delete everything stays disabled")
    func deleteOffline() async {
        let service = FakeAccountDataService()
        let model = makeModel(service)
        await model.beginDelete()
        model.confirmationText = "DELETE"
        model.isOnline = false
        #expect(!model.canDelete)
        await model.delete()
        #expect(service.calls.isEmpty)
    }

    @Test("Opening Delete account again starts with an empty field; leaving is blocked while deleting")
    func reopen() async {
        let model = makeModel(FakeAccountDataService())
        await model.beginDelete()
        model.confirmationText = "DEL"
        model.endDelete()
        #expect(!model.isDeletePresented)
        await model.beginDelete()
        #expect(model.confirmationText.isEmpty)
        model.deletion = .deleting
        model.endDelete()
        #expect(model.isDeletePresented)
    }

    // MARK: Re-authentication

    @Test("Send problems keep the step and say why")
    func sendProblems() async {
        let service = FakeAccountDataService()
        service.lastSignIn = nil
        service.sendError = .tooManyRequests
        let model = makeModel(service)
        await model.beginDelete()
        #expect(model.reauth == .needed)
        await model.sendReauthLink()
        #expect(model.reauth == .needed)
        #expect(model.reauthProblem == .sendTooManyRequests)
    }

    @Test("Link problems: expired asks for a new link; offline keeps the link for Try again")
    func linkProblems() async throws {
        let service = FakeAccountDataService()
        service.lastSignIn = now.addingTimeInterval(-3600)
        let model = makeModel(service)
        await model.beginDelete()
        await model.sendReauthLink()
        let url = try #require(URL(string: actionLink))

        service.reauthError = .expired
        await model.openReauthLink(url)
        #expect(model.reauth == .needed)
        #expect(model.reauthProblem == .linkExpired)

        service.reauthError = .offline
        await model.openReauthLink(url)
        #expect(model.reauth == .sent)
        #expect(model.reauthProblem == .linkOffline)

        service.reauthError = nil
        await model.retryReauth()
        #expect(model.reauth == .done)
        #expect(model.reauthProblem == nil)
    }

    @Test("A link for another account is unusable; other URLs and finished steps aren't taken")
    func linkRouting() async throws {
        let service = FakeAccountDataService()
        service.lastSignIn = now.addingTimeInterval(-3600)
        let model = makeModel(service)
        let url = try #require(URL(string: actionLink))
        #expect(await model.openReauthLink(url) == false)
        await model.beginDelete()
        #expect(await model.openReauthLink(try #require(URL(string: "bruteforcehr://tracker"))) == false)
        service.reauthError = .invalidEmail
        #expect(await model.openReauthLink(url))
        #expect(model.reauthProblem == .linkUnusable)
        service.reauthError = nil
        await model.openReauthLink(url)
        #expect(model.reauth == .done)
        #expect(await model.openReauthLink(url) == false)
    }

    @Test("Re-authentication done survives reopening while the sign-in is recent")
    func doneSurvivesReopen() async throws {
        var clock = now
        let service = FakeAccountDataService()
        service.lastSignIn = now.addingTimeInterval(-3600)
        let model = makeModel(service) { clock }
        await model.beginDelete()
        await model.openReauthLink(try #require(URL(string: actionLink)))
        #expect(model.reauth == .done)
        model.endDelete()
        await model.beginDelete()
        #expect(model.reauth == .done)
        clock = now.addingTimeInterval(301)
        await model.beginDelete()
        #expect(model.reauth == .needed)
    }
}

@Suite("Sign-in after deletion")
struct SignInDeletionNoticeTests {
    private final class Service: EmailLinkAuthService {
        var signedOut = false
        func sendSignInLink(to email: String, languageCode: String) async throws {}
        func isSignInLink(_ actionLink: String) -> Bool { true }
        func signIn(email: String, actionLink: String) async throws {}
        func signOut() throws { signedOut = true }
    }

    @Test("Signs out, forgets the address and shows the notice once")
    func notice() async {
        let service = Service()
        let store = SignInStore(defaults: nil)
        store.lastEmail = "deniz@example.com"
        let model = SignInModel(service: service, store: store, signedInEmail: "deniz@example.com", languageCode: "en")
        model.accountDeleted()
        #expect(service.signedOut)
        #expect(!model.isSignedIn)
        #expect(model.notice == .accountDeleted)
        #expect(model.emailDraft.isEmpty)
        #expect(store.lastEmail == nil)
        model.emailDraft = "new@example.com"
        await model.sendLink()
        #expect(model.notice == nil)
    }
}
