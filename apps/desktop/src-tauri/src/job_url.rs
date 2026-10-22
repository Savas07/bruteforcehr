//! Job-posting links the app may hand to the default browser (`open_job_url`): Open original,
//! Apply on company site / board, the "Found on" rows.
//!
//! Job sources (ATS boards, job boards, employer sites) are open-ended, so unlike
//! `external_url` there is no host allowlist. Instead every URL must be a public https web
//! address: no credentials, no IP literals, no local or private-network names, no explicit port.
//! Calls are rate-limited so a compromised page can't spam the browser.
//!
//! M0 limitation: the shell has no Firestore access yet, so it can't check that the URL is one of
//! the user's stored job links. Follow-up (docs/design/foundation-desktop.md "Opening links"):
//! when the data layer lands, accept only URLs found in `users/{uid}/jobs/*` `sources[].url` or
//! `applyUrl`.

use std::collections::VecDeque;
use std::fmt;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use url::{Host, Url};

/// Longer inputs are rejected before parsing.
const MAX_LENGTH: usize = 2048;

/// Names that only resolve on the local machine or network (RFC 6761 / 6762 / 8375, common LAN
/// suffixes). A host equal to one of these or ending in `.<suffix>` is refused.
const LOCAL_SUFFIXES: [&str; 7] = [
    "localhost",
    "local",
    "localdomain",
    "internal",
    "intranet",
    "lan",
    "home.arpa",
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum JobUrlError {
    TooLong,
    Invalid,
    NotHttps,
    HasCredentials,
    HasPort,
    /// An IP address instead of a name.
    IpLiteral,
    /// localhost, `.local`, a single-label name and similar.
    LocalHost,
    RateLimited,
}

impl fmt::Display for JobUrlError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLong => "URL is too long",
            Self::Invalid => "URL could not be parsed",
            Self::NotHttps => "only https URLs can be opened",
            Self::HasCredentials => "URLs with credentials can't be opened",
            Self::HasPort => "URLs with an explicit port can't be opened",
            Self::IpLiteral => "URLs with an IP address can't be opened",
            Self::LocalHost => "local network addresses can't be opened",
            Self::RateLimited => "too many links opened in a short time",
        })
    }
}

impl std::error::Error for JobUrlError {}

/// Accepts `https://<public domain>/…` only. The returned URL is normalised (lower-case host,
/// punycode, encoded path).
pub fn parse(input: &str) -> Result<Url, JobUrlError> {
    if input.len() > MAX_LENGTH {
        return Err(JobUrlError::TooLong);
    }
    let url = Url::parse(input).map_err(|_| JobUrlError::Invalid)?;
    if url.scheme() != "https" {
        return Err(JobUrlError::NotHttps);
    }
    if !url.username().is_empty() || url.password().is_some() {
        return Err(JobUrlError::HasCredentials);
    }
    // `port()` is `None` for the scheme's default port, so `:443` passes.
    if url.port().is_some() {
        return Err(JobUrlError::HasPort);
    }
    // The url crate parses every IPv4 spelling (decimal, hex, octal) of special schemes into
    // `Host::Ipv4`, so `https://2130706433/` lands here too.
    let domain = match url.host() {
        Some(Host::Domain(domain)) => domain.trim_end_matches('.'),
        Some(Host::Ipv4(_) | Host::Ipv6(_)) => return Err(JobUrlError::IpLiteral),
        None => return Err(JobUrlError::Invalid),
    };
    let local = !domain.contains('.')
        || LOCAL_SUFFIXES
            .iter()
            .any(|suffix| domain == *suffix || domain.ends_with(&format!(".{suffix}")));
    if local {
        return Err(JobUrlError::LocalHost);
    }
    Ok(url)
}

/// At most `limit` opens per `window` (sliding).
pub struct RateLimiter {
    limit: usize,
    window: Duration,
    recent: Mutex<VecDeque<Instant>>,
}

impl RateLimiter {
    /// `open_job_url`: 5 links per 10 s, more than a person clicks, too few to flood the browser.
    pub fn for_job_urls() -> Self {
        Self::new(5, Duration::from_secs(10))
    }

