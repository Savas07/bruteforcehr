import type { MailEvalApplication, MailEvalCase, MailEvalExpected, MailEvalMessage } from "../types";

/** Turkish persona context: job seeker in Istanbul applying to Turkish employers. */
export const APPLICATIONS_TR: MailEvalApplication[] = [
  {
    id: "tr-app-kervan",
    company: "Kervan Teknoloji",
    companyDomain: "kervan-tech.example",
    role: "Backend Geliştirici",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-22T10:15:00+03:00",
  },
  {
    id: "tr-app-lale-swe",
    company: "Lale Bank",
    companyDomain: "lalebank.example",
    role: "Kıdemli Yazılım Mühendisi",
    status: "interviewing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-25T09:00:00+03:00",
  },
  {
    id: "tr-app-lale-pm",
    company: "Lale Bank",
    companyDomain: "lalebank.example",
    role: "Dijital Ürün Yöneticisi",
    status: "applied",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-03T14:20:00+03:00",
  },
  {
    id: "tr-app-pazarix",
    company: "Pazarix",
    companyDomain: "pazarix.example",
    role: "Frontend Geliştirici",
    status: "screening",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-28T11:40:00+03:00",
  },
  {
    id: "tr-app-anadolu",
    company: "Anadolu Yazılım",
    companyDomain: "anadoluyazilim.example",
    role: "Mobil Uygulama Geliştirici",
    status: "acknowledged",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-10T16:05:00+03:00",
  },
  {
    id: "tr-app-egeveri",
    company: "Ege Veri Analitik",
    companyDomain: "egeveri.example",
    role: "Veri Mühendisi",
    status: "applied",
    threadIds: ["thr-tr-egeveri-01"],
    sentMessageIds: ["<CAK7tr.egeveri.0815@mail.example>"],
    appliedAt: "2026-08-15T08:55:00+03:00",
  },
  {
    id: "tr-app-bogazici",
    company: "Boğaziçi Ödeme Sistemleri",
    companyDomain: "bogazicipay.example",
    role: "Full Stack Geliştirici",
    status: "interviewing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-21T13:30:00+03:00",
  },
  {
    id: "tr-app-toros",
    company: "Toros Lojistik",
    companyDomain: "toros-lojistik.example",
    role: "Yazılım Mimarı",
    status: "saved",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: null,
  },
  {
    id: "tr-app-mavi",
    company: "Mavi Sigorta",
    companyDomain: "mavisigorta.example",
    role: "DevOps Mühendisi",
    status: "preparing",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: null,
  },
  {
    id: "tr-app-kapadokya",
    company: "Kapadokya Oyun Stüdyosu",
    companyDomain: "kapadokyagames.example",
    role: "Oyun Sunucu Geliştirici",
    status: "rejected",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-20T10:00:00+03:00",
  },
  {
    id: "tr-app-cinar",
    company: "Çınar Holding",
    companyDomain: null,
    role: "Ürün Analisti",
    status: "withdrawn",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-01T09:30:00+03:00",
  },
  {
    id: "tr-app-galata",
    company: "Galata Fintech",
    companyDomain: "galatafintech.example",
    role: "Kıdemli Backend Mühendisi",
    status: "offer",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-07-24T15:10:00+03:00",
  },
  {
    id: "tr-app-baskent",
    company: "Başkent Savunma Yazılım",
    companyDomain: null,
    role: "Yazılım Geliştirme Uzmanı",
    status: "applied",
    threadIds: ["thr-tr-baskent-01"],
    sentMessageIds: ["<CAK7tr.baskent.0902@mail.example>"],
    appliedAt: "2026-09-02T10:45:00+03:00",
  },
  {
    id: "tr-app-yildiz",
    company: "Yıldız Market",
    companyDomain: "yildizmarket.example",
    role: "Mühendislik Müdürü",
    status: "acknowledged",
    threadIds: [],
    sentMessageIds: [],
    appliedAt: "2026-08-20T12:00:00+03:00",
  },
];

type MsgInput = Pick<MailEvalMessage, "from" | "subject" | "bodyText" | "receivedAt"> &
  Partial<Omit<MailEvalMessage, "from" | "subject" | "bodyText" | "receivedAt">>;

function msg(m: MsgInput): MailEvalMessage {
  return {
    folder: "inbox",
    threadId: null,
    inReplyTo: null,
    listUnsubscribe: false,
    bulk: false,
    ...m,
  };
}

function c(
  n: number,
  origin: MailEvalCase["origin"],
  hard: string | null,
  message: MsgInput,
  expected: MailEvalExpected,
): MailEvalCase {
  return {
    id: `tr-${String(n).padStart(3, "0")}`,
    language: "tr",
    origin,
    hard,
    message: msg(message),
    expected,
  };
}

const ALERT_FOOTER =
  "\n\nBu e-postayı iş alarmı tercihleriniz doğrultusunda aldınız. Bildirim ayarlarınızı değiştirmek veya abonelikten çıkmak için hesabınızdaki Bildirimler sayfasını ziyaret edebilirsiniz.";

