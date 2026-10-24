/**
 * The first-run wizard (onboarding-signin.md "Onboarding wizard", shared onboarding contract): a
 * full window, not a dialog over the empty shell. Header: Back (top-left), a labeled stepper
 * CV · Preferences · Finish (✓ on finished steps), the signed-in address and Sign out. A 560 px
 * column holds the step; the footer row has Skip for now (plain) and the primary action.
 * Keyboard: ⌘↩ / Ctrl+Enter = primary, ⌘[ / Alt+← = Back. Every step can be skipped; the step
 * the user is on survives closing the app (this computer). Finishing creates the first saved
 * search, refreshes matches, sets `onboardingCompletedAt` and opens Today with a toast.
 */
import type { Cv, Profile } from "@bfhr/core";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import { chrome } from "../../lib/desktop";
import { cx } from "../../shared/cx";
import { Button } from "../../shared/ui/Button";
import { InlineAlert } from "../../shared/ui/InlineAlert";
import { useToast } from "../../shared/ui/Toast";
import type { CvStudioBackend } from "../cv-editor/backend";
import { blankContent, defaultPaperSize } from "../cv-editor/content";
import { CV_LANGUAGES, type CvLanguage } from "../cv-editor/CreateCvDialog";
import { ImportCvDialog } from "../cv-editor/import";
import { JobPreferencesForm, type PreferenceChange } from "../settings/job-preferences/JobPreferencesForm";
import {
  applyCvPrefill,
  type CvPrefill,
  draftFromProfile,
  EMPTY_JOB_PREFERENCES,
  type JobPreferencesDraft,
  type PreferenceSection,
  nameFromEmail,
  prefillFromCv,
  preferencesFromDraft,
  validName,
} from "../settings/job-preferences/model";
import { type AddedCv, CvStep } from "./CvStep";
import { FinishStep } from "./FinishStep";
import {
  clearSavedStep,
  firstSearchInput,
  ONBOARDING_STEPS,
  type OnboardingStep,
  saveStep,
  seedLanguage,
} from "./model";
import type { OnboardingStore, ProfileSeed } from "./store";

const messages = defineMessages({
  documentTitle: { id: "onboarding.documentTitle", defaultMessage: "Set up · BruteForceHR" },
  steps: { id: "onboarding.steps", defaultMessage: "Setup steps" },
  stepCv: { id: "onboarding.step.cv", defaultMessage: "CV" },
  stepPreferences: { id: "onboarding.step.preferences", defaultMessage: "Preferences" },
  stepFinish: { id: "onboarding.step.finish", defaultMessage: "Finish" },
  stepDone: {
    id: "onboarding.step.done",
    defaultMessage: "{step}, done",
    description: "Accessible name of a finished step in the stepper",
  },
  stepOf: { id: "onboarding.stepOf", defaultMessage: "Step {current} of {total}" },
  back: { id: "onboarding.back", defaultMessage: "Back" },
  signOut: { id: "onboarding.signOut", defaultMessage: "Sign out" },
  skip: { id: "onboarding.skip", defaultMessage: "Skip for now" },
  continue: { id: "onboarding.continue", defaultMessage: "Continue" },
  cvTitle: { id: "onboarding.cv.title", defaultMessage: "Add your CV" },
  cvBody: {
    id: "onboarding.cv.body",
    defaultMessage:
      "We match jobs against your CV and use it to suggest your preferences. You can add one later under CVs.",
  },
  prefsTitle: { id: "onboarding.preferences.title", defaultMessage: "What are you looking for?" },
  prefsBodyCv: {
    id: "onboarding.preferences.bodyCv",
    defaultMessage: "We filled in what we could from your CV. Adjust anything that's off.",
  },
  prefsBody: {
    id: "onboarding.preferences.body",
    defaultMessage:
      "This shapes which jobs we suggest. Everything is optional, and you can change it anytime in Settings.",
  },
  nameMissing: {
    id: "onboarding.preferences.nameMissing",
    defaultMessage: "Enter your name. It goes on your CVs and emails.",
  },
  finishTitle: { id: "onboarding.finish.title", defaultMessage: "Start your first search" },
  startSearching: { id: "onboarding.finish.start", defaultMessage: "Start searching" },
  starting: { id: "onboarding.finish.starting", defaultMessage: "Starting…" },
  goToday: { id: "onboarding.finish.goToday", defaultMessage: "Go to Today" },
  backToPreferences: { id: "onboarding.finish.backToPreferences", defaultMessage: "Back to preferences" },
  setupFailed: { id: "onboarding.setupFailed", defaultMessage: "We couldn't set up your account" },
  setupFailedBody: {
    id: "onboarding.setupFailedBody",
    defaultMessage: "Setting up needs a connection the first time. Check it, then try again.",
  },
  saveFailed: { id: "onboarding.saveFailed", defaultMessage: "We couldn't save your preferences" },
  saveFailedBody: {
    id: "onboarding.saveFailedBody",
    defaultMessage: "Nothing is lost: they're still here. Check your connection, then try again.",
  },
  cvFailed: {
    id: "onboarding.cv.failed",
    defaultMessage:
      "We couldn't save the new CV. It's still on this computer, and we'll try again when you're back online.",
  },
  retry: { id: "onboarding.retry", defaultMessage: "Try again" },
  blankTitle: {
    id: "onboarding.cv.blankTitle",
    defaultMessage: "My CV",
    description: "Title of the empty CV 'Start from scratch' creates",
  },
  blankSummary: { id: "onboarding.cv.blankSummary", defaultMessage: "Started an empty CV" },
  importedSummary: { id: "onboarding.cv.importedSummary", defaultMessage: "Imported {fileName}" },
  defaultSearchName: {
    id: "onboarding.finish.searchName",
    defaultMessage: "Jobs for you",
    description: "Name of the first saved search when no role was given",
  },
  done: { id: "onboarding.done", defaultMessage: "You're set up. Your preferences are saved in Settings." },
  openSettings: { id: "onboarding.openSettings", defaultMessage: "Open settings" },
});

