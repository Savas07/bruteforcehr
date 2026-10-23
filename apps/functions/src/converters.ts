// @bfhr/api converters bound to firebase-admin's Timestamp, shared by every function.
import { createConverters } from "@bfhr/api";
import { Timestamp } from "firebase-admin/firestore";

export const converters = createConverters<Timestamp>({
  fromDate: (date) => Timestamp.fromDate(date),
  toDate: (value) => value.toDate(),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
});
