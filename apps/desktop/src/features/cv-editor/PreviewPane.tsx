/**
 * Live preview (components.md `CvPreview`): exactly the HTML @bfhr/cv-render makes for the PDF
 * (ADR 0009, one renderer), shown in a shadow root so its styles and the app's never meet. Fonts
 * are registered with the FontFace API from the embedded bytes, styles adopted as constructed
 * stylesheets, so the app's strict CSP (no inline styles, no data: fonts) stays as it is.
 *
 * The sheet is drawn at paper width with a guide where each page ends (the PDF breaks between
 * lines; guides show roughly where). Zoom fits the pane by default (Mod+= / Mod+- while the
 * preview has focus). Clicking text focuses its field in the editor; the field being edited is
 * outlined. Pages always render light: they show the document, not UI.
 */
import type { CvRenderResult } from "@bfhr/cv-render";
import { Minus, Plus } from "lucide-react";
import { type RefObject, useDeferredValue, useEffect, useLayoutEffect, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useKeyBindings } from "../../shared/keyboard/useKeyBindings";
import { Button, IconButton } from "../../shared/ui/Button";

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
  pageEnd: {
    id: "cv-editor.preview.pageEnd",
    defaultMessage: "Page {page, number} ends here",
    description: "Guide line in the preview where a printed page ends",
  },
});

const PX_PER_MM = 96 / 25.4;
const ZOOM_MIN = 0.3;
const ZOOM_MAX = 1.5;

const FONT_FACE = /@font-face\{([^}]*)\}/gu;
const registeredFonts = new Set<string>();

/** Registers the HTML's embedded `@font-face` fonts with the document (once per face). */
function registerFonts(css: string): Promise<unknown> {
  const loads: Promise<unknown>[] = [];
  for (const match of css.matchAll(FONT_FACE)) {
    const body = match[1] ?? "";
    const family = /font-family:"([^"]+)"/u.exec(body)?.[1];
    const weight = /font-weight:([^;]+)/u.exec(body)?.[1]?.trim() ?? "400";
    const style = /font-style:([^;]+)/u.exec(body)?.[1]?.trim() ?? "normal";
    const data = /url\(["']?data:[^;]+;base64,([^"')]+)["']?\)/u.exec(body)?.[1];
    if (!family || !data) continue;
    const key = `${family}|${weight}|${style}`;
    if (registeredFonts.has(key)) continue;
    registeredFonts.add(key);
    const bytes = Uint8Array.from(atob(data), (char) => char.charCodeAt(0));
    const face = new FontFace(family, bytes, { weight, style });
    document.fonts.add(face);
    loads.push(face.load().catch((error: unknown) => console.error("CV font failed to load", family, error)));
  }
  return Promise.all(loads);
}

/**
 * The document's CSS for a shadow root: `:root` rules (the template's ink, accent and size
 * variables) move to the host, since `:root` matches nothing inside a shadow tree; `body` rules
 * move to the wrapper; fonts are registered apart.
 */
function shadowCss(css: string): string {
  return (
    css
      .replace(FONT_FACE, "")
      .replace(/(^|[}\s,]):root\s*\{/gu, "$1:host{")
      .replace(/(^|[}\s,])body\s*\{/gu, "$1.cv-root{")
      // The field being edited, and what the pointer is over.
      .concat(
        "[data-cv-path]{cursor:pointer;border-radius:2px}" +
          "[data-cv-path]:hover{background:rgba(0,0,0,.04)}" +
          "[data-cv-highlight]{outline:2px solid #2563eb;outline-offset:1px}",
      )
  );
}

function parseHtml(html: string): { css: string; body: string; lang: string } {
  const parsed = new DOMParser().parseFromString(html, "text/html");
  const css = [...parsed.querySelectorAll("style")].map((style) => style.textContent).join("\n");
  return { css, body: parsed.body.innerHTML, lang: parsed.documentElement.lang };
}

/** Puts cv-render `html` into `host`'s shadow root (styles adopted, `body` rules on the wrapper). */
function mountCv(host: HTMLElement, html: string): { root: ShadowRoot; css: string } {
  const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
  const { css, body, lang } = parseHtml(html);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(shadowCss(css));
  root.adoptedStyleSheets = [sheet];
  root.innerHTML = `<div class="cv-root" lang="${lang}">${body}</div>`;
  return { root, css };
}

/**
 * Renders cv-render `html` into `hostRef`'s shadow root; reports the sheet's height (CSS px,
 * unscaled) and, with `onLocate`, clicks on rendered text as JSON pointers.
 */
export function useCvShadow(
  hostRef: RefObject<HTMLDivElement | null>,
  html: string,
  onHeight: (height: number) => void,
  onLocate?: (path: string) => void,
): void {
  const callbacks = useRef({ onHeight, onLocate });
  useEffect(() => {
    callbacks.current = { onHeight, onLocate };
  });
  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const { root, css } = mountCv(host, html);
    const sheetElement = root.querySelector<HTMLElement>(".cv");
    const measure = () => callbacks.current.onHeight(sheetElement?.getBoundingClientRect().height ?? 0);
    measure();
    void registerFonts(css).then(measure);
    const observer = new ResizeObserver(measure);
    if (sheetElement) observer.observe(sheetElement);
    const click = (event: Event) => {
      const target = (event.target as Element | null)?.closest("[data-cv-path]");
      const path = target?.getAttribute("data-cv-path");
      if (path) callbacks.current.onLocate?.(path);
    };
    root.addEventListener("click", click);
    return () => {
      observer.disconnect();
      root.removeEventListener("click", click);
    };
  }, [hostRef, html]);
}

