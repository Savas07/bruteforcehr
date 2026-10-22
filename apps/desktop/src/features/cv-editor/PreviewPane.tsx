/**
 * Live preview (components.md `CvPreview`): the draft as the ATS-safe single-column template,
 * real text and standard headings, on paper-sized pages over a tinted canvas. Pages break on
 * block boundaries measured off-screen; zoom fits the pane by default (Mod+= / Mod+- while the
 * preview has focus). Pages always render in the light scheme: they show the document, not UI.
 * Clicking a block focuses its fields in the editor; the focused field's block is highlighted.
 */
import { Minus, Plus } from "lucide-react";
import { useDeferredValue, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button, IconButton } from "../../shared/ui/Button";
import type { CvDraft } from "./draft";
import { buildPreviewDocument, paginate, type CvPreviewBlock } from "./preview-document";

const messages = defineMessages({
  title: { id: "cv-editor.preview.title", defaultMessage: "Preview" },
  facts: {
    id: "cv-editor.preview.facts",
    defaultMessage: "{paper} · {pages, plural, one {# page} other {# pages}}",
    description: "Preview header: 'A4 · 2 pages'",
  },
  zoomIn: { id: "cv-editor.preview.zoomIn", defaultMessage: "Zoom in" },
  zoomOut: { id: "cv-editor.preview.zoomOut", defaultMessage: "Zoom out" },
  fit: {
    id: "cv-editor.preview.fit",
    defaultMessage: "{zoom, number, percent}",
    description: "Zoom button label showing the current zoom; pressing it fits the page to the pane",
  },
  fitHint: { id: "cv-editor.preview.fitHint", defaultMessage: "Fit to pane" },
  page: {
    id: "cv-editor.preview.page",
    defaultMessage: "Page {page, number} of {pages, number}",
  },
});

/** CSS px at 96 dpi. */
const PAPER_PX = { a4: { width: 794, height: 1123 }, letter: { width: 816, height: 1056 } } as const;
const PAGE_PADDING = { compact: 48, comfortable: 60, spacious: 72 } as const;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;

function Block({ block, accent }: { block: CvPreviewBlock; accent: string }) {
  switch (block.kind) {
    case "header":
      return (
        <div className="flex items-start gap-4 pb-4">
          <div className="min-w-0 flex-1">
            <p className="text-[26px] leading-tight font-semibold">{block.name}</p>
            {block.headline && <p className="text-fg-secondary mt-1 text-[14px]">{block.headline}</p>}
            {block.contact.length > 0 && (
              <p className="text-fg-secondary mt-2 text-[11.5px] leading-snug">{block.contact.join("  ·  ")}</p>
            )}
            {block.dateOfBirth && <p className="text-fg-secondary mt-1 text-[11.5px]">{block.dateOfBirth}</p>}
          </div>
          {block.photoUrl && <img src={block.photoUrl} alt="" className="size-24 shrink-0 rounded-xs object-cover" />}
        </div>
      );
    case "heading":
      return (
        <div className="pt-3 pb-1.5">
          <h2
            className="border-b pb-1 text-[13px] font-semibold tracking-wide uppercase"
            style={{ color: accent, borderColor: accent }}
          >
            {block.text}
          </h2>
        </div>
      );
    case "text":
      return <p className="pb-2 text-[12.5px] leading-relaxed">{block.text}</p>;
    case "line":
      return (
        <p className="pb-1 text-[12.5px] leading-relaxed">
          <span className="font-semibold">{block.label}</span>
          {block.text && `: ${block.text}`}
        </p>
      );
    case "entry":
      return (
        <div className="pb-2.5 text-[12.5px] leading-relaxed">
          <p className="flex items-baseline justify-between gap-4">
            <span>
              <span className="font-semibold">{block.title}</span>
              {block.org && <span>{` · ${block.org}`}</span>}
            </span>
            {block.dates && <span className="text-fg-secondary shrink-0 tabular-nums">{block.dates}</span>}
          </p>
          {block.location && <p className="text-fg-secondary">{block.location}</p>}
          {block.detail && <p className="mt-0.5">{block.detail}</p>}
          {block.bullets.length > 0 && (
            <ul className="mt-1 list-disc pl-5">
              {block.bullets.map((bullet, index) => (
                <li key={index}>{bullet}</li>
              ))}
            </ul>
          )}
        </div>
      );
  }
}

