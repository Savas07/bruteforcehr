import BFHRCore
import Foundation

extension CvContent {
    /// Runs `translate` over the CV's prose (headline, summary, roles, descriptions, highlights,
    /// courses, fluency levels, custom sections) in reading order, one field at a time. Names of
    /// people, companies, schools, products, certificates and skills, dates, URLs and contact
    /// details stay as they are. Section headings come from cv-render in the CV's language.
    mutating func translateTexts(_ translate: (String) async throws -> String) async throws {
        func run(_ value: inout String?) async throws {
            guard let text = value, text.nilIfBlank != nil else { return }
            value = try await translate(text)
        }
        func runAll(_ values: inout [String]?) async throws {
            guard var list = values else { return }
            for index in list.indices where list[index].nilIfBlank != nil {
                list[index] = try await translate(list[index])
            }
            values = list
        }

        if var basics {
            try await run(&basics.label)
            try await run(&basics.summary)
            self.basics = basics
        }
        if var work {
            for index in work.indices {
                try await run(&work[index].position)
                try await run(&work[index].description)
                try await run(&work[index].summary)
                try await runAll(&work[index].highlights)
            }
            self.work = work
        }
        if var projects {
            for index in projects.indices {
                try await run(&projects[index].description)
                try await runAll(&projects[index].highlights)
            }
            self.projects = projects
        }
        if var education {
            for index in education.indices {
                try await run(&education[index].area)
                try await run(&education[index].studyType)
                try await runAll(&education[index].courses)
            }
            self.education = education
        }
        if var volunteer {
            for index in volunteer.indices {
                try await run(&volunteer[index].position)
                try await run(&volunteer[index].summary)
                try await runAll(&volunteer[index].highlights)
            }
            self.volunteer = volunteer
        }
        if var awards {
            for index in awards.indices {
                try await run(&awards[index].summary)
            }
            self.awards = awards
        }
        if var publications {
            for index in publications.indices {
                try await run(&publications[index].summary)
            }
            self.publications = publications
        }
        if var languages {
            for index in languages.indices {
                try await run(&languages[index].fluency)
            }
            self.languages = languages
        }
        for section in meta.customSections.indices {
            var items = meta.customSections[section].items
            for index in items.indices {
                try await run(&items[index].summary)
                try await runAll(&items[index].highlights)
            }
            meta.customSections[section].items = items
        }
    }
}
