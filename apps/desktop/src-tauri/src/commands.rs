//! Commands the UI may invoke. Each one validates its arguments here, in Rust; capabilities
//! (capabilities/main.json) decide which windows may call it at all.

use serde::Serialize;
use std::time::Instant;

use tauri::{AppHandle, Runtime, State};
use tauri_plugin_opener::OpenerExt;

use crate::external_url::{self, ExternalUrlError};
use crate::job_url::{self, JobUrlError, RateLimiter};

/// Errors reach the UI as `{ kind, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CommandError {
    UrlNotAllowed { message: String },
    RateLimited { message: String },
    OpenFailed { message: String },
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
