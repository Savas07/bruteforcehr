import BFHRCore
import BFHRDesignTokens
import SwiftUI
import UniformTypeIdentifiers

/// First run after sign-in (onboarding-signin.md "Decision — iOS", Screens 3–4, plus Finish):
/// Step 1 CV, Step 2 Preferences, Step 3 the first saved search. Skip for now on every step; Back
/// from step 2. The step label is text as well as the bar, and VoiceOver hears the new step.
public struct OnboardingScreen: View {
    @Bindable private var model: OnboardingModel
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(model: OnboardingModel) {
        self.model = model
    }

    public var body: some View {
        NavigationStack {
            Group {
                switch model.step {
                case .cv: OnboardingCVStep(model: model)
                case .preferences: OnboardingPreferencesStep(model: model)
                case .finish: OnboardingFinishStep(model: model)
                }
            }
            .id(model.step)
            .transition(reduceMotion ? .opacity : .asymmetric(insertion: .move(edge: .trailing).combined(with: .opacity), removal: .opacity))
            .toolbar {
                if model.step != .cv {
                    ToolbarItem(placement: .bfhrLeading) {
                        Button { withAnimation(animation) { model.back() } } label: {
                            Label { Text(OnboardingStrings.back) } icon: { Image(systemName: "chevron.backward") }
                        }
                        .disabled(model.isFinishing)
                        .accessibilityIdentifier("onboarding.back")
                    }
                }
                ToolbarItem(placement: .bfhrTrailing) {
                    Button { withAnimation(animation) { model.advance(saving: false) } } label: { Text(OnboardingStrings.skip) }
                        .disabled(model.isFinishing)
                        .accessibilityIdentifier("onboarding.skip")
                }
            }
            .bfhrInlineTitle()
        }
        .accessibilityIdentifier("onboarding")
        .onChange(of: model.step) { _, step in
            AccessibilityNotification.Announcement(String(localized: OnboardingStrings.stepOf(step.rawValue, OnboardingStep.allCases.count))).post()
        }
    }

    private var animation: Animation? {
        BFHRMotion.animation(.base, easing: .enter, reduceMotion: reduceMotion)
    }
}

// MARK: - Shared chrome

/// "Step 2 of 3", the three-segment bar, the title and the body: the first rows of each step.
struct OnboardingHeader: View {
    let step: OnboardingStep
    let title: LocalizedStringResource
    let message: LocalizedStringResource

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                HStack(spacing: BFHRSpace.s1) {
                    ForEach(OnboardingStep.allCases, id: \.self) { segment in
                        Capsule()
                            .fill(segment.rawValue <= step.rawValue ? BFHRColor.Accent.solid : BFHRColor.Line.control)
                            .frame(height: 4)
                    }
                }
                .accessibilityHidden(true)
                .padding(.bottom, BFHRSpace.s2)
                Text(OnboardingStrings.stepOf(step.rawValue, OnboardingStep.allCases.count))
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .accessibilityIdentifier("onboarding.stepLabel")
                Text(title)
                    .font(.bfhr(.title2, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityAddTraits(.isHeader)
                    .accessibilityIdentifier("onboarding.title")
                Text(message)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .listRowInsets(EdgeInsets(top: BFHRSpace.s2, leading: BFHRSpace.s4, bottom: BFHRSpace.s2, trailing: BFHRSpace.s4))
            .listRowBackground(Color.clear)
        }
    }
}

/// The sticky primary action above the home indicator, on the bar material.
struct OnboardingBottomBar<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(spacing: BFHRSpace.s2) {
            content
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s2)
        .frame(maxWidth: .infinity)
        .background(.bar)
        .overlay(alignment: .top) { Divider() }
    }
}

// MARK: - Step 1: CV

struct OnboardingCVStep: View {
    @Bindable var model: OnboardingModel
    @State private var picker: PickerKind?
    @State private var showsHowTo = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    enum PickerKind: Identifiable {
        case file
        case linkedIn
        var id: Self { self }
        var types: [UTType] {
            switch self {
            case .file: [.pdf, .json, UTType("org.openxmlformats.wordprocessingml.document")].compactMap { $0 }
            case .linkedIn: [.zip]
            }
        }
    }

