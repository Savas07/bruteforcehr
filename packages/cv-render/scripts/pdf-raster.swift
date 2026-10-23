// macOS parity helper (not shipped): rasterises PDF pages with Quartz (the PDFKit renderer) into
// 8-bit greyscale buffers, so scripts/parity.ts compares every engine's PDF through one rasteriser.
// Usage: pdf-raster <dpi> <out dir> <name=in.pdf>...
// Writes <out dir>/<name>-p<N>.gray (row-major, width bytes per row, white = 255) and prints one
// JSON line per input: {"name": …, "pages": [{"file": …, "width": …, "height": …}, …]}.
import CoreGraphics
import Foundation

let arguments = CommandLine.arguments
guard arguments.count >= 4, let dpi = Double(arguments[1]) else {
    FileHandle.standardError.write(Data("usage: pdf-raster <dpi> <out dir> <name=in.pdf>...\n".utf8))
    exit(2)
}
let outDir = URL(fileURLWithPath: arguments[2], isDirectory: true)
let scale = dpi / 72

for job in arguments[3...] {
    guard let separator = job.firstIndex(of: "=") else {
        FileHandle.standardError.write(Data("expected name=path, got \(job)\n".utf8))
        exit(2)
    }
    let name = String(job[..<separator])
    let input = URL(fileURLWithPath: String(job[job.index(after: separator)...]))
    guard let document = CGPDFDocument(input as CFURL) else {
        FileHandle.standardError.write(Data("cannot open \(input.path)\n".utf8))
        exit(1)
    }
    var pages: [[String: Any]] = []
    for number in stride(from: 1, through: document.numberOfPages, by: 1) {
        guard let page = document.page(at: number) else { continue }
        let box = page.getBoxRect(.mediaBox)
        let width = Int((box.width * scale).rounded())
        let height = Int((box.height * scale).rounded())
        guard
            let context = CGContext(
                data: nil, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width,
                space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue)
        else {
            FileHandle.standardError.write(Data("cannot create a \(width)×\(height) bitmap\n".utf8))
            exit(1)
        }
        context.setFillColor(gray: 1, alpha: 1)
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        context.interpolationQuality = .high
        context.setShouldAntialias(true)
        context.scaleBy(x: scale, y: scale)
        context.translateBy(x: -box.origin.x, y: -box.origin.y)
        context.drawPDFPage(page)
        guard let data = context.data else { exit(1) }
        // CGContext rows run bottom-up in user space but top-down in memory: row 0 is the top.
        let file = outDir.appendingPathComponent("\(name)-p\(number).gray")
        try Data(bytes: data, count: width * height).write(to: file)
        pages.append(["file": file.path, "width": width, "height": height])
    }
    let line = try JSONSerialization.data(withJSONObject: ["name": name, "pages": pages])
    FileHandle.standardOutput.write(line)
    FileHandle.standardOutput.write(Data("\n".utf8))
}
