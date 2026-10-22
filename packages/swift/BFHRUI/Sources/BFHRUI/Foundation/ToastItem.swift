import Foundation

/// One toast (components.md `Toast`, decisions.md D11/D12): object + past-tense result and one
/// action. View models return these from optimistic mutations; views hand them to `ToastCenter`.
public struct ToastItem: Identifiable {
    public let id: UUID
    /// SF Symbol for the kind of change (`ToastGlyph`).
    public var glyph: String
    /// "Acme · moved to Screening". Over 60 characters extends the toast to 10 s.
    public var message: LocalizedStringResource
    /// Undo, View, Open… One action only.
    public var action: ToastAction?
    /// The change touched more than one item (bulk move, import): 10 s.
    public var isBulk: Bool

    public init(
        glyph: String,
        message: LocalizedStringResource,
        action: ToastAction? = nil,
        isBulk: Bool = false
    ) {
        self.id = UUID()
        self.glyph = glyph
        self.message = message
        self.action = action
        self.isBulk = isBulk
    }

    /// The message in the current locale (for duration rules and announcements).
    public var resolvedMessage: String { String(localized: message) }
}

public struct ToastAction {
    public enum Role: Sendable {
        /// Reverts the change. After it runs, the host shows "Restored" (+ `openAfterRestore`),
        /// never another Undo.
        case undo
        /// Any other single action (View, Open, Edit).
        case other
    }

    public var label: LocalizedStringResource
    public var role: Role
    public var perform: @MainActor () -> Void
    /// Optional "Open" on the follow-up "Restored" toast.
    public var openAfterRestore: (@MainActor () -> Void)?

    public init(
        label: LocalizedStringResource,
        role: Role = .other,
        openAfterRestore: (@MainActor () -> Void)? = nil,
        perform: @escaping @MainActor () -> Void
    ) {
        self.label = label
        self.role = role
        self.perform = perform
        self.openAfterRestore = openAfterRestore
    }

    /// "Undo".
    public static func undo(
        openAfterRestore: (@MainActor () -> Void)? = nil,
        perform: @escaping @MainActor () -> Void
    ) -> ToastAction {
        ToastAction(label: Strings.undo, role: .undo, openAfterRestore: openAfterRestore, perform: perform)
    }
}

/// Leading toast glyphs by kind of change, so moved / snoozed / confirmed toasts read apart.
public enum ToastGlyph {
    public static let moved = "arrow.right"
    public static let snoozed = "clock"
    public static let confirmed = "checkmark"
    public static let hidden = "eye.slash"
    public static let saved = "bookmark"
    public static let restored = "arrow.uturn.backward"
    public static let sending = "paperplane"
    public static let copied = "doc.on.doc"
    public static let info = "info.circle"
    public static let removed = "minus.circle"
    public static let archived = "archivebox"
}
