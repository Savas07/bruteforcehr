import BFHRCore
import BFHRDesignTokens
import SwiftUI

// Settings › Job preferences (onboarding-signin.md "Later editing"): summary rows, title over
// value (Glassdoor's rows, IHG's two-line values so long lists and AX sizes don't truncate), each
// opening the same section editor as onboarding. Changes save at once, like every setting.

extension SettingsModel {
    /// The stored preferences; nil until the profile has loaded.
    public var jobPreferences: JobPreferencesDraft? {
        data.profile.map { JobPreferencesDraft(profile: $0) }
    }

    /// Saves the editor's values to `users/{uid}` (optimistic; a refused write shows the toast).
    public func saveJobPreferences(_ draft: JobPreferencesDraft) {
        mutate { data in
            guard var profile = data.profile else { return }
            let before = profile
            draft.apply(to: &profile)
            guard profile != before else { return }
            profile.updatedAt = writeTime
            data.profile = profile
        }
    }
}

/// The page with one row per section.
struct JobPreferencesPage: View {
    @Bindable var model: SettingsModel
    @Environment(\.locale) private var locale
    @Environment(\.bfhrReload) private var reload

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            if let draft = model.jobPreferences {
                Section {
                    ForEach(JobPreferenceSection.allCases) { section in
                        NavigationLink(value: SettingsRoute.jobPreference(section)) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(Self.rowTitle(section))
                                    .font(.bfhr(.body))
                                    .foregroundStyle(BFHRColor.Fg.primary)
                                summary(section, draft)
                                    .font(.bfhr(.subheadline))
                                    .foregroundStyle(BFHRColor.Fg.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.vertical, 2)
                        }
                        .accessibilityIdentifier("jobPreferences.\(section.rawValue)")
                    }
                } footer: {
                    Text(OnboardingStrings.jobPreferencesFooter)
                        .foregroundStyle(BFHRColor.Fg.secondary)
                }
            } else if case .failed = model.phase {
                Section {
                    InlineAlert(.warning, title: OnboardingStrings.loadFailed, actionTitle: Strings.tryAgain, action: reload)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .accessibilityIdentifier("jobPreferences.loadFailed")
                }
            } else {
                Section {
                    ForEach(JobPreferenceSection.allCases) { section in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(Self.rowTitle(section))
                            Text(verbatim: "Product Designer, Berlin")
                        }
                        .redacted(reason: .placeholder)
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(OnboardingStrings.loading))
            }
        }
        .bfhrInsetGroupedList()
        .navigationTitle(Text(OnboardingStrings.jobPreferences))
        .bfhrInlineTitle()
        .accessibilityIdentifier("jobPreferences")
    }

    static func rowTitle(_ section: JobPreferenceSection) -> LocalizedStringResource {
        section == .salary ? OnboardingStrings.salaryRow : section.title
    }

    private func summary(_ section: JobPreferenceSection, _ draft: JobPreferencesDraft) -> Text {
        let notSet = Text(OnboardingStrings.notSet)
        switch section {
        case .roles:
            return draft.roles.isEmpty ? notSet : Text(verbatim: draft.roles.formatted(.list(type: .and).locale(locale)))
        case .seniority:
            return draft.seniority.map { Text(JobDetailViewStrings.seniority($0)) } ?? notSet
        case .location:
            var parts = draft.workplaces.map { String(localized: JobDetailViewStrings.workMode($0)) }
            parts += draft.locations.map { JobPreferencesDraft.displayName(of: $0, locale: locale) }
            if draft.remoteWorldwide { parts.append(String(localized: OnboardingStrings.remoteWorldwide)) }
            if draft.openToRelocation, !draft.locations.isEmpty { parts.append(String(localized: OnboardingStrings.relocation)) }
            return parts.isEmpty ? notSet : Text(verbatim: parts.joined(separator: " · "))
        case .salary:
            guard let floor = draft.salaryFloor else { return notSet }
            let amount = floor.amount.formatted(.currency(code: floor.currency).precision(.fractionLength(0)).locale(locale))
            return Text(JobDetailViewStrings.salaryPer(floor.period, amount: amount))
        case .authorization:
            return draft.authorization.isEmpty ? notSet : Text(OnboardingStrings.answered(draft.authorization.count))
        case .languages:
            guard !draft.languages.isEmpty else { return notSet }
            let names = draft.languages.map { locale.localizedString(forLanguageCode: $0.language) ?? $0.language }
            return Text(verbatim: names.formatted(.list(type: .and).locale(locale)))
        }
    }
}

/// One section's editor, pushed from its row. Every change saves at once; the salary amount saves
/// as it's typed too (a write per change, coalesced by the diff when nothing changed).
struct JobPreferenceSectionPage: View {
    @Bindable var model: SettingsModel
    let section: JobPreferenceSection
    @State private var draft: JobPreferencesDraft?

    var body: some View {
        List {
            ConnectionBannerSection(model.connection)
            if draft != nil {
                JobPreferenceSectionView(section: section, draft: Binding(get: { draft ?? JobPreferencesDraft() }, set: { draft = $0 }))
                    .environment(\.bfhrPreferenceHeaderTitle, false)
            }
        }
        .bfhrInsetGroupedList()
        .scrollDismissesKeyboard(.immediately)
        .navigationTitle(Text(JobPreferencesPage.rowTitle(section)))
        .bfhrInlineTitle()
        .accessibilityIdentifier("jobPreferences.page.\(section.rawValue)")
        .onAppear { if draft == nil { draft = model.jobPreferences } }
        .onChange(of: model.jobPreferences == nil) { _, missing in
            if !missing, draft == nil { draft = model.jobPreferences }
        }
        // Edits only: filling the editor from the profile writes nothing.
        .onChange(of: draft) { old, draft in
            if old != nil, let draft { model.saveJobPreferences(draft) }
        }
    }
}
