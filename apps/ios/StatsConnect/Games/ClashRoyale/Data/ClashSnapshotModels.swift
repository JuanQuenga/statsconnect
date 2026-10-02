import Foundation

struct ClashProfilePayload: Decodable, Sendable {
    let player: ClashSnapshot<ClashPlayer>
    let battles: ClashSnapshot<[ClashBattle]>
    let chests: ClashSnapshot<ClashChests>
}

struct ClashSnapshot<Value: Decodable & Sendable>: Decodable, Sendable {
    let data: Value
    let fetchedAt: Double
    let stale: Bool
}
