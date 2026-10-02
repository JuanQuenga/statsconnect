import Foundation

struct BrawlBattleRoute: Hashable {
    let index: Int
    let battle: BrawlBattle

    static func == (lhs: BrawlBattleRoute, rhs: BrawlBattleRoute) -> Bool {
        lhs.index == rhs.index && lhs.battle.battleTime == rhs.battle.battleTime
    }

    func hash(into hasher: inout Hasher) {
        hasher.combine(index)
        hasher.combine(battle.battleTime)
    }
}
