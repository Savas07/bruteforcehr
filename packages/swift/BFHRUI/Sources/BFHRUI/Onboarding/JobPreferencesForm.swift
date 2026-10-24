import BFHRCore
import BFHRDesignTokens
import SwiftUI

// The Preferences editor's sections (onboarding-signin.md "Screen 4"): onboarding step 2 lists
// them all on one screen; Settings › Job preferences opens each one from its summary row. Every
// section edits a `JobPreferencesDraft` binding and goes inside a `List`.

/// The editor's sections, in screen order.
public enum JobPreferenceSection: String, CaseIterable, Hashable, Sendable, Identifiable {
    case roles
    case seniority
    case location
    case salary
    case authorization
    case languages

    public var id: Self { self }

    var title: LocalizedStringResource {
        switch self {
        case .roles: OnboardingStrings.rolesHeader
        case .seniority: OnboardingStrings.seniorityHeader
        case .location: OnboardingStrings.whereHeader
        case .salary: OnboardingStrings.salaryHeader
        case .authorization: OnboardingStrings.authorizationHeader
        case .languages: OnboardingStrings.languagesHeader
        }
    }
}

/// One section of the editor (`fromCV`: the values the CV filled in; `roleSuggestions`: titles
/// from the CV not picked yet).
struct JobPreferenceSectionView: View {
    let section: JobPreferenceSection
    @Binding var draft: JobPreferencesDraft
    var fromCV: Set<PreferenceField> = []
    var roleSuggestions: [String] = []

    var body: some View {
        switch section {
        case .roles: RolesSection(draft: $draft, fromCV: fromCV.contains(.roles), suggestions: roleSuggestions)
        case .seniority: SenioritySection(draft: $draft)
        case .location: LocationSection(draft: $draft, fromCV: fromCV.contains(.locations))
        case .salary: SalarySection(draft: $draft)
        case .authorization: AuthorizationSection(draft: $draft)
        case .languages: LanguagesSection(draft: $draft, fromCV: fromCV.contains(.languages))
        }
    }
}

/// A section header with an optional "From CV" tag.
private struct PreferenceHeader: View {
    let title: LocalizedStringResource
    var fromCV = false
    var trailing: LocalizedStringResource?

    var body: some View {
        ChipFlow {
            Text(title)
                .foregroundStyle(BFHRColor.Fg.secondary)
            if fromCV { SourceTag(.cv).textCase(nil) }
            if let trailing {
                Text(trailing)
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .monospacedDigit()
            }
        }
    }
}

/// A removable value ("Product Designer ✕"): the ✕ is its own 44 pt button.
struct PreferenceToken: View {
    let title: String
    let remove: () -> Void

    var body: some View {
        HStack(spacing: 0) {
            Text(verbatim: title)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, BFHRSpace.s3)
            Button(action: remove) {
                Image(systemName: "xmark")
                    .font(.bfhr(.caption1, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(Text(OnboardingStrings.removeItem(title)))
        }
        .background(BFHRColor.Accent.subtle, in: Capsule())
        .overlay(Capsule().strokeBorder(BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin))
    }
}

/// Segmented at default sizes; a menu at accessibility sizes, where segments would truncate.
private struct SegmentedUnlessLarge: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    func body(content: Content) -> some View {
        if dynamicTypeSize.isAccessibilitySize {
            content.pickerStyle(.menu)
        } else {
            content.pickerStyle(.segmented)
        }
    }
}

/// A text field with a trailing Add button; Return adds too.
private struct AddField: View {
    let placeholder: LocalizedStringResource
    let addLabel: LocalizedStringResource
    let identifier: String
    var disabled = false
    let add: (String) -> Bool
    @State private var text = ""

    var body: some View {
        HStack(spacing: BFHRSpace.s2) {
            TextField(text: $text) { Text(placeholder) }
                .submitLabel(.done)
                .onSubmit(commit)
                .disabled(disabled)
                .accessibilityIdentifier(identifier)
            Button(action: commit) {
                Image(systemName: "plus.circle.fill")
                    .font(.bfhr(.title3))
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
            }
            .buttonStyle(.plain)
            .foregroundStyle(BFHRColor.Accent.text)
            .disabled(disabled || text.trimmingCharacters(in: .whitespaces).isEmpty)
            .accessibilityLabel(Text(addLabel))
            .accessibilityIdentifier("\(identifier).add")
        }
    }

    private func commit() {
        if add(text) { text = "" }
    }
}

// MARK: - Sections

struct RolesSection: View {
    @Binding var draft: JobPreferencesDraft
    var fromCV = false
    var suggestions: [String] = []

