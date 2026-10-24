/* global document, window */
// /auth/finish hand-off (docs/adr/0008-auth-email-link.md). A classic script at the end of the body,
// so it runs before first paint without being inline (the Hosting CSP allows only same-origin scripts).
(() => {
  // English is the static HTML; Turkish uses "siz", German "du" (kickoff copy decisions).
  const COPY = {
    tr: {
      pageTitle: "Girişi tamamlayın · BruteForceHR",
      title: "BruteForceHR açılıyor",
      prompt: "Tarayıcınız uygulamayı açmak için izin isteyebilir. Girişi tamamlamak için Aç'ı seçin.",
      cta: "BruteForceHR'a dönün",
      notOpenedLead: "Açılmadı mı?",
      notOpened: "BruteForceHR uygulamasının bu bilgisayarda yüklü olduğundan emin olun.",
      download: "BruteForceHR'ı indirin",
      device:
        "Bağlantıyı, istediğiniz cihazda açın. iPhone'unuzda ya da başka bir bilgisayarda istediyseniz e-postayı orada açın.",
      browser: "Bu tarayıcıda oturum açılmayacak. Uygulama açılınca bu sekmeyi kapatabilirsiniz.",
      incompleteTitle: "Bu bağlantı eksik",
      incompleteBody:
        "E-postanızdaki giriş bağlantısını yeniden açın. Yine de çalışmazsa uygulamadan yeni bir bağlantı isteyin.",
      help: "Giriş için yardım alın",
    },
    de: {
      pageTitle: "Anmeldung abschließen · BruteForceHR",
      title: "BruteForceHR wird geöffnet",
      prompt:
        "Dein Browser fragt eventuell, ob er die App öffnen darf. Wähle „Öffnen“, um die Anmeldung abzuschließen.",
      cta: "Zurück zu BruteForceHR",
      notOpenedLead: "Nicht geöffnet?",
      notOpened: "Prüfe, ob die BruteForceHR-App auf diesem Computer installiert ist.",
      download: "BruteForceHR herunterladen",
      device:
        "Öffne den Link auf dem Gerät, auf dem du ihn angefordert hast. Hast du ihn auf deinem iPhone oder einem anderen Computer angefordert, öffne die E-Mail dort.",
      browser:
        "In diesem Browser wirst du nicht angemeldet. Du kannst den Tab schließen, sobald die App offen ist.",
      incompleteTitle: "Dieser Link ist unvollständig",
      incompleteBody:
        "Öffne den Anmeldelink aus deiner E-Mail noch einmal. Klappt es weiterhin nicht, fordere in der App einen neuen Link an.",
      help: "Hilfe zur Anmeldung",
    },
  };

  const params = new URLSearchParams(window.location.search);

  /** Firebase passes the app's `auth.languageCode` as `lang`; the browser language is the fallback. */
  function pickLanguage() {
    for (const candidate of [params.get("lang"), navigator.language]) {
      const base = candidate?.toLowerCase().split(/[-_]/)[0];
      if (base === "en" || base === "tr" || base === "de") return base;
    }
    return "en";
  }

  const lang = pickLanguage();
  if (lang !== "en") {
    const copy = COPY[lang];
    document.documentElement.lang = lang;
    document.title = copy.pageTitle;
    for (const element of document.querySelectorAll("[data-i18n]")) {
      element.textContent = copy[element.dataset.i18n];
    }
  }

  // Only a Firebase email sign-in link is handed over; the page never navigates to a URL taken from
  // its parameters (no open redirect). The app validates the link again before using it.
  const isSignInLink = params.get("mode") === "signIn" && params.has("oobCode") && params.has("apiKey");
  if (isSignInLink) {
    const deepLink = `bruteforcehr://auth/finish?${new URLSearchParams({ link: window.location.href }).toString()}`;
    document.getElementById("return-link")?.setAttribute("href", deepLink);
    document.getElementById("incomplete")?.setAttribute("hidden", "");
    document.getElementById("handoff")?.removeAttribute("hidden");
    window.location.href = deepLink;
  }
})();
