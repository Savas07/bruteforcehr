import Foundation

// CV Studio strings (M2), table "CVEditor". Generated with the catalog entries; keep the
// three languages together when editing (tr: siz, de: du).
extension CVEditorViewStrings {
    static let changeCreated = LocalizedStringResource.bfhr("cvEditor.change.created", default: "Created this CV", table: "CVEditor", comment: "History entry.")
    static func changeEdited(_ what: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.edited", default: "Edited \(what)", table: "CVEditor", comment: "History entry. %@ = section (· item), e.g. Experience · Acme.")
    }
    static func historyAdded(_ what: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.added", default: "Added to \(what)", table: "CVEditor", comment: "History entry. %@ = section (· item).")
    }
    static func historyRemoved(_ what: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.removed", default: "Removed from \(what)", table: "CVEditor", comment: "History entry. %@ = section (· item).")
    }
    static let changeReordered = LocalizedStringResource.bfhr("cvEditor.change.reordered", default: "Changed the section order", table: "CVEditor", comment: "History entry.")
    static func changeRestored(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.change.restored", default: "Restored the version from \(date, format: .dateTime.day().month(.abbreviated).hour().minute())", table: "CVEditor", comment: "History entry. %@ = date and time of the restored version.")
    }
    static func changeDesign(_ template: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.design", default: "Changed the design · \(template)", table: "CVEditor", comment: "History entry. %@ = template name.")
    }
    static func changeImported(_ file: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.imported", default: "Imported from \(file)", table: "CVEditor", comment: "History entry. %@ = file name.")
    }
    static func changeVariant(_ title: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.variant", default: "Made from \(title)", table: "CVEditor", comment: "History entry of a new variant. %@ = the CV it was made from.")
    }
    static func changeDuplicate(_ title: String) -> LocalizedStringResource {
        .bfhr("cvEditor.change.duplicate", default: "Copied from \(title)", table: "CVEditor", comment: "History entry of a duplicate. %@ = original CV title.")
    }
    static let changeKept = LocalizedStringResource.bfhr("cvEditor.change.kept", default: "Saved the version from this device", table: "CVEditor", comment: "History entry after Keep this version / Try again.")
    static func copyTitle(_ title: String) -> LocalizedStringResource {
        .bfhr("cvEditor.copyTitle", default: "\(title) (copy)", table: "CVEditor", comment: "Title of a duplicated CV. %@ = original title.")
    }
    static let emptyBodyImport = LocalizedStringResource.bfhr("cvEditor.empty.bodyImport", default: "Import the CV you already have, or start from a blank one with your profile details filled in.", table: "CVEditor")
    static let importCV = LocalizedStringResource.bfhr("cvEditor.empty.import", default: "Import a CV", table: "CVEditor")
    static let importFile = LocalizedStringResource.bfhr("cvEditor.list.importFile", default: "Import a file", table: "CVEditor", comment: "+ menu.")
    static let duplicate = LocalizedStringResource.bfhr("cvEditor.action.duplicate", default: "Duplicate", table: "CVEditor")
    static let newRoleVariant = LocalizedStringResource.bfhr("cvEditor.action.roleVariant", default: "New role variant", table: "CVEditor")
    static let newLanguageVariant = LocalizedStringResource.bfhr("cvEditor.action.languageVariant", default: "New language variant", table: "CVEditor")
    static let rename = LocalizedStringResource.bfhr("cvEditor.action.rename", default: "Rename", table: "CVEditor")
    static let makeDefault = LocalizedStringResource.bfhr("cvEditor.action.makeDefault", default: "Make default", table: "CVEditor", comment: "Makes this the CV used by default.")
    static let renameTitle = LocalizedStringResource.bfhr("cvEditor.rename.title", default: "Rename CV", table: "CVEditor")
    static let renameMessage = LocalizedStringResource.bfhr("cvEditor.rename.message", default: "Only you see this name. Your exported file names come from your name on the CV.", table: "CVEditor")
    static let cvName = LocalizedStringResource.bfhr("cvEditor.rename.field", default: "CV name", table: "CVEditor")
    static let roleVariantMessage = LocalizedStringResource.bfhr("cvEditor.roleVariant.message", default: "A copy of this CV you can tailor to one kind of role. The original stays as it is.", table: "CVEditor")
    static let roleVariantField = LocalizedStringResource.bfhr("cvEditor.roleVariant.field", default: "Role, e.g. Frontend", table: "CVEditor")
    static let create = LocalizedStringResource.bfhr("cvEditor.action.create", default: "Create", table: "CVEditor")
    static let variantLanguage = LocalizedStringResource.bfhr("cvEditor.languageVariant.language", default: "Language", table: "CVEditor")
    static let variantText = LocalizedStringResource.bfhr("cvEditor.languageVariant.text", default: "Text", table: "CVEditor")
    static let translateWithAI = LocalizedStringResource.bfhr("cvEditor.languageVariant.translate", default: "Translate with Claude", table: "CVEditor")
    static let keepOriginalText = LocalizedStringResource.bfhr("cvEditor.languageVariant.original", default: "Start with the original text", table: "CVEditor")
    static let translateFooter = LocalizedStringResource.bfhr("cvEditor.languageVariant.footer", default: "Claude translates your wording field by field and keeps names, numbers and dates as they are. Check the result before you send it.", table: "CVEditor")
    static let translateUnavailable = LocalizedStringResource.bfhr("cvEditor.languageVariant.unavailable", default: "Translation needs a connection. The variant starts with the original text; you can translate fields later with Improve with AI.", table: "CVEditor")
    static let translating = LocalizedStringResource.bfhr("cvEditor.languageVariant.translating", default: "Translating your CV…", table: "CVEditor")
    static let originalFile = LocalizedStringResource.bfhr("cvEditor.menu.originalFile", default: "Original file", table: "CVEditor")
    static let importedFrom = LocalizedStringResource.bfhr("cvEditor.menu.importedFrom", default: "Imported from", table: "CVEditor")
    static let saveFailedTitle = LocalizedStringResource.bfhr("cvEditor.saveFailed.title", default: "Your last change isn't saved yet", table: "CVEditor")
    static let saveFailedBody = LocalizedStringResource.bfhr("cvEditor.saveFailed.body", default: "It's kept on this device. Try again, and if it still doesn't save, check that you're signed in.", table: "CVEditor")
    static let tryAgain = LocalizedStringResource.bfhr("cvEditor.action.tryAgain", default: "Try again", table: "CVEditor")
    static let previewFailedTitle = LocalizedStringResource.bfhr("cvEditor.preview.failedTitle", default: "We couldn't show the preview", table: "CVEditor")
    static let previewFailedBody = LocalizedStringResource.bfhr("cvEditor.preview.failedBody", default: "Your CV is saved. Restart the app; if the preview still doesn't appear, report it with Copy details.", table: "CVEditor")
    static let sharePDF = LocalizedStringResource.bfhr("cvEditor.preview.sharePDF", default: "Share PDF", table: "CVEditor")
    static let exportOptions = LocalizedStringResource.bfhr("cvEditor.export.title", default: "Export…", table: "CVEditor", comment: "Opens export options (format, paper, file name).")
    static let exportFormat = LocalizedStringResource.bfhr("cvEditor.export.format", default: "Format", table: "CVEditor")
    static let exportFooterPDF = LocalizedStringResource.bfhr("cvEditor.export.footerPDF", default: "For applications: the layout you see, with real text that applicant tracking systems can read.", table: "CVEditor")
    static let exportFooterDOCX = LocalizedStringResource.bfhr("cvEditor.export.footerDOCX", default: "For forms that ask for a Word file. The layout is simpler than the PDF.", table: "CVEditor")
    static let exportFooterJSON = LocalizedStringResource.bfhr("cvEditor.export.footerJSON", default: "JSON Resume: your CV as data, to back it up or move it to another tool.", table: "CVEditor")
    static let paper = LocalizedStringResource.bfhr("cvEditor.export.paper", default: "Paper", table: "CVEditor")
    static let fileName = LocalizedStringResource.bfhr("cvEditor.export.fileName", default: "File name", table: "CVEditor")
    static let share = LocalizedStringResource.bfhr("cvEditor.export.share", default: "Share", table: "CVEditor")
    static let exportFailedTitle = LocalizedStringResource.bfhr("cvEditor.export.failedTitle", default: "We couldn't create the file", table: "CVEditor")
    static let exportFailedBody = LocalizedStringResource.bfhr("cvEditor.export.failedBody", default: "Your CV is unchanged. Try again, or choose another format.", table: "CVEditor")
    static let ok = LocalizedStringResource.bfhr("cvEditor.action.ok", default: "OK", table: "CVEditor")
    static let templateTitle = LocalizedStringResource.bfhr("cvEditor.template.title", default: "Design", table: "CVEditor", comment: "Template picker title and toolbar button.")
    static let templateFooter = LocalizedStringResource.bfhr("cvEditor.template.footer", default: "Every template is a single column with standard headings, so applicant tracking systems read it in order.", table: "CVEditor")
    static let atsSafe = LocalizedStringResource.bfhr("cvEditor.template.atsSafe", default: "ATS-safe", table: "CVEditor")
    static let themeHeader = LocalizedStringResource.bfhr("cvEditor.template.theme", default: "Look", table: "CVEditor")
    static let accent = LocalizedStringResource.bfhr("cvEditor.template.accent", default: "Accent colour", table: "CVEditor")
    static let fontPair = LocalizedStringResource.bfhr("cvEditor.template.fontPair", default: "Fonts", table: "CVEditor")
    static let densityLabel = LocalizedStringResource.bfhr("cvEditor.template.density", default: "Spacing", table: "CVEditor")
    static let densityCompact = LocalizedStringResource.bfhr("cvEditor.template.density.compact", default: "Compact", table: "CVEditor")
    static let densityComfortable = LocalizedStringResource.bfhr("cvEditor.template.density.comfortable", default: "Comfortable", table: "CVEditor")
    static let densitySpacious = LocalizedStringResource.bfhr("cvEditor.template.density.spacious", default: "Spacious", table: "CVEditor")
    static let paperFooter = LocalizedStringResource.bfhr("cvEditor.template.paperFooter", default: "A4 is standard in Turkey, Europe and the UK; Letter in the US and Canada.", table: "CVEditor")
    static let paneChanges = LocalizedStringResource.bfhr("cvEditor.version.changes", default: "Changes", table: "CVEditor")
    static let panePage = LocalizedStringResource.bfhr("cvEditor.version.page", default: "Page", table: "CVEditor")
    static let currentVersion = LocalizedStringResource.bfhr("cvEditor.version.current", default: "Now", table: "CVEditor", comment: "Label before the current value in a change row.")
    static let thisVersion = LocalizedStringResource.bfhr("cvEditor.version.this", default: "This version", table: "CVEditor", comment: "Label before the old version's value in a change row.")
    static let isCurrentVersion = LocalizedStringResource.bfhr("cvEditor.version.isCurrent", default: "This is the version your CV shows now.", table: "CVEditor")
    static let sameAsCurrent = LocalizedStringResource.bfhr("cvEditor.version.same", default: "This version has the same content as the current one.", table: "CVEditor")
    static let diffEmpty = LocalizedStringResource.bfhr("cvEditor.version.empty", default: "empty", table: "CVEditor", comment: "Shown for a field without a value.")
    static let restoreVersion = LocalizedStringResource.bfhr("cvEditor.version.restore", default: "Restore this version", table: "CVEditor")
    static func restoreTitle(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.version.restoreTitle", default: "Restore the version from \(date, format: .dateTime.day().month(.abbreviated).hour().minute())?", table: "CVEditor", comment: "%@ = date and time.")
    }
    static let restoreBody = LocalizedStringResource.bfhr("cvEditor.version.restoreBody", default: "Your current version stays in history, so you can switch back anytime.", table: "CVEditor")
    static let conflictTitle = LocalizedStringResource.bfhr("cvEditor.conflict.title", default: "This CV changed on another device", table: "CVEditor")
    static func conflictBody(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.conflict.body", default: "A newer version was saved there at \(date, format: .dateTime.day().month(.abbreviated).hour().minute()). Choose which one to keep; the other stays in history.", table: "CVEditor", comment: "%@ = date and time of the other device's save.")
    }
    static let keepThisVersion = LocalizedStringResource.bfhr("cvEditor.conflict.keep", default: "Keep this version", table: "CVEditor")
    static let useOtherVersion = LocalizedStringResource.bfhr("cvEditor.conflict.useOther", default: "Use the other version", table: "CVEditor")
    static let compare = LocalizedStringResource.bfhr("cvEditor.conflict.compare", default: "Compare", table: "CVEditor")
    static let compareTitle = LocalizedStringResource.bfhr("cvEditor.conflict.compareTitle", default: "Compare versions", table: "CVEditor")
    static let close = LocalizedStringResource.bfhr("cvEditor.action.close", default: "Close", table: "CVEditor")
    static let thisDevice = LocalizedStringResource.bfhr("cvEditor.conflict.thisDevice", default: "This device", table: "CVEditor")
    static func otherDevice(_ date: Date) -> LocalizedStringResource {
        .bfhr("cvEditor.conflict.otherDevice", default: "Other device, \(date, format: .dateTime.hour().minute())", table: "CVEditor", comment: "%@ = time of the other save.")
    }
    static let sameVersions = LocalizedStringResource.bfhr("cvEditor.conflict.same", default: "Both versions have the same content.", table: "CVEditor")
    static let loadingOtherVersion = LocalizedStringResource.bfhr("cvEditor.conflict.loading", default: "Loading the other version…", table: "CVEditor")
    static func versionPill(_ label: LocalizedStringResource, _ number: Int, _ count: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.conflict.pill", default: "\(label) · \(number) of \(count)", table: "CVEditor", comment: "%1$@ = whose version, %2$lld/%3$lld = position.")
    }
    static let diffDesign = LocalizedStringResource.bfhr("cvEditor.diff.design", default: "Design", table: "CVEditor", comment: "Section name for template and theme changes.")
    static let fieldName = LocalizedStringResource.bfhr("cvEditor.diff.name", default: "Name", table: "CVEditor")
    static let fieldHeadline = LocalizedStringResource.bfhr("cvEditor.diff.headline", default: "Headline", table: "CVEditor")
    static let fieldEmail = LocalizedStringResource.bfhr("cvEditor.diff.email", default: "Email", table: "CVEditor")
    static let fieldPhone = LocalizedStringResource.bfhr("cvEditor.diff.phone", default: "Phone", table: "CVEditor")
    static let fieldLocation = LocalizedStringResource.bfhr("cvEditor.diff.location", default: "Location", table: "CVEditor")
    static let fieldSummary = LocalizedStringResource.bfhr("cvEditor.diff.summary", default: "Text", table: "CVEditor")
    static let fieldProfile = LocalizedStringResource.bfhr("cvEditor.diff.profile", default: "Profile link", table: "CVEditor")
    static let fieldRole = LocalizedStringResource.bfhr("cvEditor.diff.role", default: "Role", table: "CVEditor")
    static let fieldOrganization = LocalizedStringResource.bfhr("cvEditor.diff.organization", default: "Organization", table: "CVEditor")
    static let fieldStart = LocalizedStringResource.bfhr("cvEditor.diff.start", default: "Start", table: "CVEditor")
    static let fieldEnd = LocalizedStringResource.bfhr("cvEditor.diff.end", default: "End", table: "CVEditor")
    static let fieldDate = LocalizedStringResource.bfhr("cvEditor.diff.date", default: "Date", table: "CVEditor")
    static let fieldBullet = LocalizedStringResource.bfhr("cvEditor.diff.bullet", default: "Bullet", table: "CVEditor", comment: "Followed by its number.")
    static let fieldKeyword = LocalizedStringResource.bfhr("cvEditor.diff.keyword", default: "Keyword", table: "CVEditor", comment: "Followed by its number.")
    static let fieldDegree = LocalizedStringResource.bfhr("cvEditor.diff.degree", default: "Degree", table: "CVEditor")
    static let fieldArea = LocalizedStringResource.bfhr("cvEditor.diff.area", default: "Field of study", table: "CVEditor")
    static let fieldLevel = LocalizedStringResource.bfhr("cvEditor.diff.level", default: "Level", table: "CVEditor")
    static let fieldFluency = LocalizedStringResource.bfhr("cvEditor.diff.fluency", default: "Fluency", table: "CVEditor")
    static let fieldLink = LocalizedStringResource.bfhr("cvEditor.diff.link", default: "Link", table: "CVEditor")
    static let fieldDetail = LocalizedStringResource.bfhr("cvEditor.diff.detail", default: "Detail", table: "CVEditor")
    static let fieldTemplate = LocalizedStringResource.bfhr("cvEditor.diff.template", default: "Template", table: "CVEditor")
    static let fieldSectionOrder = LocalizedStringResource.bfhr("cvEditor.diff.sectionOrder", default: "Section order", table: "CVEditor")
    static let importTitle = LocalizedStringResource.bfhr("cvEditor.import.title", default: "Import a CV", table: "CVEditor")
    static let importReviewTitle = LocalizedStringResource.bfhr("cvEditor.import.reviewTitle", default: "Did we read your CV correctly?", table: "CVEditor")
    static let importReading = LocalizedStringResource.bfhr("cvEditor.import.reading", default: "Reading your CV…", table: "CVEditor")
    static let importReadingHint = LocalizedStringResource.bfhr("cvEditor.import.readingHint", default: "This usually takes under a minute. You'll check everything before a CV is created.", table: "CVEditor")
    static func importSummary(_ fields: Int, _ flagged: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.import.summary", default: "We read \(fields) fields. Fields to check: \(flagged). You can fix them now or later.", table: "CVEditor", comment: "%1$lld = fields read, %2$lld = fields to check.")
    }
    static func importSummaryClear(_ fields: Int) -> LocalizedStringResource {
        .bfhr("cvEditor.import.summaryClear", default: "We read \(fields) fields. Have a quick look before you create the CV.", table: "CVEditor", comment: "%lld = fields read.")
    }
    static let importSummaryFooter = LocalizedStringResource.bfhr("cvEditor.import.summaryFooter", default: "Tap an entry to edit it. Nothing is saved until you create the CV.", table: "CVEditor")
    static let showOnlyFlagged = LocalizedStringResource.bfhr("cvEditor.import.onlyFlagged", default: "Show only fields to check", table: "CVEditor")
    static let flagDate = LocalizedStringResource.bfhr("cvEditor.import.flagDate", default: "We weren't sure about this date.", table: "CVEditor")
    static let flagName = LocalizedStringResource.bfhr("cvEditor.import.flagName", default: "We weren't sure about this name.", table: "CVEditor")
    static let flagText = LocalizedStringResource.bfhr("cvEditor.import.flagText", default: "We weren't sure we read this right.", table: "CVEditor")
    static let createCV = LocalizedStringResource.bfhr("cvEditor.import.create", default: "Create CV", table: "CVEditor")
    static let tryAnotherFile = LocalizedStringResource.bfhr("cvEditor.import.another", default: "Try another file", table: "CVEditor")
    static let chooseAnotherFile = LocalizedStringResource.bfhr("cvEditor.import.choose", default: "Choose another file", table: "CVEditor")
    static func importedTitle(_ name: String) -> LocalizedStringResource {
        .bfhr("cvEditor.import.cvTitle", default: "\(name) — CV", table: "CVEditor", comment: "Title of an imported CV. %@ = the name in the CV.")
    }
    static let importFailedRead = LocalizedStringResource.bfhr("cvEditor.import.failed.read", default: "We couldn't read this file", table: "CVEditor")
    static let importFailedReadBody = LocalizedStringResource.bfhr("cvEditor.import.failed.readBody", default: "It may be a scan or a picture of text. Try a PDF exported from Word or Google Docs, a DOCX, or start from scratch.", table: "CVEditor")
    static let importFailedType = LocalizedStringResource.bfhr("cvEditor.import.failed.type", default: "This file type isn't supported", table: "CVEditor")
    static let importFailedTypeBody = LocalizedStringResource.bfhr("cvEditor.import.failed.typeBody", default: "Choose a PDF, a Word file (DOCX), a JSON Resume or your LinkedIn data export (ZIP).", table: "CVEditor")
    static let importFailedSize = LocalizedStringResource.bfhr("cvEditor.import.failed.size", default: "This file is larger than 20 MB", table: "CVEditor")
    static let importFailedSizeBody = LocalizedStringResource.bfhr("cvEditor.import.failed.sizeBody", default: "Export the CV again without images, or choose a smaller file.", table: "CVEditor")
    static let importFailedOffline = LocalizedStringResource.bfhr("cvEditor.import.failed.offline", default: "You're offline", table: "CVEditor")
    static let importFailedOfflineBody = LocalizedStringResource.bfhr("cvEditor.import.failed.offlineBody", default: "Reading a file needs a connection. Try again once you're back online.", table: "CVEditor")
    static let importFailedAI = LocalizedStringResource.bfhr("cvEditor.import.failed.ai", default: "AI is turned off", table: "CVEditor")
    static let importFailedAIBody = LocalizedStringResource.bfhr("cvEditor.import.failed.aiBody", default: "Reading a PDF or DOCX uses Claude. Turn AI on in Settings, import a JSON Resume or LinkedIn export, or start from scratch.", table: "CVEditor")
    static let importFailedLimit = LocalizedStringResource.bfhr("cvEditor.import.failed.limit", default: "Today's AI limit is reached", table: "CVEditor")
    static let importFailedLimitBody = LocalizedStringResource.bfhr("cvEditor.import.failed.limitBody", default: "It resets tomorrow. Meanwhile you can import a JSON Resume or LinkedIn export, or start from scratch.", table: "CVEditor")
    static let importFailedOther = LocalizedStringResource.bfhr("cvEditor.import.failed.other", default: "Something went wrong while reading", table: "CVEditor")
    static let importFailedOtherBody = LocalizedStringResource.bfhr("cvEditor.import.failed.otherBody", default: "Your file wasn't changed. Try again in a moment, or start from scratch.", table: "CVEditor")
    static let noticeCreateFailed = LocalizedStringResource.bfhr("cvEditor.notice.createFailed", default: "The new CV couldn't be saved", table: "CVEditor", comment: "Toast.")
    static let noticeReadFailed = LocalizedStringResource.bfhr("cvEditor.notice.readFailed", default: "This CV couldn't be opened to copy it", table: "CVEditor", comment: "Toast.")
    static let noticeTranslateFailed = LocalizedStringResource.bfhr("cvEditor.notice.translateFailed", default: "Translation didn't finish, so no variant was created", table: "CVEditor", comment: "Toast.")
}
