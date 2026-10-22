import type { OtpState, OtpStore } from "../src/otp/service";

/** In-memory OtpStore for unit tests. Mirrors the Firestore store: updates see a private copy. */
export class MemoryOtpStore implements OtpStore {
  readonly states = new Map<string, OtpState>();

  async transact<T>(key: string, update: (current: OtpState) => { state: OtpState; result: T }): Promise<T> {
    const current = structuredClone(this.states.get(key) ?? { challenge: null, sendLog: null });
    const { state, result } = update(current);
    this.states.set(key, structuredClone(state));
    return result;
  }
}