    var body: some View {
        Section {
            if !draft.roles.isEmpty {
                ChipFlow {
                    ForEach(draft.roles, id: \.self) { role in
                        PreferenceToken(title: role) { draft.removeRole(role) }
                    }
                }
                .padding(.vertical, BFHRSpace.s1)
                .accessibilityIdentifier("prefs.roles.tokens")
            }
            AddField(placeholder: OnboardingStrings.rolePlaceholder, addLabel: OnboardingStrings.addRole,
                     identifier: "prefs.roles.field", disabled: !draft.canAddRole) { draft.addRole($0) }
            if !suggestions.isEmpty, draft.canAddRole {
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(OnboardingStrings.suggestions)
                        .font(.bfhr(.footnote))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                    ChipFlow {
                        ForEach(suggestions, id: \.self) { role in
                            Button {
                                draft.addRole(role)
                            } label: {
                                Label { Text(verbatim: role) } icon: { Image(systemName: "plus") }
                                    .labelStyle(.bfhrCompact)
                                    .font(.bfhr(.subheadline))
                                    .foregroundStyle(BFHRColor.Fg.primary)
                                    .padding(.horizontal, BFHRSpace.s3)
                                    .frame(minHeight: BFHRHitTarget.minimum)
                                    .overlay(Capsule().strokeBorder(BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin))
                                    .contentShape(Capsule())
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(Text(OnboardingStrings.addItem(role)))
                        }
                    }
                }
                .padding(.vertical, BFHRSpace.s1)
            }
        } header: {
            PreferenceHeader(title: OnboardingStrings.rolesHeader, fromCV: fromCV,
                             trailing: OnboardingStrings.roleCount(draft.roles.count, JobPreferencesDraft.maxRoles))
        } footer: {
            Text(draft.canAddRole ? OnboardingStrings.rolesFooter : OnboardingStrings.rolesFull)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }
}

struct SenioritySection: View {
    @Binding var draft: JobPreferencesDraft

    var body: some View {
        Section {
            ChipFlow {
                ForEach(Seniority.allCases, id: \.self) { level in
                    Toggle(isOn: Binding(get: { draft.seniority == level }, set: { _ in draft.toggleSeniority(level) })) {
                        Text(JobDetailViewStrings.seniority(level))
                    }
                    .toggleStyle(.bfhrChip)
                    .accessibilityIdentifier("prefs.seniority.\(level.rawValue)")
                }
            }
            .padding(.vertical, BFHRSpace.s1)
        } header: {
            PreferenceHeader(title: OnboardingStrings.seniorityHeader)
        } footer: {
            Text(OnboardingStrings.seniorityFooter)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }
}

struct LocationSection: View {
    @Binding var draft: JobPreferencesDraft
    var fromCV = false
    @Environment(\.locale) private var locale

    /// Remote, Hybrid, On-site (research order).
    private static let workplaces: [RemoteType] = [.remote, .hybrid, .onsite]

    var body: some View {
        Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                Text(OnboardingStrings.workplace)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                ChipFlow {
                    ForEach(Self.workplaces, id: \.self) { type in
                        Toggle(isOn: Binding(get: { draft.workplaces.contains(type) }, set: { _ in draft.toggleWorkplace(type) })) {
                            Text(JobDetailViewStrings.workMode(type))
                        }
                        .toggleStyle(.bfhrChip)
                        .accessibilityIdentifier("prefs.workplace.\(type.rawValue)")
                    }
                }
            }
            .padding(.vertical, BFHRSpace.s1)
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                Text(OnboardingStrings.places)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                ChipFlow {
                    ForEach(PreferenceMarket.all) { market in
                        Toggle(isOn: Binding(get: { draft.isPicked(market) }, set: { _ in draft.toggle(market, label: name(market)) })) {
                            Text(verbatim: name(market))
                        }
                        .toggleStyle(.bfhrChip)
                        .accessibilityIdentifier("prefs.market.\(market.id)")
                    }
                    ForEach(otherLocations, id: \.self) { location in
                        PreferenceToken(title: location.label) { draft.removeLocation(location) }
                    }
                }
            }
            .padding(.vertical, BFHRSpace.s1)
            AddField(placeholder: OnboardingStrings.locationPlaceholder, addLabel: OnboardingStrings.addLocation,
                     identifier: "prefs.location.field") { draft.addLocation($0, locale: locale) }
            Toggle(isOn: $draft.openToRelocation) { Text(OnboardingStrings.relocation) }
                .tint(BFHRColor.tint)
                .accessibilityIdentifier("prefs.relocation")
        } header: {
            PreferenceHeader(title: OnboardingStrings.whereHeader, fromCV: fromCV)
        } footer: {
            Text(OnboardingStrings.whereFooter)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    /// Places that aren't quick-add markets (cities, other countries).
    private var otherLocations: [TargetLocation] {
        let markets = Set(PreferenceMarket.all.compactMap(\.countryCode))
        return draft.locations.filter { $0.city != nil || !markets.contains($0.countryCode ?? "") }
    }

    private func name(_ market: PreferenceMarket) -> String {
        guard let code = market.countryCode else { return String(localized: OnboardingStrings.remoteWorldwide) }
        return locale.localizedString(forRegionCode: code) ?? code
    }
}

struct SalarySection: View {
    @Binding var draft: JobPreferencesDraft
    /// The number pad has no Return key: a Done button above it closes it.
    @FocusState private var editsAmount: Bool

