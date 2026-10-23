//! Sign-in links (ADR 0006 / email-link sign-in). The emailed Firebase link opens
//! `https://bruteforcehr.web.app/auth/finish?…` in the browser, and that page hands it to the app
//! as `bruteforcehr://auth/finish?link=<URL-encoded original URL>`. Everything about the link is
//! checked here, before the UI sees it: the deep link's shape, and the embedded link's scheme,
//! host, path and sign-in parameters. The UI only ever gets the canonical action URL (one
//! `/__/auth/links?link=` wrapper is unwrapped here) or "invalid".
//!
//! Links arrive through `tauri-plugin-deep-link` (macOS `open-url`, or the second instance's
//! arguments forwarded by `tauri-plugin-single-instance` on Windows). The newest one waits in
//! [`PendingAuthLink`] until the UI takes it (`take_auth_link`), so a link that launches the app
//! isn't lost before the UI listens.

use std::fmt;
use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use url::{Host, Url};

use crate::window::MAIN_WINDOW;

/// Event the UI listens for (src/lib/desktop.ts); it carries no data: the UI then calls
/// `take_auth_link`.
pub const AUTH_LINK_EVENT: &str = "auth-link";

const SCHEME: &str = "bruteforcehr";
const DEEP_LINK_HOST: &str = "auth";
const DEEP_LINK_PATH: &str = "/finish";

/// The website (Firebase Hosting) and the Firebase auth domain.
const WEBSITE_HOST: &str = "bruteforcehr.web.app";
const AUTH_DOMAIN_HOST: &str = "bruteforcehr.firebaseapp.com";

/// The website page the browser lands on (the action code settings' continue URL).
const FINISH_PATH: &str = "/auth/finish";
/// Firebase's email action handler, on either host.
const ACTION_PATH: &str = "/__/auth/action";
/// Firebase's link wrapper (`?link=<action URL>`), on either host.
const LINKS_PATH: &str = "/__/auth/links";

/// Longer deep links are rejected before parsing (real ones are well under 1 KB).
const MAX_LENGTH: usize = 4096;
/// Upper bound for `oobCode` and `apiKey` values.
const MAX_TOKEN_LENGTH: usize = 512;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthLinkError {
    TooLong,
    NotAuthFinish,
    HasCredentialsOrPort,
    MissingLink,
    LinkInvalid,
    LinkNotHttps,
    LinkHostNotAllowed,
    LinkPathNotAllowed,
    NotSignInLink,
}

impl fmt::Display for AuthLinkError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::TooLong => "deep link is too long",
            Self::NotAuthFinish => "deep link is not bruteforcehr://auth/finish",
            Self::HasCredentialsOrPort => "link has credentials, a port or a fragment",
            Self::MissingLink => "deep link needs exactly one link parameter and nothing else",
            Self::LinkInvalid => "embedded link could not be parsed",
            Self::LinkNotHttps => "embedded link is not https",
            Self::LinkHostNotAllowed => "embedded link host is not allowed",
            Self::LinkPathNotAllowed => "embedded link path is not allowed",
            Self::NotSignInLink => "embedded link is not an email sign-in link",
        })
    }
}

impl std::error::Error for AuthLinkError {}

/// Whether `url` is meant for sign-in (`bruteforcehr://auth…`), valid or not.
pub fn is_auth_deep_link(url: &Url) -> bool {
    url.scheme() == SCHEME && url.host_str() == Some(DEEP_LINK_HOST)
}

/// Validates `bruteforcehr://auth/finish?link=<encoded link>` and returns the sign-in action URL
/// inside it (unwrapped from `/__/auth/links?link=` when needed).
pub fn parse(deep_link: &Url) -> Result<Url, AuthLinkError> {
    if deep_link.as_str().len() > MAX_LENGTH {
        return Err(AuthLinkError::TooLong);
    }
    if !is_auth_deep_link(deep_link) || deep_link.path() != DEEP_LINK_PATH {
        return Err(AuthLinkError::NotAuthFinish);
    }
    if has_extras(deep_link) {
        return Err(AuthLinkError::HasCredentialsOrPort);
    }
    let mut pairs = deep_link.query_pairs();
    let link = match (pairs.next(), pairs.next()) {
        (Some((key, value)), None) if key == "link" => value.into_owned(),
        _ => return Err(AuthLinkError::MissingLink),
    };
    action_url(&link, true)
}

