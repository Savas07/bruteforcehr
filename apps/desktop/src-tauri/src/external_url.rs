//! Allowlist for URLs the app may hand to the default browser.

use std::fmt;

use url::{Host, Url};

/// Hosts `open_external` may open: the product website, GitHub (releases, support issues) and
/// the account pages where mail providers create app passwords (`IMAP_PRESETS[].appPasswordUrl`
/// in packages/core/src/mail/connect.ts, the connect dialog's help card). Exact matches only;
/// subdomains are not included.
pub const ALLOWED_HOSTS: [&str; 8] = [
    "bruteforcehr.web.app",
    "github.com",
    "myaccount.google.com",
    "account.apple.com",
    "login.yahoo.com",
    "id.yandex.com",
    "www.gmx.net",
    "web.de",
];

/// Longer inputs are rejected before parsing.
const MAX_LENGTH: usize = 2048;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalUrlError {
    TooLong,
    Invalid,
    NotHttps,
    HasCredentials,
    HasPort,
    HostNotAllowed,
}

impl fmt::Display for ExternalUrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLong => "URL is too long",
            Self::Invalid => "URL could not be parsed",
            Self::NotHttps => "only https URLs can be opened",
            Self::HasCredentials => "URLs with credentials can't be opened",
            Self::HasPort => "URLs with an explicit port can't be opened",
            Self::HostNotAllowed => "this host is not on the allowlist",
        })
    }
}

impl std::error::Error for ExternalUrlError {}

/// Parses `input` and accepts it only as `https://<allowlisted host>/…` without credentials or a
/// non-default port. The returned URL is normalised (lower-case host, punycode, encoded path).
pub fn parse(input: &str) -> Result<Url, ExternalUrlError> {
    if input.len() > MAX_LENGTH {
        return Err(ExternalUrlError::TooLong);
    }
    let url = Url::parse(input).map_err(|_| ExternalUrlError::Invalid)?;
    if url.scheme() != "https" {
        return Err(ExternalUrlError::NotHttps);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(ExternalUrlError::HasCredentials);
    }
    // `port()` is `None` for the scheme's default port, so `https://github.com:443/` passes.
    if url.port().is_some() {
        return Err(ExternalUrlError::HasPort);
    }
    match url.host() {
        Some(Host::Domain(domain)) if ALLOWED_HOSTS.contains(&domain) => Ok(url),
        _ => Err(ExternalUrlError::HostNotAllowed),
    }
}

#[cfg(test)]
mod tests {
    use super::{ExternalUrlError, parse};

    #[test]
    fn accepts_allowlisted_https_urls() {
        for input in [
            "https://bruteforcehr.web.app/",
            "https://bruteforcehr.web.app/privacy?lang=de#data",
            "https://github.com/Savas07/bruteforcehr-releases/issues/new",
            "https://GitHub.com/Savas07",
            "https://github.com:443/Savas07",
            "https://myaccount.google.com/apppasswords",
            "https://account.apple.com/account/manage",
            "https://login.yahoo.com/account/security",
            "https://id.yandex.com/security/app-passwords",
            "https://www.gmx.net/mein-account/",
            "https://web.de/mein-account/",
        ] {
            assert!(parse(input).is_ok(), "{input} should be accepted");
        }
        assert_eq!(
            parse("https://GitHub.com/a").unwrap().as_str(),
            "https://github.com/a"
        );
    }

    #[test]
    fn rejects_everything_else() {
        let cases = [
            ("http://github.com/", ExternalUrlError::NotHttps),
            ("file:///etc/passwd", ExternalUrlError::NotHttps),
            ("javascript:alert(1)", ExternalUrlError::NotHttps),
            ("bruteforcehr://open", ExternalUrlError::NotHttps),
            ("https://example.com/", ExternalUrlError::HostNotAllowed),
            (
                "https://github.com.evil.example/",
                ExternalUrlError::HostNotAllowed,
            ),
            ("https://gist.github.com/", ExternalUrlError::HostNotAllowed),
            ("https://web.app/", ExternalUrlError::HostNotAllowed),
            (
                "https://accounts.google.com/",
                ExternalUrlError::HostNotAllowed,
            ),
            ("https://mail.web.de/", ExternalUrlError::HostNotAllowed),
            ("https://140.82.112.3/", ExternalUrlError::HostNotAllowed),
            (
                "https://user:secret@github.com/",
                ExternalUrlError::HasCredentials,
            ),
            // `github.com` is the username here; the host is evil.example.
            (
                "https://github.com@evil.example/",
                ExternalUrlError::HasCredentials,
            ),
            ("https://github.com:8443/", ExternalUrlError::HasPort),
            ("github.com", ExternalUrlError::Invalid),
            ("", ExternalUrlError::Invalid),
        ];
        for (input, expected) in cases {
            assert_eq!(parse(input), Err(expected), "{input}");
        }
        let long = format!("https://github.com/{}", "a".repeat(2048));
        assert_eq!(parse(&long), Err(ExternalUrlError::TooLong));
    }
}
