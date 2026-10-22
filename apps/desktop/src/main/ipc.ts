import { app, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { externalUrlSchema, IpcChannel, type AppInfo } from "../shared/ipc";
import { isAppUrl } from "./origin";
import { platform } from "./window";

function assertAppSender(event: IpcMainInvokeEvent): void {
  const url = event.senderFrame?.url;
  if (url === undefined || !isAppUrl(url)) throw new Error("IPC call from an untrusted frame");
}

/** The complete set of renderer → main calls. Arguments are validated with zod. */
export function registerIpcHandlers(): void {
  ipcMain.handle(IpcChannel.getAppInfo, (event): AppInfo => {
    assertAppSender(event);
    return { version: app.getVersion(), platform };
  });

  ipcMain.handle(IpcChannel.openExternal, async (event, rawUrl: unknown): Promise<void> => {
    assertAppSender(event);
    const parsed = externalUrlSchema.safeParse(rawUrl);
    if (!parsed.success) throw new Error("This link can't be opened from BruteForceHR.");
    await shell.openExternal(parsed.data);
  });
}
