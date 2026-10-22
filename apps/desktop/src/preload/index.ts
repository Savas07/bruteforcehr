import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import {
  appInfoSchema,
  chromeArgumentPrefix,
  chromeInfoSchema,
  IpcChannel,
  menuCommandSchema,
  type DesktopApi,
} from "../shared/ipc";

const chromeArgument = process.argv.find((argument) => argument.startsWith(chromeArgumentPrefix));
const chrome = chromeInfoSchema.parse(
  JSON.parse(chromeArgument?.slice(chromeArgumentPrefix.length) ?? "null"),
);

const api: DesktopApi = {
  platform: chrome.platform,
  material: chrome.material,
  getAppInfo: async () => appInfoSchema.parse(await ipcRenderer.invoke(IpcChannel.getAppInfo)),
  openExternal: async (url) => {
    await ipcRenderer.invoke(IpcChannel.openExternal, url);
  },
  onMenuCommand: (listener) => {
    // Payloads that fail validation are dropped.
    const handler = (_event: IpcRendererEvent, payload: unknown): void => {
      const parsed = menuCommandSchema.safeParse(payload);
      if (parsed.success) listener(parsed.data);
    };
    ipcRenderer.on(IpcChannel.menuCommand, handler);
    return () => {
      ipcRenderer.removeListener(IpcChannel.menuCommand, handler);
    };
  },
};

contextBridge.exposeInMainWorld("bfhr", api);
