import { AuthErrorCode, FirebaseAuthError, type CreateRequest, type UserRecord } from "firebase-admin/auth";
import { describe, expect, it } from "vitest";
import { getOrCreateVerifiedUser, type UserDirectory } from "../src/otp/users";

interface FakeUser {
  uid: string;
  email: string;
  emailVerified: boolean;
}

/** Fake Auth directory. UserRecord has no public constructor; the fields used by sign-in are present. */
function fakeDirectory(initial: FakeUser[], options: { raceOnCreate?: boolean } = {}) {
  const users = new Map(initial.map((user) => [user.email, user]));
  const calls: string[] = [];
  const record = (user: FakeUser) => ({ ...user, disabled: false }) as unknown as UserRecord;
  const notFound = () => new FirebaseAuthError({ code: AuthErrorCode.USER_NOT_FOUND, message: "not found" });
  const directory: UserDirectory = {
    getUserByEmail: async (email) => {
      calls.push("get");
      const user = users.get(email);
      if (!user) throw notFound();
      return record(user);
    },
    updateUser: async (uid, update) => {
      calls.push("update");
      const user = [...users.values()].find((candidate) => candidate.uid === uid);
      if (!user) throw notFound();
      Object.assign(user, update);
      return record(user);
    },
    createUser: async (request: CreateRequest) => {
      calls.push("create");
      const email = request.email ?? "";
      if (options.raceOnCreate) {
        users.set(email, { uid: "raced", email, emailVerified: true });
        throw new FirebaseAuthError({ code: AuthErrorCode.EMAIL_ALREADY_EXISTS, message: "exists" });
      }
      const user = { uid: `uid-${users.size + 1}`, email, emailVerified: request.emailVerified ?? false };
      users.set(email, user);
      return record(user);
    },
  };
  return { directory, users, calls };
}

describe("getOrCreateVerifiedUser", () => {
  it("returns an existing verified user unchanged", async () => {
    const { directory, calls } = fakeDirectory([
      { uid: "u1", email: "ada@example.com", emailVerified: true },
    ]);
    expect(await getOrCreateVerifiedUser(directory, "ada@example.com")).toMatchObject({ uid: "u1" });
    expect(calls).toEqual(["get"]);
  });

  it("marks an existing unverified user as verified", async () => {
    const { directory, users } = fakeDirectory([
      { uid: "u1", email: "ada@example.com", emailVerified: false },
    ]);
    expect(await getOrCreateVerifiedUser(directory, "ada@example.com")).toMatchObject({
      uid: "u1",
      emailVerified: true,
    });
    expect(users.get("ada@example.com")?.emailVerified).toBe(true);
  });

  it("creates a verified user on first sign-in", async () => {
    const { directory, calls } = fakeDirectory([]);
    expect(await getOrCreateVerifiedUser(directory, "ada@example.com")).toMatchObject({
      email: "ada@example.com",
      emailVerified: true,
    });
    expect(calls).toEqual(["get", "create"]);
  });

  it("uses the user created by a concurrent sign-in", async () => {
    const { directory } = fakeDirectory([], { raceOnCreate: true });
    expect(await getOrCreateVerifiedUser(directory, "ada@example.com")).toMatchObject({ uid: "raced" });
  });

  it("propagates unexpected Auth errors", async () => {
    const { directory } = fakeDirectory([]);
    directory.getUserByEmail = async () => {
      throw new FirebaseAuthError({ code: AuthErrorCode.INTERNAL_ERROR, message: "boom" });
    };
    await expect(getOrCreateVerifiedUser(directory, "ada@example.com")).rejects.toThrow("boom");
  });
});
