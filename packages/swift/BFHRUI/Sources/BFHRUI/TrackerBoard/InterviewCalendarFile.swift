import BFHRCore
import CoreTransferable
import Foundation
import UniformTypeIdentifiers

/// "Add to Calendar (.ics)" for one interview round (components.md `IcsExportAction`): an
/// iCalendar (RFC 5545) event the share sheet hands to Calendar, Mail or Files. Times are UTC,
/// so every calendar shows them in its own zone; the organiser's zone goes in the description.
public nonisolated struct InterviewCalendarFile: Transferable, Hashable, Sendable {
    public var fileName: String
    public var contents: String

    public init(interview: Interview, company: String, role: String, roundLabel: String, now: Date) {
        let title = interview.title.isEmpty ? role : interview.title
        var description = ["\(role) · \(roundLabel)"]
        if !interview.people.isEmpty {
            description.append(interview.people.map { person in
                [person.name, person.title].compactMap { $0 }.joined(separator: ", ")
            }.joined(separator: "; "))
        }
        if !interview.prepNotes.isEmpty { description.append(interview.prepNotes) }
        description.append("Time zone: \(interview.timezone)")
        description.append("bruteforcehr://interviews/\(interview.id)")

        var lines = [
            "BEGIN:VCALENDAR",
            "VERSION:2.0",
            "PRODID:-//BruteForceHR//Tracker//EN",
            "CALSCALE:GREGORIAN",
            "METHOD:PUBLISH",
            "BEGIN:VEVENT",
            "UID:\(interview.id)@bruteforcehr.web.app",
            "DTSTAMP:\(Self.utc(now))",
            "DTSTART:\(Self.utc(interview.startsAt))",
            "DTEND:\(Self.utc(interview.endsAt))",
            "SUMMARY:\(Self.escape("\(company) · \(title)"))",
            "DESCRIPTION:\(Self.escape(description.joined(separator: "\n")))",
        ]
        if let location = interview.location, !location.isEmpty {
            lines.append("LOCATION:\(Self.escape(location))")
        } else if let url = interview.meetingUrl, !url.isEmpty {
            lines.append("LOCATION:\(Self.escape(url))")
        }
        if let url = interview.meetingUrl, !url.isEmpty, URL(string: url) != nil {
            lines.append("URL:\(url)")
        }
        lines += ["END:VEVENT", "END:VCALENDAR"]
        contents = lines.map(Self.fold).joined(separator: "\r\n") + "\r\n"

        let base = "\(company) \(title)".components(separatedBy: CharacterSet.alphanumerics.inverted).filter { !$0.isEmpty }.joined(separator: "-")
        fileName = "\(base.isEmpty ? "interview" : base).ics"
    }

    public static var transferRepresentation: some TransferRepresentation {
        DataRepresentation(exportedContentType: .calendarEvent) { file in
            Data(file.contents.utf8)
        }
        .suggestedFileName { $0.fileName }
    }

    /// `20261023T120000Z`.
    static func utc(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
        return String(
            format: "%04d%02d%02dT%02d%02d%02dZ",
            parts.year ?? 0, parts.month ?? 0, parts.day ?? 0, parts.hour ?? 0, parts.minute ?? 0, parts.second ?? 0
        )
    }

    /// TEXT escaping (RFC 5545 §3.3.11). Every line break (CRLF, a lone CR or LF) becomes `\n`, so
    /// no text can end the content line and start a property of its own.
    static func escape(_ text: String) -> String {
        text.replacingOccurrences(of: "\\", with: "\\\\")
            .replacingOccurrences(of: ";", with: "\\;")
            .replacingOccurrences(of: ",", with: "\\,")
            .replacingOccurrences(of: "\r\n", with: "\\n")
            .replacingOccurrences(of: "\r", with: "\\n")
            .replacingOccurrences(of: "\n", with: "\\n")
    }

    /// Folds lines longer than 75 octets (RFC 5545 §3.1) without splitting a UTF-8 character.
    static func fold(_ line: String) -> String {
        var result = ""
        var count = 0
        for character in line {
            let size = String(character).utf8.count
            if count + size > 75 {
                result += "\r\n "
                count = 1
            }
            result.append(character)
            count += size
        }
        return result
    }
}
