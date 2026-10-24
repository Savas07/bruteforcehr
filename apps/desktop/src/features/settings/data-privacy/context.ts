/**
 * Where the pane gets its backend and export state: the live Firebase/Tauri backend in the app,
 * fakes with forced states in the design build (src/design/data-privacy.tsx).
 */
import { createContext, useContext } from "react";
import type { AccountDataBackend } from "./backend";
import type { DeleteView } from "./deleteFlow";
import type { ExportFlow } from "./exportFlow";
import { liveAccountDataBackend, liveExportFlow } from "./liveBackend";

export interface AccountDataEnvironment {
  readonly backend: AccountDataBackend;
  /** The signed-in user's export state (kept while the app runs). */
  readonly exportFlow: () => ExportFlow;
  /** Design build: open the delete dialog in this state. */
  readonly initialDelete?: DeleteView;
}

export const AccountDataContext = createContext<AccountDataEnvironment>({
  backend: liveAccountDataBackend,
  exportFlow: liveExportFlow,
});

export const useAccountData = (): AccountDataEnvironment => useContext(AccountDataContext);
