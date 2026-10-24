import { serverOnlyPaths } from "@bfhr/api";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Owner switches in `serverOnly/jobImport` (ADR 0005 kill switch and denylist), applied to every
 * fetch of a user-supplied page: URL import and followed careers pages.
 */
export interface JobImportConfig {
  deniedHosts: readonly string[];
  /** Off: LinkedIn/Indeed/Glassdoor/StepStone/Xing/Kariyer.net pages are refused. */
  restrictedSitesEnabled: boolean;
}

export async function loadJobImportConfig(): Promise<JobImportConfig> {
  const snapshot = await getFirestore().doc(serverOnlyPaths.jobImportConfig()).get();
  const denied = snapshot.get("deniedHosts");
  return {
    deniedHosts: Array.isArray(denied)
      ? denied.filter((host): host is string => typeof host === "string")
      : [],
    restrictedSitesEnabled: snapshot.get("restrictedSitesEnabled") !== false,
  };
}

/** `host` is a denied host or one of its subdomains (`example.com`, `.example.com` and `*.example.com` alike). */
export function isDeniedHost(host: string, deniedHosts: readonly string[]): boolean {
  const name = host.toLowerCase().replace(/\.$/u, "");
  return deniedHosts.some((entry) => {
    const suffix = entry.toLowerCase().replace(/^\*?\./u, "");
    return name === suffix || name.endsWith(`.${suffix}`);
  });
}