fn has_extras(url: &Url) -> bool {
    !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
}

/// The one value of `key`; `None` when it's missing or repeated.
fn single_param(url: &Url, key: &str) -> Option<String> {
    let mut values = url
        .query_pairs()
        .filter(|(candidate, _)| candidate == key)
        .map(|(_, value)| value.into_owned());
    match (values.next(), values.next()) {
        (Some(value), None) => Some(value),
        _ => None,
    }
}

/// Firebase tokens are URL-safe base64-like strings.
fn is_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_TOKEN_LENGTH
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
}

fn action_url(input: &str, may_unwrap: bool) -> Result<Url, AuthLinkError> {
    let url = Url::parse(input).map_err(|_| AuthLinkError::LinkInvalid)?;
    if url.scheme() != "https" {
        return Err(AuthLinkError::LinkNotHttps);
    }
    if has_extras(&url) {
        return Err(AuthLinkError::HasCredentialsOrPort);
    }
    let host = match url.host() {
        Some(Host::Domain(domain)) if domain == WEBSITE_HOST || domain == AUTH_DOMAIN_HOST => {
            domain
        }
        _ => return Err(AuthLinkError::LinkHostNotAllowed),
    };
    match url.path() {
        LINKS_PATH if may_unwrap => {
            let inner = single_param(&url, "link").ok_or(AuthLinkError::NotSignInLink)?;
            return action_url(&inner, false);
        }
        ACTION_PATH => {}
        FINISH_PATH if host == WEBSITE_HOST => {}
        _ => return Err(AuthLinkError::LinkPathNotAllowed),
    }
    let signs_in = single_param(&url, "mode").as_deref() == Some("signIn");
    let has_code = single_param(&url, "oobCode").is_some_and(|code| is_token(&code));
    let has_key = single_param(&url, "apiKey").is_some_and(|key| is_token(&key));
    if signs_in && has_code && has_key {
        Ok(url)
    } else {
        Err(AuthLinkError::NotSignInLink)
    }
}

/// What the UI gets from `take_auth_link`; matches `AuthLinkDelivery` in src/lib/desktop.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", rename_all = "kebab-case")]
pub enum AuthLinkDelivery {
    /// A checked sign-in action URL for `signInWithEmailLink`.
    Link { link: String },
    /// A `bruteforcehr://auth…` link that failed the checks: the UI says the link isn't valid.
    Invalid,
}

impl AuthLinkDelivery {
    pub fn from_deep_link(url: &Url) -> Self {
        match parse(url) {
            Ok(link) => Self::Link { link: link.into() },
            Err(error) => {
                // Never log the link itself: it carries a one-time sign-in code.
                eprintln!("rejected sign-in link: {error}");
                Self::Invalid
            }
        }
    }
}

/// The newest sign-in link the UI hasn't taken yet.
#[derive(Default)]
pub struct PendingAuthLink(Mutex<Option<AuthLinkDelivery>>);

impl PendingAuthLink {
    pub fn take(&self) -> Option<AuthLinkDelivery> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }

    fn put(&self, delivery: AuthLinkDelivery) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(delivery);
    }
}

/// Handles URLs from the deep-link plugin: sign-in links are checked, kept for the UI and
/// announced; the window comes to the front. Other `bruteforcehr://` links aren't handled yet.
pub fn handle_urls<R: Runtime>(app: &AppHandle<R>, urls: &[Url]) {
    let Some(url) = urls.iter().rev().find(|url| is_auth_deep_link(url)) else {
        return;
    };
    app.state::<PendingAuthLink>()
        .put(AuthLinkDelivery::from_deep_link(url));
    if let Err(error) = app.emit_to(MAIN_WINDOW, AUTH_LINK_EVENT, ()) {
        eprintln!("failed to announce a sign-in link: {error}");
    }
    focus_main(app);
}

