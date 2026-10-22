import { app, BrowserWindow, nativeTheme } from "electron";
import { destinations } from "../shared/destinations";
import { IpcChannel, type MenuCommand } from "../shared/ipc";
import { registerIpcHandlers } from "./ipc";
import { routeShortcutKeys } from "./keyboard";
import { installApplicationMenu } from "./menu";
import { handleAppScheme, registerAppScheme } from "./origin";
import { hardenSession, hardenWebContents } from "./security";
import { applyNativeTheme, createMainWindow } from "./window";

const startRoute = destinations[0].path;

registerAppScheme();
hardenWebContents();

function openWindow(route: string): void {
  routeShortcutKeys(createMainWindow(route), onCommand);
}

function onCommand(command: MenuCommand, target: BrowserWindow | undefined): void {
  if (target) {
    target.webContents.send(IpcChannel.menuCommand, command);
    return;
  }
  // No window (macOS keeps running after the last one closes): open one where the command points.
  const destination =
    command.type === "navigate"
      ? destinations.find((candidate) => candidate.id === command.destination)
      : undefined;
  openWindow(destination?.path ?? startRoute);
}

void app.whenReady().then(() => {
  handleAppScheme();
  hardenSession();
  registerIpcHandlers();
  installApplicationMenu(onCommand);
  openWindow(startRoute);

  nativeTheme.on("updated", () => BrowserWindow.getAllWindows().forEach(applyNativeTheme));
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow(startRoute);
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
