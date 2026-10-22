import { Timestamp, type DocumentSnapshot, type Firestore } from "firebase-admin/firestore";
import { z } from "zod";
import type { OtpChallenge, OtpSendLog, OtpState, OtpStore } from "./service";

// Under serverOnly/**, which security rules close to every client. Both collection groups have a
// Firestore TTL policy on `expiresAt` (firebase/firestore.indexes.json → fieldOverrides).
export const OTP_CHALLENGES_COLLECTION = "serverOnly/otp/challenges";
export const OTP_SEND_LOGS_COLLECTION = "serverOnly/otp/sendLogs";

const timestamp = z.instanceof(Timestamp).transform((value) => value.toDate());

const challengeSchema = z.object({
  codeHash: z.string(),
  salt: z.string(),
  createdAt: timestamp,
  expiresAt: timestamp,
  failedAttempts: z.number().int().nonnegative(),
});

const sendLogSchema = z.object({
  sentAt: z.array(timestamp),
  expiresAt: timestamp,
});

function parse<T>(snapshot: DocumentSnapshot | undefined, schema: z.ZodType<T>): T | null {
  return snapshot?.exists ? schema.parse(snapshot.data()) : null;
}

function challengeData(challenge: OtpChallenge) {
  return {
    ...challenge,
    createdAt: Timestamp.fromDate(challenge.createdAt),
    expiresAt: Timestamp.fromDate(challenge.expiresAt),
  };
}

function sendLogData(sendLog: OtpSendLog) {
  return {
    sentAt: sendLog.sentAt.map((sentAt) => Timestamp.fromDate(sentAt)),
    expiresAt: Timestamp.fromDate(sendLog.expiresAt),
  };
}

export function firestoreOtpStore(db: Firestore): OtpStore {
  return {
    transact(key, update) {
      const challengeRef = db.collection(OTP_CHALLENGES_COLLECTION).doc(key);
      const sendLogRef = db.collection(OTP_SEND_LOGS_COLLECTION).doc(key);
      return db.runTransaction(async (tx) => {
        const [challengeSnapshot, sendLogSnapshot] = await tx.getAll(challengeRef, sendLogRef);
        const current: OtpState = {
          challenge: parse(challengeSnapshot, challengeSchema),
          sendLog: parse(sendLogSnapshot, sendLogSchema),
        };
        const { state, result } = update(current);
        if (state.challenge !== current.challenge) {
          if (state.challenge) tx.set(challengeRef, challengeData(state.challenge));
          else tx.delete(challengeRef);
        }
        if (state.sendLog !== current.sendLog) {
          if (state.sendLog) tx.set(sendLogRef, sendLogData(state.sendLog));
          else tx.delete(sendLogRef);
        }
        return result;
      });
    },
  };
}
