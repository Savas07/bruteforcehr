/**
 * Opens "Log an application" from anywhere (a board column's "+ Add", Today's first-use card, the
 * palette): a module-level request the mounted `AddApplicationHost` picks up. With no host mounted
 * (signed out) a request does nothing.
 */
import type { ApplicationStatus } from "@bfhr/core";

/** Prefills for the dialog. */
export interface AddApplicationOptions {
  /** The status to start in (a column's "+ Add"); default Applied. */
  readonly status?: ApplicationStatus;
  readonly company?: string;
  readonly role?: string;
}

type Opener = (options: AddApplicationOptions) => void;

const openers: Opener[] = [];

/** Opens the dialog over the current screen. */
export function openAddApplication(options: AddApplicationOptions = {}): void {
  openers.at(-1)?.(options);
}

/** The host's subscription; the latest mounted host handles requests. */
export function onAddApplicationRequest(opener: Opener): () => void {
  openers.push(opener);
  return () => {
    const index = openers.lastIndexOf(opener);
    if (index !== -1) openers.splice(index, 1);
  };
}
