import BFHRDesignTokens
import SwiftUI

/// A form text field whose label stays visible above the value (the CV editor's floating-label
/// convention): the label never disappears once the field is filled, long German labels wrap,
/// and the field grows with its text at accessibility sizes instead of clipping. Used by Log an
/// application and the Tracker's interview, contact and reminder editors.
struct TrackerFormField: View {
    enum Kind {
        case text
        case organization
        case jobTitle
        case city
        case name
        case email
        case url
    }

    private let label: LocalizedStringResource
    @Binding private var text: String
    private let prompt: LocalizedStringResource?
    private let multiline: Bool
    private let kind: Kind

    init(
        _ label: LocalizedStringResource,
        text: Binding<String>,
        prompt: LocalizedStringResource? = nil,
        multiline: Bool = false,
        kind: Kind = .text
    ) {
        self.label = label
        _text = text
        self.prompt = prompt
        self.multiline = multiline
        self.kind = kind
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .accessibilityHidden(true)
            field
                .font(.bfhr(.body))
                .lineLimit(multiline ? 3...12 : 1...6)
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private var field: some View {
        let base = TextField(text: multiline ? $text : singleLine, prompt: prompt.map { Text($0) }, axis: .vertical) { Text(label) }
            .accessibilityLabel(Text(label))
        #if os(iOS)
        switch kind {
        case .text: base
        case .organization: base.textContentType(.organizationName)
        case .jobTitle: base.textContentType(.jobTitle)
        case .city: base.textContentType(.addressCity)
        case .name: base.textContentType(.name)
        case .email: base.textContentType(.emailAddress).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
        case .url: base.textContentType(.URL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        #else
        base
        #endif
    }

    /// Single-value fields drop line breaks, so Return can't split a company or a name.
    private var singleLine: Binding<String> {
        Binding(get: { text }, set: { text = $0.replacingOccurrences(of: "\n", with: " ") })
    }
}

/// An inline validation message under a field: icon + text, never color alone.
struct TrackerFieldError: View {
    private let message: LocalizedStringResource

    init(_ message: LocalizedStringResource) {
        self.message = message
    }

    var body: some View {
        Label { Text(message) } icon: { Image(systemName: "exclamationmark.circle") }
            .labelStyle(.bfhrCompact)
            .font(.bfhr(.footnote))
            .foregroundStyle(BFHRTone.danger.text)
    }
}