    var body: some View {
        Section {
            amountRow
            Picker(selection: Binding(get: { draft.salaryCurrency }, set: { draft.setCurrency($0) })) {
                ForEach(JobPreferencesDraft.currencies, id: \.self) { code in
                    Text(verbatim: code).tag(code)
                }
            } label: {
                Text(OnboardingStrings.currency)
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("prefs.salary.currency")
            Picker(selection: $draft.salaryPeriod) {
                Text(OnboardingStrings.perMonth).tag(SalaryPeriod.month)
                Text(OnboardingStrings.perYear).tag(SalaryPeriod.year)
            } label: {
                Text(OnboardingStrings.period)
            }
            .modifier(SegmentedUnlessLarge())
            .accessibilityIdentifier("prefs.salary.period")
            if draft.salaryAmount != nil {
                // Not destructive: the floor is optional and can be typed again.
                Button { draft.salaryAmount = nil } label: { Text(OnboardingStrings.clearSalary) }
                    .foregroundStyle(BFHRColor.Accent.text)
                    .accessibilityIdentifier("prefs.salary.clear")
            }
        } header: {
            PreferenceHeader(title: OnboardingStrings.salaryHeader)
        } footer: {
            Text(OnboardingStrings.salaryFooter)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    private var amountRow: some View {
        LabeledContent {
            TextField(value: $draft.salaryAmount, format: .number.precision(.fractionLength(0))) {
                Text(OnboardingStrings.salaryPlaceholder)
            }
            .multilineTextAlignment(.trailing)
            .focused($editsAmount)
            #if os(iOS)
            .keyboardType(.numberPad)
            .toolbar {
                if editsAmount {
                    ToolbarItemGroup(placement: .keyboard) {
                        Spacer()
                        Button { editsAmount = false } label: { Text(OnboardingStrings.done) }
                            .accessibilityIdentifier("prefs.salary.done")
                    }
                }
            }
            #endif
            .accessibilityIdentifier("prefs.salary.amount")
        } label: {
            Text(OnboardingStrings.salaryAmount)
        }
    }
}

struct AuthorizationSection: View {
    @Binding var draft: JobPreferencesDraft
    @Environment(\.locale) private var locale

    var body: some View {
        Section {
            if draft.authorizationRegions.isEmpty {
                Text(OnboardingStrings.authorizationEmpty)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            ForEach(draft.authorizationRegions, id: \.self) { region in
                VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                    Text(question(region))
                        .font(.bfhr(.body))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Picker(selection: Binding(get: { draft.answer(for: region) }, set: { draft.setAnswer($0, for: region) })) {
                        ForEach(AuthorizationAnswer.allCases, id: \.self) { answer in
                            Text(OnboardingStrings.answer(answer)).tag(answer)
                        }
                    } label: {
                        Text(question(region))
                    }
                    .labelsHidden()
                    .modifier(SegmentedUnlessLarge())
                    .accessibilityIdentifier("prefs.auth.\(region)")
                }
                .padding(.vertical, BFHRSpace.s1)
            }
        } header: {
            PreferenceHeader(title: OnboardingStrings.authorizationHeader)
        } footer: {
            Text(OnboardingStrings.authorizationFooter)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }

    private func question(_ region: String) -> LocalizedStringResource {
        region == JobPreferencesDraft.euRegion
            ? OnboardingStrings.authorizationQuestionEU
            : OnboardingStrings.authorizationQuestion(locale.localizedString(forRegionCode: region) ?? region)
    }
}

struct LanguagesSection: View {
    @Binding var draft: JobPreferencesDraft
    var fromCV = false
    @State private var picksOther = false
    @Environment(\.locale) private var locale

    var body: some View {
        Section {
            if !draft.languages.isEmpty {
                ChipFlow {
                    ForEach(draft.languages, id: \.language) { entry in
                        languageToken(entry)
                    }
                }
                .padding(.vertical, BFHRSpace.s1)
            }
            Menu {
                ForEach(quickLanguages, id: \.self) { code in
                    Button { draft.setLanguage(code, level: .c1) } label: { Text(verbatim: name(code)) }
                }
                Button { picksOther = true } label: { Text(OnboardingStrings.otherLanguage) }
            } label: {
                Label { Text(OnboardingStrings.addLanguage) } icon: { Image(systemName: "plus") }
                    .labelStyle(.bfhrCompact)
                    .frame(minHeight: BFHRHitTarget.minimum)
            }
            .accessibilityIdentifier("prefs.languages.add")
        } header: {
            PreferenceHeader(title: OnboardingStrings.languagesHeader, fromCV: fromCV)
        } footer: {
            Text(OnboardingStrings.languagesFooter)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
        .sheet(isPresented: $picksOther) {
            LanguagePickerSheet(excluded: Set(draft.languages.map(\.language))) { code in
                draft.setLanguage(code, level: .b2)
            }
        }
    }

    private var quickLanguages: [String] {
        JobPreferencesDraft.quickLanguages.filter { code in !draft.languages.contains { $0.language == code } }
    }

    private func name(_ code: String) -> String {
        locale.localizedString(forLanguageCode: code) ?? code
    }

    private func languageToken(_ entry: SpokenLanguage) -> some View {
        Menu {
            Picker(selection: Binding(get: { entry.level }, set: { draft.setLanguage(entry.language, level: $0) })) {
                ForEach(LanguageLevel.allCases, id: \.self) { level in
                    Text(OnboardingStrings.level(level)).tag(level)
                }
            } label: {
                Text(OnboardingStrings.level)
            }
            Button(role: .destructive) { draft.removeLanguage(entry.language) } label: {
                Text(OnboardingStrings.removeItem(name(entry.language)))
            }
        } label: {
            HStack(spacing: BFHRSpace.s1) {
                Text(verbatim: name(entry.language))
                    .foregroundStyle(BFHRColor.Fg.primary)
                Text(OnboardingStrings.level(entry.level))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.bfhr(.caption2))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                    .accessibilityHidden(true)
            }
            .font(.bfhr(.subheadline))
            .padding(.horizontal, BFHRSpace.s3)
            .frame(minHeight: BFHRHitTarget.minimum)
            .background(BFHRColor.Accent.subtle, in: Capsule())
            .overlay(Capsule().strokeBorder(BFHRColor.Line.control, lineWidth: BFHRBorderWidth.thin))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("prefs.language.\(entry.language)")
    }
}

/// "Other language": every language with a name, searchable, in the app's language.
private struct LanguagePickerSheet: View {
    let excluded: Set<String>
    let pick: (String) -> Void
    @State private var query = ""
    @Environment(\.dismiss) private var dismiss
    @Environment(\.locale) private var locale

    var body: some View {
        NavigationStack {
            List(filtered, id: \.code) { item in
                Button {
                    pick(item.code)
                    dismiss()
                } label: {
                    Text(verbatim: item.name)
                        .foregroundStyle(BFHRColor.Fg.primary)
                }
            }
            .searchable(text: $query)
            .navigationTitle(Text(OnboardingStrings.addLanguage))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Text(OnboardingStrings.cancel) }
                }
            }
        }
    }

    private var all: [(code: String, name: String)] {
        Locale.LanguageCode.isoLanguageCodes
            .map(\.identifier)
            .filter { $0.count == 2 && !excluded.contains($0) }
            .compactMap { code in locale.localizedString(forLanguageCode: code).map { (code, $0) } }
            .sorted { $0.name.localizedCompare($1.name) == .orderedAscending }
    }

    private var filtered: [(code: String, name: String)] {
        let trimmed = query.trimmingCharacters(in: .whitespaces)
        guard !trimmed.isEmpty else { return all }
        return all.filter { $0.name.localizedCaseInsensitiveContains(trimmed) }
    }
}

/// "Your name" (onboarding, when no CV named the user).
struct NameSection: View {
    @Binding var draft: JobPreferencesDraft

    var body: some View {
        Section {
            TextField(text: $draft.fullName) { Text(OnboardingStrings.namePlaceholder) }
                #if os(iOS)
                .textContentType(.name)
                .textInputAutocapitalization(.words)
                #endif
                .autocorrectionDisabled()
                .accessibilityIdentifier("prefs.name")
        } header: {
            PreferenceHeader(title: OnboardingStrings.nameHeader)
        } footer: {
            Text(OnboardingStrings.nameFooter)
                .foregroundStyle(BFHRColor.Fg.secondary)
        }
    }
}
