//! Saving an exported file (CV as PDF, DOCX or JSON Resume; interviews as an iCalendar file;
//! applications as CSV): the native Save dialog, then the file.
//!
//! The bytes arrive as the raw IPC request body; the suggested file name and the kind arrive as
//! headers (src/lib/cvExport.ts). In E2E builds, `BFHR_E2E_EXPORT_DIR` replaces the dialog.

use std::borrow::Cow;
use std::fmt;
use std::path::PathBuf;

use percent_encoding::percent_decode_str;
use serde::Deserialize;
use tauri::http::HeaderMap;
use tauri::ipc::InvokeBody;
use tauri::{Runtime, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::oneshot;

/// The suggested file name, percent-encoded (`encodeURIComponent`).
pub const FILE_NAME_HEADER: &str = "bfhr-file-name";
/// `pdf`, `docx`, `json`, `ics` or `csv`.
pub const KIND_HEADER: &str = "bfhr-export-kind";

/// Upper bound for an exported file; CVs are well below 1 MB.
pub const MAX_EXPORT_BYTES: usize = 64 * 1024 * 1024;

/// File names most file systems accept (NTFS, APFS: 255).
const MAX_FILE_NAME_BYTES: usize = 255;

/// Windows device names, refused as file names with any extension (`CON.pdf`).
const RESERVED_NAMES: [&str; 22] = [
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExportKind {
    Pdf,
    Docx,
    Json,
    /// iCalendar (RFC 5545) interview events.
    Ics,
    /// Applications as a spreadsheet (Tracker table export).
    Csv,
}

impl ExportKind {
    fn from_name(name: &str) -> Option<Self> {
        match name {
            "pdf" => Some(Self::Pdf),
            "docx" => Some(Self::Docx),
            "json" => Some(Self::Json),
            "ics" => Some(Self::Ics),
            "csv" => Some(Self::Csv),
            _ => None,
        }
    }

    pub fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Docx => "docx",
            Self::Json => "json",
            Self::Ics => "ics",
            Self::Csv => "csv",
        }
    }

    /// The Save dialog's file-type filter (Windows shows it as "PDF (*.pdf)").
    fn filter_name(self) -> &'static str {
        match self {
            Self::Pdf => "PDF",
            Self::Docx => "Word (DOCX)",
            Self::Json => "JSON Resume",
            Self::Ics => "iCalendar",
            Self::Csv => "CSV",
        }
    }
}

#[derive(Debug)]
pub enum ExportError {
    /// The request body is not the file's bytes.
    NotBytes,
    /// The file is empty.
    Empty,
    /// The file is larger than [`MAX_EXPORT_BYTES`].
    TooLarge { bytes: usize },
    /// The kind header is missing or not `pdf`, `docx`, `json`, `ics` or `csv`.
    InvalidKind,
    /// The suggested file name is missing or not a plain file name with the kind's extension.
    InvalidFileName(&'static str),
    /// The dialog closed without an answer or returned something that is not a path.
    Dialog(String),
    /// Writing the file failed.
    Write(std::io::Error),
}

impl fmt::Display for ExportError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotBytes => f.write_str("the request body must be the file's bytes"),
            Self::Empty => f.write_str("the file is empty"),
            Self::TooLarge { bytes } => write!(
                f,
                "the file is {bytes} bytes; at most {MAX_EXPORT_BYTES} are accepted"
            ),
            Self::InvalidKind => f.write_str("the export kind must be pdf, docx, json, ics or csv"),
            Self::InvalidFileName(reason) => write!(f, "the file name {reason}"),
            Self::Dialog(message) => write!(f, "the Save dialog failed: {message}"),
            Self::Write(error) => write!(f, "the file could not be written: {error}"),
        }
    }
}

/// The export kind from its header.
pub fn kind_from_headers(headers: &HeaderMap) -> Result<ExportKind, ExportError> {
    headers
        .get(KIND_HEADER)
        .and_then(|value| value.to_str().ok())
        .and_then(ExportKind::from_name)
        .ok_or(ExportError::InvalidKind)
}

/// The suggested file name from its percent-encoded header, checked by [`validate_file_name`].
pub fn file_name_from_headers(
    headers: &HeaderMap,
    kind: ExportKind,
) -> Result<String, ExportError> {
    let encoded = headers
        .get(FILE_NAME_HEADER)
        .and_then(|value| value.to_str().ok())
        .ok_or(ExportError::InvalidFileName("is missing"))?;
    let name = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| ExportError::InvalidFileName("is not UTF-8"))?
        .into_owned();
    validate_file_name(&name, kind)?;
    Ok(name)
}

