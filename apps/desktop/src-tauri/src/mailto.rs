//! `open_mailto`: hands an application email to the user's default mail app ("Open in your mail
//! app", email apply without a sending account, src/features/apply).
//!
//! The UI passes the recipients, subject and body; this module checks them and builds the
//! `mailto:` URL itself (RFC 6068), so a compromised page can't open arbitrary URLs through it:
//! one to ten plain addresses (RFC 5322 dot-atom local part, public-looking DNS domain), a
//! one-line subject and a body within the limits mail apps reliably accept. Opens are
//! rate-limited like job links.

use std::fmt;
use std::time::Duration;

use percent_encoding::{AsciiSet, NON_ALPHANUMERIC, utf8_percent_encode};
use url::Url;

use crate::job_url::RateLimiter;

/// Same cap as the in-app send (`MailSendRequestSchema.to`).
pub const MAX_RECIPIENTS: usize = 10;
/// RFC 5321 §4.5.3.1: path 256 including the angle brackets.
const MAX_ADDRESS_LENGTH: usize = 254;
const MAX_LOCAL_PART_LENGTH: usize = 64;
const MAX_DOMAIN_LENGTH: usize = 253;
const MAX_LABEL_LENGTH: usize = 63;
/// Characters; RFC 5322's line limit, the same as `MailSendRequestSchema.subject`.
pub const MAX_SUBJECT_LENGTH: usize = 998;
/// Characters. Longer messages get cut off or refused by mail apps (and Windows' shell); the UI
/// offers copying the message instead.
pub const MAX_BODY_LENGTH: usize = 8_000;
/// The encoded URL (a body of non-Latin text grows up to 9× when percent-encoded).
const MAX_URL_LENGTH: usize = 32_000;

/// RFC 3986 unreserved characters stay; everything else is percent-encoded (RFC 6068 §2).
const COMPONENT: &AsciiSet = &NON_ALPHANUMERIC
    .remove(b'-')
    .remove(b'.')
    .remove(b'_')
    .remove(b'~');
/// Addresses keep their `@` readable.
const ADDRESS: &AsciiSet = &COMPONENT.remove(b'@');

/// RFC 5322 `atext` besides letters and digits.
const ATEXT_SYMBOLS: &str = "!#$%&'*+-/=?^_`{|}~";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MailtoError {
    NoRecipients,
    TooManyRecipients,
    /// Not a plain `local@domain.tld` address.
    InvalidAddress,
    SubjectTooLong,
    /// Line breaks or other control characters in the subject.
    SubjectHasControlCharacters,
    BodyTooLong,
    /// Control characters other than line breaks and tabs in the body.
    BodyHasControlCharacters,
    UrlTooLong,
}

impl fmt::Display for MailtoError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::NoRecipients => "the email needs a recipient",
            Self::TooManyRecipients => "the email has too many recipients",
            Self::InvalidAddress => "a recipient is not a valid email address",
            Self::SubjectTooLong => "the subject is too long",
            Self::SubjectHasControlCharacters => "the subject must be one line",
            Self::BodyTooLong => "the message is too long for a mail app link",
            Self::BodyHasControlCharacters => "the message contains control characters",
            Self::UrlTooLong => "the email is too long for a mail app link",
        })
    }
}

impl std::error::Error for MailtoError {}

/// `open_mailto`'s rate limit: 3 per 10 s (each open is a new compose window).
pub struct MailtoLimiter(pub RateLimiter);

impl Default for MailtoLimiter {
    fn default() -> Self {
        Self(RateLimiter::new(3, Duration::from_secs(10)))
    }
}

fn valid_local_part(local: &str) -> bool {
    !local.is_empty()
        && local.len() <= MAX_LOCAL_PART_LENGTH
        && !local.starts_with('.')
        && !local.ends_with('.')
        && !local.contains("..")
        && local
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '.' || ATEXT_SYMBOLS.contains(c))
}

