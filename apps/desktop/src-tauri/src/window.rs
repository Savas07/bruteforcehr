//! The main window: size, platform chrome and the webview's navigation policy.

use serde::Serialize;
use serde_json::json;
use tauri::utils::config::WindowConfig;
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Runtime, WebviewWindowBuilder};

use crate::navigation;

pub const MAIN_WINDOW: &str = "main";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Platform {
    Macos,
    Windows,
    Linux,
}

/// Native material behind the sidebar: macOS sidebar vibrancy, Windows 11 Mica, or none (opaque).
/// Each platform constructs only its own variants.
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Material {
    Vibrancy,
    Mica,
    None,
}

#[derive(Debug, Serialize)]
struct ChromeInfo {
    platform: Platform,
    material: Material,
    /// The OS's preferred locale as a BCP 47 tag ("tr-TR"); the UI picks its language from it
    /// (src/i18n/locale.ts). Null when the OS doesn't report one.
    locale: Option<String>,
    /// The app version ("0.1.0", from package.json); the minimum-version gate compares it.
    version: String,
}

const PLATFORM: Platform = if cfg!(target_os = "macos") {
    Platform::Macos
} else if cfg!(windows) {
    Platform::Windows
} else {
    Platform::Linux
};

/// Mica through `DWMWA_SYSTEMBACKDROP_TYPE` needs Windows 11 22H2 (build 22621).
#[cfg(windows)]
fn material() -> Material {
    if windows_version::OsVersion::current().build >= 22_621 {
        Material::Mica
    } else {
        Material::None
    }
}

#[cfg(target_os = "macos")]
fn material() -> Material {
    Material::Vibrancy
}

#[cfg(not(any(windows, target_os = "macos")))]
fn material() -> Material {
    Material::None
}

/// Runs before any page script, so the first paint already has the right layout
/// (read by src/lib/desktop.ts). Init scripts are injected natively and not subject to the CSP.
fn chrome_script(chrome: &ChromeInfo) -> String {
    let json = serde_json::to_string(chrome).expect("chrome info serializes");
    format!(
        "Object.defineProperty(window, \"__BFHR_CHROME__\", {{ value: Object.freeze({json}) }});"
    )
}

/// The main window in `tauri.conf.json` terms. It is built from a `WindowConfig` (not builder
/// setters) because only that path hands the traffic-light inset to tao as well as to wry: tao
/// re-applies it after `setTitle:`, which AppKit uses to reset the buttons (`tauri#13044`), and the
/// title changes with every section.
fn window_config(material: Material) -> WindowConfig {
    let mut config = json!({
        "label": MAIN_WINDOW,
        "url": "index.html",
        "title": "BruteForceHR",
        "width": 1280,
        "height": 800,
        // Snap layouts need a minimum width of at most 500 epx (Microsoft, "Support snap layouts
        // for desktop apps on Windows 11"); 480 fits thirds on 1536-epx screens and quadrants on
        // 1366×768.
        "minWidth": 480,
        "minHeight": 360,
        "transparent": material != Material::None,
    });
    match material {
        Material::Vibrancy => {
            config["titleBarStyle"] = json!("Overlay");
            config["hiddenTitle"] = json!(true);
            // `--chrome-height` (52 px) toolbar row in src/app.css: the 14 pt lights start at the
            // sidebar icons' x (12 px sidebar padding + 8 px row inset) and are centred in the row
            // (top edge at 19 px). `y` grows the title-bar container to 14 + y while the buttons
            // keep their 9 pt offset from its bottom (measured on macOS 26), so y = 19 + 9.
            config["trafficLightPosition"] = json!({ "x": 20, "y": 28 });
            config["windowEffects"] =
                json!({ "effects": ["sidebar"], "state": "followsWindowActiveState" });
        }
        Material::Mica => config["windowEffects"] = json!({ "effects": ["mica"] }),
        Material::None => {}
    }
    serde_json::from_value(config).expect("the main window config is valid")
}

pub fn create_main<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let chrome = ChromeInfo {
        platform: PLATFORM,
        material: material(),
        locale: sys_locale::get_locale(),
        version: app.package_info().version.to_string(),
    };
    let dev_url = if tauri::is_dev() {
        app.config().build.dev_url.clone()
    } else {
        None
    };

    WebviewWindowBuilder::from_config(app, &window_config(chrome.material))?
        .initialization_script(chrome_script(&chrome))
        .on_navigation(move |url| {
            let allowed = navigation::is_allowed(url, dev_url.as_ref());
            if !allowed {
                eprintln!("blocked navigation to {url}");
            }
            allowed
        })
        // window.open and target=_blank never create windows; links leave through open_external.
        .on_new_window(|_url, _features| NewWindowResponse::Deny)
        // The window title follows the section (`Jobs · BruteForceHR`) for the taskbar, Alt+Tab
        // and the macOS Window menu.
        .on_document_title_changed(|window, title| {
            let _ = window.set_title(&title);
        })
        .build()?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{ChromeInfo, MAIN_WINDOW, Material, Platform, chrome_script, window_config};

    #[test]
    fn chrome_script_defines_a_frozen_global() {
        let script = chrome_script(&ChromeInfo {
            platform: Platform::Windows,
            material: Material::Mica,
            locale: Some("tr-TR".to_owned()),
            version: "0.1.0".to_owned(),
        });
        assert_eq!(
            script,
            r#"Object.defineProperty(window, "__BFHR_CHROME__", { value: Object.freeze({"platform":"windows","material":"mica","locale":"tr-TR","version":"0.1.0"}) });"#
        );
    }

    #[test]
    fn window_config_is_valid_for_every_material() {
        for material in [Material::Vibrancy, Material::Mica, Material::None] {
            let config = window_config(material);
            assert_eq!(config.label, MAIN_WINDOW);
            assert_eq!((config.width, config.height), (1280.0, 800.0));
            assert_eq!(
                (config.min_width, config.min_height),
                (Some(480.0), Some(360.0))
            );
            assert_eq!(config.transparent, material != Material::None);
            assert_eq!(config.window_effects.is_some(), material != Material::None);
        }
        let mac = window_config(Material::Vibrancy);
        assert!(mac.hidden_title);
        assert!(mac.traffic_light_position.is_some());
    }
}
