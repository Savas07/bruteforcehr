import BFHRDesignTokens
import SwiftUI

// Skeletons (components.md `Skeleton`, states.md rule 3): the real row layout with placeholder
// data, redacted; a soft shimmer only without Reduce Motion; shown only after 300 ms and then for
// at least 500 ms; at most one viewport of rows; the pane is marked busy with a label.

private struct SkeletonModifier: ViewModifier {
    let isActive: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func body(content: Content) -> some View {
        if isActive {
            content
                .redacted(reason: .placeholder)
                .foregroundStyle(BFHRColor.Skeleton.base)
                .modifier(Shimmer(isOn: BFHRMotion.shimmer(reduceMotion: reduceMotion)))
                .allowsHitTesting(false)
                .accessibilityHidden(true)
        } else {
            content
        }
    }
}

private struct Shimmer: ViewModifier {
    let isOn: Bool
    @State private var offset: CGFloat = -1

    func body(content: Content) -> some View {
        if isOn {
            content
                .overlay {
                    GeometryReader { proxy in
                        LinearGradient(
                            colors: [.clear, BFHRColor.Skeleton.highlight.opacity(0.8), .clear],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                        .frame(width: proxy.size.width * 0.6)
                        .offset(x: offset * proxy.size.width * 1.6)
                    }
                    .mask(content)
                    .allowsHitTesting(false)
                }
                .onAppear {
                    withAnimation(.linear(duration: 1.4).repeatForever(autoreverses: false)) { offset = 1 }
                }
        } else {
            content
        }
    }
}

extension View {
    /// Redacts this (real-layout, placeholder-data) view as a skeleton.
    public func bfhrSkeleton(_ isActive: Bool = true) -> some View {
        modifier(SkeletonModifier(isActive: isActive))
    }
}

/// Switches a pane between its skeleton, its pane error and its content by `LoadPhase`, with the
/// skeleton timing from `BFHRTiming` (nothing for the first 300 ms, then at least 500 ms), and
/// marks the pane busy for VoiceOver while loading.
///
/// ```swift
/// PhaseContainer(model.phase, loadingLabel: Strings.loading) {
///     List { … }
/// } skeleton: {
///     List { ForEach(0..<4) { _ in MyRow(.placeholder) } }
/// } failure: { failure in
///     PaneError(failure, retry: reload)
/// }
/// ```
public struct PhaseContainer<Content: View, Skeleton: View, Failure: View>: View {
    private let phase: LoadPhase
    private let loadingLabel: LocalizedStringResource
    private let content: Content
    private let skeleton: Skeleton
    private let failure: (LoadFailure) -> Failure

    @State private var skeletonVisible = false
    @State private var skeletonShownAt: Date?
    @State private var holdingSkeleton = false

    public init(
        _ phase: LoadPhase,
        loadingLabel: LocalizedStringResource = Strings.loading,
        @ViewBuilder content: () -> Content,
        @ViewBuilder skeleton: () -> Skeleton,
        @ViewBuilder failure: @escaping (LoadFailure) -> Failure
    ) {
        self.phase = phase
        self.loadingLabel = loadingLabel
        self.content = content()
        self.skeleton = skeleton()
        self.failure = failure
    }

    private var isLoading: Bool { phase == .loading }

    public var body: some View {
        Group {
            if isLoading || holdingSkeleton {
                ZStack {
                    Color.clear
                    if skeletonVisible {
                        skeleton.bfhrSkeleton()
                    }
                }
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(Text(loadingLabel))
                .accessibilityAddTraits(.updatesFrequently)
            } else if case .failed(let loadFailure) = phase {
                failure(loadFailure)
            } else {
                content
            }
        }
        .task(id: isLoading) { await updateSkeleton() }
    }

    private func updateSkeleton() async {
        if isLoading {
            guard !skeletonVisible else { return }
            try? await Task.sleep(for: .seconds(BFHRTiming.skeletonDelay))
            guard !Task.isCancelled, isLoading else { return }
            skeletonVisible = true
            skeletonShownAt = .now
        } else if let shownAt = skeletonShownAt {
            let remaining = BFHRTiming.skeletonMin - Date.now.timeIntervalSince(shownAt)
            if remaining > 0 {
                holdingSkeleton = true
                try? await Task.sleep(for: .seconds(remaining))
            }
            holdingSkeleton = false
            skeletonVisible = false
            skeletonShownAt = nil
        }
    }
}
