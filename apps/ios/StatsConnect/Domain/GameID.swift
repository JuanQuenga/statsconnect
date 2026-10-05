import Foundation

public enum GameID: String, Codable, CaseIterable, Identifiable, Sendable {
    case brawlStars = "brawl-stars"
    case clashRoyale = "clash-royale"

    public var id: String { rawValue }

    public var displayName: String {
        switch self {
        case .brawlStars: return "Brawl Stars"
        case .clashRoyale: return "Clash Royale"
        }
    }

}
