import Foundation

struct ClashChests: Decodable, Sendable {
    let items: [ClashChest]

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        items = try container.decodeIfPresent([ClashChest].self, forKey: .items) ?? []
    }

    private enum CodingKeys: String, CodingKey {
        case items
    }
}

struct ClashChest: Decodable, Sendable {
    let index: Int?
    let name: String?
}
