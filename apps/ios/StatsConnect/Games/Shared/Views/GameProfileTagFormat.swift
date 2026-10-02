import Foundation

enum GameProfileTagFormat {
    static func hashPrefixed(_ tag: String) -> String {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else {
            return ""
        }
        return trimmed.hasPrefix("#") ? trimmed : "#\(trimmed)"
    }
}