fn valid_domain(domain: &str) -> bool {
    let labels: Vec<&str> = domain.split('.').collect();
    let Some(tld) = labels.last() else {
        return false;
    };
    domain.len() <= MAX_DOMAIN_LENGTH
        && labels.len() >= 2
        && labels.iter().all(|label| {
            !label.is_empty()
                && label.len() <= MAX_LABEL_LENGTH
                && !label.starts_with('-')
                && !label.ends_with('-')
                && label.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
        })
        // A name, not an IP address: letters (or an IDN `xn--` label) at the end.
        && ((tld.len() >= 2 && tld.chars().all(|c| c.is_ascii_alphabetic()))
            || tld.starts_with("xn--"))
}

/// A plain `local@domain.tld` address (no display name, comments, quoting or IP literal).
pub fn valid_address(address: &str) -> bool {
    if address.len() > MAX_ADDRESS_LENGTH {
        return false;
    }
    match address.split_once('@') {
        Some((local, domain)) => valid_local_part(local) && valid_domain(domain),
        None => false,
    }
}

/// The `mailto:` URL for `to`, `subject` and `body` (empty subject or body are left out). Line
/// breaks in the body become CRLF, as RFC 6068 §5 asks.
pub fn build(to: &[String], subject: &str, body: &str) -> Result<Url, MailtoError> {
    if to.is_empty() {
        return Err(MailtoError::NoRecipients);
    }
    if to.len() > MAX_RECIPIENTS {
        return Err(MailtoError::TooManyRecipients);
    }
    if !to.iter().all(|address| valid_address(address)) {
        return Err(MailtoError::InvalidAddress);
    }
    if subject.chars().count() > MAX_SUBJECT_LENGTH {
        return Err(MailtoError::SubjectTooLong);
    }
    if subject.chars().any(char::is_control) {
        return Err(MailtoError::SubjectHasControlCharacters);
    }
    if body.chars().count() > MAX_BODY_LENGTH {
        return Err(MailtoError::BodyTooLong);
    }
    if body
        .chars()
        .any(|c| c.is_control() && !matches!(c, '\n' | '\r' | '\t'))
    {
        return Err(MailtoError::BodyHasControlCharacters);
    }

    let recipients: Vec<String> = to
        .iter()
        .map(|address| utf8_percent_encode(address, ADDRESS).to_string())
        .collect();
    let mut url = format!("mailto:{}", recipients.join(","));
    let mut separator = '?';
    if !subject.is_empty() {
        url.push(separator);
        url.push_str("subject=");
        url.extend(utf8_percent_encode(subject, COMPONENT));
        separator = '&';
    }
    if !body.is_empty() {
        let lines = body.replace("\r\n", "\n").replace('\r', "\n");
        url.push(separator);
        url.push_str("body=");
        url.push_str(
            &utf8_percent_encode(&lines, COMPONENT)
                .to_string()
                .replace("%0A", "%0D%0A"),
        );
    }
    if url.len() > MAX_URL_LENGTH {
        return Err(MailtoError::UrlTooLong);
    }
    // Everything is already encoded, so parsing keeps the URL as built.
    Url::parse(&url).map_err(|_| MailtoError::InvalidAddress)
}

#[cfg(test)]
mod tests {
    use std::time::{Duration, Instant};

    use super::{
        MAX_BODY_LENGTH, MAX_SUBJECT_LENGTH, MailtoError, MailtoLimiter, build, valid_address,
    };
    use crate::job_url::JobUrlError;

    fn to(addresses: &[&str]) -> Vec<String> {
        addresses
            .iter()
            .map(|address| (*address).to_owned())
            .collect()
    }

    #[test]
    fn accepts_plain_addresses() {
        for address in [
            "jobs@halden.io",
            "lena.brandt@halden-systems.de",
            "apply+design@careers.example.co.uk",
            "o'neil@example.com",
            "hr@xn--bckerei-5wa.de",
        ] {
            assert!(valid_address(address), "{address} should be accepted");
        }
    }

