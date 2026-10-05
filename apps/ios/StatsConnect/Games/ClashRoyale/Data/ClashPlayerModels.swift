import Foundation

struct ClashPlayer: Decodable, Sendable {
    let tag: String
    let name: String
    let expLevel: Int?
    let trophies: Int?
    let bestTrophies: Int?
    let wins: Int?
    let losses: Int?
    let battleCount: Int?
    let threeCrownWins: Int?
    let donations: Int?
    let donationsReceived: Int?
    let clan: ClashClan?
    let arena: ClashArena?
    let currentDeck: [ClashCard]
    let cards: [ClashCard]?
    let currentDeckSupportCards: [ClashCard]?
    let supportCards: [ClashCard]?

    private enum CodingKeys: String, CodingKey {
        case tag, name, expLevel, trophies, bestTrophies, wins, losses, battleCount
        case threeCrownWins, donations, donationsReceived, clan, arena, currentDeck, cards
        case currentDeckSupportCards, supportCards
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tag = try container.decode(String.self, forKey: .tag)
        name = try container.decode(String.self, forKey: .name)
        expLevel = try container.decodeIfPresent(Int.self, forKey: .expLevel)
        trophies = try container.decodeIfPresent(Int.self, forKey: .trophies)
        bestTrophies = try container.decodeIfPresent(Int.self, forKey: .bestTrophies)
        wins = try container.decodeIfPresent(Int.self, forKey: .wins)
        losses = try container.decodeIfPresent(Int.self, forKey: .losses)
        battleCount = try container.decodeIfPresent(Int.self, forKey: .battleCount)
        threeCrownWins = try container.decodeIfPresent(Int.self, forKey: .threeCrownWins)
        donations = try container.decodeIfPresent(Int.self, forKey: .donations)
        donationsReceived = try container.decodeIfPresent(Int.self, forKey: .donationsReceived)
        clan = try container.decodeIfPresent(ClashClan.self, forKey: .clan)
        arena = try container.decodeIfPresent(ClashArena.self, forKey: .arena)
        currentDeck = try container.decodeIfPresent([ClashCard].self, forKey: .currentDeck) ?? []
        cards = try container.decodeIfPresent([ClashCard].self, forKey: .cards)
        currentDeckSupportCards = try container.decodeIfPresent([ClashCard].self, forKey: .currentDeckSupportCards)
        supportCards = try container.decodeIfPresent([ClashCard].self, forKey: .supportCards)
    }
}

struct ClashClan: Decodable, Sendable {
    let tag: String?
    let name: String?
}

struct ClashArena: Decodable, Sendable {
    let id: Int?
    let name: String?
}
