import BFHRCore
import BFHRUI
import Observation
import SwiftUI

/// Where the Jobs tab is: its stack and the job whose Apply sheet is open. Kept by
/// `LiveUserData`, so `bruteforcehr://jobs/…` links can set it.
@Observable
@MainActor
final class JobsNavigation {
    var path: [JobsRoute] = []
    var applying: String?

    /// Shows a Jobs link (IA.md "Deep links"): the stack, the scope, and the Apply sheet.
    func open(_ url: URL, feed: JobsFeedModel) {
        guard let destination = JobsRoute.destination(for: url) else {
            path = []
            return
        }
        if let scope = destination.scope { feed.scope = scope }
        path = destination.path
        applying = destination.applyJobId
    }
}

/// The Jobs tab with live data (M4): the feed over `jobMatches`, Job detail, Saved searches,
/// Hidden jobs and the Apply sheet.
struct JobsTabRoot: View {
    let live: LiveUserData
    @Environment(\.bfhrAccount) private var account

    var body: some View {
        @Bindable var navigation = live.jobsNavigation
        JobsStack(
            feed: live.jobs,
            path: $navigation.path,
            applying: $navigation.applying,
            detailModel: live.detailModel,
            applyModel: live.applyModel
        ) {
            if let account {
                ToolbarItem(placement: .topBarTrailing) {
                    AccountMenu(account) {
                        AvatarMonogram(initials: account.email.first.map { String($0).uppercased() } ?? "")
                    }
                }
            }
        }
        .accessibilityIdentifier("screen.jobs")
        .environment(\.bfhrReload) { live.reload() }
    }
}
