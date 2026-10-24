//! Native application menu. It lists every shortcut with its accelerator and forwards clicks to
//! the UI as `menu-command` events. Key presses inside the webview are handled by the UI itself
//! (`src/components/AppShell.tsx`): WebView2 swallows menu accelerators while it has focus
//! (`tauri-apps/wry#451`), and on macOS a handled `keydown` keeps the menu from firing again.

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItem, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::window::MAIN_WINDOW;

/// Event the UI listens for (src/lib/desktop.ts).
pub const MENU_COMMAND_EVENT: &str = "menu-command";

/// Sidebar destinations `(id, label)` in sidebar order; position `n` is ⌘/Ctrl+`n`.
/// Mirrors `destinations` in src/lib/destinations.ts (checked by the tests below).
pub const DESTINATIONS: [(&str, &str); 6] = [
    ("today", "Today"),
    ("jobs", "Jobs"),
    ("tracker", "Tracker"),
    ("cvs", "CVs"),
    ("mail", "Mail"),
    ("insights", "Insights"),
];

const PALETTE_ID: &str = "command-palette";
const PALETTE_KEY: &str = "K";
const SHORTCUTS_ID: &str = "keyboard-shortcuts";
const SHORTCUTS_KEY: &str = "/";
const SETTINGS_ID: &str = "open-settings";
const SETTINGS_KEY: &str = ",";
const CHECK_UPDATES_ID: &str = "check-for-updates";
const SIGN_OUT_ID: &str = "sign-out";
const GO_PREFIX: &str = "go-";

/// Payload of [`MENU_COMMAND_EVENT`]; matches `MenuCommand` in src/lib/shortcuts.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum MenuCommand {
    Navigate {
        destination: &'static str,
    },
    OpenPalette,
    OpenShortcuts,
    /// "Check for Updates…": the UI shows the check's progress and result (src/updater.rs).
    CheckForUpdates,
    /// "Settings…" (macOS app menu) / "Settings" (Windows File menu): the UI opens Settings.
    OpenSettings,
    /// "Sign Out": the UI signs out. Enabled only while someone is signed in ([`set_signed_in`]).
    SignOut,
}

/// Maps a menu item id to its command; ids that aren't ours (predefined items) map to `None`.
pub fn command_for(id: &str) -> Option<MenuCommand> {
    match id {
        PALETTE_ID => Some(MenuCommand::OpenPalette),
        SHORTCUTS_ID => Some(MenuCommand::OpenShortcuts),
        SETTINGS_ID => Some(MenuCommand::OpenSettings),
        CHECK_UPDATES_ID => Some(MenuCommand::CheckForUpdates),
        SIGN_OUT_ID => Some(MenuCommand::SignOut),
        _ => {
            let destination = id.strip_prefix(GO_PREFIX)?;
            DESTINATIONS
                .iter()
                .find(|(candidate, _)| *candidate == destination)
                .map(|(id, _)| MenuCommand::Navigate { destination: id })
        }
    }
}

fn accelerator(key: &str) -> String {
    format!("CmdOrCtrl+{key}")
}

/// The "Sign Out" item, kept so the UI can enable it after sign-in.
struct SignOutItem<R: Runtime>(MenuItem<R>);

/// Enables "Sign Out" while someone is signed in (the `set_signed_in` command).
pub fn set_signed_in<R: Runtime>(app: &AppHandle<R>, signed_in: bool) {
    if let Some(item) = app.try_state::<SignOutItem<R>>()
        && let Err(error) = item.0.set_enabled(signed_in)
    {
        eprintln!("failed to update the Sign Out item: {error}");
    }
}

