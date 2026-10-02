import Foundation

struct ClashBattleRoute: Hashable {
    let index: Int
    let battle: ClashBattle
    let fetchedAt: Double
    let isStale: Bool
    let playerTag: String

    static func == (lhs: ClashBattleRoute, rhs: ClashBattleRoute) -> Bool {
        lhs.index == rhs.index && lhs.battle.battleTime == rhs.battle.battleTime && lhs.playerTag == rhs.playerTag
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(index)
        hasher.combine(battle.battleTime)
        hasher.combine(playerTag)
    }
}