/// A plain file name (no directories, nothing Windows or macOS refuses) ending in the kind's
/// extension: the dialog's suggestion, and the file E2E builds write.
pub fn validate_file_name(name: &str, kind: ExportKind) -> Result<(), ExportError> {
    if name.is_empty() {
        return Err(ExportError::InvalidFileName("is empty"));
    }
    if name.len() > MAX_FILE_NAME_BYTES {
        return Err(ExportError::InvalidFileName("is too long"));
    }
    if name.chars().any(|c| {
        c.is_control() || matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')
    }) {
        return Err(ExportError::InvalidFileName(
            "contains a path separator or a character file systems refuse",
        ));
    }
    if name.starts_with('.') || name.ends_with('.') || name.ends_with(' ') {
        return Err(ExportError::InvalidFileName(
            "starts with a dot or ends with a dot or space",
        ));
    }
    let Some((stem, extension)) = name.rsplit_once('.') else {
        return Err(ExportError::InvalidFileName("has no extension"));
    };
    if !extension.eq_ignore_ascii_case(kind.extension()) {
        return Err(ExportError::InvalidFileName(
            "does not end with the export's extension",
        ));
    }
    let device = stem.split('.').next().unwrap_or(stem).trim_end();
    if RESERVED_NAMES
        .iter()
        .any(|reserved| device.eq_ignore_ascii_case(reserved))
    {
        return Err(ExportError::InvalidFileName("is a reserved device name"));
    }
    Ok(())
}

/// The file's bytes from the request body, checked for size. They arrive raw, or (when the IPC
/// custom protocol is unavailable and Tauri falls back to `postMessage`) as a JSON array.
pub fn body_bytes(body: &InvokeBody) -> Result<Cow<'_, [u8]>, ExportError> {
    let bytes = match body {
        InvokeBody::Raw(bytes) => Cow::Borrowed(bytes.as_slice()),
        InvokeBody::Json(value) => {
            Cow::Owned(Vec::<u8>::deserialize(value).map_err(|_| ExportError::NotBytes)?)
        }
    };
    if bytes.is_empty() {
        return Err(ExportError::Empty);
    }
    if bytes.len() > MAX_EXPORT_BYTES {
        return Err(ExportError::TooLarge { bytes: bytes.len() });
    }
    Ok(bytes)
}

/// Asks where to save the file (the Save dialog, attached to `window`, suggesting `file_name`
/// and filtered to the kind), writes it there and returns the path; `None` when cancelled.
/// Arguments are validated by the caller ([`body_bytes`], [`file_name_from_headers`]).
pub async fn save<R: Runtime>(
    window: &WebviewWindow<R>,
    bytes: &[u8],
    file_name: &str,
    kind: ExportKind,
) -> Result<Option<PathBuf>, ExportError> {
    // E2E builds only: no native dialog for the tests to drive; the file lands in a known folder.
    #[cfg(feature = "e2e")]
    if let Some(directory) = std::env::var_os("BFHR_E2E_EXPORT_DIR") {
        // CI names the folder but doesn't create it.
        let directory = PathBuf::from(directory);
        std::fs::create_dir_all(&directory).map_err(ExportError::Write)?;
        let path = directory.join(file_name);
        std::fs::write(&path, bytes).map_err(ExportError::Write)?;
        return Ok(Some(path));
    }

    let (chosen_tx, chosen_rx) = oneshot::channel();
    window
        .dialog()
        .file()
        .set_parent(window)
        .set_file_name(file_name)
        .add_filter(kind.filter_name(), &[kind.extension()])
        .set_can_create_directories(true)
        .save_file(move |path| {
            let _ = chosen_tx.send(path);
        });
    let chosen = chosen_rx
        .await
        .map_err(|_| ExportError::Dialog("it closed without an answer".to_owned()))?;
    let Some(chosen) = chosen else {
        return Ok(None);
    };
    let path = chosen
        .into_path()
        .map_err(|error| ExportError::Dialog(error.to_string()))?;
    std::fs::write(&path, bytes).map_err(ExportError::Write)?;
    Ok(Some(path))
}

#[cfg(test)]
mod tests {
    use super::{
        ExportError, ExportKind, FILE_NAME_HEADER, KIND_HEADER, MAX_EXPORT_BYTES, body_bytes,
        file_name_from_headers, kind_from_headers, validate_file_name,
    };
    use serde_json::json;
    use tauri::http::{HeaderMap, HeaderValue};
    use tauri::ipc::InvokeBody;

    fn headers(pairs: &[(&'static str, &'static str)]) -> HeaderMap {
        pairs
            .iter()
            .map(|(name, value)| (name.parse().unwrap(), HeaderValue::from_static(value)))
            .collect()
    }

