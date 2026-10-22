import BFHRCore
import BFHRDesignTokens
import SwiftUI

private typealias L = CVEditorViewStrings

/// The page's own colours. A CV page is paper: white with dark ink in light and dark mode alike,
/// like the PDF it previews. These are document colours, not UI colours, so they sit outside
/// the token set (the accent comes from the CV's theme).
enum CVPaperInk {
    static let sheet = Color(.sRGB, white: 1, opacity: 1)
    static let primary = Color(.sRGB, red: 0.11, green: 0.12, blue: 0.14)
    static let secondary = Color(.sRGB, red: 0.33, green: 0.35, blue: 0.39)
}

/// The Preview segment: the CV as A4 / Letter pages, stacked vertically (Docusign) and scaled
/// to the screen width, with "Actual size" in the toolbar for a 1:1 look. Rendered natively from
/// the same JSON Resume content the editor changes, so it updates instantly and works offline;
/// the text is real text, so VoiceOver reads it in order like an ATS would.
struct CVPreviewSegment: View {
    let blocks: [CVPageBlock]
    let paper: CVPaper
    let accent: Color
    let templateId: String
    let zoomed: Bool
    @State private var heights: [CVPageBlock: CGFloat] = [:]

    /// Page breaks once every block is measured.
    private var pages: [[Int]]? {
        guard blocks.allSatisfy({ heights[$0] != nil }) else { return nil }
        return CVPagination.pages(
            heights: blocks.map { Double(heights[$0] ?? 0) },
            keepsWithNext: blocks.map(\.keepsWithNext),
            pageHeight: paper.contentHeight,
            spacing: CVPageView.blockSpacing
        )
    }

    var body: some View {
        GeometryReader { proxy in
            let fit = min(1, (proxy.size.width - 2 * BFHRSpace.s4) / paper.width)
            let scale = zoomed ? 1 : fit
            ScrollView(zoomed ? [.horizontal, .vertical] : .vertical) {
                VStack(spacing: BFHRSpace.s4) {
                    if let pages {
                        ForEach(Array(pages.enumerated()), id: \.offset) { number, page in
                            CVPageView(blocks: page.map { blocks[$0] }, paper: paper, accent: accent)
                                .scaleEffect(scale, anchor: .topLeading)
                                .frame(width: paper.width * scale, height: paper.height * scale, alignment: .topLeading)
                                .accessibilityElement(children: .contain)
                                .accessibilityLabel(Text(L.pageOf(number + 1, pages.count)))
                                .accessibilityIdentifier("cv.page.\(number + 1)")
                        }
                        Text(L.previewFooter(pages.count, paper.size == .a4 ? "A4" : "Letter", templateName))
                            .font(.bfhr(.footnote))
                            .foregroundStyle(BFHRColor.Fg.secondary)
                            .multilineTextAlignment(.center)
                            .frame(maxWidth: max(proxy.size.width - 2 * BFHRSpace.s4, 0))
                    } else {
                        ProgressNote(L.renderingPreview)
                            .padding(.top, BFHRSpace.s8)
                    }
                }
                .padding(BFHRSpace.s4)
                .frame(minWidth: proxy.size.width)
            }
            .background(alignment: .topLeading) { measurement }
        }
        .background(BFHRColor.groupedBackground)
    }

    /// Lays every block out once at the page's text width to learn its height.
    private var measurement: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                CVBlockView(block: block, accent: accent)
                    .fixedSize(horizontal: false, vertical: true)
                    .onGeometryChange(for: CGFloat.self, of: \.size.height) { heights[block] = $0 }
            }
        }
        .frame(width: paper.contentWidth, alignment: .leading)
        .fixedSize(horizontal: true, vertical: true)
        .hidden()
        .accessibilityHidden(true)
    }

    private var templateName: String {
        templateId == "classic" ? String(localized: L.templateClassic) : templateId.capitalized
    }
}

/// One page: paper, margins, blocks.
struct CVPageView: View {
    static let blockSpacing: Double = 6

    let blocks: [CVPageBlock]
    let paper: CVPaper
    let accent: Color

