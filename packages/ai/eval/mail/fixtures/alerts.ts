import type { AlertEvalCase } from "../types";

/**
 * Job-alert emails shaped like the LinkedIn, Indeed, StepStone, Kariyer.net, XING and Glassdoor
 * templates (text and HTML), plus a company careers alert for the generic reading. Fictional
 * employers; tracking parameters and redirect hosts as the boards send them.
 */
export const ALERT_CASES: AlertEvalCase[] = [
  {
    id: "alert-en-01",
    language: "en",
    board: "linkedin",
    format: "text",
    hard: null,
    message: {
      from: { name: "LinkedIn Job Alerts", address: "jobalerts-noreply@linkedin.com" },
      subject: "“frontend engineer”: 3 new jobs in Berlin",
      receivedAt: "2026-10-20T07:31:00+02:00",
      html: null,
      text: `Your job alert for frontend engineer in Berlin
3 new jobs match your preferences.

Senior Frontend Engineer
Northbeam Studio · Berlin, Germany (Hybrid)
Actively recruiting
View job: https://www.linkedin.com/comm/jobs/view/4051229871/?trackingId=Zx1%2Bq0RkT9e&refId=8f3a&lipi=urn%3Ali%3Apage%3Aemail_job_alert&midToken=AQH&trk=eml-email_job_alert_digest_01-job_card-0-view_job

Frontend Developer (React)
Mercator Travel · Berlin, Germany (Remote)
Be an early applicant
View job: https://www.linkedin.com/comm/jobs/view/4051230017/?trackingId=Ab9&refId=8f3a&trk=eml-email_job_alert_digest_01-job_card-1-view_job

Staff Engineer, Web Platform
Baltic Byte · Berlin, Germany
View job: https://www.linkedin.com/comm/jobs/view/4051231190/?trackingId=Qq2&refId=8f3a&trk=eml-email_job_alert_digest_01-job_card-2-view_job

See all jobs: https://www.linkedin.com/comm/jobs/search?keywords=frontend%20engineer&location=Berlin&trk=eml-email_job_alert_digest_01-see_all

Unsubscribe: https://www.linkedin.com/comm/jobs/alerts?trk=eml-unsubscribe
Help: https://www.linkedin.com/help/linkedin?trk=eml-help
© 2026 LinkedIn Ireland Unlimited Company, Wilton Plaza, Dublin 2.`,
    },
    expected: [
      {
        url: "https://www.linkedin.com/jobs/view/4051229871",
        title: "Senior Frontend Engineer",
        company: "Northbeam Studio",
        location: "Berlin, Germany (Hybrid)",
      },
      {
        url: "https://www.linkedin.com/jobs/view/4051230017",
        title: "Frontend Developer (React)",
        company: "Mercator Travel",
        location: "Berlin, Germany (Remote)",
      },
      {
        url: "https://www.linkedin.com/jobs/view/4051231190",
        title: "Staff Engineer, Web Platform",
        company: "Baltic Byte",
        location: "Berlin, Germany",
      },
    ],
  },
  {
    id: "alert-de-01",
    language: "de",
    board: "linkedin",
    format: "html",
    hard: "HTML only: logo and title link to the same job; badges between cards.",
    message: {
      from: { name: "LinkedIn", address: "jobs-listings@linkedin.com" },
      subject: "Neue Jobs für „Backend Entwickler“ in München",
      receivedAt: "2026-10-21T08:05:00+02:00",
      text: "Neue Jobs für dich\n\nBackend Entwickler (m/w/d)\nAlpenwerk Software · München\n\nSenior Java Entwickler\nIsarlogik GmbH · München, Bayern, Deutschland (Hybrid)",
      html: `<html><body><table width="100%"><tr><td><h2>Neue Jobs für dich</h2></td></tr>
<tr><td><table><tr>
<td><a href="https://www.linkedin.com/comm/jobs/view/4062118830/?trackingId=k1&amp;refId=r1&amp;trk=eml-email_job_alert_digest_01-job_card-0-logo"><img src="https://media.licdn.com/dms/image/logo1.png" alt="Alpenwerk Software"></a></td>
<td><a href="https://www.linkedin.com/comm/jobs/view/4062118830/?trackingId=k1&amp;refId=r1&amp;trk=eml-email_job_alert_digest_01-job_card-0-jobcard_body">Backend Entwickler (m/w/d)</a>
<p>Alpenwerk Software · München</p>
<p>Schnellbewerbung</p></td>
</tr></table></td></tr>
<tr><td><table><tr>
<td><a href="https://www.linkedin.com/comm/jobs/view/4062120457/?trackingId=k2&amp;refId=r1&amp;trk=eml-email_job_alert_digest_01-job_card-1-logo"><img src="https://media.licdn.com/dms/image/logo2.png" alt="Isarlogik"></a></td>
<td><a href="https://www.linkedin.com/comm/jobs/view/4062120457/?trackingId=k2&amp;refId=r1&amp;trk=eml-email_job_alert_digest_01-job_card-1-jobcard_body">Senior Java Entwickler</a>
<p>Isarlogik GmbH · München, Bayern, Deutschland (Hybrid)</p>
<p>Gesponsert</p></td>
</tr></table></td></tr>
<tr><td><a href="https://www.linkedin.com/comm/jobs/search?keywords=Backend&amp;trk=eml-see_all">Alle Jobs anzeigen</a></td></tr>
<tr><td><p>Sie erhalten diese E-Mail, weil Sie Job-Benachrichtigungen abonniert haben. <a href="https://www.linkedin.com/comm/jobs/alerts?trk=unsub">Abmelden</a></p></td></tr>
</table></body></html>`,
    },
    expected: [
      {
        url: "https://www.linkedin.com/jobs/view/4062118830",
        title: "Backend Entwickler (m/w/d)",
        company: "Alpenwerk Software",
        location: "München",
      },
      {
        url: "https://www.linkedin.com/jobs/view/4062120457",
        title: "Senior Java Entwickler",
        company: "Isarlogik GmbH",
        location: "München, Bayern, Deutschland (Hybrid)",
      },
    ],
  },
  {
    id: "alert-tr-01",
    language: "tr",
    board: "linkedin",
    format: "text",
    hard: null,
    message: {
      from: { name: "LinkedIn İş İlanı Bildirimleri", address: "jobalerts-noreply@linkedin.com" },
      subject: "“yazılım mühendisi”: İstanbul'da 2 yeni iş ilanı",
      receivedAt: "2026-10-22T09:12:00+03:00",
      html: null,
      text: `Merhaba Deniz,
İş ilanı bildiriminize uygun 2 yeni ilan var.

Kıdemli Yazılım Mühendisi
Boğaziçi Ödeme Sistemleri · İstanbul, Türkiye (Hibrit)
İlanı görüntüle: https://www.linkedin.com/comm/jobs/view/4070001122/?trackingId=t1&refId=x&trk=eml-email_job_alert

Mobil Geliştirici (iOS)
Pera Labs · İstanbul, Türkiye
İlanı görüntüle: https://www.linkedin.com/comm/jobs/view/4070003345/?trackingId=t2&refId=x&trk=eml-email_job_alert

Bu e-postayı, iş ilanı bildirimlerine abone olduğunuz için alıyorsunuz. Aboneliği iptal et: https://www.linkedin.com/comm/jobs/alerts?trk=unsub`,
    },
    expected: [
      {
        url: "https://www.linkedin.com/jobs/view/4070001122",
        title: "Kıdemli Yazılım Mühendisi",
        company: "Boğaziçi Ödeme Sistemleri",
        location: "İstanbul, Türkiye (Hibrit)",
      },
      {
        url: "https://www.linkedin.com/jobs/view/4070003345",
        title: "Mobil Geliştirici (iOS)",
        company: "Pera Labs",
        location: "İstanbul, Türkiye",
      },
    ],
  },
  {
    id: "alert-en-02",
    language: "en",
    board: "indeed",
    format: "text",
    hard: "Salary and posting age lines vary per card.",
    message: {
      from: { name: "Indeed", address: "alert@indeed.com" },
      subject: "3 new backend engineer jobs in Remote",
      receivedAt: "2026-10-19T06:02:00-04:00",
      html: null,
      text: `Backend Engineer jobs in Remote

Backend Engineer (Go)
Quarry Systems - Remote
$140,000 - $165,000 a year
Easily apply
Just posted
https://www.indeed.com/rc/clk?jk=3f2a9c1d7e6b5a40&from=ja&qd=abc&rd=1&tk=1hg2&alid=5f&utm_campaign=job_alerts

Senior Backend Engineer
Northwind Ledger - Remote in United States
Responsive employer
2 days ago
https://www.indeed.com/rc/clk?jk=a81c0d22e93f4b17&from=ja&qd=abc&rd=1&tk=1hg2&alid=5f

Platform Engineer
Fernway - New York, NY
$70 - $85 an hour
5 days ago
https://www.indeed.com/pagead/clk?jk=0be7713c9d2a6f58&from=ja&tk=1hg2&alid=5f

See all jobs: https://www.indeed.com/jobs?q=backend+engineer&l=Remote&from=ja
You're receiving this email because you created a job alert on Indeed. Unsubscribe: https://www.indeed.com/alert/unsubscribe?id=5f`,
    },
    expected: [
      {
        url: "https://www.indeed.com/viewjob?jk=3f2a9c1d7e6b5a40",
        title: "Backend Engineer (Go)",
        company: "Quarry Systems",
        location: "Remote",
        salary: { min: 140_000, max: 165_000, currency: "USD", period: "year" },
        postedAt: "2026-10-19T06:02:00-04:00",
      },
      {
        url: "https://www.indeed.com/viewjob?jk=a81c0d22e93f4b17",
        title: "Senior Backend Engineer",
        company: "Northwind Ledger",
        location: "Remote in United States",
        postedAt: "2026-10-17T06:02:00-04:00",
      },
      {
        url: "https://www.indeed.com/viewjob?jk=0be7713c9d2a6f58",
        title: "Platform Engineer",
        company: "Fernway",
        location: "New York, NY",
        salary: { min: 70, max: 85, currency: "USD", period: "hour" },
        postedAt: "2026-10-14T06:02:00-04:00",
      },
    ],
  },
  {
    id: "alert-de-02",
    language: "de",
    board: "indeed",
    format: "html",
    hard: "Card-wide links: the link comes after the card's lines.",
    message: {
      from: { name: "Indeed", address: "donotreply@jobalert.indeed.com" },
      subject: "Neue Jobs: Data Analyst in Hamburg",
      receivedAt: "2026-10-18T07:40:00+02:00",
      text: "Data Analyst Jobs in Hamburg\n\nData Analyst (m/w/d)\nHanseatic Freight GmbH - Hamburg\n\nJunior Data Analyst\nElbstrom Energie - Hamburg-Altona",
      html: `<div style="font-family:Arial">
<h1>Data Analyst Jobs in Hamburg</h1>
<a href="https://de.indeed.com/rc/clk?jk=7c1e55d0a9b34f21&amp;from=ja&amp;tk=1hh&amp;alid=6a" style="text-decoration:none">
  <div><b>Data Analyst (m/w/d)</b></div>
  <div>Hanseatic Freight GmbH - Hamburg</div>
  <div>52.000 € - 64.000 € pro Jahr</div>
  <div>Heute</div>
</a>
<a href="https://de.indeed.com/rc/clk?jk=d40ba7e86f1c2093&amp;from=ja&amp;tk=1hh&amp;alid=6a" style="text-decoration:none">
  <div><b>Junior Data Analyst</b></div>
  <div>Elbstrom Energie - Hamburg-Altona</div>
  <div>vor 3 Tagen</div>
</a>
<a href="https://de.indeed.com/rc/clk?jk=19e8f0c3b7a64d55&amp;from=ja&amp;tk=1hh&amp;alid=6a" style="text-decoration:none">
  <div><b>Business Intelligence Analyst</b></div>
  <div>Nordkai Logistik AG - Hamburg</div>
  <div>4.200 € pro Monat</div>
  <div>vor 6 Tagen</div>
</a>
<p><a href="https://de.indeed.com/jobs?q=data+analyst&amp;l=Hamburg">Alle Jobs ansehen</a></p>
<p>Sie erhalten diese E-Mail, weil Sie einen Job-Alert erstellt haben. <a href="https://de.indeed.com/alert/unsubscribe?id=6a">Abmelden</a></p>
</div>`,
    },
    expected: [
      {
        url: "https://de.indeed.com/viewjob?jk=7c1e55d0a9b34f21",
        title: "Data Analyst (m/w/d)",
        company: "Hanseatic Freight GmbH",
        location: "Hamburg",
        salary: { min: 52_000, max: 64_000, currency: "EUR", period: "year" },
        postedAt: "2026-10-18T07:40:00+02:00",
      },
      {
        url: "https://de.indeed.com/viewjob?jk=d40ba7e86f1c2093",
        title: "Junior Data Analyst",
        company: "Elbstrom Energie",
        location: "Hamburg-Altona",
        postedAt: "2026-10-15T07:40:00+02:00",
      },
      {
        url: "https://de.indeed.com/viewjob?jk=19e8f0c3b7a64d55",
        title: "Business Intelligence Analyst",
        company: "Nordkai Logistik AG",
        location: "Hamburg",
        salary: { min: 4_200, max: null, currency: "EUR", period: "month" },
        postedAt: "2026-10-12T07:40:00+02:00",
      },
    ],
  },
  {
    id: "alert-tr-02",
    language: "tr",
    board: "indeed",
    format: "text",
    hard: null,
    message: {
      from: { name: "Indeed", address: "alert@indeed.com" },
      subject: "Ankara'da 2 yeni veri bilimci ilanı",
      receivedAt: "2026-10-21T08:00:00+03:00",
      html: null,
      text: `Ankara'da veri bilimci iş ilanları

Veri Bilimci
Anadolu Sigorta Teknoloji - Ankara
2 gün önce
https://tr.indeed.com/rc/clk?jk=5d6e7f8091a2b3c4&from=ja&tk=1hi

Kıdemli Veri Mühendisi
Kızılay Yazılım - Çankaya, Ankara
45.000 TL - 60.000 TL / ay
Bugün
https://tr.indeed.com/rc/clk?jk=c4b3a2918f7e6d5c&from=ja&tk=1hi

Tüm ilanları gör: https://tr.indeed.com/jobs?q=veri+bilimci&l=Ankara`,
    },
    expected: [
      {
        url: "https://tr.indeed.com/viewjob?jk=5d6e7f8091a2b3c4",
        title: "Veri Bilimci",
        company: "Anadolu Sigorta Teknoloji",
        location: "Ankara",
        postedAt: "2026-10-19T08:00:00+03:00",
      },
      {
        url: "https://tr.indeed.com/viewjob?jk=c4b3a2918f7e6d5c",
        title: "Kıdemli Veri Mühendisi",
        company: "Kızılay Yazılım",
        location: "Çankaya, Ankara",
        salary: { min: 45_000, max: 60_000, currency: "TRY", period: "month" },
        postedAt: "2026-10-21T08:00:00+03:00",
      },
    ],
  },
  {
    id: "alert-de-03",
    language: "de",
    board: "stepstone",
    format: "text",
    hard: null,
    message: {
      from: { name: "StepStone", address: "jobagent@stepstone.de" },
      subject: "Ihr Job-Agent: 3 neue Jobs für „DevOps Engineer“",
      receivedAt: "2026-10-20T06:15:00+02:00",
      html: null,
      text: `Hallo Deniz,
Ihr Job-Agent hat 3 neue Stellenangebote für Sie gefunden.

DevOps Engineer (m/w/d)
Rheinwerk Cloud GmbH
Köln
vor 1 Tag
Zum Job: https://www.stepstone.de/stellenangebote--DevOps-Engineer-m-w-d-Koeln-Rheinwerk-Cloud-GmbH--10234567-inline.html?rltr=1_1_25_seorl_m_0_0_0_0_0_0&cid=JobAgent_mail&stepstone_cmp=jobagent

Senior Site Reliability Engineer (all genders)
Mainfeld Digital AG
Frankfurt am Main
Teilweise Home-Office
vor 2 Tagen
Zum Job: https://www.stepstone.de/stellenangebote--Senior-Site-Reliability-Engineer-all-genders-Frankfurt-am-Main-Mainfeld-Digital-AG--10235590-inline.html?cid=JobAgent_mail

Cloud Platform Engineer
Spreeblick Systems GmbH
Berlin
Heute
Zum Job: https://www.stepstone.de/stellenangebote--Cloud-Platform-Engineer-Berlin-Spreeblick-Systems-GmbH--10236011-inline.html?cid=JobAgent_mail

Job-Agent bearbeiten: https://www.stepstone.de/jobagent/settings
Abmelden: https://www.stepstone.de/jobagent/unsubscribe?id=99`,
    },
    expected: [
      {
        url: "https://www.stepstone.de/stellenangebote--DevOps-Engineer-m-w-d-Koeln-Rheinwerk-Cloud-GmbH--10234567-inline.html",
        title: "DevOps Engineer (m/w/d)",
        company: "Rheinwerk Cloud GmbH",
        location: "Köln",
        postedAt: "2026-10-19T06:15:00+02:00",
      },
      {
        url: "https://www.stepstone.de/stellenangebote--Senior-Site-Reliability-Engineer-all-genders-Frankfurt-am-Main-Mainfeld-Digital-AG--10235590-inline.html",
        title: "Senior Site Reliability Engineer (all genders)",
        company: "Mainfeld Digital AG",
        location: "Frankfurt am Main",
        postedAt: "2026-10-18T06:15:00+02:00",
      },
      {
        url: "https://www.stepstone.de/stellenangebote--Cloud-Platform-Engineer-Berlin-Spreeblick-Systems-GmbH--10236011-inline.html",
        title: "Cloud Platform Engineer",
        company: "Spreeblick Systems GmbH",
        location: "Berlin",
        postedAt: "2026-10-20T06:15:00+02:00",
      },
    ],
  },
  {
    id: "alert-de-04",
    language: "de",
    board: "stepstone",
    format: "html",
    hard: "Title links with company and location in table cells below.",
    message: {
      from: { name: "StepStone Job-Agent", address: "noreply@stepstone.de" },
      subject: "2 neue Jobs: Produktmanager",
      receivedAt: "2026-10-22T06:30:00+02:00",
      text: "2 neue Jobs für Sie\nProduktmanager Digital (m/w/d)\nNeckarblick Versicherung\nStuttgart",
      html: `<table>
<tr><td><h3>2 neue Jobs für Sie</h3></td></tr>
<tr><td><a href="https://www.stepstone.de/stellenangebote--Produktmanager-Digital-m-w-d-Stuttgart-Neckarblick-Versicherung--10240012-inline.html?cid=JobAgent_mail&amp;utm_source=jobagent">Produktmanager Digital (m/w/d)</a></td></tr>
<tr><td>Neckarblick Versicherung</td></tr>
<tr><td>Stuttgart</td></tr>
<tr><td>55.000 - 70.000 €/Jahr (geschätzt)</td></tr>
<tr><td><a href="https://www.stepstone.de/stellenangebote--Product-Owner-E-Commerce-Leipzig-Saxonia-Handel-GmbH--10240388-inline.html?cid=JobAgent_mail&amp;utm_source=jobagent">Product Owner E-Commerce</a></td></tr>
<tr><td>Saxonia Handel GmbH</td></tr>
<tr><td>Leipzig</td></tr>
<tr><td><a href="https://www.stepstone.de/jobagent/settings">Job-Agent bearbeiten</a> · <a href="https://www.stepstone.de/jobagent/unsubscribe?id=12">Abmelden</a></td></tr>
</table>`,
    },
    expected: [
      {
        url: "https://www.stepstone.de/stellenangebote--Produktmanager-Digital-m-w-d-Stuttgart-Neckarblick-Versicherung--10240012-inline.html",
        title: "Produktmanager Digital (m/w/d)",
        company: "Neckarblick Versicherung",
        location: "Stuttgart",
        salary: { min: 55_000, max: 70_000, currency: "EUR", period: "year" },
      },
      {
        url: "https://www.stepstone.de/stellenangebote--Product-Owner-E-Commerce-Leipzig-Saxonia-Handel-GmbH--10240388-inline.html",
        title: "Product Owner E-Commerce",
        company: "Saxonia Handel GmbH",
        location: "Leipzig",
      },
    ],
  },
  {
    id: "alert-tr-03",
    language: "tr",
    board: "kariyer",
    format: "text",
    hard: null,
    message: {
      from: { name: "Kariyer.net", address: "bildirim@kariyer.net" },
      subject: "Aramana uygun 3 yeni ilan var!",
      receivedAt: "2026-10-21T10:00:00+03:00",
      html: null,
      text: `Merhaba Deniz,
Kayıtlı aramana uygun yeni iş ilanları:

Frontend Developer
Kervan Teknoloji A.Ş.
İstanbul(Avr.)
2 gün önce
https://www.kariyer.net/is-ilani/kervan-teknoloji-a-s-frontend-developer-3912345?utm_source=bildirim&utm_medium=email&utm_campaign=kayitli-arama

Yazılım Geliştirme Uzmanı
Lale Bank
İstanbul(Asya)
Bugün
https://www.kariyer.net/is-ilani/lale-bank-yazilim-gelistirme-uzmani-3913377?utm_source=bildirim&utm_medium=email

Full Stack Geliştirici
Pazarix
İzmir
1 gün önce
https://www.kariyer.net/is-ilani/pazarix-full-stack-gelistirici-3914002?utm_source=bildirim

Tüm ilanlar: https://www.kariyer.net/is-ilanlari?kw=frontend
Bildirim ayarları: https://www.kariyer.net/ayarlar/bildirimler`,
    },
    expected: [
      {
        url: "https://www.kariyer.net/is-ilani/kervan-teknoloji-a-s-frontend-developer-3912345",
        title: "Frontend Developer",
        company: "Kervan Teknoloji A.Ş.",
        location: "İstanbul(Avr.)",
        postedAt: "2026-10-19T10:00:00+03:00",
      },
      {
        url: "https://www.kariyer.net/is-ilani/lale-bank-yazilim-gelistirme-uzmani-3913377",
        title: "Yazılım Geliştirme Uzmanı",
        company: "Lale Bank",
        location: "İstanbul(Asya)",
        postedAt: "2026-10-21T10:00:00+03:00",
      },
      {
        url: "https://www.kariyer.net/is-ilani/pazarix-full-stack-gelistirici-3914002",
        title: "Full Stack Geliştirici",
        company: "Pazarix",
        location: "İzmir",
        postedAt: "2026-10-20T10:00:00+03:00",
      },
    ],
  },
  {
    id: "alert-tr-04",
    language: "tr",
    board: "kariyer",
    format: "html",
    hard: "HTML cards with an 'İlanı İncele' button repeating the link.",
    message: {
      from: { name: "Kariyer.net", address: "noreply@kariyer.net" },
      subject: "Senin için seçtiğimiz ilanlar",
      receivedAt: "2026-10-23T11:20:00+03:00",
      text: "Senin için seçtiğimiz ilanlar\n\nSatın Alma Uzmanı\nEge Tekstil San. ve Tic. A.Ş.\nDenizli",
      html: `<table><tr><td><h2>Senin için seçtiğimiz ilanlar</h2></td></tr>
<tr><td>
<a href="https://www.kariyer.net/is-ilani/ege-tekstil-satin-alma-uzmani-3920110?utm_source=mail&amp;utm_campaign=onerilen">Satın Alma Uzmanı</a><br>
Ege Tekstil San. ve Tic. A.Ş.<br>
Denizli<br>
<a href="https://www.kariyer.net/is-ilani/ege-tekstil-satin-alma-uzmani-3920110?utm_source=mail&amp;utm_campaign=onerilen&amp;btn=1">İlanı İncele</a>
</td></tr>
<tr><td>
<a href="https://www.kariyer.net/is-ilani/marmara-lojistik-lojistik-planlama-sorumlusu-3920577?utm_source=mail&amp;utm_campaign=onerilen">Lojistik Planlama Sorumlusu</a><br>
Marmara Lojistik<br>
Kocaeli<br>
<a href="https://www.kariyer.net/is-ilani/marmara-lojistik-lojistik-planlama-sorumlusu-3920577?utm_source=mail&amp;utm_campaign=onerilen&amp;btn=1">İlanı İncele</a>
</td></tr>
<tr><td><a href="https://www.kariyer.net/ayarlar/bildirimler">Bildirim ayarları</a></td></tr></table>`,
    },
    expected: [
      {
        url: "https://www.kariyer.net/is-ilani/ege-tekstil-satin-alma-uzmani-3920110",
        title: "Satın Alma Uzmanı",
        company: "Ege Tekstil San. ve Tic. A.Ş.",
        location: "Denizli",
      },
      {
        url: "https://www.kariyer.net/is-ilani/marmara-lojistik-lojistik-planlama-sorumlusu-3920577",
        title: "Lojistik Planlama Sorumlusu",
        company: "Marmara Lojistik",
        location: "Kocaeli",
      },
    ],
  },
  {
    id: "alert-de-05",
    language: "de",
    board: "xing",
    format: "text",
    hard: null,
    message: {
      from: { name: "XING Jobs", address: "jobs@mail.xing.com" },
      subject: "Neue Jobs, die zu Ihnen passen",
      receivedAt: "2026-10-17T18:45:00+02:00",
      html: null,
      text: `Neue Jobs, die zu Ihnen passen

UX Designer (w/m/d)
Elbphilia Media GmbH
Hamburg
https://www.xing.com/jobs/hamburg-ux-designer-118804512?ijt=jb_18&sc_o=jobs_recommendation_mail&sc_p=email

Senior Product Designer
Brandenburger Tor Ventures
Berlin
https://www.xing.com/jobs/berlin-senior-product-designer-118809930?ijt=jb_18&sc_o=jobs_recommendation_mail

UI/UX Designer
Bodensee Apps GmbH
Konstanz
https://www.xing.com/jobs/konstanz-ui-ux-designer-118812207?ijt=jb_18&sc_o=jobs_recommendation_mail

Benachrichtigungen verwalten: https://www.xing.com/settings/notifications`,
    },
    expected: [
      {
        url: "https://www.xing.com/jobs/hamburg-ux-designer-118804512",
        title: "UX Designer (w/m/d)",
        company: "Elbphilia Media GmbH",
        location: "Hamburg",
      },
      {
        url: "https://www.xing.com/jobs/berlin-senior-product-designer-118809930",
        title: "Senior Product Designer",
        company: "Brandenburger Tor Ventures",
        location: "Berlin",
      },
      {
        url: "https://www.xing.com/jobs/konstanz-ui-ux-designer-118812207",
        title: "UI/UX Designer",
        company: "Bodensee Apps GmbH",
        location: "Konstanz",
      },
    ],
  },
  {
    id: "alert-en-03",
    language: "en",
    board: "xing",
    format: "html",
    hard: null,
    message: {
      from: { name: "XING", address: "jobs@mail.xing.com" },
      subject: "Jobs for you: Engineering Manager",
      receivedAt: "2026-10-16T09:00:00+02:00",
      text: "Jobs for you\nEngineering Manager\nTauber Robotics\nWürzburg",
      html: `<div><h2>Jobs for you</h2>
<div class="job"><a href="https://www.xing.com/jobs/wuerzburg-engineering-manager-118790011?sc_o=jobs_recommendation_mail&amp;sc_p=email&amp;ijt=jb_19">Engineering Manager</a><div>Tauber Robotics</div><div>Würzburg</div></div>
<div class="job"><a href="https://www.xing.com/jobs/remote-head-of-engineering-118791455?sc_o=jobs_recommendation_mail&amp;ijt=jb_19">Head of Engineering</a><div>Saalfeld Health Tech</div><div>Remote</div></div>
<p><a href="https://www.xing.com/settings/notifications">Manage notifications</a></p></div>`,
    },
    expected: [
      {
        url: "https://www.xing.com/jobs/wuerzburg-engineering-manager-118790011",
        title: "Engineering Manager",
        company: "Tauber Robotics",
        location: "Würzburg",
      },
      {
        url: "https://www.xing.com/jobs/remote-head-of-engineering-118791455",
        title: "Head of Engineering",
        company: "Saalfeld Health Tech",
        location: "Remote",
      },
    ],
  },
  {
    id: "alert-en-04",
    language: "en",
    board: "glassdoor",
    format: "text",
    hard: "Employer above the title, with a rating; estimated salary.",
    message: {
      from: { name: "Glassdoor Jobs", address: "noreply@glassdoor.com" },
      subject: "Product Manager jobs in Amsterdam: Harbor Analytics, Orbit Mobility and more",
      receivedAt: "2026-10-15T08:10:00+02:00",
      html: null,
      text: `New jobs for you

Harbor Analytics 4.2 ★
Product Manager
Amsterdam
€65K - €80K (Glassdoor est.)
3d
https://www.glassdoor.com/partner/jobListing.htm?pos=101&ao=1136043&s=224&guid=0000018f&src=GD_JOB_AD&t=ESR&extid=1&exst=OL&ist=&ast=OL&vt=e&slr=true&cs=1_8b&cb=1&jobListingId=1009471236001&jrtk=5-yul1

Orbit Mobility 3.9 ★
Senior Product Manager
Rotterdam
1d
https://www.glassdoor.com/partner/jobListing.htm?pos=102&ao=1136043&guid=0000018f&jobListingId=1009471259922&jrtk=5-yul1

Dunewalk 4.0 ★
Product Owner
Utrecht
24h
https://www.glassdoor.com/partner/jobListing.htm?pos=103&jobListingId=1009471270330&jrtk=5-yul1

View all 24 jobs: https://www.glassdoor.com/Job/amsterdam-product-manager-jobs-SRCH_IL.0,9_IC3064478_KO10,25.htm
You received this email because you subscribed to Glassdoor job alerts. Unsubscribe: https://www.glassdoor.com/member/account/unsubscribe.htm`,
    },
    expected: [
      {
        url: "https://www.glassdoor.com/job-listing/j?jl=1009471236001",
        title: "Product Manager",
        company: "Harbor Analytics",
        location: "Amsterdam",
        salary: { min: 65_000, max: 80_000, currency: "EUR", period: "year" },
      },
      {
        url: "https://www.glassdoor.com/job-listing/j?jl=1009471259922",
        title: "Senior Product Manager",
        company: "Orbit Mobility",
        location: "Rotterdam",
      },
      {
        url: "https://www.glassdoor.com/job-listing/j?jl=1009471270330",
        title: "Product Owner",
        company: "Dunewalk",
        location: "Utrecht",
      },
    ],
  },
  {
    id: "alert-de-06",
    language: "de",
    board: "glassdoor",
    format: "html",
    hard: "Glassdoor job-listing links with the id in `jl`.",
    message: {
      from: { name: "Glassdoor", address: "noreply@glassdoor.de" },
      subject: "Neue Jobs: Softwareentwickler in Düsseldorf",
      receivedAt: "2026-10-23T07:00:00+02:00",
      text: "Neue Jobs für Sie\nRheinmetrik GmbH\nSoftwareentwickler C#\nDüsseldorf",
      html: `<table>
<tr><td>Neue Jobs für Sie</td></tr>
<tr><td><div>Rheinmetrik GmbH 3.8 ★</div><a href="https://www.glassdoor.de/job-listing/softwareentwickler-c-rheinmetrik-gmbh-JV_IC2516874_KO0,20_KE21,36.htm?jl=1009500011122&amp;src=GD_JOB_AD&amp;utm_source=jobalert">Softwareentwickler C#</a><div>Düsseldorf</div><div>58.000 € - 72.000 € (Arbeitgeberangabe)</div></td></tr>
<tr><td><div>Kö Fintech AG 4.1 ★</div><a href="https://www.glassdoor.de/job-listing/backend-engineer-k-fintech-ag-JV_IC2516874_KO0,16_KE17,29.htm?jl=1009500034567&amp;src=GD_JOB_AD&amp;utm_source=jobalert">Backend Engineer</a><div>Düsseldorf</div></td></tr>
<tr><td><a href="https://www.glassdoor.de/member/account/unsubscribe.htm">Abmelden</a></td></tr>
</table>`,
    },
    expected: [
      {
        url: "https://www.glassdoor.de/job-listing/j?jl=1009500011122",
        title: "Softwareentwickler C#",
        company: "Rheinmetrik GmbH",
        location: "Düsseldorf",
        salary: { min: 58_000, max: 72_000, currency: "EUR", period: "year" },
      },
      {
        url: "https://www.glassdoor.de/job-listing/j?jl=1009500034567",
        title: "Backend Engineer",
        company: "Kö Fintech AG",
        location: "Düsseldorf",
      },
    ],
  },
  {
    id: "alert-en-05",
    language: "en",
    board: "generic",
    format: "text",
    hard: "Company careers alert: one line per posting, link on the next line.",
    message: {
      from: { name: "Larkspur Health Careers", address: "careers@larkspur-health.example" },
      subject: "New openings at Larkspur Health",
      receivedAt: "2026-10-20T12:00:00+01:00",
      html: null,
      text: `Hi Deniz,

New roles matching your saved search at Larkspur Health:

Senior Software Engineer — Larkspur Health — London (Hybrid)
https://careers.larkspur-health.example/jobs/senior-software-engineer-1182?utm_source=alert&utm_medium=email

Data Engineer — Larkspur Health — Manchester
https://careers.larkspur-health.example/jobs/data-engineer-1190?utm_source=alert&utm_medium=email

Manage your alerts: https://careers.larkspur-health.example/account/alerts
Unsubscribe: https://careers.larkspur-health.example/unsubscribe?t=abc`,
    },
    expected: [
      {
        url: "https://careers.larkspur-health.example/jobs/senior-software-engineer-1182",
        title: "Senior Software Engineer",
        company: "Larkspur Health",
        location: "London (Hybrid)",
      },
      {
        url: "https://careers.larkspur-health.example/jobs/data-engineer-1190",
        title: "Data Engineer",
        company: "Larkspur Health",
        location: "Manchester",
      },
    ],
  },
  {
    id: "alert-en-06",
    language: "en",
    board: "indeed",
    format: "text",
    hard: "Digest without links: nothing can be imported (precision check).",
    message: {
      from: { name: "Indeed", address: "alert@indeed.com" },
      subject: "18 new backend engineer jobs in Remote",
      receivedAt: "2026-08-13T06:02:00-04:00",
      html: null,
      text: `Backend Engineer jobs in Remote

Backend Engineer (Go) – Quarry Systems – Remote – $140,000 - $165,000 a year – Easily apply
Senior Backend Engineer – Northwind Ledger – Remote – Responsive employer

See all jobs

You're receiving this email because you created a job alert on Indeed. Unsubscribe · Manage alerts`,
    },
    expected: [],
  },
];
