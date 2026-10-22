import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Foundation rendering of `JobDetailModel`: a plain list of the model's data with the shared
/// components, so design builds show every state. The screen's real design replaces this file.
public struct JobDetailScreen: View {
    @Bindable private var model: JobDetailModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @State private var saveCount = 0

    public init(model: JobDetailModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: JobDetailViewStrings.loading) {
            List {
                ConnectionBannerSection(model.connection)
                if let header = model.header { headerSection(header) }
                matchSection
                descriptionSection
                sourcesSection
            }
            .bfhrInsetGroupedList()
            // Inside the bar's inset, so the toast stacks above the Apply bar.
            .bfhrToastHost()
            .safeAreaInset(edge: .bottom, spacing: 0) { applyBar }
        } skeleton: {
            List {
                Section {
                    VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                        CompanyChip(CompanyIdentity(name: "Company name"))
                        Text(verbatim: "Senior Frontend Engineer").font(.bfhr(.title2, emphasized: true))
                        Text(verbatim: "Berlin · Remote · 3 days ago").font(.bfhr(.subheadline))
                    }
                }
                Section { Text(verbatim: String(repeating: "Placeholder description text ", count: 6)).font(.bfhr(.body)) }
            }
            .bfhrInsetGroupedList()
        } failure: { failure in
            PaneError(
                failure,
                title: failure.kind == .notFound ? JobDetailViewStrings.notFoundTitle : JobDetailViewStrings.errorTitle,
                retry: {},
                goBack: {}
            )
        }
        .environment(\.bfhrNow, model.now)
        .bfhrHaptic(.confirm, trigger: saveCount)
        .bfhrInlineTitle()
    }

    private func headerSection(_ header: JobDetailModel.Header) -> some View {
        Section {
            VStack(alignment: .leading, spacing: BFHRSpace.s2) {
                CompanyChip(header.company)
                Text(verbatim: header.title)
                    .font(.bfhr(.title2, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .accessibilityAddTraits(.isHeader)
                HStack(spacing: BFHRSpace.s1) {
                    if !header.locations.isEmpty {
                        Text(verbatim: header.locations.map(\.label).joined(separator: ", "))
                    }
                    if let posted = header.postedAt {
                        if !header.locations.isEmpty { Text(verbatim: "·") }
                        RelativeTimeText(posted, style: .day)
                    }
                }
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
                if model.isDelisted {
                    InlineAlert(.info, title: JobDetailViewStrings.delisted)
                }
                if model.isHidden {
                    InlineAlert(.info, title: JobDetailViewStrings.hidden, actionTitle: Strings.undo, action: model.unhide)
                }
            }
            .padding(.vertical, BFHRSpace.s1)
        }
    }

    @ViewBuilder private var matchSection: some View {
        Section {
            switch model.match {
            case .pending:
                ProgressNote(JobDetailViewStrings.pending)
            case .noCV:
                Text(JobDetailViewStrings.noCV).foregroundStyle(BFHRColor.Fg.secondary)
            case .scored(let match):
                VStack(alignment: .leading, spacing: BFHRSpace.s3) {
                    HStack {
                        MatchBandPill(score: match.score)
                        Spacer()
                        Text(MatchBand.scoreCaption(match.score))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    MatchBandBar(score: match.score)
                }
                .padding(.vertical, BFHRSpace.s1)
                ForEach(match.topReasons) { factor in
                    Label { Text(verbatim: factor.label) } icon: { Image(systemName: "checkmark.circle") }
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                }
                ForEach(match.topGaps) { factor in
                    HStack {
                        Label { Text(verbatim: factor.label) } icon: { Image(systemName: "circle.dashed") }
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                        Spacer()
                        if let skill = factor.skill {
                            Button { if let toast = model.markHaveSkill(skill) { toasts?.show(toast) } } label: {
                                Text(JobDetailViewStrings.haveThis)
                            }
                            .buttonStyle(.bfhrPlain)
                        }
                    }
                }
                if match.rationale != nil { AiBadge(Strings.aiSummaryLabel) }
            }
        } header: {
            Text(JobDetailViewStrings.match)
        }
    }

    private var descriptionSection: some View {
        Section {
            if model.hasDescription {
                Text(verbatim: model.description)
                    .font(.bfhr(.body))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .lineLimit(12)
            } else {
                InlineAlert(.info, title: JobDetailViewStrings.noDescription)
            }
        } header: {
            Text(JobDetailViewStrings.about)
        }
    }

    @ViewBuilder private var sourcesSection: some View {
        if model.sources.total > 0 {
            Section {
                ForEach(model.sources.all) { source in
                    HStack {
                        Text(verbatim: source.source).font(.bfhr(.body))
                        Spacer()
                        if let posted = source.postedAt {
                            RelativeTimeText(posted, style: .day)
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                    }
                }
            } header: {
                Text(JobDetailViewStrings.foundOn(model.sources.total))
            }
        }
    }

    private var applyBar: some View {
        HStack(spacing: BFHRSpace.s2) {
            if model.canToggleSave {
                IconButton(model.isSaved ? JobDetailViewStrings.saved : JobDetailViewStrings.save, systemImage: model.isSaved ? "bookmark.fill" : "bookmark") {
                    if !model.isSaved { saveCount += 1 }
                    if let toast = model.toggleSave() { toasts?.show(toast) }
                }
            }
            if let route = model.applyRoute {
                Button {} label: { Text(JobDetailViewStrings.apply(route)) }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
            }
        }
        .padding(.horizontal, BFHRSpace.s4)
        .padding(.vertical, BFHRSpace.s2)
        .background(.bar)
    }
}

enum JobDetailViewStrings {
    static let loading = LocalizedStringResource.bfhr("jobDetail.loading", default: "Loading job", table: "JobDetail")
    static let errorTitle = LocalizedStringResource.bfhr("jobDetail.error.title", default: "We couldn't load this job", table: "JobDetail")
    static let notFoundTitle = LocalizedStringResource.bfhr("jobDetail.error.notFound", default: "This job isn't in your list anymore", table: "JobDetail")
    static let match = LocalizedStringResource.bfhr("jobDetail.section.match", default: "How it fits", table: "JobDetail")
    static let about = LocalizedStringResource.bfhr("jobDetail.section.about", default: "About the job", table: "JobDetail")
    static let pending = LocalizedStringResource.bfhr("jobDetail.match.pending", default: "Working out your match…", table: "JobDetail")
    static let noCV = LocalizedStringResource.bfhr("jobDetail.match.noCV", default: "Pick a CV to see how this fits", table: "JobDetail")
    static let haveThis = LocalizedStringResource.bfhr("jobDetail.gap.haveThis", default: "I have this", table: "JobDetail")
    static let noDescription = LocalizedStringResource.bfhr("jobDetail.noDescription", default: "This posting has no description. Open the original posting to read it.", table: "JobDetail")
    static let delisted = LocalizedStringResource.bfhr("jobDetail.delisted", default: "This job is no longer listed", table: "JobDetail")
    static let hidden = LocalizedStringResource.bfhr("jobDetail.hidden", default: "Hidden from your feed", table: "JobDetail")
    static let save = LocalizedStringResource.bfhr("jobDetail.action.save", default: "Save", table: "JobDetail")
    static let saved = LocalizedStringResource.bfhr("jobDetail.action.saved", default: "Saved", table: "JobDetail")

    static func foundOn(_ count: Int) -> LocalizedStringResource {
        .bfhr("jobDetail.foundOn", default: "Found on \(count) sites", table: "JobDetail")
    }

    static func apply(_ route: JobDetailModel.ApplyRoute) -> LocalizedStringResource {
        switch route {
        case .email: .bfhr("jobDetail.apply", default: "Apply", table: "JobDetail")
        case .companySite: .bfhr("jobDetail.apply.companySite", default: "Apply on company site", table: "JobDetail")
        case .board(let name, _): .bfhr("jobDetail.apply.board", default: "Apply on \(name)", table: "JobDetail")
        case .applied: .bfhr("jobDetail.apply.applied", default: "Applied · View in Tracker", table: "JobDetail")
        }
    }
}
