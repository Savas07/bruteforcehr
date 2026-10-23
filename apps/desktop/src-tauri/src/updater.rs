//! In-app updates (ADR 0004 §3). Checks the release manifest at launch and every 6 h, downloads a
//! newer signed bundle in the background and keeps it until the user picks "Restart to update"
//! or quits, when it is installed. The UI only sees [`UpdateSnapshot`]s (the `update-status`
//! event and the `update_status` command); it never gets the updater plugin's own commands.
//!
//! Endpoints and the public key come from `tauri.conf.json` → `plugins.updater`: `endpoints` is
//! the Stable channel (read by the plugin itself) and `betaEndpoints` the Beta channel, which
//! replaces them at runtime when the preference says so.

use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tauri_plugin_updater::{Update, UpdaterExt};
use time::format_description::well_known::Rfc3339;
use url::Url;

use crate::preferences::{self, UpdateChannel};
use crate::window::MAIN_WINDOW;

/// Event the UI listens for (src/lib/updates.ts).
pub const UPDATE_STATUS_EVENT: &str = "update-status";

/// How often a running app looks for a new release (BRIEF §7).
const CHECK_INTERVAL: Duration = Duration::from_hours(6);

/// Automatic checks run in release builds only: a dev or E2E build would otherwise download a
/// real release. "Check for Updates…" works in every build.
const AUTOMATIC_CHECKS: bool = !cfg!(debug_assertions) && !cfg!(feature = "e2e");

/// The step that failed, so the UI can say what didn't work.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum FailedStep {
    Check,
    Download,
    Install,
}

/// Where the updater is; matches `UpdateStatus` in src/lib/updates.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(
    tag = "state",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum UpdateStatus {
    /// No check has finished since launch.
    Idle,
    Checking,
    UpToDate,
    /// A newer version exists and is downloading. `total` is null when the server doesn't say.
    Downloading {
        version: String,
        downloaded: u64,
        total: Option<u64>,
    },
    /// Downloaded and verified; installs on "Restart to update" or at quit.
    Ready {
        version: String,
        notes: Option<String>,
        /// RFC 3339, from the manifest's `pub_date`.
        published_at: Option<String>,
    },
    Failed {
        step: FailedStep,
    },
}

/// What the UI receives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSnapshot {
    pub status: UpdateStatus,
    pub channel: UpdateChannel,
}

struct Pending {
    update: Update,
    bytes: Vec<u8>,
}

struct Inner {
    status: UpdateStatus,
    pending: Option<Pending>,
    /// A check or download is running; a second request only reports the current status.
    busy: bool,
}

/// Managed state: the current status and the downloaded bundle.
pub struct Updates {
    inner: Mutex<Inner>,
}

impl Default for Updates {
    fn default() -> Self {
        Self {
            inner: Mutex::new(Inner {
                status: UpdateStatus::Idle,
                pending: None,
                busy: false,
            }),
        }
    }
}

/// Errors of [`restart_to_update`]; the commands map them for the UI.
#[derive(Debug)]
pub enum RestartError {
    NothingToInstall,
    Install(String),
}

impl Updates {
    fn lock(&self) -> std::sync::MutexGuard<'_, Inner> {
        // A panic while holding the lock leaves plain data behind; keep serving it.
        self.inner
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }

    fn status(&self) -> UpdateStatus {
        self.lock().status.clone()
    }
}

/// The Beta channel's manifest URLs from `plugins.updater.betaEndpoints` (https only).
pub fn beta_endpoints(updater_config: Option<&serde_json::Value>) -> Result<Vec<Url>, String> {
    let list = updater_config
        .and_then(|config| config.get("betaEndpoints"))
        .and_then(serde_json::Value::as_array)
        .ok_or("plugins.updater.betaEndpoints is not configured")?;
    let endpoints = list
        .iter()
        .map(|value| {
            let text = value.as_str().ok_or("betaEndpoints must be strings")?;
            let url =
                Url::parse(text).map_err(|error| format!("bad beta endpoint {text}: {error}"))?;
            if url.scheme() == "https" {
                Ok(url)
            } else {
                Err(format!("beta endpoint {text} must use https"))
            }
        })
        .collect::<Result<Vec<_>, String>>()?;
    if endpoints.is_empty() {
        return Err("plugins.updater.betaEndpoints is empty".to_owned());
    }
    Ok(endpoints)
}

/// Whole-percent progress changed (or the first byte arrived without a known size): worth an
/// event. Chunk callbacks fire every few KB, far too often to forward each one.
fn progress_step(before: u64, after: u64, total: Option<u64>) -> bool {
    match total {
        Some(total) if total > 0 => before * 100 / total != after * 100 / total,
        // Unknown size: report each further MiB.
        _ => before == 0 || before >> 20 != after >> 20,
    }
}

