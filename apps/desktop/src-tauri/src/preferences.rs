//! Device preferences kept by the shell: `preferences.json` in the app's config directory
//! (`~/Library/Application Support/com.savas07.bruteforcehr`, `%APPDATA%\com.savas07.bruteforcehr`).
//! Only settings the shell itself needs live here; account settings sync through Firestore.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

const FILE_NAME: &str = "preferences.json";

/// Which release manifest the updater reads (ADR 0004 §4). Matches `UpdateChannel` in
/// src/lib/updates.ts.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    #[default]
    Stable,
    Beta,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Preferences {
    pub update_channel: UpdateChannel,
}

fn file<R: Runtime>(app: &AppHandle<R>) -> io::Result<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(FILE_NAME))
        .map_err(io::Error::other)
}

/// Reads the file; a missing file means the defaults, and an unreadable one is reported and
/// replaced by the defaults (never blocks launch).
pub fn read_from(path: &Path) -> Preferences {
    match fs::read(path) {
        Ok(bytes) => serde_json::from_slice(&bytes).unwrap_or_else(|error| {
            eprintln!("ignoring unreadable {}: {error}", path.display());
            Preferences::default()
        }),
        Err(error) if error.kind() == io::ErrorKind::NotFound => Preferences::default(),
        Err(error) => {
            eprintln!("failed to read {}: {error}", path.display());
            Preferences::default()
        }
    }
}

/// Writes through a temporary file and a rename, so a crash never leaves half a file.
pub fn write_to(path: &Path, preferences: &Preferences) -> io::Result<()> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir)?;
    }
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, serde_json::to_vec_pretty(preferences)?)?;
    fs::rename(&temporary, path)
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> Preferences {
    file(app).map_or_else(
        |error| {
            eprintln!("no config directory: {error}");
            Preferences::default()
        },
        |path| read_from(&path),
    )
}

pub fn save<R: Runtime>(app: &AppHandle<R>, preferences: &Preferences) -> io::Result<()> {
    write_to(&file(app)?, preferences)
}

#[cfg(test)]
mod tests {
    use super::{Preferences, UpdateChannel, read_from, write_to};
    use std::fs;
    use std::path::PathBuf;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("bfhr-prefs-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        dir.join("nested").join("preferences.json")
    }

    #[test]
    fn stable_is_the_default() {
        assert_eq!(Preferences::default().update_channel, UpdateChannel::Stable);
        let path = scratch("missing");
        assert_eq!(read_from(&path), Preferences::default());
    }

    #[test]
    fn round_trips_and_creates_the_directory() {
        let path = scratch("roundtrip");
        let beta = Preferences {
            update_channel: UpdateChannel::Beta,
        };
        write_to(&path, &beta).unwrap();
        assert_eq!(
            fs::read_to_string(&path).unwrap(),
            "{\n  \"updateChannel\": \"beta\"\n}"
        );
        assert_eq!(read_from(&path), beta);
        fs::remove_dir_all(path.parent().unwrap().parent().unwrap()).unwrap();
    }

    #[test]
    fn unreadable_or_partial_files_fall_back_to_defaults() {
        let path = scratch("broken");
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(&path, "{not json").unwrap();
        assert_eq!(read_from(&path), Preferences::default());
        fs::write(&path, r#"{"updateChannel":"nightly"}"#).unwrap();
        assert_eq!(read_from(&path), Preferences::default());
        // Unknown keys from a newer version are ignored; missing keys take their defaults.
        fs::write(&path, r#"{"later":true}"#).unwrap();
        assert_eq!(read_from(&path), Preferences::default());
        fs::remove_dir_all(path.parent().unwrap().parent().unwrap()).unwrap();
    }
}
