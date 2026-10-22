import BFHRCore
import BFHRDesignTokens
import SwiftUI

/// The Tracker tab's Pipeline (tracker.md "Decision — iOS"): one grouped list instead of a column
/// pager. Scope tabs (Active · Closed · All), a scrolling stage strip with counts, sticky
/// collapsible stage sections, and three equal ways to move an application: long-press → Move to…
/// (also the VoiceOver action), swipe actions, and drag onto a stage of the strip. Every move goes
/// through BFHRCore's state machine as the user and offers Undo. Rows push the Application detail.
public struct TrackerBoardScreen: View {
    @Bindable private var model: TrackerBoardModel
    @Environment(ToastCenter.self) private var toasts: ToastCenter?
    @Environment(\.openURL) private var openURL
    @State private var sheet: TrackerSheet?
    /// Sections the user opened or closed; others follow `collapsedByDefault`.
    @State private var expansion: [ApplicationStatus: Bool] = [:]
    @State private var errorCount = 0
    // Drag: the strip's chips are the drop targets. When the strip has scrolled away, the same
    // chips pin over the top of the list for the length of the drag (`DropPanel`).
    @State private var draggedId: String?
    @State private var stripVisible = true
    @State private var dropPanelVisible = false
    @State private var hoveredStage: ApplicationStatus?
    @State private var hideDropPanel: Task<Void, Never>?

    public init(model: TrackerBoardModel) {
        self.model = model
    }

    public var body: some View {
        PhaseContainer(model.phase, loadingLabel: TrackerBoardStrings.loading) {
            if model.isEmpty {
                emptyPipeline
            } else {
                pipeline
            }
        } skeleton: {
            TrackerSkeleton()
        } failure: { failure in
            PaneError(failure, title: TrackerBoardStrings.errorTitle, retry: reload)
        }
        .bfhrToastHost()
        .environment(\.bfhrNow, model.now)
        .bfhrHaptic(.error, trigger: errorCount)
        .sheet(item: $sheet) { sheet in
            TrackerMoveSheet(sheet: sheet, model: model) { status in
                self.sheet = nil
                run { try model.move(sheet.applicationId, to: status) }
            } onCancel: {
                self.sheet = nil
            }
        }
    }

    // MARK: Empty

    private var emptyPipeline: some View {
        VStack(spacing: 0) {
            ConnectionBanner(model.connection)
            EmptyState(
                .firstUse,
                glyph: "rectangle.split.3x1",
                title: TrackerBoardStrings.emptyTitle,
                message: TrackerBoardStrings.emptyBody,
                primary: .init(TrackerBoardStrings.findJobs) {
                    if let url = URL(string: "bruteforcehr://jobs") { openURL(url) }
                }
            )
        }
    }

    // MARK: Pipeline

