import { firestorePaths } from "@bfhr/api";
import { type AiProvider, DailyCapError, explainMatch, type UsageLedger } from "@bfhr/ai";
import {
  type ComputedMatch,
  computeMatch,
  initialMatchState,
  isHiddenCompany,
  type Job,
  type JobMatch,
  type JobMatchState,
  normalizeSkill,
  skillKey,
} from "@bfhr/core";
import type { Firestore } from "firebase-admin/firestore";
import { logger } from "firebase-functions/v2";
import { adminConverters } from "../converters";
import { dot } from "./embeddings";
import type { MatchingContext } from "./profile-context";
import type { StoredJob } from "./store";

/** AI rationales are written for at most this many of a run's best new or re-scored matches. */
export const RATIONALE_TOP_N = 5;
/** …and only for matches in the "good" band or better (MATCH_BAND_THRESHOLDS.good). */
export const RATIONALE_MIN_SCORE = 65;

/**
 * The stored match after a (re-)score. Server fields are replaced; the user's `state`,
 * `dismissReasons` and `stateChangedAt` are kept. A rationale survives only while the match is
 * still based on the same CV revision.
 */
export function buildMatch(input: {
  jobId: string;
  computed: ComputedMatch;
  existing: JobMatch | null;
  rationale: string | null;
  initialState: JobMatchState;
  now: Date;
}): JobMatch {
  const { computed, existing } = input;
  const sameBasis = existing !== null && existing.basedOnCvRevisionId === computed.basedOnCvRevisionId;
  return {
    id: input.jobId,
    score: computed.score,
    basedOnCvId: computed.basedOnCvId,
    basedOnCvRevisionId: computed.basedOnCvRevisionId,
    reasons: computed.reasons,
    gaps: computed.gaps,
    skills: computed.skills,
    rationale: input.rationale ?? (sameBasis ? existing.rationale : null),
    state: existing?.state ?? input.initialState,
    dismissReasons: existing?.dismissReasons ?? [],
    stateChangedAt: existing?.stateChangedAt ?? null,
    computedAt: input.now,
  };
}

/** Best-scoring matches without a rationale yet, that qualify for one. */
export function rationaleTargets(matches: readonly JobMatch[], topN = RATIONALE_TOP_N): JobMatch[] {
  return matches
    .filter(
      (match) =>
        match.rationale === null && match.score >= RATIONALE_MIN_SCORE && match.state !== "dismissed",
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, topN);
}

export interface MatchOutcome {
  match: JobMatch;
  /** No match document existed before this run. */
  isNew: boolean;
}

export interface MatcherDeps {
  db: Firestore;
  uid: string;
  context: MatchingContext;
  /** Unit-normalized profile/CV embedding (null when it couldn't be computed). */
  profileVector: number[] | null;
  /** AI for rationales; null when AI is off for this user or unavailable. */
  ai: {
    provider: AiProvider;
    ledger: UsageLedger;
    grantRationales: (wanted: number) => Promise<number>;
  } | null;
  now: Date;
}

/**
 * Scores jobs against the profile/CV, writes `jobMatches/{jobId}` (server fields only for
 * existing matches, so a concurrent save/dismiss is never overwritten) and adds AI rationales
 * for the best few. Hidden companies get no match.
 */
export async function matchJobs(jobs: readonly StoredJob[], deps: MatcherDeps): Promise<MatchOutcome[]> {
  const { db, uid, context, now } = deps;
  const visible = jobs.filter((stored) => !isHiddenCompany(stored.job, context.profile));
  if (visible.length === 0) return [];
  const refs = visible.map((stored) => db.doc(firestorePaths.jobMatch(uid, stored.job.id)));
  const snapshots = await db.getAll(...refs);
  const existing = new Map<string, JobMatch>();
  for (const snapshot of snapshots) {
    if (!snapshot.exists) continue;
    try {
      existing.set(snapshot.id, adminConverters.jobMatch.fromSnapshot(snapshot));
    } catch {
      // Unparsable match: rebuilt from scratch below.
    }
  }
  const score = (job: Job, embedding: number[] | null): ComputedMatch =>
    computeMatch({
      job,
      profile: context.profile,
      cv: context.cv,
      similarity:
        deps.profileVector === null || embedding === null ? null : dot(deps.profileVector, embedding),
    });

  const jobsById = new Map(visible.map((stored) => [stored.job.id, stored] as const));
  const matches = new Map<string, JobMatch>();
  for (const stored of visible) {
    matches.set(
      stored.job.id,
      buildMatch({
        jobId: stored.job.id,
        computed: score(stored.job, stored.embedding),
        existing: existing.get(stored.job.id) ?? null,
        rationale: null,
        initialState: initialMatchState(stored.job),
        now,
      }),
    );
  }

  const skillUpdates = new Map<string, string[]>();
  if (deps.ai !== null && context.aiEnabled) {
    const targets = rationaleTargets([...matches.values()]);
    const granted = await deps.ai.grantRationales(targets.length);
    for (const target of targets.slice(0, granted)) {
      const stored = jobsById.get(target.id);
      if (stored === undefined) continue;
      try {
        const result = await explainMatch(
          {
            language: context.uiLanguage,
            job: stored.job,
            reasons: target.reasons,
            gaps: target.gaps,
            skills: target.skills,
            targetRoles: context.profile.targetRoles,
            personSkills: [...new Set([...context.profile.skills, ...(context.cv?.skills ?? [])])].slice(
              0,
              60,
            ),
          },
          deps.ai,
        );
        logger.info("ai_request", {
          task: "matchRationale",
          outcome: result.rationale === null ? "ai_invalid_output" : "ok",
          model: result.model,
          promptVersion: result.promptVersion,
          attempts: result.attempts,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          costMicroUsd: result.costMicroUsd,
        });
        const known = new Set(stored.job.skills.map(skillKey));
        const added = result.postingSkills.map(normalizeSkill).filter((skill) => !known.has(skillKey(skill)));
        if (added.length > 0) {
          stored.job.skills = [...stored.job.skills, ...added].slice(0, 100);
          skillUpdates.set(stored.job.id, stored.job.skills);
        }
        matches.set(
          target.id,
          buildMatch({
            jobId: target.id,
            computed: added.length > 0 ? score(stored.job, stored.embedding) : { ...target, hardFail: false },
            existing: existing.get(target.id) ?? null,
            rationale: result.rationale,
            initialState: initialMatchState(stored.job),
            now,
          }),
        );
      } catch (error) {
        if (error instanceof DailyCapError) break;
        logger.warn("match_rationale_failed", { name: error instanceof Error ? error.name : typeof error });
      }
    }
  }

  const batch = db.batch();
  for (const match of matches.values()) {
    const ref = db.doc(firestorePaths.jobMatch(uid, match.id));
    if (existing.has(match.id)) {
      const {
        id: _id,
        state: _state,
        dismissReasons: _reasons,
        stateChangedAt: _changed,
        ...serverFields
      } = match;
      batch.update(ref, adminConverters.jobMatch.toFirestoreUpdate(serverFields));
    } else {
      batch.set(ref, adminConverters.jobMatch.toFirestore(match));
    }
  }
  for (const [jobId, skills] of skillUpdates) {
    batch.update(
      db.doc(firestorePaths.job(uid, jobId)),
      adminConverters.job.toFirestoreUpdate({ skills, updatedAt: now }),
    );
  }
  await batch.commit();
  return [...matches.values()].map((match) => ({ match, isNew: !existing.has(match.id) }));
}
