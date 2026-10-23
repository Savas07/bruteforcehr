import type { Cv, CvRenderPdfRequest, CvRevision } from "@bfhr/core";
import {
  type CvRenderInput,
  DEFAULT_TEMPLATE,
  exportFileName,
  listTemplates,
  splitName,
} from "@bfhr/cv-render";

/** `templateId` of the request is not a cv-render template. */
export class UnknownTemplateError extends Error {
  constructor(readonly templateId: string) {
    super(`Unknown template "${templateId}"`);
    this.name = "UnknownTemplateError";
  }
}

export interface PdfRenderJob {
  readonly input: CvRenderInput;
  readonly fileName: string;
}

/**
 * What `cvRenderPdf` prints: the revision's content with its stored template, theme and paper,
 * each overridable by the request, in the CV's language (headings and dates follow the CV, not the
 * UI). The default file name is the apps' export name (`First-Last-CV.pdf`).
 */
export function pdfRenderJob(
  cv: Cv,
  revision: CvRevision,
  request: CvRenderPdfRequest,
  photo?: { readonly dataUrl: string },
): PdfRenderJob {
  const { meta, ...resume } = revision.content;
  const templateIds = listTemplates().map(({ id }) => id);
  if (request.templateId !== undefined && !templateIds.some((id) => id === request.templateId)) {
    throw new UnknownTemplateError(request.templateId);
  }
  const input: CvRenderInput = {
    resume,
    meta,
    // A stored id cv-render doesn't know renders with the default template, as in the apps.
    templateId: templateIds.find((id) => id === (request.templateId ?? meta.template)) ?? DEFAULT_TEMPLATE,
    theme: {
      accent: request.theme?.accentColor ?? meta.theme.accentColor,
      fontPair: request.theme?.fontPair ?? meta.theme.fontPair,
      density: request.theme?.density ?? meta.theme.density,
    },
    paper: request.paper ?? meta.theme.paperSize,
    locale: cv.language,
    ...(photo === undefined ? {} : { photo }),
  };
  const fileName =
    request.fileName ??
    exportFileName({ ...splitName(resume.basics?.name), ext: "pdf", locale: cv.language });
  return { input, fileName };
}
