import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// Foundation rendering of `TrackerBoardModel`: the pipeline as status sections with the shared
/// components (status headers, swipe / context actions, Move to…, Undo toasts). The screen's real
/// design replaces this file.
public struct TrackerBoardScreen: View {
    @Bindable private var model: TrackerBoardModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @State private var moving: PipelineRow?
    @State private var advanceCount = 0

    public init(model: TrackerBoardModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: TrackerViewStrings.loading) {
            if model.isEmpty {
                EmptyState(
                    .firstUse,
                    glyph: "rectangle.split.3x1",
                    title: TrackerViewStrings.emptyTitle,
                    message: TrackerViewStrings.emptyBody,
                    primary: .init(TrackerViewStrings.addApplication) {}
                )
            } else {
                pipeline
            }
        } skeleton: {
            List {
                ForEach([ApplicationStatus.applied, .screening, .interviewing], id: \.self) { status in
                    Section {
                        ForEach(0..<2, id: \.self) { _ in row(.placeholder(status)) }
                    } header: {
                        StatusHeader(status: status, count: nil)
                    }
                }
            }
            .bfhrInsetGroupedList()
        } failure: { failure in
            PaneError(failure, title: TrackerViewStrings.errorTitle, retry: {})
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        .bfhrHaptic(.confirm, trigger: advanceCount)
        .sheet(item: $moving) { row in
            NavigationStack {
                StatusMenu(model.moveTargets(for: row.id)) { status in
                    moving = nil
                    run { try model.move(row.id, to: status) }
                }
                .navigationTitle(Text(Strings.moveTo))
                .bfhrInlineTitle()
            }
            .presentationDetents([.medium, .large])
        }
    }

    private var pipeline: some View {
        List {
            ConnectionBannerSection(model.connection)
            Section {
                Picker(selection: $model.scope) {
                    ForEach(PipelineScope.allCases) { scope in Text(scope.label).tag(scope) }
                } label: {
                    EmptyView()
                }
                .pickerStyle(.segmented)
            }
            ForEach(model.sections) { section in
                Section {
                    ForEach(section.rows) { pipelineRow in
                        row(pipelineRow)
                            .bfhrRowActions(actions(for: pipelineRow))
                    }
                } header: {
                    StatusHeader(status: section.status, count: section.count)
                }
            }
        }
        .bfhrInsetGroupedList()
    }

    private func row(_ row: PipelineRow) -> some View {
        HStack(alignment: .top, spacing: BFHRSpace.s3) {
            CompanyMonogram(row.company, badge: row.lastMoveAutomatic ? "envelope" : nil)
            VStack(alignment: .leading, spacing: 2) {
                Text(verbatim: row.role).font(.bfhr(.headline)).foregroundStyle(BFHRColor.Fg.primary).lineLimit(2)
                Text(verbatim: row.company.name).font(.bfhr(.subheadline)).foregroundStyle(BFHRColor.Fg.secondary)
                switch row.secondLine {
                case .interview(let startsAt, _):
                    RelativeTimeText(startsAt, style: .dayAndTime).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                case .nextAction(let text, _):
                    Text(verbatim: text).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.secondary)
                case .stale(let days):
                    Text(TrackerViewStrings.noReply(days)).font(.bfhr(.footnote)).foregroundStyle(BFHRColor.Fg.tertiary)
                case .none:
                    EmptyView()
                }
            }
            Spacer(minLength: BFHRSpace.s2)
            if row.pendingSync { SyncGlyph() }
        }
        .accessibilityElement(children: .combine)
    }

    private func actions(for row: PipelineRow) -> [RowAction] {
        var actions: [RowAction] = []
        if let next = model.advanceTarget(for: row.id) {
            actions.append(RowAction(TrackerViewStrings.advance(to: next), systemImage: "arrow.right", edge: .leading, id: "advance", haptic: .confirm) {
                run { try model.move(row.id, to: next) }
            })
        }
        actions.append(RowAction(Strings.moveTo, systemImage: "arrow.left.arrow.right", edge: .trailing, id: "move") { moving = row })
        return actions
    }

    private func run(_ action: () throws -> ToastItem) {
        do {
            toasts?.show(try action())
        } catch {
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: TrackerViewStrings.moveFailed))
        }
    }
}

private extension PipelineRow {
    static func placeholder(_ status: ApplicationStatus) -> PipelineRow {
        PipelineRow(
            id: UUID().uuidString, company: CompanyIdentity(name: "Company"), role: "Frontend Engineer",
            status: status, statusChangedAt: .now, daysInStage: 3, nextDate: nil, secondLine: .none,
            lastMoveAutomatic: false, pendingSync: false
        )
    }
}

enum TrackerViewStrings {
    static let loading = LocalizedStringResource.bfhr("tracker.loading", default: "Loading applications", table: "TrackerBoard")
    static let errorTitle = LocalizedStringResource.bfhr("tracker.error.title", default: "We couldn't load your applications", table: "TrackerBoard")
    static let emptyTitle = LocalizedStringResource.bfhr("tracker.empty.title", default: "Nothing tracked yet", table: "TrackerBoard")
    static let emptyBody = LocalizedStringResource.bfhr("tracker.empty.body", default: "Save a job or add an application you've already sent.", table: "TrackerBoard")
    static let addApplication = LocalizedStringResource.bfhr("tracker.empty.add", default: "Add application", table: "TrackerBoard")
    static let moveFailed = LocalizedStringResource.bfhr("tracker.toast.moveFailed", default: "That move isn't available from this stage.", table: "TrackerBoard")

    static func advance(to status: ApplicationStatus) -> LocalizedStringResource {
        .bfhr("tracker.action.advance", default: "Move to \(status.label)", table: "TrackerBoard")
    }

    static func noReply(_ days: Int) -> LocalizedStringResource {
        .bfhr("tracker.row.noReply", default: "No reply in \(days) days", table: "TrackerBoard")
    }
}