/// Builds the application menu (macOS menu bar; the window menu bar on Windows).
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let palette = MenuItemBuilder::with_id(PALETTE_ID, "Command Palette…")
        .accelerator(accelerator(PALETTE_KEY))
        .build(app)?;
    let shortcuts = MenuItemBuilder::with_id(SHORTCUTS_ID, "Keyboard Shortcuts…")
        .accelerator(accelerator(SHORTCUTS_KEY))
        .build(app)?;
    // macOS: in the app menu, under About (the platform convention); Windows: in Help.
    let check_updates =
        MenuItemBuilder::with_id(CHECK_UPDATES_ID, "Check for Updates…").build(app)?;
    // macOS: in the app menu (account items sit there); Windows: in File, above Exit. Disabled
    // until the UI reports a signed-in user.
    let sign_out = MenuItemBuilder::with_id(
        SIGN_OUT_ID,
        if cfg!(target_os = "macos") {
            "Sign Out"
        } else {
            "Sign out"
        },
    )
    .enabled(false)
    .build(app)?;
    app.manage(SignOutItem(sign_out.clone()));
    // macOS: in the app menu after About ("Settings…", macOS 13+ naming); Windows: in File.
    let settings = MenuItemBuilder::with_id(
        SETTINGS_ID,
        if cfg!(target_os = "macos") {
            "Settings…"
        } else {
            "Settings"
        },
    )
    .accelerator(accelerator(SETTINGS_KEY))
    .build(app)?;

    let mut go = SubmenuBuilder::new(app, "Go");
    for (index, (id, label)) in DESTINATIONS.iter().enumerate() {
        let item = MenuItemBuilder::with_id(format!("{GO_PREFIX}{id}"), *label)
            .accelerator(accelerator(&(index + 1).to_string()))
            .build(app)?;
        go = go.item(&item);
    }
    let go = go.build()?;

    let view = SubmenuBuilder::new(app, "View").item(&palette);
    #[cfg(target_os = "macos")]
    let view = view.separator().fullscreen();
    let view = view.build()?;

    let help = SubmenuBuilder::new(app, "Help").item(&shortcuts);
    #[cfg(not(target_os = "macos"))]
    let help = help.separator().item(&check_updates);
    let help = help.build()?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "BruteForceHR")
            .about(None)
            .item(&check_updates)
            .separator()
            .item(&settings)
            .separator()
            .item(&sign_out)
            .separator()
            .services()
            .separator()
            .hide()
            .hide_others()
            .show_all()
            .separator()
            .quit()
            .build()?;
        let file = SubmenuBuilder::new(app, "File").close_window().build()?;
        let edit = SubmenuBuilder::new(app, "Edit")
            .undo()
            .redo()
            .separator()
            .cut()
            .copy()
            .paste()
            .select_all()
            .build()?;
        let window = SubmenuBuilder::new(app, "Window")
            .minimize()
            .maximize()
            .separator()
            .bring_all_to_front()
            .build()?;
        window.set_as_windows_menu_for_nsapp()?;
        help.set_as_help_menu_for_nsapp()?;
        MenuBuilder::new(app)
            .items(&[&app_menu, &file, &edit, &view, &go, &window, &help])
            .build()
    }

    #[cfg(not(target_os = "macos"))]
    {
        let file = SubmenuBuilder::new(app, "File")
            .item(&settings)
            .separator()
            .item(&sign_out)
            .separator()
            .quit_with_text("Exit")
            .build()?;
        let edit = SubmenuBuilder::new(app, "Edit")
            .cut()
            .copy()
            .paste()
            .separator()
            .select_all()
            .build()?;
        MenuBuilder::new(app)
            .items(&[&file, &edit, &view, &go, &help])
            .build()
    }
}

/// Forwards a click on one of our menu items to the main window's UI.
pub fn handle_event<R: Runtime>(app: &AppHandle<R>, event: &MenuEvent) {
    if let Some(command) = command_for(event.id().as_ref())
        && let Err(error) = app.emit_to(MAIN_WINDOW, MENU_COMMAND_EVENT, command)
    {
        eprintln!("failed to forward menu command {command:?}: {error}");
    }
}

#[cfg(test)]
mod tests {
    use super::{DESTINATIONS, MenuCommand, PALETTE_KEY, SETTINGS_KEY, SHORTCUTS_KEY, command_for};

    const DESTINATIONS_TS: &str = include_str!("../../src/lib/destinations.ts");
    const SHORTCUTS_TS: &str = include_str!("../../src/lib/shortcuts.ts");

    #[test]
    fn destinations_match_the_ui_in_order() {
        let mut rest = DESTINATIONS_TS;
        for (id, label) in DESTINATIONS {
            let entry = format!(r#"{{ id: "{id}", label: "{label}", path: "/{id}" }}"#);
            let position = rest
                .find(&entry)
                .unwrap_or_else(|| panic!("{entry} missing or out of order in destinations.ts"));
            rest = &rest[position + entry.len()..];
        }
        assert_eq!(
            DESTINATIONS_TS.matches("{ id: ").count(),
            DESTINATIONS.len(),
            "destinations.ts lists a destination the menu doesn't"
        );
    }

    #[test]
    fn general_shortcut_keys_match_the_ui() {
        for key in [PALETTE_KEY, SHORTCUTS_KEY, SETTINGS_KEY] {
            assert!(
                SHORTCUTS_TS.contains(&format!(r#"key: "{key}""#)),
                "shortcuts.ts has no shortcut on {key}"
            );
        }
    }

    #[test]
    fn menu_ids_map_to_commands() {
        assert_eq!(
            command_for("go-tracker"),
            Some(MenuCommand::Navigate {
                destination: "tracker"
            })
        );
        assert_eq!(
            command_for("command-palette"),
            Some(MenuCommand::OpenPalette)
        );
        assert_eq!(
            command_for("keyboard-shortcuts"),
            Some(MenuCommand::OpenShortcuts)
        );
        assert_eq!(
            command_for("check-for-updates"),
            Some(MenuCommand::CheckForUpdates)
        );
        assert_eq!(command_for("sign-out"), Some(MenuCommand::SignOut));
        assert_eq!(
            command_for("open-settings"),
            Some(MenuCommand::OpenSettings)
        );
        assert_eq!(command_for("go-settings"), None);
        assert_eq!(command_for("today"), None);
        assert_eq!(command_for("quit"), None);
    }

    #[test]
    fn command_payloads_match_the_ui() {
        let json = |command| serde_json::to_string(&command).unwrap();
        assert_eq!(
            json(MenuCommand::Navigate { destination: "cvs" }),
            r#"{"type":"navigate","destination":"cvs"}"#
        );
        assert_eq!(json(MenuCommand::OpenPalette), r#"{"type":"open-palette"}"#);
        assert_eq!(
            json(MenuCommand::OpenShortcuts),
            r#"{"type":"open-shortcuts"}"#
        );
        assert_eq!(
            json(MenuCommand::CheckForUpdates),
            r#"{"type":"check-for-updates"}"#
        );
        assert_eq!(json(MenuCommand::SignOut), r#"{"type":"sign-out"}"#);
        assert_eq!(
            json(MenuCommand::OpenSettings),
            r#"{"type":"open-settings"}"#
        );
    }
}
