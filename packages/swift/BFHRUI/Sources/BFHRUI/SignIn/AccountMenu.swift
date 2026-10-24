import SwiftUI

/// The signed-in account, for the avatar's menu. The app puts it in the environment while signed
/// in; without it (design mode, previews) the avatar stays a plain button.
public struct AccountContext {
    public let email: String
    public let signOut: () throws -> Void

    public init(email: String, signOut: @escaping () throws -> Void) {
        self.email = email
        self.signOut = signOut
    }
}

extension EnvironmentValues {
    @Entry public var bfhrAccount: AccountContext? = nil
}

/// The avatar's menu (IA.md "Avatar"): who is signed in, Settings (the sheet, through
/// `bruteforcehr://settings`) and Sign out.
public struct AccountMenu<MenuLabel: View>: View {
    private let account: AccountContext
    private let label: MenuLabel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL

    public init(_ account: AccountContext, @ViewBuilder label: () -> MenuLabel) {
        self.account = account
        self.label = label()
    }

    public var body: some View {
        Menu {
            Section {
                Button {
                    if let url = URL(string: "bruteforcehr://settings") { openURL(url) }
                } label: {
                    Label { Text(Strings.settings) } icon: { Image(systemName: "gearshape") }
                }
                .accessibilityIdentifier("account.settings")
            }
            Section {
                Button(action: signOut) {
                    Label {
                        Text(SignInStrings.signOut)
                    } icon: {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                    }
                }
                .accessibilityIdentifier("account.signOut")
            } header: {
                Text(bfhrPlain: SignInStrings.signedInAs(account.email))
            }
        } label: {
            label
        }
        .accessibilityLabel(Text(SignInStrings.account))
        .accessibilityIdentifier("account.menu")
    }

    private func signOut() {
        do {
            try account.signOut()
        } catch {
            toasts?.show(ToastItem(glyph: "exclamationmark.circle", message: SignInStrings.signOutFailed))
        }
    }
}
