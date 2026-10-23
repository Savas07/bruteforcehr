import BFHRCore
import Foundation

/// One changed field between two versions of a CV (`FieldDiffTable`: "Experience › Acme › End
/// date: — → Sep 2026").
public struct CVFieldChange: Identifiable, Hashable, Sendable {
    /// JSON pointer of the field.
    public var id: String
    /// Section title in the editor ("Experience"), or "Design" for template and theme.
    public var section: CVFieldDiff.Section
    /// The item the field belongs to ("Acme"), when it's in a list section.
    public var item: String?
    public var field: CVFieldDiff.Field
    /// Bullet / list position (1-based) for list fields like highlights.
    public var position: Int?
    public var before: String?
    public var after: String?
}

/// Field-level comparison of two CV contents, in reading order.
public enum CVFieldDiff {
    public enum Section: Hashable, Sendable {
        case editor(CVSectionKind)
        case design
    }

    /// A field's name; the view localizes it.
    public enum Field: Hashable, Sendable {
        case name, headline, email, phone, website, location, summary, profile
        case role, organization, start, end, date, bullet, keyword, degree, area, level, fluency, link, detail
        case template, accent, fontPair, density, paper, sectionOrder
        case other(String)
    }

    public static func changes(from before: CvContent, to after: CvContent) -> [CVFieldChange] {
        let old = flatten(before), new = flatten(after)
        let pointers = Array(Set(old.map(\.0) + new.map(\.0))).sorted(by: readingOrder)
        let oldValues = Dictionary(old, uniquingKeysWith: { first, _ in first })
        let newValues = Dictionary(new, uniquingKeysWith: { first, _ in first })
        return pointers.compactMap { pointer in
            let a = oldValues[pointer], b = newValues[pointer]
            guard a != b else { return nil }
            return change(pointer, before: a, after: b, old: before, new: after)
        }
    }

    /// Section order, then item index, then field order inside an item.
    static func readingOrder(_ a: String, _ b: String) -> Bool {
        let sections = ["basics"] + CVSectionKind.standardListSections.map(\.orderKey) + ["meta"]
        let x = a.split(separator: "/").map(String.init), y = b.split(separator: "/").map(String.init)
        for (depth, (p, q)) in zip(x, y).enumerated() where p != q {
            if let i = Int(p), let j = Int(q) { return i < j }
            if depth == 0 { return (sections.firstIndex(of: p) ?? sections.count) < (sections.firstIndex(of: q) ?? sections.count) }
            if x.first == "meta" && depth == 1 {
                let meta = ["template", "theme", "sectionOrder", "customSections"]
                return (meta.firstIndex(of: p) ?? meta.count) < (meta.firstIndex(of: q) ?? meta.count)
            }
            return keyOrder(p, q)
        }
        return x.count < y.count
    }

    // MARK: Flattening

