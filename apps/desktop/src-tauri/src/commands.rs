//! Commands the UI may invoke. Each one validates its arguments here, in Rust; capabilities
//! (capabilities/main.json) decide which windows may call it at all.

use serde::Serialize;
use tauri::{AppHandle, Runtime};
use tauri_plugin_opener::OpenerExt;

use crate::external_url::{self, ExternalUrlError};

/// Errors reach the UI as `{ kind, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CommandError {
    UrlNotAllowed { message: String },
    OpenFailed { message: String },
}

impl From<ExternalUrlError> for CommandError {
    fn from(error: ExternalUrlError) -> Self {
        Self::UrlNotAllowed {
            message: error.to_string(),
        }
    }
}

/// Opens an allowlisted https URL (`external_url::ALLOWED_HOSTS`) in the default browser.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn open_external<R: Runtime>(app: AppHandle<R>, url: &str) -> Result<(), CommandError> {
    let url = external_url::parse(url)?;
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| CommandError::OpenFailed {
            message: error.to_string(),
        })
}