export const CASES_TR: MailEvalCase[] = [
  // ───────────── application_received ─────────────
  c(
    1,
    "template",
    null,
    {
      from: { name: "Kervan Teknoloji İK", address: "noreply@personio.de" },
      subject: "Başvurunuz bize ulaştı – Backend Geliştirici",
      bodyText:
        "Merhaba Deniz,\n\nKervan Teknoloji bünyesindeki Backend Geliştirici pozisyonuna yaptığınız başvuru için teşekkür ederiz. Başvurunuz başarıyla alınmıştır.\n\nİşe alım ekibimiz başvurunuzu en kısa sürede inceleyecek ve profiliniz pozisyonun gereksinimleriyle örtüşüyorsa sizinle iletişime geçecektir. Bu süreç genellikle iki ila üç hafta sürmektedir.\n\nBaşvurunuzun durumunu dilediğiniz zaman aday portalımızdan takip edebilirsiniz.\n\nSevgiler,\nKervan Teknoloji İnsan Kaynakları\n\nBu e-posta Personio üzerinden otomatik olarak gönderilmiştir. Lütfen yanıtlamayınız.",
      receivedAt: "2026-07-22T10:17:00+03:00",
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: "tr-app-kervan",
      suggestedStatus: "acknowledged",
      company: "Kervan Teknoloji",
      role: "Backend Geliştirici",
    },
  ),
  c(
    2,
    "template",
    "Two Lale Bank applications in the tracker; the role in the subject (Dijital Ürün Yöneticisi) selects the PM one.",
    {
      from: { name: "Lale Bank Kariyer", address: "lalebank@myworkday.com" },
      subject: "Lale Bank – Başvurunuz Alındı (R-20418 Dijital Ürün Yöneticisi)",
      bodyText:
        "Sayın Deniz Arslan,\n\nLale Bank'a gösterdiğiniz ilgi için teşekkür ederiz. R-20418 Dijital Ürün Yöneticisi ilanına başvurunuz sistemimize kaydedilmiştir.\n\nBaşvurunuz ilgili işe alım uzmanımız tarafından değerlendirilecektir. Değerlendirme sonucunda, süreçle ilgili bilgilendirme e-posta yoluyla yapılacaktır.\n\nBaşvurularınızı Workday aday ana sayfanızdan görüntüleyebilirsiniz.\n\nSaygılarımızla,\nLale Bank İnsan Kaynakları Grup Müdürlüğü",
      receivedAt: "2026-08-03T14:22:00+03:00",
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: "tr-app-lale-pm",
      suggestedStatus: "acknowledged",
      company: "Lale Bank",
      role: "Dijital Ürün Yöneticisi",
    },
  ),
  c(
    3,
    "template",
    null,
    {
      from: { name: "Kariyer.net", address: "bildirim@kariyer.net" },
      subject: "Başvurunuz Trendova firmasına iletildi",
      bodyText:
        'Merhaba Deniz,\n\nTrendova firmasının "Kıdemli React Geliştirici" ilanına başvurun başarıyla iletildi.\n\nFirma başvurunu görüntülediğinde sana haber vereceğiz. Başvuru durumunu Kariyer.net uygulamasındaki Başvurularım sayfasından takip edebilirsin.\n\nBaşarılar dileriz!\nKariyer.net Ekibi' +
        ALERT_FOOTER,
      receivedAt: "2026-08-12T19:03:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Trendova",
      role: "Kıdemli React Geliştirici",
    },
  ),
  c(
    4,
    "synthetic",
    "ATS auto-reply to an emailed application; linked only through thread / In-Reply-To.",
    {
      from: { name: "Ege Veri Kariyer", address: "kariyer@egeveri.example" },
      subject: "Otomatik Yanıt: Veri Mühendisi Başvurusu - Deniz Arslan",
      bodyText:
        "Bu otomatik bir yanıttır.\n\nE-postanız kariyer ekibimize ulaşmıştır. Tüm başvurular İnsan Kaynakları birimimiz tarafından incelenmekte olup, uygun görülen adaylarla 15 iş günü içinde iletişime geçilmektedir.\n\nYoğunluk nedeniyle her e-postaya ayrıca yanıt veremediğimiz için anlayışınıza teşekkür ederiz.\n\nEge Veri Analitik A.Ş.\nKazımdirik Mah. 372. Sk. No:8 Bornova / İzmir",
      receivedAt: "2026-08-15T08:56:00+03:00",
      threadId: "thr-tr-egeveri-01",
      inReplyTo: "<CAK7tr.egeveri.0815@mail.example>",
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: "tr-app-egeveri",
      suggestedStatus: "acknowledged",
      company: "Ege Veri Analitik",
      role: null,
    },
  ),
  c(
    5,
    "synthetic",
    '"Başvurunuz için teşekkür ederiz… değerlendireceğiz" — receipt, not rejection; application already acknowledged, so no move.',
    {
      from: { name: "Yıldız Market İşe Alım", address: "yildizmarket@successfactors.eu" },
      subject: "Başvurunuz için teşekkür ederiz",
      bodyText:
        "Sayın Deniz Arslan,\n\nYıldız Market Mühendislik Müdürü pozisyonuna başvurunuz için teşekkür ederiz. Ancak başvuru sayımızın yüksek olması nedeniyle değerlendirme sürecimiz planlanandan biraz daha uzun sürmektedir.\n\nÖzgeçmişinizi ilgili yöneticilerimizle birlikte detaylı olarak inceleyeceğiz ve en geç iki hafta içinde size dönüş yapacağız.\n\nSabrınız için teşekkür eder, iyi çalışmalar dileriz.\n\nYıldız Market İnsan ve Kültür Ekibi",
      receivedAt: "2026-09-04T11:30:00+03:00",
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: "tr-app-yildiz",
      suggestedStatus: null,
      company: "Yıldız Market",
      role: "Mühendislik Müdürü",
    },
  ),
  c(
    6,
    "template",
    null,
    {
      from: { name: "Marmara Telekom Kariyer", address: "marmaratelekom@successfactors.eu" },
      subject: "Başvuru Onayı: Bulut Platform Mühendisi (İş No: 48213)",
      bodyText:
        "Sayın Aday,\n\nMarmara Telekom'da Bulut Platform Mühendisi (İş No: 48213) pozisyonu için başvurunuzu aldık. Kariyerinizin bir sonraki adımında bizi düşündüğünüz için teşekkür ederiz.\n\nBaşvurunuz incelendikten sonra, sürecin bir sonraki aşaması hakkında sizi bilgilendireceğiz.\n\nKariyer Sitesi'ndeki profilinizi güncel tutmayı unutmayın.\n\nSaygılarımızla,\nMarmara Telekom İnsan Kaynakları\n\n---\nBu mesaj SAP SuccessFactors tarafından otomatik olarak oluşturulmuştur.",
      receivedAt: "2026-09-10T22:14:00+03:00",
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Marmara Telekom",
      role: "Bulut Platform Mühendisi",
    },
  ),
  c(
    7,
    "synthetic",
    "Company domain unknown in the tracker; personal-sounding reply in the thread of the emailed application.",
    {
      from: { name: "Gülşen Yalçın", address: "gulsen.yalcin@baskentsavunma.example" },
      subject: "Re: Yazılım Geliştirme Uzmanı ilanı hk.",
      bodyText:
        "Sayın Deniz Bey,\n\nGöndermiş olduğunuz özgeçmiş ve ön yazı tarafımıza ulaşmış olup başvurunuz kayda alınmıştır. Başvurunuz ilgili birim tarafından değerlendirmeye alınacak, uygun görülmesi halinde sizinle telefon yoluyla iletişime geçilecektir.\n\nBilgilerinize sunarım.\n\nGülşen Yalçın\nİnsan Kaynakları Uzmanı\nBaşkent Savunma Yazılım A.Ş.\nT: +90 555 412 33 07\n\n> 2 Eyl 2026 Çar 10:45 tarihinde Deniz Arslan şunu yazdı:\n> Sayın Yetkili, kariyer sayfanızda yayımlanan Yazılım Geliştirme Uzmanı ilanına başvurmak istiyorum. Özgeçmişim ektedir.",
      receivedAt: "2026-09-03T15:02:00+03:00",
      threadId: "thr-tr-baskent-01",
      inReplyTo: "<CAK7tr.baskent.0902@mail.example>",
    },
    {
      category: "application_received",
      applicationId: "tr-app-baskent",
      suggestedStatus: "acknowledged",
      company: "Başkent Savunma Yazılım",
      role: "Yazılım Geliştirme Uzmanı",
    },
  ),
  c(
    8,
    "template",
    "Mixed language: English Teamtailor template from an Istanbul company.",
    {
      from: { name: "Sardunya Sağlık Teknolojileri", address: "no-reply@teamtailor-mail.com" },
      subject: "Thanks for your application to Sardunya Health Tech",
      bodyText:
        "Hi Deniz,\n\nThank you for applying for the Senior Product Engineer position at Sardunya Health Tech in Istanbul. We have received your application and our team will review it shortly.\n\nIf your experience matches what we are looking for, we will reach out to schedule a first conversation.\n\nBest regards,\nThe Sardunya Talent Team\n\nYou can manage your data and connections in our career site.",
      receivedAt: "2026-09-15T09:41:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: null,
      suggestedStatus: "acknowledged",
      company: "Sardunya Health Tech",
      role: "Senior Product Engineer",
    },
  ),
  c(
    9,
    "template",
    "Tracker still says preparing; the receipt is a forward move to acknowledged.",
    {
      from: { name: "Mavi Sigorta Kariyer", address: "mavisigorta@workablemail.com" },
      subject: "DevOps Mühendisi başvurunuz alındı",
      bodyText:
        "Merhaba Deniz,\n\nMavi Sigorta'daki DevOps Mühendisi pozisyonuna başvurduğunuz için teşekkür ederiz.\n\nBaşvurunuzu aldık ve ekibimiz inceliyor. Bir sonraki adıma geçmeniz durumunda sizinle iletişime geçeceğiz.\n\nİyi günler,\nMavi Sigorta İşe Alım Ekibi\n\nPowered by Workable",
      receivedAt: "2026-09-18T17:25:00+03:00",
      bulk: true,
    },
    {
      category: "application_received",
      applicationId: "tr-app-mavi",
      suggestedStatus: "acknowledged",
      company: "Mavi Sigorta",
      role: "DevOps Mühendisi",
    },
  ),

  // ───────────── rejection ─────────────
  c(
    10,
    "synthetic",
    'Opens with "Başvurunuz için teşekkür ederiz" like a receipt, then "maalesef".',
    {
      from: { name: "Pazarix Yetenek Ekibi", address: "no-reply@hire.lever.co" },
      subject: "Pazarix – Frontend Geliştirici başvurunuz hakkında",
      bodyText:
        "Merhaba Deniz,\n\nPazarix'teki Frontend Geliştirici pozisyonu için başvurunuz ve bize ayırdığınız zaman için teşekkür ederiz.\n\nBaşvurunuzu dikkatle inceledik; ancak maalesef bu aşamada sürece, deneyimi pozisyonun gereksinimlerine daha yakın olan adaylarla devam etme kararı aldık.\n\nGelecekte açılacak pozisyonlarımızı takip etmenizi ve tekrar başvurmanızı memnuniyetle karşılarız.\n\nKariyerinizde başarılar dileriz.\nPazarix Yetenek Ekibi",
      receivedAt: "2026-09-08T18:10:00+03:00",
      bulk: true,
    },
    {
      category: "rejection",
      applicationId: "tr-app-pazarix",
      suggestedStatus: "rejected",
      company: "Pazarix",
      role: "Frontend Geliştirici",
    },
  ),
  c(
    11,
    "synthetic",
    'Rejection after final interviews wrapped in warm words ("çok etkilendik", "özgeçmişinizi havuzumuzda tutacağız").',
    {
      from: { name: "Ece Karaca", address: "ece.karaca@lalebank.example" },
      subject: "Kıdemli Yazılım Mühendisi süreci hk.",
      bodyText:
        "Sayın Deniz Arslan,\n\nKıdemli Yazılım Mühendisi pozisyonu için son aşama görüşmelerimize katıldığınız ve ekibimizle değerli zamanınızı paylaştığınız için çok teşekkür ederiz. Teknik birikiminiz ve iletişim tarzınızdan ekip olarak gerçekten çok etkilendik.\n\nUzun değerlendirmeler sonucunda, bu pozisyon için ödeme altyapısı tecrübesi daha yoğun olan başka bir adayla ilerlemeye karar verdik. Bu kararın sizin için hayal kırıcı olabileceğinin farkındayız.\n\nÖzgeçmişinizi yetenek havuzumuzda tutacağız ve profilinize uygun yeni bir pozisyon açıldığında ilk olarak sizinle iletişime geçmek isteriz.\n\nSağlıklı ve başarılı günler dilerim.\n\nEce Karaca\nTeknoloji İşe Alım Uzmanı\nLale Bank",
      receivedAt: "2026-10-12T16:45:00+03:00",
    },
    {
      category: "rejection",
      applicationId: "tr-app-lale-swe",
      suggestedStatus: "rejected",
      company: "Lale Bank",
      role: "Kıdemli Yazılım Mühendisi",
    },
  ),
  c(
    12,
    "synthetic",
    'Position filled internally — rejection without the word "olumsuz".',
    {
      from: { name: "Anadolu Yazılım İK", address: "ik@anadoluyazilim.example" },
      subject: "Mobil Uygulama Geliştirici pozisyonu",
      bodyText:
        "Merhaba Deniz Bey,\n\nMobil Uygulama Geliştirici pozisyonumuza gösterdiğiniz ilgi için teşekkür ederiz. Pozisyon, şirket içi bir atama ile doldurulmuş olup işe alım süreci sonlandırılmıştır.\n\nBu nedenle başvurunuzla ilgili süreci ilerletemiyoruz. Yeni ilanlarımızı kariyer sayfamızdan takip edebilirsiniz.\n\nİyi çalışmalar,\nAnadolu Yazılım İnsan Kaynakları",
      receivedAt: "2026-09-22T10:05:00+03:00",
    },
    {
      category: "rejection",
      applicationId: "tr-app-anadolu",
      suggestedStatus: "rejected",
      company: "Anadolu Yazılım",
      role: "Mobil Uygulama Geliştirici",
    },
  ),
  c(
    13,
    "template",
    "Position put on hold — counts as rejection; company not in tracker.",
    {
      from: { name: "Netrota Kariyer", address: "netrota@recruitee.com" },
      subject: "Site Reliability Engineer pozisyonu hakkında bilgilendirme",
      bodyText:
        "Merhaba Deniz,\n\nSite Reliability Engineer pozisyonumuza başvurduğun için teşekkür ederiz.\n\nŞirket içi bütçe planlamamızdaki değişiklikler nedeniyle bu pozisyonu şimdilik askıya almak durumunda kaldık ve mevcut başvurular için süreci kapatıyoruz. Pozisyon yeniden açıldığında ilanı kariyer sayfamızda paylaşacağız.\n\nAnlayışın için teşekkürler,\nNetrota İnsan Kaynakları",
      receivedAt: "2026-09-25T13:12:00+03:00",
      bulk: true,
    },
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Netrota",
      role: "Site Reliability Engineer",
    },
  ),
  c(
    14,
    "template",
    "Application already rejected (closed); a second rejection proposes nothing.",
    {
      from: { name: "Kapadokya Oyun Stüdyosu", address: "no-reply@ashbyhq.com" },
      subject: "Kapadokya Oyun Stüdyosu başvurunuz",
      bodyText:
        "Merhaba Deniz,\n\nOyun Sunucu Geliştirici rolüne başvurduğun için teşekkür ederiz. Başvurunu dikkatle değerlendirdik; maalesef şu an için sürece devam edemeyeceğiz.\n\nGelecekte yolumuzun kesişmesini umuyoruz.\n\nKapadokya Oyun Stüdyosu İşe Alım",
      receivedAt: "2026-08-30T20:40:00+03:00",
      bulk: true,
    },
    {
      category: "rejection",
      applicationId: "tr-app-kapadokya",
      suggestedStatus: null,
      company: "Kapadokya Oyun Stüdyosu",
      role: "Oyun Sunucu Geliştirici",
    },
  ),
  c(
    15,
    "synthetic",
    "Withdrawn (closed) application with unknown domain, matched by company name and role; no status move.",
    {
      from: { name: "Çınar Holding İnsan Kaynakları", address: "kariyer@cinarholding.example" },
      subject: "Ürün Analisti başvurunuz",
      bodyText:
        "Sayın Deniz Arslan,\n\nŞirketimizin Ürün Analisti pozisyonu için yapmış olduğunuz başvuru değerlendirilmiş olup, mevcut ihtiyaçlarımız doğrultusunda olumlu sonuçlandırılamamıştır.\n\nGöstermiş olduğunuz ilgi için teşekkür eder, çalışma hayatınızda başarılar dileriz.\n\nÇınar Holding A.Ş.\nİnsan Kaynakları Direktörlüğü",
      receivedAt: "2026-08-28T09:15:00+03:00",
    },
    {
      category: "rejection",
      applicationId: "tr-app-cinar",
      suggestedStatus: null,
      company: "Çınar Holding",
      role: "Ürün Analisti",
    },
  ),
  c(
    16,
    "template",
    null,
    {
      from: { name: "Kariyer.net", address: "bildirim@kariyer.net" },
      subject: "Başvurunla ilgili bir güncelleme var",
      bodyText:
        'Merhaba Deniz,\n\nDoruk Perakende firmasının "Yazılım Test Uzmanı" ilanına yaptığın başvuru firma tarafından değerlendirildi ve maalesef olumsuz sonuçlandı.\n\nÜzülme, sana uygun binlerce ilan seni bekliyor. Profilini güncel tutarak işverenlerin seni bulmasını kolaylaştırabilirsin.\n\nKariyer.net Ekibi' +
        ALERT_FOOTER,
      receivedAt: "2026-09-01T12:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Doruk Perakende",
      role: "Yazılım Test Uzmanı",
    },
  ),
  c(
    17,
    "template",
    null,
    {
      from: { name: "Kervan Teknoloji İK", address: "noreply@personio.de" },
      subject: "Backend Geliştirici başvurunuz hakkında",
      bodyText:
        "Merhaba Deniz,\n\nKervan Teknoloji'ye gösterdiğiniz ilgi için tekrar teşekkür ederiz.\n\nBackend Geliştirici pozisyonu için çok sayıda nitelikli başvuru aldık. Dikkatli bir değerlendirmenin ardından, maalesef başvurunuzu bu süreçte dikkate alamayacağımızı bildirmek isteriz.\n\nVerilerinizi KVKK kapsamında 6 ay süreyle saklayacağız; bu süre içinde uygun bir pozisyon açılırsa sizinle iletişime geçebiliriz.\n\nSevgiler,\nKervan Teknoloji İnsan Kaynakları",
      receivedAt: "2026-08-19T15:33:00+03:00",
      bulk: true,
    },
    {
      category: "rejection",
      applicationId: "tr-app-kervan",
      suggestedStatus: "rejected",
      company: "Kervan Teknoloji",
      role: "Backend Geliştirici",
    },
  ),
  c(
    18,
    "template",
    "Mixed language: English Lever rejection from an Istanbul company not in the tracker.",
    {
      from: { name: "Dorukware", address: "no-reply@hire.lever.co" },
      subject: "Your application to Dorukware",
      bodyText:
        "Hi Deniz,\n\nThank you for your interest in the Platform Engineer role at Dorukware. After careful consideration, we have decided to move forward with other candidates whose experience more closely matches our current needs.\n\nWe appreciate the time you invested and wish you the best in your search.\n\nKind regards,\nDorukware Talent Team, Istanbul",
      receivedAt: "2026-10-02T19:20:00+03:00",
      bulk: true,
    },
    {
      category: "rejection",
      applicationId: null,
      suggestedStatus: "rejected",
      company: "Dorukware",
      role: "Platform Engineer",
    },
  ),

  // ───────────── interview_invite ─────────────
  c(
    19,
    "synthetic",
    "Valid invite with time and link, but the application is already interviewing — no status move.",
    {
      from: { name: "Mert Doğan", address: "mert.dogan@bogazicipay.example" },
      subject: "Teknik mülakat daveti – Full Stack Geliştirici",
      bodyText:
        "Merhaba Deniz,\n\nİK görüşmemizin ardından seni ekibimizle teknik mülakata davet etmek istiyoruz.\n\nTarih: 23 Eylül 2026 Çarşamba\nSaat: 14:00–15:30 (TSİ, GMT+3)\nBağlantı: https://meet.google.com/bqx-trmn-kpw\n\nGörüşmede canlı kodlama ve sistem tasarımı bölümleri olacak. Kamera ve ekran paylaşımı gerekiyor.\n\nUygun olmadığın durumda lütfen bu e-postayı yanıtla.\n\nSevgiler,\nMert Doğan\nMühendislik Müdürü, Boğaziçi Ödeme Sistemleri",
      receivedAt: "2026-09-17T11:08:00+03:00",
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-bogazici",
      suggestedStatus: null,
      company: "Boğaziçi Ödeme Sistemleri",
      role: "Full Stack Geliştirici",
      dates: [{ kind: "interview", at: "2026-09-23T14:00:00+03:00" }],
      meetingUrls: ["https://meet.google.com/bqx-trmn-kpw"],
    },
  ),
  c(
    20,
    "synthetic",
    "First HR phone/video screen → screening, not interviewing.",
    {
      from: { name: "Selin Aktaş", address: "selin.aktas@kervan-tech.example" },
      subject: "Ön görüşme – Backend Geliştirici",
      bodyText:
        "Merhaba Deniz,\n\nBackend Geliştirici başvurunu inceledik ve seninle tanışmak için 30 dakikalık kısa bir ön görüşme yapmak istiyoruz. Görüşmede deneyimlerinden, beklentilerinden ve Kervan'daki rolden bahsedeceğiz.\n\n📅 6 Ağustos 2026 Perşembe, 10:30 (İstanbul saati)\n🔗 https://zoom.us/j/84213097765\n\nSaat uygun değilse alternatif önerebilirsin.\n\nGörüşmek üzere,\nSelin Aktaş\nİK İş Ortağı, Kervan Teknoloji",
      receivedAt: "2026-08-03T09:50:00+03:00",
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-kervan",
      suggestedStatus: "screening",
      company: "Kervan Teknoloji",
      role: "Backend Geliştirici",
      dates: [{ kind: "interview", at: "2026-08-06T10:30:00+03:00" }],
      meetingUrls: ["https://zoom.us/j/84213097765"],
    },
  ),
  c(
    21,
    "template",
    'Only a "pick a slot" scheduling link, no concrete date or meeting URL.',
    {
      from: { name: "Yıldız Market İşe Alım", address: "no-reply@us.greenhouse-mail.io" },
      subject: "Yıldız Market ile görüşme planlayalım",
      bodyText:
        "Merhaba Deniz,\n\nMühendislik Müdürü pozisyonu için seninle Teknoloji Direktörümüz Kaan Erdem ile bir görüşme planlamak istiyoruz.\n\nLütfen aşağıdaki bağlantıdan önümüzdeki hafta için sana uygun bir zaman dilimi seç:\nhttps://app.greenhouse.io/scheduling/yildizmarket/7d3f9a21\n\nGörüşme 45 dakika sürecek ve video üzerinden yapılacaktır; bağlantı takvim davetiyle gönderilecek.\n\nTeşekkürler,\nYıldız Market İşe Alım Ekibi",
      receivedAt: "2026-09-29T14:12:00+03:00",
      bulk: true,
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-yildiz",
      suggestedStatus: "interviewing",
      company: "Yıldız Market",
      role: "Mühendislik Müdürü",
    },
  ),
  c(
    22,
    "synthetic",
    "Reschedule of an existing interview (new time), still interview_invite; application already interviewing.",
    {
      from: { name: "Ece Karaca", address: "ece.karaca@lalebank.example" },
      subject: "Görüşme saati değişikliği – Kıdemli Yazılım Mühendisi",
      bodyText:
        "Sayın Deniz Arslan,\n\nYarın saat 11:00'de planlanan görüşmemize panelistlerimizden birinin katılamayacak olması nedeniyle görüşmeyi ertelemek durumundayız. Yaşattığımız aksaklık için özür dileriz.\n\nYeni görüşme zamanı: 1 Ekim 2026 Perşembe, 15:00 (GMT+3)\nToplantı bağlantısı aynı kalmaktadır:\nhttps://teams.microsoft.com/l/meetup-join/19%3ameeting_LaLeBnk4471%40thread.v2/0\n\nUygunluğunuzu teyit etmenizi rica ederim.\n\nSaygılarımla,\nEce Karaca\nLale Bank",
      receivedAt: "2026-09-28T17:40:00+03:00",
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-lale-swe",
      suggestedStatus: null,
      company: "Lale Bank",
      role: "Kıdemli Yazılım Mühendisi",
      dates: [{ kind: "interview", at: "2026-10-01T15:00:00+03:00" }],
      meetingUrls: ["https://teams.microsoft.com/l/meetup-join/19%3ameeting_LaLeBnk4471%40thread.v2/0"],
    },
  ),
  c(
    23,
    "template",
    "Calendar-invite-only text (no prose), linked through the email-application thread.",
    {
      from: { name: "Burak Öztürk", address: "burak.ozturk@egeveri.example" },
      subject: "Davet: Teknik Görüşme – Deniz Arslan @ 8 Eki 2026 Prş 14:00 - 15:00 (GMT+03:00)",
      bodyText:
        "Teknik Görüşme – Deniz Arslan\nPerşembe 8 Ekim 2026 ⋅ 14:00 – 15:00\nSaat dilimi: İstanbul\n\nGoogle Meet ile katılın\nhttps://meet.google.com/egv-dnzr-tkn\n\nKatılımcılar\nburak.ozturk@egeveri.example - düzenleyen\ndeniz.arslan@mail.example\n\nKatılacak mısınız? Evet - Belki - Hayır\n\nGoogle Takvim'den davet",
      receivedAt: "2026-10-01T10:02:00+03:00",
      threadId: "thr-tr-egeveri-01",
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-egeveri",
      suggestedStatus: "interviewing",
      company: "Ege Veri Analitik",
      role: null,
      dates: [{ kind: "interview", at: "2026-10-08T14:00:00+03:00" }],
      meetingUrls: ["https://meet.google.com/egv-dnzr-tkn"],
    },
  ),
  c(
    24,
    "synthetic",
    null,
    {
      from: { name: "Kuzey Bulut İK", address: "ik@kuzeybulut.example" },
      subject: "İkinci aşama görüşme daveti – Kıdemli Go Geliştirici",
      bodyText:
        "Merhaba Deniz Bey,\n\nİlk görüşmemizdeki olumlu izlenimlerimiz doğrultusunda sizi ikinci aşama görüşmesine davet etmekten memnuniyet duyarız. Bu görüşmede CTO'muz Hakan Şimşek ve platform ekibinden iki mühendis yer alacak.\n\nTarih/Saat: 14 Ekim 2026 Çarşamba, 16:00 (TSİ)\nZoom: https://zoom.us/j/93120457781\n\nGörüşme yaklaşık 60 dakika sürecektir.\n\nİyi çalışmalar,\nTuğba Er\nKuzey Bulut Teknolojileri",
      receivedAt: "2026-10-07T12:30:00+03:00",
    },
    {
      category: "interview_invite",
      applicationId: null,
      suggestedStatus: "interviewing",
      company: "Kuzey Bulut Teknolojileri",
      role: "Kıdemli Go Geliştirici",
      dates: [{ kind: "interview", at: "2026-10-14T16:00:00+03:00" }],
      meetingUrls: ["https://zoom.us/j/93120457781"],
    },
  ),
  c(
    25,
    "synthetic",
    "Two Lale Bank applications and the invite names no role → applicationId null (cannot pick).",
    {
      from: { name: "Lale Bank İK", address: "ik.davet@lalebank.example" },
      subject: "Mülakat Daveti",
      bodyText:
        "Sayın Deniz Arslan,\n\nBankamızda başvurduğunuz pozisyona ilişkin değerlendirme sürecimiz kapsamında sizinle bir yetkinlik mülakatı gerçekleştirmek istiyoruz.\n\nMülakat Tarihi: 9 Ekim 2026 Cuma, 10:00\nYer: Lale Bank Genel Müdürlük, Levent / İstanbul (Kat 12, İK Toplantı Salonu)\n\nGelirken nüfus cüzdanınızı yanınızda bulundurmanızı rica ederiz. Katılım durumunuzu bu e-postayı yanıtlayarak bildirmenizi bekleriz.\n\nSaygılarımızla,\nLale Bank İnsan Kaynakları",
      receivedAt: "2026-10-05T09:20:00+03:00",
    },
    {
      category: "interview_invite",
      applicationId: null,
      suggestedStatus: "interviewing",
      company: "Lale Bank",
      role: null,
      dates: [{ kind: "interview", at: "2026-10-09T10:00:00+03:00" }],
    },
  ),
  c(
    26,
    "synthetic",
    "HR phone screen with date but no link (phone call).",
    {
      from: { name: "Zeynep Kılıç", address: "zeynep.kilic@anadoluyazilim.example" },
      subject: "Telefon görüşmesi – Mobil Uygulama Geliştirici",
      bodyText:
        "Merhaba Deniz Bey,\n\nMobil Uygulama Geliştirici başvurunuzla ilgili sizinle kısa bir telefon görüşmesi yapmak istiyoruz. 3 Eylül 2026 Perşembe günü saat 11:00'de sizi +90 555 908 14 22 numarasından arayacağım.\n\nBu saat sizin için uygun değilse lütfen alternatif bir saat iletin.\n\nİyi günler,\nZeynep Kılıç\nİşe Alım Uzmanı, Anadolu Yazılım",
      receivedAt: "2026-09-01T14:48:00+03:00",
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-anadolu",
      suggestedStatus: "screening",
      company: "Anadolu Yazılım",
      role: "Mobil Uygulama Geliştirici",
      dates: [{ kind: "interview", at: "2026-09-03T11:00:00+03:00" }],
    },
  ),
  c(
    27,
    "synthetic",
    null,
    {
      from: { name: "Gülşen Yalçın", address: "gulsen.yalcin@baskentsavunma.example" },
      subject: "Re: Yazılım Geliştirme Uzmanı ilanı hk.",
      bodyText:
        "Sayın Deniz Bey,\n\nBaşvurunuz ilgili birim tarafından olumlu değerlendirilmiştir. Sizi teknik mülakata davet ediyoruz.\n\nTarih: 16 Eylül 2026 Çarşamba\nSaat: 13:30\nAdres: Başkent Savunma Yazılım A.Ş., ODTÜ Teknokent, Silikon Blok No:5, Çankaya / Ankara\n\nGüvenlik kontrolü nedeniyle görüşme saatinden 20 dakika önce binada bulunmanızı rica ederiz.\n\nGülşen Yalçın\nİnsan Kaynakları Uzmanı",
      receivedAt: "2026-09-10T10:20:00+03:00",
      threadId: "thr-tr-baskent-01",
      inReplyTo: "<CAK7tr.baskent.0902@mail.example>",
    },
    {
      category: "interview_invite",
      applicationId: "tr-app-baskent",
      suggestedStatus: "interviewing",
      company: "Başkent Savunma Yazılım",
      role: "Yazılım Geliştirme Uzmanı",
      dates: [{ kind: "interview", at: "2026-09-16T13:30:00+03:00" }],
    },
  ),

  // ───────────── assessment ─────────────
  c(
    28,
    "template",
    null,
    {
      from: { name: "Codility", address: "no-reply@codility.com" },
      subject: "Kervan Teknoloji sizi bir kodlama testine davet ediyor",
      bodyText:
        "Merhaba Deniz,\n\nKervan Teknoloji, Backend Geliştirici pozisyonu için işe alım sürecinin bir parçası olarak sizi çevrim içi bir kodlama testine davet etti.\n\nTesti başlat: https://app.codility.com/test/KRVN-8Q2X-PL4T/\n\nSüre: 90 dakika\nSon tarih: 12 Ağustos 2026, 23:59 (GMT+3)\n\nTesti başlattıktan sonra duraklatamazsınız; sessiz bir ortam ve stabil internet bağlantısı önerilir.\n\nİyi şanslar!\nCodility adına Kervan Teknoloji",
      receivedAt: "2026-08-07T16:00:00+03:00",
      bulk: true,
    },
    {
      category: "assessment",
      applicationId: "tr-app-kervan",
      suggestedStatus: "screening",
      company: "Kervan Teknoloji",
      role: "Backend Geliştirici",
      dates: [{ kind: "assessment_deadline", at: "2026-08-12T23:59:00+03:00" }],
    },
  ),
  c(
    29,
    "template",
    "Assessment reminder landed in spam; still real.",
    {
      from: { name: "HackerRank", address: "support@hackerrank.com" },
      subject: "Hatırlatma: Mavi Sigorta testinizi tamamlamak için 24 saatiniz kaldı",
      bodyText:
        'Merhaba Deniz,\n\nMavi Sigorta tarafından gönderilen "DevOps Mühendisi – Teknik Değerlendirme" testini henüz tamamlamadınız.\n\nTestin süresi 25 Eylül 2026, 18:00 (GMT+03:00) tarihinde dolacak.\n\nTeste başla: https://www.hackerrank.com/tests/mvsg-devops-26/login\n\nTeşekkürler,\nHackerRank Ekibi\n\nBu e-postayı Mavi Sigorta\'nın isteği üzerine aldınız.',
      receivedAt: "2026-09-24T18:00:00+03:00",
      folder: "spam",
      bulk: true,
    },
    {
      category: "assessment",
      applicationId: "tr-app-mavi",
      suggestedStatus: "screening",
      company: "Mavi Sigorta",
      role: "DevOps Mühendisi",
      dates: [{ kind: "assessment_deadline", at: "2026-09-25T18:00:00+03:00" }],
    },
  ),
  c(
    30,
    "template",
    null,
    {
      from: { name: "Trendova via TestGorilla", address: "no-reply@testgorilla.com" },
      subject: "Trendova sizi bir değerlendirmeye davet etti",
      bodyText:
        "Merhaba Deniz,\n\nTrendova, Kıdemli React Geliştirici pozisyonu için seni bir değerlendirmeyi tamamlamaya davet etti. Değerlendirme 4 testten oluşuyor ve yaklaşık 50 dakika sürüyor.\n\nDeğerlendirmeye başla: https://app.testgorilla.com/s/trnd4k2x\n\nLütfen değerlendirmeyi 7 gün içinde tamamla.\n\nBaşarılar!\nTestGorilla",
      receivedAt: "2026-08-18T11:45:00+03:00",
      bulk: true,
    },
    {
      category: "assessment",
      applicationId: null,
      suggestedStatus: "screening",
      company: "Trendova",
      role: "Kıdemli React Geliştirici",
    },
  ),
  c(
    31,
    "template",
    null,
    {
      from: { name: "Coderbyte", address: "noreply@coderbyte.com" },
      subject: "Yıldız Market: Teknik değerlendirme daveti",
      bodyText:
        "Merhaba Deniz,\n\nYıldız Market seni Mühendislik Müdürü pozisyonu kapsamında bir teknik değerlendirmeye davet etti. Değerlendirme iki kodlama sorusu ve bir mimari tasarım sorusundan oluşuyor.\n\nDeğerlendirme bağlantısı: https://coderbyte.com/sl-candidate?promo=yildizmkt-em26\nSon tarih: 18 Eylül 2026 Cuma, 23:59 (İstanbul)\n\nCoderbyte Ekibi",
      receivedAt: "2026-09-14T13:00:00+03:00",
      bulk: true,
    },
    {
      category: "assessment",
      applicationId: "tr-app-yildiz",
      suggestedStatus: "screening",
      company: "Yıldız Market",
      role: "Mühendislik Müdürü",
      dates: [{ kind: "assessment_deadline", at: "2026-09-18T23:59:00+03:00" }],
    },
  ),
  c(
    32,
    "synthetic",
    "Take-home case sent by the recruiter directly; application already in screening → no move.",
    {
      from: { name: "Can Yurt", address: "can.yurt@pazarix.example" },
      subject: "Frontend Geliştirici – Ev ödevi (case study)",
      bodyText:
        "Merhaba Deniz,\n\nKonuşmamızda bahsettiğimiz case çalışmasını ekte paylaşıyorum. Kısaca: ürün listeleme sayfası için filtre ve sepet akışını React + TypeScript ile geliştirmeni bekliyoruz.\n\nTeslim: GitHub reposu linkini 4 Eylül 2026 Cuma saat 18:00'e kadar bu e-postaya yanıt olarak gönderebilirsin. Tahmini süre 4–6 saat.\n\nSorun olursa yazmaktan çekinme.\n\nCan Yurt\nEngineering Manager, Pazarix",
      receivedAt: "2026-08-28T10:10:00+03:00",
    },
    {
      category: "assessment",
      applicationId: "tr-app-pazarix",
      suggestedStatus: null,
      company: "Pazarix",
      role: "Frontend Geliştirici",
      dates: [{ kind: "assessment_deadline", at: "2026-09-04T18:00:00+03:00" }],
    },
  ),

  // ───────────── offer ─────────────
  c(
    33,
    "synthetic",
    "Formal offer letter, but the tracker is already at offer → no move.",
    {
      from: { name: "Galata Fintech İK", address: "people@galatafintech.example" },
      subject: "İş Teklifi – Kıdemli Backend Mühendisi",
      bodyText:
        "Sayın Deniz Arslan,\n\nGörüşmelerimiz sonucunda sizi Galata Fintech ailesinde Kıdemli Backend Mühendisi olarak görmekten mutluluk duyacağımızı bildirmek isteriz.\n\nTeklifimizin özeti:\n• Aylık brüt ücret: 185.000 TL\n• Yıllık performans primi: 2 maaşa kadar\n• Özel sağlık sigortası (aile dahil), yemek kartı, hibrit çalışma (haftada 2 gün ofis)\n• İşe başlama tarihi: 2 Kasım 2026 Pazartesi\n\nResmi teklif mektubu ektedir. Teklifimizi 23 Ekim 2026 Cuma günü saat 18:00'e kadar yanıtlamanızı rica ederiz.\n\nSaygılarımızla,\nNil Sarı\nİnsan Kaynakları Müdürü, Galata Fintech",
      receivedAt: "2026-10-16T17:05:00+03:00",
    },
    {
      category: "offer",
      applicationId: "tr-app-galata",
      suggestedStatus: null,
      company: "Galata Fintech",
      role: "Kıdemli Backend Mühendisi",
      dates: [
        { kind: "start_date", at: "2026-11-02T09:00:00+03:00" },
        { kind: "reply_deadline", at: "2026-10-23T18:00:00+03:00" },
      ],
    },
  ),
  c(
    34,
    "synthetic",
    null,
    {
      from: { name: "Mert Doğan", address: "mert.dogan@bogazicipay.example" },
      subject: "Teklifimiz – Full Stack Geliştirici",
      bodyText:
        "Merhaba Deniz,\n\nSüreç boyunca gösterdiğin performans için teşekkür ederiz; seni ekibimize katmak istiyoruz! 🎉\n\nFull Stack Geliştirici pozisyonu için teklifimiz:\n- Net aylık ücret: 140.000 TL (yılda 13 maaş)\n- Uzaktan çalışma desteği ve yıllık 20.000 TL eğitim bütçesi\n- Başlangıç tarihi: 16 Kasım 2026\n\nDetaylı teklif mektubunu İK ekibimiz ayrıca paylaşacak. Soruların olursa her zaman ulaşabilirsin.\n\nSevgiler,\nMert Doğan",
      receivedAt: "2026-10-09T18:22:00+03:00",
    },
    {
      category: "offer",
      applicationId: "tr-app-bogazici",
      suggestedStatus: "offer",
      company: "Boğaziçi Ödeme Sistemleri",
      role: "Full Stack Geliştirici",
      dates: [{ kind: "start_date", at: "2026-11-16T09:00:00+03:00" }],
    },
  ),
  c(
    35,
    "synthetic",
    null,
    {
      from: { name: "Tuğba Er", address: "tugba.er@kuzeybulut.example" },
      subject: "Kuzey Bulut Teknolojileri – Teklif Mektubu",
      bodyText:
        "Sayın Deniz Arslan,\n\nKıdemli Go Geliştirici pozisyonu için yürüttüğümüz süreç olumlu sonuçlanmış olup size iş teklifimizi sunmaktan memnuniyet duyarız.\n\nBrüt aylık ücret: 210.000 TL\nİşe başlama tarihi: 1 Aralık 2026\nÇalışma şekli: Tam uzaktan\n\nTeklif mektubunu imzalayarak 21 Ekim 2026 tarihine kadar tarafımıza iletmenizi rica ederiz.\n\nİyi çalışmalar,\nTuğba Er",
      receivedAt: "2026-10-16T11:00:00+03:00",
    },
    {
      category: "offer",
      applicationId: null,
      suggestedStatus: "offer",
      company: "Kuzey Bulut Teknolojileri",
      role: "Kıdemli Go Geliştirici",
      dates: [
        { kind: "start_date", at: "2026-12-01T09:00:00+03:00" },
        { kind: "reply_deadline", at: "2026-10-21T23:59:00+03:00" },
      ],
    },
  ),
  c(
    36,
    "synthetic",
    "Verbal/informal offer announcement with a call proposal; role names the SWE application.",
    {
      from: { name: "Ece Karaca", address: "ece.karaca@lalebank.example" },
      subject: "Güzel haberler!",
      bodyText:
        "Merhaba Deniz Bey,\n\nKıdemli Yazılım Mühendisi pozisyonu için yönetim onayını aldık ve size teklif sunmaya hazırız. Ücret ve yan haklar detaylarını telefonda konuşmak isterim; yarın gün içinde sizin için uygun bir saat var mı?\n\nResmi teklif mektubu görüşmemizin ardından e-posta ile iletilecektir.\n\nSaygılarımla,\nEce Karaca\nLale Bank",
      receivedAt: "2026-10-20T15:30:00+03:00",
    },
    {
      category: "offer",
      applicationId: "tr-app-lale-swe",
      suggestedStatus: "offer",
      company: "Lale Bank",
      role: "Kıdemli Yazılım Mühendisi",
    },
  ),

  // ───────────── recruiter_outreach ─────────────
  c(
    37,
    "synthetic",
    'Recruiter outreach that mentions an interview ("kısa bir ön görüşme") but no application exists.',
    {
      from: { name: "Ayşe Polat via LinkedIn", address: "inmail-hit-reply@linkedin.com" },
      subject: "Ayşe Polat size bir mesaj gönderdi: Staff Engineer fırsatı",
      bodyText:
        "Merhaba Deniz,\n\nTalentist İK Danışmanlık'tan Ayşe ben. İstanbul merkezli, hızla büyüyen bir e-ticaret şirketi için Staff Engineer arayışımız var ve profilin çok uygun görünüyor.\n\nUygunsan bu hafta 20 dakikalık kısa bir ön görüşme yapalım; ardından müşterimizle mülakat sürecini başlatabiliriz. Hangi gün sana uyar?\n\nSevgiler,\nAyşe Polat\nKıdemli Teknoloji Danışmanı, Talentist\n\nLinkedIn mesajlarını yanıtla\nBu e-postayı bildirim tercihleriniz nedeniyle aldınız. Abonelikten çık",
      receivedAt: "2026-09-09T10:12:00+03:00",
      listUnsubscribe: true,
    },
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Talentist İK Danışmanlık",
      role: "Staff Engineer",
    },
  ),
  c(
    38,
    "synthetic",
    null,
    {
      from: { name: "Oğuz Kaplan", address: "oguz.kaplan@seckinsearch.example" },
      subject: "Fintech – Engineering Lead pozisyonu (gizli arama)",
      bodyText:
        "Sayın Deniz Arslan,\n\nSeçkin Executive Search olarak, Türkiye'nin önde gelen dijital bankacılık girişimlerinden biri adına Engineering Lead pozisyonu için gizli bir arama yürütüyoruz.\n\nÖzgeçmişinizdeki ödeme sistemleri deneyimi müşterimizin aradığı profile oldukça yakın. Pozisyonun detaylarını sizinle paylaşmak isterim; uygun olduğunuz bir zamanı bildirirseniz memnun olurum.\n\nGüncel özgeçmişinizi de iletebilirseniz süreci hızlandırabiliriz.\n\nSaygılarımla,\nOğuz Kaplan\nOrtak, Seçkin Executive Search\n+90 555 301 77 45",
      receivedAt: "2026-09-19T09:05:00+03:00",
    },
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Seçkin Executive Search",
      role: "Engineering Lead",
    },
  ),
  c(
    39,
    "synthetic",
    null,
    {
      from: { name: "Elif Taş", address: "elif.tas@marmaratelekom.example" },
      subject: "Marmara Telekom'da yeni bir rol: Platform Takım Lideri",
      bodyText:
        "Merhaba Deniz,\n\nMarmara Telekom Yetenek Kazanımı ekibinden Elif. GitHub ve LinkedIn profilinde Kubernetes ve dağıtık sistemler konusundaki çalışmalarını gördüm.\n\nŞu anda Platform Takım Lideri pozisyonu için aday arıyoruz ve senin profilinin bu role çok uygun olduğunu düşünüyorum. İlgilenirsen kısa bir tanışma yapabilir miyiz?\n\nİyi çalışmalar,\nElif Taş\nTeknik İşe Alım Uzmanı",
      receivedAt: "2026-09-30T14:40:00+03:00",
    },
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Marmara Telekom",
      role: "Platform Takım Lideri",
    },
  ),
  c(
    40,
    "template",
    "Job-board notification that an employer messaged the candidate — outreach, not an alert.",
    {
      from: { name: "Kariyer.net", address: "bildirim@kariyer.net" },
      subject: "Bir işveren sana mesaj gönderdi",
      bodyText:
        'Merhaba Deniz,\n\nSafran Yazılım firması özgeçmişini inceledi ve sana bir mesaj gönderdi:\n\n"Merhaba Deniz Bey, Kıdemli .NET Geliştirici pozisyonumuz için profilinizi uygun bulduk. Görüşmek isterseniz bize dönüş yapabilir misiniz?"\n\nMesajı görüntülemek ve yanıtlamak için Kariyer.net\'e giriş yap.\n\nKariyer.net Ekibi' +
        ALERT_FOOTER,
      receivedAt: "2026-10-06T20:18:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Safran Yazılım",
      role: "Kıdemli .NET Geliştirici",
    },
  ),
  c(
    41,
    "synthetic",
    "Mixed language: English outreach from a Turkish-founded startup recruiter.",
    {
      from: { name: "Kerem Aydın", address: "kerem@lojix.example" },
      subject: "Founding engineer @ Lojix (Istanbul / remote)",
      bodyText:
        "Hi Deniz,\n\nI'm Kerem, co-founder of Lojix — we're building routing software for last-mile delivery fleets in Istanbul and Ankara. We just closed our seed round and are hiring our first Founding Backend Engineer.\n\nYour background at payment companies caught my eye. Would you be open to a quick coffee in Maslak or a call next week?\n\nCheers,\nKerem",
      receivedAt: "2026-10-13T21:02:00+03:00",
    },
    {
      category: "recruiter_outreach",
      applicationId: null,
      suggestedStatus: null,
      company: "Lojix",
      role: "Founding Backend Engineer",
    },
  ),

  // ───────────── info_request ─────────────
  c(
    42,
    "synthetic",
    "Requests documents and references; must not be read as an offer.",
    {
      from: { name: "Ece Karaca", address: "ece.karaca@lalebank.example" },
      subject: "Kıdemli Yazılım Mühendisi – Belge ve referans talebi",
      bodyText:
        "Sayın Deniz Arslan,\n\nSürecin bir sonraki adımı için aşağıdaki belgeleri 7 Ekim 2026 Çarşamba gününe kadar tarafımıza iletmenizi rica ederiz:\n\n1. Diploma fotokopisi (lisans ve varsa yüksek lisans)\n2. Son iki işvereninizden birer referans kişisinin adı, unvanı ve iletişim bilgileri\n3. Güncel özgeçmiş\n\nBelgeleri bu e-postaya yanıt olarak gönderebilirsiniz.\n\nSaygılarımla,\nEce Karaca",
      receivedAt: "2026-10-02T11:15:00+03:00",
    },
    {
      category: "info_request",
      applicationId: "tr-app-lale-swe",
      suggestedStatus: null,
      company: "Lale Bank",
      role: "Kıdemli Yazılım Mühendisi",
      dates: [{ kind: "reply_deadline", at: "2026-10-07T23:59:00+03:00" }],
    },
  ),
  c(
    43,
    "synthetic",
    null,
    {
      from: { name: "Boğaziçi Ödeme İK", address: "ik@bogazicipay.example" },
      subject: "Maaş beklentiniz hakkında",
      bodyText:
        "Merhaba Deniz,\n\nFull Stack Geliştirici süreciniz devam ederken değerlendirmemizi tamamlayabilmek için net aylık maaş beklentinizi ve mevcut ihbar sürenizi öğrenmek istiyoruz.\n\nAyrıca en erken ne zaman işe başlayabileceğinizi de paylaşırsanız seviniriz.\n\nTeşekkürler,\nBoğaziçi Ödeme Sistemleri İK",
      receivedAt: "2026-09-26T10:40:00+03:00",
    },
    {
      category: "info_request",
      applicationId: "tr-app-bogazici",
      suggestedStatus: null,
      company: "Boğaziçi Ödeme Sistemleri",
      role: "Full Stack Geliştirici",
    },
  ),
  c(
    44,
    "synthetic",
    "Availability request in the email-application thread — looks like scheduling but has no invite yet.",
    {
      from: { name: "Burak Öztürk", address: "burak.ozturk@egeveri.example" },
      subject: "Re: Veri Mühendisi Başvurusu - Deniz Arslan",
      bodyText:
        "Merhaba Deniz Bey,\n\nBaşvurunuzu ekip olarak inceledik. Bir sonraki adımı planlayabilmemiz için önümüzdeki iki hafta içindeki müsaitlik durumunuzu paylaşabilir misiniz? Ayrıca İzmir'e taşınma ya da haftada iki gün Bornova ofisine gelme konusunda bir engeliniz var mı?\n\nDönüşünüzü bekliyorum.\n\nBurak Öztürk\nVeri Platformu Takım Lideri\n\n> 15 Ağu 2026 Cmt 08:55 tarihinde Deniz Arslan şunu yazdı:\n> Merhaba, Veri Mühendisi ilanınız için özgeçmişimi ekte bilgilerinize sunarım.",
      receivedAt: "2026-09-24T09:30:00+03:00",
      threadId: "thr-tr-egeveri-01",
      inReplyTo: "<CAK7tr.egeveri.0815@mail.example>",
    },
    {
      category: "info_request",
      applicationId: "tr-app-egeveri",
      suggestedStatus: null,
      company: "Ege Veri Analitik",
      role: "Veri Mühendisi",
    },
  ),
  c(
    45,
    "synthetic",
    "Pre-employment document request after the offer; offer words nearby but category is info_request.",
    {
      from: { name: "Nil Sarı", address: "people@galatafintech.example" },
      subject: "İşe giriş evrakları",
      bodyText:
        "Sayın Deniz Arslan,\n\nTeklifimizi değerlendirdiğiniz için teşekkür ederiz. İşe giriş işlemlerinizin zamanında tamamlanabilmesi için aşağıdaki belgeleri e-Devlet üzerinden alarak iletmenizi rica ederiz:\n\n- Adli sicil kaydı\n- SGK hizmet dökümü\n- İkametgâh belgesi\n- 2 adet vesikalık fotoğraf\n- IBAN bilgisi\n\nSaygılarımızla,\nGalata Fintech İnsan Kaynakları",
      receivedAt: "2026-10-19T10:00:00+03:00",
    },
    {
      category: "info_request",
      applicationId: "tr-app-galata",
      suggestedStatus: null,
      company: "Galata Fintech",
      role: null,
    },
  ),

  // ───────────── job_alert ─────────────
  c(
    46,
    "template",
    'Job alert titled like an invitation ("başvurmaya davet edildiniz").',
    {
      from: { name: "LinkedIn", address: "jobs-noreply@linkedin.com" },
      subject: "Deniz, Kuzgun Medya sizi başvurmaya davet ediyor",
      bodyText:
        "Kuzgun Medya bu iş için sizin gibi adaylar arıyor\n\nKıdemli Mobil Geliştirici\nKuzgun Medya · İstanbul, Türkiye (Hibrit)\n\nProfiliniz bu işin aradığı becerilerin 8/10'u ile eşleşiyor.\n\n[Kolay Başvuru]\n\nBenzer işler:\n• iOS Geliştirici – Fırat Mobil · İstanbul\n• React Native Geliştirici – Pusula Uygulama · Uzaktan\n\nBu e-postayı Deniz Arslan için gönderdik. İş önerisi e-postalarından çıkın.\n© 2026 LinkedIn Corporation",
      receivedAt: "2026-09-12T08:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: "Kuzgun Medya",
      role: "Kıdemli Mobil Geliştirici",
    },
  ),
  c(
    47,
    "template",
    null,
    {
      from: { name: "Kariyer.net", address: "isalarmi@kariyer.net" },
      subject: '"Backend Developer" iş alarmın için 14 yeni ilan',
      bodyText:
        'Merhaba Deniz,\n\nKaydettiğin "Backend Developer – İstanbul (Avrupa)" iş alarmına uygun yeni ilanlar var:\n\n• Kıdemli Backend Developer – Pera Yazılım · Şişli\n• Java Developer – Atlas Sigorta Teknoloji · Maslak\n• Node.js Developer – Kuyu Oyun · Uzaktan\n• Python Developer – Sarp Analitik · Beşiktaş\n\nTüm ilanları gör\n\nKariyer.net' +
        ALERT_FOOTER,
      receivedAt: "2026-08-05T07:30:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Backend Developer",
    },
  ),
  c(
    48,
    "template",
    null,
    {
      from: { name: "SecretCV", address: "bildirim@secretcv.com" },
      subject: "Sana özel seçilmiş iş ilanları",
      bodyText:
        "Merhaba Deniz,\n\nProfiline ve aramalarına göre seçtiğimiz ilanlar:\n\nYazılım Geliştirme Uzmanı – Hilal Enerji (Ankara)\nFull Stack Developer – Delta Turizm Teknolojileri (Antalya / Uzaktan)\nÜrün Yöneticisi – Ardıç Finans (İstanbul)\n\nİlanlara göz at ve tek tıkla başvur!\n\nSecretCV" +
        ALERT_FOOTER,
      receivedAt: "2026-08-21T09:12:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    49,
    "template",
    null,
    {
      from: { name: "Yenibiriş", address: "noreply@yenibiris.com" },
      subject: "Kayıtlı aramana uygun 6 yeni ilan: DevOps Mühendisi",
      bodyText:
        'Sayın Deniz Arslan,\n\n"DevOps Mühendisi" aramanız için son 24 saatte yayınlanan ilanlar:\n\n- DevOps Mühendisi – Gökkuşağı Bilişim · İzmir\n- Kıdemli DevOps Engineer – Yeşil Lojistik · İstanbul\n- Cloud Engineer – Turna Havacılık Teknolojileri · Ankara\n\nTümünü görüntüle\n\nYenibiriş.com' +
        ALERT_FOOTER,
      receivedAt: "2026-09-03T07:45:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "DevOps Mühendisi",
    },
  ),
  c(
    50,
    "template",
    null,
    {
      from: { name: "LinkedIn İş Alarmları", address: "jobalerts-noreply@linkedin.com" },
      subject: "“Yazılım Mühendisi”: İstanbul, Türkiye bölgesinde 20+ yeni iş",
      bodyText:
        "İş alarmınız: Yazılım Mühendisi · İstanbul, Türkiye\n\nYazılım Mühendisi\nSedir Teknoloji · İstanbul (Hibrit) · 3 gün önce\n\nKıdemli Yazılım Mühendisi\nAkıncı Sağlık · İstanbul · Kolay Başvuru\n\nYazılım Mühendisi – Ödeme Sistemleri\nPapirüs Pay · Uzaktan\n\nTüm işleri görün\n\nBu iş alarmı e-postasını almak istemiyorsanız aboneliğinizi iptal edebilirsiniz.\n© 2026 LinkedIn Corporation",
      receivedAt: "2026-09-21T08:05:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Yazılım Mühendisi",
    },
  ),
  c(
    51,
    "template",
    null,
    {
      from: { name: "Indeed", address: "alert@indeed.com" },
      subject: "İstanbul bölgesinde 9 yeni Frontend Developer işi",
      bodyText:
        "Deniz, son aramanızla eşleşen yeni işler:\n\nFrontend Developer\nMasal Yayıncılık – İstanbul\nKolayca başvurun\n\nVue.js Developer\nSu Teknoloji – Kadıköy, İstanbul\n\nUI Engineer\nMercan E-Ticaret – Uzaktan\n\nDaha fazla iş görüntüle\n\nBu e-postayı Indeed iş bildirimlerine abone olduğunuz için aldınız. Aboneliği iptal et.",
      receivedAt: "2026-10-04T06:50:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "job_alert",
      applicationId: null,
      suggestedStatus: null,
      company: null,
      role: "Frontend Developer",
    },
  ),
  c(
    52,
    "template",
    "Alert lists a tracked company (Lale Bank) but it is a different, un-applied role → no link.",
    {
      from: { name: "Glassdoor İş Uyarıları", address: "noreply@glassdoor.com" },
      subject: "Lale Bank ve diğer şirketlerde size uygun işler",
      bodyText:
        "Deniz, kaydettiğiniz şirketlerdeki yeni ilanlar:\n\nMobil Bankacılık Takım Lideri\nLale Bank · İstanbul · ★ 3,9\n\nVeri Bilimci\nİpek Tekstil Teknoloji · Bursa\n\nSiber Güvenlik Uzmanı\nKale Savunma · Ankara\n\nTüm işleri gör\n\nGlassdoor iş uyarılarından çıkmak için buraya tıklayın.",
      receivedAt: "2026-10-10T07:20:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "job_alert", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),

  // ───────────── other_job ─────────────
  c(
    53,
    "template",
    "Workday candidate-portal password reset from a tracked employer — job-related, not a status signal.",
    {
      from: { name: "Lale Bank Kariyer", address: "lalebank@myworkday.com" },
      subject: "Şifre Sıfırlama Talebi",
      bodyText:
        "Merhaba,\n\nLale Bank Kariyer hesabınız için bir şifre sıfırlama talebi aldık. Şifrenizi sıfırlamak için aşağıdaki bağlantıyı kullanın. Bağlantı 24 saat geçerlidir.\n\nhttps://lalebank.wd3.myworkday.com/lalebank/login.htmld?reset=8ad21c\n\nBu talebi siz yapmadıysanız bu e-postayı dikkate almayınız.\n\nLale Bank",
      receivedAt: "2026-09-02T23:11:00+03:00",
      bulk: true,
    },
    { category: "other_job", applicationId: null, suggestedStatus: null, company: "Lale Bank", role: null },
  ),
  c(
    54,
    "template",
    null,
    {
      from: { name: "Kariyer.net", address: "bildirim@kariyer.net" },
      subject: "Özgeçmişin %70 tamamlandı – işverenlerin seni bulmasını kolaylaştır",
      bodyText:
        "Merhaba Deniz,\n\nÖzgeçmişini tamamlayan adaylar işverenlerden 3 kat daha fazla görüntülenme alıyor.\n\nEksik alanlar:\n✔ Yetkinlikler\n✘ Yabancı dil seviyesi\n✘ Referanslar\n\nÖzgeçmişimi tamamla\n\nKariyer.net" +
        ALERT_FOOTER,
      receivedAt: "2026-07-27T12:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "other_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    55,
    "template",
    "ATS-domain marketing: employer career-fair newsletter via SuccessFactors — other_job, not an invite.",
    {
      from: { name: "Marmara Telekom Kariyer", address: "marmaratelekom@successfactors.eu" },
      subject: "Sizi Marmara Telekom Teknoloji Kariyer Günleri'ne davet ediyoruz!",
      bodyText:
        "Değerli Yetenek Topluluğu Üyemiz,\n\n17 Ekim 2026 Cumartesi günü İstanbul Kongre Merkezi'nde düzenleyeceğimiz Teknoloji Kariyer Günleri'nde mühendislik ekiplerimizle tanışabilir, açık pozisyonlarımız hakkında bilgi alabilirsiniz.\n\nKatılım ücretsizdir, kayıt zorunludur.\n\nHemen kaydol\n\nMarmara Telekom Yetenek Topluluğu bültenini almak istemiyorsanız abonelikten çıkabilirsiniz.",
      receivedAt: "2026-10-01T13:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    {
      category: "other_job",
      applicationId: null,
      suggestedStatus: null,
      company: "Marmara Telekom",
      role: null,
    },
  ),
  c(
    56,
    "template",
    null,
    {
      from: { name: "Yenibiriş Etkinlik", address: "etkinlik@yenibiris.com" },
      subject: "Yazılım Kariyer Zirvesi 2026 – ücretsiz online katılım",
      bodyText:
        "Merhaba Deniz,\n\n5 Kasım 2026'da düzenlenecek Yazılım Kariyer Zirvesi'nde teknoloji liderleri CV hazırlama, mülakat teknikleri ve maaş pazarlığı üzerine konuşacak.\n\nÜcretsiz kayıt ol, canlı yayına katıl.\n\nYenibiriş" +
        ALERT_FOOTER,
      receivedAt: "2026-10-15T10:30:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "other_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    57,
    "synthetic",
    "Confirmation that the candidate withdrew; looks like a status mail but proposes nothing (closed application).",
    {
      from: { name: "Çınar Holding Kariyer", address: "kariyer@cinarholding.example" },
      subject: "Başvuru geri çekme talebiniz",
      bodyText:
        "Sayın Deniz Arslan,\n\nÜrün Analisti pozisyonuna ait başvurunuzu geri çekme talebiniz işleme alınmıştır. Kişisel verileriniz KVKK kapsamında yasal süre sonunda silinecektir.\n\nİlginiz için teşekkür ederiz.\n\nÇınar Holding İnsan Kaynakları",
      receivedAt: "2026-08-25T16:20:00+03:00",
    },
    {
      category: "other_job",
      applicationId: "tr-app-cinar",
      suggestedStatus: null,
      company: "Çınar Holding",
      role: "Ürün Analisti",
    },
  ),

  // ───────────── not_job ─────────────
  c(
    58,
    "synthetic",
    'Credit-card "başvurunuz alınmıştır" from Lale Bank, a tracked employer.',
    {
      from: { name: "Lale Bank", address: "bilgilendirme@lalebank.example" },
      subject: "Kredi kartı başvurunuz alınmıştır",
      bodyText:
        "Sayın Deniz Arslan,\n\nLale Bonus Platinum kredi kartı başvurunuz alınmıştır. Başvurunuz değerlendirildikten sonra sonuç SMS ile bildirilecektir.\n\nBaşvuru numaranız: KK-2026-0918-44721\n\nLale Bank A.Ş. | Mersis No: 0123456789000017\nBu e-posta bilgilendirme amaçlıdır.",
      receivedAt: "2026-09-18T13:44:00+03:00",
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    59,
    "synthetic",
    'Visa "başvurunuz alındı" — not a job application.',
    {
      from: { name: "VizeKapı Başvuru Merkezi", address: "noreply@vizekapi.example" },
      subject: "Vize başvurunuz işleme alındı – Referans No: IST-DE-778102",
      bodyText:
        "Sayın Başvuru Sahibi,\n\nAlmanya Schengen vize başvurunuz İstanbul Gayrettepe başvuru merkezimizde alınmış ve konsolosluğa iletilmiştir. Pasaportunuzun durumunu referans numaranızla takip edebilirsiniz.\n\nOrtalama işlem süresi 15 iş günüdür.\n\nVizeKapı",
      receivedAt: "2026-08-11T15:20:00+03:00",
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    60,
    "synthetic",
    'Apartment rental application with "başvurunuz değerlendirilecek" and an "görüşme" (viewing appointment).',
    {
      from: { name: "Defne Emlak", address: "info@defneemlak.example" },
      subject: "Kiralık daire başvurunuz – Moda, Kadıköy",
      bodyText:
        "Merhaba Deniz Bey,\n\nCaferağa Mah.'deki 2+1 kiralık daire için başvurunuz ev sahibine iletilmiştir. Mal sahibi kefil ve gelir belgesi talep etmektedir. Daireyi görmek için Cumartesi 11:00'de görüşme ayarlayabiliriz.\n\nİyi günler,\nDefne Emlak\n+90 555 218 40 63",
      receivedAt: "2026-09-05T18:30:00+03:00",
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    61,
    "synthetic",
    "University master's application received — academic, not job.",
    {
      from: { name: "Fen Bilimleri Enstitüsü", address: "enstitu@ege-universitesi.example" },
      subject: "Yüksek lisans başvurunuz alınmıştır",
      bodyText:
        "Sayın Deniz Arslan,\n\n2026-2027 Güz Dönemi Bilgisayar Mühendisliği tezli yüksek lisans programına başvurunuz sisteme kaydedilmiştir. Bilim sınavı tarihleri enstitü web sayfasında ilan edilecektir.\n\nFen Bilimleri Enstitüsü Müdürlüğü",
      receivedAt: "2026-07-30T10:00:00+03:00",
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    62,
    "synthetic",
    '"Size özel teklif" discount from Pazarix, a tracked employer (e-commerce marketing).',
    {
      from: { name: "Pazarix", address: "kampanya@pazarix.example" },
      subject: "Deniz, sana özel teklif: Sepette %30 indirim! 🛒",
      bodyText:
        "Merhaba Deniz,\n\nSadece bu hafta sonuna özel teklifimizi kaçırma! Elektronik ve ev ürünlerinde sepette %30 indirim seni bekliyor.\n\nKod: PZRX30\nSon gün: 27 Eylül 2026\n\nHemen alışverişe başla\n\nTicari elektronik ileti almak istemiyorsanız buradan ret hakkınızı kullanabilirsiniz. Pazarix E-Ticaret A.Ş.",
      receivedAt: "2026-09-25T12:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    63,
    "synthetic",
    'Podcast newsletter with "mülakat" in the subject.',
    {
      from: { name: "Kod ve Kahve Podcast", address: "bulten@kodvekahve.example" },
      subject: "Yeni bölüm: Bir CTO ile mülakat – mikroservislerden geri dönüş",
      bodyText:
        "Merhaba dinleyicimiz,\n\nBu haftaki bölümde Sedir Teknoloji CTO'su Levent Uçar ile monolite geri dönüş hikâyelerini konuştuk. Mülakatın tamamı Spotify ve Apple Podcasts'te!\n\nAyrıca: dinleyici sorularımızı yanıtladığımız bonus bölüm Perşembe yayında.\n\nKod ve Kahve\nBülten aboneliğinden çıkmak için tıklayın.",
      receivedAt: "2026-10-08T08:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    64,
    "synthetic",
    'Bank "başvurunuz olumsuz sonuçlanmıştır" for a consumer loan — reads like a rejection.',
    {
      from: { name: "Ardıç Finans", address: "bilgi@ardicfinans.example" },
      subject: "İhtiyaç kredisi başvurunuz hakkında",
      bodyText:
        "Sayın Deniz Arslan,\n\n19.09.2026 tarihli ihtiyaç kredisi başvurunuz, kredi değerlendirme kriterlerimiz çerçevesinde maalesef olumsuz sonuçlanmıştır. Başvurunuz reddedilmiştir.\n\nDetaylı bilgi için 0 555 444 00 00 numaralı müşteri hizmetlerimizi arayabilirsiniz.\n\nArdıç Finans",
      receivedAt: "2026-09-20T11:22:00+03:00",
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    65,
    "template",
    "ATS-domain marketing newsletter aimed at HR buyers (Personio product news) — not job-search.",
    {
      from: { name: "Personio", address: "newsletter@personio.com" },
      subject: "İK ekipleri için yeni: Otomatik izin onayları ve bordro entegrasyonu",
      bodyText:
        'Merhaba,\n\nEkim sürüm notlarımızda: izin onay akışlarının otomatikleştirilmesi, yeni bordro entegrasyonları ve işe alım raporlarında yenilenen panolar.\n\nÜcretsiz webinar: "2027\'de İK süreçlerini dijitalleştirmek" – 28 Ekim, 14:00\n\nPersonio SE & Co. KG · Münih\nAbonelikten çık | Tercihleri yönet',
      receivedAt: "2026-10-14T15:00:00+03:00",
      listUnsubscribe: true,
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    66,
    "synthetic",
    null,
    {
      from: { name: "Ozan Kurt", address: "ozankurt@mail.example" },
      subject: "Cumartesi kahvaltı?",
      bodyText:
        "Selam Deniz,\n\nCumartesi Moda'da kahvaltıya ne dersin? Ayça ve Burak da geliyor. 10:30 gibi Kadife Sokak'ta buluşalım mı?\n\nBu arada yeni iş arayışın nasıl gidiyor, anlatırsın.\n\nOzan",
      receivedAt: "2026-09-16T21:15:00+03:00",
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    67,
    "synthetic",
    'Gym membership "başvurunuz onaylandı" welcome mail.',
    {
      from: { name: "Form Spor Kulübü", address: "uyelik@formspor.example" },
      subject: "Üyelik başvurunuz onaylandı – Hoş geldiniz!",
      bodyText:
        "Merhaba Deniz,\n\nForm Spor Kulübü Kadıköy şubesi üyelik başvurunuz onaylandı. İlk antrenör görüşmeniz için resepsiyondan randevu alabilirsiniz.\n\nSporla kalın!\nForm Spor Kulübü",
      receivedAt: "2026-08-08T19:00:00+03:00",
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
  c(
    68,
    "synthetic",
    null,
    {
      from: { name: "Hızlı Kargo", address: "bildirim@hizlikargo.example" },
      subject: "Gönderiniz yola çıktı – Takip No: HK7741920036",
      bodyText:
        "Sayın Deniz Arslan,\n\nPazarix üzerinden verdiğiniz siparişe ait gönderiniz kargoya verilmiştir. Tahmini teslimat: 24 Eylül 2026.\n\nGönderinizi takip etmek için tıklayın.\n\nHızlı Kargo",
      receivedAt: "2026-09-22T16:40:00+03:00",
      bulk: true,
    },
    { category: "not_job", applicationId: null, suggestedStatus: null, company: null, role: null },
  ),
];