    /// (pointer, display value) pairs. Lists of strings flatten per position; `meta` keeps the
    /// design fields and the section order only.
    static func flatten(_ content: CvContent) -> [(String, String)] {
        guard let data = try? BFHRJSON.encoder().encode(content),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [] }
        var out: [(String, String)] = []
        func walk(_ value: Any, _ pointer: String) {
            switch value {
            case let dictionary as [String: Any]:
                for key in dictionary.keys.sorted(by: keyOrder) { walk(dictionary[key]!, pointer + "/" + key) }
            case let array as [Any]:
                for (index, element) in array.enumerated() { walk(element, pointer + "/\(index)") }
            case let string as String:
                if string.nilIfBlank != nil { out.append((pointer, string)) }
            case let number as NSNumber:
                out.append((pointer, number.stringValue))
            default:
                break
            }
        }
        let sections = ["basics"] + CVSectionKind.standardListSections.map(\.orderKey)
        for key in sections { if let value = object[key] { walk(value, "/" + key) } }
        let meta = content.meta
        out.append(("/meta/template", meta.template))
        out.append(("/meta/theme/accentColor", meta.theme.accentColor))
        out.append(("/meta/theme/fontPair", meta.theme.fontPair))
        out.append(("/meta/theme/density", meta.theme.density.rawValue))
        out.append(("/meta/theme/paperSize", meta.theme.paperSize.rawValue))
        out.append(("/meta/sectionOrder", meta.sectionOrder.joined(separator: ",")))
        for (index, section) in meta.customSections.enumerated() {
            walk(["title": section.title, "items": section.items.map { item -> [String: Any] in
                var fields: [String: Any] = ["title": item.title]
                fields["subtitle"] = item.subtitle
                fields["startDate"] = item.startDate
                fields["endDate"] = item.endDate
                fields["url"] = item.url
                fields["summary"] = item.summary
                fields["highlights"] = item.highlights
                return fields
            }] as [String: Any], "/meta/customSections/\(index)")
        }
        return out
    }

    /// Reading order inside an item: names and roles first, dates, then text.
    private static func keyOrder(_ a: String, _ b: String) -> Bool {
        let order = ["name", "label", "position", "title", "institution", "organization", "area", "studyType", "language", "fluency",
                     "email", "phone", "url", "location", "startDate", "endDate", "date", "releaseDate", "summary", "description",
                     "highlights", "courses", "keywords", "items"]
        let ia = order.firstIndex(of: a) ?? order.count, ib = order.firstIndex(of: b) ?? order.count
        return ia != ib ? ia < ib : a < b
    }

    // MARK: Labels

    private static func change(_ pointer: String, before: String?, after: String?, old: CvContent, new: CvContent) -> CVFieldChange {
        let parts = pointer.split(separator: "/").map(String.init)
        let key = parts.first ?? ""
        if key == "meta" {
            if parts.count > 1, parts[1] == "customSections", let index = Int(parts[2]) {
                let section = (new.meta.customSections[safe: index] ?? old.meta.customSections[safe: index])
                let kind = section.map { CVSectionKind.custom(id: $0.id, title: $0.title) } ?? .custom(id: "", title: "")
                let itemIndex = parts.count > 4 ? Int(parts[4]) : nil
                let itemTitle = itemIndex.flatMap { section?.items[safe: $0]?.title }
                return CVFieldChange(id: pointer, section: .editor(kind), item: itemTitle, field: field(parts.last ?? "", parent: parts.dropLast().last),
                                     position: listPosition(parts), before: before, after: after)
            }
            let field: Field = switch parts.last {
            case "template": .template
            case "accentColor": .accent
            case "fontPair": .fontPair
            case "density": .density
            case "paperSize": .paper
            default: .sectionOrder
            }
            return CVFieldChange(id: pointer, section: .design, item: nil, field: field, position: nil,
                                 before: field == .sectionOrder ? nil : before, after: field == .sectionOrder ? nil : after)
        }
        if key == "basics" {
            let leaf = parts.dropFirst().first ?? ""
            let kind: CVSectionKind = leaf == "summary" ? .summary : .header
            return CVFieldChange(id: pointer, section: .editor(kind), item: nil, field: field(parts.last ?? "", parent: parts.dropLast().last),
                                 position: nil, before: before, after: after)
        }
        let kind = CVSectionKind(orderKey: key, customSections: []) ?? .custom(id: key, title: key)
        let index = parts.count > 1 ? Int(parts[1]) : nil
        let item = index.flatMap { itemLabel(kind, $0, in: new) ?? itemLabel(kind, $0, in: old) }
        return CVFieldChange(id: pointer, section: .editor(kind), item: item, field: field(parts.last ?? "", parent: parts.dropLast().last),
                             position: listPosition(parts), before: before, after: after)
    }

    /// 1-based position for elements of string lists (highlights/2 → 3).
    private static func listPosition(_ parts: [String]) -> Int? {
        guard parts.count >= 2, let last = Int(parts[parts.count - 1]),
              ["highlights", "courses", "keywords", "roles"].contains(parts[parts.count - 2]) else { return nil }
        return last + 1
    }

    private static func field(_ leaf: String, parent: String?) -> Field {
        let name = Int(leaf) != nil ? (parent ?? leaf) : leaf
        return switch name {
        case "name": .name
        case "label": .headline
        case "email": .email
        case "phone": .phone
        case "url": .link
        case "city", "region", "countryCode", "address", "postalCode", "location": .location
        case "summary", "description": .summary
        case "network", "username": .profile
        case "position", "title", "roles": .role
        case "institution", "organization", "issuer", "awarder", "publisher", "entity", "subtitle": .organization
        case "startDate": .start
        case "endDate": .end
        case "date", "releaseDate": .date
        case "highlights", "courses": .bullet
        case "keywords": .keyword
        case "studyType": .degree
        case "area": .area
        case "level", "score": .level
        case "fluency": .fluency
        case "language": .name
        default: .other(name)
        }
    }

    private static func itemLabel(_ kind: CVSectionKind, _ index: Int, in content: CvContent) -> String? {
        let item = content.items(for: kind)[safe: index]
        return item?.subtitle ?? item?.title
    }
}

extension Array {
    subscript(safe index: Int) -> Element? { indices.contains(index) ? self[index] : nil }
}
