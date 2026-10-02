import Foundation

struct BrawlBattleLog: Decodable, Sendable {
    let items: [BrawlBattle]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decodeIfPresent([BrawlBattle].self, forKey: .items) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case items
    }
}

struct BrawlBattle: Decodable, Sendable {
    let battleTime: String
    let event: BrawlEvent
    let battle: BrawlBattleDetails

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        battleTime = try container.decodeIfPresent(String.self, forKey: .battleTime) ?? ""
        event = try container.decodeIfPresent(BrawlEvent.self, forKey: .event) ?? BrawlEvent(mode: nil, map: nil)
        battle = try container.decodeIfPresent(BrawlBattleDetails.self, forKey: .battle) ?? BrawlBattleDetails()
    }

    private enum CodingKeys: String, CodingKey {
        case battleTime, event, battle
    }
}

struct BrawlEvent: Decodable, Sendable {
    let mode: String?
    let map: String?

    init(mode: String?, map: String?) {
        self.mode = mode
        self.map = map
    }
}

struct BrawlBattleDetails: Decodable, Sendable {
    let mode: String?
    let type: String?
    let result: String?
    let rank: Int?
    let trophyChange: Int?
    let teams: [[BrawlParticipant]]?
    let players: [BrawlParticipant]?

    init(mode: String? = nil, type: String? = nil, result: String? = nil, rank: Int? = nil, trophyChange: Int? = nil, teams: [[BrawlParticipant]]? = nil, players: [BrawlParticipant]? = nil) {
        self.mode = mode
        self.type = type
        self.result = result
        self.rank = rank
        self.trophyChange = trophyChange
        self.teams = teams
        self.players = players
    }
}

struct BrawlParticipant: Decodable, Sendable {
    let tag: String
    let name: String
    let brawler: BrawlBattleBrawler?

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        tag = try container.decodeIfPresent(String.self, forKey: .tag) ?? ""
        name = try container.decodeIfPresent(String.self, forKey: .name) ?? "Unknown player"
        brawler = try container.decodeIfPresent(BrawlBattleBrawler.self, forKey: .brawler)
    }

    private enum CodingKeys: String, CodingKey {
        case tag, name, brawler
    }
}

struct BrawlBattleBrawler: Decodable, Sendable {
    let id: Int
    let name: String
    let power: Int?
    let trophies: Int?

    private enum CodingKeys: String, CodingKey { case id, name, power, trophies }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard let id = try container.decodeIfPresent(Int.self, forKey: .id),
              let name = try container.decodeIfPresent(String.self, forKey: .name), !name.isEmpty else {
            throw DecodingError.dataCorrupted(DecodingError.Context(
                codingPath: decoder.codingPath,
                debugDescription: "BrawlBattleBrawler requires both id and name when present"
            ))
        }
        self.id = id
        self.name = name
        power = try container.decodeIfPresent(Int.self, forKey: .power)
        trophies = try container.decodeIfPresent(Int.self, forKey: .trophies)
    }
}