fn snapshot<R: Runtime>(app: &AppHandle<R>, status: UpdateStatus) -> UpdateSnapshot {
    UpdateSnapshot {
        status,
        channel: preferences::load(app).update_channel,
    }
}

fn publish<R: Runtime>(app: &AppHandle<R>, status: UpdateStatus) {
    let state = app.state::<Updates>();
    state.lock().status = status.clone();
    if let Err(error) = app.emit_to(MAIN_WINDOW, UPDATE_STATUS_EVENT, snapshot(app, status)) {
        eprintln!("failed to send the update status: {error}");
    }
}

/// The current status, for a UI that just loaded.
pub fn current<R: Runtime>(app: &AppHandle<R>) -> UpdateSnapshot {
    snapshot(app, app.state::<Updates>().status())
}

/// Checks the channel's manifest and downloads a newer version. Returns at once when a check
/// is already running or an update is ready (the UI gets the current status either way).
pub async fn check<R: Runtime>(app: AppHandle<R>) {
    {
        let state = app.state::<Updates>();
        let mut inner = state.lock();
        if inner.busy || inner.pending.is_some() {
            let status = inner.status.clone();
            drop(inner);
            publish(&app, status);
            return;
        }
        inner.busy = true;
    }
    publish(&app, UpdateStatus::Checking);
    let status = match find_and_download(&app).await {
        Ok(status) => status,
        Err((step, error)) => {
            eprintln!("update {step:?} failed: {error}");
            UpdateStatus::Failed { step }
        }
    };
    app.state::<Updates>().lock().busy = false;
    publish(&app, status);
}

async fn find_and_download<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<UpdateStatus, (FailedStep, String)> {
    let check_failed = |error: &dyn std::fmt::Display| (FailedStep::Check, error.to_string());
    let mut builder = app.updater_builder();
    if preferences::load(app).update_channel == UpdateChannel::Beta {
        let endpoints = beta_endpoints(app.config().plugins.0.get("updater"))
            .map_err(|error| check_failed(&error))?;
        builder = builder.endpoints(endpoints).map_err(|e| check_failed(&e))?;
    }
    let updater = builder.build().map_err(|e| check_failed(&e))?;
    let Some(update) = updater.check().await.map_err(|e| check_failed(&e))? else {
        return Ok(UpdateStatus::UpToDate);
    };

    let version = update.version.clone();
    publish(
        app,
        UpdateStatus::Downloading {
            version: version.clone(),
            downloaded: 0,
            total: None,
        },
    );
    let mut downloaded = 0_u64;
    let bytes = update
        .download(
            |chunk, total| {
                let before = downloaded;
                downloaded += chunk as u64;
                if progress_step(before, downloaded, total) {
                    publish(
                        app,
                        UpdateStatus::Downloading {
                            version: version.clone(),
                            downloaded,
                            total,
                        },
                    );
                }
            },
            || {},
        )
        .await
        .map_err(|error| (FailedStep::Download, error.to_string()))?;

    let ready = UpdateStatus::Ready {
        version,
        notes: update.body.clone().filter(|notes| !notes.trim().is_empty()),
        published_at: update.date.and_then(|date| date.format(&Rfc3339).ok()),
    };
    app.state::<Updates>().lock().pending = Some(Pending { update, bytes });
    Ok(ready)
}

/// Launch check plus one every 6 h (release builds only).
pub fn start_background_checks<R: Runtime>(app: &AppHandle<R>) {
    if !AUTOMATIC_CHECKS {
        return;
    }
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            check(app.clone()).await;
            tokio::time::sleep(CHECK_INTERVAL).await;
        }
    });
}

/// Installs the downloaded update and relaunches into it. The UI calls this only after any
/// unsaved edits are saved (src/shared/unsavedChanges.ts). On Windows the installer quits the app
/// itself and starts the new version when it's done.
pub fn restart_to_update<R: Runtime>(app: &AppHandle<R>) -> Result<(), RestartError> {
    let Some(pending) = app.state::<Updates>().lock().pending.take() else {
        return Err(RestartError::NothingToInstall);
    };
    if let Err(error) = pending.update.install(&pending.bytes) {
        publish(
            app,
            UpdateStatus::Failed {
                step: FailedStep::Install,
            },
        );
        return Err(RestartError::Install(error.to_string()));
    }
    app.restart()
}

