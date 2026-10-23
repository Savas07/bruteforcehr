//! CV PDFs, offline: the CV's self-contained HTML (`@bfhr/cv-render`, fonts embedded, its own
//! `@page` margins) is loaded into a hidden webview window and printed with the OS webview's own
//! print-to-PDF (macOS: `WKWebView`'s print operation; Windows: WebView2's `PrintToPdf`), so the PDF
//! has real pages (A4 or Letter) and selectable text.
//!
//! The page reaches the hidden window through the `bfhr-cv-print` URI scheme: each print job's
//! HTML is served once, only to its own window, with a CSP that allows no scripts and no network.

use std::borrow::Cow;
use std::collections::HashMap;
use std::fmt;
use std::path::PathBuf;
use std::sync::Mutex;
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::Duration;

use serde::Deserialize;
use tauri::http::{Request, Response, StatusCode, header};
use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{
    AppHandle, Manager, Runtime, UriSchemeContext, Url, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tokio::sync::oneshot;

// An explicit path, so tests/print_pdf.rs can include this file as well.
#[path = "cv_pdf/native.rs"]
mod native;

/// The URI scheme the hidden print windows load their page from (registered in main.rs).
pub const SCHEME: &str = "bfhr-cv-print";

/// Upper bound for a CV's HTML. Embedded fonts and a photo make it a few MB at most.
pub const MAX_HTML_BYTES: usize = 32 * 1024 * 1024;

/// How long the page (fonts and photo are data URLs inside it) may take to load.
const LOAD_TIMEOUT: Duration = Duration::from_secs(30);
/// How long printing may take once the page has loaded.
const PRINT_TIMEOUT: Duration = Duration::from_secs(60);

/// The page's own policy: inline styles, data-URL fonts and images; no scripts, no network.
const PAGE_CSP: &str = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; \
                        img-src data:; base-uri 'none'; form-action 'none'";

const MM_PER_INCH: f64 = 25.4;

/// The paper the PDF's pages have; the HTML's `@page` rules set the margins.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Paper {
    /// 210 × 297 mm.
    A4,
    /// 8.5 × 11 in.
    Letter,
}

impl Paper {
    /// Width and height in inches (WebView2's print settings).
    pub fn inches(self) -> (f64, f64) {
        match self {
            Self::A4 => (210.0 / MM_PER_INCH, 297.0 / MM_PER_INCH),
            Self::Letter => (8.5, 11.0),
        }
    }

    /// Width and height in PostScript points, 72 per inch (`NSPrintInfo`, PDF page boxes).
    #[cfg_attr(
        not(any(target_os = "macos", test)),
        expect(
            dead_code,
            reason = "WebView2 takes inches; only macOS prints in points"
        )
    )]
    pub fn points(self) -> (f64, f64) {
        let (width, height) = self.inches();
        (width * 72.0, height * 72.0)
    }

    /// Width and height in CSS pixels, 96 per inch: the hidden window's size.
    fn css_pixels(self) -> (f64, f64) {
        let (width, height) = self.inches();
        (width * 96.0, height * 96.0)
    }
}

#[derive(Debug)]
pub enum PrintError {
    /// The HTML is empty.
    EmptyHtml,
    /// The HTML is larger than [`MAX_HTML_BYTES`].
    HtmlTooLarge { bytes: usize },
    /// The hidden window could not be created or reached.
    Window(tauri::Error),
    /// The page did not finish loading within [`LOAD_TIMEOUT`].
    LoadTimedOut,
    /// Printing did not finish within [`PRINT_TIMEOUT`].
    PrintTimedOut,
    /// The webview's print API failed.
    Print(String),
    /// The temporary PDF could not be created or read.
    Io(std::io::Error),
}

impl fmt::Display for PrintError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyHtml => f.write_str("the CV's HTML is empty"),
            Self::HtmlTooLarge { bytes } => write!(
                f,
                "the CV's HTML is {bytes} bytes; at most {MAX_HTML_BYTES} are accepted"
            ),
            Self::Window(error) => write!(f, "the print window failed: {error}"),
            Self::LoadTimedOut => f.write_str("the CV page did not finish loading"),
            Self::PrintTimedOut => f.write_str("printing the CV did not finish"),
            Self::Print(message) => write!(f, "printing the CV failed: {message}"),
            Self::Io(error) => write!(f, "the PDF file failed: {error}"),
        }
    }
}

impl From<tauri::Error> for PrintError {
    fn from(error: tauri::Error) -> Self {
        Self::Window(error)
    }
}

