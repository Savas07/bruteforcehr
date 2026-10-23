/**
 * Inspector › Design: the template gallery (each card is this CV rendered in that template, top
 * of page 1) and the theme controls — accent swatches and font pairs from @bfhr/cv-render. Every
 * choice updates the live preview at once and is saved with the editing session.
 */
import type { CvContent } from "@bfhr/core";
import { listAccents, listFontPairs, listTemplates, type TemplateId } from "@bfhr/cv-render";
import { Check } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { cx } from "../../shared/cx";
import { useCvShadow } from "./PreviewPane";
import { renderCv } from "./render";

const messages = defineMessages({
  templates: { id: "cv-editor.design.templates", defaultMessage: "Template" },
  templatesNote: {
    id: "cv-editor.design.templatesNote",
    defaultMessage: "All templates are one column with standard headings and real text, so application systems read every section.",
  },
  accent: { id: "cv-editor.design.accent", defaultMessage: "Accent colour" },
  fonts: { id: "cv-editor.design.fonts", defaultMessage: "Fonts" },
});

const PX_PER_MM = 96 / 25.4;
const THUMB_WIDTH = 140;

function Thumbnail({ html, widthMm }: { html: string; widthMm: number }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [, setHeight] = useState(0);
  useCvShadow(hostRef, html, setHeight);
  const width = widthMm * PX_PER_MM;
  const scale = THUMB_WIDTH / width;
  // `inert`: the rendered CV has links (mail, profiles) that must not be focusable inside a picture.
  return (
    <div aria-hidden inert data-theme="light" className="bg-surface-base pointer-events-none relative h-[110px] w-[140px] overflow-hidden rounded-xs">
      <div className="absolute top-0 left-0 origin-top-left" style={{ width, transform: `scale(${scale})` }}>
        <div ref={hostRef} />
      </div>
    </div>
  );
}

export function DesignControls({
  content,
  language,
  onTemplate,
  onFontPair,
  onAccent,
}: {
  /** The working copy (its `meta` carries the current choices). */
  content: CvContent;
  language: string;
  onTemplate: (template: TemplateId) => void;
  onFontPair: (fontPair: string) => void;
  onAccent: (accent: string) => void;
}) {
  const intl = useIntl();
  const name = useId();
  const templates = listTemplates(intl.locale);
  const accents = listAccents(intl.locale);
  const fontPairs = listFontPairs(intl.locale);
  const { template, theme } = content.meta;
  const thumbnails = useMemo(
    () =>
      Object.fromEntries(
        listTemplates().map((option) => [option.id, renderCv({ ...content, meta: { ...content.meta, template: option.id } }, language)]),
      ),
    [content, language],
  );

  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-fg-secondary mb-1 text-footnote font-semibold">{intl.formatMessage(messages.templates)}</legend>
        <p className="text-fg-tertiary mb-2 text-footnote">{intl.formatMessage(messages.templatesNote)}</p>
        <div className="grid grid-cols-2 gap-2">
          {templates.map((option) => {
            const checked = option.id === template;
            const rendered = thumbnails[option.id];
            return (
              <label
                key={option.id}
                className={cx(
                  "bg-surface-sunken has-focus-visible:outline-line-focus flex cursor-pointer flex-col gap-1.5 rounded-md border p-1.5 has-focus-visible:outline-2 has-focus-visible:outline-offset-2",
                  checked ? "border-accent-solid" : "border-line-subtle hover:border-line-control",
                )}
              >
                <input
                  type="radio"
                  name={`${name}-template`}
                  value={option.id}
                  checked={checked}
                  onChange={() => onTemplate(option.id)}
                  className="sr-only"
                />
                {rendered && <Thumbnail html={rendered.html} widthMm={rendered.page.widthMm} />}
                <span className="flex items-center gap-1 text-callout font-semibold">
                  {checked && <Check aria-hidden className="text-accent-text size-3.5" />}
                  {option.name}
                </span>
                <span className="text-fg-secondary text-caption1">{option.description}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-fg-secondary mb-2 text-footnote font-semibold">{intl.formatMessage(messages.accent)}</legend>
        <div className="flex flex-wrap gap-2">
          {accents.map((option) => {
            const checked = option.hex.toLowerCase() === theme.accentColor.toLowerCase();
            return (
              <label key={option.id} title={option.name} className="relative cursor-pointer">
                <input
                  type="radio"
                  name={`${name}-accent`}
                  value={option.hex}
                  checked={checked}
                  onChange={() => onAccent(option.hex)}
                  aria-label={option.name}
                  className="peer sr-only"
                />
                {/* The swatch shows the CV's own accent (CV content, not a UI colour). */}
                <span
                  aria-hidden
                  className={cx(
                    "peer-focus-visible:outline-line-focus flex size-7 items-center justify-center rounded-full border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2",
                    // `line-control` (≥ 3:1) outlines every swatch, so dark accents stay visible on dark surfaces.
                    checked ? "border-fg-primary border-2" : "border-line-control",
                  )}
                  style={{ backgroundColor: option.hex }}
                >
                  {checked && <Check className="size-3.5 text-white" />}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-fg-secondary mb-2 text-footnote font-semibold">{intl.formatMessage(messages.fonts)}</legend>
        <div className="flex flex-col gap-1">
          {fontPairs.map((option) => (
            <label key={option.id} className="hover:bg-surface-hover flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-callout">
              <input
                type="radio"
                name={`${name}-fonts`}
                value={option.id}
                checked={option.id === theme.fontPair}
                onChange={() => onFontPair(option.id)}
              />
              {option.name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