export function PreviewPane({
  rendered,
  paperLabel,
  highlightPath,
  onLocate,
}: {
  rendered: CvRenderResult;
  paperLabel: string;
  /** JSON pointer of the field being edited (`/work/0/highlights/1`), outlined in the preview. */
  highlightPath: string | null;
  /** A click on rendered text: its JSON pointer. */
  onLocate: (path: string) => void;
}) {
  const intl = useIntl();
  // A little behind typing is fine for a preview and keeps keystrokes cheap.
  const deferred = useDeferredValue(rendered);
  const { page } = deferred;
  const width = page.widthMm * PX_PER_MM;
  const printable = (page.heightMm - page.marginsMm.top - page.marginsMm.bottom) * PX_PER_MM;

  const hostRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(page.heightMm * PX_PER_MM);
  useCvShadow(hostRef, deferred.html, setHeight, onLocate);

  useLayoutEffect(() => {
    const root = hostRef.current?.shadowRoot;
    if (!root) return;
    for (const element of root.querySelectorAll("[data-cv-highlight]")) element.removeAttribute("data-cv-highlight");
    if (highlightPath === null) return;
    // The most specific rendered element for the path, else its nearest rendered parent.
    const segments = highlightPath.split("/");
    for (let length = segments.length; length > 1; length -= 1) {
      const element = root.querySelector(`[data-cv-path="${CSS.escape(segments.slice(0, length).join("/"))}"]`);
      if (element) {
        element.setAttribute("data-cv-highlight", "");
        return;
      }
    }
  }, [highlightPath, deferred.html]);

  const pages = Math.max(1, Math.ceil((height - (page.marginsMm.top + page.marginsMm.bottom) * PX_PER_MM - 1) / printable));
  const paperHeight = pages * page.heightMm * PX_PER_MM;

  const canvasRef = useRef<HTMLDivElement>(null);
  const [fitScale, setFitScale] = useState(0.5);
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Fit against the scrollport (`clientWidth` excludes classic scrollbars, e.g. WebView2), and
    // floor it so the scaled page never overflows the canvas horizontally.
    const fit = () =>
      setFitScale(Math.min(1, Math.max(ZOOM_MIN, Math.floor(((canvas.clientWidth - 48) / width) * 100) / 100)));
    const observer = new ResizeObserver(fit);
    fit();
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [width]);
  const scale = zoom ?? fitScale;
  const step = (delta: number) =>
    setZoom(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round((scale + delta) * 10) / 10)));

  const regionRef = useRef<HTMLElement>(null);
  const inPreview = () => regionRef.current?.contains(document.activeElement) ?? false;
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

  return (
    <section
      ref={regionRef}
      aria-labelledby="cv-preview-title"
      className="bg-surface-sunken relative flex min-h-0 min-w-0 flex-1 flex-col"
    >
      <header className="border-line-subtle bg-surface-base flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <h2 id="cv-preview-title" className="text-headline">
          {intl.formatMessage(messages.title)}
        </h2>
        <span className="text-fg-secondary text-footnote">
          {intl.formatMessage(messages.facts, { paper: paperLabel, pages })}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          <IconButton size="sm" icon={Minus} label={intl.formatMessage(messages.zoomOut)} shortcut="Mod+-" onClick={() => step(-0.1)} />
          <Button
            size="sm"
            variant="plain"
            hint={intl.formatMessage(messages.fitHint)}
            className="min-w-12 justify-center tabular-nums"
            onClick={() => setZoom(null)}
          >
            {intl.formatMessage(messages.fit, { zoom: scale })}
          </Button>
          <IconButton size="sm" icon={Plus} label={intl.formatMessage(messages.zoomIn)} shortcut="Mod+=" onClick={() => step(0.1)} />
        </div>
      </header>
      {/* Focusable so keyboard users can scroll the page and zoom with Mod+= / Mod+-. */}
      <div
        ref={canvasRef}
        tabIndex={0}
        role="group"
        aria-labelledby="cv-preview-title"
        // `scrollbar-gutter: stable` keeps the fit width the same whether or not the page overflows.
        className="relative min-h-0 flex-1 overflow-auto [scrollbar-gutter:stable] outline-offset-[-2px]"
      >
        {/* `w-fit min-w-full`: centred at fit, scrollable from the left edge when zoomed past it. */}
        <div className="flex w-fit min-w-full flex-col items-center px-6 py-6">
          <div className="relative shrink-0" style={{ width: width * scale, height: paperHeight * scale }}>
            <div
              data-theme="light"
              className="bg-surface-base shadow-raised absolute top-0 left-0 origin-top-left overflow-hidden rounded-xs"
              style={{ width, height: paperHeight, transform: `scale(${scale})` }}
            >
              <div ref={hostRef} />
              {Array.from({ length: pages - 1 }, (_, index) => (
                <div
                  key={index}
                  aria-hidden
                  title={intl.formatMessage(messages.pageEnd, { page: index + 1 })}
                  className="border-line-strong pointer-events-none absolute inset-x-0 border-t border-dashed"
                  style={{ top: (page.marginsMm.top * PX_PER_MM) + printable * (index + 1) }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
