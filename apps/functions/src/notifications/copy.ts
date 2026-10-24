// Localized push copy (EN, TR with "siz", DE with "du"). Wording follows the app strings
// (apps/desktop/src/i18n): category labels as titles, rejections as calm "Decision" copy
// (decisions.md D18/U2: no "unfortunately", nothing urgent).
import type { ApplicationStatus, UiLanguage } from "@bfhr/core";
import type { PushContent } from "./types";

export interface PushCopy {
  readonly title: string;
  readonly body: string;
}

/** `shared.status.*` of the app catalogs. */
const STATUS_LABELS: Record<UiLanguage, Record<ApplicationStatus, string>> = {
  en: {
    saved: "Saved",
    preparing: "Preparing",
    applied: "Applied",
    acknowledged: "Acknowledged",
    screening: "Screening",
    interviewing: "Interviewing",
    offer: "Offer",
    accepted: "Accepted",
    declined: "Declined",
    rejected: "Not selected",
    withdrawn: "Withdrawn",
    ghosted: "No response",
  },
  tr: {
    saved: "Kaydedildi",
    preparing: "Hazırlanıyor",
    applied: "Başvuruldu",
    acknowledged: "Alındı",
    screening: "Ön görüşme",
    interviewing: "Mülakat",
    offer: "Teklif",
    accepted: "Kabul edildi",
    declined: "Geri çevrildi",
    rejected: "Seçilmedi",
    withdrawn: "Geri çekildi",
    ghosted: "Yanıt yok",
  },
  de: {
    saved: "Gespeichert",
    preparing: "In Vorbereitung",
    applied: "Beworben",
    acknowledged: "Eingang bestätigt",
    screening: "Vorauswahl",
    interviewing: "Vorstellungsgespräch",
    offer: "Angebot",
    accepted: "Angenommen",
    declined: "Abgelehnt",
    rejected: "Nicht ausgewählt",
    withdrawn: "Zurückgezogen",
    ghosted: "Keine Rückmeldung",
  },
};

type MailKind = "interview" | "offer" | "assessment";

/** Body variants by what the mail told us: company and role, company only, role only, neither. */
interface MailCopy {
  readonly title: string;
  readonly both: (company: string, role: string) => string;
  readonly company: (company: string) => string;
  readonly role: (role: string) => string;
  readonly none: string;
}

interface Catalog {
  readonly mail: Record<MailKind, MailCopy>;
  readonly decision: {
    readonly title: string;
    readonly company: (company: string) => string;
    readonly none: string;
    readonly updated: string;
  };
  readonly statusUpdate: {
    readonly title: string;
    readonly company: (status: string, company: string) => string;
    readonly none: (status: string) => string;
  };
  readonly jobAlerts: {
    readonly one: (search: string | null) => string;
    readonly many: (count: number, search: string | null) => string;
    readonly more: (count: number) => string;
  };
}

