import Foundation
import CoreGraphics

// Metadata only: capture is a separate, explicit user action in AllyX.
let ownPID = CommandLine.arguments.count > 1 ? Int(CommandLine.arguments[1]) : nil
// Include windows on other Spaces. macOS can mark a browser offscreen when
// an always-on-top picker becomes active; capture still requires a selection.
let entries = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
let windows: [[String: Any]] = entries.compactMap { entry in
    guard let id = entry[kCGWindowNumber as String] as? Int,
          let pid = entry[kCGWindowOwnerPID as String] as? Int,
          let layer = entry[kCGWindowLayer as String] as? Int, layer == 0,
          pid != ownPID,
          let bounds = entry[kCGWindowBounds as String] as? [String: Any],
          let width = bounds["Width"] as? Double, width > 100,
          let height = bounds["Height"] as? Double, height > 100 else { return nil }
    let owner = entry[kCGWindowOwnerName as String] as? String ?? "Application"
    let title = entry[kCGWindowName as String] as? String ?? ""
    return ["id": "window:\(id):0", "name": title.isEmpty ? owner : "\(owner) — \(title)"]
}
let data = try JSONSerialization.data(withJSONObject: windows)
FileHandle.standardOutput.write(data)
