//! The webviews' print-to-PDF APIs. The crate's only `unsafe` code: Tauri hands out the native
//! webview as a raw pointer (macOS) or COM interfaces whose methods are all `unsafe` (Windows), and
//! no safe wrapper for printing exists. Each block states why it is sound.
#![allow(unsafe_code)]

use std::path::PathBuf;

use tauri::{Runtime, WebviewWindow};
use tokio::sync::oneshot;

use super::{Paper, PrintError};

/// Resolves when the PDF is written to `path` (or printing failed).
pub type Printed = oneshot::Receiver<Result<(), String>>;

/// Prints the window's loaded page to a PDF at `path`, one `paper` page after another, without
/// margins of its own (the page's `@page` rules have them), headers or footers.
#[cfg(target_os = "macos")]
pub fn print_to_pdf<R: Runtime>(
    window: &WebviewWindow<R>,
    paper: Paper,
    path: PathBuf,
) -> Result<Printed, PrintError> {
    let (sender, receiver) = oneshot::channel();
    window.with_webview(move |webview| {
        // SAFETY: `inner()` and `ns_window()` are this window's live WKWebView (wry's `webview`
        // field, a `WKWebView` subclass) and its NSWindow; `with_webview` runs this closure on the
        // main thread while the window exists, and the references do not outlive the closure.
        let (wk_webview, ns_window) = unsafe {
            (
                &*webview.inner().cast::<objc2_web_kit::WKWebView>(),
                &*webview.ns_window().cast::<objc2_app_kit::NSWindow>(),
            )
        };
        macos::print(wk_webview, ns_window, paper, &path, sender);
    })?;
    Ok(receiver)
}

#[cfg(target_os = "macos")]
mod macos {
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::path::Path;

    use objc2::rc::Retained;
    use objc2::runtime::{Bool, NSObject};
    use objc2::{DefinedClass, MainThreadMarker, MainThreadOnly, define_class, msg_send, sel};
    use objc2_app_kit::{
        NSPaperOrientation, NSPrintHeaderAndFooter, NSPrintInfo, NSPrintJobSavingURL,
        NSPrintOperation, NSPrintSaveJob, NSPrintingPaginationMode, NSWindow,
    };
    use objc2_foundation::{NSNumber, NSSize, NSURL};
    use objc2_web_kit::WKWebView;
    use tokio::sync::oneshot;

    use super::Paper;

    type Reply = oneshot::Sender<Result<(), String>>;

    struct Ivars {
        reply: RefCell<Option<Reply>>,
    }

    define_class!(
        // SAFETY: NSObject has no subclassing requirements, and `PrintDelegate` does not
        // implement `Drop`.
        #[unsafe(super(NSObject))]
        #[thread_kind = MainThreadOnly]
        #[name = "BFHRCvPrintDelegate"]
        #[ivars = Ivars]
        struct PrintDelegate;

        impl PrintDelegate {
            /// `didRunSelector` of `runOperationModalForWindow:…`; AppKit calls it once, on the
            /// main thread, when the operation has finished.
            #[unsafe(method(printOperationDidRun:success:contextInfo:))]
            fn did_run(&self, _operation: &NSPrintOperation, success: Bool, context: *mut c_void) {
                if let Some(reply) = self.ivars().reply.borrow_mut().take() {
                    let _ = reply.send(if success.as_bool() {
                        Ok(())
                    } else {
                        Err("the print operation did not finish".to_owned())
                    });
                }
                // SAFETY: `context` is the strong reference `print` leaked to keep this delegate
                // alive (AppKit doesn't retain it), and AppKit calls this method once. It is
                // autoreleased, not released, so `self` stays valid until AppKit is done with it.
                let this = unsafe { Retained::from_raw(context.cast::<Self>()) };
                let _ = this.map(Retained::autorelease_ptr);
            }
        }
    );

    impl PrintDelegate {
        fn new(mtm: MainThreadMarker, reply: Reply) -> Retained<Self> {
            let this = Self::alloc(mtm).set_ivars(Ivars {
                reply: RefCell::new(Some(reply)),
            });
            // SAFETY: NSObject's designated initialiser, on a freshly allocated instance.
            unsafe { msg_send![super(this), init] }
        }
    }

