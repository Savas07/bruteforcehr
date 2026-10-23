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
        // The label is visible above the field, so an empty field shows no placeholder unless one
        // is given (an example value), instead of repeating the label.
        let base = TextField(text: multiline ? $text : singleLine, prompt: prompt.map { Text($0) } ?? Text(verbatim: ""), axis: .vertical) { Text(label) }
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

/// A picker row for the Tracker's forms: the system menu picker (label left, value right) up to
/// the largest standard size. At accessibility sizes the system controls clip long values, so the
/// row is a navigation row (label above the current value, both wrapping) that pushes a list of
/// the options with a checkmark on the current one. The forms sit in a `NavigationStack`.
struct TrackerPickerRow<Value: Hashable>: View {
    private let label: LocalizedStringResource
    @Binding private var selection: Value
    private let options: [Value]
    private let title: (Value) -> Text
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    init(_ label: LocalizedStringResource, selection: Binding<Value>, options: [Value], title: @escaping (Value) -> Text) {
        self.label = label
        _selection = selection
        self.options = options
        self.title = title
    }

    var body: some View {
        if dynamicTypeSize.isAccessibilitySize {
            NavigationLink {
                TrackerOptionList(label: label, selection: $selection, options: options, title: title)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    Text(label)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    title(selection)
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(Text(label))
            .accessibilityValue(title(selection))
            .accessibilityAddTraits(.isButton)
        } else {
            Picker(selection: $selection) {
                ForEach(options, id: \.self) { option in title(option).tag(option) }
            } label: {
                Text(label)
            }
        }
    }
}

/// The options of a `TrackerPickerRow` at accessibility sizes: one wrapping row each, ✓ on the
/// current one (also its VoiceOver Selected trait); choosing goes back.
private struct TrackerOptionList<Value: Hashable>: View {
    let label: LocalizedStringResource
    @Binding var selection: Value
    let options: [Value]
    let title: (Value) -> Text
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        List {
            ForEach(options, id: \.self) { option in
                Button {
                    selection = option
                    dismiss()
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s2) {
                        title(option)
                            .font(.bfhr(.body))
                            .foregroundStyle(BFHRColor.Fg.primary)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        if option == selection {
                            Image(systemName: "checkmark")
                                .font(.bfhr(.body, emphasized: true))
                                .foregroundStyle(BFHRColor.Accent.text)
                                .accessibilityHidden(true)
                        }
                    }
                    .frame(minHeight: BFHRHitTarget.minimum)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option == selection ? .isSelected : [])
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(label))
        .bfhrInlineTitle()
    }
}

/// "Remove …" / "Delete application" at the end of a form: the danger tone on the row (not the
/// system red, which only nearly passes contrast on the grouped background), wrapping at
/// accessibility sizes.
struct TrackerDestructiveRow: View {
    private let title: LocalizedStringResource
    private let action: () -> Void

    init(_ title: LocalizedStringResource, action: @escaping () -> Void) {
        self.title = title
        self.action = action
    }

    var body: some View {
        Button(role: .destructive, action: action) {
            Text(title)
                .font(.bfhr(.body))
                .foregroundStyle(BFHRTone.danger.text)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, minHeight: BFHRHitTarget.minimum, alignment: .leading)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}
