import type { CvFixture } from "./types";

/* Turkish fixtures (tr-01 … tr-05). Bullet lists are shared between the document and `expected`
 * so highlights stay verbatim. */

/* ---------------------------------------------------------------- tr-01 */

const tr01Summary =
  "Dağıtık sistemler ve yüksek trafikli ödeme altyapıları üzerinde 8 yıllık deneyime sahip bir backend geliştiriciyim. Go ve Java ile ölçeklenebilir servisler tasarlıyor, Kubernetes üzerinde çalışan sistemlerin gözlemlenebilirliğini ve güvenilirliğini iyileştiriyorum.";
const tr01Anatolia = [
  "Ödeme altyapısını monolitten 25 mikroservise taşıyarak dağıtım süresini 2 saatten 15 dakikaya indirdim.",
  "PostgreSQL sorgu optimizasyonuyla API yanıt süresini %40 azalttım.",
  "Kubernetes üzerinde günde 3 milyon işlem işleyen servisler için nöbet ve alarm süreçlerini kurdum.",
  "4 kişilik backend ekibine teknik liderlik yaptım.",
];
const tr01Bogaz = [
  "Kredi başvuru sürecini dijitalleştiren REST API'leri Java ve Spring Boot ile geliştirdim.",
  "Birim test kapsamını %35'ten %80'e çıkardım.",
  "Aylık ₺250.000 tasarruf sağlayan önbellekleme katmanını Redis ile kurdum.",
];
const tr01Project = [
  "GitHub'da 900+ yıldız ve 20 katkıcı.",
  "PostgreSQL ve Redis sürücüleriyle zamanlanmış görev desteği.",
];

/* ---------------------------------------------------------------- tr-02 */

const tr02Summary =
  "Tüketici markalarında 8 yıllık performans ve dijital pazarlama deneyimi. Veriye dayalı kampanya kurgusu, büyük reklam bütçelerinin yönetimi ve ajans koordinasyonu konularında uzmanım; ekiplerimle birlikte ölçülebilir büyüme hedeflerine odaklanırım.";
const tr02Lale = [
  "Yıllık ₺12.000.000 dijital reklam bütçesini yöneterek ROAS'ı 3,1'den 4,6'ya çıkardım.",
  "E-ticaret sitesinin organik trafiğini SEO çalışmalarıyla 18 ayda %65 artırdım.",
  "5 kişilik pazarlama ekibini ve 2 dış ajansı yönettim.",
  "HubSpot ile pazarlama otomasyonu kurarak sepet terk oranını %12 düşürdüm.",
];
const tr02Kavak = [
  "Perakende ve FMCG sektörlerinden 14 müşterinin Google Ads ve Meta Ads kampanyalarını yönettim.",
  "Müşteri başına edinme maliyetini ortalama %27 azalttım.",
  "Haftalık raporlama sürecini Looker Studio panolarıyla otomatikleştirdim.",
];
const tr02Skills = [
  "Google Ads",
  "Meta Ads",
  "SEO / SEM",
  "Google Analytics 4",
  "HubSpot",
  "İçerik stratejisi",
  "Bütçe yönetimi",
];

/* ---------------------------------------------------------------- tr-03 */

const tr03Summary =
  "Liman ve depo operasyonlarında 9 yıllık deneyime sahip lojistik uzmanı. Depo yönetim sistemleri, ithalat-ihracat süreçleri ve saha ekiplerinin yönetimi konularında güçlüyüm; maliyet, stok doğruluğu ve teslim süresi iyileştirmelerine odaklanırım.";
const tr03Ege =
  "Aylık 4.500 TEU konteyner akışını ve 38 kişilik saha ekibini yönetiyorum. SAP EWM geçişini yürüterek sipariş hazırlama hatalarını %22 azalttım; rota planlamasıyla yıllık ₺3,4 milyon nakliye maliyeti tasarrufu sağladım. Gümrük müşavirleri ve armatörlerle günlük koordinasyondan sorumluyum.";
