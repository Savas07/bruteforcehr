/**
 * The @bfhr/api converters bound to the Firebase JS SDK's `Timestamp` (ADR 0002 "Time"). Every
 * Firestore read and write in the desktop app goes through them.
 */
import { createConverters } from "@bfhr/api";
import { Timestamp } from "firebase/firestore";

export const converters = createConverters<Timestamp>({
  fromDate: (date) => Timestamp.fromDate(date),
  toDate: (value) => value.toDate(),
  isTimestamp: (value): value is Timestamp => value instanceof Timestamp,
});
