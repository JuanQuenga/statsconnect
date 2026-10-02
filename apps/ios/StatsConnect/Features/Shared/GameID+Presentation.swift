import SwiftUI

extension GameID {
    var artworkAssetName: String {
        switch self {
        case .brawlStars:
            return "BrawlStars"
        case .clashRoyale:
            return "ClashRoyale"
        }
    }

    var fallbackSymbolName: String {
        switch self {
        case .brawlStars:
            return "star.circle.fill"
        case .clashRoyale:
            return "crown.fill"
        }
    }

    var discoverySubtitle: String {
        switch self {
        case .brawlStars:
            return "Find a Brawl Stars player"
        case .clashRoyale:
            return "Find a Clash Royale player"
        }
    }
}
