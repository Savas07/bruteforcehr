import Foundation

/// Log an application's copy (table `ApplicationAdd`).
enum ApplicationAddStrings {
    static let title = LocalizedStringResource.bfhr("add.title", default: "Log an application", table: "ApplicationAdd", comment: "Sheet title: add an application sent outside the app.")
    static let company = LocalizedStringResource.bfhr("add.company", default: "Company", table: "ApplicationAdd")
    static let role = LocalizedStringResource.bfhr("add.role", default: "Role", table: "ApplicationAdd", comment: "Job title applied for.")
    static let location = LocalizedStringResource.bfhr("add.location", default: "Location", table: "ApplicationAdd")
    static let locationPrompt = LocalizedStringResource.bfhr("add.locationPrompt", default: "Berlin, Remote…", table: "ApplicationAdd", comment: "Placeholder of the optional location field.")
    static let requiredFooter = LocalizedStringResource.bfhr("add.requiredFooter", default: "Company and role are needed to add it. Location is optional.", table: "ApplicationAdd")
    static let stage = LocalizedStringResource.bfhr("add.stage", default: "Stage", table: "ApplicationAdd", comment: "Status picker label.")
    static let appliedOn = LocalizedStringResource.bfhr("add.appliedOn", default: "Applied on", table: "ApplicationAdd")
    static let addedOn = LocalizedStringResource.bfhr("add.addedOn", default: "Since", table: "ApplicationAdd", comment: "Date label when the stage is Saved or Preparing.")
    static let channelNone = LocalizedStringResource.bfhr("add.channelNone", default: "Not set", table: "ApplicationAdd", comment: "Applied via: no channel chosen.")
    static let stageFooter = LocalizedStringResource.bfhr(
        "add.stageFooter",
        default: "Follow-up and no-response suggestions count from this date. You can move it to any stage later.",
        table: "ApplicationAdd"
    )
    static let notes = LocalizedStringResource.bfhr("add.notes", default: "Notes", table: "ApplicationAdd")
    static let notesPlaceholder = LocalizedStringResource.bfhr("add.notesPlaceholder", default: "Salary range, who referred you, the job link", table: "ApplicationAdd")
    static let cancel = LocalizedStringResource.bfhr("add.cancel", default: "Cancel", table: "ApplicationAdd")
    static let add = LocalizedStringResource.bfhr("add.add", default: "Add", table: "ApplicationAdd", comment: "Confirms Log an application.")
    static let discardTitle = LocalizedStringResource.bfhr("add.discardTitle", default: "Discard this application?", table: "ApplicationAdd")
    static let discard = LocalizedStringResource.bfhr("add.discard", default: "Discard", table: "ApplicationAdd")
    static let keepEditing = LocalizedStringResource.bfhr("add.keepEditing", default: "Keep editing", table: "ApplicationAdd")
}