    #[test]
    fn kinds_have_their_extensions() {
        for (name, kind) in [
            ("pdf", ExportKind::Pdf),
            ("docx", ExportKind::Docx),
            ("json", ExportKind::Json),
            ("ics", ExportKind::Ics),
            ("csv", ExportKind::Csv),
        ] {
            assert_eq!(kind.extension(), name);
            assert_eq!(
                kind_from_headers(&headers(&[(KIND_HEADER, name)])).unwrap(),
                kind
            );
        }
        for bad in ["", "PDF", "html", "pdf "] {
            assert!(matches!(
                kind_from_headers(&headers(&[(KIND_HEADER, bad)])),
                Err(ExportError::InvalidKind)
            ));
        }
        assert!(matches!(
            kind_from_headers(&HeaderMap::new()),
            Err(ExportError::InvalidKind)
        ));
    }

    #[test]
    fn file_names_are_percent_decoded() {
        let decoded = file_name_from_headers(
            &headers(&[(FILE_NAME_HEADER, "%C5%9Eule-Y%C4%B1lmaz-CV-Acme%20GmbH.pdf")]),
            ExportKind::Pdf,
        )
        .unwrap();
        assert_eq!(decoded, "Şule-Yılmaz-CV-Acme GmbH.pdf");
        for (encoded, reason) in [
            ("%FF.pdf", "is not UTF-8"),
            (
                "..%2Fsecret.pdf",
                "contains a path separator or a character file systems refuse",
            ),
        ] {
            assert!(matches!(
                file_name_from_headers(&headers(&[(FILE_NAME_HEADER, encoded)]), ExportKind::Pdf),
                Err(ExportError::InvalidFileName(actual)) if actual == reason
            ));
        }
        assert!(matches!(
            file_name_from_headers(&HeaderMap::new(), ExportKind::Pdf),
            Err(ExportError::InvalidFileName("is missing"))
        ));
    }

    #[test]
    fn file_names_are_plain_and_match_the_kind() {
        for (name, kind) in [
            ("Ada-Lovelace-CV.pdf", ExportKind::Pdf),
            (
                "Ada-Lovelace-CV-Analytical Engines Ltd.PDF",
                ExportKind::Pdf,
            ),
            ("Ada-Lovelace-CV.docx", ExportKind::Docx),
            ("Ada-Lovelace-CV.json", ExportKind::Json),
            ("Interview-Acme-Round 2.ics", ExportKind::Ics),
            ("BruteForceHR-applications-2026-10-23.csv", ExportKind::Csv),
            ("Console.pdf", ExportKind::Pdf),
        ] {
            assert!(validate_file_name(name, kind).is_ok(), "{name}");
        }
        for (name, kind) in [
            ("", ExportKind::Pdf),
            ("cv", ExportKind::Pdf),
            ("cv.docx", ExportKind::Pdf),
            ("cv.pdf", ExportKind::Json),
            ("interview.csv", ExportKind::Ics),
            ("../cv.pdf", ExportKind::Pdf),
            ("dir/cv.pdf", ExportKind::Pdf),
            ("dir\\cv.pdf", ExportKind::Pdf),
            ("C:cv.pdf", ExportKind::Pdf),
            ("cv?.pdf", ExportKind::Pdf),
            ("cv\n.pdf", ExportKind::Pdf),
            (".pdf", ExportKind::Pdf),
            ("cv.pdf.", ExportKind::Pdf),
            ("cv.pdf ", ExportKind::Pdf),
            ("CON.pdf", ExportKind::Pdf),
            ("lpt1.tar.pdf", ExportKind::Pdf),
        ] {
            assert!(validate_file_name(name, kind).is_err(), "{name:?}");
        }
        let long = format!("{}.pdf", "a".repeat(252));
        assert!(validate_file_name(&long, ExportKind::Pdf).is_err());
        let longest = format!("{}.pdf", "a".repeat(251));
        assert!(validate_file_name(&longest, ExportKind::Pdf).is_ok());
    }

    #[test]
    fn bodies_are_non_empty_bounded_bytes() {
        let raw = InvokeBody::Raw(b"%PDF-1.7".to_vec());
        assert_eq!(body_bytes(&raw).unwrap().as_ref(), b"%PDF-1.7");
        let json = InvokeBody::Json(json!([37, 80, 68, 70]));
        assert_eq!(body_bytes(&json).unwrap().as_ref(), b"%PDF");
        assert!(matches!(
            body_bytes(&InvokeBody::Raw(Vec::new())),
            Err(ExportError::Empty)
        ));
        assert!(matches!(
            body_bytes(&InvokeBody::Raw(vec![0; MAX_EXPORT_BYTES + 1])),
            Err(ExportError::TooLarge { .. })
        ));
        for value in [
            json!({ "bytes": [1] }),
            json!([256]),
            json!("%PDF"),
            json!(null),
        ] {
            assert!(matches!(
                body_bytes(&InvokeBody::Json(value)),
                Err(ExportError::NotBytes)
            ));
        }
    }
}
