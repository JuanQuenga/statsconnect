import Foundation

struct GameProfileRoute: Hashable {
    let game: GameID
    let playerTag: String

    static func == (lhs: GameProfileRoute, rhs: GameProfileRoute) -> Bool {
        lhs.game.rawValue == rhs.game.rawValue && lhs.playerTag == rhs.playerTag
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(game.rawValue)
        hasher.combine(playerTag)
    }
}
