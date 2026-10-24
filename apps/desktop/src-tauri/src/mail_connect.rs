//! The return link of a mail OAuth connect (ADR 0012): after the user allowed access in the
//! browser, `https://bruteforcehr.web.app/connect/{provider}/callback` redirects to
//! `bruteforcehr://connected?nonce=…&provider=google|microsoft&intent=read|send&status=ok|error[&reason=…]`.
//! The link's shape and every parameter are checked here; the UI gets only a
//! [`MailConnectResult`] with known values (the nonce matches the connect it started). Like sign-in
//! links, the newest result waits in [`PendingMailConnect`] until the UI takes it
//! (`take_mail_connect`), so a link that arrives while the UI is busy isn't lost.

use std::sync::{Mutex, PoisonError};

use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use url::Url;

use crate::auth_link::focus_main;
use crate::window::MAIN_WINDOW;

/// Event the UI listens for (src/lib/desktop.ts); it carries no data: the UI then calls
/// `take_mail_connect`.
pub const MAIL_CONNECT_EVENT: &str = "mail-connect";

const SCHEME: &str = "bruteforcehr";
const DEEP_LINK_HOST: &str = "connected";

/// `MAIL_OAUTH_RETURN_REASONS` in packages/core/src/mail/connect.ts.
const REASONS: [&str; 6] = [
    "cancelled",
    "scope_missing",
    "admin_consent_required",
    "nonce_invalid",
    "provider_not_configured",
    "failed",
];

/// Mirrors `MailConnectResult` in src/lib/desktop.ts.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MailConnectResult {
    pub nonce: String,
    pub provider: &'static str,
    pub intent: &'static str,
    pub ok: bool,
    /// One of `REASONS` when `ok` is false (`failed` when the link named none or another one).
    pub reason: Option<&'static str>,
}

/// Whether a deep link is a connect return link (other links go to other handlers).
pub fn is_connect_deep_link(url: &Url) -> bool {
    url.scheme() == SCHEME && url.host_str() == Some(DEEP_LINK_HOST)
}

/// The checked result of a return link, or `None` when it isn't one.
pub fn parse(url: &Url) -> Option<MailConnectResult> {
    if !is_connect_deep_link(url)
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.fragment().is_some()
        || !(url.path().is_empty() || url.path() == "/")
    {
        return None;
    }
    let mut nonce = None;
    let mut provider = None;
    let mut intent = None;
    let mut status = None;
    let mut reason = None;
    for (key, value) in url.query_pairs() {
        let slot = match key.as_ref() {
            "nonce" => &mut nonce,
            "provider" => &mut provider,
            "intent" => &mut intent,
            "status" => &mut status,
            "reason" => &mut reason,
            _ => continue,
        };
        // A repeated parameter makes the link ambiguous.
        if slot.replace(value.into_owned()).is_some() {
            return None;
        }
    }
    let nonce = nonce.filter(|nonce| {
        (16..=100).contains(&nonce.len())
            && nonce
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-' || byte == b'_')
    })?;
    let provider = match provider.as_deref() {
        Some("google") => "google",
        Some("microsoft") => "microsoft",
        _ => return None,
    };
    let intent = match intent.as_deref() {
        Some("read") => "read",
        Some("send") => "send",
        _ => return None,
    };
    let ok = match status.as_deref() {
        Some("ok") => true,
        Some("error") => false,
        _ => return None,
    };
    let reason = if ok {
        None
    } else {
        Some(
            REASONS
                .into_iter()
                .find(|known| reason.as_deref() == Some(*known))
                .unwrap_or("failed"),
        )
    };
    Some(MailConnectResult {
        nonce,
        provider,
        intent,
        ok,
        reason,
    })
}

/// The newest connect result the UI hasn't taken yet.
#[derive(Default)]
pub struct PendingMailConnect(Mutex<Option<MailConnectResult>>);

impl PendingMailConnect {
    pub fn take(&self) -> Option<MailConnectResult> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner).take()
    }

    fn put(&self, result: MailConnectResult) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(result);
    }
}

