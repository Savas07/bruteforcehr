//! The external-apply kit's files (research/apply.md "External channel: kit in the panel"): the CV
//! and cover letter PDFs are saved to `Downloads/BruteForceHR`, where the employer's upload dialog
//! finds them, and the kit opens them, shows them in Finder / Explorer, or copies their path.
//!
//! Saving takes the PDF's bytes as the raw IPC request body and its file name as a header, like
//! `save_export` (`src/export_file.rs`), but asks nothing: the folder is fixed. Opening and revealing
//! accept only PDFs directly in that folder, so the UI can't open arbitrary files. In E2E builds
//! the folder is `$BFHR_E2E_EXPORT_DIR/kit`, and opening or revealing appends a line to
//! `opened-files.txt` there instead of launching another app.

use std::fmt;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

/// The kit's folder inside the user's Downloads.
pub const KIT_FOLDER: &str = "BruteForceHR";

#[derive(Debug)]
pub enum KitFileError {
    /// The Downloads folder is unknown (no home directory).
    NoFolder(String),
    /// The path is not a PDF directly in the kit folder (or doesn't exist).
    NotInKit,
    /// Writing the file failed.
    Write(std::io::Error),
    /// The system couldn't open or reveal the file.
    Open(String),
}

impl fmt::Display for KitFileError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NoFolder(message) => write!(f, "the Downloads folder is unknown: {message}"),
            Self::NotInKit => f.write_str("the file is not a PDF in the application kit folder"),
            Self::Write(error) => write!(f, "the file could not be written: {error}"),
            Self::Open(message) => write!(f, "the file could not be opened: {message}"),
        }
    }
}

/// `Downloads/BruteForceHR` (E2E builds: `$BFHR_E2E_EXPORT_DIR/kit`); not created here.
pub fn folder<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, KitFileError> {
    #[cfg(feature = "e2e")]
    if let Some(directory) = std::env::var_os("BFHR_E2E_EXPORT_DIR") {
        return Ok(PathBuf::from(directory).join("kit"));
    }
    app.path()
        .download_dir()
        .map(|downloads| downloads.join(KIT_FOLDER))
        .map_err(|error| KitFileError::NoFolder(error.to_string()))
}

/// Writes `bytes` to `directory/file_name` (replacing an earlier copy) and returns the path. The
/// name is validated by the caller (`export_file::file_name_from_headers`).
pub fn save(directory: &Path, file_name: &str, bytes: &[u8]) -> Result<PathBuf, KitFileError> {
    std::fs::create_dir_all(directory).map_err(KitFileError::Write)?;
    let path = directory.join(file_name);
    std::fs::write(&path, bytes).map_err(KitFileError::Write)?;
    Ok(path)
}

/// `path` resolved, if it is an existing `.pdf` directly inside `directory`.
pub fn checked(directory: &Path, path: &str) -> Result<PathBuf, KitFileError> {
    let file = Path::new(path)
        .canonicalize()
        .map_err(|_| KitFileError::NotInKit)?;
    let directory = directory
        .canonicalize()
        .map_err(|_| KitFileError::NotInKit)?;
    let is_pdf = file
        .extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("pdf"));
    if file.parent() != Some(directory.as_path()) || !is_pdf || !file.is_file() {
        return Err(KitFileError::NotInKit);
    }
    Ok(file)
}

/// What the kit does with a file.
#[derive(Debug, Clone, Copy)]
pub enum KitAction {
    /// Opens it in the default PDF app.
    Open,
    /// Shows it selected in Finder / Explorer.
    Reveal,
}

/// Opens or reveals a file [`checked`] to be in the kit folder.
pub fn run<R: Runtime>(
    app: &AppHandle<R>,
    action: KitAction,
    file: &Path,
) -> Result<(), KitFileError> {
    // E2E builds only: another app taking focus would break the specs' key presses.
    #[cfg(feature = "e2e")]
    if std::env::var_os("BFHR_E2E_EXPORT_DIR").is_some() {
        use std::io::Write;
        let directory = folder(app)?;
        let mut log = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(directory.join("opened-files.txt"))
            .map_err(KitFileError::Write)?;
        return writeln!(log, "{action:?} {}", file.display()).map_err(KitFileError::Write);
    }
    let opener = app.opener();
    match action {
        KitAction::Open => opener.open_path(file.to_string_lossy(), None::<&str>),
        KitAction::Reveal => opener.reveal_item_in_dir(file),
    }
    .map_err(|error| KitFileError::Open(error.to_string()))
}

#[cfg(test)]
mod tests {
    use super::{KitFileError, checked, save};

    #[test]
    fn saves_into_the_folder_and_replaces_earlier_copies() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("BruteForceHR");
        let path = save(&directory, "Deniz-Aksoy-CV-Acme.pdf", b"%PDF-1").unwrap();
        assert_eq!(path, directory.join("Deniz-Aksoy-CV-Acme.pdf"));
        save(&directory, "Deniz-Aksoy-CV-Acme.pdf", b"%PDF-2").unwrap();
        assert_eq!(std::fs::read(&path).unwrap(), b"%PDF-2");
    }

    #[test]
    fn opens_only_pdfs_directly_in_the_folder() {
        let root = tempfile::tempdir().unwrap();
        let directory = root.path().join("BruteForceHR");
        let pdf = save(&directory, "cv.pdf", b"%PDF").unwrap();
        assert_eq!(
            checked(&directory, pdf.to_str().unwrap()).unwrap(),
            pdf.canonicalize().unwrap()
        );

        let other = save(&directory, "notes.txt.PDF", b"%PDF").unwrap();
        assert!(checked(&directory, other.to_str().unwrap()).is_ok());

        let text = directory.join("notes.txt");
        std::fs::write(&text, b"hello").unwrap();
        let nested = save(&directory.join("inner"), "cv.pdf", b"%PDF").unwrap();
        let outside = save(root.path(), "cv.pdf", b"%PDF").unwrap();
        let escaping = directory.join("..").join("cv.pdf");
        for path in [
            text,
            nested,
            outside,
            escaping,
            directory.join("missing.pdf"),
            directory.clone(),
        ] {
            assert!(
                matches!(
                    checked(&directory, path.to_str().unwrap()),
                    Err(KitFileError::NotInKit)
                ),
                "{}",
                path.display()
            );
        }
    }
}
