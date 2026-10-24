import { firestorePaths } from "@bfhr/api";
import {
  type CvRevision,
  extractSkills,
  type MatchCv,
  type MatchProfile,
  normalizeSkill,
  type Profile,
  type UiLanguage,
} from "@bfhr/core";
import type { Firestore } from "firebase-admin/firestore";
import { adminConverters } from "../converters";

/** The CV a match is computed against, with the text its embedding is built from. */
export type CvContext = MatchCv & { summary: string };

/** Everything matching needs about the user, loaded once per run. */
export interface MatchingContext {
  profile: MatchProfile;
  cv: CvContext | null;
  uiLanguage: UiLanguage;
  aiEnabled: boolean;
}

/** Profile fields matching uses when the user has no profile document yet. */
const EMPTY_PROFILE: MatchProfile = {
  locations: [],
  remotePreferences: [],
  salaryFloor: null,
  workAuthorization: [],
  languages: [],
  seniority: null,
  targetRoles: [],
  skills: [],
  hiddenCompanies: [],
};

/** Skills and a short summary of a CV revision (JSON Resume content). */
export function cvContext(cvId: string, revision: Pick<CvRevision, "id" | "content">): CvContext {
  const content = revision.content;
  const declared = (content.skills ?? []).flatMap((skill) => [skill.name ?? "", ...(skill.keywords ?? [])]);
  const prose = [
    content.basics?.label ?? "",
    content.basics?.summary ?? "",
    ...(content.work ?? []).flatMap((work) => [
      work.position ?? "",
      work.summary ?? "",
      ...(work.highlights ?? []),
    ]),
    ...(content.projects ?? []).flatMap((project) => [
      project.description ?? "",
      ...(project.keywords ?? []),
    ]),
  ].join("\n");
  const skills = [
    ...new Set([
      ...declared.filter((skill) => skill.trim() !== "").map(normalizeSkill),
      ...extractSkills(prose),
    ]),
  ];
  const summary = [
    content.basics?.label ?? "",
    content.basics?.summary ?? "",
    ...(content.work ?? [])
      .slice(0, 4)
      .map((work) => [work.position, work.name].filter(Boolean).join(" at ")),
  ]
    .filter((part) => part.trim() !== "")
    .join("\n")
    .slice(0, 3_000);
  return { cvId, revisionId: revision.id, skills: skills.slice(0, 200), summary };
}

/** Loads the profile and the default CV's current revision (null when the user has no CV yet). */
export async function loadMatchingContext(db: Firestore, uid: string): Promise<MatchingContext> {
  const profileSnapshot = await db.doc(firestorePaths.user(uid)).get();
  const profile: Profile | null = profileSnapshot.exists
    ? adminConverters.profile.fromSnapshot(profileSnapshot)
    : null;
  let cv: CvContext | null = null;
  if (profile?.defaultCvId !== null && profile?.defaultCvId !== undefined) {
    const cvSnapshot = await db.doc(firestorePaths.cv(uid, profile.defaultCvId)).get();
    if (cvSnapshot.exists) {
      const cvDoc = adminConverters.cv.fromSnapshot(cvSnapshot);
      const revisionSnapshot = await db
        .doc(firestorePaths.cvRevision(uid, cvDoc.id, cvDoc.currentRevisionId))
        .get();
      if (revisionSnapshot.exists) {
        cv = cvContext(cvDoc.id, adminConverters.cvRevision.fromSnapshot(revisionSnapshot));
      }
    }
  }
  return {
    profile: profile ?? EMPTY_PROFILE,
    cv,
    uiLanguage: profile?.uiLanguage ?? "en",
    aiEnabled: profile?.aiEnabled ?? true,
  };
}