    private var pipeline: some View {
        ScrollViewReader { proxy in
            List {
                ConnectionBannerSection(model.connection)
                Section {
                    Picker(selection: $model.scope) {
                        ForEach(PipelineScope.allCases) { scope in Text(scope.label).tag(scope) }
                    } label: {
                        Text(TrackerBoardStrings.scopeLabel)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()
                    .accessibilityLabel(Text(TrackerBoardStrings.scopeLabel))
                    .listRowSeparator(.hidden)
                    StageStrip(
                        stages: model.stageStrip,
                        drop: StageDrop(hovered: hoveredStage, onTarget: target, onDrop: drop)
                    ) { status in
                        expansion[status] = true
                        withAnimation(BFHRMotion.animation(.base, easing: .standard, reduceMotion: reduceMotion)) {
                            proxy.scrollTo(status, anchor: .top)
                        }
                    }
                    .onScrollVisibilityChange(threshold: 0.5) { visible in stripVisible = visible }
                    .listRowInsets(EdgeInsets())
                    .listRowSeparator(.hidden)
                }
                ForEach(model.sections) { section in
                    Section {
                        if isExpanded(section) {
                            ForEach(section.rows) { row in
                                NavigationLink {
                                    TrackerApplicationDetailScreen(model: model, applicationId: row.id)
                                } label: {
                                    // On the content, not the row: SwiftUI then adds its own drag
                                    // interaction instead of the list's, which iPhone disables.
                                    PipelineRowView(row: row)
                                        .draggable(beginDrag(row.id))
                                }
                                .bfhrRowActions(actions(for: row))
                            }
                        }
                    } header: {
                        StageSectionHeader(section: section, isExpanded: isExpanded(section), phaseCaption: phaseCaption(for: section)) {
                            withAnimation(BFHRMotion.animation(.base, easing: .standard, reduceMotion: reduceMotion)) {
                                expansion[section.status] = !isExpanded(section)
                            }
                        }
                    }
                    .id(section.status)
                }
                if model.scope == .closed, model.sections.allSatisfy(\.isEmpty) {
                    Text(TrackerBoardStrings.closedEmpty)
                        .font(.bfhr(.subheadline))
                        .foregroundStyle(BFHRColor.Fg.secondary)
                        .listRowSeparator(.hidden)
                }
            }
            .listStyle(.plain)
            .overlay(alignment: .top) {
                if dropPanelVisible {
                    DropPanel(
                        targets: draggedId.map(model.moveTargets(for:)) ?? [],
                        drop: StageDrop(hovered: hoveredStage, onTarget: target, onDrop: drop)
                    )
                    .transition(.opacity)
                }
            }
            .sensoryFeedback(BFHRHaptic.dragTargetChange.feedback, trigger: hoveredStage) { _, new in new != nil }
        }
    }

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.bfhrReload) private var reload

    /// The phase (Shortlist, In progress, Closed) above the first stage of each phase, so the
    /// list reads as the three phases. Not in Closed, where it would only repeat the tab.
    private func phaseCaption(for section: PipelineSection) -> StatusPhase? {
        guard model.scope != .closed else { return nil }
        return model.sections.first { $0.phase == section.phase }?.status == section.status ? section.phase : nil
    }

    private func isExpanded(_ section: PipelineSection) -> Bool {
        guard !section.isEmpty else { return false }
        return expansion[section.status] ?? !section.collapsedByDefault
    }

    // MARK: Actions

    private func actions(for row: PipelineRow) -> [RowAction] {
        var actions: [RowAction] = []
        if let next = model.advanceTarget(for: row.id) {
            actions.append(RowAction(TrackerBoardStrings.moveTo(next), systemImage: "arrow.right", edge: .leading, id: "advance", haptic: .confirm) {
                run { try model.move(row.id, to: next) }
            })
        }
        actions.append(RowAction(Strings.moveTo, systemImage: "arrow.left.arrow.right", edge: .trailing, id: "move") {
            sheet = .move(row.id)
        })
        if row.status.isActive {
            actions.append(RowAction(TrackerBoardStrings.closeApplication, systemImage: "archivebox", edge: .trailing, id: "close") {
                sheet = .close(row.id)
            })
        }
        return actions
    }

    private func run(_ action: () throws -> ToastItem?) {
        do {
            if let item = try action() { toasts?.show(item) }
        } catch {
            errorCount += 1
            toasts?.show(ToastItem(glyph: ToastGlyph.info, message: TrackerBoardStrings.moveError(error)))
        }
    }

    // MARK: Drag

    /// The drag payload, evaluated when a drag starts: remembers the lifted application (the
    /// panel dims targets the state machine refuses) and pins the panel if the strip is away.
    private func beginDrag(_ applicationId: String) -> String {
        draggedId = applicationId
        if !stripVisible {
            withAnimation(BFHRMotion.animation(.fast, easing: .enter, reduceMotion: reduceMotion)) { dropPanelVisible = true }
            scheduleHidePanel(after: .seconds(8))
        }
        return applicationId
    }

