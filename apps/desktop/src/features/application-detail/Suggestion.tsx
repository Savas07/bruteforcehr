/**
 * The suggestion card (D15, D19; never applies itself): follow-up ("Applied 8 days ago · no reply
 * yet": I followed up · Not needed · Later) or no response ("No reply in 21 days. Mark as no
 * response?": Mark as no response · Keep waiting · Later). Later is the snooze menu (1–4, Pick a
 * date… opens the date dialog); `H` opens it and `D` answers no, both registered by the screen.
 * A snoozed suggestion leaves a quiet line with "Show now".
 */
import { AlarmClock } from "lucide-react";
import { useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { NudgeVM } from "../../shared/model/blocks";
import { Button } from "../../shared/ui/Button";
import { NudgeCard } from "../../shared/ui/NudgeCard";
import { SnoozeDateDialog } from "../../shared/ui/SnoozeDateDialog";
import type { SnoozePreset } from "../../shared/ui/SnoozeMenu";
import type { SnoozedSuggestionVM } from "./model";
import type { DetailActions } from "./useDetailActions";

const messages = defineMessages({
  pickDateBody: {
    id: "application-detail.suggestion.pickDateBody",
    defaultMessage: "The suggestion for {company} comes back on this date.",
  },
  showNow: { id: "application-detail.suggestion.showNow", defaultMessage: "Show now" },
});

export interface SuggestionCardProps {
  suggestion: NudgeVM;
  actions: DetailActions;
  snoozeMinDate: string;
  timeZone: string;
  snoozeOpen: boolean;
  onSnoozeOpenChange: (open: boolean) => void;
}

/** Runs the card's answers through the tracker actions (each with its Undo toast). */
export function answerSuggestion(
  suggestion: NudgeVM,
  actions: DetailActions,
  answer: "primary" | "secondary",
) {
  if (answer === "secondary") actions.dismissSuggestion(suggestion.applicationId, suggestion.kind);
  else if (suggestion.kind === "followUp") actions.logFollowUp(suggestion.applicationId);
  else actions.move(suggestion.applicationId, "ghosted");
}

export function SuggestionCard({
  suggestion,
  actions,
  snoozeMinDate,
  timeZone,
  snoozeOpen,
  onSnoozeOpenChange,
}: SuggestionCardProps) {
  const intl = useIntl();
  const [pickingDate, setPickingDate] = useState(false);
  const snooze = (preset: SnoozePreset) => {
    if (preset === "pickDate") setPickingDate(true);
    else actions.snoozeSuggestion(suggestion.applicationId, suggestion.kind, { preset });
  };
  return (
    <>
      <NudgeCard
        hideApplication
        nudge={suggestion}
        onPrimary={() => answerSuggestion(suggestion, actions, "primary")}
        onSecondary={() => answerSuggestion(suggestion, actions, "secondary")}
        onSnooze={snooze}
        snoozeOpen={snoozeOpen}
        onSnoozeOpenChange={onSnoozeOpenChange}
      />
      <SnoozeDateDialog
        description={intl.formatMessage(messages.pickDateBody, { company: suggestion.company.name })}
        min={snoozeMinDate}
        timeZone={timeZone}
        open={pickingDate}
        onOpenChange={setPickingDate}
        onSnooze={(date) => {
          setPickingDate(false);
          actions.snoozeSuggestion(suggestion.applicationId, suggestion.kind, { preset: "pickDate", date });
        }}
      />
    </>
  );
}

/** "Follow-up suggestion snoozed until Tomorrow, 09:00 · Show now". */
export function SnoozedLine({
  snoozed,
  applicationId,
  actions,
}: {
  snoozed: SnoozedSuggestionVM;
  applicationId: string;
  actions: DetailActions;
}) {
  const intl = useIntl();
  return (
    <div className="border-line-subtle flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-dashed px-3 py-2">
      <AlarmClock aria-hidden="true" className="text-fg-secondary size-4 shrink-0" strokeWidth={1.75} />
      <p className="text-fg-secondary text-callout me-auto">{snoozed.label}</p>
      <Button
        size="sm"
        variant="plain"
        onClick={() =>
          actions.updateApplication(
            applicationId,
            snoozed.kind === "followUp" ? { followUpSnoozedUntil: null } : { ghostedSnoozedUntil: null },
            { quiet: true },
          )
        }
      >
        {intl.formatMessage(messages.showNow)}
      </Button>
    </div>
  );
}
