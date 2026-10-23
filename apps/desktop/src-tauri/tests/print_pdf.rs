//! Prints a two-page CV page with the real OS webview (`src/cv_pdf.rs`) on A4 and Letter and checks
//! the PDFs: one page per sheet, the paper's size. A Tauri app needs the main thread, so this test
//! has its own `main` (`harness = false` in Cargo.toml). Set `BFHR_PRINT_PDF_OUT` to a directory
//! to keep the PDFs (`pdftotext -layout` shows their text).

#[allow(
    dead_code,
    unused_imports,
    reason = "the app's commands and the module's unit tests use the rest"
)]
#[path = "../src/cv_pdf.rs"]
mod cv_pdf;

use std::process::ExitCode;

use cv_pdf::Paper;
use tauri::{AppHandle, RunEvent, Wry};

/// Two sheets: the text overflows the first; `@page` margins, a background band.
const SAMPLE: &str = r#"<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Ada Lovelace — CV</title>
<style>
  @page { margin: 18mm 16mm; }
  body { font: 11pt/1.4 Georgia, serif; margin: 0; }
  h1 { font-size: 20pt; margin: 0 0 6pt; }
  .band { background: #1f4fd6; color: #fff; padding: 4pt 6pt; print-color-adjust: exact; }
  p { margin: 0 0 6pt; }
</style>
</head>
<body>
<h1>Ada Lovelace</h1>
<p class="band">Analyst, Analytical Engines</p>
PARAGRAPHS
<p id="last">Final line on page two.</p>
</body>
</html>
"#;

fn sample_html() -> String {
    let paragraph = "<p>Wrote the first published algorithm intended for a machine, translated \
                     Menabrea's memoir and added notes three times its length.</p>\n";
    // About one and a half pages of text on both papers (a sheet holds 15–18 of these).
    SAMPLE.replace("PARAGRAPHS", &paragraph.repeat(25))
}

/// The number of page objects (`/Type /Page`, not `/Pages`) in a PDF.
fn page_count(pdf: &[u8]) -> usize {
    let needle = b"/Type /Page";
    let compact = b"/Type/Page";
    let count = |needle: &[u8]| {
        pdf.windows(needle.len() + 1)
            .filter(|window| window.starts_with(needle) && window[needle.len()] != b's')
            .count()
    };
    count(needle) + count(compact)
}

/// The first `/MediaBox [x y width height]` in a PDF.
fn media_box(pdf: &[u8]) -> Option<(f64, f64)> {
    let text = String::from_utf8_lossy(pdf);
    let start = text.find("/MediaBox")? + "/MediaBox".len();
    let rest = text[start..].trim_start().strip_prefix('[')?;
    let numbers: Vec<f64> = rest[..rest.find(']')?]
        .split_whitespace()
        .map(str::parse)
        .collect::<Result<_, _>>()
        .ok()?;
    match numbers[..] {
        [x0, y0, x1, y1] => Some((x1 - x0, y1 - y0)),
        _ => None,
    }
}

async fn print_and_check(app: &AppHandle<Wry>, paper: Paper) -> Result<(), String> {
    let pdf = cv_pdf::print(app, sample_html(), paper)
        .await
        .map_err(|error| error.to_string())?;
    if let Some(directory) = std::env::var_os("BFHR_PRINT_PDF_OUT") {
        let path = std::path::Path::new(&directory).join(format!("{paper:?}.pdf"));
        std::fs::write(&path, &pdf).map_err(|error| error.to_string())?;
        println!("wrote {}", path.display());
    }
    if !pdf.starts_with(b"%PDF-") {
        return Err(format!("{paper:?}: not a PDF"));
    }
    let pages = page_count(&pdf);
    if pages != 2 {
        return Err(format!("{paper:?}: {pages} pages, expected 2"));
    }
    let (width, height) = media_box(&pdf).ok_or(format!("{paper:?}: no MediaBox"))?;
    let (expected_width, expected_height) = paper.points();
    if (width - expected_width).abs() > 1.0 || (height - expected_height).abs() > 1.0 {
        return Err(format!(
            "{paper:?}: page is {width}×{height} pt, expected {expected_width}×{expected_height}"
        ));
    }
    println!(
        "{paper:?}: {pages} pages of {width}×{height} pt, {} bytes",
        pdf.len()
    );
    Ok(())
}

fn main() -> ExitCode {
    if !cfg!(any(target_os = "macos", windows)) {
        println!("print_pdf: skipped, PDF export runs on macOS and Windows only");
        return ExitCode::SUCCESS;
    }

    let app = tauri::Builder::default()
        .manage(cv_pdf::PrintJobs::default())
        .register_uri_scheme_protocol(cv_pdf::SCHEME, |context, request| {
            cv_pdf::serve(&context, &request)
        })
        .build(tauri::generate_context!())
        .expect("the test app builds");
    let code = app.run_return(|app, event| match event {
        RunEvent::Ready => {
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                let mut failed = false;
                for paper in [Paper::A4, Paper::Letter] {
                    if let Err(error) = print_and_check(&app, paper).await {
                        eprintln!("print_pdf: {error}");
                        failed = true;
                    }
                }
                app.exit(i32::from(failed));
            });
        }
        // Closing a print window (the only window) must not end the test early.
        RunEvent::ExitRequested {
            code: None, api, ..
        } => api.prevent_exit(),
        _ => {}
    });
    if code == 0 {
        ExitCode::SUCCESS
    } else {
        ExitCode::FAILURE
    }
}
