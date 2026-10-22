import { app, session, shell } from "electron";
import { externalUrlSchema } from "../shared/ipc";
import { isAppUrl } from "./origin";

/** Applies to every webContents the app ever creates. Must be registered before the first window. */
export function hardenWebContents(): void {
  app.on("web-contents-created", (_event, contents) => {
    contents.on("will-navigate", (event) => {
      if (!isAppUrl(event.url)) event.preventDefault();
    });
    contents.on("will-redirect", (event) => {
      if (!isAppUrl(event.url)) event.preventDefault();
    });
    contents.on("will-attach-webview", (event) => event.preventDefault());
    // No in-app popups. Allowlisted https links open in the default browser instead.
    contents.setWindowOpenHandler(({ url }) => {
      const allowed = externalUrlSchema.safeParse(url);
      if (allowed.success) void shell.openExternal(allowed.data);
      return { action: "deny" };
    });
  });
}

/** The app asks for no web permissions (camera, notifications, geolocation…); deny them all. */
export function hardenSession(): void {
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
}
