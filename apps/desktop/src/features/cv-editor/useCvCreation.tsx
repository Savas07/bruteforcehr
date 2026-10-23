/**
 * Every way a CV comes into being — new (empty or from the profile), import, duplicate, variant —
 * as one hook with its dialogs, shared by the first-use screen and the workspace.
 */
import { useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { defineMessages, useIntl } from "react-intl";
import { useToast } from "../../shared/ui/Toast";
import { useCvBackend, type NewCvInput } from "./backend";
import { blankContent, contentFromProfile, defaultPaperSize } from "./content";
import { CV_LANGUAGES, NewCvDialog, NewVariantDialog, type CvLanguage } from "./CreateCvDialog";
import { ImportCvDialog } from "./import";
import type { CvEditorModel } from "./model";

const messages = defineMessages({
  created: { id: "cv-editor.create.created", defaultMessage: "Created {title}" },
  duplicated: { id: "cv-editor.create.duplicated", defaultMessage: "Duplicated as {title}" },
  copyTitle: { id: "cv-editor.create.copyTitle", defaultMessage: "{title} (copy)" },
  copiedFrom: { id: "cv-editor.create.copiedFrom", defaultMessage: "Copied from {title}" },
  variantOf: { id: "cv-editor.create.variantOf", defaultMessage: "Variant of {title}" },
  startedBlank: { id: "cv-editor.create.startedBlank", defaultMessage: "Started an empty CV" },
  startedProfile: { id: "cv-editor.create.startedProfile", defaultMessage: "Started from your profile" },
  imported: { id: "cv-editor.create.imported", defaultMessage: "Imported {fileName}" },
  failed: {
    id: "cv-editor.create.failed",
    defaultMessage: "We couldn't save the new CV. It's still on this device; we'll try again when you're back online.",
  },
  undo: { id: "cv-editor.create.undo", defaultMessage: "Undo" },
});

export interface CvCreation {
  readonly openNew: () => void;
  readonly openImport: () => void;
  readonly openVariant: (cvId: string) => void;
  readonly duplicate: (cvId: string) => void;
  /** Render once: the dialogs these actions open. */
  readonly dialogs: ReactNode;
}

export function useCvCreation(model: CvEditorModel): CvCreation {
  const intl = useIntl();
  const toast = useToast();
  const navigate = useNavigate();
  const backend = useCvBackend();
  const [dialog, setDialog] = useState<{ kind: "new" } | { kind: "import" } | { kind: "variant"; cvId: string } | null>(null);
  const uiLanguage = intl.locale.slice(0, 2);
  const defaultLanguage: CvLanguage = (CV_LANGUAGES as readonly string[]).includes(uiLanguage) ? (uiLanguage as CvLanguage) : "en";

  const create = (input: NewCvInput, message: string, undoable: boolean) => {
    const { ids, done } = backend.createCv(input);
    done.catch((error: unknown) => {
      console.error("Couldn't create the CV", error);
      toast.show({ variant: "info", message: intl.formatMessage(messages.failed) });
    });
    setDialog(null);
    void navigate({ to: "/cvs/$cvId", params: { cvId: ids.cvId } });
    toast.show({
      message,
      ...(undoable && {
        action: {
          label: intl.formatMessage(messages.undo),
          // A CV is never deleted (rules); undo archives it.
          run: () => void backend.updateCv({ id: ids.cvId, version: 1 }, { archivedAt: new Date() }).done.catch(() => undefined),
        },
      }),
    });
  };

  const copyOf = (cvId: string, title: string, language: string, parentCvId: string | null, summary: string) => {
    const source = model.records[cvId];
    if (!source?.content) return;
    create(
      {
        title,
        language,
        content: source.content,
        parentCvId,
        basedOnRevisionId: source.currentRevisionId,
        source: "manual",
        importedFrom: null,
        diffSummary: summary,
      },
      intl.formatMessage(messages.duplicated, { title }),
      true,
    );
  };

  const variantBase = dialog?.kind === "variant" ? model.records[dialog.cvId] : undefined;

  return {
    openNew: () => setDialog({ kind: "new" }),
    openImport: () => setDialog({ kind: "import" }),
    openVariant: (cvId) => setDialog({ kind: "variant", cvId }),
    duplicate: (cvId) => {
      const source = model.records[cvId];
      if (!source) return;
      copyOf(
        cvId,
        intl.formatMessage(messages.copyTitle, { title: source.title }),
        source.language,
        source.parentCvId,
        intl.formatMessage(messages.copiedFrom, { title: source.title }),
      );
    },
    dialogs: (
      <>
        {dialog?.kind === "new" && (
          <NewCvDialog
            open
            onOpenChange={(open) => !open && setDialog(null)}
            hasProfile={model.profile !== null}
            defaultLanguage={defaultLanguage}
            onCreate={({ title, language, fromProfile }) => {
              const paper = defaultPaperSize(intl.locale);
              const profile = fromProfile ? model.profile : null;
              create(
                {
                  title,
                  language,
                  content: profile ? contentFromProfile(profile, language, paper) : blankContent(paper),
                  parentCvId: null,
                  basedOnRevisionId: null,
                  source: "manual",
                  importedFrom: null,
                  diffSummary: intl.formatMessage(profile ? messages.startedProfile : messages.startedBlank),
                },
                intl.formatMessage(messages.created, { title }),
                false,
              );
            }}
          />
        )}
        {dialog?.kind === "import" && (
          <ImportCvDialog
            open
            onOpenChange={(open) => !open && setDialog(null)}
            uid={backend.uid}
            onCreate={async (result) => {
              create(
                {
                  title: result.title,
                  language: result.language,
                  content: result.content,
                  parentCvId: null,
                  basedOnRevisionId: null,
                  source: "import",
                  importedFrom: result.importedFrom,
                  diffSummary: intl.formatMessage(messages.imported, { fileName: result.importedFrom.fileName }),
                },
                intl.formatMessage(messages.created, { title: result.title }),
                false,
              );
              await Promise.resolve();
            }}
          />
        )}
        {variantBase && (
          <NewVariantDialog
            open
            onOpenChange={(open) => !open && setDialog(null)}
            baseTitle={variantBase.title}
            baseLanguage={variantBase.language}
            onCreate={({ title, language }) =>
              copyOf(variantBase.cvId, title, language, variantBase.cvId, intl.formatMessage(messages.variantOf, { title: variantBase.title }))
            }
          />
        )}
      </>
    ),
  };
}
