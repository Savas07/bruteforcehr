import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// A stored job email, read-only (All job mail, a timeline row, a push or link to a reviewed
/// email): sender, subject, the text we kept, how it was filed and, for an automatically applied
/// invite, "Add interview". Pending emails open the review sheet instead.
struct MailEmailSheet: View {
    let detail: MailMessageDetail
    let onAddInterview: () -> Void
    let onNotJobMail: () -> Void
    let onClose: () -> Void
    @State private var showsFullEmail = false
    @Environment(\.openURL) private var openURL

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: BFHRSpace.s6) {
                    message
                    filing
                    if let suggestion = detail.interviewSuggestion {
                        InterviewSuggestionCard(suggestion, footnote: nil)
                    } else if detail.interviewId != nil {
                        Label { Text(MailViewStrings.interviewOnCalendar) } icon: { Image(systemName: "calendar") }
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    if detail.reviewState != .corrected {
                        Button(action: onNotJobMail) { Text(Strings.notJobMail) }
                            .buttonStyle(.bfhrPlain)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(BFHRSpace.s4)
            }
            // Add interview stays in reach at the medium detent, like the review sheet's actions.
            .safeAreaInset(edge: .bottom, spacing: 0) {
                if detail.interviewSuggestion != nil {
                    Button(action: onAddInterview) {
                        Label { Text(Strings.addInterview) } icon: { Image(systemName: "calendar.badge.plus") }
                    }
                    .buttonStyle(.bfhr(.primary, fullWidth: true))
                    .accessibilityIdentifier("mail.email.addInterview")
                    .padding(.horizontal, BFHRSpace.s4)
                    .padding(.vertical, BFHRSpace.s3)
                    .background(.bar)
                }
            }
            .navigationTitle(Text(MailViewStrings.emailTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(action: onClose) { Text(Strings.close) }
                }
            }
        }
        .accessibilityIdentifier("mail.email")
    }

    private var message: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s2) {
            ChipFlow(spacing: BFHRSpace.s2) {
                Text(verbatim: detail.sender.name ?? detail.sender.address)
                    .font(.bfhr(.subheadline, emphasized: true))
                    .foregroundStyle(BFHRColor.Fg.primary)
                    .fixedSize(horizontal: false, vertical: true)
                RelativeTimeText(detail.receivedAt, style: .dayAndTime)
                    .font(.bfhr(.caption1))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
                    .fixedSize()
            }
            Text(verbatim: detail.sender.address + (detail.accountAddress.map { " → \($0)" } ?? ""))
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
            Text(verbatim: detail.subject)
                .font(.bfhr(.headline))
                .foregroundStyle(BFHRColor.Fg.primary)
                .fixedSize(horizontal: false, vertical: true)
            Text(verbatim: showsFullEmail ? detail.bodyText ?? detail.snippet : detail.snippet)
                .font(.bfhr(.subheadline))
                .foregroundStyle(BFHRColor.Fg.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .textSelection(.enabled)
            if let body = detail.bodyText, body != detail.snippet {
                Button { showsFullEmail.toggle() } label: {
                    Text(showsFullEmail ? Strings.showLess : Strings.showFullEmail)
                }
                .buttonStyle(.bfhrPlain)
                .padding(.leading, -BFHRSpace.s2)
            } else if detail.bodyText == nil {
                Text(MailViewStrings.bodyRemoved)
                    .font(.bfhr(.footnote))
                    .foregroundStyle(BFHRColor.Fg.tertiary)
            }
        }
        .padding(BFHRSpace.s3)
        .background(BFHRColor.Surface.sunken, in: BFHRRadius.shape(BFHRRadius.lg))
    }

    private var filing: some View {
        VStack(alignment: .leading, spacing: BFHRSpace.s3) {
            field(Strings.fieldCategory) {
                Label { Text(Strings.classification(detail.category, hedged: false)) } icon: { Image(systemName: detail.category.glyph) }
            }
            field(Strings.fieldApplication) {
                if let company = detail.company, detail.applicationId != nil {
                    HStack(spacing: BFHRSpace.s2) {
                        Text(verbatim: [company.name, detail.role].compactMap { $0 }.joined(separator: " · "))
                        if let status = detail.applicationStatus { StatusPill(status, size: .small) }
                    }
                } else {
                    Text(MailViewStrings.notFiled).foregroundStyle(BFHRColor.Fg.secondary)
                }
            }
            if let state = MailViewStrings.reviewState(detail.reviewState) {
                field(MailViewStrings.reviewStateLabel) { Text(state) }
            }
            if let applicationId = detail.applicationId, let url = URL(string: "bruteforcehr://applications/\(applicationId)") {
                Button {
                    onClose()
                    openURL(url)
                } label: {
                    Text(MailViewStrings.openApplication)
                }
                .buttonStyle(.bfhrPlain)
                .padding(.leading, -BFHRSpace.s2)
                .accessibilityIdentifier("mail.email.openApplication")
            }
        }
    }

    private func field(_ title: LocalizedStringResource, @ViewBuilder value: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.bfhr(.footnote))
                .foregroundStyle(BFHRColor.Fg.secondary)
            value()
                .font(.bfhr(.body))
                .foregroundStyle(BFHRColor.Fg.primary)
        }
        .accessibilityElement(children: .combine)
    }
}