/// Brings the main window to the front (deep links, a second launch).
pub fn focus_main<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg(test)]
mod tests {
    use super::{AuthLinkDelivery, AuthLinkError, PendingAuthLink, is_auth_deep_link, parse};
    use url::Url;

    const FINISH: &str = "https://bruteforcehr.web.app/auth/finish?apiKey=AIzaSyBlJk949tJEB9HUmmRGoE8EsqQ2tEA41ag&oobCode=abc-DEF_123&mode=signIn&lang=tr";
    const ACTION: &str = "https://bruteforcehr.firebaseapp.com/__/auth/action?apiKey=AIzaKey&mode=signIn&oobCode=Code_1&continueUrl=https%3A%2F%2Fbruteforcehr.web.app%2Fauth%2Ffinish&lang=en";

    fn encode(link: &str) -> String {
        url::form_urlencoded::byte_serialize(link.as_bytes()).collect()
    }

    fn deep(link: &str) -> Url {
        Url::parse(&format!("bruteforcehr://auth/finish?link={}", encode(link))).unwrap()
    }

    #[test]
    fn accepts_the_finish_page_link() {
        assert_eq!(parse(&deep(FINISH)).unwrap().as_str(), FINISH);
    }

    #[test]
    fn accepts_the_action_link_on_either_host() {
        assert_eq!(parse(&deep(ACTION)).unwrap().as_str(), ACTION);
        let on_website = ACTION.replace("bruteforcehr.firebaseapp.com", "bruteforcehr.web.app");
        assert_eq!(parse(&deep(&on_website)).unwrap().as_str(), on_website);
    }

    #[test]
    fn unwraps_one_links_wrapper() {
        let wrapped = format!(
            "https://bruteforcehr.firebaseapp.com/__/auth/links?link={}",
            encode(ACTION)
        );
        assert_eq!(parse(&deep(&wrapped)).unwrap().as_str(), ACTION);
        let twice = format!(
            "https://bruteforcehr.web.app/__/auth/links?link={}",
            encode(&wrapped)
        );
        assert_eq!(parse(&deep(&twice)), Err(AuthLinkError::LinkPathNotAllowed));
        let empty = "https://bruteforcehr.web.app/__/auth/links";
        assert_eq!(parse(&deep(empty)), Err(AuthLinkError::NotSignInLink));
        let outside = format!(
            "https://bruteforcehr.web.app/__/auth/links?link={}",
            encode("https://evil.example/__/auth/action?mode=signIn&oobCode=a&apiKey=b")
        );
        assert_eq!(
            parse(&deep(&outside)),
            Err(AuthLinkError::LinkHostNotAllowed)
        );
    }

    #[test]
    fn rejects_other_deep_links() {
        let link = encode(FINISH);
        for (input, expected) in [
            (
                format!("bruteforcehr://auth/start?link={link}"),
                AuthLinkError::NotAuthFinish,
            ),
            (
                format!("bruteforcehr://auth/finish/?link={link}"),
                AuthLinkError::NotAuthFinish,
            ),
            (
                format!("bruteforcehr://today/finish?link={link}"),
                AuthLinkError::NotAuthFinish,
            ),
            (
                format!("https://auth/finish?link={link}"),
                AuthLinkError::NotAuthFinish,
            ),
            (
                format!("bruteforcehr://user@auth/finish?link={link}"),
                AuthLinkError::HasCredentialsOrPort,
            ),
            (
                format!("bruteforcehr://auth:9/finish?link={link}"),
                AuthLinkError::HasCredentialsOrPort,
            ),
            (
                format!("bruteforcehr://auth/finish?link={link}#x"),
                AuthLinkError::HasCredentialsOrPort,
            ),
            (
                "bruteforcehr://auth/finish".to_owned(),
                AuthLinkError::MissingLink,
            ),
            (
                format!("bruteforcehr://auth/finish?link={link}&link={link}"),
                AuthLinkError::MissingLink,
            ),
            (
                format!("bruteforcehr://auth/finish?link={link}&next=today"),
                AuthLinkError::MissingLink,
            ),
            (
                format!("bruteforcehr://auth/finish?url={link}"),
                AuthLinkError::MissingLink,
            ),
        ] {
            assert_eq!(
                parse(&Url::parse(&input).unwrap()),
                Err(expected),
                "{input}"
            );
        }
        let long = format!("{}&pad={}", FINISH, "a".repeat(4096));
        assert_eq!(parse(&deep(&long)), Err(AuthLinkError::TooLong));
    }

