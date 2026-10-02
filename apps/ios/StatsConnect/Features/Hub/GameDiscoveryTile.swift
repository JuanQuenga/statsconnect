import SwiftUI

struct GameDiscoveryTile: View {
    let game: GameID

    var body: some View {
        ZStack(alignment: .bottomLeading) {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .fill(.orange.gradient)

            GameArtworkView(game: game)
                .frame(height: 232)

            LinearGradient(
                colors: [.clear, .black.opacity(0.2), .black.opacity(0.78)],
                startPoint: .center,
                endPoint: .bottom
            )

            VStack(alignment: .leading, spacing: 8) {
                Spacer(minLength: 78)

                Text(game.displayName)
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.white)
                    .fixedSize(horizontal: false, vertical: true)

                Text(nativeFeaturesSubtitle)
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(.white.opacity(0.94))
                    .fixedSize(horizontal: false, vertical: true)

                Label("Lookup · stats · details", systemImage: "arrow.up.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(.top, 3)
            }
            .padding(20)
        }
        .frame(minHeight: 232)
        .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .strokeBorder(.white.opacity(0.13), lineWidth: 1)
        }
        .shadow(color: .black.opacity(0.12), radius: 12, x: 0, y: 7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(game.displayName). \(nativeFeaturesSubtitle). Look up a player and explore native profile details.")
    }

    private var nativeFeaturesSubtitle: String {
        switch game {
        case .brawlStars:
            "Player stats, brawlers, and battle details"
        case .clashRoyale:
            "Player stats, cards, decks, battles, and chests"
        }
    }
}
