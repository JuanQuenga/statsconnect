import Foundation

extension ClashCard {
    var accessibilitySummary: String {
        var parts = [name]
        if let level = displayLevel {
            parts.append("level \(level)")
        }
        if let rarity, !rarity.isEmpty {
            parts.append(rarity)
        }
        if let elixirCost {
            parts.append("\(elixirCost) elixir")
        }
        return parts.joined(separator: ", ")
    }
}
