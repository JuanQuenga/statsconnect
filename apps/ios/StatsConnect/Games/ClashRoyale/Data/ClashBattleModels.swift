import Foundation

struct ClashBattle: Decodable, Sendable {
    let battleTime: String?
    let type: String?
    let gameMode: ClashGameMode?
    let team: [ClashBattleParticipant]
    let opponent: [ClashBattleParticipant]

    private enum CodingKeys: String, CodingKey {
        case battleTime, type, gameMode, team, opponent
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        battleTime = try container.decodeIfPresent(String.self, forKey: .battleTime)
        type = try container.decodeIfPresent(String.self, forKey: .type)
        gameMode = try container.decodeIfPresent(ClashGameMode.self, forKey: .gameMode)
        team = try container.decodeIfPresent([ClashBattleParticipant].self, forKey: .team) ?? []
        opponent = try container.decodeIfPresent([ClashBattleParticipant].self, forKey: .opponent) ?? []
    }
}

struct ClashGameMode: Decodable, Sendable {
    let id: Int?
    let name: String?
}

extension ClashBattle {
    func sides(for playerTag: String) -> (player: [ClashBattleParticipant], other: [ClashBattleParticipant])? {
        guard let requested = try? PlayerTag(playerTag) else { return nil }
        let matches: (ClashBattleParticipant) -> Bool = { participant in
            guard let tag = participant.tag else { return false }
            return (try? PlayerTag(tag)) == requested
        }
        if team.contains(where: matches) { return (team, opponent) }
        if opponent.contains(where: matches) { return (opponent, team) }
        return nil
    }

    func crownScore(for playerTag: String) -> (player: Int, other: Int)? {
        guard let sides = sides(for: playerTag),
              let own = Self.sideCrowns(sides.player), let other = Self.sideCrowns(sides.other) else { return nil }
        return (own, other)
    }

    private static func sideCrowns(_ players: [ClashBattleParticipant]) -> Int? {
        let values = players.compactMap(\.crowns)
        guard let score = values.first, values.allSatisfy({ $0 == score }) else { return nil }
        return score
    }
}

struct ClashBattleParticipant: Decodable, Sendable {
    let tag: String?
    let name: String?
    let crowns: Int?
    let trophyChange: Int?
    let startingTrophies: Int?
    let cards: [ClashCard]

    private enum CodingKeys: String, CodingKey {
        case tag, name, crowns, trophyChange, startingTrophies, cards
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        tag = try values.decodeIfPresent(String.self, forKey: .tag)
        name = try values.decodeIfPresent(String.self, forKey: .name)
        crowns = try values.decodeIfPresent(Int.self, forKey: .crowns)
        trophyChange = try values.decodeIfPresent(Int.self, forKey: .trophyChange)
        startingTrophies = try values.decodeIfPresent(Int.self, forKey: .startingTrophies)
        cards = try values.decodeIfPresent([ClashCard].self, forKey: .cards) ?? []
    }
}