const tr03Kordon =
  "12.000 m² kapalı alana sahip dağıtım deposunun günlük operasyonundan sorumluydum. 5S ve Lean uygulamalarıyla stok sayım farklarını %1,8'den %0,4'e indirdim; vardiya planlamasını yeniden kurgulayarak fazla mesaiyi %30 azalttım.";
const tr03Skills = ["SAP EWM", "WMS", "Excel", "Power BI", "gümrük mevzuatı", "ADR", "Lean", "5S"];

/* ---------------------------------------------------------------- tr-04 */

const tr04Summary =
  "Üretim sektöründe 10 yıla yakın deneyime sahip bir İK profesyoneliyim. İşe alım, performans yönetimi ve çalışan bağlılığı projelerinde saha yöneticileriyle yakın çalışır, İK süreçlerini dijitalleştirmeyi severim.";
const tr04Uludag = [
  "1.200 çalışanlı üretim tesisinin İK iş ortaklığını yürütüyorum.",
  "Yeni performans yönetimi sistemini SAP SuccessFactors üzerinde devreye alarak hedef girişi oranını %95'e çıkardım.",
  "Mavi yaka işten ayrılma oranını yenilenen oryantasyon programıyla %18 azalttım.",
  "Yıllık ücret artış bütçesi planlamasında finans ekibiyle birlikte çalıştım.",
];
const tr04Marmara = [
  "Yılda ortalama 250 pozisyon için uçtan uca işe alım süreçlerini yönettim.",
  "Bordro ve özlük işlemlerini 600 çalışan için hatasız yürüttüm.",
  "Üniversitelerle staj programı kurarak 3 yılda 40 stajyer ağırladım.",
];

/* ---------------------------------------------------------------- tr-05 */

const tr05Summary =
  "8 yıllık deneyime sahip, ortaokul ve lise düzeyinde İngilizce öğreten bir öğretmenim. İletişimsel yaklaşımı dijital araçlarla birleştirir, öğrencilerimin hem sınav başarısını hem de konuşma özgüvenini artırmayı hedeflerim.";
const tr05Cinar = [
  "Lise hazırlık ve 9. sınıflarda 120 öğrenciye haftada 24 saat İngilizce dersi veriyorum.",
  "Öğrencilerin Cambridge B2 First sınavı başarı oranını iki yılda %62'den %85'e yükselttim.",
  "Okulun Erasmus+ değişim projesini koordine ettim.",
];
const tr05Gokkusagi = [
  "Yetişkin gruplarına A1–B2 seviyelerinde genel İngilizce dersleri verdim.",
  "Online ders programını Moodle üzerinde kurdum.",
];
const tr05Volunteer = [
  "Dezavantajlı mahallelerdeki çocuklar için haftalık okuma atölyeleri düzenledim.",
  "30 gönüllü öğretmenin katıldığı bir kitap bağışı kampanyası yürüttüm.",
];
const tr05Skills = [
  "Sınıf yönetimi",
  "Ölçme ve değerlendirme",
  "Google Classroom",
  "Moodle",
  "IELTS/TOEFL hazırlık",
  "Drama ile öğretim",
];

