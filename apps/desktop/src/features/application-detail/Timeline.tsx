/**
 * Timeline (research/tracker.md "Timeline"): a note composer on top, then every event newest
 * first on the rail. Status moves keep durable Undo while they are the latest move (D11);
 * automatic ones name their source and reason, imported ones their origin.
 */
import { useNavigate } from "@tanstack/react-router";
import { forwardRef, useState } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { TimelineEventVM } from "../../shared/model/blocks";
import { Button } from "../../shared/ui/Button";
import { EmptyState } from "../../shared/ui/EmptyState";
import { TimelineRow } from "../../shared/ui/TimelineRow";
import { Section, TextArea } from "./fields";

const messages = defineMessages({
  title: { id: "application-detail.timeline.title", defaultMessage: "Timeline" },
  composerLabel: { id: "application-detail.timeline.composerLabel", defaultMessage: "Add a note" },
  composerPlaceholder: {
    id: "application-detail.timeline.composerPlaceholder",
    defaultMessage: "What happened? A call, a thought, a name to remember…",
  },
  addNote: { id: "application-detail.timeline.addNote", defaultMessage: "Add note" },
  empty: {
    id: "application-detail.timeline.empty",
    defaultMessage: "Changes, emails and notes for this application will show here.",
  },
  noteEmpty: { id: "application-detail.timeline.noteEmpty", defaultMessage: "Write the note first." },
});

export interface TimelineSectionProps {
  events: readonly TimelineEventVM[];
  onAddNote: (text: string) => void;
  onUndo: (eventId: string) => void;
  /** Hides the composer (the side panel). */
  composer?: boolean;
}

export const TimelineSection = forwardRef<HTMLTextAreaElement, TimelineSectionProps>(function TimelineSection(
  { events, onAddNote, onUndo, composer = true },
  composerRef,
) {
  const intl = useIntl();
  const navigate = useNavigate();
  const [note, setNote] = useState("");
  const submit = () => {
    if (note.trim() === "") return;
    onAddNote(note.trim());
    setNote("");
  };
  return (
    <Section title={intl.formatMessage(messages.title)}>
      {composer && (
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <TextArea
            ref={composerRef}
            rows={2}
            value={note}
            aria-label={intl.formatMessage(messages.composerLabel)}
            placeholder={intl.formatMessage(messages.composerPlaceholder)}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="submit"
            size="sm"
            className="self-end"
            shortcut="Mod+Enter"
            disabledReason={note.trim() === "" ? intl.formatMessage(messages.noteEmpty) : null}
          >
            {intl.formatMessage(messages.addNote)}
          </Button>
        </form>
      )}
      {events.length === 0 ? (
        <EmptyState kind="subArea" body={intl.formatMessage(messages.empty)} className="px-0" />
      ) : (
        <ol>
          {events.map((event, index) => (
            <TimelineRow
              key={event.id}
              event={event}
              last={index === events.length - 1}
              {...(event.undo?.available && { onUndo: () => onUndo(event.id) })}
              {...(event.mailMessageId !== null && {
                onViewSource: () =>
                  void navigate({
                    to: "/mail/review/$messageId",
                    params: { messageId: event.mailMessageId ?? "" },
                  }),
              })}
            />
          ))}
        </ol>
      )}
    </Section>
  );
});
