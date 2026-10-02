import Foundation

enum GameProfileModule: String, Identifiable {
    case overview, brawlers, deck, cards, battles, chests
    var id: String { rawValue }
    var title: String { rawValue.capitalized }
    var symbol: String {
        switch self {
        case .overview: "chart.bar.fill"
        case .brawlers: "person.3.fill"
        case .deck: "rectangle.stack.fill"
        case .cards: "square.grid.2x2.fill"
        case .battles: "flag.checkered"
        case .chests: "shippingbox.fill"
        }
    }
}