    #[test]
    fn rejects_embedded_links_outside_the_allowlist() {
        for (link, expected) in [
            ("not a url", AuthLinkError::LinkInvalid),
            (
                "http://bruteforcehr.web.app/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkNotHttps,
            ),
            (
                "javascript:alert(1)//?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkNotHttps,
            ),
            (
                "https://evil.example/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkHostNotAllowed,
            ),
            (
                "https://bruteforcehr.web.app.evil.example/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkHostNotAllowed,
            ),
            (
                "https://evil.bruteforcehr.web.app/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkHostNotAllowed,
            ),
            (
                "https://127.0.0.1/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkHostNotAllowed,
            ),
            (
                "https://bruteforcehr.web.app@evil.example/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::HasCredentialsOrPort,
            ),
            (
                "https://bruteforcehr.web.app:8443/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::HasCredentialsOrPort,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish?apiKey=a&oobCode=b&mode=signIn#frag",
                AuthLinkError::HasCredentialsOrPort,
            ),
            (
                "https://bruteforcehr.firebaseapp.com/auth/finish?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkPathNotAllowed,
            ),
            (
                "https://bruteforcehr.web.app/today?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkPathNotAllowed,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish/?apiKey=a&oobCode=b&mode=signIn",
                AuthLinkError::LinkPathNotAllowed,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish?apiKey=a&oobCode=b&mode=resetPassword",
                AuthLinkError::NotSignInLink,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish?apiKey=a&mode=signIn",
                AuthLinkError::NotSignInLink,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish?oobCode=b&mode=signIn",
                AuthLinkError::NotSignInLink,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish?apiKey=a&oobCode=b%20c&mode=signIn",
                AuthLinkError::NotSignInLink,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish?apiKey=a&oobCode=b&oobCode=c&mode=signIn",
                AuthLinkError::NotSignInLink,
            ),
            (
                "https://bruteforcehr.web.app/auth/finish",
                AuthLinkError::NotSignInLink,
            ),
        ] {
            assert_eq!(parse(&deep(link)), Err(expected), "{link}");
        }
    }

    #[test]
    fn deliveries_serialize_for_the_ui() {
        let json = |delivery| serde_json::to_string(&delivery).unwrap();
        assert_eq!(
            json(AuthLinkDelivery::from_deep_link(&deep(FINISH))),
            format!(r#"{{"kind":"link","link":"{FINISH}"}}"#)
        );
        let invalid = Url::parse("bruteforcehr://auth/finish?link=nope").unwrap();
        assert_eq!(
            json(AuthLinkDelivery::from_deep_link(&invalid)),
            r#"{"kind":"invalid"}"#
        );
    }

    #[test]
    fn only_auth_links_are_handled_and_taken_once() {
        assert!(is_auth_deep_link(&deep(FINISH)));
        assert!(is_auth_deep_link(
            &Url::parse("bruteforcehr://auth").unwrap()
        ));
        assert!(!is_auth_deep_link(
            &Url::parse("bruteforcehr://today").unwrap()
        ));
        assert!(!is_auth_deep_link(
            &Url::parse("https://auth/finish").unwrap()
        ));

        let pending = PendingAuthLink::default();
        assert_eq!(pending.take(), None);
        pending.put(AuthLinkDelivery::Invalid);
        pending.put(AuthLinkDelivery::from_deep_link(&deep(FINISH)));
        assert_eq!(
            pending.take(),
            Some(AuthLinkDelivery::Link {
                link: FINISH.to_owned()
            })
        );
        assert_eq!(pending.take(), None);
    }
}
