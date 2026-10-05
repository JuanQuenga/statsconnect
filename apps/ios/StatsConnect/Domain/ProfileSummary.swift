import Foundation

public struct ProfileSummary: Codable, Equatable, Identifiable, Sendable {
    public let game: GameID
    public let playerTag: String
    public let display: ProfileDisplay
    public var id: String { Self.canonicalID(game: game, playerTag: playerTag) }

    public init(game: GameID, playerTag: String, display: ProfileDisplay) {
        self.game = game
        self.playerTag = playerTag
        self.display = display
    }

    private static func canonicalID(game: GameID, playerTag: String) -> String {
        var normalized = playerTag.trimmingCharacters(in: .whitespacesAndNewlines)
        normalized = normalized.replacingOccurrences(of: " ", with: "")
        if normalized.hasPrefix("#") {
            normalized = String(normalized.dropFirst())
        }
        return "\(game.rawValue)#\(normalized.uppercased())"
    }
}
