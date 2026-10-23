//! "Open Gmail" (and other webmail inboxes) on the "Check your email" screen. The UI names a
//! provider; the URLs live here, so the UI can't open anything else through this command. There
//! is no reliable way to open the user's default desktop mail app without composing a message,
//! so addresses at other providers get no button (docs/design/research/onboarding-signin.md).

use serde::Deserialize;
use url::Url;

/// Matches `MailProvider` in src/features/auth/mailProviders.ts.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum MailProvider {
    Gmail,
    Outlook,
    Icloud,
    Yahoo,
    Proton,
    Gmx,
    WebDe,
    Yandex,
}

/// The longest valid email address (RFC 5321 path limit).
const MAX_EMAIL_LENGTH: usize = 254;

fn is_plausible_email(email: &str) -> bool {
    email.len() <= MAX_EMAIL_LENGTH
        && email.matches('@').count() == 1
        && !email.starts_with('@')
        && !email.ends_with('@')
        && !email
            .chars()
            .any(|character| character.is_whitespace() || character.is_control())
}

/// The inbox to open. Gmail selects the signed-in Google account that matches `email`
/// (`authuser`), so people with several accounts land in the right one.
pub fn inbox_url(provider: MailProvider, email: &str) -> Url {
    let fixed = match provider {
        MailProvider::Gmail => {
            let base = Url::parse("https://mail.google.com/mail/").expect("valid URL");
            if !is_plausible_email(email) {
                return base;
            }
            return Url::parse_with_params(base.as_str(), [("authuser", email)])
                .expect("valid URL");
        }
        MailProvider::Outlook => "https://outlook.live.com/mail/",
        MailProvider::Icloud => "https://www.icloud.com/mail/",
        MailProvider::Yahoo => "https://mail.yahoo.com/",
        MailProvider::Proton => "https://mail.proton.me/",
        MailProvider::Gmx => "https://www.gmx.net/",
        MailProvider::WebDe => "https://web.de/",
        MailProvider::Yandex => "https://mail.yandex.com/",
    };
    Url::parse(fixed).expect("valid URL")
}

#[cfg(test)]
mod tests {
    use super::{MailProvider, inbox_url};

    #[test]
    fn gmail_selects_the_account() {
        assert_eq!(
            inbox_url(MailProvider::Gmail, "ada+jobs@gmail.com").as_str(),
            "https://mail.google.com/mail/?authuser=ada%2Bjobs%40gmail.com"
        );
        for bad in ["", "no-at", "a@b@c", "a b@gmail.com", "@gmail.com", "a@"] {
            assert_eq!(
                inbox_url(MailProvider::Gmail, bad).as_str(),
                "https://mail.google.com/mail/",
                "{bad}"
            );
        }
        let long = format!("{}@gmail.com", "a".repeat(260));
        assert_eq!(
            inbox_url(MailProvider::Gmail, &long).as_str(),
            "https://mail.google.com/mail/"
        );
    }

    #[test]
    fn every_provider_opens_https() {
        for provider in [
            MailProvider::Outlook,
            MailProvider::Icloud,
            MailProvider::Yahoo,
            MailProvider::Proton,
            MailProvider::Gmx,
            MailProvider::WebDe,
            MailProvider::Yandex,
        ] {
            let url = inbox_url(provider, "ignored@example.com");
            assert_eq!(url.scheme(), "https");
            assert!(
                url.query().is_none(),
                "{provider:?} must not carry the address"
            );
        }
    }

    #[test]
    fn providers_deserialize_from_the_ui_names() {
        let parse = |name: &str| serde_json::from_str::<MailProvider>(&format!("\"{name}\""));
        assert_eq!(parse("web-de").unwrap(), MailProvider::WebDe);
        assert_eq!(parse("gmail").unwrap(), MailProvider::Gmail);
        assert!(parse("https://evil.example").is_err());
    }
}