/// At quit: installs a downloaded update so the next launch runs it. Windows runs the installer
/// without relaunching the app.
pub fn install_on_exit<R: Runtime>(app: &AppHandle<R>) {
    let Some(pending) = app.state::<Updates>().lock().pending.take() else {
        return;
    };
    if let Err(error) = pending
        .update
        .restart_after_install(false)
        .install(&pending.bytes)
    {
        eprintln!("failed to install the update at quit: {error}");
    }
}

/// Saves the channel and checks it right away; a bundle downloaded from the other channel is
/// dropped, since the user no longer asked for it.
pub fn set_channel<R: Runtime>(app: &AppHandle<R>, channel: UpdateChannel) -> std::io::Result<()> {
    let mut prefs = preferences::load(app);
    if prefs.update_channel == channel {
        return Ok(());
    }
    prefs.update_channel = channel;
    preferences::save(app, &prefs)?;
    {
        let state = app.state::<Updates>();
        let mut inner = state.lock();
        if !inner.busy {
            inner.pending = None;
            inner.status = UpdateStatus::Idle;
        }
    }
    tauri::async_runtime::spawn(check(app.clone()));
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{FailedStep, UpdateSnapshot, UpdateStatus, beta_endpoints, progress_step};
    use crate::preferences::UpdateChannel;
    use serde_json::json;

    const CONFIG: &str = include_str!("../tauri.conf.json");

    fn json_of(status: UpdateStatus) -> String {
        serde_json::to_string(&UpdateSnapshot {
            status,
            channel: UpdateChannel::Stable,
        })
        .unwrap()
    }

    #[test]
    fn statuses_match_the_ui() {
        assert_eq!(
            json_of(UpdateStatus::UpToDate),
            r#"{"status":{"state":"up-to-date"},"channel":"stable"}"#
        );
        assert_eq!(
            json_of(UpdateStatus::Downloading {
                version: "0.1.1".into(),
                downloaded: 5,
                total: None
            }),
            r#"{"status":{"state":"downloading","version":"0.1.1","downloaded":5,"total":null},"channel":"stable"}"#
        );
        assert_eq!(
            json_of(UpdateStatus::Ready {
                version: "0.1.1".into(),
                notes: Some("Fixes".into()),
                published_at: Some("2026-10-23T10:00:00Z".into())
            }),
            r#"{"status":{"state":"ready","version":"0.1.1","notes":"Fixes","publishedAt":"2026-10-23T10:00:00Z"},"channel":"stable"}"#
        );
        assert_eq!(
            json_of(UpdateStatus::Failed {
                step: FailedStep::Download
            }),
            r#"{"status":{"state":"failed","step":"download"},"channel":"stable"}"#
        );
    }

    #[test]
    fn the_committed_config_has_both_channels_over_https() {
        let config: serde_json::Value = serde_json::from_str(CONFIG).unwrap();
        let updater = &config["plugins"]["updater"];
        let stable = updater["endpoints"].as_array().expect("stable endpoints");
        stable.first().expect("at least one stable endpoint");
        assert!(
            stable
                .iter()
                .all(|url| url.as_str().unwrap().starts_with("https://"))
        );
        assert!(
            !updater["pubkey"].as_str().unwrap_or("").is_empty(),
            "updater pubkey"
        );
        let beta = beta_endpoints(Some(updater)).unwrap();
        assert_ne!(
            beta.iter().map(url::Url::as_str).collect::<Vec<_>>(),
            stable
                .iter()
                .map(|url| url.as_str().unwrap())
                .collect::<Vec<_>>(),
            "beta must not reuse the stable manifest"
        );
    }

    #[test]
    fn beta_endpoints_are_validated() {
        assert!(beta_endpoints(None).is_err());
        assert!(beta_endpoints(Some(&json!({ "betaEndpoints": [] }))).is_err());
        assert!(
            beta_endpoints(Some(
                &json!({ "betaEndpoints": ["http://example.com/l.json"] })
            ))
            .is_err()
        );
        assert!(beta_endpoints(Some(&json!({ "betaEndpoints": [3] }))).is_err());
        assert_eq!(
            beta_endpoints(Some(
                &json!({ "betaEndpoints": ["https://example.com/l.json"] })
            ))
            .unwrap()[0]
                .as_str(),
            "https://example.com/l.json"
        );
    }

    #[test]
    fn progress_is_reported_per_percent() {
        assert!(!progress_step(0, 5, Some(1000)));
        assert!(progress_step(5, 10, Some(1000)));
        assert!(!progress_step(10, 19, Some(1000)));
        assert!(progress_step(990, 1000, Some(1000)));
        // Unknown size: the first chunk, then each MiB.
        assert!(progress_step(0, 10, None));
        assert!(!progress_step(10, 1000, None));
        assert!(progress_step((1 << 20) - 1, 1 << 20, None));
    }
}
