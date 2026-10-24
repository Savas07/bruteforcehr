import BFHRCore
import SwiftUI

/// Makes Connect email models for the screens that offer it (Settings › Mail accounts, the Mail
/// tab's empty state, Today's connect card, Reconnect). The app builds them on its callables and
/// keeps them on the account snapshots; design mode builds them on a fake service.
public struct MailConnectLauncher {
    public let makeModel: (_ reconnecting: MailAccount?) -> MailConnectModel

    public init(makeModel: @escaping (_ reconnecting: MailAccount?) -> MailConnectModel) {
        self.makeModel = makeModel
    }
}

extension EnvironmentValues {
    @Entry public var bfhrMailConnect: MailConnectLauncher? = nil
}

extension View {
    /// Presents Connect email (or Reconnect for `reconnecting`) while `isPresented` is true. "Review
    /// emails" after the check opens Mail › To review.
    public func bfhrMailConnectSheet(isPresented: Binding<Bool>, reconnecting: MailAccount? = nil) -> some View {
        modifier(MailConnectSheetModifier(isPresented: isPresented, reconnecting: reconnecting))
    }
}

private struct MailConnectSheetModifier: ViewModifier {
    @Binding var isPresented: Bool
    let reconnecting: MailAccount?
    @Environment(\.bfhrMailConnect) private var launcher

    func body(content: Content) -> some View {
        content.sheet(isPresented: $isPresented) {
            if let launcher {
                MailConnectHost(launcher: launcher, reconnecting: reconnecting)
            }
        }
    }
}

/// Keeps one model for the sheet's lifetime.
private struct MailConnectHost: View {
    @State private var model: MailConnectModel
    @Environment(\.openURL) private var openURL

    init(launcher: MailConnectLauncher, reconnecting: MailAccount?) {
        _model = State(initialValue: launcher.makeModel(reconnecting))
    }

    var body: some View {
        MailConnectSheet(model: model) {
            if let url = URL(string: "bruteforcehr://mail") { openURL(url) }
        }
    }
}
