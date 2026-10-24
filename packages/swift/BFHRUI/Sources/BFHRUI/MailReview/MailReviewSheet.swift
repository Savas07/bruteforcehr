import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The review sheet of the Mail tab: the shared `ReviewSheet` (proposal, reason, evidence, the
/// fields, the interview an invite suggests, Confirm / Change… / Not job mail) in its own
/// navigation stack, with Change… pushing the correction form (Lloyds-style category list,
/// searchable application picker). The sheet always shows the draft, so after a correction the
/// sentence and the fields say exactly what Confirm will do. There is no "Confirm all" anywhere.
struct MailReviewSheet: View {
    @Bindable var model: MailReviewModel
    let onConfirm: () -> Void
    let onNotJobMail: () -> Void
    @State private var path: [Step] = []

    enum Step: Hashable {
        case change
        case application
    }

    var body: some View {
        NavigationStack(path: $path) {
            Group {
                if let proposal = model.draftProposal {
                    ReviewSheet(
                        proposal,
                        isOffline: model.connection.isOffline,
                        onConfirm: onConfirm,
                        onChange: { path.append(.change) },
                        onNotJobMail: onNotJobMail
                    )
                }
            }
            .navigationTitle(Text(MailViewStrings.sheetTitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { model.endReview() } label: { Text(Strings.close) }
                }
            }
            .navigationDestination(for: Step.self) { step in
                switch step {
                case .change:
                    CorrectionForm(model: model, path: $path, onConfirm: onConfirm)
                case .application:
                    ApplicationPicker(model: model) { path.removeLast() }
                }
            }
        }
    }
}

/// Change…: category and application as native form rows; the status change follows from them
/// (the server's rule), so it's shown, not picked. Confirm stays disabled until both are set.
private struct CorrectionForm: View {
    @Bindable var model: MailReviewModel
    @Binding var path: [MailReviewSheet.Step]
    let onConfirm: () -> Void

    var body: some View {
        Form {
            if let proposal = model.draftProposal {
                Section {
                    VStack(alignment: .leading, spacing: BFHRSpace.s1) {
                        Text(verbatim: proposal.sender.name ?? proposal.sender.address)
                            .font(.bfhr(.subheadline, emphasized: true))
                            .foregroundStyle(BFHRColor.Fg.primary)
                        Text(verbatim: proposal.subject)
                            .font(.bfhr(.subheadline))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }

                Section {
                    Picker(selection: categoryBinding) {
                        if model.draft?.category == nil {
                            Text(MailViewStrings.selectCategory).tag(MailCategory?.none)
                        }
                        ForEach(model.categoryOptions, id: \.self) { category in
                            Label { Text(Strings.classification(category, hedged: false)) } icon: { Image(systemName: category.glyph) }
                                .tag(Optional(category))
                        }
                    } label: {
                        Text(Strings.fieldCategory)
                    }
                    .mailNavigationLinkPicker()

                    NavigationLink(value: MailReviewSheet.Step.application) {
                        LabeledContent {
                            if let company = proposal.company, proposal.applicationId != nil {
                                Text(verbatim: [company.name, proposal.role].compactMap { $0 }.joined(separator: " · "))
                            } else {
                                Text(MailViewStrings.selectApplication).foregroundStyle(BFHRTone.warning.text)
                            }
                        } label: {
                            Text(Strings.fieldApplication)
                        }
                    }

                    LabeledContent {
                        if proposal.applicationId == nil {
                            Text(MailViewStrings.statusNeedsApplication)
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        } else if let target = proposal.proposedStatus, target != proposal.currentStatus {
                            StatusPill(target, size: .small)
                        } else {
                            Text(Strings.noStatusChange)
                        }
                    } label: {
                        Text(Strings.fieldStatusChange)
                    }
                    .accessibilityElement(children: .combine)
                } footer: {
                    Text(MailViewStrings.changeFooter)
                }

                if model.connection.isOffline {
                    Section {
                        Text(Strings.willSync)
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                    }
                }
            }
        }
        .navigationTitle(Text(MailViewStrings.changeTitle))
        .bfhrInlineTitle()
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button(action: onConfirm) { Text(Strings.confirm) }
                    .disabled(!model.canConfirm)
            }
        }
    }

    private var categoryBinding: Binding<MailCategory?> {
        Binding(get: { model.draft?.category }, set: { model.draft?.category = $0 })
    }
}

/// Link to application…: every application by company, searchable by company or role.
private struct ApplicationPicker: View {
    @Bindable var model: MailReviewModel
    let onPicked: () -> Void
    @State private var query = ""

    var body: some View {
        List {
            if options.isEmpty {
                Text(MailViewStrings.noMatchingApplications)
                    .font(.bfhr(.subheadline))
                    .foregroundStyle(BFHRColor.Fg.secondary)
            }
            ForEach(options) { option in
                Button {
                    model.draft?.applicationId = option.id
                    onPicked()
                } label: {
                    HStack(spacing: BFHRSpace.s3) {
                        CompanyMonogram(option.company)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(verbatim: option.company.name)
                                .font(.bfhr(.subheadline, emphasized: true))
                                .foregroundStyle(BFHRColor.Fg.primary)
                            Text(verbatim: option.role)
                                .font(.bfhr(.footnote))
                                .foregroundStyle(BFHRColor.Fg.secondary)
                        }
                        Spacer(minLength: BFHRSpace.s2)
                        StatusPill(option.status, size: .small)
                        if option.id == model.draft?.applicationId {
                            Image(systemName: "checkmark")
                                .foregroundStyle(BFHRColor.Accent.text)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(option.id == model.draft?.applicationId ? .isSelected : [])
            }
        }
        .searchable(text: $query, prompt: Text(MailViewStrings.searchApplications))
        .navigationTitle(Text(Strings.fieldApplication))
        .bfhrInlineTitle()
    }

    private var options: [ApplicationOption] {
        let query = query.trimmingCharacters(in: .whitespaces)
        guard !query.isEmpty else { return model.applicationOptions }
        return model.applicationOptions.filter {
            $0.company.name.localizedStandardContains(query) || $0.role.localizedStandardContains(query)
        }
    }
}
