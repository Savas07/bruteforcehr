import { describe, expect, it } from "vitest";
import { type DOCUMENT_PATTERNS, firestorePaths, matchDocumentPath, storagePaths } from "./paths";

describe("firestorePaths", () => {
  it("builds the kickoff layout", () => {
    expect(firestorePaths.user("u1")).toBe("users/u1");
    expect(firestorePaths.cv("u1", "cv1")).toBe("users/u1/cvs/cv1");
    expect(firestorePaths.cvRevisions("u1", "cv1")).toBe("users/u1/cvs/cv1/revisions");
    expect(firestorePaths.cvRevision("u1", "cv1", "r1")).toBe("users/u1/cvs/cv1/revisions/r1");
    expect(firestorePaths.jobMatch("u1", "j1")).toBe("users/u1/jobMatches/j1");
    expect(firestorePaths.applicationEvents("u1")).toBe("users/u1/applicationEvents");
    expect(firestorePaths.mailMessage("u1", "m1")).toBe("users/u1/mailMessages/m1");
    expect(firestorePaths.appConfig("ios")).toBe("appConfig/ios");
    expect(storagePaths.renderedFile("u1", "f1")).toBe("users/u1/rendered/f1");
    expect(storagePaths.cvImport("u1", "f1")).toBe("users/u1/cv-imports/f1");
  });

  it("rejects ids that would escape their segment", () => {
    expect(() => firestorePaths.user("a/b")).toThrow(TypeError);
    expect(() => firestorePaths.cv("u1", "..")).toThrow(TypeError);
    expect(() => firestorePaths.job("u1", "")).toThrow(TypeError);
    expect(() => firestorePaths.device("u1", "__x__")).toThrow(TypeError);
  });
});

describe("matchDocumentPath", () => {
  it("extracts placeholders", () => {
    expect(matchDocumentPath("cvRevision", "users/u1/cvs/cv1/revisions/r1")).toEqual({
      uid: "u1",
      cvId: "cv1",
      id: "r1",
    });
    expect(matchDocumentPath("profile", "users/u1")).toEqual({ id: "u1" });
    expect(matchDocumentPath("appConfig", "appConfig/macos")).toEqual({ id: "macos" });
  });

  it("rejects other entities' paths", () => {
    expect(matchDocumentPath("cv", "users/u1/jobs/j1")).toBeNull();
    expect(matchDocumentPath("cv", "users/u1/cvs/cv1/revisions/r1")).toBeNull();
    expect(matchDocumentPath("profile", "serverOnly/u1")).toBeNull();
  });

  it("agrees with the builders for every entity", () => {
    const built = {
      profile: firestorePaths.user("u"),
      cv: firestorePaths.cv("u", "x"),
      cvRevision: firestorePaths.cvRevision("u", "c", "x"),
      renderedFile: firestorePaths.renderedFile("u", "x"),
      coverLetter: firestorePaths.coverLetter("u", "x"),
      job: firestorePaths.job("u", "x"),
      jobMatch: firestorePaths.jobMatch("u", "x"),
      savedSearch: firestorePaths.savedSearch("u", "x"),
      application: firestorePaths.application("u", "x"),
      applicationEvent: firestorePaths.applicationEvent("u", "x"),
      interview: firestorePaths.interview("u", "x"),
      contact: firestorePaths.contact("u", "x"),
      mailAccount: firestorePaths.mailAccount("u", "x"),
      mailMessage: firestorePaths.mailMessage("u", "x"),
      device: firestorePaths.device("u", "x"),
      appConfig: firestorePaths.appConfig("windows"),
    } satisfies Record<keyof typeof DOCUMENT_PATTERNS, string>;
    for (const [entity, path] of Object.entries(built)) {
      expect(matchDocumentPath(entity as keyof typeof DOCUMENT_PATTERNS, path), entity).not.toBeNull();
    }
  });
});
