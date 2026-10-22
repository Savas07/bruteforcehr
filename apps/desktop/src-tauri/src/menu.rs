//! Native application menu. It lists every shortcut with its accelerator and forwards clicks to
//! the UI as `menu-command` events. Key presses inside the webview are handled by the UI itself
//! (`src/components/AppShell.tsx`): WebView2 swallows menu accelerators while it has focus
//! (`tauri-apps/wry#451`), and on macOS a handled `keydown` keeps the menu from firing again.

use serde::Serialize;
use tauri::menu::{Menu, MenuBuilder, MenuEvent, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Runtime};

use crate::window::MAIN_WINDOW;

/// Event the UI listens for (src/lib/desktop.ts).
pub const MENU_COMMAND_EVENT: &str = "menu-command";

/// Sidebar destinations `(id, label)` in sidebar order; position `n` is ⌘/Ctrl+`n`.
/// Mirrors `destinations` in src/lib/destinations.ts (checked by the tests below).
pub const DESTINATIONS: [(&str, &str); 5] = [
    ("today", "Today"),
    ("jobs", "Jobs"),
    ("tracker", "Tracker"),
    ("cvs", "CVs"),
    ("mail", "Mail"),
];

const PALETTE_ID: &str = "command-palette";
const PALETTE_KEY: &str = "K";
const SHORTCUTS_ID: &str = "keyboard-shortcuts";
const SHORTCUTS_KEY: &str = "/";
const GO_PREFIX: &str = "go-";

/// Payload of [`MENU_COMMAND_EVENT`]; matches `MenuCommand` in src/lib/shortcuts.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum MenuCommand {
    Navigate { destination: &'static str },
    OpenPalette,
    OpenShortcuts,
}

/// Maps a menu item id to its command; ids that aren't ours (predefined items) map to `None`.
pub fn command_for(id: &str) -> Option<MenuCommand> {
    match id {
        PALETTE_ID => Some(MenuCommand::OpenPalette),
        SHORTCUTS_ID => Some(MenuCommand::OpenShortcuts),
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

/// Builds the application menu (macOS menu bar; the window menu bar on Windows).
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let palette = MenuItemBuilder::with_id(PALETTE_ID, "Command Palette…")
        .accelerator(accelerator(PALETTE_KEY))
        .build(app)?;
    let shortcuts = MenuItemBuilder::with_id(SHORTCUTS_ID, "Keyboard Shortcuts…")
        .accelerator(accelerator(SHORTCUTS_KEY))
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

    let help = SubmenuBuilder::new(app, "Help").item(&shortcuts).build()?;

    #[cfg(target_os = "macos")]
    {
        let app_menu = SubmenuBuilder::new(app, "BruteForceHR")
            .about(None)
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
    use super::{DESTINATIONS, MenuCommand, PALETTE_KEY, SHORTCUTS_KEY, command_for};

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
        for key in [PALETTE_KEY, SHORTCUTS_KEY] {
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
    }
}
