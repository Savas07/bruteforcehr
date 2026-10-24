/**
 * The alert settings of one saved search, shared by the Save search popover and the manage
 * dialog's editor: cadence (As they arrive · Daily digest · Weekly · Off, with what each does),
 * notify threshold (Strong matches · Good and above · All) and, for As they arrive, the daily
 * digest. Every change is written at once (`onChange` → `updateSavedSearch`); writes queue offline.
 */
import type { SavedSearch } from "@bfhr/core";
import { RadioGroup, Switch } from "radix-ui";
import { useId } from "react";
import { defineMessages, useIntl } from "react-intl";
import type { SavedSearchPatch } from "../../data/jobs/writes";
import { SegmentedControl, type SegmentedOption } from "../../shared/ui/SegmentedControl";
import {
  ALERT_CADENCES,
  ALERT_THRESHOLDS,
  type AlertThreshold,
  alertThresholdText,
  cadenceOf,
  cadenceOption,
  cadencePatch,
  THRESHOLD_SCORES,
  thresholdHint,
  thresholdLabel,
  thresholdOf,
} from "./model";

const messages = defineMessages({
  cadence: { id: "saved-searches.alert.cadence", defaultMessage: "Alert me", description: "Label of the alert cadence choice" },
  threshold: { id: "saved-searches.alert.threshold", defaultMessage: "Notify me for", description: "Label of the notify threshold choice" },
  thresholdOff: {
    id: "saved-searches.alert.thresholdOff",
    defaultMessage: "Applies once alerts are on again.",
    description: "Shown instead of the threshold hint while the cadence is Off",
  },
  digest: { id: "saved-searches.alert.digest", defaultMessage: "Also send a daily digest", description: "Switch label: bundle the day's matches into one summary" },
  digestHint: {
    id: "saved-searches.alert.digestHint",
    defaultMessage: "One summary a day, on top of the alerts for each new match.",
  },
});

const CUSTOM = "custom";

export function AlertFields({ search, onChange }: { readonly search: SavedSearch; readonly onChange: (patch: SavedSearchPatch) => void }) {
  const intl = useIntl();
  const id = useId();
  const cadence = cadenceOf(search);
  const threshold = thresholdOf(search.alertThreshold);
  const options: SegmentedOption<AlertThreshold | typeof CUSTOM>[] = ALERT_THRESHOLDS.map((value) => ({
    value,
    label: thresholdLabel(value, intl),
  }));
  // A score set outside the three choices (another device, an older version) stays visible.
  if (threshold === null) options.push({ value: CUSTOM, label: alertThresholdText(search.alertThreshold, intl) });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <span id={`${id}-cadence`} className="text-footnote text-fg-secondary font-medium">
          {intl.formatMessage(messages.cadence)}
        </span>
        <RadioGroup.Root
          aria-labelledby={`${id}-cadence`}
          value={cadence}
          onValueChange={(next) => {
            const picked = ALERT_CADENCES.find((value) => value === next);
            if (picked && picked !== cadence) onChange(cadencePatch(picked));
          }}
          className="flex flex-col gap-0.5"
        >
          {ALERT_CADENCES.map((value) => {
            const option = cadenceOption(value, search, intl);
            return (
              <label
                key={value}
                htmlFor={`${id}-${value}`}
                className="hover:bg-surface-hover has-[[data-state=checked]]:bg-surface-selected flex cursor-default items-start gap-2.5 rounded-md px-2 py-1.5"
              >
                <RadioGroup.Item
                  id={`${id}-${value}`}
                  value={value}
                  aria-labelledby={`${id}-${value}-label`}
                  aria-describedby={`${id}-${value}-hint`}
                  className="border-line-control data-[state=checked]:border-accent-solid bg-surface-base mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border"
                >
                  <RadioGroup.Indicator className="bg-accent-solid block size-2 rounded-full" />
                </RadioGroup.Item>
                <span className="flex min-w-0 flex-col">
                  <span id={`${id}-${value}-label`} className="text-callout text-fg-primary">
                    {option.label}
                  </span>
                  <span id={`${id}-${value}-hint`} className="text-footnote text-fg-secondary">
                    {option.hint}
                  </span>
                </span>
              </label>
            );
          })}
        </RadioGroup.Root>
      </div>

      {cadence === "asTheyArrive" && (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col">
            <label htmlFor={`${id}-digest`} className="text-callout text-fg-primary">
              {intl.formatMessage(messages.digest)}
            </label>
            <p id={`${id}-digest-hint`} className="text-footnote text-fg-secondary">
              {intl.formatMessage(messages.digestHint)}
            </p>
          </div>
          <Switch.Root
            id={`${id}-digest`}
            aria-describedby={`${id}-digest-hint`}
            checked={search.dailyDigest}
            onCheckedChange={(checked) => onChange({ dailyDigest: checked })}
            className="data-[state=checked]:bg-accent-solid bg-line-control relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-default items-center rounded-full transition-colors duration-(--bfhr-duration-fast)"
          >
            <Switch.Thumb className="bg-surface-base shadow-raised block size-4 translate-x-0.5 rounded-full transition-transform duration-(--bfhr-duration-fast) data-[state=checked]:translate-x-[18px]" />
          </Switch.Root>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <span className="text-footnote text-fg-secondary font-medium">{intl.formatMessage(messages.threshold)}</span>
        <div className="flex flex-wrap">
          <SegmentedControl
            size="sm"
            label={intl.formatMessage(messages.threshold)}
            options={options}
            value={threshold ?? CUSTOM}
            onValueChange={(next) => {
              if (next !== CUSTOM) onChange({ alertThreshold: THRESHOLD_SCORES[next] });
            }}
          />
        </div>
        <p className="text-footnote text-fg-secondary">
          {cadence === "off"
            ? intl.formatMessage(messages.thresholdOff)
            : threshold === null
              ? alertThresholdText(search.alertThreshold, intl)
              : thresholdHint(threshold, intl)}
        </p>
      </div>
    </div>
  );
}