/// Handles URLs from the deep-link plugin: the newest valid return link is kept for the UI and
/// announced, and the window comes to the front (the user lands back in context).
pub fn handle_urls<R: Runtime>(app: &AppHandle<R>, urls: &[Url]) {
    let Some(result) = urls.iter().rev().find_map(parse) else {
        return;
    };
    app.state::<PendingMailConnect>().put(result);
    if let Err(error) = app.emit_to(MAIN_WINDOW, MAIL_CONNECT_EVENT, ()) {
        eprintln!("failed to announce a mail connect result: {error}");
    }
    focus_main(app);
}

#[cfg(test)]
mod tests {
    use super::{MailConnectResult, PendingMailConnect, parse};
    use url::Url;

    const NONCE: &str = "Abc-DEF_1234567890xyz";

    fn link(query: &str) -> Url {
        Url::parse(&format!("bruteforcehr://connected?{query}")).unwrap()
    }

    #[test]
    fn reads_a_successful_connect() {
        assert_eq!(
            parse(&link(&format!(
                "nonce={NONCE}&provider=google&intent=read&status=ok"
            ))),
            Some(MailConnectResult {
                nonce: NONCE.to_owned(),
                provider: "google",
                intent: "read",
                ok: true,
                reason: None,
            })
        );
    }

    #[test]
    fn reads_known_reasons_and_maps_others_to_failed() {
        let result = parse(&link(&format!(
            "nonce={NONCE}&provider=microsoft&intent=send&status=error&reason=admin_consent_required"
        )))
        .unwrap();
        assert_eq!(result.reason, Some("admin_consent_required"));
        assert!(!result.ok);
        for query in [
            format!("nonce={NONCE}&provider=google&intent=read&status=error&reason=<script>"),
            format!("nonce={NONCE}&provider=google&intent=read&status=error"),
        ] {
            assert_eq!(parse(&link(&query)).unwrap().reason, Some("failed"));
        }
    }

    #[test]
    fn rejects_malformed_links() {
        for input in [
            format!("bruteforcehr://auth?nonce={NONCE}&provider=google&intent=read&status=ok"),
            format!("bruteforcehr://connected/x?nonce={NONCE}&provider=google&intent=read&status=ok"),
            format!("bruteforcehr://user@connected?nonce={NONCE}&provider=google&intent=read&status=ok"),
            format!("bruteforcehr://connected:1?nonce={NONCE}&provider=google&intent=read&status=ok"),
            format!("bruteforcehr://connected?nonce={NONCE}&provider=google&intent=read&status=ok#x"),
            format!("https://connected?nonce={NONCE}&provider=google&intent=read&status=ok"),
            "bruteforcehr://connected?nonce=short&provider=google&intent=read&status=ok".to_owned(),
            format!("bruteforcehr://connected?nonce={NONCE}&provider=yahoo&intent=read&status=ok"),
            format!("bruteforcehr://connected?nonce={NONCE}&provider=google&intent=all&status=ok"),
            format!("bruteforcehr://connected?nonce={NONCE}&provider=google&intent=read&status=maybe"),
            format!(
                "bruteforcehr://connected?nonce={NONCE}&nonce={NONCE}&provider=google&intent=read&status=ok"
            ),
            format!("bruteforcehr://connected?nonce={NONCE}%20&provider=google&intent=read&status=ok"),
        ] {
            assert_eq!(parse(&Url::parse(&input).unwrap()), None, "{input}");
        }
    }

    #[test]
    fn keeps_only_the_newest_result_until_taken() {
        let pending = PendingMailConnect::default();
        let first = parse(&link(&format!(
            "nonce={NONCE}&provider=google&intent=read&status=ok"
        )))
        .unwrap();
        let second = MailConnectResult {
            provider: "microsoft",
            ..first.clone()
        };
        pending.put(first);
        pending.put(second.clone());
        assert_eq!(pending.take(), Some(second));
        assert_eq!(pending.take(), None);
    }
}
