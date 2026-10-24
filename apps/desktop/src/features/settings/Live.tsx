/**
 * Settings in the app (`/settings/$pane`) on the signed-in user's data: tracker and mail
 * listeners (router.tsx `live`) plus the Settings store (profile writes, watchlist, job sources).
 */
import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { LiveJobsProvider } from "../../data/jobs/live";
import { currentUid } from "../auth/firebaseAuth";
import { firestoreSettingsStore } from "./firestore";
import SettingsScreen from "./Screen";
import { SettingsStoreContext } from "./store";

export default function LiveSettings() {
  const { pane } = useParams({ strict: false });
  const uid = currentUid();
  const store = useMemo(() => (uid === null ? null : firestoreSettingsStore(uid)), [uid]);
  if (store === null) return null;
  return (
    <SettingsStoreContext.Provider value={store}>
      {/* The answers library lives with the Jobs data (the kit reads it there too). */}
      <LiveJobsProvider>
        <SettingsScreen pane={pane ?? ""} />
      </LiveJobsProvider>
    </SettingsStoreContext.Provider>
  );
}