    var body: some View {
        List {
            OnboardingHeader(step: .cv, title: OnboardingStrings.cvTitle, message: OnboardingStrings.cvBody)
            switch model.cv {
            case .choosing:
                options
            case .scratch:
                Section {
                    Label { Text(OnboardingStrings.scratchDone) } icon: { Image(systemName: "doc.badge.plus") }
                        .labelStyle(.bfhrCompact)
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .accessibilityIdentifier("onboarding.cv.scratchDone")
                }
            case .reading(let fileName, let kind):
                attached(fileName: fileName, kind: kind) {
                    HStack(spacing: BFHRSpace.s2) {
                        // The text says it; the spinner is decoration for VoiceOver.
                        ProgressView().controlSize(.small).accessibilityHidden(true)
                        Text(OnboardingStrings.reading)
                    }
                    Text(OnboardingStrings.readingNote)
                } trailing: {
                    Button { model.resetCV() } label: {
                        Text(OnboardingStrings.cancel)
                            .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                            .contentShape(Rectangle())
                    }
                        .buttonStyle(.plain)
                        .foregroundStyle(BFHRColor.Accent.text)
                        .accessibilityIdentifier("onboarding.cv.cancel")
                }
            case .found(let fileName, let kind, let roles, let skills):
                attached(fileName: fileName, kind: kind) {
                    Label { Text(OnboardingStrings.found(roles: roles, skills: skills)) } icon: { Image(systemName: "checkmark.circle.fill") }
                        .labelStyle(.bfhrCompact)
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(OnboardingStrings.savedToStudio)
                } trailing: {
                    EmptyView()
                }
            case .failed(let fileName, let error):
                Section {
                    attachedRow(fileName: fileName, kind: CVImportFileKind(fileExtension: (fileName as NSString).pathExtension)) {
                        Text(OnboardingStrings.importError(error))
                            .foregroundStyle(BFHRTone.warning.text)
                    } trailing: {
                        Button { model.resetCV() } label: {
                            Image(systemName: "trash")
                                .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                                .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .accessibilityLabel(Text(OnboardingStrings.remove))
                        .accessibilityIdentifier("onboarding.cv.remove")
                    }
                    Button { picker = .file } label: { Text(OnboardingStrings.chooseDifferent) }
                        .accessibilityIdentifier("onboarding.cv.chooseDifferent")
                    Button { model.startFromScratch() } label: { Text(OnboardingStrings.scratch) }
                }
            }
            if model.importer != nil, model.cv != .scratch {
                Section {
                    EmptyView()
                } footer: {
                    Label { Text(OnboardingStrings.aiDisclosure) } icon: { Image(systemName: "sparkles") }
                        .labelStyle(.bfhrCompact)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
        }
        .bfhrInsetGroupedList()
        .animation(BFHRMotion.animation(.base, easing: .enter, reduceMotion: reduceMotion), value: model.cv)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.cv != .choosing {
                OnboardingBottomBar {
                    Button { model.advance() } label: { Text(OnboardingStrings.next) }
                        .buttonStyle(.bfhr(.primary, fullWidth: true))
                        .accessibilityIdentifier("onboarding.continue")
                }
            }
        }
        .fileImporter(isPresented: Binding(get: { picker != nil }, set: { if !$0 { picker = nil } }),
                      allowedContentTypes: picker?.types ?? []) { result in
            if case .success(let url) = result { open(url) }
        }
        .sheet(isPresented: $showsHowTo) { howToSheet }
        #if DEBUG
        // Live end-to-end test (OnboardingEndToEndTests): `-BFHRImportFile <path>` imports that
        // file through the real importer instead of the Files picker.
        .task {
            let arguments = ProcessInfo.processInfo.arguments
            if model.cv == .choosing, model.importer != nil, let index = arguments.firstIndex(of: "-BFHRImportFile"),
               arguments.indices.contains(index + 1) {
                open(URL(fileURLWithPath: arguments[index + 1]))
            }
        }
        #endif
    }

    private var options: some View {
        Section {
            if model.importer != nil {
                OptionRow(glyph: "doc.text", title: OnboardingStrings.upload, caption: OnboardingStrings.uploadCaption) { picker = .file }
                    .accessibilityIdentifier("onboarding.cv.upload")
                VStack(alignment: .leading, spacing: 0) {
                    OptionRow(glyph: "person.crop.rectangle", title: OnboardingStrings.linkedIn, caption: OnboardingStrings.linkedInCaption) { picker = .linkedIn }
                        .accessibilityIdentifier("onboarding.cv.linkedin")
                    Button { showsHowTo = true } label: {
                        Text(OnboardingStrings.howToGetIt)
                            .font(.bfhr(.footnote))
                            .frame(minHeight: BFHRHitTarget.minimum)
                            .contentShape(Rectangle())
                    }
                        .buttonStyle(.plain)
                        .foregroundStyle(BFHRColor.Accent.text)
                        .padding(.leading, OptionRow.textInset)
                        .accessibilityIdentifier("onboarding.cv.howTo")
                }
            }
            OptionRow(glyph: "square.and.pencil", title: OnboardingStrings.scratch, caption: OnboardingStrings.scratchCaption) {
                model.startFromScratch()
            }
            .accessibilityIdentifier("onboarding.cv.scratch")
        }
    }

    @ViewBuilder
    private func attached(
        fileName: String, kind: CVImportFileKind, @ViewBuilder status: () -> some View, @ViewBuilder trailing: () -> some View
    ) -> some View {
        Section {
            attachedRow(fileName: fileName, kind: kind, status: status, trailing: trailing)
        }
    }

    private func attachedRow(
        fileName: String, kind: CVImportFileKind?, @ViewBuilder status: () -> some View, @ViewBuilder trailing: () -> some View
    ) -> some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            Text(verbatim: kind.map(Self.badge) ?? "?")
                .font(.bfhr(.caption2, emphasized: true))
                .foregroundStyle(BFHRColor.Accent.text)
                .padding(.horizontal, BFHRSpace.s2)
                .padding(.vertical, BFHRSpace.s1)
                .background(BFHRColor.Accent.subtle, in: BFHRRadius.shape(BFHRRadius.sm))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                Text(verbatim: fileName)
                    .font(.bfhr(.body, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .lineLimit(3)
                    .truncationMode(.middle)
                    // "Scan_0042.pdf" reads as words, not "underscore".
                    .accessibilityLabel(Text(verbatim: Self.spokenFileName(fileName)))
                VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                    status()
                }
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing()
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityIdentifier("onboarding.cv.file")
    }

    static func spokenFileName(_ name: String) -> String {
        name.replacingOccurrences(of: "_", with: " ").replacingOccurrences(of: "-", with: " ")
    }

    static func badge(_ kind: CVImportFileKind) -> String {
        switch kind {
        case .pdf: "PDF"
        case .docx: "DOCX"
        case .json: "JSON"
        case .linkedinZip: "ZIP"
        }
    }

    private var howToSheet: some View {
        NavigationStack {
            ScrollView {
                Text(OnboardingStrings.howToBody)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(BFHRSpace.s4)
            }
            .navigationTitle(Text(OnboardingStrings.howToTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button { showsHowTo = false } label: { Text(OnboardingStrings.done) }
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func open(_ url: URL) {
        let fileName = url.lastPathComponent
        let accessing = url.startAccessingSecurityScopedResource()
        defer { if accessing { url.stopAccessingSecurityScopedResource() } }
        guard let kind = CVImportFileKind(fileExtension: url.pathExtension) else {
            model.importFailed(fileName: fileName, error: .unsupported)
            return
        }
        guard let data = try? Data(contentsOf: url) else {
            model.importFailed(fileName: fileName, error: .unreadable)
            return
        }
        model.importCV(data: data, fileName: fileName, kind: kind)
    }
}

/// One of the three CV options: icon, title, caption, chevron; 64 pt tall at least.
private struct OptionRow: View {
    let glyph: String
    let title: LocalizedStringResource
    let caption: LocalizedStringResource
    let action: () -> Void
    @ScaledMetric(relativeTo: .body) private var iconSize: CGFloat = 28
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    static let textInset: CGFloat = 28 + BFHRSpace.s3

    var body: some View {
        Button(action: action) {
            HStack(spacing: BFHRSpace.s3) {
                if !dynamicTypeSize.isAccessibilitySize {
                    Image(systemName: glyph)
                        .font(.bfhr(.title3))
                        .foregroundStyle(BFHRColor.Accent.text)
                        .frame(width: iconSize)
                        .accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.bfhr(.body, emphasized: true))
                        .foregroundStyle(BFHRColor.Fg.primary)
                    Text(caption)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: "chevron.forward")
                    .font(.bfhr(.footnote, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
                    .accessibilityHidden(true)
            }
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Step 2: Preferences

struct OnboardingPreferencesStep: View {
    @Bindable var model: OnboardingModel

    var body: some View {
        List {
            OnboardingHeader(step: .preferences, title: OnboardingStrings.prefsTitle,
                             message: model.fromCV.isEmpty ? OnboardingStrings.prefsBody : OnboardingStrings.prefsBodyCV)
            if model.showsNameField {
                NameSection(draft: $model.draft)
            }
            ForEach(JobPreferenceSection.allCases) { section in
                JobPreferenceSectionView(section: section, draft: $model.draft, fromCV: model.fromCV, roleSuggestions: model.roleSuggestions)
            }
        }
        .bfhrInsetGroupedList()
        // A long form: scrolling puts the keyboard away so the chips under it can be tapped.
        .scrollDismissesKeyboard(.immediately)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingBottomBar {
                Button { model.advance() } label: { Text(OnboardingStrings.next) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .accessibilityIdentifier("onboarding.continue")
            }
        }
    }
}

// MARK: - Step 3: Finish

struct OnboardingFinishStep: View {
    @Bindable var model: OnboardingModel
    @Environment(\.locale) private var locale

    var body: some View {
        List {
            OnboardingHeader(step: .finish, title: OnboardingStrings.finishTitle, message: message)
            if !model.hasSavedSearch, model.canSearch {
                Section {
                    summaryRow(OnboardingStrings.lookingFor, value: roles.map { Text(verbatim: $0) } ?? Text(OnboardingStrings.anyRole))
                    summaryRow(OnboardingStrings.whereHeader, value: Text(verbatim: places))
                    summaryRow(OnboardingStrings.howOften, value: Text(OnboardingStrings.daily))
                    summaryRow(OnboardingStrings.alerts, value: Text(OnboardingStrings.alertsValue))
                }
                .accessibilityIdentifier("onboarding.finish.summary")
            }
            if model.saveFailed {
                Section {
                    InlineAlert(.warning, title: OnboardingStrings.saveFailed)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .accessibilityIdentifier("onboarding.saveFailed")
                }
            }
        }
        .bfhrInsetGroupedList()
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingBottomBar {
                if !model.hasSavedSearch, !model.canSearch {
                    // D40: nothing to search for yet.
                    Button { model.back() } label: { Text(OnboardingStrings.backToPreferences) }
                        .buttonStyle(.bfhr(.primary, fullWidth: true))
                        .accessibilityIdentifier("onboarding.finish.back")
                }
                Button {
                    Task { await model.finish(createSearch: true) }
                } label: {
                    if model.isFinishing {
                        HStack(spacing: BFHRSpace.s2) {
                            ProgressView().tint(primaryAction ? BFHRColor.Fg.onAccent : BFHRColor.Accent.text)
                            Text(OnboardingStrings.starting)
                        }
                    } else {
                        Text(primaryAction && !model.hasSavedSearch ? OnboardingStrings.start : OnboardingStrings.goToToday)
                    }
                }
                .buttonStyle(.bfhr(primaryAction ? .primary : .secondary, fullWidth: true))
                // Busy keeps the button's colors (the disabled style washed the label out); taps are
                // ignored (`finish` also refuses a second run) and VoiceOver reads "Setting up…".
                .allowsHitTesting(!model.isFinishing)
                .accessibilityIdentifier("onboarding.finish")
            }
        }
    }

    /// Start searching (or Go to Today with a search already saved) is the primary action unless
    /// there's nothing to search for.
    private var primaryAction: Bool { model.hasSavedSearch || model.canSearch }

    private var message: LocalizedStringResource {
        if model.hasSavedSearch { return OnboardingStrings.finishExisting }
        return model.canSearch ? OnboardingStrings.finishBody : OnboardingStrings.nothingToSearch
    }

    /// Title over value: long values (several places, long role titles) wrap under their title
    /// instead of squeezing beside it.
    private func summaryRow(_ title: LocalizedStringResource, value: Text) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
            value
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }

    /// "Frontend Engineer, Product Engineer and SRE": one saved search each; nil without a role.
    private var roles: String? {
        let roles = model.searchRoles
        return roles.isEmpty ? nil : roles.formatted(.list(type: .and).locale(locale))
    }

    /// "Germany, Berlin · Remote", or Anywhere.
    private var places: String {
        var names = model.draft.locations.map { JobPreferencesDraft.displayName(of: $0, locale: locale) }
        if model.draft.remoteWorldwide { names.append(String(localized: OnboardingStrings.remoteWorldwide)) }
        guard !names.isEmpty else { return String(localized: OnboardingStrings.anywhere) }
        return names.formatted(.list(type: .and).locale(locale))
    }
}