const STEP_LABELS = {
  cv: messages.stepCv,
  preferences: messages.stepPreferences,
  finish: messages.stepFinish,
} as const;

export interface OnboardingWizardProps {
  readonly store: OnboardingStore;
  readonly cvBackend: CvStudioBackend;
  /** The signed-in address (header, and the new profile's `email`). */
  readonly email: string;
  /** Null until the profile document exists (this wizard creates it). */
  readonly profile: Profile | null;
  readonly cvs: readonly Cv[];
  readonly initialStep: OnboardingStep;
  /** Design build: a CV already added this run, and the sections it filled in. */
  readonly initialAdded?: AddedCv | null;
  readonly initialFromCv?: readonly PreferenceSection[];
  readonly onSignOut: () => void;
}

export function OnboardingWizard({
  store,
  cvBackend,
  email,
  profile,
  cvs,
  initialStep,
  onSignOut,
  initialAdded = null,
  initialFromCv = [],
}: OnboardingWizardProps) {
  const intl = useIntl();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState<OnboardingStep>(initialStep);
  const seed = useMemo(
    (): ProfileSeed => ({
      email,
      fullName: nameFromEmail(email),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      uiLanguage: seedLanguage(intl.locale),
    }),
    [email, intl.locale],
  );
  // The profile document, created once per mount; every write waits for it.
  const [setup, setSetup] = useState<{ ready: Promise<void>; failed: boolean }>(() => ({
    ready: store.ensureProfile(seed),
    failed: false,
  }));
  useEffect(() => {
    let current = true;
    setup.ready.catch((error: unknown) => {
      console.error("Couldn't create the profile", error);
      if (current) setSetup((state) => (state.ready === setup.ready ? { ...state, failed: true } : state));
    });
    return () => {
      current = false;
    };
  }, [setup.ready]);
  const retrySetup = () => setSetup({ ready: store.ensureProfile(seed), failed: false });

  const [draft, setDraft] = useState<JobPreferencesDraft>(() =>
    draftFromProfile(profile ?? { ...EMPTY_JOB_PREFERENCES, fullName: seed.fullName }, intl.locale),
  );
  const [fromCv, setFromCv] = useState<ReadonlySet<PreferenceSection>>(() => new Set(initialFromCv));
  const [nameError, setNameError] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedCv | null>(initialAdded);
  /** What an import this run suggests; applied once, on the way to the preferences step. */
  const [prefill, setPrefill] = useState<CvPrefill | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const goTo = useCallback(
    (next: OnboardingStep) => {
      setStep(next);
      saveStep(store.uid, next);
    },
    [store.uid],
  );

  useEffect(() => {
    document.title = intl.formatMessage(messages.documentTitle);
  }, [intl]);

  // ── CV ──────────────────────────────────────────────────────────────────────────────────────
  const cvLanguage: CvLanguage = (CV_LANGUAGES as readonly string[]).includes(intl.locale.slice(0, 2))
    ? (intl.locale.slice(0, 2) as CvLanguage)
    : "en";
  const matchAgainst = (cvId: string) => {
    if (profile?.defaultCvId) return;
    void setup.ready
      .then(() => store.setMatchingCv(cvId))
      .catch((error: unknown) => console.error("Couldn't set the matching CV", error));
  };
  const reportCvFailure = (error: unknown) => {
    console.error("Couldn't create the CV", error);
    toast.show({ variant: "info", message: intl.formatMessage(messages.cvFailed) });
  };
  const startBlank = () => {
    const title = intl.formatMessage(messages.blankTitle);
    const { ids, done } = cvBackend.createCv({
      title,
      language: cvLanguage,
      content: blankContent(defaultPaperSize(intl.locale)),
      parentCvId: null,
      basedOnRevisionId: null,
      source: "manual",
      importedFrom: null,
      diffSummary: intl.formatMessage(messages.blankSummary),
    });
    done.catch(reportCvFailure);
    matchAgainst(ids.cvId);
    setAdded({ kind: "blank", title });
  };
  const existingMatching = cvs.find((cv) => cv.id === profile?.defaultCvId) ?? null;
  const activeCvs = cvs.filter((cv) => cv.archivedAt === null);

  // ── Preferences ─────────────────────────────────────────────────────────────────────────────
  const enterPreferences = () => {
    if (prefill !== null) {
      const result = applyCvPrefill(
        draft,
        prefill,
        (code) => new Intl.DisplayNames([intl.locale], { type: "region" }).of(code) ?? code,
        draft.fullName === seed.fullName,
      );
      setDraft(result.draft);
      setFromCv(new Set(result.filled));
      setPrefill(null);
    }
    goTo("preferences");
  };
  const onPreferenceChange: PreferenceChange = (next, section, commit) => {
    setDraft(next);
    if (fromCv.has(section)) setFromCv(new Set([...fromCv].filter((key) => key !== section)));
    if (section === "name" && commit && validName(next.fullName) !== null) setNameError(null);
  };
  const showName = !fromCv.has("name") || nameError !== null;
  const savePreferences = () => {
    const name = validName(draft.fullName);
    if (name === null) {
      setNameError(intl.formatMessage(messages.nameMissing));
      return;
    }
    setNameError(null);
    setSaveFailed(false);
    const patch = { fullName: name, preferences: preferencesFromDraft(draft) };
    setup.ready
      .then(() => store.updateProfile(patch))
      .catch((error: unknown) => {
        console.error("Couldn't save the preferences", error);
        setSaveFailed(true);
      });
    goTo("finish");
  };

  // ── Finish ──────────────────────────────────────────────────────────────────────────────────
  const search = useMemo(
    () => firstSearchInput(preferencesFromDraft(draft), intl.formatMessage(messages.defaultSearchName)),
    [draft, intl],
  );
  const finish = async (withSearch: boolean) => {
    if (finishing) return;
    setFinishing(true);
    try {
      await setup.ready;
      if (withSearch && search !== null) await store.createFirstSearch(search);
    } catch (error) {
      console.error("Couldn't finish onboarding", error);
      setSetup((state) => ({ ...state, failed: true }));
      setFinishing(false);
      return;
    }
    void store.refreshMatches().catch((error: unknown) => console.error("jobMatchesRefresh failed", error));
    clearSavedStep(store.uid);
    void navigate({ to: "/today" });
    toast.show({
      variant: "info",
      message: intl.formatMessage(messages.done),
      action: {
        label: intl.formatMessage(messages.openSettings),
        run: () => void navigate({ to: "/settings/$pane", params: { pane: "job-preferences" } }),
      },
    });
    store.complete().catch((error: unknown) => console.error("Couldn't complete onboarding", error));
  };

  // ── Chrome ──────────────────────────────────────────────────────────────────────────────────
  const index = ONBOARDING_STEPS.indexOf(step);
  const previous = index > 0 ? ONBOARDING_STEPS[index - 1] : undefined;
  const back = useMemo(() => (previous === undefined ? null : () => goTo(previous)), [previous, goTo]);

  let title: string;
  let body: ReactNode = null;
  let content: ReactNode;
  let primary: { label: string; run: () => void; loading?: boolean } | null;
  let skip: (() => void) | null;
  switch (step) {
    case "cv":
      title = intl.formatMessage(messages.cvTitle);
      body = intl.formatMessage(messages.cvBody);
      content = (
        <CvStep
          added={added}
          existing={{ count: activeCvs.length, matchingTitle: existingMatching?.title ?? null }}
          onImport={() => setImportOpen(true)}
          onStartBlank={startBlank}
        />
      );
      primary =
        added !== null || activeCvs.length > 0
          ? { label: intl.formatMessage(messages.continue), run: enterPreferences }
          : null;
      skip = primary === null ? enterPreferences : null;
      break;
    case "preferences":
      title = intl.formatMessage(messages.prefsTitle);
      body = intl.formatMessage(fromCv.size > 0 ? messages.prefsBodyCv : messages.prefsBody);
      content = (
        <JobPreferencesForm
          draft={draft}
          onChange={onPreferenceChange}
          showName={showName}
          nameError={nameError}
          fromCv={fromCv}
          ownRoles={draft.targetRoles}
        />
      );
      primary = { label: intl.formatMessage(messages.continue), run: savePreferences };
      skip = () => goTo("finish");
      break;
    case "finish":
      title = intl.formatMessage(messages.finishTitle);
      content = (
        <div className="flex flex-col gap-4">
          {saveFailed && (
            <InlineAlert
              tone="error"
              fromAction
              title={intl.formatMessage(messages.saveFailed)}
              action={{ label: intl.formatMessage(messages.retry), onClick: savePreferences }}
            >
              {intl.formatMessage(messages.saveFailedBody)}
            </InlineAlert>
          )}
          <FinishStep search={search} />
          {search === null && (
            <Button variant="plain" className="-ms-3 self-start" onClick={() => goTo("preferences")}>
              {intl.formatMessage(messages.backToPreferences)}
            </Button>
          )}
        </div>
      );
      primary =
        search === null
          ? { label: intl.formatMessage(messages.goToday), run: () => void finish(false), loading: finishing }
          : {
              label: intl.formatMessage(messages.startSearching),
              run: () => void finish(true),
              loading: finishing,
            };
      skip = search === null ? null : () => void finish(false);
      break;
  }

  // ⌘↩ / Ctrl+Enter = primary (or Skip when there is none); ⌘[ / Alt+← = Back.
  const primaryRun = primary?.run ?? skip;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = chrome.platform === "macos" ? event.metaKey : event.ctrlKey;
      if (mod && event.key === "Enter" && primaryRun) {
        event.preventDefault();
        primaryRun();
      } else if (
        back &&
        (chrome.platform === "macos"
          ? event.metaKey && event.key === "["
          : event.altKey && event.key === "ArrowLeft")
      ) {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [primaryRun, back]);

  return (
    <div className="bg-surface-canvas text-fg-primary flex h-full flex-col">
      {chrome.platform === "macos" && <div data-tauri-drag-region className="h-(--chrome-height) shrink-0" />}
      <header
        data-tauri-drag-region
        className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-4 px-6 pb-2"
      >
        <div className="flex justify-start">
          {back && (
            <Button
              variant="plain"
              icon={ArrowLeft}
              onClick={back}
              shortcut={chrome.platform === "macos" ? "Mod+[" : "Alt+ArrowLeft"}
              className="-ms-3"
            >
              {intl.formatMessage(messages.back)}
            </Button>
          )}
        </div>
        <Stepper current={step} />
        <div className="flex min-w-0 items-center justify-end gap-3">
          <span className="text-footnote text-fg-secondary truncate" title={email}>
            {email}
          </span>
          <Button variant="plain" onClick={onSignOut}>
            {intl.formatMessage(messages.signOut)}
          </Button>
        </div>
      </header>
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-140 flex-col gap-6 px-8 pt-6 pb-10">
          {setup.failed && (
            <InlineAlert
              tone="error"
              fromAction
              title={intl.formatMessage(messages.setupFailed)}
              action={{ label: intl.formatMessage(messages.retry), onClick: retrySetup }}
            >
              {intl.formatMessage(messages.setupFailedBody)}
            </InlineAlert>
          )}
          <div className="flex flex-col gap-2">
            <p className="text-footnote text-fg-secondary font-medium">
              {intl.formatMessage(messages.stepOf, { current: index + 1, total: ONBOARDING_STEPS.length })}
            </p>
            <StepHeading key={step}>{title}</StepHeading>
            {body !== null && <p className="text-body text-fg-secondary">{body}</p>}
          </div>
          {content}
        </div>
      </main>
      <footer className="border-line-subtle bg-surface-canvas shrink-0 border-t">
        <div className="mx-auto flex w-full max-w-140 items-center justify-end gap-2 px-8 py-3">
          {skip && (
            <Button
              variant={primary ? "plain" : "secondary"}
              onClick={skip}
              {...(primary ? {} : { shortcut: "Mod+Enter" })}
            >
              {intl.formatMessage(messages.skip)}
            </Button>
          )}
          {primary && (
            <Button
              variant="primary"
              onClick={primary.run}
              loading={primary.loading ?? false}
              loadingLabel={intl.formatMessage(messages.starting)}
              shortcut="Mod+Enter"
            >
              {primary.label}
            </Button>
          )}
        </div>
      </footer>
      {importOpen && (
        <ImportCvDialog
          open
          onOpenChange={setImportOpen}
          uid={store.uid}
          onCreate={async (result) => {
            const { ids, done } = cvBackend.createCv({
              title: result.title,
              language: result.language,
              content: result.content,
              parentCvId: null,
              basedOnRevisionId: null,
              source: "import",
              importedFrom: result.importedFrom,
              diffSummary: intl.formatMessage(messages.importedSummary, {
                fileName: result.importedFrom.fileName,
              }),
            });
            done.catch(reportCvFailure);
            matchAgainst(ids.cvId);
            const suggested = prefillFromCv(result.content);
            setPrefill(suggested);
            setAdded({
              kind: "import",
              title: result.title,
              fileName: result.importedFrom.fileName,
              roles: suggested.roles.length,
              languages: suggested.languages.length,
            });
            await Promise.resolve();
          }}
        />
      )}
    </div>
  );
}

