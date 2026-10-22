import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { createTestEnvironment } from "./env";

const MiB = 1024 * 1024;
const PDF = "application/pdf";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await createTestEnvironment();
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearStorage());

const client = (uid: string) => env.authenticatedContext(uid).storage();
const anonymous = () => env.unauthenticatedContext().storage();

function bytes(size: number): Uint8Array {
  return new Uint8Array(size).fill(37);
}

async function seed(path: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (context) => {
    await context.storage().ref(path).put(bytes(16), { contentType: PDF });
  });
}

describe("users/{uid}/**: owner only", () => {
  const file = "users/alice/cv-imports/cv.pdf";

  it("lets the owner upload, read and delete", async () => {
    await assertSucceeds(client("alice").ref(file).put(bytes(1024), { contentType: PDF }).then());
    await assertSucceeds(client("alice").ref(file).getMetadata());
    await assertSucceeds(client("alice").ref(file).delete());
  });

  it("keeps user A out of user B's files", async () => {
    await seed(file);
    await assertFails(client("bob").ref(file).getMetadata());
    await assertFails(client("bob").ref(file).getDownloadURL());
    await assertFails(client("bob").ref(file).put(bytes(1024), { contentType: PDF }).then());
    await assertFails(
      client("bob").ref("users/alice/rendered/cv.pdf").put(bytes(1024), { contentType: PDF }).then(),
    );
    await assertFails(client("bob").ref(file).delete());
    await assertFails(anonymous().ref(file).getMetadata());
  });

  it("denies uploads outside the CV folders", async () => {
    await assertFails(
      client("alice").ref("users/alice/avatar.pdf").put(bytes(1024), { contentType: PDF }).then(),
    );
    await assertFails(
      client("alice").ref("users/alice/other/cv.pdf").put(bytes(1024), { contentType: PDF }).then(),
    );
    await assertFails(client("alice").ref("public/cv.pdf").put(bytes(1024), { contentType: PDF }).then());
  });
});

describe("users/{uid}/cv-imports: CV sources up to 20 MiB", () => {
  it.each([PDF, DOCX, "application/json", "application/zip", "application/x-zip-compressed"])(
    "accepts %s",
    async (contentType) => {
      await assertSucceeds(
        client("alice").ref("users/alice/cv-imports/f1").put(bytes(1024), { contentType }).then(),
      );
    },
  );

  it.each(["text/plain", "image/png", "application/octet-stream", "text/html"])(
    "rejects %s",
    async (contentType) => {
      await assertFails(
        client("alice").ref("users/alice/cv-imports/f1").put(bytes(1024), { contentType }).then(),
      );
    },
  );

  it("enforces the size limit", async () => {
    const ref = client("alice").ref("users/alice/cv-imports/f1");
    await assertSucceeds(ref.put(bytes(20 * MiB), { contentType: PDF }).then());
    await assertFails(ref.put(bytes(20 * MiB + 1), { contentType: PDF }).then());
    await assertFails(ref.put(bytes(0), { contentType: PDF }).then());
  });
});

describe("users/{uid}/rendered: PDF or DOCX up to 10 MiB", () => {
  it("accepts PDF and DOCX", async () => {
    await assertSucceeds(
      client("alice").ref("users/alice/rendered/cv.pdf").put(bytes(1024), { contentType: PDF }).then(),
    );
    await assertSucceeds(
      client("alice").ref("users/alice/rendered/cv.docx").put(bytes(1024), { contentType: DOCX }).then(),
    );
  });

  it("rejects other types and oversized files", async () => {
    const ref = client("alice").ref("users/alice/rendered/cv");
    await assertFails(ref.put(bytes(1024), { contentType: "application/zip" }).then());
    await assertFails(ref.put(bytes(10 * MiB + 1), { contentType: PDF }).then());
  });
});