    #[test]
    fn rejects_other_addresses() {
        for address in [
            "",
            "jobs",
            "@halden.io",
            "jobs@",
            "jobs@halden",
            "jobs@@halden.io",
            ".jobs@halden.io",
            "jobs.@halden.io",
            "jo..bs@halden.io",
            "jobs@-halden.io",
            "jobs@halden-.io",
            "jobs@halden..io",
            "jobs@127.0.0.1",
            "jobs@[127.0.0.1]",
            "\"jobs\"@halden.io",
            "Jobs <jobs@halden.io>",
            "jobs @halden.io",
            "jobs@halden.io\r\nbcc:x@evil.example",
            "jobs@halden.io?cc=x@evil.example",
            "jobs@halden.io,x@evil.example",
            "jöbs@halden.io",
            "jobs@halden.i",
        ] {
            assert!(!valid_address(address), "{address:?} should be refused");
        }
        let long_local = format!("{}@halden.io", "a".repeat(65));
        assert!(!valid_address(&long_local));
        let long_label = format!("jobs@{}.io", "a".repeat(64));
        assert!(!valid_address(&long_label));
    }

    #[test]
    fn builds_an_encoded_mailto_url() {
        let url = build(
            &to(&["jobs@halden.io", "lena+hr@halden.io"]),
            "Application: Product Designer & UX",
            "Dear Lena,\n\nI'd like to apply – 100% sure.\r\nDeniz",
        )
        .unwrap();
        assert_eq!(
            url.as_str(),
            "mailto:jobs@halden.io,lena%2Bhr@halden.io\
             ?subject=Application%3A%20Product%20Designer%20%26%20UX\
             &body=Dear%20Lena%2C%0D%0A%0D%0AI%27d%20like%20to%20apply%20%E2%80%93%20100%25%20sure.%0D%0ADeniz"
        );
    }

    #[test]
    fn leaves_out_empty_fields() {
        assert_eq!(
            build(&to(&["jobs@halden.io"]), "", "").unwrap().as_str(),
            "mailto:jobs@halden.io"
        );
        assert_eq!(
            build(&to(&["jobs@halden.io"]), "", "Hi").unwrap().as_str(),
            "mailto:jobs@halden.io?body=Hi"
        );
        assert_eq!(
            build(&to(&["jobs@halden.io"]), "Başvuru", "")
                .unwrap()
                .as_str(),
            "mailto:jobs@halden.io?subject=Ba%C5%9Fvuru"
        );
    }

    #[test]
    fn refuses_bad_input() {
        let one = to(&["jobs@halden.io"]);
        assert_eq!(build(&[], "s", "b"), Err(MailtoError::NoRecipients));
        let eleven: Vec<String> = (0..11).map(|n| format!("hr{n}@halden.io")).collect();
        assert_eq!(
            build(&eleven, "s", "b"),
            Err(MailtoError::TooManyRecipients)
        );
        assert_eq!(
            build(&to(&["jobs@halden.io", "nope"]), "s", "b"),
            Err(MailtoError::InvalidAddress)
        );
        assert_eq!(
            build(&one, &"s".repeat(MAX_SUBJECT_LENGTH + 1), "b"),
            Err(MailtoError::SubjectTooLong)
        );
        assert!(build(&one, &"ş".repeat(MAX_SUBJECT_LENGTH), "b").is_ok());
        assert_eq!(
            build(&one, "Hi\r\nBcc: x@evil.example", "b"),
            Err(MailtoError::SubjectHasControlCharacters)
        );
        assert_eq!(
            build(&one, "s", &"b".repeat(MAX_BODY_LENGTH + 1)),
            Err(MailtoError::BodyTooLong)
        );
        assert_eq!(
            build(&one, "s", "nul\u{0}byte"),
            Err(MailtoError::BodyHasControlCharacters)
        );
        assert!(build(&one, "s", "tab\tand\nlines").is_ok());
        // 8 000 CJK characters encode to 72 000 bytes.
        assert_eq!(
            build(&one, "s", &"漢".repeat(MAX_BODY_LENGTH)),
            Err(MailtoError::UrlTooLong)
        );
    }

    #[test]
    fn rate_limits_to_three_per_ten_seconds() {
        let limiter = MailtoLimiter::default();
        let start = Instant::now();
        for second in 0..3 {
            assert!(
                limiter
                    .0
                    .try_acquire(start + Duration::from_secs(second))
                    .is_ok()
            );
        }
        assert_eq!(
            limiter.0.try_acquire(start + Duration::from_secs(5)),
            Err(JobUrlError::RateLimited)
        );
        assert!(
            limiter
                .0
                .try_acquire(start + Duration::from_secs(10))
                .is_ok()
        );
    }
}
