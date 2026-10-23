import { createConverters } from "@bfhr/api";
import { Timestamp } from "firebase-admin/firestore";

/** @bfhr/api converters bound to the Admin SDK's Timestamp, shared by every function. */
export const adminConverters = createConverters<Timestamp>({
  fromDate: (date) => Timestamp.fromDate(date),
  toDate: (value) => value.toDate(),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
});