impl From<std::io::Error> for PrintError {
    fn from(error: std::io::Error) -> Self {
        Self::Io(error)
    }
}

/// Checks the HTML before any window is created.
pub fn validate_html(html: &str) -> Result<(), PrintError> {
    if html.trim().is_empty() {
        return Err(PrintError::EmptyHtml);
    }
    if html.len() > MAX_HTML_BYTES {
        return Err(PrintError::HtmlTooLarge { bytes: html.len() });
    }
    Ok(())
}

/// Pages waiting for their print window, by job id. Each is handed out once.
#[derive(Default)]
pub struct PrintJobs {
    next_id: AtomicU64,
    pages: Mutex<HashMap<u64, String>>,
}

impl PrintJobs {
    fn add(&self, html: String) -> u64 {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed);
        self.lock().insert(id, html);
        id
    }

    fn take(&self, id: u64) -> Option<String> {
        self.lock().remove(&id)
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, HashMap<u64, String>> {
        // A panic while holding the lock leaves the map itself intact.
        self.pages
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
    }
}

fn window_label(id: u64) -> String {
    format!("cv-print-{id}")
}

/// The job's page URL: `bfhr-cv-print://localhost/<id>`; WebView2 serves custom schemes as
/// `http://bfhr-cv-print.localhost/<id>`.
fn page_url(id: u64) -> Url {
    let url = if cfg!(windows) {
        format!("http://{SCHEME}.localhost/{id}")
    } else {
        format!("{SCHEME}://localhost/{id}")
    };
    Url::parse(&url).expect("the print page URL is valid")
}

/// The job id in a page request's path (`/<id>`).
fn job_id(path: &str) -> Option<u64> {
    let id = path.strip_prefix('/')?;
    if id.is_empty() || !id.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    id.parse().ok()
}

/// The `bfhr-cv-print` scheme handler: a job's page, once, to that job's window only.
pub fn serve<R: Runtime>(
    context: &UriSchemeContext<'_, R>,
    request: &Request<Vec<u8>>,
) -> Response<Cow<'static, [u8]>> {
    let page = job_id(request.uri().path())
        .filter(|&id| context.webview_label() == window_label(id))
        .and_then(|id| context.app_handle().state::<PrintJobs>().take(id));
    let builder = Response::builder().header(header::CACHE_CONTROL, "no-store");
    let response = match page {
        Some(html) => builder
            .status(StatusCode::OK)
            .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
            .header(header::CONTENT_SECURITY_POLICY, PAGE_CSP)
            .body(Cow::Owned(html.into_bytes())),
        None => builder
            .status(StatusCode::NOT_FOUND)
            .body(Cow::Borrowed(&[][..])),
    };
    response.expect("static response parts are valid")
}

/// Closes the hidden window and drops a page it never loaded, however printing ends.
struct Job<R: Runtime> {
    app: AppHandle<R>,
    id: u64,
    window: Option<WebviewWindow<R>>,
}

impl<R: Runtime> Drop for Job<R> {
    fn drop(&mut self) {
        if let Some(window) = self.window.take() {
            let _ = window.destroy();
        }
        self.app.state::<PrintJobs>().take(self.id);
    }
}