export const CV_FIXTURES_TR: readonly CvFixture[] = [
  {
    id: "tr-01-backend-odd-phone-projects",
    language: "tr",
    format: "pdf",
    layout: "single-column",
    notes:
      "Phone is written as '(0532) 555 12 34' and must be kept verbatim, dates use Turkish month names with 'Halen', the GNO score uses a decimal comma, and grouped skills ('Programlama:', 'Altyapı:', 'Veritabanı:') sit next to a separate 'Diller' section.",
    main: [
      { kind: "name", text: "Emre Yıldırım" },
      { kind: "line", text: "Kıdemli Yazılım Geliştirici" },
      {
        kind: "line",
        text: "İstanbul · emre.yildirim@example.com · (0532) 555 12 34 · github.com/emreyildirim-dev",
      },
      { kind: "heading", text: "Özet" },
      { kind: "paragraph", text: tr01Summary },
      { kind: "heading", text: "İş Deneyimi" },
      {
        kind: "entry",
        left: "Kıdemli Backend Geliştirici — Anatolia Yazılım A.Ş.",
        right: "Mart 2021 – Halen",
        sub: "İstanbul",
      },
      { kind: "bullets", items: tr01Anatolia },
      {
        kind: "entry",
        left: "Yazılım Geliştirici — Boğaz Fintek Teknoloji Ltd. Şti.",
        right: "Eylül 2018 – Şubat 2021",
        sub: "İstanbul",
      },
      { kind: "bullets", items: tr01Bogaz },
      { kind: "heading", text: "Eğitim" },
      {
        kind: "entry",
        left: "Bilgisayar Mühendisliği, Lisans — Boğaziçi Üniversitesi",
        right: "2014 – 2018",
        sub: "GNO: 3,21/4,00",
      },
      { kind: "heading", text: "Projeler" },
      {
        kind: "entry",
        left: "kuyruk-go — Go ile yazılmış açık kaynak iş kuyruğu kütüphanesi",
        sub: "github.com/emreyildirim-dev/kuyruk-go",
      },
      { kind: "bullets", items: tr01Project },
      { kind: "heading", text: "Yetenekler" },
      { kind: "line", text: "Programlama: Go, Java, Kotlin, SQL" },
      { kind: "line", text: "Altyapı: Kubernetes, Docker, Terraform, AWS" },
      { kind: "line", text: "Veritabanı: PostgreSQL, Redis, MongoDB" },
      { kind: "heading", text: "Sertifikalar" },
      { kind: "line", text: "AWS Certified Developer – Associate, Amazon Web Services, Haziran 2022" },
      { kind: "heading", text: "Diller" },
      { kind: "line", text: "Türkçe — Ana dil" },
      { kind: "line", text: "İngilizce — İleri seviye (C1)" },
    ],
    expected: {
      basics: {
        name: "Emre Yıldırım",
        label: "Kıdemli Yazılım Geliştirici",
        email: "emre.yildirim@example.com",
        phone: "(0532) 555 12 34",
        summary: tr01Summary,
        location: { city: "İstanbul" },
        profiles: [{ network: "GitHub", url: "github.com/emreyildirim-dev" }],
      },
      work: [
        {
          name: "Anatolia Yazılım A.Ş.",
          position: "Kıdemli Backend Geliştirici",
          location: "İstanbul",
          startDate: "2021-03",
          highlights: tr01Anatolia,
        },
        {
          name: "Boğaz Fintek Teknoloji Ltd. Şti.",
          position: "Yazılım Geliştirici",
          location: "İstanbul",
          startDate: "2018-09",
          endDate: "2021-02",
          highlights: tr01Bogaz,
        },
      ],
      education: [
        {
          institution: "Boğaziçi Üniversitesi",
          area: "Bilgisayar Mühendisliği",
          studyType: "Lisans",
          startDate: "2014",
          endDate: "2018",
          score: "3,21/4,00",
        },
      ],
      projects: [
        {
          name: "kuyruk-go",
          description: "Go ile yazılmış açık kaynak iş kuyruğu kütüphanesi",
          url: "github.com/emreyildirim-dev/kuyruk-go",
          highlights: tr01Project,
        },
      ],
      skills: [
        { name: "Programlama", keywords: ["Go", "Java", "Kotlin", "SQL"] },
        { name: "Altyapı", keywords: ["Kubernetes", "Docker", "Terraform", "AWS"] },
        { name: "Veritabanı", keywords: ["PostgreSQL", "Redis", "MongoDB"] },
      ],
      certificates: [
        { name: "AWS Certified Developer – Associate", issuer: "Amazon Web Services", date: "2022-06" },
      ],
      languages: [
        { language: "Türkçe", fluency: "Ana dil" },
        { language: "İngilizce", fluency: "İleri seviye (C1)" },
      ],
    },
  },
  {
    id: "tr-02-marketing-sidebar",
    language: "tr",
    format: "docx",
    layout: "sidebar",
    notes:
      "Sidebar contact/skills/languages in a DOCX two-column layout, abbreviated Turkish months ('Haz 2018 – Ara 2020') next to 'Günümüz', lira amounts with dot thousands separators, and an ungrouped sidebar skill list (expected as one skill per name).",
    sidebar: [
      { kind: "heading", text: "İletişim" },
      { kind: "line", text: "zeynep.aksoy@example.com" },
      { kind: "line", text: "+90 555 214 37 80" },
      { kind: "line", text: "Ankara" },
      { kind: "line", text: "linkedin.com/in/zeynepaksoy-pazarlama" },
      { kind: "heading", text: "Yetenekler" },
      { kind: "bullets", items: tr02Skills },
      { kind: "heading", text: "Diller" },
      { kind: "line", text: "Türkçe – Ana dil" },
      { kind: "line", text: "İngilizce – İleri seviye" },
      { kind: "line", text: "Almanca – Başlangıç (A2)" },
    ],
    main: [
      { kind: "name", text: "Zeynep Aksoy" },
      { kind: "line", text: "Dijital Pazarlama Müdürü" },
      { kind: "heading", text: "Profil" },
      { kind: "paragraph", text: tr02Summary },
      { kind: "heading", text: "Deneyim" },
      {
        kind: "entry",
        left: "Dijital Pazarlama Müdürü — Lale Kozmetik A.Ş.",
        right: "Ocak 2021 – Günümüz",
        sub: "Ankara",
      },
      { kind: "bullets", items: tr02Lale },
      {
        kind: "entry",
        left: "Performans Pazarlama Uzmanı — Kavak Medya Ajansı",
        right: "Haz 2018 – Ara 2020",
        sub: "İstanbul",
      },
      { kind: "bullets", items: tr02Kavak },
      { kind: "heading", text: "Eğitim" },
      { kind: "entry", left: "İşletme, Lisans — Orta Doğu Teknik Üniversitesi", right: "2013 – 2017" },
      { kind: "heading", text: "Sertifikalar" },
      { kind: "line", text: "Google Ads Arama Sertifikası — Google, Mart 2023" },
      { kind: "line", text: "HubSpot Inbound Marketing — HubSpot Academy, Ekim 2022" },
    ],
    expected: {
      basics: {
        name: "Zeynep Aksoy",
        label: "Dijital Pazarlama Müdürü",
        email: "zeynep.aksoy@example.com",
        phone: "+90 555 214 37 80",
        summary: tr02Summary,
        location: { city: "Ankara" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/zeynepaksoy-pazarlama" }],
      },
      work: [
        {
          name: "Lale Kozmetik A.Ş.",
          position: "Dijital Pazarlama Müdürü",
          location: "Ankara",
          startDate: "2021-01",
          highlights: tr02Lale,
        },
        {
          name: "Kavak Medya Ajansı",
          position: "Performans Pazarlama Uzmanı",
          location: "İstanbul",
          startDate: "2018-06",
          endDate: "2020-12",
          highlights: tr02Kavak,
        },
      ],
      education: [
        {
          institution: "Orta Doğu Teknik Üniversitesi",
          area: "İşletme",
          studyType: "Lisans",
          startDate: "2013",
          endDate: "2017",
        },
      ],
      certificates: [
        { name: "Google Ads Arama Sertifikası", issuer: "Google", date: "2023-03" },
        { name: "HubSpot Inbound Marketing", issuer: "HubSpot Academy", date: "2022-10" },
      ],
      skills: tr02Skills.map((name) => ({ name })),
      languages: [
        { language: "Türkçe", fluency: "Ana dil" },
        { language: "İngilizce", fluency: "İleri seviye" },
        { language: "Almanca", fluency: "Başlangıç (A2)" },
      ],
    },
  },
  {
    id: "tr-03-logistics-compact-inline-skills",
    language: "tr",
    format: "pdf",
    layout: "compact",
    notes:
      "Headline, city, email and phone share one '|'-separated line, dates are numeric 'MM.YYYY' with 'Günümüz', jobs are prose (expected as work.summary), and skills/languages/certificates are inline lists (skills expected ungrouped, one per name).",
    main: [
      { kind: "name", text: "Burak Demirtaş" },
      {
        kind: "line",
        text: "Lojistik Operasyon Uzmanı | İzmir | burak.demirtas@example.com | +90 555 873 41 09",
      },
      { kind: "heading", text: "Özet" },
      { kind: "paragraph", text: tr03Summary },
      { kind: "heading", text: "İş Deneyimi" },
      {
        kind: "entry",
        left: "Lojistik Operasyon Şefi · Ege Liman Lojistik A.Ş. · İzmir",
        right: "03.2020 – Günümüz",
      },
      { kind: "paragraph", text: tr03Ege },
      {
        kind: "entry",
        left: "Depo Sorumlusu · Kordon Dağıtım Ltd. Şti. · Manisa",
        right: "07.2016 – 02.2020",
      },
      { kind: "paragraph", text: tr03Kordon },
      { kind: "heading", text: "Eğitim" },
      { kind: "entry", left: "Lojistik Yönetimi, Lisans · Dokuz Eylül Üniversitesi", right: "2012 – 2016" },
      { kind: "heading", text: "Ek Bilgiler" },
      { kind: "line", text: `Yetenekler: ${tr03Skills.join(", ")}` },
      { kind: "line", text: "Diller: Türkçe (ana dil), İngilizce (orta seviye – B1)" },
      {
        kind: "line",
        text: "Sertifikalar: SRC 2 Belgesi (2017) · Lean Six Sigma Yeşil Kuşak, Ege Kalite Akademisi (Kasım 2021)",
      },
    ],
    expected: {
      basics: {
        name: "Burak Demirtaş",
        label: "Lojistik Operasyon Uzmanı",
        email: "burak.demirtas@example.com",
        phone: "+90 555 873 41 09",
        summary: tr03Summary,
        location: { city: "İzmir" },
      },
      work: [
        {
          name: "Ege Liman Lojistik A.Ş.",
          position: "Lojistik Operasyon Şefi",
          location: "İzmir",
          startDate: "2020-03",
          summary: tr03Ege,
        },
        {
          name: "Kordon Dağıtım Ltd. Şti.",
          position: "Depo Sorumlusu",
          location: "Manisa",
          startDate: "2016-07",
          endDate: "2020-02",
          summary: tr03Kordon,
        },
      ],
      education: [
        {
          institution: "Dokuz Eylül Üniversitesi",
          area: "Lojistik Yönetimi",
          studyType: "Lisans",
          startDate: "2012",
          endDate: "2016",
        },
      ],
      skills: tr03Skills.map((name) => ({ name })),
      languages: [
        { language: "Türkçe", fluency: "ana dil" },
        { language: "İngilizce", fluency: "orta seviye – B1" },
      ],
      certificates: [
        { name: "SRC 2 Belgesi", date: "2017" },
        { name: "Lean Six Sigma Yeşil Kuşak", issuer: "Ege Kalite Akademisi", date: "2021-11" },
      ],
    },
  },
  {
    id: "tr-04-hr-education-end-year-only",
    language: "tr",
    format: "docx",
    layout: "single-column",
    notes:
      "The master's degree shows only 'Mezuniyet: 2019' (endDate only, no startDate), employer names are long legal forms ('San. ve Tic. A.Ş.') that must not be shortened, and skills are grouped ('İK Süreçleri:', 'Sistemler:').",
    main: [
      { kind: "name", text: "Elif Şahin" },
      { kind: "line", text: "İnsan Kaynakları İş Ortağı" },
      {
        kind: "line",
        text: "Bursa · elif.sahin@example.com · +90 555 390 66 12 · linkedin.com/in/elifsahin-ik",
      },
      { kind: "heading", text: "Hakkımda" },
      { kind: "paragraph", text: tr04Summary },
      { kind: "heading", text: "İş Deneyimi" },
      {
        kind: "entry",
        left: "İnsan Kaynakları İş Ortağı — Uludağ Otomotiv Yan Sanayi A.Ş.",
        right: "Nisan 2020 – Halen",
        sub: "Bursa",
      },
      { kind: "bullets", items: tr04Uludag },
      {
        kind: "entry",
        left: "İK Uzmanı — Marmara Tekstil San. ve Tic. A.Ş.",
        right: "Ağustos 2016 – Mart 2020",
        sub: "Bursa",
      },
      { kind: "bullets", items: tr04Marmara },
      { kind: "heading", text: "Eğitim" },
      {
        kind: "entry",
        left: "Çalışma Ekonomisi ve Endüstri İlişkileri, Yüksek Lisans — Bursa Uludağ Üniversitesi",
        right: "Mezuniyet: 2019",
      },
      { kind: "entry", left: "İşletme, Lisans — Anadolu Üniversitesi", right: "2010 – 2014" },
      { kind: "heading", text: "Yetenekler" },
      { kind: "line", text: "İK Süreçleri: İşe alım, performans yönetimi, ücret ve yan haklar, bordro" },
      { kind: "line", text: "Sistemler: SAP SuccessFactors, Workday, Excel" },
      { kind: "heading", text: "Sertifikalar" },
      { kind: "line", text: "SHRM-CP — SHRM, 2022" },
      { kind: "heading", text: "Diller" },
      { kind: "line", text: "İngilizce: İleri seviye" },
      { kind: "line", text: "Almanca: Orta seviye" },
    ],
    expected: {
      basics: {
        name: "Elif Şahin",
        label: "İnsan Kaynakları İş Ortağı",
        email: "elif.sahin@example.com",
        phone: "+90 555 390 66 12",
        summary: tr04Summary,
        location: { city: "Bursa" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/elifsahin-ik" }],
      },
      work: [
        {
          name: "Uludağ Otomotiv Yan Sanayi A.Ş.",
          position: "İnsan Kaynakları İş Ortağı",
          location: "Bursa",
          startDate: "2020-04",
          highlights: tr04Uludag,
        },
        {
          name: "Marmara Tekstil San. ve Tic. A.Ş.",
          position: "İK Uzmanı",
          location: "Bursa",
          startDate: "2016-08",
          endDate: "2020-03",
          highlights: tr04Marmara,
        },
      ],
      education: [
        {
          institution: "Bursa Uludağ Üniversitesi",
          area: "Çalışma Ekonomisi ve Endüstri İlişkileri",
          studyType: "Yüksek Lisans",
          endDate: "2019",
        },
        {
          institution: "Anadolu Üniversitesi",
          area: "İşletme",
          studyType: "Lisans",
          startDate: "2010",
          endDate: "2014",
        },
      ],
      skills: [
        {
          name: "İK Süreçleri",
          keywords: ["İşe alım", "performans yönetimi", "ücret ve yan haklar", "bordro"],
        },
        { name: "Sistemler", keywords: ["SAP SuccessFactors", "Workday", "Excel"] },
      ],
      certificates: [{ name: "SHRM-CP", issuer: "SHRM", date: "2022" }],
      languages: [
        { language: "İngilizce", fluency: "İleri seviye" },
        { language: "Almanca", fluency: "Orta seviye" },
      ],
    },
  },
  {
    id: "tr-05-teacher-sidebar-volunteer",
    language: "tr",
    format: "pdf",
    layout: "sidebar",
    notes:
      "Two-column PDF whose sidebar (contact, ungrouped skills expected one per name, CEFR languages) can interleave with the main column, plus a 'Gönüllü Çalışmalar' section that belongs in volunteer, not work.",
    sidebar: [
      { kind: "heading", text: "İletişim" },
      { kind: "line", text: "ayse.kilic@example.com" },
      { kind: "line", text: "+90 555 642 18 03" },
      { kind: "line", text: "Eskişehir" },
      { kind: "line", text: "linkedin.com/in/aysekilic-egitim" },
      { kind: "heading", text: "Yetenekler" },
      { kind: "bullets", items: tr05Skills },
      { kind: "heading", text: "Diller" },
      { kind: "line", text: "Türkçe – Ana dil" },
      { kind: "line", text: "İngilizce – C2" },
      { kind: "line", text: "İspanyolca – B1" },
    ],
    main: [
      { kind: "name", text: "Ayşe Kılıç" },
      { kind: "line", text: "İngilizce Öğretmeni" },
      { kind: "heading", text: "Profil" },
      { kind: "paragraph", text: tr05Summary },
      { kind: "heading", text: "İş Deneyimi" },
      {
        kind: "entry",
        left: "İngilizce Öğretmeni — Özel Çınar Koleji",
        right: "Eylül 2019 – Halen",
        sub: "Eskişehir",
      },
      { kind: "bullets", items: tr05Cinar },
      {
        kind: "entry",
        left: "İngilizce Öğretmeni — Gökkuşağı Dil Kursu",
        right: "Şubat 2017 – Haziran 2019",
        sub: "Ankara",
      },
      { kind: "bullets", items: tr05Gokkusagi },
      { kind: "heading", text: "Eğitim" },
      { kind: "entry", left: "İngiliz Dili Eğitimi, Lisans — Hacettepe Üniversitesi", right: "2012 – 2016" },
      { kind: "heading", text: "Sertifikalar" },
      { kind: "line", text: "CELTA — Cambridge English, Temmuz 2018" },
      { kind: "heading", text: "Gönüllü Çalışmalar" },
      {
        kind: "entry",
        left: "Gönüllü Eğitmen — Eskişehir Kitap Dostları Derneği",
        right: "2018 – 2021",
      },
      { kind: "bullets", items: tr05Volunteer },
    ],
    expected: {
      basics: {
        name: "Ayşe Kılıç",
        label: "İngilizce Öğretmeni",
        email: "ayse.kilic@example.com",
        phone: "+90 555 642 18 03",
        summary: tr05Summary,
        location: { city: "Eskişehir" },
        profiles: [{ network: "LinkedIn", url: "linkedin.com/in/aysekilic-egitim" }],
      },
      work: [
        {
          name: "Özel Çınar Koleji",
          position: "İngilizce Öğretmeni",
          location: "Eskişehir",
          startDate: "2019-09",
          highlights: tr05Cinar,
        },
        {
          name: "Gökkuşağı Dil Kursu",
          position: "İngilizce Öğretmeni",
          location: "Ankara",
          startDate: "2017-02",
          endDate: "2019-06",
          highlights: tr05Gokkusagi,
        },
      ],
      education: [
        {
          institution: "Hacettepe Üniversitesi",
          area: "İngiliz Dili Eğitimi",
          studyType: "Lisans",
          startDate: "2012",
          endDate: "2016",
        },
      ],
      certificates: [{ name: "CELTA", issuer: "Cambridge English", date: "2018-07" }],
      volunteer: [
        {
          organization: "Eskişehir Kitap Dostları Derneği",
          position: "Gönüllü Eğitmen",
          startDate: "2018",
          endDate: "2021",
          highlights: tr05Volunteer,
        },
      ],
      skills: tr05Skills.map((name) => ({ name })),
      languages: [
        { language: "Türkçe", fluency: "Ana dil" },
        { language: "İngilizce", fluency: "C2" },
        { language: "İspanyolca", fluency: "B1" },
      ],
    },
  },
];
