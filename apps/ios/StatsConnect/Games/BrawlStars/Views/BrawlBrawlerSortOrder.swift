import Foundation

enum BrawlBrawlerSortOrder: String, CaseIterable, Identifiable {
    case trophies
    case rank
    case power
    case name

    var id: String { rawValue }

    var title: String {
        switch self {
        case .trophies: "Trophies"
        case .rank: "Rank"
        case .power: "Power"
        case .name: "Name"
        }
    }
}
