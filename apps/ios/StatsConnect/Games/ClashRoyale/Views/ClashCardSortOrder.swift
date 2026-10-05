import Foundation

enum ClashCardSortOrder: String, CaseIterable, Identifiable {
    case name
    case level
    case elixir
    case rarity

    var id: String { rawValue }

    var title: String {
        switch self {
        case .name: "Name"
        case .level: "Level"
        case .elixir: "Elixir"
        case .rarity: "Rarity"
        }
    }
}
