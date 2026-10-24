import SwiftUI

// BFHRUI also compiles for macOS so `swift test` runs on the Mac. These wrap the iOS-only SwiftUI
// API screens use most, so view code doesn't need `#if os(iOS)` for them. Anything else iOS-only
// goes behind `#if os(iOS)` in the view.

extension View {
    /// `.listStyle(.insetGrouped)` on iOS.
    public func bfhrInsetGroupedList() -> some View {
        #if os(iOS)
        listStyle(.insetGrouped)
        #else
        listStyle(.inset)
        #endif
    }

    /// `.navigationBarTitleDisplayMode(.large)` on iOS (tab roots).
    public func bfhrLargeTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.large)
        #else
        self
        #endif
    }

    /// `.navigationBarTitleDisplayMode(.inline)` on iOS (pushed screens, sheets).
    public func bfhrInlineTitle() -> some View {
        #if os(iOS)
        navigationBarTitleDisplayMode(.inline)
        #else
        self
        #endif
    }

    /// An email address field: email keyboard and content type, no capitals, no autocorrection.
    public func bfhrEmailInput() -> some View {
        #if os(iOS)
        textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        autocorrectionDisabled()
        #endif
    }

    /// A literal value (password, host name, user name): no capitals, no autocorrection.
    public func bfhrLiteralInput() -> some View {
        #if os(iOS)
        textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        autocorrectionDisabled()
        #endif
    }

    /// A whole number (a port): the number pad.
    public func bfhrPortInput() -> some View {
        #if os(iOS)
        keyboardType(.numberPad)
        #else
        self
        #endif
    }

    /// A web address: URL keyboard and content type, no capitals, no autocorrection.
    public func bfhrWebAddressInput() -> some View {
        #if os(iOS)
        textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        #else
        autocorrectionDisabled()
        #endif
    }
}

extension ToolbarItemPlacement {
    /// `.topBarTrailing` on iOS (the avatar, overflow menus).
    public static var bfhrTrailing: ToolbarItemPlacement {
        #if os(iOS)
        .topBarTrailing
        #else
        .automatic
        #endif
    }

    /// `.topBarLeading` on iOS.
    public static var bfhrLeading: ToolbarItemPlacement {
        #if os(iOS)
        .topBarLeading
        #else
        .navigation
        #endif
    }

    /// `.bottomBar` on iOS (Tracker filter / Add).
    public static var bfhrBottomBar: ToolbarItemPlacement {
        #if os(iOS)
        .bottomBar
        #else
        .automatic
        #endif
    }
}
