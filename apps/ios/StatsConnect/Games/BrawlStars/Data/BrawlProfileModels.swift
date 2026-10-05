import Foundation

struct BrawlProfilePayload: Decodable, Sendable {
    let player: BrawlPlayer
    let battleLog: BrawlBattleLog
}

struct BrawlPlayer: Decodable, Sendable {
    let tag: String
    let name: String
    let trophies: Int
    let highestTrophies: Int
    let expLevel: Int
    let threeVsThreeVictories: Int?
    let soloVictories: Int?
    let duoVictories: Int?
    let club: BrawlClub?
    let brawlers: [BrawlBrawler]
    let rankedRankName: String?
    let highestAllTimeRankedRankName: String?

    enum CodingKeys: String, CodingKey {
        case tag, name, trophies, highestTrophies, expLevel, club, brawlers
        case threeVsThreeVictories = "3vs3Victories"
        case soloVictories
        case duoVictories = "duoVictories"
        case rankedRankName
        case highestAllTimeRankedRankName
        case rankedCurrentName
        case rankedBestName
        case ranked
    }

    enum RankedKeys: String, CodingKey {
        case currentRankName
        case bestRankName
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tag = try container.decode(String.self, forKey: .tag)
        name = try container.decode(String.self, forKey: .name)
        trophies = try container.decode(Int.self, forKey: .trophies)
        highestTrophies = try container.decode(Int.self, forKey: .highestTrophies)
        expLevel = try container.decode(Int.self, forKey: .expLevel)
        threeVsThreeVictories = try container.decodeIfPresent(Int.self, forKey: .threeVsThreeVictories)
        soloVictories = try container.decodeIfPresent(Int.self, forKey: .soloVictories)
        duoVictories = try container.decodeIfPresent(Int.self, forKey: .duoVictories)
        club = try container.decodeIfPresent(BrawlClub.self, forKey: .club)
        brawlers = try container.decodeIfPresent([BrawlBrawler].self, forKey: .brawlers) ?? []
        rankedRankName = try Self.decodeRankName(
            flatKeys: [.rankedRankName, .rankedCurrentName],
            nestedKey: .currentRankName,
            container: container
        )
        highestAllTimeRankedRankName = try Self.decodeRankName(
            flatKeys: [.highestAllTimeRankedRankName, .rankedBestName],
            nestedKey: .bestRankName,
            container: container
        )
    }

    /// Prefers the live flat key, then the alternate flat key, then the nested `ranked` object.
    private static func decodeRankName(flatKeys: [CodingKeys], nestedKey: RankedKeys, container: KeyedDecodingContainer<CodingKeys>) throws -> String? {
        for key in flatKeys where container.contains(key) {
            if let value = try container.decodeIfPresent(String.self, forKey: key) {
                return value
            }
        }
        if let ranked = try? container.nestedContainer(keyedBy: RankedKeys.self, forKey: .ranked) {
            return try ranked.decodeIfPresent(String.self, forKey: nestedKey)
        }
        return nil
    }
}

struct BrawlClub: Decodable, Sendable {
    let tag: String?
    let name: String?
}
