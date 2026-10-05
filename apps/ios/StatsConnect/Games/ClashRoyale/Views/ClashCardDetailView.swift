import SwiftUI

struct ClashCardDetailView: View {
    let card: ClashCard

    @Environment(\.dismiss) private var dismiss

    private let columns = [GridItem(.adaptive(minimum: 132), spacing: 10)]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                VStack(spacing: 10) {
                    AsyncImage(url: card.imageURL) { phase in
                        if let image = phase.image {
                            image.resizable().scaledToFit()
                        } else {
                            Image(systemName: "rectangle.portrait.fill")
                                .resizable()
                                .scaledToFit()
                                .foregroundStyle(BrandStyle.orange.opacity(0.65))
                                .padding(32)
                        }
                    }
                    .frame(height: 220)
                    .accessibilityHidden(true)

                    Text(card.name)
                        .font(.largeTitle.weight(.bold))
                        .multilineTextAlignment(.center)

                    if let rarity = card.rarity, !rarity.isEmpty {
                        Text(rarity.capitalized)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(BrandStyle.actionOrange)
                    }
                }
                .frame(maxWidth: .infinity)

                LazyVGrid(columns: columns, spacing: 10) {
                    GameProfileStatCard(title: "Level", value: GameProfileFormat.number(card.displayLevel), symbol: "sparkles")
                    GameProfileStatCard(title: "Maximum level", value: GameProfileFormat.number(card.displayMaxLevel), symbol: "arrow.up.circle.fill")
                    GameProfileStatCard(title: "Elixir cost", value: GameProfileFormat.number(card.elixirCost), symbol: "drop.fill")
                    GameProfileStatCard(title: "Copies", value: GameProfileFormat.number(card.count), symbol: "square.stack.3d.up.fill")
                    GameProfileStatCard(title: "Evolution level", value: GameProfileFormat.number(card.evolutionLevel), symbol: "arrow.triangle.2.circlepath")
                }

                if let evolutionImage = card.iconUrls?.evolutionMedium,
                   let evolutionURL = URL(string: evolutionImage) {
                    cardArtwork(url: evolutionURL, title: "Evolution artwork")
                }
                if let heroImage = card.iconUrls?.heroMedium,
                   let heroURL = URL(string: heroImage) {
                    cardArtwork(url: heroURL, title: "Hero artwork")
                }
            }
            .padding(20)
            .frame(maxWidth: 700, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Card details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
    }

    @ViewBuilder
    private func cardArtwork(url: URL, title: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            GameProfileSectionHeader(title: title)
            AsyncImage(url: url) { phase in
                if let image = phase.image {
                    image.resizable().scaledToFit()
                } else if phase.error != nil {
                    Image(systemName: "rectangle.portrait.fill")
                        .font(.largeTitle)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, minHeight: 100)
                } else {
                    ProgressView()
                        .frame(maxWidth: .infinity, minHeight: 100)
                }
            }
            .frame(maxHeight: 180)
            .frame(maxWidth: .infinity)
            .padding(12)
            .background(.background, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .accessibilityLabel(title)
        }
    }
}
