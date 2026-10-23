import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// One job in the feed (job-feed-search.md "Job row", Glassdoor anatomy): title (2 lines), then
/// company · place · work mode, the salary with its provenance, and a meta line with the match
/// band, the age and "3 sources". The bookmark (or the Tracker status once the job has moved on)
/// sits trailing; at accessibility sizes it drops under the text.
struct JobRowView: View {
    let row: JobFeedRow
    let onToggleSave: () -> Void
    @Environment(\.locale) private var locale
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        let layout = dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: BFHRSpace.s2))
            : AnyLayout(HStackLayout(alignment: .top, spacing: BFHRSpace.s3))
        layout {
            VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                HStack(alignment: .firstTextBaseline, spacing: BFHRSpace.s1) {
                    Text(verbatim: row.title)
                        .font(.bfhr(.headline))
                        .foregroundStyle(BFHRColor.Fg.primary)
                        .lineLimit(dynamicTypeSize.isAccessibilitySize ? nil : 2)
                    if row.isPendingSync { SyncGlyph() }
                }
                Text(verbatim: subtitle)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
                Text(verbatim: salaryLine)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(row.salary == nil ? BFHRColor.Fg.tertiary : BFHRColor.Fg.secondary)
                ChipFlow(spacing: BFHRSpace.s2) {
                    if let score = row.score { MatchBandPill(score: score) }
                    if let posted = row.postedAt {
                        RelativeTimeText(posted, style: .day)
                            .font(.bfhr(.caption1))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    if row.sourceCount > 1 {
                        Label { Text(JobsStrings.sources(row.sourceCount)) } icon: { Image(systemName: "square.stack") }
                            .labelStyle(.bfhrCompact)
                            .font(.bfhr(.caption1))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
                .padding(.top, 2)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            trailing
        }
        .padding(.vertical, BFHRSpace.s1)
    }

    @ViewBuilder private var trailing: some View {
        if let status = row.trackedStatus {
            StatusPill(status)
        } else if row.canToggleSave {
            Button(action: onToggleSave) {
                Image(systemName: row.isSaved ? "bookmark.fill" : "bookmark")
                    .font(.bfhr(.body, emphasized: true))
                    .foregroundStyle(BFHRColor.Accent.text)
                    .frame(minWidth: BFHRHitTarget.minimum, minHeight: BFHRHitTarget.minimum)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.borderless)
            .accessibilityLabel(Text(row.isSaved ? JobsStrings.unsave : JobsStrings.save))
            .accessibilityAddTraits(row.isSaved ? .isSelected : [])
        }
    }

    /// "Company · place · work mode"; the work mode is left out when the place already says it
    /// ("Berlin (Mitte), hybrid").
    private var subtitle: String {
        var parts = [row.company.name]
        if let place = row.place { parts.append(place) }
        if let remote = row.remoteType {
            let mode = String(localized: JobDetailViewStrings.workMode(remote))
            if row.place?.range(of: mode, options: [.caseInsensitive, .diacriticInsensitive], locale: locale) == nil {
                parts.append(mode)
            }
        }
        return parts.joined(separator: " · ")
    }

    private var salaryLine: String {
        guard let salary = row.salary, let amount = JobDetailFormat.salary(salary, locale: locale) else {
            return String(localized: JobDetailViewStrings.salaryNotStated)
        }
        let provenance = salary.estimated ? JobDetailViewStrings.salaryEstimated : JobDetailViewStrings.salaryFromEmployer
        return "\(amount) · \(String(localized: provenance))"
    }
}

/// "Hidden · Undo · Tell us why" in place of a job the user just hid (Zomato inline undo).
struct HiddenJobRow: View {
    let title: String
    let company: String
    let hasReasons: Bool
    let onUndo: () -> Void
    let onTellUsWhy: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s1) {
            Label {
                Text(bfhrPlain: JobsStrings.hiddenRow(title: title, company: company))
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            } icon: {
                Image(systemName: "eye.slash").foregroundStyle(BFHRColor.Fg.tertiary)
            }
            HStack(spacing: BFHRSpace.s2) {
                Button(action: onUndo) { Text(Strings.undo) }
                    .buttonStyle(.bfhrPlain)
                    .accessibilityIdentifier("jobs.hidden.undo")
                Button(action: onTellUsWhy) { Text(hasReasons ? Strings.change : JobDetailViewStrings.tellUsWhy) }
                    .buttonStyle(.bfhrPlain)
            }
            .padding(.leading, -BFHRSpace.s2)
        }
        .padding(.vertical, BFHRSpace.s1)
        .accessibilityElement(children: .contain)
    }
}

/// The feed's loading skeleton: the real row layout with placeholder text (states.md).
struct JobsFeedSkeleton: View {
    var body: some View {
        List {
            Section {
                ForEach(0..<6, id: \.self) { _ in
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(verbatim: "Senior Frontend Engineer").font(.bfhr(.headline))
                        Text(verbatim: "Company · Berlin, Germany · Remote").font(.bfhr(.subheadline))
                        Text(verbatim: "€70K–€85K a year").font(.bfhr(.footnote))
                        Text(verbatim: "Good match · 2 days ago").font(.bfhr(.caption1))
                    }
                    .padding(.vertical, BFHRSpace.s1)
                }
            }
        }
        .bfhrInsetGroupedList()
        .bfhrSkeleton()
    }
}