/// Prints the CV's HTML to a PDF on `paper` and returns the PDF's bytes.
pub async fn print<R: Runtime>(
    app: &AppHandle<R>,
    html: String,
    paper: Paper,
) -> Result<Vec<u8>, PrintError> {
    validate_html(&html)?;
    let directory = tempfile::Builder::new().prefix("bfhr-cv-").tempdir()?;
    let pdf_path: PathBuf = directory.path().join("cv.pdf");

    let id = app.state::<PrintJobs>().add(html);
    let mut job = Job {
        app: app.clone(),
        id,
        window: None,
    };

    let url = page_url(id);
    let (loaded_tx, loaded_rx) = oneshot::channel();
    let loaded_tx = Mutex::new(Some(loaded_tx));
    let (width, height) = paper.css_pixels();
    let window = WebviewWindowBuilder::new(
        app,
        window_label(id),
        WebviewUrl::CustomProtocol(url.clone()),
    )
    .title("BruteForceHR CV")
    .visible(false)
    .focused(false)
    .skip_taskbar(true)
    .inner_size(width, height)
    // The page itself, nothing else: no links, no redirects, no new windows.
    .on_navigation(move |target| *target == url)
    .on_new_window(|_url, _features| NewWindowResponse::Deny)
    .on_page_load(move |_window, payload| {
        if payload.event() == PageLoadEvent::Finished {
            let sender = loaded_tx
                .lock()
                .unwrap_or_else(std::sync::PoisonError::into_inner)
                .take();
            if let Some(sender) = sender {
                let _ = sender.send(());
            }
        }
    })
    .build()?;
    let window = job.window.insert(window);

    match tokio::time::timeout(LOAD_TIMEOUT, loaded_rx).await {
        Ok(Ok(())) => {}
        Ok(Err(_)) | Err(_) => return Err(PrintError::LoadTimedOut),
    }

    let printed = native::print_to_pdf(window, paper, pdf_path.clone())?;
    match tokio::time::timeout(PRINT_TIMEOUT, printed).await {
        Ok(Ok(Ok(()))) => {}
        Ok(Ok(Err(message))) => return Err(PrintError::Print(message)),
        Ok(Err(_)) => return Err(PrintError::Print("the webview dropped the job".to_owned())),
        Err(_) => return Err(PrintError::PrintTimedOut),
    }
    drop(job);

    let pdf = std::fs::read(&pdf_path)?;
    directory.close()?;
    Ok(pdf)
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_HTML_BYTES, Paper, PrintError, PrintJobs, job_id, page_url, validate_html, window_label,
    };

    fn assert_close(actual: (f64, f64), expected: (f64, f64)) {
        assert!(
            (actual.0 - expected.0).abs() < 0.01 && (actual.1 - expected.1).abs() < 0.01,
            "{actual:?} != {expected:?}"
        );
    }

    #[test]
    fn paper_sizes() {
        assert_close(Paper::A4.inches(), (8.2677, 11.6929));
        assert_close(Paper::A4.points(), (595.28, 841.89));
        assert_close(Paper::A4.css_pixels(), (793.70, 1122.52));
        assert_close(Paper::Letter.inches(), (8.5, 11.0));
        assert_close(Paper::Letter.points(), (612.0, 792.0));
        assert_close(Paper::Letter.css_pixels(), (816.0, 1056.0));
    }

    #[test]
    fn paper_deserializes_from_lowercase_names_only() {
        assert_eq!(serde_json::from_str::<Paper>("\"a4\"").unwrap(), Paper::A4);
        assert_eq!(
            serde_json::from_str::<Paper>("\"letter\"").unwrap(),
            Paper::Letter
        );
        for other in ["\"A4\"", "\"legal\"", "\"\"", "4"] {
            assert!(serde_json::from_str::<Paper>(other).is_err(), "{other}");
        }
    }

    #[test]
    fn html_must_be_non_empty_and_bounded() {
        assert!(matches!(validate_html(""), Err(PrintError::EmptyHtml)));
        assert!(matches!(validate_html(" \n\t"), Err(PrintError::EmptyHtml)));
        assert!(validate_html("<!doctype html><p>CV</p>").is_ok());
        assert!(validate_html(&"a".repeat(MAX_HTML_BYTES)).is_ok());
        assert!(matches!(
            validate_html(&"a".repeat(MAX_HTML_BYTES + 1)),
            Err(PrintError::HtmlTooLarge { bytes }) if bytes == MAX_HTML_BYTES + 1
        ));
    }

    #[test]
    fn page_urls_name_their_job() {
        let url = page_url(7);
        if cfg!(windows) {
            assert_eq!(url.as_str(), "http://bfhr-cv-print.localhost/7");
        } else {
            assert_eq!(url.as_str(), "bfhr-cv-print://localhost/7");
        }
        assert_eq!(job_id(url.path()), Some(7));
        assert_eq!(window_label(7), "cv-print-7");
    }

    #[test]
    fn job_ids_are_plain_numbers() {
        assert_eq!(job_id("/0"), Some(0));
        assert_eq!(job_id("/42"), Some(42));
        for path in [
            "",
            "/",
            "42",
            "/+42",
            "/-1",
            "/4 2",
            "/42/",
            "/x",
            "/99999999999999999999",
        ] {
            assert_eq!(job_id(path), None, "{path}");
        }
    }

    #[test]
    fn pages_are_handed_out_once() {
        let jobs = PrintJobs::default();
        let first = jobs.add("<p>one</p>".to_owned());
        let second = jobs.add("<p>two</p>".to_owned());
        assert_ne!(first, second);
        assert_eq!(jobs.take(second).as_deref(), Some("<p>two</p>"));
        assert_eq!(jobs.take(second), None);
        assert_eq!(jobs.take(first).as_deref(), Some("<p>one</p>"));
    }
}
