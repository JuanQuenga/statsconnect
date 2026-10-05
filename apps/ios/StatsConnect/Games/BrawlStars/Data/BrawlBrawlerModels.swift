import Foundation

struct BrawlBrawler: Identifiable, Decodable, Sendable {
    let id: Int
    let name: String
    let power: Int
    let rank: Int
    let trophies: Int
    let highestTrophies: Int
    let gadgets: [BrawlAbility]
    let starPowers: [BrawlAbility]
    let gears: [BrawlAbility]
    let hyperCharges: [BrawlAbility]

    var portraitURL: URL? {
        URL(string: "https://cdn.brawlify.com/brawlers/portraits/\(id).png")
    }

    private enum CodingKeys: String, CodingKey {
        case id, name, power, rank, trophies, highestTrophies, gadgets, starPowers, gears, hyperCharges
        case hypercharges, hypercharge
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        power = try container.decode(Int.self, forKey: .power)
        rank = try container.decode(Int.self, forKey: .rank)
        trophies = try container.decode(Int.self, forKey: .trophies)
        highestTrophies = try container.decode(Int.self, forKey: .highestTrophies)
        gadgets = try container.decodeIfPresent([BrawlAbility].self, forKey: .gadgets) ?? []
        starPowers = try container.decodeIfPresent([BrawlAbility].self, forKey: .starPowers) ?? []
        gears = try container.decodeIfPresent([BrawlAbility].self, forKey: .gears) ?? []
        hyperCharges = try container.decodeIfPresent([BrawlAbility].self, forKey: .hyperCharges)
            ?? container.decodeIfPresent([BrawlAbility].self, forKey: .hypercharges)
            ?? container.decodeIfPresent([BrawlAbility].self, forKey: .hypercharge)
            ?? []
    }
}

struct BrawlAbility: Identifiable, Decodable, Sendable {
    let id: Int
    let name: String
    let level: Int?
}