    pub fn new(limit: usize, window: Duration) -> Self {
        Self {
            limit,
            window,
            recent: Mutex::new(VecDeque::with_capacity(limit)),
        }
    }

    /// Records an open at `now` if the budget allows it.
    pub fn try_acquire(&self, now: Instant) -> Result<(), JobUrlError> {
        let mut recent = self
            .recent
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        while recent
            .front()
            .is_some_and(|at| now.duration_since(*at) >= self.window)
        {
            recent.pop_front();
        }
        if recent.len() >= self.limit {
            return Err(JobUrlError::RateLimited);
        }
        recent.push_back(now);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::{JobUrlError, RateLimiter, parse};

    #[test]
    fn accepts_public_https_job_links() {
        for input in [
            "https://boards.greenhouse.io/acme/jobs/123",
            "https://jobs.lever.co/acme/5f1c?lever-source=bfhr",
            "https://www.arbeitnow.com/jobs/companies/kiez/frontend-engineer-berlin",
            "https://acme.example.com:443/careers#apply",
            "https://karriere.bäckerei.de/stellen",
        ] {
            assert!(parse(input).is_ok(), "{input} should be accepted");
        }
        assert_eq!(
            parse("https://Jobs.Lever.co/a").unwrap().as_str(),
            "https://jobs.lever.co/a"
        );
    }

    #[test]
    fn rejects_unsafe_links() {
        let cases = [
            ("http://jobs.lever.co/", JobUrlError::NotHttps),
            ("file:///etc/passwd", JobUrlError::NotHttps),
            ("javascript:alert(1)", JobUrlError::NotHttps),
            ("bruteforcehr://jobs/1", JobUrlError::NotHttps),
            (
                "https://user:pw@jobs.lever.co/",
                JobUrlError::HasCredentials,
            ),
            (
                "https://jobs.lever.co@evil.example/",
                JobUrlError::HasCredentials,
            ),
            ("https://jobs.lever.co:8443/", JobUrlError::HasPort),
            ("https://127.0.0.1/", JobUrlError::IpLiteral),
            ("https://10.0.0.8/admin", JobUrlError::IpLiteral),
            ("https://192.168.1.1/", JobUrlError::IpLiteral),
            (
                "https://169.254.169.254/latest/meta-data",
                JobUrlError::IpLiteral,
            ),
            ("https://2130706433/", JobUrlError::IpLiteral),
            ("https://0x7f.1/", JobUrlError::IpLiteral),
            ("https://[::1]/", JobUrlError::IpLiteral),
            ("https://[fe80::1]/", JobUrlError::IpLiteral),
            ("https://localhost/", JobUrlError::LocalHost),
            ("https://localhost./", JobUrlError::LocalHost),
            ("https://app.localhost/", JobUrlError::LocalHost),
            ("https://printer.local/", JobUrlError::LocalHost),
            ("https://hr.corp.internal/", JobUrlError::LocalHost),
            ("https://nas.home.arpa/", JobUrlError::LocalHost),
            ("https://intranet/", JobUrlError::LocalHost),
            ("jobs.lever.co", JobUrlError::Invalid),
            ("", JobUrlError::Invalid),
        ];
        for (input, expected) in cases {
            assert_eq!(parse(input), Err(expected), "{input}");
        }
        let long = format!("https://jobs.lever.co/{}", "a".repeat(2048));
        assert_eq!(parse(&long), Err(JobUrlError::TooLong));
    }

    #[test]
    fn rate_limits_to_five_per_ten_seconds() {
        let limiter = RateLimiter::for_job_urls();
        let start = Instant::now();
        for second in 0..5 {
            assert!(
                limiter
                    .try_acquire(start + Duration::from_secs(second))
                    .is_ok()
            );
        }
        assert_eq!(
            limiter.try_acquire(start + Duration::from_secs(9)),
            Err(JobUrlError::RateLimited)
        );
        // The first open leaves the 10 s window.
        assert!(limiter.try_acquire(start + Duration::from_secs(10)).is_ok());
        assert_eq!(
            limiter.try_acquire(start + Duration::from_millis(10_500)),
            Err(JobUrlError::RateLimited)
        );
    }
}