export function PreviewPane({
  draft,
  paperLabel,
  highlightId,
  onLocate,
}: {
  draft: CvDraft;
  paperLabel: string;
  /** Block id of the field being edited (item id, `summary`, `header`). */
  highlightId: string | null;
  onLocate: (block: CvPreviewBlock) => void;
}) {
  const intl = useIntl();
  // ~150 ms behind typing is fine for a preview and keeps keystrokes cheap.
  const deferred = useDeferredValue(draft);
  const document = buildPreviewDocument(deferred);
  const paper = PAPER_PX[deferred.paperSize];
  const padding = PAGE_PADDING[deferred.density];
  const contentWidth = paper.width - padding * 2;

  const measureRef = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<number[][]>([document.blocks.map((_, index) => index)]);
  const signature = JSON.stringify(document) + contentWidth + paper.height;
  useLayoutEffect(() => {
    const container = measureRef.current;
    if (!container) return;
    const children = [...container.children] as HTMLElement[];
    const heights = children.map((child) => child.getBoundingClientRect().height);
    setPages(paginate(heights, document.blocks.map((block) => block.kind), paper.height - padding * 2));
    // `signature` covers the document and page geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const canvasRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width ?? 0;
      setFitScale(Math.min(1, Math.max(ZOOM_MIN, (width - 48) / paper.width)));
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [paper.width]);
  const scale = zoom ?? fitScale;
  const step = (delta: number) =>
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((scale + delta) * 10) / 10)));

  const regionRef = useRef<HTMLElement>(null);
  const inPreview = () => regionRef.current?.contains(globalThis.document.activeElement) ?? false;
  useKeyBindings([
    {
      id: "cv-editor.preview.zoomIn",
      keys: "Mod+=",
      label: intl.formatMessage(messages.zoomIn),
      group: "CV editor",
      when: inPreview,
      run: () => step(0.1),
    },
    {
      id: "cv-editor.preview.zoomOut",
      keys: "Mod+-",
      label: intl.formatMessage(messages.zoomOut),
      group: "CV editor",
      when: inPreview,
      run: () => step(-0.1),
    },
  ]);

  const accent = deferred.accentColor;
  const pageStyle: CSSProperties = { width: paper.width, height: paper.height, padding, transform: `scale(${scale})` };
  return (
    <section
      ref={regionRef}
      aria-labelledby="cv-preview-title"
      className="bg-surface-sunken flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="border-line-subtle bg-surface-base flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <h2 id="cv-preview-title" className="text-headline">
          {intl.formatMessage(messages.title)}
        </h2>
        <span className="text-fg-secondary text-footnote">
          {intl.formatMessage(messages.facts, { paper: paperLabel, pages: pages.length })}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton
            size="sm"
            icon={Minus}
            label={intl.formatMessage(messages.zoomOut)}
            shortcut="Mod+-"
            onClick={() => step(-0.1)}
          />
          <Button
            size="sm"
            variant="plain"
            hint={intl.formatMessage(messages.fitHint)}
            className="min-w-12 justify-center tabular-nums"
            onClick={() => setZoom(null)}
          >
            {intl.formatMessage(messages.fit, { zoom: scale })}
          </Button>
          <IconButton
            size="sm"
            icon={Plus}
            label={intl.formatMessage(messages.zoomIn)}
            shortcut="Mod+="
            onClick={() => step(0.1)}
          />
        </div>
      </header>
      <div ref={canvasRef} className="relative min-h-0 flex-1 overflow-auto">
        {/* Off-screen measuring copy at the page's content width. */}
        <div
          ref={measureRef}
          aria-hidden
          data-theme="light"
          className="invisible absolute top-0 left-0 font-sans"
          style={{ width: contentWidth }}
        >
          {document.blocks.map((block) => (
            <div key={block.id}>
              <Block block={block} accent={accent} />
            </div>
          ))}
        </div>
        <div className="flex flex-col items-center gap-6 px-6 py-6">
          {pages.map((indexes, pageIndex) => (
            <div
              key={pageIndex}
              role="group"
              aria-label={intl.formatMessage(messages.page, { page: pageIndex + 1, pages: pages.length })}
              style={{ width: paper.width * scale, height: paper.height * scale }}
              className="shrink-0"
            >
              <div
                lang={document.lang}
                data-theme="light"
                style={pageStyle}
                className="bg-surface-base text-fg-primary shadow-raised origin-top-left overflow-hidden rounded-xs font-sans"
              >
                {indexes.map((index) => {
                  const block = document.blocks[index];
                  if (!block) return null;
                  const highlighted = highlightId !== null && block.id === highlightId;
                  return (
                    <div
                      key={block.id}
                      onClick={() => onLocate(block)}
                      className={cx(
                        "-mx-1 cursor-pointer rounded-xs px-1 transition-colors",
                        highlighted ? "bg-accent-subtle" : "hover:bg-surface-hover",
                      )}
                    >
                      <Block block={block} accent={accent} />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
