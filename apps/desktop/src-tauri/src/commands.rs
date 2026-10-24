//! Commands the UI may invoke. Each one validates its arguments here, in Rust; capabilities
//! (capabilities/main.json) decide which windows may call it at all.

use serde::Serialize;
use std::time::Instant;

use tauri::ipc::{Request, Response};
use tauri::{AppHandle, Runtime, State, WebviewWindow};
use tauri_plugin_opener::OpenerExt;

use crate::auth_link::{AuthLinkDelivery, PendingAuthLink};
use crate::cv_pdf::{self, Paper, PrintError};
use crate::export_file::{self, ExportError};
use crate::external_url::{self, ExternalUrlError};
use crate::job_url::{self, JobUrlError, RateLimiter};
use crate::kit_file::{self, KitAction, KitFileError};
use crate::mail_connect::{MailConnectResult, PendingMailConnect};
use crate::mail_inbox::{self, MailProvider};
use crate::mailto::{self, MailtoError, MailtoLimiter};
use crate::menu;
use crate::preferences::UpdateChannel;
use crate::updater::{self, RestartError, UpdateSnapshot};

/// Errors reach the UI as `{ kind, message }`.
#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum CommandError {
    UrlNotAllowed {
        message: String,
    },
    RateLimited {
        message: String,
    },
    OpenFailed {
        message: String,
    },
    /// Recipients, subject or body `open_mailto` can't put into a `mailto:` link.
    InvalidMailto {
        message: String,
    },
    NoUpdateReady {
        message: String,
    },
    InstallFailed {
        message: String,
    },
    PreferenceNotSaved {
        message: String,
    },
    /// Arguments of `print_cv_pdf` / `save_export` that can't be printed or saved.
    InvalidExport {
        message: String,
    },
    PrintFailed {
        message: String,
    },
    SaveFailed {
        message: String,
    },
    /// `open_kit_file` / `reveal_kit_file` with a path outside the application kit folder.
    FileNotAllowed {
        message: String,
    },
}

impl From<KitFileError> for CommandError {
    fn from(error: KitFileError) -> Self {
        let message = error.to_string();
        eprintln!("application kit file: {message}");
        match error {
            KitFileError::NotInKit => Self::FileNotAllowed { message },
            KitFileError::Open(_) => Self::OpenFailed { message },
            KitFileError::NoFolder(_) | KitFileError::Write(_) => Self::SaveFailed { message },
        }
    }
}

impl From<PrintError> for CommandError {
    fn from(error: PrintError) -> Self {
        let message = error.to_string();
        // The UI shows a calm "couldn't make the file"; the cause goes to the log.
        eprintln!("print_cv_pdf failed: {message}");
        match error {
            PrintError::EmptyHtml | PrintError::HtmlTooLarge { .. } => {
                Self::InvalidExport { message }
            }
            _ => Self::PrintFailed { message },
        }
    }
}

impl From<ExportError> for CommandError {
    fn from(error: ExportError) -> Self {
        let message = error.to_string();
        eprintln!("save_export failed: {message}");
        match error {
            ExportError::Dialog(_) | ExportError::Write(_) => Self::SaveFailed { message },
            _ => Self::InvalidExport { message },
        }
    }
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

impl From<MailtoError> for CommandError {
    fn from(error: MailtoError) -> Self {
        Self::InvalidMailto {
            message: error.to_string(),
        }
    }
}

/// Opens a validated URL with the system handler (default browser, mail app).
fn open<R: Runtime>(app: &AppHandle<R>, url: &url::Url) -> Result<(), CommandError> {
    // E2E builds only: launching the real browser takes focus away from the app window (Windows
    // then drops the next spec's key presses), so the URL is appended to `opened-urls.txt` in the
    // export folder for the specs to read instead.
    #[cfg(feature = "e2e")]
    if let Some(directory) = std::env::var_os("BFHR_E2E_EXPORT_DIR") {
        return record_opened_url(&std::path::PathBuf::from(directory), url).map_err(|error| {
            CommandError::OpenFailed {
                message: error.to_string(),
            }
        });
    }
    app.opener()
        .open_url(url.as_str(), None::<&str>)
        .map_err(|error| CommandError::OpenFailed {
            message: error.to_string(),
        })
}

/// One URL per line, appended (E2E builds; see [`open`]).
#[cfg(feature = "e2e")]
fn record_opened_url(directory: &std::path::Path, url: &url::Url) -> std::io::Result<()> {
    use std::io::Write;
    std::fs::create_dir_all(directory)?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(directory.join("opened-urls.txt"))?;
    writeln!(file, "{url}")
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

/// The newest mail connect result (`bruteforcehr://connected?…`), checked by
/// `mail_connect::parse`, once: the UI calls this while it waits and on every `mail-connect` event.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the State by value"
)]
pub fn take_mail_connect(pending: State<'_, PendingMailConnect>) -> Option<MailConnectResult> {
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

/// "Open in your mail app" (email apply without a sending account): a new message to `to` with
/// `subject` and `body` in the default mail app. `mailto::build` checks the addresses and limits;
/// at most 3 per 10 s.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle, State and arguments by value"
)]
pub fn open_mailto<R: Runtime>(
    app: AppHandle<R>,
    limiter: State<'_, MailtoLimiter>,
    to: Vec<String>,
    subject: &str,
    body: &str,
) -> Result<(), CommandError> {
    let url = mailto::build(&to, subject, body)?;
    limiter.0.try_acquire(Instant::now())?;
    open(&app, &url)
}

