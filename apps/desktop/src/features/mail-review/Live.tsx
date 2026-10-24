/**
 * Mail in the app (`/mail`, `/mail/review/$messageId`, `?folder=&category=&bundle=&messageId=`) on
 * the signed-in user's tracker and mail listeners (inside `LiveTrackerProvider` +
 * `LiveMailProvider`, router.tsx).
 */
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTrackerModel } from "../../data/tracker/model";
import { buildMailReviewModel } from "./model";
import MailReviewScreen from "./Screen";

const SEARCH_PARAMS = ["folder", "category", "bundle", "messageId"] as const;

export default function LiveMailReview() {
  const search: Readonly<Record<string, unknown>> = useSearch({ strict: false });
  const route: Readonly<Record<string, string | undefined>> = useParams({ strict: false });
  const paramsKey = JSON.stringify({
    ...Object.fromEntries(
      SEARCH_PARAMS.flatMap((key) => {
        const value = search[key];
        return typeof value === "string" ? [[key, value]] : [];
      }),
    ),
    ...(route["messageId"] !== undefined && { messageId: route["messageId"] }),
  });
  const params = useMemo(
    (): Readonly<Record<string, string | undefined>> => JSON.parse(paramsKey),
    [paramsKey],
  );
  const model = useTrackerModel(buildMailReviewModel, params);
  return <MailReviewScreen model={model} params={params} />;
}