/** The step's title; a new step moves focus here so screen readers announce it. */
function StepHeading({ children }: { readonly children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="font-display text-title1 tracking-tight outline-none">
      {children}
    </h1>
  );
}

/** Labeled stepper: number or ✓ plus the step name; the current step is `aria-current="step"`. */
function Stepper({ current }: { readonly current: OnboardingStep }) {
  const intl = useIntl();
  const currentIndex = ONBOARDING_STEPS.indexOf(current);
  return (
    <nav aria-label={intl.formatMessage(messages.steps)}>
      <ol className="flex items-center gap-2">
        {ONBOARDING_STEPS.map((step, index) => {
          const done = index < currentIndex;
          const active = index === currentIndex;
          const label = intl.formatMessage(STEP_LABELS[step]);
          return (
            <li key={step} className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              {index > 0 && <span aria-hidden="true" className="bg-line-subtle h-px w-8" />}
              <span
                aria-hidden="true"
                className={cx(
                  "text-footnote flex size-6 items-center justify-center rounded-full border font-medium tabular-nums",
                  active
                    ? "bg-accent-solid text-fg-on-accent border-transparent"
                    : done
                      ? "bg-accent-subtle text-accent-text border-transparent"
                      : "border-line-control text-fg-secondary",
                )}
              >
                {done ? <Check className="size-3.5" strokeWidth={2} /> : index + 1}
              </span>
              <span
                className={cx("text-callout", active ? "text-fg-primary font-medium" : "text-fg-secondary")}
              >
                {done ? (
                  <>
                    <span aria-hidden="true">{label}</span>
                    <span className="sr-only">{intl.formatMessage(messages.stepDone, { step: label })}</span>
                  </>
                ) : (
                  label
                )}
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