    fn print_info(paper: Paper, path: &Path) -> Result<Retained<NSPrintInfo>, &'static str> {
        let url = NSURL::from_file_path(path).ok_or("the PDF path is not absolute")?;
        let (width, height) = paper.points();
        let info = NSPrintInfo::new();
        info.setPaperSize(NSSize::new(width, height));
        info.setOrientation(NSPaperOrientation::Portrait);
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        info.setHorizontallyCentered(false);
        info.setVerticallyCentered(false);
        info.setHorizontalPagination(NSPrintingPaginationMode::Fit);
        info.setVerticalPagination(NSPrintingPaginationMode::Automatic);
        // SAFETY: the extern statics are AppKit's constant keys and values, valid for the
        // process's lifetime. `dictionary()` is the info's mutable attribute dictionary; the
        // values are the types AppKit documents for the keys (`NSURL`, `NSNumber`).
        unsafe {
            info.setJobDisposition(NSPrintSaveJob);
            let attributes = info.dictionary();
            attributes.insert(NSPrintJobSavingURL, &*url);
            attributes.insert(NSPrintHeaderAndFooter, &*NSNumber::new_bool(false));
        }
        Ok(info)
    }

    /// Runs `WKWebView`'s print operation, saving to `path`, and answers on `reply` when it is done.
    /// It runs window-modal (no panels are shown): `WebKit` draws the pages asynchronously, so a
    /// blocking `runOperation` would wait for itself on the main thread.
    pub fn print(webview: &WKWebView, window: &NSWindow, paper: Paper, path: &Path, reply: Reply) {
        let Some(mtm) = MainThreadMarker::new() else {
            let _ = reply.send(Err("not on the main thread".to_owned()));
            return;
        };
        let info = match print_info(paper, path) {
            Ok(info) => info,
            Err(message) => {
                let _ = reply.send(Err(message.to_owned()));
                return;
            }
        };

        // SAFETY: `configuration()` and `preferences()` return the webview's live objects;
        // `setShouldPrintBackgrounds:` exists from macOS 13.3, so older systems (which print
        // without backgrounds) never get the message.
        unsafe {
            if objc2::available!(macos = 13.3) {
                webview
                    .configuration()
                    .preferences()
                    .setShouldPrintBackgrounds(true);
            }
        }

        // SAFETY: a message to the live WKWebView with a fully initialised NSPrintInfo, on the
        // main thread.
        let operation = unsafe { webview.printOperationWithPrintInfo(&info) };
        operation.setShowsPrintPanel(false);
        operation.setShowsProgressPanel(false);
        // WebKit's printing view starts with an empty frame, which prints blank pages.
        if let Some(view) = operation.view() {
            view.setFrame(webview.frame());
        }

        let delegate = PrintDelegate::new(mtm, reply);
        let context = Retained::into_raw(delegate.clone()).cast::<c_void>();
        // SAFETY: `delegate` implements the selector with the signature AppKit calls it with
        // (`printOperationDidRun:success:contextInfo:`); `context` is a strong reference to it
        // that the callback reclaims, so it outlives the operation.
        unsafe {
            operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                window,
                Some(&delegate),
                Some(sel!(printOperationDidRun:success:contextInfo:)),
                context,
            );
        }
    }
}

/// Prints the window's loaded page to a PDF at `path`, one `paper` page after another, without
/// margins of its own (the page's `@page` rules have them), headers or footers.
#[cfg(windows)]
pub fn print_to_pdf<R: Runtime>(
    window: &WebviewWindow<R>,
    paper: Paper,
    path: PathBuf,
) -> Result<Printed, PrintError> {
    use std::cell::RefCell;
    use std::rc::Rc;

    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT, ICoreWebView2_7, ICoreWebView2Environment6,
    };
    use webview2_com::PrintToPdfCompletedHandler;
    use windows_core::{HSTRING, Interface};

    let (sender, receiver) = oneshot::channel();
    window.with_webview(move |webview| {
        // Settled by whichever comes first: a failed call here or the completion handler.
        let sender = Rc::new(RefCell::new(Some(sender)));
        let reply = {
            let sender = Rc::clone(&sender);
            move |result: Result<(), String>| {
                if let Some(sender) = sender.borrow_mut().take() {
                    let _ = sender.send(result);
                }
            }
        };
        let completed = {
            let reply = reply.clone();
            PrintToPdfCompletedHandler::create(Box::new(move |result, written| {
                reply(match result {
                    Ok(()) if written => Ok(()),
                    Ok(()) => Err("WebView2 did not write the PDF".to_owned()),
                    Err(error) => Err(error.to_string()),
                });
                Ok(())
            }))
        };
        let (width, height) = paper.inches();
        // SAFETY: COM calls on the live controller and environment Tauri hands out, made on the
        // UI thread `with_webview` runs this closure on; every interface is reference-counted by
        // its windows-rs wrapper, and `PrintToPdf` copies the path string before returning.
        let started = unsafe {
            (|| -> windows_core::Result<()> {
                let core = webview
                    .controller()
                    .CoreWebView2()?
                    .cast::<ICoreWebView2_7>()?;
                let environment = webview.environment().cast::<ICoreWebView2Environment6>()?;
                let settings = environment.CreatePrintSettings()?;
                settings.SetOrientation(COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT)?;
                settings.SetPageWidth(width)?;
                settings.SetPageHeight(height)?;
                settings.SetMarginTop(0.0)?;
                settings.SetMarginBottom(0.0)?;
                settings.SetMarginLeft(0.0)?;
                settings.SetMarginRight(0.0)?;
                settings.SetScaleFactor(1.0)?;
                settings.SetShouldPrintBackgrounds(true)?;
                settings.SetShouldPrintHeaderAndFooter(false)?;
                settings.SetShouldPrintSelectionOnly(false)?;
                core.PrintToPdf(&HSTRING::from(path.as_os_str()), &settings, &completed)
            })()
        };
        if let Err(error) = started {
            reply(Err(error.to_string()));
        }
    })?;
    Ok(receiver)
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn print_to_pdf<R: Runtime>(
    _window: &WebviewWindow<R>,
    _paper: Paper,
    _path: PathBuf,
) -> Result<Printed, PrintError> {
    Err(PrintError::Print(
        "PDF export is available on macOS and Windows".to_owned(),
    ))
}
