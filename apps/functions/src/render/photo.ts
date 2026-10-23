import { storagePaths } from "@bfhr/api";
import type { CvContent } from "@bfhr/core";
import { getStorage } from "firebase-admin/storage";

/** Same limit as storage.rules for `users/{uid}/cv-photos/{fileId}`. */
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

/** The opted-in photo can't be printed: not the caller's photo path, missing, too large or not JPEG/PNG. */
export class PhotoUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoUnavailableError";
  }
}

/**
 * The CV photo as the `data:` URL cv-render embeds, or undefined when the variant doesn't show one
 * (U6: `meta.personal.showPhoto` off, or no `basics.image`). The photo must be the caller's own
 * `users/{uid}/cv-photos/{fileId}`, JPEG or PNG (cv-render's formats; HEIC is not converted here).
 */
export async function loadCvPhoto(uid: string, content: CvContent): Promise<{ dataUrl: string } | undefined> {
  const path = content.basics?.image;
  if (content.meta.personal?.showPhoto !== true || path === undefined || path === "") return undefined;
  const fileId = path.split("/")[3] ?? "";
  if (fileId === "" || path !== storagePaths.cvPhoto(uid, fileId)) {
    throw new PhotoUnavailableError("basics.image is not one of the caller's cv-photos");
  }
  const file = getStorage().bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) throw new PhotoUnavailableError("photo not found");
  const [metadata] = await file.getMetadata();
  if (Number(metadata.size ?? 0) > MAX_PHOTO_BYTES) throw new PhotoUnavailableError("photo too large");
  const [bytes] = await file.download();
  // Sniff the bytes instead of trusting the stored content type.
  const type =
    bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        ? "image/png"
        : undefined;
  if (type === undefined) throw new PhotoUnavailableError("photo is not JPEG or PNG");
  return { dataUrl: `data:${type};base64,${bytes.toString("base64")}` };
}