const CATALOGS: Record<UiLanguage, Catalog> = {
  en: {
    mail: {
      interview: {
        title: "Interview invite",
        both: (company, role) => `${company} invited you to interview for ${role}.`,
        company: (company) => `${company} invited you to an interview.`,
        role: (role) => `You have a new interview invite for ${role}.`,
        none: "You have a new interview invite.",
      },
      offer: {
        title: "Offer",
        both: (company, role) => `${company} sent you an offer for ${role}.`,
        company: (company) => `${company} sent you an offer.`,
        role: (role) => `You have a new offer for ${role}.`,
        none: "You have a new offer.",
      },
      assessment: {
        title: "Assessment",
        both: (company, role) => `${company} sent you an assessment for ${role}.`,
        company: (company) => `${company} sent you an assessment.`,
        role: (role) => `You have a new assessment for ${role}.`,
        none: "You have a new assessment.",
      },
    },
    decision: {
      title: "Decision",
      company: (company) => `${company} decided not to move forward.`,
      none: "An employer decided not to move forward.",
      updated: "We updated the application.",
    },
    statusUpdate: {
      title: "Application updated",
      company: (status, company) => `Moved to ${status} — from an email by ${company}`,
      none: (status) => `Moved to ${status} automatically`,
    },
    jobAlerts: {
      one: (search) => (search === null ? "New match" : `New match for “${search}”`),
      many: (count, search) =>
        search === null ? `${String(count)} new matches` : `${String(count)} new matches for “${search}”`,
      more: (count) => `and ${String(count)} more`,
    },
  },
  tr: {
    mail: {
      interview: {
        title: "Mülakat daveti",
        both: (company, role) => `${company}, ${role} pozisyonu için sizi mülakata davet etti.`,
        company: (company) => `${company} sizi mülakata davet etti.`,
        role: (role) => `${role} pozisyonu için yeni bir mülakat davetiniz var.`,
        none: "Yeni bir mülakat davetiniz var.",
      },
      offer: {
        title: "Teklif",
        both: (company, role) => `${company}, ${role} pozisyonu için size bir teklif gönderdi.`,
        company: (company) => `${company} size bir teklif gönderdi.`,
        role: (role) => `${role} pozisyonu için yeni bir teklifiniz var.`,
        none: "Yeni bir teklifiniz var.",
      },
      assessment: {
        title: "Değerlendirme",
        both: (company, role) => `${company}, ${role} pozisyonu için size bir değerlendirme görevi gönderdi.`,
        company: (company) => `${company} size bir değerlendirme görevi gönderdi.`,
        role: (role) => `${role} pozisyonu için yeni bir değerlendirme göreviniz var.`,
        none: "Yeni bir değerlendirme göreviniz var.",
      },
    },
    decision: {
      title: "Karar",
      company: (company) => `${company} süreci ilerletmemeye karar verdi.`,
      none: "İşveren süreci ilerletmemeye karar verdi.",
      updated: "Başvuruyu güncelledik.",
    },
    statusUpdate: {
      title: "Başvuru güncellendi",
      company: (status, company) => `${status} aşamasına taşındı. Kaynak: ${company} e-postası`,
      none: (status) => `Otomatik olarak ${status} aşamasına taşındı`,
    },
    jobAlerts: {
      one: (search) => (search === null ? "Yeni eşleşme" : `“${search}” için yeni eşleşme`),
      many: (count, search) =>
        search === null ? `${String(count)} yeni eşleşme` : `“${search}” için ${String(count)} yeni eşleşme`,
      more: (count) => `ve ${String(count)} ilan daha`,
    },
  },
  de: {
    mail: {
      interview: {
        title: "Einladung zum Gespräch",
        both: (company, role) => `${company} lädt dich zu einem Gespräch für ${role} ein.`,
        company: (company) => `${company} lädt dich zu einem Gespräch ein.`,
        role: (role) => `Du hast eine neue Einladung zu einem Gespräch für ${role}.`,
        none: "Du hast eine neue Einladung zu einem Gespräch.",
      },
      offer: {
        title: "Angebot",
        both: (company, role) => `${company} hat dir ein Angebot für ${role} geschickt.`,
        company: (company) => `${company} hat dir ein Angebot geschickt.`,
        role: (role) => `Du hast ein neues Angebot für ${role}.`,
        none: "Du hast ein neues Angebot.",
      },
      assessment: {
        title: "Assessment",
        both: (company, role) => `${company} hat dir ein Assessment für ${role} geschickt.`,
        company: (company) => `${company} hat dir ein Assessment geschickt.`,
        role: (role) => `Du hast ein neues Assessment für ${role}.`,
        none: "Du hast ein neues Assessment.",
      },
    },
    decision: {
      title: "Entscheidung",
      company: (company) => `${company} hat sich gegen eine weitere Runde entschieden.`,
      none: "Ein Unternehmen hat sich gegen eine weitere Runde entschieden.",
      updated: "Wir haben die Bewerbung aktualisiert.",
    },
    statusUpdate: {
      title: "Bewerbung aktualisiert",
      company: (status, company) => `Zu „${status}“ verschoben — laut E-Mail von ${company}`,
      none: (status) => `Automatisch zu „${status}“ verschoben`,
    },
    jobAlerts: {
      one: (search) => (search === null ? "Neuer Treffer" : `Neuer Treffer für „${search}“`),
      many: (count, search) =>
        search === null ? `${String(count)} neue Treffer` : `${String(count)} neue Treffer für „${search}“`,
      more: (count) => `und ${String(count)} weitere`,
    },
  },
};

/** Jobs named in a digest body; the rest is summarized as "and n more". */
export const DIGEST_LISTED_JOBS = 2;

/** Title and body of a push in the user's app language. */
export function pushCopy(content: PushContent, language: UiLanguage): PushCopy {
  const catalog = CATALOGS[language];
  switch (content.kind) {
    case "interview":
    case "offer":
    case "assessment": {
      const copy = catalog.mail[content.kind];
      const { company, role } = content;
      const body =
        company !== null && role !== null
          ? copy.both(company, role)
          : company !== null
            ? copy.company(company)
            : role !== null
              ? copy.role(role)
              : copy.none;
      return { title: copy.title, body };
    }
    case "decision": {
      const sentence =
        content.company === null ? catalog.decision.none : catalog.decision.company(content.company);
      return {
        title: catalog.decision.title,
        body: content.updated ? `${sentence} ${catalog.decision.updated}` : sentence,
      };
    }
    case "status_update": {
      const status = STATUS_LABELS[language][content.status];
      return {
        title: catalog.statusUpdate.title,
        body:
          content.company === null
            ? catalog.statusUpdate.none(status)
            : catalog.statusUpdate.company(status, content.company),
      };
    }
    case "job_alerts": {
      const listed = content.jobs.slice(0, DIGEST_LISTED_JOBS).map((job) => `${job.title} · ${job.company}`);
      const rest = content.count - listed.length;
      return {
        title:
          content.count === 1
            ? catalog.jobAlerts.one(content.searchName)
            : catalog.jobAlerts.many(content.count, content.searchName),
        body:
          rest > 0 && listed.length > 0
            ? `${listed.join(", ")} ${catalog.jobAlerts.more(rest)}`
            : listed.join(", "),
      };
    }
  }
}
