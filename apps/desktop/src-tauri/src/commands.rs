//! Commands the UI may invoke. Each one validates its arguments here, in Rust; capabilities
//! (capabilities/main.json) decide which windows may call it at all.

use serde::Serialize;
use std::time::Instant;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::auth_link::{AuthLinkDelivery, PendingAuthLink};
use crate::external_url::{self, ExternalUrlError};
use crate::job_url::{self, JobUrlError, RateLimiter};
use crate::mail_inbox::{self, MailProvider};
use crate::menu;
use crate::preferences::UpdateChannel;
use crate::updater::{self, RestartError, UpdateSnapshot};

/// Errors reach the UI as `{ kind, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CommandError {
    UrlNotAllowed { message: String },
    RateLimited { message: String },
    OpenFailed { message: String },
    NoUpdateReady { message: String },
    InstallFailed { message: String },
    PreferenceNotSaved { message: String },
}

impl From<RestartError> for CommandError {
    fn from(error: RestartError) -> Self {
        match error {
            RestartError::NothingToInstall => Self::NoUpdateReady {
                message: "no downloaded update to install".to_owned(),
            },
            RestartError::Install(message) => Self::InstallFailed { message },
        }
    }
}

impl From<ExternalUrlError> for CommandError {
    fn from(error: ExternalUrlError) -> Self {
        Self::UrlNotAllowed {
            message: error.to_string(),
        }
    }
}

impl From<JobUrlError> for CommandError {
    fn from(error: JobUrlError) -> Self {
        let message = error.to_string();
        match error {
            JobUrlError::RateLimited => Self::RateLimited { message },
            _ => Self::UrlNotAllowed { message },
        }
    }
}

fn open<R: Runtime>(app: &AppHandle<R>, url: &url::Url) -> Result<(), CommandError> {
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| CommandError::OpenFailed {
            message: error.to_string(),
        })
}

/// Opens an allowlisted https URL (`external_url::ALLOWED_HOSTS`) in the default browser.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn open_external<R: Runtime>(app: AppHandle<R>, url: &str) -> Result<(), CommandError> {
    open(&app, &external_url::parse(url)?)
}

/// Opens a job-posting link (any public https address, `job_url::parse`) in the default browser,
/// at most 5 per 10 s. Validation happens before the rate limit, so refused URLs don't use it up.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle and State by value"
)]
pub fn open_job_url<R: Runtime>(
    app: AppHandle<R>,
    limiter: State<'_, RateLimiter>,
    url: &str,
) -> Result<(), CommandError> {
    let url = job_url::parse(url)?;
    limiter.try_acquire(Instant::now())?;
    open(&app, &url)
}

/// The updater's current status and channel (src/lib/updates.ts); changes arrive as
/// `update-status` events.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn update_status<R: Runtime>(app: AppHandle<R>) -> UpdateSnapshot {
    updater::current(&app)
}

/// "Check for Updates…": starts a check (and download) unless one is running; progress arrives as
/// `update-status` events.
#[tauri::command]
pub fn check_for_updates<R: Runtime>(app: AppHandle<R>) {
    tauri::async_runtime::spawn(updater::check(app));
}

/// "Restart to update": installs the downloaded update and relaunches. The UI saves unsaved edits
/// first.
#[tauri::command]
pub async fn restart_to_update<R: Runtime>(app: AppHandle<R>) -> Result<(), CommandError> {
    updater::restart_to_update(&app).map_err(CommandError::from)
}

/// The Stable/Beta preference (Settings); typed by serde, so only the two channels get through.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn set_update_channel<R: Runtime>(
    app: AppHandle<R>,
    channel: UpdateChannel,
) -> Result<(), CommandError> {
    updater::set_channel(&app, channel).map_err(|error| CommandError::PreferenceNotSaved {
        message: error.to_string(),
    })
}

/// The newest sign-in link (`bruteforcehr://auth/finish?link=…`), checked by `auth_link::parse`,
/// once: the UI calls this at start and on every `auth-link` event.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the State by value"
)]
pub fn take_auth_link(pending: State<'_, PendingAuthLink>) -> Option<AuthLinkDelivery> {
    pending.take()
}

/// The UI reports whether someone is signed in, so the menu's "Sign Out" is only enabled then.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn set_signed_in<R: Runtime>(app: AppHandle<R>, signed_in: bool) {
    menu::set_signed_in(&app, signed_in);
}

/// "Open Gmail" and the like on the "Check your email" screen: the provider's webmail inbox
/// (`mail_inbox::inbox_url`) in the default browser.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn open_mail_inbox<R: Runtime>(
    app: AppHandle<R>,
    provider: MailProvider,
    email: &str,
) -> Result<(), CommandError> {
    open(&app, &mail_inbox::inbox_url(provider, email))
}