/// The CV's self-contained HTML (`@bfhr/cv-render`) printed to a PDF on A4 or Letter pages,
/// offline, by the OS webview (`src/cv_pdf.rs`). Returns the PDF's bytes as the raw response body.
#[tauri::command]
pub async fn print_cv_pdf<R: Runtime>(
    app: AppHandle<R>,
    html: String,
    paper: Paper,
) -> Result<Response, CommandError> {
    let pdf = cv_pdf::print(&app, html, paper).await?;
    Ok(Response::new(pdf))
}

/// Saves an exported file (a CV, an interview `.ics`, a CSV, the account export ZIP) through the
/// native Save dialog (`src/export_file.rs`). The file's bytes are the raw request body; the
/// suggested file name (percent-encoded) and the kind (`pdf`, `docx`, `json`, `ics`, `csv`, `zip`)
/// are the `bfhr-file-name` and `bfhr-export-kind` headers. Returns the saved path, or null when
/// the dialog is cancelled.
#[tauri::command]
pub async fn save_export<R: Runtime>(
    window: WebviewWindow<R>,
    request: Request<'_>,
) -> Result<Option<String>, CommandError> {
    let kind = export_file::kind_from_headers(request.headers())?;
    let bytes = export_file::body_bytes(request.body(), kind)?;
    let file_name = export_file::file_name_from_headers(request.headers(), kind)?;
    let path = export_file::save(&window, &bytes, &file_name, kind).await?;
    Ok(path.map(|path| path.to_string_lossy().into_owned()))
}

/// The application kit's "Open", "Show in Finder" and "Copy path" (`src/kit_file.rs`): saves a
/// PDF to `Downloads/BruteForceHR` without asking and returns its path. The bytes are the raw
/// request body, the file name (percent-encoded) the `bfhr-file-name` header. Async, so the write
/// stays off the main thread.
#[tauri::command]
pub async fn save_kit_file<R: Runtime>(
    app: AppHandle<R>,
    request: Request<'_>,
) -> Result<String, CommandError> {
    let kind = export_file::ExportKind::Pdf;
    let bytes = export_file::body_bytes(request.body(), kind)?;
    let file_name = export_file::file_name_from_headers(request.headers(), kind)?;
    let path = kit_file::save(&kit_file::folder(&app)?, &file_name, &bytes)?;
    Ok(path.to_string_lossy().into_owned())
}

/// Opens a PDF saved by `save_kit_file` in the default PDF app.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn open_kit_file<R: Runtime>(app: AppHandle<R>, path: &str) -> Result<(), CommandError> {
    let file = kit_file::checked(&kit_file::folder(&app)?, path)?;
    kit_file::run(&app, KitAction::Open, &file)?;
    Ok(())
}

/// Shows a PDF saved by `save_kit_file` selected in Finder / Explorer.
#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri injects the AppHandle by value"
)]
pub fn reveal_kit_file<R: Runtime>(app: AppHandle<R>, path: &str) -> Result<(), CommandError> {
    let file = kit_file::checked(&kit_file::folder(&app)?, path)?;
    kit_file::run(&app, KitAction::Reveal, &file)?;
    Ok(())
}