    var body: some View {
        VStack(alignment: .leading, spacing: Self.blockSpacing) {
            ForEach(Array(blocks.enumerated()), id: \.offset) { _, block in
                CVBlockView(block: block, accent: accent)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 0)
        }
        .padding(paper.margin)
        .frame(width: paper.width, height: paper.height, alignment: .topLeading)
        .background(CVPaperInk.sheet, in: BFHRRadius.shape(BFHRRadius.xs))
        .overlay(BFHRRadius.shape(BFHRRadius.xs).strokeBorder(BFHRColor.Line.subtle, lineWidth: BFHRBorderWidth.hairline))
        .bfhrElevation(.raised)
        .environment(\.colorScheme, .light)
    }
}

/// A block's typography. Fixed point sizes: this is the printed page, not UI text, so it doesn't
/// follow Dynamic Type (Actual size and VoiceOver cover reading; the Edit segment scales).
private struct CVBlockView: View {
    let block: CVPageBlock
    let accent: Color

    private func body(_ size: CGFloat) -> Font { .system(size: size) }
    private func serif(_ size: CGFloat, _ weight: Font.Weight) -> Font { .system(size: size, weight: weight, design: .serif) }

    var body: some View {
        switch block {
        case .header(let name, let headline, let contact):
            VStack(alignment: .leading, spacing: 3) {
                if !name.isEmpty {
                    Text(verbatim: name).font(serif(22, .semibold)).foregroundStyle(CVPaperInk.primary)
                        .accessibilityAddTraits(.isHeader)
                }
                if let headline {
                    Text(verbatim: headline).font(body(11)).foregroundStyle(accent)
                }
                if !contact.isEmpty {
                    Text(verbatim: contact.joined(separator: "  ·  ")).font(body(8.5)).foregroundStyle(CVPaperInk.secondary)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.bottom, 4)
        case .heading(let title):
            VStack(alignment: .leading, spacing: 3) {
                Text(verbatim: title.uppercased())
                    .font(body(9).weight(.semibold))
                    .tracking(0.9)
                    .foregroundStyle(accent)
                Rectangle().fill(accent.opacity(0.5)).frame(height: 0.75)
            }
            .padding(.top, 8)
            .accessibilityAddTraits(.isHeader)
        case .paragraph(let text):
            Text(verbatim: text).font(body(9)).lineSpacing(1.5).foregroundStyle(CVPaperInk.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        case .entry(let title, let subtitle, let dates, let location, let summary, let firstBullet):
            VStack(alignment: .leading, spacing: 2) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    (Text(verbatim: title).font(body(9.5).weight(.semibold))
                        + Text(verbatim: subtitle.map { "  ·  \($0)" } ?? "").font(body(9.5)))
                        .foregroundStyle(CVPaperInk.primary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if let dates {
                        Text(verbatim: dates).font(body(8.5)).foregroundStyle(CVPaperInk.secondary).fixedSize()
                    }
                }
                if let location {
                    Text(verbatim: location).font(body(8.5)).foregroundStyle(CVPaperInk.secondary)
                }
                if let summary {
                    Text(verbatim: summary).font(body(9)).italic().lineSpacing(1.5).foregroundStyle(CVPaperInk.primary)
                }
                if let firstBullet {
                    CVBulletLine(text: firstBullet)
                }
            }
            .padding(.top, 2)
        case .bullet(let text):
            CVBulletLine(text: text)
        case .labeledLine(let label, let text):
            (Text(verbatim: label.map { "\($0): " } ?? "").font(body(9).weight(.semibold)) + Text(verbatim: text).font(body(9)))
                .foregroundStyle(CVPaperInk.primary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

private struct CVBulletLine: View {
    let text: String

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 5) {
            Text(verbatim: "•").font(.system(size: 9)).accessibilityHidden(true)
            Text(verbatim: text).font(.system(size: 9)).lineSpacing(1.5).frame(maxWidth: .infinity, alignment: .leading)
        }
        .foregroundStyle(CVPaperInk.primary)
        .padding(.leading, 6)
    }
}
