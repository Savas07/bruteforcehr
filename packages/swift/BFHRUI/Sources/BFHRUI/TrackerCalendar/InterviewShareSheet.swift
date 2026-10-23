import BFHRCore
import SwiftUI
#if os(iOS)
import UIKit
#endif

/// Add to Calendar (.ics): the system share sheet with the round as an `.ics` file, so Calendar
/// ("Add to Calendar"), Mail and Files are offered. The file is written to the temporary
/// directory first; a file URL is what makes the share sheet offer Calendar.
struct InterviewShareSheet: View {
    let file: InterviewCalendarFile

    var body: some View {
        #if os(iOS)
        ActivityView(items: [url ?? file.contents])
            .ignoresSafeArea()
            .presentationDetents([.medium, .large])
        #else
        Text(verbatim: file.fileName)
        #endif
    }

    private var url: URL? {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(file.fileName)
        do {
            try Data(file.contents.utf8).write(to: url, options: .atomic)
            return url
        } catch {
            return nil
        }
    }
}

extension InterviewCalendarFile: Identifiable {
    public nonisolated var id: String { fileName + String(contents.hashValue) }
}

#if os(iOS)
private struct ActivityView: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
#endif
