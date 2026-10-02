import Foundation

struct ClashCard: Identifiable, Decodable, Sendable {
    let id: Int
    let name: String
    let level: Int?
    let maxLevel: Int?
    let elixirCost: Int?
    let rarity: String?
    let count: Int?
    let evolutionLevel: Int?
    let iconUrls: ClashCardIcons?

    var imageURL: URL? {
        iconUrls?.medium.flatMap { URL(string: $0) }
    }

    var displayLevel: Int? {
        guard let level, let offset = Self.rarityLevelOffset(rarity) else { return nil }
        return level + offset
    }

    var displayMaxLevel: Int? {
        guard let maxLevel, let offset = Self.rarityLevelOffset(rarity) else { return nil }
        return maxLevel + offset
    }

    /// Returns the level offset only for known rarities; `nil` when rarity is absent or unrecognized.
    static func rarityLevelOffset(_ rarity: String?) -> Int? {
        switch rarity?.lowercased() {
        case "common": return 0
        case "rare": return 2
        case "epic": return 5
        case "legendary": return 8
        case "champion": return 10
        default: return nil
        }
    }
}

struct ClashCardIcons: Decodable, Sendable {
    let medium: String?
    let evolutionMedium: String?
    let heroMedium: String?
}