    /// A stage chip gained or lost the finger: name it ("Move to Screening") and tick.
    private func target(_ status: ApplicationStatus, _ targeted: Bool) {
        if targeted {
            hoveredStage = status
            hideDropPanel?.cancel()
        } else if hoveredStage == status {
            hoveredStage = nil
            // SwiftUI reports no cancelled drag; a panel nobody hovers goes away on its own.
            if dropPanelVisible { scheduleHidePanel(after: .seconds(3)) }
        }
    }

    private func scheduleHidePanel(after delay: Duration) {
        hideDropPanel?.cancel()
        hideDropPanel = Task {
            try? await Task.sleep(for: delay)
            guard !Task.isCancelled, hoveredStage == nil else { return }
            withAnimation(BFHRMotion.animation(.fast, easing: .exit, reduceMotion: reduceMotion)) { dropPanelVisible = false }
        }
    }

    private func drop(_ items: [String], on status: ApplicationStatus) -> Bool {
        hideDropPanel?.cancel()
        dropPanelVisible = false
        hoveredStage = nil
        draggedId = nil
        guard let id = items.first, let current = model.data.application(id: id)?.status, current != status else { return false }
        run { try model.move(id, to: status) }
        return true
    }
}

/// Move to… (every status) or Close… (outcomes only).
enum TrackerSheet: Identifiable, Hashable {
    case move(String)
    case close(String)

    var id: Self { self }

    var applicationId: String {
        switch self {
        case .move(let id), .close(let id): id
        }
    }
}

extension TrackerBoardStrings {
    /// The toast for a move the state machine refused: D16's reason when there is one.
    static func moveError(_ error: any Error) -> LocalizedStringResource {
        if let error = error as? TransitionError,
           let denial = TransitionDenial(rawValue: error.code.rawValue),
           let reason = denial.reason {
            return reason
        }
        return moveFailed
    }
}

// MARK: - Sheets

/// The Move to… / Close… sheet: `StatusMenu` with the medium detent, titled with the action and
/// the application it moves, on a solid background so the Pipeline doesn't show through.
struct TrackerMoveSheet: View {
    let sheet: TrackerSheet
    let model: TrackerBoardModel
    let onSelect: (ApplicationStatus) -> Void
    let onCancel: () -> Void

    var body: some View {
        NavigationStack {
            Group {
                switch sheet {
                case .move(let id): StatusMenu(model.moveTargets(for: id), onSelect: onSelect)
                case .close(let id): StatusMenu(model.outcomeTargets(for: id), onSelect: onSelect)
                }
            }
            .navigationTitle(Text(title))
            .modifier(SheetSubtitle(subtitle))
            .bfhrInlineTitle()
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    // The system ✕ (iOS 26): a "Close" text button would read like the
                    // Close… outcome action in this very sheet.
                    if #available(iOS 26, macOS 26, *) {
                        Button(role: .close, action: onCancel)
                    } else {
                        Button(role: .cancel, action: onCancel) { Text(Strings.close) }
                    }
                }
            }
        }
        .presentationDetents([.medium, .large])
        .presentationBackground(BFHRColor.groupedBackground)
    }

    private var title: LocalizedStringResource {
        switch sheet {
        case .move: Strings.moveTo
        case .close: TrackerBoardStrings.closeTitle
        }
    }

    /// "Aire Digital Health · Frontend Engineer": which application the sheet moves.
    private var subtitle: String? {
        model.data.application(id: sheet.applicationId).map { "\($0.company) · \($0.role)" }
    }
}

/// The system navigation subtitle (iOS 26) under the sheet's title.
private struct SheetSubtitle: ViewModifier {
    let subtitle: String?

    init(_ subtitle: String?) {
        self.subtitle = subtitle
    }

    func body(content: Content) -> some View {
        if let subtitle, #available(iOS 26, macOS 11, *) {
            content.navigationSubtitle(Text(verbatim: subtitle))
        } else {
            content
        }
    }
}
