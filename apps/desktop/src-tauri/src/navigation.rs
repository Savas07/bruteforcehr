//! Keeps the webview on the app's own origin: every navigation to anything else is cancelled.

use url::Url;

/// Origin of the bundled frontend served by Tauri's asset protocol: `tauri://localhost` on macOS
/// and Linux, `http://tauri.localhost` on Windows (WebView2 needs an `http(s)` scheme).
#[cfg(not(windows))]
const ASSET_ORIGIN: (&str, &str) = ("tauri", "localhost");
#[cfg(windows)]
const ASSET_ORIGIN: (&str, &str) = ("http", "tauri.localhost");

/// Whether the main webview may navigate to `url`. With `dev_url` set (`tauri dev`), the Vite dev
/// server's origin is the app; otherwise only the bundled asset origin is.
pub fn is_allowed(url: &Url, dev_url: Option<&Url>) -> bool {
    if let Some(dev_url) = dev_url {
        return url.origin() == dev_url.origin();
    }
    let (scheme, host) = ASSET_ORIGIN;
    url.scheme() == scheme
        && url.host_str() == Some(host)
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

#[cfg(test)]
mod tests {
    use super::{ASSET_ORIGIN, is_allowed};
    use url::Url;

    fn url(input: &str) -> Url {
        Url::parse(input).unwrap()
    }

    #[test]
    fn allows_the_bundled_frontend() {
        let (scheme, host) = ASSET_ORIGIN;
        assert!(is_allowed(
            &url(&format!("{scheme}://{host}/index.html")),
            None
        ));
        assert!(is_allowed(
            &url(&format!("{scheme}://{host}/index.html#/jobs")),
            None
        ));
    }

    #[test]
    fn blocks_other_origins() {
        let (scheme, host) = ASSET_ORIGIN;
        for input in [
            "https://example.com/",
            "https://github.com/",
            "http://localhost:5173/",
            "file:///etc/passwd",
            "about:blank",
            "data:text/html,hi",
        ] {
            assert!(!is_allowed(&url(input), None), "{input}");
        }
        assert!(!is_allowed(&url(&format!("{scheme}://{host}:8080/")), None));
        assert!(!is_allowed(&url(&format!("{scheme}://evil.{host}/")), None));
    }

    #[test]
    fn dev_server_is_the_app_during_development() {
        let dev = url("http://localhost:5173/");
        assert!(is_allowed(
            &url("http://localhost:5173/index.html"),
            Some(&dev)
        ));
        assert!(!is_allowed(&url("http://localhost:5174/"), Some(&dev)));
        assert!(!is_allowed(&url("https://example.com/"), Some(&dev)));
    }
}
