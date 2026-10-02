import SwiftUI

struct GameArtworkView: View {
    let game: GameID

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                LinearGradient(
                    colors: [.orange.opacity(0.9), .red.opacity(0.75), .indigo.opacity(0.8)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )

                Image(systemName: game.fallbackSymbolName)
                    .resizable()
                    .scaledToFit()
                    .foregroundStyle(.white.opacity(0.38))
                    .padding(geometry.size.width * 0.18)

                Image(game.artworkAssetName)
                    .resizable()
                    .scaledToFill()
                    .frame(width: geometry.size.width, height: geometry.size.height)
                    .clipped()
                    .accessibilityHidden(true)
            }
            .frame(width: geometry.size.width, height: geometry.size.height)
        }
        .accessibilityHidden(true)
    }
}
